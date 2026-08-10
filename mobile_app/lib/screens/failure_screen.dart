import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../services/intervention_service.dart';
import '../services/location_service.dart';

class FailureScreen extends StatefulWidget {
  final int jobId;

  const FailureScreen({super.key, required this.jobId});

  @override
  State<FailureScreen> createState() => _FailureScreenState();
}

class _FailureScreenState extends State<FailureScreen> {
  final _formKey = GlobalKey<FormState>();
  String? _selectedReason;
  final _commentController = TextEditingController();
  bool _isLoading = false;
  Position? _currentPosition;

  final List<String> _failureReasons = [
    'Client absent',
    'Problème technique',
    'Accès impossible',
    'Matériel manquant',
    'Autre',
  ];

  @override
  void initState() {
    super.initState();
    _getCurrentLocation();
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _getCurrentLocation() async {
    try {
      final position = await LocationService.getCurrentPosition();
      setState(() {
        _currentPosition = position;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur GPS: $e')),
        );
      }
    }
  }

  Future<void> _declareFailure() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_selectedReason == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Veuillez sélectionner un motif d\'échec.')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      await InterventionService.declareFailure(
        jobId: widget.jobId,
        reason: _selectedReason!,
        comment: _commentController.text,
        latitude: _currentPosition?.latitude,
        longitude: _currentPosition?.longitude,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Échec enregistré avec succès !'),
            backgroundColor: Colors.green),
      );
      Navigator.pop(context, true); // Retourne true pour indiquer le succès
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Déclarer un échec'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16.0),
                children: [
                  DropdownButtonFormField<String>(
                    value: _selectedReason,
                    decoration: InputDecoration(
                      labelText: 'Motif de l\'échec',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                    ),
                    items: _failureReasons
                        .map((reason) => DropdownMenuItem(value: reason, child: Text(reason)))
                        .toList(),
                    onChanged: (value) {
                      setState(() {
                        _selectedReason = value;
                      });
                    },
                    validator: (value) =>
                        value == null ? 'Veuillez choisir un motif' : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _commentController,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: 'Commentaire (optionnel)',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: _declareFailure,
                    icon: const Icon(Icons.warning_amber),
                    label: const Text('Déclarer l\'échec'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 50),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
