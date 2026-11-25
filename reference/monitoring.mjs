// Times and thresholds use integer milliseconds. Evaluate at a regular polling interval.
export function checkPaymentHealth({
  now, pendingPayouts, settlementBatches, payoutMaxAgeMs, settlementGraceMs,
}) {
  if (![now, payoutMaxAgeMs, settlementGraceMs].every(Number.isSafeInteger) ||
      now < 0 || payoutMaxAgeMs <= 0 || settlementGraceMs < 0) {
    throw new Error('Invalid monitoring time or thresholds');
  }

  const alerts = [];
  for (const { id, heldAt, submitted } of pendingPayouts) {
    if (!Number.isSafeInteger(heldAt) || heldAt < 0 || heldAt > now) {
      throw new Error('Invalid payout hold time');
    }
    const ageMs = now - heldAt;
    if (ageMs >= payoutMaxAgeMs) {
      alerts.push({ type: 'overdue-payout', id, ageMs, phase: submitted ? 'awaiting-outcome' : 'queued' });
    }
  }

  for (const { id, dueAt, receivedAt = null } of settlementBatches) {
    if (!Number.isSafeInteger(dueAt) || dueAt < 0 ||
        (receivedAt !== null && (!Number.isSafeInteger(receivedAt) || receivedAt < 0 || receivedAt > now))) {
      throw new Error('Invalid settlement batch time');
    }
    if (receivedAt === null && now >= dueAt && now - dueAt >= settlementGraceMs) {
      alerts.push({ type: 'overdue-settlement', id, overdueMs: now - dueAt });
    }
  }
  return alerts;
}
