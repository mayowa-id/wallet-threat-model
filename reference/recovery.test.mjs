import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import test from 'node:test';
import { WalletAccess } from './recovery.mjs';
import { Wallet } from './wallet.mjs';

function sessionId(token) {
  return createHash('sha256').update(token).digest('hex');
}

function fixture({ sessionTtlMs } = {}) {
  let now = 1_000;
  const wallet = new Wallet({ alice: 100, bob: 100 });
  const proofs = new Map();
  const access = new WalletAccess(wallet, {
    now: () => now,
    recoveryTtlMs: 100,
    sessionTtlMs,
    recoveryReviewers: ['reviewer'],
    verify(request, proof) {
      if (proofs.get(proof) !== JSON.stringify(request) || !proofs.has(proof)) return false;
      proofs.delete(proof);
      return true;
    },
  });
  function proof(request) {
    const value = Symbol();
    proofs.set(value, JSON.stringify(request));
    return value;
  }
  return { access, wallet, proof, advance: (ms) => { now += ms; } };
}

test('V1: signing out revokes only that session, and sessions expire at the configured deadline', () => {
  const { access, wallet, proof, advance } = fixture({ sessionTtlMs: 100 });
  const account = 'alice';
  const signIn = () => access.signIn(account, proof({ action: 'sign-in', account }));
  const first = signIn();
  const second = signIn();
  const destination = 'bank';
  const setDestination = (session) => access.setPayoutDestination(session, destination, proof({
    action: 'set-payout-destination', account, sessionId: sessionId(session), destination,
  }));
  const withdraw = (session, id) => access.requestWithdrawal(session, id, 10, proof({
    action: 'withdraw', account, sessionId: sessionId(session), id, amount: 10, destination,
  }));

  access.signOut(first);
  access.signOut(first);
  assert.throws(() => setDestination(first), /Invalid session/);
  assert.throws(() => withdraw(first, 'revoked'), /Invalid session/);
  advance(99);
  setDestination(second);
  withdraw(second, 'valid');
  advance(1);
  assert.throws(() => withdraw(second, 'expired'), /Invalid session/);
  assert.throws(() => setDestination(second), /Invalid session/);
  assert.equal(wallet.available(account), 90);

  const credential = access.issueRecoveryCredential(account, proof({ action: 'issue-recovery', account }));
  const { session } = access.recover(account, credential);
  setDestination(session);
  advance(100);
  assert.throws(() => setDestination(session), /Invalid session/);
});

test('V1: replacement, expiry, and successful recovery invalidate credentials and old sessions', () => {
  const { access, proof, advance } = fixture();
  const issue = (account) => access.issueRecoveryCredential(account, proof({ action: 'issue-recovery', account }));
  const signIn = (account) => access.signIn(account, proof({ action: 'sign-in', account }));
  const alice = signIn('alice');
  const secondAlice = signIn('alice');
  const bob = signIn('bob');
  assert.throws(() => access.issueRecoveryCredential('alice'), /Authorization required/);
  const superseded = issue('alice');
  const expired = issue('alice');
  assert.throws(() => access.recover('alice', superseded), /Invalid or expired/);
  advance(100);
  assert.throws(() => access.recover('alice', expired), /Invalid or expired/);
  const current = issue('alice');
  assert.throws(() => access.recover('bob', current), /Invalid or expired/);
  const { session } = access.recover('alice', current);
  assert.throws(() => access.recover('alice', current), /Invalid or expired/);
  assert.throws(() => access.setPayoutDestination(alice, 'bank'), /Invalid session/);
  assert.throws(() => access.setPayoutDestination(secondAlice, 'bank'), /Invalid session/);
  assert.throws(() => access.setPayoutDestination(session, 'bank'), /Authorization required/);
  access.setPayoutDestination(bob, 'bank', proof({
    action: 'set-payout-destination', account: 'bob', sessionId: sessionId(bob), destination: 'bank',
  }));
});

test('V1: a recovered account needs fresh proof bound to each sensitive action', () => {
  const { access, wallet, proof } = fixture();
  const account = 'alice';
  const oldSession = access.signIn(account, proof({ action: 'sign-in', account }));
  const token = access.issueRecoveryCredential(account, proof({ action: 'issue-recovery', account }));
  const { session } = access.recover(account, token);
  const destination = 'bank';
  const destinationRequest = { action: 'set-payout-destination', account, sessionId: sessionId(session), destination };
  const oldProof = proof({ ...destinationRequest, sessionId: sessionId(oldSession) });
  assert.throws(() => access.setPayoutDestination(session, destination, oldProof), /Authorization required/);
  const destinationProof = proof(destinationRequest);
  assert.throws(() => access.setPayoutDestination(session, 'other-bank', destinationProof), /Authorization required/);
  access.setPayoutDestination(session, destination, destinationProof);
  assert.throws(() => access.setPayoutDestination(session, destination, destinationProof), /Authorization required/);

  const id = 'payout-1';
  const amount = 25;
  const withdrawalProof = proof({ action: 'withdraw', account, sessionId: sessionId(session), id, amount, destination });
  assert.throws(() => access.requestWithdrawal(session, id, amount), /Authorization required/);
  assert.throws(() => access.requestWithdrawal(session, id, 26, withdrawalProof), /Authorization required/);
  assert.equal(wallet.available(account), 100);
  access.requestWithdrawal(session, id, amount, withdrawalProof);
  assert.throws(() => access.requestWithdrawal(session, id, amount, withdrawalProof), /Authorization required/);
  assert.equal(wallet.available(account), 75);
});

test('V2: recovery records restrict access and diagnostics omit credentials', () => {
  const { access, proof } = fixture();
  const account = 'alice';
  const credential = access.issueRecoveryCredential(account, proof({ action: 'issue-recovery', account }));
  assert.equal(inspect(access, { showHidden: true }).includes(credential), false);
  const { session } = access.recover(account, credential);
  assert.throws(() => access.recoveryRecord('support', account), /Recovery review permission required/);
  const record = access.recoveryRecord('reviewer', account);
  assert.deepEqual(record, { account, recoveredAt: 1_000 });
  assert.throws(() => access.recover(account, credential), (error) => {
    const diagnostics = inspect({ access, record, error }, { showHidden: true, depth: null });
    assert.equal(diagnostics.includes(credential), false);
    assert.equal(diagnostics.includes(session), false);
    return true;
  });
});
