import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildHolderOptions,
  filterHolderOptions,
} from './stockHolderScope';
import './stock-holder-picker.css';

function optionMatchesScope(option, warehouseId, technicianId) {
  if (!option) return false;
  if (option.kind === 'all') {
    return warehouseId === null && technicianId === null;
  }
  if (option.kind === 'technician') {
    return option.technicianId === technicianId;
  }
  return technicianId === null && option.warehouseId === warehouseId;
}

function HolderOption({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={[
        'st3-holder-option',
        selected ? 'st3-holder-option--selected' : '',
        option.empty ? 'st3-holder-option--empty' : '',
      ].join(' ')}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(option)}
    >
      <span>
        <strong>{option.label}</strong>
        {option.meta ? <small>{option.meta}</small> : null}
      </span>
      {option.empty ? <em>Aucun stock</em> : null}
    </button>
  );
}

export default function StockHolderPicker({
  warehouses,
  technicians,
  selectedWarehouseId,
  selectedTechnicianId,
  onSelect,
}) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () => buildHolderOptions(warehouses, technicians),
    [technicians, warehouses],
  );
  const filtered = useMemo(
    () => filterHolderOptions(groups, query),
    [groups, query],
  );
  const selectedOption = useMemo(() => {
    const candidates = [groups.all, ...groups.physical, ...groups.technicians];
    return candidates.find((option) => optionMatchesScope(
      option,
      selectedWarehouseId,
      selectedTechnicianId,
    )) || groups.all;
  }, [groups, selectedTechnicianId, selectedWarehouseId]);

  const visibleOptions = useMemo(
    () => [
      ...(filtered.all ? [filtered.all] : []),
      ...filtered.physical,
      ...filtered.technicians,
    ],
    [filtered],
  );

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const selectOption = (option) => {
    onSelect({
      kind: option.kind,
      warehouseId: option.warehouseId ?? null,
      technicianId: option.technicianId ?? null,
    });
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      return;
    }
    if (event.key === 'ArrowDown') {
      setOpen(true);
      return;
    }
    if (event.key === 'Enter' && open && query.trim() && visibleOptions.length === 1) {
      event.preventDefault();
      selectOption(visibleOptions[0]);
    }
  };

  const listId = 'stock-holder-options';

  return (
    <div className="st3-holder-picker" ref={rootRef}>
      <label htmlFor="stock-holder-search">Filtrer par détenteur</label>
      <div className="st3-holder-picker__control">
        <input
          id="stock-holder-search"
          ref={inputRef}
          type="search"
          value={open ? query : selectedOption.label}
          placeholder="Nom, matricule, code dépôt…"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          role="combobox"
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="st3-holder-picker__toggle"
          aria-label={open ? 'Fermer la liste des détenteurs' : 'Ouvrir la liste des détenteurs'}
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => !current);
            setQuery('');
            inputRef.current?.focus();
          }}
        >
          ▾
        </button>
      </div>

      {open ? (
        <div id={listId} role="listbox" className="st3-holder-picker__menu">
          {filtered.all ? (
            <HolderOption
              option={filtered.all}
              selected={optionMatchesScope(filtered.all, selectedWarehouseId, selectedTechnicianId)}
              onSelect={selectOption}
            />
          ) : null}

          {filtered.physical.length ? (
            <section aria-label="Dépôts">
              <div className="st3-holder-picker__group">Dépôts · {filtered.physical.length}</div>
              {filtered.physical.map((option) => (
                <HolderOption
                  key={option.key}
                  option={option}
                  selected={optionMatchesScope(option, selectedWarehouseId, selectedTechnicianId)}
                  onSelect={selectOption}
                />
              ))}
            </section>
          ) : null}

          {filtered.technicians.length ? (
            <section aria-label="Techniciens">
              <div className="st3-holder-picker__group">Techniciens · {filtered.technicians.length}</div>
              {filtered.technicians.map((option) => (
                <HolderOption
                  key={option.key}
                  option={option}
                  selected={optionMatchesScope(option, selectedWarehouseId, selectedTechnicianId)}
                  onSelect={selectOption}
                />
              ))}
            </section>
          ) : null}

          {visibleOptions.length === 0 ? (
            <div className="st3-holder-picker__empty">Aucun détenteur correspondant.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
