import { useCallback, useEffect, useMemo, useState } from 'react';

import { feedbackApi } from '../api/feedback';
import './feedback-center.css';

const STATUS_OPTIONS = [
  ['OPEN', 'Ouvert'],
  ['IN_PROGRESS', 'En cours'],
  ['RESOLVED', 'Résolu'],
  ['CLOSED', 'Fermé'],
];

const SEVERITY_OPTIONS = [
  ['LOW', 'Faible'],
  ['NORMAL', 'Normale'],
  ['HIGH', 'Haute'],
  ['BLOCKING', 'Bloquante'],
];

function text(value) {
  return value == null ? '' : String(value).trim();
}

function messageFrom(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return fallback;
}

function ticketKey(ticket) {
  return ticket?.id ?? ticket?.public_id ?? '';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export default function FeedbackCenter({ userRole = 'ADMIN' }) {
  const isAdmin = text(userRole).toUpperCase() === 'ADMIN';
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await feedbackApi.list(statusFilter ? { status: statusFilter } : {});
      const data = response?.data;
      const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setTickets(rows);
      setSelectedId((current) => {
        if (current && rows.some((ticket) => ticketKey(ticket) === current)) return current;
        return rows.length ? ticketKey(rows[0]) : null;
      });
    } catch (loadError) {
      setError(messageFrom(loadError, 'Impossible de charger les tickets.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleTickets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tickets;
    return tickets.filter((ticket) => [
      ticket?.public_id,
      ticket?.title,
      ticket?.description,
      ticket?.page,
      ticket?.ticket_type,
      ticket?.status,
    ].some((value) => text(value).toLowerCase().includes(needle)));
  }, [query, tickets]);

  const selected = useMemo(
    () => tickets.find((ticket) => ticketKey(ticket) === selectedId) || null,
    [selectedId, tickets],
  );

  const patchSelected = async (document) => {
    if (!selected?.id || !isAdmin || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await feedbackApi.update(selected.id, document);
      const updated = response?.data;
      setTickets((current) => current.map((ticket) => (
        ticket.id === selected.id ? { ...ticket, ...updated } : ticket
      )));
    } catch (saveError) {
      setError(messageFrom(saveError, 'Impossible de mettre à jour le ticket.'));
    } finally {
      setSaving(false);
    }
  };

  const addComment = async (event) => {
    event.preventDefault();
    const body = comment.trim();
    if (!body || !selected?.id || saving) return;
    setSaving(true);
    setError('');
    try {
      await feedbackApi.comment(selected.id, body);
      setComment('');
      const response = await feedbackApi.get(selected.id);
      const updated = response?.data;
      setTickets((current) => current.map((ticket) => (
        ticket.id === selected.id ? updated : ticket
      )));
    } catch (commentError) {
      setError(messageFrom(commentError, 'Impossible d’ajouter le commentaire.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="feedback-center" aria-label="Tickets qualité BlueVector">
      <header className="feedback-center__header">
        <div>
          <small>QUALITÉ PRODUIT</small>
          <h3>{isAdmin ? 'Tickets & retours utilisateurs' : 'Mes tickets'}</h3>
          <p>{isAdmin
            ? 'Centralisez les erreurs, anomalies de données, problèmes UX et idées remontés depuis l’application.'
            : 'Suivez les signalements que vous avez transmis à l’administration.'}</p>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading || saving}>Actualiser</button>
      </header>

      <div className="feedback-center__toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un ticket, une page, un problème…"
          aria-label="Rechercher dans les tickets"
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {error ? <div className="feedback-center__error" role="alert">{error}</div> : null}

      <div className="feedback-center__workspace">
        <aside className="feedback-center__list" aria-label="Liste des tickets">
          {loading ? <p className="feedback-center__empty">Chargement…</p> : null}
          {!loading && visibleTickets.length === 0 ? <p className="feedback-center__empty">Aucun ticket pour ces critères.</p> : null}
          {visibleTickets.map((ticket) => (
            <button
              type="button"
              key={ticketKey(ticket)}
              className={ticketKey(ticket) === selectedId ? 'feedback-ticket is-active' : 'feedback-ticket'}
              onClick={() => setSelectedId(ticketKey(ticket))}
            >
              <span className={`feedback-ticket__severity severity-${text(ticket.severity).toLowerCase()}`} />
              <span className="feedback-ticket__body">
                <span className="feedback-ticket__meta">{ticket.public_id || `#${ticket.id}`} · {ticket.ticket_type || 'OTHER'}</span>
                <strong>{ticket.title || 'Sans titre'}</strong>
                <span>{ticket.page || 'application'} · {formatDate(ticket.created_at)}</span>
              </span>
              <span className="feedback-ticket__status">{ticket.status || 'OPEN'}</span>
            </button>
          ))}
        </aside>

        <article className="feedback-center__detail">
          {!selected ? <div className="feedback-center__empty">Sélectionnez un ticket pour afficher son détail.</div> : (
            <>
              <header>
                <div>
                  <small>{selected.public_id || `#${selected.id}`} · {selected.ticket_type || 'OTHER'}</small>
                  <h4>{selected.title}</h4>
                  <p>{selected.description}</p>
                </div>
                <div className="feedback-center__facts">
                  <span>Page <strong>{selected.page || 'application'}</strong></span>
                  <span>Créé <strong>{formatDate(selected.created_at)}</strong></span>
                  <span>Auteur <strong>{selected.created_by_name || selected.created_by_id || 'Utilisateur'}</strong></span>
                </div>
              </header>

              {isAdmin ? (
                <div className="feedback-center__admin-controls">
                  <label>
                    <span>Statut</span>
                    <select value={selected.status || 'OPEN'} disabled={saving} onChange={(event) => patchSelected({ status: event.target.value })}>
                      {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Priorité</span>
                    <select value={selected.severity || 'NORMAL'} disabled={saving} onChange={(event) => patchSelected({ severity: event.target.value })}>
                      {SEVERITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="feedback-center__comments">
                <h5>Conversation</h5>
                {(selected.comments || []).length === 0 ? <p className="feedback-center__empty">Aucun commentaire pour le moment.</p> : null}
                {(selected.comments || []).map((entry) => (
                  <div className="feedback-comment" key={entry.id || `${entry.created_at}-${entry.body}`}>
                    <div><strong>{entry.author_name || entry.author_id || 'Utilisateur'}</strong><span>{formatDate(entry.created_at)}</span></div>
                    <p>{entry.body}</p>
                  </div>
                ))}
                <form onSubmit={addComment}>
                  <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ajouter une précision ou une réponse…" />
                  <button type="submit" className="btn btn--primary" disabled={!comment.trim() || saving}>{saving ? 'Enregistrement…' : 'Ajouter le commentaire'}</button>
                </form>
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
