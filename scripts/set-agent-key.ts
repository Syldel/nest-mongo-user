import { NestFactory } from '@nestjs/core';
import { isValidObjectId } from 'mongoose';
import { EthAddressUtil, JweUtil } from '@syldel/crypto-utils';
import {
  colors,
  promptConfirm,
  promptSelect,
  promptText,
} from '@syldel/micro-clack';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { User } from '../src/users/user.schema';
import { agentKeyContext } from '../src/users/agent-key';
import {
  DASHBOARD_FORMAT_HINT,
  describeValidUntil,
  masterWalletRefusal,
  parseDashboardValidUntil,
  resolveTimeZone,
  validateAgentName,
} from '../src/users/agent-validity';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function bootstrap() {
  const HEX64_REGEX = /^[a-fA-F0-9]{64}$/;
  const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
  const AGENT_KEY_REGEX = /^0x[a-fA-F0-9]{64}$/;
  // Le format que JweUtil accepte pour un identifiant de clé.
  const KID_REGEX = /^[a-z0-9-]{1,32}$/;

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

    // L'adresse se dérive de la clé, elle ne se recopie pas : la comparer à
    // celle de la page API attrape une clé collée par erreur (un autre agent,
    // une clé tronquée qui reste au bon format).
    const agentAddress = EthAddressUtil.fromPrivateKey(agentPrivateKey);
    // Avant toute question : la clé du wallet maître ne s'enregistre jamais,
    // même si l'adresse affichée était confirmée par erreur.
    const masterRefusal = masterWalletRefusal(agentAddress, user.walletAddress);
    if (masterRefusal) {
      console.log(colors.redText(`Nothing saved: ${masterRefusal}`));
      process.exit(1);
    }
    console.log(
      colors.cyanText(`Agent address derived from this key: ${agentAddress}`),
    );
    const sameAddress = await promptConfirm(
      'Does the API page show exactly this API Wallet Address?',
      false,
    );
    if (!sameAddress) {
      console.log(
        colors.yellowText(
          'Nothing saved: the key does not match the agent on the API page.',
        ),
      );
      process.exit(1);
    }

    const agentName = await promptText(
      'Enter API Wallet Name (as on the API page)',
      {
        validate: validateAgentName,
      },
    );

    // La page API affiche « Valid Until » dans le fuseau du navigateur qui l'a
    // ouverte. Celui de cette machine n'est qu'une proposition : ce peut être
    // un serveur en UTC. Le fuseau retenu est réécrit dans la confirmation.
    const machineTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timeZoneInput = await promptText(
      `Time zone of the browser showing the API page (IANA name, Enter for ${machineTimeZone})`,
      {
        validate: (value) => {
          const result = resolveTimeZone(value, machineTimeZone);
          return result.ok || result.reason;
        },
      },
    );
    const zone = resolveTimeZone(timeZoneInput, machineTimeZone);
    if (!zone.ok) throw new Error(`Time zone refused: ${zone.reason}`);
    const timeZone = zone.timeZone;

    // Recopiée de la colonne « Valid Until », obligatoire : sans elle, le
    // gateway refuse de signer, et le mobile ne peut pas prévenir avant
    // l'expiration.
    const validUntilInput = await promptText(
      `Enter Valid Until (${DASHBOARD_FORMAT_HINT}, ${timeZone} time, as on the API page)`,
      {
        validate: (value) => {
          const result = parseDashboardValidUntil(value, timeZone, new Date());
          return result.ok || result.reason;
        },
      },
    );
    const parsed = parseDashboardValidUntil(
      validUntilInput,
      timeZone,
      new Date(),
    );
    if (!parsed.ok) {
      // L'invite vient de l'accepter ; seule une seconde écoulée entre les deux
      // (une date à la limite) peut la refuser ici.
      throw new Error(`Valid Until refused: ${parsed.reason}`);
    }
    const validUntil = parsed.validUntil;
    // Le mois en toutes lettres : une inversion jour/mois qui reste dans les
    // 180 jours ne se voit qu'ici.
    console.log(
      colors.cyanText(
        `Valid until ${describeValidUntil(validUntil, timeZone, new Date())}`,
      ),
    );
    const sameDate = await promptConfirm('Is this the right date?', false);
    if (!sameDate) {
      console.log(colors.yellowText('Nothing saved.'));
      process.exit(1);
    }

    const masterKey = await promptText('Enter Master Key', {
      mask: true,
      validate: (value) =>
        HEX64_REGEX.test(value) ||
        'Invalid Master Key. Must be exactly 64 hexadecimal characters.',
    });

    // Le nom de la clé maîtresse, écrit en clair dans le JWE : le gateway
    // choisit sa clé par ce nom dans AGENT_ENCRYPTION_KEYS (`kid:hex,...`).
    const kid = await promptText('Enter Master Key id (kid, e.g. 2026-11)', {
      validate: (value) =>
        KID_REGEX.test(value) ||
        'Invalid key id. Use 1-32 characters among a-z, 0-9 and "-".',
    });

    // Lié à l'utilisateur : recopié sur un autre, le gateway le refuse.
    const context = agentKeyContext(userId);
    const sealed = JweUtil.seal(agentPrivateKey, {
      kid,
      key: masterKey,
      context,
    });
    // L'aller-retour se vérifie toujours, par comparaison et sans affichage :
    // un chiffré illisible enregistré ici ferait refuser tous les ordres.
    if (
      JweUtil.open(sealed, { keys: { [kid]: masterKey }, context }) !==
      agentPrivateKey
    ) {
      throw new Error('Encryption round-trip failed, nothing saved.');
    }
    console.log(colors.greenText(`Sealed for ${context} with key id "${kid}"`));

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
    await usersService.updateAgentKey(userId, sealed, {
      address: agentAddress,
      name: agentName,
      validUntil,
      keyUpdatedAt: new Date(),
    });
    console.log(colors.greenText('Agent key updated successfully'));
    // Le gateway garde les clés déchiffrées 7 jours en mémoire (UserClient) et
    // personne n'appelle sa synchro : sans redémarrage, il signe avec l'ancienne.
    console.log(
      colors.yellowText(
        `Restart nest-hyperliquid-gateway: it caches decrypted agent keys for 7 days, and AGENT_ENCRYPTION_KEYS must hold "${kid}".`,
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
