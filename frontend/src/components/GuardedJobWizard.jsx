import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import {
  captureWizardState,
  isPersistedWizardCounterText,
  isWizardMutatingButtonLabel,
  shouldWarnBeforeWizardClose,
  wizardStateChanged,
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
  const initialStateRef = useRef(null);
  const interactionStartedRef = useRef(false);
  const dirtyRef = useRef(false);
  const persistedRef = useRef(false);
  const dirtyFrameRef = useRef(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const captureCurrentState = useCallback(() => {
    return captureWizardState(wizardBoundaryRef.current);
  }, []);

  const freezeInitialState = useCallback(() => {
    if (interactionStartedRef.current) {
      return;
    }

    initialStateRef.current = captureCurrentState();
    interactionStartedRef.current = true;
  }, [captureCurrentState]);

  const reconcileDirtyState = useCallback(() => {
    if (persistedRef.current) {
      dirtyRef.current = false;
      return;
    }

    if (!interactionStartedRef.current) {
      initialStateRef.current = captureCurrentState();
      dirtyRef.current = false;
      return;
    }

    dirtyRef.current = wizardStateChanged(
      initialStateRef.current,
      captureCurrentState(),
    );
  }, [captureCurrentState]);

  const scheduleDirtyReconciliation = useCallback(() => {
    if (dirtyFrameRef.current !== null) {
      window.cancelAnimationFrame(dirtyFrameRef.current);
    }

    dirtyFrameRef.current = window.requestAnimationFrame(() => {
      dirtyFrameRef.current = null;
      reconcileDirtyState();
    });
  }, [reconcileDirtyState]);

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
    reconcileDirtyState();
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
  }, [hasPersistedOutcome, onClose, reconcileDirtyState]);

  const handleCreated = useCallback(
    async (savedJob) => {
      // JobWizard appelle onCreated uniquement après la sauvegarde du job et
      // la synchronisation d'affectation. À partir de ce point, fermer ne doit
      // jamais présenter le formulaire comme non enregistré, même si le
      // callback de rafraîchissement parent échoue ensuite.
      persistedRef.current = true;
      dirtyRef.current = false;

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
        freezeInitialState();
        scheduleDirtyReconciliation();
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
        freezeInitialState();
        scheduleDirtyReconciliation();
      }
    },
    [freezeInitialState, scheduleDirtyReconciliation],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!interactionStartedRef.current) {
        initialStateRef.current = captureCurrentState();
      }
    });

    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(() => {
          if (!interactionStartedRef.current) {
            initialStateRef.current = captureCurrentState();
          }
        })
      : null;

    if (observer && wizardBoundaryRef.current) {
      observer.observe(wizardBoundaryRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['value', 'checked', 'aria-checked', 'disabled'],
      });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      if (dirtyFrameRef.current !== null) {
        window.cancelAnimationFrame(dirtyFrameRef.current);
        dirtyFrameRef.current = null;
      }
    };
  }, [captureCurrentState]);

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
        onPointerDownCapture={freezeInitialState}
        onKeyDownCapture={freezeInitialState}
        onBeforeInputCapture={freezeInitialState}
        onInputCapture={scheduleDirtyReconciliation}
        onChangeCapture={scheduleDirtyReconciliation}
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
