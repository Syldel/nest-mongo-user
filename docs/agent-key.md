# La clé d'agent et son expiration

L'agent (« API wallet » Hyperliquid) signe les ordres à la place du wallet maître. Sa clé privée
n'entre dans le système que par `scripts/set-agent-key.ts`, qui la scelle (JWE, crypto-utils
≥ 2.0.0) pour un utilisateur. Depuis le 2026-11-05, le script enregistre aussi, **dans la même
mise à jour**, les données publiques de l'agent :

| champ (`users.agent`) | d'où il vient                                                       |
| --------------------- | ------------------------------------------------------------------- |
| `address`             | **dérivée de la clé saisie** (`EthAddressUtil`, crypto-utils 3.1.0) |
| `name`                | recopié de la page API de Hyperliquid, 1 à 16 caractères            |
| `validUntil`          | recopié de la colonne « Valid Until » de cette page, obligatoire    |
| `keyUpdatedAt`        | l'instant de l'enregistrement                                       |

Pourquoi : un agent expiré se découvrait par un refus ambigu de l'exchange, au milieu d'un ordre
(`User or API Wallet 0x… does not exist.`, 2026-10-29), message que la doc officielle donne aussi
pour une signature fausse. Ces données sont **déclarées** à la saisie, pas lues chez Hyperliquid.

## Qui s'en sert

- **`/auth/me`** les renvoie (le sous-document n'est pas en `select: false`, la clé si) : le
  mobile affiche l'agent sur la page Profile, `Agent · 42 d` en pied de menu, et une ligne
  d'avertissement dans les vues qui signent, orange à 14 jours et rouge à 3 jours.
- **`GET /internal/users/:id/agent-credentials`** renvoie `{ agentKey, agent }`, `agent` valant
  `null` sans données. Le gateway refuse alors de signer (HTTP 412), comme pour un agent expiré
  ou une clé dont l'adresse n'est pas celle déclarée. Voir `nest-hyperliquid-gateway/README.md`.

Le sous-schéma rend chaque champ obligatoire : un `agent` partiel est refusé à l'écriture, il
n'est jamais enregistré sans expiration. Une donnée mal formée en base est refusée à la lecture
(`readStoredAgent`), jamais prise pour « pas d'expiration ».

## Ce que la page API de Hyperliquid montre

Relevé par l'utilisateur le 2026-11-05, sur https://app.hyperliquid.xyz/API, avec un agent de
test créé puis retiré :

- « Generate » crée la clé, qui ne s'affiche **qu'une fois**, avant « Authorize » ;
- le nom est obligatoire (« must be less than 17 characters ») ;
- « Days Valid » est obligatoire, et MAX y met 180, le maximum de la doc ;
- la signature se fait avec le wallet maître (Rabby) ;
- le tableau affiche `API Wallet Name`, `API Wallet Address`, `Valid Until`, ce dernier écrit
  `04/05/2027 13:00:28`.

Un agent créé depuis cette page a donc **toujours** un nom et une expiration.

⚠️ **Le fuseau est déduit, pas mesuré.** L'agent a été autorisé vers 12:00 à Paris (11:00 UTC),
et 11:00:28 UTC + 180 × 24 h donne 13:00:28 en heure d'été de Paris. La page afficherait donc
l'heure **locale du navigateur**, au format de la locale française, jour d'abord. D'où une
saisie `DD/MM/YYYY HH:mm:ss` lue dans le fuseau **du navigateur**, que le script demande : celui
de la machine n'est proposé que par défaut (Entrée), puisqu'un serveur en UTC décalerait tout de
deux heures sans rien dire. Seul un nom IANA est accepté ; un décalage fixe (`+01:00`) est
refusé, car il ignore l'heure d'été. Le fuseau était codé en dur (`Europe/Paris`) jusqu'au
2026-11-05. Le
premier appel à `extraAgents` (info, documenté seulement dans le SDK Python) au test final
tranchera : il renvoie `validUntil` en entier, d'unité non documentée.

## Le déroulé du script

1. choisir l'utilisateur ;
2. coller la clé privée de l'agent (saisie masquée, jamais réaffichée) ;
3. **comparer l'adresse affichée** à celle de la page API : sinon rien n'est enregistré ;
4. saisir le nom, le fuseau du navigateur (Entrée : celui de la machine), puis « Valid Until »
   recopié tel quel ;
5. **relire la date en toutes lettres** (« Tuesday 4 May 2027, 13:00:28 Europe/Paris = …Z UTC,
   in 180.0 days ») et confirmer : c'est le seul contrôle d'une inversion jour/mois qui reste
   dans les 180 jours ;
6. clé maîtresse et `kid`, scellement, aller-retour vérifié, confirmation, enregistrement ;
7. redémarrer le gateway, qui garde les clés en cache sept jours.

Refusés à la saisie, en le nommant : un autre format, une date qui n'existe pas (31/02, l'heure
sautée au passage à l'heure d'été), une heure ambiguë (celle qui se répète en octobre), une date
passée, plus de 180 jours après maintenant (avec dix minutes de marge d'horloge).

⚠️ Le script exige `@syldel/crypto-utils` ≥ 3.1.0 (`EthAddressUtil`), et un Node dont l'OpenSSL
fournit `keccak-256` (Node 24.22, OpenSSL 3.5.9 : oui ; le Node 20 de la production n'a pas été
vérifié, et le script s'arrêterait alors en le disant).
