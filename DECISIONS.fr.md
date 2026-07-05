# DECISIONS — Choix techniques et justifications

Ce fichier garde la trace des décisions structurantes du projet et leur "pourquoi".
À mettre à jour à chaque choix non-trivial.

---

## D-001 — Stack Node.js + TypeScript

**Date :** 2026-05-20
**Statut :** Acté
**Décision :** Backend en Node.js 20 LTS + TypeScript strict.

**Pourquoi :**
- Zigbee2MQTT lui-même est écrit en Node.js + TypeScript. Rester proche
  techniquement de l'outil qu'on étend simplifie : compréhension du code source,
  réutilisation des libs (`mqtt.js`), et possibilité future de fusionner ou
  contribuer en amont.
- L'utilisateur a déjà une expérience JS/TS.
- Écosystème MQTT mature : `mqtt.js` est la lib utilisée par Z2M, éprouvée
  contre Mosquitto et tous les brokers HA.

**Alternatives écartées :**
- Java / Spring Boot : alourdit l'image Docker (~250 MB vs ~80 MB), aucun
  précédent d'add-on HA significatif en Java, communauté HA peu réceptive.
- Python : excellent fit HA mais l'utilisateur ne connaît pas et apprendre
  en parallèle d'un projet réel multiplie le risque.
- Go : binaire ultra-léger mais courbe d'apprentissage et écosystème HA
  moins fourni que Node.
- Bun / Deno : intéressants mais moins matures pour les libs MQTT/SQLite
  spécifiques. À reconsidérer dans 1-2 ans.

---

## D-002 — Pas de vrai Z2M dans le docker-compose de la Phase 0

**Date :** 2026-05-20
**Statut :** Acté pour la Phase 0
**Décision :** Le docker-compose contient uniquement Mosquitto. Le rôle de
Z2M est joué par un script simulateur Node.js qui publie les payloads
discovery sur le topic source.

**Pourquoi :**
- Zigbee2MQTT a besoin d'un dongle Zigbee USB physique (passthrough host)
  pour fonctionner. Aucun simulateur Zigbee logiciel n'existe officiellement.
- Tester en isolation impose donc de simuler la sortie MQTT de Z2M, pas
  Z2M lui-même.
- Cela isole le test de toute dépendance hardware et permet une boucle
  d'itération rapide.

**Conséquence :**
- Quand la Phase 0 sera validée, étape suivante : capturer des payloads
  réels via `mosquitto_sub` sur le vrai Z2M de l'utilisateur, les comparer
  aux fixtures du simulateur, ajuster si nécessaire.

---

## D-003 — Scripts POC exécutés sur l'hôte, pas en Docker

**Date :** 2026-05-20
**Statut :** Acté pour la Phase 0
**Décision :** Mosquitto tourne dans Docker, mais `simulator`, `proxy` et
`verifier` tournent directement sur la machine de dev via `tsx`.

**Pourquoi :**
- Phase 0 = phase d'itération rapide. Rebuilder une image Docker à chaque
  modification du proxy ralentirait inutilement le cycle.
- Mosquitto n'a aucune raison de tourner sur l'hôte (zéro dépendance utile),
  donc on le containerise.
- Quand le proxy sera stabilisé (fin Phase 1), on le containerisera pour
  la distribution add-on HA.

---

## D-006 — Le helper propose plusieurs stratégies, jamais une valeur unique

**Date :** 2026-05-20
**Statut :** Acté — à implémenter en Phase 2/3 (helper UI), à anticiper
dans le modèle de données dès la Phase 1.
**Décision :** Quand l'utilisateur sélectionne un groupe d'ampoules pour
créer une règle de normalisation, le helper ne suggère **jamais une valeur
unique**. Il propose au minimum 3 stratégies avec leurs trade-offs explicites :

1. **Intersection** — plage que TOUTES les ampoules supportent
   physiquement. Honnête mais conservatrice. Aucune saturation.
2. **Majorité (mode)** — plage du sous-groupe le plus représenté dans
   la sélection. Les minorités saturent aux extrêmes.
3. **Union** — plage la plus large possible. Plusieurs ampoules
   sautireront aux deux bouts. UI HA uniforme mais peu fidèle.

Plus une option **Personnalisée** où l'utilisateur entre des valeurs libres.

**Pourquoi :**
- Un parc d'ampoules est rarement homogène. Forcer l'intersection
  pénalise injustement la majorité quand quelques ampoules ont des
  capacités physiques élargies (ou réduites).
- L'utilisateur doit comprendre ce qu'il choisit — chaque stratégie
  vient avec une phrase explicite sur l'effet pour les minorités.
- Évite l'effet "magic number" où l'utilisateur applique une
  recommandation sans saisir pourquoi.

**Conséquence pour le modèle de données :**
- Le champ `targets` d'une règle est toujours une **liste explicite**
  (jamais "all" implicite). Patterns acceptés : IEEE addresses
  individuelles, `@group:<nom>`, `@vendor:<nom>`, `@model:<nom>`, `*`.
- Une `priority` numérique permet de cumuler plusieurs règles : la
  plus spécifique l'emporte sur la plus générale.

---

## D-005 — Yarn 4 (Berry) via Corepack, linker node_modules

**Date :** 2026-05-20
**Statut :** Acté
**Décision :** Le package manager est **Yarn 4** (alias Berry), bootstrappé
automatiquement par **Corepack** (intégré à Node 16.10+). Le linker est
configuré sur `node-modules` (pas PnP) dans `.yarnrc.yml`.

**Pourquoi Yarn 4 plutôt que npm :**
- Résolveur de dépendances plus fiable et plus rapide.
- `yarn dlx` (équivalent `npx`) sans pollution du registre global.
- Workspaces natifs propres — utile quand on aura backend + frontend.
- L'écosystème Z2M / Home Assistant n'est lié à aucun package manager
  spécifique, donc le choix est libre.

**Pourquoi Corepack plutôt qu'installation globale :**
- Le champ `packageManager` dans `package.json` pinne la version exacte.
- Tout dev qui clone le repo a automatiquement la bonne version de Yarn
  sans rien installer (Corepack télécharge à la volée).
- Reproductibilité parfaite, zéro friction.

**Pourquoi `nodeLinker: node-modules` et pas PnP :**
- Compatibilité maximale avec `tsx`, les outils tiers et VS Code (pas de
  SDK PnP à configurer).
- PnP a des avantages réels (perf, isolation stricte) mais ajoute du
  setup pour zéro gain visible sur un POC de cette taille.
- Décision révisable plus tard si la perf devient un goulot.

---

## D-004 — Anti-loop par cache mémoire de payload

**Date :** 2026-05-20
**Statut :** Acté pour la Phase 0
**Décision :** Le proxy garde une `Map<topic, string>` du dernier payload
publié par topic. Si un message entrant produit un payload sérialisé
identique au dernier publié, on ne republie pas.

**Pourquoi :**
- Évite la boucle infinie si jamais le topic source et le topic cible
  finissaient par se croiser (config utilisateur erronée, multiple
  instances du proxy, etc.).
- Réduit le bruit MQTT inutile.
- Trivial à implémenter, suffit pour Phase 0.

**Limite :** mémoire perdue au redémarrage. C'est volontaire : au démarrage
le proxy republie de toute façon tous les retained, c'est cohérent.
