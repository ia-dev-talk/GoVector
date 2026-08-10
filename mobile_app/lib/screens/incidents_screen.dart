import 'package:flutter/material.dart';
import '../models/incident.dart';
import '../services/api_service.dart';

class IncidentsScreen extends StatefulWidget {
  const IncidentsScreen({super.key});

  @override
  State<IncidentsScreen> createState() => _IncidentsScreenState();
}

class _IncidentsScreenState extends State<IncidentsScreen> {
  List<Incident> _incidents = [];
  bool _isLoading = true;
  String? _selectedStatus;

  @override
  void initState() {
    super.initState();
    _loadIncidents();
  }

  Future<void> _loadIncidents({String? status}) async {
    setState(() => _isLoading = true);
    try {
      final incidents = await ApiService.getIncidents(status: status);
      setState(() {
        _incidents = incidents;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Incidents / SAV'),
        actions: [
          DropdownButton<String>(
            value: _selectedStatus,
            hint: const Text('Filtrer'),
            items: const [
              DropdownMenuItem(value: 'OPEN', child: Text('Ouvert')),
              DropdownMenuItem(value: 'RESOLVED', child: Text('Résolu')),
              DropdownMenuItem(value: 'CLOSED', child: Text('Clôturé')),
            ],
            onChanged: (value) {
              setState(() => _selectedStatus = value);
              _loadIncidents(status: value);
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _incidents.length,
              itemBuilder: (context, index) {
                final incident = _incidents[index];
                return Card(
                  margin: const EdgeInsets.only(bottom: 16),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: _getSeverityColor(incident.severity),
                      child: Text(incident.severity[0]),
                    ),
                    title: Text(
                      incident.incidentType,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (incident.description != null)
                          Text(incident.description!),
                        const SizedBox(height: 4),
                        Text(
                          'Statut: ${incident.status}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        if (incident.isEscalated)
                          Text(
                            'Escaladé niveau ${incident.escalationLevel}',
                            style: const TextStyle(color: Colors.red),
                          ),
                      ],
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.arrow_forward),
                      onPressed: () {
                        _showIncidentDetails(incident);
                      },
                    ),
                  ),
                );
              },
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showCreateIncidentDialog();
        },
        child: const Icon(Icons.add),
      ),
    );
  }

  Color _getSeverityColor(String severity) {
    switch (severity) {
      case 'URGENT':
        return Colors.red;
      case 'HIGH':
        return Colors.orange;
      case 'MEDIUM':
        return Colors.yellow;
      default:
        return Colors.green;
    }
  }

  void _showIncidentDetails(Incident incident) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(incident.incidentType),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('Sévérité: ${incident.severity}'),
              Text('Statut: ${incident.status}'),
              if (incident.description != null) Text('Description: ${incident.description}'),
              if (incident.assignedTo != null) Text('Assigné à: ${incident.assignedTo}'),
              if (incident.slaDeadline != null)
                Text('SLA: ${incident.slaDeadline!.toLocal()}'),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  ElevatedButton(
                    onPressed: () async {
                      await ApiService.escalateIncident(incident.id!);
                      if (mounted) {
                        Navigator.pop(context);
                        _loadIncidents();
                      }
                    },
                    child: const Text('Escalader'),
                  ),
                  ElevatedButton(
                    onPressed: () async {
                      await ApiService.updateIncident(incident.id!, {
                        'status': 'RESOLVED',
                        'resolved_at': DateTime.now().toIso8601String(),
                      });
                      if (mounted) {
                        Navigator.pop(context);
                        _loadIncidents();
                      }
                    },
                    child: const Text('Résoudre'),
                  ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Fermer'),
          ),
        ],
      ),
    );
  }

  void _showCreateIncidentDialog() {
    final formKey = GlobalKey<FormState>();
    String type = 'SAV';
    String severity = 'MEDIUM';

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nouvel Incident'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                value: type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: const [
                  DropdownMenuItem(value: 'SAV', child: Text('SAV')),
                  DropdownMenuItem(value: 'INCIDENT', child: Text('Incident')),
                  DropdownMenuItem(value: 'URGENCE', child: Text('Urgence')),
                  DropdownMenuItem(value: 'PANNEAU', child: Text('Panneau')),
                ],
                onChanged: (value) => type = value!,
              ),
              DropdownButtonFormField<String>(
                value: severity,
                decoration: const InputDecoration(labelText: 'Sévérité'),
                items: const [
                  DropdownMenuItem(value: 'LOW', child: Text('Basse')),
                  DropdownMenuItem(value: 'MEDIUM', child: Text('Moyenne')),
                  DropdownMenuItem(value: 'HIGH', child: Text('Haute')),
                  DropdownMenuItem(value: 'URGENT', child: Text('Urgente')),
                ],
                onChanged: (value) => severity = value!,
              ),
              TextFormField(
                decoration: const InputDecoration(labelText: 'Description'),
                maxLines: 3,
                onSaved: (value) {},
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (formKey.currentState!.validate()) {
                await ApiService.createIncident({
                  'incident_type': type,
                  'severity': severity,
                  'description': '',
                });
                if (mounted) {
                  Navigator.pop(context);
                  _loadIncidents();
                }
              }
            },
            child: const Text('Créer'),
          ),
        ],
      ),
    );
  }
}