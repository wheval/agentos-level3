import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';

/** A wallet extension advertised on `window.midnight`, plus the key it registered under. */
export type DiscoveredWallet = {
  readonly key: string;
  readonly name: string;
  readonly icon?: string;
  readonly api: InitialAPI;
};

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

/**
 * Wallets register themselves under their own key (`mnLace`, `1am`, ...), so
 * enumerate the record rather than guessing a name.
 */
export function discoverWallets(): DiscoveredWallet[] {
  const injected = typeof window === 'undefined' ? undefined : window.midnight;
  if (!injected) return [];

  return Object.entries(injected)
    .filter(([, api]) => typeof api?.connect === 'function')
    .map(([key, api]) => ({ key, name: api.name ?? key, icon: api.icon, api }));
}

/**
 * Extensions inject asynchronously, so a page that loads faster than the
 * extension would otherwise see an empty `window.midnight`.
 */
export async function waitForWallets(timeoutMs = 3_000): Promise<DiscoveredWallet[]> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const wallets = discoverWallets();
    if (wallets.length > 0 || Date.now() > deadline) return wallets;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

type ConnectorError = {
  type: 'DAppConnectorAPIError';
  code: string;
  reason?: string;
};

const isConnectorError = (error: unknown): error is ConnectorError =>
  typeof error === 'object' &&
  error !== null &&
  (error as { type?: unknown }).type === 'DAppConnectorAPIError';

/**
 * midnight-js reports submission failures as
 * `new Error(\`Unexpected error submitting ...: ${String(err)}\`, { cause: err })`.
 * When the underlying failure carries an empty message, `String(err)` collapses
 * to a bare "Error" and the only usable detail survives on `cause` — so walk it.
 */
function unwrap(error: unknown, depth = 0): string | null {
  if (error == null || depth > 5) return null;

  // Handled by the code table above; recursing back into it keeps the wording
  // consistent when a connector rejection is nested inside a wrapper Error.
  if (isConnectorError(error)) return describeWalletError(error);

  if (typeof error === 'string') return error.trim() || null;

  if (error instanceof Error) {
    const nested = unwrap(error.cause, depth + 1);
    if (nested) return nested;

    const own = error.message.trim();
    if (own) return own;

    return error.name && error.name !== 'Error' ? error.name : null;
  }

  return null;
}

/**
 * The connector rejects with a plain object rather than an Error, so the usual
 * `error.message` is empty. Translate the documented codes into something a
 * user can act on.
 */
export function describeWalletError(error: unknown): string {
  if (isConnectorError(error)) {
    switch (error.code) {
      case 'Rejected':
      case 'PermissionRejected':
        return 'You dismissed the wallet prompt. Approve it to continue.';
      case 'Disconnected':
        return 'The wallet disconnected. Reconnect and try again.';
      case 'InvalidRequest':
        return `The wallet rejected the request${error.reason ? `: ${error.reason}` : '.'}`;
      case 'InternalError':
      default:
        return `The wallet reported an error${error.reason ? `: ${error.reason}` : '.'}`;
    }
  }

  const detail = unwrap(error);
  if (detail) return detail;

  return 'Something went wrong talking to the wallet.';
}

/**
 * Fees on Midnight are paid in DUST, which accrues from held NIGHT rather than
 * being sent to you. A wallet can therefore hold tNIGHT and still be unable to
 * submit. That failure otherwise surfaces late — after a proof has already been
 * generated — as an error with no message, so check it up front.
 */
export async function assertCanPayFees(connected: ConnectedAPI, networkId: string): Promise<void> {
  let cap: bigint;
  let balance: bigint;

  try {
    ({ cap, balance } = await connected.getDustBalance());
  } catch {
    // Older wallets may not expose DUST; let the normal path report failures.
    return;
  }

  if (balance > 0n) return;

  // A zero DUST balance has two very different causes that are indistinguishable
  // from the DUST figures alone, so check for NIGHT before advising a fix.
  let holdsNight = false;
  try {
    const unshielded = await connected.getUnshieldedBalances();
    holdsNight = Object.values(unshielded).some((amount) => amount > 0n);
  } catch {
    holdsNight = false;
  }

  if (cap > 0n) {
    throw new Error(
      `This wallet's NIGHT is registered but no DUST has accrued yet on ${networkId}. It builds up over a few minutes — wait, then try again.`,
    );
  }

  throw new Error(
    holdsNight
      ? `This wallet holds NIGHT, but none of it is registered for DUST generation, so it cannot pay fees on ${networkId}. Register it for DUST generation in your wallet, wait a few minutes, then try again.`
      : `This wallet has no NIGHT on ${networkId}, so it cannot generate the DUST that pays fees. Fund it from the ${networkId} faucet, then register it for DUST generation.`,
  );
}

export type { ConnectedAPI };
