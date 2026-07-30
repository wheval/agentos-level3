import { Transaction } from '@midnight-ntwrk/ledger-v8';
import { setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import { createProofProvider } from '@midnight-ntwrk/midnight-js/types';
import type {
  MidnightProvider,
  PrivateStateProvider,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js/types';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

import * as Counter from '../../managed/contract/index.js';
import { type CounterPrivateState, witnesses } from '../../contracts/witnesses.js';
import { PRIVATE_STATE_ID, ZK_ASSET_PATH } from './config';
import type { ConnectedAPI } from './wallet';

export type CounterContract = Counter.Contract<CounterPrivateState>;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const fromHex = (hex: string): Uint8Array => {
  const normalised = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(normalised.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalised.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

/**
 * The same contract binding the deploy script uses, so the browser proves
 * against exactly the circuits that were deployed.
 *
 * The assets path is only consulted by filesystem-backed providers; in the
 * browser `FetchZkConfigProvider` serves the keys over HTTP instead. It is
 * still supplied because the binding is not complete without it.
 */
export const compiledContract = CompiledContract.make<CounterContract, CounterPrivateState>(
  'counter',
  Counter.Contract,
).pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets('counter'));

/**
 * Private state lives in memory for the lifetime of the tab and is never
 * written to disk or sent anywhere. Reloading the page forgets the secret step,
 * which is the behaviour we want for a public demo.
 */
export function createInMemoryPrivateStateProvider(): PrivateStateProvider<
  typeof PRIVATE_STATE_ID,
  CounterPrivateState
> {
  let scope = '';
  const states = new Map<string, CounterPrivateState>();
  const signingKeys = new Map<string, string>();
  const scoped = (id: string) => `${scope}:${id}`;
  const unsupported = () => Promise.reject(new Error('Private state export/import is not supported in the browser.'));

  return {
    setContractAddress(address: string) {
      scope = address;
    },
    async set(id, state) {
      states.set(scoped(id), state);
    },
    async get(id) {
      return states.get(scoped(id)) ?? null;
    },
    async remove(id) {
      states.delete(scoped(id));
    },
    async clear() {
      states.clear();
    },
    async setSigningKey(address, signingKey) {
      signingKeys.set(address, signingKey);
    },
    async getSigningKey(address) {
      return signingKeys.get(address) ?? null;
    },
    async removeSigningKey(address) {
      signingKeys.delete(address);
    },
    async clearSigningKeys() {
      signingKeys.clear();
    },
    exportPrivateStates: unsupported,
    importPrivateStates: unsupported,
    exportSigningKeys: unsupported,
    importSigningKeys: unsupported,
  } as PrivateStateProvider<typeof PRIVATE_STATE_ID, CounterPrivateState>;
}

/**
 * Bridges the wallet extension to midnight-js. The connector speaks hex-encoded
 * transactions; midnight-js speaks ledger objects, so each hop is encoded on the
 * way out and decoded on the way back.
 */
function createWalletBridge(
  connected: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
    async balanceTx(tx) {
      const { tx: balanced } = await connected.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced));
    },
    async submitTx(tx) {
      // The connector resolves with void, so read the id off the transaction we
      // handed it rather than inventing one.
      const [txId] = tx.identifiers();
      await connected.submitTransaction(toHex(tx.serialize()));
      return txId;
    },
  } as WalletProvider & MidnightProvider;
}

export type CounterProviders = ReturnType<typeof buildProviders> extends Promise<infer T> ? T : never;

/**
 * Assembles every provider the contract API needs from a connected wallet.
 * Proving happens inside the wallet, on the user's machine — no proof server
 * URL is involved and no witness data leaves the browser.
 */
export async function buildProviders(connected: ConnectedAPI) {
  const configuration = await connected.getConfiguration();
  setNetworkId(configuration.networkId as Parameters<typeof setNetworkId>[0]);

  const zkConfigProvider = new FetchZkConfigProvider<'increment'>(
    new URL(ZK_ASSET_PATH, window.location.origin).toString(),
    window.fetch.bind(window),
  );

  const provingProvider = await connected.getProvingProvider(zkConfigProvider.asKeyMaterialProvider());

  const shielded = await connected.getShieldedAddresses();
  const walletBridge = createWalletBridge(
    connected,
    shielded.shieldedCoinPublicKey,
    shielded.shieldedEncryptionPublicKey,
  );

  return {
    privateStateProvider: createInMemoryPrivateStateProvider(),
    publicDataProvider: indexerPublicDataProvider(configuration.indexerUri, configuration.indexerWsUri),
    zkConfigProvider,
    proofProvider: createProofProvider(provingProvider),
    walletProvider: walletBridge,
    midnightProvider: walletBridge,
  };
}

/** Reads the public ledger without needing a wallet or a proof. */
export async function readLedger(
  providers: { publicDataProvider: { queryContractState: (address: string) => Promise<unknown> } },
  contractAddress: string,
): Promise<Counter.Ledger | null> {
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!state) return null;
  return Counter.ledger((state as { data: never }).data);
}
