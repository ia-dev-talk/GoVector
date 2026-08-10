import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  api,
  FILES_URL,
} from '../api/client';
import {
  getJobTypeLabel,
} from '../lib/job-types';
import Button from './ui/Button';
import Card from './ui/Card';

const MAX_COMMENT_LENGTH = 2000;

const STATUS_LABELS = Object.freeze({
  pending: 'En attente',
  assigned: 'Affectée',
  en_route: 'En route',
  on_site: 'Sur site',
  work_in_progress:
    'Travail en cours',
  in_progress: 'En cours',
  installation_done:
    'Installation terminée',
  client_validation:
    'Validation client',
  en_attente_validation:
    'En attente de validation',
  completed: 'Terminée',
  cancelled: 'Annulée',
  on_hold: 'En attente',
  failed: 'Échec',
  client_absent:
    'Client absent',
  postponed: 'Reportée',
  suspended: 'Suspendue',
});

const ERROR_STYLE = Object.freeze({
  padding: '9px 11px',
  color: 'var(--color-danger)',
  background:
    'var(--color-danger-dim)',
  border:
    '1px solid var(--color-danger)',
  borderRadius: 5,
  fontSize:
    'var(--font-size-sm)',
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
});

const INFO_STYLE = Object.freeze({
  padding: '9px 11px',
  color: 'var(--color-info)',
  background:
    'var(--color-info-dim)',
  border:
    '1px solid var(--color-info)',
  borderRadius: 5,
  fontSize:
    'var(--font-size-sm)',
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
});

const SUCCESS_STYLE = Object.freeze({
  padding: '9px 11px',
  color: 'var(--color-success)',
  background:
    'var(--color-success-dim)',
  border:
    '1px solid var(--color-success)',
  borderRadius: 5,
  fontSize:
    'var(--font-size-sm)',
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
});

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return '';
  }

  return String(value).trim();
}

function normalizeStatus(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function displayValue(value) {
  return (
    normalizeText(value) ||
    '—'
  );
}

function getStatusLabel(value) {
  const normalized =
    normalizeStatus(value);

  if (!normalized) {
    return '—';
  }

  return (
    STATUS_LABELS[normalized] ||
    normalized
      .replace(/_/g, ' ')
      .replace(
        /^./,
        (character) =>
          character.toUpperCase(),
      )
  );
}

function getTechnicianName(job) {
  return normalizeText(
    job?.assigned_tech_name ??
      job?.assigned_technician_name ??
      job?.assignment
        ?.technician_name ??
      job?.assignment
        ?.technician?.name,
  );
}

function getJobTypeDisplay(value) {
  return (
    getJobTypeLabel(
      value,
      normalizeText(value)
        .replace(/_/g, ' ')
        .replace(
          /\b\w/g,
          (character) =>
            character.toUpperCase(),
        ),
    ) || '—'
  );
}

function formatNumber(
  value,
  suffix = '',
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return displayValue(value);
  }

  const formatted =
    new Intl.NumberFormat(
      'fr-FR',
      {
        maximumFractionDigits: 2,
      },
    ).format(parsed);

  return suffix
    ? `${formatted} ${suffix}`
    : formatted;
}

function buildFileUrl(value) {
  const path =
    normalizeText(value);

  if (!path) {
    return null;
  }

  try {
    const absolute =
      new URL(path);

    return (
      absolute.protocol ===
        'http:' ||
      absolute.protocol ===
        'https:'
    )
      ? absolute.toString()
      : null;
  } catch {
    const base =
      normalizeText(FILES_URL);

    if (!base) {
      return path.startsWith('/')
        ? path
        : `/${path}`;
    }

    try {
      const normalizedBase =
        base.endsWith('/')
          ? base
          : `${base}/`;

      const baseUrl =
        new URL(
          normalizedBase,
          window.location.origin,
        );

      return new URL(
        path.replace(/^\/+/, ''),
        baseUrl,
      ).toString();
    } catch {
      return null;
    }
  }
}

function getApiErrorMessage(
  error,
  fallback,
) {
  const detail =
    error?.response?.data
      ?.detail;

  if (
    typeof detail ===
      'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages =
      detail
        .map((item) =>
          isRecord(item)
            ? normalizeText(
                item.msg ??
                  item.message,
              )
            : normalizeText(item),
        )
        .filter(Boolean);

    if (messages.length) {
      return messages.join(' · ');
    }
  }

  const responseMessage =
    normalizeText(
      error?.response?.data
        ?.message,
    );

  if (responseMessage) {
    return responseMessage;
  }

  return (
    normalizeText(
      error?.message,
    ) ||
    fallback
  );
}

function appendReviewNote(
  existingNotes,
  marker,
  comment,
) {
  const existing =
    normalizeText(existingNotes);

  const line =
    `[${marker}] ` +
    normalizeText(comment);

  if (!existing) {
    return line;
  }

  if (
    existing
      .split('\n')
      .some(
        (item) =>
          item.trim() === line,
      )
  ) {
    return existing;
  }

  return `${existing}\n${line}`;
}

function DetailRow({
  label,
  value,
  mono = false,
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          'minmax(110px, 0.8fr) minmax(0, 1.2fr)',
        gap: 'var(--space-md)',
        padding: '7px 0',
        borderBottom:
          '1px solid var(--border-light)',
        fontSize:
          'var(--font-size-sm)',
        lineHeight: 1.35,
      }}
    >
      <span
        style={{
          color:
            'var(--text-muted)',
          overflowWrap:
            'anywhere',
        }}
      >
        {label}
      </span>

      <strong
        style={{
          minWidth: 0,
          color:
            'var(--text-primary)',
          fontFamily: mono
            ? 'var(--font-mono)'
            : undefined,
          fontWeight: 500,
          textAlign: 'right',
          overflowWrap:
            'anywhere',
        }}
      >
        {displayValue(value)}
      </strong>
    </div>
  );
}

function PhotoPreview({
  label,
  source,
}) {
  const url = buildFileUrl(
    source,
  );

  if (!url) {
    return null;
  }

  return (
    <figure
      style={{
        margin: 0,
        minWidth: 0,
      }}
    >
      <figcaption
        style={{
          marginBottom:
            'var(--space-sm)',
          color:
            'var(--text-secondary)',
          fontSize:
            'var(--font-size-xs)',
          fontWeight: 600,
        }}
      >
        {label}
      </figcaption>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'block',
          overflow: 'hidden',
          border:
            '1px solid var(--border-color)',
          borderRadius: 5,
          background:
            'var(--surface-input)',
        }}
      >
        <img
          src={url}
          alt={label}
          loading="lazy"
          style={{
            display: 'block',
            width: '100%',
            height: 150,
            objectFit: 'cover',
          }}
        />
      </a>
    </figure>
  );
}

export default function ValidationPanel({
  job,
  onClose,
  onValidated,
}) {
  const panelId = useId();
  const titleId =
    `${panelId}-title`;
  const commentId =
    `${panelId}-comment`;

  const panelRef = useRef(null);
  const closeButtonRef =
    useRef(null);
  const previousFocusRef =
    useRef(null);
  const requestSequenceRef =
    useRef(0);
  const persistedNotesRef =
    useRef(new Set());

  const [comment, setComment] =
    useState('');

  const [
    activeAction,
    setActiveAction,
  ] = useState(null);

  const [error, setError] =
    useState('');

  const [outcome, setOutcome] =
    useState(null);

  const validJob =
    isRecord(job) &&
    normalizeText(job.id);

  const busy =
    activeAction !== null;

  const beforePhoto =
    useMemo(
      () =>
        buildFileUrl(
          job?.before_photo,
        ),
      [job?.before_photo],
    );

  const afterPhoto =
    useMemo(
      () =>
        buildFileUrl(
          job?.after_photo,
        ),
      [job?.after_photo],
    );

  const normalizedComment =
    comment
      .trim()
      .slice(
        0,
        MAX_COMMENT_LENGTH,
      );

  const closePanel =
    useCallback(() => {
      if (busy) {
        return;
      }

      if (
        typeof onClose ===
        'function'
      ) {
        onClose();
      }
    }, [busy, onClose]);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement;

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      'hidden';

    const frameId =
      window.requestAnimationFrame(
        () => {
          closeButtonRef.current
            ?.focus();
        },
      );

    return () => {
      requestSequenceRef.current +=
        1;

      window.cancelAnimationFrame(
        frameId,
      );

      document.body.style.overflow =
        previousOverflow;

      window.requestAnimationFrame(
        () => {
          previousFocusRef.current
            ?.focus?.();
        },
      );
    };
  }, []);

  const handleDialogKeyDown =
    useCallback(
      (event) => {
        if (
          event.key ===
          'Escape'
        ) {
          event.preventDefault();
          closePanel();
          return;
        }

        if (
          event.key !== 'Tab' ||
          !panelRef.current
        ) {
          return;
        }

        const focusable =
          Array.from(
            panelRef.current
              .querySelectorAll(
                [
                  'button:not([disabled])',
                  'textarea:not([disabled])',
                  'a[href]',
                  '[tabindex]:not([tabindex="-1"])',
                ].join(','),
              ),
          );

        if (
          focusable.length === 0
        ) {
          event.preventDefault();
          panelRef.current.focus();
          return;
        }

        const first =
          focusable[0];

        const last =
          focusable[
            focusable.length - 1
          ];

        if (
          event.shiftKey &&
          document.activeElement ===
            first
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement ===
            last
        ) {
          event.preventDefault();
          first.focus();
        }
      },
      [closePanel],
    );

  const persistComment =
    useCallback(
      async (
        marker,
        required,
      ) => {
        if (
          required &&
          !normalizedComment
        ) {
          throw new Error(
            'Un commentaire est obligatoire pour demander une correction.',
          );
        }

        if (!normalizedComment) {
          return job;
        }

        const token =
          `${marker}:${normalizedComment}`;

        if (
          persistedNotesRef.current
            .has(token)
        ) {
          return job;
        }

        const nextNotes =
          appendReviewNote(
            job?.notes,
            marker,
            normalizedComment,
          );

        const response =
          await api.updateJob(
            job.id,
            {
              notes: nextNotes,
            },
          );

        persistedNotesRef.current.add(
          token,
        );

        return (
          response?.data ||
          job
        );
      },
      [
        job,
        normalizedComment,
      ],
    );

  const notifyAndClose =
    useCallback(
      async (
        action,
        data,
        metadata = {},
      ) => {
        if (
          typeof onValidated ===
          'function'
        ) {
          await Promise.resolve(
            onValidated(
              action,
              data,
              metadata,
            ),
          );
        }

        if (
          typeof onClose ===
          'function'
        ) {
          onClose();
        }
      },
      [onClose, onValidated],
    );

  const handleValidate =
    useCallback(async () => {
      if (
        busy ||
        outcome ||
        !validJob
      ) {
        return;
      }

      const requestSequence =
        requestSequenceRef.current +
        1;

      requestSequenceRef.current =
        requestSequence;

      setActiveAction(
        'validate',
      );
      setError('');

      let noteSaved = false;

      try {
        if (normalizedComment) {
          await persistComment(
            'VALIDATION ORIENTEUR',
            false,
          );

          noteSaved = true;
        }

        const response =
          await api.completeJob(
            job.id,
          );

        if (
          requestSequence !==
          requestSequenceRef.current
        ) {
          return;
        }

        const data =
          response?.data || job;

        try {
          await notifyAndClose(
            'validé',
            data,
            {
              statusChanged: true,
              status: 'completed',
            },
          );
        } catch (callbackError) {
          setOutcome({
            type: 'success',
            message:
              'L’intervention est validée, mais le rafraîchissement de l’écran a échoué. Vous pouvez fermer cette fenêtre.',
            detail:
              getApiErrorMessage(
                callbackError,
                '',
              ),
          });
        }
      } catch (requestError) {
        if (
          requestSequence !==
          requestSequenceRef.current
        ) {
          return;
        }

        const message =
          getApiErrorMessage(
            requestError,
            'Impossible de valider l’intervention.',
          );

        setError(
          noteSaved
            ? (
                'Le commentaire a été enregistré, mais la validation a échoué : ' +
                message
              )
            : message,
        );
      } finally {
        if (
          requestSequence ===
          requestSequenceRef.current
        ) {
          setActiveAction(null);
        }
      }
    }, [
      busy,
      job,
      normalizedComment,
      notifyAndClose,
      outcome,
      persistComment,
      validJob,
    ]);

  const handleCorrectionRequest =
    useCallback(async () => {
      if (
        busy ||
        outcome ||
        !validJob
      ) {
        return;
      }

      const requestSequence =
        requestSequenceRef.current +
        1;

      requestSequenceRef.current =
        requestSequence;

      setActiveAction(
        'correction',
      );
      setError('');

      try {
        const data =
          await persistComment(
            'CORRECTION ORIENTEUR',
            true,
          );

        if (
          requestSequence !==
          requestSequenceRef.current
        ) {
          return;
        }

        try {
          await notifyAndClose(
            'renvoyé',
            data,
            {
              statusChanged: false,
              status:
                normalizeStatus(
                  job.status,
                ),
              reason:
                normalizedComment,
            },
          );
        } catch (callbackError) {
          setOutcome({
            type: 'success',
            message:
              'La demande de correction est enregistrée dans les notes. Le statut n’a pas été modifié, mais le rafraîchissement de l’écran a échoué.',
            detail:
              getApiErrorMessage(
                callbackError,
                '',
              ),
          });
        }
      } catch (requestError) {
        if (
          requestSequence !==
          requestSequenceRef.current
        ) {
          return;
        }

        setError(
          getApiErrorMessage(
            requestError,
            'Impossible d’enregistrer la demande de correction.',
          ),
        );
      } finally {
        if (
          requestSequence ===
          requestSequenceRef.current
        ) {
          setActiveAction(null);
        }
      }
    }, [
      busy,
      job,
      normalizedComment,
      notifyAndClose,
      outcome,
      persistComment,
      validJob,
    ]);

  if (!validJob) {
    return null;
  }

  return (
    <div
      className="validation-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closePanel();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4100,
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          'center',
        padding:
          'max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left))',
        background:
          'var(--surface-overlay)',
        overflow: 'auto',
      }}
    >
      <section
        ref={panelRef}
        className="validation-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          error
            ? `${panelId}-error`
            : undefined
        }
        tabIndex="-1"
        onKeyDown={
          handleDialogKeyDown
        }
        style={{
          display: 'flex',
          flexDirection: 'column',
          width:
            'min(720px, 100%)',
          maxHeight:
            'min(90dvh, 820px)',
          minWidth: 0,
          overflow: 'hidden',
          color:
            'var(--text-primary)',
          background:
            'var(--surface-panel)',
          border:
            '1px solid var(--border-color)',
          borderRadius: 8,
          boxShadow:
            '0 18px 56px rgba(0,0,0,.62)',
        }}
      >
        <header
          className="fw-titlebar"
          style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 48,
            gap:
              'var(--space-md)',
            padding:
              '0 var(--space-lg)',
            background:
              'var(--surface-header)',
            borderBottom:
              '1px solid var(--border-color)',
          }}
        >
          <div
            style={{
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              id={titleId}
              className="fw-title"
              style={{
                overflow: 'hidden',
                color:
                  'var(--text-primary)',
                fontSize:
                  'var(--font-size-base)',
                fontWeight: 600,
                textOverflow:
                  'ellipsis',
                whiteSpace:
                  'nowrap',
              }}
            >
              Validation orienteur
              {' — '}
              intervention #
              {job.id}
            </div>

            <div
              style={{
                marginTop: 2,
                color:
                  'var(--text-muted)',
                fontSize:
                  'var(--font-size-xs)',
              }}
            >
              {getStatusLabel(
                job.status,
              )}
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="fw-close"
            onClick={closePanel}
            disabled={busy}
            aria-label="Fermer la validation"
            title="Fermer"
            style={{
              width: 32,
              height: 32,
              display: 'grid',
              placeItems: 'center',
              padding: 0,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m4 4 8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div
          className="validation-body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            gap:
              'var(--space-lg)',
            padding:
              'var(--space-xl)',
            overflowY: 'auto',
            background:
              'var(--surface-app)',
          }}
        >
          {error && (
            <div
              id={`${panelId}-error`}
              role="alert"
              style={ERROR_STYLE}
            >
              {error}
            </div>
          )}

          {outcome && (
            <div
              role="status"
              style={
                outcome.type ===
                'success'
                  ? SUCCESS_STYLE
                  : INFO_STYLE
              }
            >
              {outcome.message}

              {outcome.detail && (
                <div
                  style={{
                    marginTop: 4,
                    color:
                      'var(--text-secondary)',
                  }}
                >
                  {outcome.detail}
                </div>
              )}
            </div>
          )}

          <Card
            className="validation-details"
            style={{
              padding:
                'var(--space-lg)',
              background:
                'var(--surface-panel)',
            }}
          >
            <DetailRow
              label="Client"
              value={
                job.customer_name
              }
            />

            <DetailRow
              label="Type"
              value={getJobTypeDisplay(
                job.job_type,
              )}
            />

            <DetailRow
              label="Statut"
              value={getStatusLabel(
                job.status,
              )}
            />

            <DetailRow
              label="Technicien"
              value={
                getTechnicianName(
                  job,
                )
              }
            />

            <DetailRow
              label="PTO"
              value={
                job.pto ??
                job.pto_raw
              }
              mono
            />

            <DetailRow
              label="Puissance optique"
              value={formatNumber(
                job.optical_power_dbm,
                'dBm',
              )}
              mono
            />

            <DetailRow
              label="Longueur câble"
              value={formatNumber(
                job.cable_length_m,
                'm',
              )}
              mono
            />

            <DetailRow
              label="ONT"
              value={job.ont_serial}
              mono
            />

            <DetailRow
              label="Routeur"
              value={
                job.router_serial
              }
              mono
            />

            <DetailRow
              label="Adresse MAC"
              value={job.mac_address}
              mono
            />
          </Card>

          {(beforePhoto ||
            afterPhoto) && (
            <section
              aria-label="Photos terrain"
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(180px, 1fr))',
                gap:
                  'var(--space-lg)',
              }}
            >
              <PhotoPreview
                label="Photo avant"
                source={
                  job.before_photo
                }
              />

              <PhotoPreview
                label="Photo après"
                source={
                  job.after_photo
                }
              />
            </section>
          )}

          {normalizeText(
            job.coordinator_comments,
          ) && (
            <Card
              style={{
                padding:
                  'var(--space-lg)',
                background:
                  'var(--surface-panel-alt)',
              }}
            >
              <div
                style={{
                  marginBottom:
                    'var(--space-sm)',
                  color:
                    'var(--text-muted)',
                  fontSize:
                    'var(--font-size-xs)',
                  fontWeight: 600,
                  textTransform:
                    'uppercase',
                  letterSpacing:
                    '0.04em',
                }}
              >
                Compte rendu terrain
              </div>

              <div
                style={{
                  color:
                    'var(--text-primary)',
                  fontSize:
                    'var(--font-size-sm)',
                  lineHeight: 1.5,
                  whiteSpace:
                    'pre-wrap',
                  overflowWrap:
                    'anywhere',
                }}
              >
                {
                  job.coordinator_comments
                }
              </div>
            </Card>
          )}

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap:
                'var(--space-sm)',
            }}
          >
            <label
              htmlFor={commentId}
              style={{
                color:
                  'var(--text-secondary)',
                fontSize:
                  'var(--font-size-sm)',
                fontWeight: 600,
              }}
            >
              Commentaire orienteur
            </label>

            <textarea
              id={commentId}
              className="validation-comment"
              value={comment}
              onChange={(event) => {
                setComment(
                  event.target.value.slice(
                    0,
                    MAX_COMMENT_LENGTH,
                  ),
                );

                setError('');
              }}
              rows={4}
              maxLength={
                MAX_COMMENT_LENGTH
              }
              disabled={
                busy ||
                Boolean(outcome)
              }
              placeholder="Commentaire optionnel pour valider, obligatoire pour demander une correction…"
              aria-describedby={`${commentId}-help`}
              style={{
                width: '100%',
                minHeight: 90,
                maxHeight: 220,
                padding:
                  '9px 10px',
                color:
                  'var(--text-primary)',
                fontFamily:
                  'var(--font-family)',
                fontSize: 16,
                lineHeight: 1.45,
                resize: 'vertical',
                caretColor:
                  'var(--color-accent)',
                background:
                  'var(--surface-input)',
                border:
                  '1px solid var(--border-color)',
                borderRadius: 5,
                outline: 0,
              }}
            />

            <div
              id={`${commentId}-help`}
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                gap:
                  'var(--space-md)',
                color:
                  'var(--text-muted)',
                fontSize: 10,
                lineHeight: 1.3,
              }}
            >
              <span>
                Les commentaires sont enregistrés dans les notes de l’intervention.
              </span>

              <span
                style={{
                  flexShrink: 0,
                  fontFamily:
                    'var(--font-mono)',
                }}
              >
                {comment.length}/
                {MAX_COMMENT_LENGTH}
              </span>
            </div>
          </div>

          {!outcome && (
            <div
              role="note"
              style={INFO_STYLE}
            >
              La demande de correction conserve le statut actuel : aucune transition backend sûre vers « affectée » n’est disponible dans le contrat existant.
            </div>
          )}
        </div>

        <footer
          className="validation-actions"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent:
              'flex-end',
            gap:
              'var(--space-md)',
            padding:
              'var(--space-lg)',
            background:
              'var(--surface-header)',
            borderTop:
              '1px solid var(--border-color)',
          }}
        >
          {outcome ? (
            <Button
              type="button"
              variant="primary"
              onClick={closePanel}
            >
              Fermer
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={closePanel}
                disabled={busy}
              >
                Annuler
              </Button>

              <Button
                type="button"
                variant="danger"
                onClick={
                  handleCorrectionRequest
                }
                disabled={
                  busy ||
                  !normalizedComment
                }
                loading={
                  activeAction ===
                  'correction'
                }
              >
                Demander une correction
              </Button>

              <Button
                type="button"
                variant="success"
                onClick={
                  handleValidate
                }
                disabled={busy}
                loading={
                  activeAction ===
                  'validate'
                }
              >
                Valider l’intervention
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
