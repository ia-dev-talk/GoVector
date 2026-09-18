import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/app/mobile_bootstrap.dart';
import 'package:mobile_app/design_system/bluevector_theme.dart';
import 'package:mobile_app/features/actions/free_photo_action_screen.dart';
import 'package:mobile_app/models/job.dart';

void main() {
  setUpAll(() async {
    await initializeBlueVectorMobile();
  });

  testWidgets('photo terrain exposes camera and gallery directly', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(430, 1000));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final job = Job(
      id: 42,
      jobNumber: 'DTLI-42',
      jobType: 'Installation FTTH',
      status: 'in_progress',
      customerName: 'Client test',
      serviceAddress: 'Adresse test',
      assignedTechId: 7,
      latitude: 33.57,
      longitude: -7.59,
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: BlueVectorTheme.light,
        home: FreePhotoActionScreen(job: job),
      ),
    );

    await tester.pump();

    expect(find.text('Photos terrain'), findsOneWidget);
    expect(find.text('Prendre une photo'), findsOneWidget);
    expect(find.text('Galerie'), findsOneWidget);

    expect(find.text('Ajouter une ou plusieurs photos'), findsNothing);

    expect(find.byIcon(Icons.photo_camera_outlined), findsWidgets);
    expect(find.byIcon(Icons.photo_library_outlined), findsOneWidget);
  });
}
