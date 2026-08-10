import 'package:shared_preferences/shared_preferences.dart';

import '../features/sync/technician_outbox_event.dart';
import 'technician_outbox_store.dart';

class TechnicianLegacyOutboxMigrator {
  const TechnicianLegacyOutboxMigrator();

  static const legacyPendingActionsKey = 'offline_pending_actions';

  Future<LegacyOutboxMigrationResult> migrate({
    required SharedPreferences preferences,
    required TechnicianOutboxStore store,
    required TechnicianOutboxOwner owner,
    required Set<int> assignedJobIds,
  }) async {
    final rawActions =
        preferences.getStringList(legacyPendingActionsKey) ?? const [];
    if (rawActions.isEmpty) {
      return const LegacyOutboxMigrationResult(
        migrated: 0,
        quarantined: 0,
        alreadyPersisted: 0,
      );
    }

    final result = await store.importLegacyActions(
      rawActions: rawActions,
      owner: owner,
      assignedJobIds: assignedJobIds,
    );

    // SQLite persistence completed transactionally. Remove only the exact
    // snapshot that was imported; a concurrent legacy append stays for the
    // next idempotent migration pass.
    final currentActions = preferences.getStringList(legacyPendingActionsKey);
    if (_sameActions(currentActions, rawActions)) {
      final removed = await preferences.remove(legacyPendingActionsKey);
      if (!removed) {
        throw StateError('Impossible de confirmer la migration legacy');
      }
    }
    return result;
  }

  bool _sameActions(List<String>? left, List<String> right) {
    if (left == null || left.length != right.length) {
      return false;
    }
    for (var index = 0; index < left.length; index++) {
      if (left[index] != right[index]) {
        return false;
      }
    }
    return true;
  }
}
