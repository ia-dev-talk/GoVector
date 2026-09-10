import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';

const PRODUCT_NAME = 'BlueVector';
const PRODUCT_VERSION = '0.0.8';

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function normalizeAuthenticatedUser(value) {
  if (!isRecord(value)) {
    return null;
  }

  const username =
    normalizeText(value.username);

  const role =
    normalizeText(value.role).toUpperCase();

  if (!username || !role) {
    return null;
  }

  return {
    ...value,
    username,
    role,
  };
}

function normalizeLoginResponse(value) {
  if (!isRecord(value)) {
    return null;
  }

  const accessToken =
    normalizeText(value.access_token);

  const user =
    normalizeAuthenticatedUser(
      value.user,
    );

  if (!accessToken || !user) {
    return null;
  }

  return {
    accessToken,
    user,
  };
}

function clearStoredSession() {
  try {
    window.localStorage.removeItem(
      'token',
    );

    window.localStorage.removeItem(
      'user',
    );
  } catch {
    // Le stockage peut être indisponible.
  }
}

function storeSession(
  accessToken,
  user,
) {
  const serializedUser =
    JSON.stringify(user);

  try {
    window.localStorage.setItem(
      'token',
      accessToken,
    );

    window.localStorage.setItem(
      'user',
      serializedUser,
    );
  } catch (error) {
    clearStoredSession();
    throw error;
  }
}

function getLoginErrorMessage(error) {
  const status = Number(
    error?.response?.status,
  );

  if (
    status === 401 ||
    status === 403
  ) {
    return (
      'Nom d’utilisateur ou mot de passe incorrect.'
    );
  }

  if (status === 429) {
    return (
      'Trop de tentatives de connexion. ' +
      'Veuillez patienter avant de réessayer.'
    );
  }

  if (
    status >= 500 &&
    status <= 599
  ) {
    return (
      'Le serveur BlueVector rencontre un problème. ' +
      'Veuillez réessayer.'
    );
  }

  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  const message =
    error?.response?.data?.message;

  if (
    typeof message === 'string' &&
    message.trim()
  ) {
    return message.trim();
  }

  if (
    !error?.response ||
    error?.code === 'ERR_NETWORK'
  ) {
    return (
      'Serveur inaccessible. Vérifiez la connexion réseau ' +
      'et que le backend BlueVector est démarré.'
    );
  }

  return (
    'Connexion impossible. Veuillez réessayer.'
  );
}

export default function Login({
  onLogin,
}) {
  const usernameId = useId();
  const passwordId = useId();
  const errorId = useId();

  const mountedRef = useRef(false);
  const submittingRef = useRef(false);
  const animationFrameRef =
    useRef(null);

  const usernameInputRef =
    useRef(null);

  const [username, setUsername] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [error, setError] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [visible, setVisible] =
    useState(false);

  useEffect(() => {
    mountedRef.current = true;

    animationFrameRef.current =
      window.requestAnimationFrame(
        () => {
          if (!mountedRef.current) {
            return;
          }

          setVisible(true);

          usernameInputRef.current?.focus();
        },
      );

    return () => {
      mountedRef.current = false;
      submittingRef.current = false;

      if (
        animationFrameRef.current !==
        null
      ) {
        window.cancelAnimationFrame(
          animationFrameRef.current,
        );
      }
    };
  }, []);

  const clearError =
    useCallback(() => {
      if (error) {
        setError('');
      }
    }, [error]);

  const handleUsernameChange =
    useCallback(
      (event) => {
        setUsername(
          event.target.value,
        );

        clearError();
      },
      [clearError],
    );

  const handlePasswordChange =
    useCallback(
      (event) => {
        setPassword(
          event.target.value,
        );

        clearError();
      },
      [clearError],
    );

  const handleSubmit =
    useCallback(
      async (event) => {
        event.preventDefault();

        if (submittingRef.current) {
          return;
        }

        const normalizedUsername =
          username.trim();

        if (
          !normalizedUsername ||
          !password
        ) {
          setError(
            'Saisissez votre identifiant et votre mot de passe.',
          );

          return;
        }

        submittingRef.current = true;
        setError('');
        setLoading(true);

        try {
          const response =
            await api.login(
              normalizedUsername,
              password,
            );

          const session =
            normalizeLoginResponse(
              response,
            );

          if (!session) {
            throw new Error(
              'Réponse d’authentification invalide',
            );
          }

          try {
            storeSession(
              session.accessToken,
              session.user,
            );
          } catch {
            throw new Error(
              'SESSION_STORAGE_UNAVAILABLE',
            );
          }

          if (
            typeof onLogin !==
            'function'
          ) {
            clearStoredSession();

            throw new Error(
              'LOGIN_HANDLER_UNAVAILABLE',
            );
          }

          try {
            await Promise.resolve(
              onLogin(session.user),
            );
          } catch (handlerError) {
            clearStoredSession();
            throw handlerError;
          }
        } catch (loginError) {
          if (!mountedRef.current) {
            return;
          }

          const internalMessage =
            normalizeText(
              loginError?.message,
            );

          if (
            internalMessage ===
            'SESSION_STORAGE_UNAVAILABLE'
          ) {
            setError(
              'Impossible d’enregistrer la session dans ce navigateur. ' +
                'Autorisez le stockage local puis réessayez.',
            );
          } else if (
            internalMessage ===
              'LOGIN_HANDLER_UNAVAILABLE' ||
            internalMessage ===
              'Réponse d’authentification invalide'
          ) {
            setError(
              'La session reçue est invalide. ' +
                'Veuillez réessayer ou contacter un administrateur.',
            );
          } else {
            setError(
              getLoginErrorMessage(
                loginError,
              ),
            );
          }
        } finally {
          submittingRef.current = false;

          if (mountedRef.current) {
            setLoading(false);
          }
        }
      },
      [
        onLogin,
        password,
        username,
      ],
    );

  const submitDisabled =
    loading ||
    !username.trim() ||
    password.length === 0;

  return (
    <main
      className={[
        'login-page',
        visible
          ? 'login-page--visible'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="login-title"
    >
      <div
        className="login-bg-shapes"
        aria-hidden="true"
      >
        <div className="login-bg-circle login-bg-circle--1" />
        <div className="login-bg-circle login-bg-circle--2" />
        <div className="login-bg-circle login-bg-circle--3" />
      </div>

      <div
        className="login-container"
        style={{
          width:
            'min(340px, calc(100vw - 32px))',
          maxHeight:
            'calc(100vh - 32px)',
        }}
      >
        <header className="login-brand">
          <h1
            id="login-title"
            className="login-brand-title"
            style={{
              margin: 0,
              color: 'var(--text-primary)',
              fontSize: 'clamp(28px, 8vw, 40px)',
              fontWeight: 800,
              letterSpacing: '-0.04em',
            }}
          >
            {PRODUCT_NAME}
          </h1>

          <p className="login-brand-subtitle">
            Interventions & stocks FTTH
          </p>
        </header>

        <section
          className="card login-card"
          aria-label="Connexion"
          style={{
            width: '100%',
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="login-form"
            noValidate
          >
            <div className="form-group">
              <label
                className="form-label"
                htmlFor={usernameId}
              >
                Nom d’utilisateur
              </label>

              <input
                ref={usernameInputRef}
                id={usernameId}
                className="form-input"
                name="username"
                type="text"
                placeholder="Entrez votre identifiant"
                value={username}
                onChange={
                  handleUsernameChange
                }
                required
                disabled={loading}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-invalid={
                  Boolean(error)
                }
                aria-describedby={
                  error
                    ? errorId
                    : undefined
                }
              />
            </div>

            <div className="form-group">
              <label
                className="form-label"
                htmlFor={passwordId}
              >
                Mot de passe
              </label>

              <input
                id={passwordId}
                className="form-input"
                name="password"
                type="password"
                placeholder="Entrez votre mot de passe"
                value={password}
                onChange={
                  handlePasswordChange
                }
                required
                disabled={loading}
                autoComplete="current-password"
                enterKeyHint="go"
                aria-invalid={
                  Boolean(error)
                }
                aria-describedby={
                  error
                    ? errorId
                    : undefined
                }
              />
            </div>

            <button
              type="submit"
              className="btn btn--primary login-submit"
              disabled={submitDisabled}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <span
                    className="login-spinner"
                    aria-hidden="true"
                  />

                  <span>
                    Connexion…
                  </span>
                </>
              ) : (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M6.5 3H4.75A1.75 1.75 0 0 0 3 4.75v6.5A1.75 1.75 0 0 0 4.75 13H6.5M9.5 5l3 3-3 3M6 8h6.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  <span>
                    Se connecter
                  </span>
                </>
              )}
            </button>

            {error && (
              <div
                id={errorId}
                className="alert alert--danger login-error"
                role="alert"
                aria-live="assertive"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="login-error-icon"
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />

                  <path
                    d="M8 5v4M8 11v.01"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>

                <span
                  style={{
                    minWidth: 0,
                    overflowWrap:
                      'anywhere',
                  }}
                >
                  {error}
                </span>
              </div>
            )}
          </form>
        </section>

        <p className="login-version">
          {PRODUCT_NAME} v{PRODUCT_VERSION}
          {' — '}
          Tranche Interventions & Stocks
        </p>
      </div>
    </main>
  );
}
