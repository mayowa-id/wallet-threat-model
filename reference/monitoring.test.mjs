import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPaymentHealth } from './monitoring.mjs';
import { Wallet } from './wallet.mjs';

test('V10: alerts at configured deadlines and clears after deduplicated catch-up', async () => {
  let now = 1_000;
  const wallet = new Wallet({ alice: 100 }, { now: () => now });
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 25);
  const batch = { id: 'batch-1', dueAt: 1_080 };
  const check = () => checkPaymentHealth({
    now, pendingPayouts: wallet.pendingPayouts, settlementBatches: [batch],
    payoutMaxAgeMs: 100, settlementGraceMs: 20,
  });

  now = 1_099;
  assert.deepEqual(check(), []);
  now = 1_100;
  assert.deepEqual(check(), [
    { type: 'overdue-payout', id: 'payout-1', ageMs: 100, phase: 'queued' },
    { type: 'overdue-settlement', id: 'batch-1', overdueMs: 20 },
  ]);

  assert.equal(await wallet.submitWithdrawal('payout-1', { resolveOrSubmit: () => 'unknown' }), 'held');
  assert.equal(check()[0].phase, 'awaiting-outcome');
  now = 1_120;
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 25);
  assert.equal(check()[0].ageMs, 120);

  let submissions = 0;
  const provider = { resolveOrSubmit: () => { submissions++; return 'settled'; } };
  assert.equal(await wallet.submitWithdrawal('payout-1', provider), 'posted');
  assert.equal(await wallet.submitWithdrawal('payout-1', provider), 'posted');
  assert.equal(submissions, 1);
  assert.equal(wallet.journal.length, 1);
  assert.deepEqual(check().map(({ type }) => type), ['overdue-settlement']);
  batch.receivedAt = now;
  assert.deepEqual(check(), []);
});
