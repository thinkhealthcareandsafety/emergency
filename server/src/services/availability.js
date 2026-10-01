/**
 * Single source of truth for "is this person available right now?".
 *
 * Priority:
 *  1. An unexpired manual override from a supervisor (e.g. "on leave but on site", "gone to hospital").
 *  2. The latest attendance punch: IN = available, OUT = off duty.
 *  3. An IN punch older than `staleAfterHours` is flagged "stale" — they probably forgot to punch out,
 *     so we must not count them towards coverage, but they may still be on site.
 */
export function availabilityOf(emp, now, staleAfterHours) {
  const o = emp.override;
  if (o && o.status && (!o.until || new Date(o.until) > now)) {
    const available = o.status === 'AVAILABLE';
    return {
      state: available ? 'available' : 'unavailable',
      reason: o.reason || (available ? 'Marked available' : 'Marked unavailable'),
      manual: true,
      until: o.until || null,
    };
  }
  if (emp.lastPunchType === 'IN' && emp.lastPunchAt) {
    const hours = (now - new Date(emp.lastPunchAt)) / 36e5;
    if (hours > staleAfterHours) return { state: 'stale', reason: 'Punch-out missing', manual: false };
    return { state: 'available', manual: false };
  }
  return { state: 'off', manual: false };
}
