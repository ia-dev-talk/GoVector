import 'package:flutter/material.dart';
import 'validation_screen.dart';

class TestsScreen extends StatefulWidget {
  final int jobId;
  final String customerName;

  const TestsScreen({
    super.key,
    required this.jobId,
    required this.customerName,
  });

  @override
  State<TestsScreen> createState() => _TestsScreenState();
}

enum TestStatus { ok, ko, nonTeste }

class _TestsScreenState extends State<TestsScreen> {
  final Map<String, TestStatus> _tests = {};
  final _debitController = TextEditingController();
  final _pingController = TextEditingController();
  final _commentController = TextEditingController();

  final _testItems = [
    ('internet', 'Connexion Internet', Icons.language_rounded, 'Vérifiez que le navigateur charge une page web'),
    ('voyants', 'Voyants ONT/Routeur', Icons.lightbulb_rounded, 'Vérifiez que tous les voyants sont verts'),
    ('wifi', 'WiFi', Icons.wifi_rounded, 'Testez la connexion WiFi avec un smartphone'),
    ('telephone', 'Téléphone', Icons.phone_rounded, 'Passez un appel test (si VoIP)'),
    ('tv', 'TV', Icons.tv_rounded, 'Vérifiez que la TV fonctionne (si abonné)'),
    ('ping', 'Ping', Icons.speed_rounded, 'Testez la latence réseau'),
  ];

  int get _okCount => _tests.values.where((t) => t == TestStatus.ok).length;
  int get _totalCount => _testItems.length;
  bool get _allOk => _okCount == _totalCount;

  @override
  void dispose() {
    _debitController.dispose();
    _pingController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tests'),
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
                    const Icon(Icons.speed_rounded, color: Colors.white, size: 24),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Tests de validation',
                        style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _allOk
                            ? const Color(0xFF00A86B).withOpacity(0.3)
                            : Colors.white.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '$_okCount/$_totalCount',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: _okCount / _totalCount,
                    minHeight: 6,
                    backgroundColor: Colors.white.withOpacity(0.2),
                    valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF00A86B)),
                  ),
                ),
              ],
            ),
          ),

          // Liste des tests
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ..._testItems.map((item) => _buildTestItem(item)),
                const SizedBox(height: 16),

                // Débit
                _sectionTitle('Mesures complémentaires'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _debitController,
                        decoration: InputDecoration(
                          labelText: 'Débit (Mbps)',
                          hintText: 'Ex: 300',
                          prefixIcon: const Icon(Icons.speed_rounded, size: 20),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _pingController,
                        decoration: InputDecoration(
                          labelText: 'Ping (ms)',
                          hintText: 'Ex: 15',
                          prefixIcon: const Icon(Icons.timer_rounded, size: 20),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          filled: true,
                          fillColor: Colors.white,
                        ),
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // Commentaire
                TextField(
                  controller: _commentController,
                  maxLines: 2,
                  decoration: InputDecoration(
                    labelText: 'Commentaire tests',
                    hintText: 'Résultat des tests...',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),

                // Résultat global
                if (_tests.length == _totalCount)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: _allOk
                          ? const Color(0xFFF0FDF4)
                          : const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: _allOk
                            ? const Color(0xFFBBF7D0)
                            : const Color(0xFFFECACA),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          _allOk ? Icons.check_circle_rounded : Icons.warning_rounded,
                          color: _allOk ? const Color(0xFF00A86B) : const Color(0xFFE53E3E),
                          size: 28,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            _allOk
                                ? 'Tous les tests sont OK'
                                : 'Certains tests ont échoué — vérifiez les points en rouge',
                            style: TextStyle(
                              color: _allOk ? const Color(0xFF166534) : const Color(0xFF991B1B),
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
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
                  onPressed: _tests.length == _totalCount
                      ? () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ValidationScreen(
                                jobId: widget.jobId,
                                customerName: widget.customerName,
                              ),
                            ),
                          );
                        }
                      : null,
                  icon: const Icon(Icons.arrow_forward_rounded),
                  label: Text(
                    _tests.length == _totalCount
                        ? 'Voir le récapitulatif'
                        : 'Testez tous les points',
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _tests.length == _totalCount ? const Color(0xFF003366) : Colors.grey.shade300,
                    foregroundColor: _tests.length == _totalCount ? Colors.white : Colors.grey,
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
          width: 4, height: 20,
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

  Widget _buildTestItem((String, String, IconData, String) item) {
    final key = item.$1;
    final status = _tests[key];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: status == TestStatus.ok
              ? const Color(0xFFBBF7D0)
              : status == TestStatus.ko
                  ? const Color(0xFFFECACA)
                  : Colors.grey.shade200,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: const Color(0xFF003366).withOpacity(0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(item.$3, color: const Color(0xFF003366), size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.$2, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    Text(item.$4, style: TextStyle(fontSize: 11, color: Colors.grey[500])),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              _statusButton('OK', TestStatus.ok, status == TestStatus.ok, const Color(0xFF00A86B)),
              const SizedBox(width: 6),
              _statusButton('KO', TestStatus.ko, status == TestStatus.ko, const Color(0xFFE53E3E)),
              const SizedBox(width: 6),
              _statusButton('N/T', TestStatus.nonTeste, status == TestStatus.nonTeste, Colors.grey),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statusButton(String label, TestStatus value, bool isSelected, Color color) {
    return GestureDetector(
      onTap: () => setState(() => _tests[value.name] = value),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? color.withOpacity(0.15) : Colors.grey.shade100,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? color : Colors.grey.shade200,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? color : Colors.grey[600],
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}