import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "../api/client";
import { useWebSocket } from "../hooks/useWebSocket";
import FloatingWindow from "./FloatingWindow";

const TABS = [
  { id: "general", label: "Général", icon: "👤" },
  { id: "skills", label: "Compétences", icon: "🛠" },
  { id: "equipment", label: "Matériel", icon: "📡" },
  { id: "stock", label: "Stock véhicule", icon: "📦" },
  { id: "history", label: "Historique", icon: "📋" },
  { id: "gps", label: "GPS", icon: "📍" },
  { id: "kpi", label: "KPI", icon: "📊" },
  { id: "activity", label: "Activité", icon: "⏱" },
];

const TECHNICIAN_STATUS_LABELS = {
  disponible: "Disponible",
  en_intervention: "En intervention",
  en_tache: "En intervention",
  en_route: "En route",
  pause: "En pause",
  hors_service: "Hors service",
  deconnecte: "Déconnecté",
};

const JOB_STATUS_LABELS = {
  pending: "En attente",
  assigned: "Affectée",
  in_progress: "En cours",
  en_attente_validation: "En attente de validation",
  completed: "Terminée",
  cancelled: "Annulée",
  on_hold: "En attente",
  en_route: "En route",
  on_site: "Sur site",
  work_in_progress: "Travaux en cours",
  installation_done: "Installation terminée",
  client_validation: "Validation client",
  failed: "Échec",
  client_absent: "Client absent",
  postponed: "Reportée",
  suspended: "Suspendue",
};

const ACTION_LABELS = {
  created: "Création",
  assigned: "Affectation",
  reassigned: "Réaffectation",
  unassigned: "Désaffectation",
  started: "Démarrage",
  completed: "Intervention terminée",
  cancelled: "Annulation",
  failed: "Échec",
  postponed: "Report",
  suspended: "Suspension",
  status_changed: "Changement de statut",
};

const TIMELINE_TYPES = {
  created: "success",
  assigned: "info",
  reassigned: "info",
  unassigned: "warning",
  started: "info",
  completed: "success",
  cancelled: "danger",
  failed: "danger",
  postponed: "warning",
  suspended: "warning",
  status_changed: "info",
};

const SKILL_COLORS = {
  PTO: "#4a9eff",
  PBO: "#9b7ed8",
  Raccordement: "#4caf6a",
  Soudure: "#e5a834",
  "Mesure optique": "#5b9bd5",
  Dépannage: "#e05555",
  Audit: "#7a7e88",
  Migration: "#3498db",
  Installation: "#2ecc71",
  D3: "#f39c12",
  D2: "#e74c3c",
};

const SKILL_LEVELS = {
  debutant: 1,
  confirme: 2,
  expert: 3,
};

const SKILL_LEVEL_COLORS = {
  1: "#e5a834",
  2: "#4a9eff",
  3: "#4caf6a",
};

const SKILL_LEVEL_LABELS = {
  1: "Débutant",
  2: "Confirmé",
  3: "Expert",
};

const EMPTY_STATE_STYLE = {
  padding: 20,
  textAlign: "center",
  color: "var(--text-muted)",
};

const TABLE_HEADER_STYLE = {
  display: "grid",
  gap: 8,
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  background: "var(--surface-panel-alt)",
  borderRadius: 4,
};

const TABLE_ROW_STYLE = {
  display: "grid",
  gap: 8,
  padding: "6px 8px",
  background: "var(--surface-panel-alt)",
  borderRadius: 4,
  fontSize: 11,
  alignItems: "center",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const NUMBER_FORMATTER = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("fr-MA", {
  style: "currency",
  currency: "MAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function isRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function asArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => item !== null && item !== undefined)
    : [];
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toFiniteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return DATE_TIME_FORMATTER.format(date);
}

function formatNumber(value, fallback = "—") {
  const parsed = toFiniteNumber(value);

  return parsed === null
    ? fallback
    : NUMBER_FORMATTER.format(parsed);
}

function formatGroundSpeedKmh(value) {
  const metresPerSecond = toFiniteNumber(value);

  return metresPerSecond === null
    ? "—"
    : `${NUMBER_FORMATTER.format(metresPerSecond * 3.6)} km/h`;
}

function formatCurrency(value) {
  const parsed = toFiniteNumber(value);

  return parsed === null
    ? "—"
    : CURRENCY_FORMATTER.format(parsed);
}

function formatCoordinate(value) {
  const parsed = toFiniteNumber(value);

  return parsed === null
    ? "—"
    : parsed.toFixed(6);
}

function formatDuration(value) {
  const parsed = toFiniteNumber(value);

  return parsed === null
    ? "—"
    : `${NUMBER_FORMATTER.format(parsed)} min`;
}

function formatPercentage(value) {
  const parsed = toFiniteNumber(value);

  return parsed === null
    ? "—"
    : `${NUMBER_FORMATTER.format(parsed)} %`;
}

function getStatusClass(value) {
  const normalized = normalizeComparableText(value)
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "unknown";
}

function getTechnicianStatusLabel(value) {
  const normalized = normalizeComparableText(value);

  return (
    TECHNICIAN_STATUS_LABELS[normalized] ||
    normalizeText(value).replace(/_/g, " ") ||
    "Inconnu"
  );
}

function getJobStatusLabel(value) {
  const normalized = normalizeComparableText(value);

  return (
    JOB_STATUS_LABELS[normalized] ||
    normalizeText(value).replace(/_/g, " ") ||
    "Inconnu"
  );
}

function formatActionLabel(value) {
  const normalized = normalizeComparableText(value);

  if (ACTION_LABELS[normalized]) {
    return ACTION_LABELS[normalized];
  }

  const label = normalizeText(value).replace(/_/g, " ");

  if (!label) {
    return "Activité";
  }

  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function normalizeSkillLevel(value) {
  const numericValue = toFiniteNumber(value);

  if (
    numericValue !== null &&
    numericValue >= 1 &&
    numericValue <= 3
  ) {
    return Math.round(numericValue);
  }

  const normalized = normalizeComparableText(value);

  return SKILL_LEVELS[normalized] || 1;
}

function parseSkill(skill) {
  if (typeof skill === "string") {
    const separatorIndex = skill.lastIndexOf(":");

    if (separatorIndex > 0) {
      const name = normalizeText(
        skill.slice(0, separatorIndex),
      );
      const level = normalizeSkillLevel(
        skill.slice(separatorIndex + 1),
      );

      return name ? { name, level } : null;
    }

    const name = normalizeText(skill);

    return name
      ? {
          name,
          level: 1,
        }
      : null;
  }

  if (!isRecord(skill)) {
    return null;
  }

  const name = normalizeText(
    skill.name ??
      skill.label ??
      skill.skill ??
      skill.code,
  );

  if (!name) {
    return null;
  }

  return {
    name,
    level: normalizeSkillLevel(
      skill.level ??
        skill.proficiency ??
        skill.expertise,
    ),
  };
}

function getSkillColor(skillName) {
  const normalizedName =
    normalizeComparableText(skillName);

  const matchingEntry = Object.entries(
    SKILL_COLORS,
  ).find(
    ([name]) =>
      normalizeComparableText(name) === normalizedName,
  );

  return matchingEntry?.[1] || "var(--text-secondary)";
}

function getApiErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }

  return "Impossible de charger les détails du technicien.";
}

export default function TechnicianDetailPanel({
  technician: initialTech,
  onClose,
  onEdit,
  onDeactivate,
  onViewJobs,
}) {
  const [tab, setTab] = useState("general");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(
    Boolean(initialTech?.id),
  );
  const [loadError, setLoadError] = useState(null);

  const requestSequenceRef = useRef(0);

  const technicianId = initialTech?.id;

  const loadDetails = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!technicianId) {
        requestSequenceRef.current += 1;
        setData(null);
        setLoading(false);
        setLoadError(null);
        return;
      }

      const requestSequence =
        requestSequenceRef.current + 1;

      requestSequenceRef.current = requestSequence;

      if (showLoading) {
        setLoading(true);
      }

      setLoadError(null);

      try {
        const response =
          await api.getTechnicianDetails(
            technicianId,
          );

        if (
          requestSequence !==
          requestSequenceRef.current
        ) {
          return;
        }

        if (!isRecord(response?.data)) {
          setData(null);
          setLoadError(
            "La réponse reçue pour ce technicien est invalide.",
          );
          return;
        }

        setData(response.data);
      } catch (error) {
        if (
          requestSequence !==
          requestSequenceRef.current
        ) {
          return;
        }

        console.error(
          "Erreur de chargement de la fiche technicien :",
          error,
        );

        setLoadError(getApiErrorMessage(error));
      } finally {
        if (
          showLoading &&
          requestSequence ===
            requestSequenceRef.current
        ) {
          setLoading(false);
        }
      }
    },
    [technicianId],
  );

  useEffect(() => {
    setTab("general");
    setData(null);
    setLoadError(null);

    if (!technicianId) {
      setLoading(false);
      return undefined;
    }

    loadDetails({ showLoading: true });

    return () => {
      requestSequenceRef.current += 1;
    };
  }, [technicianId, loadDetails]);

  const handleRealtimeEvent = useCallback(
    (eventType, eventData) => {
      if (!technicianId) {
        return;
      }

      const eventTechnicianId =
        eventData?.technician_id ??
        eventData?.tech_id;

      if (
        String(eventTechnicianId ?? "") !==
        String(technicianId)
      ) {
        return;
      }

      const normalizedEventType =
        normalizeComparableText(eventType);

      if (
        normalizedEventType.startsWith("tech:") ||
        normalizedEventType.startsWith("tech_")
      ) {
        loadDetails();
      }
    },
    [technicianId, loadDetails],
  );

  useWebSocket("supervision", {
    onEvent: handleRealtimeEvent,
  });

  const detailedTechnician = useMemo(() => {
    if (isRecord(data?.technician)) {
      return data.technician;
    }

    return isRecord(initialTech)
      ? initialTech
      : {};
  }, [data, initialTech]);

  const equipment = useMemo(
    () => asArray(data?.equipment).filter(isRecord),
    [data?.equipment],
  );

  const vehicleStock = useMemo(
    () =>
      asArray(data?.vehicle_stock).filter(isRecord),
    [data?.vehicle_stock],
  );

  const assignments = useMemo(
    () =>
      asArray(data?.assignments).filter(isRecord),
    [data?.assignments],
  );

  const gpsHistory = useMemo(
    () =>
      asArray(data?.gps_history).filter(isRecord),
    [data?.gps_history],
  );

  const timeline = useMemo(
    () => asArray(data?.timeline).filter(isRecord),
    [data?.timeline],
  );

  const parsedSkills = useMemo(() => {
    const sourceSkills = Array.isArray(
      detailedTechnician.skills,
    )
      ? detailedTechnician.skills
      : [];

    return sourceSkills
      .map(parseSkill)
      .filter(Boolean);
  }, [detailedTechnician.skills]);

  const stockCounts = useMemo(() => {
    const counts = new Map();

    vehicleStock.forEach((item) => {
      const equipmentType =
        normalizeText(item.equipment_type) ||
        "Autre";

      const quantity =
        toFiniteNumber(item.quantity) ?? 0;

      counts.set(
        equipmentType,
        (counts.get(equipmentType) || 0) +
          quantity,
      );
    });

    return Array.from(counts.entries())
      .map(([type, quantity]) => ({
        type,
        quantity,
      }))
      .filter(({ quantity }) => quantity !== 0)
      .sort((first, second) =>
        first.type.localeCompare(
          second.type,
          "fr",
          {
            sensitivity: "base",
          },
        ),
      );
  }, [vehicleStock]);

  const totalStockValue = useMemo(
    () =>
      vehicleStock.reduce((total, item) => {
        const lineValue =
          toFiniteNumber(item.line_value);

        if (lineValue !== null) {
          return total + lineValue;
        }

        const unitPrice =
          toFiniteNumber(item.unit_price);
        const quantity =
          toFiniteNumber(item.quantity);

        if (
          unitPrice === null ||
          quantity === null
        ) {
          return total;
        }

        return total + unitPrice * quantity;
      }, 0),
    [vehicleStock],
  );

  if (!initialTech) {
    return null;
  }

  const renderGeneral = () => {
    const technicianName =
      normalizeText(detailedTechnician.name) ||
      "Technicien";

    const technicianReference =
      normalizeText(
        detailedTechnician.employee_id,
      ) ||
      (detailedTechnician.id
        ? `Tech #${detailedTechnician.id}`
        : "—");

    const liveStatus =
      detailedTechnician.live_status ||
      detailedTechnician.status;

    const actionsAvailable =
      typeof onEdit === "function" ||
      (typeof onDeactivate === "function" &&
        detailedTechnician.is_active !== false) ||
      typeof onViewJobs === "function";

    return (
      <div>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background:
                "var(--color-accent-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--color-accent)",
              flexShrink: 0,
              border:
                "2px solid var(--color-accent)",
            }}
            aria-hidden="true"
          >
            {technicianName
              .charAt(0)
              .toUpperCase()}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={technicianName}
            >
              {technicianName}
            </div>

            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              {technicianReference}
            </div>
          </div>
        </div>

        <div
          className="ie-detail-badges"
          style={{
            marginBottom: 12,
          }}
        >
          <span
            className={`status-badge status-badge--${getStatusClass(
              liveStatus,
            )}`}
          >
            {getTechnicianStatusLabel(
              liveStatus,
            )}
          </span>

          {typeof detailedTechnician.is_active ===
            "boolean" && (
            <span
              style={{
                background:
                  detailedTechnician.is_active
                    ? "var(--color-success-dim)"
                    : "var(--color-danger-dim)",
                color:
                  detailedTechnician.is_active
                    ? "var(--color-success)"
                    : "var(--color-danger)",
                padding: "1px 8px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {detailedTechnician.is_active
                ? "Actif"
                : "Inactif"}
            </span>
          )}
        </div>

        <div className="ie-detail-section">
          <div className="ie-detail-section-title">
            Coordonnées
          </div>

          <div className="ie-detail-grid">
            <div>
              <span>Téléphone</span>
              <strong>
                {normalizeText(
                  detailedTechnician.phone,
                ) || "—"}
              </strong>
            </div>

            <div>
              <span>Email</span>
              <strong
                style={{
                  overflowWrap: "anywhere",
                }}
              >
                {normalizeText(
                  detailedTechnician.email,
                ) || "—"}
              </strong>
            </div>

            <div>
              <span>Adresse</span>
              <strong
                style={{
                  overflowWrap: "anywhere",
                }}
              >
                {normalizeText(
                  detailedTechnician.home_address,
                ) || "—"}
              </strong>
            </div>
          </div>
        </div>

        <div className="ie-detail-section">
          <div className="ie-detail-section-title">
            Affectation
          </div>

          <div className="ie-detail-grid">
            <div>
              <span>Orienteur</span>
              <strong>
                {normalizeText(
                  detailedTechnician.orienteur_name,
                ) || "—"}
              </strong>
            </div>

            <div>
              <span>Secteur</span>
              <strong>
                {normalizeText(
                  detailedTechnician.sector_name,
                ) || "—"}
              </strong>
            </div>

            <div>
              <span>Profil créé le</span>
              <strong>
                {formatDateTime(
                  detailedTechnician.created_at,
                )}
              </strong>
            </div>

            <div>
              <span>Début de service</span>
              <strong>
                {normalizeText(
                  detailedTechnician.shift_start,
                ) || "—"}
              </strong>
            </div>

            <div>
              <span>Fin de service</span>
              <strong>
                {normalizeText(
                  detailedTechnician.shift_end,
                ) || "—"}
              </strong>
            </div>

            <div>
              <span>Capacité quotidienne</span>
              <strong>
                {formatNumber(
                  detailedTechnician.max_jobs_per_day,
                )}
              </strong>
            </div>
          </div>
        </div>

        {isRecord(data?.kpi) && (
          <div className="ie-detail-section">
            <div className="ie-detail-section-title">
              Charge de travail
            </div>

            <div className="ie-detail-grid">
              <div>
                <span>Interventions analysées</span>
                <strong>
                  {formatNumber(
                    data.kpi.total_jobs,
                    "0",
                  )}
                </strong>
              </div>

              <div>
                <span>Aujourd’hui</span>
                <strong>
                  {formatNumber(
                    data.kpi.today_jobs,
                    "0",
                  )}
                </strong>
              </div>

              <div>
                <span>Cette semaine</span>
                <strong
                  style={{
                    color:
                      "var(--color-accent)",
                  }}
                >
                  {formatNumber(
                    data.kpi.week_jobs,
                    "0",
                  )}
                </strong>
              </div>
            </div>
          </div>
        )}

        {actionsAvailable && (
          <div
            className="ie-detail-actions"
            style={{
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            {typeof onEdit === "function" && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  onEdit(detailedTechnician)
                }
              >
                ✏️ Modifier
              </button>
            )}

            {typeof onDeactivate ===
              "function" &&
              detailedTechnician.is_active !==
                false && (
                <button
                  type="button"
                  className="btn btn--sm btn--warning"
                  onClick={() =>
                    onDeactivate(
                      detailedTechnician,
                    )
                  }
                >
                  🔄 Désactiver
                </button>
              )}

            {typeof onViewJobs ===
              "function" && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  onViewJobs(
                    detailedTechnician,
                  )
                }
              >
                👁 Voir les interventions
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSkills = () => {
    if (parsedSkills.length === 0) {
      return (
        <div style={EMPTY_STATE_STYLE}>
          Aucune compétence enregistrée
        </div>
      );
    }

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{
            marginBottom: 12,
          }}
        >
          Compétences FTTH
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {parsedSkills.map((skill, index) => {
            const color = getSkillColor(
              skill.name,
            );

            const levelColor =
              SKILL_LEVEL_COLORS[skill.level] ||
              "var(--text-muted)";

            return (
              <div
                key={`${skill.name}-${skill.level}-${index}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 6,
                  background: `${color}15`,
                  border: `1px solid ${color}40`,
                  gap: 4,
                }}
              >
                <span
                  style={{
                    color,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {skill.name}
                </span>

                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: levelColor,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: `${levelColor}20`,
                  }}
                >
                  {SKILL_LEVEL_LABELS[
                    skill.level
                  ] || "Débutant"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderEquipment = () => {
    if (equipment.length === 0) {
      return (
        <div style={EMPTY_STATE_STYLE}>
          Aucun matériel attribué
        </div>
      );
    }

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{
            marginBottom: 12,
          }}
        >
          Matériel attribué
        </div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <div
            style={{
              minWidth: 700,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                ...TABLE_HEADER_STYLE,
                gridTemplateColumns:
                  "1.4fr 1.6fr 1.6fr 1.2fr 1fr 1fr",
              }}
            >
              <span>Type</span>
              <span>N° de série</span>
              <span>Adresse MAC</span>
              <span>Modèle</span>
              <span>État</span>
              <span>Opérateur</span>
            </div>

            {equipment.map((item, index) => (
              <div
                key={
                  item.id ??
                  `${item.serial_number ?? "equipment"}-${index}`
                }
                style={{
                  ...TABLE_ROW_STYLE,
                  gridTemplateColumns:
                    "1.4fr 1.6fr 1.6fr 1.2fr 1fr 1fr",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                  }}
                >
                  {normalizeText(
                    item.equipment_type,
                  ) || "—"}
                </span>

                <span
                  style={{
                    fontFamily:
                      "var(--font-mono)",
                    fontSize: 10,
                    overflowWrap: "anywhere",
                  }}
                >
                  {normalizeText(
                    item.serial_number,
                  ) || "—"}
                </span>

                <span
                  style={{
                    fontFamily:
                      "var(--font-mono)",
                    fontSize: 10,
                    overflowWrap: "anywhere",
                  }}
                >
                  {normalizeText(
                    item.mac_address,
                  ) || "—"}
                </span>

                <span>
                  {normalizeText(item.model) ||
                    "—"}
                </span>

                <span>
                  {normalizeText(item.status) ||
                    "—"}
                </span>

                <span>
                  {normalizeText(item.operator) ||
                    "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderStock = () => {
    return (
      <div>
        <div className="ie-detail-section">
          <div className="ie-detail-section-title">
            Résumé du stock embarqué
          </div>

          {stockCounts.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(110px, 1fr))",
                gap: 8,
                marginBottom: 10,
              }}
            >
              {stockCounts.map(
                ({ type, quantity }) => (
                  <div
                    key={type}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 4,
                      background:
                        "var(--surface-panel-alt)",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color:
                          "var(--color-accent)",
                      }}
                    >
                      {formatNumber(
                        quantity,
                        "0",
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: 9,
                        color:
                          "var(--text-muted)",
                        textTransform:
                          "uppercase",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {type}
                    </div>
                  </div>
                ),
              )}
            </div>
          ) : (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: 11,
                marginBottom: 10,
              }}
            >
              Aucun article enregistré dans le
              véhicule.
            </div>
          )}

          <div
            className="ie-detail-grid"
            style={{
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            <div>
              <span>Lignes de stock</span>
              <strong>
                {vehicleStock.length}
              </strong>
            </div>

            <div>
              <span>Valeur du stock</span>
              <strong
                style={{
                  color:
                    "var(--color-accent)",
                }}
              >
                {formatCurrency(
                  totalStockValue,
                )}
              </strong>
            </div>
          </div>
        </div>

        <div className="ie-detail-section">
          <div className="ie-detail-section-title">
            Détail du stock (
            {vehicleStock.length} ligne
            {vehicleStock.length !== 1
              ? "s"
              : ""}
            )
          </div>

          {vehicleStock.length === 0 ? (
            <div style={EMPTY_STATE_STYLE}>
              Aucun stock dans le véhicule
            </div>
          ) : (
            <div
              style={{
                overflowX: "auto",
              }}
            >
              <div
                style={{
                  minWidth: 720,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    ...TABLE_HEADER_STYLE,
                    gridTemplateColumns:
                      "2fr 1.3fr 0.8fr 0.8fr 0.8fr 1fr",
                  }}
                >
                  <span>Article</span>
                  <span>Type</span>
                  <span
                    style={{
                      textAlign: "right",
                    }}
                  >
                    Stock
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                    }}
                  >
                    Disponible
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                    }}
                  >
                    Réservé
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                    }}
                  >
                    Valeur
                  </span>
                </div>

                {vehicleStock.map(
                  (item, index) => (
                    <div
                      key={
                        item.item_id ??
                        `${item.reference ?? "stock"}-${index}`
                      }
                      style={{
                        ...TABLE_ROW_STYLE,
                        gridTemplateColumns:
                          "2fr 1.3fr 0.8fr 0.8fr 0.8fr 1fr",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          overflowWrap:
                            "anywhere",
                        }}
                      >
                        {normalizeText(
                          item.label,
                        ) ||
                          normalizeText(
                            item.reference,
                          ) ||
                          "—"}
                      </span>

                      <span
                        style={{
                          color:
                            "var(--text-muted)",
                          overflowWrap:
                            "anywhere",
                        }}
                      >
                        {normalizeText(
                          item.equipment_type,
                        ) || "—"}
                      </span>

                      <span
                        style={{
                          textAlign: "right",
                          fontFamily:
                            "var(--font-mono)",
                        }}
                      >
                        {formatNumber(
                          item.quantity,
                        )}
                      </span>

                      <span
                        style={{
                          textAlign: "right",
                          fontFamily:
                            "var(--font-mono)",
                        }}
                      >
                        {formatNumber(
                          item.available_quantity,
                        )}
                      </span>

                      <span
                        style={{
                          textAlign: "right",
                          fontFamily:
                            "var(--font-mono)",
                          color:
                            "var(--text-muted)",
                        }}
                      >
                        {formatNumber(
                          item.reserved_quantity,
                        )}
                      </span>

                      <span
                        style={{
                          textAlign: "right",
                          fontFamily:
                            "var(--font-mono)",
                        }}
                      >
                        {formatCurrency(
                          item.line_value,
                        )}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHistory = () => {
    if (assignments.length === 0) {
      return (
        <div style={EMPTY_STATE_STYLE}>
          Aucune intervention
        </div>
      );
    }

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{
            marginBottom: 12,
          }}
        >
          Interventions ({assignments.length})
        </div>

        <div
          style={{
            overflowX: "auto",
          }}
        >
          <div
            style={{
              minWidth: 820,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                ...TABLE_HEADER_STYLE,
                gridTemplateColumns:
                  "0.8fr 1.7fr 2fr 1.2fr 1.2fr 0.9fr 1.2fr",
                position: "sticky",
                top: 0,
                zIndex: 1,
              }}
            >
              <span>Référence</span>
              <span>Client</span>
              <span>Adresse</span>
              <span>Date</span>
              <span>Type</span>
              <span
                style={{
                  textAlign: "right",
                }}
              >
                Durée
              </span>
              <span>Statut</span>
            </div>

            {assignments.map(
              (assignment, index) => {
                const jobReference =
                  normalizeText(
                    assignment.job_number,
                  ) ||
                  normalizeText(
                    assignment.job_id,
                  ) ||
                  "—";

                return (
                  <div
                    key={
                      assignment.job_id ??
                      `${jobReference}-${index}`
                    }
                    style={{
                      ...TABLE_ROW_STYLE,
                      gridTemplateColumns:
                        "0.8fr 1.7fr 2fr 1.2fr 1.2fr 0.9fr 1.2fr",
                    }}
                  >
                    <span
                      style={{
                        fontFamily:
                          "var(--font-mono)",
                        fontSize: 10,
                      }}
                    >
                      {jobReference}
                    </span>

                    <span
                      style={{
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow:
                          "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={normalizeText(
                        assignment.customer_name,
                      )}
                    >
                      {normalizeText(
                        assignment.customer_name,
                      ) || "—"}
                    </span>

                    <span
                      style={{
                        color:
                          "var(--text-muted)",
                        fontSize: 10,
                        overflow: "hidden",
                        textOverflow:
                          "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={normalizeText(
                        assignment.service_address,
                      )}
                    >
                      {normalizeText(
                        assignment.service_address,
                      ) || "—"}
                    </span>

                    <span
                      style={{
                        fontSize: 10,
                      }}
                    >
                      {formatDateTime(
                        assignment.scheduled_date,
                      )}
                    </span>

                    <span
                      style={{
                        fontSize: 10,
                      }}
                    >
                      {normalizeText(
                        assignment.job_type,
                      ) || "—"}
                    </span>

                    <span
                      style={{
                        textAlign: "right",
                        fontFamily:
                          "var(--font-mono)",
                      }}
                    >
                      {formatDuration(
                        assignment.actual_duration_minutes,
                      )}
                    </span>

                    <span
                      style={{
                        minWidth: 0,
                      }}
                      className={`status-badge status-badge--${getStatusClass(
                        assignment.status,
                      )}`}
                    >
                      {getJobStatusLabel(
                        assignment.status,
                      )}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderGps = () => {
    const lastPosition = isRecord(
      data?.last_position,
    )
      ? data.last_position
      : gpsHistory[0] || null;

    const latitude =
      toFiniteNumber(
        detailedTechnician.current_latitude,
      ) ??
      toFiniteNumber(
        lastPosition?.latitude,
      );

    const longitude =
      toFiniteNumber(
        detailedTechnician.current_longitude,
      ) ??
      toFiniteNumber(
        lastPosition?.longitude,
      );

    const speed = toFiniteNumber(
      lastPosition?.speed,
    );

    const heading = toFiniteNumber(
      lastPosition?.heading,
    );

    const lastUpdate =
      detailedTechnician.last_location_update ||
      lastPosition?.recorded_at;

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{
            marginBottom: 12,
          }}
        >
          Position GPS
        </div>

        <div className="ie-detail-section">
          <div className="ie-detail-section-title">
            Dernière position
          </div>

          <div className="ie-detail-grid">
            <div>
              <span>Latitude</span>
              <strong className="ie-detail-mono">
                {formatCoordinate(latitude)}
              </strong>
            </div>

            <div>
              <span>Longitude</span>
              <strong className="ie-detail-mono">
                {formatCoordinate(longitude)}
              </strong>
            </div>

            <div>
              <span>Vitesse</span>
              <strong>
                {formatGroundSpeedKmh(speed)}
              </strong>
            </div>

            <div>
              <span>Cap</span>
              <strong>
                {heading === null
                  ? "—"
                  : `${formatNumber(
                      heading,
                    )}°`}
              </strong>
            </div>

            <div>
              <span>Mise à jour</span>
              <strong className="ie-detail-mono">
                {formatDateTime(lastUpdate)}
              </strong>
            </div>
          </div>
        </div>

        {gpsHistory.length === 0 ? (
          <div style={EMPTY_STATE_STYLE}>
            Aucun historique GPS
          </div>
        ) : (
          <div className="ie-detail-section">
            <div className="ie-detail-section-title">
              Historique GPS (
              {gpsHistory.length} point
              {gpsHistory.length !== 1
                ? "s"
                : ""}
              )
            </div>

            <div
              style={{
                overflowX: "auto",
              }}
            >
              <div
                style={{
                  minWidth: 520,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    ...TABLE_HEADER_STYLE,
                    gridTemplateColumns:
                      "1.5fr 1fr 1fr 0.8fr 0.8fr",
                  }}
                >
                  <span>Date</span>
                  <span>Latitude</span>
                  <span>Longitude</span>
                  <span>Vitesse</span>
                  <span>Cap</span>
                </div>

                {gpsHistory.map(
                  (position, index) => (
                    <div
                      key={`${position.recorded_at ?? "gps"}-${index}`}
                      style={{
                        ...TABLE_ROW_STYLE,
                        gridTemplateColumns:
                          "1.5fr 1fr 1fr 0.8fr 0.8fr",
                        fontFamily:
                          "var(--font-mono)",
                        fontSize: 10,
                        background:
                          index % 2 === 0
                            ? "transparent"
                            : "var(--surface-panel-alt)",
                      }}
                    >
                      <span
                        style={{
                          color:
                            "var(--text-muted)",
                        }}
                      >
                        {formatDateTime(
                          position.recorded_at,
                        )}
                      </span>

                      <span>
                        {formatCoordinate(
                          position.latitude,
                        )}
                      </span>

                      <span>
                        {formatCoordinate(
                          position.longitude,
                        )}
                      </span>

                      <span>
                        {formatGroundSpeedKmh(
                          position.speed,
                        )}
                      </span>

                      <span>
                        {toFiniteNumber(
                          position.heading,
                        ) === null
                          ? "—"
                          : `${formatNumber(
                              position.heading,
                            )}°`}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKpi = () => {
    const kpi = isRecord(data?.kpi)
      ? data.kpi
      : null;

    if (!kpi) {
      return (
        <div style={EMPTY_STATE_STYLE}>
          Aucun indicateur disponible
        </div>
      );
    }

    const completionRate =
      toFiniteNumber(kpi.completion_rate);

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{
            marginBottom: 12,
          }}
        >
          Indicateurs de performance
        </div>

        <div
          className="ie-detail-grid"
          style={{
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <div>
            <span>Interventions analysées</span>
            <strong
              style={{
                fontSize: 18,
              }}
            >
              {formatNumber(
                kpi.total_jobs,
                "0",
              )}
            </strong>
          </div>

          <div>
            <span>Aujourd’hui</span>
            <strong
              style={{
                fontSize: 18,
              }}
            >
              {formatNumber(
                kpi.today_jobs,
                "0",
              )}
            </strong>
          </div>

          <div>
            <span>Cette semaine</span>
            <strong
              style={{
                fontSize: 18,
              }}
            >
              {formatNumber(
                kpi.week_jobs,
                "0",
              )}
            </strong>
          </div>

          <div>
            <span>Taux de réussite</span>
            <strong
              style={{
                fontSize: 18,
                color:
                  completionRate !== null &&
                  completionRate >= 80
                    ? "var(--color-success)"
                    : "var(--color-warning)",
              }}
            >
              {formatPercentage(
                kpi.completion_rate,
              )}
            </strong>
          </div>

          <div>
            <span>Temps moyen</span>
            <strong>
              {formatDuration(
                kpi.avg_duration_minutes,
              )}
            </strong>
          </div>

          <div>
            <span>Terminées</span>
            <strong
              style={{
                color:
                  "var(--color-success)",
              }}
            >
              {formatNumber(
                kpi.completed_jobs,
                "0",
              )}
            </strong>
          </div>

          <div>
            <span>Échecs</span>
            <strong
              style={{
                color:
                  toFiniteNumber(
                    kpi.failed_jobs,
                  ) > 0
                    ? "var(--color-danger)"
                    : "inherit",
              }}
            >
              {formatNumber(
                kpi.failed_jobs,
                "0",
              )}
            </strong>
          </div>
        </div>
      </div>
    );
  };

  const renderActivity = () => {
    if (timeline.length === 0) {
      return (
        <div className="ie-tl-empty">
          Aucune activité enregistrée
        </div>
      );
    }

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{
            marginBottom: 12,
          }}
        >
          Journal d’activité
        </div>

        <div className="ie-tl-list">
          {timeline.map((activity, index) => {
            const isLast =
              index === timeline.length - 1;

            const normalizedAction =
              normalizeComparableText(
                activity.action,
              );

            const timelineType =
              TIMELINE_TYPES[
                normalizedAction
              ] || "info";

            return (
              <div
                key={
                  activity.id ??
                  `${activity.job_id ?? "activity"}-${activity.created_at ?? index}`
                }
                className={`ie-tl-item ie-tl-item--${timelineType}`}
              >
                <div className="ie-tl-dot" />

                {!isLast && (
                  <div className="ie-tl-line" />
                )}

                <span className="ie-tl-time">
                  {formatDateTime(
                    activity.created_at,
                  )}
                </span>

                <div className="ie-tl-content">
                  <div className="ie-tl-msg">
                    <strong>
                      {formatActionLabel(
                        activity.action,
                      )}
                    </strong>

                    {normalizeText(
                      activity.description,
                    ) && (
                      <>
                        {" — "}
                        {normalizeText(
                          activity.description,
                        )}
                      </>
                    )}
                  </div>

                  {activity.job_id && (
                    <div
                      style={{
                        fontSize: 10,
                        color:
                          "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      Intervention #
                      {activity.job_id}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const tabRenderers = {
    general: renderGeneral,
    skills: renderSkills,
    equipment: renderEquipment,
    stock: renderStock,
    history: renderHistory,
    gps: renderGps,
    kpi: renderKpi,
    activity: renderActivity,
  };

  const technicianName =
    normalizeText(detailedTechnician.name) ||
    normalizeText(initialTech.name) ||
    "Technicien";

  const activeRenderer =
    tabRenderers[tab] ||
    tabRenderers.general;

  return (
    <FloatingWindow
      title={`${technicianName} — Fiche technicien`}
      onClose={onClose}
      defaultPos={{
        x: 260,
        y: 80,
      }}
      defaultSize={{
        w: 580,
        h: 660,
      }}
      minSize={{
        w: 440,
        h: 400,
      }}
      zIndex={1700}
    >
      <div
        className="pe-detail-tabs"
        role="tablist"
        aria-label="Sections de la fiche technicien"
        style={{
          background:
            "var(--surface-panel-alt)",
          borderBottom:
            "1px solid var(--border-color)",
          display: "flex",
          gap: 0,
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {TABS.map((tabItem) => {
          const isActive =
            tab === tabItem.id;

          return (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`technician-panel-${tabItem.id}`}
              className={`pe-detail-tab ${
                isActive
                  ? "pe-detail-tab--active"
                  : ""
              }`}
              onClick={() =>
                setTab(tabItem.id)
              }
              style={{
                padding: "4px 10px",
                background: "none",
                border: "none",
                borderRight:
                  "1px solid var(--border-color)",
                color: isActive
                  ? "var(--color-accent)"
                  : "var(--text-muted)",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily:
                  "var(--font-family)",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                borderBottom: isActive
                  ? "2px solid var(--color-accent)"
                  : "2px solid transparent",
              }}
            >
              <span aria-hidden="true">
                {tabItem.icon}
              </span>{" "}
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div
        id={`technician-panel-${tab}`}
        className="ie-detail-body"
        role="tabpanel"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 12px",
        }}
      >
        {loadError && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent:
                "space-between",
              gap: 12,
              padding: "8px 10px",
              marginBottom: 10,
              borderRadius: 4,
              border:
                "1px solid var(--color-danger)",
              background:
                "var(--color-danger-dim)",
              color:
                "var(--color-danger)",
              fontSize: 11,
            }}
          >
            <span>{loadError}</span>

            <button
              type="button"
              className="btn btn--sm"
              onClick={() =>
                loadDetails({
                  showLoading: true,
                })
              }
              disabled={loading}
            >
              Réessayer
            </button>
          </div>
        )}

        {loading && !data ? (
          <div style={EMPTY_STATE_STYLE}>
            Chargement...
          </div>
        ) : (
          activeRenderer()
        )}
      </div>
    </FloatingWindow>
  );
}
