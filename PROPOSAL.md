# Product Proposal

## What is the product, and who uses it?

**Chosen Level 3 idea: Private Allowlist Access.**

AgentOS Private Access lets an organization authorize AI agents for a protected action without
publishing which agent is on the allowlist. An administrator creates a policy for a resource,
such as approving invoices, reading a private workspace, or invoking a production tool. Each
approved agent receives a private membership credential. When the agent requests access, it
proves in zero knowledge that its credential belongs to the current allowlist.

The primary users are enterprise AI teams:

- Security administrators define resources and maintain their allowlists.
- Agent operators hold credentials locally and request access on an agent's behalf.
- Auditors verify that every accepted action satisfied the published policy without receiving
  the agent's identity or credential.

## Why Midnight specifically?

A transparent chain can make an allowlist tamper-evident, but checking it normally reveals the
member's wallet or identifier. That creates a permanent map of which internal agent can access
which business system.

Midnight separates the public policy from the private proof material. The contract can publish
an allowlist Merkle root and accept a proof built from a private credential and Merkle path.
The network learns that the requester is a valid member of the current allowlist, but not which
member proved it. Only the minimum audit result is disclosed. A resource-scoped nullifier can
be published when replay prevention is needed without exposing the underlying credential.

This selective disclosure is the product requirement, not an optimization: organizations need
verifiable access control without turning their internal permission graph into public data.

## Data Model

| Data Point | Type | Disclosed To |
|------------------|----------------|--------------|
| Policy ID and resource label | Public ledger | Everyone |
| Current allowlist Merkle root | Public ledger | Everyone |
| Accepted-access counter | Public ledger | Everyone |
| Agent membership credential | Private witness | Credential holder only |
| Agent secret key | Private witness | Credential holder only |
| Merkle membership path | Private witness | Prover only |
| Resource-scoped nullifier | Selectively disclosed ledger value | Everyone, only when replay protection is enabled |
| Membership proof result | Zero-knowledge proof | Verifiers learn only that membership is valid |

## Mainnet Feasibility

This is realistic for a Level 6 Mainnet candidate if the first release stays focused on
membership proof and policy rotation rather than becoming a full enterprise identity system.

- **Level 4:** replace the counter primitive with a Merkle-root allowlist contract, membership
  witness, domain-separated credential commitment, and resource-scoped nullifier.
- **Level 5:** add administrator policy rotation, revocation tests, multi-resource UI, recovery
  guidance, and an external security review of witness and nullifier handling.
- **Level 6:** run a small pilot with non-financial agent permissions, publish an operational
  threat model, complete testnet load and failure testing, and deploy only after the Compact
  and Midnight.js versions are pinned and audited.

Mainnet scope would initially prove access eligibility and record a minimal audit event. Secret
distribution, enterprise directory synchronization, and high-value financial authorization
would remain off-chain integrations until separately reviewed.
