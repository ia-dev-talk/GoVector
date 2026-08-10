import { memo } from 'react';

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
    </svg>
  );
}

const InterventionEmptyState = memo(
  function InterventionEmptyState({
    title = 'Aucune intervention sélectionnée',
    description =
      'Sélectionnez une ligne du planning pour consulter le client, le réseau et le contexte d’affectation.',
    hint = 'Double-cliquez pour ouvrir la fiche détaillée.',
  }) {
    return (
      <div className="intervention-inspector-empty">
        <span className="intervention-inspector-empty-icon" aria-hidden="true">
          <ClipboardIcon />
        </span>

        <strong>{title}</strong>
        <p>{description}</p>
        <small>{hint}</small>
      </div>
    );
  },
);

InterventionEmptyState.displayName =
  'InterventionEmptyState';

export default InterventionEmptyState;
