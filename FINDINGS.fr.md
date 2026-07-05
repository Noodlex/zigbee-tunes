# FINDINGS — Phase 0

Notes prises pendant la validation du POC.

## Date de validation : 2026-05-20

## Format des payloads discovery Z2M (capturé en prod le 2026-05-20)

**Environnement réel** : Z2M 2.10.1, HA Core 2026.5.3, HA OS 17.3 (aarch64 / RPi 4).

**Topic structure** : `homeassistant/light/<ieee>/light/config`. Le wildcard
`+/+/+/config` capture correctement. Mosquitto accepte les caractères
accentués et les espaces dans les topics dérivés (`zigbee2mqtt/Salle à manger 4`).

**Champs présents dans un payload light CCT Z2M 2.10.1** :

```jsonc
{
  "availability": [                          // tableau d'objets (pas string !)
    { "topic": "zigbee2mqtt/bridge/state",
      "value_template": "{{ value_json.state }}" }
  ],
  "brightness": true,
  "brightness_scale": 254,
  "command_topic": "zigbee2mqtt/<friendly>/set",
  "default_entity_id": "light.<object_id>",  // utilisé par HA pour l'entity_id
  "device": {
    "hw_version": <int>,
    "identifiers": ["zigbee2mqtt_<ieee>"],
    "manufacturer": "Innr|IKEA|YSRSAI|...",
    "model": "<full marketing name>",
    "model_id": "<short ref>",               // ex: "RS 227 T"
    "name": "<friendly_name>",
    "sw_version": "<x.y.z>",
    "via_device": "zigbee2mqtt_bridge_<bridge_ieee>"
  },
  "effect": true,
  "effect_list": [...],
  "max_mireds": <int>,                       // PRÉSENT au top-level ✓
  "min_mireds": <int>,                       // PRÉSENT au top-level ✓
  "name": null,                              // null → HA prend device.name
  "object_id": "<friendly>",
  "origin": { "name": "Zigbee2MQTT", "sw": "2.10.1", "url": "..." },
  "schema": "json",
  "state_topic": "zigbee2mqtt/<friendly>",
  "supported_color_modes": ["color_temp"] | ["xy", "color_temp"],
  "unique_id": "<ieee>_light_zigbee2mqtt"
}
```

**Pas de `color_temp_kelvin`** en Z2M 2.10.1 — les mireds restent la
source de vérité. À surveiller dans les versions futures.

**Groupes** : Z2M publie aussi des payloads discovery pour les groupes
(ex: `Cuisine`, `Salon`). Format identique avec `device.model: "Group"`
et `device.manufacturer: "Zigbee2MQTT"`. L'ieee du topic est un nombre
encodé : `1221051039810110150109113116116_<group_id>`. **Le proxy
clampe aussi les groupes**, ce qui est exactement le cas d'usage cible.

**QoS** : Z2M publie en QoS 0. Mon proxy publiait en QoS 1, j'ai aligné
le simulateur sur QoS 0 pour fidélité. Le proxy reste sur QoS 1 (sans
effet sur le résultat pour des retained).

**Plages observées dans le parc réel** (24 lights) :
| Vendor | Modèle | Plage mireds | Kelvin |
|--------|--------|--------------|--------|
| Innr | RS 227/228/229 T | 200-454 | 2200-5000K |
| IKEA | LED1545G12, LED1732G11 | 250-454 | 2200-4000K |
| YSRSAI | YSR-MINI-01_wwcw | 153-500 | 2000-6535K |

→ **Intersection honnête** : 250-454 (2200-4000K).
→ Cas typique pour Zigbee Tunes : uniformiser tout le parc dans une plage
commune choisie par l'utilisateur, sans avoir à reconfigurer chaque
ampoule individuellement.

## Comportements observés et validés

### Transformation des champs mireds — OK
Le proxy clampe correctement `min_mireds` et `max_mireds` dans
l'intervalle cible [200, 333] :

```
[proxy] 0x001788010aaa0001/light mireds 153-454 → 200-333
[proxy] 0x842e14fffe000002/light mireds 250-454 → 250-333
[proxy] 0xbc33acfffe000003/light mireds 200-370 → 200-333
```

Le `verifier` confirme la réception côté HA :
```
=== homeassistant/light/0x001788010aaa0001/light/config ===
  min_mireds  : 200 (5000K — le plus froid)
  max_mireds  : 333 (3003K — le plus chaud)
```

### Anti-loop — OK
Le proxy a imprimé exactement 3 lignes (une par device), puis silence.
Aucun re-traitement en boucle. La structure topic source / topic cible
distincte garantit qu'il n'y a pas de boucle au niveau MQTT.

### Persistance retained à travers les restarts — OK
Dans la session de test, le verifier a reçu les 3 messages
`homeassistant/...` avant même que le proxy soit démarré (run en cours).
→ Mosquitto a bien retenu les payloads publiés lors d'une exécution
précédente du proxy. Le redémarrage du proxy n'introduit pas de
duplication visible côté broker (Mosquitto remplace le payload retained
au même topic).

### Subscribe re-fetch les retained — OK
Au démarrage, le proxy reçoit immédiatement les 3 retained du topic
source et les retransforme. Comportement attendu pour MQTT QoS 1
avec retain.

## Pièges rencontrés

### PowerShell : execution policy bloque `yarn.ps1`
Erreur initiale `PSSecurityException` au premier `yarn verifier`.
Résolu en une commande : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
À documenter pour les futurs contributeurs Windows dans le README de
la Phase 1.

### Choix de Yarn 4.15.0 vs 4.5.3 (mon premier guess)
Ma version initiale (4.5.3) datait de mon cutoff de connaissances et
était périmée. Vérifié la vraie dernière via l'API GitHub releases
de `yarnpkg/berry`. À retenir : ne jamais faire confiance à un numéro
de version "le plus récent" donné de mémoire, toujours vérifier.

## Décisions à prendre suite à la Phase 0

1. **Avant la Phase 1** : capturer des payloads discovery réels depuis
   ton vrai Z2M (`mosquitto_sub -t 'homeassistant/#' -v` sur ton broker
   home), comparer aux fixtures du simulateur, ajuster si différences.
2. **Stack Phase 1** : Fastify + better-sqlite3 + ESM TypeScript déjà
   esquissés dans DECISIONS. À confirmer définitivement au démarrage
   de la Phase 1.

## Recommandation finale

- [x] **GO** : le concept tient, on peut attaquer la Phase 1.
- [ ] PIVOT : il y a un blocage X qu'il faut résoudre avant.
- [ ] ABANDON : Z2M a un comportement Y qui rend le proxy non viable.

Le proxy intercepte, transforme et republie comme attendu. La seule
incertitude restante (format exact des payloads Z2M 2.x) se résout
par une capture sur le vrai Z2M avant d'écrire le code Phase 1.

---

# Phase 1 — Validation en production réelle (2026-05-24)

Zigbee Tunes lancé contre un vrai broker Mosquitto add-on HA sur le LAN,
authentifié avec un utilisateur MQTT dédié. Z2M reconfiguré avec
`homeassistant.discovery_topic: z2m_discovery` via la frontend Z2M
puis restart Z2M.

**Étape 1 (Zigbee Tunes idle, Z2M encore sur `homeassistant`)** :
- Connexion broker + auth OK
- `bridge/devices` reçu : **40 devices** catalogués (lights, capteurs,
  prises, switches, coordinateur)
- Aucun message sur `z2m_discovery/...` (attendu — Z2M pas encore basculé)
- HA strictement inchangé

**Étape 2 (Z2M bascule sur `z2m_discovery`)** :
- **22 transformations effectuées** en ~15 secondes :
  - Innr 200-454 → 250-454 (min clampé)
  - YSRSAI 153-500 → 250-454 (deux bornes clampées)
  - Groupes Z2M (Salle à manger, Plan de travail, Salon) **également
    clampés** — cas d'usage principal validé
- Détection no-op confirmée : IKEA (déjà 250-454), Cuisine 1/2, groupe
  Cuisine → 0 republish inutile
- Non-lights traversent sans modification
- Côté HA UI : sélecteurs de température de couleur affichent bien
  2200K-4000K pour toutes les ampoules clampées
- Fenêtre de risque pendant le restart Z2M : **invisible côté HA**
  (< 1s entre publication Z2M et republish Zigbee Tunes)

**Persistance MQTT** : tant que Zigbee Tunes tourne, les retained sur
`homeassistant/...` sont maintenus. Si Zigbee Tunes s'arrête, HA garde l'état
clampé (retained persistent dans le broker) mais ne reçoit plus d'updates
jusqu'à redémarrage Zigbee Tunes. Pour la prod long terme, packaging en
add-on HA (Phase 4) reste nécessaire.

**Recommandation Phase 1** :
- [x] **VALIDÉ EN PROD** : passer à Phase 2 (API REST + WebSocket)
      ou Phase 4 (packaging add-on HA) selon la priorité utilisateur.
