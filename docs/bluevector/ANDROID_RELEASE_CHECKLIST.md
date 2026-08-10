# Livraison Android BlueVector

## État actuel

L'APK construit par la CI est un artefact **pilote interne** :

- nom visible : `BlueVector` ;
- `compileSdk = 36` ;
- endpoint injecté avec `--dart-define=API_BASE_URL=...` ;
- `applicationId = com.example.mobile_app` ;
- signature release utilisant encore la clé debug ;
- HTTP local autorisé pour les essais sur le même Wi-Fi.

Les trois derniers points interdisent de présenter cet APK comme une release
publique ou définitive.

## Décisions propriétaire requises

1. Identifiant Android irréversible, recommandé sous un domaine détenu, par
   exemple `com.bigdataai.bluevector` si ce namespace appartient réellement à
   l'éditeur.
2. Nom légal de l'éditeur et compte Play Console.
3. Mode de distribution : MDM/privé, test fermé Play Console ou public.
4. URL API HTTPS de pilote et de production.
5. Politique de suivi en arrière-plan et justification Play Console.

## Signature

- générer la clé hors du dépôt ;
- conserver keystore, mots de passe et alias dans un coffre de secrets ;
- ne jamais envoyer ces secrets dans un prompt, un commit ou un ticket ;
- configurer la CI avec des secrets chiffrés ;
- conserver une procédure de récupération et deux responsables identifiés ;
- activer Play App Signing si la distribution passe par Google Play.

## Critères de sortie pilote

- [ ] identifiant et signature release validés ;
- [ ] API HTTPS joignable hors réseau local ;
- [ ] aucune URL locale inscrite dans l'APK ;
- [ ] connexion, workflow complet, offline/outbox et médias testés ;
- [ ] GPS testé en avant-plan, arrière-plan, écran verrouillé et permission
      refusée ;
- [ ] rétention GPS configurée ;
- [ ] version et notes de livraison enregistrées ;
- [ ] APK/AAB reproduit par la CI et hash archivé.
