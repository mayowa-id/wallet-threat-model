# Wallet scope

Status as of 2026-11-22 is a draft for a reference architecture. The repository maintainer owns the model. The role names below identify proposed responsibilities for the reference system.

## Assumptions

The operator holds customer funds through an external payment provider. An internal double-entry ledger tracks customer liabilities and available funds in one fiat currency. The provider processes deposits and payouts and supplies status and settlement records. The ledger is authoritative for wallet balances. Provider settlement records supply external evidence of cash movement. A provider event alone cannot authorize a withdrawal or a staff adjustment.

The model covers account access and recovery, deposits, internal transfers, withdrawals, provider callbacks, reconciliation, and staff actions affecting funds. Provider internals, multi-currency conversion, and jurisdiction-specific obligations are outside this reference model.

| Asset | What needs protection |
| --- | --- |
| A1 | Journal entries, available balances, and withdrawal holds |
| A2 | Transaction state, provider references, and settlement records |
| A3 | Account data, sessions, and recovery credentials |
| A4 | Provider and workload credentials |
| A5 | Approval records, administrative audit events, and reconciliation history |

## Authority

| Actor | Authority |
| --- | --- |
| Customer | Authorize movement from their own wallet and request account recovery. |
| Wallet service | Validate identity, ownership, limits, and transaction intent. Submit approved operations to the ledger. |
| Ledger service | Post balanced journals, enforce holds and available funds, and append linked reversals when authorized by the workflow. |
| Payments worker | Submit approved payouts and apply eligible provider outcomes through the ledger workflow. |
| Finance operations | Review settlement differences and propose corrections. A separate approver authorizes sensitive adjustments. |
| Support staff | Assist with recovery within policy. Ledger mutation requires the separate adjustment workflow. |

| Open decision | Proposed owner | Decision checkpoint |
| --- | --- | --- |
| Confirm custody agreement, funding rail, and when incoming funds are final. | Product and payments leads | Before selecting a provider or implementing deposit posting |
| Confirm provider guarantees for payout deduplication, unknown outcomes, settlement files, and reversals. | Payments lead | Before implementing provider integration |
| Set recovery assurance, reauthorization rules, and staff approval thresholds. | Identity and finance leads | Before implementing the affected controls |

Set calendar dates and assign named reviewers when project ownership and a provider are confirmed.
