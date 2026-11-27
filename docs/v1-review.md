# Wallet threat model v1 review

Status as of November 27, 2026: ready for reviewer assessment. The reference implementation uses synthetic inputs and in-memory state.

## Verification evidence

- Reviewed candidate: `1e6457a` on `account-recovery`.
- Local run on November 27, 2026: 17 passed, 0 failed. Run `node --test 'reference/*.test.mjs'` with Node.js 22 to repeat it.
- [Verification results](verification.md#reference-implementation-results) map reference evidence and remaining coverage to V1 through V10. Add the hosted workflow run for the revision selected for release.

## Decisions to record

| Review area | Reviewer | Checks | Open decision |
| --- | --- | --- | --- |
| Identity | Pending assignment | V1, V2 | Confirm identity assurance, recovery delivery, and the requirements for durable session revocation and redaction. |
| Ledger | Pending assignment | V4, V9 | Confirm transaction invariants, storage and concurrency requirements, and independent approval for balance adjustments. |
| Payments | Pending assignment | V3, V5–V8, V10 | Confirm the custody model, provider settlement and payout guarantees, and operational thresholds for alerts. |

For each review, record the reviewer name, date, reviewed revision, evidence, and findings. For each open item in the [threat register](threat-register.md), record its treatment, owner, and follow-up evidence. Record an approver and review date for any accepted high or critical residual risk. Review and acceptance decisions are pending.
