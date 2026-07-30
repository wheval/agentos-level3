/**
 * Browser stand-in for Node's `assert`.
 *
 * `@midnight-ntwrk/wallet-sdk-address-format` pulls in @subsquid/scale-codec,
 * which calls `assert(cond, msg)` while decoding Bech32m addresses. Vite
 * externalises the Node builtin, which would leave those calls undefined at
 * runtime, so route them here instead.
 */
export class AssertionError extends Error {
  constructor(message?: string) {
    super(message ?? 'Assertion failed');
    this.name = 'AssertionError';
  }
}

function assert(value: unknown, message?: string): asserts value {
  if (!value) throw new AssertionError(message);
}

const equal = (actual: unknown, expected: unknown, message?: string): void => {
  // eslint-disable-next-line eqeqeq
  if (actual != expected) {
    throw new AssertionError(message ?? `${String(actual)} != ${String(expected)}`);
  }
};

const strictEqual = (actual: unknown, expected: unknown, message?: string): void => {
  if (actual !== expected) {
    throw new AssertionError(message ?? `${String(actual)} !== ${String(expected)}`);
  }
};

const fail = (message?: string): never => {
  throw new AssertionError(message);
};

assert.ok = assert;
assert.equal = equal;
assert.strictEqual = strictEqual;
assert.fail = fail;
assert.AssertionError = AssertionError;

export { assert, equal, strictEqual, fail };
export const ok = assert;
export default assert;
