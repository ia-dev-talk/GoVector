import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const PRODUCT_NAME = 'GoVector';
const SIDEBAR_STORAGE_KEY =
  'bluevector:sidebar-collapsed';
const MOBILE_MEDIA_QUERY =
  '(max-width: 768px)';

const NAV_ITEMS = Object.freeze([
  {
    id: 'client',
    label: 'Mes opérations',
    icon: 'dashboard',
    roles: ['CLIENT'],
  },
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    icon: 'dashboard',
    roles: [
      'ADMIN',
      'ORIENTEUR',
    ],
  },
  {
    id: 'interventions',
    label: 'Interventions',
    icon: 'jobs',
    roles: [
      'ADMIN',
      'ORIENTEUR',
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: 'planning',
    roles: [
      'ADMIN',
      'ORIENTEUR',
    ],
  },
  {
    id: 'agents-terrain',
    label: 'Agents terrain',
    icon: 'personnel',
    roles: [
      'ADMIN',
      'ORIENTEUR',
    ],
  },
  {
    id: 'techniciens',
    label: 'Techniciens',
    icon: 'technicians',
    roles: [
      'ADMIN',
      'ORIENTEUR',
    ],
  },
  {
    id: 'stocks',
    label: 'Stock',
    icon: 'stock',
    roles: [
      'ADMIN',
      'ORIENTEUR',
    ],
  },
  {
    id: 'rapports',
    label: 'Rapports',
    icon: 'reports',
    roles: [
      'ADMIN',
      'ORIENTEUR',
    ],
  },
  {
    id: 'supervision',
    label: 'Supervision',
    icon: 'supervision',
    roles: ['ADMIN'],
  },
  {
    id: 'carte',
    label: 'Carte live',
    icon: 'map',
    roles: ['ADMIN'],
  },
  {
    id: 'personnel',
    label: 'Personnel',
    icon: 'personnel',
    roles: ['ADMIN'],
  },
  {
    id: 'secteurs',
    label: 'Secteurs',
    icon: 'sectors',
    roles: ['ADMIN'],
  },
  {
    id: 'parametres',
    label: 'Paramètres',
    icon: 'settings',
    roles: [
      'ADMIN',
    ],
  },
]);

const ROLE_CONFIG = Object.freeze({
  CLIENT: {
    label: 'Entreprise cliente',
    shortLabel: 'C',
    color: 'var(--color-info)',
  },
  ADMIN: {
    label: 'Administrateur',
    shortLabel: 'A',
    color: 'var(--color-warning)',
  },
  CHEF_ORIENTEUR: {
    label: 'Agent terrain',
    shortLabel: 'AT',
    color: 'var(--color-accent)',
  },
  ORIENTEUR: {
    label: 'Orienteur Bureau',
    shortLabel: 'OB',
    color: 'var(--color-success)',
  },
  TECHNICIAN: {
    label: 'Technicien',
    shortLabel: 'T',
    color: 'var(--color-info)',
  },
});

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

function readSidebarExpanded() {
  try {
    return (
      window.localStorage.getItem(
        SIDEBAR_STORAGE_KEY,
      ) !== 'true'
    );
  } catch {
    return true;
  }
}

function storeSidebarExpanded(expanded) {
  try {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      expanded
        ? 'false'
        : 'true',
    );
  } catch {
    // Le stockage peut être indisponible.
  }
}

function getInitialMobileState() {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !==
      'function'
  ) {
    return false;
  }

  return window.matchMedia(
    MOBILE_MEDIA_QUERY,
  ).matches;
}

function ProductLogo({
  size = 24,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'block',
        flexShrink: 0,
      }}
    >
      <rect
        width="28"
        height="28"
        rx="6"
        fill="var(--color-accent)"
      />

      <path
        d="M7.5 8.5h5.25c2.35 0 3.75 1.12 3.75 3 0 1.18-.58 2.08-1.55 2.55 1.48.4 2.3 1.45 2.3 2.92 0 2.18-1.7 3.53-4.45 3.53H7.5v-12Zm3 2.35v2.28h2c.78 0 1.25-.4 1.25-1.13 0-.75-.47-1.15-1.25-1.15h-2Zm0 4.55v2.65h2.18c1.05 0 1.62-.45 1.62-1.32 0-.88-.57-1.33-1.62-1.33H10.5Z"
        fill="#fff"
      />
    </svg>
  );
}

function NavIcon({
  name,
}) {
  const commonProps = {
    width: 18,
    height: 18,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    style: {
      display: 'block',
    },
  };

  switch (name) {
    case 'dashboard':
      return (
        <svg {...commonProps}>
          <rect
            x="2.5"
            y="2.5"
            width="6"
            height="6"
            rx="1"
          />
          <rect
            x="11.5"
            y="2.5"
            width="6"
            height="3.8"
            rx="1"
          />
          <rect
            x="11.5"
            y="9.2"
            width="6"
            height="8.3"
            rx="1"
          />
          <rect
            x="2.5"
            y="11.5"
            width="6"
            height="6"
            rx="1"
          />
        </svg>
      );

    case 'supervision':
      return (
        <svg {...commonProps}>
          <rect
            x="2"
            y="3"
            width="16"
            height="11"
            rx="1.5"
          />
          <path d="M7 17h6M10 14v3" />
          <path d="M5 10l2.5-2.5 2 1.8 3.5-3.8 2 2" />
        </svg>
      );

    case 'map':
      return (
        <svg {...commonProps}>
          <path d="M2.5 4.5 7.5 2l5 2.5 5-2.5v13.5l-5 2.5-5-2.5-5 2.5V4.5Z" />
          <path d="M7.5 2v13.5M12.5 4.5V18" />
        </svg>
      );

    case 'jobs':
      return (
        <svg {...commonProps}>
          <rect
            x="4"
            y="3"
            width="12"
            height="14"
            rx="1.5"
          />
          <path d="M7 7h6M7 10h6M7 13h4" />
          <path d="M7 1.8h6v2.4H7z" />
        </svg>
      );

    case 'planning':
      return (
        <svg {...commonProps}>
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M6 2v4M14 2v4M3 8h14M6 11h3M11 11h3M6 14h3" />
        </svg>
      );

    case 'technicians':
      return (
        <svg {...commonProps}>
          <circle cx="7" cy="6" r="2.5" />
          <circle cx="14" cy="7" r="2" />
          <path d="M2.5 17c.4-3.5 2-5.5 4.5-5.5s4.1 2 4.5 5.5M11 13c2.7-.5 4.8 1 5.5 4" />
        </svg>
      );

    case 'personnel':
      return (
        <svg {...commonProps}>
          <circle
            cx="10"
            cy="6"
            r="3"
          />
          <path d="M4 17c0-3.4 2.7-6 6-6s6 2.6 6 6" />
        </svg>
      );

    case 'sectors':
      return (
        <svg {...commonProps}>
          <path d="M2.5 9.5 10 3l7.5 6.5" />
          <path d="M4 8.5V17h12V8.5M8 17v-5h4v5" />
        </svg>
      );

    case 'stock':
      return (
        <svg {...commonProps}>
          <path d="m3 6 7-3 7 3-7 3-7-3Z" />
          <path d="m3 6v8l7 3 7-3V6M10 9v8" />
        </svg>
      );

    case 'reports':
      return (
        <svg {...commonProps}>
          <path d="M3 17V9M8 17V5M13 17v-8M18 17V2" />
          <path d="M2 17.5h17" />
        </svg>
      );

    case 'settings':
      return (
        <svg {...commonProps}>
          <circle
            cx="10"
            cy="10"
            r="3"
          />
          <path d="M10 2.3v2M10 15.7v2M17.7 10h-2M4.3 10h-2M15.4 4.6 14 6M6 14l-1.4 1.4M15.4 15.4 14 14M6 6 4.6 4.6" />
        </svg>
      );

    case 'logout':
      return (
        <svg {...commonProps}>
          <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8" />
          <path d="m13 6 4 4-4 4M7 10h10" />
        </svg>
      );

    case 'menu':
      return (
        <svg {...commonProps}>
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      );

    case 'close':
      return (
        <svg {...commonProps}>
          <path d="m5 5 10 10M15 5 5 15" />
        </svg>
      );

    case 'collapse':
      return (
        <svg {...commonProps}>
          <path d="m12.5 5-5 5 5 5" />
        </svg>
      );

    case 'expand':
      return (
        <svg {...commonProps}>
          <path d="m7.5 5 5 5-5 5" />
        </svg>
      );

    default:
      return null;
  }
}

export default function AppLayout({
  userRole,
  currentPage,
  onNavigate,
  onLogout,
  children,
}) {
  const [sidebarExpanded, setSidebarExpanded] =
    useState(readSidebarExpanded);

  const [isMobile, setIsMobile] =
    useState(getInitialMobileState);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const mobileMenuButtonRef =
    useRef(null);

  const mobileCloseButtonRef =
    useRef(null);

  const previousCurrentPageRef =
    useRef(normalizePage(currentPage));

  const normalizedRole =
    normalizeRole(userRole);

  const normalizedCurrentPage =
    normalizePage(currentPage);

  const role = ROLE_CONFIG[
    normalizedRole
  ] || {
    label:
      normalizedRole ||
      'Rôle inconnu',
    shortLabel: '?',
    color: 'var(--text-muted)',
  };

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) =>
        item.roles.includes(
          normalizedRole,
        ),
      ),
    [normalizedRole],
  );

  const activeItem = useMemo(
    () =>
      visibleNavItems.find(
        (item) =>
          item.id ===
          normalizedCurrentPage,
      ) || null,
    [
      normalizedCurrentPage,
      visibleNavItems,
    ],
  );

  const closeMobileMenu =
    useCallback(
      ({
        restoreFocus = true,
      } = {}) => {
        setMobileMenuOpen(false);

        if (restoreFocus) {
          window.requestAnimationFrame(
            () => {
              mobileMenuButtonRef.current?.focus();
            },
          );
        }
      },
      [],
    );

  const handleNavigate =
    useCallback(
      (pageId) => {
        if (
          typeof onNavigate !==
          'function'
        ) {
          return;
        }

        const navigated =
          onNavigate(pageId);

        if (
          isMobile &&
          navigated !== false
        ) {
          closeMobileMenu({
            restoreFocus: false,
          });
        }
      },
      [
        closeMobileMenu,
        isMobile,
        onNavigate,
      ],
    );

  const toggleDesktopSidebar =
    useCallback(() => {
      setSidebarExpanded(
        (previousValue) => {
          const nextValue =
            !previousValue;

          storeSidebarExpanded(
            nextValue,
          );

          return nextValue;
        },
      );
    }, []);

  useEffect(() => {
    if (
      typeof window.matchMedia !==
      'function'
    ) {
      return undefined;
    }

    const mediaQuery =
      window.matchMedia(
        MOBILE_MEDIA_QUERY,
      );

    const handleMediaChange =
      (event) => {
        setIsMobile(event.matches);
        setMobileMenuOpen(false);
      };

    const initialFrameId = window.requestAnimationFrame(() => {
      setIsMobile(mediaQuery.matches);
    });

    if (
      typeof mediaQuery.addEventListener ===
      'function'
    ) {
      mediaQuery.addEventListener(
        'change',
        handleMediaChange,
      );

      return () => {
        window.cancelAnimationFrame(initialFrameId);
        mediaQuery.removeEventListener(
          'change',
          handleMediaChange,
        );
      };
    }

    mediaQuery.addListener(
      handleMediaChange,
    );

    return () => {
      window.cancelAnimationFrame(initialFrameId);
      mediaQuery.removeListener(
        handleMediaChange,
      );
    };
  }, []);

  useEffect(() => {
    if (
      !isMobile ||
      !mobileMenuOpen
    ) {
      return undefined;
    }

    const handleKeyDown =
      (event) => {
        if (event.key !== 'Escape') {
          return;
        }

        event.preventDefault();
        closeMobileMenu();
      };

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    const animationFrameId =
      window.requestAnimationFrame(
        () => {
          mobileCloseButtonRef.current?.focus();
        },
      );

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );

      window.cancelAnimationFrame(
        animationFrameId,
      );
    };
  }, [
    closeMobileMenu,
    isMobile,
    mobileMenuOpen,
  ]);

  useEffect(() => {
    const pageChanged =
      previousCurrentPageRef.current !==
      normalizedCurrentPage;

    previousCurrentPageRef.current =
      normalizedCurrentPage;

    if (
      !isMobile ||
      !mobileMenuOpen ||
      !pageChanged
    ) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      closeMobileMenu({ restoreFocus: false });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    closeMobileMenu,
    isMobile,
    mobileMenuOpen,
    normalizedCurrentPage,
  ]);

  const sidebarVisible =
    !isMobile || mobileMenuOpen;

  const sidebarIsExpanded =
    isMobile || sidebarExpanded;

  const sidebarWidth = isMobile
    ? 'min(86vw, 300px)'
    : (
        sidebarExpanded
          ? 220
          : 52
      );

  return (
    <div
      className={[
        'app-layout',
        sidebarIsExpanded
          ? 'sidebar-open'
          : 'sidebar-closed',
      ].join(' ')}
      style={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
      }}
    >
      {isMobile &&
        mobileMenuOpen && (
          <button
            type="button"
            aria-label="Fermer le menu de navigation"
            onClick={() =>
              closeMobileMenu()
            }
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
              border: 0,
              background:
                'var(--surface-overlay)',
              cursor: 'default',
            }}
          />
        )}

      {sidebarVisible && (
        <aside
          id="bluevector-sidebar"
          className="app-sidebar"
          aria-label="Navigation principale"
          style={{
            width: sidebarWidth,
            maxWidth: isMobile
              ? '300px'
              : undefined,
            position: isMobile
              ? 'fixed'
              : 'relative',
            inset: isMobile
              ? '0 auto 0 0'
              : undefined,
            zIndex: isMobile
              ? 1000
              : 100,
            boxShadow: isMobile
              ? 'var(--shadow-xl)'
              : undefined,
          }}
        >
          <div
            className="sidebar-header"
            style={{
              gap: 'var(--space-sm)',
              justifyContent:
                sidebarIsExpanded
                  ? 'space-between'
                  : 'center',
            }}
          >
            {sidebarIsExpanded ? (
              <div
                className="sidebar-brand"
                aria-label={PRODUCT_NAME}
              >
                <ProductLogo />

                <strong>
                  {PRODUCT_NAME}
                </strong>
              </div>
            ) : (
              <button
                type="button"
                className="sidebar-toggle"
                onClick={
                  toggleDesktopSidebar
                }
                aria-label="Déployer la navigation"
                title="Déployer la navigation"
                style={{
                  width: 36,
                  height: 36,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                }}
              >
                <ProductLogo />
              </button>
            )}

            {sidebarIsExpanded && (
              <button
                ref={
                  isMobile
                    ? mobileCloseButtonRef
                    : undefined
                }
                type="button"
                className="sidebar-toggle"
                onClick={
                  isMobile
                    ? () =>
                        closeMobileMenu()
                    : toggleDesktopSidebar
                }
                aria-label={
                  isMobile
                    ? 'Fermer la navigation'
                    : 'Réduire la navigation'
                }
                title={
                  isMobile
                    ? 'Fermer'
                    : 'Réduire la navigation'
                }
                style={{
                  width: isMobile
                    ? 40
                    : 32,
                  height: isMobile
                    ? 40
                    : 32,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                }}
              >
                <NavIcon
                  name={
                    isMobile
                      ? 'close'
                      : 'collapse'
                  }
                />
              </button>
            )}
          </div>

          <div
            className="sidebar-role-badge"
            style={{
              '--role-color':
                role.color,
              justifyContent:
                sidebarIsExpanded
                  ? 'flex-start'
                  : 'center',
            }}
            title={role.label}
          >
            <span
              className="sidebar-role-icon"
              aria-hidden="true"
              style={{
                width: 24,
                height: 24,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                borderRadius:
                  'var(--radius-sm, 3px)',
                border:
                  '1px solid var(--role-color)',
                background:
                  'color-mix(in srgb, var(--role-color) 14%, transparent)',
                color:
                  'var(--role-color)',
                fontFamily:
                  'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {role.shortLabel}
            </span>

            {sidebarIsExpanded && (
              <span className="sidebar-role-label">
                {role.label}
              </span>
            )}
          </div>

          <nav
            className="sidebar-nav"
            aria-label="Espaces GoVector"
          >
            {visibleNavItems.map(
              (item) => {
                const active =
                  normalizedCurrentPage ===
                  item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-page-id={item.id}
                    className={[
                      'sidebar-nav-item',
                      active
                        ? 'sidebar-nav-item--active'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() =>
                      handleNavigate(
                        item.id,
                      )
                    }
                    disabled={
                      typeof onNavigate !==
                      'function'
                    }
                    aria-current={
                      active
                        ? 'page'
                        : undefined
                    }
                    title={
                      sidebarIsExpanded
                        ? undefined
                        : item.label
                    }
                    style={{
                      justifyContent:
                        sidebarIsExpanded
                          ? 'flex-start'
                          : 'center',
                      minHeight: isMobile
                        ? 48
                        : 36,
                      padding:
                        sidebarIsExpanded
                          ? undefined
                          : 'var(--space-md)',
                    }}
                  >
                    <span
                      className="sidebar-nav-icon"
                      aria-hidden="true"
                      style={{
                        display: 'grid',
                        placeItems:
                          'center',
                      }}
                    >
                      <NavIcon
                        name={item.icon}
                      />
                    </span>

                    {sidebarIsExpanded && (
                      <span className="sidebar-nav-label">
                        {item.label}
                      </span>
                    )}
                  </button>
                );
              },
            )}
          </nav>

          <div className="sidebar-footer">
            <button
              type="button"
              className="sidebar-nav-item sidebar-nav-item--logout"
              onClick={onLogout}
              disabled={
                typeof onLogout !==
                'function'
              }
              title={
                sidebarIsExpanded
                  ? undefined
                  : 'Déconnexion'
              }
              style={{
                justifyContent:
                  sidebarIsExpanded
                    ? 'flex-start'
                    : 'center',
                minHeight: isMobile
                  ? 48
                  : 36,
                padding:
                  sidebarIsExpanded
                    ? undefined
                    : 'var(--space-md)',
              }}
            >
              <span
                className="sidebar-nav-icon"
                aria-hidden="true"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <NavIcon name="logout" />
              </span>

              {sidebarIsExpanded && (
                <span className="sidebar-nav-label">
                  Déconnexion
                </span>
              )}
            </button>
          </div>
        </aside>
      )}

      <main
        id="bluevector-main-content"
        className="app-main"
      >
        {isMobile && (
          <header
            style={{
              minHeight: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-md)',
              padding:
                '0 var(--space-md)',
              flexShrink: 0,
              borderBottom:
                '1px solid var(--border-color)',
              background:
                'var(--surface-header)',
              color:
                'var(--text-primary)',
              zIndex: 10,
            }}
          >
            <button
              ref={mobileMenuButtonRef}
              type="button"
              className="sidebar-toggle"
              aria-label="Ouvrir la navigation"
              aria-controls="bluevector-sidebar"
              aria-expanded={
                mobileMenuOpen
              }
              onClick={() =>
                setMobileMenuOpen(true)
              }
              style={{
                width: 40,
                height: 40,
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <NavIcon name="menu" />
            </button>

            <ProductLogo size={24} />

            <div
              style={{
                minWidth: 0,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                lineHeight: 1.15,
              }}
            >
              <strong
                style={{
                  fontSize:
                    'var(--font-size-sm)',
                  overflow: 'hidden',
                  textOverflow:
                    'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeItem?.label ||
                  PRODUCT_NAME}
              </strong>

              <span
                style={{
                  color:
                    'var(--text-muted)',
                  fontSize: 9,
                  overflow: 'hidden',
                  textOverflow:
                    'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {PRODUCT_NAME}
              </span>
            </div>

            <span
              aria-label={`Rôle : ${role.label}`}
              title={role.label}
              style={{
                width: 28,
                height: 28,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                borderRadius:
                  'var(--radius-sm, 3px)',
                border:
                  `1px solid ${role.color}`,
                color: role.color,
                background:
                  'var(--surface-panel)',
                fontFamily:
                  'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              {role.shortLabel}
            </span>
          </header>
        )}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
