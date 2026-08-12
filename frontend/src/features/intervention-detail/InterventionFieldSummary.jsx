import { finiteNumber, text } from './interventionDetailUtils';
import '../../styles/intervention-field-summary.css';

const EARTH_RADIUS_M = 6_371_000;

function radians(value) {
  return value * (Math.PI / 180);
}

function gpsDistanceMeters(left, right) {
  const lat1 = finiteNumber(left?.latitude);
  const lon1 = finiteNumber(left?.longitude);
  const lat2 = finiteNumber(right?.latitude);
  const lon2 = finiteNumber(right?.longitude);
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;

  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(2)} km`;
}

function formatCoordinate(value) {
  const number = finiteNumber(value);
  return number === null ? '—' : number.toFixed(6);
}

function newestObservation(observations, type) {
  return observations.find((item) => item?.type === type) ?? null;
}

function measurementLabel(type) {
  return {
    optical_power: 'Puissance optique',
    speed: 'Débit',
    ping: 'Ping',
    otdr: 'OTDR',
    other: 'Autre mesure',
  }[type] || text(type, 'Mesure');
}

function SummaryBlock({ eyebrow, title, children, tone = '' }) {
  return (
    <section className={`intervention-field-summary-block ${tone ? `intervention-field-summary-block--${tone}` : ''}`}>
      <header>
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </header>
      {children}
    </section>
  );
}

export default function InterventionFieldSummary({ job, fieldRecord }) {
  const observations = Array.isArray(fieldRecord?.site_observations)
    ? fieldRecord.site_observations
    : [];
  const actions = Array.isArray(fieldRecord?.field_actions)
    ? fieldRecord.field_actions
    : [];

  const cableEntry = newestObservation(observations, 'cable_entry');
  const cableExit = newestObservation(observations, 'cable_exit');
  const siteLocation = newestObservation(observations, 'site_location');
  const straightDistance = gpsDistanceMeters(cableEntry, cableExit);
  const declaredCable = finiteNumber(job?.cable_length_m);

  const measurements = actions
    .filter((item) => ['field_measurement', 'otdr_measurement'].includes(item?.type))
    .map((item) => ({
      id: item.id || item.event_id,
      type: text(item?.payload?.measurement_type, item?.type === 'otdr_measurement' ? 'otdr' : 'other'),
      value: text(item?.payload?.value),
      unit: text(item?.payload?.unit),
      comment: text(item?.payload?.comment),
      occurredAt: item?.occurred_at,
    }))
    .filter((item) => item.value)
    .slice(0, 5);

  const usedMaterials = actions
    .filter((item) => item?.type === 'material_used')
    .flatMap((action) => {
      const items = Array.isArray(action?.payload?.items) ? action.payload.items : [];
      if (items.length === 0) {
        const value = text(action?.payload?.value);
        return value ? [{ key: action.id || action.event_id, label: value, quantity: null }] : [];
      }
      return items.map((item, index) => ({
        key: `${action.id || action.event_id || 'material'}-${index}`,
        label: text(item?.label) || text(item?.reference) || `Article #${item?.item_id ?? '—'}`,
        reference: text(item?.reference),
        operator: text(item?.operator),
        quantity: finiteNumber(item?.quantity),
      }));
    })
    .slice(0, 8);

  const scans = actions
    .filter((item) => item?.type === 'equipment_scan')
    .map((item) => ({
      key: item.id || item.event_id,
      code: text(item?.payload?.serial_number) || text(item?.payload?.code),
      type: text(item?.payload?.equipment_type) || text(item?.payload?.label),
      operator: text(item?.payload?.operator),
      model: text(item?.payload?.model),
      confidence: text(item?.payload?.confidence),
    }))
    .filter((item) => item.code)
    .slice(0, 5);

  const hasGps = Boolean(siteLocation || cableEntry || cableExit);
  const hasMeasurements = measurements.length > 0 || declaredCable !== null;
  const hasMaterials = usedMaterials.length > 0 || scans.length > 0;

  if (!hasGps && !hasMeasurements && !hasMaterials) return null;

  return (
    <section className="intervention-field-summary">
      <header className="intervention-field-summary-heading">
        <div>
          <span>Exécution terrain consolidée</span>
          <h2>Ce qui a réellement été relevé</h2>
        </div>
        <small>Données synchronisées depuis l’application technicien</small>
      </header>

      <div className="intervention-field-summary-grid">
        <SummaryBlock eyebrow="Géométrie terrain" title="Entrée / sortie câble" tone="gps">
          <div className="intervention-field-gps-grid">
            <div>
              <span>Entrée</span>
              <strong>{cableEntry ? `${formatCoordinate(cableEntry.latitude)}, ${formatCoordinate(cableEntry.longitude)}` : 'Non relevée'}</strong>
              <small>{cableEntry?.accuracy_m != null ? `Précision ±${Math.round(cableEntry.accuracy_m)} m` : 'Précision inconnue'}</small>
            </div>
            <div>
              <span>Sortie</span>
              <strong>{cableExit ? `${formatCoordinate(cableExit.latitude)}, ${formatCoordinate(cableExit.longitude)}` : 'Non relevée'}</strong>
              <small>{cableExit?.accuracy_m != null ? `Précision ±${Math.round(cableExit.accuracy_m)} m` : 'Précision inconnue'}</small>
            </div>
          </div>
          <div className="intervention-field-distance">
            <span>Distance GPS entrée ↔ sortie</span>
            <strong>{formatDistance(straightDistance)}</strong>
            <small>Distance à vol d’oiseau, distincte de la longueur réellement posée.</small>
          </div>
        </SummaryBlock>

        <SummaryBlock eyebrow="Mesures" title="Contrôles et câblage" tone="measure">
          {declaredCable !== null ? (
            <div className="intervention-field-highlight">
              <span>Longueur câble déclarée</span>
              <strong>{declaredCable} m</strong>
            </div>
          ) : null}
          {measurements.length ? (
            <div className="intervention-field-list">
              {measurements.map((item) => (
                <div key={item.id || `${item.type}-${item.value}`}>
                  <span>{measurementLabel(item.type)}</span>
                  <strong>{item.value}{item.unit ? ` ${item.unit}` : ''}</strong>
                  {item.comment ? <small>{item.comment}</small> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="intervention-field-empty">Aucune mesure mobile synchronisée.</p>
          )}
        </SummaryBlock>

        <SummaryBlock eyebrow="Matériel" title="Posé / consommé / scanné" tone="stock">
          {usedMaterials.length ? (
            <div className="intervention-field-materials">
              {usedMaterials.map((item) => (
                <div key={item.key}>
                  <strong>{item.quantity !== null ? `${item.quantity}× ` : ''}{item.label}</strong>
                  <span>{[item.reference, item.operator].filter(Boolean).join(' · ') || 'Déclaration terrain'}</span>
                </div>
              ))}
            </div>
          ) : null}
          {scans.length ? (
            <div className="intervention-field-scans">
              {scans.map((scan) => (
                <div key={scan.key}>
                  <span>SN / code</span>
                  <strong>{scan.code}</strong>
                  <small>{[scan.type, scan.model, scan.operator].filter(Boolean).join(' · ') || 'Identification à compléter'}</small>
                </div>
              ))}
            </div>
          ) : null}
          {!usedMaterials.length && !scans.length ? (
            <p className="intervention-field-empty">Aucun matériel terrain synchronisé.</p>
          ) : null}
        </SummaryBlock>
      </div>
    </section>
  );
}
