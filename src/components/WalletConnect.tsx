import type { useMidnight } from '../hooks/useMidnight';

type Props = Pick<
  ReturnType<typeof useMidnight>,
  | 'wallets'
  | 'walletStatus'
  | 'connectingWalletKey'
  | 'walletName'
  | 'address'
  | 'networkId'
  | 'walletError'
  | 'networkMismatch'
  | 'expectedNetworkId'
  | 'connect'
  | 'disconnect'
>;

const shorten = (value: string): string => (value.length > 24 ? `${value.slice(0, 14)}…${value.slice(-8)}` : value);

export function WalletConnect({
  wallets,
  walletStatus,
  connectingWalletKey,
  walletName,
  address,
  networkId,
  walletError,
  networkMismatch,
  expectedNetworkId,
  connect,
  disconnect,
}: Props) {
  const connecting = walletStatus === 'connecting';
  const connected = walletStatus === 'connected';
  const detecting = walletStatus === 'detecting';
  const noWallet = walletStatus !== 'detecting' && wallets.length === 0;
  const statusLabel = connected
    ? 'Connected'
    : detecting
      ? 'Detecting'
      : connecting
        ? 'Connecting'
        : walletStatus === 'error'
          ? 'Needs attention'
          : 'Not connected';

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <span className="section-kicker">Step 01</span>
          <h2>Choose your wallet</h2>
        </div>
        <span className={`badge ${connected ? 'badge-on' : 'badge-off'}`} role="status" aria-live="polite">
          {statusLabel}
        </span>
      </header>

      {connected ? (
        <>
          <dl className="facts">
            <div>
              <dt>Wallet</dt>
              <dd>{walletName}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd className="mono" title={address ?? undefined}>
                {address ? shorten(address) : '—'}
              </dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd className="mono">{networkId}</dd>
            </div>
          </dl>

          {networkMismatch && (
            <p className="alert alert-warn">
              Your wallet is on <strong>{networkId}</strong> but this contract is deployed on{' '}
              <strong>{expectedNetworkId}</strong>. Switch networks in the wallet, then reconnect.
            </p>
          )}

          <button type="button" className="btn btn-ghost" onClick={disconnect}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          {detecting ? (
            <div className="progress progress-inline" role="status">
              <span className="spinner" aria-hidden="true" />
              <span>Looking for Lace or 1AM in this browser…</span>
            </div>
          ) : (
            <p className="muted">
              {noWallet
                ? 'No Midnight wallet found. Install an extension, enable it for this site, then reload.'
                : 'Select the wallet you want to use for proving and submitting.'}
            </p>
          )}

          {detecting ? null : noWallet ? (
            <div className="wallet-list">
              <a className="btn btn-primary" href="https://www.lace.io/" target="_blank" rel="noreferrer noopener">
                Install Lace
              </a>
              <a className="btn btn-secondary" href="https://1am.xyz/" target="_blank" rel="noreferrer noopener">
                Install 1AM
              </a>
            </div>
          ) : (
            <div className="wallet-list">
              {wallets.map((wallet) => {
                const isThisWalletConnecting = connectingWalletKey === wallet.key;

                return (
                  <button
                    key={wallet.key}
                    type="button"
                    className="wallet-option"
                    onClick={() => void connect(wallet.key)}
                    disabled={connecting}
                    aria-busy={isThisWalletConnecting}
                  >
                    <span className="wallet-icon">
                      {wallet.icon ? <img src={wallet.icon} alt="" width={24} height={24} /> : wallet.name.slice(0, 1)}
                    </span>
                    <span className="wallet-copy">
                      <strong>{wallet.name}</strong>
                      <small>{isThisWalletConnecting ? 'Waiting for approval…' : 'Connect extension'}</small>
                    </span>
                    {isThisWalletConnecting ? <span className="spinner" aria-hidden="true" /> : <span aria-hidden="true">→</span>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {walletError && <p className="alert alert-error" role="alert">{walletError}</p>}
    </section>
  );
}
