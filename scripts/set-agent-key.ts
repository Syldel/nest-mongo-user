import { NestFactory } from '@nestjs/core';
import { isValidObjectId } from 'mongoose';
import { AesGcmUtil } from '@syldel/crypto-utils';
import {
  colors,
  promptConfirm,
  promptSelect,
  promptText,
} from '@syldel/micro-clack';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/users/user.schema';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function bootstrap() {
  const HEX64_REGEX = /^[a-fA-F0-9]{64}$/;
  const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
  const AGENT_KEY_REGEX = /^0x[a-fA-F0-9]{64}$/;

  const app = await NestFactory.createApplicationContext(AppModule);

  const usersService = app.get(UsersService);

  const targetId = await promptSelect(
    'Choose id:',
    [
      { label: 'userId', value: 'userId' },
      { label: 'walletAddress', value: 'walletAddress' },
      { label: 'username', value: 'username' },
    ],
    4,
  );

  let user: User | null;
  if (targetId === 'walletAddress') {
    const walletAddress = await promptText('Enter wallet address', {
      validate: (value) =>
        ETH_ADDRESS_REGEX.test(value) ||
        'Invalid wallet address. Must start with 0x and contain 40 hex characters.',
    });
    user = await usersService.findOneByWallet(walletAddress);
  } else if (targetId === 'username') {
    const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;
    const username = await promptText('Enter username', {
      validate: (value) =>
        USERNAME_REGEX.test(value) ||
        'Username must be 3-20 characters long and contain only letters, numbers, "_" or "-".',
    });
    user = await usersService.findOneByUsername(username);
  } else {
    const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;
    const inputUserId = await promptText('Enter user id', {
      validate: (value) =>
        OBJECT_ID_REGEX.test(value) ||
        'Invalid user id. Must be a 24-character hexadecimal string.',
    });
    if (!isValidObjectId(inputUserId)) {
      throw new Error('Invalid user id. Must be a 24-character hex string.');
    }
    user = await usersService.findById(inputUserId);
  }

  console.log('user:', user);

  if (user) {
    const userId = user._id.toString();

    // Les deux secrets sont masqués à la saisie et ne sont jamais réaffichés :
    // la clé d'agent signe des ordres sur le compte, et le terminal garde un
    // historique. micro-clack ≥ 1.0.1 (avant, chaque saisie était même répétée
    // une fois par invite précédente).
    const agentPrivateKey = await promptText('Enter Agent Private Key', {
      mask: true,
      validate: (value) =>
        AGENT_KEY_REGEX.test(value) ||
        'Invalid Agent Private Key. Must start with 0x and be 66 characters long (64 hex characters after 0x).',
    });

    const masterKey = await promptText('Enter Master Key', {
      mask: true,
      validate: (value) =>
        HEX64_REGEX.test(value) ||
        'Invalid Master Key. Must be exactly 64 hexadecimal characters.',
    });

    const encrypted = AesGcmUtil.encrypt(agentPrivateKey, masterKey);
    // L'aller-retour se vérifie toujours, par comparaison et sans affichage :
    // un chiffré illisible enregistré ici ferait refuser tous les ordres.
    if (AesGcmUtil.decrypt(encrypted, masterKey) !== agentPrivateKey) {
      throw new Error('Encryption round-trip failed, nothing saved.');
    }
    console.log(colors.greenText('Encryption round-trip verified'));

    const proceed = await promptConfirm('Save to database?', true);
    if (!proceed) {
      // Refuser l'enregistrement sortait en silence avec le code 0 : on pouvait
      // croire la clé enregistrée. Code non nul, puisque rien n'a été fait.
      console.log(
        colors.yellowText(
          'Nothing saved: the agent key in the database is unchanged.',
        ),
      );
      process.exit(1);
    }
    await usersService.updateAgentKey(userId, encrypted);
    console.log(colors.greenText('Agent key updated successfully'));
    // Le gateway garde les clés déchiffrées 7 jours en mémoire (UserClient) et
    // personne n'appelle sa synchro : sans redémarrage, il signe avec l'ancienne.
    console.log(
      colors.yellowText(
        'Restart nest-hyperliquid-gateway: it caches decrypted agent keys for 7 days.',
      ),
    );
  } else {
    throw new Error('User not found!');
  }

  console.log(colors.cyanText('Wait 6s to close app!'));
  await sleep(6000);
  await app.close();
  console.log(colors.greenText('App closed successfully'));
  process.exit(0);
}

async function main() {
  await bootstrap();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
