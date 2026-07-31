# Product Proposal

## What is the product, and who uses it?

**AgentOS is the private control plane for autonomous AI operations.**

Companies want AI agents to do real work: pay invoices, review code, deploy software, manage
cloud resources, handle employee operations, and coordinate work across SaaS tools. The
blocker is not model capability; it is control. Giving an agent unrestricted credentials and
trusting a mutable application log is not an acceptable security model.

AgentOS gives each agent an identity, a job description, scoped permissions, private memory,
secure access to secrets, and an accountable manager. A task is decomposed into actions, and
each action must satisfy the organization's policy before the relevant connector can execute
it. Authority can be limited by resource, environment, role, amount, time window, counterparty,
or required human approval.

Payment-focused agent wallets demonstrate the demand for scoped, revocable authority over
money. AgentOS expands that control-plane model to the rest of an organization's operations:

- A **Finance Agent** can reconcile invoices and prepare payments but cannot exceed a private
  spending limit or pay an unapproved counterparty.
- A **Developer Agent** can open pull requests and deploy staging but cannot access production
  or reveal repository secrets.
- An **HR Agent** can prepare onboarding tasks while proving eligibility without exposing
  employee records to unrelated agents.
- An **Operations Agent** can coordinate Slack, Notion, Linear, cloud, and vendor workflows
  within a bounded set of permissions.

The users are companies adopting AI agents, the security and platform teams that govern them,
operators who approve sensitive work, and auditors who need evidence that policy was followed.
AgentOS is model-agnostic and connector-agnostic: payment is one operational surface, not the
entire product.

The current `PrivateCounter` dApp is the smallest working version of the policy engine. Its
public `max_step` is a policy boundary, its private `secret_step` is an agent action, and its
zero-knowledge proof demonstrates that the action stayed within policy without sending the
private input to the network.

## Why Midnight specifically?

Agent operations combine two requirements that are difficult to satisfy together:

1. The organization needs durable, independently verifiable proof that an agent followed its
   policy.
2. The policy evaluation must not expose the sensitive data used to make that decision.

A transparent chain can make an audit record immutable, but it would expose the organization's
permission graph, spending limits, transaction amounts, customer data, internal resource names,
and agent activity. A conventional private database can hide those details, but the same party
that operates it can alter policies or logs after the fact.

Midnight provides the missing separation. Compact circuits can enforce public policy
commitments against private witnesses, while zero-knowledge proofs reveal only the approved
result. An agent can prove that a payment is below its limit, a deployment targets an allowed
environment, or an employee satisfies an eligibility rule without publishing the amount,
environment credential, or employee record. `disclose()` makes every movement from private
input to public state explicit and reviewable.

The resulting audit trail records that a valid policy authorized an action, not all of the
organization's underlying secrets. Different stakeholders can receive different disclosures:
the public can verify the proof, an internal auditor can receive an action receipt, and the
operator can retain the full private context. That selective disclosure is the reason AgentOS
belongs on Midnight rather than a transparent chain.

## Data Model

| Data Point | Type | Disclosed To |
|------------------|----------------|--------------|
| Agent identity commitment | Public ledger | Everyone sees the commitment, not the agent identity |
| Policy commitment and version | Public ledger | Everyone |
| Workflow/action commitment | Public ledger | Everyone sees a hash, not the action details |
| Policy proof result | Zero-knowledge proof | Everyone learns only that the action satisfied policy |
| Resource-scoped nullifier | Public ledger | Everyone; prevents replay without revealing the secret |
| Action status and timestamp | Public ledger | Everyone, when the workflow requires a public audit event |
| Agent identity and role | Private witness | Agent operator and authorized organization systems |
| Action details and parameters | Private witness | The executing agent and authorized approvers |
| Spending amount, limit, or eligibility value | Private witness | The holder; only the constraint result is proved |
| API keys, wallet keys, and connector tokens | Encrypted off-chain secret | Authorized connector only; never written on-chain |
| Private memory and customer context | Encrypted off-chain state | Authorized agent workflow only |
| Detailed execution receipt | Selectively disclosed record | Operator, approver, and designated auditors |
| Aggregated compliance metrics | Selectively disclosed output | Organization or regulator, according to policy |

## Mainnet Feasibility

AgentOS is feasible as a focused Mainnet product by Level 6 if it starts as a policy and audit
layer rather than attempting to replace every identity provider, wallet, and SaaS platform.
Existing tools remain the systems of execution; AgentOS controls what agents may ask them to do.

- **Level 4 — Policy engine:** evolve `PrivateCounter` into an Agent Policy contract with
  domain-separated agent commitments, versioned policies, private action witnesses, replay
  protection, and selectively disclosed action receipts. Implement one end-to-end operational
  workflow, likely a capped payment or staging deployment.
- **Level 5 — Operational control plane:** add agent registration, human approval thresholds,
  revocation, policy rotation, encrypted private state, and a small connector SDK. Demonstrate
  coordinated Finance, Developer, and Operations agents in a test environment.
- **Level 6 — Mainnet candidate:** narrow the first production release to low-risk, bounded
  actions; complete threat modeling and external review of circuits, witnesses, nullifiers,
  secret handling, and recovery; run failure and load tests; then pilot with a small number of
  organizations before expanding connector scope.

The first Mainnet release would not custody arbitrary user secrets or grant agents unrestricted
production access. It would prove policy compliance for explicitly bounded actions and emit
minimal audit evidence. Higher-risk financial custody, autonomous production changes, and
regulated HR decisions would remain approval-gated until separately audited.
