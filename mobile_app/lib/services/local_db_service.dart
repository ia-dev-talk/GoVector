import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';

/// Service de base de données locale SQLite pour le mode hors ligne
class LocalDbService {
  static Database? _db;
  static const String _dbName = 'fieldopt_offline.db';
  static const int _dbVersion = 1;

  /// Initialiser la base de données locale
  static Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await _initDb();
    return _db!;
  }

  static Future<Database> _initDb() async {
    final dbPath = await getDatabasesPath();
    final path = p.join(dbPath, _dbName);

    return openDatabase(
      path,
      version: _dbVersion,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE pending_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            retry_count INTEGER DEFAULT 0,
            last_error TEXT
          )
        ''');
        await db.execute('''
          CREATE TABLE cached_jobs (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE cached_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            path TEXT NOT NULL,
            synced INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE cached_signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            synced INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE gps_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            accuracy REAL,
            altitude REAL,
            speed REAL,
            heading REAL,
            synced INTEGER DEFAULT 0,
            recorded_at TEXT NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE activity_log_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            description TEXT,
            synced INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
          )
        ''');
      },
    );
  }

  // ===================== ACTIONS EN ATTENTE =====================

  static Future<void> addPendingAction({
    required String action,
    required Map<String, dynamic> payload,
  }) async {
    try {
      final db = await database;
      await db.insert('pending_actions', {
        'action': action,
        'payload': jsonEncode(payload),
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Erreur addPendingAction: $e');
    }
  }

  static Future<List<Map<String, dynamic>>> getPendingActions() async {
    try {
      final db = await database;
      final rows = await db.query('pending_actions', orderBy: 'created_at ASC');
      return rows.map((row) => {
        'id': row['id'],
        'action': row['action'],
        'data': jsonDecode(row['payload'] as String),
        'created_at': row['created_at'],
        'retry_count': row['retry_count'],
        'last_error': row['last_error'],
      }).toList();
    } catch (e) {
      debugPrint('Erreur getPendingActions: $e');
      return [];
    }
  }

  static Future<void> removePendingAction(int id) async {
    try {
      final db = await database;
      await db.delete('pending_actions', where: 'id = ?', whereArgs: [id]);
    } catch (e) {
      debugPrint('Erreur removePendingAction: $e');
    }
  }

  static Future<void> markPendingActionError(int id, String error) async {
    try {
      final db = await database;
      await db.update(
        'pending_actions',
        {'last_error': error, 'retry_count': db.rawUpdate('retry_count + 1')},
        where: 'id = ?',
        whereArgs: [id],
      );
    } catch (e) {
      debugPrint('Erreur markPendingActionError: $e');
    }
  }

  static Future<int> getPendingCount() async {
    try {
      final db = await database;
      final result = await db.rawQuery('SELECT COUNT(*) as count FROM pending_actions');
      return Sqflite.firstIntValue(result) ?? 0;
    } catch (e) {
      return 0;
    }
  }

  // ===================== PHOTOS CACHE =====================

  static Future<void> cachePhoto({
    required int jobId,
    required String type,
    required String path,
  }) async {
    try {
      final db = await database;
      await db.insert('cached_photos', {
        'job_id': jobId,
        'type': type,
        'path': path,
        'synced': 0,
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Erreur cachePhoto: $e');
    }
  }

  static Future<List<Map<String, dynamic>>> getUnsyncedPhotos() async {
    try {
      final db = await database;
      return await db.query('cached_photos', where: 'synced = 0');
    } catch (e) {
      return [];
    }
  }

  static Future<void> markPhotoSynced(int id) async {
    try {
      final db = await database;
      await db.update('cached_photos', {'synced': 1}, where: 'id = ?', whereArgs: [id]);
    } catch (e) {
      debugPrint('Erreur markPhotoSynced: $e');
    }
  }

  // ===================== GPS CACHE =====================

  static Future<void> cacheGpsPoint({
    int? jobId,
    required double latitude,
    required double longitude,
    double? accuracy,
    double? altitude,
    double? speed,
    double? heading,
  }) async {
    try {
      final db = await database;
      await db.insert('gps_cache', {
        'job_id': jobId,
        'latitude': latitude,
        'longitude': longitude,
        'accuracy': accuracy,
        'altitude': altitude,
        'speed': speed,
        'heading': heading,
        'synced': 0,
        'recorded_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Erreur cacheGpsPoint: $e');
    }
  }

  static Future<List<Map<String, dynamic>>> getUnsyncedGps() async {
    try {
      final db = await database;
      return await db.query('gps_cache', where: 'synced = 0', orderBy: 'recorded_at ASC', limit: 50);
    } catch (e) {
      return [];
    }
  }

  static Future<void> markGpsSynced(int id) async {
    try {
      final db = await database;
      await db.update('gps_cache', {'synced': 1}, where: 'id = ?', whereArgs: [id]);
    } catch (e) {
      debugPrint('Erreur markGpsSynced: $e');
    }
  }

  // ===================== JOBS CACHE =====================

  static Future<void> cacheJob(Map<String, dynamic> jobData) async {
    try {
      final db = await database;
      await db.insert(
        'cached_jobs',
        {
          'id': jobData['id'],
          'data': jsonEncode(jobData),
          'updated_at': DateTime.now().toIso8601String(),
        },
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    } catch (e) {
      debugPrint('Erreur cacheJob: $e');
    }
  }

  static Future<List<Map<String, dynamic>>> getCachedJobs() async {
    try {
      final db = await database;
      final rows = await db.query('cached_jobs', orderBy: 'updated_at DESC');
      return rows.map((row) => jsonDecode(row['data'] as String) as Map<String, dynamic>).toList();
    } catch (e) {
      return [];
    }
  }

  static Future<Map<String, dynamic>?> getCachedJob(int jobId) async {
    try {
      final db = await database;
      final rows = await db.query('cached_jobs', where: 'id = ?', whereArgs: [jobId]);
      if (rows.isNotEmpty) {
        return jsonDecode(rows.first['data'] as String) as Map<String, dynamic>;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // ===================== SIGNATURES CACHE =====================

  static Future<void> cacheSignature({
    required int jobId,
    required String path,
  }) async {
    try {
      final db = await database;
      await db.insert('cached_signatures', {
        'job_id': jobId,
        'path': path,
        'synced': 0,
        'created_at': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      debugPrint('Erreur cacheSignature: $e');
    }
  }
}