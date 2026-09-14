import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Toast from '../components/Toast';
import FeedbackCenter from '../components/FeedbackCenter';
import OperationalSettingsSection from '../components/settings/OperationalSettingsSection';
import CompletionPolicySettingsSection from '../components/settings/CompletionPolicySettingsSection';
import AdminOrganizationSection from '../components/settings/AdminOrganizationSection';
import BusinessCatalogSection from '../components/settings/BusinessCatalogSection';
import FieldFormsSettingsSection from '../components/settings/FieldFormsSettingsSection';
import OperationalAuditSection from '../components/settings/OperationalAuditSection';
import { useRuntimeSettings } from '../contexts/RuntimeSettingsContext';
import SettingsAbout from '../features/settings-v3/SettingsAbout';
import SettingsHeader from '../features/settings-v3/SettingsHeader';
import SettingsIntegrations from '../features/settings-v3/SettingsIntegrations';
import SettingsModules from '../features/settings-v3/SettingsModules';
import SettingsNavigation from '../features/settings-v3/SettingsNavigation';
import SettingsOverview from '../features/settings-v3/SettingsOverview';
import SettingsRoadmap from '../features/settings-v3/SettingsRoadmap';
import {
  hasOrganizationDraft,
  shouldGuardSettingsLeave,
} from '../features/settings-v3/settingsLeaveGuard';
import {
  INTEGRATION_CAPABILITIES,
  MODULE_SHORTCUTS,
  ROADMAP_CAPABILITIES,
  SETTINGS_NAV_GROUPS,
  flattenNavigation,
} from '../features/settings-v3/settingsCatalog';

import '../styles/settings-v3.css';
import '../styles/settings-v08.css';

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return error?.message || 'Impossible d’actualiser les paramètres runtime.';
}

export default function ParametresPage({ userRole, onNavigate }) {
  const {
    settings,
    loading: runtimeLoading,
    error: runtimeError,
    reload: reloadRuntimeSettings,
  } = useRuntimeSettings();
  const [activeSection, setActiveSection] = useState('overview');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [toasts, setToasts] = useState([]);
  const nextToastIdRef = useRef(0);
  const toastTimeoutsRef = useRef(new Set());
  const organizationRootRef = useRef(null);

  useEffect(() => {
    const timeouts = toastTimeoutsRef.current;
    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeouts.clear();
    };
  }, []);

  const toast = useCallback((message, type = 'info') => {
    const id = nextToastIdRef.current + 1;
    nextToastIdRef.current = id;
    setToasts((current) => [...current, { id, message, type }]);
    const timeoutId = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
      toastTimeoutsRef.current.delete(timeoutId);
    }, 3200);
    toastTimeoutsRef.current.add(timeoutId);
  }, []);

  const environment = import.meta.env.MODE === 'production' ? 'Production' : 'Développement';
  const navigationItems = useMemo(() => flattenNavigation(), []);

  const hasUnsavedSettings = useCallback(() => (
    settingsDirty || (
      activeSection === 'organization-admin' &&
      hasOrganizationDraft(organizationRootRef.current)
    )
  ), [activeSection, settingsDirty]);

  const confirmSettingsDiscard = useCallback(() => {
    if (!hasUnsavedSettings()) return true;
    const confirmed = window.confirm(
      'Cette section contient des modifications non enregistrées. Les abandonner ?',
    );
    if (!confirmed) {
      toast('Navigation annulée : enregistrez ou annulez les modifications de la section.', 'warning');
    }
    return confirmed;
  }, [hasUnsavedSettings, toast]);

  useEffect(() => {
    const handleGlobalLeaveClick = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('button')
        : null;
      if (!button) return;
      if (!shouldGuardSettingsLeave({
        dirty: hasUnsavedSettings(),
        className: button.className,
        ariaCurrent: button.getAttribute('aria-current'),
      })) return;
      if (confirmSettingsDiscard()) {
        setSettingsDirty(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    const handleBeforeUnload = (event) => {
      if (!hasUnsavedSettings()) return;
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('click', handleGlobalLeaveClick, true);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('click', handleGlobalLeaveClick, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [confirmSettingsDiscard, hasUnsavedSettings]);

  const selectSection = useCallback((sectionId) => {
    if (sectionId === activeSection) return true;
    if (!confirmSettingsDiscard()) return false;
    setSettingsDirty(false);
    setActiveSection(sectionId);
    return true;
  }, [activeSection, confirmSettingsDiscard]);

  const handleRefresh = useCallback(async () => {
    if (!confirmSettingsDiscard()) return;
    setSettingsDirty(false);
    setRefreshing(true);
    try {
      await reloadRuntimeSettings();
      setRefreshRevision((current) => current + 1);
      toast('Configuration runtime actualisée.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setRefreshing(false);
    }
  }, [reloadRuntimeSettings, confirmSettingsDiscard, toast]);

  const handleSearch = useCallback(() => {
    const normalized = query.trim().toLocaleLowerCase('fr');
    if (!normalized) return;
    const match = navigationItems.find((item) => {
      const searchText = [item.label, item.description, ...(item.keywords || [])]
        .join(' ')
        .toLocaleLowerCase('fr');
      return searchText.includes(normalized);
    });
    if (match) {
      if (!selectSection(match.id)) return;
      toast(`Section ouverte : ${match.label}.`, 'info');
      return;
    }
    toast('Aucun paramètre correspondant.', 'warning');
  }, [navigationItems, query, selectSection, toast]);

  const navigateToModule = useCallback((page) => {
    if (!confirmSettingsDiscard()) return;
    setSettingsDirty(false);
    const navigated = typeof onNavigate === 'function' ? onNavigate(page) : false;
    if (!navigated) toast('Navigation indisponible pour ce module.', 'error');
  }, [confirmSettingsDiscard, onNavigate, toast]);

  const sectionContent = useMemo(() => {
    switch (activeSection) {
      case 'organization-admin':
        return (
          <div ref={organizationRootRef}>
            <AdminOrganizationSection toast={toast} userRole={userRole} refreshRevision={refreshRevision} surface="settings" />
          </div>
        );
      case 'business-catalog':
        return <BusinessCatalogSection toast={toast} userRole={userRole} refreshRevision={refreshRevision} onDirtyChange={setSettingsDirty} />;
      case 'operational':
        return (
          <div className="sv3-operational-frame">
            <OperationalSettingsSection toast={toast} refreshRevision={refreshRevision} onDirtyChange={setSettingsDirty} />
          </div>
        );
      case 'operational-audit':
        return <OperationalAuditSection userRole={userRole} refreshRevision={refreshRevision} />;
      case 'completion-policy':
        return <CompletionPolicySettingsSection toast={toast} userRole={userRole} refreshRevision={refreshRevision} onDirtyChange={setSettingsDirty} />;
      case 'field-forms':
        return <FieldFormsSettingsSection toast={toast} userRole={userRole} refreshRevision={refreshRevision} onDirtyChange={setSettingsDirty} />;
      case 'feedback':
        return <FeedbackCenter userRole={userRole} />;
      case 'modules':
        return <SettingsModules modules={MODULE_SHORTCUTS} onNavigate={navigateToModule} />;
      case 'integrations':
        return <SettingsIntegrations capabilities={INTEGRATION_CAPABILITIES} />;
      case 'roadmap':
        return <SettingsRoadmap capabilities={ROADMAP_CAPABILITIES} />;
      case 'about':
        return <SettingsAbout version={__APP_VERSION__} environment={environment} />;
      case 'overview':
      default:
        return (
          <SettingsOverview
            settings={settings}
            loading={runtimeLoading}
            error={runtimeError}
            userRole={userRole}
            onOpenOperational={() => selectSection('operational')}
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
    selectSection,
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
        <SettingsNavigation groups={SETTINGS_NAV_GROUPS} activeSection={activeSection} onSelect={selectSection} />
        <main className="sv3-content">{sectionContent}</main>
      </div>
      <div className="toast-container">
        {toasts.map((item) => <Toast key={item.id} message={item.message} type={item.type} />)}
      </div>
    </div>
  );
}
