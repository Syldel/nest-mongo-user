import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PureJwtUtil } from '@syldel/crypto-utils';
import { HttpClientService } from '../utils/http-client.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly targets: string[];
  private readonly jwtSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: HttpClientService,
  ) {
    const rawTargets =
      this.configService.get<string>('WEBHOOK_SYNC_TARGETS') || '';
    this.targets = rawTargets
      .split(',')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    this.jwtSecret = this.configService.get<string>('JWT_SERVICE_SECRET') || '';
  }

  notifyAll(): void {
    if (this.targets.length === 0) return;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const token = PureJwtUtil.sign(
      {
        sub: 'nest-mongo-user',
        iat: nowInSeconds,
        exp: nowInSeconds + 60,
      },
      this.jwtSecret,
    );

    const requests = this.targets.map(async (url) => {
      try {
        await this.httpClient.request(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ event: 'USERS_UPDATED' }),
        });
        this.logger.log(`\uf135 Notification sent to ${url}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ Webhook failure for ${url}: ${message}`);
      }
    });

    Promise.all(requests).catch((e) =>
      this.logger.error('Error during webhook broadcast', e),
    );
  }
}
