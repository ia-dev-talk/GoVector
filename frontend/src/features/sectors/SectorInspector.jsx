import {
  memo,
  useState,
} from 'react';
import {
  ArchiveIcon,
  ClipboardIcon,
  EditIcon,
  ExternalIcon,
  GeometryIcon,
  LocationIcon,
  UsersIcon,
} from './SectorIcons';
import {
  normalizeIdentifier,
  statusLabel,
  technicianInitials,
  technicianName,
} from './sectorUtils';


function Metric({
  label,
  value,
  tone = 'neutral',
}) {
  return (
    <div className={`sv3-metric sv3-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}


function TechnicianList({
  technicians,
  primaryIds,
  onOpenPersonnel,
}) {
  if (technicians.length === 0) {
    return (
      <div className="sv3-inspector-empty">
        Aucun technicien n’est lié à ce secteur.
      </div>
    );
  }

  return (
    <div className="sv3-tech-list">
      {technicians.map((technician) => {
        const id =
          normalizeIdentifier(
            technician?.id,
          );

        const primary =
          primaryIds.has(id);

        return (
          <button
            type="button"
            key={id}
            onClick={() =>
              onOpenPersonnel?.(id)
            }
          >
            <span className="sv3-tech-avatar">
              {technicianInitials(
                technician,
              )}
            </span>

            <span>
              <strong>
                {technicianName(
                  technician,
                )}
              </strong>
              <small>
                {statusLabel(
                  technician?.live_status ??
                    technician?.status,
                )}
              </small>
            </span>

            {primary && (
              <em>Principal</em>
            )}
          </button>
        );
      })}
    </div>
  );
}


const SectorInspector = memo(function SectorInspector({
  sector,
  canManage,
  onEdit,
  onToggleActive,
  onNavigate,
}) {
  const [tab, setTab] =
    useState('overview');

  if (!sector) {
    return (
      <aside className="sv3-inspector sv3-inspector--empty">
        <LocationIcon />
        <strong>
          Sélectionnez un secteur
        </strong>
        <span>
          Consultez ses affectations, son activité
          et son état cartographique.
        </span>
      </aside>
    );
  }

  const primaryIds =
    new Set(
      sector.primaryTechnicians.map(
        (technician) =>
          normalizeIdentifier(
            technician?.id,
          ),
      ),
    );

  return (
    <aside className="sv3-inspector">
      <header className="sv3-inspector-header">
        <span
          className="sv3-inspector-color"
          style={{
            background:
              sector.color || '#4b8dff',
          }}
        />

        <div>
          <span>Fiche secteur</span>
          <strong>{sector.name}</strong>
          <small>
            {sector.is_active === false
              ? 'Secteur inactif'
              : 'Secteur opérationnel'}
          </small>
        </div>

        {canManage && (
          <button
            type="button"
            className="sv3-icon-button"
            onClick={() =>
              onEdit(sector)
            }
            title="Modifier"
            aria-label="Modifier le secteur"
          >
            <EditIcon />
          </button>
        )}
      </header>

      <div className="sv3-inspector-tabs">
        {[
          ['overview', 'Vue d’ensemble'],
          ['technicians', 'Techniciens'],
          ['activity', 'Activité'],
          ['geography', 'Géographie'],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={
              tab === key ? 'active' : ''
            }
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sv3-inspector-body">
        {tab === 'overview' && (
          <>
            <section>
              <div className="sv3-section-title">
                Informations
              </div>

              <p className="sv3-sector-description">
                {sector.description ||
                  'Aucune description renseignée.'}
              </p>

              <div className="sv3-detail-grid">
                <div>
                  <span>Identifiant</span>
                  <strong className="sv3-mono">
                    #{sector.id}
                  </strong>
                </div>

                <div>
                  <span>État</span>
                  <strong>
                    {sector.is_active === false
                      ? 'Inactif'
                      : 'Actif'}
                  </strong>
                </div>

                <div>
                  <span>Couleur</span>
                  <strong className="sv3-mono">
                    {sector.color || '—'}
                  </strong>
                </div>

                <div>
                  <span>Association legacy</span>
                  <strong>
                    {sector.legacyJobs}
                    {' '}intervention
                    {sector.legacyJobs > 1
                      ? 's'
                      : ''}
                  </strong>
                </div>
              </div>
            </section>

            <section>
              <div className="sv3-section-title">
                Situation du jour
              </div>

              <div className="sv3-metrics-grid">
                <Metric
                  label="Techniciens"
                  value={sector.technicians.length}
                />
                <Metric
                  label="Disponibles"
                  value={sector.available}
                  tone="success"
                />
                <Metric
                  label="Interventions"
                  value={sector.jobs.length}
                />
                <Metric
                  label="Actives"
                  value={sector.statusCounts.active}
                  tone="info"
                />
                <Metric
                  label="Non affectées"
                  value={sector.statusCounts.unassigned}
                  tone={
                    sector.statusCounts.unassigned > 0
                      ? 'warning'
                      : 'neutral'
                  }
                />
                <Metric
                  label="GPS à vérifier"
                  value={sector.gpsIssues}
                  tone={
                    sector.gpsIssues > 0
                      ? 'danger'
                      : 'neutral'
                  }
                />
              </div>
            </section>
          </>
        )}

        {tab === 'technicians' && (
          <section>
            <div className="sv3-section-title">
              Affectations relationnelles
            </div>

            <TechnicianList
              technicians={sector.technicians}
              primaryIds={primaryIds}
              onOpenPersonnel={(id) =>
                onNavigate?.(
                  'personnel',
                  { id },
                )
              }
            />
          </section>
        )}

        {tab === 'activity' && (
          <section>
            <div className="sv3-section-title">
              Interventions du jour
            </div>

            <div className="sv3-metrics-grid">
              <Metric
                label="Terminées"
                value={sector.statusCounts.completed}
                tone="success"
              />
              <Metric
                label="En cours"
                value={sector.statusCounts.inProgress}
                tone="info"
              />
              <Metric
                label="En attente"
                value={sector.statusCounts.pending}
                tone="warning"
              />
              <Metric
                label="Affectées"
                value={sector.statusCounts.assigned}
              />
            </div>

            {sector.legacyJobs > 0 && (
              <div className="sv3-legacy-note">
                {sector.legacyJobs}
                {' '}intervention
                {sector.legacyJobs > 1
                  ? 's sont encore associées'
                  : ' est encore associée'}
                {' '}par ancien libellé. La relation
                par identifiant reste prioritaire.
              </div>
            )}
          </section>
        )}

        {tab === 'geography' && (
          <section>
            <div className="sv3-section-title">
              <GeometryIcon />
              Géométrie du secteur
            </div>

            <div className="sv3-geometry-state">
              <GeometryIcon />
              <strong>
                Limites cartographiques non raccordées
              </strong>
              <span>
                Le référentiel conserve actuellement le nom,
                la couleur et les affectations. Les polygones
                QGIS/QField seront branchés comme source réelle,
                sans géométrie simulée.
              </span>
            </div>
          </section>
        )}
      </div>

      <footer className="sv3-inspector-footer">
        <button
          type="button"
          className="sv3-secondary-button"
          onClick={() =>
            onNavigate?.(
              'carte',
              {
                sector: sector.name,
                sector_id:
                  Number(sector.id) ||
                  sector.id,
              },
            )
          }
        >
          <LocationIcon />
          Carte live
        </button>

        <button
          type="button"
          className="sv3-secondary-button"
          onClick={() =>
            onNavigate?.(
              'interventions',
              {
                sector: sector.name,
                sector_id:
                  Number(sector.id) ||
                  sector.id,
              },
            )
          }
        >
          <ClipboardIcon />
          Interventions
        </button>

        {canManage && (
          <button
            type="button"
            className={[
              'sv3-secondary-button',
              sector.is_active === false
                ? 'sv3-secondary-button--success'
                : 'sv3-secondary-button--danger',
            ].join(' ')}
            onClick={() =>
              onToggleActive(sector)
            }
          >
            <ArchiveIcon />
            {sector.is_active === false
              ? 'Réactiver'
              : 'Désactiver'}
          </button>
        )}
      </footer>
    </aside>
  );
});


export default SectorInspector;
