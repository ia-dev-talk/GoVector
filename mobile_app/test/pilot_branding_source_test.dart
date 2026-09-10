import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('pilot mobile surfaces expose GoVector without legacy visible copy', () {
    final files = <String>[
      'lib/app/bluevector_app_v2.dart',
      'lib/main.dart',
      'lib/features/actions/free_measurement_action_screen.dart',
      'lib/features/actions/material_used_screen.dart',
      'lib/features/actions/mobile_image_annotation_screen.dart',
      'ios/Runner/Info.plist',
    ];
    final forbiddenVisibleFragments = <String>[
      'BlueVector enregistre',
      'par BlueVector',
      '<string>BlueVector</string>',
    ];

    for (final path in files) {
      final source = File(path).readAsStringSync();
      expect(source, contains('GoVector'), reason: path);
      for (final fragment in forbiddenVisibleFragments) {
        expect(source, isNot(contains(fragment)), reason: '$path: $fragment');
      }
    }
  });
}
