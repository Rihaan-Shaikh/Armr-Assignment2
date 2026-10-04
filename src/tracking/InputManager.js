// Unified Input Manager for TILT KICK
// Enforces complete architectural separation:
// HEAD MODE: Strictly FACE-ONLY tracking.
// BODY MODE: Stand & Play Pose tracking.
// KEYBOARD: Full accessibility fallback.

import { HeadTracker } from './HeadTracker.js';
import { BodyTracker } from './BodyTracker.js';
import { KeyboardTracker } from './KeyboardTracker.js';
import { settingsManager } from '../utils/SettingsManager.js';

export class InputManager {
    constructor() {
        this.mode = 'head'; // 'head' | 'body'
        this.headTracker = new HeadTracker();
        this.bodyTracker = new BodyTracker();
        this.keyboardTracker = new KeyboardTracker();

        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;

        this.poseModel = null;
        this.faceMeshModel = null;
        this.isCameraRunning = false;
        this.isProcessingPaused = false;
        this.isProcessingLoopRunning = false;
        this.frameLoopId = null;
        this.cameraAllowed = false;
        this.cameraError = null;
        this.mediaStream = null;
        this.calPreviewVideo = null;

        this.cameraPreviewVisible = settingsManager.get('cameraPreview');
        this.lastFaceProcessTime = performance.now();

        // Subscribe to settings
        settingsManager.subscribe((s) => {
            this.setCameraPreviewVisible(s.cameraPreview);
        });
    }

    setMode(mode) {
        if (mode !== 'head' && mode !== 'body') return;
        this.mode = mode;
        console.log(`[InputManager] Switched tracking mode to: ${this.mode}`);
    }

    getMode() {
        return this.mode;
    }

    setCameraPreviewVisible(visible) {
        this.cameraPreviewVisible = visible;
        if (this.canvasElement && this.videoElement) {
            this.videoElement.style.display = visible ? 'block' : 'none';
            this.canvasElement.style.display = visible ? 'block' : 'none';
        }
    }

    bindDOMElements(videoElement, canvasElement) {
        this.videoElement = videoElement;
        this.canvasElement = canvasElement;
        this.ctx = canvasElement ? canvasElement.getContext('2d') : null;
    }

    isCameraActive() {
        return !!(
            this.mediaStream &&
            this.mediaStream.active &&
            this.mediaStream.getVideoTracks().some(t => t.readyState === 'live')
        );
    }

    getStream() {
        return this.mediaStream;
    }

    pauseProcessing(paused = true) {
        this.isProcessingPaused = !!paused;
    }

    attachPreviewTo(videoElement) {
        this.calPreviewVideo = videoElement;
        if (!videoElement) return;
        if (this.mediaStream && this.isCameraActive()) {
            if (videoElement.srcObject !== this.mediaStream) {
                videoElement.srcObject = this.mediaStream;
            }
            videoElement.play().catch(e => console.warn('[InputManager] Preview play note:', e));
        }
    }

    async startCamera() {
        // Idempotent: reuse existing stream if already live and active
        if (this.isCameraActive()) {
            console.log('[InputManager] MediaStream already active. Reusing single hardware stream.');
            if (this.videoElement && this.videoElement.srcObject !== this.mediaStream) {
                this.videoElement.srcObject = this.mediaStream;
                this.videoElement.play().catch(() => {});
            }
            if (this.calPreviewVideo && this.calPreviewVideo.srcObject !== this.mediaStream) {
                this.calPreviewVideo.srcObject = this.mediaStream;
                this.calPreviewVideo.play().catch(() => {});
            }
            this.isProcessingPaused = false;
            return true;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.cameraAllowed = false;
            this.cameraError = 'NotSupportedError';
            return false;
        }

        try {
            console.log('[InputManager] Requesting camera access (getUserMedia)...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            });

            this.mediaStream = stream;
            this.cameraAllowed = true;
            this.cameraError = null;
            this.isCameraRunning = true;
            this.isProcessingPaused = false;

            if (this.videoElement) {
                this.videoElement.srcObject = stream;
                await this.videoElement.play().catch(e => console.warn('[InputManager] Main video play note:', e));
            }

            if (this.calPreviewVideo) {
                this.calPreviewVideo.srcObject = stream;
                await this.calPreviewVideo.play().catch(e => console.warn('[InputManager] Cal video play note:', e));
            }

            await this.initMediaPipeModels();
            this.startProcessingLoop();

            console.log('[InputManager] Camera hardware stream acquired and processing loop active.');
            return true;
        } catch (err) {
            console.warn('[InputManager] Camera access failed:', err);
            this.cameraAllowed = false;
            this.cameraError = err.name || 'CameraUnavailable';
            this.isCameraRunning = false;
            this.stopCamera();
            return false;
        }
    }

    stopCamera() {
        console.log('[InputManager] Stopping camera and releasing hardware...');
        this.isCameraRunning = false;
        this.isProcessingPaused = false;

        // 1. Cancel requestAnimationFrame processing loop
        if (this.frameLoopId) {
            cancelAnimationFrame(this.frameLoopId);
            this.frameLoopId = null;
        }
        this.isProcessingLoopRunning = false;

        // 2. Stop all MediaStream tracks (hardware release)
        if (this.mediaStream) {
            try {
                this.mediaStream.getTracks().forEach(track => {
                    track.stop();
                    console.log(`[InputManager] Track stopped: ${track.kind} (${track.label || 'video'})`);
                });
            } catch (e) {
                console.warn('[InputManager] Error stopping tracks:', e);
            }
            this.mediaStream = null;
        }

        // 3. Clear video element sources
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        if (this.calPreviewVideo) {
            this.calPreviewVideo.srcObject = null;
        }

        // 4. Clear overlay canvas
        if (this.ctx && this.canvasElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }

        // 5. Reset detection status
        if (this.headTracker) {
            this.headTracker.faceDetected = false;
        }
        if (this.bodyTracker) {
            this.bodyTracker.bodyDetected = false;
        }
    }

    async restartCamera() {
        this.stopCamera();
        return await this.startCamera();
    }

    async retryCamera() {
        return await this.restartCamera();
    }

    fallbackToKeyboard() {
        this.cameraAllowed = false;
        this.cameraError = 'FallbackKeyboard';
        this.stopCamera();
        if (this.headTracker) this.headTracker.forceCompleteCalibration();
        if (this.bodyTracker) this.bodyTracker.forceCompleteCalibration();
    }

    async initCamera(videoElement, canvasElement) {
        this.bindDOMElements(videoElement, canvasElement);
        return await this.startCamera();
    }

    async initMediaPipeModels() {
        // 1. Initialize Pose model for Body mode and fallback
        if (typeof window.Pose !== 'undefined' && !this.poseModel) {
            try {
                this.poseModel = new window.Pose({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
                });
                this.poseModel.setOptions({
                    modelComplexity: 1,
                    smoothLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.poseModel.onResults((results) => this.onPoseResults(results));
            } catch (e) {
                console.warn('[InputManager] Pose model init note:', e);
            }
        }

        // 2. Initialize FaceMesh for Head mode
        if (typeof window.FaceMesh !== 'undefined' && !this.faceMeshModel) {
            try {
                this.faceMeshModel = new window.FaceMesh({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
                });
                this.faceMeshModel.setOptions({
                    maxNumFaces: 1,
                    refineLandmarks: false,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.faceMeshModel.onResults((results) => this.onFaceResults(results));
            } catch (e) {
                console.warn('[InputManager] FaceMesh model init note:', e);
            }
        }
    }

    startProcessingLoop() {
        if (this.isProcessingLoopRunning) return;
        this.isProcessingLoopRunning = true;

        let isSending = false;

        const processFrame = async () => {
            if (!this.isCameraRunning) {
                this.isProcessingLoopRunning = false;
                return;
            }

            if (!this.isProcessingPaused &&
                this.videoElement &&
                this.videoElement.readyState >= 2 &&
                !isSending &&
                this.videoElement.videoWidth > 0) {

                // Match canvas dimensions to video aspect
                if (this.canvasElement &&
                    (this.canvasElement.width !== this.videoElement.videoWidth ||
                     this.canvasElement.height !== this.videoElement.videoHeight)) {
                    this.canvasElement.width = this.videoElement.videoWidth;
                    this.canvasElement.height = this.videoElement.videoHeight;
                }

                isSending = true;
                try {
                    if (this.mode === 'head') {
                        if (this.faceMeshModel) {
                            await this.faceMeshModel.send({ image: this.videoElement });
                        } else if (this.poseModel) {
                            await this.poseModel.send({ image: this.videoElement });
                        }
                    } else {
                        if (this.poseModel) {
                            await this.poseModel.send({ image: this.videoElement });
                        }
                    }
                } catch (err) {
                    // Frame drop
                } finally {
                    isSending = false;
                }
            }

            if (this.isCameraRunning) {
                this.frameLoopId = requestAnimationFrame(processFrame);
            } else {
                this.isProcessingLoopRunning = false;
            }
        };

        this.frameLoopId = requestAnimationFrame(processFrame);
    }

    onFaceResults(results) {
        if (this.mode !== 'head') return;
        const now = performance.now();
        const deltaSec = Math.max(0.005, Math.min(0.1, (now - (this.lastFaceProcessTime || now)) / 1000));
        this.lastFaceProcessTime = now;

        const landmarks = results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0
            ? results.multiFaceLandmarks[0]
            : null;

        // FACE-ONLY
        this.headTracker.processLandmarks(landmarks, false, deltaSec);
        this.renderOverlay();
    }

    onPoseResults(results) {
        const now = performance.now();
        const deltaSec = Math.max(0.005, Math.min(0.1, (now - (this.lastFaceProcessTime || now)) / 1000));
        this.lastFaceProcessTime = now;

        if (this.mode === 'head') {
            // ONLY if FaceMesh is unavailable: extract face landmarks (0 to 10) ONLY
            if (!this.faceMeshModel) {
                const faceOnly = results.poseLandmarks ? results.poseLandmarks.slice(0, 11) : null;
                this.headTracker.processLandmarks(faceOnly, true, deltaSec);
                this.renderOverlay();
            }
        } else {
            // Body Mode
            this.bodyTracker.processLandmarks(results.poseLandmarks);
            this.renderOverlay();
        }
    }

    renderOverlay() {
        if (!this.ctx || !this.cameraPreviewVisible) return;
        const w = this.canvasElement.width || 640;
        const h = this.canvasElement.height || 480;

        if (this.mode === 'head') {
            this.headTracker.drawOverlay(this.ctx, w, h);
        } else {
            this.bodyTracker.drawOverlay(this.ctx, w, h);
        }
    }

    resetPlayerSession() {
        // Complete state flush for 2-Player turn switching or new matches
        this.headTracker.resetCalibration();
        this.bodyTracker.resetCalibration();
        this.keyboardTracker.resetKickTrigger();
        this.resetKickTrigger();
    }

    startCalibration() {
        if (!this.cameraAllowed) {
            // Camera unavailable or denied: user will use fallback buttons
            return;
        }

        if (this.mode === 'head') {
            this.headTracker.startCalibration();
        } else {
            this.bodyTracker.startCalibration();
        }
    }

    resetCalibration() {
        if (this.mode === 'head') {
            this.headTracker.resetCalibration();
        } else {
            this.bodyTracker.resetCalibration();
        }
    }

    forceCalibrationComplete() {
        if (this.mode === 'head') {
            this.headTracker.forceCompleteCalibration();
        } else {
            this.bodyTracker.forceCompleteCalibration();
        }
    }

    isCalibrating() {
        if (!this.cameraAllowed) return false;
        if (this.mode === 'head') {
            return this.headTracker.isCalibrating;
        } else {
            return this.bodyTracker.isCalibrating;
        }
    }

    isCalibrationComplete() {
        if (!this.cameraAllowed) return true;
        if (this.mode === 'head') {
            return this.headTracker.calibrationComplete;
        } else {
            return this.bodyTracker.calibrationComplete;
        }
    }

    getCalibrationProgress() {
        if (!this.cameraAllowed) {
            return { percent: 100, quality: 5, complete: true };
        }
        if (this.mode === 'head') {
            return this.headTracker.getCalibrationProgress();
        } else {
            return this.bodyTracker.getCalibrationProgress();
        }
    }

    lockInput(locked) {
        this.headTracker.lockInput(locked);
    }

    update(delta = 1 / 60) {
        this.keyboardTracker.update(delta);
    }

    // Normalized Game Inputs
    getAim() {
        if (Math.abs(this.keyboardTracker.normalizedAim) > 0.05) {
            return this.keyboardTracker.normalizedAim;
        }
        if (this.mode === 'head') {
            // If kick was triggered or charging with upward nod in progress,
            // use lockedShotAim to guarantee no aim reticle jumping during the nod
            if (this.headTracker.lockedShotAim !== null &&
                (this.headTracker.kickTriggered || this.headTracker.isCharging)) {
                return this.headTracker.lockedShotAim;
            }
            return this.headTracker.normalizedAim;
        }
        return this.bodyTracker.normalizedAim;
    }

    getLockedKickAim(defaultAim) {
        if (this.mode === 'head' && this.headTracker.lockedShotAim !== null) {
            return this.headTracker.lockedShotAim;
        }
        return defaultAim;
    }

    getPower() {
        if (this.keyboardTracker.power > 0.05) {
            return this.keyboardTracker.power;
        }
        return this.mode === 'head' ? this.headTracker.power : this.bodyTracker.power;
    }

    isKickTriggered() {
        return this.keyboardTracker.kickTriggered ||
               (this.mode === 'head' ? this.headTracker.kickTriggered : this.bodyTracker.kickTriggered);
    }

    resetKickTrigger() {
        this.keyboardTracker.resetKickTrigger();
        if (this.mode === 'head') {
            this.headTracker.resetKickTrigger();
        } else {
            this.bodyTracker.resetKickTrigger();
        }
    }

    isTracking() {
        if (!this.isCameraActive() || !this.cameraAllowed) return false;
        return this.mode === 'head' ? this.headTracker.faceDetected : this.bodyTracker.bodyDetected;
    }

    getPositionStatus() {
        if (this.cameraError === 'FallbackKeyboard') {
            return 'KEYBOARD';
        }
        if (!this.isCameraActive()) {
            if (this.cameraError === 'NotAllowedError') return 'CAMERA_DENIED';
            if (this.cameraError) return 'CAMERA_UNAVAILABLE';
            return 'CAMERA_OFF';
        }
        if (this.mode === 'head') {
            return this.headTracker.positionStatus || 'NO_FACE';
        }
        return this.bodyTracker.positionStatus || 'NO_BODY';
    }

    getStatusText() {
        if (!this.isCameraActive()) {
            if (this.cameraError === 'FallbackKeyboard') {
                return 'KEYBOARD CONTROLS (CAM OFF)';
            }
            return 'CAM: OFF';
        }
        if (this.isCalibrating()) {
            return 'CALIBRATING NEUTRAL...';
        }
        if (this.mode === 'head') {
            switch (this.headTracker.positionStatus) {
                case 'MOVE_CLOSER': return 'MOVE CLOSER';
                case 'MOVE_BACK': return 'MOVE BACK';
                case 'MOVE_RIGHT': return 'MOVE RIGHT';
                case 'MOVE_LEFT': return 'MOVE LEFT';
                case 'MOVE_DOWN': return 'MOVE DOWN';
                case 'MOVE_UP': return 'MOVE UP';
                case 'LOOK_STRAIGHT': return 'LOOK STRAIGHT — HOLD STILL';
                case 'FACE_DETECTED': return 'FACE DETECTED ✓';
                case 'NO_FACE':
                default:
                    return 'FACE NOT DETECTED';
            }
        } else {
            switch (this.bodyTracker.positionStatus) {
                case 'MOVE_BACK': return 'MOVE BACK';
                case 'MOVE_CLOSER': return 'MOVE CLOSER';
                case 'MOVE_RIGHT': return 'MOVE RIGHT';
                case 'MOVE_LEFT': return 'MOVE LEFT';
                case 'BODY_DETECTED': return 'BODY DETECTED ✓';
                case 'NO_BODY':
                default:
                    return 'BODY NOT DETECTED';
            }
        }
    }
}
