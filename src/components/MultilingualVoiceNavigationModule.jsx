import React, { useState, useEffect, useRef } from 'react';
import { extractDestination } from '../utils/gemini';
import { speak, navigationTranslations } from '../utils/speech';
import { Globe, Mic } from 'lucide-react';

const LANGUAGES = {
    'en': { code: 'en-IN', label: 'English', keywords: ['navigate', 'go to', 'find', 'start navigation'] },
    'ta': { code: 'ta-IN', label: 'தமிழ்', keywords: ['வழி', 'போக', 'செல்ல', 'தொடங்கு'] },
    'ml': { code: 'ml-IN', label: 'മലയാളം', keywords: ['വഴി', 'പോകുക', 'എത്തിക്കുക', 'നാവിഗേഷൻ'] },
    'hi': { code: 'hi-IN', label: 'हिंदी', keywords: ['रास्ता', 'चलो', 'नेविगेशन', 'जाना'] }
};

const MultilingualVoiceNavigationModule = ({ currentLanguage = 'en', onLanguageChange, onDestinationFound }) => {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const isProcessingRef = useRef(false);

    // Initialize Speech Recognition
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) {
            console.warn("Speech Recognition not supported");
            return;
        }

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = true; // Keep listening
        recognition.interimResults = false;

        // Dynamic Language Switching
        const langConfig = LANGUAGES[currentLanguage] || LANGUAGES['en'];
        recognition.lang = langConfig.code;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => {
            setIsListening(false);
            // Auto-restart if not processing and meant to be active
            if (!isProcessingRef.current) {
                setTimeout(() => {
                    try { recognition.start(); } catch (e) { /* ignore already started */ }
                }, 1000);
            }
        };

        recognition.onresult = async (event) => {
            if (isProcessingRef.current) return;

            const results = event.results;
            const transcript = results[results.length - 1][0].transcript.toLowerCase();
            console.log(`[${currentLanguage}] Heard:`, transcript);

            // Check for keywords in current language
            const keywords = LANGUAGES[currentLanguage].keywords;
            const hasKeyword = keywords.some(k => transcript.includes(k));

            if (hasKeyword) {
                isProcessingRef.current = true;

                // Audio Feedback for "Processing" could go here if needed
                // speak(navigationTranslations[currentLanguage].searching, currentLanguage);

                try {
                    // Extract destination using Gemini (Robust multilingual extraction)
                    // We pass the raw transcript. Gemini is prompted to handle it.
                    const destination = await extractDestination(transcript);

                    if (destination) {
                        speak(navigationTranslations[currentLanguage].searching, currentLanguage); // "Searching destination..."
                        onDestinationFound(destination);
                    } else {
                        speak(navigationTranslations[currentLanguage].listenError, currentLanguage); // "Not understood"
                    }
                } catch (e) {
                    console.error("Processing Error", e);
                } finally {
                    isProcessingRef.current = false;
                }
            }
        };

        recognitionRef.current = recognition;

        // Start Listening
        try { recognition.start(); } catch (e) { }

        return () => {
            if (recognitionRef.current) recognitionRef.current.stop();
        };
    }, [currentLanguage, onDestinationFound]);

    // Handle Mic Conflict with TTS
    useEffect(() => {
        const interval = setInterval(() => {
            if (window.speechSynthesis.speaking && isListening) {
                try { recognitionRef.current.stop(); } catch (e) { }
            } else if (!window.speechSynthesis.speaking && !isListening && !isProcessingRef.current) {
                try { recognitionRef.current.start(); } catch (e) { }
            }
        }, 800);
        return () => clearInterval(interval);
    }, [isListening]);


    return (
        <div style={{
            position: 'absolute',
            top: '20px',
            right: '250px', // Left of Map Widget (approx)
            zIndex: 1000,
            display: 'flex',
            gap: '10px'
        }}>

            {/* Language Selector Pill */}
            <div className="glass" style={{
                padding: '8px 16px',
                borderRadius: '20px',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
            }}>
                <Globe size={16} color="#00e5ff" />
                <select
                    value={currentLanguage}
                    onChange={(e) => onLanguageChange(e.target.value)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    <option value="en">English (IN)</option>
                    <option value="ta">தமிழ்</option>
                    <option value="ml">മലയാളം</option>
                    <option value="hi">हिंदी</option>
                </select>
            </div>

            {/* Mic Status */}
            <div className="glass" style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: isListening ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 50, 50, 0.2)',
                border: `1px solid ${isListening ? '#00e5ff' : '#ff3333'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Mic size={16} color={isListening ? '#00e5ff' : '#ff3333'} />
            </div>
        </div>
    );
};

export default MultilingualVoiceNavigationModule;
