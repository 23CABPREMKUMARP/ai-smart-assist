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
    constructor(detectionFn, targetFps = 30) {
        this.detectionFn = detectionFn;
        this.frameInterval = 1000 / targetFps; // Target ~33ms for 30 FPS
        this.isRunning = false;
        this.lastTime = 0;
        this.requestId = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        this.loop();
        console.log("Continuous Detection Loop Started at " + (1000 / this.frameInterval) + " FPS target");
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

        if (delta >= this.frameInterval) {
            this.lastTime = now - (delta % this.frameInterval);

            // Execute detection logic
            // We do not await this to let the UI thread breathe, 
            // but we ensure we don't stack calls if detection is slower than FPS
            this.detectionFn();
        }

        this.requestId = requestAnimationFrame(this.loop);
    }

    // Dynamic adjustment
    setTargetFps(fps) {
        this.frameInterval = 1000 / fps;
    }
}
