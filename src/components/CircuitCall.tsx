import { useState, type FormEvent } from 'react';

import type { useMidnight } from '../hooks/useMidnight';
import { CONTRACT_ADDRESS } from '../lib/config';

type Props = Pick<
  ReturnType<typeof useMidnight>,
  'walletStatus' | 'networkMismatch' | 'callStatus' | 'callError' | 'result' | 'callIncrement' | 'ledger' | 'ledgerError'
>;

const MAX_STEP = 10n;

export function CircuitCall({
  walletStatus,
  networkMismatch,
  callStatus,
  callError,
  result,
  callIncrement,
  ledger,
  ledgerError,
}: Props) {
  // Held only long enough to build the proof. It is never rendered back to the
  // screen, never written to storage, and never included in the transaction.
  const [step, setStep] = useState('');
  const [validation, setValidation] = useState<string | null>(null);

  const busy = callStatus === 'proving' || callStatus === 'submitting';
  const ready = walletStatus === 'connected' && !networkMismatch;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setValidation(null);

    let parsed: bigint;
    try {
      parsed = BigInt(step.trim());
    } catch {
      setValidation('Enter a whole number.');
      return;
    }

    if (parsed < 1n || parsed > MAX_STEP) {
      setValidation(`The circuit only accepts a step between 1 and ${MAX_STEP}.`);
      return;
    }

    void callIncrement(parsed).finally(() => setStep(''));
  };

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <span className="section-kicker">Step 02</span>
          <h2>Prove an increment</h2>
        </div>
        <span className="badge badge-off mono">{CONTRACT_ADDRESS.slice(0, 10)}…</span>
      </header>

      <form className="increment-form" onSubmit={onSubmit}>
        <label className="field">
          <span>Your secret step</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={`1 – ${MAX_STEP}`}
            value={step}
            onChange={(event) => setStep(event.target.value)}
            disabled={!ready || busy}
          />
        </label>

        <p className="privacy-note">
          <span className="privacy-icon" aria-hidden="true">✦</span>
          <span><strong>Proved without revealing your input.</strong> The proof only attests that your step is between 1 and {String(MAX_STEP)}.</span>
        </p>

        {validation && <p className="alert alert-error">{validation}</p>}

        <button type="submit" className="btn btn-primary" disabled={!ready || busy || step.trim() === ''}>
          {callStatus === 'proving' && 'Generating proof…'}
          {callStatus === 'submitting' && 'Submitting…'}
          {!busy && 'Increment counter'}
        </button>

        {!ready && walletStatus !== 'connected' && <p className="muted">Connect a wallet to enable this.</p>}
      </form>

      {busy && (
        <div className="progress">
          <span className="spinner" aria-hidden="true" />
          <span>
            {callStatus === 'proving'
              ? 'Building the zero-knowledge proof in your wallet. This takes a moment.'
              : 'Broadcasting the transaction.'}
          </span>
        </div>
      )}

      {callStatus === 'done' && result && (
        <div className="alert alert-ok">
          <p>Counter incremented.</p>
          <dl className="facts">
            <div>
              <dt>Transaction</dt>
              <dd className="mono break">{result.txId}</dd>
            </div>
            {result.blockHeight !== undefined && (
              <div>
                <dt>Block</dt>
                <dd className="mono">{result.blockHeight}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {callError && <p className="alert alert-error">{callError}</p>}

      <div className="ledger">
        <div className="ledger-head">
          <h3>Public state</h3>
          <span className="live-indicator"><i aria-hidden="true" /> Live</span>
        </div>
        {ledgerError && <p className="alert alert-error">{ledgerError}</p>}
        {ledger ? (
          <dl className="stats">
            <div>
              <dt>Round</dt>
              <dd className="mono">{String(ledger.round)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd className="mono">{String(ledger.total)}</dd>
            </div>
            <div>
              <dt>Max step</dt>
              <dd className="mono">{String(ledger.max_step)}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Connect a wallet to read the on-chain counter.</p>
        )}
      </div>
    </section>
  );
}
