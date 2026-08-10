abstract final class TechnicianJobStatus {
  static const terminal = {
    'failed',
    'postponed',
    'client_absent',
    'en_attente_validation',
    'completed',
    'cancelled',
    'terminee',
    'annulee',
  };

  static const active = {
    'assigned',
    'affectee',
    'accepted',
    'en_route',
    'on_site',
    'arrived',
    'in_progress',
    'work_in_progress',
    'en_cours',
    'ftth_install',
    'installation_done',
    'client_validation',
  };

  static String normalize(String status) =>
      status.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');

  static bool isTechnicianTerminalStatus(String status) =>
      terminal.contains(normalize(status));

  static bool isTechnicianActiveStatus(String status) =>
      active.contains(normalize(status));
}
