import { useMemo, useState } from 'react';

import { feedbackApi } from '../api/feedback';
import './feedback-launcher.css';

const TYPES = [
  ['BUG', 'Erreur'],
  ['DATA', 'Donnée incorrecte'],
  ['UX', 'Problème d’utilisation'],
  ['IDEA', 'Idée'],
  ['OTHER', 'Autre'],
];

const SEVERITIES = [
  ['LOW', 'Faible'],
  ['NORMAL', 'Normale'],
  ['HIGH', 'Haute'],
  ['BLOCKING', 'Bloquante'],
];

function messageFrom(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return 'Impossible d’envoyer le signalement.';
}

export default function FeedbackLauncher({ currentPage, userRole }) {
  const [open, setOpen] = useState(false);
  const [ticketType, setTicketType] = useState('BUG');
  const [severity, setSeverity] = useState('NORMAL');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdId, setCreatedId] = useState('');

  const valid = useMemo(
    () => title.trim().length >= 3 && description.trim().length >= 3,
    [description, title],
  );

  const close = () => {
    if (saving) return;
    setOpen(false);
    setError('');
    setCreatedId('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await feedbackApi.create({
        ticket_type: ticketType,
        severity,
        title: title.trim(),
        description: description.trim(),
        page: currentPage || null,
        context_json: {
          path: window.location.pathname,
          role: userRole || null,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          captured_at: new Date().toISOString(),
        },
      });
      setCreatedId(response?.data?.public_id || 'créé');
      setTitle('');
      setDescription('');
      setTicketType('BUG');
      setSeverity('NORMAL');
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="feedback-launcher-button"
        onClick={() => setOpen(true)}
        aria-label="Signaler un problème ou proposer une idée"
        title="Signaler un problème"
      >
        <span aria-hidden="true">!</span>
        <strong>Signaler</strong>
      </button>

      {open ? (
        <div className="feedback-launcher-backdrop" role="presentation" onMouseDown={close}>
          <section
            className="feedback-launcher-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-launcher-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>QUALITÉ PRODUIT</small>
                <h2 id="feedback-launcher-title">Signaler à l’administrateur</h2>
                <p>Le contexte de la page est joint automatiquement au ticket.</p>
              </div>
              <button type="button" onClick={close} aria-label="Fermer">×</button>
            </header>

            {createdId ? (
              <div className="feedback-launcher-success" role="status">
                Ticket <strong>{createdId}</strong> enregistré. Il est maintenant traçable par l’administration.
              </div>
            ) : null}
            {error ? <div className="feedback-launcher-error" role="alert">{error}</div> : null}

            <form onSubmit={submit}>
              <div className="feedback-launcher-grid">
                <label>
                  <span>Type</span>
                  <select value={ticketType} onChange={(event) => setTicketType(event.target.value)}>
                    {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Priorité</span>
                  <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                    {SEVERITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>

              <label>
                <span>Titre</span>
                <input
                  value={title}
                  maxLength={180}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex. Le stock du technicien n’est pas actualisé"
                  autoFocus
                />
              </label>

              <label>
                <span>Description</span>
                <textarea
                  value={description}
                  maxLength={10000}
                  rows={6}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Décrivez ce que vous faisiez, ce qui s’est produit et ce que vous attendiez."
                />
              </label>

              <div className="feedback-launcher-context">
                Contexte : <strong>{currentPage || 'application'}</strong> · rôle {userRole || 'interne'}
              </div>

              <footer>
                <button type="button" className="btn" onClick={close} disabled={saving}>Annuler</button>
                <button type="submit" className="btn btn--primary" disabled={!valid || saving}>
                  {saving ? 'Envoi…' : 'Créer le ticket'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
