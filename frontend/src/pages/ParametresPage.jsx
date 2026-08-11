import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Toast from '../components/Toast';
import OperationalSettingsSection from '../components/settings/OperationalSettingsSection';
import AdminOrganizationSection from '../components/settings/AdminOrganizationSection';
import BusinessCatalogSection from '../components/settings/BusinessCatalogSection';
import { useRuntimeSettings } from '../contexts/RuntimeSettingsContext';
import SettingsAbout from '../features/settings-v3/SettingsAbout';
import SettingsHeader from '../features/settings-v3/SettingsHeader';
import SettingsIntegrations from '../features/settings-v3/SettingsIntegrations';
import SettingsModules from '../features/settings-v3/SettingsModules';
import SettingsNavigation from '../features/settings-v3/SettingsNavigation';
import SettingsOverview from '../features/settings-v3/SettingsOverview';
import SettingsRoadmap from '../features/settings-v3/SettingsRoadmap';
import {
  INTEGRATION_CAPABILITIES,
  MODULE_SHORTCUTS,
  ROADMAP_CAPABILITIES,
  SETTINGS_NAV_GROUPS,
  flattenNavigation,
} from '../features/settings-v3/settingsCatalog';

import '../styles/settings-v3.css';


function errorMessage(error) {
  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  return (
    error?.message ||
    'Impossible d’actualiser les paramètres runtime.'
  );
}


export default function ParametresPage({
  userRole,
  onNavigate,
}) {
  const {
    settings,
    loading: runtimeLoading,
    error: runtimeError,
    reload: reloadRuntimeSettings,
  } = useRuntimeSettings();

  const [activeSection, setActiveSection] =
    useState('overview');

  const [query, setQuery] =
    useState('');

  const [refreshing, setRefreshing] =
    useState(false);

  const [refreshRevision, setRefreshRevision] =
    useState(0);

  const [toasts, setToasts] =
    useState([]);

  const nextToastIdRef =
    useRef(0);

  const toastTimeoutsRef =
    useRef(new Set());

  useEffect(() => {
    const timeouts =
      toastTimeoutsRef.current;

    return () => {
      timeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });

      timeouts.clear();
    };
  }, []);

  const toast = useCallback(
    (message, type = 'info') => {
      const id =
        nextToastIdRef.current + 1;

      nextToastIdRef.current = id;

      setToasts((current) => [
        ...current,
        {
          id,
          message,
          type,
        },
      ]);

      const timeoutId =
        window.setTimeout(() => {
          setToasts((current) =>
            current.filter(
              (item) => item.id !== id,
            ),
          );

          toastTimeoutsRef.current.delete(
            timeoutId,
          );
        }, 3200);

      toastTimeoutsRef.current.add(
        timeoutId,
      );
    },
    [],
  );

  const environment =
    import.meta.env.MODE === 'production'
      ? 'Production'
      : 'Développement';

  const navigationItems =
    useMemo(
      () => flattenNavigation(),
      [],
    );

  const handleRefresh =
    useCallback(async () => {
      setRefreshing(true);

      try {
        await reloadRuntimeSettings();

        setRefreshRevision(
          (current) => current + 1,
        );

        toast(
          'Configuration runtime actualisée.',
          'success',
        );
      } catch (error) {
        toast(
          errorMessage(error),
          'error',
        );
      } finally {
        setRefreshing(false);
      }
    }, [
      reloadRuntimeSettings,
      toast,
    ]);

  const handleSearch =
    useCallback(() => {
      const normalized =
        query.trim().toLocaleLowerCase('fr');

      if (!normalized) {
        return;
      }

      const match =
        navigationItems.find((item) => {
          const searchText = [
            item.label,
            item.description,
            ...(item.keywords || []),
          ]
            .join(' ')
            .toLocaleLowerCase('fr');

          return searchText.includes(
            normalized,
          );
        });

      if (match) {
        setActiveSection(match.id);

        toast(
          `Section ouverte : ${match.label}.`,
          'info',
        );

        return;
      }

      toast(
        'Aucun paramètre correspondant.',
        'warning',
      );
    }, [
      navigationItems,
      query,
      toast,
    ]);

  const navigateToModule =
    useCallback(
      (page) => {
        const navigated =
          typeof onNavigate === 'function'
            ? onNavigate(page)
            : false;

        if (!navigated) {
          toast(
            'Navigation indisponible pour ce module.',
            'error',
          );
        }
      },
      [
        onNavigate,
        toast,
      ],
    );

  const sectionContent =
    useMemo(() => {
      switch (activeSection) {
        case 'organization-admin':
          return <AdminOrganizationSection toast={toast} userRole={userRole} />;

        case 'business-catalog':
          return <BusinessCatalogSection toast={toast} userRole={userRole} refreshRevision={refreshRevision} />;

        case 'operational':
          return (
            <div className="sv3-operational-frame">
              <OperationalSettingsSection
                toast={toast}
                refreshRevision={refreshRevision}
              />
            </div>
          );

        case 'modules':
          return (
            <SettingsModules
              modules={MODULE_SHORTCUTS}
              onNavigate={navigateToModule}
            />
          );

        case 'integrations':
          return (
            <SettingsIntegrations
              capabilities={
                INTEGRATION_CAPABILITIES
              }
            />
          );

        case 'roadmap':
          return (
            <SettingsRoadmap
              capabilities={
                ROADMAP_CAPABILITIES
              }
            />
          );

        case 'about':
          return (
            <SettingsAbout
              version={__APP_VERSION__}
              environment={environment}
            />
          );

        case 'overview':
        default:
          return (
            <SettingsOverview
              settings={settings}
              loading={runtimeLoading}
              error={runtimeError}
              userRole={userRole}
              onOpenOperational={() =>
                setActiveSection(
                  'operational',
                )
              }
            />
          );
      }
    }, [
      activeSection,
      environment,
      navigateToModule,
      refreshRevision,
      runtimeError,
      runtimeLoading,
      settings,
      toast,
      userRole,
    ]);

  return (
    <div className="sv3-page">
      <SettingsHeader
        version={__APP_VERSION__}
        environment={environment}
        userRole={userRole}
        runtimeLoading={runtimeLoading}
        runtimeError={runtimeError}
        refreshing={refreshing}
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        onRefresh={handleRefresh}
      />

      <div className="sv3-layout">
        <SettingsNavigation
          groups={SETTINGS_NAV_GROUPS}
          activeSection={activeSection}
          onSelect={setActiveSection}
        />

        <main className="sv3-content">
          {sectionContent}
        </main>
      </div>

      <div className="toast-container">
        {toasts.map((item) => (
          <Toast
            key={item.id}
            message={item.message}
            type={item.type}
          />
        ))}
      </div>
    </div>
  );
}
