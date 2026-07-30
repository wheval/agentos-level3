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

  if (error instanceof Error) return error.message;
  return 'Something went wrong talking to the wallet.';
}

export type { ConnectedAPI };
