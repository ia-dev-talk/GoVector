# Rapport de validation B0 — 10 août 2026

Base auditée : `125847b` (`origin/bluevector-ai-review`). Branche locale de travail : `codex/v2.1-b0`. Aucun push.

## Backend

- Suite complète : `161 passed, 2 skipped`.
- Compilation Python : réussie.
- Graphe Alembic : une tête `re5f6a7b8c9d`.
- Contrat runtime : aucun doublon `(méthode, chemin)`.
- Toutes les routes `/api/v1` sont authentifiées sauf les deux logins explicitement publics.
- Stock : `/api/v1/stock` conserve le contrat legacy `EquipmentInventory`; les lignes FTTH simplifiées sont sur `/api/v1/stock/lines`.
- Identités stock (`returned_by`, `created_by`, `counted_by`) : refusées dans les DTO clients et dérivées du JWT.
- OCR : aucun fallback synthétique; une lecture impossible retourne une absence de résultat.

## Frontend

- Installation déterministe `npm ci` : réussie.
- Tests contractuels Node : `5 passed`.
- Build Vite production : réussi.
- Lint global : échec connu, `56 errors` et `27 warnings`. Les erreurs couvrent surtout règles React 19 sur effets/refs, variables legacy et composants créés pendant le rendu. B0 ne désactive aucune règle pour obtenir un faux vert.
- Avertissement build : chunk AG Grid supérieur à 500 kB; optimisation différée.

## Mobile/Android

Flutter n’est pas installé dans l’environnement d’audit, donc `flutter analyze`, `flutter test` et l’APK n’ont pas été réexécutés ici. Les derniers résultats fournis avant B0 étaient 44 tests Flutter réussis et build local fonctionnel après `compileSdk = 36`; ils doivent être reconfirmés sur le poste Flutter ou en CI.

Blocages avant bêta publique :

- `applicationId = com.example.mobile_app`;
- build release signé avec la clé debug;
- absence de job CI Flutter reproductible.

Commandes de confirmation sur le poste Windows :

```powershell
cd C:\Users\Guest\Desktop\optmontana\fieldopt\mobile_app
flutter pub get
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
flutter build apk --release --dart-define=API_BASE_URL=http://192.168.1.225:8080/api/v1
```

## Validation manuelle prioritaire

Exécuter le scénario B de `ACCEPTANCE_SCENARIOS.md` sur deux comptes techniciens et un orienteur : adresse seule, position planifiée, GPS live, repère explicite, entrée/sortie câble, synchronisation/rejeu, consultation frontend et héritage au passage suivant.
