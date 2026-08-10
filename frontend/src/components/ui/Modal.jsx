import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const MODAL_WIDTHS = Object.freeze({
  sm: '400px',
  md: '640px',
  lg: '900px',
  xl: '1200px',
  full: 'calc(100vw - 32px)',
});

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

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

function normalizeSize(value) {
  if (typeof value !== 'string') {
    return 'md';
  }

  const normalized =
    value.trim().toLowerCase();

  return Object.hasOwn(
    MODAL_WIDTHS,
    normalized,
  )
    ? normalized
    : 'md';
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll(
      FOCUSABLE_SELECTOR,
    ),
  ).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (
      element.hidden ||
      element.getAttribute(
        'aria-hidden',
      ) === 'true'
    ) {
      return false;
    }

    const style =
      window.getComputedStyle(element);

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}

const Modal = forwardRef(
  function Modal(
    {
      open,
      onClose,
      title,
      children,
      footer,
      size = 'md',
      closeOnOverlay = true,
      closeOnEscape = true,
      showCloseButton = true,
      initialFocusRef,
      className = '',
      overlayClassName = '',
      headerClassName = '',
      titleClassName = '',
      bodyClassName = '',
      footerClassName = '',
      overlayProps,
      dialogProps,
      headerProps,
      titleProps,
      bodyProps,
      footerProps,
    },
    forwardedRef,
  ) {
    const generatedTitleId = useId();
    const generatedBodyId = useId();

    const dialogRef = useRef(null);
    const bodyRef = useRef(null);
    const closeButtonRef = useRef(null);
    const previousFocusRef = useRef(null);

    useImperativeHandle(
      forwardedRef,
      () => dialogRef.current,
      [],
    );

    const safeOverlayProps =
      isRecord(overlayProps)
        ? overlayProps
        : {};

    const safeDialogProps =
      isRecord(dialogProps)
        ? dialogProps
        : {};

    const safeHeaderProps =
      isRecord(headerProps)
        ? headerProps
        : {};

    const safeTitleProps =
      isRecord(titleProps)
        ? titleProps
        : {};

    const safeBodyProps =
      isRecord(bodyProps)
        ? bodyProps
        : {};

    const safeFooterProps =
      isRecord(footerProps)
        ? footerProps
        : {};

    const hasTitle =
      hasRenderableContent(title);

    const hasBody =
      hasRenderableContent(children);

    const hasFooter =
      hasRenderableContent(footer);

    const normalizedSize =
      normalizeSize(size);

    const {
      className:
        overlayPropsClassName,
      style: overlayStyle,
      onMouseDown:
        overlayMouseDown,
      ...remainingOverlayProps
    } = safeOverlayProps;

    const {
      className:
        dialogPropsClassName,
      style: dialogStyle,
      onKeyDown:
        dialogKeyDown,
      'aria-label':
        explicitAriaLabel,
      'aria-labelledby':
        explicitAriaLabelledBy,
      'aria-describedby':
        explicitAriaDescribedBy,
      ...remainingDialogProps
    } = safeDialogProps;

    const {
      className:
        headerPropsClassName,
      style: headerStyle,
      ...remainingHeaderProps
    } = safeHeaderProps;

    const {
      className:
        titlePropsClassName,
      style: titleStyle,
      id: explicitTitleId,
      role: titleRole,
      'aria-level':
        titleAriaLevel,
      ...remainingTitleProps
    } = safeTitleProps;

    const {
      className:
        bodyPropsClassName,
      style: bodyStyle,
      id: explicitBodyId,
      ...remainingBodyProps
    } = safeBodyProps;

    const {
      className:
        footerPropsClassName,
      style: footerStyle,
      ...remainingFooterProps
    } = safeFooterProps;

    const titleId = hasTitle
      ? (
          String(
            explicitTitleId ?? '',
          ).trim() ||
          `${generatedTitleId}-title`
        )
      : undefined;

    const bodyId = hasBody
      ? (
          String(
            explicitBodyId ?? '',
          ).trim() ||
          `${generatedBodyId}-body`
        )
      : undefined;

    const canClose =
      typeof onClose === 'function';

    const closeModal =
      useCallback(() => {
        if (!canClose) {
          return;
        }

        onClose();
      }, [canClose, onClose]);

    const handleOverlayMouseDown =
      useCallback(
        (event) => {
          if (
            typeof overlayMouseDown ===
            'function'
          ) {
            overlayMouseDown(event);
          }

          if (
            event.defaultPrevented ||
            !closeOnOverlay ||
            !canClose ||
            event.target !==
              event.currentTarget
          ) {
            return;
          }

          closeModal();
        },
        [
          canClose,
          closeModal,
          closeOnOverlay,
          overlayMouseDown,
        ],
      );

    const handleDialogKeyDown =
      useCallback(
        (event) => {
          if (
            typeof dialogKeyDown ===
            'function'
          ) {
            dialogKeyDown(event);
          }

          if (event.defaultPrevented) {
            return;
          }

          if (event.key === 'Escape') {
            if (
              closeOnEscape &&
              canClose
            ) {
              event.preventDefault();
              event.stopPropagation();
              closeModal();
            }

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
            getFocusableElements(dialog);

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
        [
          canClose,
          closeModal,
          closeOnEscape,
          dialogKeyDown,
        ],
      );

    useEffect(() => {
      if (!open) {
        return undefined;
      }

      previousFocusRef.current =
        document.activeElement instanceof
        HTMLElement
          ? document.activeElement
          : null;

      const animationFrameId =
        window.requestAnimationFrame(
          () => {
            const explicitTarget =
              initialFocusRef?.current;

            const bodyTarget =
              getFocusableElements(
                bodyRef.current,
              )[0];

            const dialogTarget =
              getFocusableElements(
                dialogRef.current,
              )[0];

            (
              explicitTarget ||
              bodyTarget ||
              dialogTarget ||
              closeButtonRef.current ||
              dialogRef.current
            )?.focus();
          },
        );

      return () => {
        window.cancelAnimationFrame(
          animationFrameId,
        );

        const previousFocus =
          previousFocusRef.current;

        previousFocusRef.current =
          null;

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
    }, [initialFocusRef, open]);

    if (
      !open ||
      typeof document === 'undefined'
    ) {
      return null;
    }

    const ariaLabelledBy =
      explicitAriaLabel ||
      explicitAriaLabelledBy ||
      !hasTitle
        ? explicitAriaLabelledBy
        : titleId;

    const ariaDescribedBy =
      explicitAriaDescribedBy ||
      (
        hasBody
          ? bodyId
          : undefined
      );

    const modalContent = (
      <div
        {...remainingOverlayProps}
        className={mergeClassNames(
          'confirm-overlay',
          'modal-overlay',
          overlayClassName,
          overlayPropsClassName,
        )}
        style={{
          padding: '16px',
          ...(
            isRecord(overlayStyle)
              ? overlayStyle
              : {}
          ),
        }}
        onMouseDown={
          handleOverlayMouseDown
        }
      >
        <div
          {...remainingDialogProps}
          ref={dialogRef}
          className={mergeClassNames(
            'confirm-modal',
            'modal',
            className,
            dialogPropsClassName,
          )}
          role="dialog"
          aria-modal="true"
          aria-label={
            explicitAriaLabel ||
            (
              !ariaLabelledBy
                ? 'Fenêtre de dialogue'
                : undefined
            )
          }
          aria-labelledby={
            ariaLabelledBy
          }
          aria-describedby={
            ariaDescribedBy
          }
          tabIndex={-1}
          onKeyDown={
            handleDialogKeyDown
          }
          data-modal-size={
            normalizedSize
          }
          style={{
            width: '100%',
            maxWidth:
              MODAL_WIDTHS[
                normalizedSize
              ],
            maxHeight:
              'calc(100dvh - 32px)',
            padding: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            ...(
              isRecord(dialogStyle)
                ? dialogStyle
                : {}
            ),
          }}
        >
          {(hasTitle ||
            (
              showCloseButton &&
              canClose
            )) && (
            <div
              {...remainingHeaderProps}
              className={mergeClassNames(
                'confirm-title',
                'modal-header',
                headerClassName,
                headerPropsClassName,
              )}
              style={{
                flexShrink: 0,
                padding:
                  'var(--space-lg) var(--space-xl)',
                marginBottom: 0,
                borderBottom:
                  '1px solid var(--border-light)',
                background:
                  'var(--surface-panel-alt)',
                ...(
                  isRecord(headerStyle)
                    ? headerStyle
                    : {}
                ),
              }}
            >
              {hasTitle && (
                <div
                  {...remainingTitleProps}
                  id={titleId}
                  className={mergeClassNames(
                    'modal-title',
                    titleClassName,
                    titlePropsClassName,
                  )}
                  role={
                    titleRole ??
                    'heading'
                  }
                  aria-level={
                    titleAriaLevel ?? 2
                  }
                  style={{
                    minWidth: 0,
                    flex: 1,
                    overflowWrap:
                      'anywhere',
                    ...(
                      isRecord(titleStyle)
                        ? titleStyle
                        : {}
                    ),
                  }}
                >
                  {title}
                </div>
              )}

              {showCloseButton &&
                canClose && (
                  <button
                    ref={
                      closeButtonRef
                    }
                    type="button"
                    className="fw-close"
                    onClick={
                      closeModal
                    }
                    aria-label="Fermer la fenêtre"
                    title="Fermer"
                  >
                    <span
                      aria-hidden="true"
                    >
                      ×
                    </span>
                  </button>
                )}
            </div>
          )}

          <div
            {...remainingBodyProps}
            ref={bodyRef}
            id={bodyId}
            className={mergeClassNames(
              'confirm-body',
              'modal-body',
              bodyClassName,
              bodyPropsClassName,
            )}
            style={{
              minWidth: 0,
              minHeight: 0,
              flex: 1,
              overflowY: 'auto',
              padding:
                'var(--space-xl)',
              marginBottom: 0,
              overflowWrap: 'anywhere',
              ...(
                isRecord(bodyStyle)
                  ? bodyStyle
                  : {}
              ),
            }}
          >
            {children}
          </div>

          {hasFooter && (
            <div
              {...remainingFooterProps}
              className={mergeClassNames(
                'confirm-actions',
                'modal-footer',
                footerClassName,
                footerPropsClassName,
              )}
              style={{
                flexShrink: 0,
                padding:
                  'var(--space-lg) var(--space-xl)',
                borderTop:
                  '1px solid var(--border-light)',
                background:
                  'var(--surface-panel-alt)',
                ...(
                  isRecord(footerStyle)
                    ? footerStyle
                    : {}
                ),
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    );

    return createPortal(
      modalContent,
      document.body,
    );
  },
);

Modal.displayName = 'Modal';

export default Modal;
