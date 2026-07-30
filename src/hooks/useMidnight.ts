import { useCallback, useEffect, useRef, useState } from 'react';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';

import { CONTRACT_ADDRESS, EXPECTED_NETWORK_ID, PRIVATE_STATE_ID } from '../lib/config';
import { buildProviders, compiledContract, readLedger } from '../lib/providers';
import { describeWalletError, waitForWallets, type ConnectedAPI, type DiscoveredWallet } from '../lib/wallet';
import { initialPrivateState } from '../../contracts/witnesses.js';
import type * as Counter from '../../managed/contract/index.js';

export type WalletStatus = 'idle' | 'detecting' | 'connecting' | 'connected' | 'error';
export type CallStatus = 'idle' | 'proving' | 'submitting' | 'done' | 'error';

export type CallResult = {
  readonly txId: string;
  readonly blockHeight?: number;
};

/**
 * Owns everything stateful about talking to Midnight: which wallet is attached,
 * whether it is on the right network, and how a circuit call is progressing.
 */
export function useMidnight() {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('detecting');
  const [walletName, setWalletName] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callError, setCallError] = useState<string | null>(null);
  const [result, setResult] = useState<CallResult | null>(null);

  const [ledger, setLedger] = useState<Counter.Ledger | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const connectionRef = useRef<ConnectedAPI | null>(null);

  useEffect(() => {
    let cancelled = false;
    void waitForWallets().then((found) => {
      if (cancelled) return;
      setWallets(found);
      setWalletStatus('idle');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const networkMismatch = walletStatus === 'connected' && networkId !== null && networkId !== EXPECTED_NETWORK_ID;

  const connect = useCallback(async (walletKey?: string) => {
    setWalletError(null);
    setWalletStatus('connecting');

    try {
      const available = await waitForWallets();
      setWallets(available);

      const target = walletKey ? available.find((w) => w.key === walletKey) : available[0];
      if (!target) {
        throw new Error('No Midnight wallet detected. Install the Lace extension, then reload this page.');
      }

      const connected = await target.api.connect(EXPECTED_NETWORK_ID);
      const configuration = await connected.getConfiguration();
      const { unshieldedAddress } = await connected.getUnshieldedAddress();

      connectionRef.current = connected;
      setWalletName(target.name);
      setAddress(unshieldedAddress);
      setNetworkId(configuration.networkId);
      setWalletStatus('connected');
    } catch (error) {
      connectionRef.current = null;
      setWalletError(describeWalletError(error));
      setWalletStatus('error');
    }
  }, []);

  const disconnect = useCallback(() => {
    connectionRef.current = null;
    setWalletStatus('idle');
    setWalletName(null);
    setAddress(null);
    setNetworkId(null);
    setWalletError(null);
    setCallStatus('idle');
    setCallError(null);
    setResult(null);
  }, []);

  /**
   * Runs the increment circuit. `secretStep` is placed straight into the
   * contract's private state and is only ever read by the witness while the
   * proof is being built — it is never returned, stored, or logged here.
   */
  const callIncrement = useCallback(
    async (secretStep: bigint) => {
      const connected = connectionRef.current;
      if (!connected) {
        setCallError('Connect a wallet first.');
        setCallStatus('error');
        return;
      }

      setCallError(null);
      setResult(null);
      setCallStatus('proving');

      try {
        const providers = await buildProviders(connected);
        const contract = await findDeployedContract(providers as never, {
          compiledContract,
          contractAddress: CONTRACT_ADDRESS,
          privateStateId: PRIVATE_STATE_ID,
          initialPrivateState: initialPrivateState(secretStep),
        });

        setCallStatus('submitting');
        const finalized = await contract.callTx.increment();

        setResult({
          txId: finalized.public.txId,
          blockHeight: finalized.public.blockHeight,
        });
        setCallStatus('done');

        void refreshLedger();
      } catch (error) {
        setCallError(describeWalletError(error));
        setCallStatus('error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Reads public state straight from the indexer — no wallet required. */
  const refreshLedger = useCallback(async () => {
    setLedgerError(null);
    try {
      const connected = connectionRef.current;
      if (!connected) return;
      const providers = await buildProviders(connected);
      setLedger(await readLedger(providers as never, CONTRACT_ADDRESS));
    } catch (error) {
      setLedgerError(error instanceof Error ? error.message : 'Could not read contract state.');
    }
  }, []);

  useEffect(() => {
    if (walletStatus === 'connected' && !networkMismatch) void refreshLedger();
  }, [walletStatus, networkMismatch, refreshLedger]);

  return {
    wallets,
    walletStatus,
    walletName,
    address,
    networkId,
    walletError,
    networkMismatch,
    expectedNetworkId: EXPECTED_NETWORK_ID,
    connect,
    disconnect,

    callStatus,
    callError,
    result,
    callIncrement,

    ledger,
    ledgerError,
    refreshLedger,
  };
}
