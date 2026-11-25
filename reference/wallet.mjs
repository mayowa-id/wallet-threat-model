import { createHmac, timingSafeEqual } from 'node:crypto';

// Single-process reference model. Amounts are integer minor units in one currency.
export class Wallet {
  #balances;
  #currency;
  #providerSecret;
  #operations = new Map();
  #depositsByReference = new Map();
  #providerEvents = new Map();
  #exceptions = new Map();
  #journal = [];

  constructor(balances, { currency = 'USD', providerSecret } = {}) {
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid currency');
    if (providerSecret !== undefined && (!Buffer.isBuffer(providerSecret) || providerSecret.length === 0)) {
      throw new Error('Invalid provider secret');
    }
    this.#currency = currency;
    this.#providerSecret = providerSecret && Buffer.from(providerSecret);
    this.#balances = new Map(Object.entries(balances));
    for (const balance of this.#balances.values()) {
      if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid balance');
    }
  }

  available(account) {
    if (!this.#balances.has(account)) throw new Error('Unknown account');
    let available = this.#balances.get(account);
    for (const { intent, state } of this.#operations.values()) {
      if (state === 'held' && intent.account === account) available -= intent.amount;
    }
    return available;
  }

  get journal() {
    return structuredClone(this.#journal);
  }

  get providerExceptions() {
    return structuredClone([...this.#exceptions.values()]);
  }

  get postedProviderMovements() {
    const movements = [];
    for (const [id, { intent, state }] of this.#operations) {
      if (state !== 'posted' || intent.kind === 'transfer') continue;
      movements.push({
        kind: intent.kind,
        reference: intent.kind === 'deposit' ? intent.reference : id,
        amount: intent.amount,
        currency: this.#currency,
      });
    }
    return movements;
  }

  #begin(id, intent) {
    if (typeof id !== 'string' || !id || !Number.isSafeInteger(intent.amount) || intent.amount <= 0) {
      throw new Error('Invalid operation');
    }
    const existing = this.#operations.get(id);
    if (existing && JSON.stringify(existing.intent) !== JSON.stringify(intent)) {
      throw new Error('Operation ID already bound to different details');
    }
    return existing;
  }

  #requireFunds(account, amount) {
    if (this.available(account) < amount) throw new Error('Insufficient funds');
  }

  transfer(id, account, recipient, amount) {
    const intent = { kind: 'transfer', account, recipient, amount };
    if (this.#begin(id, intent)) return;
    this.#requireFunds(account, amount);
    if (account === recipient || !this.#balances.has(recipient)) throw new Error('Invalid recipient');
    const recipientBalance = this.#balances.get(recipient) + amount;
    if (!Number.isSafeInteger(recipientBalance)) throw new Error('Balance overflow');
    this.#balances.set(account, this.#balances.get(account) - amount);
    this.#balances.set(recipient, recipientBalance);
    this.#journal.push({ id, entries: [{ account, delta: -amount }, { account: recipient, delta: amount }] });
    this.#operations.set(id, { intent, state: 'posted' });
  }

  holdWithdrawal(id, account, destination, amount) {
    if (typeof destination !== 'string' || !destination) throw new Error('Invalid destination');
    const intent = Object.freeze({ kind: 'withdrawal', account, destination, amount });
    if (this.#begin(id, intent)) return;
    this.#requireFunds(account, amount);
    this.#operations.set(id, { intent, state: 'held' });
  }

  registerDeposit(id, account, reference, amount) {
    if (!this.#balances.has(account)) throw new Error('Unknown account');
    if (typeof reference !== 'string' || !reference) throw new Error('Invalid provider reference');
    const intent = { kind: 'deposit', account, reference, amount };
    if (this.#begin(id, intent)) return;
    if (this.#depositsByReference.has(reference)) throw new Error('Provider reference already assigned');
    this.#operations.set(id, { intent, state: 'pending' });
    this.#depositsByReference.set(reference, id);
  }

  async submitWithdrawal(id, provider) {
    const operation = this.#operations.get(id);
    if (operation?.intent.kind !== 'withdrawal') throw new Error('Unknown withdrawal');
    if (operation.state !== 'held') return operation.state;

    const payout = Object.freeze({ id, ...operation.intent });
    // The provider adapter must resolve by ID and deduplicate any submission.
    operation.submitted = true;
    const outcome = await provider.resolveOrSubmit(payout);
    if (outcome === 'unknown') return operation.state;
    if (outcome !== 'settled' && outcome !== 'failed') throw new Error('Unknown provider outcome');
    if (this.#applyProviderOutcome(id, operation, outcome) === 'conflict') {
      this.#recordConflict({ operationId: id, outcome, source: 'payout response' });
    }
    return operation.state;
  }

  #applyProviderOutcome(id, operation, outcome) {
    const isDeposit = operation.intent.kind === 'deposit';
    const target = outcome === 'settled' ? 'posted' : isDeposit ? 'failed' : 'released';
    if (operation.state === target) return 'duplicate';
    if (operation.state !== (isDeposit ? 'pending' : 'held')) return 'conflict';
    if (target === 'posted') {
      this.#postProviderMovement(id, operation, isDeposit);
    }
    operation.state = target;
    return 'applied';
  }

  #postProviderMovement(id, operation, isDeposit) {
    const { account, amount } = operation.intent;
    const delta = isDeposit ? amount : -amount;
    const balance = this.#balances.get(account) + delta;
    if (!Number.isSafeInteger(balance)) throw new Error('Balance overflow');
    this.#balances.set(account, balance);
    this.#journal.push({ id, entries: [{ account, delta }, { account: null, delta: -delta }] });
  }

  #recordConflict(details) {
    this.#exceptions.set(JSON.stringify(details), details);
    return 'conflict';
  }

  applyProviderEvent(body, signature) {
    if (!Buffer.isBuffer(body) || !this.#providerSecret) {
      throw new Error('Expected raw event bytes and a configured secret');
    }
    const expected = createHmac('sha256', this.#providerSecret).update(body).digest();
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature) ||
        !timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return 'unauthenticated';

    let event;
    try {
      event = JSON.parse(body.toString('utf8'));
    } catch {
      return 'invalid';
    }
    if (!event || typeof event.id !== 'string' || !event.id ||
        typeof event.reference !== 'string' || !event.reference ||
        !['deposit', 'withdrawal'].includes(event.kind) ||
        !['settled', 'failed'].includes(event.outcome) ||
        !Number.isSafeInteger(event.amount) || event.amount <= 0 ||
        typeof event.currency !== 'string') return 'invalid';

    const { id: eventId, kind, reference, outcome, amount, currency } = event;
    const fingerprint = JSON.stringify([kind, reference, outcome, amount, currency]);
    const previous = this.#providerEvents.get(eventId);
    if (previous !== undefined) {
      if (previous === fingerprint) return 'duplicate';
      return this.#recordConflict({ eventId, reason: 'Event ID reused with different details' });
    }

    const operationId = kind === 'deposit' ? this.#depositsByReference.get(reference) : reference;
    const operation = this.#operations.get(operationId);
    if (operation?.intent.kind !== kind || operation.intent.amount !== amount ||
        currency !== this.#currency || (kind === 'withdrawal' && !operation.submitted)) return 'mismatch';

    const result = this.#applyProviderOutcome(operationId, operation, outcome);
    if (result === 'conflict') this.#recordConflict({ eventId, operationId, outcome, source: 'callback' });
    this.#providerEvents.set(eventId, fingerprint);
    return result;
  }
}
