import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildHolderOptions,
  filterHolderOptions,
  nextHolderActiveIndex,
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

function optionDomId(option) {
  return `stock-holder-option-${String(option?.key || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function HolderOption({ option, selected, active, onActivate, onSelect }) {
  return (
    <button
      id={optionDomId(option)}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className={[
        'st3-holder-option',
        selected ? 'st3-holder-option--selected' : '',
        active ? 'st3-holder-option--active' : '',
        option.empty ? 'st3-holder-option--empty' : '',
      ].join(' ')}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onActivate}
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
  const [activeIndex, setActiveIndex] = useState(-1);

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
  const boundedActiveIndex = activeIndex >= 0 && activeIndex < visibleOptions.length
    ? activeIndex
    : -1;
  const activeOption = boundedActiveIndex >= 0 ? visibleOptions[boundedActiveIndex] : null;
  const activeOptionId = open && activeOption ? optionDomId(activeOption) : undefined;

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open || !activeOptionId) return;
    const optionElement = document.getElementById(activeOptionId);
    if (optionElement && rootRef.current?.contains(optionElement)) {
      optionElement.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionId, open]);

  const selectOption = (option) => {
    onSelect({
      kind: option.kind,
      warehouseId: option.warehouseId ?? null,
      technicianId: option.technicianId ?? null,
    });
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const activateSelectedOption = () => {
    const candidates = [groups.all, ...groups.physical, ...groups.technicians];
    const index = candidates.findIndex((option) => option.key === selectedOption.key);
    setActiveIndex(index >= 0 ? index : 0);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      setQuery('');
      setActiveIndex(-1);
      return;
    }

    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setQuery('');
      }
      setActiveIndex((current) => nextHolderActiveIndex(
        current,
        visibleOptions.length,
        event.key,
      ));
      return;
    }

    if (event.key === 'Enter' && open) {
      const option = activeOption || (visibleOptions.length === 1 ? visibleOptions[0] : null);
      if (option) {
        event.preventDefault();
        selectOption(option);
      }
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
          aria-activedescendant={activeOptionId}
          role="combobox"
          onFocus={() => {
            setOpen(true);
            setQuery('');
            activateSelectedOption();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="st3-holder-picker__toggle"
          aria-label={open ? 'Fermer la liste des détenteurs' : 'Ouvrir la liste des détenteurs'}
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => {
              const nextOpen = !current;
              if (nextOpen) {
                activateSelectedOption();
              } else {
                setActiveIndex(-1);
              }
              return nextOpen;
            });
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
              active={activeOption?.key === filtered.all.key}
              onActivate={() => setActiveIndex(visibleOptions.findIndex((option) => option.key === filtered.all.key))}
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
                  active={activeOption?.key === option.key}
                  onActivate={() => setActiveIndex(visibleOptions.findIndex((candidate) => candidate.key === option.key))}
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
                  active={activeOption?.key === option.key}
                  onActivate={() => setActiveIndex(visibleOptions.findIndex((candidate) => candidate.key === option.key))}
                  onSelect={selectOption}
                />
              ))}
            </section>
          ) : null}

          {visibleOptions.length === 0 ? (
            <div className="st3-holder-picker__empty" role="status">Aucun détenteur correspondant.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
