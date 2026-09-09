import 'package:flutter/material.dart';

import '../../design_system/bluevector_brand.dart';
import '../../design_system/bluevector_tokens.dart';
import '../../services/auth_service.dart';

class FieldLoginScreen extends StatefulWidget {
  const FieldLoginScreen({super.key, required this.onAuthenticated});

  final VoidCallback onAuthenticated;

  @override
  State<FieldLoginScreen> createState() => _FieldLoginScreenState();
}

class _FieldLoginScreenState extends State<FieldLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_formKey.currentState!.validate()) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    final success = await AuthService.login(
      _username.text.trim(),
      _password.text,
    );
    if (!mounted) return;
    if (!success) {
      setState(() {
        _busy = false;
        _error = AuthService.lastLoginFailure?.message ??
            'Connexion impossible. Vérifiez les identifiants et la connexion au serveur.';
      });
      return;
    }
    widget.onAuthenticated();
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
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(BlueVectorSpacing.xl),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: BlueVectorBrand(showSubtitle: true),
                      ),
                      const SizedBox(height: BlueVectorSpacing.xxl),
                      Text(
                        'Accès terrain',
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                              fontWeight: FontWeight.w900,
                            ),
                      ),
                      const SizedBox(height: BlueVectorSpacing.xs),
                      const Text(
                        'Technicien ou Agent terrain · la même application adapte automatiquement votre espace.',
                        style: TextStyle(color: BlueVectorColors.textSecondary),
                      ),
                      const SizedBox(height: BlueVectorSpacing.xl),
                      TextFormField(
                        controller: _username,
                        enabled: !_busy,
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        autofillHints: const [AutofillHints.username],
                        decoration: const InputDecoration(
                          labelText: 'Identifiant',
                          prefixIcon: Icon(Icons.person_outline_rounded),
                        ),
                        validator: (value) => value == null || value.trim().isEmpty
                            ? 'Identifiant requis'
                            : null,
                      ),
                      const SizedBox(height: BlueVectorSpacing.md),
                      TextFormField(
                        controller: _password,
                        enabled: !_busy,
                        obscureText: _obscure,
                        textInputAction: TextInputAction.done,
                        autofillHints: const [AutofillHints.password],
                        onFieldSubmitted: (_) => _submit(),
                        decoration: InputDecoration(
                          labelText: 'Mot de passe',
                          prefixIcon: const Icon(Icons.lock_outline_rounded),
                          suffixIcon: IconButton(
                            tooltip: _obscure ? 'Afficher' : 'Masquer',
                            onPressed: _busy ? null : () => setState(() => _obscure = !_obscure),
                            icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                          ),
                        ),
                        validator: (value) => value == null || value.isEmpty
                            ? 'Mot de passe requis'
                            : null,
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: BlueVectorSpacing.md),
                        Text(_error!, style: const TextStyle(color: BlueVectorColors.danger)),
                      ],
                      const SizedBox(height: BlueVectorSpacing.lg),
                      FilledButton.icon(
                        onPressed: _busy ? null : _submit,
                        icon: _busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Icon(Icons.login_rounded),
                        label: Text(_busy ? 'Connexion…' : 'Se connecter'),
                      ),
                      const SizedBox(height: BlueVectorSpacing.sm),
                      const Text(
                        'En 4G, cette connexion utilise uniquement l’API GoVector HTTPS. Le dashboard et PostgreSQL restent dans l’entreprise.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, color: BlueVectorColors.textMuted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
