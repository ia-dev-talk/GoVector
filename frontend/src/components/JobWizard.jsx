import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';
import MapPicker from './MapPicker';
import {
  ZONES,
  getNearestZone,
} from '../lib/zones';
import {
  applyResolvedAddress,
  geocodingSummary,
} from '../lib/geocoding';
import {
  JOB_TYPES_CONFIG,
  PANNE_TYPES,
  WIZARD_STEPS,
} from '../lib/job-types';
import '../styles/wizard.css';

const LAST_STEP_INDEX = 5;

const NETWORK_REQUIRED_FIELDS =
  new Set([
    'nro',
    'sro',
    'pbo',
    'splitter',
    'splitter_port',
    'pto',
  ]);

const TECHNICIAN_STATUS = {
  disponible: {
    label: 'Disponible',
    className: 'available',
    rank: 0,
  },
  en_route: {
    label: 'En route',
    className: 'busy',
    rank: 1,
  },
  en_intervention: {
    label: 'En intervention',
    className: 'busy',
    rank: 2,
  },
  en_tache: {
    label: 'En intervention',
    className: 'busy',
    rank: 2,
  },
  pause: {
    label: 'En pause',
    className: 'busy',
    rank: 3,
  },
  hors_service: {
    label: 'Hors service',
    className: 'busy',
    rank: 4,
  },
  deconnecte: {
    label: 'Déconnecté',
    className: 'busy',
    rank: 5,
  },
};

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function asRecords(value) {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function comparableText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function normalizeStatus(value) {
  return comparableText(value)
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function sameIdentifier(first, second) {
  const firstText =
    normalizeText(first);
  const secondText =
    normalizeText(second);

  return (
    firstText !== '' &&
    secondText !== '' &&
    firstText === secondText
  );
}

function inputValue(value, fallback = '') {
  return value === null ||
    value === undefined
    ? fallback
    : value;
}

function optionalText(value) {
  const normalized =
    normalizeText(value);

  return normalized || null;
}

function optionalNumber(value) {
  if (normalizeText(value) === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function requiredNumber(value, fallback) {
  if (normalizeText(value) === '') {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');
  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function dateInputValue(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return Number.isNaN(
      value.getTime(),
    )
      ? ''
      : localDateString(value);
  }

  const normalized =
    normalizeText(value);

  const directMatch =
    normalized.match(
      /^(\d{4}-\d{2}-\d{2})/,
    );

  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(
    normalized,
  );

  return Number.isNaN(
    parsed.getTime(),
  )
    ? ''
    : localDateString(parsed);
}

function uniqueStringList(value) {
  const source = Array.isArray(value)
    ? value
    : normalizeText(value)
      .split(',');

  const result = [];
  const known = new Set();

  source.forEach((item) => {
    const normalized =
      normalizeText(
        isRecord(item)
          ? item.name ??
              item.label ??
              item.code
          : item,
      );

    const comparable =
      comparableText(normalized);

    if (
      !comparable ||
      known.has(comparable)
    ) {
      return;
    }

    known.add(comparable);
    result.push(normalized);
  });

  return result;
}

function resolveAssignedTechnicianId(data) {
  if (!isRecord(data)) {
    return '';
  }

  return inputValue(
    data.assigned_tech_id ??
      data.assigned_technician_id ??
      data.technician_id ??
      data.assignment
        ?.technician_id,
    '',
  );
}

function resolveAssignedTechnicianName(data) {
  if (!isRecord(data)) {
    return '';
  }

  return normalizeText(
    data.assigned_tech_name ??
      data.assigned_technician_name ??
      data.technician_name ??
      data.assignment
        ?.technician?.name,
  );
}

function createInitialForm(data) {
  const initial = isRecord(data)
    ? data
    : {};

  return {
    job_type:
      inputValue(
        initial.job_type,
      ),

    customer_name:
      inputValue(
        initial.customer_name,
      ),
    customer_phone:
      inputValue(
        initial.customer_phone,
      ),
    customer_email:
      inputValue(
        initial.customer_email,
      ),
    service_address:
      inputValue(
        initial.service_address,
      ),
    service_city:
      inputValue(
        initial.service_city,
      ),
    service_zip:
      inputValue(
        initial.service_zip,
      ),
    latitude:
      inputValue(
        initial.latitude,
        '',
      ),
    longitude:
      inputValue(
        initial.longitude,
        '',
      ),
    operator:
      inputValue(
        initial.operator,
      ),
    route_criteria:
      inputValue(
        initial.route_criteria,
      ),
    priority:
      inputValue(
        initial.priority,
        'NORMALE',
      ),
    notes:
      inputValue(
        initial.notes,
      ),

    nro: inputValue(initial.nro),
    sro: inputValue(initial.sro),
    pbo: inputValue(initial.pbo),
    splitter:
      inputValue(
        initial.splitter,
      ),
    splitter_port:
      inputValue(
        initial.splitter_port,
      ),
    pto: inputValue(initial.pto),
    optical_power_dbm:
      inputValue(
        initial.optical_power_dbm,
      ),
    cable_length_m:
      inputValue(
        initial.cable_length_m,
      ),
    type_cable:
      inputValue(
        initial.type_cable,
      ),

    ont_serial:
      inputValue(
        initial.ont_serial,
      ),
    router_serial:
      inputValue(
        initial.router_serial,
      ),
    mac_address:
      inputValue(
        initial.mac_address,
      ),
    ticket_number:
      inputValue(
        initial.ticket_number,
      ),
    panne_type:
      inputValue(
        initial.panne_type,
      ),
    manipulations_realisees:
      inputValue(
        initial.manipulations_realisees,
      ),
    ancien_operateur:
      inputValue(
        initial.ancien_operateur,
      ),
    nouvel_operateur:
      inputValue(
        initial.nouvel_operateur,
      ),
    ancien_ont_serial:
      inputValue(
        initial.ancien_ont_serial,
      ),
    ancien_router_serial:
      inputValue(
        initial.ancien_router_serial,
      ),
    port_source:
      inputValue(
        initial.port_source,
      ),
    port_destination:
      inputValue(
        initial.port_destination,
      ),
    nombre_fibres:
      inputValue(
        initial.nombre_fibres,
      ),
    boite_raccordement:
      inputValue(
        initial.boite_raccordement,
      ),
    reserve_cable:
      inputValue(
        initial.reserve_cable,
      ),
    etat_pbo:
      inputValue(
        initial.etat_pbo,
      ),
    etat_pto:
      inputValue(
        initial.etat_pto,
      ),
    etat_cable:
      inputValue(
        initial.etat_cable,
      ),
    anomalies:
      inputValue(
        initial.anomalies,
      ),

    assigned_technician_id:
      resolveAssignedTechnicianId(
        initial,
      ),
    assigned_technician_name:
      resolveAssignedTechnicianName(
        initial,
      ),
    scheduled_date:
      dateInputValue(
        initial.scheduled_date,
      ) || localDateString(),
    time_slot_start:
      inputValue(
        initial.time_slot_start,
        '08:00',
      ),
    time_slot_end:
      inputValue(
        initial.time_slot_end,
        '10:00',
      ),
    estimated_duration:
      inputValue(
        initial.estimated_duration,
        60,
      ),
    required_skills:
      uniqueStringList(
        initial.required_skills,
      ).join(', '),
  };
}

function getTechnicianName(technician) {
  return normalizeText(
    technician?.name ??
      technician?.full_name ??
      technician?.username,
  );
}

function getTechnicianStatus(technician) {
  const key = normalizeStatus(
    technician?.live_status ??
      technician?.status,
  );

  if (TECHNICIAN_STATUS[key]) {
    return TECHNICIAN_STATUS[key];
  }

  return {
    label:
      normalizeText(
        technician?.live_status ??
          technician?.status,
      ).replace(/_/g, ' ') ||
      'Statut non renseigné',
    className: 'busy',
    rank: 10,
  };
}

function getApiErrorMessage(
  error,
  fallback,
) {
  const detail =
    error?.response?.data?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        isRecord(item)
          ? normalizeText(
              item.msg ??
                item.message,
            )
          : normalizeText(item),
      )
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(' · ');
    }
  }

  if (isRecord(detail)) {
    const message = normalizeText(
      detail.message ??
        detail.msg,
    );

    if (message) {
      return message;
    }
  }

  return (
    normalizeText(error?.message) ||
    fallback
  );
}

function Field({
  id,
  label,
  required = false,
  error,
  hint,
  full = false,
  children,
}) {
  const errorId = error
    ? `${id}-error`
    : '';

  const hintId = hint
    ? `${id}-hint`
    : '';

  let control = children;

  if (isValidElement(children)) {
    const currentDescribedBy =
      normalizeText(
        children.props[
          'aria-describedby'
        ],
      );

    const describedBy = [
      currentDescribedBy,
      hintId,
      errorId,
    ]
      .filter(Boolean)
      .join(' ');

    control = cloneElement(
      children,
      {
        id,
        className: [
          children.props.className,
          error ? 'error' : '',
        ]
          .filter(Boolean)
          .join(' '),
        'aria-invalid':
          error
            ? true
            : children.props[
                'aria-invalid'
              ],
        'aria-describedby':
          describedBy ||
          undefined,
      },
    );
  }

  return (
    <div
      className={[
        'wizard-field',
        full
          ? 'step-details-full'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label htmlFor={id}>
        {label}
        {required ? ' *' : ''}
      </label>

      {control}

      {hint && (
        <span
          id={hintId}
          style={{
            color:
              'var(--text-muted)',
            fontSize:
              'var(--font-size-xs)',
            lineHeight: 1.3,
          }}
        >
          {hint}
        </span>
      )}

      {error && (
        <span
          id={errorId}
          className="field-error"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}

function SummaryField({
  label,
  value,
  missingWhenEmpty = true,
}) {
  const hasValue =
    normalizeText(value) !== '';

  return (
    <div className="validation-field">
      <span className="validation-field-label">
        {label}
      </span>

      <span
        className={[
          'validation-field-value',
          missingWhenEmpty &&
          !hasValue
            ? 'missing'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {hasValue
          ? value
          : 'Non renseigné'}
      </span>
    </div>
  );
}

function NetworkNode({
  icon,
  label,
  active,
  children,
}) {
  return (
    <>
      <div className="ftth-tree-node">
        <span
          className="ftth-tree-node-icon"
          aria-hidden="true"
        >
          {icon}
        </span>

        <span className="ftth-tree-node-label">
          {label}
        </span>

        {children}
      </div>

      {active !== undefined && (
        <div
          className={[
            'ftth-tree-arrow',
            active ? 'active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          ↓
        </div>
      )}
    </>
  );
}

export default function JobWizard({
  onClose,
  onCreated,
  initialData = null,
}) {
  const wizardId = useId();
  const titleId =
    `${wizardId}-title`;

  const isEdit =
    Boolean(initialData?.id);

  const containerRef =
    useRef(null);
  const bodyRef = useRef(null);
  const stepHeadingRef =
    useRef(null);
  const previousFocusRef =
    useRef(null);
  const technicianRequestRef =
    useRef(0);
  const originalTechnicianIdRef =
    useRef(
      resolveAssignedTechnicianId(
        initialData,
      ) || null,
    );

  const [step, setStep] =
    useState(0);

  const [form, setForm] =
    useState(() =>
      createInitialForm(
        initialData,
      ),
    );

  const [technicians, setTechnicians] =
    useState([]);

  const [
    techniciansLoading,
    setTechniciansLoading,
  ] = useState(false);

  const [
    techniciansError,
    setTechniciansError,
  ] = useState('');

  const [errors, setErrors] =
    useState({});

  const [
    submitError,
    setSubmitError,
  ] = useState('');

  const [
    savedOutcome,
    setSavedOutcome,
  ] = useState(null);

  const [submitting, setSubmitting] =
    useState(false);

  const [geocoding, setGeocoding] =
    useState(false);

  const [geocodingOutcome, setGeocodingOutcome] =
    useState(null);

  const [geocodingError, setGeocodingError] =
    useState('');

  const typeConfig =
    form.job_type
      ? JOB_TYPES_CONFIG[
          form.job_type
        ]
      : null;

  const fieldId = useCallback(
    (name) =>
      `${wizardId}-${name}`,
    [wizardId],
  );

  const loadTechnicians =
    useCallback(async () => {
      const requestId =
        technicianRequestRef.current +
        1;

      technicianRequestRef.current =
        requestId;

      setTechniciansLoading(true);
      setTechniciansError('');

      try {
        const response =
          await api.getTechnicians();

        if (
          requestId !==
          technicianRequestRef.current
        ) {
          return;
        }

        const data =
          Array.isArray(
            response?.data,
          )
            ? response.data
            : (
                Array.isArray(
                  response?.data?.items,
                )
                  ? response.data.items
                  : []
              );

        setTechnicians(
          asRecords(data).filter(
            (technician) =>
              technician.is_active !==
              false,
          ),
        );
      } catch (error) {
        if (
          requestId !==
          technicianRequestRef.current
        ) {
          return;
        }

        setTechnicians([]);
        setTechniciansError(
          getApiErrorMessage(
            error,
            'Impossible de charger les techniciens.',
          ),
        );
      } finally {
        if (
          requestId ===
          technicianRequestRef.current
        ) {
          setTechniciansLoading(
            false,
          );
        }
      }
    }, []);

  useEffect(() => {
    loadTechnicians();

    return () => {
      technicianRequestRef.current +=
        1;
    };
  }, [loadTechnicians]);

  const sortedTechnicians =
    useMemo(() => {
      return [...technicians].sort(
        (first, second) => {
          const firstStatus =
            getTechnicianStatus(
              first,
            );
          const secondStatus =
            getTechnicianStatus(
              second,
            );

          if (
            firstStatus.rank !==
            secondStatus.rank
          ) {
            return (
              firstStatus.rank -
              secondStatus.rank
            );
          }

          return getTechnicianName(
            first,
          ).localeCompare(
            getTechnicianName(
              second,
            ),
            'fr',
          );
        },
      );
    }, [technicians]);

  const selectedTechnician =
    useMemo(() => {
      return (
        sortedTechnicians.find(
          (technician) =>
            sameIdentifier(
              technician.id ??
                technician
                  .technician_id,
              form.assigned_technician_id,
            ),
        ) || null
      );
    }, [
      form.assigned_technician_id,
      sortedTechnicians,
    ]);

  const availableCount =
    useMemo(
      () =>
        sortedTechnicians.filter(
          (technician) =>
            normalizeStatus(
              technician
                .live_status ??
                technician.status,
            ) === 'disponible',
        ).length,
      [sortedTechnicians],
    );

  useEffect(() => {
    if (
      sortedTechnicians.length === 0
    ) {
      return;
    }

    setForm((current) => {
      if (
        normalizeText(
          current
            .assigned_technician_id,
        )
      ) {
        const technician =
          sortedTechnicians.find(
            (item) =>
              sameIdentifier(
                item.id ??
                  item.technician_id,
                current
                  .assigned_technician_id,
              ),
          );

        if (
          technician &&
          !normalizeText(
            current
              .assigned_technician_name,
          )
        ) {
          return {
            ...current,
            assigned_technician_name:
              getTechnicianName(
                technician,
              ),
          };
        }

        return current;
      }

      const currentName =
        comparableText(
          current
            .assigned_technician_name,
        );

      if (!currentName) {
        return current;
      }

      const matches =
        sortedTechnicians.filter(
          (item) =>
            comparableText(
              getTechnicianName(item),
            ) === currentName,
        );

      if (matches.length !== 1) {
        return current;
      }

      const matchedId =
        matches[0].id ??
        matches[0].technician_id;

      if (
        isEdit &&
        !originalTechnicianIdRef
          .current
      ) {
        originalTechnicianIdRef.current =
          matchedId;
      }

      return {
        ...current,
        assigned_technician_id:
          matchedId,
      };
    });
  }, [
    isEdit,
    sortedTechnicians,
  ]);

  const closeWizard =
    useCallback(() => {
      if (submitting) {
        return;
      }

      if (
        typeof onClose ===
        'function'
      ) {
        onClose();
      }
    }, [onClose, submitting]);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const frame =
      window.requestAnimationFrame(
        () => {
          containerRef.current?.focus();
        },
      );

    return () => {
      window.cancelAnimationFrame(
        frame,
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

  useEffect(() => {
    const frame =
      window.requestAnimationFrame(
        () => {
          stepHeadingRef.current
            ?.focus();
        },
      );

    return () => {
      window.cancelAnimationFrame(
        frame,
      );
    };
  }, [step]);

  const handleDialogKeyDown =
    useCallback(
      (event) => {
        if (
          event.key === 'Escape'
        ) {
          event.preventDefault();
          closeWizard();
          return;
        }

        if (
          event.key !== 'Tab' ||
          !containerRef.current
        ) {
          return;
        }

        const focusable =
          Array.from(
            containerRef.current
              .querySelectorAll(
                [
                  'button:not([disabled])',
                  'input:not([disabled])',
                  'select:not([disabled])',
                  'textarea:not([disabled])',
                  '[href]',
                  '[tabindex]:not([tabindex="-1"])',
                ].join(','),
              ),
          ).filter(
            (element) =>
              !element.hasAttribute(
                'hidden',
              ),
          );

        if (
          focusable.length === 0
        ) {
          event.preventDefault();
          containerRef.current.focus();
          return;
        }

        const first = focusable[0];
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
      [closeWizard],
    );

  const update = useCallback(
    (name, value) => {
      if (
        submitting ||
        savedOutcome
      ) {
        return;
      }

      setForm((previous) => ({
        ...previous,
        [name]: value,
      }));

      setErrors((previous) => {
        if (!previous[name]) {
          return previous;
        }

        const next = {
          ...previous,
        };

        delete next[name];

        return next;
      });

      setSubmitError('');

      if (
        name === 'service_address' ||
        name === 'service_city' ||
        name === 'service_zip'
      ) {
        setGeocodingOutcome(null);
        setGeocodingError('');
      }
    },
    [
      savedOutcome,
      submitting,
    ],
  );

  const selectTechnician =
    useCallback(
      (technician) => {
        if (!technician) {
          update(
            'assigned_technician_id',
            '',
          );
          update(
            'assigned_technician_name',
            '',
          );
          return;
        }

        update(
          'assigned_technician_id',
          technician.id ??
            technician
              .technician_id,
        );

        update(
          'assigned_technician_name',
          getTechnicianName(
            technician,
          ),
        );
      },
      [update],
    );

  const resolveAddress = useCallback(async () => {
    const address = normalizeText(form.service_address);
    if (!address) {
      setErrors((previous) => ({
        ...previous,
        service_address: 'Saisissez une adresse avant la recherche.',
      }));
      return;
    }
    setGeocoding(true);
    setSubmitError('');
    setGeocodingOutcome(null);
    setGeocodingError('');
    try {
      const response = await api.resolvePreparedAddress({
        address,
        city: optionalText(form.service_city),
        postal_code: optionalText(form.service_zip),
        sector: optionalText(form.route_criteria),
      });
      const result = response?.data;
      if (!result?.resolved || result.latitude == null || result.longitude == null) {
        setGeocodingError(
          'Adresse non localisée avec une confiance suffisante. Aucun GPS n’a été enregistré ; vous pouvez choisir le point sur la carte ou laisser le technicien le confirmer.',
        );
        return;
      }
      setForm((previous) => applyResolvedAddress(previous, result, getNearestZone));
      setGeocodingOutcome(result);
      setErrors((previous) => {
        const next = { ...previous };
        delete next.latitude;
        delete next.longitude;
        delete next.service_address;
        return next;
      });
    } catch (error) {
      setGeocodingError(
        getApiErrorMessage(error, 'Recherche d’adresse indisponible.'),
      );
    } finally {
      setGeocoding(false);
    }
  }, [form.route_criteria, form.service_address, form.service_city, form.service_zip]);

  const validateStep =
    useCallback(
      (
        stepIndex,
        currentForm = form,
      ) => {
        const nextErrors = {};

        const currentTypeConfig =
          currentForm.job_type
            ? JOB_TYPES_CONFIG[
                currentForm.job_type
              ]
            : null;

        if (
          stepIndex === 0 &&
          !normalizeText(
            currentForm.job_type,
          )
        ) {
          nextErrors.job_type =
            'Choisissez un type d’intervention.';
        }

        if (stepIndex === 1) {
          const latitude = optionalNumber(
            currentForm.latitude,
          );
          const longitude = optionalNumber(
            currentForm.longitude,
          );

          if (
            latitude !== null &&
            (latitude < -90 || latitude > 90)
          ) {
            nextErrors.latitude =
              'Latitude invalide.';
          }

          if (
            longitude !== null &&
            (longitude < -180 || longitude > 180)
          ) {
            nextErrors.longitude =
              'Longitude invalide.';
          }

          if ((latitude === null) !== (longitude === null)) {
            nextErrors.latitude = 'Renseignez les deux coordonnées ou aucune.';
            nextErrors.longitude = 'Renseignez les deux coordonnées ou aucune.';
          }

          if (
            normalizeText(
              currentForm
                .customer_email,
            ) &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
              normalizeText(
                currentForm
                  .customer_email,
              ),
            )
          ) {
            nextErrors.customer_email =
              'Adresse e-mail invalide.';
          }

          if (
            !isEdit &&
            currentTypeConfig
              ?.required
              ?.includes(
                'operator',
              ) &&
            !normalizeText(
              currentForm.operator,
            )
          ) {
            nextErrors.operator =
              'Opérateur obligatoire pour ce type.';
          }
        }

        if (
          stepIndex === 2 &&
          !isEdit &&
          currentTypeConfig
        ) {
          currentTypeConfig.required
            .filter((name) =>
              NETWORK_REQUIRED_FIELDS.has(
                name,
              ),
            )
            .forEach((name) => {
              if (
                !normalizeText(
                  currentForm[name],
                )
              ) {
                nextErrors[name] =
                  'Champ obligatoire.';
              }
            });
        }

        if (
          stepIndex === 3 &&
          currentTypeConfig &&
          !isEdit
        ) {
          currentTypeConfig.required
            .filter(
              (name) =>
                name !== 'operator' &&
                !NETWORK_REQUIRED_FIELDS.has(
                  name,
                ),
            )
            .forEach((name) => {
              if (
                !normalizeText(
                  currentForm[name],
                )
              ) {
                nextErrors[name] =
                  'Champ obligatoire.';
              }
            });

          const cableLength =
            optionalNumber(
              currentForm
                .cable_length_m,
            );

          if (
            cableLength !== null &&
            cableLength < 0
          ) {
            nextErrors.cable_length_m =
              'La longueur ne peut pas être négative.';
          }

          [
            'splitter_port',
            'port_source',
            'port_destination',
          ].forEach((name) => {
            const value =
              optionalNumber(
                currentForm[name],
              );

            if (
              value !== null &&
              (
                !Number.isInteger(
                  value,
                ) ||
                value < 0
              )
            ) {
              nextErrors[name] =
                'Entier positif attendu.';
            }
          });

          const fibres =
            optionalNumber(
              currentForm
                .nombre_fibres,
            );

          if (
            fibres !== null &&
            (
              !Number.isInteger(
                fibres,
              ) ||
              fibres < 1
            )
          ) {
            nextErrors.nombre_fibres =
              'Entier supérieur ou égal à 1 attendu.';
          }
        }

        if (stepIndex === 4) {
          const duration = Number(
            currentForm
              .estimated_duration,
          );

          if (
            !Number.isFinite(
              duration,
            ) ||
            duration < 15 ||
            duration > 480
          ) {
            nextErrors.estimated_duration =
              'Durée comprise entre 15 et 480 minutes.';
          }

          const start =
            normalizeText(
              currentForm
                .time_slot_start,
            );

          const end =
            normalizeText(
              currentForm
                .time_slot_end,
            );

          if (
            start &&
            end &&
            end <= start
          ) {
            nextErrors.time_slot_end =
              'La fin doit être après le début.';
          }
        }

        return nextErrors;
      },
      [form, isEdit],
    );

  const goNext =
    useCallback(() => {
      const nextErrors =
        validateStep(step);

      setErrors(nextErrors);

      if (
        Object.keys(
          nextErrors,
        ).length > 0
      ) {
        return;
      }

      setStep((current) =>
        Math.min(
          current + 1,
          LAST_STEP_INDEX,
        ),
      );
    }, [step, validateStep]);

  const goPrevious =
    useCallback(() => {
      setErrors({});
      setSubmitError('');

      setStep((current) =>
        Math.max(
          current - 1,
          0,
        ),
      );
    }, []);

  const goToCompletedStep =
    useCallback(
      (targetStep) => {
        if (
          targetStep >= step ||
          submitting ||
          savedOutcome
        ) {
          return;
        }

        setErrors({});
        setSubmitError('');
        setStep(targetStep);
      },
      [
        savedOutcome,
        step,
        submitting,
      ],
    );

  const validateAll =
    useCallback(() => {
      const errorsByStep =
        new Map();

      for (
        let index = 0;
        index < LAST_STEP_INDEX;
        index += 1
      ) {
        const stepErrors =
          validateStep(index);

        if (
          Object.keys(
            stepErrors,
          ).length > 0
        ) {
          errorsByStep.set(
            index,
            stepErrors,
          );
        }
      }

      if (
        errorsByStep.size === 0
      ) {
        return null;
      }

      const firstInvalidStep =
        Math.min(
          ...errorsByStep.keys(),
        );

      return {
        step: firstInvalidStep,
        errors:
          errorsByStep.get(
            firstInvalidStep,
          ),
      };
    }, [validateStep]);

  const buildCreatePayload =
    useCallback(() => {
      return {
        customer_name:
          optionalText(
            form.customer_name,
          ),
        customer_phone:
          optionalText(
            form.customer_phone,
          ),
        customer_email:
          optionalText(
            form.customer_email,
          ),
        service_address:
          optionalText(
            form.service_address,
          ),
        service_city:
          optionalText(
            form.service_city,
          ),
        service_zip:
          optionalText(
            form.service_zip,
          ),
        latitude:
          requiredNumber(
            form.latitude,
            null,
          ),
        longitude:
          requiredNumber(
            form.longitude,
            null,
          ),
        job_type:
          normalizeText(
            form.job_type,
          ),
        priority:
          normalizeText(
            form.priority,
          ) || 'NORMALE',
        route_criteria:
          optionalText(
            form.route_criteria,
          ),
        operator:
          optionalText(
            form.operator,
          ),
        notes:
          optionalText(
            form.notes,
          ),

        nro: optionalText(form.nro),
        sro: optionalText(form.sro),
        pbo: optionalText(form.pbo),
        splitter:
          optionalText(
            form.splitter,
          ),
        splitter_port:
          optionalNumber(
            form.splitter_port,
          ),
        pto: optionalText(form.pto),
        optical_power_dbm:
          optionalNumber(
            form.optical_power_dbm,
          ),
        cable_length_m:
          optionalNumber(
            form.cable_length_m,
          ),
        ont_serial:
          optionalText(
            form.ont_serial,
          ),
        router_serial:
          optionalText(
            form.router_serial,
          ),
        mac_address:
          optionalText(
            form.mac_address,
          ),
        scheduled_date:
          form.scheduled_date
            ? `${form.scheduled_date}T00:00:00`
            : null,
        time_slot_start:
          optionalText(
            form.time_slot_start,
          ),
        time_slot_end:
          optionalText(
            form.time_slot_end,
          ),
        estimated_duration:
          requiredNumber(
            form.estimated_duration,
            60,
          ),
        required_skills:
          uniqueStringList(
            form.required_skills,
          ),

        // L'affectation réelle est créée
        // avec l'API /assignments.
        assigned_technician_name:
          null,
      };
    }, [form]);

  const buildUpdatePayload =
    useCallback(() => {
      return {
        customer_name:
          optionalText(
            form.customer_name,
          ),
        customer_phone:
          optionalText(
            form.customer_phone,
          ),
        customer_email:
          optionalText(
            form.customer_email,
          ),
        service_address:
          optionalText(
            form.service_address,
          ),
        service_city:
          optionalText(
            form.service_city,
          ),
        service_zip:
          optionalText(
            form.service_zip,
          ),
        latitude:
          requiredNumber(
            form.latitude,
            null,
          ),
        longitude:
          requiredNumber(
            form.longitude,
            null,
          ),
        priority:
          normalizeText(
            form.priority,
          ) || 'NORMALE',
        route_criteria:
          optionalText(
            form.route_criteria,
          ),
        notes:
          optionalText(
            form.notes,
          ),
        scheduled_date:
          form.scheduled_date
            ? `${form.scheduled_date}T00:00:00`
            : null,
        time_slot_start:
          optionalText(
            form.time_slot_start,
          ),
        time_slot_end:
          optionalText(
            form.time_slot_end,
          ),
        estimated_duration:
          requiredNumber(
            form.estimated_duration,
            60,
          ),
        required_skills:
          uniqueStringList(
            form.required_skills,
          ),
      };
    }, [form]);

  const syncAssignment =
    useCallback(
      async (
        jobId,
        nextTechnicianId,
      ) => {
        const previousTechnicianId =
          originalTechnicianIdRef
            .current;

        if (
          previousTechnicianId &&
          nextTechnicianId &&
          !sameIdentifier(
            previousTechnicianId,
            nextTechnicianId,
          )
        ) {
          await api.reassignAssignment(
            jobId,
            nextTechnicianId,
          );
        } else if (
          previousTechnicianId &&
          !nextTechnicianId
        ) {
          await api.unassignJob(
            jobId,
          );
        } else if (
          !previousTechnicianId &&
          nextTechnicianId
        ) {
          await api.createAssignment({
            job_id: jobId,
            technician_id:
              nextTechnicianId,
          });
        }

        originalTechnicianIdRef.current =
          nextTechnicianId || null;
      },
      [],
    );

  const submit =
    useCallback(async () => {
      if (
        submitting ||
        savedOutcome
      ) {
        return;
      }

      const validation =
        validateAll();

      if (validation) {
        setStep(validation.step);
        setErrors(
          validation.errors,
        );
        setSubmitError(
          'Corrigez les champs signalés avant l’enregistrement.',
        );
        return;
      }

      setSubmitting(true);
      setSubmitError('');
      setErrors({});

      let savedJobId =
        isEdit
          ? initialData?.id
          : null;

      let savedJobData =
        isEdit
          ? initialData
          : null;

      let operationStage =
        'job';

      try {
        let response;

        if (isEdit) {
          response =
            await api.updateJob(
              initialData.id,
              buildUpdatePayload(),
            );
        } else {
          response =
            await api.createJob(
              buildCreatePayload(),
            );
        }

        savedJobData =
          response?.data ??
          savedJobData;

        savedJobId =
          savedJobData?.id ??
          savedJobId;

        const selectedId =
          selectedTechnician
            ?.id ??
          selectedTechnician
            ?.technician_id ??
          (
            normalizeText(
              form
                .assigned_technician_id,
            )
              ? form
                  .assigned_technician_id
              : null
          );

        if (
          !savedJobId &&
          selectedId
        ) {
          throw new Error(
            'Intervention enregistrée, mais son identifiant est absent de la réponse.',
          );
        }

        operationStage =
          'assignment';

        if (savedJobId) {
          await syncAssignment(
            savedJobId,
            selectedId,
          );
        }

        operationStage =
          'refresh';

        if (
          typeof onCreated ===
          'function'
        ) {
          await Promise.resolve(
            onCreated(
              savedJobData,
            ),
          );
        }

        operationStage =
          'complete';

        if (
          typeof onClose ===
          'function'
        ) {
          onClose();
        }
      } catch (error) {
        const defaultMessage =
          isEdit
            ? 'Erreur lors de la modification.'
            : 'Erreur lors de la création.';

        const message =
          getApiErrorMessage(
            error,
            defaultMessage,
          );

        if (
          savedJobId &&
          operationStage !== 'job'
        ) {
          const partialMessage =
            operationStage ===
            'assignment'
              ? (
                  `L’intervention ${savedJobId} est enregistrée, ` +
                  `mais l’affectation n’a pas abouti : ${message}`
                )
              : (
                  `L’intervention ${savedJobId} est enregistrée, ` +
                  `mais le rafraîchissement de l’écran a échoué : ${message}`
                );

          setSavedOutcome({
            jobId: savedJobId,
            message:
              partialMessage,
          });
        } else {
          setSubmitError(message);
        }
      } finally {
        setSubmitting(false);
      }
    }, [
      buildCreatePayload,
      buildUpdatePayload,
      form.assigned_technician_id,
      initialData,
      isEdit,
      onClose,
      onCreated,
      savedOutcome,
      selectedTechnician,
      submitting,
      syncAssignment,
      validateAll,
    ]);

  const unsupportedEditHint =
    isEdit
      ? (
          'Lecture seule en modification : ' +
          'le contrat API actuel ne met pas à jour ce champ.'
        )
      : '';

  const renderStepType = () => (
    <div className="wizard-enter">
      <h3
        ref={stepHeadingRef}
        tabIndex="-1"
      >
        Quel type d’intervention ?
      </h3>

      {isEdit && (
        <div
          role="note"
          style={{
            marginBottom:
              'var(--space-lg)',
            padding:
              'var(--space-md)',
            color:
              'var(--text-secondary)',
            background:
              'var(--surface-panel-alt)',
            border:
              '1px solid var(--border-color)',
            borderRadius: 5,
          }}
        >
          Le type est affiché en lecture seule lors d’une modification.
        </div>
      )}

      <div
        className="step-type-grid"
        role="radiogroup"
        aria-label="Type d’intervention"
        aria-describedby={
          errors.job_type
            ? fieldId(
                'job_type-error',
              )
            : undefined
        }
      >
        {Object.entries(
          JOB_TYPES_CONFIG,
        ).map(([key, config]) => {
          const selected =
            form.job_type === key;

          return (
            <button
              key={key}
              type="button"
              className={[
                'type-card',
                selected
                  ? 'selected'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="radio"
              aria-checked={selected}
              disabled={
                isEdit ||
                submitting ||
                Boolean(
                  savedOutcome,
                )
              }
              onClick={() =>
                update(
                  'job_type',
                  key,
                )
              }
            >
              <span
                className="type-card-icon"
                aria-hidden="true"
              >
                {config.icon}
              </span>

              <span className="type-card-label">
                {config.label}
              </span>

              <span className="type-card-desc">
                {config.description}
              </span>

              <span className="type-card-meta">
                <span>
                  Durée moyenne :{' '}
                  {config.avgDuration}{' '}
                  min
                </span>

                <span>
                  Photos attendues :{' '}
                  {
                    config.expectedPhotos
                  }
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {errors.job_type && (
        <span
          id={fieldId(
            'job_type-error',
          )}
          className="field-error"
          role="alert"
          style={{
            display: 'block',
            marginTop:
              'var(--space-md)',
          }}
        >
          {errors.job_type}
        </span>
      )}
    </div>
  );

  const renderStepClient = () => (
    <div className="wizard-enter">
      <h3
        ref={stepHeadingRef}
        tabIndex="-1"
      >
        Informations client
      </h3>

      <div className="step-client-grid">
        <Field
          id={fieldId(
            'customer_name',
          )}
          label="Nom du client"
          error={
            errors.customer_name
          }
          hint="Facultatif à la création ; le dossier peut être enrichi ensuite."
        >
          <input
            value={
              form.customer_name
            }
            onChange={(event) =>
              update(
                'customer_name',
                event.target.value,
              )
            }
            autoComplete="name"
            placeholder="Nom complet du client"
            disabled={
              submitting ||
              Boolean(savedOutcome)
            }
          />
        </Field>

        <Field
          id={fieldId(
            'customer_phone',
          )}
          label="Téléphone"
        >
          <input
            type="tel"
            value={
              form.customer_phone
            }
            onChange={(event) =>
              update(
                'customer_phone',
                event.target.value,
              )
            }
            autoComplete="tel"
            placeholder="+212 …"
            disabled={
              submitting ||
              Boolean(savedOutcome)
            }
          />
        </Field>

        <Field
          id={fieldId(
            'customer_email',
          )}
          label="E-mail"
          error={
            errors.customer_email
          }
        >
          <input
            type="email"
            value={
              form.customer_email
            }
            onChange={(event) =>
              update(
                'customer_email',
                event.target.value,
              )
            }
            autoComplete="email"
            placeholder="client@exemple.com"
            disabled={
              submitting ||
              Boolean(savedOutcome)
            }
          />
        </Field>

        <Field
          id={fieldId(
            'service_zip',
          )}
          label="Code postal"
        >
          <input
            value={
              form.service_zip
            }
            onChange={(event) =>
              update(
                'service_zip',
                event.target.value,
              )
            }
            autoComplete="postal-code"
            disabled={
              submitting ||
              Boolean(savedOutcome)
            }
          />
        </Field>

        <div className="step-client-full">
          <Field
            id={fieldId(
              'service_address',
            )}
            label="Adresse"
            error={
              errors.service_address
            }
            hint="Peut être complétée plus tard par l’orienteur ou confirmée sur le terrain."
          >
            <input
              value={
                form.service_address
              }
              onChange={(event) =>
                update(
                  'service_address',
                  event.target.value,
                )
              }
              autoComplete="street-address"
              placeholder="Adresse de l’intervention"
              disabled={
                submitting ||
                Boolean(
                  savedOutcome,
                )
              }
            />
          </Field>
          <button
            type="button"
            className="wizard-geocode-button"
            onClick={resolveAddress}
            disabled={geocoding || submitting || Boolean(savedOutcome)}
          >
            {geocoding ? 'Recherche de la position…' : 'Localiser cette adresse sur la carte'}
          </button>
          {geocodingOutcome ? (
            <div className="wizard-geocode-result" role="status">
              <strong>Position trouvée</strong>
              <span>{geocodingSummary(geocodingOutcome)}</span>
              <small>Les champs déjà renseignés ont été conservés.</small>
            </div>
          ) : null}
          {geocodingError ? (
            <div className="wizard-geocode-result wizard-geocode-result--error" role="alert">
              <strong>Localisation impossible</strong>
              <span>{geocodingError}</span>
            </div>
          ) : null}
        </div>

        <Field
          id={fieldId(
            'service_city',
          )}
          label="Ville"
        >
          <input
            value={
              form.service_city
            }
            onChange={(event) =>
              update(
                'service_city',
                event.target.value,
              )
            }
            autoComplete="address-level2"
            placeholder="Casablanca"
            disabled={
              submitting ||
              Boolean(savedOutcome)
            }
          />
        </Field>

        <Field
          id={fieldId('operator')}
          label="Opérateur"
          required={
            !isEdit &&
            Boolean(
              typeConfig?.required
                ?.includes(
                  'operator',
                ),
            )
          }
          error={errors.operator}
          hint={
            isEdit
              ? unsupportedEditHint
              : ''
          }
        >
          <input
            list={fieldId('operator-options')}
            value={form.operator}
            onChange={(event) =>
              update(
                'operator',
                event.target.value,
              )
            }
            disabled={
              isEdit ||
              submitting ||
              Boolean(savedOutcome)
            }
            placeholder="IAM, ORANGE, INWI, UNIFIBER…"
          />
          <datalist id={fieldId('operator-options')}>
            <option value="IAM" />
            <option value="ORANGE" />
            <option value="INWI" />
            <option value="UNIFIBER" />
          </datalist>
        </Field>

        <Field
          id={fieldId('priority')}
          label="Priorité"
        >
          <select
            value={form.priority}
            onChange={(event) =>
              update(
                'priority',
                event.target.value,
              )
            }
            disabled={
              submitting ||
              Boolean(savedOutcome)
            }
          >
            <option value="FAIBLE">
              Faible
            </option>
            <option value="NORMALE">
              Normale
            </option>
            <option value="HAUTE">
              Haute
            </option>
            <option value="URGENT">
              Urgent
            </option>
          </select>
        </Field>

        <Field
          id={fieldId(
            'route_criteria',
          )}
          label="Secteur opérationnel"
        >
          <select
            value={
              form.route_criteria
            }
            onChange={(event) =>
              update(
                'route_criteria',
                event.target.value,
              )
            }
            disabled={
              submitting ||
              Boolean(savedOutcome)
            }
          >
            <option value="">
              Déterminer depuis la carte
            </option>

            {ZONES.map((zone) => {
              const value =
                normalizeText(
                  zone?.name ??
                    zone?.label ??
                    zone,
                );

              return value ? (
                <option
                  key={value}
                  value={value}
                >
                  {value}
                </option>
              ) : null;
            })}
          </select>
        </Field>

        <div className="step-client-full">
          <Field
            id={fieldId('notes')}
            label="Notes / commentaires"
          >
            <textarea
              rows={2}
              value={form.notes}
              onChange={(event) =>
                update(
                  'notes',
                  event.target.value,
                )
              }
              disabled={
                submitting ||
                Boolean(
                  savedOutcome,
                )
              }
            />
          </Field>
        </div>

        <div
          className="step-client-full"
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(2, minmax(0, 1fr))',
            gap:
              'var(--space-lg)',
          }}
        >
          <Field
            id={fieldId('latitude')}
            label="Latitude"
            error={errors.latitude}
          >
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              value={form.latitude}
              onChange={(event) =>
                update(
                  'latitude',
                  event.target.value,
                )
              }
              disabled={
                submitting ||
                Boolean(
                  savedOutcome,
                )
              }
            />
          </Field>

          <Field
            id={fieldId('longitude')}
            label="Longitude"
            error={errors.longitude}
          >
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              value={form.longitude}
              onChange={(event) =>
                update(
                  'longitude',
                  event.target.value,
                )
              }
              disabled={
                submitting ||
                Boolean(
                  savedOutcome,
                )
              }
            />
          </Field>
        </div>

        <div
          className="step-client-map"
          aria-label="Sélection de la position de l’intervention"
        >
          <MapPicker
            latitude={optionalNumber(form.latitude)}
            longitude={optionalNumber(form.longitude)}
            onChange={(latitude, longitude) => {
              if (
                submitting ||
                savedOutcome
              ) {
                return;
              }

              const zone =
                getNearestZone(
                  latitude,
                  longitude,
                );

              setForm((previous) => ({
                ...previous,
                latitude,
                longitude,
                route_criteria:
                  zone ||
                  previous
                    .route_criteria,
              }));

              setErrors((previous) => {
                const next = {
                  ...previous,
                };

                delete next.latitude;
                delete next.longitude;

                return next;
              });
            }}
          />
        </div>
      </div>
    </div>
  );

  const networkDisabled =
    isEdit ||
    submitting ||
    Boolean(savedOutcome);

  const renderStepNetwork = () => (
    <div className="wizard-enter">
      <h3
        ref={stepHeadingRef}
        tabIndex="-1"
      >
        Réseau FTTH
      </h3>

      {isEdit && (
        <div
          role="note"
          style={{
            marginBottom:
              'var(--space-lg)',
            padding:
              'var(--space-md)',
            color:
              'var(--text-secondary)',
            background:
              'var(--surface-panel-alt)',
            border:
              '1px solid var(--border-color)',
            borderRadius: 5,
          }}
        >
          Les champs réseau sont en lecture seule dans le contrat de modification actuel.
        </div>
      )}

      <div className="ftth-tree">
        <NetworkNode
          icon="🏢"
          label="NRO"
          active={Boolean(form.nro)}
        >
          <input
            id={fieldId('nro')}
            value={form.nro}
            onChange={(event) =>
              update(
                'nro',
                event.target.value,
              )
            }
            placeholder="NRO"
            disabled={networkDisabled}
            aria-invalid={
              errors.nro
                ? true
                : undefined
            }
          />
        </NetworkNode>

        <NetworkNode
          icon="🏗️"
          label="SRO"
          active={Boolean(form.sro)}
        >
          <input
            id={fieldId('sro')}
            value={form.sro}
            onChange={(event) =>
              update(
                'sro',
                event.target.value,
              )
            }
            placeholder="SRO"
            disabled={networkDisabled}
            aria-invalid={
              errors.sro
                ? true
                : undefined
            }
          />
        </NetworkNode>

        <NetworkNode
          icon="📦"
          label="PBO"
          active={Boolean(form.pbo)}
        >
          <input
            id={fieldId('pbo')}
            value={form.pbo}
            onChange={(event) =>
              update(
                'pbo',
                event.target.value,
              )
            }
            placeholder="PBO"
            disabled={networkDisabled}
            aria-invalid={
              errors.pbo
                ? true
                : undefined
            }
          />
        </NetworkNode>

        <NetworkNode
          icon="🔀"
          label="Splitter"
          active={Boolean(
            form.splitter,
          )}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'minmax(0, 1fr) 74px',
              gap:
                'var(--space-sm)',
              minWidth: 0,
            }}
          >
            <input
              id={fieldId(
                'splitter',
              )}
              value={form.splitter}
              onChange={(event) =>
                update(
                  'splitter',
                  event.target.value,
                )
              }
              placeholder="Splitter"
              disabled={
                networkDisabled
              }
            />

            <input
              id={fieldId(
                'splitter_port',
              )}
              type="number"
              min="0"
              step="1"
              value={
                form.splitter_port
              }
              onChange={(event) =>
                update(
                  'splitter_port',
                  event.target.value,
                )
              }
              placeholder="Port"
              disabled={
                networkDisabled
              }
              aria-label="Port du splitter"
              aria-invalid={
                errors.splitter_port
                  ? true
                  : undefined
              }
            />
          </div>
        </NetworkNode>

        <NetworkNode
          icon="🔌"
          label="PTO"
          active={Boolean(form.pto)}
        >
          <input
            id={fieldId('pto')}
            value={form.pto}
            onChange={(event) =>
              update(
                'pto',
                event.target.value,
              )
            }
            placeholder="PTO"
            disabled={networkDisabled}
          />
        </NetworkNode>

        <NetworkNode
          icon="📡"
          label="ONT"
          active={Boolean(
            form.ont_serial,
          )}
        >
          <input
            id={fieldId(
              'network_ont_serial',
            )}
            value={form.ont_serial}
            onChange={(event) =>
              update(
                'ont_serial',
                event.target.value,
              )
            }
            placeholder="Numéro de série ONT"
            disabled={networkDisabled}
          />
        </NetworkNode>

        <NetworkNode
          icon="📶"
          label="Routeur"
        >
          <input
            id={fieldId(
              'network_router_serial',
            )}
            value={
              form.router_serial
            }
            onChange={(event) =>
              update(
                'router_serial',
                event.target.value,
              )
            }
            placeholder="Numéro de série routeur"
            disabled={networkDisabled}
          />
        </NetworkNode>
      </div>

      {Object.entries(errors)
        .filter(([name]) =>
          NETWORK_REQUIRED_FIELDS.has(
            name,
          ),
        )
        .map(([name, message]) => (
          <span
            key={name}
            className="field-error"
            role="alert"
            style={{
              display: 'block',
              marginTop:
                'var(--space-sm)',
            }}
          >
            {name} : {message}
          </span>
        ))}
    </div>
  );

  const detailsDisabled =
    isEdit ||
    submitting ||
    Boolean(savedOutcome);

  const commonMeasurementFields = (
    <>
      <div className="details-section-title">
        Mesures
      </div>

      <Field
        id={fieldId(
          'optical_power_dbm',
        )}
        label="Puissance optique (dBm)"
      >
        <input
          type="number"
          step="0.1"
          value={
            form.optical_power_dbm
          }
          onChange={(event) =>
            update(
              'optical_power_dbm',
              event.target.value,
            )
          }
          placeholder="-18.5"
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'cable_length_m',
        )}
        label="Longueur de câble (m)"
        error={
          errors.cable_length_m
        }
      >
        <input
          type="number"
          min="0"
          step="0.1"
          value={
            form.cable_length_m
          }
          onChange={(event) =>
            update(
              'cable_length_m',
              event.target.value,
            )
          }
          placeholder="50"
          disabled={detailsDisabled}
        />
      </Field>
    </>
  );

  const renderInstallationDetails =
    () => (
      <>
        <div className="details-section-title">
          Installation FTTH
        </div>

        <Field
          id={fieldId(
            'ont_serial',
          )}
          label="Numéro de série ONT"
          required
          error={errors.ont_serial}
        >
          <input
            value={form.ont_serial}
            onChange={(event) =>
              update(
                'ont_serial',
                event.target.value,
              )
            }
            disabled={detailsDisabled}
          />
        </Field>

        <Field
          id={fieldId(
            'router_serial',
          )}
          label="Numéro de série routeur"
        >
          <input
            value={
              form.router_serial
            }
            onChange={(event) =>
              update(
                'router_serial',
                event.target.value,
              )
            }
            disabled={detailsDisabled}
          />
        </Field>

        <Field
          id={fieldId(
            'type_cable',
          )}
          label="Type de câble"
        >
          <input
            value={form.type_cable}
            onChange={(event) =>
              update(
                'type_cable',
                event.target.value,
              )
            }
            placeholder="G657A2"
            disabled={detailsDisabled}
          />
        </Field>

        <Field
          id={fieldId(
            'mac_address',
          )}
          label="Adresse MAC"
        >
          <input
            value={form.mac_address}
            onChange={(event) =>
              update(
                'mac_address',
                event.target.value,
              )
            }
            placeholder="AA:BB:CC:DD:EE:FF"
            disabled={detailsDisabled}
          />
        </Field>

        {commonMeasurementFields}
      </>
    );

  const renderRepairDetails = () => (
    <>
      <div className="details-section-title">
        Dépannage
      </div>

      <Field
        id={fieldId(
          'ticket_number',
        )}
        label="Numéro de ticket"
        required
        error={errors.ticket_number}
      >
        <input
          value={form.ticket_number}
          onChange={(event) =>
            update(
              'ticket_number',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId('panne_type')}
        label="Type de panne"
        required
        error={errors.panne_type}
      >
        <select
          value={form.panne_type}
          onChange={(event) =>
            update(
              'panne_type',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        >
          <option value="">
            -- Sélectionner --
          </option>

          {PANNE_TYPES.map(
            (panne) => (
              <option
                key={panne.value}
                value={panne.value}
              >
                {panne.label}
              </option>
            ),
          )}
        </select>
      </Field>

      <Field
        id={fieldId(
          'repair_ont_serial',
        )}
        label="ONT existant"
      >
        <input
          value={form.ont_serial}
          onChange={(event) =>
            update(
              'ont_serial',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'repair_router_serial',
        )}
        label="Routeur existant"
      >
        <input
          value={form.router_serial}
          onChange={(event) =>
            update(
              'router_serial',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'manipulations_realisees',
        )}
        label="Manipulations déjà réalisées"
        full
      >
        <textarea
          rows={3}
          value={
            form
              .manipulations_realisees
          }
          onChange={(event) =>
            update(
              'manipulations_realisees',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      {commonMeasurementFields}
    </>
  );

  const renderMigrationDetails = () => (
    <>
      <div className="details-section-title">
        Migration
      </div>

      <Field
        id={fieldId(
          'ancien_operateur',
        )}
        label="Ancien opérateur"
        required
        error={
          errors.ancien_operateur
        }
      >
        <select
          value={
            form.ancien_operateur
          }
          onChange={(event) =>
            update(
              'ancien_operateur',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        >
          <option value="">
            -- Sélectionner --
          </option>
          <option value="IAM">
            IAM
          </option>
          <option value="INWI">
            INWI
          </option>
          <option value="ORANGE">
            Orange
          </option>
        </select>
      </Field>

      <Field
        id={fieldId(
          'nouvel_operateur',
        )}
        label="Nouvel opérateur"
        required
        error={
          errors.nouvel_operateur
        }
      >
        <select
          value={
            form.nouvel_operateur
          }
          onChange={(event) =>
            update(
              'nouvel_operateur',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        >
          <option value="">
            -- Sélectionner --
          </option>
          <option value="IAM">
            IAM
          </option>
          <option value="INWI">
            INWI
          </option>
          <option value="ORANGE">
            Orange
          </option>
        </select>
      </Field>

      <Field
        id={fieldId(
          'ancien_ont_serial',
        )}
        label="Ancien ONT"
      >
        <input
          value={
            form.ancien_ont_serial
          }
          onChange={(event) =>
            update(
              'ancien_ont_serial',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'migration_ont_serial',
        )}
        label="Nouvel ONT"
      >
        <input
          value={form.ont_serial}
          onChange={(event) =>
            update(
              'ont_serial',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'ancien_router_serial',
        )}
        label="Ancien routeur"
      >
        <input
          value={
            form.ancien_router_serial
          }
          onChange={(event) =>
            update(
              'ancien_router_serial',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'migration_router_serial',
        )}
        label="Nouveau routeur"
      >
        <input
          value={form.router_serial}
          onChange={(event) =>
            update(
              'router_serial',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'port_source',
        )}
        label="Port source"
        error={errors.port_source}
      >
        <input
          type="number"
          min="0"
          step="1"
          value={form.port_source}
          onChange={(event) =>
            update(
              'port_source',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      <Field
        id={fieldId(
          'port_destination',
        )}
        label="Port destination"
        error={
          errors.port_destination
        }
      >
        <input
          type="number"
          min="0"
          step="1"
          value={
            form.port_destination
          }
          onChange={(event) =>
            update(
              'port_destination',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>
    </>
  );

  const renderConnectionDetails =
    () => (
      <>
        <div className="details-section-title">
          Raccordement
        </div>

        <Field
          id={fieldId(
            'nombre_fibres',
          )}
          label="Nombre de fibres"
          required
          error={
            errors.nombre_fibres
          }
        >
          <input
            type="number"
            min="1"
            step="1"
            value={
              form.nombre_fibres
            }
            onChange={(event) =>
              update(
                'nombre_fibres',
                event.target.value,
              )
            }
            disabled={detailsDisabled}
          />
        </Field>

        <Field
          id={fieldId(
            'boite_raccordement',
          )}
          label="Boîte de raccordement"
        >
          <input
            value={
              form
                .boite_raccordement
            }
            onChange={(event) =>
              update(
                'boite_raccordement',
                event.target.value,
              )
            }
            disabled={detailsDisabled}
          />
        </Field>

        <Field
          id={fieldId(
            'reserve_cable',
          )}
          label="Réserve de câble"
        >
          <input
            value={
              form.reserve_cable
            }
            onChange={(event) =>
              update(
                'reserve_cable',
                event.target.value,
              )
            }
            placeholder="5 m"
            disabled={detailsDisabled}
          />
        </Field>

        <Field
          id={fieldId(
            'connection_type_cable',
          )}
          label="Type de câble"
        >
          <input
            value={form.type_cable}
            onChange={(event) =>
              update(
                'type_cable',
                event.target.value,
              )
            }
            placeholder="G657A2"
            disabled={detailsDisabled}
          />
        </Field>

        {commonMeasurementFields}
      </>
    );

  const renderAuditDetails = () => (
    <>
      <div className="details-section-title">
        Audit
      </div>

      <Field
        id={fieldId('etat_pbo')}
        label="État PBO"
        required
        error={errors.etat_pbo}
      >
        <select
          value={form.etat_pbo}
          onChange={(event) =>
            update(
              'etat_pbo',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        >
          <option value="bon">
            Bon état
          </option>
          <option value="moyen">
            Moyen
          </option>
          <option value="mauvais">
            Mauvais
          </option>
          <option value="endommage">
            Endommagé
          </option>
        </select>
      </Field>

      <Field
        id={fieldId('etat_pto')}
        label="État PTO"
        required
        error={errors.etat_pto}
      >
        <select
          value={form.etat_pto}
          onChange={(event) =>
            update(
              'etat_pto',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        >
          <option value="bon">
            Bon état
          </option>
          <option value="moyen">
            Moyen
          </option>
          <option value="mauvais">
            Mauvais
          </option>
          <option value="endommage">
            Endommagé
          </option>
        </select>
      </Field>

      <Field
        id={fieldId(
          'etat_cable',
        )}
        label="État du câble"
      >
        <select
          value={form.etat_cable}
          onChange={(event) =>
            update(
              'etat_cable',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        >
          <option value="bon">
            Bon état
          </option>
          <option value="moyen">
            Moyen
          </option>
          <option value="mauvais">
            Mauvais
          </option>
          <option value="casse">
            Câble cassé
          </option>
        </select>
      </Field>

      <Field
        id={fieldId('anomalies')}
        label="Anomalies constatées"
        full
      >
        <textarea
          rows={3}
          value={form.anomalies}
          onChange={(event) =>
            update(
              'anomalies',
              event.target.value,
            )
          }
          disabled={detailsDisabled}
        />
      </Field>

      {commonMeasurementFields}
    </>
  );

  const detailRenderers = {
    INSTALLATION:
      renderInstallationDetails,
    DEPANNAGE:
      renderRepairDetails,
    MIGRATION:
      renderMigrationDetails,
    RACCORDEMENT:
      renderConnectionDetails,
    AUDIT: renderAuditDetails,
  };

  const renderStepDetails = () => {
    const renderer =
      detailRenderers[
        form.job_type
      ];

    return (
      <div className="wizard-enter">
        <h3
          ref={stepHeadingRef}
          tabIndex="-1"
        >
          Détails
          {typeConfig
            ? ` — ${typeConfig.label}`
            : ''}
        </h3>

        {isEdit && (
          <div
            role="note"
            style={{
              marginBottom:
                'var(--space-lg)',
              padding:
                'var(--space-md)',
              color:
                'var(--text-secondary)',
              background:
                'var(--surface-panel-alt)',
              border:
                '1px solid var(--border-color)',
              borderRadius: 5,
            }}
          >
            Les détails FTTH spécifiques sont en lecture seule lors d’une modification.
          </div>
        )}

        <div className="step-details-grid">
          {renderer ? (
            renderer()
          ) : (
            <div
              className="step-details-full"
              role="note"
            >
              Choisissez d’abord un type d’intervention.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStepAssignment = () => (
    <div className="wizard-enter">
      <h3
        ref={stepHeadingRef}
        tabIndex="-1"
      >
        Planification et affectation
      </h3>

      <div className="step-affectation-grid">
        <div>
          <label
            id={fieldId(
              'technician-list-label',
            )}
            style={{
              display: 'block',
              marginBottom:
                'var(--space-md)',
              color:
                'var(--text-secondary)',
              fontSize:
                'var(--font-size-sm)',
              fontWeight: 600,
            }}
          >
            Technicien facultatif
            {' · '}
            {availableCount}{' '}
            disponible
            {availableCount > 1
              ? 's'
              : ''}
            {' · '}
            {
              sortedTechnicians.length
            }{' '}
            chargé
            {sortedTechnicians.length >
            1
              ? 's'
              : ''}
          </label>

          <div
            className="affectation-tech-list"
            role="radiogroup"
            aria-labelledby={fieldId(
              'technician-list-label',
            )}
            aria-busy={
              techniciansLoading
            }
          >
            <button
              type="button"
              className={[
                'affectation-tech-item',
                !normalizeText(
                  form
                    .assigned_technician_id,
                )
                  ? 'selected'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="radio"
              aria-checked={
                !normalizeText(
                  form
                    .assigned_technician_id,
                )
              }
              onClick={() =>
                selectTechnician(null)
              }
              disabled={
                submitting ||
                Boolean(savedOutcome)
              }
              style={{
                width: '100%',
                borderLeft: 0,
                borderRight: 0,
                borderTop: 0,
                textAlign: 'left',
              }}
            >
              <span
                className="affectation-tech-avatar"
                aria-hidden="true"
              >
                —
              </span>

              <span className="affectation-tech-info">
                <span className="affectation-tech-name">
                  Non affectée
                </span>

                <span className="affectation-tech-status">
                  À affecter depuis l’espace interventions
                </span>
              </span>
            </button>

            {techniciansLoading && (
              <div
                role="status"
                style={{
                  padding:
                    'var(--space-xl)',
                  color:
                    'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                Chargement des techniciens…
              </div>
            )}

            {!techniciansLoading &&
              sortedTechnicians.map(
                (technician) => {
                  const technicianId =
                    technician.id ??
                    technician
                      .technician_id;

                  const name =
                    getTechnicianName(
                      technician,
                    ) ||
                    `Technicien ${technicianId}`;

                  const statusInfo =
                    getTechnicianStatus(
                      technician,
                    );

                  const selected =
                    sameIdentifier(
                      form
                        .assigned_technician_id,
                      technicianId,
                    );

                  return (
                    <button
                      key={
                        technicianId ??
                        name
                      }
                      type="button"
                      className={[
                        'affectation-tech-item',
                        selected
                          ? 'selected'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="radio"
                      aria-checked={
                        selected
                      }
                      onClick={() =>
                        selectTechnician(
                          technician,
                        )
                      }
                      disabled={
                        submitting ||
                        Boolean(
                          savedOutcome,
                        )
                      }
                      style={{
                        width: '100%',
                        borderLeft: 0,
                        borderRight: 0,
                        borderTop: 0,
                        textAlign:
                          'left',
                      }}
                    >
                      <span
                        className="affectation-tech-avatar"
                        aria-hidden="true"
                      >
                        {name
                          .charAt(0)
                          .toUpperCase()}
                      </span>

                      <span className="affectation-tech-info">
                        <span className="affectation-tech-name">
                          {name}
                        </span>

                        <span
                          className={[
                            'affectation-tech-status',
                            statusInfo
                              .className,
                          ].join(' ')}
                        >
                          {
                            statusInfo.label
                          }
                        </span>
                      </span>
                    </button>
                  );
                },
              )}

            {!techniciansLoading &&
              sortedTechnicians.length ===
                0 &&
              !techniciansError && (
                <div
                  style={{
                    padding:
                      'var(--space-xl)',
                    color:
                      'var(--text-muted)',
                    textAlign:
                      'center',
                  }}
                >
                  Aucun technicien actif trouvé.
                </div>
              )}
          </div>

          {techniciansError && (
            <div
              role="alert"
              style={{
                marginTop:
                  'var(--space-sm)',
                padding:
                  'var(--space-md)',
                color:
                  'var(--color-danger)',
                background:
                  'var(--color-danger-dim)',
                border:
                  '1px solid var(--color-danger)',
                borderRadius: 5,
              }}
            >
              <div>
                {techniciansError}
              </div>

              <button
                type="button"
                className="btn btn--secondary"
                onClick={
                  loadTechnicians
                }
                disabled={
                  techniciansLoading
                }
                style={{
                  marginTop:
                    'var(--space-sm)',
                }}
              >
                Réessayer
              </button>
            </div>
          )}
        </div>

        <div>
          <Field
            id={fieldId(
              'scheduled_date',
            )}
            label="Date prévue"
            required
            error={
              errors.scheduled_date
            }
          >
            <input
              type="date"
              value={
                form.scheduled_date
              }
              onChange={(event) =>
                update(
                  'scheduled_date',
                  event.target.value,
                )
              }
              disabled={
                submitting ||
                Boolean(
                  savedOutcome,
                )
              }
            />
          </Field>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(2, minmax(0, 1fr))',
              gap:
                'var(--space-md)',
              marginTop:
                'var(--space-lg)',
            }}
          >
            <Field
              id={fieldId(
                'time_slot_start',
              )}
              label="Début du créneau"
            >
              <input
                type="time"
                value={
                  form.time_slot_start
                }
                onChange={(event) =>
                  update(
                    'time_slot_start',
                    event.target.value,
                  )
                }
                disabled={
                  submitting ||
                  Boolean(
                    savedOutcome,
                  )
                }
              />
            </Field>

            <Field
              id={fieldId(
                'time_slot_end',
              )}
              label="Fin du créneau"
              error={
                errors.time_slot_end
              }
            >
              <input
                type="time"
                value={
                  form.time_slot_end
                }
                onChange={(event) =>
                  update(
                    'time_slot_end',
                    event.target.value,
                  )
                }
                disabled={
                  submitting ||
                  Boolean(
                    savedOutcome,
                  )
                }
              />
            </Field>
          </div>

          <div
            style={{
              marginTop:
                'var(--space-lg)',
            }}
          >
            <Field
              id={fieldId(
                'estimated_duration',
              )}
              label="Durée estimée (minutes)"
              error={
                errors
                  .estimated_duration
              }
            >
              <input
                type="number"
                min="15"
                max="480"
                step="1"
                value={
                  form
                    .estimated_duration
                }
                onChange={(event) =>
                  update(
                    'estimated_duration',
                    event.target.value,
                  )
                }
                disabled={
                  submitting ||
                  Boolean(
                    savedOutcome,
                  )
                }
              />
            </Field>
          </div>

          <div
            style={{
              marginTop:
                'var(--space-lg)',
            }}
          >
            <Field
              id={fieldId(
                'required_skills',
              )}
              label="Compétences requises"
              hint="Séparez les compétences par des virgules."
            >
              <input
                value={
                  form.required_skills
                }
                onChange={(event) =>
                  update(
                    'required_skills',
                    event.target.value,
                  )
                }
                placeholder="fibre, routeur, PON"
                disabled={
                  submitting ||
                  Boolean(
                    savedOutcome,
                  )
                }
              />
            </Field>
          </div>

          {typeConfig && (
            <div
              style={{
                marginTop:
                  'var(--space-lg)',
                padding:
                  'var(--space-lg)',
                color:
                  'var(--text-secondary)',
                fontSize:
                  'var(--font-size-sm)',
                lineHeight: 1.5,
                background:
                  'var(--surface-panel-alt)',
                border:
                  '1px solid var(--border-color)',
                borderRadius: 5,
              }}
            >
              <div>
                <strong>
                  Temps moyen :
                </strong>{' '}
                {typeConfig.avgDuration}{' '}
                min
              </div>

              <div>
                <strong>
                  Photos attendues :
                </strong>{' '}
                {
                  typeConfig.expectedPhotos
                }
              </div>

              <div>
                <strong>
                  Matériel :
                </strong>{' '}
                {Array.isArray(
                  typeConfig.material,
                ) &&
                typeConfig.material
                  .length > 0
                  ? typeConfig.material.join(
                      ', ',
                    )
                  : 'Non renseigné'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderStepSummary = () => (
    <div className="wizard-enter">
      <h3
        ref={stepHeadingRef}
        tabIndex="-1"
      >
        Récapitulatif
      </h3>

      <div className="validation-summary">
        <section className="validation-section">
          <div className="validation-section-title">
            Client et intervention
          </div>

          <SummaryField
            label="Type"
            value={typeConfig?.label}
          />
          <SummaryField
            label="Client"
            value={form.customer_name}
          />
          <SummaryField
            label="Adresse"
            value={
              form.service_address
            }
          />
          <SummaryField
            label="Ville"
            value={form.service_city}
          />
          <SummaryField
            label="Opérateur"
            value={form.operator}
          />
          <SummaryField
            label="Priorité"
            value={form.priority}
          />
        </section>

        <section className="validation-section">
          <div className="validation-section-title">
            Réseau FTTH
          </div>

          <SummaryField
            label="NRO"
            value={form.nro}
          />
          <SummaryField
            label="SRO"
            value={form.sro}
          />
          <SummaryField
            label="PBO"
            value={form.pbo}
          />
          <SummaryField
            label="Splitter"
            value={form.splitter}
          />
          <SummaryField
            label="PTO"
            value={form.pto}
          />
          <SummaryField
            label="ONT"
            value={form.ont_serial}
          />
        </section>

        <section className="validation-section">
          <div className="validation-section-title">
            Planification
          </div>

          <SummaryField
            label="Technicien"
            value={
              form
                .assigned_technician_name ||
              'Non affectée'
            }
            missingWhenEmpty={false}
          />
          <SummaryField
            label="Date"
            value={
              form.scheduled_date
            }
          />
          <SummaryField
            label="Créneau"
            value={
              form.time_slot_start &&
              form.time_slot_end
                ? (
                    `${form.time_slot_start} – ` +
                    `${form.time_slot_end}`
                  )
                : ''
            }
          />
          <SummaryField
            label="Durée"
            value={
              form
                .estimated_duration
                ? (
                    `${form.estimated_duration} min`
                  )
                : ''
            }
          />
          <SummaryField
            label="Secteur"
            value={
              form.route_criteria
            }
          />
        </section>

        <section className="validation-section">
          <div className="validation-section-title">
            Consignes
          </div>

          <SummaryField
            label="Notes"
            value={form.notes}
          />
          <SummaryField
            label="Compétences"
            value={
              uniqueStringList(
                form.required_skills,
              ).join(', ')
            }
          />
          <SummaryField
            label="Latitude"
            value={form.latitude}
          />
          <SummaryField
            label="Longitude"
            value={form.longitude}
          />
        </section>
      </div>
    </div>
  );

  const stepRenderers = [
    renderStepType,
    renderStepClient,
    renderStepNetwork,
    renderStepDetails,
    renderStepAssignment,
    renderStepSummary,
  ];

  const currentStepContent =
    (
      stepRenderers[step] ??
      renderStepType
    )();

  return (
    <div
      className="wizard-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closeWizard();
        }
      }}
    >
      <div
        ref={containerRef}
        className="wizard-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={
          submitError
            ? `${wizardId}-submit-error`
            : undefined
        }
        tabIndex="-1"
        onKeyDown={
          handleDialogKeyDown
        }
      >
        <h2
          id={titleId}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            margin: -1,
            overflow: 'hidden',
            clip:
              'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
          }}
        >
          {isEdit
            ? 'Modifier une intervention FTTH'
            : 'Créer une intervention FTTH'}
        </h2>

        <div className="wizard-header">
          <div className="wizard-progress">
            <div className="wizard-step-indicator">
              {WIZARD_STEPS.map(
                (
                  wizardStep,
                  index,
                ) => {
                  const active =
                    step === index;

                  const completed =
                    step > index;

                  return (
                    <div
                      key={
                        wizardStep.id
                      }
                      style={{
                        display:
                          'flex',
                        alignItems:
                          'center',
                        flex:
                          index <
                          WIZARD_STEPS.length -
                            1
                            ? 1
                            : 0,
                      }}
                    >
                      <button
                        type="button"
                        className={[
                          'wizard-step-dot',
                          active
                            ? 'active'
                            : '',
                          completed
                            ? 'completed'
                            : '',
                        ]
                          .filter(
                            Boolean,
                          )
                          .join(' ')}
                        onClick={() =>
                          goToCompletedStep(
                            index,
                          )
                        }
                        disabled={
                          !completed ||
                          submitting ||
                          Boolean(
                            savedOutcome,
                          )
                        }
                        aria-current={
                          active
                            ? 'step'
                            : undefined
                        }
                        aria-label={
                          `${index + 1}. ` +
                          wizardStep.label +
                          (
                            completed
                              ? ' — terminée'
                              : active
                                ? ' — étape actuelle'
                                : ''
                          )
                        }
                        title={
                          wizardStep.label
                        }
                      >
                        <span
                          className="step-icon"
                          aria-hidden="true"
                        >
                          {completed
                            ? '✓'
                            : wizardStep.icon}
                        </span>
                      </button>

                      {index <
                        WIZARD_STEPS.length -
                          1 && (
                        <div
                          className={[
                            'wizard-step-line',
                            completed
                              ? 'completed'
                              : '',
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(
                              ' ',
                            )}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>

          <div
            className="wizard-step-labels"
            aria-hidden="true"
          >
            {WIZARD_STEPS.map(
              (
                wizardStep,
                index,
              ) => (
                <span
                  key={wizardStep.id}
                  className={[
                    step === index
                      ? 'active'
                      : '',
                    step > index
                      ? 'completed'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {wizardStep.label}
                </span>
              ),
            )}
          </div>
        </div>

        <div
          ref={bodyRef}
          className="wizard-body"
        >
          {submitError && (
            <div
              id={`${wizardId}-submit-error`}
              role="alert"
              style={{
                marginBottom:
                  'var(--space-lg)',
                padding:
                  'var(--space-lg)',
                color:
                  'var(--color-danger)',
                background:
                  'var(--color-danger-dim)',
                border:
                  '1px solid var(--color-danger)',
                borderRadius: 5,
                overflowWrap:
                  'anywhere',
              }}
            >
              {submitError}
            </div>
          )}

          {savedOutcome && (
            <div
              role="status"
              style={{
                marginBottom:
                  'var(--space-lg)',
                padding:
                  'var(--space-lg)',
                color:
                  'var(--color-warning)',
                background:
                  'var(--color-warning-dim)',
                border:
                  '1px solid var(--color-warning)',
                borderRadius: 5,
                overflowWrap:
                  'anywhere',
              }}
            >
              {savedOutcome.message}
              <div
                style={{
                  marginTop:
                    'var(--space-sm)',
                  color:
                    'var(--text-secondary)',
                }}
              >
                L’intervention ne sera pas créée une seconde fois. Fermez cette fenêtre et utilisez l’espace d’affectation pour terminer l’opération.
              </div>
            </div>
          )}

          {currentStepContent}
        </div>

        <div className="wizard-footer">
          <div className="wizard-counter">
            {savedOutcome
              ? `Intervention ${savedOutcome.jobId} enregistrée`
              : (
                  `Étape ${step + 1} / ` +
                  `${WIZARD_STEPS.length}`
                )}
          </div>

          <div className="wizard-footer-actions">
            {savedOutcome ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={closeWizard}
              >
                Fermer
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={
                    step === 0
                      ? closeWizard
                      : goPrevious
                  }
                  disabled={submitting}
                >
                  {step === 0
                    ? 'Annuler'
                    : 'Retour'}
                </button>

                {step <
                LAST_STEP_INDEX ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={goNext}
                    disabled={submitting}
                  >
                    Suivant
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={submit}
                    disabled={submitting}
                    aria-busy={submitting}
                  >
                    {submitting
                      ? 'Enregistrement…'
                      : isEdit
                        ? 'Enregistrer les modifications'
                        : 'Créer l’intervention'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
