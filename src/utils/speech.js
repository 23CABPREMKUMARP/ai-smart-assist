// Keep track of the current listener to avoid duplicates
let voicesListener = null;

let currentUtterance = null;
let isSpeakingLocked = false;
let speechQueue = [];

export const speak = (text, lang = 'en-US', priority = 'normal', onEnd = null) => {
    if (!('speechSynthesis' in window)) return;

    const isUrgent = text.includes('Warning') || text.includes('Stop') || priority === 'high';

    // 1. Interrupt ONLY if urgent and speaking isn't locked by another urgent message
    if (isUrgent && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        speechQueue = []; // Clear queue for urgent messages
        isSpeakingLocked = false;
    } else if (window.speechSynthesis.speaking || isSpeakingLocked) {
        // Prevent duplicate queuing of the same message within a short time
        if (speechQueue.some(item => item.text === text)) return;

        // Don't queue more than 2 messages to avoid backlog
        if (speechQueue.length < 2) {
            speechQueue.push({ text, lang, priority, onEnd });
        }
        return;
    }

    const doSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
            // Wait for voices if not ready
            if (!voicesListener) {
                voicesListener = () => {
                    doSpeak();
                    window.speechSynthesis.removeEventListener('voiceschanged', voicesListener);
                    voicesListener = null;
                };
                window.speechSynthesis.addEventListener('voiceschanged', voicesListener);
            }
            return;
        }

        let selectedVoice = null;
        let finalLang = lang;
        let finalText = text;

        // Map short codes to full locale codes for voice matching
        const langMap = {
            'en': 'en-IN',
            'ta': 'ta-IN',
            'ml': 'ml-IN',
            'hi': 'hi-IN'
        };

        const targetLang = langMap[lang] || lang;

        // Try to find an exact match for the language
        selectedVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-') === targetLang.toLowerCase());

        // Fallbacks
        if (!selectedVoice) {
            if (lang === 'ta') {
                selectedVoice = voices.find(v => v.lang.toLowerCase().includes('ta'));
            } else if (lang === 'ml') {
                selectedVoice = voices.find(v => v.lang.toLowerCase().includes('ml'));
            } else if (lang === 'hi') {
                selectedVoice = voices.find(v => v.lang.toLowerCase().includes('hi'));
            } else if (lang === 'en') {
                selectedVoice = voices.find(v => v.lang.toLowerCase().includes('en-in')) || voices.find(v => v.lang.includes('en'));
            }
        }

        // If specific language voice not found, fallback to English but try to keep text if possible (though TTS might fail)
        if (!selectedVoice && lang !== 'en') {
            console.warn(`Voice for ${lang} not found, using English fallback.`);
            selectedVoice = voices.find(v => v.lang.toLowerCase().includes('en-in')) || voices.find(v => v.lang.includes('en'));
            // Optional: You happen to keep the text, but English voice reading Tamil/Hindi might be gibberish. 
            // Ideally we might want to translate to English here if we had a translator, but we don't.
        }

        const utterance = new SpeechSynthesisUtterance(finalText);
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice ? selectedVoice.lang : targetLang;
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        currentUtterance = utterance;
        isSpeakingLocked = true;

        utterance.onend = () => {
            isSpeakingLocked = false;
            if (currentUtterance === utterance) currentUtterance = null;

            // Execute callback
            if (onEnd) onEnd();

            // Process next in queue
            if (speechQueue.length > 0) {
                const next = speechQueue.shift();
                speak(next.text, next.lang, next.priority, next.onEnd);
            }
        };

        utterance.onerror = (e) => {
            console.error("Speech error:", e);
            isSpeakingLocked = false;
            currentUtterance = null;
            if (onEnd) onEnd();
        };

        window.speechSynthesis.speak(utterance);
    };

    doSpeak();
};

export const translations = {
    en: {
        welcome: "Hello. VisionAid is now active. The camera is scanning your surroundings. I will guide you with voice alerts and safe paths.",
        warning_close: "Warning! Obstacle very close. Please stop."
    },
    ta: {
        welcome: "வணக்கம். VisionAid தொடங்கப்பட்டுள்ளது. கேமரா சுற்றுப்புறத்தை கண்காணிக்கிறது. தடைகள் மற்றும் பாதுகாப்பான பாதையை நான் குரலில் தெரிவிப்பேன்.",
        warning_close: "எச்சரிக்கை! முன்னால் தடை உள்ளது. தயவுசெய்து நிற்கவும்."
    },
    ml: {
        welcome: "നമസ്കാരം. വിഷൻ എയിഡ് പ്രവർത്തനക്ഷമമാണ്. ക്യാമറ ചുറ്റുപാടുകൾ സ്കാൻ ചെയ്യുന്നു.",
        warning_close: "മുന്നറിയിപ്പ്! തടസ്സം വളരെ അടുത്താണ്. ദയവായി നിർത്തുക."
    },
    hi: {
        welcome: "नमस्ते। विजन-एड अब सक्रिय है। कैमरा आपके परिवेश को स्कैन कर रहा है।",
        warning_close: "चेतावनी! बाधा बहुत करीब है। कृपया रुकें।"
    }
};

export const navigationTranslations = {
    en: {
        started: "Navigation started",
        turnLeft: "Turn left",
        turnRight: "Turn right",
        straight: "Walk straight",
        arrived: "You have arrived",
        recalculating: "Recalculating route",
        searching: "Searching destination...",
        notFound: "Destination not found",
        gpsWaiting: "Waiting for GPS...",
        listenError: "Destination not understood. Please repeat."
    },
    ta: {
        started: "வழிசெலுத்தல் தொடங்கியது",
        turnLeft: "இடப்பக்கம் திரும்பவும்",
        turnRight: "வலப்பக்கம் திரும்பவும்",
        straight: "நேராக செல்லவும்",
        arrived: "நீங்கள் வந்துவிட்டீர்கள்",
        recalculating: "பாதை மாற்றியமைக்கப்படுகிறது",
        searching: "இலக்கைத் தேடுகிறது...",
        notFound: "இடம் கிடைக்கவில்லை",
        gpsWaiting: "ஜிபிஎஸ் சிக்னலுக்காக காத்திருக்கிறது...",
        listenError: "இலக்கு புரியவில்லை. மீண்டும் சொல்லவும்."
    },
    ml: {
        started: "നാവിഗേഷൻ ആരംഭിച്ചു",
        turnLeft: "ഇടത്തോട്ട് തിരിയുക",
        turnRight: "വലത്തോട്ട് തിരിയുക",
        straight: "നേരെ പോകുക",
        arrived: "നിങ്ങൾ എത്തി",
        recalculating: "റൂട്ട് മാറുന്നു",
        searching: "ലക്ഷ്യം തിരയുന്നു...",
        notFound: "ലക്ഷ്യം കണ്ടെത്തിയില്ല",
        gpsWaiting: "GPS-നായി കാത്തിരിക്കുന്നു...",
        listenError: "ലക്ഷ്യം മനസ്സിലായില്ല. ദയവായി വീണ്ടും പറയുക."
    },
    hi: {
        started: "नेविगेशन शुरू हो गया",
        turnLeft: "बाएं मुड़ें",
        turnRight: "दाएं मुड़ें",
        straight: "सीधे चलें",
        arrived: "आप पहुंच गए",
        recalculating: "रास्ते की फिर से गणना हो रही है",
        searching: "गंतव्य खोजा जा रहा है...",
        notFound: "गंतव्य नहीं मिला",
        gpsWaiting: "GPS की प्रतीक्षा है...",
        listenError: "गंतव्य समझ में नहीं आया। कृपया दोहराएं।"
    }
};
