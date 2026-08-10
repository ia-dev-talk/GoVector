import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../design_system/bluevector_tokens.dart';
import 'technician_history_detail_screen.dart';
import 'technician_history_models.dart';
import 'technician_history_repository.dart';

class TechnicianHistoryScreen extends StatefulWidget {
  const TechnicianHistoryScreen.personal({
    super.key,
    required this.ownerUserId,
    required this.technicianId,
    this.repository = const TechnicianHistoryRepository(),
  }) : currentSiteJobId = null;

  const TechnicianHistoryScreen.site({
    super.key,
    required this.ownerUserId,
    required this.technicianId,
    required this.currentSiteJobId,
    this.repository = const TechnicianHistoryRepository(),
  });

  final int ownerUserId;
  final int technicianId;
  final int? currentSiteJobId;
  final TechnicianHistoryRepository repository;

  bool get isSiteHistory => currentSiteJobId != null;

  @override
  State<TechnicianHistoryScreen> createState() =>
      _TechnicianHistoryScreenState();
}

class _TechnicianHistoryScreenState extends State<TechnicianHistoryScreen> {
  final _searchController = TextEditingController();
  TechnicianHistoryPage? _page;
  DateTime? _lastUpdated;
  bool _fromCache = false;
  bool _loading = true;
  String? _error;
  String? _status;
  int _pageNumber = 1;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({int? page}) async {
    setState(() {
      _loading = true;
      _error = null;
      if (page != null) _pageNumber = page;
    });
    try {
      final result = widget.isSiteHistory
          ? await widget.repository.loadSite(
              ownerUserId: widget.ownerUserId,
              technicianId: widget.technicianId,
              jobId: widget.currentSiteJobId!,
              page: _pageNumber,
            )
          : await widget.repository.loadPersonal(
              ownerUserId: widget.ownerUserId,
              technicianId: widget.technicianId,
              page: _pageNumber,
              status: _status,
              search: _searchController.text,
            );
      if (!mounted) return;
      setState(() {
        _page = result.value;
        _fromCache = result.fromCache;
        _lastUpdated = result.lastUpdated;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _open(TechnicianHistoryItem item) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TechnicianHistoryDetailScreen(
          ownerUserId: widget.ownerUserId,
          technicianId: widget.technicianId,
          historicalJobId: item.jobId,
          currentSiteJobId: widget.currentSiteJobId,
          initialItem: item,
          repository: widget.repository,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final page = _page;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.isSiteHistory ? 'Historique du site' : 'Mes interventions',
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            BlueVectorSpacing.md,
            BlueVectorSpacing.sm,
            BlueVectorSpacing.md,
            BlueVectorSpacing.xxl,
          ),
          children: [
            if (!widget.isSiteHistory) ...[
              TextField(
                controller: _searchController,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _load(page: 1),
                decoration: InputDecoration(
                  hintText: 'Client, adresse, référence, PTO…',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: IconButton(
                    tooltip: 'Rechercher',
                    onPressed: () => _load(page: 1),
                    icon: const Icon(Icons.arrow_forward_rounded),
                  ),
                ),
              ),
              const SizedBox(height: BlueVectorSpacing.sm),
              DropdownButtonFormField<String?>(
                initialValue: _status,
                decoration: const InputDecoration(labelText: 'Statut'),
                items: const [
                  DropdownMenuItem(
                    value: null,
                    child: Text('Tous les statuts'),
                  ),
                  DropdownMenuItem(
                    value: 'en_attente_validation',
                    child: Text('En attente de validation'),
                  ),
                  DropdownMenuItem(
                    value: 'completed',
                    child: Text('Terminées'),
                  ),
                  DropdownMenuItem(value: 'failed', child: Text('Échecs')),
                  DropdownMenuItem(
                    value: 'postponed',
                    child: Text('Reportées'),
                  ),
                ],
                onChanged: (value) {
                  _status = value;
                  _load(page: 1);
                },
              ),
              const SizedBox(height: BlueVectorSpacing.md),
            ],
            if (_fromCache && _lastUpdated != null)
              _CacheNotice(lastUpdated: _lastUpdated!),
            if (widget.isSiteHistory && page != null)
              Padding(
                padding: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
                child: Text(
                  '${page.total} intervention${page.total == 1 ? '' : 's'} précédente${page.total == 1 ? '' : 's'}',
                  style: const TextStyle(color: BlueVectorColors.textSecondary),
                ),
              ),
            if (_loading && page == null)
              const Padding(
                padding: EdgeInsets.all(BlueVectorSpacing.xxl),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null && page == null)
              _EmptyState(
                icon: Icons.cloud_off_outlined,
                title: 'Historique indisponible',
                detail: _error!,
                onRetry: _load,
              )
            else if (page == null || page.items.isEmpty)
              _EmptyState(
                icon: Icons.history_rounded,
                title: 'Aucune intervention trouvée',
                detail: widget.isSiteHistory
                    ? 'Aucun travail antérieur ne correspond sûrement à ce site.'
                    : 'Modifiez la recherche ou les filtres.',
                onRetry: _load,
              )
            else ...[
              for (final item in page.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
                  child: TechnicianHistoryCard(
                    item: item,
                    onTap: () => _open(item),
                  ),
                ),
              if (page.pages > 1)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      tooltip: 'Page précédente',
                      onPressed: page.page > 1
                          ? () => _load(page: page.page - 1)
                          : null,
                      icon: const Icon(Icons.chevron_left_rounded),
                    ),
                    Text('${page.page} / ${page.pages}'),
                    IconButton(
                      tooltip: 'Page suivante',
                      onPressed: page.page < page.pages
                          ? () => _load(page: page.page + 1)
                          : null,
                      icon: const Icon(Icons.chevron_right_rounded),
                    ),
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class TechnicianHistoryCard extends StatelessWidget {
  const TechnicianHistoryCard({
    super.key,
    required this.item,
    required this.onTap,
  });

  final TechnicianHistoryItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = _statusColor(item.status);
    return Material(
      color: BlueVectorColors.surface,
      borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
        child: Container(
          padding: const EdgeInsets.all(BlueVectorSpacing.md),
          decoration: BoxDecoration(
            border: Border.all(color: BlueVectorColors.border),
            borderRadius: BorderRadius.circular(BlueVectorRadius.medium),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.client.isEmpty
                          ? 'Client non renseigné'
                          : item.client,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(
                        BlueVectorRadius.pill,
                      ),
                    ),
                    child: Text(
                      _statusLabel(item.status),
                      style: TextStyle(
                        color: color,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BlueVectorSpacing.xs),
              Text(
                '${item.date == null ? 'Date non renseignée' : DateFormat('dd/MM/yyyy · HH:mm', 'fr_FR').format(item.date!.toLocal())} · ${item.activity}',
                style: const TextStyle(
                  color: BlueVectorColors.textSecondary,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: BlueVectorSpacing.xs),
              Text(
                item.address,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: BlueVectorColors.textSecondary),
              ),
              if (item.result?.isNotEmpty == true) ...[
                const SizedBox(height: BlueVectorSpacing.xs),
                Text(
                  item.result!,
                  style: TextStyle(color: color, fontSize: 12),
                ),
              ],
              if (item.technicianName?.isNotEmpty == true) ...[
                const SizedBox(height: BlueVectorSpacing.xs),
                Text(
                  item.technicianName!,
                  style: const TextStyle(
                    color: BlueVectorColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

Color _statusColor(String status) {
  return switch (status.toLowerCase()) {
    'completed' => BlueVectorColors.success,
    'failed' => BlueVectorColors.danger,
    'postponed' => BlueVectorColors.warning,
    'en_attente_validation' => BlueVectorColors.cyan,
    _ => BlueVectorColors.textSecondary,
  };
}

String _statusLabel(String status) {
  return switch (status.toLowerCase()) {
    'completed' => 'Terminée',
    'failed' => 'Échec',
    'postponed' => 'Reportée',
    'en_attente_validation' => 'À valider',
    'client_absent' => 'Client absent',
    'cancelled' => 'Annulée',
    _ => status,
  };
}

class _CacheNotice extends StatelessWidget {
  const _CacheNotice({required this.lastUpdated});

  final DateTime lastUpdated;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: BlueVectorSpacing.sm),
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
      ),
      child: Text(
        'Hors ligne · dernière mise à jour ${DateFormat('dd/MM à HH:mm', 'fr_FR').format(lastUpdated.toLocal())}',
        style: const TextStyle(color: BlueVectorColors.warning, fontSize: 11),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.detail,
    required this.onRetry,
  });

  final IconData icon;
  final String title;
  final String detail;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(BlueVectorSpacing.xxl),
      child: Column(
        children: [
          Icon(icon, size: 46, color: BlueVectorColors.textMuted),
          const SizedBox(height: BlueVectorSpacing.md),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: BlueVectorSpacing.xs),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: const TextStyle(color: BlueVectorColors.textSecondary),
          ),
          const SizedBox(height: BlueVectorSpacing.md),
          OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
        ],
      ),
    );
  }
}
