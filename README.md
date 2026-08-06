# AgentOS — PrivateCounter
[![CI](https://github.com/wheval/agentos-level3/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wheval/agentos-level3/actions/workflows/ci.yml)

> A private-input counter that proves each step obeys an on-chain policy without publishing the witness.

## Live Demo

[https://agentos-level2.vercel.app](https://agentos-level2.vercel.app)

The hosted app connects a Midnight wallet to the verified Preview deployment below.

## Contract Address

| Network | Address | Status |
|---------|---------|--------|
| **Preprod** (`preprod`) | `ee4262f0e8560a607837b4a8bcb926feb9ad443b291e46c3c5d5a98b95403f8c` | Deployed and verified on-chain |
| **Preview** (`preview`) | `2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e` | Deployed and verified on-chain |

Both deployments are live and independently verifiable:

- **Preprod** was created by transaction
  `b78bcd87c82c3ce99498470f5523499c8d04d170929764fcb2f8ee17c9333402` in block `1985912`.
- **Preview** was created by transaction
  `492bc5bf9ff75df1d94c4977f52b8b1d9030180ffc7a812c1d4817ecb659dd70` in block `205339`.

Verify either against the public Midnight indexer. No wallet, key, or local toolchain is
required beyond `curl`:

```bash
./scripts/verify.sh preprod \
  ee4262f0e8560a607837b4a8bcb926feb9ad443b291e46c3c5d5a98b95403f8c

./scripts/verify.sh preview \
  2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e
```

Each prints the deploying transaction and block, and exits non-zero if the address does not
resolve to a `ContractDeploy` on that network. Every row above carries an explicit network
label so the deployed target is unambiguous.

The hosted demo points at the Preview deployment. To run the UI against Preprod, set
`VITE_CONTRACT_ADDRESS` to the Preprod address above and `VITE_NETWORK_ID=preprod`.

## What This Does

`PrivateCounter` is a shared counter with a public rule: every increment must be between
`1` and `max_step` (`10`). The caller chooses the step locally. A Compact circuit proves
that the private witness satisfies the rule, then publishes only the resulting public state.

The frontend discovers Lace or 1AM, checks network and DUST readiness, generates the proof
through the wallet, submits the transaction, and refreshes the ledger state. Wallet rejection,
network mismatch, fee, proving, submission, indexer, and retry states are surfaced in the UI.

This is the smallest working primitive behind AgentOS, a private control plane for autonomous
AI operations. `max_step` represents a published policy boundary, `secret_step()` represents
an agent action, and the proof shows that the action complied without transmitting its private
input. The same pattern can govern payments, deployments, data access, and cross-tool workflows.

## Privacy Model

- **PUBLIC:** `round`, `total`, and the sealed `max_step` policy are stored on the ledger and
  readable by everyone.
- **PRIVATE:** `secret_step()` is a witness supplied from in-memory browser state. It is not a
  public circuit argument, is never persisted, and is cleared from the input before proving.
- **PROVED without revealing:** `1 <= secret_step() <= max_step`.

The intentional disclosure boundary is explicit in Compact:

```compact
round = (round + 1) as Uint<64>;
total = disclose((total + step) as Uint<64>);
```

`round` depends only on public state. `total` depends on the private witness, so Compact
requires `disclose()` before the value can affect the public ledger.

## Privacy Claim

**An on-chain observer sees:**

- A transaction called `increment()` on this contract.
- The old and new public `round` and `total`.
- The public `max_step = 10` policy.
- A proof that the private witness satisfied the circuit constraints.

**An on-chain observer does not see:**

- A public circuit argument containing the step.
- The `secret_step()` witness value in the transaction or ledger.
- Browser private state or the masked input value.

**Honest limitation:** because `total` is public before and after each transaction, an observer
can subtract consecutive totals and infer that transaction's step. This contract protects the
private input channel and proves policy compliance; it does not claim unlinkability or hide the
public-state delta. Hiding the delta would require a commitment or shielded balance design.

## Tech Stack

- Midnight Preprod and Preview testnets with the public indexer
- Compact language `0.23`, compiler `0.31.1`, runtime `0.16.0`
- Midnight.js `4.1.x` and DApp Connector API `4.0.1`
- React 18, TypeScript, and Vite 5
- Lace and 1AM browser wallet support
- Vitest contract simulator tests
- GitHub Actions, Node.js 22, and npm `10.9.2`
- Vercel static hosting with browser ZK assets

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 22+ | `node --version` |
| npm 10.9.2 | Invoked through `npx --yes npm@10.9.2` |
| Compact toolchain 0.31.1 | Installed with the official Compact version manager |
| Lace or 1AM | Required for the browser transaction flow |
| Funded testnet wallet | NIGHT must be registered and allowed time to accrue DUST |
| Docker proof server | Required for command-line deployment; browser calls use the wallet proving provider |

Install the Compact toolchain:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31.1
```

## Setup & Run Locally

```bash
git clone https://github.com/wheval/agentos-level3.git
cd agentos-level3
npx --yes npm@10.9.2 ci
npx --yes npm@10.9.2 run compile
npx --yes npm@10.9.2 run sync:zk
npx --yes npm@10.9.2 run dev
```

Open `http://localhost:5173`. To target a different verified deployment, create `.env.local`:

```bash
VITE_CONTRACT_ADDRESS=<verified-contract-address>
VITE_NETWORK_ID=preview
```

The default remains the verified Preview deployment. To target Preprod instead, set both
values together so the address and network always match:

```bash
VITE_CONTRACT_ADDRESS=ee4262f0e8560a607837b4a8bcb926feb9ad443b291e46c3c5d5a98b95403f8c
VITE_NETWORK_ID=preprod
```

## Run Tests

```bash
npx --yes npm@10.9.2 test
npx --yes npm@10.9.2 run test:artifacts
npx --yes npm@10.9.2 run typecheck
npx --yes npm@10.9.2 run build
```

The six simulator tests cover constructor state, circuit computation, repeated state
transitions, policy rejection with unchanged state, private-ledger separation, empty circuit
output, and indistinguishable final public state from different private sequences. Artifact
validation checks source declarations, compiler metadata, generated bindings, proving files,
and byte-for-byte browser asset copies.

## CI/CD

`.github/workflows/ci.yml` runs for pushes to `main` and every pull request. It:

1. Checks out the repository.
2. Configures Node.js 22.
3. Installs locked dependencies with npm `10.9.2`.
4. Installs Compact `0.31.1`, compiles `contracts/counter.compact`, and syncs browser ZK assets.
5. Verifies committed compiler artifacts have no diff.
6. Runs the contract tests and required file-structure check.
7. Runs TypeScript typechecking and the production Vite build.

The badge directly below the title reports this workflow's `main` branch status.

## Product Proposal

**AgentOS** is a model-agnostic private control plane for the autonomous AI agents that
individual developers and indie builders run themselves. It gives every agent a private
identity, scoped permissions, private memory, and a built-in policy engine, and ships as a full
web app — dashboard, agent management, policy builder, vault, connectors, and templates. It
starts with a Credential and Payment Vault that issues short-lived, policy-bound capabilities
instead of raw keys, so an agent can spend money or call APIs without leaking budgets, secrets,
or activity. The full product, selective-disclosure data model, and Level 6 roadmap are in
[PROPOSAL.md](PROPOSAL.md).

## Deployment and Verification

Deploy after the target-network wallet is funded and has DUST:

```bash
export MIDNIGHT_SEED=<64-character-hex-seed>
npx --yes npm@10.9.2 run deploy -- --network preprod
```

Verify an address before documenting it:

```bash
./scripts/verify.sh <network> <address> [deploy-tx-hash]
```

Actual Preprod evidence, reproducible by anyone with `curl`:

```text
$ ./scripts/verify.sh preprod ee4262f0e8560a607837b4a8bcb926feb9ad443b291e46c3c5d5a98b95403f8c
Network:  preprod
Address:  ee4262f0e8560a607837b4a8bcb926feb9ad443b291e46c3c5d5a98b95403f8c
Latest:   ContractDeploy in block 1985912 (tx b78bcd87c82c3ce99498470f5523499c8d04d170929764fcb2f8ee17c9333402)

Verified on-chain.
```

Expected Preview evidence:

```text
Network:  preview
Address:  2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e
Deploy:   ContractDeploy in block 205339 (tx 492bc5bf9ff75df1d94c4977f52b8b1d9030180ffc7a812c1d4817ecb659dd70)
Latest:   ContractCall in block 207377 (tx fe388f20ec5cc26472204dd2b184a0048d4ecd62ed450b71621a7bcc82f528fc)

Verified on-chain.
```

The `Deploy` line is fixed. The `Latest` line reports the most recent action on the contract, so
its block and transaction advance each time someone calls `increment()`. The indexer resolves an
address to its latest action only, which is why deployment is confirmed from the deploy
transaction instead of from that lookup.

## Project Structure

```text
agentos-level3/
├── .github/workflows/ci.yml
├── contracts/
│   ├── counter.compact
│   └── witnesses.ts
├── managed/
├── public/zk/counter/
├── scripts/
├── src/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── App.tsx
│   └── main.tsx
├── tests/
│   ├── contract-artifacts.test.sh
│   └── counter.test.ts
├── PROPOSAL.md
├── README.md
└── package.json
```

## Demo Video

[Watch the wallet connection, private circuit call, and public result](https://youtu.be/sLYBi4SMj_U).

## Build and Deployment Evidence

- Passing tests and build: [GitHub Actions CI](https://github.com/wheval/agentos-level3/actions/workflows/ci.yml)
- Preview deployment screenshots: [`screenshots/`](screenshots/)
- Committed compiler output: [`managed/`](managed/)
- Browser proving artifacts: [`public/zk/counter/`](public/zk/counter/)

### Compile output

![Compile output](screenshots/compile.png)

### Deployed contract address

![Deploy output](screenshots/deploy.png)

### On-chain verification

![Indexer verification](screenshots/verify.png)
