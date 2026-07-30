// Deploys contracts/counter.compact to a Midnight testnet and prints the
// resulting contract address.
//
//   MIDNIGHT_SEED=<64-char hex> npm run deploy -- --network preview
//
// Requires a local proof server on http://127.0.0.1:6300 and a wallet funded
// from the faucet for the chosen network.
//
// Syncing the wallet holds the whole scanned history in memory, which overruns
// Node's default ~4 GB heap on preprod (fatal "Ineffective mark-compacts near
// heap limit"). The npm script raises the limit; run it via `npm run deploy`
// rather than invoking tsx directly.
import { WebSocket } from 'ws';

// The wallet SDK logs a `Wallet.Sync` error object on every poll, which buries
// the script's own output. Drop those; keep everything else.
const isSyncNoise = (arg: unknown): boolean =>
  typeof arg === 'object' &&
  arg !== null &&
  typeof (arg as { _tag?: unknown })._tag === 'string' &&
  (arg as { _tag: string })._tag.startsWith('Wallet.');

for (const level of ['log', 'error', 'warn', 'info'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    if (args.some(isSyncNoise)) return;
    original(...(args as []));
  };
}

// Must be set before any wallet import touches GraphQL subscriptions.
// @ts-expect-error Node has no global WebSocket usable by Apollo.
globalThis.WebSocket = WebSocket;

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import * as Rx from 'rxjs';

import * as ledger from '@midnight-ntwrk/ledger-v8';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v8';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js/contracts';
import { getNetworkId, setNetworkId } from '@midnight-ntwrk/midnight-js/network-id';
import type { MidnightProvider, WalletProvider } from '@midnight-ntwrk/midnight-js/types';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { WalletFacade, WalletEntrySchema } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import { InMemoryTransactionHistoryStorage } from '@midnight-ntwrk/wallet-sdk-abstractions';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

import * as Counter from '../managed/contract/index.js';
import { type CounterPrivateState, initialPrivateState, witnesses } from '../contracts/witnesses.js';

const NETWORKS = {
  preview: {
    indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    faucet: 'https://faucet.preview.midnight.network/',
  },
  preprod: {
    indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    faucet: 'https://faucet.preprod.midnight.network/',
  },
} as const;

type NetworkName = keyof typeof NETWORKS;

const PROOF_SERVER = process.env.PROOF_SERVER ?? 'http://127.0.0.1:6300';
const PRIVATE_STATE_ID = 'counterPrivateState' as const;

const here = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(here, '..', 'managed');

const compiledContract = CompiledContract.make<Counter.Contract<CounterPrivateState>, CounterPrivateState>(
  'counter',
  Counter.Contract,
).pipe(CompiledContract.withWitnesses(witnesses), CompiledContract.withCompiledFileAssets(zkConfigPath));

/** The step this deployment's first caller will use. Never leaves this machine. */
const SECRET_STEP = BigInt(process.env.SECRET_STEP ?? '1');

function readNetwork(): NetworkName {
  const flag = process.argv.indexOf('--network');
  const raw = (flag !== -1 ? process.argv[flag + 1] : process.env.NETWORK) ?? 'preview';
  if (raw !== 'preview' && raw !== 'preprod') {
    throw new Error(`Unsupported network "${raw}". Use preview or preprod.`);
  }
  return raw;
}

function readSeed(): string {
  const seed = process.env.MIDNIGHT_SEED?.trim();
  if (!seed) {
    throw new Error('MIDNIGHT_SEED is not set. Export a 64-character hex wallet seed and retry.');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
    throw new Error('MIDNIGHT_SEED must be exactly 64 hexadecimal characters.');
  }
  return seed.toLowerCase();
}

function deriveKeys(seed: string) {
  const hd = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('Could not initialise HDWallet from the supplied seed.');

  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') throw new Error('Key derivation failed.');

  hd.hdWallet.clear();
  return derived.keys;
}

/**
 * The wallet SDK's signRecipe hardcodes the 'pre-proof' marker, which fails on
 * proven intents. Re-sign each intent with the marker that matches its data.
 */
function signIntents(
  tx: { intents?: Map<number, any> },
  sign: (payload: Uint8Array) => ledger.Signature,
  marker: 'proof' | 'pre-proof',
): void {
  if (!tx.intents?.size) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      marker,
      'pre-binding',
      intent.serialize(),
    );
    const signature = sign(cloned.signatureData(segment));

    for (const key of ['guaranteedUnshieldedOffer', 'fallibleUnshieldedOffer'] as const) {
      const offer = cloned[key];
      if (!offer) continue;
      cloned[key] = offer.addSignatures(
        offer.inputs.map((_: ledger.UtxoSpend, i: number) => offer.signatures.at(i) ?? signature),
      );
    }

    tx.intents.set(segment, cloned);
  }
}

async function buildWallet(network: NetworkName, seed: string) {
  const cfg = NETWORKS[network];
  const keys = deriveKeys(seed);

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

  const indexerClientConnection = { indexerHttpUrl: cfg.indexer, indexerWsUrl: cfg.indexerWS };
  const relayURL = new URL(cfg.node.replace(/^http/, 'ws'));
  const provingServerUrl = new URL(PROOF_SERVER);

  const wallet = await WalletFacade.init({
    configuration: {
      networkId: getNetworkId(),
      indexerClientConnection,
      provingServerUrl,
      relayURL,
      txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
      costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
    },
    shielded: (c) => ShieldedWallet(c).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (c) => UnshieldedWallet(c).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (c) => DustWallet(c).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

const synced = (wallet: WalletFacade) =>
  Rx.firstValueFrom(wallet.state().pipe(Rx.throttleTime(5_000), Rx.filter((s) => s.isSynced)));

async function awaitFunding(wallet: WalletFacade, faucet: string, address: string) {
  const state = await synced(wallet);
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  if (balance > 0n) {
    console.log(`Unshielded balance: ${balance.toLocaleString()} tNIGHT`);
    return;
  }

  console.log(`\nWallet has no funds. Send tNIGHT to:\n  ${address}\nFaucet: ${faucet}\n`);
  const funded = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((s) => s.isSynced),
      Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((b) => b > 0n),
    ),
  );
  console.log(`Funds received: ${funded.toLocaleString()} tNIGHT`);
}

/** NIGHT only produces DUST (the fee resource) once its UTXOs are registered on-chain. */
async function ensureDust(wallet: WalletFacade, keystore: UnshieldedKeystore) {
  const state = await synced(wallet);
  const unregistered = state.unshielded.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true,
  );

  if (unregistered.length > 0) {
    console.log(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation...`);
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      unregistered,
      keystore.getPublicKey(),
      (payload) => keystore.signData(payload),
    );
    await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
  }

  console.log('Waiting for DUST to accrue...');
  const ready = await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((s) => s.isSynced),
      Rx.filter((s) => s.dust.balance(new Date()) > 0n),
    ),
  );
  console.log(`DUST available: ${ready.dust.balance(new Date()).toLocaleString()}`);
}

async function main() {
  const network = readNetwork();
  const seed = readSeed();
  setNetworkId(network);

  console.log(`Network: ${network}`);
  console.log(`Proof server: ${PROOF_SERVER}`);

  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await buildWallet(network, seed);

  try {
    const address = unshieldedKeystore.getBech32Address().toString();
    console.log(`Unshielded address: ${address}`);
    console.log('Syncing wallet...');

    await awaitFunding(wallet, NETWORKS[network].faucet, address);
    await ensureDust(wallet, unshieldedKeystore);

    const state = await synced(wallet);
    const walletProvider: WalletProvider & MidnightProvider = {
      getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
      getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
      async balanceTx(tx, ttl?) {
        const recipe = await wallet.balanceUnboundTransaction(
          tx,
          { shieldedSecretKeys, dustSecretKey },
          { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
        );
        const sign = (payload: Uint8Array) => unshieldedKeystore.signData(payload);
        signIntents(recipe.baseTransaction, sign, 'proof');
        if (recipe.balancingTransaction) signIntents(recipe.balancingTransaction, sign, 'pre-proof');
        return wallet.finalizeRecipe(recipe);
      },
      submitTx: (tx) => wallet.submitTransaction(tx) as any,
    };

    const zkConfigProvider = new NodeZkConfigProvider<'increment'>(zkConfigPath);
    const accountId = walletProvider.getCoinPublicKey();

    const providers = {
      privateStateProvider: levelPrivateStateProvider<typeof PRIVATE_STATE_ID>({
        privateStateStoreName: 'counter-private-state',
        accountId,
        privateStoragePasswordProvider: () => `${Buffer.from(accountId, 'hex').toString('base64')}!`,
      }),
      publicDataProvider: indexerPublicDataProvider(NETWORKS[network].indexer, NETWORKS[network].indexerWS),
      zkConfigProvider,
      proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
      walletProvider,
      midnightProvider: walletProvider,
    };

    console.log('Deploying contract (proving may take a minute)...');
    const deployed = await deployContract(providers as any, {
      compiledContract,
      privateStateId: PRIVATE_STATE_ID,
      initialPrivateState: initialPrivateState(SECRET_STEP),
    });

    const contractAddress = deployed.deployTxData.public.contractAddress;
    console.log('\n==============================================');
    console.log(` Network:          ${network}`);
    console.log(` Contract address: ${contractAddress}`);
    console.log('==============================================\n');
    console.log('Add this address to the Contract Address table in README.md.');
  } finally {
    await wallet.stop().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
