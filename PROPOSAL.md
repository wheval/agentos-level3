# Product Proposal

## What is the product, and who uses it?

**AgentOS is the private control plane for autonomous AI agents.**

As AI agents move from answering questions to performing real work — paying for tools, calling
APIs, managing wallets, running workflows — the biggest risk is handing them broad credentials
and hoping nothing goes wrong. The barrier is no longer model intelligence. It is the safe,
private delegation of authority.

AgentOS gives every agent a distinct private identity, a clear set of permissions, private
memory, and a built-in policy engine. Tasks are broken into discrete actions, and every action
must pass policy before a connector can execute it. Authority can be limited by resource,
amount, time window, counterparty, or environment. AgentOS is model-agnostic and
connector-agnostic, so you keep using whatever models, frameworks, wallets, and tools you
already have.

### Who uses it

Individual developers, indie builders, and people running their own agents or small agent
swarms. Not enterprises, platform teams, or auditors — just builders who want their agents to
spend money and use tools without leaking budgets, secrets, or activity.

### Payments and credentials first

AgentOS starts with the highest-stakes surface: money and secrets. Its first product layer is a
hardened **Credential and Payment Vault** for wallets, payment instruments, API keys, and other
sensitive material.

Agents never receive long-lived raw credentials. They request authority for one specific
action. After the policy check, the vault issues a scoped, short-lived capability — a one-time
token, a bounded signature, or a limited payment authorization. The capability is restricted to
the approved resource, amount, counterparty, and time window, then expires.

This creates a clean private access layer:

- An agent can pay for an API call or model inference, but cannot exceed its private budget or
  pay an unapproved address.
- A coding agent can open a PR or deploy to staging, but receives no reusable production secret.
- Everything stays private by default. Only a zero-knowledge proof that "policy was followed"
  is visible.

### The web application

AgentOS ships as a full hosted web app where builders manage everything visually:

- **Dashboard** with agent overview, private balance, and recent activity.
- **Agents** to create, configure, and monitor individual agents.
- **Policy builder** for spend limits, resource restrictions, time windows, and counterparty
  rules.
- **Vault management** for credentials and payment instruments.
- **Connectors** to link external tools and services.
- **Templates** for common agent workflows.
- **Runtime controls** to run, inspect, and schedule agents.
- **Selective disclosure views** so you reveal only what you choose.

An SDK and CLI remain available for deeper integration, but the primary product experience is
the web application.

### Governed agent-to-agent operations (optional, later)

When multiple agents need to hand off work, AgentOS mediates the handoff through private,
policy-governed channels. An agent can share only the data and authority its current policy
allows, private memory stays compartmentalized, and a handoff is treated as just another
policy-controlled action. This stays simple and optional in the first version.

The current `PrivateCounter` dApp is the smallest working version of this policy engine. Its
public `max_step` is a policy boundary, its private `secret_step` is an agent action, and its
zero-knowledge proof demonstrates that the action stayed within policy without transmitting the
private input to the network.

## Why Midnight specifically?

AgentOS needs durable proof that policy was followed without exposing the sensitive inputs used
to make that decision.

A transparent chain would leak budgets, limits, and activity. A normal private database can be
altered by the operator after the fact. Midnight gives the separation:

- Compact circuits enforce public policy commitments against private witnesses.
- Zero-knowledge proofs reveal only the approved result.
- An agent can prove "this payment is within my private limit and goes to an approved
  counterparty" without publishing the amount, the full policy, or any secrets.

`disclose()` makes every movement from private input to public state explicit and reviewable.

Midnight is the policy and proof layer only. Wallet keys, API tokens, and private memory stay
encrypted off-chain in the vault. The on-chain contract stores only commitments, proof results,
and replay protection. The vault releases or uses a capability only after the required policy
proof is present.

## Data Model

| Data Point | Type | Visible to |
|------------|------|------------|
| Agent identity commitment | Public ledger | Everyone sees the commitment only |
| Policy commitment | Public ledger | Everyone |
| Action commitment | Public ledger | Hash only |
| Policy proof result | Zero-knowledge proof | Everyone learns only "policy passed" |
| Nullifier (anti-replay) | Public ledger | Everyone; prevents replay without revealing the secret |
| Agent identity and role | Private witness | You (the builder) only |
| Action details and parameters | Private witness | You and the executing agent |
| Spending amount or private limit | Private witness | You only; only the constraint result is proved |
| Wallet keys and API keys | Encrypted off-chain vault secret | Vault only; never written on-chain |
| Scoped ephemeral capability | Short-lived private authorization | Approved connector for one bounded action |
| Private memory | Encrypted off-chain state | Authorized workflow only |

## Mainnet Feasibility

AgentOS is feasible as a focused Mainnet product by staying narrow: a policy, vault, and proof
layer. Existing tools remain the systems of execution; AgentOS only governs what the agent is
allowed to ask them to do.

- **Level 4 — Payment and credential policy:** evolve `PrivateCounter` into an Agent Policy
  contract. Deliver one end-to-end flow — an agent makes a capped private payment with
  counterparty constraints. Ship the first version of the web app (dashboard, agents, and a
  basic vault).
- **Level 5 — Vault, basic multi-agent, and a fuller web app:** add a non-custodial or
  threshold-controlled vault, short-lived capabilities, revocation, and encrypted private state.
  Add simple agent-to-agent handoffs. Expand the web app with the policy builder, connectors,
  templates, and runtime views.
- **Level 6 — Mainnet candidate:** narrow the release to low-risk, bounded actions; threat-model
  the circuits and vault; then polish the full web application so any developer can create a
  private agent, set policies, and start using the vault in minutes.

The first Mainnet release will not give agents unrestricted power. It proves policy compliance
for explicitly bounded actions, keeps credentials in encrypted external custody, and keeps
high-value or irreversible actions gated until the builder chooses otherwise.

AgentOS is the private operating system for the agents you build yourself. It starts with the
Credential and Payment Vault and ships as a complete web application that gives every agent
scoped, private, provable authority — without any enterprise overhead.
