# Jetons entre services : un secret partagé, et pourquoi on le garde pour l'instant

> Décision du 2026-11-03 : **reportée**, en connaissance de cause. Ce document dit ce qui est
> en place, ce que la règle établie demande, pourquoi le gain est faible aujourd'hui, et à
> quel moment il cesse de l'être. À relire avant d'ajouter un service, un scope, ou de
> déplacer un service hors du VPS.

## Ce qui est en place

Deux familles de jetons HS256, chacune signée par **un seul secret partagé** entre les trois
services (relevé dans le code le 2026-11-03) :

| Secret               | Détenu par                    | Qui signe                                                                                                                          | Qui vérifie                                                                             |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `JWT_USER_SECRET`    | nest-mongo-user, gateway, bot | nest-mongo-user (`/auth/login`) ; **le bot** aussi, pour appeler le gateway au nom d'un utilisateur (`hyperliquid-api.service.ts`) | nest-mongo-user (`AuthGuard`), gateway (`UserAuthGuard`)                                |
| `JWT_SERVICE_SECRET` | nest-mongo-user, gateway, bot | gateway (`users:read`, `users:agentKey`), bot (`users:read`), nest-mongo-user (webhook, sans scope)                                | nest-mongo-user (`ServiceAuthGuard` puis `ServiceScopeGuard`), gateway et bot (synchro) |

Le scope est **déclaré par l'émetteur** dans le jeton, et `ServiceScopeGuard` ne fait que le
lire. Les routes de synchro du gateway et du bot acceptent tout jeton de service valide, quel
que soit son `sub`.

## Ce que la règle établie demande

- OWASP JSON Web Token Cheat Sheet, section MAC (lue en brut le 2026-11-03) : « A different
  secret must be used for each (issuer, audience) pair. If, for example, the same secret is
  reused for difference audiences, one audience can forge a token (impersonating the issuer). »
- RFC 8725 §3.12 : des règles de validation mutuellement exclusives entre types de jetons,
  par exemple des clés différentes.

Ici, tout détenteur de `JWT_SERVICE_SECRET` peut signer n'importe quel scope sous n'importe
quel `sub`. Une liste des scopes autorisés par émetteur, tenue côté serveur, **ne suffirait
pas** tant que le secret est partagé : le bot signerait simplement `sub:
"nest-hyperliquid-gateway"`.

## Pourquoi le gain est faible aujourd'hui

Le scénario que la règle empêche : le bot, qui n'a besoin que de `users:read`, est compromis
et fabrique un jeton `users:agentKey` pour lire les clés d'agent. Dans cette architecture :

- **ce qu'il lirait est inutilisable** : la clé d'agent est un JWE (crypto-utils ≥ 2.0.0), et
  la clé maîtresse `AGENT_ENCRYPTION_KEYS` n'existe **que dans le gateway** (vérifié par
  recherche dans les trois dépôts le 2026-11-03) ;
- **le bot a déjà davantage** : il détient `JWT_USER_SECRET` et signe des jetons utilisateur
  pour le gateway, par conception. Compromis, il passe déjà des ordres au nom de tout
  utilisateur ; le secret de service ne lui ajoute que des chiffrés ;
- **les autres cas ne changent pas** : un gateway compromis a les clés maîtresses et les clés
  déchiffrées en cache ; nest-mongo-user a la base et les deux secrets ; les trois tournent sur
  le même VPS, et qui prend l'hôte prend tout.

Le seul effet réel du partage, en dehors de ce scénario : n'importe lequel des trois peut
déclencher la synchro des deux autres. Le coût en est une relecture des utilisateurs, borné.

À l'inverse, la correction complète touche les trois dépôts : un secret (ou une paire de clés)
par émetteur, choisi par `kid`, la liste des scopes autorisés par émetteur dans
nest-mongo-user, un `aud` par destinataire, et la distribution et la rotation de ces secrets.

## Quand ce document cesse d'être vrai

Reprendre le sujet dès que l'un de ces points change :

1. **un service quitte le VPS**, ou tourne chez un tiers : il n'a plus « déjà tout » ;
2. **la clé maîtresse des clés d'agent sort du seul gateway** : les chiffrés redeviennent lisibles
   par qui les obtient ;
3. **un nouveau service ne doit avoir que `users:read`**, sans le pouvoir de trader du bot :
   avec le secret partagé, il aurait aussi `users:agentKey` ;
4. **plusieurs utilisateurs aux droits distincts**, ou des jetons utilisateur émis pour d'autres
   destinataires que le gateway et ce service.

La forme à viser ce jour-là, d'après les mêmes sources : des jetons utilisateur signés à clé
publique (EdDSA ou ES256), la clé privée chez nest-mongo-user seul, un `iss` propre au bot pour
les jetons qu'il émet ; pour les services, un secret par émetteur et des scopes accordés par
nest-mongo-user, jamais lus dans le jeton.

## Observé en écrivant cette note

`scripts/generate-service-token.ts` signe `{ service: 'nest-trading-bot', scope }` et non
`sub` : `ServiceAuthGuard` en tire un `id` indéfini. Sans conséquence de sécurité (le scope
reste vérifié), mais un jeton de test qui ne ressemble pas à ceux des services.
