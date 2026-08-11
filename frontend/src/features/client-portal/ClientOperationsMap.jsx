import { useEffect, useMemo } from 'react';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [33.5731, -7.5898];

function FitClientBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function ClientOperationsMap({ plannedJobs = [], liveOperations = [] }) {
  const points = useMemo(
    () => [...plannedJobs, ...liveOperations].map((item) => [item.latitude, item.longitude]),
    [plannedJobs, liveOperations],
  );

  return (
    <div className="client-operations-map" aria-label="Carte des opérations de votre entreprise">
      {!points.length ? (
        <div className="client-operations-map__empty">
          <strong>Aucune position exploitable</strong>
          <span>La carte apparaîtra dès qu’une intervention aura une position confirmée.</span>
        </div>
      ) : (
        <MapContainer center={points[0] || DEFAULT_CENTER} zoom={12} scrollWheelZoom className="client-operations-map__canvas">
          <TileLayer
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <FitClientBounds points={points} />
          {plannedJobs.map((job) => (
            <CircleMarker
              key={`planned-${job.job_id}`}
              center={[job.latitude, job.longitude]}
              radius={7}
              pathOptions={{ color: '#6aa7ff', fillColor: '#3478f6', fillOpacity: 0.78, weight: 2 }}
            >
              <Popup>
                <strong>Intervention #{job.job_reference}</strong><br />
                {job.customer_name || 'Site client'}<br />
                {job.address || 'Adresse non renseignée'}
              </Popup>
            </CircleMarker>
          ))}
          {liveOperations.map((operation) => (
            <CircleMarker
              key={`live-${operation.job_id}`}
              center={[operation.latitude, operation.longitude]}
              radius={10}
              pathOptions={{ color: '#63f2ad', fillColor: '#1dcf84', fillOpacity: 0.9, weight: 3 }}
            >
              <Popup>
                <strong>{operation.technician?.display_name || 'Technicien terrain'}</strong><br />
                Intervention #{operation.job_reference}<br />
                Position actualisée il y a {Math.max(Math.round((operation.age_seconds || 0) / 60), 0)} min
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      )}
      <div className="client-operations-map__legend">
        <span><i data-kind="planned" /> Intervention</span>
        <span><i data-kind="live" /> Équipe active</span>
      </div>
    </div>
  );
}
