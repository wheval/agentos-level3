# Product Proposal

## What is the product, and who uses it?

**AgentOS is the private control plane for trustworthy autonomous AI.**

As AI agents move from answering questions to performing consequential work, organizations
face a control problem. Agents can pay invoices, manage cloud resources, review code, operate
SaaS tools, and collaborate with other agents, but the common security model is still to hand
them broad credentials and trust mutable application logs. The barrier is no longer model
intelligence. It is the safe delegation of authority.

AgentOS gives every agent a distinct identity, a clear job description, scoped permissions,
private memory, and an accountable human manager. Tasks are decomposed into discrete actions,
and each action must satisfy organizational policy before a connector can execute it. Authority
can be constrained by resource, environment, role, amount, time window, counterparty, or a
required human approval. AgentOS is model-agnostic and connector-agnostic, so organizations can
use their existing models, orchestration frameworks, wallets, clouds, and SaaS tools.

### Payments and credentials first

AgentOS begins with the highest-stakes operational surface: money and secrets. Its first product
layer is a hardened **Credential and Payment Vault** for wallets, payment instruments, API keys,
cloud credentials, and other sensitive material.

Agents never receive long-lived raw credentials. They request authority for one specific
action. After policy evaluation—and human approval when required—the vault issues or uses a
scoped, short-lived capability such as a one-time token, bounded signature, or limited payment
authorization. The capability is restricted to the approved resource, amount, counterparty,
and time window, then expires or is revoked. The intended production architecture separates
policy approval from secret custody so neither an agent nor a single application service can
silently grant itself unrestricted authority.

This payment- and credential-first wedge establishes trust where failure is most expensive:

- A **Finance Agent** can reconcile invoices and prepare a payment, but cannot exceed a private
  limit, pay an unapproved counterparty, or bypass a required approver.
- A **Developer Agent** can open pull requests and deploy staging, but receives no reusable
  production credential and cannot reveal repository secrets.
- An **HR Agent** can coordinate onboarding while exposing only the employee facts required for
  each step.
- An **Operations Agent** can work across Slack, Notion, Linear, cloud, and vendors using
  connector capabilities that are narrow, revocable, and auditable.

### Governed agent-to-agent operations

Real workflows involve several agents. A Finance Agent may ask Operations to verify a vendor,
hand a payment receipt to HR during onboarding, or escalate an exception to a Manager Agent.
AgentOS mediates these handoffs through authenticated, policy-governed channels.

An agent can share only the data and authority permitted by its role and the current workflow.
Private memory remains compartmentalized. A handoff of data, credentials, or delegated authority
is treated as another policy-controlled action, with its own approval and audit commitment.
This makes multi-agent coordination accountable instead of creating an opaque chain of
unchecked delegation.

The users are companies adopting AI agents, security and platform teams defining policy,
operators approving sensitive work, and auditors verifying that actions complied with policy.
Payment is the first proving ground, but AgentOS is the operating layer for general agent work.

The current `PrivateCounter` dApp is the smallest working version of this policy engine. Its
public `max_step` is a policy boundary, its private `secret_step` is an agent action, and its
zero-knowledge proof demonstrates that the action stayed within policy without transmitting
the private input to the network.

## Why Midnight specifically?

AgentOS must provide durable evidence that policy was followed without exposing the sensitive
inputs used to make that decision.

A transparent chain could make an audit event immutable, but it would expose the organization's
permission graph, spending limits, transaction amounts, customer data, internal resources, and
agent activity. A conventional private database can hide those details, but the operator can
alter its policies or logs after the fact.

Midnight provides the missing separation. Compact circuits can enforce public policy
commitments against private witnesses, while zero-knowledge proofs reveal only the approved
result. An agent can prove that:

- a payment is within its private limit and targets an approved counterparty;
- a credential request is within its role and environment;
- a deployment targets an allowed system;
- an employee or vendor satisfies an eligibility rule; or
- an agent-to-agent delegation does not exceed the sender's authority;

without publishing the amount, credential, role, environment secret, employee record, or
private message. `disclose()` makes every movement from private input to public state explicit
and reviewable.

Midnight is the policy and proof layer, not a place to store raw enterprise secrets. Wallet
keys, API tokens, customer context, and private memory remain encrypted off-chain in the vault.
The on-chain contract stores policy and action commitments, proof results, and replay protection.
The vault releases or uses a capability only after the required policy proof and approvals are
present.

This creates selective auditability. The public can verify that a valid policy authorized an
action. An internal auditor can receive a detailed execution receipt. An operator can retain
the full private context. Unrelated agents and observers learn nothing beyond the disclosure
their role requires.

## Data Model

| Data Point | Type | Disclosed To |
|------------------|----------------|--------------|
| Agent identity commitment | Public ledger | Everyone sees the commitment, not the identity |
| Policy commitment and version | Public ledger | Everyone |
| Workflow/action commitment | Public ledger | Everyone sees a hash, not the action details |
| Policy proof result | Zero-knowledge proof | Everyone learns only that the action satisfied policy |
| Resource-scoped nullifier | Public ledger | Everyone; prevents replay without revealing the secret |
| Minimal action status and timestamp | Public ledger | Everyone, when a public audit event is required |
| Agent identity, role, and job description | Private witness | Agent operator and authorized organization systems |
| Action details and parameters | Private witness | Executing agent and authorized approvers |
| Spending amount, private limit, or eligibility value | Private witness | Holder; only the constraint result is proved |
| Wallet keys, API keys, and connector tokens | Encrypted off-chain vault secret | Authorized vault operation only; never written on-chain |
| Scoped ephemeral capability | Short-lived private authorization | Approved connector for one bounded action |
| Private memory and customer context | Encrypted off-chain state | Authorized workflow only |
| Agent-to-agent message body | Encrypted off-chain message | Intended receiving agent only |
| Agent-to-agent handoff commitment | Public ledger or private audit log | Auditor sees proof of authorized handoff, not message content |
| Delegated authority | Private capability with public commitment | Receiving agent gets only the bounded authority |
| Detailed execution receipt | Selectively disclosed record | Operator, approver, and designated auditors |
| Aggregated compliance metrics | Selectively disclosed output | Organization or regulator according to policy |

## Mainnet Feasibility

AgentOS is feasible as a focused Mainnet product by Level 6 if it begins as a policy, vault,
and audit layer instead of replacing every identity provider, wallet, and SaaS platform.
Existing tools remain the systems of execution; AgentOS governs what agents may ask them to do.

- **Level 4 — Payment and credential policy:** evolve `PrivateCounter` into an Agent Policy
  contract with domain-separated agent commitments, versioned policies, private action
  witnesses, replay protection, and selectively disclosed receipts. Deliver one end-to-end
  Finance Agent flow for a capped payment with counterparty and approval constraints.
- **Level 5 — Vault and multi-agent control plane:** integrate a non-custodial or
  threshold-controlled credential vault, short-lived connector capabilities, human approvals,
  revocation, policy rotation, encrypted private state, and authenticated agent-to-agent
  handoffs. Add staging deployment and onboarding workflows alongside payments.
- **Level 6 — Mainnet candidate:** narrow the production release to low-risk, bounded actions;
  complete threat modeling and external review of circuits, witnesses, nullifiers, vault
  isolation, capability issuance, recovery, and connector security; run failure and load tests;
  then pilot with a small number of organizations before expanding authority.

The first Mainnet release would not custody arbitrary secrets in the Midnight contract or give
agents unrestricted production access. It would prove policy compliance for explicitly bounded
actions, use encrypted external custody for credentials, and emit only the audit evidence each
stakeholder is allowed to see. High-value transfers, autonomous production changes, and
regulated HR decisions would remain approval-gated until separately audited.
