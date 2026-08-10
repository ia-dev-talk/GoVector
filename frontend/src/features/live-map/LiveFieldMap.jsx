import {
  memo,
  useEffect,
  useMemo,
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

import {
  GPS_TONES,
  getTechGpsState,
  hasValidJobCoordinates,
  hasValidTechCoordinates,
  jobId,
  jobStatus,
  technicianId,
  technicianName,
  text,
} from './liveMapUtils';


const DEFAULT_CENTER = Object.freeze([
  33.5731,
  -7.5898,
]);

const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const ATTRIBUTION =
  '&copy; OpenStreetMap contributors &copy; CARTO';

const iconCache = new Map();


function technicianCoordinates(technician) {
  if (!hasValidTechCoordinates(technician)) {
    return null;
  }

  return [
    Number(technician.current_latitude),
    Number(technician.current_longitude),
  ];
}


function jobCoordinates(job) {
  if (!hasValidJobCoordinates(job)) {
    return null;
  }

  return [
    Number(job?.latitude),
    Number(job?.longitude),
  ];
}


function markerIcon({
  kind,
  tone,
  label,
  selected,
}) {
  const cacheKey =
    `${kind}:${tone}:${label}:${selected}`;

  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey);
  }

  const colors = {
    success: '#39d98a',
    warning: '#f6b84b',
    danger: '#ff6877',
    info: '#65b5ff',
    purple: '#a78bfa',
    muted: '#718096',
  };

  const color =
    colors[tone] || colors.info;

  const className = [
    'lm-marker',
    `lm-marker--${kind}`,
    selected ? 'lm-marker--selected' : '',
  ].join(' ');

  const icon = L.divIcon({
    className,
    html: `
      <span style="
        --marker-color:${color};
      ">
        <b>${label}</b>
      </span>
    `,
    iconSize:
      kind === 'technician'
        ? [34, 34]
        : [34, 40],
    iconAnchor:
      kind === 'technician'
        ? [17, 17]
        : [17, 36],
  });

  iconCache.set(cacheKey, icon);
  return icon;
}


function Controller({
  points,
  selectedPoint,
  signature,
}) {
  const map = useMap();
  const selectedSignature =
    selectedPoint
      ? selectedPoint.join(':')
      : '';

  useEffect(() => {
    const frame =
      window.requestAnimationFrame(() => {
        map.invalidateSize({ pan: false });

        if (points.length === 0) {
          map.setView(
            DEFAULT_CENTER,
            12,
            { animate: false },
          );
          return;
        }

        if (points.length === 1) {
          map.setView(
            points[0],
            15,
            { animate: false },
          );
          return;
        }

        map.fitBounds(
          points,
          {
            padding: [48, 48],
            maxZoom: 15,
            animate: false,
          },
        );
      });

    return () =>
      window.cancelAnimationFrame(frame);
  }, [map, points, signature]);

  useEffect(() => {
    if (!selectedPoint) {
      return;
    }

    map.flyTo(
      selectedPoint,
      Math.max(map.getZoom(), 15),
      {
        animate: true,
        duration: 0.45,
      },
    );
  }, [map, selectedPoint, selectedSignature]);

  return null;
}


const LiveFieldMap = memo(function LiveFieldMap({
  technicians,
  jobs,
  layers,
  selected,
  onSelect,
  referenceNow,
  staleAfterMinutes,
}) {
  const [tileError, setTileError] =
    useState(false);

  const technicianMarkers =
    useMemo(
      () =>
        layers.technicians
          ? technicians
              .map((technician) => {
                const position =
                  technicianCoordinates(
                    technician,
                  );

                if (!position) {
                  return null;
                }

                const id =
                  technicianId(technician);

                const gpsState =
                  getTechGpsState(
                    technician,
                    referenceNow,
                    staleAfterMinutes,
                  );

                return {
                  key: `tech:${id}`,
                  id,
                  technician,
                  position,
                  gpsState,
                };
              })
              .filter(Boolean)
          : [],
      [
        layers.technicians,
        referenceNow,
        staleAfterMinutes,
        technicians,
      ],
    );

  const jobMarkers =
    useMemo(
      () =>
        layers.jobs
          ? jobs
              .map((job) => {
                const position =
                  jobCoordinates(job);

                if (!position) {
                  return null;
                }

                const id = jobId(job);
                return {
                  key: `job:${id}`,
                  id,
                  job,
                  position,
                  status: jobStatus(job),
                };
              })
              .filter(Boolean)
          : [],
      [jobs, layers.jobs],
    );

  const points =
    useMemo(
      () => [
        ...technicianMarkers.map(
          (item) => item.position,
        ),
        ...jobMarkers.map(
          (item) => item.position,
        ),
      ],
      [
        jobMarkers,
        technicianMarkers,
      ],
    );

  const signature =
    useMemo(
      () =>
        [
          ...technicianMarkers.map(
            (item) =>
              `${item.key}:${item.position.join(':')}`,
          ),
          ...jobMarkers.map(
            (item) =>
              `${item.key}:${item.position.join(':')}`,
          ),
        ].join('|'),
      [
        jobMarkers,
        technicianMarkers,
      ],
    );

  const selectedPoint =
    useMemo(() => {
      if (!selected) {
        return null;
      }

      if (selected.type === 'technician') {
        return (
          technicianMarkers.find(
            (item) =>
              item.id === selected.id,
          )?.position || null
        );
      }

      return (
        jobMarkers.find(
          (item) =>
            item.id === selected.id,
        )?.position || null
      );
    }, [
      jobMarkers,
      selected,
      technicianMarkers,
    ]);

  return (
    <div className="lm-map">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        minZoom={4}
        maxZoom={19}
        zoomControl
        preferCanvas
      >
        <TileLayer
          url={TILE_URL}
          attribution={ATTRIBUTION}
          maxZoom={20}
          eventHandlers={{
            tileerror: () =>
              setTileError(true),
            load: () =>
              setTileError(false),
          }}
        />

        <Controller
          points={points}
          selectedPoint={selectedPoint}
          signature={signature}
        />

        {technicianMarkers.map((item) => (
          <Marker
            key={item.key}
            position={item.position}
            icon={markerIcon({
              kind: 'technician',
              tone:
                GPS_TONES[item.gpsState] ||
                'muted',
              label:
                technicianName(
                  item.technician,
                )
                  .charAt(0)
                  .toLocaleUpperCase('fr') ||
                'T',
              selected:
                selected?.type === 'technician' &&
                selected.id === item.id,
            })}
            title={technicianName(
              item.technician,
            )}
            eventHandlers={{
              click: () =>
                onSelect({
                  type: 'technician',
                  id: item.id,
                }),
            }}
          />
        ))}

        {jobMarkers.map((item) => (
          <Marker
            key={item.key}
            position={item.position}
            icon={markerIcon({
              kind: 'job',
              tone:
                ['completed'].includes(
                  item.status.value,
                )
                  ? 'success'
                  : [
                        'cancelled',
                        'failed',
                      ].includes(
                        item.status.value,
                      )
                    ? 'danger'
                    : [
                          'in_progress',
                          'work_in_progress',
                        ].includes(
                          item.status.value,
                        )
                      ? 'purple'
                      : 'info',
              label:
                text(
                  item.job?.job_number ??
                    item.id,
                  'I',
                )
                  .replace(/\D/g, '')
                  .slice(-2) || 'I',
              selected:
                selected?.type === 'job' &&
                selected.id === item.id,
            })}
            title={text(
              item.job?.customer_name,
              `Intervention ${item.id}`,
            )}
            eventHandlers={{
              click: () =>
                onSelect({
                  type: 'job',
                  id: item.id,
                }),
              dblclick: () =>
                onSelect({
                  type: 'job',
                  id: item.id,
                  open: true,
                }),
            }}
          />
        ))}
      </MapContainer>

      <div className="lm-map-stats">
        <span>
          <i className="lm-dot lm-dot--tech" />
          {technicianMarkers.length}
          {' '}technicien
          {technicianMarkers.length > 1 ? 's' : ''}
        </span>

        <span>
          <i className="lm-dot lm-dot--job" />
          {jobMarkers.length}
          {' '}intervention
          {jobMarkers.length > 1 ? 's' : ''}
        </span>
      </div>

      {points.length === 0 && (
        <div className="lm-map-empty">
          <LocationIconFallback />
          <strong>
            Aucune position exploitable
          </strong>
          <span>
            Activez une couche ou modifiez les filtres.
          </span>
        </div>
      )}

      {tileError && (
        <div className="lm-map-warning">
          Fond de carte temporairement indisponible.
          Les marqueurs restent chargés.
        </div>
      )}
    </div>
  );
});


function LocationIconFallback() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}


export default LiveFieldMap;
