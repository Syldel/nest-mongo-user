import {
  afterFailure,
  decide,
  delayAfterFailures,
  DISABLE_AFTER_FAILURES,
  FRESH_STATE,
  ThrottleState,
} from './login-throttle.policy';

const NOW = new Date('2026-11-03T12:00:00Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** L'état après `n` échecs, chacun tenté dès que permis. */
function afterFailures(n: number): ThrottleState {
  let state = FRESH_STATE;
  for (let i = 0; i < n; i++) state = afterFailure(state, NOW);
  return state;
}

describe('delayAfterFailures', () => {
  // La table entière : c'est la règle annoncée à l'utilisateur.
  it.each([
    [1, 0],
    [4, 0],
    [5, 30 * SECOND],
    [6, 1 * MINUTE],
    [7, 2 * MINUTE],
    [8, 4 * MINUTE],
    [9, 8 * MINUTE],
    [10, 16 * MINUTE],
    [11, 32 * MINUTE],
    [12, 60 * MINUTE],
    [50, 60 * MINUTE],
    [99, 60 * MINUTE],
  ])('should wait %i failures → %i ms', (failures, delay) => {
    expect(delayAfterFailures(failures)).toBe(delay);
  });
});

describe('decide', () => {
  it('should examine the first five attempts without waiting', () => {
    expect(decide(afterFailures(4), NOW)).toEqual({ allowed: true });
  });

  it('should ask to wait 30 s after the fifth failure, and say how long', () => {
    expect(decide(afterFailures(5), NOW)).toEqual({
      allowed: false,
      reason: 'wait',
      retryAfterMs: 30 * SECOND,
    });
  });

  it('should examine an attempt again once the wait is over', () => {
    const later = new Date(NOW.getTime() + 30 * SECOND);
    expect(decide(afterFailures(5), later)).toEqual({ allowed: true });
  });

  it('should still refuse one millisecond before the end of the wait', () => {
    const almost = new Date(NOW.getTime() + 30 * SECOND - 1);
    expect(decide(afterFailures(5), almost)).toMatchObject({
      allowed: false,
      retryAfterMs: 1,
    });
  });

  // NIST SP 800-63B-4 §3.2.2 : au plus 100 échecs consécutifs.
  it(`should disable sign-in after ${DISABLE_AFTER_FAILURES} consecutive failures, whatever the time`, () => {
    const years = new Date(NOW.getTime() + 10 * 365 * 24 * 60 * MINUTE);
    expect(decide(afterFailures(DISABLE_AFTER_FAILURES), years)).toEqual({
      allowed: false,
      reason: 'disabled',
    });
    expect(decide(afterFailures(DISABLE_AFTER_FAILURES - 1), years)).toEqual({
      allowed: true,
    });
  });
});
