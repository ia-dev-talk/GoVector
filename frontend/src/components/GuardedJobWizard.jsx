import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import {
  isPersistedWizardCounterText,
  isWizardMutatingButtonLabel,
  shouldWarnBeforeWizardClose,
} from '../lib/jobWizardUnsavedChanges';
import JobWizard from './JobWizard';

function canUseClosest(value) {
  return Boolean(
    value &&
      typeof value.closest === 'function',
  );
}

export default function GuardedJobWizard({
  onClose,
  onCreated,
  ...wizardProps
}) {
  const confirmationTitleId = useId();
  const confirmationDescriptionId = useId();
  const wizardBoundaryRef = useRef(null);
  const confirmationRef = useRef(null);
  const keepEditingRef = useRef(null);
  const previousFocusRef = useRef(null);
  const dirtyRef = useRef(false);
  const persistedRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const markDirty = useCallback(() => {
    if (!persistedRef.current) {
      dirtyRef.current = true;
    }
  }, []);

  const hasPersistedOutcome = useCallback(() => {
    const counterText =
      wizardBoundaryRef.current
        ?.querySelector('.wizard-counter')
        ?.textContent;

    return (
      persistedRef.current ||
      isPersistedWizardCounterText(counterText)
    );
  }, []);

  const restoreWizardFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      previousFocusRef.current?.focus?.();
    });
  }, []);

  const keepEditing = useCallback(() => {
    setConfirmOpen(false);
    restoreWizardFocus();
  }, [restoreWizardFocus]);

  const discardAndClose = useCallback(() => {
    dirtyRef.current = false;
    setConfirmOpen(false);

    if (typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  const requestClose = useCallback(() => {
    const persisted = hasPersistedOutcome();

    if (
      !shouldWarnBeforeWizardClose({
        dirty: dirtyRef.current,
        persisted,
      })
    ) {
      if (typeof onClose === 'function') {
        onClose();
      }
      return;
    }

    previousFocusRef.current = document.activeElement;
    setConfirmOpen(true);
  }, [hasPersistedOutcome, onClose]);

  const handleCreated = useCallback(
    async (savedJob) => {
      // JobWizard appelle onCreated uniquement après la sauvegarde du job et
      // la synchronisation d'affectation. À partir de ce point, fermer ne doit
      // jamais présenter le formulaire comme non enregistré, même si le
      // callback de rafraîchissement parent échoue ensuite.
      persistedRef.current = true;

      if (typeof onCreated === 'function') {
        await Promise.resolve(onCreated(savedJob));
      }
    },
    [onCreated],
  );

  const handleClickCapture = useCallback(
    (event) => {
      const target = event.target;

      if (!canUseClosest(target)) {
        return;
      }

      if (target.closest('.step-client-map')) {
        markDirty();
        return;
      }

      const actionable = target.closest(
        'button, [role="radio"]',
      );

      if (!actionable) {
        return;
      }

      if (
        actionable.getAttribute('role') === 'radio' ||
        isWizardMutatingButtonLabel(actionable.textContent)
      ) {
        markDirty();
      }
    },
    [markDirty],
  );

  useEffect(() => {
    if (!confirmOpen) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      keepEditingRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [confirmOpen]);

  const handleConfirmationKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        keepEditing();
        return;
      }

      if (
        event.key !== 'Tab' ||
        !confirmationRef.current
      ) {
        return;
      }

      const buttons = Array.from(
        confirmationRef.current.querySelectorAll(
          'button:not([disabled])',
        ),
      );

      if (buttons.length === 0) {
        event.preventDefault();
        confirmationRef.current.focus();
        return;
      }

      const first = buttons[0];
      const last = buttons[buttons.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    },
    [keepEditing],
  );

  return (
    <>
      <div
        ref={wizardBoundaryRef}
        style={{ display: 'contents' }}
        inert={confirmOpen ? true : undefined}
        aria-hidden={confirmOpen ? true : undefined}
        onInputCapture={markDirty}
        onChangeCapture={markDirty}
        onClickCapture={handleClickCapture}
      >
        <JobWizard
          {...wizardProps}
          onClose={requestClose}
          onCreated={handleCreated}
        />
      </div>

      {confirmOpen && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              keepEditing();
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            display: 'grid',
            placeItems: 'center',
            padding: 'var(--space-lg)',
            background: 'rgba(2, 8, 23, 0.68)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            ref={confirmationRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmationTitleId}
            aria-describedby={confirmationDescriptionId}
            tabIndex="-1"
            onKeyDown={handleConfirmationKeyDown}
            style={{
              width: 'min(440px, 100%)',
              padding: 'var(--space-xl)',
              background: 'var(--surface-panel)',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              boxShadow: '0 24px 70px rgba(0, 0, 0, 0.38)',
            }}
          >
            <h3
              id={confirmationTitleId}
              style={{
                margin: 0,
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-lg)',
              }}
            >
              Abandonner les modifications ?
            </h3>

            <p
              id={confirmationDescriptionId}
              style={{
                margin: 'var(--space-md) 0 0',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Les informations saisies dans cette intervention ne sont pas
              encore enregistrées. Vous pouvez continuer la saisie ou les
              abandonner.
            </p>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-sm)',
                marginTop: 'var(--space-xl)',
                flexWrap: 'wrap',
              }}
            >
              <button
                ref={keepEditingRef}
                type="button"
                className="btn btn--secondary"
                onClick={keepEditing}
              >
                Continuer la saisie
              </button>

              <button
                type="button"
                className="btn btn--danger"
                onClick={discardAndClose}
              >
                Abandonner
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
