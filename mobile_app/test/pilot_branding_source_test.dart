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

  test(
    'official logo asset and light theme are the active mobile identity',
    () {
      final brand = File(
        'lib/design_system/bluevector_brand.dart',
      ).readAsStringSync();
      final app = File('lib/app/bluevector_app_v2.dart').readAsStringSync();
      final pubspec = File('pubspec.yaml').readAsStringSync();

      expect(brand, contains("Image.asset("));
      expect(brand, contains('assets/images/govector-logo.png'));
      expect(brand, isNot(contains('CustomPaint')));
      expect(pubspec, contains('assets/images/govector-logo.png'));
      expect(app, contains('BlueVectorTheme.light'));
      expect(app, contains('ThemeMode.light'));
    },
  );

  test('active technician surfaces do not expose generic network labels', () {
    final files = <String>[
      'lib/features/interventions/mobile_interventions_list_screen.dart',
      'lib/features/interventions/current_intervention_screen.dart',
      'lib/features/actions/mobile_action_sheet.dart',
      'lib/features/actions/free_photo_action_screen.dart',
    ];

    for (final path in files) {
      final source = File(path).readAsStringSync();
      for (final label in const ["'PBO'", "'NRO'", "'SRO'"]) {
        expect(source, isNot(contains(label)), reason: '$path: $label');
      }
    }
  });

  test('dynamic photo fields reuse the geolocated media pipeline', () {
    final form = File(
      'lib/features/actions/pilot_dynamic_form_screen.dart',
    ).readAsStringSync();
    final photoPipeline = File(
      'lib/features/actions/free_photo_action_screen.dart',
    ).readAsStringSync();

    expect(form, contains('FreePhotoActionScreen('));
    expect(form, isNot(contains('ImagePicker')));
    expect(photoPipeline, contains('source: ImageSource.camera'));
    expect(photoPipeline, contains("'latitude': photo.latitude"));
    expect(photoPipeline, contains("'longitude': photo.longitude"));
    expect(photoPipeline, contains("'accuracy': photo.accuracy"));
    expect(photoPipeline, contains("'captured_at':"));
    expect(photoPipeline, contains("'not_asserted_from_gallery'"));
  });
}
