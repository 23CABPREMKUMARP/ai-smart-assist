/**
 * CONTROLLER: Continuous Detection Controller
 * 
 * Manages the high-frequency detection loop using requestAnimationFrame.
 * Fully decouples detection logic from rendering logic to ensure
 * smooth camera feed even under heavy load.
 * 
 * Features:
 * - Persistent Loop (Never Stops)
 * - Auto-throttling integration
 * - Prototype Mode (Optional WebWorker hooks for future)
 */

export class ContinuousDetectionController {
    constructor(detectionFn, intervalMs = 100) {
        this.detectionFn = detectionFn;
        this.intervalMs = intervalMs;
        this.isRunning = false;
        this.lastTime = 0;
        this.requestId = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.loop();
        console.log("Continuous Detection Loop Started");
    }

    stop() {
        this.isRunning = false;
        if (this.requestId) {
            cancelAnimationFrame(this.requestId);
            this.requestId = null;
        }
        console.log("Continuous Detection Loop Stopped");
    }

    loop = () => {
        if (!this.isRunning) return;

        const now = performance.now();
        const delta = now - this.lastTime;

        if (delta >= this.intervalMs) {
            this.lastTime = now - (delta % this.intervalMs);

            // Execute detection logic asynchronously
            // This ensures the animation frame is released immediately to the browser
            // keeping the UI smooth.
            this.detectionFn().catch(err => {
                console.warn("Detection Loop Warning:", err);
            });
        }

        this.requestId = requestAnimationFrame(this.loop);
    }

    // Dynamic adjustment for high-performance mode
    setTurboMode(enabled) {
        this.intervalMs = enabled ? 50 : 200;
    }
}
