import {
  memo,
  useEffect,
  useState,
} from 'react';
import {
  CloseIcon,
  SectorIcon,
} from './SectorIcons';
import { text } from './sectorUtils';


const DEFAULT_COLOR = '#4b8dff';


function initialForm(sector) {
  return {
    name: text(sector?.name),
    description:
      text(sector?.description),
    color:
      text(
        sector?.color,
        DEFAULT_COLOR,
      ),
    is_active:
      sector?.is_active !== false,
  };
}


const SectorEditorModal = memo(function SectorEditorModal({
  sector,
  saving,
  error,
  onClose,
  onSave,
}) {
  const [form, setForm] =
    useState(() =>
      initialForm(sector),
    );

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setForm(
          initialForm(sector),
        );
      }, 0);

    return () =>
      window.clearTimeout(timer);
  }, [sector]);

  const isEdit = Boolean(sector?.id);
  const valid =
    form.name.trim().length > 0 &&
    /^#[0-9a-fA-F]{6}$/.test(
      form.color,
    );

  const update =
    (key, value) => {
      setForm((current) => ({
        ...current,
        [key]: value,
      }));
    };

  return (
    <div
      className="sv3-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="sv3-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sv3-editor-title"
      >
        <header>
          <span className="sv3-modal-icon">
            <SectorIcon />
          </span>

          <div>
            <span>
              Référentiel secteurs
            </span>
            <strong id="sv3-editor-title">
              {isEdit
                ? 'Modifier le secteur'
                : 'Créer un secteur'}
            </strong>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="sv3-modal-body">
          <label>
            <span>Nom du secteur</span>
            <input
              type="text"
              value={form.name}
              maxLength={100}
              autoFocus
              onChange={(event) =>
                update(
                  'name',
                  event.target.value,
                )
              }
              placeholder="Ex. Hay Hassani"
            />
          </label>

          <label>
            <span>Description</span>
            <textarea
              value={form.description}
              rows={4}
              onChange={(event) =>
                update(
                  'description',
                  event.target.value,
                )
              }
              placeholder="Périmètre opérationnel du secteur…"
            />
          </label>

          <div className="sv3-color-field">
            <label>
              <span>Couleur</span>
              <input
                type="color"
                value={form.color}
                onChange={(event) =>
                  update(
                    'color',
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              <span>Code hexadécimal</span>
              <input
                type="text"
                value={form.color}
                maxLength={7}
                onChange={(event) =>
                  update(
                    'color',
                    event.target.value,
                  )
                }
              />
            </label>
          </div>

          {isEdit && (
            <label className="sv3-switch-field">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  update(
                    'is_active',
                    event.target.checked,
                  )
                }
              />
              <span>
                Secteur actif
              </span>
            </label>
          )}

          {error && (
            <div
              className="sv3-form-error"
              role="alert"
            >
              {error}
            </div>
          )}
        </div>

        <footer>
          <button
            type="button"
            className="sv3-secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </button>

          <button
            type="button"
            className="sv3-primary-button"
            disabled={
              saving || !valid
            }
            onClick={() =>
              onSave({
                name:
                  form.name.trim(),
                description:
                  form.description.trim() ||
                  null,
                color:
                  form.color,
                is_active:
                  form.is_active,
              })
            }
          >
            {saving
              ? 'Enregistrement…'
              : isEdit
                ? 'Enregistrer'
                : 'Créer le secteur'}
          </button>
        </footer>
      </section>
    </div>
  );
});


export default SectorEditorModal;
