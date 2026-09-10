import 'package:flutter/material.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../services/auth_service.dart';
import '../agent/field_agent_shell.dart';
import '../shell/technician_shell.dart';
import 'field_login_screen.dart';

class _FieldSession {
  const _FieldSession({required this.role, this.technicianId});

  final String role;
  final int? technicianId;
}

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late Future<_FieldSession?> _session;

  @override
  void initState() {
    super.initState();
    _session = _resolveSession();
  }

  Future<_FieldSession?> _resolveSession() async {
    if (!await AuthService.isLoggedIn()) return null;
    final role = await AuthService.getRole();
    if (role == MobileFieldRole.technician) {
      final technicianId = await AuthService.getTechnicianId();
      if (technicianId == null || technicianId <= 0) return null;
      return _FieldSession(role: role!, technicianId: technicianId);
    }
    if (role == MobileFieldRole.fieldAgent) {
      final orienteurId = await AuthService.getOrienteurId();
      if (orienteurId == null || orienteurId <= 0) return null;
      return _FieldSession(role: role!);
    }
    return null;
  }

  void _authenticated() {
    setState(() => _session = _resolveSession());
  }

  Future<void> _logout() async {
    await AuthService.logout();
    if (!mounted) return;
    setState(() => _session = Future<_FieldSession?>.value(null));
  }

  void _retry() {
    setState(() => _session = _resolveSession());
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<_FieldSession?>(
      future: _session,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _BootScreen();
        }
        if (snapshot.hasError) {
          return _SessionError(onRetry: _retry);
        }

        final session = snapshot.data;
        if (session?.role == MobileFieldRole.technician &&
            session?.technicianId != null) {
          return TechnicianShell(
            technicianId: session!.technicianId!,
            onLogout: _logout,
          );
        }
        if (session?.role == MobileFieldRole.fieldAgent) {
          return FieldAgentShell(onLogout: _logout);
        }
        return FieldLoginScreen(onAuthenticated: _authenticated);
      },
    );
  }
}

class _BootScreen extends StatelessWidget {
  const _BootScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [BlueVectorColors.surface, BlueVectorColors.background],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                BlueVectorBrand(showSubtitle: true),
                SizedBox(height: 28),
                SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(strokeWidth: 2.6),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SessionError extends StatelessWidget {
  const _SessionError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        minimum: const EdgeInsets.all(BlueVectorSpacing.xl),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline_rounded,
                  color: BlueVectorColors.danger,
                  size: 48,
                ),
                const SizedBox(height: BlueVectorSpacing.md),
                Text(
                  'Impossible de vérifier la session',
                  style: Theme.of(context).textTheme.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: BlueVectorSpacing.sm),
                const Text(
                  'La session locale n’a pas pu être lue.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: BlueVectorSpacing.lg),
                FilledButton(
                  onPressed: onRetry,
                  child: const Text('Réessayer'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
