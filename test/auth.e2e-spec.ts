import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  generateExpiredUserToken,
  generateServiceToken,
} from './helpers/jwt.helper';
import { User } from '../src/users/user.schema';

describe('Auth e2e', () => {
  let app: INestApplication<App>;

  const wallet = '0x1111111111111111111111111111111111111111';
  const username = 'testuser';
  const password = 'SuperPassword123';

  let accessToken: string;
  let serviceToken: string;

  beforeAll(async () => {
    process.env.JWT_USER_SECRET = 'test-user-secret';
    process.env.JWT_SERVICE_SECRET = 'test-service-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    serviceToken = generateServiceToken(process.env.JWT_SERVICE_SECRET, [
      'users:write',
    ]);
  });

  afterAll(async () => {
    // cleanup
    await request(app.getHttpServer())
      .delete(`/internal/users/by-wallet/${wallet}`)
      .set('Authorization', `Bearer ${serviceToken}`);

    await app.close();
  });

  describe('register user', () => {
    it('✅ register a user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          walletAddress: wallet,
          username,
          password,
        })
        .expect(201);

      const user = res.body as User;
      expect(user.walletAddress).toBe(wallet);
    });

    it('❌ cannot register same wallet twice', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          walletAddress: wallet,
          username,
          password,
        })
        .expect(409);
    });
  });

  describe('login user', () => {
    it('✅ login user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: wallet,
          password,
        })
        .expect(201);

      const body = res.body as {
        access_token: string;
      };
      expect(body.access_token).toBeDefined();
      accessToken = body.access_token;
    });

    it('❌ login with non-existent wallet', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: '0x0000000000000000000000000000000000000000',
          password: 'anyPassword',
        })
        .expect(401);
    });

    it('❌ login with wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: wallet,
          password: 'WrongPassword123!',
        })
        .expect(401);
    });
  });

  describe('get my profile', () => {
    it('✅ get my profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const user = res.body as User;
      expect(user.walletAddress).toBe(wallet);
    });

    it('❌ get my profile without JWT', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('❌ get my profile with expired JWT', async () => {
      const expiredToken = generateExpiredUserToken(
        process.env.JWT_USER_SECRET!,
      );

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });
  });

  it('✅ update strategy', async () => {
    const res = await request(app.getHttpServer())
      .patch('/auth/strategy')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        bot: 'mean-reversion',
        maxRisk: 2,
      })
      .expect(200);

    const user = res.body as User;
    expect(user.tradingSettings.bot).toBe('mean-reversion');
  });
});
