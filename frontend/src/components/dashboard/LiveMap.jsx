/**
 * LiveMap — adaptateur de compatibilité vers la carte BlueVector partagée.
 *
 * Les dashboards actifs utilisent désormais directement MapWindow. Ce fichier
 * conserve l'ancien import et ses props publiques sans maintenir un second
 * moteur cartographique basé sur canvas.
 */

import {
  memo,
  useEffect,
  useMemo,
} from 'react';

import MapWindow from '../MapWindow';

const DEFAULT_HEIGHT = '300px';

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

function markerKey(
  prefix,
  itemIdentifier,
  coordinates,
  sourceIndex,
) {
  return itemIdentifier
    ? `${prefix}:${itemIdentifier}`
    : [
        prefix,
        coordinates[0],
        coordinates[1],
        sourceIndex,
      ].join(':');
}

function positionedCount(
  items,
  {
    prefix,
    identifierFrom,
    coordinatePairs,
  },
) {
  const knownKeys = new Set();

  asRecords(items).forEach(
    (item, sourceIndex) => {
      const coordinates =
        coordinatesFrom(
          item,
          coordinatePairs,
        );

      if (!coordinates) {
        return;
      }

      const key = markerKey(
        prefix,
        identifierFrom(item),
        coordinates,
        sourceIndex,
      );

      knownKeys.add(key);
    },
  );

  return knownKeys.size;
}

function normalizeHeight(value) {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  ) {
    return `${value}px`;
  }

  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    return value.trim();
  }

  return DEFAULT_HEIGHT;
}

function joinClassNames(...values) {
  return values
    .filter(
      (value) =>
        typeof value === 'string' &&
        value.trim(),
    )
    .map((value) => value.trim())
    .join(' ');
}

const LiveMap = memo(
  function LiveMap({
    technicians = [],
    jobs = [],
    height = DEFAULT_HEIGHT,
    onPositionedCountsChange,
    onTechClick,
    onJobClick,
    onDoubleClickTech,
    onDoubleClickJob,
    className = '',
    style,
    showFullscreenBtn = false,
    showLegend = false,
    autoFit = true,
    title = 'Carte des interventions',
    ...mapWindowProps
  }) {
    const safeTechnicians =
      useMemo(
        () =>
          asRecords(
            technicians,
          ),
        [technicians],
      );

    const safeJobs =
      useMemo(
        () => asRecords(jobs),
        [jobs],
      );

    const positionedCounts =
      useMemo(
        () => ({
          technicians:
            positionedCount(
              safeTechnicians,
              {
                prefix: 'tech',
                identifierFrom:
                  (technician) =>
                    identifier(
                      technician?.id ??
                        technician
                          ?.technician_id,
                    ),
                coordinatePairs: [
                  [
                    'current_latitude',
                    'current_longitude',
                  ],
                ],
              },
            ),

          jobs: positionedCount(
            safeJobs,
            {
              prefix: 'job',
              identifierFrom:
                (job) =>
                  identifier(
                    job?.id ??
                      job?.job_id ??
                      job?.job_number ??
                      job
                        ?.command_number,
                  ),
              coordinatePairs: [
                [
                  'gps_latitude',
                  'gps_longitude',
                ],
                [
                  'latitude',
                  'longitude',
                ],
              ],
            },
          ),
        }),
        [
          safeJobs,
          safeTechnicians,
        ],
      );

    useEffect(() => {
      if (
        typeof onPositionedCountsChange ===
        'function'
      ) {
        onPositionedCountsChange({
          technicians:
            positionedCounts.technicians,
          jobs:
            positionedCounts.jobs,
        });
      }
    }, [
      onPositionedCountsChange,
      positionedCounts.jobs,
      positionedCounts.technicians,
    ]);

    const normalizedHeight =
      normalizeHeight(height);

    const technicianCount =
      positionedCounts.technicians;

    const jobCount =
      positionedCounts.jobs;

    const accessibleLabel =
      technicianCount === 0 &&
      jobCount === 0
        ? 'Carte opérationnelle. Aucune position GPS disponible.'
        : (
            `Carte opérationnelle affichant ${technicianCount} technicien` +
            `${technicianCount > 1 ? 's' : ''} et ${jobCount} intervention` +
            `${jobCount > 1 ? 's' : ''} géolocalisés.`
          );

    return (
      <section
        className={joinClassNames(
          'live-map',
          className,
        )}
        style={
          isRecord(style)
            ? style
            : undefined
        }
        aria-label={
          accessibleLabel
        }
      >
        <header className="live-map-header">
          <h4>
            <span aria-hidden="true">
              🗺️
            </span>
            {' '}
            {text(title) ||
              'Carte des interventions'}
          </h4>

          <span
            className="live-map-count"
            aria-label={
              `${technicianCount} technicien` +
              `${technicianCount > 1 ? 's' : ''}, ` +
              `${jobCount} intervention` +
              `${jobCount > 1 ? 's' : ''}`
            }
          >
            {technicianCount}{' '}
            technicien
            {technicianCount > 1
              ? 's'
              : ''}
            {' · '}
            {jobCount}{' '}
            intervention
            {jobCount > 1
              ? 's'
              : ''}
          </span>
        </header>

        <div
          style={{
            width: '100%',
            height:
              normalizedHeight,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <MapWindow
            {...mapWindowProps}
            floating={false}
            technicians={
              safeTechnicians
            }
            jobs={safeJobs}
            onTechClick={
              onTechClick
            }
            onJobClick={
              onJobClick
            }
            onDoubleClickTech={
              onDoubleClickTech
            }
            onDoubleClickJob={
              onDoubleClickJob
            }
            showFullscreenBtn={
              showFullscreenBtn
            }
            showLegend={
              showLegend
            }
            autoFit={autoFit}
            ariaLabel={
              accessibleLabel
            }
            style={{
              borderRadius: 8,
              ...(
                isRecord(
                  mapWindowProps.style,
                )
                  ? mapWindowProps.style
                  : {}
              ),
            }}
          />
        </div>
      </section>
    );
  },
);

LiveMap.displayName =
  'LiveMap';

export default LiveMap;
