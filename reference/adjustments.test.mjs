import assert from 'node:assert/strict';
import test from 'node:test';
import { Wallet } from './wallet.mjs';

test('V9: distinct authorized staff approve one balanced entry with an audit record', () => {
  const wallet = new Wallet({ alice: 100 }, {
    adjustmentProposers: ['maker'], adjustmentApprovers: ['maker', 'checker', 'other-checker'],
  });
  const adjustment = { account: 'alice', delta: 20, reason: 'Correct batch 1 variance' };
  assert.throws(() => wallet.proposeAdjustment('adjust-1', 'outsider', adjustment), /proposal permission/);
  assert.equal(wallet.proposeAdjustment('adjust-1', 'maker', adjustment), 'pending');
  assert.throws(() => wallet.approveAdjustment('adjust-1', 'outsider'), /approval permission/);
  assert.throws(() => wallet.approveAdjustment('adjust-1', 'maker'), /Independent approval/);
  assert.throws(() => wallet.proposeAdjustment('adjust-1', 'maker', { ...adjustment, delta: 21 }), /already bound/);
  assert.equal(wallet.available('alice'), 100);
  assert.deepEqual(wallet.journal, []);

  assert.equal(wallet.approveAdjustment('adjust-1', 'checker'), 'posted');
  assert.equal(wallet.approveAdjustment('adjust-1', 'checker'), 'posted');
  assert.throws(() => wallet.approveAdjustment('adjust-1', 'other-checker'), /already approved/);
  assert.equal(wallet.available('alice'), 120);
  assert.deepEqual(wallet.journal, [{
    id: 'adjust-1',
    entries: [{ account: 'alice', delta: 20 }, { account: null, delta: -20 }],
    adjustment: { actor: 'maker', approver: 'checker', reason: adjustment.reason },
  }]);
  assert.deepEqual(wallet.postedProviderMovements, []);
});

test('V9: debit approvals respect withdrawal holds and can be retried after release', async () => {
  const wallet = new Wallet({ alice: 100 }, {
    adjustmentProposers: ['maker'], adjustmentApprovers: ['checker'],
  });
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 80);
  wallet.proposeAdjustment('adjust-1', 'maker', { account: 'alice', delta: -30, reason: 'Balance correction' });
  assert.throws(() => wallet.approveAdjustment('adjust-1', 'checker'), /Insufficient funds/);
  assert.deepEqual(wallet.journal, []);
  assert.equal(wallet.available('alice'), 20);
  await wallet.submitWithdrawal('payout-1', { resolveOrSubmit: () => 'failed' });
  assert.equal(wallet.approveAdjustment('adjust-1', 'checker'), 'posted');
  assert.equal(wallet.available('alice'), 70);
});
