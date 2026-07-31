# AgentOS — PrivateCounter
[![CI](https://github.com/wheval/agentos-level3/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/wheval/agentos-level3/actions/workflows/ci.yml)

> A private-input counter that proves each step obeys an on-chain policy without publishing the witness.

## Live Demo

[https://agentos-level2.vercel.app](https://agentos-level2.vercel.app)

This is the verified Level 2 deployment, preserved while Level 3 is prepared. A dedicated
Level 3 production deployment is still a user action and is not represented as complete.

## Contract Address

| Network | Address |
|----------|---------|
| Preview | `2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e` |
| Preprod | **Incomplete — no verified Preprod address has been supplied** |

The Preview contract was deployed in block `205339` by transaction
`492bc5bf9ff75df1d94c4977f52b8b1d9030180ffc7a812c1d4817ecb659dd70`.
The previous Preprod attempt was blocked because the faucet was unavailable. This repository
does not invent an address; the Level 3 Preprod requirement remains incomplete until a
deployment is verified against the public indexer.

## What This Does

`PrivateCounter` is a shared counter with a public rule: every increment must be between
`1` and `max_step` (`10`). The caller chooses the step locally. A Compact circuit proves
that the private witness satisfies the rule, then publishes only the resulting public state.

The frontend discovers Lace or 1AM, checks network and DUST readiness, generates the proof
through the wallet, submits the transaction, and refreshes the ledger state. Wallet rejection,
network mismatch, fee, proving, submission, indexer, and retry states are surfaced in the UI.

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

- Midnight Preview testnet and public indexer
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
| Funded Preview wallet | NIGHT must be registered and allowed time to accrue DUST |
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

The default remains the verified Preview deployment. Do not set `VITE_NETWORK_ID=preprod`
until `VITE_CONTRACT_ADDRESS` is a real Preprod address.

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

See [PROPOSAL.md](PROPOSAL.md). It intentionally contains the exact Rise In placeholders so
the project owner can provide the product, Midnight differentiation, data model, and Mainnet
feasibility answers in their own words.

## Deployment and Verification

Deploy after the target-network wallet is funded and has DUST:

```bash
export MIDNIGHT_SEED=<64-character-hex-seed>
npx --yes npm@10.9.2 run deploy -- --network preprod
```

Verify an address before documenting it:

```bash
npx --yes npm@10.9.2 run verify preview \
  2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e
```

Expected preserved Preview evidence:

```text
Network:  preview
Address:  2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e
Tx:       492bc5bf9ff75df1d94c4977f52b8b1d9030180ffc7a812c1d4817ecb659dd70
Block:    205339
Type:     ContractDeploy

Verified on-chain.
```

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

## 1-Minute Demo Checklist

1. **0:00–0:25 — Full dApp flow:** open the production site, connect Lace or 1AM, enter a
   masked step, call `increment()`, show proof/submission loading states, then show the
   transaction result and refreshed public ledger.
2. **0:25–0:45 — Tests:** show a terminal running `npx --yes npm@10.9.2 test` with all six
   tests passing, including circuit logic, state transitions, and privacy.
3. **0:45–1:00 — CI:** open this README on GitHub and show the green CI badge, then open the
   successful workflow summary.

The existing Level 2 demo remains available at
[https://youtu.be/sLYBi4SMj_U](https://youtu.be/sLYBi4SMj_U). A new Level 3 video is still
required before submission.

## Level 3 Final Checklist

| Requirement | Status |
|-------------|--------|
| 3+ tests passing | ✓ Six tests pass locally |
| CI/CD pipeline configured for push to `main` and pull requests | ✓ |
| CI/CD pipeline passing on `main` | ✗ Pending the first Level 3 workflow run |
| CI badge directly below README title | ✓ |
| Contract address in README | ✓ Verified Preview address |
| Verified Preprod contract address in README | ✗ No verified address supplied |
| Privacy Model section | ✓ |
| Privacy Claim section | ✓ |
| `PROPOSAL.md` with exact placeholder structure | ✓ |
| `PROPOSAL.md` completed by the project owner | ✗ User action |
| Production build completes with zero errors | ✓ |
| Required file structure | ✓ |
| Dedicated Level 3 live deployment | ✗ User action |
| New 1-minute Level 3 demo video | ✗ User action |
| 10+ meaningful Level 3 commits | ✓ |

**Before Rise In submission:** fill in every placeholder in `PROPOSAL.md`, deploy and verify
the contract on Preprod, update the frontend and address table, deploy the Level 3 frontend,
record the 1-minute demo, confirm the CI badge is green, and submit only after every mandatory
row above is complete.

## Preserved Level 2 Evidence

The Level 2 implementation and evidence remain intact:

- Live frontend: [agentos-level2.vercel.app](https://agentos-level2.vercel.app)
- Demo video: [youtu.be/sLYBi4SMj_U](https://youtu.be/sLYBi4SMj_U)
- Preview deployment screenshots in [`screenshots/`](screenshots/)
- Committed compiler output in [`managed/`](managed/)
- Browser proving artifacts in [`public/zk/counter/`](public/zk/counter/)

### Compile output

![Compile output](screenshots/compile.png)

### Deployed contract address

![Deploy output](screenshots/deploy.png)

### On-chain verification

![Indexer verification](screenshots/verify.png)
