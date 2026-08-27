import {
  forwardRef,
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
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_POSITION = Object.freeze({
  lat: 33.5731,
  lng: -7.5898,
});

const DEFAULT_TILE_URL =
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const DEFAULT_ATTRIBUTION =
  '&copy; OpenStreetMap contributors';

const DEFAULT_MARKER_ICON = L.divIcon({
  className: 'bluevector-map-picker-marker',
  html: [
    '<span aria-hidden="true" style="',
    'display:block;position:relative;width:28px;height:34px;',
    'background:var(--color-accent,#4a9eff);',
    'border:2px solid var(--text-primary,#f4f7fb);',
    'border-radius:50% 50% 50% 0;',
    'box-shadow:0 4px 12px rgba(0,0,0,.48);',
    'transform:rotate(-45deg)">',
    '<span style="position:absolute;top:8px;left:8px;width:8px;height:8px;',
    'background:var(--surface-app,#111820);',
    'border:2px solid var(--text-primary,#f4f7fb);border-radius:50%"></span>',
    '</span>',
  ].join(''),
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function classNames(...values) {
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim())
    .join(' ');
}

function toCoordinate(value) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePosition(latitude, longitude) {
  const lat = toCoordinate(latitude);
  const lng = toCoordinate(longitude);

  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

function normalizePosition(latitude, longitude, fallback = DEFAULT_POSITION) {
  return parsePosition(latitude, longitude) || {
    lat: fallback.lat,
    lng: fallback.lng,
  };
}

function positionsEqual(first, second) {
  return first.lat === second.lat && first.lng === second.lng;
}

function normalizeZoom(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(22, Math.max(1, parsed)) : 12;
}

function MapController({ position, recenterRequest, onReady }) {
  const map = useMap();
  const readyCallbackRef = useRef(onReady);

  useEffect(() => {
    readyCallbackRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    readyCallbackRef.current?.(map);
  }, [map]);

  useEffect(() => {
    map.setView([position.lat, position.lng], map.getZoom(), {
      animate: false,
    });
  }, [map, position.lat, position.lng, recenterRequest]);

  useEffect(() => {
    const container = map.getContainer();
    let frameId = window.requestAnimationFrame(() => {
      map.invalidateSize({ pan: false, debounceMoveend: true });
    });

    let observer = null;

    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => {
        window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(() => {
          map.invalidateSize({ pan: false, debounceMoveend: true });
        });
      });

      observer.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
    };
  }, [map]);

  return null;
}

function MapClickHandler({
  disabled,
  onPositionChange,
}) {
  useMapEvents({
    click(event) {
      if (disabled) return;

      onPositionChange({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function PositionMarker({
  position,
  disabled,
  onPositionChange,
  markerProps,
}) {
  const markerRef = useRef(null);
  const safeMarkerProps = isRecord(markerProps) ? markerProps : {};

  const {
    eventHandlers: externalHandlers,
    draggable,
    icon,
    title,
    alt,
    ...remainingMarkerProps
  } = safeMarkerProps;

  const safeExternalHandlers = useMemo(
    () => (isRecord(externalHandlers) ? externalHandlers : {}),
    [externalHandlers],
  );

  const eventHandlers = useMemo(
    () => ({
      ...safeExternalHandlers,
      dragend(event) {
        safeExternalHandlers.dragend?.(event);
        if (disabled || !markerRef.current) return;

        const nextPosition = markerRef.current.getLatLng();
        onPositionChange({
          lat: nextPosition.lat,
          lng: nextPosition.lng,
        });
      },
    }),
    [disabled, onPositionChange, safeExternalHandlers],
  );

  return (
    <Marker
      {...remainingMarkerProps}
      ref={markerRef}
      position={[position.lat, position.lng]}
      icon={icon || DEFAULT_MARKER_ICON}
      draggable={disabled ? false : draggable ?? true}
      autoPan
      autoPanOnFocus
      keyboard={!disabled}
      title={title || 'Position de l’intervention'}
      alt={alt || 'Repère de l’intervention'}
      eventHandlers={eventHandlers}
    />
  );
}

const MapPicker = forwardRef(function MapPicker(
  {
    latitude,
    longitude,
    onChange,
    disabled = false,
    zoom = 12,
    minZoom = 3,
    maxZoom = 20,
    height = '100%',
    className = '',
    mapClassName = '',
    style,
    mapStyle,
    tileUrl = DEFAULT_TILE_URL,
    attribution = DEFAULT_ATTRIBUTION,
    tileLayerProps,
    markerProps,
    mapProps,
    onReady,
    ariaLabel = 'Carte de sélection de la position de l’intervention',
    role = 'group',
    ...containerProps
  },
  ref,
) {
  const externalPosition = useMemo(
    () => parsePosition(latitude, longitude),
    [latitude, longitude],
  );

  const [position, setPosition] = useState(() =>
    normalizePosition(latitude, longitude),
  );
  const [recenterRequest, setRecenterRequest] = useState(0);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!externalPosition) return;

    const frameId = window.requestAnimationFrame(() => {
      setPosition((current) =>
        positionsEqual(current, externalPosition) ? current : externalPosition,
      );
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [externalPosition]);

  const safeMapProps = isRecord(mapProps) ? mapProps : {};
  const safeTileLayerProps = isRecord(tileLayerProps) ? tileLayerProps : {};

  const {
    className: mapPropsClassName,
    style: mapPropsStyle,
    center: _ignoredCenter,
    zoom: _ignoredZoom,
    children: _ignoredChildren,
    ...remainingMapProps
  } = safeMapProps;

  const {
    eventHandlers: externalTileHandlers,
    url: _ignoredTileUrl,
    attribution: _ignoredAttribution,
    ...remainingTileLayerProps
  } = safeTileLayerProps;

  const safeExternalTileHandlers = useMemo(
    () => (isRecord(externalTileHandlers) ? externalTileHandlers : {}),
    [externalTileHandlers],
  );

  const tileEventHandlers = useMemo(
    () => ({
      ...safeExternalTileHandlers,
      loading(event) {
        safeExternalTileHandlers.loading?.(event);
        setTileError(false);
      },
      load(event) {
        safeExternalTileHandlers.load?.(event);
        setTileError(false);
      },
      tileerror(event) {
        safeExternalTileHandlers.tileerror?.(event);
        setTileError(true);
      },
    }),
    [safeExternalTileHandlers],
  );

  const handlePositionChange = useCallback(
    (nextValue) => {
      if (disabled) return;

      const nextPosition = normalizePosition(
        nextValue?.lat,
        nextValue?.lng,
        position,
      );

      setPosition(nextPosition);
      onChange?.(nextPosition.lat, nextPosition.lng);
    },
    [disabled, onChange, position],
  );

  const wrapperStyle = {
    position: 'relative',
    width: '100%',
    height,
    minHeight: 180,
    overflow: 'hidden',
    borderRadius: 'inherit',
    background: 'var(--surface-input, #18212b)',
    ...(isRecord(style) ? style : {}),
  };

  const leafletStyle = {
    width: '100%',
    height: '100%',
    minHeight: 180,
    background: 'var(--surface-input, #18212b)',
    ...(isRecord(mapPropsStyle) ? mapPropsStyle : {}),
    ...(isRecord(mapStyle) ? mapStyle : {}),
  };

  return (
    <div
      {...containerProps}
      ref={ref}
      role={role}
      className={classNames('map-picker', className)}
      style={wrapperStyle}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      <MapContainer
        {...remainingMapProps}
        className={classNames(
          'map-picker__map',
          mapClassName,
          mapPropsClassName,
        )}
        center={[position.lat, position.lng]}
        zoom={normalizeZoom(zoom)}
        minZoom={minZoom}
        maxZoom={maxZoom}
        style={leafletStyle}
        scrollWheelZoom={remainingMapProps.scrollWheelZoom ?? false}
        dragging={disabled ? false : remainingMapProps.dragging ?? true}
        touchZoom={disabled ? false : remainingMapProps.touchZoom ?? true}
        doubleClickZoom={
          disabled ? false : remainingMapProps.doubleClickZoom ?? true
        }
        boxZoom={disabled ? false : remainingMapProps.boxZoom ?? true}
        keyboard={disabled ? false : remainingMapProps.keyboard ?? true}
        zoomControl={disabled ? false : remainingMapProps.zoomControl ?? true}
      >
        <TileLayer
          {...remainingTileLayerProps}
          url={tileUrl}
          attribution={attribution}
          eventHandlers={tileEventHandlers}
        />

        <MapController
          position={position}
          recenterRequest={recenterRequest}
          onReady={onReady}
        />

        <MapClickHandler
          disabled={disabled}
          onPositionChange={handlePositionChange}
        />

        {externalPosition ? (
          <PositionMarker
            position={position}
            disabled={disabled}
            onPositionChange={handlePositionChange}
            markerProps={markerProps}
          />
        ) : null}
      </MapContainer>

      <output
        aria-live="polite"
        style={{
          position: 'absolute',
          left: 8,
          bottom: 8,
          zIndex: 500,
          maxWidth: 'calc(100% - 68px)',
          padding: '4px 7px',
          color: 'var(--text-primary, #f4f7fb)',
          background: 'rgba(17,24,32,.88)',
          border: '1px solid var(--border-color, #33404d)',
          borderRadius: 4,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10,
          lineHeight: 1.25,
          pointerEvents: 'none',
        }}
      >
        {externalPosition
          ? `${position.lat.toFixed(6)} · ${position.lng.toFixed(6)}`
          : 'Aucun repère enregistré · cliquez sur la carte'}
      </output>

      <button
        type="button"
        onClick={() => setRecenterRequest((current) => current + 1)}
        aria-label="Recentrer la carte sur le repère"
        title="Recentrer sur le repère"
        style={{
          position: 'absolute',
          right: 8,
          bottom: 8,
          zIndex: 500,
          display: 'grid',
          width: 32,
          height: 32,
          padding: 0,
          placeItems: 'center',
          color: 'var(--text-primary, #f4f7fb)',
          background: 'var(--surface-header, #1b2530)',
          border: '1px solid var(--border-color, #33404d)',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,.32)',
          cursor: 'pointer',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="8"
            cy="8"
            r="3"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {disabled && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 450,
            background: 'rgba(17,24,32,.22)',
            cursor: 'not-allowed',
          }}
        />
      )}

      {tileError && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            zIndex: 600,
            maxWidth: 'calc(100% - 90px)',
            padding: '5px 8px',
            color: 'var(--color-warning, #f0ad4e)',
            background: 'rgba(17,24,32,.94)',
            border: '1px solid var(--color-warning, #f0ad4e)',
            borderRadius: 4,
            fontSize: 10,
            lineHeight: 1.3,
            textAlign: 'center',
            transform: 'translateX(-50%)',
          }}
        >
          Fond de carte indisponible. Les coordonnées restent utilisables.
        </div>
      )}
    </div>
  );
});

MapPicker.displayName = 'MapPicker';

export default MapPicker;
