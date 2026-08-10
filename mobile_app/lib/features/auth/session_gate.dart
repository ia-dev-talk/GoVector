import 'package:flutter/material.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../services/auth_service.dart';
import '../shell/technician_shell.dart';
import 'technician_login_screen.dart';

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late Future<int?> _session;

  @override
  void initState() {
    super.initState();
    _session = _resolveSession();
  }

  Future<int?> _resolveSession() async {
    final loggedIn = await AuthService.isLoggedIn();

    if (!loggedIn) {
      return null;
    }

    return AuthService.getTechnicianId();
  }

  void _openShell(int technicianId) {
    setState(() {
      _session = Future<int?>.value(technicianId);
    });
  }

  Future<void> _logout() async {
    await AuthService.logout();

    if (!mounted) {
      return;
    }

    setState(() {
      _session = Future<int?>.value(null);
    });
  }

  void _retry() {
    setState(() {
      _session = _resolveSession();
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<int?>(
      future: _session,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _BootScreen();
        }

        if (snapshot.hasError) {
          return _SessionError(onRetry: _retry);
        }

        final technicianId = snapshot.data;

        if (technicianId != null && technicianId > 0) {
          return TechnicianShell(technicianId: technicianId, onLogout: _logout);
        }

        return TechnicianLoginScreen(onAuthenticated: _openShell);
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
            colors: [
              BlueVectorColors.backgroundDeep,
              BlueVectorColors.background,
            ],
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
