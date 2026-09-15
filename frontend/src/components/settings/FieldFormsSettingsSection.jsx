import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../../api/client';
import '../../styles/settings-field-forms.css';

const FIELD_KINDS = [
  ['text', 'Texte'], ['number', 'Nombre'], ['choice', 'Choix'],
  ['photo', 'Photo'], ['measure', 'Mesure'], ['signature', 'Signature'],
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const identity = (item) => `${item.template_key}@${item.version}`;
const csv = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

function message(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).filter(Boolean).join(' · ');
  return error?.message || 'Catalogue de formulaires indisponible.';
}

function freshTemplate(existing) {
  let number = existing.length + 1;
  let key = `formulaire_${number}`;
  const keys = new Set(existing.map((item) => item.template_key));
  while (keys.has(key)) { number += 1; key = `formulaire_${number}`; }
  return {
    template_key: key,
    version: 1,
    label: 'Nouveau formulaire',
    description: null,
    active: true,
    scope: { activity_codes: [], operator_codes: [], client_organization_ids: [] },
    fields: [{ key: 'observation', label: 'Observation', kind: 'text', required: false, sort_order: 0, options: [], unit: null, help_text: null }],
    created_at: null,
    created_by: null,
  };
}

export default function FieldFormsSettingsSection({ toast, userRole = 'ADMIN', refreshRevision = 0, onDirtyChange }) {
  const editable = userRole === 'ADMIN';
  const [document, setDocument] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobTypes, setJobTypes] = useState([]);
  const [published, setPublished] = useState(new Set());
  const [selected, setSelected] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [formsResponse, catalogResponse] = await Promise.all([
        api.getFieldForms(),
        api.getBusinessCatalog(),
      ]);
      const items = clone(formsResponse.data?.values?.templates || []);
      setDocument(formsResponse.data);
      setTemplates(items);
      setJobTypes(clone(catalogResponse.data?.values?.job_types || []));
      setPublished(new Set(items.map(identity)));
      setSelected(items.length ? 0 : null); setDirty(false);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshRevision]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const active = selected === null ? null : templates[selected];
  const isPublished = active ? published.has(identity(active)) : false;
  const mutate = (recipe) => {
    setTemplates((current) => {
      const next = clone(current); recipe(next); return next;
    });
    setDirty(true);
  };
  const update = (field, value) => mutate((items) => { items[selected][field] = value; });
  const updateScope = (field, value) => mutate((items) => { items[selected].scope[field] = value; });
  const updateField = (index, field, value) => mutate((items) => { items[selected].fields[index][field] = value; });

  const create = () => {
    const item = freshTemplate(templates);
    setTemplates((items) => [...items, item]); setSelected(templates.length); setDirty(true);
  };
  const createVersion = () => {
    if (!active) return;
    const nextVersion = Math.max(...templates.filter((item) => item.template_key === active.template_key).map((item) => item.version)) + 1;
    const next = { ...clone(active), version: nextVersion, active: true, created_at: null, created_by: null };
    const items = templates.map((item) => item.template_key === active.template_key ? { ...item, active: false } : item);
    setTemplates([...items, next]); setSelected(items.length); setDirty(true);
  };
  const duplicate = () => {
    if (!active) return;
    const base = `${active.template_key}_copie`;
    let key = base; let number = 2;
    while (templates.some((item) => item.template_key === key)) { key = `${base}_${number}`; number += 1; }
    const next = { ...clone(active), template_key: key, version: 1, label: `${active.label} · copie`, active: true, created_at: null, created_by: null };
    setTemplates((items) => [...items, next]); setSelected(templates.length); setDirty(true);
  };
  const toggle = () => mutate((items) => {
    const target = items[selected];
    if (!target.active) {
      items.forEach((item) => { if (item.template_key === target.template_key) item.active = false; });
    }
    target.active = !target.active;
  });
  const toggleActivity = (code, checked) => {
    if (!active) return;
    const current = new Set(active.scope.activity_codes || []);
    if (checked) current.add(code); else current.delete(code);
    updateScope('activity_codes', Array.from(current));
  };
  const addField = () => mutate((items) => {
    const fields = items[selected].fields;
    fields.push({ key: `champ_${fields.length + 1}`, label: 'Nouveau champ', kind: 'text', required: false, sort_order: fields.length * 10, options: [], unit: null, help_text: null });
  });
  const removeField = (index) => mutate((items) => { if (items[selected].fields.length > 1) items[selected].fields.splice(index, 1); });

  const save = async () => {
    setBusy(true); setError('');
    try {
      const response = await api.updateFieldForms({ expected_revision: document?.revision || 0, values: { templates } });
      const items = clone(response.data.values.templates);
      setDocument(response.data); setTemplates(items); setPublished(new Set(items.map(identity)));
      setSelected(items.length ? Math.min(selected ?? 0, items.length - 1) : null); setDirty(false);
      toast?.('Catalogue de formulaires versionné et enregistré.', 'success');
    } catch (failure) { const text = message(failure); setError(text); toast?.(text, 'error'); }
    finally { setBusy(false); }
  };

  const grouped = useMemo(() => templates.map((item, index) => ({ item, index })), [templates]);
  const activityChoices = useMemo(() => {
    const selectedCodes = new Set(active?.scope?.activity_codes || []);
    return jobTypes
      .filter((item) => item?.code && (item.active || selectedCodes.has(item.code)))
      .sort((left, right) => (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0));
  }, [active?.scope?.activity_codes, jobTypes]);
  const missingActivityCodes = useMemo(() => {
    const catalogCodes = new Set(jobTypes.map((item) => item?.code).filter(Boolean));
    return (active?.scope?.activity_codes || []).filter((code) => !catalogCodes.has(code));
  }, [active?.scope?.activity_codes, jobTypes]);

  if (busy && !document) return <section className="forms-settings"><p>Chargement des formulaires…</p></section>;

  return <section className="forms-settings">
    <header><div><span>CONTRAT TERRAIN VERSIONNÉ</span><h2>Formulaires terrain</h2><p>Chaque modification publiée crée une nouvelle version. Les versions antérieures restent lisibles et ne sont jamais supprimées.</p></div><strong>Révision {document?.revision || 0}</strong></header>
    {error && <p role="alert" className="forms-settings__error">{error}</p>}
    <div className="forms-settings__toolbar">
      <button type="button" disabled={!editable || busy} onClick={create}>+ Créer</button>
      <button type="button" disabled={!editable || !active || busy} onClick={duplicate}>Dupliquer</button>
      <button type="button" disabled={!editable || !active || !isPublished || busy} onClick={createVersion}>Modifier en nouvelle version</button>
      <button type="button" disabled={!editable || !active || busy} onClick={toggle}>{active?.active ? 'Désactiver' : 'Activer'}</button>
    </div>
    <div className="forms-settings__workspace">
      <nav aria-label="Versions des formulaires">{grouped.map(({ item, index }) => <button type="button" key={identity(item)} className={index === selected ? 'is-active' : ''} onClick={() => setSelected(index)}><strong>{item.label}</strong><span>{item.template_key} · v{item.version}</span><small>{item.active ? 'Active' : 'Historique'}</small></button>)}</nav>
      <div className="forms-settings__editor">
        {!active ? <p>Aucun formulaire. Créez le premier modèle administrable.</p> : <>
          {isPublished && <p className="forms-settings__immutable">Version publiée : seuls activation et archivage sont modifiables. Utilisez « Modifier en nouvelle version » pour changer sa définition.</p>}
          <div className="forms-settings__grid">
            <label>Identifiant<input disabled={!editable || isPublished} value={active.template_key} onChange={(event) => update('template_key', event.target.value)} /></label>
            <label>Libellé<input disabled={!editable || isPublished} value={active.label} onChange={(event) => update('label', event.target.value)} /></label>
            <fieldset className="forms-settings__activity-picker">
              <legend>Activités / types d’intervention liés</legend>
              <p>Choisissez les activités administrées qui utilisent ce formulaire. Le lien est enregistré avec la version du formulaire.</p>
              <div className="forms-settings__activity-options">
                {activityChoices.map((item) => {
                  const checked = active.scope.activity_codes.includes(item.code);
                  const disabled = !editable || isPublished || (!item.active && !checked);
                  return <label key={item.code} className={!item.active ? 'is-inactive' : ''}>
                    <input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => toggleActivity(item.code, event.target.checked)} />
                    <span><strong>{item.label || item.code}</strong><small>{item.code}{item.active ? '' : ' · inactive'}</small></span>
                  </label>;
                })}
                {activityChoices.length === 0 && <span className="forms-settings__empty-choice">Aucune activité active dans le référentiel métier.</span>}
              </div>
              {missingActivityCodes.length > 0 && <p className="forms-settings__scope-warning">Liens historiques absents du référentiel : {missingActivityCodes.join(', ')}. Ils sont conservés tant que cette version n’est pas remplacée.</p>}
            </fieldset>
            <label>Opérateurs (codes séparés par virgule)<input disabled={!editable || isPublished} value={active.scope.operator_codes.join(', ')} onChange={(event) => updateScope('operator_codes', csv(event.target.value))} /></label>
            <label>Clients (identifiants séparés par virgule)<input disabled={!editable || isPublished} value={active.scope.client_organization_ids.join(', ')} onChange={(event) => updateScope('client_organization_ids', csv(event.target.value).map(Number).filter(Number.isInteger))} /></label>
          </div>
          <div className="forms-settings__fields"><h3>Champs ordonnés</h3>{active.fields.map((field, index) => <article key={`${field.key}-${index}`}>
            <input aria-label={`Identifiant champ ${index + 1}`} disabled={!editable || isPublished} value={field.key} onChange={(event) => updateField(index, 'key', event.target.value)} />
            <input aria-label={`Libellé champ ${index + 1}`} disabled={!editable || isPublished} value={field.label} onChange={(event) => updateField(index, 'label', event.target.value)} />
            <select aria-label={`Type champ ${index + 1}`} disabled={!editable || isPublished} value={field.kind} onChange={(event) => updateField(index, 'kind', event.target.value)}>{FIELD_KINDS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <input aria-label={`Ordre champ ${index + 1}`} disabled={!editable || isPublished} type="number" min="0" value={field.sort_order} onChange={(event) => updateField(index, 'sort_order', Number(event.target.value))} />
            <label><input disabled={!editable || isPublished} type="checkbox" checked={field.required} onChange={(event) => updateField(index, 'required', event.target.checked)} /> Obligatoire</label>
            {field.kind === 'choice' && <input aria-label={`Choix champ ${index + 1}`} disabled={!editable || isPublished} placeholder="Oui, Non" value={field.options.join(', ')} onChange={(event) => updateField(index, 'options', csv(event.target.value))} />}
            {(field.kind === 'number' || field.kind === 'measure') && <input aria-label={`Unité champ ${index + 1}`} disabled={!editable || isPublished} placeholder="Unité" value={field.unit || ''} onChange={(event) => updateField(index, 'unit', event.target.value || null)} />}
            <button type="button" disabled={!editable || isPublished || active.fields.length === 1} onClick={() => removeField(index)}>Retirer</button>
          </article>)}
          <button type="button" disabled={!editable || isPublished} onClick={addField}>+ Ajouter un champ</button></div>
        </>}
      </div>
    </div>
    {editable && <footer><span>{dirty ? 'Modifications non enregistrées.' : 'Catalogue à jour.'}</span><button type="button" disabled={!dirty || busy} onClick={load}>Annuler</button><button type="button" disabled={!dirty || busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></footer>}
  </section>;
}
