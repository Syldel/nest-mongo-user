import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { generateServiceToken, generateUserToken } from './helpers/jwt.helper';

describe('Internal users (service-to-service)', () => {
  let app: INestApplication<App>;
  let serviceToken: string;
  let userToken: string;

  const userId = '7982701baeeaa6a235ae1ec6';

  beforeAll(async () => {
    process.env.JWT_USER_SECRET = 'test-user-secret';
    process.env.JWT_SERVICE_SECRET = 'test-service-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    serviceToken = generateServiceToken(process.env.JWT_SERVICE_SECRET);
    userToken = generateUserToken(process.env.JWT_USER_SECRET);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('get all users', () => {
    it('✅ allows access with valid service token', async () => {
      await request(app.getHttpServer())
        .get('/internal/users')
        .set('Authorization', `Bearer ${serviceToken}`)
        .expect(200);
    });

    it('❌ rejects user token', async () => {
      await request(app.getHttpServer())
        .get('/internal/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(401);
    });

    it('❌ rejects missing token', async () => {
      await request(app.getHttpServer()).get('/internal/users').expect(401);
    });

    it('❌ rejects service token without scope', async () => {
      const badScopeToken = generateServiceToken(
        process.env.JWT_SERVICE_SECRET || '',
        [],
      );

      await request(app.getHttpServer())
        .get('/internal/users')
        .set('Authorization', `Bearer ${badScopeToken}`)
        .expect(403);
    });
  });

  describe('get agent-credentials', () => {
    it('❌ rejects missing token', async () => {
      await request(app.getHttpServer())
        .get(`/internal/users/${userId}/agent-credentials`)
        .expect(401);
    });

    it('❌ returns 403 if service token has no required scope', async () => {
      const badScopeToken = generateServiceToken(
        process.env.JWT_SERVICE_SECRET || '',
        [],
      );

      await request(app.getHttpServer())
        .get(`/internal/users/${userId}/agent-credentials`)
        .set('Authorization', `Bearer ${badScopeToken}`)
        .expect(403);
    });

    it('❌ returns 403 if missing users:agentKey scope', async () => {
      const badScopeToken = generateServiceToken(
        process.env.JWT_SERVICE_SECRET || '',
        ['users:read'],
      );

      await request(app.getHttpServer())
        .get(`/internal/users/${userId}/agent-credentials`)
        .set('Authorization', `Bearer ${badScopeToken}`)
        .expect(403);
    });

    it('❌ returns 404 if user has no agentKey', async () => {
      const goodScopeToken = generateServiceToken(
        process.env.JWT_SERVICE_SECRET || '',
        ['users:read', 'users:agentKey'],
      );

      await request(app.getHttpServer())
        .get(`/internal/users/${userId}/agent-credentials`)
        .set('Authorization', `Bearer ${goodScopeToken}`)
        .expect(404);
    });
  });
});
