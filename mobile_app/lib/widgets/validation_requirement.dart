import 'package:flutter/material.dart';

enum ValidationRequirementType {
  gps,
  photo,
  serial,
  status,
  comment,
  fieldData,
}

class ValidationRequirement {
  final String id;
  final String label;
  final bool isRequired;
  final bool isSatisfied;
  final ValidationRequirementType type;

  const ValidationRequirement({
    required this.id,
    required this.label,
    required this.isRequired,
    required this.isSatisfied,
    required this.type,
  });
}

class JobValidationSummary extends StatelessWidget {
  final List<ValidationRequirement> requirements;

  const JobValidationSummary({
    super.key,
    required this.requirements,
  });

  @override
  Widget build(BuildContext context) {
    final missing = requirements.where((r) => r.isRequired && !r.isSatisfied).toList();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.verified_outlined,
                  color: missing.isEmpty ? Colors.green : Theme.of(context).colorScheme.error,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  missing.isEmpty ? 'Données complètes' : 'Éléments manquants',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: missing.isEmpty ? Colors.green : Theme.of(context).colorScheme.error,
                      ),
                ),
              ],
            ),
            if (missing.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                ' Compléter avant clôture :',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 8),
              ...missing.map((item) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Icon(
                          Icons.error_outline,
                          color: Theme.of(context).colorScheme.error,
                          size: 16,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            item.label,
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  )),
            ],
          ],
        ),
      ),
    );
  }
}