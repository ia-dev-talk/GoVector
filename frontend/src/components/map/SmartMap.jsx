/**
 * SmartMap - Carte intelligente FieldOpt
 * Centre géographique de l'application avec couches FTTH, clustering, heatmap
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle, CircleMarker } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../api/client';
import MapLayers from './MapLayers';
import MapSearchBar from './MapSearchBar';

// Fix Leaflet default icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = Icon.Default;
DefaultIcon.prototype.options.iconUrl = icon;
DefaultIcon.prototype.options.shadowUrl = iconShadow;

// Custom icons for different element types
const icons = {
    technician: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
    job_pending: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
    job_assigned: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
    job_in_progress: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
    job_completed: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
    job_cancelled: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
    nro: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [30, 46], iconAnchor: [15, 46], popupAnchor: [1, -34], shadowSize: [46, 46] }),
    pbo: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [22, 38], iconAnchor: [11, 38], popupAnchor: [1, -34], shadowSize: [38, 38] }),
    pto: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [20, 34], iconAnchor: [10, 34], popupAnchor: [1, -34], shadowSize: [34, 34] }),
    splitter: new Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png', iconSize: [22, 38], iconAnchor: [11, 38], popupAnchor: [1, -34], shadowSize: [38, 38] }),
};

function getJobIcon(job) {
    const status = job.metadata?.status || job.status;
    const map = {
        pending: icons.job_pending,
        assigned: icons.job_assigned,
        in_progress: icons.job_in_progress,
        completed: icons.job_completed,
        cancelled: icons.job_cancelled,
    };
    return map[status] || icons.job_pending;
}

/* ── MapEventHandler: captures zoom/center changes ── */
function MapEventHandler({ onMove }) {
    const map = useMapEvents({
        moveend: () => {
            const c = map.getCenter();
            onMove?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom(), bounds: map.getBounds() });
        },
    });
    return null;
}

/* ── ClusterMarker ── */
function ClusterMarker({ cluster, onClick }) {
    const size = cluster.size || 20;
    return (
        <CircleMarker
            center={[cluster.lat, cluster.lng]}
            radius={size / 2}
            pathOptions={{
                color: cluster.color,
                fillColor: cluster.color,
                fillOpacity: 0.6,
                weight: 2,
            }}
            eventHandlers={{ click: () => onClick?.(cluster) }}
        >
            <Popup>
                <div style={{ textAlign: 'center', minWidth: '100px' }}>
                    <strong style={{ fontSize: '16px' }}>{cluster.count}</strong>
                    <p style={{ margin: '4px 0', color: '#666' }}>éléments regroupés</p>
                    {cluster.count <= 5 && cluster.points?.map((p, i) => (
                        <div key={i} style={{ fontSize: '12px', padding: '2px 0', borderTop: '1px solid #eee' }}>
                            {p.label || p.type}
                        </div>
                    ))}
                </div>
            </Popup>
        </CircleMarker>
    );
}

/* ── Main SmartMap Component ── */
export default function SmartMap({ onClose }) {
    const center = [33.5731, -7.5898]; // Casablanca
    const [mapState, setMapState] = useState({ lat: 33.5731, lng: -7.5898, zoom: 12 });
    const [layers, setLayers] = useState({
        jobs: true,
        technicians: true,
        nro: true,
        pbo: true,
        pto: true,
        splitters: true,
        zones: false,
        heatmap: false,
    });
    const [layerData, setLayerData] = useState({});
    const [clusters, setClusters] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [searchResults, setSearchResults] = useState([]);
    const debounceRef = useRef(null);

    // Load layers when visibility changes
    useEffect(() => {
        const activeLayers = Object.entries(layers)
            .filter(([, v]) => v)
            .map(([k]) => k);
        if (activeLayers.length === 0) return;

        let active = true;
        const frameId = window.requestAnimationFrame(() => {
            setLoading(true);
            api.getMapLayers({ layers: activeLayers.join(',') })
                .then((res) => {
                    if (active && res.data?.layers) {
                        setLayerData(res.data.layers);
                    }
                })
                .catch(console.error)
                .finally(() => {
                    if (active) setLoading(false);
                });
        });
        return () => {
            active = false;
            window.cancelAnimationFrame(frameId);
        };
    }, [layers]);

    // Load clusters on map move
    useEffect(() => {
        const activeLayers = Object.entries(layers).filter(([, v]) => v).map(([k]) => k);
        if (activeLayers.length === 0) return;

        const timer = setTimeout(() => {
            api.getMapClusters({
                lat: mapState.lat,
                lng: mapState.lng,
                zoom: mapState.zoom,
                layer: activeLayers[0],
                radius_km: 20,
            }).then((res) => {
                if (res.data?.clusters) setClusters(res.data.clusters);
            }).catch(console.error);
        }, 500);

        return () => clearTimeout(timer);
    }, [mapState, layers]);

    const handleLayerToggle = useCallback((layer) => {
        setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }));
    }, []);

    const handleSearch = useCallback((query) => {
        if (!query || query.length < 2) {
            setSearchResults([]);
            return;
        }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            api.searchOnMap({ q: query })
                .then((res) => setSearchResults(res.data?.results || []))
                .catch(console.error);
        }, 300);
    }, []);

    const handleResultClick = useCallback((result) => {
        setSelectedItem(result);
        setSearchResults([]);
        // Map will auto-fly via MapEventHandler trigger
    }, []);

    const totalMarkers = useMemo(() =>
        Object.values(layerData).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0),
        [layerData]
    );

    return (
        <div className="smart-map">
            {/* Header */}
            <div className="smart-map-header">
                <h2>🗺️ Carte Intelligente</h2>
                <div className="smart-map-header-info">
                    <span className="smart-map-count">{totalMarkers} marqueurs</span>
                    <span className="smart-map-zoom">Zoom {mapState.zoom}</span>
                    {loading && <span className="smart-map-loading">⏳ Chargement...</span>}
                    <button className="btn btn--sm btn--ghost" onClick={onClose}>✕</button>
                </div>
            </div>

            {/* Search Bar */}
            <MapSearchBar
                onSearch={handleSearch}
                results={searchResults}
                onResultClick={handleResultClick}
            />

            {/* Main Content */}
            <div className="smart-map-body">
                {/* Layer Controls */}
                <MapLayers
                    layers={layers}
                    onToggle={handleLayerToggle}
                    layerData={layerData}
                />

                {/* Map */}
                <div className="smart-map-container">
                    <MapContainer
                        center={center}
                        zoom={12}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={true}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OSM</a>'
                            url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
                        />

                        <MapEventHandler onMove={setMapState} />

                        {/* Technicians */}
                        {layers.technicians && layerData.technicians?.map((t) => (
                            <Marker key={t.id} position={[t.lat, t.lng]} icon={icons.technician}>
                                <Popup>
                                    <div className="map-popup">
                                        <strong>👤 {t.label}</strong>
                                        <p>Statut: {t.metadata?.status}</p>
                                        <p>📞 {t.metadata?.phone}</p>
                                        <p>Compétences: {t.metadata?.skills?.join(', ') || 'N/A'}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* NROs */}
                        {layers.nro && layerData.nro?.map((n) => (
                            <Marker key={n.id} position={[n.lat, n.lng]} icon={icons.nro}>
                                <Popup>
                                    <div className="map-popup">
                                        <strong>🏢 NRO: {n.label}</strong>
                                        <p>Interventions liées: {n.metadata?.job_count}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* PBOs */}
                        {layers.pbo && layerData.pbo?.map((p) => (
                            <Marker key={p.id} position={[p.lat, p.lng]} icon={icons.pbo}>
                                <Popup>
                                    <div className="map-popup">
                                        <strong>📡 PBO: {p.label}</strong>
                                        <p>Interventions liées: {p.metadata?.job_count}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* PTOs */}
                        {layers.pto && layerData.pto?.map((p) => (
                            <Marker key={p.id} position={[p.lat, p.lng]} icon={icons.pto}>
                                <Popup>
                                    <div className="map-popup">
                                        <strong>🏠 PTO: {p.label}</strong>
                                        <p>Client: {p.metadata?.customer}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* Splitters */}
                        {layers.splitters && layerData.splitters?.map((s) => (
                            <Marker key={s.id} position={[s.lat, s.lng]} icon={icons.splitter}>
                                <Popup>
                                    <div className="map-popup">
                                        <strong>🔀 Splitter: {s.label}</strong>
                                        <p>Interventions: {s.metadata?.job_count}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* Jobs */}
                        {layers.jobs && layerData.jobs?.map((j) => (
                            <Marker key={j.id} position={[j.lat, j.lng]} icon={getJobIcon(j)}
                                eventHandlers={{ click: () => setSelectedItem(j) }}
                            >
                                <Popup>
                                    <div className="map-popup">
                                        <strong>📋 {j.label}</strong>
                                        <p>Statut: {j.metadata?.status}</p>
                                        <p>Opérateur: {j.metadata?.operator}</p>
                                        <p>📍 {j.metadata?.address}</p>
                                        <p>PTO: {j.metadata?.pto}</p>
                                        <p>PBO: {j.metadata?.pbo}</p>
                                        <p>NRO: {j.metadata?.nro}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}

                        {/* Operator Zones */}
                        {layers.zones && layerData.zones?.map((z) => (
                            <Circle key={z.id} center={[z.lat, z.lng]} radius={z.radius_km * 1000}
                                pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: 0.1, weight: 2 }}
                            >
                                <Popup>
                                    <div className="map-popup">
                                        <strong>📍 {z.label}</strong>
                                        <p>Interventions: {z.job_count}</p>
                                    </div>
                                </Popup>
                            </Circle>
                        ))}

                        {/* Heatmap (using semi-transparent circles) */}
                        {layers.heatmap && layerData.heatmap?.map((h, i) => (
                            <Circle key={`heat-${i}`} center={[h.lat, h.lng]} radius={h.weight * 200}
                                pathOptions={{ color: '#4f8ff7', fillColor: '#4f8ff7', fillOpacity: 0.15, weight: 0 }}
                            />
                        ))}

                        {/* Clusters */}
                        {clusters.filter(c => c.is_cluster).map((c, i) => (
                            <ClusterMarker key={`cl-${i}`} cluster={c}
                                onClick={(cl) => {
                                    setMapState((prev) => ({ ...prev, lat: cl.lat, lng: cl.lng, zoom: Math.min(prev.zoom + 2, 18) }));
                                }}
                            />
                        ))}
                    </MapContainer>
                </div>

                {/* Selected Item Panel */}
                {selectedItem && (
                    <div className="smart-map-sidebar">
                        <div className="smart-map-sidebar-header">
                            <h3>Détails</h3>
                            <button className="btn btn--sm btn--ghost" onClick={() => setSelectedItem(null)}>✕</button>
                        </div>
                        <div className="smart-map-sidebar-body">
                            <p><strong>Type:</strong> {selectedItem.type}</p>
                            <p><strong>Label:</strong> {selectedItem.label}</p>
                            {Object.entries(selectedItem.metadata || {}).map(([k, v]) => (
                                <p key={k}><strong>{k}:</strong> {String(v)}</p>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
