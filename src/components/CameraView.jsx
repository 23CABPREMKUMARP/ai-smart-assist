
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { speak, translations } from '../utils/speech';
import { updateDetections } from '../utils/detectionStore';
import { ContinuousDetectionController } from '../utils/ContinuousDetectionController'; // NEW IMPORT

// --- CONFIGURATION ---
const CONFIDENCE_THRESHOLD = 0.60; // Lowered slightly for prototype responsiveness

// Classes worthy of "Emergency" priority if close
const EMERGENCY_CLASSES = ['person', 'car', 'bus', 'truck', 'motorcycle'];

const CameraView = ({ lang, onIntroEnd }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [model, setModel] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const [debugMode, setDebugMode] = useState(false);
    const [stats, setStats] = useState({ fps: 0, count: 0 });

    // Refs for optimization
    const langRef = useRef(lang);
    const lastSpeechTimeRef = useRef(0);
    const hasSpokenIntroRef = useRef(false);

    // Controller Ref
    const detectionControllerRef = useRef(null);

    useEffect(() => {
        langRef.current = lang;
    }, [lang]);

    // 1. INITIALIZATION
    useEffect(() => {
        const initAI = async () => {
            try {
                await tf.ready();
                // Attempt WebGL for performance
                try {
                    const currentBackend = tf.getBackend();
                    if (currentBackend !== 'webgl') {
                        await tf.setBackend('webgl');
                    }
                } catch (e) {
                    console.warn("WebGL failed, falling back to CPU", e);
                    await tf.setBackend('cpu');
                }

                // Using lite_mobilenet_v2 for speed
                const loadedModel = await cocossd.load({ base: 'lite_mobilenet_v2' });
                setModel(loadedModel);
                console.log("VisionAid AI Ready");
            } catch (err) {
                console.error("AI Init Error:", err);
                // Last ditch retry
                try {
                    await tf.setBackend('cpu');
                    const loadedModel = await cocossd.load({ base: 'lite_mobilenet_v2' });
                    setModel(loadedModel);
                } catch (retryErr) {
                    setCameraError(`AI System Failed: ${retryErr.message}`);
                }
            }
        };
        initAI();
    }, []);

    // 2. INTRO
    useEffect(() => {
        if (model && !hasSpokenIntroRef.current) {
            speak(translations[lang].welcome, lang, 'normal', () => {
                if (onIntroEnd) onIntroEnd();
            });
            hasSpokenIntroRef.current = true;
        }
    }, [lang, model, onIntroEnd]);

    // 3. CAMERA (Mobile Optimized)
    useEffect(() => {
        const startCam = async () => {
            if (!videoRef.current) return;
            try {
                // Dynamic Resolution based on device capability
                const isMobile = window.innerWidth < 768;
                const constraints = {
                    video: {
                        facingMode: 'environment',
                        width: { ideal: isMobile ? 640 : 1280 }, // Lower res on mobile for speed
                        height: { ideal: isMobile ? 480 : 720 }
                    },
                    audio: false
                };

                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                videoRef.current.srcObject = stream;

                videoRef.current.onloadedmetadata = () => {
                    videoRef.current.play().catch(e => console.error("Play error", e));
                };
            } catch (err) {
                console.warn("Camera Error:", err);
                setCameraError("Camera Access Denied");
            }
        };
        startCam();
    }, []);

    // 4. CORE LOGIC - INSTANT CONTINUOUS DETECTION
    const performDetection = useCallback(async () => {
        if (!model || !videoRef.current || videoRef.current.readyState !== 4) return;

        const start = performance.now();
        const video = videoRef.current;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // Ensure canvas match
        if (canvasRef.current) {
            if (canvasRef.current.width !== videoWidth) canvasRef.current.width = videoWidth;
            if (canvasRef.current.height !== videoHeight) canvasRef.current.height = videoHeight;
        }

        // --- A. DETECTION ---
        let predictions = [];
        try {
            // Detect ALL objects (no lock)
            predictions = await model.detect(video, 20, CONFIDENCE_THRESHOLD);
        } catch (e) {
            console.warn("Detect Error", e);
            return;
        }

        // --- B. INSTANT RENDER & DATA UPDATE ---
        // Clear previous frame data - User req: "Always clear previous frame data"
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, videoWidth, videoHeight);

        // Sort by Size (Priority: Closest/Largest first)
        predictions.sort((a, b) => {
            const areaA = a.bbox[2] * a.bbox[3];
            const areaB = b.bbox[2] * b.bbox[3];
            return areaB - areaA;
        });

        // Update shared store for Voice Search Module
        // Map to include 'label' for compatibility
        const storeData = predictions.map(p => ({ ...p, label: p.class }));
        updateDetections(storeData);

        // Draw and Process
        const objectsForSpeech = [];

        predictions.forEach(pred => {
            const [x, y, w, h] = pred.bbox;
            const label = pred.class;

            // Visuals
            const isEmergency = EMERGENCY_CLASSES.includes(label);
            const color = isEmergency ? '#ef4444' : '#22c55e';

            // Draw Box
            ctx.shadowBlur = 0;
            ctx.lineWidth = 3;
            ctx.strokeStyle = color;
            ctx.strokeRect(x, y, w, h);

            // Draw Label
            ctx.fillStyle = color;
            const localizedName = translations[langRef.current][label] || label;
            const text = `${localizedName.toUpperCase()} ${(pred.score * 100).toFixed(0)}%`;
            const tm = ctx.measureText(text);

            // Position label intelligently so it doesn't go off screen
            let labelY = y - 24;
            if (labelY < 0) labelY = y + h + 5;

            ctx.fillRect(x, labelY, tm.width + 10, 24);
            ctx.fillStyle = '#111'; // High contrast text
            ctx.font = 'bold 14px "Outfit", sans-serif';
            ctx.fillText(text, x + 5, labelY + 17);

            // Prepare for speech logic
            const centerX = x + w / 2;
            let position = 'ahead'; // Default
            if (centerX < videoWidth * 0.33) position = 'left';
            else if (centerX > videoWidth * 0.66) position = 'right';

            objectsForSpeech.push({ label, position, area: w * h });
        });

        // --- C. INTELLIGENT SEQUENTIAL SPEECH ---
        const now = Date.now();
        // Throttle speech to avoid chaos (every 3.5s approx unless scene changes drastically)
        if (now - lastSpeechTimeRef.current > 3500 && objectsForSpeech.length > 0) {

            // Limit to top 3 objects to avoid long monologues
            const topObjects = objectsForSpeech.slice(0, 3);

            // Construct sentence: "Person ahead. Chair on right."
            const phrases = topObjects.map(obj => {
                const name = translations[langRef.current][obj.label] || obj.label;
                if (langRef.current === 'ta') {
                    // Tamil phrasing
                    if (obj.position === 'left') return `${name} இடதுபுறம்`;
                    if (obj.position === 'right') return `${name} வலதுபுறம்`;
                    return `${name} நேராக`;
                } else {
                    // English phrasing
                    if (obj.position === 'left') return `${name} on left`;
                    if (obj.position === 'right') return `${name} on right`;
                    return `${name} ahead`;
                }
            });

            const speechText = phrases.join('. ');
            speak(speechText, langRef.current, 'normal');
            lastSpeechTimeRef.current = now;
        }

        // Use the raw loop time to estimate FPS
        const loopDuration = performance.now() - start;
        setStats({
            fps: Math.round(1000 / (Math.max(loopDuration, 16))), // Estimate
            count: predictions.length
        });

    }, [model]);

    // 5. START / STOP CONTROLLER
    useEffect(() => {
        if (model) {
            // Target 30 FPS for mobile/desktop balance, or 20 for pure stability
            const targetFps = window.innerWidth < 768 ? 20 : 30;

            detectionControllerRef.current = new ContinuousDetectionController(performDetection, targetFps);
            detectionControllerRef.current.start();
        }

        return () => {
            if (detectionControllerRef.current) {
                detectionControllerRef.current.stop();
            }
        };
    }, [model, performDetection]);

    // Debug Mode Hook
    useEffect(() => {
        const h = (e) => { if (e.key === 'd') setDebugMode(prev => !prev); }
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
            <video
                ref={videoRef}
                playsInline
                muted // Required for autoplay
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                }}
            />

            {!model && (
                <div className="glass" style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    padding: '2rem',
                    textAlign: 'center',
                    border: '1px solid var(--primary)',
                    background: 'rgba(0,0,0,0.85)',
                    borderRadius: '20px',
                    zIndex: 50
                }}>
                    <div style={{ color: 'var(--primary)', marginBottom: '10px', fontSize: '1.2rem' }}>
                        INITIALIZING AI...
                    </div>
                    <div className="loader"></div>
                </div>
            )}

            {cameraError && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    color: '#ff4444', background: 'rgba(0,0,0,0.9)', padding: '20px', borderRadius: '10px'
                }}>
                    {cameraError}
                </div>
            )}

            {/* Debug Panel */}
            {debugMode && (
                <div style={{
                    position: 'absolute', top: 80, left: 20, zIndex: 9999,
                    background: 'rgba(0,0,0,0.8)', color: '#0f0', padding: 10,
                    borderRadius: 5, fontFamily: 'monospace', fontSize: 12
                }}>
                    MODE: INSTANT (NO LOCK)<br />
                    FPS Target: {window.innerWidth < 768 ? 20 : 30}<br />
                    Objs: {stats.count}
                </div>
            )}

            <div className="scanner-line"></div>
        </div>
    );
};

export default CameraView;
