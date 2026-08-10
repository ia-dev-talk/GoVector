import 'package:flutter/material.dart';
import '../models/workflow_step.dart';
import 'installation_screen.dart';

class DiagnosticScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const DiagnosticScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<DiagnosticScreen> createState() => _DiagnosticScreenState();
}

class _DiagnosticScreenState extends State<DiagnosticScreen> {
  // Réponses au diagnostic
  bool? _clientPresent;
  bool? _pboFound;
  bool? _ptoExists;
  bool? _fourreauLibre;
  bool? _passageCable;
  bool? _armoireAccessible;
  bool? _splitterIdentifie;
  bool? _puissanceExistante;
  final _commentController = TextEditingController();

  bool get _allAnswered =>
    _clientPresent != null &&
    _pboFound != null &&
    _armoireAccessible != null &&
    _splitterIdentifie != null;

  bool get _installationPossible =>
    _allAnswered &&
    _clientPresent! &&
    _pboFound! &&
    _armoireAccessible! &&
    _splitterIdentifie!;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Diagnostic FTTH'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // En-tête
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF003366), Color(0xFF004D99)],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.search_rounded, color: Colors.white, size: 24),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Questionnaire diagnostic',
                        style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (_allAnswered)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: _installationPossible
                              ? const Color(0xFF00A86B).withOpacity(0.3)
                              : const Color(0xFFE53E3E).withOpacity(0.3),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _installationPossible ? '✅ OK' : '⚠️ Bloquant',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  'Client: ${widget.customerName}',
                  style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 13),
                ),
              ],
            ),
          ),

          // Questions
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildQuestion(
                  'Client présent ?',
                  Icons.person_rounded,
                  _clientPresent,
                  (v) => setState(() => _clientPresent = v),
                ),
                const SizedBox(height: 8),
                _buildQuestion(
                  'PBO trouvé ?',
                  Icons.inventory_2_rounded,
                  _pboFound,
                  (v) => setState(() => _pboFound = v),
                ),
                const SizedBox(height: 8),
                _buildQuestion(
                  'PTO existante ?',
                  Icons.cable_rounded,
                  _ptoExists,
                  (v) => setState(() => _ptoExists = v),
                ),
                const SizedBox(height: 8),
                _buildQuestion(
                  'Fourreau libre ?',
                  Icons.vertical_align_center_rounded,
                  _fourreauLibre,
                  (v) => setState(() => _fourreauLibre = v),
                ),
                const SizedBox(height: 8),
                _buildQuestion(
                  'Passage câble possible ?',
                  Icons.swap_horiz_rounded,
                  _passageCable,
                  (v) => setState(() => _passageCable = v),
                ),
                const SizedBox(height: 8),
                _buildQuestion(
                  'Armoire accessible ?',
                  Icons.meeting_room_rounded,
                  _armoireAccessible,
                  (v) => setState(() => _armoireAccessible = v),
                ),
                const SizedBox(height: 8),
                _buildQuestion(
                  'Splitter identifié ?',
                  Icons.account_tree_rounded,
                  _splitterIdentifie,
                  (v) => setState(() => _splitterIdentifie = v),
                ),
                const SizedBox(height: 8),
                _buildQuestion(
                  'Puissance existante ?',
                  Icons.speed_rounded,
                  _puissanceExistante,
                  (v) => setState(() => _puissanceExistante = v),
                ),
                const SizedBox(height: 16),

                // Commentaire
                TextField(
                  controller: _commentController,
                  maxLines: 3,
                  decoration: InputDecoration(
                    labelText: 'Commentaire diagnostic',
                    hintText: 'Observations, difficultés...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),

                // Résultat
                if (_allAnswered) ...[
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: _installationPossible
                          ? const Color(0xFFF0FDF4)
                          : const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: _installationPossible
                            ? const Color(0xFFBBF7D0)
                            : const Color(0xFFFECACA),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _installationPossible
                              ? Icons.check_circle_rounded
                              : Icons.error_rounded,
                          color: _installationPossible
                              ? const Color(0xFF00A86B)
                              : const Color(0xFFE53E3E),
                          size: 28,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _installationPossible
                                ? 'Installation possible — vous pouvez continuer'
                                : 'Installation bloquée — certaines conditions ne sont pas remplies',
                            style: TextStyle(
                              color: _installationPossible
                                  ? const Color(0xFF166534)
                                  : const Color(0xFF991B1B),
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),

          // Bouton continuer
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: _allAnswered
                      ? () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => InstallationScreen(
                                jobId: widget.jobId,
                                customerName: widget.customerName,
                                diagnosticPossible: _installationPossible,
                              ),
                            ),
                          );
                        }
                      : null,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: Text(
                    _allAnswered
                        ? 'Continuer vers l\'installation'
                        : 'Répondez à toutes les questions',
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _allAnswered
                        ? const Color(0xFF003366)
                        : Colors.grey.shade300,
                    foregroundColor: _allAnswered ? Colors.white : Colors.grey,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuestion(
    String question,
    IconData icon,
    bool? value,
    ValueChanged<bool> onChanged,
  ) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: const Color(0xFF003366).withOpacity(0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: const Color(0xFF003366), size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              question,
              style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
            ),
          ),
          // OUI
          GestureDetector(
            onTap: () => onChanged(true),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: value == true
                    ? const Color(0xFF00A86B).withOpacity(0.15)
                    : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: value == true
                      ? const Color(0xFF00A86B)
                      : Colors.grey.shade200,
                ),
              ),
              child: Text(
                'Oui',
                style: TextStyle(
                  color: value == true ? const Color(0xFF00A86B) : Colors.grey[600],
                  fontWeight: value == true ? FontWeight.bold : FontWeight.normal,
                  fontSize: 13,
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),
          // NON
          GestureDetector(
            onTap: () => onChanged(false),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: value == false
                    ? const Color(0xFFE53E3E).withOpacity(0.15)
                    : Colors.grey.shade100,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: value == false
                      ? const Color(0xFFE53E3E)
                      : Colors.grey.shade200,
                ),
              ),
              child: Text(
                'Non',
                style: TextStyle(
                  color: value == false ? const Color(0xFFE53E3E) : Colors.grey[600],
                  fontWeight: value == false ? FontWeight.bold : FontWeight.normal,
                  fontSize: 13,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}