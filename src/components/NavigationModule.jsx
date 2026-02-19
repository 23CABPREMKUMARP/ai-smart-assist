import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { speak, navigationTranslations } from '../utils/speech';
import { extractDestination } from '../utils/gemini';
import MapPreviewWidget from './MapPreviewWidget';
import MultilingualVoiceNavigationModule from './MultilingualVoiceNavigationModule';
import './NavigationModule.css';

const NavigationModule = ({ lang }) => {
    // --- State ---
    const [currentLocation, setCurrentLocation] = useState(null);
    const [destination, setDestination] = useState(null);
    const [routePath, setRoutePath] = useState([]); // [lat, lng][]
    const [steps, setSteps] = useState([]);
    const [isNavigating, setIsNavigating] = useState(false);
    const [instruction, setInstruction] = useState('');
    const [distanceStr, setDistanceStr] = useState('');

    // --- Language State ---
    const [currentLanguage, setCurrentLanguage] = useState(lang);

    useEffect(() => {
        setCurrentLanguage(lang);
    }, [lang]);

    // --- Refs ---
    const watchIdRef = useRef(null);
    const lastInstructionRef = useRef('');
    const currentStepIndexRef = useRef(0);
    const currentLocationRef = useRef(null);
    const isReroutingRef = useRef(false);

    const GH_KEY = import.meta.env.VITE_GRAPHHOPPER_API_KEY;

    // --- Helpers ---
    const getDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const t = (key) => {
        const dictionary = navigationTranslations[currentLanguage] || navigationTranslations['en'];
        return dictionary[key] || key;
    };

    const announceInstruction = (text) => {
        if (!text) return;
        const cleanText = text.replace(/<[^>]+>/g, '');
        if (lastInstructionRef.current !== cleanText) {
            setInstruction(cleanText);
            speak(cleanText, currentLanguage, 'normal');
            lastInstructionRef.current = cleanText;
        }
    };

    // --- Core Logic ---
    const handleSearch = async (destinationText) => {
        const curLoc = currentLocationRef.current;
        if (!curLoc) {
            speak(t('gpsWaiting'), currentLanguage, 'normal');
            return;
        }

        try {
            // Nominatim Search
            const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
                params: {
                    q: destinationText,
                    format: 'json',
                    limit: 1,
                    'accept-language': currentLanguage // Use current selected voice language
                },
                headers: { 'User-Agent': 'VisionAid-App/1.0' }
            });

            if (response.data && response.data.length > 0) {
                const place = response.data[0];
                const destCoords = {
                    lat: parseFloat(place.lat),
                    lng: parseFloat(place.lon),
                    name: place.display_name
                };

                speak(t('started'), currentLanguage, 'normal');

                setDestination(destCoords);
                calculateRoute(curLoc, destCoords);
            } else {
                speak(t('notFound'), currentLanguage, 'normal');
            }
        } catch (error) {
            console.error("Nominatim Search Error:", error);
            speak(t('notFound'), currentLanguage);
        }
    };

    const calculateRoute = async (origin, dest) => {
        if (!GH_KEY) {
            speak("API Key missing.", currentLanguage);
            return;
        }

        try {
            // GraphHopper Route
            // Provide localized instructions if possible, else English
            const locale = currentLanguage.split('-')[0]; // 'en', 'ta', 'hi'

            const response = await axios.get(`https://graphhopper.com/api/1/route`, {
                params: {
                    point: [`${origin.lat},${origin.lng}`, `${dest.lat},${dest.lng}`],
                    profile: 'foot',
                    locale: locale,
                    points_encoded: false,
                    instructions: true,
                    key: GH_KEY
                }
            });

            const path = response.data.paths[0];
            // GraphHopper points are [lon, lat], Leaflet wants [lat, lon]
            const coords = path.points.coordinates.map(c => [c[1], c[0]]);

            setRoutePath(coords);
            setSteps(path.instructions);
            setIsNavigating(true);
            currentStepIndexRef.current = 0;
            isReroutingRef.current = false;

            if (path.instructions.length > 0) {
                // Announce first instruction immediately
                announceInstruction(path.instructions[0].text);
            }

        } catch (error) {
            console.error("GraphHopper Route Error:", error);
            speak(t('notFound'), currentLanguage);
        }
    };

    const stopNavigation = () => {
        setIsNavigating(false);
        setDestination(null);
        setRoutePath([]);
        setSteps([]);
        setInstruction(t('arrived'));
        setDistanceStr("");
    };

    const checkRouteProgress = (currentPos) => {
        if (!isNavigating || steps.length === 0 || routePath.length === 0) return;

        // 1. Arrival Check
        if (destination) {
            const dist = getDistance(currentPos.lat, currentPos.lng, destination.lat, destination.lng);
            setDistanceStr(`${Math.round(dist)}m`);
            if (dist < 15) {
                speak(t('arrived'), currentLanguage, 'normal');
                stopNavigation();
                return;
            }
        }

        // 2. Deviation Check
        if (!isReroutingRef.current) {
            let minD = Infinity;
            for (let pt of routePath) {
                const d = getDistance(currentPos.lat, currentPos.lng, pt[0], pt[1]);
                if (d < minD) minD = d;
            }

            if (minD > 40) {
                isReroutingRef.current = true;
                speak(t('recalculating'), currentLanguage);
                calculateRoute(currentLocationRef.current, destination);
                return;
            }
        }

        // 3. Step Progression
        const step = steps[currentStepIndexRef.current];
        if (step && step.interval) {
            const endIndex = step.interval[1];
            if (endIndex < routePath.length) {
                const turnPt = routePath[endIndex];
                const distToTurn = getDistance(currentPos.lat, currentPos.lng, turnPt[0], turnPt[1]);

                if (distToTurn < 20) {
                    const nextIdx = currentStepIndexRef.current + 1;
                    if (nextIdx < steps.length) {
                        currentStepIndexRef.current = nextIdx;
                        announceInstruction(steps[nextIdx].text);
                    }
                }
            }
        }
    };

    // --- Effects ---

    // Geolocation Tracker
    useEffect(() => {
        if (!navigator.geolocation) return;
        const success = (pos) => {
            const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCurrentLocation(newPos);
            currentLocationRef.current = newPos;
            if (isNavigating) checkRouteProgress(newPos);
        };
        watchIdRef.current = navigator.geolocation.watchPosition(success, (e) => console.warn(e), {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        });
        return () => {
            if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, [isNavigating, steps, routePath, currentLanguage]);

    if (!currentLocation) return null;

    return (
        <>
            <MultilingualVoiceNavigationModule
                currentLanguage={currentLanguage}
                onLanguageChange={setCurrentLanguage}
                onDestinationFound={handleSearch}
            />

            <MapPreviewWidget
                currentLocation={currentLocation}
                destination={destination}
                routePath={routePath}
                instruction={instruction}
                distanceStr={distanceStr}
                isNavigating={isNavigating}
            />
        </>
    );
};

export default NavigationModule;
