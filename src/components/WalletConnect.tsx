import type { useMidnight } from '../hooks/useMidnight';

type Props = Pick<
  ReturnType<typeof useMidnight>,
  | 'wallets'
  | 'walletStatus'
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
  const noWallet = walletStatus !== 'detecting' && wallets.length === 0;

  return (
    <section className="card">
      <header className="card-head">
        <h2>Wallet</h2>
        <span className={`badge ${connected ? 'badge-on' : 'badge-off'}`}>
          {connected ? 'Connected' : 'Not connected'}
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
          <p className="muted">
            {noWallet
              ? 'No Midnight wallet found in this browser.'
              : 'Connect a Midnight wallet to call the contract.'}
          </p>

          {noWallet ? (
            <a
              className="btn btn-primary"
              href="https://www.lace.io/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Install Lace
            </a>
          ) : (
            <div className="wallet-list">
              {wallets.map((wallet) => (
                <button
                  key={wallet.key}
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void connect(wallet.key)}
                  disabled={connecting}
                >
                  {wallet.icon && <img src={wallet.icon} alt="" width={18} height={18} />}
                  {connecting ? 'Waiting for wallet…' : `Connect ${wallet.name}`}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {walletError && <p className="alert alert-error">{walletError}</p>}
    </section>
  );
}
