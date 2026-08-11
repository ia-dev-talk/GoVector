import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client';
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
  const [loading, setLoading] = useState(enabled);
  const [loadWarnings, setLoadWarnings] = useState([]);

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setLoadWarnings([]);
    const sources = [
      'entreprises clientes',
      'équipes',
      'orienteurs',
      'secteurs',
      'techniciens',
      'référentiel des grades',
      'comptes opérationnels',
    ];
    const results = await Promise.allSettled([
      isAdmin ? api.getV1Clients() : Promise.resolve({ data: [] }),
      api.getV1Teams(), api.getOrienteurs(), api.getSectors(), api.getTechnicians(),
      api.getBusinessCatalog(),
      isAdmin ? api.getV1Accounts() : Promise.resolve({ data: [] }),
    ]);
    setLoadWarnings(results.flatMap((result, index) => (
      result.status === 'rejected' ? [sources[index]] : []
    )));
    const value = (index) => results[index].status === 'fulfilled' ? results[index].value?.data || [] : [];
    setClients(value(0)); setTeams(value(1)); setOrienteurs(value(2)); setSectors(value(3)); setTechnicians(value(4));
    if (results[5].status === 'fulfilled') {
      const configured = (results[5].value?.data?.values?.technician_grades || [])
        .filter((item) => item.active);
      if (configured.length) setGrades(configured);
    }
    setAccounts(value(6));
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
    const form = event.currentTarget;
    try {
      await api.createV1Account({
        username: form.username.value.trim(),
        email: form.email.value.trim(),
        password: form.password.value,
        role: form.role.value,
        technician_id: form.technician_id.value ? Number(form.technician_id.value) : null,
        orienteur_id: form.orienteur_id.value ? Number(form.orienteur_id.value) : null,
      });
      form.reset(); await load(); toast?.('Compte opérationnel créé.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const toggleAccount = async (account) => {
    try {
      await api.updateV1Account(account.id, { is_active: !account.is_active });
      await load(); toast?.('Accès du compte mis à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const resetAccountPassword = async (event, accountId) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api.resetV1AccountPassword(accountId, { password: form.password.value });
      form.reset(); toast?.('Mot de passe remplacé. Transmettez-le par un canal sûr.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const updateClientConfiguration = async (event, clientId) => {
    event.preventDefault();
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
    try {
      await api.putV1TeamTechnician(teamId, technicianId, { grade });
      await load(); toast?.('Technicien déplacé dans l’équipe.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const updateTeamConfiguration = async (event, teamId) => {
    event.preventDefault();
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
    try {
      await api.removeV1TeamTechnician(teamId, technicianId);
      await load(); toast?.('Technicien retiré de l’équipe.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const toggleClient = async (client) => {
    try {
      await api.updateV1Client(client.id, { is_active: !client.is_active });
      await load(); toast?.('Entreprise mise à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  const toggleTeam = async (team) => {
    try {
      await api.updateV1Team(team.id, { is_active: !team.is_active });
      await load(); toast?.('Équipe mise à jour.', 'success');
    } catch (error) { toast?.(message(error), 'error'); }
  };

  if (!enabled) return null;
  if (loading) return <div className="v1-admin-loading">Chargement de l’organisation réelle…</div>;

  return (
    <div className="v1-admin-grid">
      {loadWarnings.length > 0 ? (
        <div className="v1-admin-load-warning" role="alert">
          <div>
            <strong>Configuration partiellement chargée</strong>
            <span>Indisponible : {loadWarnings.join(', ')}. Les autres données restent utilisables.</span>
          </div>
          <button type="button" onClick={load}>Réessayer</button>
        </div>
      ) : null}
      {isAdmin ? <section className="v1-admin-card">
        <header><span>Donneurs d’ordre</span><h2>Entreprises clientes</h2></header>
        <form onSubmit={createClient} className="v1-admin-form">
          <input name="name" required placeholder="Nom · Maroc Telecom" />
          <input name="code" required placeholder="Code · IAM" />
          <input name="operator" placeholder="Opérateur associé · IAM" />
          <button type="submit">Ajouter l’entreprise</button>
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
                <button type="submit">Enregistrer</button>
              </form>
            </details>
            <button type="button" onClick={() => toggleClient(client)}>{client.is_active ? 'Archiver / couper l’accès' : 'Réactiver'}</button>
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
          <select name="role" required defaultValue=""><option value="" disabled>Rôle</option><option value="ADMIN">Administrateur</option><option value="CHEF_ORIENTEUR">Chef orienteur</option><option value="ORIENTEUR">Orienteur</option><option value="TECHNICIAN">Technicien</option></select>
          <select name="orienteur_id" defaultValue=""><option value="">Profil orienteur si nécessaire</option>{orienteurs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="technician_id" defaultValue=""><option value="">Profil technicien si nécessaire</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <button type="submit">Créer le compte</button>
        </form>
        <div className="v1-admin-account-grid">
          {accounts.map((account) => <article key={account.id} className={account.is_active ? '' : 'is-archived'}>
            <div><strong>{account.username}</strong><span>{account.role} · {account.email}</span></div>
            <button type="button" onClick={() => toggleAccount(account)}>{account.is_active ? 'Désactiver' : 'Réactiver'}</button>
            <details><summary>Réinitialiser le mot de passe</summary><form onSubmit={(event) => resetAccountPassword(event, account.id)}><input name="password" type="password" minLength="12" required placeholder="Nouveau mot de passe" /><button type="submit">Remplacer</button></form></details>
          </article>)}
        </div>
      </section> : null}

      {isAdmin ? <section className="v1-admin-card">
        <header><span>Accès externe</span><h2>Compte client lecture seule</h2></header>
        <form onSubmit={createClientAccount} className="v1-admin-form">
          <select name="organization_id" required defaultValue=""><option value="" disabled>Entreprise</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>
          <input name="username" required placeholder="Identifiant" />
          <input name="email" type="email" required placeholder="Email" />
          <input name="password" type="password" minLength="12" required placeholder="Mot de passe initial · 12 caractères" />
          <button type="submit">Créer le compte</button>
        </form>
      </section> : null}

      <section className="v1-admin-card v1-admin-card--wide">
        <header><span>Organisation terrain</span><h2>Équipes, orienteurs et secteurs</h2></header>
        <form onSubmit={createTeam} className="v1-admin-form v1-admin-form--team">
          <input name="name" required placeholder="Nom de l’équipe" />
          <input name="code" placeholder="Code (optionnel)" />
          <select name="orienteur_id" required defaultValue=""><option value="" disabled>Orienteur unique</option>{orienteurs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="initial_technician_id" required defaultValue=""><option value="" disabled>Premier technicien</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select name="initial_grade" required defaultValue={grades[0]?.code || 'junior'}>{grades.map((grade) => <option key={grade.code} value={grade.code}>{grade.label}</option>)}</select>
          <fieldset><legend>Un ou plusieurs secteurs</legend>{sectors.map((sector) => <label key={sector.id}><input type="checkbox" name="sector_ids" value={sector.id} />{sector.name}</label>)}</fieldset>
          <button type="submit">Créer l’équipe</button>
        </form>
        <div className="v1-admin-team-grid">
          {teams.map((team) => (
            <article key={team.id}>
              <h3>{team.name}</h3><p>{team.orienteur_name} · {team.sector_names.join(', ')}</p>
              <details className="v1-admin-inline-editor">
                <summary>Modifier l’équipe</summary>
                <form onSubmit={(event) => updateTeamConfiguration(event, team.id)} className="v1-admin-form v1-admin-form--team-edit">
                  <input name="name" required defaultValue={team.name} aria-label="Nom de l’équipe" />
                  <input name="code" defaultValue={team.code || ''} placeholder="Code (optionnel)" aria-label="Code de l’équipe" />
                  <select name="orienteur_id" required defaultValue={String(team.orienteur_id)} aria-label="Orienteur de l’équipe">{orienteurs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                  <fieldset><legend>Secteurs de l’équipe</legend>{sectors.map((sector) => <label key={`${team.id}-${sector.id}`}><input type="checkbox" name="sector_ids" value={sector.id} defaultChecked={team.sector_ids.includes(sector.id)} />{sector.name}</label>)}</fieldset>
                  <button type="submit">Enregistrer l’équipe</button>
                </form>
              </details>
              <div className="v1-admin-chip-row">{team.technicians.map((tech) => <span key={tech.id}>{tech.name} · {tech.grade}<button type="button" aria-label={`Retirer ${tech.name}`} onClick={() => removeTechnician(team.id, tech.id)}>×</button></span>)}</div>
              <div className="v1-admin-team-add">
                <select disabled={!team.is_active} defaultValue="" onChange={(event) => { const [id, grade] = event.target.value.split(':'); if (id) assignTechnician(team.id, Number(id), grade); event.target.value = ''; }}>
                  <option value="">Déplacer/ajouter un technicien…</option>
                  {technicians.flatMap((tech) => grades.map((grade) => <option key={`${team.id}-${tech.id}-${grade.code}`} value={`${tech.id}:${grade.code}`}>{tech.name} · {grade.label}</option>))}
                </select>
                <button type="button" className="v1-admin-quiet-button" onClick={() => toggleTeam(team)}>{team.is_active ? 'Archiver l’équipe' : 'Réactiver l’équipe'}</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}