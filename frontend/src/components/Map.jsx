import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

// Correction des icônes par défaut
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = Icon.Default;
DefaultIcon.prototype.options.iconUrl = icon;
DefaultIcon.prototype.options.shadowUrl = iconShadow;

const techIcon = new Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const jobIcon = new Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

function AutoZoom({ technicians, jobs }) {
    const map = useMap();

    useEffect(() => {
        if ((technicians && technicians.length > 0) || (jobs && jobs.length > 0)) {
            const bounds = [];

            technicians?.forEach(tech => {
                if (tech.current_latitude && tech.current_longitude) {
                    bounds.push([Number(tech.current_latitude), Number(tech.current_longitude)]);
                }
            });

            jobs?.forEach(job => {
                const lat = job.latitude;
                const lng = job.longitude;

                if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
                    bounds.push([Number(lat), Number(lng)]);
                }
            });

            if (bounds.length > 0) {
                setTimeout(() => {
                    map.invalidateSize();
                    map.fitBounds(bounds, { padding: [50, 50] });
                }, 150);
            }
        }
    }, [technicians, jobs, map]);

    return null;
}

export default function Map({ technicians = [], jobs = [] }) {
    const center = [33.5731, -7.5898]; // Casablanca

    return (
        <div style={{ height: '600px', width: '100%', background: '#e5e7eb' }}>
            <MapContainer
                center={center}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
            >
                {/* Serveur mondial OpenStreetMap hébergé par la Fondation Wikimedia */}
                {/* Ce serveur est configuré pour accepter les environnements de test et localhost */}
                <TileLayer
    attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
    url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
/>

                <AutoZoom technicians={technicians} jobs={jobs} />

                {/* Techniciens */}
                {technicians?.map(tech => (
                    tech.current_latitude && tech.current_longitude && (
                        <Marker
                            key={`tech-${tech.id}`}
                            position={[Number(tech.current_latitude), Number(tech.current_longitude)]}
                            icon={techIcon}
                        >
                            <Popup>
                                <div>
                                    <h3 className="font-bold">{tech.name}</h3>
                                    <p className="text-sm">Status: {tech.status}</p>
                                    <p className="text-sm">Skills: {tech.skills?.join(', ')}</p>
                                </div>
                            </Popup>
                        </Marker>
                    )
                ))}

                {/* Interventions */}
                {jobs?.map(job => {
                    const lat = job.latitude;
                    const lng = job.longitude;

                    if (!lat || !lng) return null;

                    return (
                        <Marker
                            key={`job-${job.id}`}
                            position={[Number(lat), Number(lng)]}
                            icon={jobIcon}
                        >
                            <Popup>
                                <div>
                                    <h3 className="font-bold">{job.customer_name}</h3>
                                    <p className="text-sm">{job.service_address}</p>
                                    <p className="text-sm">Type: {job.job_type}</p>
                                    <p className="text-sm">Status: {job.status}</p>
                                    <p className="text-sm">Priority: {job.priority}</p>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
