import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../config/config.dart';

class OCRService {
  /// Envoie une photo au backend pour extraction du numéro de série
  static Future<Map<String, dynamic>?> scanRouterSerial(File imageFile) async {
    try {
      final uri = AppConfig.apiUri('tech/scan-router-sn');

      final request = http.MultipartRequest('POST', uri);

      request.files.add(
        await http.MultipartFile.fromPath(
          'file',
          imageFile.path,
          contentType: http.MediaType('image', 'jpeg'),
        ),
      );

      final streamedResponse = await request.send().timeout(
        AppConfig.httpTimeout,
      );
      final response = await http.Response.fromStream(
        streamedResponse,
      ).timeout(AppConfig.httpTimeout);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data;
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }
}
