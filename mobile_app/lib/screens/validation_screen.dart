import 'package:flutter/material.dart';
import 'closure_screen.dart';

class ValidationScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const ValidationScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<ValidationScreen> createState() => _ValidationScreenState();
}

class _ValidationScreenState extends State<ValidationScreen> {
  final _sections = [
    _ValidationSection('Diagnostic', Icons.search_rounded, true, [
      _ValidationItem('Client présent', true),
      _ValidationItem('PBO trouvé', true),
      _ValidationItem('Armoire accessible', true),
      _ValidationItem('Splitter identifié', true),
    ]),
    _ValidationSection('Installation', Icons.cable_rounded, true, [
      _ValidationItem('PTO installée', true),
      _ValidationItem('ONT installé', true),
      _ValidationItem('Routeur configuré', true),
      _ValidationItem('Branchements OK', true),
    ]),
    _ValidationSection('Mesures', Icons.science_rounded, true, [
      _ValidationItem('RX saisi', true),
      _ValidationItem('TX saisi', true),
      _ValidationItem('Réf. ONT', true),
      _ValidationItem('Réf. PTO', true),
    ]),
    _ValidationSection('Photos', Icons.camera_alt_rounded, true, [
      _ValidationItem('Photo avant', true),
      _ValidationItem('Photo après', true),
      _ValidationItem('Photo installation', true),
    ]),
    _ValidationSection('Tests', Icons.speed_rounded, true, [
      _ValidationItem('Internet OK', true),
      _ValidationItem('WiFi OK', true),
      _ValidationItem('Téléphone OK', true),
    ]),
  ];

  bool get _allValid => _sections.every((s) => s.items.every((i) => i.valid));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Validation'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // En-tête
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: _allValid
                    ? [const Color(0xFF00A86B), const Color(0xFF059669)]
                    : [const Color(0xFFE53E3E), const Color(0xFFDC2626)],
              ),
            ),
            child: Column(
              children: [
                Icon(
                  _allValid ? Icons.verified_rounded : Icons.error_rounded,
                  color: Colors.white,
                  size: 48,
                ),
                const SizedBox(height: 8),
                Text(
                  _allValid ? 'Tout est validé !' : 'Points à vérifier',
                  style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  'Intervention chez ${widget.customerName}',
                  style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 14),
                ),
              ],
            ),
          ),

          // Sections
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: _sections.map((section) => _buildSection(section)).toList(),
            ),
          ),

          // Bouton
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: _allValid
                      ? () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ClosureScreen(
                                jobId: widget.jobId,
                                customerName: widget.customerName,
                              ),
                            ),
                          );
                        }
                      : null,
                  icon: Icon(_allValid ? Icons.check_rounded : Icons.warning_rounded),
                  label: Text(
                    _allValid
                        ? '✅ Tout valider et clôturer'
                        : 'Corrigez les points en rouge',
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _allValid ? const Color(0xFF00A86B) : Colors.grey.shade300,
                    foregroundColor: _allValid ? Colors.white : Colors.grey,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(_ValidationSection section) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: section.valid
                          ? const Color(0xFF00A86B).withOpacity(0.1)
                          : const Color(0xFFE53E3E).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      section.icon,
                      color: section.valid ? const Color(0xFF00A86B) : const Color(0xFFE53E3E),
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      section.title,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                    ),
                  ),
                  Icon(
                    section.valid ? Icons.check_circle_rounded : Icons.error_rounded,
                    color: section.valid ? const Color(0xFF00A86B) : const Color(0xFFE53E3E),
                    size: 20,
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ...section.items.map((item) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Icon(
                      item.valid ? Icons.check_rounded : Icons.close_rounded,
                      color: item.valid ? const Color(0xFF00A86B) : const Color(0xFFE53E3E),
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      item.label,
                      style: TextStyle(
                        fontSize: 13,
                        color: item.valid ? Colors.grey[700] : const Color(0xFFE53E3E),
                      ),
                    ),
                  ],
                ),
              )),
            ],
          ),
        ),
      ),
    );
  }
}

class _ValidationSection {
  final String title;
  final IconData icon;
  final bool valid;
  final List<_ValidationItem> items;

  _ValidationSection(this.title, this.icon, this.valid, this.items);
}

class _ValidationItem {
  final String label;
  final bool valid;

  _ValidationItem(this.label, this.valid);
}