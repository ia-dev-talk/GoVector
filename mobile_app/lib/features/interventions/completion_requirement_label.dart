String completionRequirementLabel({
  required String label,
  required String fieldKey,
  required Set<String>? requiredFieldKeys,
}) {
  return requiredFieldKeys?.contains(fieldKey) == true ? '$label *' : label;
}
