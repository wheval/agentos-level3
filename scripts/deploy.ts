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

// Only quieten the informational channels. `error`/`warn` must stay intact:
// sync failures are also tagged `Wallet.*`, and filtering them made a failed
// deploy look like an indefinite hang with no diagnostics.
for (const level of ['log', 'info'] as const) {
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
import { inspect } from 'node:util';
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
import { WalletFacade, WalletEntrySchema, type FacadeState } from '@midnight-ntwrk/wallet-sdk-facade';
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
    indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preview.midnight.network',
    faucet: 'https://faucet.preview.midnight.network/',
  },
  preprod: {
    indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    node: 'https://rpc.preprod.midnight.network',
    faucet: 'https://faucet.preprod.midnight.network/',
  },
} as const;

type NetworkName = keyof typeof NETWORKS;

/**
 * Tuning knobs for the dust wallet's sync stream. Honoured at runtime by
 * `@midnight-ntwrk/wallet-sdk-dust-wallet` (v1/Sync.js) but absent from its exported
 * `DefaultDustConfiguration` type, so it is declared locally.
 */
type DustBatchUpdatesConfig = {
  /** Max events collected per batch. SDK default: 10. */
  readonly size?: number;
  /** Max ms to wait before flushing a partial batch. SDK default: 1. */
  readonly timeout?: number;
  /** Delay injected between consecutive batches, in ms. SDK default: 4. */
  readonly spacing?: number;
};

const PROOF_SERVER = process.env.PROOF_SERVER ?? 'http://127.0.0.1:6300';

/** How long sync may report identical progress before it is treated as a dropped subscription. */
const SYNC_STALL_TIMEOUT_MS = 5 * 60_000;

/** Retries an operation that can fail from transient public-infrastructure errors. */
async function withRetry<T>(
  operation: () => Promise<T>,
  { attempts, delayMs, label }: { attempts: number; delayMs: number; label: string },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.error(
        `${label} attempt ${attempt}/${attempts} failed, retrying in ${delayMs / 1000}s:`,
        inspect(error, { depth: 4 }),
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
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
  // Accept `--network preprod`, `NETWORK=preprod`, or a bare positional argument.
  // Previously a positional was ignored and silently fell back to preview, so
  // `deploy.ts preprod` would deploy to the wrong network without warning.
  const positional = process.argv.slice(2).find((a) => !a.startsWith('-'));
  const raw = (flag !== -1 ? process.argv[flag + 1] : (positional ?? process.env.NETWORK)) ?? 'preview';
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
    dust: (c) => {
      // The dust sync stream batches via `groupedWithin(size, timeout)` then
      // `Schedule.spaced(spacing)`. Defaults are size=10, timeout=1ms, spacing=4ms, so
      // batches flush near-empty and each pays a fixed delay plus a round trip
      // (~1.7k events/min measured, i.e. 12+ hours for a fresh preprod wallet).
      //
      // Batch far more per round trip, but keep spacing non-zero: at 0 the SDK skips
      // `Stream.schedule` entirely, which starves the event loop so the indexer
      // WebSocket stops servicing keepalives and the subscription dies silently
      // part-way through the scan.
      //
      // `batchUpdates` is read at runtime (v1/Sync.js `makeDefaultSyncService`) but is
      // missing from the exported `DefaultDustConfiguration` alias, hence the widened type.
      const dustConfig: typeof c & { batchUpdates?: DustBatchUpdatesConfig } = {
        ...c,
        batchUpdates: { size: 2_048, timeout: 100, spacing: 1 },
      };
      return DustWallet(dustConfig).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      );
    },
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

/**
 * Waits for a specific condition on wallet state.
 *
 * Deliberately does NOT gate on `state.isSynced`. That flag is the conjunction of all
 * three sub-wallets being strictly complete, so a single sub-wallet whose subscription
 * stream dies makes it permanently false and any await on it hangs forever. Deploying
 * only needs unshielded NIGHT (to register) and DUST (to pay fees); the shielded scan
 * is the slow part and is irrelevant to a contract deploy. So we wait on the concrete
 * resource we actually need instead.
 */
const waitFor = <T>(wallet: WalletFacade, select: (s: FacadeState) => T | undefined, throttleMs = 5_000) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(throttleMs, undefined, { leading: true, trailing: true }),
      Rx.map(select),
      Rx.filter((v): v is T => v !== undefined),
    ),
  );

const nightBalance = (s: FacadeState) => s.unshielded.balances[unshieldedToken().raw] ?? 0n;

/** Best-effort snapshot of each sub-wallet, so a stalled or dead stream is visible. */
function formatProgress(state: FacadeState): string {
  const part = (label: string, p: any) => {
    if (!p) return `${label}=?`;
    const done = typeof p.isStrictlyComplete === 'function' ? p.isStrictlyComplete() : false;
    return `${label} ${p.appliedIndex}/${p.highestIndex}${done ? ' ✓' : ''}`;
  };
  return [
    part('shielded', state.shielded?.state?.progress),
    part('unshielded', state.unshielded?.progress),
    part('dust', state.dust?.state?.progress),
  ].join('  ');
}

/**
 * Reports scan progress while the wallet catches up. A fresh wallet must trial-decrypt
 * every shielded output on the chain, which takes tens of minutes on preprod; without
 * this the script looks hung. Never let reporting break the deploy.
 */
function reportSyncProgress(wallet: WalletFacade) {
  const started = Date.now();
  let lastSignature = '';
  let lastChangedAt = Date.now();

  return wallet
    .state()
    .pipe(Rx.throttleTime(30_000, undefined, { leading: true, trailing: true }))
    .subscribe({
      next: (state) => {
        try {
          const mins = Math.round((Date.now() - started) / 60_000);
          const signature = formatProgress(state);
          console.log(
            `  [${mins}m] ${signature}  night=${nightBalance(state)} dust=${state.dust.balance(new Date())}`,
          );

          // A dropped indexer subscription leaves the combined state stream emitting
          // unchanged values, so a dead sync looks identical to a slow one. Compare
          // consecutive applied indices to tell them apart instead of waiting forever.
          if (signature !== lastSignature) {
            lastSignature = signature;
            lastChangedAt = Date.now();
          } else if (Date.now() - lastChangedAt > SYNC_STALL_TIMEOUT_MS) {
            console.error(
              `SYNC STALLED: no progress for ${Math.round(SYNC_STALL_TIMEOUT_MS / 60_000)}m. ` +
                'The indexer subscription has most likely dropped. Re-run the deploy.',
            );
            process.exit(2);
          }
        } catch {
          /* progress reporting is best-effort */
        }
      },
      // A sub-wallet subscription that errors takes the combined state stream with it.
      // Surface it loudly rather than letting the script look like it is still working.
      error: (err) => console.error('SYNC STREAM ERROR:', inspect(err, { depth: 6 })),
      complete: () => console.error('SYNC STREAM CLOSED unexpectedly'),
    });
}

async function awaitFunding(wallet: WalletFacade, faucet: string, address: string) {
  console.log(`\nWaiting for unshielded (NIGHT) balance...\nIf empty, fund via: ${faucet}\n  ${address}\n`);
  const funded = await waitFor(wallet, (s) => {
    const b = nightBalance(s);
    return b > 0n ? b : undefined;
  });
  console.log(`Unshielded balance: ${funded.toLocaleString()} tNIGHT`);
}

/** NIGHT only produces DUST (the fee resource) once its UTXOs are registered on-chain. */
async function ensureDust(wallet: WalletFacade, keystore: UnshieldedKeystore) {
  const state = await waitFor(wallet, (s) => (s.unshielded.availableCoins.length > 0 ? s : undefined));

  if (state.dust.balance(new Date()) > 0n) {
    console.log(`DUST available: ${state.dust.balance(new Date()).toLocaleString()}`);
    return;
  }

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
  const ready = await waitFor(wallet, (s) => (s.dust.balance(new Date()) > 0n ? s : undefined));
  console.log(`DUST available: ${ready.dust.balance(new Date()).toLocaleString()}`);
}

async function main() {
  const network = readNetwork();
  const seed = readSeed();
  setNetworkId(network);

  console.log(`Network: ${network}`);
  console.log(`Proof server: ${PROOF_SERVER}`);

  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await buildWallet(network, seed);

  const progressSubscription = reportSyncProgress(wallet);
  try {
    const address = unshieldedKeystore.getBech32Address().toString();
    console.log(`Unshielded address: ${address}`);
    console.log('Syncing wallet...');

    await awaitFunding(wallet, NETWORKS[network].faucet, address);
    await ensureDust(wallet, unshieldedKeystore);

    const state = await waitFor(wallet, (s) => (s.dust.balance(new Date()) > 0n ? s : undefined));
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
    // Syncing a fresh wallet costs ~50 minutes on preprod, and the public indexer
    // intermittently returns transient server errors mid-proof. Retry in-process so a
    // blip does not discard an otherwise ready wallet.
    const deployed = await withRetry(
      () =>
        deployContract(providers as any, {
          compiledContract,
          privateStateId: PRIVATE_STATE_ID,
          initialPrivateState: initialPrivateState(SECRET_STEP),
        }),
      { attempts: 5, delayMs: 20_000, label: 'deploy' },
    );

    const contractAddress = deployed.deployTxData.public.contractAddress;
    console.log('\n==============================================');
    console.log(` Network:          ${network}`);
    console.log(` Contract address: ${contractAddress}`);
    console.log('==============================================\n');
    console.log('Add this address to the Contract Address table in README.md.');
  } finally {
    progressSubscription.unsubscribe();
    await wallet.stop().catch(() => undefined);
  }
}

main().catch((error) => {
  // Wallet SDK errors are Effect tagged errors whose payload lives in own properties,
  // not in `message` — plain string coercion renders them as "[object Object]".
  console.error(inspect(error, { depth: 8, colors: false }));
  process.exit(1);
});
