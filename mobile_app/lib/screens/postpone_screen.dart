import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/intervention_service.dart';

class PostponeScreen extends StatefulWidget {
  final int jobId;

  const PostponeScreen({super.key, required this.jobId});

  @override
  State<PostponeScreen> createState() => _PostponeScreenState();
}

class _PostponeScreenState extends State<PostponeScreen> {
  final _formKey = GlobalKey<FormState>();
  String? _selectedReason;
  final _commentController = TextEditingController();
  final _dateController = TextEditingController();
  DateTime? _selectedDate;
  bool _isLoading = false;

  final List<String> _postponeReasons = [
    'Client indisponible',
    'Conditions météo défavorables',
    'Problème de planification',
    'Autre',
  ];

  @override
  void dispose() {
    _commentController.dispose();
    _dateController.dispose();
    super.dispose();
  }

  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
        _dateController.text = DateFormat('dd/MM/yyyy').format(picked);
      });
    }
  }

  Future<void> _requestPostponement() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_selectedReason == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Veuillez sélectionner un motif de report.')),
      );
      return;
    }

    if (_selectedDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Veuillez sélectionner une date de report.')),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Formatage de la date en chaîne YYYY-MM-DD attendue par l'API
      final String formattedDate = _selectedDate!.toIso8601String().split('T')[0];

      await InterventionService.postponeJob(
        jobId: widget.jobId,
        reason: _selectedReason!,
        comment: _commentController.text.isEmpty ? null : _commentController.text,
        requestedDate: formattedDate,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Demande de report enregistrée avec succès !'),
          backgroundColor: Colors.green,
        ),
      );
      Navigator.pop(context, true); // Retourne true pour indiquer le succès
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
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
        title: const Text('Demander un report'),
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
                      labelText: 'Motif du report',
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      filled: true,
                    ),
                    items: _postponeReasons
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
                  const SizedBox(height: 16),
                  GestureDetector(
                    onTap: () => _selectDate(context),
                    child: AbsorbPointer(
                      child: TextFormField(
                        controller: _dateController,
                        decoration: InputDecoration(
                          labelText: 'Date de report souhaitée',
                          hintText: 'Sélectionner une date',
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          suffixIcon: const Icon(Icons.calendar_today),
                        ),
                        validator: (value) => value == null || value.isEmpty
                            ? 'Veuillez sélectionner une date'
                            : null,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: _requestPostponement,
                    icon: const Icon(Icons.schedule),
                    label: const Text('Demander le report'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.orange.shade700,
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