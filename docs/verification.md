# Control verification

Run these checks against a future reference implementation with synthetic accounts, mocked provider responses, and an isolated datastore. Track the result, build revision, execution date, and evidence beside each check. Proposed evidence paths are relative to the repository root.

| Check | Threat | Owner | Acceptance criteria | Status | Evidence path |
| --- | --- | --- | --- | --- | --- |
| V1 | T1 | Identity | After recovery, superseded credentials and sessions fail. Withdrawal and destination changes require fresh authorization. | Planned | `evidence/V1.md` |
| V2 | T2 | Identity | Synthetic recovery credentials are absent from captured logs and diagnostics. A staff role without recovery privileges cannot read recovery records. | Planned | `evidence/V2.md` |
| V3 | T3 | Payments | Duplicate valid confirmations produce one credit. Mismatched amount, currency, or reference leaves the wallet balance unchanged. | Planned | `evidence/V3.md` |
| V4 | T4 | Ledger | Retrying the same request produces one balanced journal. Reusing the identifier with different details is rejected. Competing debits cannot exceed the starting available balance. | Planned | `evidence/V4.md` |
| V5 | T5 | Payments | A change to a payout's authorized amount, currency, or destination prevents submission under the original approval. | Planned | `evidence/V5.md` |
| V6 | T6 | Payments | A timeout leaves the hold intact. After recovery from interruption, the same payout retains its provider identifier. Verified success or terminal failure applies exactly one local outcome. | Planned | `evidence/V6.md` |
| V7 | T7 | Payments | Unauthenticated and mismatched events leave financial state unchanged. Repeated valid events yield one eligible update. Conflicting outcomes raise an exception. | Planned | `evidence/V7.md` |
| V8 | T8 | Finance operations | Missing or mismatched settlement records create an open exception. Reprocessing the same discrepancy does not create another open exception. Any balance correction links to an approved journal entry. | Planned | `evidence/V8.md` |
| V9 | T9 | Finance operations | An unauthorized role or self-approval cannot post an adjustment. An approved posting is traceable to its initiator, approver, reason, and journal ID. | Planned | `evidence/V9.md` |
| V10 | T10 | Payments | Simulated worker backlog and missing settlement inputs trigger alerts within documented thresholds. Catch-up processing preserves deduplication. | Planned | `evidence/V10.md` |

Once a check runs, record it as passed, failed, or blocked and link its evidence. Reassess residual risk after reviewing the results. Record any accepted high or critical residual risk with a named approver and review date.

## Reference implementation results

Run `node --test reference/wallet.test.mjs` from the repository root with Node.js 22. The run on 2026-11-23 used Node.js 22.13.1 and the local working tree. All five assertions groups passed. The full checks in the table remain planned.

| Check | Evidence from this run | Remaining coverage |
| --- | --- | --- |
| V4 | One balanced posting on retry, rejection of changed operation details, and shared available funds across competing transfers and holds. | Datastore-backed concurrency and atomicity across workers. |
| V5 | A held operation retains its original amount and destination. | Authorization bound to the customer and payout currency. |
| V6 | The mock returns an ambiguous result without releasing the hold. A retry uses the same identifier. Settlement posts once and terminal failure releases once. | Persistence across process restarts and provider guarantees for deduplication and outcome resolution. |

The runnable cases are in [wallet.test.mjs](../reference/wallet.test.mjs). The reference uses in-memory state, one implicit currency, and a mocked provider.
