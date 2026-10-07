// Unified Input Manager for TILT KICK
// Enforces complete architectural separation:
// High-Quality Camera Display & Inference Pipeline,
// Multi-Face Crowd Arbitration, Biometric Identity Enrollment,
// Head Tracking, Body Tracking, and Keyboard Accessibility.

import { HeadTracker } from './HeadTracker.js';
import { BodyTracker } from './BodyTracker.js';
import { KeyboardTracker } from './KeyboardTracker.js';
import { settingsManager } from '../utils/SettingsManager.js';

export const CameraStates = Object.freeze({
    IDLE: 'CAMERA_IDLE',
    REQUESTING: 'CAMERA_REQUESTING',
    READY: 'CAMERA_READY',
    DENIED: 'CAMERA_DENIED',
    UNAVAILABLE: 'CAMERA_UNAVAILABLE',
    LOST: 'CAMERA_LOST'
});

export class InputManager {
    constructor() {
        this.mode = 'head'; // 'head' | 'body'
        this.headTracker = new HeadTracker();
        this.bodyTracker = new BodyTracker();
        this.keyboardTracker = new KeyboardTracker();

        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;

        // Dedicated offscreen canvas for optimized tracking inference
        // Separates pristine high-res camera preview from low-latency ML frames
        this.inferenceCanvas = document.createElement('canvas');
        this.inferenceCanvas.width = 640;
        this.inferenceCanvas.height = 360;
        this.inferenceCtx = this.inferenceCanvas.getContext('2d', { willReadFrequently: true });

        this.poseModel = null;
        this.faceMeshModel = null;
        this.cameraState = CameraStates.IDLE;
        this.isProcessingPaused = false;
        this.isProcessingLoopRunning = false;
        this.frameLoopId = null;
        this.cameraAllowed = false;
        this.cameraError = null;
        this.mediaStream = null;
        this.calPreviewVideo = null;
        this.cameraSettings = null;
        this.isKeyboardMode = false;

        this.cameraPreviewVisible = settingsManager.get('cameraPreview');
        this.lastProcessTime = performance.now();

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

    getCameraState() {
        return this.cameraState;
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
            this.cameraState === CameraStates.READY &&
            this.mediaStream &&
            this.mediaStream.active &&
            this.mediaStream.getVideoTracks().some(t => t.readyState === 'live')
        );
    }

    getStream() {
        return this.mediaStream;
    }

    getCameraSettings() {
        return this.cameraSettings;
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

    // ============================================================
    // DETERMINISTIC CAMERA ACQUISITION & LIFECYCLE
    // ============================================================
    async startCamera() {
        this.isKeyboardMode = false;

        // Reuse existing live stream if already fully ready
        if (this.isCameraActive()) {
            console.log('[InputManager] MediaStream already active and verified. Reusing hardware stream.');
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
            this.cameraState = CameraStates.UNAVAILABLE;
            this.cameraAllowed = false;
            this.cameraError = 'NotSupportedError';
            return false;
        }

        this.cameraState = CameraStates.REQUESTING;

        try {
            console.log('[InputManager] Requesting high-definition front-camera stream (720p/1080p)...');

            let stream = null;
            // 1. First attempt: High Definition (1080p ideal, 720p minimum)
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1920, min: 1280 },
                        height: { ideal: 1080, min: 720 },
                        facingMode: 'user',
                        frameRate: { ideal: 30 }
                    },
                    audio: false
                });
            } catch (hdErr) {
                console.warn('[InputManager] 1080p unavailable, attempting 720p fallback:', hdErr);
                // Fallback attempt: Standard 720p
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    },
                    audio: false
                });
            }

            // 2. Strict hardware verification
            const videoTracks = stream.getVideoTracks();
            if (!videoTracks || videoTracks.length === 0) {
                throw new Error('No video tracks available in stream');
            }

            const videoTrack = videoTracks[0];
            if (videoTrack.readyState !== 'live') {
                throw new Error(`Video track not live (state: ${videoTrack.readyState})`);
            }

            // Monitor track unexpected disconnect / death
            videoTrack.onended = () => {
                console.warn('[InputManager] Camera hardware stream was disconnected or ended.');
                this.cameraState = CameraStates.LOST;
                this.cameraAllowed = false;
                this.cameraError = 'CameraStreamEnded';
                this.stopCamera();
            };

            this.mediaStream = stream;
            this.cameraSettings = videoTrack.getSettings ? videoTrack.getSettings() : null;

            // 3. Attach to display video and await loaded metadata and non-zero dimensions
            if (this.videoElement) {
                this.videoElement.srcObject = stream;
                await this.waitForVideoDimensions(this.videoElement);
            }

            if (this.calPreviewVideo) {
                this.calPreviewVideo.srcObject = stream;
                this.calPreviewVideo.play().catch(() => {});
            }

            // Now and only now declare CAMERA_READY
            this.cameraState = CameraStates.READY;
            this.cameraAllowed = true;
            this.cameraError = null;
            this.isProcessingPaused = false;

            console.log(`[InputManager] CAMERA_READY: ${this.cameraSettings?.width || this.videoElement?.videoWidth || 'HD'}x${this.cameraSettings?.height || this.videoElement?.videoHeight || 'HD'} @ ${this.cameraSettings?.frameRate || 30}fps`);

            await this.initMediaPipeModels();
            this.startProcessingLoop();

            return true;
        } catch (err) {
            console.warn('[InputManager] Camera initialization failed:', err);
            this.cameraAllowed = false;
            this.mediaStream = null;

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                this.cameraState = CameraStates.DENIED;
                this.cameraError = 'NotAllowedError';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                this.cameraState = CameraStates.UNAVAILABLE;
                this.cameraError = 'NotFoundError';
            } else {
                this.cameraState = CameraStates.UNAVAILABLE;
                this.cameraError = err.name || 'CameraUnavailable';
            }

            this.stopCamera();
            return false;
        }
    }

    waitForVideoDimensions(videoElement) {
        return new Promise((resolve) => {
            const check = () => {
                if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                    resolve();
                } else {
                    requestAnimationFrame(check);
                }
            };

            videoElement.play()
                .then(() => check())
                .catch(() => {
                    // Try waiting on loadedmetadata
                    videoElement.onloadedmetadata = () => check();
                    // Resolve after timeout fallback to avoid blocking
                    setTimeout(resolve, 1500);
                });
        });
    }

    stopCamera() {
        console.log('[InputManager] Releasing camera hardware and stopping tracking loop...');
        if (this.cameraState !== CameraStates.DENIED && this.cameraState !== CameraStates.UNAVAILABLE && this.cameraState !== CameraStates.LOST) {
            this.cameraState = CameraStates.IDLE;
        }

        if (this.frameLoopId) {
            cancelAnimationFrame(this.frameLoopId);
            this.frameLoopId = null;
        }
        this.isProcessingLoopRunning = false;

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

        if (this.videoElement) this.videoElement.srcObject = null;
        if (this.calPreviewVideo) this.calPreviewVideo.srcObject = null;

        if (this.ctx && this.canvasElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }

        if (this.headTracker) {
            this.headTracker.faceDetected = false;
            this.headTracker.isPlayer1Locked = false;
        }
        if (this.bodyTracker) {
            this.bodyTracker.bodyDetected = false;
            this.bodyTracker.isBodyLocked = false;
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
        console.log('[InputManager] Fallback to Keyboard Mode engaged.');
        this.isKeyboardMode = true;
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

    // ============================================================
    // MEDIAPIPE MODELS INITIALIZATION
    // ============================================================
    async initMediaPipeModels() {
        // 1. Initialize Pose model for Body mode
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

        // 2. Initialize FaceMesh configured for MULTI-FACE crowd arbitration (maxNumFaces: 4)
        if (typeof window.FaceMesh !== 'undefined' && !this.faceMeshModel) {
            try {
                this.faceMeshModel = new window.FaceMesh({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
                });
                this.faceMeshModel.setOptions({
                    maxNumFaces: 4, // CORE REQUIREMENT: detect up to 4 faces to lock onto Player 1 and reject crowd!
                    refineLandmarks: true,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.faceMeshModel.onResults((results) => this.onFaceResults(results));
            } catch (e) {
                console.warn('[InputManager] FaceMesh model init note:', e);
            }
        }
    }

    // ============================================================
    // SEPARATED INFERENCE PROCESSING LOOP
    // ============================================================
    startProcessingLoop() {
        if (this.isProcessingLoopRunning) return;
        this.isProcessingLoopRunning = true;

        let isSending = false;

        const processFrame = async () => {
            if (this.cameraState !== CameraStates.READY || !this.mediaStream) {
                this.isProcessingLoopRunning = false;
                return;
            }

            if (!this.isProcessingPaused &&
                this.videoElement &&
                this.videoElement.readyState >= 2 &&
                !isSending &&
                this.videoElement.videoWidth > 0) {

                // Sync overlay canvas dimensions to video
                if (this.canvasElement &&
                    (this.canvasElement.width !== this.videoElement.videoWidth ||
                     this.canvasElement.height !== this.videoElement.videoHeight)) {
                    this.canvasElement.width = this.videoElement.videoWidth;
                    this.canvasElement.height = this.videoElement.videoHeight;
                }

                // Prepare downscaled inference frame to maintain 30+ FPS tracking
                // without sacrificing native display quality
                const vw = this.videoElement.videoWidth;
                const vh = this.videoElement.videoHeight;
                const aspect = vw / vh;
                const targetW = 640;
                const targetH = Math.round(targetW / aspect);

                if (this.inferenceCanvas.width !== targetW || this.inferenceCanvas.height !== targetH) {
                    this.inferenceCanvas.width = targetW;
                    this.inferenceCanvas.height = targetH;
                }

                this.inferenceCtx.drawImage(this.videoElement, 0, 0, targetW, targetH);

                isSending = true;
                try {
                    if (this.mode === 'head') {
                        if (this.faceMeshModel) {
                            await this.faceMeshModel.send({ image: this.inferenceCanvas });
                        } else if (this.poseModel) {
                            await this.poseModel.send({ image: this.inferenceCanvas });
                        }
                    } else {
                        if (this.poseModel) {
                            await this.poseModel.send({ image: this.inferenceCanvas });
                        }
                    }
                } catch (err) {
                    // Frame drop tolerance
                } finally {
                    isSending = false;
                }
            }

            if (this.cameraState === CameraStates.READY) {
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
        const deltaSec = Math.max(0.005, Math.min(0.1, (now - (this.lastProcessTime || now)) / 1000));
        this.lastProcessTime = now;

        // Process all detected faces through the Multi-Face Crowd Arbitration system
        this.headTracker.processMultiFace(results.multiFaceLandmarks, deltaSec);
        this.renderOverlay();
    }

    onPoseResults(results) {
        const now = performance.now();
        const deltaSec = Math.max(0.005, Math.min(0.1, (now - (this.lastProcessTime || now)) / 1000));
        this.lastProcessTime = now;

        if (this.mode === 'head') {
            if (!this.faceMeshModel) {
                const faceOnly = results.poseLandmarks ? results.poseLandmarks.slice(0, 11) : null;
                this.headTracker.processLandmarks(faceOnly, true, deltaSec);
                this.renderOverlay();
            }
        } else {
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
        this.headTracker.resetCalibration();
        this.bodyTracker.resetCalibration();
        this.keyboardTracker.resetKickTrigger();
        this.resetKickTrigger();
    }

    startCalibration() {
        if (this.cameraState !== CameraStates.READY) return;
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
        if (this.isKeyboardMode) return false;
        if (this.cameraState !== CameraStates.READY) return false;
        if (this.mode === 'head') {
            return this.headTracker.isCalibrating || this.headTracker.enrollmentState === 'CAPTURING_ID';
        } else {
            return this.bodyTracker.isCalibrating;
        }
    }

    // STRICT STATE MACHINE: Calibration complete ONLY if camera is READY and actual tracker completed
    isCalibrationComplete() {
        if (this.isKeyboardMode) return true;
        if (this.cameraState !== CameraStates.READY) return false;

        if (this.mode === 'head') {
            return this.headTracker.calibrationComplete && this.headTracker.isPlayer1Locked;
        } else {
            return this.bodyTracker.calibrationComplete && this.bodyTracker.isBodyLocked;
        }
    }

    // STRICT SINGLE SOURCE OF TRUTH: Match can ONLY start when all prerequisites are physically satisfied
    canStartMatch() {
        if (this.isKeyboardMode) return true;
        if (this.cameraState !== CameraStates.READY) return false;

        if (this.mode === 'head') {
            return (
                this.headTracker.faceDetected &&
                this.headTracker.isPlayer1Locked &&
                this.headTracker.calibrationComplete
            );
        } else {
            return (
                this.bodyTracker.bodyDetected &&
                this.bodyTracker.isBodyLocked &&
                this.bodyTracker.calibrationComplete
            );
        }
    }

    // STRICT PROGRESS: Zero fake progress when camera is not ready
    getCalibrationProgress() {
        if (this.isKeyboardMode) {
            return {
                percent: 100,
                quality: 5,
                complete: true,
                stage: 'LOCKED',
                stageLabel: 'KEYBOARD CONTROLS (ACTIVE)',
                samples: 24,
                required: 24
            };
        }

        if (this.cameraState !== CameraStates.READY) {
            let label = 'CAMERA NOT INITIALIZED';
            if (this.cameraState === CameraStates.REQUESTING) label = 'REQUESTING CAMERA PERMISSION...';
            if (this.cameraState === CameraStates.DENIED) label = 'CAMERA ACCESS DENIED';
            if (this.cameraState === CameraStates.UNAVAILABLE) label = 'CAMERA UNAVAILABLE';
            if (this.cameraState === CameraStates.LOST) label = 'CAMERA STREAM LOST';

            return {
                percent: 0,
                quality: 0,
                complete: false,
                stage: 'ERROR',
                stageLabel: label,
                samples: 0,
                required: 24
            };
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

    getAim() {
        if (Math.abs(this.keyboardTracker.normalizedAim) > 0.05) {
            return this.keyboardTracker.normalizedAim;
        }
        if (this.mode === 'head') {
            if (this.headTracker.kickTriggered || this.headTracker.isCharging) {
                return this.headTracker.lockedShotAim !== null ? this.headTracker.lockedShotAim : this.headTracker.normalizedAim;
            }
            return this.headTracker.normalizedAim;
        }
        if (this.bodyTracker.kickTriggered || this.bodyTracker.isCharging) {
            return this.bodyTracker.lockedShotAim !== null ? this.bodyTracker.lockedShotAim : this.bodyTracker.normalizedAim;
        }
        return this.bodyTracker.normalizedAim;
    }

    getLockedKickAim(defaultAim) {
        if (this.mode === 'head' && this.headTracker.lockedShotAim !== null) {
            return this.headTracker.lockedShotAim;
        }
        if (this.mode === 'body' && this.bodyTracker.lockedShotAim !== null) {
            return this.bodyTracker.lockedShotAim;
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
        if (this.isKeyboardMode) return true;
        if (!this.isCameraActive()) return false;
        return this.mode === 'head'
            ? (this.headTracker.faceDetected && this.headTracker.isPlayer1Locked)
            : (this.bodyTracker.bodyDetected && this.bodyTracker.isBodyLocked);
    }

    getPositionStatus() {
        if (this.isKeyboardMode) return 'KEYBOARD';
        if (this.cameraState === CameraStates.DENIED) return 'CAMERA_DENIED';
        if (this.cameraState === CameraStates.UNAVAILABLE) return 'CAMERA_UNAVAILABLE';
        if (this.cameraState === CameraStates.LOST) return 'CAMERA_LOST';
        if (this.cameraState !== CameraStates.READY) return 'CAMERA_OFF';

        if (this.mode === 'head') {
            return this.headTracker.positionStatus || 'NO_FACE';
        }
        return this.bodyTracker.positionStatus || 'NO_BODY';
    }

    getStatusText() {
        if (this.isKeyboardMode) return 'KEYBOARD CONTROLS (CAM OFF)';

        if (this.cameraState === CameraStates.REQUESTING) return 'REQUESTING CAMERA ACCESS...';
        if (this.cameraState === CameraStates.DENIED) return 'CAMERA PERMISSION DENIED';
        if (this.cameraState === CameraStates.UNAVAILABLE) return 'CAMERA UNAVAILABLE';
        if (this.cameraState === CameraStates.LOST) return 'CAMERA STREAM LOST';
        if (this.cameraState !== CameraStates.READY) return 'CAMERA OFF';

        if (this.isCalibrating()) {
            const prog = this.getCalibrationProgress();
            return prog.stageLabel || 'CALIBRATING...';
        }

        if (this.mode === 'head') {
            if (this.headTracker.searchingForPlayer) {
                return 'SEARCHING FOR PLAYER 1...';
            }
            if (this.headTracker.isPlayer1Locked) {
                if (this.headTracker.ignoredFaceCount > 0) {
                    return `P1 LOCKED • ${this.headTracker.ignoredFaceCount} CROWD FACE IGNORED`;
                }
                return 'PLAYER 1 ● TRACKED';
            }
            switch (this.headTracker.positionStatus) {
                case 'MOVE_CLOSER': return 'MOVE CLOSER';
                case 'MOVE_BACK': return 'MOVE BACK';
                case 'MOVE_RIGHT': return 'MOVE RIGHT';
                case 'MOVE_LEFT': return 'MOVE LEFT';
                case 'MOVE_DOWN': return 'MOVE DOWN';
                case 'MOVE_UP': return 'MOVE UP';
                case 'STEADY_HEAD': return 'HOLD STILL';
                case 'NO_PLAYER': return 'PLAYER 1 NOT FOUND';
                default: return 'SEARCHING...';
            }
        } else {
            if (this.bodyTracker.isBodyLocked) {
                return 'BODY ● TRACKED';
            }
            switch (this.bodyTracker.positionStatus) {
                case 'MOVE_BACK': return 'MOVE BACK';
                case 'MOVE_CLOSER': return 'MOVE CLOSER';
                case 'MOVE_LEFT': return 'STEP LEFT';
                case 'MOVE_RIGHT': return 'STEP RIGHT';
                case 'FULL_BODY_REQUIRED': return 'FULL BODY REQUIRED';
                case 'BODY_FRAMED': return 'BODY FRAMED ✓';
                default: return 'BODY NOT DETECTED';
            }
        }
    }
}
