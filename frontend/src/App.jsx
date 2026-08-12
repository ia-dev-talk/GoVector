import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from './api/client';
import Login from './components/login';
import AppLayout from './components/layout/AppLayout';
import { RuntimeSettingsProvider } from './contexts/RuntimeSettingsContext';

import './styles/index.css';
import './styles/public-v2.css';

const SESSION_EXPIRED_EVENT =
  'bluevector:session-expired';

const DEFAULT_PAGE = 'dashboard';

const PAGE_ROLES = Object.freeze({
  client: ['CLIENT'],
  dashboard: [
    'ADMIN',
    'CHEF_ORIENTEUR',
    'ORIENTEUR',
    'TECHNICIAN',
  ],
  supervision: [
    'ADMIN',
    'CHEF_ORIENTEUR',
    'ORIENTEUR',
  ],
  carte: [
    'ADMIN',
    'CHEF_ORIENTEUR',
    'ORIENTEUR',
    'TECHNICIAN',
  ],
  interventions: [
    'ADMIN',
    'CHEF_ORIENTEUR',
    'ORIENTEUR',
  ],
  personnel: [
    'ADMIN',
    'CHEF_ORIENTEUR',
    'ORIENTEUR',
  ],
  secteurs: [
    'ADMIN',
    'CHEF_ORIENTEUR',
  ],
  stocks: [
    'ADMIN',
    'CHEF_ORIENTEUR',
    'ORIENTEUR',
  ],
  rapports: [
    'ADMIN',
    'CHEF_ORIENTEUR',
    'ORIENTEUR',
  ],
  parametres: [
    'ADMIN',
  ],
});

const PAGE_ORDER = Object.freeze(
  Object.keys(PAGE_ROLES),
);

/* Chargement différé des pages. */
const DashboardHome = lazy(
  () => import('./pages/DashboardHome'),
);

const ExploitationPage = lazy(
  () => import('./pages/ExploitationPage'),
);

const CarteLivePage = lazy(
  () => import('./pages/CarteLivePage'),
);

const InterventionsPage = lazy(
  () => import('./pages/InterventionsPage'),
);

const PersonnelPage = lazy(
  () => import('./pages/PersonnelPage'),
);

const SecteursPage = lazy(
  () => import('./pages/SecteursPage'),
);

const StocksPage = lazy(
  () => import('./pages/StocksPage'),
);

const RapportsPage = lazy(
  () => import('./pages/RapportsPage'),
);

const ParametresPage = lazy(
  () => import('./pages/ParametresPage'),
);

const ClientPortalPage = lazy(
  () => import('./pages/ClientPortalPage'),
);

const PAGE_COMPONENTS = Object.freeze({
  client: ClientPortalPage,
  dashboard: DashboardHome,
  supervision: ExploitationPage,
  carte: CarteLivePage,
  interventions: InterventionsPage,
  personnel: PersonnelPage,
  secteurs: SecteursPage,
  stocks: StocksPage,
  rapports: RapportsPage,
  parametres: ParametresPage,
});

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

function normalizeRole(value) {
  return normalizeText(value).toUpperCase();
}

function normalizePage(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeUser(value) {
  if (!isRecord(value)) {
    return null;
  }

  const role = normalizeRole(value.role);

  if (!role) {
    return null;
  }

  return {
    ...value,
    role,
  };
}

function canAccessPage(page, role) {
  const normalizedPage =
    normalizePage(page);

  const normalizedRole =
    normalizeRole(role);

  return (
    Boolean(normalizedPage) &&
    Boolean(normalizedRole) &&
    Array.isArray(
      PAGE_ROLES[normalizedPage],
    ) &&
    PAGE_ROLES[
      normalizedPage
    ].includes(normalizedRole)
  );
}

function getDefaultPage(role) {
  const normalizedRole =
    normalizeRole(role);

  return (
    PAGE_ORDER.find((page) =>
      canAccessPage(
        page,
        normalizedRole,
      ),
    ) || null
  );
}

function readStorage(key) {
  try {
    return normalizeText(
      window.localStorage.getItem(key),
    );
  } catch {
    return '';
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(
      key,
      value,
    );

    return true;
  } catch {
    return false;
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Le stockage peut être indisponible ou bloqué.
  }
}

function getSessionErrorMessage(error) {
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

  return (
    'Impossible de vérifier la session. ' +
    'Vérifiez la connexion au serveur puis réessayez.'
  );
}

function isAuthenticationError(error) {
  const status = Number(
    error?.response?.status,
  );

  return status === 401 || status === 403;
}

function PageLoader() {
  return (
    <div
      className="loading-screen"
      role="status"
      aria-live="polite"
      aria-label="Chargement de la page"
    >
      <div
        className="loading-spinner"
        aria-hidden="true"
      />
      Chargement…
    </div>
  );
}

function SessionProblem({
  message,
  onRetry,
  onLogout,
  retrying,
}) {
  return (
    <div
      className="loading-screen"
      role="alert"
      aria-live="assertive"
    >
      <div
        style={{
          width: 'min(460px, calc(100vw - 32px))',
          padding: 20,
          border:
            '1px solid var(--border-color)',
          borderRadius: 8,
          background:
            'var(--surface-panel)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            marginBottom: 10,
            fontSize: 24,
          }}
        >
          ⚠
        </div>

        <strong>
          Session non vérifiée
        </strong>

        <p
          style={{
            margin: '10px 0 16px',
            color:
              'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn btn--sm"
            onClick={onLogout}
            disabled={retrying}
          >
            Se déconnecter
          </button>

          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying
              ? 'Vérification…'
              : 'Réessayer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessDenied({
  role,
  onLogout,
}) {
  return (
    <div
      className="loading-screen"
      role="alert"
    >
      <div
        style={{
          width: 'min(480px, calc(100vw - 32px))',
          padding: 20,
          border:
            '1px solid var(--border-color)',
          borderRadius: 8,
          background:
            'var(--surface-panel)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            marginBottom: 10,
            fontSize: 24,
          }}
        >
          🔒
        </div>

        <strong>
          Aucun espace autorisé
        </strong>

        <p
          style={{
            margin: '10px 0 16px',
            color:
              'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          Le rôle{' '}
          <span
            style={{
              fontFamily:
                'var(--font-mono)',
            }}
          >
            {role || 'inconnu'}
          </span>{' '}
          ne possède actuellement aucune page
          autorisée dans cette interface.
        </p>

        <button
          type="button"
          className="btn btn--sm"
          onClick={onLogout}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
    };
  }

  componentDidCatch(error, info) {
    console.error(
      'Erreur de rendu de la page :',
      error,
      info,
    );
  }

  componentDidUpdate(previousProps) {
    if (
      previousProps.resetKey !==
        this.props.resetKey &&
      this.state.error
    ) {
      this.setState({
        error: null,
      });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        className="loading-screen"
        role="alert"
      >
        <div
          style={{
            width:
              'min(480px, calc(100vw - 32px))',
            padding: 20,
            border:
              '1px solid var(--color-danger)',
            borderRadius: 8,
            background:
              'var(--surface-panel)',
            textAlign: 'center',
          }}
        >
          <strong>
            Impossible d’afficher cette page
          </strong>

          <p
            style={{
              margin: '10px 0 16px',
              color:
                'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            Un composant de la page n’a pas pu
            être chargé correctement.
          </p>

          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() =>
              window.location.reload()
            }
          >
            Recharger l’application
          </button>
        </div>
      </div>
    );
  }
}

function App() {
  const initialTokenRef = useRef(
    readStorage('token'),
  );

  const [user, setUser] =
    useState(null);

  const [currentPage, setCurrentPage] =
    useState(DEFAULT_PAGE);

  const [
    navigationPayload,
    setNavigationPayload,
  ] = useState(null);

  const [
    sessionLoading,
    setSessionLoading,
  ] = useState(
    Boolean(initialTokenRef.current),
  );

  const [
    sessionError,
    setSessionError,
  ] = useState(null);

  const sessionRequestRef =
    useRef(0);

  const validatingTokenRef =
    useRef(null);

  const currentPageRef =
    useRef(DEFAULT_PAGE);

  const userRef = useRef(null);

  useEffect(() => {
    currentPageRef.current =
      currentPage;
  }, [currentPage]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const clearSession = useCallback(
    ({
      removeStoredData = true,
    } = {}) => {
      sessionRequestRef.current += 1;
      validatingTokenRef.current = null;

      if (removeStoredData) {
        removeStorage('token');
        removeStorage('user');
      }

      userRef.current = null;
      currentPageRef.current =
        DEFAULT_PAGE;

      setUser(null);
      setCurrentPage(DEFAULT_PAGE);
      setNavigationPayload(null);
      setSessionError(null);
      setSessionLoading(false);
    },
    [],
  );

  const restoreSession = useCallback(
    async ({
      force = false,
      preserveUser = true,
      resetNavigation = false,
    } = {}) => {
      const token =
        readStorage('token');

      if (!token) {
        clearSession({
          removeStoredData: false,
        });

        return;
      }

      if (
        !force &&
        validatingTokenRef.current === token
      ) {
        return;
      }

      const requestId =
        sessionRequestRef.current + 1;

      sessionRequestRef.current =
        requestId;

      validatingTokenRef.current =
        token;

      if (!preserveUser) {
        userRef.current = null;
        setUser(null);
      }

      setSessionError(null);
      setSessionLoading(true);

      try {
        const response =
          await api.getMe();

        if (
          requestId !==
            sessionRequestRef.current ||
          readStorage('token') !== token
        ) {
          return;
        }

        const authenticatedUser =
          normalizeUser(
            response?.data,
          );

        if (!authenticatedUser) {
          throw new Error(
            'Utilisateur authentifié invalide',
          );
        }

        writeStorage(
          'user',
          JSON.stringify(
            authenticatedUser,
          ),
        );

        userRef.current =
          authenticatedUser;

        setUser(authenticatedUser);

        const previousPage =
          currentPageRef.current;

        const nextPage =
          resetNavigation ||
          !canAccessPage(
            previousPage,
            authenticatedUser.role,
          )
            ? getDefaultPage(
                authenticatedUser.role,
              )
            : previousPage;

        if (nextPage) {
          currentPageRef.current =
            nextPage;

          setCurrentPage(nextPage);
        }

        if (
          resetNavigation ||
          nextPage !== previousPage
        ) {
          setNavigationPayload(null);
        }
      } catch (error) {
        if (
          requestId !==
            sessionRequestRef.current ||
          readStorage('token') !== token
        ) {
          return;
        }

        if (
          isAuthenticationError(error) ||
          normalizeText(error?.message) ===
            'Utilisateur authentifié invalide'
        ) {
          clearSession();
          return;
        }

        if (!userRef.current) {
          setSessionError(
            getSessionErrorMessage(error),
          );
        }
      } finally {
        if (
          validatingTokenRef.current ===
          token
        ) {
          validatingTokenRef.current =
            null;
        }

        if (
          requestId ===
            sessionRequestRef.current
        ) {
          setSessionLoading(false);
        }
      }
    },
    [clearSession],
  );

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession({
        removeStoredData: false,
      });
    };

    const handleStorage = (event) => {
      if (
        event.storageArea &&
        event.storageArea !==
          window.localStorage
      ) {
        return;
      }

      if (
        event.key !== 'token' &&
        event.key !== null
      ) {
        if (
          event.key === 'user' &&
          !readStorage('token')
        ) {
          clearSession({
            removeStoredData: false,
          });
        }

        return;
      }

      if (!readStorage('token')) {
        clearSession({
          removeStoredData: false,
        });

        return;
      }

      restoreSession({
        force: true,
        preserveUser: false,
        resetNavigation: true,
      });
    };

    window.addEventListener(
      SESSION_EXPIRED_EVENT,
      handleSessionExpired,
    );

    window.addEventListener(
      'storage',
      handleStorage,
    );

    return () => {
      window.removeEventListener(
        SESSION_EXPIRED_EVENT,
        handleSessionExpired,
      );

      window.removeEventListener(
        'storage',
        handleStorage,
      );

      sessionRequestRef.current += 1;
      validatingTokenRef.current = null;
    };
  }, [
    clearSession,
    restoreSession,
  ]);

  useEffect(() => {
    restoreSession({
      preserveUser: false,
      resetNavigation: true,
    });
  }, [restoreSession]);

  const handleLogin = useCallback(
    (authenticatedUserValue) => {
      const authenticatedUser =
        normalizeUser(
          authenticatedUserValue,
        );

      const token =
        readStorage('token');

      if (
        !authenticatedUser ||
        !token
      ) {
        clearSession();
        return;
      }

      sessionRequestRef.current += 1;
      validatingTokenRef.current = null;

      writeStorage(
        'user',
        JSON.stringify(
          authenticatedUser,
        ),
      );

      const defaultPage =
        getDefaultPage(
          authenticatedUser.role,
        );

      userRef.current =
        authenticatedUser;

      currentPageRef.current =
        defaultPage ||
        DEFAULT_PAGE;

      setUser(authenticatedUser);
      setCurrentPage(
        defaultPage ||
          DEFAULT_PAGE,
      );
      setNavigationPayload(null);
      setSessionError(null);
      setSessionLoading(false);
    },
    [clearSession],
  );

  const handleLogout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const handleNavigate = useCallback(
    (page, payload = null) => {
      const authenticatedUser =
        userRef.current;

      const normalizedPage =
        normalizePage(page);

      if (
        !authenticatedUser ||
        !canAccessPage(
          normalizedPage,
          authenticatedUser.role,
        )
      ) {
        return false;
      }

      currentPageRef.current =
        normalizedPage;

      setNavigationPayload(
        payload ?? null,
      );

      setCurrentPage(
        normalizedPage,
      );

      return true;
    },
    [],
  );

  const activePage = useMemo(() => {
    if (!user) {
      return null;
    }

    if (
      canAccessPage(
        currentPage,
        user.role,
      )
    ) {
      return currentPage;
    }

    return getDefaultPage(
      user.role,
    );
  }, [currentPage, user]);

  const ActivePageComponent =
    activePage
      ? PAGE_COMPONENTS[activePage]
      : null;

  const activeNavigationPayload =
    activePage === currentPage
      ? navigationPayload
      : null;

  const pageProps = user
    ? {
        userRole: user.role,
        onNavigate:
          handleNavigate,
        navigationPayload:
          activeNavigationPayload,
      }
    : null;

  if (
    sessionLoading &&
    !user
  ) {
    return <PageLoader />;
  }

  if (
    sessionError &&
    !user
  ) {
    return (
      <SessionProblem
        message={sessionError}
        retrying={sessionLoading}
        onRetry={() =>
          restoreSession({
            force: true,
            preserveUser: false,
            resetNavigation: true,
          })
        }
        onLogout={handleLogout}
      />
    );
  }

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
      />
    );
  }

  if (
    !activePage ||
    !ActivePageComponent
  ) {
    return (
      <AccessDenied
        role={user.role}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="app">
      <RuntimeSettingsProvider>
        <AppLayout
        userRole={user.role}
        currentPage={activePage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      >
        <PageErrorBoundary
          resetKey={activePage}
        >
          <Suspense
            fallback={<PageLoader />}
          >
            <ActivePageComponent
              {...pageProps}
            />
          </Suspense>
        </PageErrorBoundary>
        </AppLayout>
      </RuntimeSettingsProvider>
    </div>
  );
}

export default App;
