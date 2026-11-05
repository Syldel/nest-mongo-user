import { Error, model, Model } from 'mongoose';
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

  // Public à dessein : `/auth/me` le renvoie au mobile, qui affiche l'expiration.
  it('should select the public agent data by default', () => {
    expect(UserSchema.path('agent').options.select).toBeUndefined();
  });

  describe('agent', () => {
    const UserModel = model('UserSchemaSpec', UserSchema);
    const valid = {
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      name: 'bot_main',
      validUntil: new Date('2027-05-04T11:00:28Z'),
      keyUpdatedAt: new Date('2026-11-05T11:05:00Z'),
    };
    // `validate` rejette avec une ValidationError dont `errors` nomme chaque
    // chemin refusé ; `validateSync` est déprécié par Mongoose 9.
    const errorsOf = async (agent: unknown): Promise<string[]> => {
      try {
        await new UserModel({
          walletAddress: '0xa',
          username: 'alice',
          password: 'x',
          agent,
        }).validate();
        return [];
      } catch (error) {
        return Object.keys((error as Error.ValidationError).errors);
      }
    };

    it('should accept complete agent data, and its absence', async () => {
      expect(await errorsOf(valid)).toEqual([]);
      expect(await errorsOf(undefined)).toEqual([]);
    });

    // Un agent sans expiration enregistré en base passerait pour « inconnu »
    // côté mobile ; il doit être refusé à l'écriture.
    it.each(['address', 'name', 'validUntil', 'keyUpdatedAt'])(
      'should refuse agent data without %s',
      async (field) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [field as keyof typeof valid]: _omitted, ...partial } = valid;
        expect(await errorsOf(partial)).toEqual([`agent.${field}`]);
      },
    );

    it.each([
      ['a malformed address', { address: '0x123' }, 'agent.address'],
      ['a 17-character name', { name: 'x'.repeat(17) }, 'agent.name'],
      ['an unreadable date', { validUntil: 'soon' }, 'agent.validUntil'],
    ])('should refuse %s', async (_label, change, path) => {
      expect(await errorsOf({ ...valid, ...change })).toEqual([path]);
    });
  });
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

  it('should select only the agent key and its public data for the internal route', async () => {
    const { model, projections } = fakeModel();
    await serviceWith(model).findByIdWithAgentKey('u1');
    expect(projections).toEqual(['agentKey agent']);
  });

  // Les deux ensemble ou rien : une clé neuve sous l'expiration de l'ancienne
  // ferait refuser, ou signer, à tort.
  it('should write the agent key and its public data in one update', async () => {
    const findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    const service = new UsersService({
      findByIdAndUpdate,
    } as unknown as ConstructorParameters<typeof UsersService>[0]);
    const agent = {
      address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      name: 'bot_main',
      validUntil: new Date('2027-05-04T11:00:28Z'),
      keyUpdatedAt: new Date('2026-11-05T11:05:00Z'),
    };
    await service.updateAgentKey('u1', 'sealed.jwe', agent);
    expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(findByIdAndUpdate).toHaveBeenCalledWith('u1', {
      $set: { agentKey: 'sealed.jwe', agent },
    });
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
