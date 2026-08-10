import 'package:flutter/material.dart';

/// Modèle de workflow étendu pour le technicien FTTH
/// 14 étapes du cycle complet d'intervention
enum WorkflowStep {
  connexion('connexion', 'Connexion', Icons.login_rounded, 0, 'Authentification'),
  accueil('accueil', 'Accueil', Icons.home_rounded, 1, 'Vue d\'ensemble du jour'),
  mes_interventions('mes_interventions', 'Mes interventions', Icons.assignment_rounded, 2, 'Liste des interventions'),
  preparation('preparation', 'Préparation', Icons.checklist_rounded, 3, 'Checklist matériel EPI'),
  navigation('navigation', 'Navigation', Icons.directions_car_rounded, 4, 'Trajet vers le client'),
  arrivee('arrivee', 'Arrivée', Icons.location_on_rounded, 5, 'Arrivé sur site'),
  diagnostic('diagnostic', 'Diagnostic', Icons.search_rounded, 6, 'Questionnaire FTTH'),
  installation('installation', 'Installation FTTH', Icons.cable_rounded, 7, 'Assistant installation'),
  mesures('mesures', 'Mesures', Icons.science_rounded, 8, 'Saisie des mesures'),
  photos('photos', 'Photos', Icons.camera_alt_rounded, 9, 'Documentation photo'),
  tests('tests', 'Tests', Icons.speed_rounded, 10, 'Tests de validation'),
  validation('validation', 'Validation', Icons.verified_rounded, 11, 'Vérification finale'),
  cloture('cloture', 'Clôture', Icons.done_all_rounded, 12, 'Synthèse et fin'),
  synchronisation('synchronisation', 'Synchronisation', Icons.sync_rounded, 13, 'Envoi des données');

  final String status;
  final String label;
  final IconData icon;
  final int step;
  final String description;

  const WorkflowStep(this.status, this.label, this.icon, this.step, this.description);

  static WorkflowStep fromStatus(String? status) {
    if (status == null) return WorkflowStep.accueil;
    return WorkflowStep.values.firstWhere(
      (s) => s.status == status,
      orElse: () => WorkflowStep.accueil,
    );
  }

  static WorkflowStep fromStepIndex(int index) {
    return WorkflowStep.values.firstWhere(
      (s) => s.step == index,
      orElse: () => WorkflowStep.accueil,
    );
  }

  bool get isTerminal => this == WorkflowStep.cloture || this == WorkflowStep.synchronisation;
  bool get isInitial => this == WorkflowStep.connexion || this == WorkflowStep.accueil;
}

/// Résultat d'une étape de diagnostic
class DiagnosticResult {
  final bool clientPresent;
  final bool pboFound;
  final bool ptoExists;
  final bool fourreauLibre;
  final bool passageCable;
  final bool armoireAccessible;
  final bool splitterIdentifie;
  final bool puissanceExistante;
  final String? commentaire;

  DiagnosticResult({
    required this.clientPresent,
    required this.pboFound,
    required this.ptoExists,
    required this.fourreauLibre,
    required this.passageCable,
    required this.armoireAccessible,
    required this.splitterIdentifie,
    required this.puissanceExistante,
    this.commentaire,
  });

  bool get isInstallationPossible =>
      clientPresent && pboFound && armoireAccessible && splitterIdentifie;

  factory DiagnosticResult.fromJson(Map<String, dynamic> json) {
    return DiagnosticResult(
      clientPresent: json['client_present'] ?? false,
      pboFound: json['pbo_found'] ?? false,
      ptoExists: json['pto_exists'] ?? false,
      fourreauLibre: json['fourreau_libre'] ?? false,
      passageCable: json['passage_cable'] ?? false,
      armoireAccessible: json['armoire_accessible'] ?? false,
      splitterIdentifie: json['splitter_identifie'] ?? false,
      puissanceExistante: json['puissance_existante'] ?? false,
      commentaire: json['commentaire'],
    );
  }

  Map<String, dynamic> toJson() => {
        'client_present': clientPresent,
        'pbo_found': pboFound,
        'pto_exists': ptoExists,
        'fourreau_libre': fourreauLibre,
        'passage_cable': passageCable,
        'armoire_accessible': armoireAccessible,
        'splitter_identifie': splitterIdentifie,
        'puissance_existante': puissanceExistante,
        'commentaire': commentaire,
      };

  DiagnosticResult copyWith({
    bool? clientPresent,
    bool? pboFound,
    bool? ptoExists,
    bool? fourreauLibre,
    bool? passageCable,
    bool? armoireAccessible,
    bool? splitterIdentifie,
    bool? puissanceExistante,
    String? commentaire,
  }) {
    return DiagnosticResult(
      clientPresent: clientPresent ?? this.clientPresent,
      pboFound: pboFound ?? this.pboFound,
      ptoExists: ptoExists ?? this.ptoExists,
      fourreauLibre: fourreauLibre ?? this.fourreauLibre,
      passageCable: passageCable ?? this.passageCable,
      armoireAccessible: armoireAccessible ?? this.armoireAccessible,
      splitterIdentifie: splitterIdentifie ?? this.splitterIdentifie,
      puissanceExistante: puissanceExistante ?? this.puissanceExistante,
      commentaire: commentaire ?? this.commentaire,
    );
  }
}

/// Résultat des tests
class TestResult {
  final bool internetOk;
  final bool voyantsOk;
  final bool wifiOk;
  final bool telephoneOk;
  final bool tvOk;
  final bool pingOk;
  final double? debitMbps;
  final double? puissanceDbm;
  final String? commentaire;

  TestResult({
    required this.internetOk,
    required this.voyantsOk,
    required this.wifiOk,
    required this.telephoneOk,
    required this.tvOk,
    required this.pingOk,
    this.debitMbps,
    this.puissanceDbm,
    this.commentaire,
  });

  bool get allPassed => internetOk && voyantsOk && wifiOk && telephoneOk && tvOk && pingOk;

  factory TestResult.fromJson(Map<String, dynamic> json) {
    return TestResult(
      internetOk: json['internet_ok'] ?? false,
      voyantsOk: json['voyants_ok'] ?? false,
      wifiOk: json['wifi_ok'] ?? false,
      telephoneOk: json['telephone_ok'] ?? false,
      tvOk: json['tv_ok'] ?? false,
      pingOk: json['ping_ok'] ?? false,
      debitMbps: (json['debit_mbps'] as num?)?.toDouble(),
      puissanceDbm: (json['puissance_dbm'] as num?)?.toDouble(),
      commentaire: json['commentaire'],
    );
  }

  Map<String, dynamic> toJson() => {
        'internet_ok': internetOk,
        'voyants_ok': voyantsOk,
        'wifi_ok': wifiOk,
        'telephone_ok': telephoneOk,
        'tv_ok': tvOk,
        'ping_ok': pingOk,
        'debit_mbps': debitMbps,
        'puissance_dbm': puissanceDbm,
        'commentaire': commentaire,
      };

  TestResult copyWith({
    bool? internetOk,
    bool? voyantsOk,
    bool? wifiOk,
    bool? telephoneOk,
    bool? tvOk,
    bool? pingOk,
    double? debitMbps,
    double? puissanceDbm,
    String? commentaire,
  }) {
    return TestResult(
      internetOk: internetOk ?? this.internetOk,
      voyantsOk: voyantsOk ?? this.voyantsOk,
      wifiOk: wifiOk ?? this.wifiOk,
      telephoneOk: telephoneOk ?? this.telephoneOk,
      tvOk: tvOk ?? this.tvOk,
      pingOk: pingOk ?? this.pingOk,
      debitMbps: debitMbps ?? this.debitMbps,
      puissanceDbm: puissanceDbm ?? this.puissanceDbm,
      commentaire: commentaire ?? this.commentaire,
    );
  }
}

/// Matériel de la checklist de préparation
class EquipmentChecklist {
  bool epi;
  bool escabeau;
  bool perceuse;
  bool soudeuse;
  bool cliveuse;
  bool pto;
  bool ont;
  bool routeur;
  bool jarretieres;
  bool lingettes;
  bool photometre;
  bool styloOptique;

  EquipmentChecklist({
    this.epi = false,
    this.escabeau = false,
    this.perceuse = false,
    this.soudeuse = false,
    this.cliveuse = false,
    this.pto = false,
    this.ont = false,
    this.routeur = false,
    this.jarretieres = false,
    this.lingettes = false,
    this.photometre = false,
    this.styloOptique = false,
  });

  int get completedCount => [
        epi,
        escabeau,
        perceuse,
        soudeuse,
        cliveuse,
        pto,
        ont,
        routeur,
        jarretieres,
        lingettes,
        photometre,
        styloOptique
      ].where((e) => e).length;

  int get totalCount => 12;
  double get progress => completedCount / totalCount;
  bool get allChecked => completedCount == totalCount;

  factory EquipmentChecklist.fromJson(Map<String, dynamic> json) {
    return EquipmentChecklist(
      epi: json['epi'] ?? false,
      escabeau: json['escabeau'] ?? false,
      perceuse: json['perceuse'] ?? false,
      soudeuse: json['soudeuse'] ?? false,
      cliveuse: json['cliveuse'] ?? false,
      pto: json['pto'] ?? false,
      ont: json['ont'] ?? false,
      routeur: json['routeur'] ?? false,
      jarretieres: json['jarretieres'] ?? false,
      lingettes: json['lingettes'] ?? false,
      photometre: json['photometre'] ?? false,
      styloOptique: json['stylo_optique'] ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'epi': epi,
        'escabeau': escabeau,
        'perceuse': perceuse,
        'soudeuse': soudeuse,
        'cliveuse': cliveuse,
        'pto': pto,
        'ont': ont,
        'routeur': routeur,
        'jarretieres': jarretieres,
        'lingettes': lingettes,
        'photometre': photometre,
        'stylo_optique': styloOptique,
      };
}

/// Données de navigation en cours
class NavigationData {
  final double distanceRestanteKm;
  final int etaMinutes;
  final String? trafficInfo;
  final String? clientNotes;
  final String? consignes;

  NavigationData({
    required this.distanceRestanteKm,
    required this.etaMinutes,
    this.trafficInfo,
    this.clientNotes,
    this.consignes,
  });

  factory NavigationData.fromJson(Map<String, dynamic> json) {
    return NavigationData(
      distanceRestanteKm: (json['distance_restante_km'] as num?)?.toDouble() ?? 0.0,
      etaMinutes: json['eta_minutes'] ?? 0,
      trafficInfo: json['traffic_info'],
      clientNotes: json['client_notes'],
      consignes: json['consignes'],
    );
  }

  Map<String, dynamic> toJson() => {
        'distance_restante_km': distanceRestanteKm,
        'eta_minutes': etaMinutes,
        'traffic_info': trafficInfo,
        'client_notes': clientNotes,
        'consignes': consignes,
      };
}

/// Données de clôture d'intervention
class ClosureData {
  final Duration tempsReel;
  final Duration tempsPrevu;
  final int photosCount;
  final int materielUtiliseCount;
  final Map<String, int> stockConsomme;
  final DiagnosticResult? diagnostic;
  final TestResult? tests;
  final String? commentaireFinal;

  ClosureData({
    required this.tempsReel,
    required this.tempsPrevu,
    required this.photosCount,
    required this.materielUtiliseCount,
    required this.stockConsomme,
    this.diagnostic,
    this.tests,
    this.commentaireFinal,
  });

  Duration get ecart => tempsReel - tempsPrevu;
  String get ecartLabel => ecart.isNegative
      ? 'En avance de ${_formatDuration(ecart.abs())}'
      : 'En retard de ${_formatDuration(ecart)}';

  static String _formatDuration(Duration d) {
    final h = d.inHours.toString().padLeft(2, '0');
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    return '${h}h$m';
  }

  factory ClosureData.fromJson(Map<String, dynamic> json) {
    return ClosureData(
      tempsReel: Duration(minutes: json['temps_reel_minutes'] ?? 0),
      tempsPrevu: Duration(minutes: json['temps_prevu_minutes'] ?? 0),
      photosCount: json['photos_count'] ?? 0,
      materielUtiliseCount: json['materiel_utilise_count'] ?? 0,
      stockConsomme: Map<String, int>.from(json['stock_consomme'] ?? {}),
      diagnostic: json['diagnostic'] != null ? DiagnosticResult.fromJson(json['diagnostic']) : null,
      tests: json['tests'] != null ? TestResult.fromJson(json['tests']) : null,
      commentaireFinal: json['commentaire_final'],
    );
  }

  Map<String, dynamic> toJson() => {
        'temps_reel_minutes': tempsReel.inMinutes,
        'temps_prevu_minutes': tempsPrevu.inMinutes,
        'photos_count': photosCount,
        'materiel_utilise_count': materielUtiliseCount,
        'stock_consomme': stockConsomme,
        'diagnostic': diagnostic?.toJson(),
        'tests': tests?.toJson(),
        'commentaire_final': commentaireFinal,
      };
}