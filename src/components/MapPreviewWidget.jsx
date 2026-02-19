import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Maximize2, Minimize2, Navigation, Map as MapIcon } from 'lucide-react';
import './MapPreviewWidget.css';

// --- Fix Leaflet Default Icon ---
// (Moved from NavigationModule to ensure standalone functionality)
import iconMarker from 'leaflet/dist/images/marker-icon.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: iconRetina,
    iconUrl: iconMarker,
    shadowUrl: iconShadow,
});

// --- Custom Icons ---
const meIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const destIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// --- Internal Map Controller for Resizing & Centering ---
const MapResizer = ({ isFullscreen, center }) => {
    const map = useMap();

    // Handle resizing when fullscreen toggles
    useEffect(() => {
        const timer = setTimeout(() => {
            map.invalidateSize();
            // Force recenter after resize to ensure user stays in view
            if (center) {
                map.setView(center, map.getZoom(), { animate: true });
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [isFullscreen, map]); // Removed center dependency

    // Handle centering when location updates (Live Tracking)
    useEffect(() => {
        if (center) {
            map.setView(center, map.getZoom(), { animate: true });
        }
    }, [center, map]);

    return null;
};

const MapPreviewWidget = ({
    currentLocation,
    destination,
    routePath,
    instruction,
    distanceStr,
    isNavigating
}) => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = (e) => {
        e.stopPropagation(); // Prevent map click interference
        setIsFullscreen(!isFullscreen);
    };

    // If map is clicked in preview mode, expand
    const handleContainerClick = () => {
        if (!isFullscreen) {
            setIsFullscreen(true);
        }
    };

    if (!currentLocation) return null;

    return (
        <div
            className={`map-preview-container ${isFullscreen ? 'fullscreen' : ''} ${isNavigating ? 'navigating' : ''}`}
            onClick={handleContainerClick}
        >
            {/* Controls */}
            <div className="map-controls">
                <button
                    className="control-btn"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? "Minimize Map" : "Expand Map"}
                >
                    {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
            </div>

            {/* Navigation Overlay (Fullscreen Only) */}
            {isNavigating && (
                <div className="nav-info-overlay">
                    <div className="header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Navigation size={18} color="#00e5ff" />
                        <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888' }}>
                            Current Navigation
                        </span>
                    </div>
                    <div className="instruction-text">
                        {instruction || "Follow the route"}
                    </div>
                    <div className="dist-text">
                        Remaining: {distanceStr || "--"}
                    </div>
                </div>
            )}

            {/* Preview Hint */}
            {!isFullscreen && (
                <div className="expand-hint">
                    <MapIcon size={14} />
                </div>
            )}

            {/* Map */}
            <MapContainer
                center={[currentLocation.lat, currentLocation.lng]}
                zoom={16}
                zoomControl={false}
                scrollWheelZoom={isFullscreen} // Disable scroll zoom on preview
                dragging={isFullscreen}      // Disable drag on preview to avoid accidental moves
                doubleClickZoom={isFullscreen}
                className="leaflet-container"
                attributionControl={false} // Clean look
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    // Use dark mode tiles if possible, but standard OSM is requested. 
                    // Using standard OSM for reliability as per request "GraphHopper + OpenStreetMap"
                    className="map-tiles"
                />

                <MapResizer isFullscreen={isFullscreen} center={[currentLocation.lat, currentLocation.lng]} />

                <Marker position={[currentLocation.lat, currentLocation.lng]} icon={meIcon} />

                {destination && <Marker position={[destination.lat, destination.lng]} icon={destIcon} />}

                {routePath && routePath.length > 0 && (
                    <Polyline
                        positions={routePath}
                        color="#00E5FF"
                        weight={isFullscreen ? 6 : 4}
                        opacity={0.8}
                    />
                )}
            </MapContainer>
        </div>
    );
};

export default MapPreviewWidget;
