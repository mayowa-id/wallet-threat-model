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

Run `node --test 'reference/*.test.mjs'` from the repository root with Node.js 22. The local suite passed all 16 tests on Node.js 22.13.1. The full checks in the table remain planned.

| Check | Evidence from this run | Remaining coverage |
| --- | --- | --- |
| V1 | Recovery credentials are single-use, expire, and are superseded by new credentials. Recovery revokes existing sessions for the account. Destination changes and withdrawals require proof bound to the current session and exact action. See [recovery.test.mjs](../reference/recovery.test.mjs). | Production identity provider, recovery proof delivery, session expiry, and durable revocation across workers. |
| V2 | Recovery review is restricted to configured reviewers. The review record, replay error, and diagnostic inspection omit raw credentials. See [recovery.test.mjs](../reference/recovery.test.mjs). | Authenticated staff access and end-to-end redaction in HTTP, logging, and telemetry. |
| V3 | Signed deposit confirmations match the registered reference, amount, and currency before posting. Repeat confirmations produce one balanced credit. | Durable posting and the selected provider's funding finality rules. |
| V4 | One balanced posting on retry, rejection of changed operation details, and shared available funds across competing transfers and holds. | Datastore-backed concurrency and atomicity across workers. |
| V5 | A held operation retains its original amount and destination. | Authorization bound to the customer and payout currency. |
| V6 | The mock returns an ambiguous result without releasing the hold. A retry uses the same identifier. Settlement posts once and terminal failure releases once. | Persistence across process restarts and provider guarantees for deduplication and outcome resolution. |
| V7 | Invalid signatures and mismatched payouts leave the ledger unchanged. Duplicate events are suppressed. Conflicting outcomes are recorded, including when a callback arrives before the payout response. | Durable event and exception records, and validation against the selected provider's callback protocol. |
| V8 | Missing, duplicate, and mismatched settlement records produce one exception per movement per batch. A matching pair resolves the exception. Comparison leaves the journal unchanged. | Provider statement ingestion, durable exception history, and the approved adjustment workflow for balance corrections. |
| V9 | Unauthorized actors and self-approval are rejected. An independent approval posts one balanced entry recording both staff IDs, the reason, and the journal ID. Debits respect withdrawal holds. See [adjustments.test.mjs](../reference/adjustments.test.mjs). | Authenticated staff identity, durable audit storage, and linkage to reconciliation exceptions. |
| V10 | An overdue hold and a missing settlement batch alert at their configured deadlines. The payout alert distinguishes queued work from an unknown provider outcome. The alerts clear after catch-up and the retried payout posts once. See [monitoring.test.mjs](../reference/monitoring.test.mjs). | Worker scheduling, operational thresholds, persistent settlement schedules, and alert delivery. |

The health check takes a snapshot of pending payouts and expected settlement batches with their receipt times. It alerts on the first evaluation at or after the hold age limit or the batch due time plus its grace period. The test uses a 100 ms payout age limit and a 20 ms settlement grace period to exercise both boundaries with a synthetic clock.

The recovery reference stores token digests and delegates authentication and one-time proof verification to a trusted identity adapter. Customer-facing callers would route withdrawals and destination changes through `WalletAccess`. The wallet itself is the internal ledger service.

The runnable cases are in [wallet.test.mjs](../reference/wallet.test.mjs), [provider-events.test.mjs](../reference/provider-events.test.mjs), and [reconciliation.test.mjs](../reference/reconciliation.test.mjs). The reference uses in-memory state, one configured currency, and a synthetic HMAC-SHA256 callback protocol. Reconciliation expects complete ledger and provider snapshots for the same batch.
