import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../api/client';
import {
  catalogRowKey,
  normalizeCatalogCode,
  validateBusinessCatalogDraft,
} from '../../lib/business-catalog';
import '../../styles/settings-business-catalog.css';
import '../../styles/settings-business-catalog-actions.css';

const SECTIONS = [
  { key: 'technician_grades', title: 'Grades techniciens', shortTitle: 'Grades', copy: 'Ajoutables et archivables. Un grade utilisé reste protégé.', extensible: true },
  { key: 'job_types', title: 'Types d’intervention', shortTitle: 'Types', copy: 'Présentation modifiable ; identifiants techniques protégés.' },
  { key: 'priorities', title: 'Priorités', shortTitle: 'Priorités', copy: 'Libellés, couleurs, ordre et disponibilité.' },
  { key: 'status_presentations', title: 'Statuts du workflow', shortTitle: 'Statuts', copy: 'Libellés et couleurs modifiables ; transitions et identifiants protégés.', alwaysActive: true },
  { key: 'field_actions', title: 'Actions terrain', shortTitle: 'Actions terrain', copy: 'Types proposés au technicien dans la capture libre.' },
];

function errorMessage(error) {
  return error?.response?.data?.detail || error?.message || 'Référentiel indisponible.';
}

function copyValues(values) {
  return Object.fromEntries(
    SECTIONS.map(({ key }) => [key, (values?.[key] || []).map((item) => ({ ...item }))]),
  );
}

function newGrade(items) {
  const used = new Set(items.map((item) => item.code));
  let number = items.length + 1;
  while (used.has(`grade_${number}`)) number += 1;
  return {
    code: `grade_${number}`,
    label: 'Nouveau grade',
    description: null,
    color: '#50D5FF',
    sort_order: items.length * 10,
    active: true,
    metadata: {},
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

  const addGrade = () => {
    setValues((current) => ({
      ...current,
      technician_grades: [...current.technician_grades, newGrade(current.technician_grades)],
    }));
    setDirty(true);
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

  return (
    <section className="business-catalog">
      <header className="business-catalog__hero">
        <div>
          <span>Gouvernance opérationnelle</span>
          <h2>Référentiels métier</h2>
          <p>Les équipes adaptent le vocabulaire sans casser les contrats utilisés par l’API, le web et le mobile.</p>
        </div>
        <div className="business-catalog__revision">
          <strong>Révision {document.revision}</strong>
          <span>{activeCount} éléments actifs</span>
        </div>
      </header>

      <div className="business-catalog__notice">
        <strong>Deux niveaux de configuration</strong>
        <span>Les grades sont extensibles. Les codes de workflow sont protégés ; leur affichage reste personnalisable.</span>
      </div>

      <nav className="business-catalog__section-nav" aria-label="Catégories du référentiel métier">
        {SECTIONS.map((section) => {
          const sectionItems = values[section.key] || [];
          const enabled = sectionItems.filter((item) => item.active).length;
          return (
            <button
              type="button"
              key={section.key}
              className={section.key === activeSection.key ? 'is-active' : ''}
              onClick={() => setActiveSectionKey(section.key)}
            >
              <span>{section.shortTitle}</span>
              <strong>{sectionItems.length}</strong>
              <small>{enabled} actifs</small>
            </button>
          );
        })}
      </nav>

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
            {editable && activeSection.extensible ? <button type="button" onClick={addGrade}>+ Ajouter</button> : null}
          </header>
          <div className="catalog-table" role="table" aria-label={activeSection.title}>
            <div className="catalog-table__head" role="row"><span>Identifiant</span><span>Libellé</span><span>Couleur</span><span>Ordre</span><span>Actif</span></div>
            {activeItems.map((item, index) => (
              <div className="catalog-table__row" role="row" key={catalogRowKey(activeSection.key, index)}>
                {activeSection.extensible && editable ? (
                  <input aria-label={`Code ${item.label}`} value={item.code} onChange={(event) => updateItem(activeSection.key, index, 'code', normalizeCatalogCode(event.target.value))} />
                ) : <code>{item.code}</code>}
                <input disabled={!editable} aria-label={`Libellé ${item.code}`} value={item.label} onChange={(event) => updateItem(activeSection.key, index, 'label', event.target.value)} />
                <input disabled={!editable} type="color" aria-label={`Couleur ${item.code}`} value={item.color || '#4B8DFF'} onInput={(event) => updateItem(activeSection.key, index, 'color', event.currentTarget.value)} />
                <input disabled={!editable} type="number" min="0" max="10000" aria-label={`Ordre ${item.code}`} value={item.sort_order} onChange={(event) => updateItem(activeSection.key, index, 'sort_order', Number(event.target.value))} />
                <label className="catalog-switch"><input disabled={!editable || activeSection.alwaysActive} type="checkbox" checked={item.active} onChange={(event) => updateItem(activeSection.key, index, 'active', event.target.checked)} /><span>{item.active ? 'Oui' : 'Archivé'}</span></label>
              </div>
            ))}
          </div>
        </article>
      </div>

      <footer className="business-catalog__footer">
        <span>{editable ? (dirty ? 'Modifications non enregistrées.' : 'Référentiel à jour. L’enregistrement est atomique et versionné.') : 'Lecture seule : un administrateur peut modifier ce référentiel.'}</span>
        {editable ? <div className="business-catalog__actions"><button className="business-catalog__secondary" type="button" disabled={saving || !dirty} onClick={discard}>Annuler</button><button type="button" disabled={saving || !dirty} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer le référentiel'}</button></div> : null}
      </footer>
    </section>
  );
}
