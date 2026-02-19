
import React, { useState, useEffect, useRef } from 'react';
import { getLatestDetections } from '../utils/detectionStore';
import { speak, translations } from '../utils/speech';

let recognitionInstance = null;

const ObjectFinderVoiceModule = ({ lang }) => {
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);

    // Initial setup
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window)) return;

        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = lang === 'ta' ? 'ta-IN' : 'en-US';

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase();

            // "Find X" logic
            const findKeywords = ['find', 'where is', 'locate', 'search for', 'எங்கே', 'கண்டுபிடி', 'தேடு'];
            if (findKeywords.some(k => transcript.includes(k))) {
                handleFindRequest(transcript);
            }
        };

        recognitionRef.current = recognition;
        recognitionInstance = recognition;

        // Start listing
        try { recognition.start(); } catch (e) { }

        // Loop to restart listening (unless speaking)
        const loop = setInterval(() => {
            if (!isListening && !window.speechSynthesis.speaking && !window.__visionAidListeningPaused) {
                try { recognitionRef.current.start(); } catch (e) { }
            }
        }, 2000);

        return () => {
            clearInterval(loop);
            if (recognitionRef.current) recognitionRef.current.stop();
        };
    }, [lang]);

    const handleFindRequest = (text) => {
        // Pause listening momentarily
        window.__visionAidListeningPaused = true;

        // simple parsing: remove keywords to get object
        // e.g. "Find chair" -> "chair"
        const removeWords = ['find', 'where is', 'locate', 'search for', 'the', 'a', 'an', 'please', 'visionaid', 'எங்கே', 'கண்டுபிடி', 'தேடு'];
        let query = text;
        removeWords.forEach(w => query = query.replace(w, '').trim());

        // Match logic
        const detections = getLatestDetections();

        // Filter matches (fuzzy or exact)
        const matches = detections.filter(d => {
            const label = d.label.toLowerCase();
            const trans = (translations[lang][d.label] || '').toLowerCase();
            return label.includes(query) || trans.includes(query) || query.includes(label) || query.includes(trans);
        });

        if (matches.length > 0) {
            // Find closest (largest area)
            matches.sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]));
            const target = matches[0];

            // Calculate Position
            const cx = target.bbox[0] + target.bbox[2] / 2;
            const vidW = 640; // Reference width from CameraView

            let pos = '';
            if (cx < vidW * 0.4) pos = lang === 'ta' ? 'இடப்பக்கம்' : 'on your left';
            else if (cx > vidW * 0.6) pos = lang === 'ta' ? 'வலப்பக்கம்' : 'on your right';
            else pos = lang === 'ta' ? 'நேராக' : 'ahead';

            const label = translations[lang][target.label] || target.label;

            const response = lang === 'ta'
                ? `${label} ${pos} உள்ளது.`
                : `${label} is ${pos}.`;

            speak(response, lang, 'normal', () => {
                setTimeout(() => { window.__visionAidListeningPaused = false; }, 1000);
            });

        } else {
            const notFound = lang === 'ta'
                ? `${query} தெரியவில்லை. கேமராவை மெதுவாக திருப்பவும்.`
                : `${query} not found. Move camera slowly.`;
            speak(notFound, lang, 'normal', () => {
                setTimeout(() => { window.__visionAidListeningPaused = false; }, 1000);
            });
        }
    };

    return null; // Headless component
};

export default ObjectFinderVoiceModule;
