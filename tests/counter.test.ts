import { describe, expect, it } from 'vitest';
import {
  type CircuitContext,
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

import { Contract, type Ledger, ledger } from '../managed/contract/index.js';
import { type CounterPrivateState, initialPrivateState, witnesses } from '../contracts/witnesses.js';

class CounterSimulator {
  readonly contract: Contract<CounterPrivateState>;
  private circuitContext: CircuitContext<CounterPrivateState>;

  constructor(secretStep: bigint) {
    this.contract = new Contract<CounterPrivateState>(witnesses);

    const { currentContractState, currentPrivateState, currentZswapLocalState } =
      this.contract.initialState(
        createConstructorContext<CounterPrivateState>(initialPrivateState(secretStep), '0'.repeat(64)),
      );

    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState,
    );
  }

  getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  getPrivateState(): CounterPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /** Replaces the caller's private step without touching public state. */
  setSecretStep(secretStep: bigint): void {
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: initialPrivateState(secretStep),
    };
  }

  invokeIncrement(): [] {
    const invocation = this.contract.impureCircuits.increment(this.circuitContext);
    this.circuitContext = invocation.context;
    return invocation.result;
  }

  increment(): Ledger {
    this.invokeIncrement();
    return this.getLedger();
  }
}

describe('PrivateCounter contract', () => {
  it('initialises public ledger state from the constructor', () => {
    const counter = new CounterSimulator(3n);
    const state = counter.getLedger();

    expect(state.round).toEqual(0n);
    expect(state.total).toEqual(0n);
    expect(state.max_step).toEqual(10n);
  });

  it('advances public state by the private step on each increment', () => {
    const counter = new CounterSimulator(4n);

    expect(counter.increment()).toMatchObject({ round: 1n, total: 4n });
    expect(counter.increment()).toMatchObject({ round: 2n, total: 8n });

    counter.setSecretStep(2n);
    expect(counter.increment()).toMatchObject({ round: 3n, total: 10n });
  });

  it('rejects steps outside the publicly declared policy bound', () => {
    const tooLarge = new CounterSimulator(11n);
    expect(() => tooLarge.increment()).toThrow(/step exceeds max_step/);

    const tooSmall = new CounterSimulator(0n);
    expect(() => tooSmall.increment()).toThrow(/step must be at least 1/);

    // A rejected call must not move public state.
    expect(tooLarge.getLedger()).toMatchObject({ round: 0n, total: 0n });
  });

  it('never writes the private step into the public ledger', () => {
    const counter = new CounterSimulator(7n);
    counter.increment();

    // The ledger exposes only the three declared public fields.
    expect(Object.keys(counter.getLedger()).sort()).toEqual(['max_step', 'round', 'total']);

    // The witness value stays in private state, untouched by the circuit.
    expect(counter.getPrivateState()).toEqual({ secretStep: 7n });
  });

  it('returns no private circuit output', () => {
    const counter = new CounterSimulator(9n);

    expect(counter.invokeIncrement()).toEqual([]);
    expect('secretStep' in counter.getLedger()).toBe(false);
    expect(counter.getPrivateState()).toEqual({ secretStep: 9n });
  });

  it('produces identical public state for different private step sequences', () => {
    const viaTwoThenThree = new CounterSimulator(2n);
    viaTwoThenThree.increment();
    viaTwoThenThree.setSecretStep(3n);
    viaTwoThenThree.increment();

    const viaOneThenFour = new CounterSimulator(1n);
    viaOneThenFour.increment();
    viaOneThenFour.setSecretStep(4n);
    viaOneThenFour.increment();

    // An observer reading the chain cannot tell which steps were used.
    expect(viaTwoThenThree.getLedger()).toEqual(viaOneThenFour.getLedger());
  });
});
