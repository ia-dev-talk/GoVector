import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client';
import {
  buildOperationalAccountProfilePayload,
  canMutateOrganizationSnapshot,
  resolveOperationalAccountProfilePolicy,
  resolveOrganizationAvailability,
  resolveOrganizationSnapshot,
} from './accountProfilePolicy';
import '../../styles/settings-v1-admin.css';

function message(error) {
  return error?.response?.data?.detail || error?.message || 'Opération impossible.';
}

export default function AdminOrganizationSection({
  toast,
  userRole = 'ADMIN',
  refreshRevision = 0,
  surface = 'embedded',
}) {
  const enabled = surface === 'settings';
  const isAdmin = userRole === 'ADMIN';
  const [clients, setClients] = useState([]);
  const [teams, setTeams] = useState([]);
  const [orienteurs, setOrienteurs] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [grades, setGrades] = useState([
    { code: 'junior', label: 'Technicien débutant' },
    { code: 'senior', label: 'Technicien senior' },
  ]);
  const [teamDrafts, setTeamDrafts] = useState({});
  const [accountRole, setAccountRole] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [loadWarnings, setLoadWarnings] = useState([]);
  const accountProfilePolicy = resolveOperationalAccountProfilePolicy(accountRole);
  const availability = resolveOrganizationAvailability({
    loading,
    hasSnapshot,
    warnings: loadWarnings,
  });
  const mutationsLocked = !canMutateOrganizationSnapshot({
    loading,
    hasSnapshot,
    warnings: loadWarnings,
  });

  const ensureOrganizationWritable = () => {
    if (!mutationsLocked) return true;
    toast?.(
      'Organisation non synchronisée. Actualisez jusqu’à obtenir un snapshot complet avant toute modification.',
      'error',
    );
    return false;
  };

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    const results = await Promise.allSettled([
      isAdmin ? api.getV1Clients() : Promise.resolve({ data: [] }),
      api.getV1Teams(), api.getOrienteurs(), api.getSectors(), api.getTechnicians(),
      api.getBusinessCatalog(),
      isAdmin ? api.getV1Accounts() : Promise.resolve({ data: [] }),
    ]);
    const snapshot = resolveOrganizationSnapshot(results);
    if (!snapshot.complete) {
      setLoadWarnings(snapshot.warnings);
      setLoading(false);
      return;
    }

    const value = (index, fallback = []) => snapshot.values[index] ?? fallback;
    setClients(value(0));
    setTeams(value(1));
    setOrienteurs(value(2));
    setSectors(value(3));
    setTechnicians(value(4));
    const configured = (value(5, {})?.values?.technician_grades || [])
      .filter((item) => item.active);
    if (configured.length) setGrades(configured);
    setAccounts(value(6));
    setLoadWarnings([]);
    setHasSnapshot(true);
    setLoading(false);
  }, [enabled, isAdmin]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [enabled, load, refreshRevision]);

  const createClient = async (event) => {
    event.preventDefault();
    if (!ensureOrganizationWritable()) return;
    const form = event.currentTarget;
    try {
      await api.createV1Client({
        name: form.name.value.trim(),
        code: form.code.value.trim().toUpperCase(),
        operator: form.operator.value.trim() || null,
        is_active: true,
        metadata_json: {},
      });
      form.reset(); await load(); toast?.('Entreprise cliente créée.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const createClientAccount = async (event) => {
    event.preventDefault();
    if (!ensureOrganizationWritable()) return;
    const form = event.currentTarget;
    try {
      await api.createV1ClientAccount({
        username: form.username.value.trim(), email: form.email.value.trim(), password: form.password.value,
        organization_id: Number(form.organization_id.value),
      });
      form.reset(); toast?.('Compte client lecture seule créé.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const createOfficeAccount = async (event) => {
    event.preventDefault();
    if (!ensureOrganizationWritable()) return;
    const form = event.currentTarget;
    const profile = buildOperationalAccountProfilePayload(accountRole, {
      technicianId: form.elements.technician_id?.value,
      orienteurId: form.elements.orienteur_id?.value,
    });
    if (!profile.valid) {
      toast?.(profile.error, 'error');
      return;
    }
    try {
      await api.createV1Account({
        username: form.username.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value,
        role: accountRole,
        technician_id: profile.technician_id,
        orienteur_id: profile.orienteur_id,
      });
      form.reset();
      setAccountRole('');
      await load();
      toast?.('Compte opérationnel créé.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const toggleAccount = async (account) => {
    if (!ensureOrganizationWritable()) return;
    try {
      await api.updateV1Account(account.id, { is_active: !account.is_active });
      await load(); toast?.('Accès du compte mis à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const resetAccountPassword = async (event, accountId) => {
    event.preventDefault();
    if (!ensureOrganizationWritable()) return;
    const form = event.currentTarget;
    try {
      await api.resetV1AccountPassword(accountId, { password: form.password.value });
      form.reset(); toast?.('Mot de passe remplacé. Transmettez-le par un canal sûr.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const updateClientConfiguration = async (event, clientId) => {
    event.preventDefault();
    if (!ensureOrganizationWritable()) return;
    const form = event.currentTarget;
    try {
      await api.updateV1Client(clientId, {
        name: form.name.value.trim(),
        code: form.code.value.trim().toUpperCase(),
        operator: form.operator.value.trim() || null,
      });
      await load(); toast?.('Entreprise mise à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const createTeam = async (event) => {
    event.preventDefault();
    if (!ensureOrganizationWritable()) return;
    const form = event.currentTarget;
    const sectorIds = [...form.querySelectorAll('input[name="sector_ids"]:checked')].map((node) => Number(node.value));
    try {
      await api.createV1Team({
        name: form.name.value.trim(), code: form.code.value.trim() || null,
        orienteur_id: Number(form.orienteur_id.value), sector_ids: sectorIds,
        initial_technician_id: Number(form.initial_technician_id.value),
        initial_grade: form.initial_grade.value,
        is_active: true,
      });
      form.reset(); await load(); toast?.('Équipe créée.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const assignTechnician = async (teamId, technicianId, grade) => {
    if (!ensureOrganizationWritable()) return;
    try {
      await api.putV1TeamTechnician(teamId, technicianId, { grade });
      await load(); toast?.('Technicien déplacé dans l’équipe.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const updateTeamDraft = (teamId, patch) => {
    setTeamDrafts((current) => ({
      ...current,
      [teamId]: {
        technicianId: current[teamId]?.technicianId || '',
        grade: current[teamId]?.grade || grades[0]?.code || 'junior',
        ...patch,
      },
    }));
  };

  const submitTeamDraft = async (teamId) => {
    if (!ensureOrganizationWritable()) return;
    const draft = teamDrafts[teamId] || {};
    const technicianId = Number(draft.technicianId);
    if (!Number.isInteger(technicianId) || technicianId <= 0) {
      toast?.('Choisissez d’abord un technicien.', 'error');
      return;
    }
    const grade = draft.grade || grades[0]?.code || 'junior';
    await assignTechnician(teamId, technicianId, grade);
    setTeamDrafts((current) => ({
      ...current,
      [teamId]: { technicianId: '', grade },
    }));
  };

  const updateTeamConfiguration = async (event, teamId) => {
    event.preventDefault();
    if (!ensureOrganizationWritable()) return;
    const form = event.currentTarget;
    const sectorIds = [...form.querySelectorAll('input[name="sector_ids"]:checked')].map((node) => Number(node.value));
    try {
      await api.updateV1Team(teamId, {
        name: form.name.value.trim(),
        code: form.code.value.trim() || null,
        orienteur_id: Number(form.orienteur_id.value),
        sector_ids: sectorIds,
      });
      await load(); toast?.('Configuration de l’équipe mise à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const removeTechnician = async (teamId, technicianId) => {
    if (!ensureOrganizationWritable()) return;
    try {
      await api.removeV1TeamTechnician(teamId, technicianId);
      await load(); toast?.('Technicien retiré de l’équipe.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const toggleClient = async (client) => {
    if (!ensureOrganizationWritable()) return;
    try {
      await api.updateV1Client(client.id, { is_active: !client.is_active });
      await load(); toast?.('Entreprise mise à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const toggleTeam = async (team) => {
    if (!ensureOrganizationWritable()) return;
    try {
      await api.updateV1Team(team.id, { is_active: !team.is_active });
      await load(); toast?.('Équipe mise à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const gradeLabel = (code) => (
    grades.find((grade) => grade.code === code)?.label || code || 'Grade non défini'
  );

  if (!enabled) return null;
  if (availability === 'loading') {
    return <div className="v1-admin-loading">Chargement de l’organisation réelle…</div>;
  }
  if (availability === 'unavailable') {
    return (
      <div className="v1-admin-load-warning" role="alert" aria-busy={loading}>
        <div>
          <strong>Organisation indisponible</strong>
          <span>
            Impossible de charger un snapshot métier fiable : {loadWarnings.join(', ')}.
            Aucune donnée d’organisation n’est présentée comme autoritative et les modifications sont suspendues.
          </span>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Nouvelle tentative…' : 'Réessayer'}
        </button>
      </div>
    );
  }

  return (
    <div className="v1-admin-grid" aria-busy={loading}>
      {availability === 'stale' ? (
        <div className="v1-admin-load-warning" role="alert">
          <div>
            <strong>Organisation non synchronisée</strong>
            <span>
              Indisponible : {loadWarnings.join(', ')}. Dernier snapshot cohérent conservé ;
              les modifications sont suspendues jusqu’à un chargement complet.
            </span>
          </div>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? 'Nouvelle tentative…' : 'Réessayer'}
          </button>
        </div>
      ) : null}
      {isAdmin ? <section className="v1-admin-card">
        <header><span>Donneurs d’ordre</span><h2>Entreprises clientes</h2></header>
        <form onSubmit={createClient} className="v1-admin-form">
          <input name="name" required placeholder="Nom · Maroc Telecom" />
          <input name="code" required placeholder="Code · IAM" />
          <input name="operator" placeholder="Opérateur associé · IAM" />
          <button type="submit" disabled={mutationsLocked}>Ajouter l’entreprise</button>
        </form>
        <div className="v1-admin-list">
          {clients.map((client) => <div key={client.id}>
            <strong>{client.name}</strong><span>{client.code} · {client.operator || 'opérateur non défini'}</span>
            <details className="v1-admin-inline-editor">
              <summary>Modifier</summary>
              <form onSubmit={(event) => updateClientConfiguration(event, client.id)} className="v1-admin-form">
                <input name="name" required defaultValue={client.name} aria-label="Nom de l’entreprise" />
                <input name="code" required defaultValue={client.code} aria-label="Code de l’entreprise" />
                <input name="operator" defaultValue={client.operator || ''} placeholder="Opérateur associé" aria-label="Opérateur associé" />
                <button type="submit" disabled={mutationsLocked}>Enregistrer</button>
              </form>
            </details>
            <button type="button" disabled={mutationsLocked} onClick={() => toggleClient(client)}>{client.is_active ? 'Archiver / couper l’accès' : 'Réactiver'}</button>
          </div>)}
        </div>
      </section> : null}

      {isAdmin ? <section className="v1-admin-card v1-admin-card--wide">
        <header><span>Identités et accès</span><h2>Comptes opérationnels</h2></header>
        <p className="v1-admin-help">Les profils métier existent séparément des identifiants de connexion. Un compte technicien ou orienteur doit être relié au bon profil.</p>
        <form onSubmit={createOfficeAccount} className="v1-admin-form v1-admin-form--accounts">
          <input name="username" required minLength="3" placeholder="Identifiant de connexion" />
          <input name="email" required type="email" placeholder="Email" />
          <input name="password" required type="password" minLength="12" placeholder="Mot de passe initial · 12 caractères" />
          <select
            name="role"
            required
            value={accountRole}
            onChange={(event) => setAccountRole(event.target.value)}
          >
            <option value="" disabled>Rôle</option>
            <option value="ADMIN">Administrateur</option>
            <option value="CHEF_ORIENTEUR">Chef orienteur</option>
            <option value="ORIENTEUR">Orienteur</option>
            <option value="TECHNICIAN">Technicien</option>
          </select>
          {accountProfilePolicy.field === 'orienteur_id' ? (
            <select name="orienteur_id" required defaultValue="" disabled={mutationsLocked}>
              <option value="" disabled>Profil orienteur requis</option>
              {orienteurs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : null}
          {accountProfilePolicy.field === 'technician_id' ? (
            <select name="technician_id" required defaultValue="" disabled={mutationsLocked}>
              <option value="" disabled>Profil technicien requis</option>
              {technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : null}
          {accountProfilePolicy.supported && accountProfilePolicy.field === null ? (
            <p className="v1-admin-help">Ce rôle n’est lié à aucun profil terrain.</p>
          ) : null}
          <button type="submit" disabled={mutationsLocked}>Créer le compte</button>
        </form>
        <div className="v1-admin-account-grid">
          {accounts.map((account) => <article key={account.id} className={account.is_active ? '' : 'is-archived'}>
            <div><strong>{account.username}</strong><span>{account.role} · {account.email}</span></div>
            <button type="button" disabled={mutationsLocked} onClick={() => toggleAccount(account)}>{account.is_active ? 'Désactiver' : 'Réactiver'}</button>
            <details><summary>Réinitialiser le mot de passe</summary><form onSubmit={(event) => resetAccountPassword(event, account.id)}><input name="password" type="password" minLength="12" required placeholder="Nouveau mot de passe" /><button type="submit" disabled={mutationsLocked}>Remplacer</button></form></details>
          </article>)}
        </div>
      </section> : null}

      {isAdmin ? <section className="v1-admin-card">
        <header><span>Accès externe</span><h2>Compte client lecture seule</h2></header>
        <form onSubmit={createClientAccount} className="v1-admin-form">
          <select name="organization_id" required defaultValue="" disabled={mutationsLocked}><option value="" disabled>Entreprise</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
          <input name="username" required placeholder="Identifiant" />
          <input name="email" type="email" required placeholder="Email" />
          <input name="password" type="password" minLength="12" required placeholder="Mot de passe initial · 12 caractères" />
          <button type="submit" disabled={mutationsLocked}>Créer le compte</button>
        </form>
      </section> : null}

      <section className="v1-admin-card v1-admin-card--wide">
        <header><span>Organisation terrain</span><h2>Équipes, orienteurs et secteurs</h2></header>
        <p className="v1-admin-help">
          Une ligne représente un technicien. Le grade se choisit séparément afin d’éviter les doublons et les déplacements ambigus.
        </p>
        <form onSubmit={createTeam} className="v1-admin-form v1-admin-form--team">
          <input name="name" required placeholder="Nom de l’équipe" />
          <input name="code" placeholder="Code (optionnel)" />
          <select name="orienteur_id" required defaultValue="" disabled={mutationsLocked}><option value="" disabled>Orienteur unique</option>{orienteurs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="initial_technician_id" required defaultValue="" disabled={mutationsLocked}><option value="" disabled>Premier technicien</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="initial_grade" required defaultValue={grades[0]?.code || 'junior'} disabled={mutationsLocked}>{grades.map((grade) => <option key={grade.code} value={grade.code}>{grade.label}</option>)}</select>
          <fieldset disabled={mutationsLocked}><legend>Un ou plusieurs secteurs</legend>{sectors.map((sector) => <label key={sector.id}><input type="checkbox" name="sector_ids" value={sector.id} />{sector.name}</label>)}</fieldset>
          <button type="submit" disabled={mutationsLocked}>Créer l’équipe</button>
        </form>
        <div className="v1-admin-team-grid">
          {teams.map((team) => {
            const draft = teamDrafts[team.id] || {};
            const availableTechnicians = technicians.filter((tech) => tech.team_id !== team.id);
            return (
              <article key={team.id}>
                <h3>{team.name}</h3><p>{team.orienteur_name} · {team.sector_names.join(', ') || 'aucun secteur'}</p>
                <details className="v1-admin-inline-editor">
                  <summary>Modifier l’équipe</summary>
                  <form onSubmit={(event) => updateTeamConfiguration(event, team.id)} className="v1-admin-form v1-admin-form--team-edit">
                    <input name="name" required defaultValue={team.name} aria-label="Nom de l’équipe" />
                    <input name="code" defaultValue={team.code || ''} placeholder="Code (optionnel)" aria-label="Code de l’équipe" />
                    <select name="orienteur_id" required defaultValue={String(team.orienteur_id)} aria-label="Orienteur de l’équipe" disabled={mutationsLocked}>{orienteurs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                    <fieldset disabled={mutationsLocked}><legend>Secteurs de l’équipe</legend>{sectors.map((sector) => <label key={`${team.id}-${sector.id}`}><input type="checkbox" name="sector_ids" value={sector.id} defaultChecked={team.sector_ids.includes(sector.id)} />{sector.name}</label>)}</fieldset>
                    <button type="submit" disabled={mutationsLocked}>Enregistrer l’équipe</button>
                  </form>
                </details>
                <div className="v1-admin-chip-row">
                  {team.technicians.length ? team.technicians.map((tech) => (
                    <span key={tech.id}>
                      {tech.name} · {gradeLabel(tech.grade)}
                      <button type="button" disabled={mutationsLocked} aria-label={`Retirer ${tech.name}`} onClick={() => removeTechnician(team.id, tech.id)}>×</button>
                    </span>
                  )) : <small>Aucun technicien dans cette équipe.</small>}
                </div>
                <div className="v1-admin-team-add v1-admin-team-add--explicit">
                  <select
                    disabled={mutationsLocked || !team.is_active}
                    value={draft.technicianId || ''}
                    aria-label={`Technicien à ajouter à ${team.name}`}
                    onChange={(event) => updateTeamDraft(team.id, { technicianId: event.target.value })}
                  >
                    <option value="">Choisir un technicien…</option>
                    {availableTechnicians.map((tech) => {
                      const currentTeam = teams.find((candidate) => candidate.id === tech.team_id);
                      return (
                        <option key={`${team.id}-${tech.id}`} value={tech.id}>
                          {tech.name}{currentTeam ? ` · actuellement ${currentTeam.name}` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    disabled={mutationsLocked || !team.is_active}
                    value={draft.grade || grades[0]?.code || 'junior'}
                    aria-label={`Grade dans ${team.name}`}
                    onChange={(event) => updateTeamDraft(team.id, { grade: event.target.value })}
                  >
                    {grades.map((grade) => <option key={`${team.id}-grade-${grade.code}`} value={grade.code}>{grade.label}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={mutationsLocked || !team.is_active || !draft.technicianId}
                    onClick={() => submitTeamDraft(team.id)}
                  >
                    Affecter à l’équipe
                  </button>
                  <button type="button" className="v1-admin-quiet-button" disabled={mutationsLocked} onClick={() => toggleTeam(team)}>{team.is_active ? 'Archiver l’équipe' : 'Réactiver l’équipe'}</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
