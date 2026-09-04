import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../api/client';
import OrienteurCandidates from './OrienteurCandidates';
import './orienteur-assessment.css';

export default function OrienteurAssessment({ jobId, revision }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);

  useEffect(() => () => { sequence.current += 1; }, [jobId, revision]);

  const analyze = async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await apiClient.get(`/orienteur-agent/jobs/${encodeURIComponent(jobId)}/assessment`);
      if (request === sequence.current) setResult(response.data);
    } catch (failure) {
      if (request === sequence.current) {
        setError(failure?.response?.status === 403
          ? 'Cette analyse est réservée aux responsables autorisés de cette intervention.'
          : 'Analyse indisponible. Réessayez pour obtenir des données à jour.');
      }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  };

  return (
    <section className="intervention-detail-card orienteur-assessment" aria-label="Agent Orienteur">
      <div className="orienteur-assessment-heading">
        <div><h3>Agent Orienteur</h3><p>Analyse du dossier · aucune action automatique</p></div>
        <button type="button" className="btn btn--secondary" disabled={loading} onClick={analyze}>
          {loading ? 'Analyse…' : result ? 'Actualiser l’analyse' : 'Analyser le dossier'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && <div aria-live="polite">
        <p><strong>{result.next_step}</strong></p>
        <p>{result.lifecycle.label} · {result.current_visit
          ? `Passage n° ${result.current_visit.attempt_number}` : 'Aucun passage ouvert'}</p>
        <p>{result.material.movement_count} mouvement(s) matériel · {result.material.unlinked_visit_count} sans passage identifié</p>
        {result.completion && <div>
          <strong>Preuves de clôture</strong>
          {result.completion.blocking_requirements.length > 0
            ? <ul>{result.completion.blocking_requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
            : <p>Les exigences de preuve configurées sont satisfaites. La validation du workflow reste nécessaire.</p>}
        </div>}
        {result.findings.length > 0 ? <ul>{result.findings.map((finding) => (
          <li key={finding.code} data-severity={finding.severity}>{finding.label}</li>
        ))}</ul> : <p>Aucune anomalie détectée dans les contrôles effectués.</p>}
        <details><summary>Périmètre et limites de l’analyse</summary>
          <ul>{result.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
          <p>État consulté le {new Date(result.generated_at).toLocaleString('fr-FR')}.</p>
          <p>Sources : intervention, passage courant, affectation et journal matériel.</p>
        </details>
      </div>}
      <OrienteurCandidates jobId={jobId} revision={revision} />
    </section>
  );
}
