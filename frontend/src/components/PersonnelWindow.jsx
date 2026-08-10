import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import FloatingWindow from './FloatingWindow';

const STATUS_LABELS = {
  available: 'Disponible',
  disponible: 'Disponible',

  on_break: 'En pause',
  pause: 'En pause',
  en_pause: 'En pause',

  off_duty: 'Hors service',
  hors_service: 'Hors service',

  on_job: 'En intervention',
  en_job: 'En intervention',
  en_intervention: 'En intervention',
  en_tache: 'En intervention',

  en_route: 'En route',

  disconnected: 'Déconnecté',
  deconnecte: 'Déconnecté',
  déconnecté: 'Déconnecté',

  active: 'Actif',
  inactive: 'Inactif',
};

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(value) {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return '';
  }

  return String(value).trim();
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function normalizeStatus(value) {
  return normalizeSearchText(value);
}

function toClassToken(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeDisplayList(value) {
  const sourceValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalizedValues = [];
  const knownValues = new Set();

  sourceValues.forEach((item) => {
    let text = '';

    if (
      typeof item === 'string' ||
      typeof item === 'number'
    ) {
      text = normalizeText(item);
    } else if (isRecord(item)) {
      text =
        normalizeText(item.name) ||
        normalizeText(item.label) ||
        normalizeText(item.code);
    }

    if (!text) {
      return;
    }

    const comparisonKey =
      normalizeSearchText(text);

    if (
      !comparisonKey ||
      knownValues.has(comparisonKey)
    ) {
      return;
    }

    knownValues.add(comparisonKey);
    normalizedValues.push(text);
  });

  return normalizedValues;
}

function getTechnicianId(technician) {
  const id = normalizeText(technician?.id);

  return id || null;
}

function getTechnicianDisplayId(technician) {
  return (
    normalizeText(technician?.employee_id) ||
    normalizeText(technician?.id) ||
    '—'
  );
}

function getTechnicianName(technician) {
  return (
    normalizeText(technician?.name) ||
    'Technicien sans nom'
  );
}

function getTechnicianStatus(technician) {
  return (
    normalizeText(technician?.live_status) ||
    normalizeText(technician?.status)
  );
}

function getStatusLabel(status) {
  const normalizedStatus =
    normalizeStatus(status);

  if (!normalizedStatus) {
    return 'Inconnu';
  }

  const knownLabel =
    STATUS_LABELS[normalizedStatus];

  if (knownLabel) {
    return knownLabel;
  }

  const fallbackLabel = normalizeText(status)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

  if (!fallbackLabel) {
    return 'Inconnu';
  }

  return (
    fallbackLabel.charAt(0).toUpperCase() +
    fallbackLabel.slice(1)
  );
}

function getTechnicianKey(technician, index) {
  return (
    getTechnicianId(technician) ||
    normalizeText(technician?.employee_id) ||
    `technician-${index}`
  );
}

/**
 * Fenêtre de consultation du personnel.
 *
 * Props :
 * - technicians : liste complète des techniciens
 * - onLocateTech : callback(technicianId)
 * - onContextMenu : callback(event, technician)
 * - onTechDetail : callback(technician)
 * - onClose : fermeture de la fenêtre
 */
export default function PersonnelWindow({
  technicians,
  onLocateTech,
  onContextMenu,
  onTechDetail,
  onClose,
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  const safeTechnicians = useMemo(
    () =>
      Array.isArray(technicians)
        ? technicians.filter(isRecord)
        : [],
    [technicians],
  );

  useEffect(() => {
    const focusTimeout = window.setTimeout(
      () => {
        inputRef.current?.focus();
      },
      80,
    );

    return () => {
      window.clearTimeout(focusTimeout);
    };
  }, []);

  const filteredTechnicians = useMemo(() => {
    const query = normalizeSearchText(search);

    if (!query) {
      return safeTechnicians;
    }

    return safeTechnicians.filter(
      (technician) => {
        const searchableValues = [
          technician.name,
          technician.employee_id,
          technician.id,
        ];

        return searchableValues.some((value) =>
          normalizeSearchText(value).includes(query),
        );
      },
    );
  }, [safeTechnicians, search]);

  const handleLocate = useCallback(
    (event, technician) => {
      event.stopPropagation();

      const technicianId =
        getTechnicianId(technician);

      if (
        technicianId === null ||
        typeof onLocateTech !== 'function'
      ) {
        return;
      }

      onLocateTech(technician.id);
    },
    [onLocateTech],
  );

  const handleContextMenu = useCallback(
    (event, technician) => {
      event.preventDefault();

      if (
        typeof onContextMenu !== 'function'
      ) {
        return;
      }

      onContextMenu(event, technician);
    },
    [onContextMenu],
  );

  const handleDetails = useCallback(
    (technician) => {
      if (
        typeof onTechDetail !== 'function'
      ) {
        return;
      }

      onTechDetail(technician);
    },
    [onTechDetail],
  );

  const handleRowKeyDown = useCallback(
    (event, technician) => {
      if (
        event.key !== 'Enter' &&
        event.key !== ' '
      ) {
        return;
      }

      if (
        typeof onTechDetail !== 'function'
      ) {
        return;
      }

      event.preventDefault();
      handleDetails(technician);
    },
    [handleDetails, onTechDetail],
  );

  const handleClearSearch = useCallback(() => {
    setSearch('');
    inputRef.current?.focus();
  }, []);

  const totalTechnicians =
    safeTechnicians.length;

  return (
    <FloatingWindow
      title={`Personnel — ${totalTechnicians} au total`}
      onClose={onClose}
      defaultPos={{
        x: 200,
        y: 60,
      }}
      defaultSize={{
        w: 520,
        h: 460,
      }}
      minSize={{
        w: 380,
        h: 280,
      }}
      className="fw-personnel"
    >
      <div className="personnel-search">
        <input
          ref={inputRef}
          type="search"
          className="personnel-input"
          placeholder="Rechercher par nom ou ID..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          aria-label="Rechercher un technicien par nom ou identifiant"
          autoComplete="off"
          spellCheck="false"
        />

        {search && (
          <button
            type="button"
            className="personnel-clear"
            onClick={handleClearSearch}
            title="Effacer la recherche"
            aria-label="Effacer la recherche"
          >
            ✕
          </button>
        )}

        <span
          className="personnel-count"
          aria-live="polite"
        >
          {filteredTechnicians.length} /{' '}
          {totalTechnicians}
        </span>
      </div>

      <div
        className="personnel-header"
        aria-hidden="true"
      >
        <span className="personnel-id">
          ID
        </span>

        <span className="personnel-name">
          Nom
        </span>

        <span className="personnel-status-col">
          Statut
        </span>

        <span className="personnel-routes">
          Secteurs
        </span>

        <span className="personnel-skills">
          Compétences
        </span>

        <span
          style={{
            width: '24px',
          }}
        />
      </div>

      <div
        className="personnel-list"
        aria-label="Liste des techniciens"
      >
        {filteredTechnicians.map(
          (technician, index) => {
            const technicianId =
              getTechnicianId(technician);

            const technicianName =
              getTechnicianName(technician);

            const status =
              getTechnicianStatus(technician);

            const statusClass =
              toClassToken(status) ||
              'unknown';

            const routes =
              normalizeDisplayList(
                technician.assigned_routes,
              );

            const skills =
              normalizeDisplayList(
                technician.skills,
              );

            const detailsAvailable =
              typeof onTechDetail ===
              'function';

            const locateAvailable =
              technicianId !== null &&
              typeof onLocateTech ===
                'function';

            return (
              <div
                key={getTechnicianKey(
                  technician,
                  index,
                )}
                className="personnel-row"
                onContextMenu={(event) =>
                  handleContextMenu(
                    event,
                    technician,
                  )
                }
                onDoubleClick={() =>
                  handleDetails(technician)
                }
                onKeyDown={(event) =>
                  handleRowKeyDown(
                    event,
                    technician,
                  )
                }
                tabIndex={
                  detailsAvailable ? 0 : undefined
                }
                title={
                  detailsAvailable
                    ? `Double-cliquer pour ouvrir la fiche de ${technicianName}`
                    : undefined
                }
              >
                <span
                  className="personnel-id"
                  title={getTechnicianDisplayId(
                    technician,
                  )}
                >
                  {getTechnicianDisplayId(
                    technician,
                  )}
                </span>

                <span
                  className="personnel-name"
                  title={technicianName}
                >
                  {technicianName}
                </span>

                <span className="personnel-status-col">
                  <span
                    className={`status-badge status-badge--${statusClass}`}
                    title={getStatusLabel(status)}
                  >
                    {getStatusLabel(status)}
                  </span>
                </span>

                <span
                  className="personnel-routes"
                  title={
                    routes.length > 0
                      ? routes.join(', ')
                      : undefined
                  }
                >
                  {routes.length > 0
                    ? routes.join(', ')
                    : '—'}
                </span>

                <span
                  className="personnel-skills"
                  title={
                    skills.length > 0
                      ? skills.join(', ')
                      : undefined
                  }
                >
                  {skills.length > 0
                    ? skills.join(', ')
                    : '—'}
                </span>

                <button
                  type="button"
                  className="personnel-locate"
                  onClick={(event) =>
                    handleLocate(
                      event,
                      technician,
                    )
                  }
                  disabled={!locateAvailable}
                  title={
                    locateAvailable
                      ? `Localiser ${technicianName} dans la grille`
                      : 'Localisation indisponible'
                  }
                  aria-label={
                    locateAvailable
                      ? `Localiser ${technicianName} dans la grille`
                      : 'Localisation indisponible'
                  }
                >
                  ⊕
                </button>
              </div>
            );
          },
        )}

        {filteredTechnicians.length ===
          0 && (
          <div className="personnel-empty">
            {normalizeText(search)
              ? `Aucun technicien ne correspond à « ${normalizeText(
                  search,
                )} »`
              : 'Aucun technicien chargé'}
          </div>
        )}
      </div>
    </FloatingWindow>
  );
}