import 'package:flutter/material.dart';
import '../models/job.dart';
import '../services/location_service.dart';

class JobCard extends StatelessWidget {
  final Job job;
  final VoidCallback onTap;
  final VoidCallback? onStartJob;

  const JobCard({
    super.key,
    required this.job,
    required this.onTap,
    this.onStartJob,
  });

  Color statusColor() {
    switch (job.status.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'in_progress':
        return Colors.orange;
      case 'en_route':
        return Colors.amber;
      case 'arrived':
        return Colors.teal;
      case 'assigned':
        return Colors.blue;
      case 'cancelled':
        return Colors.red;
      case 'failed':
        return Colors.red.shade700;
      case 'client_absent':
        return Colors.orange.shade700;
      default:
        return Colors.grey;
    }
  }

  IconData statusIcon() {
    switch (job.status.toLowerCase()) {
      case 'completed':
        return Icons.check_circle;
      case 'in_progress':
        return Icons.build_circle;
      case 'en_route':
        return Icons.directions_car;
      case 'arrived':
        return Icons.location_on;
      case 'assigned':
        return Icons.assignment;
      case 'cancelled':
        return Icons.cancel;
      case 'failed':
        return Icons.error;
      case 'client_absent':
        return Icons.person_off;
      default:
        return Icons.help;
    }
  }

  String statusLabel() {
    switch (job.status.toLowerCase()) {
      case 'completed': return 'Terminée';
      case 'in_progress': return 'En cours';
      case 'en_route': return 'En route';
      case 'arrived': return 'Arrivé';
      case 'assigned': return 'Assignée';
      case 'cancelled': return 'Annulée';
      case 'failed': return 'Échec';
      case 'client_absent': return 'Client absent';
      default: return job.status.toUpperCase();
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasGps = (job.gpsLatitude != null && job.gpsLatitude != 0) || (job.latitude != 0);
    final hasPhone = job.customerPhone != null && job.customerPhone!.isNotEmpty;
    final hasFtth = job.operator != null || job.nro != null || job.pbo != null;

    return Card(
      elevation: 3,
      margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Ligne 1 : Icône + Client + Badge statut
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: statusColor().withOpacity(0.15),
                    child: Icon(statusIcon(), color: statusColor(), size: 22),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          job.customerName,
                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (job.jobNumber.isNotEmpty)
                          Text('Job #${job.jobNumber}', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: statusColor().withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      statusLabel(),
                      style: TextStyle(color: statusColor(), fontSize: 10, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Ligne 2 : Adresse
              Row(
                children: [
                  Icon(Icons.location_on, size: 16, color: Colors.grey[500]),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(job.serviceAddress, style: TextStyle(fontSize: 13, color: Colors.grey[700]), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ],
              ),
              const SizedBox(height: 4),

              // Ligne 3 : Type + Opérateur
              Row(
                children: [
                  Icon(Icons.settings, size: 16, color: Colors.grey[500]),
                  const SizedBox(width: 4),
                  Text(job.jobType, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                  if (job.operator != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: Colors.indigo.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(job.operator!, style: TextStyle(fontSize: 10, color: Colors.indigo[700], fontWeight: FontWeight.w600)),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),

              // Ligne 4 : Données FTTH
              if (hasFtth) ...[
                Row(
                  children: [
                    if (job.nro != null) ...[
                      _ftthBadge('NRO', job.nro!),
                      const SizedBox(width: 4),
                    ],
                    if (job.pbo != null) ...[
                      _ftthBadge('PBO', job.pbo!),
                      const SizedBox(width: 4),
                    ],
                    if (job.pto != null) ...[
                      _ftthBadge('PTO', job.pto!),
                      const SizedBox(width: 4),
                    ],
                    if (job.ontSerial != null)
                      _ftthBadge('ONT', job.ontSerial!.length > 8 ? '${job.ontSerial!.substring(0, 8)}...' : job.ontSerial!),
                  ],
                ),
                const SizedBox(height: 6),
              ],

              // Ligne 5 : Téléphone + GPS
              Row(
                children: [
                  if (hasPhone)
                    GestureDetector(
                      onTap: () => LocationService.openNavigationByAddress('tel:${job.customerPhone}'),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.green.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.phone, size: 14, color: Colors.green[700]),
                            const SizedBox(width: 4),
                            Text(job.customerPhone!, style: TextStyle(fontSize: 11, color: Colors.green[700], fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
                  if (hasPhone && hasGps) const SizedBox(width: 8),
                  if (hasGps)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.gps_fixed, size: 14, color: Colors.blue[700]),
                          const SizedBox(width: 4),
                          Text('GPS', style: TextStyle(fontSize: 11, color: Colors.blue[700], fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 10),

              // Ligne 6 : Boutons d'action
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  // Navigation
                  if (hasGps)
                    _actionButton(
                      icon: Icons.directions_car,
                      label: 'S\'y rendre',
                      color: Colors.blue,
                      onTap: () async {
                        final lat = job.gpsLatitude ?? job.latitude;
                        final lon = job.gpsLongitude ?? job.longitude;
                        try {
                          await LocationService.openNavigation(latitude: lat, longitude: lon, label: job.customerName);
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erreur navigation: $e')));
                          }
                        }
                      },
                    ),
                  if (hasGps) const SizedBox(width: 4),

                  // Démarrer
                  if (['assigned', 'pending'].contains(job.status.toLowerCase()))
                    _actionButton(
                      icon: Icons.play_arrow_rounded,
                      label: 'Démarrer',
                      color: Colors.green,
                      onTap: () { if (onStartJob != null) onStartJob!(); },
                    ),

                  // Ouvrir
                  _actionButton(
                    icon: Icons.visibility,
                    label: 'Ouvrir',
                    color: Colors.grey[700]!,
                    onTap: onTap,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _ftthBadge(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text('$label: $value', style: TextStyle(fontSize: 9, color: Colors.grey[700])),
    );
  }

  Widget _actionButton({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return TextButton.icon(
      onPressed: onTap,
      icon: Icon(icon, color: color, size: 18),
      label: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
    );
  }
}