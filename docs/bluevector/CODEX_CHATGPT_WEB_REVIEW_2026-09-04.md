# Évaluation de codex-chatgpt-web — 4 septembre 2026

Décision : expérimentation isolée possible à étudier, aucune installation ni
intégration opérationnelle effectuée. Aucun nouveau dépôt n'est nécessaire pour
le travail BlueVector/Hermes de cette session.

## Périmètre vérifié

Dépôt public [miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web),
snapshot `44c130bf227c982fe0d5ff4d1d7c329df6c989a9`, package 5.0.0, licence MIT.
Clone de lecture séparé : README, SECURITY, modèle de sécurité, package, configuration,
serveur HTTP et traitement des confirmations navigateur consultés. Les 46 fichiers
de tests présents ne constituent pas une preuve de réussite : aucun test du projet,
installateur, navigateur authentifié ou tunnel n'a été exécuté.

## Ce que le projet apporte

Il relie les tâches Codex à ChatGPT Web par un navigateur embarqué, avec transport
Responses/streaming. Le mode complet fait revenir les appels d'outils vers la tâche
Codex via MCP. L'interface, la continuité de contexte et le cycle de vie des outils
sont les principales idées intéressantes pour nos recherches.

Il ne fournit pas de modèle local et ne rend pas l'inférence indépendante d'OpenAI.
Le contexte envoyé est traité par ChatGPT. La disponibilité dépend du compte et de
l'interface Web ; les annonces de modèles ou de quotas du README ne sont pas une
validation des droits de notre compte. Source : [README versionné](https://github.com/miuuyy/codex-chatgpt-web/blob/44c130bf227c982fe0d5ff4d1d7c329df6c989a9/README.md).

## Observations de code et limites

- `src/config.ts` refuse une adresse autre que `127.0.0.1` ; `src/server.ts`
  utilise cette adresse et contrôle un jeton sur les opérations d'administration.
- Le modèle de sécurité annonce que le point d'entrée Responses n'a pas de secret
  bearer indépendant. Ce n'est donc pas une frontière contre un processus exécuté
  sous le même compte système, ni un service à exposer directement sur le LAN.
- Le mode complet peut demander les outils de la tâche, y compris des écritures.
  Le projet dépend des autorisations du runtime hôte. Les réponses du modèle et
  les contenus de dépôts restent des entrées non fiables.
- `resolveChatGptToolConfirmation` peut cliquer une confirmation lorsque
  `autoApproveToolCalls` est explicitement activé. Cette option n'est pas une
  protection à ajouter à notre profil QA.
- Le mode nommé « Zero Risk » réduit l'automatisation de la page, mais ce nom
  ne démontre pas l'absence de risques liés aux outils, aux données ou au compte.

Référence : [modèle de sécurité versionné](https://github.com/miuuyy/codex-chatgpt-web/blob/44c130bf227c982fe0d5ff4d1d7c329df6c989a9/docs/security-model.md).

## Conséquences pour BlueVector et le home lab

Conserver BlueVector, PostgreSQL, médias, sauvegardes et observabilité indépendants
du fournisseur IA. Le profil Hermes QA à la demande reste adapté aux contrôles de
code ; l'Agent Orienteur reste une simulation backend à permissions canoniques.

Un éventuel essai de cette passerelle doit utiliser un projet synthétique séparé,
sans données client, sans accès à la base habituelle et avec autorisations d'outils
bornées. Vérifier d'abord le contrat fournisseur applicable, la portée exacte des
outils, l'annulation et la reprise après erreur. Aucun gain de quota ni conformité
contractuelle n'est garanti par cette revue statique.

Pour une véritable stack IA locale, il reste à inventorier le matériel du futur
serveur et à mesurer un modèle local sur nos tâches. Ce dépôt ne résout pas ce
besoin et ne justifie pas de multiplier les fournisseurs ou installations maintenant.
