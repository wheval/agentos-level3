import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';
import { useMidnight } from './hooks/useMidnight';
import { CONTRACT_ADDRESS, EXPECTED_NETWORK_ID } from './lib/config';

export default function App() {
  const midnight = useMidnight();

  return (
    <main className="page">
      <header className="page-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>AgentOS</span>
        </div>
        <div className="hero-copy">
          <span className="eyebrow">Private counter · Midnight Network</span>
          <h1>Private steps.<br /><span>Public progress.</span></h1>
          <p>
            Move the counter without publishing your input. Your wallet proves the step is valid,
            while only the updated total reaches the chain.
          </p>
        </div>
        <div className="hero-meta">
          <span className="network-pill"><i aria-hidden="true" />{EXPECTED_NETWORK_ID}</span>
          <span className="mono contract" title={CONTRACT_ADDRESS}>{CONTRACT_ADDRESS}</span>
        </div>
      </header>

      <div className="grid">
        <WalletConnect
          wallets={midnight.wallets}
          walletStatus={midnight.walletStatus}
          connectingWalletKey={midnight.connectingWalletKey}
          walletName={midnight.walletName}
          address={midnight.address}
          networkId={midnight.networkId}
          walletError={midnight.walletError}
          networkMismatch={midnight.networkMismatch}
          expectedNetworkId={midnight.expectedNetworkId}
          connect={midnight.connect}
          disconnect={midnight.disconnect}
        />

        <CircuitCall
          walletStatus={midnight.walletStatus}
          networkMismatch={midnight.networkMismatch}
          callStatus={midnight.callStatus}
          callError={midnight.callError}
          result={midnight.result}
          callIncrement={midnight.callIncrement}
          ledger={midnight.ledger}
          ledgerStatus={midnight.ledgerStatus}
          ledgerError={midnight.ledgerError}
          refreshLedger={midnight.refreshLedger}
        />
      </div>

      <footer className="page-foot">
        <span className="privacy-orb" aria-hidden="true">✓</span>
        <p><strong>Your input stays yours.</strong> Proving runs in your wallet and the witness value never appears in the transaction.</p>
      </footer>
    </main>
  );
}
