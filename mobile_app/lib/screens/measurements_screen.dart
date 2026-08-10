import 'package:flutter/material.dart';
import 'photos_screen.dart';

class MeasurementsScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const MeasurementsScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<MeasurementsScreen> createState() => _MeasurementsScreenState();
}

class _MeasurementsScreenState extends State<MeasurementsScreen> {
  final _rxController = TextEditingController();
  final _txController = TextEditingController();
  final _puissanceController = TextEditingController();
  final _longueurController = TextEditingController();
  final _ontRefController = TextEditingController();
  final _ptoRefController = TextEditingController();
  final _splitterController = TextEditingController();
  final _portController = TextEditingController();
  final _nroController = TextEditingController();
  final _sroController = TextEditingController();
  final _pboController = TextEditingController();

  bool _validateField(String value) {
    return value.trim().isNotEmpty;
  }

  bool get _allRequiredFilled =>
    _validateField(_rxController.text) &&
    _validateField(_txController.text) &&
    _validateField(_ontRefController.text) &&
    _validateField(_ptoRefController.text);

  @override
  void dispose() {
    _rxController.dispose();
    _txController.dispose();
    _puissanceController.dispose();
    _longueurController.dispose();
    _ontRefController.dispose();
    _ptoRefController.dispose();
    _splitterController.dispose();
    _portController.dispose();
    _nroController.dispose();
    _sroController.dispose();
    _pboController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mesures'),
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
                    const Icon(Icons.science_rounded, color: Colors.white, size: 24),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Saisie des mesures',
                        style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                    if (_allRequiredFilled)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF00A86B).withOpacity(0.3),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Text('✅ OK', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
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

          // Formulaire
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Section Puissance
                _sectionTitle('Puissance optique'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: _measureField('RX (dBm)', _rxController, Icons.arrow_downward_rounded, 'Ex: -18.5')),
                    const SizedBox(width: 8),
                    Expanded(child: _measureField('TX (dBm)', _txController, Icons.arrow_upward_rounded, 'Ex: 2.5')),
                  ],
                ),
                const SizedBox(height: 8),
                _measureField('Puissance (dBm)', _puissanceController, Icons.speed_rounded, 'Ex: -18.5'),
                const SizedBox(height: 16),

                // Section Câble
                _sectionTitle('Câble'),
                const SizedBox(height: 8),
                _measureField('Longueur câble (m)', _longueurController, Icons.straighten_rounded, 'Ex: 50'),
                const SizedBox(height: 16),

                // Section Références
                _sectionTitle('Références équipement'),
                const SizedBox(height: 8),
                _measureField('Réf. ONT *', _ontRefController, Icons.devices_rounded, 'N° série ONT'),
                const SizedBox(height: 8),
                _measureField('Réf. PTO *', _ptoRefController, Icons.cable_rounded, 'N° PTO'),
                const SizedBox(height: 16),

                // Section Réseau
                _sectionTitle('Réseau FTTH'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: _measureField('NRO', _nroController, Icons.account_tree_rounded, 'NRO...')),
                    const SizedBox(width: 8),
                    Expanded(child: _measureField('SRO', _sroController, Icons.account_tree_rounded, 'SRO...')),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: _measureField('PBO', _pboController, Icons.inventory_2_rounded, 'PBO...')),
                    const SizedBox(width: 8),
                    Expanded(child: _measureField('Port', _portController, Icons.numbers_rounded, 'Port...')),
                  ],
                ),
                const SizedBox(height: 8),
                _measureField('Splitter', _splitterController, Icons.account_tree_rounded, 'Ex: 1:8'),
                const SizedBox(height: 16),

                // Validation
                if (!_allRequiredFilled)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFFECACA)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.info_rounded, color: Color(0xFFE53E3E), size: 20),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Les champs RX, TX, Réf. ONT et Réf. PTO sont obligatoires',
                            style: TextStyle(color: Color(0xFF991B1B), fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
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
                  onPressed: _allRequiredFilled
                      ? () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => PhotosScreen(
                                jobId: widget.jobId,
                                customerName: widget.customerName,
                              ),
                            ),
                          );
                        }
                      : null,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: Text(_allRequiredFilled ? 'Continuer vers les photos' : 'Remplissez les champs obligatoires'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _allRequiredFilled ? const Color(0xFF003366) : Colors.grey.shade300,
                    foregroundColor: _allRequiredFilled ? Colors.white : Colors.grey,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Row(
      children: [
        Container(
          width: 4,
          height: 20,
          decoration: BoxDecoration(
            color: const Color(0xFF003366),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
      ],
    );
  }

  Widget _measureField(String label, TextEditingController controller, IconData icon, String hint) {
    return TextField(
      controller: controller,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, size: 20, color: Colors.grey[400]),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: Colors.white,
      ),
      keyboardType: TextInputType.numberWithOptions(decimal: true),
      onChanged: (_) => setState(() {}),
    );
  }
}