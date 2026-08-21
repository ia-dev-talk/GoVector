import {
  forwardRef,
  useCallback,
  useState,
} from 'react';

import GuardedJobWizard from './GuardedJobWizard';
import Button from './ui/Button';

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function AddIcon({
  size = 15,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{
        display: 'block',
        flexShrink: 0,
      }}
    >
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const AddJobButton = forwardRef(
  function AddJobButton(
    {
      onCreated,
      onOpenChange,
      onClick,
      disabled = false,
      loading = false,
      label = 'Nouvelle intervention',
      children,
      variant = 'primary',
      size = 'md',
      className = '',
      wizardProps,
      'aria-label': ariaLabel,
      ...buttonProps
    },
    ref,
  ) {
    const [open, setOpen] =
      useState(false);

    const safeWizardProps =
      isRecord(wizardProps)
        ? wizardProps
        : {};

    const {
      onClose:
        wizardOnClose,
      onCreated:
        wizardOnCreated,
      initialData:
        _ignoredInitialData,
      ...remainingWizardProps
    } = safeWizardProps;

    const visibleLabel =
      normalizeText(label) ||
      'Nouvelle intervention';

    const accessibleLabel =
      normalizeText(ariaLabel) ||
      visibleLabel;

    const updateOpenState =
      useCallback(
        (nextOpen) => {
          setOpen(nextOpen);

          if (
            typeof onOpenChange ===
            'function'
          ) {
            onOpenChange(nextOpen);
          }
        },
        [onOpenChange],
      );

    const handleButtonClick =
      useCallback(
        (event) => {
          if (
            typeof onClick ===
            'function'
          ) {
            onClick(event);
          }

          if (
            event.defaultPrevented ||
            disabled ||
            loading
          ) {
            return;
          }

          updateOpenState(true);
        },
        [
          disabled,
          loading,
          onClick,
          updateOpenState,
        ],
      );

    const handleClose =
      useCallback(() => {
        updateOpenState(false);

        if (
          typeof wizardOnClose ===
          'function'
        ) {
          wizardOnClose();
        }
      }, [
        updateOpenState,
        wizardOnClose,
      ]);

    const handleCreated =
      useCallback(
        async (createdJob) => {
          if (
            typeof onCreated ===
            'function'
          ) {
            await Promise.resolve(
              onCreated(createdJob),
            );
          }

          if (
            typeof wizardOnCreated ===
            'function'
          ) {
            await Promise.resolve(
              wizardOnCreated(
                createdJob,
              ),
            );
          }
        },
        [
          onCreated,
          wizardOnCreated,
        ],
      );

    return (
      <>
        <Button
          {...buttonProps}
          ref={ref}
          type="button"
          variant={variant}
          size={size}
          className={className}
          disabled={disabled}
          loading={loading}
          onClick={
            handleButtonClick
          }
          aria-label={
            accessibleLabel
          }
          aria-haspopup="dialog"
          aria-expanded={open}
          data-state={
            open
              ? 'open'
              : 'closed'
          }
        >
          {children ?? (
            <>
              <AddIcon />

              <span className="btn-label">
                {visibleLabel}
              </span>
            </>
          )}
        </Button>

        {open && (
          <GuardedJobWizard
            {...remainingWizardProps}
            initialData={null}
            onCreated={
              handleCreated
            }
            onClose={handleClose}
          />
        )}
      </>
    );
  },
);

AddJobButton.displayName =
  'AddJobButton';

export default AddJobButton;
