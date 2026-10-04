// Advanced Robust Head Tracker for TILT KICK
// Control Pipeline:
// ROLL = AIM LEFT / RIGHT
// HOLD TILT = CHARGE POWER (Based on elapsed duration)
// QUICK UPWARD NOD = KICK
// (Aim is locked during nod so reticle does not jump)

import { settingsManager } from '../utils/SettingsManager.js';

export class HeadTracker {
    constructor() {
        // Roll & Aim (Horizontal)
        this.rawRollAngle = 0;        // Degrees: positive = tilt right, negative = tilt left
        this.neutralRoll = 0;         // Calibrated neutral baseline
        this.smoothedRoll = 0;        // Filtered degrees
        this.normalizedAim = 0;       // -1.0 (Left) to +1.0 (Right)
        this.lockedShotAim = 0;       // Aim frozen when upward nod begins

        // Pitch & Nod (Vertical)
        this.rawPitch = 0;            // Normalized vertical pitch proxy
        this.neutralPitch = 0;        // Calibrated neutral pitch baseline
        this.smoothedPitch = 0;       // Filtered pitch
        this.prevPitch = 0;
        this.pitchVelocity = 0;       // Upward pitch velocity (units/sec)
        this.pitchHistory = [];       // { time, pitch } buffer for displacement verification

        // Power Charging (Duration Based)
        this.power = 0;               // 0.0 to 1.0
        this.isCharging = false;
        this.chargeDurationMs = 0;    // Time spent holding tilt in ms
        this.minChargeDurationMs = 280;// Minimum 280ms charge before kick is armed
        this.maxChargeDurationMs = 2000;// 2.0s to reach 100% power

        // Kick Trigger & Safety State
        this.kickTriggered = false;
        this.lastKickTimestamp = -99999; // Allows kicking immediately after startup without 1.2s false cooldown
        this.kickCooldownMs = 1200;
        this.inputLocked = false;

        // Upward Nod Tuning Parameters
        // Upward nod moves nose up toward eyes -> pitch increases positive
        this.nodVelocityThreshold = 42.0;    // Minimum upward velocity to count as quick nod
        this.nodDisplacementThreshold = 5.2; // Minimum upward displacement within window
        this.nodWindowMs = 180;              // Window to calculate upward displacement

        // Calibration State & Rolling Samples
        this.isCalibrating = false;
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        this.calibrationSamplesRequired = 45; // ~1.2-1.5s of stable tracking samples
        this.calibrationDuration = 2500; // ms safety timeout
        this.calibrationStartTime = 0;

        // Face Validation & Quality Status
        this.faceDetected = false;
        this.positionStatus = 'NO_FACE';
        this.candidatePositionStatus = 'NO_FACE';
        this.candidateStatusStartTime = 0;
        this.stabilityHistory = [];
        this.lastDetectionTime = 0;
        this.faceLostThresholdMs = 380;
        this.reacquisitionFrames = 0;
        this.reacquisitionThreshold = 8;
        this.lastTrackedCenter = { x: 0.5, y: 0.5 };

        // Subscribe to settings
        this.syncSettings();
        settingsManager.subscribe(() => this.syncSettings());
    }

    syncSettings() {
        this.sensitivity = settingsManager.get('headSensitivity');
        this.deadZoneDeg = settingsManager.get('deadZone');
        this.smoothingAlpha = settingsManager.getSmoothingAlpha();
        this.aimAssistFactor = settingsManager.getAimAssistFactor();

        const chargeSpeed = settingsManager.get('chargeSpeed');
        if (chargeSpeed === 'slow') this.maxChargeDurationMs = 2500;
        else if (chargeSpeed === 'fast') this.maxChargeDurationMs = 1500;
        else this.maxChargeDurationMs = 2000;
    }

    resetCalibration() {
        this.neutralRoll = 0;
        this.neutralPitch = 0;
        this.smoothedRoll = 0;
        this.smoothedPitch = 0;
        this.prevPitch = 0;
        this.pitchVelocity = 0;
        this.pitchHistory = [];
        this.calibrationSamples = [];
        this.isCalibrating = false;
        this.calibrationComplete = false;
        this.reacquisitionFrames = 0;
        this.power = 0;
        this.isCharging = false;
        this.chargeDurationMs = 0;
        this.kickTriggered = false;
        this.lockedShotAim = null;
        this.positionStatus = 'NO_FACE';
        this.candidatePositionStatus = 'NO_FACE';
        this.stabilityHistory = [];
    }

    startCalibration() {
        this.isCalibrating = true;
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        this.calibrationStartTime = performance.now();
        this.power = 0;
        this.isCharging = false;
        this.chargeDurationMs = 0;
        this.kickTriggered = false;
    }

    forceCompleteCalibration() {
        if (this.calibrationSamples.length > 0) {
            // Outlier rejection: sort and take median neutral roll and pitch
            const sortedRolls = this.calibrationSamples.map(s => s.roll).sort((a, b) => a - b);
            const sortedPitches = this.calibrationSamples.map(s => s.pitch).sort((a, b) => a - b);
            const mid = Math.floor(sortedRolls.length / 2);
            this.neutralRoll = sortedRolls[mid];
            this.neutralPitch = sortedPitches[mid];
        } else {
            this.neutralRoll = 0;
            this.neutralPitch = 0;
        }
        this.isCalibrating = false;
        this.calibrationComplete = true;
        this.power = 0;
        this.isCharging = false;
        this.chargeDurationMs = 0;
        this.kickTriggered = false;
        console.log(`[HeadTracker] Calibration saved. Neutral Roll: ${this.neutralRoll.toFixed(1)}°, Neutral Pitch: ${this.neutralPitch.toFixed(1)}`);
    }

    isHeadStable(now, roll, pitch) {
        this.stabilityHistory.push({ time: now, roll, pitch });
        while (this.stabilityHistory.length > 0 && now - this.stabilityHistory[0].time > 320) {
            this.stabilityHistory.shift();
        }
        if (this.stabilityHistory.length < 4) return false;
        const rolls = this.stabilityHistory.map(s => s.roll);
        const deltaRoll = Math.max(...rolls) - Math.min(...rolls);
        return deltaRoll < 3.5;
    }

    getCalibrationProgress() {
        if (this.calibrationComplete) {
            return { percent: 100, quality: 5, complete: true };
        }
        if (!this.isCalibrating) {
            return { percent: 0, quality: 0, complete: false };
        }
        const count = this.calibrationSamples.length;
        const pct = Math.min(100, Math.round((count / this.calibrationSamplesRequired) * 100));
        const quality = Math.min(5, Math.floor((count / this.calibrationSamplesRequired) * 5));
        return { percent: pct, quality, complete: false };
    }

    // Called on every frame strictly with FACE landmarks
    processLandmarks(landmarks, isPoseModel = false, deltaSec = 1 / 60) {
        const now = performance.now();
        const dt = Math.max(0.001, deltaSec);
        const dtMs = dt * 1000;

        // 1. Check face presence
        if (!landmarks || landmarks.length === 0) {
            this.faceLostAccumulatorMs = (this.faceLostAccumulatorMs || 0) + dtMs;
            if (this.faceLostAccumulatorMs > this.faceLostThresholdMs || (now - this.lastDetectionTime > this.faceLostThresholdMs)) {
                this.faceDetected = false;
                this.positionStatus = 'NO_FACE';
                // Safely decay power without kicking
                this.power = Math.max(0, this.power - 0.05);
                this.isCharging = false;
                this.chargeDurationMs = 0;
                this.reacquisitionFrames = 0;
            }

            if (this.isCalibrating && now - this.calibrationStartTime > this.calibrationDuration) {
                this.forceCompleteCalibration();
            }
            return;
        }

        this.faceLostAccumulatorMs = 0;

        // 2. Extract 3D Face Geometry (Roll and Pitch)
        let rollDeg = 0;
        let pitchProxy = 0;
        let faceCenter = { x: 0.5, y: 0.5 };
        let faceWidth = 0.3;

        if (!isPoseModel && landmarks.length >= 468) {
            // MediaPipe FaceMesh (High fidelity)
            const leftEye = landmarks[33];   // Left eye outer
            const rightEye = landmarks[263]; // Right eye outer
            const noseTip = landmarks[1];
            const forehead = landmarks[10];
            const chin = landmarks[152];

            faceCenter = {
                x: (leftEye.x + rightEye.x) / 2,
                y: (forehead.y + chin.y) / 2
            };

            faceWidth = Math.abs(rightEye.x - leftEye.x);
            const faceHeight = Math.max(0.08, Math.abs(chin.y - forehead.y));

            // Roll (mirrored webcam: invert angle so right tilt gives positive degrees)
            const dx = rightEye.x - leftEye.x;
            const dy = rightEye.y - leftEye.y;
            rollDeg = -Math.atan2(dy, dx) * (180 / Math.PI);

            // Pitch calculation:
            // When player nods UP, nose tip moves UP relative to eye midpoint.
            // In screen coordinates Y decreases as objects move up.
            const eyeMidY = (leftEye.y + rightEye.y) / 2;
            // Upward nod -> (eyeMidY - noseTip.y) increases
            pitchProxy = ((eyeMidY - noseTip.y) / faceHeight) * 100;
        } else {
            // Pose model fallback face landmarks (0: nose, 2: left_eye, 5: right_eye)
            const leftEye = landmarks[2] || landmarks[7];
            const rightEye = landmarks[5] || landmarks[8];
            const nose = landmarks[0];

            if (leftEye && rightEye && nose) {
                faceCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
                faceWidth = Math.abs(rightEye.x - leftEye.x);
                const dx = rightEye.x - leftEye.x;
                const dy = rightEye.y - leftEye.y;
                rollDeg = -Math.atan2(dy, dx) * (180 / Math.PI);

                const eyeMidY = (leftEye.y + rightEye.y) / 2;
                pitchProxy = (eyeMidY - nose.y) * 100;
            } else {
                return;
            }
        }

        // 3. Multi-face stability check
        const distFromLast = Math.hypot(faceCenter.x - this.lastTrackedCenter.x, faceCenter.y - this.lastTrackedCenter.y);
        if (this.faceDetected && distFromLast > 0.40) {
            this.reacquisitionFrames = 0; // Prevent abrupt face hopping
        }
        this.lastTrackedCenter = faceCenter;

        // 4. Guided camera positioning feedback (mirrored selfie coordinates)
        let rawStatus = 'FACE_DETECTED';
        if (faceWidth < 0.13) {
            rawStatus = 'MOVE_CLOSER';
        } else if (faceWidth > 0.44) {
            rawStatus = 'MOVE_BACK';
        } else if (faceCenter.x > 0.65) {
            // In mirrored selfie preview, user appears on left of screen -> prompt move right
            rawStatus = 'MOVE_RIGHT';
        } else if (faceCenter.x < 0.35) {
            // In mirrored selfie preview, user appears on right of screen -> prompt move left
            rawStatus = 'MOVE_LEFT';
        } else if (faceCenter.y < 0.25) {
            rawStatus = 'MOVE_DOWN';
        } else if (faceCenter.y > 0.75) {
            rawStatus = 'MOVE_UP';
        } else if (this.isHeadStable(now, rollDeg, pitchProxy)) {
            rawStatus = 'LOOK_STRAIGHT';
        }

        // Stability / Debounce window (180ms) to keep UI calm and avoid flickering
        if (rawStatus !== this.candidatePositionStatus) {
            this.candidatePositionStatus = rawStatus;
            this.candidateStatusStartTime = now;
        } else if (now - this.candidateStatusStartTime >= 180) {
            this.positionStatus = rawStatus;
        }

        const isFramed = (this.positionStatus === 'FACE_DETECTED' || this.positionStatus === 'LOOK_STRAIGHT');
        this.faceDetected = true;
        this.lastDetectionTime = now;
        this.reacquisitionFrames++;

        this.rawRollAngle = rollDeg;
        this.rawPitch = pitchProxy;

        // 5. Calibration phase
        if (this.isCalibrating) {
            // Only collect samples when face is properly framed and holding relatively steady
            if (isFramed && Math.abs(rollDeg) < 35) {
                this.calibrationSamples.push({ roll: rollDeg, pitch: pitchProxy });
            }
            const elapsed = now - this.calibrationStartTime;
            if (this.calibrationSamples.length >= this.calibrationSamplesRequired ||
                (elapsed >= this.calibrationDuration && this.calibrationSamples.length >= 15)) {
                this.forceCompleteCalibration();
            }
            return;
        }

        // 6. Neutral offsets
        const offsetRoll = this.rawRollAngle - this.neutralRoll;
        const offsetPitch = this.rawPitch - this.neutralPitch;

        // 7. Temporal Exponential Moving Average (Smoothing)
        this.smoothedRoll = this.smoothingAlpha * offsetRoll + (1 - this.smoothingAlpha) * this.smoothedRoll;

        // Smooth pitch (use slightly faster alpha for responsive nod detection)
        const pitchAlpha = 0.35;
        this.prevPitch = this.smoothedPitch;
        this.smoothedPitch = pitchAlpha * offsetPitch + (1 - pitchAlpha) * this.smoothedPitch;

        // Calculate upward pitch velocity (units / sec)
        this.pitchVelocity = (this.smoothedPitch - this.prevPitch) / dt;

        // Track pitch history buffer for displacement check
        this.pitchHistory.push({ time: now, pitch: this.smoothedPitch });
        while (this.pitchHistory.length > 0 && now - this.pitchHistory[0].time > this.nodWindowMs) {
            this.pitchHistory.shift();
        }

        // If input is locked (during ball flight or banner), halt kick and power processing
        if (this.inputLocked) {
            this.isCharging = false;
            this.power = 0;
            this.chargeDurationMs = 0;
            return;
        }

        // 8. ROLL TO AIM MAPPING (Horizontal)
        const absRoll = Math.abs(this.smoothedRoll);
        const sign = Math.sign(this.smoothedRoll);
        const maxRoll = 22.0;

        if (absRoll <= this.deadZoneDeg) {
            // Inside dead zone: neutral aim, decay power gently
            this.normalizedAim = 0;
            this.isCharging = false;
            this.chargeDurationMs = Math.max(0, this.chargeDurationMs - dt * 2500);
            this.power = Math.max(0, this.power - 0.05);
        } else {
            // Outside dead zone: Aiming & Holding Tilt!
            const effectiveRoll = (absRoll - this.deadZoneDeg) / (maxRoll - this.deadZoneDeg);
            const clamped = Math.max(0, Math.min(1.0, effectiveRoll));

            let curved = Math.pow(clamped, 1.15) * this.sensitivity;
            let aim = Math.max(-1.0, Math.min(1.0, sign * curved));

            // Aim Assist near corners
            if (this.aimAssistFactor > 0 && Math.abs(aim) > 0.65) {
                const cornerTarget = Math.sign(aim) * 0.88;
                aim = aim + (cornerTarget - aim) * this.aimAssistFactor;
            }

            this.normalizedAim = Math.max(-1.0, Math.min(1.0, aim));
            this.lockedShotAim = this.normalizedAim; // Keep tracking the stable aim

            // 9. DURATION-BASED POWER CHARGING
            this.isCharging = true;
            this.chargeDurationMs = Math.min(this.maxChargeDurationMs, this.chargeDurationMs + dt * 1000);
            this.power = Math.min(1.0, this.chargeDurationMs / this.maxChargeDurationMs);

            // 10. UPWARD NOD KICK DETECTION
            if (this.detectKickGesture(now)) {
                this.triggerKick();
            }
        }
    }

    // Explicit helper returning true only for an intentional QUICK UPWARD NOD
    detectKickGesture(now) {
        // Kick Safety Checks
        if (!this.faceDetected) return false;
        if (!this.isCharging) return false;
        if (this.chargeDurationMs < this.minChargeDurationMs) return false;
        if (this.power < 0.18) return false;
        if (this.reacquisitionFrames < this.reacquisitionThreshold) return false;
        if (now - this.lastKickTimestamp < this.kickCooldownMs) return false;

        // Check upward pitch velocity
        const hasUpwardVelocity = this.pitchVelocity > this.nodVelocityThreshold;

        // Check upward displacement in recent window (must have moved UP, not just high velocity twitch)
        let hasUpwardDisplacement = false;
        if (this.pitchHistory.length >= 3) {
            const earliestPitch = this.pitchHistory[0].pitch;
            const currentPitch = this.smoothedPitch;
            const displacement = currentPitch - earliestPitch;
            if (displacement > this.nodDisplacementThreshold) {
                hasUpwardDisplacement = true;
            }
        }

        return hasUpwardVelocity && hasUpwardDisplacement;
    }

    triggerKick() {
        this.kickTriggered = true;
        this.lastKickTimestamp = performance.now();
        this.isCharging = false;
        console.log(`[HeadTracker] UPWARD NOD KICK FIRED! Aim: ${this.lockedShotAim.toFixed(2)}, Power: ${Math.round(this.power * 100)}%`);
    }

    resetKickTrigger() {
        this.kickTriggered = false;
        this.power = 0;
        this.chargeDurationMs = 0;
        this.isCharging = false;
    }

    lockInput(locked) {
        this.inputLocked = locked;
        if (locked) {
            this.resetKickTrigger();
        }
    }

    getDebugStats() {
        return {
            rawRoll: this.rawRollAngle.toFixed(1),
            smoothedRoll: this.smoothedRoll.toFixed(1),
            neutralRoll: this.neutralRoll.toFixed(1),
            rawPitch: this.rawPitch.toFixed(1),
            smoothedPitch: this.smoothedPitch.toFixed(1),
            pitchVel: this.pitchVelocity.toFixed(1),
            aim: this.normalizedAim.toFixed(2),
            power: Math.round(this.power * 100),
            charging: this.isCharging,
            chargeMs: Math.round(this.chargeDurationMs),
            status: this.positionStatus
        };
    }

    // Render AR HUD overlay on PiP
    drawOverlay(ctx, width, height) {
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        if (this.isCalibrating) {
            const elapsed = performance.now() - this.calibrationStartTime;
            const progress = Math.min(1.0, elapsed / this.calibrationDuration);

            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.ellipse(cx, cy, width * 0.26, height * 0.36, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(cx, cy, width * 0.32, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('LOOK STRAIGHT', cx, cy - 8);
            ctx.fillStyle = '#ffd700';
            ctx.font = '11px sans-serif';
            ctx.fillText(`Calibrating ${Math.round(progress * 100)}%`, cx, cy + 16);
            ctx.restore();
            return;
        }

        if (!this.faceDetected) {
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.7)';
            ctx.lineWidth = 2;
            ctx.strokeRect(6, 6, width - 12, height - 12);
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';

            let msg = 'FACE NOT DETECTED';
            if (this.positionStatus === 'MOVE_CLOSER') msg = 'MOVE CLOSER';
            else if (this.positionStatus === 'MOVE_BACK') msg = 'MOVE BACK';
            else if (this.positionStatus === 'CENTER_FACE') msg = 'CENTER YOUR FACE';

            ctx.fillText(msg, cx, cy);
            ctx.restore();
            return;
        }

        // Active AR alignment graphics
        const rollDeg = this.smoothedRoll;
        const absAim = Math.abs(this.normalizedAim);

        // Center neutral tick
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, 12);
        ctx.lineTo(cx, 26);
        ctx.stroke();

        // Top Aim Bar
        const barW = width * 0.7;
        const barY = 19;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - barW / 2, barY);
        ctx.lineTo(cx + barW / 2, barY);
        ctx.stroke();

        const dotX = cx + (this.normalizedAim) * (barW / 2);
        ctx.fillStyle = absAim > 0.05 ? '#00e676' : 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(dotX, barY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Face frame oval
        ctx.strokeStyle = this.isCharging ? 'rgba(0, 230, 118, 0.6)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, width * 0.24, height * 0.32, (rollDeg * Math.PI) / 180, 0, Math.PI * 2);
        ctx.stroke();

        // Upward nod visual hint when charged
        if (this.isCharging && this.power >= 0.25) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('NOD ↑ TO KICK', cx, cy + height * 0.42);
        }

        // Power charge ring
        if (this.power > 0) {
            ctx.strokeStyle = this.power > 0.8 ? '#ff3b30' : (this.power > 0.5 ? '#ffd700' : '#00e676');
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, width * 0.30, -Math.PI / 2, -Math.PI / 2 + this.power * Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}
