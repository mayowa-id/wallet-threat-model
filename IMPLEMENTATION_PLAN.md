# Wallet Threat Model Implementation Plan

Build a threat model that maps how money moves through a reference wallet, identifies where funds or sensitive data could be at risk, and ties the highest-priority risks to controls and verification evidence.

## Reference wallet

Start with a custodial fiat wallet backed by an internal double-entry ledger and one external payment provider. This is a proposed architecture. Confirm custody, funding rails, and settlement responsibilities before drawing the model. If the intended wallet is self-custodial or on-chain, revisit the scope around key custody, signing, recovery, and network dependencies before scoring risks.

- **Flows in scope** â€” account access and recovery, deposits, wallet-to-wallet transfers, withdrawals, provider callbacks, reconciliation, and support or administrator actions that affect funds.
- **Assets to protect** â€” balances and ledger entries, transaction state, account and recovery data, provider credentials, and audit records.
- **Trust boundaries** â€” customer device to wallet API, wallet service to ledger and workers, payment provider to callback handler, and privileged staff to administrative functions.
- **Scope limits** â€” model the provider through its interfaces and documented behavior. Track jurisdiction-specific compliance and provider internals as separate work.

## Milestones

| Milestone | Work | Done when |
| --- | --- | --- |
| 1. Confirm scope | Create `docs/scope.md` with actors, assets, assumptions, dependencies, and open decisions. Identify who can initiate, approve, post, reverse, and reconcile money movement. | The custody model and authority to change balances are explicit. Unknowns have an owner and a decision date. |
| 2. Map money and data flows | Create `docs/architecture.md` with a Mermaid data-flow diagram and stable flow IDs. Map the normal flow and what happens on retries, reversals, provider timeouts, and settlement mismatches. | Every in-scope flow identifies its source, destination, data, trust boundary, and authoritative record. |
| 3. Identify and prioritize risks | Create `docs/threat-register.md`. Apply STRIDE across diagram elements and flows, then review wallet-specific failure modes involving ledger integrity, account recovery, provider events, and privileged access. | Every flow has a recorded review. Each threat links to a flow and has an impact, likelihood, rationale, and owner. |
| 4. Specify controls and evidence | Create `docs/verification.md`. Translate high and critical risks into remediation tasks with measurable acceptance criteria and an evidence location. Use synthetic transactions and mocked providers for a future reference implementation. | Every high or critical risk has a verification check and an owner. Each result is marked planned, passed, failed, or blocked, with evidence linked where available. |
| 5. Review and publish v1 | Review the model with someone who understands the ledger and provider behavior. Record treatment decisions and residual risks, then link the model documents from the repository README. | The review date, owner, scope assumptions, and unresolved risks are visible. Any accepted high or critical residual risk has a named approver and review date. |

Use [Microsoftâ€™s STRIDE guidance](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats) to classify threats and its [threat modeling walkthrough](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-getting-started) for modeling trust boundaries and flows.

## Risk scoring

Score impact and likelihood from 1 to 3 and multiply them. Use 1â€“2 for low, 3â€“4 for medium, 6 for high, and 9 for critical. Document the evidence behind each score and revisit uncertain ratings when an assumption is resolved.

- **Impact** â€” 1 for limited disruption without financial loss, 2 for material but recoverable customer harm or operational disruption, and 3 for irreversible loss of funds, broad ledger corruption, or major exposure of sensitive data.
- **Likelihood** â€” 1 when uncommon conditions or multiple independent control failures are required, 2 when plausible under expected operating conditions, and 3 when the scenario is readily reachable or commonly triggered.
- **Register fields** â€” threat ID, flow and asset IDs, STRIDE category, risk scenario, initial score and rationale, existing control and evidence, proposed control, owner, verification ID, residual score, and disposition.

## First verification priorities

| Risk area | Control to specify | Verification evidence |
| --- | --- | --- |
| Duplicate or inconsistent money movement | Make posting atomic and idempotent. Enforce balanced entries and available-funds checks. | Repeated requests produce one balanced posting. Concurrent withdrawals cannot together exceed available funds. |
| Incorrect settlement or transaction state | Authenticate provider events, validate state transitions, and reconcile provider records with ledger postings. | Invalid events leave the ledger unchanged. A synthetic settlement discrepancy is surfaced and stays open until resolved. |
| Account takeover through recovery | Invalidate superseded recovery credentials and require fresh authorization for sensitive actions. | Superseded credentials are rejected. Withdrawal and payout-detail changes require fresh authorization after recovery. |
| Unauthorized staff adjustments | Require explicit permission and independent approval for sensitive ledger adjustments. Record actor, approver, and reason. | A single staff actor cannot complete an adjustment that requires independent approval. An approved adjustment has a complete audit record. |

## Working order

Start with the custody decision and scope, then model a single withdrawal from customer authorization through ledger posting and provider settlement. Use that flow to write the first threat records and verification criteria before extending the model to the remaining flows. The first release is the reviewed model and evidence plan. A runnable wallet or test harness can follow once the architecture is agreed.

Update affected flows, threats, and verification criteria when custody, recovery, privileged access, ledger behavior, or provider integrations change.
