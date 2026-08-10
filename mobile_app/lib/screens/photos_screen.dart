import 'dart:io'; // Fix 1: Required for File(path)
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'tests_screen.dart';

class PhotosScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const PhotosScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends State<PhotosScreen> {
  final Map<String, String?> _photos = {
    'avant': null,
    'apres': null,
    'pbo': null,
    'pto': null,
    'ont': null,
    'routeur': null,
    'cable': null,
    'incident': null,
    'facade': null,
    'interieur': null,
  };

  final _categories = const [
    ('avant', 'Avant', Icons.photo_camera_back_rounded, Color(0xFF3B82F6)),
    ('apres', 'Après', Icons.photo_camera_front_rounded, Color(0xFF10B981)),
    ('pbo', 'PBO', Icons.inventory_2_rounded, Color(0xFF8B5CF6)),
    ('pto', 'PTO', Icons.cable_rounded, Color(0xFFF59E0B)),
    ('ont', 'ONT', Icons.devices_rounded, Color(0xFF14B8A6)),
    ('routeur', 'Routeur', Icons.router_rounded, Color(0xFF6366F1)),
    ('cable', 'Câble', Icons.link_rounded, Color(0xFFEC4899)),
    ('incident', 'Incident', Icons.warning_rounded, Color(0xFFEF4444)),
    ('facade', 'Façade', Icons.home_rounded, Color(0xFF003366)),
    ('interieur', 'Intérieur', Icons.meeting_room_rounded, Color(0xFF6B7280)),
  ];

  int get _takenCount => _photos.values.where((p) => p != null).length;
  int get _totalCount => _categories.length;

  Future<void> _takePhoto(String key) async {
    final picker = ImagePicker();
    final photo = await picker.pickImage(source: ImageSource.camera, imageQuality: 85);
    if (photo != null && mounted) {
      setState(() => _photos[key] = photo.path);
    }
  }

  Future<void> _retakePhoto(String key) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reprendre la photo ?'),
        content: const Text('Voulez-vous reprendre cette photo ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Garder')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Reprendre')),
        ],
      ),
    );
    if (confirm == true) {
      await _takePhoto(key);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Photos'),
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
                    const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 24),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Documentation photo',
                        style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '$_takenCount/$_totalCount',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: _takenCount / _totalCount,
                    minHeight: 6,
                    backgroundColor: Colors.white.withValues(alpha: 0.2),
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF00A86B)),
                  ),
                ),
              ],
            ),
          ),

          // Grille photos
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 1.1,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
              ),
              itemCount: _categories.length,
              itemBuilder: (context, index) {
                final cat = _categories[index];
                final path = _photos[cat.$1];
                return _photoCard(
                  key_: cat.$1,
                  label: cat.$2, // Fix 2: cat.$2 is String ('Avant', etc.)
                  icon: cat.$3,  // Fix 2: cat.$3 is IconData (Icons.photo_camera_back_rounded, etc.)
                  color: cat.$4,
                  path: path,
                  onTap: () => path != null ? _retakePhoto(cat.$1) : _takePhoto(cat.$1),
                );
              },
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
                  onPressed: _takenCount >= 3
                      ? () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => TestsScreen(
                                jobId: widget.jobId,
                                customerName: widget.customerName,
                              ),
                            ),
                          );
                        }
                      : null,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: Text(
                    _takenCount >= 3
                        ? 'Continuer vers les tests'
                        : 'Prenez au moins 3 photos',
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _takenCount >= 3 ? const Color(0xFF003366) : Colors.grey.shade300,
                    foregroundColor: _takenCount >= 3 ? Colors.white : Colors.grey,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _photoCard({
    required String key_,
    required IconData icon,
    required String label,
    required Color color,
    required String? path,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: path != null ? color.withValues(alpha: 0.3) : Colors.grey.shade200,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (path != null)
                Stack(
                  alignment: Alignment.center,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.file(
                        File(path),
                        width: 60,
                        height: 60,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Positioned(
                      top: 0,
                      right: 0,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: const BoxDecoration(
                          color: Color(0xFF00A86B),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.check_rounded, color: Colors.white, size: 12),
                      ),
                    ),
                  ],
                )
              else
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, color: color, size: 24),
                ),
              const SizedBox(height: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: path != null ? color : Colors.grey[700],
                ),
              ),
              Text(
                path != null ? '✓ Pris' : 'Prendre',
                style: TextStyle(fontSize: 10, color: path != null ? color : Colors.grey[500]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}