import 'package:flutter/material.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../services/auth_service.dart';

class TechnicianLoginScreen extends StatefulWidget {
  const TechnicianLoginScreen({super.key, required this.onAuthenticated});

  final ValueChanged<int> onAuthenticated;

  @override
  State<TechnicianLoginScreen> createState() => _TechnicianLoginScreenState();
}

class _TechnicianLoginScreenState extends State<TechnicianLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _obscurePassword = true;
  bool _isLoading = false;
  bool _showConnectionInfo = false;
  String? _error;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    FocusScope.of(context).unfocus();

    setState(() {
      _isLoading = true;
      _error = null;
    });

    final success = await AuthService.login(
      _usernameController.text.trim(),
      _passwordController.text,
    );

    if (!mounted) {
      return;
    }

    if (!success) {
      setState(() {
        _isLoading = false;
        _error =
            'Connexion impossible. Vérifie les identifiants et que le téléphone peut joindre le serveur.';
      });
      return;
    }

    final technicianId = await AuthService.getTechnicianId();

    if (!mounted) {
      return;
    }

    if (technicianId == null || technicianId <= 0) {
      setState(() {
        _isLoading = false;
        _error =
            'Le serveur n’a pas retourné un identifiant technicien valide.';
      });
      return;
    }

    widget.onAuthenticated(technicianId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              BlueVectorColors.backgroundDeep,
              BlueVectorColors.background,
              Color(0xFF081925),
            ],
          ),
        ),
        child: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final wide = constraints.maxWidth >= 760;

              final form = ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: _buildForm(context),
              );

              final content = wide
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        const Expanded(child: _FieldPromisePanel()),
                        const SizedBox(width: BlueVectorSpacing.xxl),
                        Expanded(child: form),
                      ],
                    )
                  : form;

              return Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(BlueVectorSpacing.xl),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 920),
                    child: content,
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Align(alignment: Alignment.centerLeft, child: BlueVectorBrand()),
        const SizedBox(height: BlueVectorSpacing.xxl),
        Text('Bonjour 👋', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: BlueVectorSpacing.xs),
        const Text(
          'Connecte-toi pour retrouver ton planning terrain.',
          style: TextStyle(color: BlueVectorColors.textSecondary),
        ),
        const SizedBox(height: BlueVectorSpacing.xl),
        Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _usernameController,
                enabled: !_isLoading,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                autofillHints: const [AutofillHints.username],
                decoration: const InputDecoration(
                  labelText: 'Identifiant',
                  hintText: 'prenom.nom ou matricule',
                  prefixIcon: Icon(Icons.person_outline_rounded),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Identifiant requis';
                  }
                  return null;
                },
              ),
              const SizedBox(height: BlueVectorSpacing.md),
              TextFormField(
                controller: _passwordController,
                enabled: !_isLoading,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                onFieldSubmitted: (_) => _login(),
                decoration: InputDecoration(
                  labelText: 'Mot de passe',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  suffixIcon: IconButton(
                    tooltip: _obscurePassword ? 'Afficher' : 'Masquer',
                    onPressed: () {
                      setState(() {
                        _obscurePassword = !_obscurePassword;
                      });
                    },
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                    ),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Mot de passe requis';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: BlueVectorSpacing.md),
          _LoginError(message: _error!),
        ],
        const SizedBox(height: BlueVectorSpacing.lg),
        FilledButton(
          onPressed: _isLoading ? null : _login,
          child: _isLoading
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    color: Colors.white,
                  ),
                )
              : const Text('Se connecter'),
        ),
        const SizedBox(height: BlueVectorSpacing.sm),
        TextButton.icon(
          onPressed: _isLoading
              ? null
              : () {
                  setState(() {
                    _showConnectionInfo = !_showConnectionInfo;
                  });
                },
          icon: const Icon(Icons.lan_outlined, size: 18),
          label: Text(
            _showConnectionInfo
                ? 'Masquer le diagnostic'
                : 'Diagnostic connexion',
          ),
        ),
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 180),
          crossFadeState: _showConnectionInfo
              ? CrossFadeState.showSecond
              : CrossFadeState.showFirst,
          firstChild: const SizedBox.shrink(),
          secondChild: const _ConnectionInfo(),
        ),
        const SizedBox(height: BlueVectorSpacing.lg),
        const _OfflinePromise(),
      ],
    );
  }
}

class _LoginError extends StatelessWidget {
  const _LoginError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.danger.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        border: Border.all(
          color: BlueVectorColors.danger.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: BlueVectorColors.danger,
            size: 20,
          ),
          const SizedBox(width: BlueVectorSpacing.xs),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: BlueVectorColors.textPrimary,
                fontSize: 12,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ConnectionInfo extends StatelessWidget {
  const _ConnectionInfo();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: BlueVectorSpacing.xs),
      padding: const EdgeInsets.all(BlueVectorSpacing.sm),
      decoration: BoxDecoration(
        color: BlueVectorColors.surface,
        borderRadius: BorderRadius.circular(BlueVectorRadius.small),
        border: Border.all(color: BlueVectorColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Serveur configuré',
            style: TextStyle(
              color: BlueVectorColors.textSecondary,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.xs),
          SelectableText(
            AuthService.baseUrl,
            style: const TextStyle(
              color: BlueVectorColors.primaryBright,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: BlueVectorSpacing.xs),
          const Text(
            'Le téléphone et le PC doivent être sur le même réseau tant que l’API reste locale.',
            style: TextStyle(
              color: BlueVectorColors.textMuted,
              fontSize: 11,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _OfflinePromise extends StatelessWidget {
  const _OfflinePromise();

  @override
  Widget build(BuildContext context) {
    return const Row(
      children: [
        Icon(
          Icons.cloud_off_outlined,
          color: BlueVectorColors.textMuted,
          size: 18,
        ),
        SizedBox(width: BlueVectorSpacing.xs),
        Expanded(
          child: Text(
            'Après la première connexion, les interventions déjà synchronisées restent disponibles hors ligne.',
            style: TextStyle(
              color: BlueVectorColors.textMuted,
              fontSize: 11,
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _FieldPromisePanel extends StatelessWidget {
  const _FieldPromisePanel();

  @override
  Widget build(BuildContext context) {
    const promises = [
      (
        Icons.flash_on_outlined,
        'Simple',
        'Concentré sur l’intervention en cours.',
      ),
      (Icons.route_outlined, 'Guidée', 'Les étapes terrain restent visibles.'),
      (
        Icons.bluetooth_searching_outlined,
        'Connectée',
        'GPS, mesures et preuves au même endroit.',
      ),
      (
        Icons.cloud_off_outlined,
        'Hors ligne',
        'Le travail continue sans réseau.',
      ),
    ];

    return Padding(
      padding: const EdgeInsets.only(right: BlueVectorSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'L’application terrain\npensée pour le FTTH.',
            style: Theme.of(context).textTheme.displaySmall,
          ),
          const SizedBox(height: BlueVectorSpacing.xl),
          for (final promise in promises)
            Padding(
              padding: const EdgeInsets.only(bottom: BlueVectorSpacing.lg),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: BlueVectorColors.surface,
                      borderRadius: BorderRadius.circular(
                        BlueVectorRadius.small,
                      ),
                      border: Border.all(color: BlueVectorColors.border),
                    ),
                    child: Icon(
                      promise.$1,
                      color: BlueVectorColors.primaryBright,
                      size: 21,
                    ),
                  ),
                  const SizedBox(width: BlueVectorSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          promise.$2,
                          style: const TextStyle(
                            color: BlueVectorColors.textPrimary,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          promise.$3,
                          style: const TextStyle(
                            color: BlueVectorColors.textSecondary,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
