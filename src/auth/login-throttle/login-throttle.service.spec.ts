import { Logger } from '@nestjs/common';
import { inMemoryLoginThrottleModel } from '../../testing/in-memory-login-throttle-model';
import { DISABLE_AFTER_FAILURES } from './login-throttle.policy';
import {
  LoginThrottledError,
  LoginThrottleService,
} from './login-throttle.service';

const START = new Date('2026-11-03T12:00:00Z').getTime();
const KEY = 'account:6650a1b2c3d4e5f6a7b8c9d0';

function setup() {
  const { model, docs } = inMemoryLoginThrottleModel();
  const service = new LoginThrottleService(model);
  let now = START;
  service.now = () => new Date(now);
  const advance = (ms: number) => {
    now += ms;
  };
  const wrong = jest.fn(() => Promise.resolve(false));
  const right = jest.fn(() => Promise.resolve(true));
  return { service, docs, advance, wrong, right };
}

async function failTimes(
  service: LoginThrottleService,
  n: number,
  wrong: () => Promise<boolean>,
) {
  for (let i = 0; i < n; i++) await service.attempt(KEY, wrong);
}

describe('LoginThrottleService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('should examine five wrong passwords, then refuse the sixth without comparing it', async () => {
    const { service, wrong, right } = setup();
    await failTimes(service, 5, wrong);

    await expect(service.attempt(KEY, right)).rejects.toThrow(
      LoginThrottledError,
    );
    expect(wrong).toHaveBeenCalledTimes(5);
    // Même le bon mot de passe n'est pas examiné pendant l'attente.
    expect(right).not.toHaveBeenCalled();
  });

  it('should say how long to wait', async () => {
    const { service, wrong } = setup();
    await failTimes(service, 5, wrong);

    await expect(service.attempt(KEY, wrong)).rejects.toMatchObject({
      decision: { reason: 'wait', retryAfterMs: 30_000 },
    });
  });

  it('should examine an attempt again once the wait is over', async () => {
    const { service, wrong, right, advance } = setup();
    await failTimes(service, 5, wrong);
    advance(30_000);

    await expect(service.attempt(KEY, right)).resolves.toBe(true);
  });

  // Insister pendant l'attente ne doit pas rapprocher la désactivation.
  it('should not count the attempts refused during a wait', async () => {
    const { service, docs, wrong } = setup();
    await failTimes(service, 5, wrong);
    for (let i = 0; i < 20; i++) {
      await service.attempt(KEY, wrong).catch(() => undefined);
    }

    expect(docs.get(KEY)?.failures).toBe(5);
  });

  it('should forget the failures after a success', async () => {
    const { service, docs, wrong, right } = setup();
    await failTimes(service, 4, wrong);
    await service.attempt(KEY, right);

    expect(docs.has(KEY)).toBe(false);
    await failTimes(service, 4, wrong);
    await expect(service.attempt(KEY, right)).resolves.toBe(true);
  });

  it('should forget the state a day after the last failure', async () => {
    const { service, docs, wrong } = setup();
    await failTimes(service, 1, wrong);

    expect(docs.get(KEY)?.expiresAt).toEqual(
      new Date(START + 24 * 60 * 60_000),
    );
  });

  it(`should disable sign-in for good after ${DISABLE_AFTER_FAILURES} failures, until unlocked`, async () => {
    const { service, docs, wrong, right, advance } = setup();
    for (let i = 0; i < DISABLE_AFTER_FAILURES; i++) {
      await service.attempt(KEY, wrong);
      advance(60 * 60_000);
    }

    expect(docs.get(KEY)?.expiresAt).toBeNull();
    advance(365 * 24 * 60 * 60_000);
    await expect(service.attempt(KEY, right)).rejects.toMatchObject({
      decision: { reason: 'disabled' },
    });
    expect(right).not.toHaveBeenCalled();

    await expect(service.unlock(KEY)).resolves.toBe(true);
    await expect(service.attempt(KEY, right)).resolves.toBe(true);
  });

  // Sans la file par clé, ces dix requêtes liraient toutes « 0 échec » et
  // seraient toutes examinées.
  it('should examine simultaneous attempts one after the other', async () => {
    const { service, wrong } = setup();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.attempt(KEY, wrong)),
    );

    expect(wrong).toHaveBeenCalledTimes(5);
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(5);
  });

  it('should keep separate counters for separate keys', async () => {
    const { service, wrong, right } = setup();
    await failTimes(service, 5, wrong);

    await expect(service.attempt('account:other', right)).resolves.toBe(true);
  });

  it('should log when waiting periods start, naming the key', async () => {
    const { service, wrong } = setup();
    const warn = jest.spyOn(Logger.prototype, 'warn');
    await failTimes(service, 5, wrong);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(KEY));
  });
});
