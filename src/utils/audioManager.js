
import { speak } from './speech';

let isListening = false;
let currentPriority = 0; // 0=None, 1=General, 2=Nav, 3=Finder, 4=Emergency

const PRIORITY_LEVELS = {
    EMERGENCY: 4,
    FINDER: 3,
    NAVIGATION: 2,
    GENERAL: 1
};

const queue = [];

export const playAudio = (text, priorityLevel = 1, lang = 'en') => {
    // If higher priority is speaking, ignore lower
    if (window.speechSynthesis.speaking && priorityLevel < currentPriority) {
        return;
    }

    // If emergency, cancel everything
    if (priorityLevel === PRIORITY_LEVELS.EMERGENCY) {
        window.speechSynthesis.cancel();
        currentPriority = priorityLevel;
        speak(text, lang, 'high', () => { currentPriority = 0; });
        return;
    }

    // Normal queue
    speak(text, lang, 'normal', () => { currentPriority = 0; });
};

export const pauseListening = () => {
    // Stop all recognition instances (handled via events in components usually)
    // For now, simpler coordination via global flag
    window.__visionAidListeningPaused = true;
};

export const resumeListening = () => {
    window.__visionAidListeningPaused = false;
};
