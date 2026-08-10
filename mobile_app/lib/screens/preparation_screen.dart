import 'package:flutter/material.dart';
import '../models/workflow_step.dart';
import 'navigation_screen.dart';

class PreparationScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const PreparationScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<PreparationScreen> createState() => _PreparationScreenState();
}

class _PreparationScreenState extends State<PreparationScreen> {
  final EquipmentChecklist checklist = EquipmentChecklist();

  final _equipmentItems = [
    ('epi', 'Équipement de Protection', Icons.shield_rounded, 'EPI complet (gants, casque, chaussures)'),
    ('escabeau', 'Escabeau', Icons.height_rounded, 'Escabeau 3 marches'),
    ('perceuse', 'Perceuse', Icons.build_rounded, 'Perceuse avec embouts'),
    ('soudeuse', 'Soudeuse', Icons.whatshot_rounded, 'Soudeuse fibre optique'),
    ('cliveuse', 'Cliveuse', Icons.content_cut_rounded, 'Cliveuse précision'),
    ('pto', 'PTO', Icons.cable_rounded, 'Prise Terminale Optique'),
    ('ont', 'ONT', Icons.devices_rounded, 'Terminal optique client'),
    ('routeur', 'Routeur WiFi', Icons.router_rounded, 'Box/Routeur client'),
    ('jarretieres', 'Jarretières', Icons.link_rounded, 'Jarretières optiques'),
    ('lingettes', 'Lingettes', Icons.cleaning_services_rounded, 'Lingettes nettoyage connecteurs'),
    ('photometre', 'Photomètre', Icons.science_rounded, 'Photomètre de puissance'),
    ('styloOptique', 'Stylo optique', Icons.edit_rounded, 'Stylo testeur visuel'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Préparation'),
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
                    const Icon(Icons.checklist_rounded, color: Colors.white, size: 24),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Checklist matériel',
                        style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${checklist.completedCount}/${checklist.totalCount}',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Intervention chez ${widget.customerName}',
                  style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 13),
                ),
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: checklist.progress,
                    minHeight: 6,
                    backgroundColor: Colors.white.withOpacity(0.2),
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF00A86B)),
                  ),
                ),
              ],
            ),
          ),

          // Liste
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _equipmentItems.length,
              itemBuilder: (context, index) {
                final item = _equipmentItems[index];
                final isChecked = _getItemChecked(item.$1);
                return _buildCheckItem(
                  key_: item.$1,
                  icon: item.$3,
                  title: item.$2,
                  subtitle: item.$4,
                  checked: isChecked,
                  onChanged: (v) {
                    setState(() => _setItemChecked(item.$1, v));
                  },
                );
              },
            ),
          ),

          // Bouton valider
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: checklist.allChecked
                      ? () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => NavigationScreen(
                                jobId: widget.jobId,
                                customerName: widget.customerName,
                              ),
                            ),
                          );
                        }
                      : null,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: Text(checklist.allChecked
                      ? '✅ Tout est prêt — Démarrer le trajet'
                      : 'Cochez tout le matériel requis'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: checklist.allChecked
                        ? const Color(0xFF00A86B)
                        : Colors.grey.shade300,
                    foregroundColor: checklist.allChecked ? Colors.white : Colors.grey,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  bool _getItemChecked(String key) {
    switch (key) {
      case 'epi': return checklist.epi;
      case 'escabeau': return checklist.escabeau;
      case 'perceuse': return checklist.perceuse;
      case 'soudeuse': return checklist.soudeuse;
      case 'cliveuse': return checklist.cliveuse;
      case 'pto': return checklist.pto;
      case 'ont': return checklist.ont;
      case 'routeur': return checklist.routeur;
      case 'jarretieres': return checklist.jarretieres;
      case 'lingettes': return checklist.lingettes;
      case 'photometre': return checklist.photometre;
      case 'styloOptique': return checklist.styloOptique;
      default: return false;
    }
  }

  void _setItemChecked(String key, bool value) {
    switch (key) {
      case 'epi': checklist.epi = value; break;
      case 'escabeau': checklist.escabeau = value; break;
      case 'perceuse': checklist.perceuse = value; break;
      case 'soudeuse': checklist.soudeuse = value; break;
      case 'cliveuse': checklist.cliveuse = value; break;
      case 'pto': checklist.pto = value; break;
      case 'ont': checklist.ont = value; break;
      case 'routeur': checklist.routeur = value; break;
      case 'jarretieres': checklist.jarretieres = value; break;
      case 'lingettes': checklist.lingettes = value; break;
      case 'photometre': checklist.photometre = value; break;
      case 'styloOptique': checklist.styloOptique = value; break;
    }
  }

  Widget _buildCheckItem({
    required String key_,
    required IconData icon,
    required String title,
    required String subtitle,
    required bool checked,
    required ValueChanged<bool> onChanged,
  }) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      margin: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: checked ? const Color(0xFF00A86B).withOpacity(0.05) : Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => onChanged(!checked),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                // Checkbox custom
                AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: checked ? const Color(0xFF00A86B) : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: checked ? const Color(0xFF00A86B) : Colors.grey.shade300,
                      width: 2,
                    ),
                  ),
                  child: checked
                      ? const Icon(Icons.check_rounded, color: Colors.white, size: 18)
                      : null,
                ),
                const SizedBox(width: 14),
                // Icone
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: checked
                        ? const Color(0xFF00A86B).withOpacity(0.1)
                        : Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    icon,
                    color: checked ? const Color(0xFF00A86B) : Colors.grey[600],
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: checked ? const Color(0xFF00A86B) : null,
                          decoration: checked ? TextDecoration.lineThrough : null,
                        ),
                      ),
                      Text(
                        subtitle,
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey[500],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}