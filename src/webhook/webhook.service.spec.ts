import { ConfigService } from '@nestjs/config';
import { PureJwtUtil } from '@syldel/crypto-utils';
import { HttpClientService } from '../utils/http-client.service';
import { WebhookService } from './webhook.service';

const SECRET = 'b2'.repeat(32);

function serviceWith(targets: string, request: jest.Mock) {
  const config = {
    get: (key: string) =>
      ({ WEBHOOK_SYNC_TARGETS: targets, JWT_SERVICE_SECRET: SECRET })[key],
  } as unknown as ConfigService;
  return new WebhookService(config, {
    request,
  } as unknown as HttpClientService);
}

// notifyAll ne rend pas sa promesse : on laisse les envois se terminer.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('WebhookService', () => {
  it('should send nothing when no target is configured', () => {
    const request = jest.fn();
    serviceWith('', request).notifyAll();
    expect(request).not.toHaveBeenCalled();
  });

  // Le gateway et le bot vérifient ce jeton avec JWT_SERVICE_SECRET avant de
  // rafraîchir leur cache : il doit être signé, et ne vivre qu'une minute.
  it('should sign a short-lived token the receivers can verify', () => {
    const request = jest.fn().mockResolvedValue({});
    serviceWith('http://gateway/sync', request).notifyAll();

    const headers = (request.mock.calls as [string, RequestInit][])[0][1]
      .headers as Record<string, string>;
    const token = headers.Authorization.replace(/^Bearer /, '');
    const payload = PureJwtUtil.verify<{ iat: number; exp: number }>(
      token,
      SECRET,
    );
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60);
  });

  it('should still notify the other targets when one fails', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 502: down'))
      .mockResolvedValue({});
    const service = serviceWith(' http://a/sync , http://b/sync ', request);

    service.notifyAll();
    await flush();

    expect((request.mock.calls as [string][]).map(([url]) => url)).toEqual([
      'http://a/sync',
      'http://b/sync',
    ]);
  });
});
