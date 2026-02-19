import React, { useState, Suspense } from 'react';
import CameraView from './components/CameraView';
import { Languages, ShieldAlert, Activity } from 'lucide-react';
import './App.css'; // Ensure specific styles are loaded

const NavigationModule = React.lazy(() => import('./components/NavigationModule'));
const ObjectFinderVoiceModule = React.lazy(() => import('./components/ObjectFinderVoiceModule'));

function App() {
    const [lang, setLang] = useState('en');
    const [showIntro, setShowIntro] = useState(true);
    const [introFade, setIntroFade] = useState(false);

    const toggleLang = () => {
        const newLang = lang === 'en' ? 'ta' : 'en';
        setLang(newLang);
    };

    const handleIntroEnd = () => {
        setIntroFade(true);
        setTimeout(() => {
            setShowIntro(false);
        }, 1500); // Sync with CSS transition
    };

    const handleUserInteraction = () => {
        // Ensure audio context and video playback are active
        const video = document.querySelector('video');
        if (video && video.paused) {
            video.play().catch(() => { });
        }
    };

    return (
        <div className="app-container" onClick={handleUserInteraction}>
            {/* Layer 1: Camera Feed */}
            <div className="camera-layer">
                <CameraView lang={lang} onIntroEnd={handleIntroEnd} />
            </div>

            {/* Layer 2: Main UI Overlay */}
            <div className="ui-layer">
                {/* Top Section */}
                <div className="top-section">
                    <div className="status-indicator">
                        <div className="status-dot"></div>
                        <span className="status-text">ACTIVE</span>
                    </div>
                </div>

                {/* Bottom Section */}
                <div className="bottom-section">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <div className="glass" style={{
                            padding: '1rem',
                            borderRadius: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            justifyContent: 'center'
                        }}>
                            <div className="pulse" style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 15px var(--primary)' }}></div>
                            <span className="status-text" style={{ fontSize: '0.75rem' }}>OPTIMAL</span>
                        </div>
                        <div className="glass" style={{
                            padding: '1rem',
                            borderRadius: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            justifyContent: 'center'
                        }}>
                            <ShieldAlert size={20} color="var(--primary)" />
                            <span className="status-text" style={{ fontSize: '0.75rem' }}>SECURE</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Floating Elements */}
            <div className="logo-container-mobile">
                <img src="/logo.png" alt="VisionAid" className="logo-img logo-glow" />
            </div>

            <div className="lang-toggle-container">
                <button
                    onClick={toggleLang}
                    className="glass btn-large"
                    style={{
                        background: lang === 'ta' ? 'rgba(255, 31, 31, 0.2)' : 'rgba(255,255,255,0.05)',
                        borderColor: lang === 'ta' ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                        padding: '0.8rem 1.2rem',
                        minHeight: 'auto'
                    }}
                >
                    <Languages size={24} color={lang === 'ta' ? 'var(--primary)' : '#fff'} />
                    <span style={{ color: lang === 'ta' ? 'var(--primary)' : '#fff', fontSize: '0.9rem' }}>
                        {lang === 'en' ? 'EN' : 'தமிழ்'}
                    </span>
                </button>
            </div>

            {/* 3D Visual Decoration */}
            <div className="hero-visual">
                <div className="detection-waves">
                    <div className="wave"></div>
                    <div className="wave"></div>
                    <div className="wave"></div>
                </div>
                <div className="camera-3d rotate-3d">
                    <div className="camera-lens"></div>
                </div>
                <div className="glass" style={{
                    marginTop: '20px',
                    padding: '0.6rem 1.5rem',
                    borderRadius: '2rem',
                    border: '1px solid var(--primary)',
                    background: 'rgba(0,0,0,0.6)'
                }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.2em', color: '#fff' }}>
                        SCANNING
                    </span>
                </div>
            </div>

            {/* HUD Decorations */}
            <div className="hud-corner top-left" />
            <div className="hud-corner top-right" />
            <div className="hud-corner bottom-left" />
            <div className="hud-corner bottom-right" />

            {/* Intro Screen */}
            {showIntro && (
                <div className={`intro-screen ${introFade ? 'fade-out' : ''}`}>
                    <div className="intro-logo-container">
                        <div className="intro-pulse-ring"></div>
                        <div className="intro-scan-arc"></div>
                        <img
                            src="/logo.png"
                            alt="VisionAid"
                            style={{
                                width: '60%',
                                height: '60%',
                                objectFit: 'contain',
                                position: 'relative',
                                zIndex: 10,
                                filter: 'drop-shadow(0 0 20px var(--primary-glow))'
                            }}
                        />
                    </div>
                    <div className="intro-text">
                        {lang === 'en' ? 'VisionAid Starting...' : 'VisionAid தொடங்குகிறது...'}
                    </div>
                </div>
            )}
            {/* Modules */}
            <Suspense fallback={null}>
                <NavigationModule lang={lang} />
                <ObjectFinderVoiceModule lang={lang} />
            </Suspense>
        </div>
    );
}

export default App;
