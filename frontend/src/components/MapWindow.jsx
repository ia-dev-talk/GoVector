import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import L from 'leaflet';
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import FloatingWindow from './FloatingWindow';
import { getJobTypeLabel } from '../lib/job-types';

const DEFAULT_CENTER = Object.freeze([
  33.5731,
  -7.5898,
]);

const DEFAULT_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

const DEFAULT_ATTRIBUTION =
  '&copy; OpenStreetMap contributors &copy; CARTO';

const STALE_POSITION_MS =
  30 * 60 * 1000;

const MARKER_CLICK_DELAY_MS = 220;

const TECH_POSITION_CONFIG = Object.freeze({
  active: {
    label: 'Position GPS active',
    color:
      'var(--color-info, #5b9bd5)',
    opacity: 1,
  },
  last_known: {
    label: 'Dernière position connue',
    color:
      'var(--text-muted, #9a9da4)',
    opacity: 0.58,
  },
  unknown: {
    label:
      'Position GPS disponible — état indéterminé',
    color:
      'var(--color-warning, #e5a834)',
    opacity: 0.82,
  },
});

const JOB_STATUS_CONFIG = Object.freeze({
  pending: {
    label: 'En attente',
    color:
      'var(--color-warning, #e5a834)',
  },
  assigned: {
    label: 'Affectée',
    color:
      'var(--color-info, #5b9bd5)',
  },
  en_route: {
    label: 'En route',
    color:
      'var(--color-info, #5b9bd5)',
  },
  on_site: {
    label: 'Sur site',
    color:
      'var(--color-accent, #4a9eff)',
  },
  work_in_progress: {
    label: 'Travail en cours',
    color:
      'var(--color-purple, #8e6ccf)',
  },
  in_progress: {
    label: 'En cours',
    color:
      'var(--color-purple, #8e6ccf)',
  },
  installation_done: {
    label: 'Installation terminée',
    color:
      'var(--color-success, #4caf6a)',
  },
  client_validation: {
    label: 'Validation client',
    color:
      'var(--color-accent, #4a9eff)',
  },
  en_attente_validation: {
    label: 'En attente de validation',
    color:
      'var(--color-warning, #e5a834)',
  },
  completed: {
    label: 'Terminée',
    color:
      'var(--color-success, #4caf6a)',
  },
  cancelled: {
    label: 'Annulée',
    color:
      'var(--color-danger, #e05555)',
  },
  failed: {
    label: 'Échec',
    color:
      'var(--color-danger, #e05555)',
  },
  on_hold: {
    label: 'En attente',
    color:
      'var(--text-muted, #9a9da4)',
  },
  client_absent: {
    label: 'Client absent',
    color:
      'var(--color-warning, #e5a834)',
  },
  postponed: {
    label: 'Reportée',
    color:
      'var(--color-warning, #e5a834)',
  },
  suspended: {
    label: 'Suspendue',
    color:
      'var(--text-muted, #9a9da4)',
  },
});

const iconCache = new Map();

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

function text(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function identifier(value) {
  return text(value) || null;
}

function normalizeStatus(value) {
  return text(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function classNames(...values) {
  return values
    .filter(
      (value) =>
        typeof value === 'string' &&
        value.trim(),
    )
    .map((value) => value.trim())
    .join(' ');
}

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function validCoordinates(
  latitude,
  longitude,
) {
  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(
      latitude === 0 &&
      longitude === 0
    )
  );
}

function coordinatesFrom(
  item,
  coordinatePairs,
) {
  if (!isRecord(item)) {
    return null;
  }

  for (const [
    latitudeField,
    longitudeField,
  ] of coordinatePairs) {
    const latitude =
      finiteNumber(
        item[latitudeField],
      );

    const longitude =
      finiteNumber(
        item[longitudeField],
      );

    if (
      validCoordinates(
        latitude,
        longitude,
      )
    ) {
      return [
        latitude,
        longitude,
      ];
    }
  }

  return null;
}

function technicianIdentifier(
  technician,
) {
  return identifier(
    technician?.id ??
      technician?.technician_id,
  );
}

function jobIdentifier(job) {
  return identifier(
    job?.id ??
      job?.job_id ??
      job?.job_number ??
      job?.command_number,
  );
}

function markerKey(
  prefix,
  itemIdentifier,
  position,
  sourceIndex,
) {
  return itemIdentifier
    ? `${prefix}:${itemIdentifier}`
    : [
        prefix,
        position[0],
        position[1],
        sourceIndex,
      ].join(':');
}

function technicianName(
  technician,
) {
  return (
    text(
      technician?.name ??
        technician?.full_name ??
        technician?.username,
    ) ||
    (
      technicianIdentifier(
        technician,
      )
        ? `Technicien #${technicianIdentifier(
            technician,
          )}`
        : 'Technicien'
    )
  );
}

function technicianPositionState(
  technician,
) {
  const status =
    normalizeStatus(
      technician?.live_status ??
        technician?.status,
    );

  let stale = false;

  if (
    technician
      ?.last_location_update
  ) {
    const updatedAt = new Date(
      technician.last_location_update,
    );

    if (
      !Number.isNaN(
        updatedAt.getTime(),
      )
    ) {
      stale =
        Date.now() -
          updatedAt.getTime() >
        STALE_POSITION_MS;
    }
  }

  if (
    technician?.gps_active ===
      false ||
    status ===
      'hors_service' ||
    status === 'deconnecte' ||
    stale
  ) {
    return 'last_known';
  }

  if (
    technician?.gps_active ===
      true ||
    (
      technician
        ?.last_location_update &&
      !stale
    )
  ) {
    return 'active';
  }

  return 'unknown';
}

function jobStatusDetails(value) {
  const normalized =
    normalizeStatus(value);

  return (
    JOB_STATUS_CONFIG[
      normalized
    ] || {
      label:
        normalized
          .replace(/_/g, ' ')
          .replace(
            /^./,
            (character) =>
              character.toUpperCase(),
          ) ||
        'Statut inconnu',
      color:
        'var(--color-danger, #e05555)',
    }
  );
}

function jobTypeLabel(value) {
  const fallback = text(value)
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );

  return (
    getJobTypeLabel(
      value,
      fallback,
    ) ||
    'Intervention'
  );
}

function markerIcon(
  kind,
  state,
  color,
) {
  const cacheKey =
    `${kind}:${state}:${color}`;

  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey);
  }

  const label =
    kind === 'technician'
      ? 'T'
      : 'I';

  const shape =
    kind === 'technician'
      ? '50%'
      : '50% 50% 50% 0';

  const transform =
    kind === 'technician'
      ? 'none'
      : 'rotate(-45deg)';

  const innerTransform =
    kind === 'technician'
      ? 'none'
      : 'rotate(45deg)';

  const icon = L.divIcon({
    className:
      `bluevector-map-marker bluevector-map-marker--${kind}`,
    html: [
      '<span aria-hidden="true" style="',
      'display:grid;',
      'place-items:center;',
      'width:30px;',
      'height:30px;',
      `background:${color};`,
      'color:#fff;',
      'border:2px solid rgba(255,255,255,.92);',
      `border-radius:${shape};`,
      'box-shadow:0 4px 12px rgba(0,0,0,.48);',
      `transform:${transform};`,
      'font-family:var(--font-mono,monospace);',
      'font-size:11px;',
      'font-weight:800;',
      'line-height:1;',
      '">',
      `<span style="transform:${innerTransform}">`,
      label,
      '</span>',
      '</span>',
    ].join(''),
    iconSize: [30, 34],
    iconAnchor:
      kind === 'technician'
        ? [15, 15]
        : [15, 30],
  });

  iconCache.set(
    cacheKey,
    icon,
  );

  return icon;
}

function stopOriginalEvent(event) {
  event?.originalEvent
    ?.preventDefault?.();

  event?.originalEvent
    ?.stopPropagation?.();
}

function useMarkerEvents({
  item,
  onClick,
  onDoubleClick,
}) {
  const timeoutRef =
    useRef(null);

  useEffect(
    () => () => {
      if (
        timeoutRef.current !==
        null
      ) {
        window.clearTimeout(
          timeoutRef.current,
        );
      }
    },
    [],
  );

  return useMemo(
    () => ({
      click() {
        if (
          typeof onClick !==
          'function'
        ) {
          return;
        }

        if (
          typeof onDoubleClick !==
          'function'
        ) {
          onClick(item);
          return;
        }

        if (
          timeoutRef.current !==
          null
        ) {
          window.clearTimeout(
            timeoutRef.current,
          );
        }

        timeoutRef.current =
          window.setTimeout(() => {
            timeoutRef.current =
              null;

            onClick(item);
          }, MARKER_CLICK_DELAY_MS);
      },

      dblclick(event) {
        if (
          timeoutRef.current !==
          null
        ) {
          window.clearTimeout(
            timeoutRef.current,
          );

          timeoutRef.current =
            null;
        }

        stopOriginalEvent(event);

        onDoubleClick?.(item);
      },
    }),
    [
      item,
      onClick,
      onDoubleClick,
    ],
  );
}

const TechnicianMarker = memo(
  function TechnicianMarker({
    technician,
    position,
    onClick,
    onDoubleClick,
  }) {
    const positionState =
      technicianPositionState(
        technician,
      );

    const configuration =
      TECH_POSITION_CONFIG[
        positionState
      ];

    const events =
      useMarkerEvents({
        item: technician,
        onClick,
        onDoubleClick,
      });

    const name =
      technicianName(
        technician,
      );

    const liveStatus = text(
      technician?.live_status ??
        technician?.status,
    ).replace(/_/g, ' ');

    const title = [
      name,
      liveStatus,
      configuration.label,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <Marker
        position={position}
        icon={markerIcon(
          'technician',
          positionState,
          configuration.color,
        )}
        opacity={
          configuration.opacity
        }
        title={title}
        alt={`Technicien ${name}`}
        keyboard
        eventHandlers={events}
      />
    );
  },
);

const JobMarker = memo(
  function JobMarker({
    job,
    position,
    onClick,
    onDoubleClick,
  }) {
    const status =
      jobStatusDetails(
        job?.status,
      );

    const events =
      useMarkerEvents({
        item: job,
        onClick,
        onDoubleClick,
      });

    const customer =
      text(job?.customer_name);

    const type =
      jobTypeLabel(
        job?.job_type,
      );

    const address =
      text(
        job?.service_address,
      );

    const title = [
      customer ||
        (
          jobIdentifier(job)
            ? `Intervention #${jobIdentifier(
                job,
              )}`
            : 'Intervention'
        ),
      type,
      status.label,
      address,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <Marker
        position={position}
        icon={markerIcon(
          'job',
          normalizeStatus(
            job?.status,
          ),
          status.color,
        )}
        title={title}
        alt={`Intervention ${
          customer ||
          jobIdentifier(job) ||
          ''
        }`.trim()}
        keyboard
        eventHandlers={events}
      />
    );
  },
);

function MapController({
  bounds,
  membershipSignature,
  fitRequest,
  autoFit,
  defaultCenter,
  defaultZoom,
  onReady,
}) {
  const map = useMap();

  const boundsRef =
    useRef(bounds);

  const onReadyRef =
    useRef(onReady);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onReadyRef.current?.(map);
  }, [map]);

  useEffect(() => {
    if (!autoFit) {
      return undefined;
    }

    const frame =
      window.requestAnimationFrame(
        () => {
          map.invalidateSize({
            pan: false,
          });

          const currentBounds =
            boundsRef.current;

          if (
            currentBounds.length === 0
          ) {
            map.setView(
              defaultCenter,
              defaultZoom,
              {
                animate: false,
              },
            );

            return;
          }

          if (
            currentBounds.length === 1
          ) {
            map.setView(
              currentBounds[0],
              Math.max(
                map.getZoom(),
                15,
              ),
              {
                animate: false,
              },
            );

            return;
          }

          map.fitBounds(
            currentBounds,
            {
              padding: [44, 44],
              maxZoom: 16,
              animate: false,
            },
          );
        },
      );

    return () => {
      window.cancelAnimationFrame(
        frame,
      );
    };
  }, [
    autoFit,
    defaultCenter,
    defaultZoom,
    fitRequest,
    map,
    membershipSignature,
  ]);

  useEffect(() => {
    const container =
      map.getContainer();

    let frame =
      window.requestAnimationFrame(
        () => {
          map.invalidateSize({
            pan: false,
          });
        },
      );

    let observer = null;

    if (
      typeof ResizeObserver ===
      'function'
    ) {
      observer =
        new ResizeObserver(() => {
          window.cancelAnimationFrame(
            frame,
          );

          frame =
            window.requestAnimationFrame(
              () => {
                map.invalidateSize({
                  pan: false,
                });
              },
            );
        });

      observer.observe(container);
    }

    const invalidate = () => {
      window.cancelAnimationFrame(
        frame,
      );

      frame =
        window.requestAnimationFrame(
          () => {
            map.invalidateSize({
              pan: false,
            });
          },
        );
    };

    window.addEventListener(
      'resize',
      invalidate,
    );

    document.addEventListener(
      'fullscreenchange',
      invalidate,
    );

    return () => {
      window.cancelAnimationFrame(
        frame,
      );

      observer?.disconnect();

      window.removeEventListener(
        'resize',
        invalidate,
      );

      document.removeEventListener(
        'fullscreenchange',
        invalidate,
      );
    };
  }, [map]);

  return null;
}

function ControlIcon({
  type,
}) {
  if (type === 'fit') {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 5.5h5v5h-5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function MapControlButton({
  label,
  onClick,
  disabled = false,
  icon,
}) {
  return (
    <button
      type="button"
      className="map-fullscreen-btn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: 'grid',
        width: 34,
        height: 34,
        padding: 0,
        placeItems: 'center',
        color:
          'var(--text-secondary)',
        background:
          'rgba(27, 37, 48, .94)',
        border:
          '1px solid var(--border-color)',
        borderRadius: 4,
        boxShadow:
          '0 2px 8px rgba(0,0,0,.34)',
        cursor: disabled
          ? 'wait'
          : 'pointer',
      }}
    >
      <ControlIcon type={icon} />
    </button>
  );
}

function Legend({
  technicianCount,
  jobCount,
  staleCount,
}) {
  return (
    <div
      aria-label="Légende de la carte"
      style={{
        position: 'absolute',
        left: 8,
        bottom: 24,
        zIndex: 700,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 8px',
        maxWidth:
          'calc(100% - 16px)',
        padding: '5px 8px',
        color:
          'var(--text-secondary)',
        background:
          'rgba(17, 24, 32, .9)',
        border:
          '1px solid var(--border-color)',
        borderRadius: 4,
        fontSize: 10,
        lineHeight: 1.3,
        pointerEvents: 'none',
      }}
    >
      <span>
        <strong
          style={{
            color:
              'var(--color-info)',
          }}
        >
          T
        </strong>
        {' '}
        {technicianCount}{' '}
        technicien
        {technicianCount > 1
          ? 's'
          : ''}
      </span>

      <span>
        <strong
          style={{
            color:
              'var(--color-danger)',
          }}
        >
          I
        </strong>
        {' '}
        {jobCount}{' '}
        intervention
        {jobCount > 1
          ? 's'
          : ''}
      </span>

      {staleCount > 0 && (
        <span>
          {staleCount}{' '}
          position
          {staleCount > 1
            ? 's'
            : ''}{' '}
          ancienne
          {staleCount > 1
            ? 's'
            : ''}
        </span>
      )}
    </div>
  );
}

function MapContent({
  technicians,
  jobs,
  onTechClick,
  onJobClick,
  onDoubleClickTech,
  onDoubleClickJob,
  className,
  style,
  showFullscreenBtn,
  showLegend,
  tileUrl,
  attribution,
  tileLayerProps,
  mapProps,
  defaultCenter,
  defaultZoom,
  autoFit,
  onReady,
}) {
  const wrapperRef =
    useRef(null);

  const fullscreenBusyRef =
    useRef(false);

  const [fullscreenBusy, setFullscreenBusy] =
    useState(false);

  const [nativeFullscreen, setNativeFullscreen] =
    useState(false);

  const [fallbackFullscreen, setFallbackFullscreen] =
    useState(false);

  const [fitRequest, setFitRequest] =
    useState(0);

  const [tileError, setTileError] =
    useState(false);

  const safeTechnicians =
    useMemo(
      () =>
        asRecords(technicians),
      [technicians],
    );

  const safeJobs =
    useMemo(
      () => asRecords(jobs),
      [jobs],
    );

  const technicianMarkers =
    useMemo(() => {
      const markers = [];
      const knownKeys =
        new Set();

      safeTechnicians.forEach(
        (
          technician,
          sourceIndex,
        ) => {
          const position =
            coordinatesFrom(
              technician,
              [
                [
                  'current_latitude',
                  'current_longitude',
                ],
              ],
            );

          if (!position) {
            return;
          }

          const itemIdentifier =
            technicianIdentifier(
              technician,
            );

          const key = markerKey(
            'tech',
            itemIdentifier,
            position,
            sourceIndex,
          );

          if (knownKeys.has(key)) {
            return;
          }

          knownKeys.add(key);

          markers.push({
            key,
            technician,
            position,
            positionState:
              technicianPositionState(
                technician,
              ),
          });
        },
      );

      return markers;
    }, [safeTechnicians]);

  const jobMarkers =
    useMemo(() => {
      const markers = [];
      const knownKeys =
        new Set();

      safeJobs.forEach(
        (job, sourceIndex) => {
          const position =
            coordinatesFrom(
              job,
              [
                [
                  'gps_latitude',
                  'gps_longitude',
                ],
                [
                  'latitude',
                  'longitude',
                ],
              ],
            );

          if (!position) {
            return;
          }

          const itemIdentifier =
            jobIdentifier(job);

          const key = markerKey(
            'job',
            itemIdentifier,
            position,
            sourceIndex,
          );

          if (knownKeys.has(key)) {
            return;
          }

          knownKeys.add(key);

          markers.push({
            key,
            job,
            position,
          });
        },
      );

      return markers;
    }, [safeJobs]);

  const bounds = useMemo(
    () => [
      ...technicianMarkers.map(
        (marker) =>
          marker.position,
      ),
      ...jobMarkers.map(
        (marker) =>
          marker.position,
      ),
    ],
    [
      jobMarkers,
      technicianMarkers,
    ],
  );

  /*
   * Le recentrage automatique suit l'ajout ou le retrait
   * de marqueurs, mais pas chaque déplacement GPS.
   */
  const membershipSignature =
    useMemo(
      () =>
        [
          ...technicianMarkers.map(
            (marker) =>
              marker.key,
          ),
          ...jobMarkers.map(
            (marker) =>
              marker.key,
          ),
        ]
          .sort()
          .join('|'),
      [
        jobMarkers,
        technicianMarkers,
      ],
    );

  const staleCount =
    useMemo(
      () =>
        technicianMarkers.filter(
          (marker) =>
            marker.positionState ===
            'last_known',
        ).length,
      [technicianMarkers],
    );

  const normalizedDefaultCenter =
    useMemo(() => {
      if (
        Array.isArray(
          defaultCenter,
        ) &&
        validCoordinates(
          finiteNumber(
            defaultCenter[0],
          ),
          finiteNumber(
            defaultCenter[1],
          ),
        )
      ) {
        return [
          Number(defaultCenter[0]),
          Number(defaultCenter[1]),
        ];
      }

      return DEFAULT_CENTER;
    }, [defaultCenter]);

  const safeMapProps =
    isRecord(mapProps)
      ? mapProps
      : {};

  const safeTileProps =
    isRecord(tileLayerProps)
      ? tileLayerProps
      : {};

  const {
    center:
      _ignoredCenter,
    zoom:
      _ignoredZoom,
    children:
      _ignoredChildren,
    style:
      mapPropStyle,
    className:
      mapPropClassName,
    ...remainingMapProps
  } = safeMapProps;

  const {
    url:
      _ignoredTileUrl,
    attribution:
      _ignoredAttribution,
    eventHandlers:
      externalTileHandlers,
    ...remainingTileProps
  } = safeTileProps;

  const safeExternalTileHandlers = useMemo(
    () => (isRecord(externalTileHandlers) ? externalTileHandlers : {}),
    [externalTileHandlers],
  );

  const tileEvents =
    useMemo(
      () => ({
        ...safeExternalTileHandlers,

        loading(event) {
          safeExternalTileHandlers
            .loading?.(event);

          setTileError(false);
        },

        load(event) {
          safeExternalTileHandlers
            .load?.(event);

          setTileError(false);
        },

        tileerror(event) {
          safeExternalTileHandlers
            .tileerror?.(event);

          setTileError(true);
        },
      }),
      [
        safeExternalTileHandlers,
      ],
    );

  const fullscreen =
    nativeFullscreen ||
    fallbackFullscreen;

  const toggleFullscreen =
    useCallback(async () => {
      if (
        fullscreenBusyRef.current
      ) {
        return;
      }

      const element =
        wrapperRef.current;

      if (!element) {
        return;
      }

      fullscreenBusyRef.current =
        true;

      setFullscreenBusy(true);

      try {
        const nativeSupported =
          Boolean(
            document.fullscreenEnabled &&
            element.requestFullscreen,
          );

        if (!nativeSupported) {
          setFallbackFullscreen(
            (current) => !current,
          );

          return;
        }

        if (
          document.fullscreenElement ===
          element
        ) {
          await document.exitFullscreen?.();

          return;
        }

        if (
          !document.fullscreenElement
        ) {
          await element.requestFullscreen();
        }
      } catch {
        setFallbackFullscreen(
          (current) => !current,
        );
      } finally {
        fullscreenBusyRef.current =
          false;

        setFullscreenBusy(false);
      }
    }, []);

  useEffect(() => {
    const handleFullscreenChange =
      () => {
        setNativeFullscreen(
          document.fullscreenElement ===
            wrapperRef.current,
        );
      };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange,
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange,
      );
    };
  }, []);

  useEffect(() => {
    if (!fallbackFullscreen) {
      return undefined;
    }

    const handleEscape =
      (event) => {
        if (
          event.key !==
          'Escape'
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        setFallbackFullscreen(false);
      };

    document.addEventListener(
      'keydown',
      handleEscape,
      true,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleEscape,
        true,
      );
    };
  }, [fallbackFullscreen]);

  const accessibleLabel =
    `Carte contenant ${technicianMarkers.length} technicien` +
    `${technicianMarkers.length > 1 ? 's' : ''} et ` +
    `${jobMarkers.length} intervention` +
    `${jobMarkers.length > 1 ? 's' : ''} géolocalisés`;

  return (
    <div
      ref={wrapperRef}
      className={classNames(
        'map-window-integrated',
        fullscreen
          ? 'map-window-fullscreen'
          : '',
        className,
      )}
      role="region"
      aria-label={accessibleLabel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        background:
          'var(--surface-input)',
        border:
          '1px solid var(--border-color)',
        borderRadius: 6,
        ...(
          isRecord(style)
            ? style
            : {}
        ),
      }}
    >
      <MapContainer
        {...remainingMapProps}
        center={
          normalizedDefaultCenter
        }
        zoom={
          Number.isFinite(
            Number(defaultZoom),
          )
            ? Number(defaultZoom)
            : 12
        }
        zoomControl={
          remainingMapProps
            .zoomControl ??
          true
        }
        attributionControl={
          remainingMapProps
            .attributionControl ??
          true
        }
        scrollWheelZoom={
          remainingMapProps
            .scrollWheelZoom ??
          false
        }
        className={classNames(
          'map-window-leaflet',
          mapPropClassName,
        )}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 0,
          background:
            'var(--surface-input)',
          ...(
            isRecord(
              mapPropStyle,
            )
              ? mapPropStyle
              : {}
          ),
        }}
      >
        <TileLayer
          {...remainingTileProps}
          url={
            text(tileUrl) ||
            DEFAULT_TILE_URL
          }
          attribution={
            text(attribution) ||
            DEFAULT_ATTRIBUTION
          }
          subdomains={
            remainingTileProps
              .subdomains ??
            'abcd'
          }
          eventHandlers={
            tileEvents
          }
        />

        <MapController
          bounds={bounds}
          membershipSignature={
            membershipSignature
          }
          fitRequest={fitRequest}
          autoFit={autoFit}
          defaultCenter={
            normalizedDefaultCenter
          }
          defaultZoom={
            Number.isFinite(
              Number(defaultZoom),
            )
              ? Number(
                  defaultZoom,
                )
              : 12
          }
          onReady={onReady}
        />

        {technicianMarkers.map(
          ({
            key,
            technician,
            position,
          }) => (
            <TechnicianMarker
              key={key}
              technician={
                technician
              }
              position={position}
              onClick={
                onTechClick
              }
              onDoubleClick={
                onDoubleClickTech
              }
            />
          ),
        )}

        {jobMarkers.map(
          ({
            key,
            job,
            position,
          }) => (
            <JobMarker
              key={key}
              job={job}
              position={position}
              onClick={onJobClick}
              onDoubleClick={
                onDoubleClickJob
              }
            />
          ),
        )}
      </MapContainer>

      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 800,
          display: 'flex',
          gap: 6,
        }}
      >
        <MapControlButton
          label="Recentrer sur tous les marqueurs"
          icon="fit"
          onClick={() =>
            setFitRequest(
              (current) =>
                current + 1,
            )
          }
        />

        {showFullscreenBtn && (
          <MapControlButton
            label={
              fullscreen
                ? 'Quitter le plein écran'
                : 'Afficher la carte en plein écran'
            }
            icon="fullscreen"
            onClick={
              toggleFullscreen
            }
            disabled={
              fullscreenBusy
            }
          />
        )}
      </div>

      {showLegend && (
        <Legend
          technicianCount={
            technicianMarkers.length
          }
          jobCount={
            jobMarkers.length
          }
          staleCount={
            staleCount
          }
        />
      )}

      {bounds.length === 0 && (
        <div
          className="map-window-empty"
          role="status"
          style={{
            position: 'absolute',
            left: '50%',
            top: 12,
            zIndex: 700,
            width:
              'min(360px, calc(100% - 100px))',
            padding: '7px 10px',
            color:
              'var(--text-secondary)',
            background:
              'rgba(17, 24, 32, .92)',
            border:
              '1px solid var(--border-color)',
            borderRadius: 4,
            fontSize:
              'var(--font-size-sm)',
            lineHeight: 1.4,
            textAlign: 'center',
            transform:
              'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          Aucun technicien ou
          intervention ne dispose
          d’une position GPS
          exploitable.
        </div>
      )}

      {tileError && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 54,
            left: '50%',
            zIndex: 850,
            width:
              'min(340px, calc(100% - 24px))',
            padding: '6px 9px',
            color:
              'var(--color-warning)',
            background:
              'rgba(17, 24, 32, .95)',
            border:
              '1px solid var(--color-warning)',
            borderRadius: 4,
            fontSize: 10,
            lineHeight: 1.35,
            textAlign: 'center',
            transform:
              'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          Fond de carte
          temporairement indisponible.
          Les marqueurs restent
          exploitables.
        </div>
      )}
    </div>
  );
}

function MapWindow({
  technicians = [],
  jobs = [],
  onTechClick,
  onJobClick,
  onDoubleClickTech,
  onDoubleClickJob,
  onClose,
  className = '',
  style,
  showFullscreenBtn = true,
  showLegend = true,
  floating,
  title = 'Carte opérationnelle',
  defaultPos = {
    x: 90,
    y: 70,
  },
  defaultSize = {
    w: 860,
    h: 580,
  },
  minSize = {
    w: 420,
    h: 300,
  },
  tileUrl =
    DEFAULT_TILE_URL,
  attribution =
    DEFAULT_ATTRIBUTION,
  tileLayerProps,
  mapProps,
  defaultCenter =
    DEFAULT_CENTER,
  defaultZoom = 12,
  autoFit = true,
  onReady,
}) {
  const floatingMode =
    typeof floating ===
    'boolean'
      ? floating
      : typeof onClose ===
          'function';

  const content = (
    <MapContent
      technicians={technicians}
      jobs={jobs}
      onTechClick={onTechClick}
      onJobClick={onJobClick}
      onDoubleClickTech={
        onDoubleClickTech
      }
      onDoubleClickJob={
        onDoubleClickJob
      }
      className={
        floatingMode
          ? ''
          : className
      }
      style={style}
      showFullscreenBtn={
        showFullscreenBtn
      }
      showLegend={showLegend}
      tileUrl={tileUrl}
      attribution={attribution}
      tileLayerProps={
        tileLayerProps
      }
      mapProps={mapProps}
      defaultCenter={
        defaultCenter
      }
      defaultZoom={
        defaultZoom
      }
      autoFit={autoFit}
      onReady={onReady}
    />
  );

  if (!floatingMode) {
    return content;
  }

  const technicianCount =
    asRecords(
      technicians,
    ).length;

  const jobCount =
    asRecords(jobs).length;

  const windowTitle =
    `${text(title) || 'Carte opérationnelle'} · ` +
    `${technicianCount} technicien` +
    `${technicianCount > 1 ? 's' : ''} · ` +
    `${jobCount} intervention` +
    `${jobCount > 1 ? 's' : ''}`;

  return (
    <FloatingWindow
      title={windowTitle}
      onClose={onClose}
      defaultPos={defaultPos}
      defaultSize={
        defaultSize
      }
      minSize={minSize}
      className={classNames(
        'map-window',
        className,
      )}
      zIndex={1600}
      resizable
    >
      {content}
    </FloatingWindow>
  );
}

export default memo(MapWindow);
