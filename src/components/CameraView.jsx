
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocossd from '@tensorflow-models/coco-ssd';
import { speak, translations } from '../utils/speech';
import { updateDetections } from '../utils/detectionStore';
import { ContinuousDetectionController } from '../utils/ContinuousDetectionController'; // NEW IMPORT

// --- CONFIGURATION ---
const CONFIDENCE_THRESHOLD = 0.60; // Lowered slightly for prototype responsiveness
const HISTORY_FRAMES = 3;

// Classes worthy of "Emergency" priority if close
const EMERGENCY_CLASSES = ['person', 'car', 'bus', 'truck', 'motorcycle'];

const CameraView = ({ lang, onIntroEnd }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [model, setModel] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const [debugMode, setDebugMode] = useState(false);
    const [stats, setStats] = useState({ fps: 0, count: 0 });

    // Refs for optimization (no re-renders)
    const langRef = useRef(lang);
    const objectHistoryRef = useRef(new Map()); // Map<id, {class, bbox, framesSeen, lastSeen}>
    const lastAnnouncedRef = useRef(new Map()); // Map<class, timestamp>
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
                // Attempt to set WebGL backend for performance
                try {
                    if (tf.getBackend() !== 'webgl') {
                        await tf.setBackend('webgl');
                    }
                } catch (e) {
                    console.warn("WebGL failed, falling back to CPU", e);
                    await tf.setBackend('cpu');
                }

                const loadedModel = await cocossd.load({ base: 'lite_mobilenet_v2' });
                setModel(loadedModel);

                // Warmup
                const zeroTensor = tf.zeros([1, 640, 480, 3], 'int32');
                await loadedModel.detect(zeroTensor);
                zeroTensor.dispose();
                console.log("VisionAid AI Ready");
            } catch (err) {
                console.error("AI Init Error:", err);

                // Fallback retry with CPU if first attempt failed (likely due to WebGL or model load issues)
                try {
                    console.log("Retrying with CPU backend...");
                    await tf.setBackend('cpu');
                    const loadedModel = await cocossd.load({ base: 'lite_mobilenet_v2' });
                    setModel(loadedModel);
                    console.log("VisionAid AI Recovered with CPU");
                } catch (retryErr) {
                    console.error("AI Retry Failed:", retryErr);
                    setCameraError(`AI System Failed: ${retryErr.message || err.message}`);
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

    // 3. CAMERA
    useEffect(() => {
        const startCam = async () => {
            if (!videoRef.current) return;
            try {
                // Request 640x480 for MobileNet optimization
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    },
                    audio: false
                });
                videoRef.current.srcObject = stream;
                // Wait for video to actually play to avoid 0x0 dims
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

    // 4. CORE LOGIC - CONTINUOUS DETECTION CALLBACK
    const performDetection = useCallback(async () => {
        if (!model || !videoRef.current || videoRef.current.readyState !== 4) return;

        const now = Date.now();
        const video = videoRef.current;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;

        // Ensure canvas match
        if (canvasRef.current) {
            canvasRef.current.width = videoWidth;
            canvasRef.current.height = videoHeight;
        }

        // --- A. DETECTION ---
        let predictions = [];
        try {
            // Using max detections = 10 for performance
            predictions = await model.detect(video, 10, CONFIDENCE_THRESHOLD);
        } catch (e) {
            console.warn("Detect Error", e);
            return;
        }

        // --- B. TEMPORAL SMOOTHING & VALIDATION ---
        const history = objectHistoryRef.current;
        const confirmedObjects = [];

        // 1. Mark all history as "not seen yet this frame"
        for (let obj of history.values()) {
            obj.seenThisFrame = false;
        }

        // 2. Match predictions to history
        predictions.forEach(pred => {
            const { class: label, bbox, score } = pred;
            const [x, y, w, h] = bbox;
            const centerX = x + w / 2;
            const centerY = y + h / 2;

            // Simple tracker: Look for same class with center close to previous
            let matchFound = false;

            for (let [id, obj] of history.entries()) {
                if (obj.label === label && !obj.seenThisFrame) {
                    const [ox, oy, ow, oh] = obj.bbox;
                    const oCx = ox + ow / 2;
                    const oCy = oy + oh / 2;

                    // Box center diff
                    const dist = Math.hypot(centerX - oCx, centerY - oCy);
                    const diag = Math.hypot(videoWidth, videoHeight);

                    // If moved less than 15% (increased for faster movements) of screen diagonal
                    if (dist < diag * 0.15) {
                        // Update object
                        obj.bbox = [
                            (ox + x) / 2, // Smooth X
                            (oy + y) / 2, // Smooth Y
                            (ow + w) / 2, // Smooth W
                            (oh + h) / 2  // Smooth H
                        ];
                        obj.score = score;
                        // Faster confidence build-up for prototype
                        obj.framesSeen = Math.min(obj.framesSeen + 1, HISTORY_FRAMES + 2);
                        obj.lastSeen = now;
                        obj.seenThisFrame = true;
                        matchFound = true;
                        break;
                    }
                }
            }

            // New object found
            if (!matchFound) {
                const id = Math.random().toString(36).substr(2, 9);
                history.set(id, {
                    label,
                    bbox,
                    score,
                    framesSeen: 1,
                    lastSeen: now,
                    seenThisFrame: true,
                    announcedTime: 0
                });
            }
        });

        // 3. Prune old objects & Collect Confirmed
        for (let [id, obj] of history.entries()) {
            if (!obj.seenThisFrame) {
                // Faster removal (300ms) for cleaner demo
                if (now - obj.lastSeen > 300) {
                    history.delete(id);
                } else {
                    obj.framesSeen = Math.max(0, obj.framesSeen - 1);
                }
            }

            // CONFIRMATION RULE: Must be seen in at least 2 frames
            if (obj.framesSeen >= 2) {
                confirmedObjects.push(obj);
            }
        }

        // --- C. DRAWING & VISUALS ---
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, videoWidth, videoHeight);

        confirmedObjects.forEach(obj => {
            const [x, y, w, h] = obj.bbox;
            const isEmergency = EMERGENCY_CLASSES.includes(obj.label);
            const color = isEmergency ? '#ef4444' : '#22c55e'; // Red vs Green

            // Glow effect
            ctx.shadowBlur = 10;
            ctx.shadowColor = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
            ctx.shadowBlur = 0;

            // Box Label
            ctx.fillStyle = color;
            const name = translations[langRef.current][obj.label] || obj.label;
            const text = `${name.toUpperCase()} ${(obj.score * 100).toFixed(0)}%`;
            const tm = ctx.measureText(text);
            ctx.fillRect(x, y - 25, tm.width + 10, 25);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px "Outfit", sans-serif';
            ctx.fillText(text, x + 5, y - 7);
        });

        // --- D. INTELLIGENT AUDIO ANNOUNCER ---

        // Push state for Shared Voice Module
        try { updateDetections(confirmedObjects); } catch (e) { }

        // 1. Analyze Groups
        const objectsToAnnounce = [];
        const frameArea = videoWidth * videoHeight;

        confirmedObjects.forEach(obj => {
            const [x, y, w, h] = obj.bbox;
            const areaPct = (w * h) / frameArea;

            let proximity = 'far';
            let urgency = 'normal';

            if (areaPct > 0.35) {
                proximity = 'very-close';
                urgency = 'high';
            } else if (areaPct > 0.15) {
                proximity = 'close';
            }

            // Shorter cooldown for Prototype Mode (2s -> 1.5s/3s)
            const lastTime = lastAnnouncedRef.current.get(obj.label) || 0;
            const cooldown = urgency === 'high' ? 1500 : 3000;

            if (now - lastTime > cooldown) {
                objectsToAnnounce.push({
                    label: obj.label,
                    urgency,
                    proximity,
                    areaPct
                });
            }
        });

        // 2. Sort & Prioritize
        objectsToAnnounce.sort((a, b) => {
            if (a.urgency === 'high' && b.urgency !== 'high') return -1;
            if (b.urgency === 'high' && a.urgency !== 'high') return 1;
            return b.areaPct - a.areaPct;
        });

        // 3. Construct Message
        if (objectsToAnnounce.length > 0) {
            const topObjects = objectsToAnnounce.slice(0, 3);
            topObjects.forEach(o => lastAnnouncedRef.current.set(o.label, now));
            const isTamil = langRef.current === 'ta';

            if (topObjects.some(o => o.urgency === 'high')) {
                const emergency = topObjects.find(o => o.urgency === 'high');
                const name = translations[langRef.current][emergency.label] || emergency.label;
                const text = isTamil
                    ? `எச்சரிக்கை! ${name} மிக அருகில்.`
                    : `Warning! ${name} very close.`;
                speak(text, langRef.current, 'high');
            } else {
                const names = topObjects.map(o => translations[langRef.current][o.label] || o.label);
                const uniqueNames = [...new Set(names)];
                let text = '';

                if (isTamil) {
                    text = uniqueNames.length === 1
                        ? `${uniqueNames[0]} உள்ளது.`
                        : `${uniqueNames.join(', ')} தெரிகிறது.`;
                } else {
                    text = uniqueNames.length === 1
                        ? `${uniqueNames[0]} detected.`
                        : uniqueNames.join(', ') + ' detected.';
                }
                speak(text, langRef.current, 'normal');
            }
        }

        // --- E. STATS ---
        setStats({
            fps: Math.round(1000 / (100)), // Approximate for demo
            count: confirmedObjects.length
        });

    }, [model]); // Detection logic only depends on presence of model

    // 5. START / STOP CONTROLLER
    useEffect(() => {
        if (model) {
            // Create Controller
            // Base interval 100ms (10 FPS) for smooth UI + Detection balance
            detectionControllerRef.current = new ContinuousDetectionController(performDetection, 100);

            // Enable Turbo Mode for Prototype (50ms interval / 20 FPS target)
            detectionControllerRef.current.setTurboMode(true);

            detectionControllerRef.current.start();
        }

        return () => {
            if (detectionControllerRef.current) {
                detectionControllerRef.current.stop();
            }
        };
    }, [model, performDetection]);

    // Debug Toggle
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
                    borderRadius: '20px'
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
                    MODE: PROTOTYPE (TURBO)<br />
                    Conf: {(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%<br />
                    Objs: {stats.count}
                </div>
            )}

            <div className="scanner-line"></div>
        </div>
    );
};

export default CameraView;
