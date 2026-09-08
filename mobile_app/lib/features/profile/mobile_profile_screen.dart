import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../services/auth_service.dart';
import 'technician_stock_screen.dart';

class MobileProfileScreen extends StatelessWidget {
  const MobileProfileScreen({
    super.key,
    required this.technicianId,
    required this.technicianName,
    required this.isOnline,
    required this.pendingActions,
    required this.lastSync,
    required this.onSync,
    required this.onOpenHistory,
    required this.onLogout,
  });

  final int technicianId;
  final String technicianName;
  final bool isOnline;
  final int pendingActions;
  final DateTime? lastSync;
  final Future<void> Function() onSync;
  final VoidCallback onOpenHistory;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    final displayName = technicianName.trim().isEmpty
        ? 'Technicien BlueVector'
        : technicianName.trim();

    final initials = displayName
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();

    final syncLabel = lastSync == null
        ? 'Aucune synchronisation enregistrée'
        : 'Dernière synchronisation ${DateFormat('dd/MM à HH:mm', 'fr_FR').format(lastSync!.toLocal())}';

    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          BlueVectorSpacing.md,
          BlueVectorSpacing.sm,
          BlueVectorSpacing.md,
          120,
        ),
        children: [
          const BlueVectorBrand(compact: true, showSubtitle: false),
          const SizedBox(height: BlueVectorSpacing.xl),
          Text(
            'Profil terrain',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: BlueVectorSpacing.lg),
          Container(
            padding: const EdgeInsets.all(BlueVectorSpacing.lg),
            decoration: BoxDecoration(
              color: BlueVectorColors.surface,
              borderRadius: BorderRadius.circular(BlueVectorRadius.large),
              border: Border.all(color: BlueVectorColors.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [BlueVectorColors.primary, BlueVectorColors.cyan],
                    ),
                    borderRadius: BorderRadius.circular(
                      BlueVectorRadius.medium,
                    ),
                  ),
                  child: Text(
                    initials.isEmpty ? 'BV' : initials,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: BlueVectorSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: BlueVectorSpacing.xxs),
                      Text(
                        'Technicien #$technicianId',
                        style: const TextStyle(
                          color: BlueVectorColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                _OnlineDot(isOnline: isOnline),
              ],
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          _SectionCard(
            title: 'Synchronisation',
            children: [
              _InfoRow(
                icon: isOnline
                    ? Icons.cloud_done_outlined
                    : Icons.cloud_off_outlined,
                label: isOnline ? 'Réseau disponible' : 'Mode hors ligne',
                value:
                    '$pendingActions action${pendingActions == 1 ? '' : 's'} en attente',
                color: isOnline
                    ? BlueVectorColors.success
                    : BlueVectorColors.warning,
              ),
              const Divider(height: 24),
              _InfoRow(
                icon: Icons.schedule_rounded,
                label: 'Dernier échange',
                value: syncLabel,
              ),
              const SizedBox(height: BlueVectorSpacing.md),
              FilledButton.icon(
                onPressed: isOnline
                    ? () async {
                        await onSync();
                      }
                    : null,
                icon: const Icon(Icons.sync_rounded),
                label: const Text('Synchroniser maintenant'),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          _SectionCard(
            title: 'Stock terrain',
            children: [
              Material(
                color: Colors.transparent,
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => TechnicianStockScreen(
                          technicianId: technicianId,
                        ),
                      ),
                    );
                  },
                  leading: const Icon(
                    Icons.inventory_2_outlined,
                    color: BlueVectorColors.primaryBright,
                  ),
                  title: const Text('Mon stock actuel'),
                  subtitle: const Text(
                    'Consommables disponibles, SN/MAC et équipements en garde',
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                ),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          _SectionCard(
            title: 'Interventions',
            children: [
              Material(
                color: Colors.transparent,
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  onTap: onOpenHistory,
                  leading: const Icon(
                    Icons.history_rounded,
                    color: BlueVectorColors.primaryBright,
                  ),
                  title: const Text('Historique de mes interventions'),
                  subtitle: const Text(
                    'Travaux transmis, terminés, échoués ou reportés',
                  ),
                  trailing: const Icon(Icons.chevron_right_rounded),
                ),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          _SectionCard(
            title: 'Connexion au système',
            children: [
              _InfoRow(
                icon: Icons.lan_outlined,
                label: 'API BlueVector',
                value: AuthService.baseUrl,
              ),
              const SizedBox(height: BlueVectorSpacing.xs),
              const Text(
                'Cette adresse sera déplacée dans la configuration administrateur lors de la prochaine couche d’intégration.',
                style: TextStyle(
                  color: BlueVectorColors.textMuted,
                  fontSize: 11,
                  height: 1.35,
                ),
              ),
            ],
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          OutlinedButton.icon(
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Se déconnecter ?'),
                  content: const Text(
                    'Les données déjà mises en cache resteront sur ce téléphone.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(false),
                      child: const Text('Annuler'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.of(dialogContext).pop(true),
                      child: const Text('Déconnexion'),
                    ),
                  ],
                ),
              );

              if (confirmed == true) {
                await onLogout();
              }
            },
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Se déconnecter'),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.md),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              color: BlueVectorColors.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.color = BlueVectorColors.primaryBright,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 22),
        const SizedBox(width: BlueVectorSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: BlueVectorColors.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: BlueVectorSpacing.xxs),
              SelectableText(
                value,
                style: const TextStyle(
                  color: BlueVectorColors.textSecondary,
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OnlineDot extends StatelessWidget {
  const _OnlineDot({required this.isOnline});

  final bool isOnline;

  @override
  Widget build(BuildContext context) {
    final color = isOnline
        ? BlueVectorColors.success
        : BlueVectorColors.warning;

    return Container(
      width: 13,
      height: 13,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 8),
        ],
      ),
    );
  }
}
