# BlueVector — Handoff tenant Praxedo — Livraison 14 septembre 2026

## But

Ce document est la fiche unique à remplir à partir de la documentation officielle du tenant Praxedo de recette. **Ne jamais deviner une URL, un WSDL, un champ ou une opération.**

Références publiques Praxedo :

- https://www.praxedo.fr/api-web-services/
- https://www.praxedo.fr/nos-connecteurs-erp-crm-api/
- https://www.praxedo.fr/tour-produit/compte-rendu-intervention/

Praxedo documente publiquement la synchronisation bidirectionnelle de référentiels, interventions, comptes-rendus et informations de stock/consommation. Les chemins API et contrats détaillés du tenant restent à récupérer dans l'espace client / auprès du support ou intégrateur.

---

## 1. Environnement de recette

À récupérer :

- tenant / région : ____________________
- URL API sandbox HTTPS : ____________________
- production interdite pendant la recette : OUI
- version API / Web Services : ____________________
- documentation officielle : ____________________
- contact intégrateur / support : ____________________

Ne pas coller les secrets dans ce document.

---

## 2. Authentification

Choisir uniquement ce qui est confirmé par le tenant :

- [ ] HTTP Basic
- [ ] OAuth2 client credentials
- [ ] autre mécanisme documenté : ____________________

Si OAuth2 :

- token URL HTTPS : ____________________
- scope(s) : ____________________

Les valeurs secrètes sont injectées par environnement :

```text
PRAXEDO_BASE_URL=
PRAXEDO_AUTH_MODE=
PRAXEDO_USERNAME=
PRAXEDO_PASSWORD=
PRAXEDO_CLIENT_ID=
PRAXEDO_CLIENT_SECRET=
PRAXEDO_TOKEN_URL=
PRAXEDO_SCOPE=
```

---

## 3. Alias BlueVector obligatoires

Les clés ci-dessous sont **nos alias internes stables**. La colonne “chemin tenant” doit contenir uniquement le chemin relatif confirmé par la documentation Praxedo.

| Alias BlueVector | Chemin tenant officiel | Méthode | Objet |
| --- | --- | --- | --- |
| `technician_list` | ____________________ | GET | techniciens / ressources |
| `intervention_get` | ____________________ | GET | intervention |
| `article_list` | ____________________ | GET | catalogue articles |
| `work_report_write` | ____________________ | POST/PATCH | compte-rendu / données terrain |
| `stock_movement_write` | ____________________ | POST/PATCH | consommation / mouvement stock |

Configuration finale :

```text
PRAXEDO_ENDPOINTS_JSON={...}
```

Aucune URL absolue n'est acceptée dans ce JSON ; les chemins sont relatifs à `PRAXEDO_BASE_URL`.

---

## 4. Idempotence / retries — décision obligatoire

À faire confirmer explicitement :

- l'API accepte-t-elle une clé d'idempotence sur `work_report_write` ? ____________________
- sur `stock_movement_write` ? ____________________
- nom exact du header si disponible : ____________________
- durée de déduplication côté Praxedo : ____________________
- comportement d'un replay identique : ____________________

Seulement si le contrat le confirme :

```text
PRAXEDO_IDEMPOTENCY_HEADER=<header officiel>
```

Sinon BlueVector bloque le replay automatique d'une écriture dont le résultat est indéterminé après timeout/crash. Le receipt reste `sending` et doit être réconcilié avant tout renvoi manuel.

---

## 5. Mapping intervention

À documenter pour `intervention_get` :

- identifiant Praxedo stable : ____________________
- numéro / référence métier : ____________________
- statut : ____________________
- technicien / ressource : ____________________
- client / site : ____________________
- adresse : ____________________
- date prévue : ____________________
- date terminée : ____________________
- formulaire / compte-rendu : ____________________
- champs personnalisés : ____________________

### Dictionnaire des statuts

| Praxedo | BlueVector | Autorité |
| --- | --- | --- |
| ____________________ | ____________________ | ____________________ |
| ____________________ | ____________________ | ____________________ |
| ____________________ | ____________________ | ____________________ |

Aucune transition de statut ne doit être inventée par BlueVector.

---

## 6. Mapping stock / articles

À confirmer :

- identifiant article stable : ____________________
- référence / SKU : ____________________
- libellé : ____________________
- unité : ____________________
- numéro de série : ____________________
- MAC : ____________________
- dépôt / stock technicien : ____________________
- consommation : ____________________
- transfert : ____________________
- annulation / correction : ____________________

### Câble

Pour chaque référence câble utilisée :

| Référence BlueVector | ID article Praxedo | Unité Praxedo | Unité BlueVector | Conversion |
| --- | --- | --- | --- | --- |
| ____________________ | ____________________ | ____________________ | m | ____________________ |

**Aucune consommation automatique de câble n'est activée tant que cette table n'est pas validée.**

---

## 7. Mapping compte-rendu / longueur câble

À confirmer dans le formulaire/CR Praxedo :

- champ entrée câble : ____________________
- champ sortie câble : ____________________
- champ longueur câble : ____________________
- type du champ longueur : ____________________
- unité : ____________________
- champ commentaire : ____________________
- pièces / consommations : ____________________

BlueVector calcule la longueur canonique à partir des repères métriques physiques lorsqu'ils sont disponibles. Le champ Praxedo n'est qu'une projection du résultat canonique.

---

## 8. Pagination / quotas / erreurs

À récupérer :

- pagination : ____________________
- taille page max : ____________________
- rate limit : ____________________
- `Retry-After` utilisé : OUI / NON
- timeout conseillé : ____________________
- codes d'erreur métier : ____________________
- taille payload max : ____________________
- pièces jointes : limites / format : ____________________

---

## 9. Flux entrant Praxedo -> BlueVector

Confirmer le mécanisme :

- [ ] webhook / push officiel
- [ ] API de delta / changements
- [ ] polling par date de modification
- [ ] polling complet paginé

Détails : ____________________

BlueVector n'exposera pas un webhook générique non documenté. Le mécanisme entrant sera implémenté selon le contrat réel du tenant.

---

## 10. Gate G4 — recette réelle

Praxedo est considéré prêt uniquement si :

- [ ] endpoint readiness BlueVector indique `ready_for_read=true` ;
- [ ] auth sandbox réussie ;
- [ ] lecture d'une intervention réelle sandbox ;
- [ ] external ID lié à l'intervention BlueVector ;
- [ ] lecture d'un article ;
- [ ] mapping d'un technicien ;
- [ ] écriture d'un champ de test ;
- [ ] envoi d'un compte-rendu de test ;
- [ ] envoi d'une consommation de test ;
- [ ] longueur câble reçue dans le bon champ ;
- [ ] replay sans doublon si idempotence supportée ;
- [ ] cas timeout / `sending` réconcilié si pas d'idempotence ;
- [ ] journal `/api/v1/audit/integrations` vérifié ;
- [ ] aucune écriture production.

Diagnostic non-secret BlueVector :

```text
GET /api/v1/audit/integrations/readiness/praxedo
```
