import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../api/client';
import '../../styles/settings-business-catalog.css';

const SECTIONS = [
  { key: 'technician_grades', title: 'Grades techniciens', copy: 'Ajoutables et archivables. Un grade utilisé reste protégé.', extensible: true },
  { key: 'job_types', title: 'Types d’intervention', copy: 'Présentation modifiable ; identifiants techniques protégés.' },
  { key: 'priorities', title: 'Priorités', copy: 'Libellés, couleurs, ordre et disponibilité.' },
  { key: 'status_presentations', title: 'Statuts du workflow', copy: 'Libellés et couleurs modifiables ; transitions et identifiants protégés.', alwaysActive: true },
  { key: 'field_actions', title: 'Actions terrain', copy: 'Types proposés au technicien dans la capture libre.' },
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

export default function BusinessCatalogSection({ toast, userRole = 'ADMIN', refreshRevision = 0 }) {
  const editable = userRole === 'ADMIN';
  const [document, setDocument] = useState(null);
  const [values, setValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getBusinessCatalog();
      setDocument(response.data);
      setValues(copyValues(response.data?.values));
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

  const activeCount = useMemo(() => {
    if (!values) return 0;
    return Object.values(values).flat().filter((item) => item.active).length;
  }, [values]);

  const updateItem = (section, index, field, nextValue) => {
    setValues((current) => ({
      ...current,
      [section]: current[section].map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: nextValue } : item
      )),
    }));
  };

  const addGrade = () => {
    setValues((current) => ({
      ...current,
      technician_grades: [...current.technician_grades, newGrade(current.technician_grades)],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await api.updateBusinessCatalog({
        expected_revision: document.revision,
        values,
      });
      setDocument(response.data);
      setValues(copyValues(response.data.values));
      toast?.('Référentiel métier enregistré et versionné.', 'success');
    } catch (saveError) {
      toast?.(errorMessage(saveError), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="catalog-state">Chargement du référentiel métier…</div>;
  if (error) return <div className="catalog-state catalog-state--error"><strong>Connexion impossible</strong><span>{error}</span><button type="button" onClick={load}>Réessayer</button></div>;
  if (!values) return null;

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

      <div className="business-catalog__sections">
        {SECTIONS.map((section) => (
          <article key={section.key} className="catalog-card">
            <header>
              <div><h3>{section.title}</h3><p>{section.copy}</p></div>
              {editable && section.extensible ? <button type="button" onClick={addGrade}>+ Ajouter</button> : null}
            </header>
            <div className="catalog-table" role="table" aria-label={section.title}>
              <div className="catalog-table__head" role="row"><span>Identifiant</span><span>Libellé</span><span>Couleur</span><span>Ordre</span><span>Actif</span></div>
              {values[section.key].map((item, index) => (
                <div className="catalog-table__row" role="row" key={item.code}>
                  {section.extensible && editable ? (
                    <input aria-label={`Code ${item.label}`} value={item.code} onChange={(event) => updateItem(section.key, index, 'code', event.target.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_'))} />
                  ) : <code>{item.code}</code>}
                  <input disabled={!editable} aria-label={`Libellé ${item.code}`} value={item.label} onChange={(event) => updateItem(section.key, index, 'label', event.target.value)} />
                  <input disabled={!editable} type="color" aria-label={`Couleur ${item.code}`} value={item.color || '#4B8DFF'} onChange={(event) => updateItem(section.key, index, 'color', event.target.value)} />
                  <input disabled={!editable} type="number" min="0" max="10000" aria-label={`Ordre ${item.code}`} value={item.sort_order} onChange={(event) => updateItem(section.key, index, 'sort_order', Number(event.target.value))} />
                  <label className="catalog-switch"><input disabled={!editable || section.alwaysActive} type="checkbox" checked={item.active} onChange={(event) => updateItem(section.key, index, 'active', event.target.checked)} /><span>{item.active ? 'Oui' : 'Archivé'}</span></label>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      <footer className="business-catalog__footer">
        <span>{editable ? 'L’enregistrement est atomique et contrôlé par révision.' : 'Lecture seule : un administrateur peut modifier ce référentiel.'}</span>
        {editable ? <button type="button" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer le référentiel'}</button> : null}
      </footer>
    </section>
  );
}
