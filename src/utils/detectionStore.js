
// Map of detections to timestamp
export const currentDetectionsStore = {
    detections: [],
    lastUpdate: 0
};

export const updateDetections = (detections) => {
    currentDetectionsStore.detections = detections;
    currentDetectionsStore.lastUpdate = Date.now();
};

export const getLatestDetections = () => {
    // Return detections only if they are fresh (< 500ms)
    // if (Date.now() - currentDetectionsStore.lastUpdate > 1000) return [];
    return currentDetectionsStore.detections;
};
