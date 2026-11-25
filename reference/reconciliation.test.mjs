import assert from 'node:assert/strict';
import test from 'node:test';
import { SettlementReconciliation } from './reconciliation.mjs';
import { Wallet } from './wallet.mjs';

const payout = { kind: 'withdrawal', reference: 'payout-1', amount: 25, currency: 'NGN' };
const deposit = { kind: 'deposit', reference: 'deposit-1', amount: 50, currency: 'NGN' };

test('V8: compare posted wallet movements without changing the journal', async () => {
  const wallet = new Wallet({ alice: 100, bob: 0 }, { currency: 'NGN' });
  wallet.registerDeposit('deposit-1', 'alice', 'deposit-1', 50);
  wallet.transfer('transfer-1', 'alice', 'bob', 10);
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 25);
  assert.deepEqual(wallet.postedProviderMovements, []);
  await wallet.submitWithdrawal('payout-1', { resolveOrSubmit: () => 'settled' });
  assert.deepEqual(wallet.postedProviderMovements, [payout]);
  const journal = wallet.journal;

  const reconciliation = new SettlementReconciliation();
  const wrongPayout = { ...payout, amount: 20, currency: 'USD' };
  const compare = () => reconciliation.compare('batch-1', wallet.postedProviderMovements, [wrongPayout, deposit]);
  const exceptions = compare();
  assert.deepEqual(exceptions.map(({ status, reasons }) => [status, reasons]), [
    ['open', ['amount-mismatch', 'currency-mismatch']],
    ['open', ['missing-ledger-record']],
  ]);
  assert.deepEqual(compare(), exceptions);
  assert.deepEqual(wallet.journal, journal);
});

test('V8: incomplete and duplicate records stay open until a matching pair is supplied', () => {
  const reconciliation = new SettlementReconciliation();
  const [missing] = reconciliation.compare('batch-1', [payout], []);
  assert.deepEqual(missing.reasons, ['missing-provider-record']);
  assert.deepEqual(reconciliation.compare('batch-1', [], []), [missing]);
  assert.deepEqual(reconciliation.compare('batch-2', [payout], [payout]), []);
  const [duplicate] = reconciliation.compare('batch-1', [payout], [payout, payout]);
  assert.deepEqual(duplicate.reasons, ['duplicate-provider-record']);
  assert.throws(() => reconciliation.compare('batch-1', [payout], [{ ...payout, amount: -1 }]), /Invalid settlement/);
  assert.deepEqual(reconciliation.compare('batch-1', [], []), [duplicate]);
  const [resolved] = reconciliation.compare('batch-1', [payout], [payout]);
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(resolved.resolution, { ledger: payout, provider: payout });
  const [reopened] = reconciliation.compare('batch-1', [payout], []);
  assert.equal(reopened.status, 'open');
});
