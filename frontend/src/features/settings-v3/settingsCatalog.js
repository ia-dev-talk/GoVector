export const SETTINGS_NAV_GROUPS = Object.freeze([
  {
    id: 'control',
    label: 'Centre de contrôle',
    items: [
      {
        id: 'overview',
        label: 'Vue d’ensemble',
        description: 'État de la configuration active',
        status: 'active',
        icon: 'overview',
        keywords: [
          'général',
          'plateforme',
          'runtime',
          'configuration',
        ],
      },
      {
        id: 'operational',
        label: 'Exploitation',
        description: 'Règles terrain persistées',
        status: 'connected',
        icon: 'location',
        keywords: [
          'gps',
          'ancien',
          'supervision',
          'cockpit',
          'seuil',
        ],
      },
    ],
  },
  {
    id: 'organization',
    label: 'Organisation',
    items: [
      {
        id: 'organization-admin',
        label: 'Équipes & clients',
        description: 'Organisation terrain et accès entreprises',
        status: 'connected',
        icon: 'modules',
        keywords: ['équipe', 'client', 'iam', 'orange', 'unifiber', 'orienteur'],
      },
      {
        id: 'modules',
        label: 'Référentiels métier',
        description: 'Accès aux modules réels',
        status: 'available',
        icon: 'modules',
        keywords: [
          'personnel',
          'secteurs',
          'stocks',
          'interventions',
          'rapports',
        ],
      },
      {
        id: 'integrations',
        label: 'Intégrations',
        description: 'Praxedo, QGIS et mobile',
        status: 'planned',
        icon: 'plug',
        keywords: [
          'praxedo',
          'qgis',
          'qfield',
          'api',
          'mobile',
          'smtp',
        ],
      },
    ],
  },
  {
    id: 'system',
    label: 'Gouvernance',
    items: [
      {
        id: 'roadmap',
        label: 'Capacités à connecter',
        description: 'Feuille de route sans faux contrôles',
        status: 'planned',
        icon: 'roadmap',
        keywords: [
          'utilisateurs',
          'rôles',
          'sécurité',
          'sauvegardes',
          'notifications',
        ],
      },
      {
        id: 'about',
        label: 'À propos',
        description: 'Version et architecture',
        status: 'readOnly',
        icon: 'info',
        keywords: [
          'version',
          'docker',
          'fastapi',
          'react',
          'bluevector',
        ],
      },
    ],
  },
]);


export const MODULE_SHORTCUTS = Object.freeze([
  {
    id: 'personnel',
    page: 'personnel',
    label: 'Personnel',
    eyebrow: 'Ressources terrain',
    description:
      'Techniciens, affectations, compétences, horaires et organisation.',
    icon: 'users',
  },
  {
    id: 'sectors',
    page: 'secteurs',
    label: 'Secteurs',
    eyebrow: 'Référentiel géographique',
    description:
      'Secteurs opérationnels et rattachement relationnel des techniciens.',
    icon: 'map',
  },
  {
    id: 'stocks',
    page: 'stocks',
    label: 'Stocks FTTH',
    eyebrow: 'Logistique',
    description:
      'Catalogue, dépôts, réceptions, quantités et historique réel.',
    icon: 'package',
  },
  {
    id: 'interventions',
    page: 'interventions',
    label: 'Interventions',
    eyebrow: 'Exploitation FTTH',
    description:
      'Planification, affectation, suivi et fiche intervention.',
    icon: 'clipboard',
  },
  {
    id: 'reports',
    page: 'rapports',
    label: 'Rapports',
    eyebrow: 'Analytique',
    description:
      'Performance, qualité des données et centre d’export sécurisé.',
    icon: 'chart',
  },
  {
    id: 'supervision',
    page: 'supervision',
    label: 'Supervision',
    eyebrow: 'Temps réel',
    description:
      'Carte, signaux opérationnels, priorités et activité du terrain.',
    icon: 'monitor',
  },
]);


export const INTEGRATION_CAPABILITIES = Object.freeze([
  {
    id: 'praxedo',
    label: 'Praxedo',
    category: 'Orchestration',
    status: 'planned',
    description:
      'Synchronisation des interventions, statuts, preuves et comptes rendus.',
    dependency:
      'Contrat API, mapping des statuts et stratégie de résolution des conflits.',
    icon: 'plug',
  },
  {
    id: 'qgis',
    label: 'QGIS / QField',
    category: 'Géographique',
    status: 'planned',
    description:
      'Couches FTTH, formulaires terrain, coordonnées et mesures réseau.',
    dependency:
      'Schéma géospatial partagé et règles de synchronisation hors ligne.',
    icon: 'map',
  },
  {
    id: 'mobile',
    label: 'Application technicien',
    category: 'Terrain',
    status: 'connected',
    description:
      'V2 terrain : workflow, actions libres, médias, GPS et synchronisation offline.',
    dependency:
      'Poursuivre la contractualisation backend sans réintroduire de wizard imposé.',
    icon: 'mobile',
  },
  {
    id: 'smtp',
    label: 'Notifications',
    category: 'Communication',
    status: 'planned',
    description:
      'Alertes opérationnelles, escalades SLA et notifications ciblées.',
    dependency:
      'Canaux, modèles, destinataires et politique de fréquence.',
    icon: 'mail',
  },
]);


export const ROADMAP_CAPABILITIES = Object.freeze([
  {
    id: 'identity',
    label: 'Utilisateurs et rôles',
    status: 'backendRequired',
    description:
      'Comptes, permissions granulaires, délégations et sessions.',
    nextStep:
      'Définir le modèle RBAC cible et exposer un CRUD administrateur audité.',
  },
  {
    id: 'workflow',
    label: 'Statuts et workflows',
    status: 'backendRequired',
    description:
      'Transitions, motifs, validations et règles par activité/opérateur.',
    nextStep:
      'Créer un moteur de workflow versionné consommé par le web et le mobile.',
  },
  {
    id: 'forms',
    label: 'Formulaires terrain',
    status: 'backendRequired',
    description:
      'Champs dynamiques, preuves obligatoires, mesures et contrôles qualité.',
    nextStep:
      'Établir un schéma JSON versionné avec contraintes par type d’intervention.',
  },
  {
    id: 'security',
    label: 'Sécurité et audit',
    status: 'partial',
    description:
      'Journal d’audit existant, politiques de sécurité encore à administrer.',
    nextStep:
      'Ajouter des endpoints de politique avant toute interface d’édition.',
  },
  {
    id: 'backup',
    label: 'Sauvegardes',
    status: 'backendRequired',
    description:
      'Planification, rétention, restauration et vérification d’intégrité.',
    nextStep:
      'Implémenter le service backend et tester la restauration avant exposition.',
  },
  {
    id: 'mobileConfig',
    label: 'Configuration mobile',
    status: 'planned',
    description:
      'Actions, widgets, preuves, formulaires et règles synchronisées.',
    nextStep:
      'Faire du backend la source de vérité avant l’implémentation Flutter.',
  },
]);


export function flattenNavigation() {
  return SETTINGS_NAV_GROUPS.flatMap(
    (group) => group.items,
  );
}
