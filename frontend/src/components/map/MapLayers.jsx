/**
 * MapLayers - Control panel for toggling map layers visibility
 */
export default function MapLayers({ layers, onToggle, layerData }) {
    const layerLabels = {
        jobs: { label: 'Interventions', icon: '📋', color: '#4f8ff7' },
        technicians: { label: 'Techniciens', icon: '👤', color: '#22c55e' },
        nro: { label: 'NRO', icon: '🏢', color: '#ef4444' },
        pbo: { label: 'PBO', icon: '📡', color: '#f59e0b' },
        pto: { label: 'PTO', icon: '🏠', color: '#22c55e' },
        splitters: { label: 'Splitters', icon: '🔀', color: '#8b5cf6' },
        zones: { label: 'Zones opérateurs', icon: '📍', color: '#ec4899' },
        heatmap: { label: 'Heatmap', icon: '🔥', color: '#f97316' },
    };

    return (
        <div className="map-layers-control">
            <div className="map-layers-header">
                <h3>Couches</h3>
            </div>
            <div className="map-layers-list">
                {Object.entries(layerLabels).map(([key, meta]) => {
                    const count = Array.isArray(layerData[key]) ? layerData[key].length : 0;
                    return (
                        <label key={key} className="map-layer-item">
                            <input
                                type="checkbox"
                                checked={!!layers[key]}
                                onChange={() => onToggle(key)}
                                className="map-layer-checkbox"
                            />
                            <span
                                className="map-layer-color"
                                style={{ backgroundColor: meta.color }}
                            />
                            <span className="map-layer-icon">{meta.icon}</span>
                            <span className="map-layer-label">{meta.label}</span>
                            {count > 0 && (
                                <span className="map-layer-count">{count}</span>
                            )}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}