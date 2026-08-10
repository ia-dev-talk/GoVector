import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_VISIBLE_MESSAGES = 60;

const INITIAL_MESSAGE =
  'Bonjour. Je peux analyser les interventions, les secteurs, ' +
  'la disponibilité des techniciens et les indicateurs du cockpit.';

const TECH_STATUS_LABELS = {
  available: 'disponible',
  disponible: 'disponible',
  on_job: 'en intervention',
  en_intervention: 'en intervention',
  in_progress: 'en intervention',
  en_route: 'en route',
  on_break: 'en pause',
  pause: 'en pause',
  off_duty: 'hors service',
  hors_service: 'hors service',
};

const ACTIVE_TECH_STATUSES = new Set([
  'available',
  'disponible',
  'on_job',
  'en_intervention',
  'in_progress',
  'en_route',
]);

const STYLES = {
  fab: {
    width: 48,
    height: 48,
    right: 'max(16px, env(safe-area-inset-right))',
    bottom: 'max(16px, env(safe-area-inset-bottom))',
    borderRadius: 10,
    border: '1px solid var(--color-accent)',
    color: 'var(--color-accent)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.38)',
    fontSize: 0,
  },
  panel: {
    width: 'min(390px, calc(100vw - 24px))',
    height: 'min(540px, calc(100dvh - 92px))',
    maxHeight: 'calc(100dvh - 92px)',
    right: 'max(12px, env(safe-area-inset-right))',
    bottom: 'max(76px, calc(env(safe-area-inset-bottom) + 76px))',
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: 'var(--surface-panel)',
    boxShadow: '0 14px 42px rgba(0, 0, 0, 0.58)',
    color: 'var(--text-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
    minHeight: 54,
    padding: 'var(--space-md) var(--space-lg)',
    borderBottom: '1px solid var(--border-color)',
    background: 'var(--surface-header)',
    color: 'var(--text-primary)',
  },
  assistantIcon: {
    width: 32,
    height: 32,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    borderRadius: 6,
    border: '1px solid var(--color-accent)',
    background: 'var(--color-accent-dim)',
    color: 'var(--color-accent)',
    fontSize: 0,
  },
  headerButton: {
    width: 30,
    height: 30,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  messages: {
    minHeight: 0,
    padding: 'var(--space-lg)',
    gap: 'var(--space-md)',
    background: 'var(--surface-app)',
    scrollbarColor: 'var(--surface-divider) transparent',
  },
  inputArea: {
    alignItems: 'flex-end',
    padding: 'var(--space-md)',
    borderTop: '1px solid var(--border-color)',
    background: 'var(--surface-header)',
  },
  textarea: {
    width: '100%',
    minHeight: 54,
    maxHeight: 120,
    borderRadius: 5,
    border: '1px solid var(--border-color)',
    background: 'var(--surface-input)',
    color: 'var(--text-primary)',
    fontSize: 'var(--font-size-sm)',
    lineHeight: 1.4,
    caretColor: 'var(--color-accent)',
  },
  sendButton: {
    minHeight: 34,
    padding: '7px 12px',
    borderRadius: 5,
    border: '1px solid var(--color-accent)',
    background: 'var(--color-accent-dim)',
    color: 'var(--color-accent)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    transform: 'none',
  },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
};

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function comparable(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function status(value) {
  return comparable(value).replace(/\s+/g, '_').replace(/-/g, '_');
}

function sameId(first, second) {
  return (
    first !== null &&
    first !== undefined &&
    second !== null &&
    second !== undefined &&
    text(first) !== '' &&
    text(second) !== '' &&
    String(first) === String(second)
  );
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function jobStatus(job) {
  return status(job?.status ?? job?.job_status ?? job?.state);
}

function technicianStatus(technician) {
  return status(
    technician?.live_status ??
      technician?.status ??
      technician?.technician_status,
  );
}

function technicianName(technician) {
  return text(
    technician?.name ??
      technician?.full_name ??
      technician?.username,
  );
}

function assignedTechnicianId(job) {
  return (
    job?.technician_id ??
    job?.assigned_to ??
    job?.assigned_technician_id ??
    job?.assignment?.technician_id ??
    null
  );
}

function sectorName(job) {
  const direct =
    job?.sector_name ??
    job?.sector_label ??
    job?.route_criteria ??
    job?.zone_name ??
    job?.zone;

  if (typeof direct === 'string' || typeof direct === 'number') {
    return text(direct);
  }

  const sector = isRecord(job?.sector)
    ? job.sector
    : isRecord(direct)
      ? direct
      : null;

  return sector ? text(sector.name ?? sector.label ?? sector.code) : '';
}

function skills(technician) {
  const raw =
    technician?.skills ??
    technician?.specialties ??
    technician?.competences;

  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];

  const result = [];
  const known = new Set();

  values.forEach((item) => {
    const value = isRecord(item)
      ? text(item.name ?? item.label ?? item.skill ?? item.code)
      : text(item);

    const key = comparable(value);
    if (!key || known.has(key)) return;

    known.add(key);
    result.push(value);
  });

  return result;
}

function coordinates(technician) {
  const latitude = numberOrNull(
    technician?.current_latitude ?? technician?.latitude ?? technician?.lat,
  );
  const longitude = numberOrNull(
    technician?.current_longitude ??
      technician?.longitude ??
      technician?.lng ??
      technician?.lon,
  );

  return latitude === null || longitude === null
    ? null
    : { latitude, longitude };
}

function technicianStatusLabel(value) {
  return (
    TECH_STATUS_LABELS[value] ||
    text(value).replace(/_/g, ' ') ||
    'statut inconnu'
  );
}

function apiStatus(error) {
  const parsed = Number(error?.response?.status);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripSimpleMarkdown(value) {
  return text(value)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

function createMessage(id, role, content, source = 'api', sourceLabel = '') {
  return {
    id,
    role,
    content: text(content) || 'Aucune réponse disponible.',
    source,
    sourceLabel: text(sourceLabel),
  };
}

function mentionedTechnician(question, technicians) {
  const normalizedQuestion = comparable(question);
  let bestMatch = null;
  let bestScore = 0;

  technicians.forEach((technician) => {
    const normalizedName = comparable(technicianName(technician));
    if (!normalizedName) return;

    let score = normalizedQuestion.includes(normalizedName)
      ? normalizedName.length + 100
      : 0;

    if (!score) {
      normalizedName
        .split(/\s+/)
        .filter((token) => token.length >= 3)
        .forEach((token) => {
          if (normalizedQuestion.includes(token)) {
            score = Math.max(score, token.length);
          }
        });
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = technician;
    }
  });

  return bestMatch;
}

function localResponse(question, jobsValue, techniciansValue) {
  const jobs = asRecords(jobsValue);
  const technicians = asRecords(techniciansValue);
  const normalizedQuestion = comparable(question);
  const technician = mentionedTechnician(question, technicians);

  const asksLocation =
    normalizedQuestion.includes('ou est') ||
    normalizedQuestion.includes('position') ||
    normalizedQuestion.includes('localis');

  if (asksLocation && technician) {
    const name = technicianName(technician) || 'Ce technicien';
    const gps = coordinates(technician);
    const currentStatus = technicianStatusLabel(technicianStatus(technician));

    return gps
      ? `${name} est localisé à ${gps.latitude}, ${gps.longitude}. ` +
          `Statut actuel : ${currentStatus}.`
      : `${name} n’a pas de position GPS disponible. ` +
          `Statut actuel : ${currentStatus}.`;
  }

  if (technician) {
    const technicianId = technician.id ?? technician.technician_id;
    const assignedJobs = jobs.filter((job) =>
      sameId(assignedTechnicianId(job), technicianId),
    );
    const name = technicianName(technician) || 'Ce technicien';
    const currentStatus = technicianStatusLabel(technicianStatus(technician));
    const declaredSkills = skills(technician);

    const lines = [
      `${name} : ${currentStatus}.`,
      `${assignedJobs.length} intervention(s) visible(s) dans le cockpit.`,
    ];

    if (declaredSkills.length) {
      lines.push(`Compétences déclarées : ${declaredSkills.join(', ')}.`);
    }

    return lines.join('\n');
  }

  if (
    normalizedQuestion.includes('secteur') ||
    normalizedQuestion.includes('zone') ||
    normalizedQuestion.includes('touche') ||
    normalizedQuestion.includes('panne')
  ) {
    const counts = new Map();

    jobs.forEach((job) => {
      const sector = sectorName(job);
      if (!sector) return;

      const key = comparable(sector);
      const current = counts.get(key);

      counts.set(key, {
        label: current?.label || sector,
        count: (current?.count || 0) + 1,
      });
    });

    const ranking = Array.from(counts.values()).sort(
      (first, second) => second.count - first.count,
    );

    if (!ranking.length) {
      return (
        'Aucun secteur exploitable n’est renseigné ' +
        `dans les ${jobs.length} intervention(s) visibles.`
      );
    }

    return (
      `Secteur le plus représenté : ${ranking[0].label}, ` +
      `${ranking[0].count} intervention(s) sur ${jobs.length}.`
    );
  }

  if (
    normalizedQuestion.includes('stat') ||
    normalizedQuestion.includes('kpi') ||
    normalizedQuestion.includes('combien') ||
    normalizedQuestion.includes('production') ||
    normalizedQuestion.includes('intervention')
  ) {
    const counts = {
      pending: 0,
      assigned: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0,
    };

    jobs.forEach((job) => {
      const currentStatus = jobStatus(job);

      if (['pending', 'en_attente', 'non_affectee', 'unassigned'].includes(currentStatus)) {
        counts.pending += 1;
      } else if (['assigned', 'affectee'].includes(currentStatus)) {
        counts.assigned += 1;
      } else if (['in_progress', 'en_cours'].includes(currentStatus)) {
        counts.inProgress += 1;
      } else if (['completed', 'terminee'].includes(currentStatus)) {
        counts.completed += 1;
      } else if (['cancelled', 'canceled', 'annulee'].includes(currentStatus)) {
        counts.cancelled += 1;
      }
    });

    const activeTechnicians = technicians.filter((item) =>
      ACTIVE_TECH_STATUSES.has(technicianStatus(item)),
    ).length;

    return [
      `Interventions visibles : ${jobs.length}.`,
      `En attente : ${counts.pending}.`,
      `Affectées : ${counts.assigned}.`,
      `En cours : ${counts.inProgress}.`,
      `Terminées : ${counts.completed}.`,
      `Annulées : ${counts.cancelled}.`,
      `Techniciens actifs : ${activeTechnicians} sur ${technicians.length}.`,
    ].join('\n');
  }

  if (
    normalizedQuestion.includes('technicien') ||
    normalizedQuestion.includes('disponible') ||
    normalizedQuestion.includes('pause') ||
    normalizedQuestion.includes('hors service') ||
    normalizedQuestion.includes('performance')
  ) {
    if (!technicians.length) {
      return 'Aucun technicien n’est visible dans le contexte actuel.';
    }

    const counts = new Map();

    technicians.forEach((item) => {
      const label = technicianStatusLabel(technicianStatus(item));
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return [
      `Techniciens visibles : ${technicians.length}.`,
      ...Array.from(counts.entries())
        .sort((first, second) => second[1] - first[1])
        .map(([label, count]) => `${label} : ${count}.`),
    ].join('\n');
  }

  if (
    normalizedQuestion.includes('bonjour') ||
    normalizedQuestion.includes('salut') ||
    normalizedQuestion.includes('bonsoir')
  ) {
    return (
      'Bonjour. Posez une question sur les interventions, ' +
      'les secteurs, les techniciens ou les indicateurs du cockpit.'
    );
  }

  return (
    'Je peux analyser les données actuellement visibles dans le cockpit :\n' +
    '• nombre et statut des interventions ;\n' +
    '• secteur le plus représenté ;\n' +
    '• disponibilité des techniciens ;\n' +
    '• interventions et position d’un technicien nommé.'
  );
}

function jobContext(jobsValue) {
  return asRecords(jobsValue).map((job) => ({
    id: job.id ?? job.job_id ?? null,
    status: job.status ?? job.job_status ?? null,
    sector: sectorName(job) || null,
    technician_id: assignedTechnicianId(job),
    scheduled_date: job.scheduled_date ?? job.date ?? null,
  }));
}

function technicianContext(techniciansValue) {
  return asRecords(techniciansValue).map((technician) => {
    const gps = coordinates(technician);

    return {
      id: technician.id ?? technician.technician_id ?? null,
      name: technicianName(technician) || null,
      status: technician.live_status ?? technician.status ?? null,
      is_active: technician.is_active !== false,
      current_latitude: gps?.latitude ?? null,
      current_longitude: gps?.longitude ?? null,
      skills: skills(technician),
    };
  });
}

function AssistantMark({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x="3" y="5" width="18" height="15" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 2.5v3M16 2.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" />
      <path d="M9 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5.5A5.5 5.5 0 1 1 2.8 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 2.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AIAssistant({ jobs = [], technicians = [] }) {
  const panelId = useId();
  const inputId = useId();

  const mountedRef = useRef(false);
  const fabRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(1);
  const requestIdRef = useRef(0);
  const sendingRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    createMessage(1, 'assistant', INITIAL_MESSAGE, 'system'),
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const safeJobs = useMemo(() => asRecords(jobs), [jobs]);
  const safeTechnicians = useMemo(
    () => asRecords(technicians),
    [technicians],
  );

  const nextMessageId = useCallback(() => {
    messageIdRef.current += 1;
    return messageIdRef.current;
  }, []);

  const appendMessage = useCallback((message) => {
    setMessages((previous) => {
      const next = [...previous, message];

      return next.length <= MAX_VISIBLE_MESSAGES
        ? next
        : [next[0], ...next.slice(-(MAX_VISIBLE_MESSAGES - 1))];
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!open) return;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    messagesEndRef.current?.scrollIntoView({
      block: 'end',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [open]);

  const closeAssistant = useCallback((restoreFocus = true) => {
    setOpen(false);

    if (restoreFocus) {
      window.requestAnimationFrame(() => fabRef.current?.focus());
    }
  }, []);

  const resetConversation = useCallback(() => {
    requestIdRef.current += 1;
    sendingRef.current = false;
    setSending(false);
    setInput('');
    setMessages([
      createMessage(nextMessageId(), 'assistant', INITIAL_MESSAGE, 'system'),
    ]);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }, [nextMessageId]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      sendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      scrollToBottom();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom, sending]);

  const handleSend = useCallback(async () => {
    const question = input.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!question || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setInput('');

    appendMessage(
      createMessage(nextMessageId(), 'user', question, 'user'),
    );

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const response = await api.aiChat({
        message: question,
        context: {
          jobs: jobContext(safeJobs),
          technicians: technicianContext(safeTechnicians),
        },
      });

      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      const content = text(
        response?.data?.response ?? response?.data?.message,
      );

      if (content) {
        appendMessage(
          createMessage(nextMessageId(), 'assistant', content),
        );
      } else {
        appendMessage(
          createMessage(
            nextMessageId(),
            'assistant',
            localResponse(question, safeJobs, safeTechnicians),
            'local',
            'Réponse locale',
          ),
        );
      }
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      const responseStatus = apiStatus(error);

      if (responseStatus === 401 || responseStatus === 403) {
        appendMessage(
          createMessage(
            nextMessageId(),
            'assistant',
            'La session ne permet plus d’utiliser le service IA. ' +
              'Reconnectez-vous puis réessayez.',
            'error',
            'Session',
          ),
        );
      } else {
        appendMessage(
          createMessage(
            nextMessageId(),
            'assistant',
            localResponse(question, safeJobs, safeTechnicians),
            'local',
            responseStatus === 429
              ? 'Service limité — réponse locale'
              : 'Service indisponible — réponse locale',
          ),
        );
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }, [
    appendMessage,
    input,
    nextMessageId,
    safeJobs,
    safeTechnicians,
  ]);

  const normalizedInput = input.slice(0, MAX_MESSAGE_LENGTH);

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="ai-fab"
        onClick={() => setOpen((previous) => !previous)}
        aria-label={
          open
            ? 'Fermer l’assistant opérationnel'
            : 'Ouvrir l’assistant opérationnel'
        }
        aria-expanded={open}
        aria-controls={panelId}
        title="Assistant opérationnel FTTH"
        style={{
          ...STYLES.fab,
          background: open
            ? 'var(--surface-header)'
            : 'var(--color-accent-dim)',
        }}
      >
        {open ? <CloseIcon /> : <AssistantMark size={22} />}
      </button>

      {open && (
        <section
          id={panelId}
          className="ai-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${panelId}-title`}
          aria-describedby={`${panelId}-subtitle`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeAssistant();
            }
          }}
          style={STYLES.panel}
        >
          <header className="ai-header" style={STYLES.header}>
            <span className="ai-icon" aria-hidden="true" style={STYLES.assistantIcon}>
              <AssistantMark size={19} />
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                id={`${panelId}-title`}
                className="ai-header-title"
                style={{
                  margin: 0,
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-base)',
                  lineHeight: 1.3,
                }}
              >
                Assistant opérationnel
              </div>

              <div
                id={`${panelId}-subtitle`}
                className="ai-header-subtitle"
                style={{
                  marginTop: 2,
                  color: 'var(--text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  opacity: 1,
                }}
              >
                Analyse du contexte FTTH visible
              </div>
            </div>

            <button
              type="button"
              className="fw-close"
              onClick={resetConversation}
              disabled={sending}
              aria-label="Réinitialiser la conversation"
              title="Réinitialiser"
              style={STYLES.headerButton}
            >
              <ResetIcon />
            </button>

            <button
              type="button"
              className="fw-close"
              onClick={() => closeAssistant()}
              aria-label="Fermer l’assistant"
              title="Fermer"
              style={STYLES.headerButton}
            >
              <CloseIcon />
            </button>
          </header>

          <div
            className="ai-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="Conversation avec l’assistant"
            style={STYLES.messages}
          >
            {messages.map((message) => {
              const userMessage = message.role === 'user';

              return (
                <article
                  key={message.id}
                  className={`ai-message ai-message--${
                    userMessage ? 'user' : 'assistant'
                  }`}
                  aria-label={userMessage ? 'Vous' : 'Assistant'}
                  style={{ maxWidth: '88%' }}
                >
                  <div
                    className="ai-message-content"
                    style={{
                      padding: '9px 11px',
                      borderRadius: 7,
                      border: userMessage
                        ? '1px solid var(--color-accent)'
                        : '1px solid var(--border-color)',
                      borderBottomRightRadius: userMessage ? 2 : 7,
                      borderBottomLeftRadius: userMessage ? 7 : 2,
                      background: userMessage
                        ? 'var(--color-accent-dim)'
                        : 'var(--surface-panel-alt)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--font-size-sm)',
                      lineHeight: 1.45,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {message.sourceLabel && (
                      <div
                        style={{
                          marginBottom: 'var(--space-sm)',
                          color:
                            message.source === 'error'
                              ? 'var(--color-danger)'
                              : 'var(--text-muted)',
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {message.sourceLabel}
                      </div>
                    )}

                    {String(message.content ?? '')
                      .replace(/\r\n?/g, '\n')
                      .split('\n')
                      .map((line, index) => {
                        const cleaned = stripSimpleMarkdown(line);

                        return cleaned ? (
                          <p
                            key={`${message.id}-${index}`}
                            style={{ margin: index ? '5px 0 0' : 0 }}
                          >
                            {cleaned}
                          </p>
                        ) : (
                          <div
                            key={`${message.id}-${index}`}
                            aria-hidden="true"
                            style={{ height: 'var(--space-sm)' }}
                          />
                        );
                      })}
                  </div>
                </article>
              );
            })}

            {sending && (
              <div
                className="ai-message ai-message--assistant"
                role="status"
                aria-label="Analyse en cours"
                style={{ maxWidth: '88%' }}
              >
                <div
                  className="ai-message-content"
                  style={{
                    padding: '9px 11px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '7px 7px 7px 2px',
                    background: 'var(--surface-panel-alt)',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  <span
                    className="ai-typing"
                    style={{
                      color: 'var(--color-accent)',
                      fontStyle: 'normal',
                    }}
                  >
                    Analyse en cours…
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} aria-hidden="true" />
          </div>

          <form
            className="ai-input-area"
            onSubmit={(event) => {
              event.preventDefault();
              handleSend();
            }}
            style={STYLES.inputArea}
          >
            <label htmlFor={inputId} style={STYLES.visuallyHidden}>
              Question à l’assistant
            </label>

            <div style={{ minWidth: 0, flex: 1 }}>
              <textarea
                ref={textareaRef}
                id={inputId}
                value={normalizedInput}
                onChange={(event) =>
                  setInput(event.target.value.slice(0, MAX_MESSAGE_LENGTH))
                }
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent?.isComposing
                  ) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ex. Donne-moi les KPI du jour"
                rows={2}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={sending}
                aria-describedby={`${inputId}-help`}
                style={STYLES.textarea}
              />

              <div
                id={`${inputId}-help`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 'var(--space-md)',
                  marginTop: 3,
                  color: 'var(--text-muted)',
                  fontSize: 9,
                  lineHeight: 1.2,
                }}
              >
                <span>Entrée pour envoyer · Maj + Entrée pour une ligne</span>
                <span
                  aria-label={`${normalizedInput.length} caractères sur ${MAX_MESSAGE_LENGTH}`}
                  style={{
                    flexShrink: 0,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {normalizedInput.length}/{MAX_MESSAGE_LENGTH}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={!normalizedInput.trim() || sending}
              className="ai-send-btn"
              aria-label="Envoyer la question"
              aria-busy={sending}
              style={STYLES.sendButton}
            >
              Envoyer
            </button>
          </form>
        </section>
      )}
    </>
  );
}
