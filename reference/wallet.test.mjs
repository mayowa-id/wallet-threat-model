import assert from 'node:assert/strict';
import test from 'node:test';
import { Wallet } from './wallet.mjs';

test('V4: retries produce one balanced journal and changed details are rejected', () => {
  const wallet = new Wallet({ alice: 100, bob: 0 });
  wallet.transfer('transfer-1', 'alice', 'bob', 60);
  wallet.transfer('transfer-1', 'alice', 'bob', 60);
  assert.throws(() => wallet.transfer('transfer-1', 'alice', 'bob', 61), /already bound/);
  assert.equal(wallet.journal.length, 1);
  assert.equal(wallet.journal[0].entries.reduce((sum, entry) => sum + entry.delta, 0), 0);
  assert.deepEqual([wallet.available('alice'), wallet.available('bob')], [40, 60]);
});

test('V4: competing debits and holds share the same available balance', async () => {
  const wallet = new Wallet({ alice: 100, bob: 0 });
  const results = await Promise.allSettled([
    Promise.resolve().then(() => wallet.holdWithdrawal('payout-1', 'alice', 'bank', 75)),
    Promise.resolve().then(() => wallet.transfer('transfer-1', 'alice', 'bob', 75)),
  ]);
  assert.deepEqual(results.map(({ status }) => status), ['fulfilled', 'rejected']);
  assert.match(results[1].reason.message, /Insufficient funds/);
  assert.equal(wallet.available('alice'), 25);
});

test('V5: a held payout is bound to the original amount and destination', async () => {
  const wallet = new Wallet({ alice: 100 });
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 75);
  assert.throws(() => wallet.holdWithdrawal('payout-1', 'alice', 'other', 75), /already bound/);
  assert.throws(() => wallet.holdWithdrawal('payout-1', 'alice', 'bank', 76), /already bound/);
  await wallet.submitWithdrawal('payout-1', {
    resolveOrSubmit(payout) {
      assert.equal(payout.destination, 'bank');
      assert.equal(payout.amount, 75);
      return 'unknown';
    },
  });
});

test('V6: ambiguous payout keeps the hold and subsequent settlement posts once', async () => {
  const wallet = new Wallet({ alice: 100 });
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 75);
  const calls = [];
  const provider = {
    resolveOrSubmit({ id }) {
      calls.push(id);
      return calls.length === 1 ? 'unknown' : 'settled';
    },
  };
  assert.equal(await wallet.submitWithdrawal('payout-1', provider), 'held');
  assert.equal(wallet.available('alice'), 25);
  assert.equal(wallet.journal.length, 0);
  assert.equal(await wallet.submitWithdrawal('payout-1', provider), 'posted');
  assert.equal(await wallet.submitWithdrawal('payout-1', provider), 'posted');
  assert.deepEqual(calls, ['payout-1', 'payout-1']);
  assert.equal(wallet.journal.length, 1);
  assert.equal(wallet.available('alice'), 25);
});

test('V6: terminal failure releases the hold once', async () => {
  const wallet = new Wallet({ alice: 100 });
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 75);
  const provider = { resolveOrSubmit: () => 'failed' };
  assert.equal(await wallet.submitWithdrawal('payout-1', provider), 'released');
  assert.equal(await wallet.submitWithdrawal('payout-1', provider), 'released');
  assert.equal(wallet.available('alice'), 100);
  assert.equal(wallet.journal.length, 0);
});
