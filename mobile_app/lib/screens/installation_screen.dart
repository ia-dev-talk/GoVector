import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../services/ocr_service.dart';
import '../widgets/barcode_scanner_widget.dart';
import 'measurements_screen.dart';

class InstallationScreen extends StatefulWidget {
  final int jobId;
  final String customerName;
  final bool diagnosticPossible;

  const InstallationScreen({
    super.key,
    required this.jobId,
    required this.customerName,
    required this.diagnosticPossible,
  });

  @override
  State<InstallationScreen> createState() => _InstallationScreenState();
}

class _InstallationScreenState extends State<InstallationScreen> {
  int _currentStep = 0;
  final Map<int, bool> _stepCompleted = {};

  // Photos
  String? _photoPbo;
  String? _photoPto;
  String? _photoOnt;
  String? _photoRouteur;
  String? _photoCablage;
  String? _photoInstallation;

  // Scans
  String _ptoNumber = '';
  String _ontSerial = '';
  String _routerSerial = '';
  String _macAddress = '';

  final _steps = [
    _InstallStep('Repérer le PBO', Icons.search_rounded, 'Localisez le point de branchement optique'),
    _InstallStep('Choisir un port', Icons.touch_app_rounded, 'Sélectionnez un port libre sur le PBO'),
    _InstallStep('Scanner la PTO', Icons.qr_code_scanner_rounded, 'Scannez le code-barres de la PTO'),
    _InstallStep('Installer la PTO', Icons.cable_rounded, 'Fixez la prise terminale optique'),
    _InstallStep('Scanner l\'ONT', Icons.qr_code_scanner_rounded, 'Scannez le numéro de série de l\'ONT'),
    _InstallStep('Installer l\'ONT', Icons.devices_rounded, 'Branchez et fixez l\'ONT'),
    _InstallStep('Scanner le Routeur', Icons.qr_code_scanner_rounded, 'Scannez le numéro de série du routeur'),
    _InstallStep('Brancher', Icons.link_rounded, 'Connectez tous les éléments entre eux'),
    _InstallStep('Photographier', Icons.camera_alt_rounded, 'Prenez une photo de l\'installation'),
    _InstallStep('Tester', Icons.science_rounded, 'Vérifiez la puissance optique'),
  ];

  @override
  Widget build(BuildContext context) {
    final step = _steps[_currentStep];
    final isCompleted = _stepCompleted[_currentStep] ?? false;
    final progress = (_currentStep + 1) / _steps.length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Installation FTTH'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // Progression
          Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      'Étape ${_currentStep + 1}/${_steps.length}',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                    ),
                    const Spacer(),
                    Text(
                      '${(progress * 100).toInt()}%',
                      style: TextStyle(color: Colors.grey[600], fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: Colors.grey[200],
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF00A86B)),
                  ),
                ),
              ],
            ),
          ),

          // Carte étape
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.04),
                          blurRadius: 20,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            color: isCompleted
                                ? const Color(0xFF00A86B).withOpacity(0.1)
                                : const Color(0xFF003366).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Icon(
                            isCompleted ? Icons.check_rounded : step.icon,
                            color: isCompleted ? const Color(0xFF00A86B) : const Color(0xFF003366),
                            size: 32,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          step.title,
                          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          step.description,
                          style: TextStyle(fontSize: 14, color: Colors.grey[600]),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 24),

                        // Contenu dynamique selon l'étape
                        _buildStepContent(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Navigation
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // Précédent
                  if (_currentStep > 0)
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => setState(() => _currentStep--),
                        icon: const Icon(Icons.arrow_back_rounded),
                        label: const Text('Précédent'),
                      ),
                    ),
                  if (_currentStep > 0) const SizedBox(width: 12),
                  // Valider / Suivant
                  Expanded(
                    flex: 2,
                    child: SizedBox(
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          setState(() => _stepCompleted[_currentStep] = true);
                          if (_currentStep < _steps.length - 1) {
                            setState(() => _currentStep++);
                          } else {
                            Navigator.pushReplacement(
                              context,
                              MaterialPageRoute(
                                builder: (_) => MeasurementsScreen(
                                  jobId: widget.jobId,
                                  customerName: widget.customerName,
                                ),
                              ),
                            );
                          }
                        },
                        icon: Icon(_currentStep < _steps.length - 1 ? Icons.arrow_forward_rounded : Icons.check_rounded),
                        label: Text(_currentStep < _steps.length - 1 ? 'Suivant' : 'Terminer l\'installation'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF003366),
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepContent() {
    switch (_currentStep) {
      case 0: // Repérer PBO
        return Column(
          children: [
            _infoText('Cherchez le Point de Branchement Optique (PBO) dans la zone. Il se trouve généralement dans les parties communes (cave, parking, local technique).'),
            const SizedBox(height: 16),
            _photoButton('Photo du PBO', _photoPbo, () => _takePhoto('pbo')),
          ],
        );
      case 1: // Choisir port
        return Column(
          children: [
            _infoText('Identifiez un port libre sur le PBO. Notez le numéro du port et du splitter associé.'),
            const SizedBox(height: 16),
            _textField('Port PBO', (v) {}),
            const SizedBox(height: 8),
            _textField('Splitter', (v) {}),
          ],
        );
      case 2: // Scanner PTO
        return Column(
          children: [
            _infoText('Scannez le code-barres de la Prise Terminale Optique (PTO) à l\'aide de la caméra.'),
            const SizedBox(height: 16),
            _scanField('N° PTO', _ptoNumber, (v) => setState(() => _ptoNumber = v), () => _scanCode('pto')),
            const SizedBox(height: 8),
            _photoButton('Photo de la PTO', _photoPto, () => _takePhoto('pto')),
          ],
        );
      case 3: // Installer PTO
        return Column(
          children: [
            _infoText('Fixez solidement la PTO au mur près de la prise électrique. Laissez assez de câble pour le raccordement.'),
            const SizedBox(height: 16),
            _checkItem('PTO fixée au mur'),
            _checkItem('Câble suffisant'),
            _checkItem('Connecteur propre'),
          ],
        );
      case 4: // Scanner ONT
        return Column(
          children: [
            _infoText('Scannez le numéro de série de l\'ONT (Optical Network Terminal).'),
            const SizedBox(height: 16),
            _scanField('N° série ONT', _ontSerial, (v) => setState(() => _ontSerial = v), () => _scanCode('ont')),
            const SizedBox(height: 8),
            _photoButton('Photo ONT', _photoOnt, () => _takePhoto('ont')),
          ],
        );
      case 5: // Installer ONT
        return Column(
          children: [
            _infoText('Placez l\'ONT à proximité de la PTO et d\'une prise électrique. Branchez le câble optique.'),
            const SizedBox(height: 16),
            _checkItem('ONT sous tension (voyant vert)'),
            _checkItem('Fibre optique branchée'),
            _checkItem('Câble Ethernet prêt'),
          ],
        );
      case 6: // Scanner Routeur
        return Column(
          children: [
            _infoText('Scannez le numéro de série du routeur WiFi / Box.'),
            const SizedBox(height: 16),
            _scanField('N° série Routeur', _routerSerial, (v) => setState(() => _routerSerial = v), () => _scanCode('router')),
            const SizedBox(height: 8),
            _scanField('Adresse MAC', _macAddress, (v) => setState(() => _macAddress = v), () => _scanCode('mac')),
            const SizedBox(height: 8),
            _photoButton('Photo Routeur', _photoRouteur, () => _takePhoto('routeur')),
          ],
        );
      case 7: // Brancher
        return Column(
          children: [
            _infoText('Connectez tous les éléments : PTO → ONT → Routeur. Vérifiez les branchements avant la mise sous tension.'),
            const SizedBox(height: 16),
            _checkItem('Fibre PTO → ONT connectée'),
            _checkItem('Ethernet ONT → Routeur connecté'),
            _checkItem('Câble d\'alimentation ONT branché'),
            _checkItem('Câble d\'alimentation Routeur branché'),
            _checkItem('Téléphone branché (si VoIP)'),
          ],
        );
      case 8: // Photographier
        return Column(
          children: [
            _infoText('Prenez une photo finale de l\'installation complète pour la documentation.'),
            const SizedBox(height: 16),
            _photoButton('Photo installation complète', _photoInstallation, () => _takePhoto('installation')),
          ],
        );
      case 9: // Tester
        return Column(
          children: [
            _infoText('Vérifiez la puissance optique avec le photomètre pour valider l\'installation.'),
            const SizedBox(height: 16),
            _textField('Puissance optique (dBm)', (v) {}),
            const SizedBox(height: 8),
            _textField('Longueur câble (m)', (v) {}),
          ],
        );
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _infoText(String text) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF0F4FF),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline_rounded, color: Color(0xFF003366), size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(fontSize: 13, color: Colors.grey[800]))),
        ],
      ),
    );
  }

  Widget _photoButton(String label, String? path, VoidCallback onTap) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(path != null ? Icons.check_circle_rounded : Icons.camera_alt_rounded,
            color: path != null ? const Color(0xFF00A86B) : null),
        label: Text(path != null ? '$label ✓' : label),
      ),
    );
  }

  Widget _scanField(String label, String value, ValueChanged<String> onChanged, VoidCallback onScan) {
    return TextField(
      decoration: InputDecoration(
        labelText: label,
        hintText: 'Scannez ou saisissez',
        suffixIcon: IconButton(
          icon: const Icon(Icons.qr_code_scanner_rounded, color: Color(0xFF003366)),
          onPressed: onScan,
        ),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: Colors.grey[50],
      ),
      controller: TextEditingController(text: value),
      onChanged: onChanged,
    );
  }

  Widget _checkItem(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(Icons.check_circle_outline_rounded, color: Colors.grey[400], size: 20),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(fontSize: 13, color: Colors.grey[700])),
        ],
      ),
    );
  }

  Widget _textField(String label, ValueChanged<String> onChanged) {
    return TextField(
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: Colors.grey[50],
      ),
      keyboardType: TextInputType.text,
      onChanged: onChanged,
    );
  }

  Future<void> _takePhoto(String type) async {
    final picker = ImagePicker();
    final photo = await picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (photo != null && mounted) {
      setState(() {
        switch (type) {
          case 'pbo': _photoPbo = photo.path; break;
          case 'pto': _photoPto = photo.path; break;
          case 'ont': _photoOnt = photo.path; break;
          case 'routeur': _photoRouteur = photo.path; break;
          case 'cablage': _photoCablage = photo.path; break;
          case 'installation': _photoInstallation = photo.path; break;
        }
      });
    }
  }

  Future<void> _scanCode(String type) async {
    final code = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => BarcodeScannerWidget(onScanned: (value) => value),
      ),
    );
    if (code != null && mounted) {
      setState(() {
        switch (type) {
          case 'pto': _ptoNumber = code; break;
          case 'ont': _ontSerial = code; break;
          case 'router': _routerSerial = code; break;
          case 'mac': _macAddress = code; break;
        }
      });
    }
  }
}

class _InstallStep {
  final String title;
  final IconData icon;
  final String description;

  _InstallStep(this.title, this.icon, this.description);
}