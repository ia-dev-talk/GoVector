import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import './orienteur-assessment.css';

const STATES = { PASS: 'Vérifié', FAIL: 'Écart détecté', UNKNOWN: 'À confirmer' };
const SOURCES = {
  active: 'Fiche du technicien', skills: 'Compétences déclarées du dossier et du technicien',
  sector: 'Secteur du dossier et couverture de l’équipe',
  planning: 'Affectations courantes et créneaux planifiés', shift: 'Horaires déclarés du technicien',
  client_authorization: 'Habilitations client à vérifier', travel_and_stock: 'Trajet et besoins matériels à vérifier',
};

function CandidateReview({ jobId }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; }, []);

  const review = async () => {
    const request = ++sequence.current;
    setLoading(true); setError(''); setResult(null);
    try {
      const response = await apiClient.get(`/orienteur-agent/jobs/${encodeURIComponent(jobId)}/candidates`);
      if (request === sequence.current) setResult(response.data);
    } catch (failure) {
      if (request === sequence.current) setError(failure?.response?.status === 403
        ? 'Vous ne pouvez pas examiner les candidats de cette intervention.'
        : 'Comparaison indisponible. Rechargez les données avant de décider.');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  };

  return <section className="orienteur-candidates" aria-label="Comparaison des techniciens">
    <div className="orienteur-assessment-heading">
      <div><h4>Préparer une affectation</h4><p>Compétences, couverture du secteur et planning déclaré.</p></div>
      <button type="button" className="btn btn--secondary" onClick={review} disabled={loading}>
        {loading ? 'Comparaison…' : result ? 'Actualiser les candidats' : 'Examiner les candidats'}
      </button>
    </div>
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite">
      {result.assessment_status === 'NOT_APPLICABLE'
        ? <p>L’état actuel du dossier ne permet pas de préparer une nouvelle affectation.</p>
        : <>
          <p>{result.candidates.length} profil(s) examiné(s) sur {result.total_candidates} dans votre périmètre. Présentation par identifiant, sans classement.</p>
          {result.truncated && <p role="status">Analyse partielle : limite de {result.candidate_limit} profil(s) par comparaison.</p>}
          {result.candidates.length === 0 && <p>Aucun profil trouvé dans votre périmètre.</p>}
          {result.candidates.map((candidate) => <details className="orienteur-candidate" key={candidate.technician_id}>
            <summary>{candidate.name} · {candidate.status === 'EXCLUDED' ? 'Écart détecté' : 'À examiner'}</summary>
            <ul>{candidate.checks.map((check) => <li key={check.code} data-check-state={check.state}>
              <strong>{STATES[check.state] ?? 'À confirmer'} :</strong> {check.label}
              {check.missing_skills?.length > 0 && <span> : {check.missing_skills.join(', ')}</span>}
              {check.overlapping_assignment_count > 0 && <span> ({check.overlapping_assignment_count} chevauchement(s))</span>}
              <small>Source : {SOURCES[check.code] ?? 'Contrôle complémentaire à confirmer'}</small>
            </li>)}</ul>
          </details>)}
        </>}
      <p>Aucune affectation n’est autorisée par cette comparaison. Les inconnues et les règles du dossier doivent être vérifiées avant toute décision.</p>
      <details><summary>Limites de la comparaison</summary>
        <ul>{result.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
        <p>État consulté le {new Date(result.generated_at).toLocaleString('fr-FR')}.</p>
      </details>
    </div>}
  </section>;
}

export default function OrienteurCandidates({ jobId, revision }) {
  return <CandidateReview key={`${jobId}:${revision ?? ''}`} jobId={jobId} />;
}
