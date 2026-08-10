import MapWindow from '../../components/MapWindow';
import {
  getCoordinates,
  text,
} from './interventionDetailUtils';

export default function InterventionMapCard({ job, fieldReference = null }) {
  const hasFieldReference =
    Number.isFinite(Number(fieldReference?.latitude)) &&
    Number.isFinite(Number(fieldReference?.longitude));
  const displayJob = hasFieldReference
    ? {
        ...job,
        latitude: Number(fieldReference.latitude),
        longitude: Number(fieldReference.longitude),
      }
    : job;
  const coordinates = getCoordinates(displayJob);

  return (
    <section className="intervention-detail-card intervention-detail-map-card">
      <header className="intervention-detail-card-header">
        <div>
          <span>{hasFieldReference ? 'Repère terrain confirmé' : 'Position préparée'}</span>
          <h2>Carte et accès</h2>
        </div>

        {coordinates ? (
          <span className="intervention-detail-map-coordinates">
            {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
          </span>
        ) : null}
      </header>

      <div className="intervention-detail-map-body">
        {coordinates ? (
          <MapWindow
            technicians={[]}
            jobs={[displayJob]}
            showFullscreenBtn
            showLegend={false}
            autoFit
            defaultCenter={[
              coordinates.latitude,
              coordinates.longitude,
            ]}
            defaultZoom={15}
            className="intervention-detail-map"
            style={{ height: '100%' }}
          />
        ) : (
          <div className="intervention-detail-empty-state intervention-detail-empty-state--map">
            <strong>Aucune coordonnée exploitable</strong>
            <span>
              La carte apparaîtra dès qu’une latitude et une longitude valides
              seront enregistrées pour cette intervention.
            </span>
          </div>
        )}
      </div>

      <footer className="intervention-detail-map-footer">
        <span>{text(job?.service_address, 'Adresse non renseignée')}</span>
        <strong>
          {hasFieldReference
            ? `${fieldReference?.origin === 'previous_field_visit' ? 'Confirmé lors d’un précédent passage' : 'Confirmé sur le terrain'}${fieldReference?.accuracy_m != null ? ` · ±${Math.round(Number(fieldReference.accuracy_m))} m` : ''}`
            : text(job?.service_city, 'Ville non renseignée')}
        </strong>
      </footer>
    </section>
  );
}
