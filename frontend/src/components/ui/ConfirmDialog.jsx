import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function normalizeClassName(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function mergeClassNames(...values) {
  return values
    .map(normalizeClassName)
    .filter(Boolean)
    .join(' ');
}

function hasRenderableContent(value) {
  if (
    value === null ||
    value === undefined ||
    value === false
  ) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
}

function isPromiseLike(value) {
  return (
    value !== null &&
    (
      typeof value === 'object' ||
      typeof value === 'function'
    ) &&
    typeof value.then === 'function'
  );
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmation',
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  disabled = false,
  className = '',
  overlayClassName = '',
  titleClassName = '',
  bodyClassName = '',
  actionsClassName = '',
}) {
  const titleId = useId();
  const descriptionId = useId();

  const dialogRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const mountedRef = useRef(false);
  const confirmPendingRef = useRef(false);

  const [confirmPending, setConfirmPending] =
    useState(false);

  const hasTitle =
    hasRenderableContent(title);

  const hasMessage =
    hasRenderableContent(message);

  const closeDialog = useCallback(() => {
    if (
      confirmPendingRef.current ||
      disabled ||
      typeof onClose !== 'function'
    ) {
      return;
    }

    onClose();
  }, [disabled, onClose]);

  const handleConfirm = useCallback(
    async () => {
      if (
        confirmPendingRef.current ||
        disabled ||
        typeof onConfirm !== 'function'
      ) {
        return;
      }

      let result;

      try {
        result = onConfirm();
      } catch (error) {
        console.error(
          'Erreur pendant la confirmation :',
          error,
        );

        return;
      }

      if (!isPromiseLike(result)) {
        return;
      }

      confirmPendingRef.current = true;
      setConfirmPending(true);

      try {
        await result;
      } catch (error) {
        console.error(
          'Erreur pendant la confirmation :',
          error,
        );
      } finally {
        confirmPendingRef.current = false;

        if (mountedRef.current) {
          setConfirmPending(false);
        }
      }
    },
    [disabled, onConfirm],
  );

  const handleOverlayClick =
    useCallback(
      (event) => {
        if (
          event.target !==
          event.currentTarget
        ) {
          return;
        }

        closeDialog();
      },
      [closeDialog],
    );

  const handleDialogKeyDown =
    useCallback(
      (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();

          closeDialog();
          return;
        }

        if (event.key !== 'Tab') {
          return;
        }

        const dialog =
          dialogRef.current;

        if (!dialog) {
          return;
        }

        const focusableElements =
          Array.from(
            dialog.querySelectorAll(
              FOCUSABLE_SELECTOR,
            ),
          ).filter(
            (element) =>
              element instanceof
                HTMLElement &&
              !element.hidden &&
              element.getAttribute(
                'aria-hidden',
              ) !== 'true',
          );

        if (
          focusableElements.length === 0
        ) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        const firstElement =
          focusableElements[0];

        const lastElement =
          focusableElements[
            focusableElements.length - 1
          ];

        const activeElement =
          document.activeElement;

        if (
          event.shiftKey &&
          (
            activeElement ===
              firstElement ||
            !dialog.contains(
              activeElement,
            )
          )
        ) {
          event.preventDefault();
          lastElement.focus();
          return;
        }

        if (
          !event.shiftKey &&
          activeElement === lastElement
        ) {
          event.preventDefault();
          firstElement.focus();
        }
      },
      [closeDialog],
    );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      confirmPendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      confirmPendingRef.current = false;
      setConfirmPending(false);
      return undefined;
    }

    previousFocusRef.current =
      document.activeElement instanceof
      HTMLElement
        ? document.activeElement
        : null;

    const animationFrameId =
      window.requestAnimationFrame(() => {
        const preferredButton =
          danger
            ? cancelButtonRef.current
            : confirmButtonRef.current;

        (
          preferredButton ||
          cancelButtonRef.current ||
          confirmButtonRef.current ||
          dialogRef.current
        )?.focus();
      });

    return () => {
      window.cancelAnimationFrame(
        animationFrameId,
      );

      const previousFocus =
        previousFocusRef.current;

      previousFocusRef.current = null;

      if (
        previousFocus &&
        previousFocus.isConnected
      ) {
        window.requestAnimationFrame(
          () => {
            previousFocus.focus();
          },
        );
      }
    };
  }, [danger, open]);

  if (
    !open ||
    typeof document === 'undefined'
  ) {
    return null;
  }

  const interactionDisabled =
    disabled || confirmPending;

  const dialogRole =
    danger
      ? 'alertdialog'
      : 'dialog';

  const content = (
    <div
      className={mergeClassNames(
        'confirm-overlay',
        overlayClassName,
      )}
      onMouseDown={handleOverlayClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        className={mergeClassNames(
          'confirm-modal',
          className,
        )}
        role={dialogRole}
        aria-modal="true"
        aria-labelledby={
          hasTitle
            ? titleId
            : undefined
        }
        aria-describedby={
          hasMessage
            ? descriptionId
            : undefined
        }
        aria-busy={confirmPending}
        tabIndex={-1}
        onKeyDown={
          handleDialogKeyDown
        }
        style={{
          maxHeight:
            'min(90vh, 640px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          id={
            hasTitle
              ? titleId
              : undefined
          }
          className={mergeClassNames(
            'confirm-title',
            titleClassName,
          )}
          style={{
            marginBottom:
              hasMessage
                ? 'var(--space-md)'
                : 'var(--space-xl)',
          }}
        >
          <span
            style={{
              minWidth: 0,
              flex: 1,
              overflowWrap: 'anywhere',
            }}
          >
            {hasTitle
              ? title
              : 'Confirmation'}
          </span>

          <button
            type="button"
            className="fw-close"
            onClick={closeDialog}
            disabled={interactionDisabled}
            aria-label="Fermer la confirmation"
            title="Fermer"
          >
            <span aria-hidden="true">
              ×
            </span>
          </button>
        </div>

        {hasMessage && (
          <div
            id={descriptionId}
            className={mergeClassNames(
              'confirm-body',
              bodyClassName,
            )}
            style={{
              minWidth: 0,
              overflowY: 'auto',
              overflowWrap: 'anywhere',
            }}
          >
            {message}
          </div>
        )}

        <div
          className={mergeClassNames(
            'confirm-actions',
            actionsClassName,
          )}
        >
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn btn--secondary"
            onClick={closeDialog}
            disabled={interactionDisabled}
          >
            {cancelLabel}
          </button>

          <button
            ref={confirmButtonRef}
            type="button"
            className={
              danger
                ? 'btn btn--danger'
                : 'btn btn--primary'
            }
            onClick={handleConfirm}
            disabled={
              interactionDisabled ||
              typeof onConfirm !==
                'function'
            }
            aria-busy={confirmPending}
          >
            {confirmPending
              ? 'Traitement…'
              : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    content,
    document.body,
  );
}
