/**
 * MapSearchBar - Search bar for the smart map
 * Searches jobs, technicians, PTOs, NROs directly on the map
 */
import { useState, useRef, useEffect, useCallback } from 'react';

export default function MapSearchBar({ onSearch, results = [], onResultClick }) {
    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    const handleChange = useCallback((e) => {
        const val = e.target.value;
        setQuery(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onSearch?.(val);
        }, 300);
    }, [onSearch]);

    const handleClear = useCallback(() => {
        setQuery('');
        onSearch?.('');
        inputRef.current?.focus();
    }, [onSearch]);

    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            handleClear();
            inputRef.current?.blur();
        }
    }, [handleClear]);

    // Close results on click outside
    useEffect(() => {
        const handler = (e) => {
            if (inputRef.current && !inputRef.current.closest('.map-search-bar')?.contains(e.target)) {
                setFocused(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const showResults = focused && results.length > 0 && query.length >= 2;

    return (
        <div className="map-search-bar">
            <div className="map-search-input-wrapper">
                <span className="map-search-icon">🔍</span>
                <input
                    ref={inputRef}
                    type="text"
                    className="map-search-input"
                    placeholder="Rechercher sur la carte (client, adresse, NRO, PBO, PTO, technicien...)"
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setFocused(true)}
                />
                {query && (
                    <button className="map-search-clear" onClick={handleClear}>
                        ✕
                    </button>
                )}
            </div>

            {showResults && (
                <div className="map-search-results">
                    {results.length === 0 && query.length >= 2 ? (
                        <div className="map-search-no-results">
                            Aucun résultat pour "{query}"
                        </div>
                    ) : (
                        results.map((result, i) => (
                            <div
                                key={`${result.layer}-${result.id}-${i}`}
                                className="map-search-result-item"
                                onClick={() => onResultClick?.(result)}
                            >
                                <span className="map-search-result-type">
                                    {result.type === 'technician' ? '👤' :
                                     result.type === 'NRO' ? '🏢' :
                                     result.type === 'PBO' ? '📡' :
                                     result.type === 'PTO' ? '🏠' :
                                     result.type === 'splitter' ? '🔀' : '📋'}
                                </span>
                                <div className="map-search-result-info">
                                    <span className="map-search-result-label">{result.label}</span>
                                    <span className="map-search-result-sub">
                                        {result.metadata?.customer || result.metadata?.name || result.metadata?.address || result.type}
                                    </span>
                                </div>
                                <span className="map-search-result-layer">{result.layer}</span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}