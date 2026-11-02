import { Model } from 'mongoose';
import { User, UserSchema } from './user.schema';
import { UsersService } from './users.service';

/**
 * Un modèle Mongoose réduit à ce que UsersService appelle : chaque requête
 * retient la projection passée à `select`, pour vérifier ce qui sortirait.
 */
function fakeModel() {
  const projections: string[] = [];
  type Query = { select: jest.Mock<Query, [string]>; exec: jest.Mock };
  const query: Query = {
    select: jest.fn((fields: string) => {
      projections.push(fields);
      return query;
    }),
    exec: jest.fn().mockResolvedValue(null),
  };
  const model = {
    findOne: jest.fn((): Query => query),
    findById: jest.fn((): Query => query),
    find: jest.fn((): Query => query),
  };
  return { model, projections };
}

describe('User schema', () => {
  // Ces deux options sont la première ligne de défense : toute requête qui
  // ne les redemande pas explicitement ne lit ni le hash ni la clé chiffrée.
  it.each(['password', 'agentKey'])(
    'should never select %s unless asked to',
    (path) => {
      expect(UserSchema.path(path).options.select).toBe(false);
    },
  );
});

describe('UsersService', () => {
  function serviceWith(model: unknown) {
    return new UsersService(model as Model<User>);
  }

  // Seule la route interne protégée par `users:agentKey` lit la clé d'agent.
  it.each([
    ['findById', 'u1'],
    ['findAll', undefined],
    ['findOneByWallet', '0xabc'],
    ['findOneByUsername', 'alice'],
  ] as const)('should keep the agent key out of %s', async (method, arg) => {
    const { model, projections } = fakeModel();
    await (serviceWith(model)[method] as (a?: string) => Promise<unknown>)(arg);
    expect(projections).toHaveLength(1);
    expect(projections[0].split(' ')).toContain('-agentKey');
  });

  it.each(['findById', 'findAll'] as const)(
    'should keep the password hash out of %s, which reaches callers',
    async (method) => {
      const { model, projections } = fakeModel();
      await serviceWith(model)[method]('u1');
      expect(projections[0].split(' ')).toContain('-password');
    },
  );

  it('should select only the agent key for the internal route', async () => {
    const { model, projections } = fakeModel();
    await serviceWith(model).findByIdWithAgentKey('u1');
    expect(projections).toEqual(['agentKey']);
  });

  it('should strip the password hash and agent key from a created user', async () => {
    const saved = {
      _id: 'u1',
      username: 'alice',
      password: '$2b$10$hash',
      agentKey: { data: 'aa', iv: 'bb', tag: 'cc' },
    };
    const model = jest.fn(() => ({
      save: () => Promise.resolve({ toObject: () => saved }),
    }));

    const created = await serviceWith(model).create({});

    expect(created).toEqual({ _id: 'u1', username: 'alice' });
  });

  it('should refuse trading settings above 10 000 characters', async () => {
    const model = { findByIdAndUpdate: jest.fn() };
    const huge = { notes: 'x'.repeat(10_000) };

    await expect(serviceWith(model).updateStrategy('u1', huge)).rejects.toThrow(
      'Settings object is too large',
    );
    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
