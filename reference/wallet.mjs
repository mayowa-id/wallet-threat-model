// Single-process reference model. Amounts are integer minor units in one currency.
export class Wallet {
  #balances;
  #operations = new Map();
  #journal = [];

  constructor(balances) {
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

  #begin(id, intent) {
    if (typeof id !== 'string' || !id || !Number.isSafeInteger(intent.amount) || intent.amount <= 0) {
      throw new Error('Invalid operation');
    }
    const existing = this.#operations.get(id);
    if (existing && JSON.stringify(existing.intent) !== JSON.stringify(intent)) {
      throw new Error('Operation ID already bound to different details');
    }
    if (!existing && this.available(intent.account) < intent.amount) throw new Error('Insufficient funds');
    return existing;
  }

  transfer(id, account, recipient, amount) {
    const intent = { kind: 'transfer', account, recipient, amount };
    if (this.#begin(id, intent)) return;
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
    if (!this.#begin(id, intent)) this.#operations.set(id, { intent, state: 'held' });
  }

  async submitWithdrawal(id, provider) {
    const operation = this.#operations.get(id);
    if (operation?.intent.kind !== 'withdrawal') throw new Error('Unknown withdrawal');
    if (operation.state !== 'held') return operation.state;

    const payout = Object.freeze({ id, ...operation.intent });
    // The provider adapter must resolve by ID and deduplicate any submission.
    const outcome = await provider.resolveOrSubmit(payout);
    if (operation.state !== 'held' || outcome === 'unknown') return operation.state;
    if (outcome === 'failed') {
      operation.state = 'released';
      return operation.state;
    }
    if (outcome !== 'settled') throw new Error('Unknown provider outcome');

    const { account, amount } = operation.intent;
    this.#balances.set(account, this.#balances.get(account) - amount);
    this.#journal.push({ id, entries: [{ account, delta: -amount }, { account: null, delta: amount }] });
    operation.state = 'posted';
    return operation.state;
  }
}
