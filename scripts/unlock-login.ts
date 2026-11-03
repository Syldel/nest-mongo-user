import { NestFactory } from '@nestjs/core';
import { isValidObjectId } from 'mongoose';
import {
  colors,
  promptConfirm,
  promptSelect,
  promptText,
} from '@syldel/micro-clack';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/users/user.schema';
import { LoginThrottleService } from '../src/auth/login-throttle/login-throttle.service';

/**
 * Rouvre la connexion d'un compte : efface son compteur d'échecs. Seul moyen
 * de sortir d'une désactivation après 100 échecs consécutifs (NIST SP
 * 800-63B-4 §3.2.2 : l'authentifiant désactivé doit être rattaché de nouveau).
 * À ne lancer qu'en sachant pourquoi le compte a été bloqué : les journaux du
 * service nomment la clé au 5e et au 100e échec.
 */
async function main() {
  const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
  const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const throttle = app.get(LoginThrottleService);

  const by = await promptSelect(
    'Find the account by:',
    [
      { label: 'username', value: 'username' },
      { label: 'walletAddress', value: 'walletAddress' },
      { label: 'userId', value: 'userId' },
    ],
    3,
  );

  let user: User | null;
  if (by === 'walletAddress') {
    const wallet = await promptText('Enter wallet address', {
      validate: (v) =>
        ETH_ADDRESS_REGEX.test(v) ||
        'Must be 0x followed by 40 hex characters.',
    });
    user = await usersService.findOneByWallet(wallet.toLowerCase());
  } else if (by === 'userId') {
    const id = await promptText('Enter user id', {
      validate: (v) =>
        (OBJECT_ID_REGEX.test(v) && isValidObjectId(v)) ||
        'Must be 24 hex characters.',
    });
    user = await usersService.findById(id);
  } else {
    const username = await promptText('Enter username');
    user = await usersService.findOneByUsername(username.trim().toLowerCase());
  }

  if (!user) {
    await app.close();
    throw new Error('User not found, nothing unlocked.');
  }

  const key = `account:${user._id.toString()}`;
  const proceed = await promptConfirm(
    `Unlock sign-in for ${user.username} (${key})?`,
    false,
  );
  if (!proceed) {
    console.log(colors.yellowText('Nothing changed.'));
    await app.close();
    process.exit(1);
  }

  const removed = await throttle.unlock(key);
  console.log(
    removed
      ? colors.greenText(
          `Sign-in unlocked for ${user.username}: failed attempts forgotten.`,
        )
      : colors.yellowText(
          `${user.username} had no failed attempts recorded: nothing to unlock.`,
        ),
  );
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
