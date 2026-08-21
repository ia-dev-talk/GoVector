import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../api/client';
import {
  activeCanonicalOptions,
  canonicalLinkState,
  catalogRowKey,
  isCustomCatalogItem,
  normalizeCatalogCode,
  removeCatalogItem,
  validateBusinessCatalogDraft,
} from '../../lib/business-catalog';
import '../../styles/settings-business-catalog.css';
import '../../styles/settings-business-catalog-actions.css';

const SECTIONS = [
  {
    key: 'technician_grades',
    title: 'Grades techniciens',
    shortTitle: 'Grades',
    copy: 'Ajoutez les niveaux terrain utilisés par les équipes et les profils techniciens.',
    extensible: true,
    prefix: 'grade',
    newLabel: 'Nouveau grade',
  },
  {
    key: 'job_types',
    title: 'Types d’intervention',
    shortTitle: 'Types',
    copy: 'Ajoutez un libellé métier et rattachez-le à un comportement technique existant.',
    extensible: true,
    canonicalized: true,
    prefix: 'type',
    newLabel: 'Nouveau type',
  },
  {
    key: 'priorities',
    title: 'Priorités',
    shortTitle: 'Priorités',
    copy: 'Ajoutez des priorités métier tout en conservant une priorité système de référence.',
    extensible: true,
    canonicalized: true,
    prefix: 'priorite',
    newLabel: 'Nouvelle priorité',
  },
  {
    key: 'status_presentations',
    title: 'Statuts du workflow',
    shortTitle: 'Statuts',
    copy: 'Ajoutez des statuts d’affichage rattachés à un état système sans casser les transitions.',
    extensible: true,
    canonicalized: true,
    prefix: 'statut',
    newLabel: 'Nouveau statut',
    protectSystemActive: true,
  },
  {
    key: 'field_actions',
    title: 'Actions terrain',
    shortTitle: 'Actions terrain',
    copy: 'Ajoutez des actions métier rattachées à une action terrain supportée par le mobile.',
    extensible: true,
    canonicalized: true,
    prefix: 'action',
    newLabel: 'Nouvelle action',
  },
];

function errorMessage(error) {
  return error?.response?.data?.detail || error?.message || 'Référentiel indisponible.';
}

function copyValues(values) {
  return Object.fromEntries(
    SECTIONS.map(({ key }) => [key, (values?.[key] || []).map((item) => ({
      ...item,
      metadata: { ...(item?.metadata || {}) },
    }))]),
  );
}

function nextCode(prefix, items) {
  const used = new Set(items.map((item) => normalizeCatalogCode(item.code)));
  let number = items.length + 1;
  let candidate = `${prefix}_${number}`;
  while (used.has(candidate)) {
    number += 1;
    candidate = `${prefix}_${number}`;
  }
  return candidate;
}

function nextOrder(items) {
  return items.reduce(
    (maximum, item) => Math.max(maximum, Number(item?.sort_order) || 0),
    -10,
  ) + 10;
}

function systemItems(items) {
  return items.filter((item) => !isCustomCatalogItem(item));
}

function newCatalogItem(section, items) {
  const canonical = section.canonicalized
    ? activeCanonicalOptions(items)[0]?.code || ''
    : '';
  return {
    code: nextCode(section.prefix, items),
    label: section.newLabel,
    description: null,
    color: '#4B8DFF',
    sort_order: nextOrder(items),
    active: true,
    metadata: {
      custom: true,
      ...(section.canonicalized ? { canonical } : {}),
    },
  };
}

export default function BusinessCatalogSection({
  toast,
  userRole = 'ADMIN',
  refreshRevision = 0,
  onDirtyChange,
}) {
  const editable = userRole === 'ADMIN';
  const [document, setDocument] = useState(null);
  const [values, setValues] = useState(null);
  const [activeSectionKey, setActiveSectionKey] = useState(SECTIONS[0].key);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getBusinessCatalog();
      setDocument(response.data);
      setValues(copyValues(response.data?.values));
      setDirty(false);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshRevision]);

  useEffect(() => {
    if (!dirty) return undefined;

    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => {
    onDirtyChange?.(false);
  }, [onDirtyChange]);

  const activeCount = useMemo(() => {
    if (!values) return 0;
    return Object.values(values).flat().filter((item) => item.active).length;
  }, [values]);

  const activeSection = useMemo(
    () => SECTIONS.find((section) => section.key === activeSectionKey) || SECTIONS[0],
    [activeSectionKey],
  );

  const updateItem = (section, index, field, nextValue) => {
    setValues((current) => ({
      ...current,
      [section]: current[section].map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: nextValue } : item
      )),
    }));
    setDirty(true);
  };

  const updateCanonical = (section, index, canonical) => {
    setValues((current) => ({
      ...current,
      [section]: current[section].map((item, itemIndex) => (
        itemIndex === index
          ? {
              ...item,
              metadata: {
                ...(item.metadata || {}),
                custom: true,
                canonical,
              },
            }
          : item
      )),
    }));
    setDirty(true);
  };

  const addItem = () => {
    setValues((current) => ({
      ...current,
      [activeSection.key]: [
        ...current[activeSection.key],
        newCatalogItem(activeSection, current[activeSection.key]),
      ],
    }));
    setDirty(true);
  };

  const requestDeleteItem = (index) => {
    const item = values?.[activeSection.key]?.[index];
    if (!editable || !isCustomCatalogItem(item)) return;

    const confirmed = window.confirm(
      `Supprimer « ${item.label || item.code} » du référentiel ?\n\nLa suppression ne sera appliquée qu’après « Enregistrer le référentiel ». Le serveur la refusera si cet élément est encore utilisé.`,
    );
    if (!confirmed) return;

    setValues((current) => ({
      ...current,
      [activeSection.key]: removeCatalogItem(current[activeSection.key], index),
    }));
    setDirty(true);
    toast?.('Suppression préparée. Enregistrez pour appliquer la modification.', 'info');
  };

  const save = async () => {
    const validationMessages = validateBusinessCatalogDraft(values);
    if (validationMessages.length > 0) {
      toast?.(validationMessages[0], 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await api.updateBusinessCatalog({
        expected_revision: document.revision,
        values,
      });
      setDocument(response.data);
      setValues(copyValues(response.data.values));
      setDirty(false);
      toast?.('Référentiel métier enregistré et versionné.', 'success');
    } catch (saveError) {
      toast?.(errorMessage(saveError), 'error');
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setValues(copyValues(document.values));
    setDirty(false);
    toast?.('Modifications locales annulées.', 'info');
  };

  if (loading) return <div className="catalog-state">Chargement du référentiel métier…</div>;
  if (error) return <div className="catalog-state catalog-state--error"><strong>Connexion impossible</strong><span>{error}</span><button type="button" onClick={load}>Réessayer</button></div>;
  if (!values) return null;

  const activeItems = values[activeSection.key] || [];
  const activeItemsCount = activeItems.filter((item) => item.active).length;
  const canonicalOptions = activeCanonicalOptions(activeItems);

  return (
    <section className="business-catalog">
      <header className="business-catalog__hero">
        <div>
          <span>Gouvernance opérationnelle</span>
          <h2>Référentiels métier</h2>
          <p>Chaque catégorie s’administre séparément. Les ajouts métier restent reliés à un comportement système afin de préserver l’API, le web et le mobile.</p>
        </div>
        <div className="business-catalog__revision">
          <strong>Révision {document.revision}</strong>
          <span>{activeCount} éléments actifs</span>
        </div>
      </header>

      <div className="business-catalog__notice">
        <strong>Configuration sûre</strong>
        <span>Les lignes système restent protégées. Une ligne personnalisée peut être supprimée après confirmation ; le serveur bloque l’enregistrement si elle est encore référencée.</span>
      </div>

      <div className="business-catalog__workspace">
        <nav className="business-catalog__section-nav" aria-label="Catégories du référentiel métier">
          {SECTIONS.map((section) => {
            const sectionItems = values[section.key] || [];
            const enabled = sectionItems.filter((item) => item.active).length;
            return (
              <button
                type="button"
                key={section.key}
                className={section.key === activeSection.key ? 'is-active' : ''}
                aria-current={section.key === activeSection.key ? 'page' : undefined}
                onClick={() => setActiveSectionKey(section.key)}
              >
                <span>{section.shortTitle}</span>
                <strong>{sectionItems.length}</strong>
                <small>{enabled} actifs</small>
              </button>
            );
          })}
        </nav>

        <div className="business-catalog__panel">
          <div className="business-catalog__focus-summary">
            <div>
              <span>Section active</span>
              <strong>{activeSection.title}</strong>
              <small>{activeSection.copy}</small>
            </div>
            <div>
              <strong>{activeItems.length}</strong>
              <span>éléments</span>
            </div>
            <div>
              <strong>{activeItemsCount}</strong>
              <span>actifs</span>
            </div>
          </div>

          <div className="business-catalog__sections business-catalog__sections--focused">
            <article className="catalog-card">
              <header>
                <div><h3>{activeSection.title}</h3><p>{activeSection.copy}</p></div>
                {editable && activeSection.extensible ? (
                  <button type="button" onClick={addItem}>+ Ajouter</button>
                ) : null}
              </header>
              <div
                className={[
                  'catalog-table',
                  activeSection.canonicalized ? 'catalog-table--canonical' : '',
                ].filter(Boolean).join(' ')}
                role="table"
                aria-label={activeSection.title}
              >
                <div className="catalog-table__head" role="row">
                  <span>Identifiant</span>
                  <span>Libellé</span>
                  {activeSection.canonicalized ? <span>Comportement système</span> : null}
                  <span>Couleur</span>
                  <span>Ordre</span>
                  <span>Actif</span>
                  <span className="catalog-table__actions-title">Actions</span>
                </div>
                {activeItems.map((item, index) => {
                  const custom = isCustomCatalogItem(item);
                  const canonicalState = activeSection.canonicalized && custom
                    ? canonicalLinkState(item, activeItems)
                    : null;
                  return (
                    <div className="catalog-table__row" role="row" key={catalogRowKey(activeSection.key, index)}>
                      {editable && custom ? (
                        <input
                          aria-label={`Code ${item.label}`}
                          value={item.code}
                          onChange={(event) => updateItem(activeSection.key, index, 'code', normalizeCatalogCode(event.target.value))}
                        />
                      ) : <code>{item.code}</code>}
                      <input
                        disabled={!editable}
                        aria-label={`Libellé ${item.code}`}
                        value={item.label}
                        onChange={(event) => updateItem(activeSection.key, index, 'label', event.target.value)}
                      />
                      {activeSection.canonicalized ? (
                        custom ? (
                          <select
                            disabled={!editable}
                            aria-label={`Comportement système ${item.code}`}
                            value={item?.metadata?.canonical || ''}
                            onChange={(event) => updateCanonical(activeSection.key, index, event.target.value)}
                          >
                            {canonicalState?.status === 'archived' ? (
                              <option value={canonicalState.canonical} disabled>
                                Archivé · {canonicalState.target?.label || canonicalState.canonical}
                              </option>
                            ) : null}
                            {canonicalState?.status === 'missing' ? (
                              <option value={canonicalState.canonical || ''} disabled>
                                {canonicalState.canonical
                                  ? `Introuvable · ${canonicalState.canonical}`
                                  : 'Choisir un comportement système actif'}
                              </option>
                            ) : null}
                            {canonicalOptions.map((option) => (
                              <option key={option.code} value={option.code}>{option.label} · {option.code}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="catalog-system-badge">Système · {item.code}</span>
                        )
                      ) : null}
                      <input
                        disabled={!editable}
                        type="color"
                        aria-label={`Couleur ${item.code}`}
                        value={item.color || '#4B8DFF'}
                        onInput={(event) => updateItem(activeSection.key, index, 'color', event.currentTarget.value)}
                      />
                      <input
                        disabled={!editable}
                        type="number"
                        min="0"
                        max="10000"
                        aria-label={`Ordre ${item.code}`}
                        value={item.sort_order}
                        onChange={(event) => updateItem(activeSection.key, index, 'sort_order', Number(event.target.value))}
                      />
                      <label className="catalog-switch">
                        <input
                          disabled={!editable || (activeSection.protectSystemActive && !custom)}
                          type="checkbox"
                          checked={item.active}
                          onChange={(event) => updateItem(activeSection.key, index, 'active', event.target.checked)}
                        />
                        <span>{item.active ? 'Oui' : 'Archivé'}</span>
                      </label>
                      <div className="catalog-row-actions">
                        {editable && custom ? (
                          <button
                            type="button"
                            className="catalog-delete-button"
                            aria-label={`Supprimer ${item.label || item.code}`}
                            title="Supprimer cette ligne personnalisée"
                            onClick={() => requestDeleteItem(index)}
                          >
                            <span aria-hidden="true">⌫</span>
                          </button>
                        ) : (
                          <span className="catalog-protected" title="Élément système protégé" aria-label="Élément système protégé">Protégé</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        </div>
      </div>

      <footer className="business-catalog__footer">
        <span>{editable ? (dirty ? 'Modifications non enregistrées.' : 'Référentiel à jour. L’enregistrement est atomique et versionné.') : 'Lecture seule : un administrateur peut modifier ce référentiel.'}</span>
        {editable ? <div className="business-catalog__actions"><button className="business-catalog__secondary" type="button" disabled={saving || !dirty} onClick={discard}>Annuler</button><button type="button" disabled={saving || !dirty} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer le référentiel'}</button></div> : null}
      </footer>
    </section>
  );
}
