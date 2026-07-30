import { WalletConnect } from './components/WalletConnect';
import { CircuitCall } from './components/CircuitCall';
import { useMidnight } from './hooks/useMidnight';
import { CONTRACT_ADDRESS, EXPECTED_NETWORK_ID } from './lib/config';

export default function App() {
  const midnight = useMidnight();

  return (
    <main className="page">
      <header className="page-head">
        <h1>AgentOS</h1>
        <p>
          A counter on Midnight that moves by an amount you never publish. Your step is proved to be in range
          inside a zero-knowledge circuit, and only the running total reaches the chain.
        </p>
        <p className="mono contract">
          {EXPECTED_NETWORK_ID} · {CONTRACT_ADDRESS}
        </p>
      </header>

      <div className="grid">
        <WalletConnect
          wallets={midnight.wallets}
          walletStatus={midnight.walletStatus}
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
          ledgerError={midnight.ledgerError}
        />
      </div>

      <footer className="page-foot">
        <p>
          Proving runs in your wallet on this machine. The witness value is never sent to a server and never
          appears in the transaction.
        </p>
      </footer>
    </main>
  );
}
