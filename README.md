# AgentOS — PrivateCounter

> A counter whose step size is chosen privately and proved to sit inside an on-chain policy bound, without the step ever being published.

This is the **Level 2** repo of the Midnight Builder Challenge: the Level 1 contract plus a
web frontend that connects a wallet and calls the circuit with proving done in the browser.
The contract, tests and deployment from Level 1 live here too, and unchanged, so this repo
stands on its own. Level 1 is submitted separately from
[`wheval/agentos`](https://github.com/wheval/agentos).

## Live Demo

**<!-- PASTE VERCEL URL HERE -->** _(deploy with `vercel --prod`, then paste the URL here)_

The web app connects a Midnight wallet, takes a secret step value, generates the
zero-knowledge proof **in your wallet on your own machine**, and submits the resulting
transaction to the Preview contract below. The step you type is never sent anywhere.

## Contract Address

| Network | Address |
| ------- | ------- |
| Preview | `2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e` |
| Preprod | _not deployed — the Preprod faucet was down_ |

Deployed in block 205339, transaction `492bc5bf9ff75df1d94c4977f52b8b1d9030180ffc7a812c1d4817ecb659dd70`.

Verify it yourself against the public indexer — no local setup required:

```bash
npm run verify preview 2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e
```

The frontend reads `VITE_CONTRACT_ADDRESS` and defaults to the Preview address above.

This app runs on Preview because the Preprod faucet was not dispensing test tokens, and a
deploy cannot proceed without a funded wallet. Nothing here is Preview-specific —
`scripts/deploy.ts` already accepts `--network preprod`, so moving over is one command plus
updating `VITE_CONTRACT_ADDRESS` and `VITE_NETWORK_ID`.

## What This Does

`PrivateCounter` is a shared counter with a rule attached: every increment must be at
least 1 and at most `max_step`.

The twist is where the step size lives. It is never sent to the network as a circuit
argument. It stays on the caller's own machine as a witness, and the zero-knowledge proof
is what convinces the chain that the rule was followed. Observers watching the ledger see
the counter move and the running total change — they never see which step any individual
caller chose.

That is the pattern AgentOS is built around: an autonomous agent acts under a policy, the
policy is enforced cryptographically rather than by trust, and the agent's inputs stay
private while the outcome stays auditable.

## Privacy Model

**PUBLIC — written to the ledger, readable by anyone**

| Field | Meaning |
| ----- | ------- |
| `round` | How many times `increment()` has been accepted |
| `total` | Running total of every accepted step |
| `max_step` | Largest step the contract accepts (write-once, set at deploy) |

**PRIVATE — a witness supplied by the caller's machine**

- `secret_step()` — the step size. It is not a circuit argument, it is not stored on the
  ledger, and it is not in the transaction. Only the proof sees it.

**PROVED WITHOUT REVEALING THE STEP**

- `1 <= secret_step() <= max_step`

**Where `disclose()` comes in**

The contract writes two ledger fields, and only one of them needs `disclose()`:

```compact
round = (round + 1) as Uint<64>;              // derived from public state only
total = disclose((total + step) as Uint<64>); // derived from the private witness
```

`round` counts public events, so the compiler accepts it as-is. `total` is computed from
the witness, so the compiler refuses to write it until it is wrapped in `disclose()`. That
single call is the deliberate, auditable point where private data is allowed to move the
public state. Removing it is a compile error, not a silent leak — which is the point.

Note that `total` leaks strictly less than the step itself. After N rounds an observer
knows the sum, not the individual contributions.

## Privacy Claim

A precise statement of what this does and does not hide.

**What an on-chain observer sees**

- That a transaction called `increment()` on this contract.
- The new `round` and the new `total` after the call.
- The declared policy bound `max_step = 10`.
- A zero-knowledge proof that verifies against the circuit's verifier key.

**What an on-chain observer does not see**

- The witness value itself. `secret_step()` is not a circuit argument, so it never appears
  in the transaction payload, is never sent to any server, and is never written to the
  ledger. The only thing derived from it that reaches the chain is the updated `total`.
- Anything about the caller's choice beyond what the proof asserts.

**What the caller proves without revealing it**

- `1 <= secret_step() <= max_step` — the step obeys the published policy.

**The honest caveat**

`total` is public before and after the call. An observer who watches a single transaction
in isolation can subtract the two totals and recover that step. So the guarantee here is
about the **input channel**, not about unlinkability:

- The step is never *transmitted*. It exists only on the caller's machine and inside the
  proof.
- Correctness is enforced by the circuit, so the network never has to be trusted with the
  value in order to check the rule.
- The UI never displays, logs, or persists it — the input is masked and cleared after each
  call.

Hiding the delta as well is a contract-level change (a commitment or a shielded balance
rather than a plaintext running total), not a frontend one. This repo does not claim it.

## Tech Stack

- **Midnight Network** — Preview / Preprod testnets
- **Compact** — language version 0.23, compiler 0.31.1, runtime 0.16.0
- **Midnight.js** — `@midnight-ntwrk/midnight-js` 4.1.x for deployment and circuit calls
- **DApp Connector API** — `@midnight-ntwrk/dapp-connector-api` 4.0.1 for browser wallets
- **React 18 + Vite 5** — frontend, with WASM and top-level-await plugins
- **Lace wallet** — Midnight browser extension; does the proving on-device
- **Node.js** v22+
- **Docker** — runs the local proof server (deployment only; the browser proves in-wallet)
- **Vitest** — contract test suite

## Prerequisites

| Requirement | Notes |
| ----------- | ----- |
| Node.js v22+ | `node --version` |
| Lace wallet | Midnight browser extension, holding tNIGHT **registered for DUST generation** — DUST pays transaction fees |
| Docker | Runs the proof server |
| Compact toolchain | Installed via the Midnight `compact` version manager, **not** npm |
| Proof server | `midnightntwrk/proof-server` on port 6300 — used by the deploy script, and by Lace when it proves in the browser |
| Funded testnet wallet | Only needed to deploy, not to build or test |

> **Calling the circuit needs DUST.** Fees on Midnight are paid in DUST, which
> accrues from NIGHT you already hold rather than being sent to you — a wallet
> can show a healthy tNIGHT balance and still be unable to submit. If Lace shows
> `0 / 0 tDUST`, register your tNIGHT for DUST generation in the wallet and give
> it a few minutes. The app checks this before proving and tells you which of
> those states you are in.


Install the Compact toolchain:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update
compact --version
```

Start the proof server:

```bash
docker pull midnightntwrk/proof-server:latest
docker run -d --name midnight-proof-server -p 6300:6300 \
  midnightntwrk/proof-server:latest midnight-proof-server -v
```

## Setup

```bash
git clone https://github.com/wheval/agentos-level2.git
cd agentos-level2
npm install
npm run compile
```

`npm run compile` runs `compact compile contracts/counter.compact managed`, which
regenerates `managed/` from scratch:

```
managed/
├── compiler/contract-info.json   circuit + witness + ledger metadata
├── contract/index.js, index.d.ts TypeScript bindings
├── keys/increment.prover         proving key
├── keys/increment.verifier       verifying key
└── zkir/increment.zkir           circuit intermediate representation
```

`managed/` is committed to this repo so the compiled artifacts can be reviewed without
installing the toolchain.

## Run Locally

```bash
git clone https://github.com/wheval/agentos-level2.git
cd agentos-level2
npm install
npm run dev          # http://localhost:5173
```

That is all that is needed to run the web app — no Docker and no proof server, because
proving happens inside the Lace extension. Install
[Lace](https://www.lace.io/) first, or the app will show an install prompt instead of a
connect button.

To point the app at a different deployment, create a `.env.local`:

```bash
VITE_CONTRACT_ADDRESS=2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e
VITE_NETWORK_ID=preview
```

### How the frontend is wired

The browser needs the same proving artifacts the compiler produced, served over HTTP:

```bash
npm run sync:zk   # managed/{keys,zkir} -> public/zk/counter/
```

`FetchZkConfigProvider` then loads `/zk/counter/keys/increment.prover`,
`.../increment.verifier` and `/zk/counter/zkir/increment.bzkir`. Those files are committed,
so a fresh clone builds without the Compact toolchain installed. Re-run `sync:zk` after any
`npm run compile`.

| File | Role |
| ---- | ---- |
| `src/lib/config.ts` | Contract address, network id, ZK asset path |
| `src/lib/wallet.ts` | Discovers wallets on `window.midnight`, normalises connector errors |
| `src/lib/providers.ts` | Bridges the wallet's connector API to Midnight.js providers |
| `src/hooks/useMidnight.ts` | Connect / disconnect / call state machine |
| `src/components/WalletConnect.tsx` | Connect UI, address display, error states |
| `src/components/CircuitCall.tsx` | Secret input, proving state, transaction result |

Private state is held in memory only. Nothing about the step is persisted, and a page
reload discards it.

## Run Tests

```bash
npm test              # contract test suite (Vitest)
npm run test:artifacts # committed artifacts match the contract source
npm run typecheck     # TypeScript
```

`npm test` runs five tests against the compiled circuit through the Compact simulator:

| Test | Covers |
| ---- | ------ |
| Initialises public ledger state from the constructor | Initial state |
| Advances public state by the private step on each increment | Circuit logic + state transitions |
| Rejects steps outside the publicly declared policy bound | Policy enforcement |
| Never writes the private step into the public ledger | Privacy guarantee |
| Produces identical public state for different private step sequences | Privacy guarantee |

The frontend is covered by `npm run build`, which typechecks the whole project and then
produces a production bundle. CI runs it on every push.


## Deploy

```bash
export MIDNIGHT_SEED=<64-character hex seed>
npm run deploy -- --network preview   # or --network preprod
```

The script derives the wallet, prints the unshielded address, waits for faucet funds,
registers NIGHT UTXOs for DUST generation, then deploys and prints the contract address.

Syncing the wallet holds the scanned history in memory. On preprod that overruns Node's
default ~4 GB heap and aborts with `Ineffective mark-compacts near heap limit`, so the
`deploy` script raises the limit to 12 GB. Invoke it through `npm run deploy` rather than
calling `tsx scripts/deploy.ts` directly, or you will hit that crash.

Faucets: [Preview](https://faucet.preview.midnight.network/) ·
[Preprod](https://faucet.preprod.midnight.network/)

A faucet can be down independently of the chain itself, and the UI only shows a generic
"Services are currently unavailable". Check its health endpoint to see the real reason:

```bash
curl -s https://faucet.preprod.midnight.network/api/health
```

## Deploy the Frontend

The repo ships a `vercel.json`. From a clean checkout:

```bash
npm i -g vercel
vercel login
vercel link          # first time only
vercel --prod
```

Then paste the resulting URL into the **Live Demo** section above.

The config matters in one specific way: the SPA rewrite deliberately excludes `/zk/*` and
`/assets/*`.

```json
{ "source": "/((?!assets/|zk/).*)", "destination": "/index.html" }
```

Without that exclusion, a request for `increment.prover` would fall through to
`index.html`, and `FetchZkConfigProvider` would reject the `text/html` response instead of
loading the proving key. Any other host works too, as long as the ZK artifacts are served
as real files.

## Verify the Deployment

You do not have to take the address in this README on trust. Read it back from the
Midnight indexer yourself:

```bash
npm run verify
```

```
Network:  preview
Address:  2c5b229e9092c0726cafcc7b856ef2f0ae301e25b3eb97b63881ed715fb2fe4e
Tx:       492bc5bf9ff75df1d94c4977f52b8b1d9030180ffc7a812c1d4817ecb659dd70
Block:    205339
Type:     ContractDeploy

Verified on-chain.
```

## Project Structure

```
agentos/
├── contracts/counter.compact   the Compact contract
├── contracts/witnesses.ts      witness implementation shared by tests, deploy and web
├── managed/                    compiler output (committed)
├── public/zk/counter/          proving artifacts served to the browser
├── scripts/compile.sh          compile wrapper
├── scripts/deploy.ts           testnet deployment
├── scripts/verify.sh           reads the deployment back from the indexer
├── scripts/sync-zk-assets.sh   copies managed/ artifacts into public/
├── src/
│   ├── components/
│   │   ├── WalletConnect.tsx   wallet connect / disconnect UI
│   │   └── CircuitCall.tsx     circuit call button and result display
│   ├── hooks/useMidnight.ts    Midnight.js SDK hook
│   ├── lib/                    config, wallet discovery, provider wiring
│   ├── shims/                  browser stand-ins for two Node-only imports
│   ├── App.tsx
│   └── main.tsx
├── tests/counter.test.ts       contract test suite
├── .github/workflows/ci.yml    CI
├── vercel.json                 frontend hosting config
├── vite.config.ts
└── README.md
```

## Initial Idea

**AgentOS — the control center for enterprise AI teams.**

Companies want AI agents doing real work: paying invoices, reviewing code, managing
operations. What stops them is trust. Nobody wants to hand an autonomous agent their API
keys, customer data, bank access, or production systems and simply hope it behaves.

AgentOS gives every agent an identity, scoped permissions, private memory, secure secrets,
and a manager. Think of it as an ID badge and a job description for each AI employee:

- **Finance Agent** — pays invoices, reads email, generates reports. Cannot move more than $5k.
- **Developer Agent** — opens PRs, reviews code, deploys staging. Cannot touch production.
- **HR Agent** — handles leave and contracts. Cannot see engineering or finance.
- **Operations Agent** — runs Slack, Notion, Linear. Cannot reach sensitive data.

Agents collaborate. "Hire a developer" fans out: HR drafts the contract, Finance checks
budget, Legal reviews, Operations provisions tools. Every step is checked against policy
before it runs.

**Why this needs Midnight.** Policy enforcement is only worth something if the policy
itself can't be quietly rewritten, and if checking it doesn't require handing over the very
secrets you're protecting. Midnight gives us both: the policy bound lives on-chain where
tampering is visible, and the agent proves compliance in zero knowledge instead of
disclosing its inputs. The audit trail is cryptographic, not a log file somebody can edit.

**Where this Level 1 contract fits.** `PrivateCounter` is the smallest honest version of
that mechanism. `max_step` is a policy bound published on-chain. `secret_step` is an
agent's private input that never leaves its machine. `increment()` is the agent acting: it
proves `1 <= step <= max_step` without revealing `step`, and the single `disclose()` call
marks the exact, auditable point where private data is permitted to affect public state.

Swap the counter for a payment and `max_step` for a spending limit and you have the Finance
Agent: an agent that can prove it stayed under budget without publishing what it spent.
That is the primitive the rest of AgentOS is built on.

## Demo Video

**<!-- PASTE VIDEO LINK HERE -->**

What the recording shows, in order:

1. Connecting Lace — the wallet address appears on screen.
2. Entering a secret step and pressing **Increment counter** — the button switches to
   *Generating proof…* while the wallet proves locally.
3. The transaction id and the updated public `round` / `total` after submission.
4. The step field stays masked and empties itself — the value never appears in the UI, the
   console, or the transaction.

## Screenshots

### Compile output

`npm run compile` producing the `managed/` artifacts:

![Compile output](screenshots/compile.png)

### Deployed contract address

`npm run deploy -- --network preview` returning the Preview address:

![Deploy output](screenshots/deploy.png)

### On-chain verification

The deployment read back from the Midnight Preview indexer:

![Indexer verification](screenshots/verify.png)
