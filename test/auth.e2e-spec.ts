import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomBytes } from 'crypto';
import { AppModule } from '../src/app.module';
import {
  generateExpiredUserToken,
  generateServiceToken,
} from './helpers/jwt.helper';
import { User } from '../src/users/user.schema';

describe('Auth e2e', () => {
  let app: INestApplication<App>;

  const randomHex = (bytes: number): string =>
    randomBytes(bytes).toString('hex');

  const wallet = `0x${randomHex(20)}`;
  const username = 'TestUser_01';
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
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
      expect(user.username).toBe(username.toLowerCase());
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('agentKey');
    });

    describe('❌ Register - invalid usernames', () => {
      const invalidUsernames = [
        'jo', // too short
        '_john', // starts with _
        'john_', // ends with _
        'john__doe', // double _
        'john..doe', // double .
        'john--doe', // double -
        'john#doe', // invalid char
        'john doe', // space
        'a'.repeat(21), // too long
      ];

      it.each(invalidUsernames)(
        'should reject username: "%s"',
        async (username) => {
          const res = await request(app.getHttpServer())
            .post('/auth/register')
            .send({
              username,
              walletAddress: `0x${randomHex(20)}`,
              password: 'password123',
            })
            .expect(400);

          const body = res.body as {
            statusCode: number;
            message: string[] | string;
            error: string;
          };

          expect(body.message).toBeDefined();
          if (Array.isArray(body.message)) {
            expect(body.message.join(' ')).toContain('Username must be');
          } else {
            expect(body.message).toContain('Username must be');
          }
        },
      );
    });

    it('❌ cannot register same wallet twice', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          walletAddress: wallet,
          username: 'other_username',
          password,
        })
        .expect(409);
    });

    it('❌ cannot register same username twice', async () => {
      const otherWallet = `0x${randomHex(20)}`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          walletAddress: otherWallet,
          username,
          password,
        })
        .expect(409);
    });
  });

  describe('login user', () => {
    it('✅ login user (with walletAddress)', async () => {
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

    it('✅ login user (with username)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          username,
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
      const otherWallet = `0x${randomHex(20)}`;
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: otherWallet,
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
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('agentKey');
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
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('agentKey');
  });

  describe('change password', () => {
    const initialPassword = password;
    const newPassword = 'NewPassword123!';
    const anotherPassword = 'AnotherPassword123!';

    it('✅ changes password successfully', async () => {
      await request(app.getHttpServer())
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: initialPassword,
          newPassword,
          confirmPassword: newPassword,
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: wallet,
          password: initialPassword,
        })
        .expect(401);

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: wallet,
          password: newPassword,
        })
        .expect(201);

      expect(res.body).toHaveProperty('access_token');
    });

    it('❌ fails if current password is wrong', async () => {
      await request(app.getHttpServer())
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'WrongPassword!',
          newPassword: anotherPassword,
          confirmPassword: anotherPassword,
        })
        .expect(401);
    });

    it('❌ fails if passwords do not match', async () => {
      await request(app.getHttpServer())
        .patch('/auth/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: newPassword,
          newPassword: 'Mismatch123!',
          confirmPassword: 'Different123!',
        })
        .expect(400);
    });

    it('❌ fails without authentication', async () => {
      await request(app.getHttpServer())
        .patch('/auth/password')
        .send({
          currentPassword: newPassword,
          newPassword: anotherPassword,
          confirmPassword: anotherPassword,
        })
        .expect(401);
    });
  });
});
