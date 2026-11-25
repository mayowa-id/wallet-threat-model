import { createHash, randomBytes } from 'node:crypto';

function newToken() {
  return randomBytes(32).toString('base64url');
}

function tokenDigest(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('Invalid credential');
  }
  return createHash('sha256').update(token).digest('hex');
}

// The identity adapter verifies primary authentication and action-specific step-up.
// The caller supplies staff IDs from authenticated staff context.
export class WalletAccess {
  #wallet;
  #verify;
  #now;
  #recoveryTtlMs;
  #reviewers;
  #accounts = new Map();
  #sessions = new Map();

  constructor(wallet, { verify, recoveryReviewers = [], now = Date.now, recoveryTtlMs = 900_000 }) {
    if (typeof verify !== 'function') throw new Error('Identity verifier required');
    if (!Number.isSafeInteger(recoveryTtlMs) || recoveryTtlMs <= 0) throw new Error('Invalid recovery lifetime');
    this.#wallet = wallet;
    this.#verify = verify;
    this.#now = now;
    this.#recoveryTtlMs = recoveryTtlMs;
    this.#reviewers = new Set(recoveryReviewers);
  }

  #account(account) {
    this.#wallet.available(account);
    if (!this.#accounts.has(account)) {
      this.#accounts.set(account, { sessions: new Set(), recovery: null, recoveredAt: null, destination: null });
    }
    return this.#accounts.get(account);
  }

  #authorize(request, proof) {
    if (this.#verify(Object.freeze(request), proof) !== true) throw new Error('Authorization required');
  }

  #openSession(account, record) {
    const token = newToken();
    const digest = tokenDigest(token);
    record.sessions.add(digest);
    this.#sessions.set(digest, account);
    return token;
  }

  signIn(account, proof) {
    this.#authorize({ action: 'sign-in', account }, proof);
    return this.#openSession(account, this.#account(account));
  }

  issueRecoveryCredential(account, proof) {
    this.#authorize({ action: 'issue-recovery', account }, proof);
    const record = this.#account(account);
    const token = newToken();
    record.recovery = { digest: tokenDigest(token), expiresAt: this.#now() + this.#recoveryTtlMs };
    return token;
  }

  recover(account, token) {
    const digest = tokenDigest(token);
    const record = this.#accounts.get(account);
    const now = this.#now();
    if (!record?.recovery || now >= record.recovery.expiresAt || record.recovery.digest !== digest) {
      throw new Error('Invalid or expired recovery credential');
    }
    record.recovery = null;
    record.recoveredAt = now;
    for (const session of record.sessions) this.#sessions.delete(session);
    record.sessions.clear();
    return { session: this.#openSession(account, record) };
  }

  #session(token) {
    const digest = tokenDigest(token);
    if (!this.#sessions.has(digest)) throw new Error('Invalid session');
    const account = this.#sessions.get(digest);
    return { account, record: this.#accounts.get(account), sessionId: digest };
  }

  setPayoutDestination(session, destination, proof) {
    if (typeof destination !== 'string' || !destination.trim()) throw new Error('Invalid destination');
    const { account, record, sessionId } = this.#session(session);
    this.#authorize({ action: 'set-payout-destination', account, sessionId, destination }, proof);
    record.destination = destination;
  }

  requestWithdrawal(session, id, amount, proof) {
    const { account, record, sessionId } = this.#session(session);
    if (!record.destination) throw new Error('Payout destination required');
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid withdrawal amount');
    const destination = record.destination;
    this.#authorize({ action: 'withdraw', account, sessionId, id, amount, destination }, proof);
    this.#wallet.holdWithdrawal(id, account, destination, amount);
  }

  recoveryRecord(staffId, account) {
    if (!this.#reviewers.has(staffId)) throw new Error('Recovery review permission required');
    return { account, recoveredAt: this.#accounts.get(account)?.recoveredAt ?? null };
  }
}
