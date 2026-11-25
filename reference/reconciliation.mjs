function groupMovements(movements) {
  const grouped = new Map();
  for (const movement of movements) {
    if (!movement || !['deposit', 'withdrawal'].includes(movement.kind) ||
        typeof movement.reference !== 'string' || !movement.reference ||
        !Number.isSafeInteger(movement.amount) || movement.amount <= 0 ||
        typeof movement.currency !== 'string' || !/^[A-Z]{3}$/.test(movement.currency)) {
      throw new Error('Invalid settlement movement');
    }
    const { kind, reference, amount, currency } = movement;
    const key = JSON.stringify([kind, reference]);
    const rows = grouped.get(key) ?? [];
    rows.push({ kind, reference, amount, currency });
    grouped.set(key, rows);
  }
  return grouped;
}

export class SettlementReconciliation {
  #scopes = new Map();

  // Both inputs must be complete snapshots for the same settlement scope.
  compare(scope, ledgerMovements, providerMovements) {
    if (typeof scope !== 'string' || !scope) throw new Error('Invalid settlement scope');
    const ledger = groupMovements(ledgerMovements);
    const provider = groupMovements(providerMovements);
    const exceptions = this.#scopes.get(scope) ?? new Map();
    const keys = new Set([...ledger.keys(), ...provider.keys(), ...exceptions.keys()]);

    for (const key of keys) {
      const ledgerRows = ledger.get(key) ?? [];
      const providerRows = provider.get(key) ?? [];
      const [expected] = ledgerRows;
      const [actual] = providerRows;
      const reasons = [];
      if (ledgerRows.length > 1) reasons.push('duplicate-ledger-record');
      if (providerRows.length > 1) reasons.push('duplicate-provider-record');
      if (expected && !actual) reasons.push('missing-provider-record');
      if (actual && !expected) reasons.push('missing-ledger-record');
      if (ledgerRows.length === 1 && providerRows.length === 1) {
        if (expected.amount !== actual.amount) reasons.push('amount-mismatch');
        if (expected.currency !== actual.currency) reasons.push('currency-mismatch');
      }

      if (reasons.length) {
        const { kind, reference } = expected ?? actual;
        exceptions.set(key, { scope, kind, reference, status: 'open', reasons, ledgerRows, providerRows });
      } else if (expected && actual && exceptions.get(key)?.status === 'open') {
        const previous = exceptions.get(key);
        exceptions.set(key, { ...previous, status: 'resolved', resolution: { ledger: expected, provider: actual } });
      }
    }

    this.#scopes.set(scope, exceptions);
    return structuredClone([...exceptions.values()]);
  }
}
