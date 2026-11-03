import { ArgumentsHost } from '@nestjs/common';
import { formatWait, LoginThrottledFilter } from './login-throttled.filter';
import { LoginThrottledError } from './login-throttle.service';

function capture() {
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    body: undefined as unknown,
  };
  const express = {
    setHeader: (name: string, value: string) => {
      response.headers[name] = value;
    },
    status: (code: number) => {
      response.statusCode = code;
      return express;
    },
    json: (body: unknown) => {
      response.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => express }),
  } as unknown as ArgumentsHost;
  return { response, host };
}

describe('formatWait', () => {
  it.each([
    [1, '1\u00a0s'],
    [30_000, '30\u00a0s'],
    [59_001, '1\u00a0min'],
    [60_000, '1\u00a0min'],
    [60_001, '2\u00a0min'],
    [32 * 60_000, '32\u00a0min'],
    [60 * 60_000, '1\u00a0h'],
  ])(
    'should write %i ms as %j, never shorter than the real wait',
    (ms, text) => {
      expect(formatWait(ms)).toBe(text);
    },
  );
});

describe('LoginThrottledFilter', () => {
  const filter = new LoginThrottledFilter();

  it('should answer 429 with the wait in the message and in Retry-After', () => {
    const { response, host } = capture();
    filter.catch(
      new LoginThrottledError({
        allowed: false,
        reason: 'wait',
        retryAfterMs: 90_500,
      }),
      host,
    );

    expect(response.statusCode).toBe(429);
    expect(response.headers['Retry-After']).toBe('91');
    expect(response.body).toEqual({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many failed sign-in attempts. Try again in 2\u00a0min.',
      retryAfterSeconds: 91,
    });
  });

  it('should say that a disabled sign-in needs an administrator, with no Retry-After', () => {
    const { response, host } = capture();
    filter.catch(
      new LoginThrottledError({ allowed: false, reason: 'disabled' }),
      host,
    );

    expect(response.statusCode).toBe(429);
    expect(response.headers['Retry-After']).toBeUndefined();
    expect(response.body).toMatchObject({
      message:
        'Sign-in is disabled after 100 failed attempts in a row. An administrator must unlock it.',
    });
  });
});
