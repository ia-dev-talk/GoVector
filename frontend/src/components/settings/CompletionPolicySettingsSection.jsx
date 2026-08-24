import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../../api/client';
import Button from '../ui/Button';
import Card from '../ui/Card';
import './completion-policy-settings.css';

const BOOLEAN_RULES = Object.freeze([
  ['require_client_signature', 'Signature client', 'Une signature mobile ou historique est exigée avant clôture.'],
  ['require_cable_length', 'Longueur câble', 'La longueur réellement déclarée/mesurée doit être renseignée.'],
  ['require_measurements', 'Mesure optique', 'Une puissance optique canonique doit être disponible.'],
  ['require_gps', 'Position GPS du site', 'Une position GPS terrain normalisée ou historique doit être présente.'],
  ['require_stock_consumption', 'Matériel consommé', 'Au moins une consommation de stock validée doit être liée à l’intervention.'],
]);

const ADVANCED_FIELDS = Object.freeze([
  ['nro', 'NRO'],
  ['sro', 'SRO'],
  ['pbo', 'PBO'],
  ['pto', 'PTO'],
  ['ont_serial', 'SN ONT'],
  ['router_serial', 'SN routeur'],
  ['mac_address', 'Adresse MAC'],
  ['comment', 'Commentaire terrain'],
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function apiError(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (isRecord(detail) && text(detail.message)) return text(detail.message);
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => text(item?.msg ?? item?.message)).filter(Boolean);
    if (messages.length) return messages.join(' · ');
  }
  return text(error?.message) || fallback;
}

function normalizeRequirements(value = {}) {
  const source = isRecord(value) ? value : {};
  return {
    require_client_signature: source.require_client_signature === true,
    require_cable_length: source.require_cable_length === true,
    require_measurements: source.require_measurements === true,
    require_gps: source.require_gps === true,
    require_stock_consumption: source.require_stock_consumption === true,
    minimum_photos: Math.max(0, Math.min(2, Number(source.minimum_photos) || 0)),
    required_field_keys: Array.isArray(source.required_field_keys)
      ? [...new Set(source.required_field_keys.map(text).filter(Boolean))]
      : [],
  };
}

function normalizePolicy(document) {
  const values = isRecord(document?.values) ? document.values : {};
  const rawPolicy = isRecord(values.completion_policy) ? values.completion_policy : {};
  const normalizeMap = (value) => Object.fromEntries(
    Object.entries(isRecord(value) ? value : {}).map(([key, requirements]) => [
      key,
      normalizeRequirements(requirements),
    ]),
  );
  return {
    revision: Number(document?.revision) || 0,
    values,
    policy: {
      default: normalizeRequirements(rawPolicy.default),
      by_job_type: normalizeMap(rawPolicy.by_job_type),
      by_operator: normalizeMap(rawPolicy.by_operator),
    },
  };
}

function RuleEditor({ value, onChange, compact = false }) {
  const toggleAdvanced = (key) => {
    const set = new Set(value.required_field_keys);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onChange({ ...value, required_field_keys: [...set] });
  };

  return (
    <div className={compact ? 'completion-policy-rules completion-policy-rules--compact' : 'completion-policy-rules'}>
      <div className="completion-policy-rule-grid">
        {BOOLEAN_RULES.map(([key, label, description]) => (
          <label className="completion-policy-toggle" key={key}>
            <input
              type="checkbox"
              checked={value[key] === true}
              onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
            />
            <span className="completion-policy-toggle-indicator" aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              {!compact ? <small>{description}</small> : null}
            </span>
          </label>
        ))}
      </div>

      <label className="completion-policy-photo-field">
        <span>
          <strong>Photos terrain minimum</strong>
          {!compact ? <small>Compte les anciennes photos et les médias mobile V2 sans double comptage.</small> : null}
        </span>
        <select
          value={value.minimum_photos}
          onChange={(event) => onChange({
            ...value,
            minimum_photos: Number(event.target.value),
          })}
        >
          <option value="0">Aucune</option>
          <option value="1">1 photo</option>
          <option value="2">2 photos</option>
        </select>
      </label>

      <details className="completion-policy-advanced">
        <summary>Champs FTTH complémentaires obligatoires</summary>
        <div className="completion-policy-chip-grid">
          {ADVANCED_FIELDS.map(([key, label]) => (
            <label key={key} className={value.required_field_keys.includes(key) ? 'completion-policy-chip is-active' : 'completion-policy-chip'}>
              <input
                type="checkbox"
                checked={value.required_field_keys.includes(key)}
                onChange={() => toggleAdvanced(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}

const CompletionPolicySettingsSection = memo(function CompletionPolicySettingsSection({
  toast,
  refreshRevision = 0,
  onDirtyChange,
}) {
  const [loaded, setLoaded] = useState(() => normalizePolicy(null));
  const [draft, setDraft] = useState(() => normalizePolicy(null).policy);
  const [jobTypes, setJobTypes] = useState([]);
  const [newJobType, setNewJobType] = useState('');
  const [newOperator, setNewOperator] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sequenceRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++sequenceRef.current;
    setLoading(true);
    setError('');
    const [operationalResult, catalogResult] = await Promise.allSettled([
      api.getOperationalSettings(),
      api.getBusinessCatalog(),
    ]);
    if (requestId !== sequenceRef.current) return;

    if (operationalResult.status === 'fulfilled') {
      const normalized = normalizePolicy(operationalResult.value?.data);
      setLoaded(normalized);
      setDraft(normalized.policy);
    } else {
      setError(apiError(operationalResult.reason, 'Impossible de charger la politique de clôture.'));
    }

    if (catalogResult.status === 'fulfilled') {
      const values = catalogResult.value?.data?.values;
      const types = Array.isArray(values?.job_types) ? values.job_types : [];
      setJobTypes(types.filter((item) => item?.active !== false));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    return () => {
      sequenceRef.current += 1;
    };
  }, [load, refreshRevision]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(loaded.policy),
    [draft, loaded.policy],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await api.updateOperationalSettings({
        expected_revision: loaded.revision,
        values: {
          ...loaded.values,
          completion_policy: draft,
        },
      });
      const normalized = normalizePolicy(response?.data);
      setLoaded(normalized);
      setDraft(normalized.policy);
      toast?.('Politique de clôture enregistrée et active sur le web et le mobile.', 'success');
    } catch (saveError) {
      const message = apiError(saveError, 'Impossible d’enregistrer la politique de clôture.');
      setError(message);
      toast?.(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addJobTypeOverride = () => {
    const code = text(newJobType);
    if (!code || draft.by_job_type[code]) return;
    setDraft((current) => ({
      ...current,
      by_job_type: {
        ...current.by_job_type,
        [code]: { ...current.default, required_field_keys: [...current.default.required_field_keys] },
      },
    }));
    setNewJobType('');
  };

  const addOperatorOverride = () => {
    const code = text(newOperator).toUpperCase();
    if (!code || draft.by_operator[code]) return;
    setDraft((current) => ({
      ...current,
      by_operator: {
        ...current.by_operator,
        [code]: { ...current.default, required_field_keys: [...current.default.required_field_keys] },
      },
    }));
    setNewOperator('');
  };

  const updateOverride = (scope, key, value) => {
    setDraft((current) => ({
      ...current,
      [scope]: { ...current[scope], [key]: value },
    }));
  };

  const removeOverride = (scope, key) => {
    setDraft((current) => {
      const next = { ...current[scope] };
      delete next[key];
      return { ...current, [scope]: next };
    });
  };

  return (
    <div className="admin-section completion-policy-section">
      <div className="admin-section-heading-row">
        <div>
          <h3 className="admin-section-title">Clôture terrain</h3>
          <p className="admin-section-desc">
            Définissez les preuves réellement obligatoires avant qu’un technicien puisse clôturer. Le mobile affiche les éléments manquants avant la fin de l’intervention.
          </p>
        </div>
        <span className="completion-policy-badge">Moteur workflow</span>
      </div>

      {error ? <div className="admin-settings-error" role="alert"><span>{error}</span><Button size="sm" variant="secondary" onClick={load}>Réessayer</Button></div> : null}

      <Card title="Règle par défaut" className="completion-policy-card">
        {loading ? (
          <div className="admin-settings-loading">Chargement de la politique…</div>
        ) : (
          <RuleEditor
            value={draft.default}
            onChange={(value) => setDraft((current) => ({ ...current, default: value }))}
          />
        )}
      </Card>

      {!loading ? (
        <div className="completion-policy-overrides">
          <Card title="Exceptions par type d’intervention" className="completion-policy-card">
            <div className="completion-policy-add-row">
              <select value={newJobType} onChange={(event) => setNewJobType(event.target.value)}>
                <option value="">Choisir un type…</option>
                {jobTypes
                  .filter((item) => !draft.by_job_type[item.code])
                  .map((item) => <option key={item.code} value={item.code}>{item.label} · {item.code}</option>)}
              </select>
              <Button size="sm" variant="secondary" onClick={addJobTypeOverride} disabled={!newJobType}>Ajouter</Button>
            </div>
            <div className="completion-policy-override-list">
              {Object.entries(draft.by_job_type).length === 0 ? <p className="completion-policy-empty">Aucune exception : la règle par défaut s’applique.</p> : null}
              {Object.entries(draft.by_job_type).map(([key, value]) => (
                <article key={key} className="completion-policy-override">
                  <header><div><span>Type</span><strong>{jobTypes.find((item) => item.code === key)?.label || key}</strong><small>{key}</small></div><button type="button" onClick={() => removeOverride('by_job_type', key)}>Supprimer</button></header>
                  <RuleEditor compact value={value} onChange={(next) => updateOverride('by_job_type', key, next)} />
                </article>
              ))}
            </div>
          </Card>

          <Card title="Exceptions par opérateur" className="completion-policy-card">
            <div className="completion-policy-add-row">
              <input value={newOperator} onChange={(event) => setNewOperator(event.target.value)} placeholder="Ex. ORANGE, IAM, INWI" />
              <Button size="sm" variant="secondary" onClick={addOperatorOverride} disabled={!text(newOperator)}>Ajouter</Button>
            </div>
            <div className="completion-policy-override-list">
              {Object.entries(draft.by_operator).length === 0 ? <p className="completion-policy-empty">Aucune exception opérateur.</p> : null}
              {Object.entries(draft.by_operator).map(([key, value]) => (
                <article key={key} className="completion-policy-override">
                  <header><div><span>Opérateur</span><strong>{key}</strong></div><button type="button" onClick={() => removeOverride('by_operator', key)}>Supprimer</button></header>
                  <RuleEditor compact value={value} onChange={(next) => updateOverride('by_operator', key, next)} />
                </article>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="completion-policy-footer">
        <span>
          Priorité : opérateur → type d’intervention → défaut. Une exception est une règle complète, pas un supplément à la règle par défaut.
        </span>
        <div>
          <Button variant="secondary" disabled={!dirty || saving} onClick={() => setDraft(loaded.policy)}>Annuler</Button>
          <Button variant="primary" loading={saving} disabled={!dirty || loading} onClick={save}>Enregistrer la politique</Button>
        </div>
      </div>
    </div>
  );
});

export default CompletionPolicySettingsSection;
