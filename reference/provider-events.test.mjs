import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { Wallet } from './wallet.mjs';

const secret = Buffer.from('synthetic-provider-test-secret');
const deposit = {
  id: 'event-1', kind: 'deposit', reference: 'provider-1',
  outcome: 'settled', amount: 75, currency: 'NGN',
};

function deliver(wallet, overrides = {}, signingSecret = secret) {
  const body = Buffer.from(JSON.stringify({ ...deposit, ...overrides }));
  const signature = createHmac('sha256', signingSecret).update(body).digest('hex');
  return wallet.applyProviderEvent(body, signature);
}

test('V3: only authenticated, matching deposit confirmations credit once', () => {
  const wallet = new Wallet({ alice: 0 }, { currency: 'NGN', providerSecret: secret });
  wallet.registerDeposit('deposit-1', 'alice', 'provider-1', 75);
  assert.throws(() => wallet.registerDeposit('deposit-2', 'alice', 'provider-1', 75), /already assigned/);
  assert.equal(deliver(wallet, {}, Buffer.from('different-secret')), 'unauthenticated');
  assert.equal(deliver(wallet, { amount: 76 }), 'mismatch');
  assert.equal(deliver(wallet, { currency: 'USD' }), 'mismatch');
  assert.equal(deliver(wallet, { reference: 'unknown' }), 'mismatch');
  assert.equal(wallet.available('alice'), 0);
  assert.deepEqual(wallet.journal, []);
  assert.equal(deliver(wallet), 'applied');
  assert.equal(deliver(wallet), 'duplicate');
  assert.equal(deliver(wallet, { id: 'event-2' }), 'duplicate');
  assert.equal(wallet.available('alice'), 75);
  assert.deepEqual(wallet.journal, [{
    id: 'deposit-1', entries: [{ account: 'alice', delta: 75 }, { account: null, delta: -75 }],
  }]);
});

test('V7: payout callbacks require prior submission and conflicts preserve the ledger', async () => {
  const wallet = new Wallet({ alice: 100 }, { currency: 'NGN', providerSecret: secret });
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 75);
  const payout = { kind: 'withdrawal', reference: 'payout-1' };
  assert.equal(deliver(wallet, payout), 'mismatch');
  assert.equal(await wallet.submitWithdrawal('payout-1', { resolveOrSubmit: () => 'unknown' }), 'held');
  assert.equal(deliver(wallet, payout, Buffer.from('different-secret')), 'unauthenticated');
  assert.equal(deliver(wallet, { ...payout, amount: 76 }), 'mismatch');
  assert.deepEqual(wallet.journal, []);
  assert.equal(deliver(wallet, payout), 'applied');
  assert.equal(deliver(wallet, payout), 'duplicate');
  assert.equal(deliver(wallet, { ...payout, outcome: 'failed' }), 'conflict');
  assert.equal(deliver(wallet, { ...payout, id: 'event-2', outcome: 'failed' }), 'conflict');
  assert.equal(deliver(wallet, { ...payout, id: 'event-2', outcome: 'failed' }), 'duplicate');
  assert.equal(wallet.providerExceptions.length, 2);
  assert.equal(wallet.journal.length, 1);
  assert.equal(wallet.available('alice'), 25);
});

test('V7: a callback racing the payout response cannot post twice or silently override it', async () => {
  const wallet = new Wallet({ alice: 100 }, { currency: 'NGN', providerSecret: secret });
  wallet.holdWithdrawal('payout-1', 'alice', 'bank', 75);
  const state = await wallet.submitWithdrawal('payout-1', {
    resolveOrSubmit() {
      assert.equal(deliver(wallet, { kind: 'withdrawal', reference: 'payout-1' }), 'applied');
      return 'failed';
    },
  });
  assert.equal(state, 'posted');
  assert.equal(wallet.providerExceptions.length, 1);
  assert.equal(wallet.journal.length, 1);
});
