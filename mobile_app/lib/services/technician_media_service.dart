import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:path/path.dart' as path_util;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../config/config.dart';
import '../features/sync/technician_attachment.dart';
import '../features/sync/technician_outbox_event.dart';
import 'technician_attachment_store.dart';
import 'technician_outbox_store.dart';

class TechnicianMediaSyncResult {
  const TechnicianMediaSyncResult({required this.synced, required this.failed});

  final int synced;
  final int failed;
}

class TechnicianMediaService {
  TechnicianMediaService({
    required this.attachmentStore,
    required this.outboxStore,
    required this.endpoint,
    required this.tokenProvider,
    http.Client? client,
  }) : client = client ?? http.Client();

  final TechnicianAttachmentStore attachmentStore;
  final TechnicianOutboxStore outboxStore;
  final Uri endpoint;
  final Future<String?> Function() tokenProvider;
  final http.Client client;
  final Map<String, Future<TechnicianMediaSyncResult>> _inFlight = {};

  Future<TechnicianAttachment> queueFile({
    required TechnicianOutboxOwner owner,
    required int jobId,
    required String sourcePath,
    required String kind,
    required String eventType,
    required String mimeType,
    Map<String, dynamic> metadata = const {},
  }) async {
    final source = File(sourcePath);
    if (!await source.exists()) {
      throw StateError('Fichier source introuvable');
    }
    const uuid = Uuid();
    final attachmentId = uuid.v4();
    final eventId = uuid.v4();
    final root = await getApplicationSupportDirectory();
    final directory = Directory(
      path_util.join(
        root.path,
        'technician_media',
        '${owner.userId}',
        '${owner.technicianId}',
      ),
    );
    await directory.create(recursive: true);
    final extension = path_util.extension(source.path).toLowerCase();
    final persistentPath = path_util.join(
      directory.path,
      '$attachmentId$extension',
    );
    final persistent = await source.copy(persistentPath);
    final digest = await sha256.bind(persistent.openRead()).first;
    final size = await persistent.length();
    final now = DateTime.now();
    final attachment = TechnicianAttachment(
      attachmentId: attachmentId,
      eventId: eventId,
      jobId: jobId,
      ownerUserId: owner.userId,
      ownerTechnicianId: owner.technicianId,
      kind: kind,
      eventType: eventType,
      localPath: persistent.path,
      mimeType: mimeType,
      sizeBytes: size,
      sha256: digest.toString(),
      metadataJson: jsonEncode(metadata),
      status: TechnicianAttachmentStatus.pending,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    );
    await attachmentStore.insert(attachment);
    await outboxStore.enqueue(
      owner: owner,
      jobId: jobId,
      type: eventType,
      payload: {'attachment_id': attachmentId, ...metadata},
      status: TechnicianOutboxStatus.awaitingMedia,
      eventId: eventId,
    );
    return attachment;
  }

  Future<TechnicianMediaSyncResult> sync(TechnicianOutboxOwner owner) {
    final key = '${owner.userId}:${owner.technicianId}';
    final current = _inFlight[key];
    if (current != null) return current;
    final run = _performSync(owner);
    _inFlight[key] = run;
    run.whenComplete(() {
      if (identical(_inFlight[key], run)) _inFlight.remove(key);
    });
    return run;
  }

  Future<TechnicianMediaSyncResult> _performSync(
    TechnicianOutboxOwner owner,
  ) async {
    final token = await tokenProvider();
    if (token == null || token.isEmpty) {
      return const TechnicianMediaSyncResult(synced: 0, failed: 0);
    }
    var synced = 0;
    var failed = 0;
    for (final attachment in await attachmentStore.readyForUpload(owner)) {
      if (attachment.status == TechnicianAttachmentStatus.acknowledged &&
          attachment.mediaId != null) {
        await outboxStore.activateMediaEvent(
          owner: owner,
          eventId: attachment.eventId,
          mediaId: attachment.mediaId!,
        );
        continue;
      }
      final file = File(attachment.localPath);
      if (!await file.exists()) {
        failed++;
        await attachmentStore.markFailed(
          owner,
          attachment.attachmentId,
          TechnicianAttachmentStatus.rejected,
          'Fichier local introuvable',
        );
        await outboxStore.applyAcknowledgements(owner, [
          TechnicianSyncEventAck(
            eventId: attachment.eventId,
            status: TechnicianOutboxStatus.rejected,
            code: 'local_file_missing',
          ),
        ]);
        continue;
      }
      await attachmentStore.markUploading(owner, attachment);
      try {
        final request = http.MultipartRequest('POST', endpoint)
          ..headers['Authorization'] = 'Bearer $token'
          ..fields['attachment_id'] = attachment.attachmentId
          ..fields['job_id'] = '${attachment.jobId}'
          ..fields['kind'] = attachment.kind
          ..fields['sha256'] = attachment.sha256
          ..fields['metadata'] = attachment.metadataJson
          ..files.add(
            await http.MultipartFile.fromPath(
              'file',
              attachment.localPath,
              filename: path_util.basename(attachment.localPath),
              contentType: MediaType.parse(attachment.mimeType),
            ),
          );
        final streamed = await client
            .send(request)
            .timeout(AppConfig.mediaUploadTimeout);
        final response = await http.Response
            .fromStream(streamed)
            .timeout(AppConfig.mediaUploadTimeout);
        if (response.statusCode != 200) {
          final permanent =
              response.statusCode == 403 ||
              response.statusCode == 409 ||
              response.statusCode == 415 ||
              response.statusCode == 422;
          await attachmentStore.markFailed(
            owner,
            attachment.attachmentId,
            permanent
                ? TechnicianAttachmentStatus.rejected
                : TechnicianAttachmentStatus.retryable,
            response.body,
          );
          if (permanent) {
            await outboxStore.applyAcknowledgements(owner, [
              TechnicianSyncEventAck(
                eventId: attachment.eventId,
                status: TechnicianOutboxStatus.rejected,
                code: 'media_upload_rejected',
                error: response.body,
              ),
            ]);
          }
          failed++;
          continue;
        }
        final body = jsonDecode(response.body) as Map<String, dynamic>;
        final mediaId = body['media_id']?.toString();
        if (mediaId == null || mediaId.isEmpty) {
          throw const FormatException('media_id absent');
        }
        await attachmentStore.markAcknowledged(
          owner,
          attachment.attachmentId,
          mediaId,
        );
        await outboxStore.activateMediaEvent(
          owner: owner,
          eventId: attachment.eventId,
          mediaId: mediaId,
        );
        synced++;
      } catch (error) {
        await attachmentStore.markFailed(
          owner,
          attachment.attachmentId,
          TechnicianAttachmentStatus.retryable,
          '$error',
        );
        failed++;
      }
    }
    return TechnicianMediaSyncResult(synced: synced, failed: failed);
  }
}
