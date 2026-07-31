#!/bin/sh
set -e

# Source declares the public ledger, the private witness, and a disclose().
grep -q 'export ledger round: Uint<64>;' contracts/counter.compact
grep -q 'export ledger total: Uint<64>;' contracts/counter.compact
grep -q 'export sealed ledger max_step: Uint<64>;' contracts/counter.compact
grep -q 'witness secret_step(): Uint<64>;' contracts/counter.compact
grep -q 'export circuit increment(): \[\]' contracts/counter.compact
grep -q 'disclose(' contracts/counter.compact

# Compiler output agrees with the source.
grep -q '"name": "increment"' managed/compiler/contract-info.json
grep -q '"name": "secret_step"' managed/compiler/contract-info.json
grep -q '"name": "round"' managed/compiler/contract-info.json
grep -q '"name": "total"' managed/compiler/contract-info.json
grep -q '"name": "max_step"' managed/compiler/contract-info.json

# Proving and verifier keys exist.
test -s managed/keys/increment.prover
test -s managed/keys/increment.verifier
test -s managed/zkir/increment.bzkir

# The browser serves byte-for-byte copies of the compiler output.
cmp managed/keys/increment.prover public/zk/counter/keys/increment.prover
cmp managed/keys/increment.verifier public/zk/counter/keys/increment.verifier
cmp managed/zkir/increment.bzkir public/zk/counter/zkir/increment.bzkir

# Generated bindings expose no public arguments or return values for increment.
grep -Fq 'increment(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;' \
  managed/contract/index.d.ts

# The private witness must never appear as a public ledger field.
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const info = JSON.parse(readFileSync('managed/compiler/contract-info.json', 'utf8'));
const publicFields = info.ledger.map((entry) => entry.name);
if (publicFields.includes('secret_step')) {
  console.error('secret_step leaked into public ledger state');
  process.exit(1);
}
if (!info.witnesses.some((w) => w.name === 'secret_step')) {
  console.error('secret_step is not registered as a private witness');
  process.exit(1);
}
"

echo "Contract source and generated artifacts are consistent."
