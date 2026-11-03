# Hachage des mots de passe : bcrypt aujourd'hui, Argon2id un jour

> Décision du 2026-11-03 : **passer à Argon2id un jour, sans urgence.** C'est la cible à terme
> (rester indéfiniment sur ce que l'OWASP appelle un système hérité n'en est pas une), à faire
> à une occasion calme : à froid, le changement coûte moins qu'après une fuite. Rien ne le
> presse aujourd'hui, son vrai bénéfice supposant une fuite de la base. Ce document dit ce qui
> est en place, ce que les références recommandent, pourquoi ce n'est pas maintenant, ce qui le
> rendrait urgent, et comment le faire.

## Ce qui est en place

- bcrypt au coût 10 (`auth.service.ts`, `register` et `changePassword`).
- Mot de passe limité à **72 octets UTF-8** (`auth.dto.ts`, `BCRYPT_MAX_BYTES`) : bcrypt ignore
  ce qui dépasse, donc le dépassement est refusé plutôt que tronqué en silence.
- Au moins 15 caractères à l'inscription et au changement (NIST SP 800-63B-4).
- Un hash factice comparé pour un compte inconnu, pour que la réponse prenne le même temps
  (`DUMMY_PASSWORD_HASH`), et la limitation par compte (`login-throttle/`).

## Ce que les références recommandent (lues en brut le 2026-11-03)

- OWASP Password Storage Cheat Sheet, résumé : « Use Argon2id with a minimum configuration of
  19 MiB of memory, an iteration count of 2, and 1 degree of parallelism ». bcrypt n'y figure
  plus que « for legacy systems », avec un coût d'au moins 10 et la limite de 72 octets.
- OWASP Authentication Cheat Sheet : une longueur maximale d'au moins 64 caractères, pour les
  phrases de passe. 72 octets la tiennent en ASCII, pas avec des caractères multi-octets
  (64 « é » font 128 octets).
- Node fournit `crypto.argon2` depuis la v24.7.0 (`doc/api/crypto.md` de la branche v24.x,
  sans marqueur « experimental ») : aucune dépendance ne serait nécessaire.

## Pourquoi pas maintenant

| Gain                                          | Ce qu'il vaut ici                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plus de plafond à 72 octets                   | Quasi nul : il ne gêne qu'un mot de passe de plus de 72 octets, ce qu'une phrase de passe ASCII n'atteint pas.                                                                    |
| Résistance au cassage hors ligne              | Réelle, mais **seulement après une fuite de la base**, et l'OWASP tient encore bcrypt au coût 10 pour acceptable.                                                                 |
| Une dépendance native en moins                | Modeste : bcrypt 6.0.0 est mûr et embarque ses binaires, y compris `linux-x64/bcrypt.musl.node` pour l'image `node:24-alpine` (vérifié dans `node_modules`, pas en construisant). |
| Plus rapide (mesuré : 17,7 ms contre 39,3 ms) | Sans importance pour une connexion.                                                                                                                                               |

En face : un analyseur du format PHC à écrire et à lire strictement, une période à deux
algorithmes avec migration à la connexion, une API Node encore jeune, et 19 Mio de mémoire par
calcul dont la simultanéité n'a pas été mesurée. Les protections qui jouent **avant** une fuite
(limitation, temps constant, secrets JWT, chiffrement des clés d'agent) passent d'abord.

## Ce qui le rendrait urgent

Sans attendre l'occasion calme, dès que l'un de ces points se présente :

1. **un mot de passe réel dépasse 72 octets**, ou des utilisateurs veulent des phrases de passe
   non ASCII ;
2. **la base a fuité, ou le risque de fuite change** (hébergement, sauvegardes, accès tiers) ;
3. **bcrypt pose un problème de dépendance** : binaire absent pour l'architecture du VPS (arm64
   en musl n'a pas été vérifié), faille, abandon du paquet ;
4. **plusieurs utilisateurs** : plus de hashes, donc plus à gagner à les rendre chers.

## Comment le faire

1. hacher avec `crypto.argon2('argon2id', …)` aux paramètres de l'OWASP (m=19456, t=2, p=1),
   stockés avec le hash au format PHC (`$argon2id$v=19$m=19456,t=2,p=1$sel$hash`), et
   éprouver l'implémentation contre le vecteur Argon2id de la RFC 9106 §5.3 ;
2. à la connexion, vérifier un hash `$2b$` avec bcrypt puis le remplacer par un hash Argon2id
   (OWASP, « Upgrading Legacy Hashes ») ; passer `DUMMY_PASSWORD_HASH` en Argon2id ;
3. relever le plafond de 72 octets à une borne contre les mots de passe démesurés, au moins
   64 caractères de tout type ;
4. retirer bcrypt une fois vérifié en base qu'il ne reste aucun hash `$2b$` ;
5. mesurer la mémoire sous des connexions simultanées avant de déployer.
