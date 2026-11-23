# Wallet threat register

Initial scores use the [implementation plan rubric](../IMPLEMENTATION_PLAN.md#risk-scoring). Impact and likelihood are design estimates for the reference system. All controls are proposed and all verification results are pending. Residual risk remains unscored until evidence is reviewed.

| ID | Flow / asset | STRIDE | Scenario and rationale | Impact × likelihood | Treatment and owner | Check |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | F1 / A3 | Spoofing | Unauthorized recovery or stale sessions allow account takeover and loss of funds. Recovery is an expected customer workflow. | 3 × 2 = 6 | Invalidate superseded credentials and sessions. Bind fresh authorization to sensitive actions. Identity | V1 |
| T2 | F1 / A3 | Information disclosure | Recovery logs or responses expose usable credentials. Logging and support tooling process recovery metadata. | 3 × 2 = 6 | Redact recovery credentials and restrict access to recovery records. Identity | V2 |
| T3 | F2 / A1, A2 | Tampering | Incorrectly matched or duplicate deposit confirmation produces unbacked credit. Duplicate delivery is expected. | 3 × 3 = 9 | Require eligible provider evidence, match transaction attributes, and enforce one credit per deposit. Payments | V3 |
| T4 | F3 / A1 | Tampering | Duplicate or concurrent requests create an incorrect balance. Retries and concurrency are routine. | 3 × 3 = 9 | Enforce atomic balanced posting, available-funds checks, and operation deduplication. Ledger | V4 |
| T5 | F4 / A1, A2 | Tampering | The submitted payout differs from the authorized destination or amount. Multiple components handle payout details. | 3 × 2 = 6 | Bind authorization to the payout details and freeze them with the durable intent. Payments | V5 |
| T6 | F4 / A1, A2 | Tampering | Ambiguous provider outcomes cause a duplicate payout or premature hold release. Timeouts are plausible in normal operation. | 3 × 2 = 6 | Use stable provider IDs and resolve unconfirmed outcomes before release or repeat submission. Payments | V6 |
| T7 | F5 / A1, A2, A4 | Spoofing, tampering | An untrusted or conflicting callback changes wallet state. Callbacks cross an external boundary and can arrive out of order. | 3 × 2 = 6 | Authenticate events, persist and deduplicate them, then validate matches and transitions. Payments | V7 |
| T8 | F6 / A1, A2, A5 | Tampering | Missing or inconsistent settlement records leave a material discrepancy undetected. Reconciliation depends on independent inputs. | 3 × 2 = 6 | Check completeness and match records. Track exceptions through independent financial review. Finance operations | V8 |
| T9 | F7 / A1, A5 | Elevation of privilege, repudiation | A staff member makes an unauthorized adjustment or the approval history cannot establish who approved it. Staff access is routine. | 3 × 2 = 6 | Enforce role checks and independent approval. Link audit records to the journal. Finance operations | V9 |
| T10 | F5, F6 / A2 | Denial of service | Provider delays or worker backlog stall status updates and settlement review. Delays can materially disrupt operations. | 2 × 2 = 4 | Monitor queue age, settlement freshness, and processing lag. Payments | V10 |

## Review status

F1 through F7 have an initial design review in the table. The review considers identity at entry points, data integrity across writes, attribution on sensitive actions, confidentiality at boundaries, service availability, and privilege on restricted operations. Repeat the review after choosing a provider and specifying deployment and access roles.

All listed risks are open with proposed mitigation. The repository maintainer owns the draft. A ledger reviewer and a payments reviewer still need to assess the assumptions, evidence, and residual risk before marking the model reviewed. No residual-risk acceptance is recorded.
