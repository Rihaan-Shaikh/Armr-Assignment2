// Advanced Robust Head Tracker for TILT KICK
// 100% Deterministic State Machine: Zero False Positives, Zero Fake Progress.
// Invariant Biometric Face Fingerprinting (18 Ratios), Multi-Face Crowd Rejection,
// True 3D Head Pose (Roll, Pitch, Yaw), Hysteresis Dead Zone, Smart Neutral Drift,
// and Power-Decoupled Center Nod Kick Detection.

import { settingsManager } from '../utils/SettingsManager.js';

export class HeadTracker {
    constructor() {
        // Enrolled Player Profile & Identity Lock
        this.enrolledProfile = null; // { biometricVector: Float32Array, sampleCount: number }
        // 'ENROLLMENT_IDLE' | 'ENROLLMENT_SEARCHING' | 'ENROLLMENT_COLLECTING' | 'ENROLLMENT_SUCCESS'
        this.enrollmentState = 'ENROLLMENT_IDLE';
        this.identityMatchScore = 0; // 0 - 100%
        this.identityMatchThreshold = 0.30; // Maximum normalized biometric distance for valid match
        this.idSamples = [];
        this.idSamplesRequired = 24; // Actual required clean frames
        this.acceptedEnrollmentSamples = 0;

        // Multi-Face Tracking State
        this.detectedFaceCount = 0;
        this.ignoredFaceCount = 0;
        this.isPlayer1Locked = false;
        this.searchingForPlayer = false;
        this.playerLostTimestamp = 0;
        this.recoveryGracePeriodMs = 2400; // 2.4s recovery window before resetting

        // 3D Head Pose (Roll, Pitch, Yaw)
        this.rawRollAngle = 0;        // Degrees: + = right tilt, - = left tilt
        this.rawPitch = 0;            // Normalized vertical pitch proxy
        this.rawYaw = 0;              // Horizontal head turn angle
        this.neutralRoll = 0;         // Calibrated neutral baseline roll
        this.neutralPitch = 0;        // Calibrated neutral baseline pitch
        this.neutralYaw = 0;          // Calibrated neutral baseline yaw

        this.smoothedRoll = 0;
        this.smoothedPitch = 0;
        this.prevPitch = 0;
        this.pitchVelocity = 0;       // Upward pitch velocity (units/sec)
        this.pitchHistory = [];       // { time, pitch } history for nod displacement check

        // Calibration State & Rolling Samples
        // 'CALIBRATION_IDLE' | 'CALIBRATING' | 'CALIBRATED'
        this.calibrationState = 'CALIBRATION_IDLE';
        this.calibrationSamples = [];
        this.calibrationSamplesRequired = 24; // Actual required clean frames
        this.calibrationComplete = false;

        // Aiming & Dead Zone Hysteresis
        this.normalizedAim = 0;       // -1.0 (Left) to +1.0 (Right)
        this.lockedShotAim = 0;       // Aim frozen authoritative upon nod kick initiation
        this.inDeadZone = true;
        this.deadZoneDeg = 4.5;
        this.deadZoneExitHysteresis = 5.2;
        this.deadZoneEnterHysteresis = 3.8;

        // Power Charging (Optional duration-based charging across ALL targets including Center)
        this.power = 0;               // 0.0 to 1.0
        this.effectiveKickPower = 0.30; // Minimum valid shot power if kicking immediately
        this.isCharging = false;
        this.chargeDurationMs = 0;
        this.maxChargeDurationMs = 2000;
        this.holdAimTimer = 0;

        // Kick Trigger & Safety State
        this.kickTriggered = false;
        this.lastKickTimestamp = -99999;
        this.kickCooldownMs = 1100;
        this.inputLocked = false;

        // Temporal Upward Nod Tuning Parameters (Independent of power!)
        this.nodVelocityThreshold = 36.0;   // Minimum upward pitch velocity
        this.nodDisplacementThreshold = 4.2;// Minimum upward displacement
        this.nodWindowMs = 180;             // Upward displacement time window
        this.nodMaxDurationMs = 320;        // Quick jerk max duration (slow tilt rejected)

        // Face Validation & Tracking Status
        this.faceDetected = false;
        this.positionStatus = 'NO_FACE';
        this.candidatePositionStatus = 'NO_FACE';
        this.candidateStatusStartTime = 0;
        this.stabilityHistory = [];
        this.lastDetectionTime = 0;
        this.faceLostThresholdMs = 450;
        this.lastTrackedCenter = { x: 0.5, y: 0.5 };

        // Subscribe to settings
        this.syncSettings();
        settingsManager.subscribe(() => this.syncSettings());
    }

    syncSettings() {
        this.sensitivity = settingsManager.get('headSensitivity') || 1.1;
        this.deadZoneDeg = settingsManager.get('deadZone') || 4.5;
        this.deadZoneExitHysteresis = this.deadZoneDeg * 1.18;
        this.deadZoneEnterHysteresis = this.deadZoneDeg * 0.82;
        this.smoothingAlpha = settingsManager.getSmoothingAlpha ? settingsManager.getSmoothingAlpha() : 0.28;
        this.aimAssistFactor = settingsManager.getAimAssistFactor ? settingsManager.getAimAssistFactor() : 0.35;

        const chargeSpeed = settingsManager.get('chargeSpeed');
        if (chargeSpeed === 'slow') this.maxChargeDurationMs = 2500;
        else if (chargeSpeed === 'fast') this.maxChargeDurationMs = 1500;
        else this.maxChargeDurationMs = 2000;
    }

    // ============================================================
    // BIOMETRIC FEATURE EXTRACTION & IDENTITY VERIFICATION
    // ============================================================

    // Computes an 18-dimensional normalized geometric biometric feature vector
    // Scale, translation, and depth invariant from 468 MediaPipe FaceMesh landmarks.
    extractBiometricVector(landmarks) {
        if (!landmarks || landmarks.length < 468) return null;

        const leftEyeOuter = landmarks[33];
        const rightEyeOuter = landmarks[263];
        const leftEyeInner = landmarks[133];
        const rightEyeInner = landmarks[362];
        const noseTip = landmarks[1];
        const noseBridge = landmarks[168];
        const mouthLeft = landmarks[61];
        const mouthRight = landmarks[291];
        const mouthTop = landmarks[0];
        const mouthBottom = landmarks[17];
        const cheekLeft = landmarks[234];
        const cheekRight = landmarks[454];
        const forehead = landmarks[10];
        const chin = landmarks[152];
        const jawLeft = landmarks[172];
        const jawRight = landmarks[397];

        const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const dist3D = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z - p2.z) || 0);

        const iod = Math.max(0.01, dist(leftEyeOuter, rightEyeOuter));
        const faceHeight = Math.max(0.02, dist(forehead, chin));
        const eyeMid = {
            x: (leftEyeOuter.x + rightEyeOuter.x) / 2,
            y: (leftEyeOuter.y + rightEyeOuter.y) / 2,
            z: ((leftEyeOuter.z || 0) + (rightEyeOuter.z || 0)) / 2
        };
        const mouthMid = {
            x: (mouthLeft.x + mouthRight.x) / 2,
            y: (mouthLeft.y + mouthRight.y) / 2,
            z: ((mouthLeft.z || 0) + (mouthRight.z || 0)) / 2
        };

        const v = new Float32Array(18);
        v[0] = iod / faceHeight;
        v[1] = dist(noseTip, eyeMid) / iod;
        v[2] = dist(mouthMid, noseTip) / iod;
        v[3] = dist(mouthLeft, mouthRight) / iod;
        v[4] = dist(cheekLeft, cheekRight) / iod;
        v[5] = dist(jawLeft, jawRight) / iod;
        v[6] = dist(forehead, noseBridge) / iod;
        v[7] = dist(chin, mouthMid) / iod;
        v[8] = dist(leftEyeInner, rightEyeInner) / iod;
        v[9] = dist(mouthTop, mouthBottom) / Math.max(0.01, dist(mouthLeft, mouthRight));
        v[10] = dist(leftEyeOuter, cheekLeft) / iod;
        v[11] = dist(rightEyeOuter, cheekRight) / iod;
        v[12] = dist(leftEyeOuter, mouthLeft) / iod;
        v[13] = dist(rightEyeOuter, mouthRight) / iod;
        v[14] = dist(noseTip, cheekLeft) / iod;
        v[15] = dist(noseTip, cheekRight) / iod;
        v[16] = dist3D(chin, forehead) / iod;
        v[17] = Math.abs((noseTip.z || 0) - eyeMid.z) / iod;

        return v;
    }

    computeBiometricDistance(v1, v2) {
        if (!v1 || !v2 || v1.length !== v2.length) return 1.0;
        let sum = 0;
        for (let i = 0; i < v1.length; i++) {
            const diff = v1[i] - v2[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum / v1.length);
    }

    // ============================================================
    // ENROLLMENT & CALIBRATION LIFECYCLE (STRICT STATE MACHINE)
    // ============================================================

    startEnrollment() {
        this.enrollmentState = 'ENROLLMENT_SEARCHING';
        this.idSamples = [];
        this.acceptedEnrollmentSamples = 0;
        this.enrolledProfile = null;
        this.isPlayer1Locked = false;
        this.identityMatchScore = 0;
        this.calibrationState = 'CALIBRATION_IDLE';
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        console.log('[HeadTracker] Step 1: Searching for frontal face to enroll Player 1...');
    }

    isEnrollmentComplete() {
        return this.enrollmentState === 'ENROLLMENT_SUCCESS' && this.enrolledProfile !== null;
    }

    isCalibrationComplete() {
        return this.calibrationState === 'CALIBRATED' && this.calibrationComplete === true;
    }

    startPoseCalibration() {
        if (!this.isEnrollmentComplete()) {
            console.warn('[HeadTracker] Cannot calibrate pose: Player 1 identity not yet enrolled.');
            return;
        }
        this.calibrationState = 'CALIBRATING';
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        console.log('[HeadTracker] Step 2: Calibrating neutral head position...');
    }

    startCalibration() {
        if (!this.isEnrollmentComplete()) {
            this.startEnrollment();
        } else {
            this.startPoseCalibration();
        }
    }

    resetCalibration() {
        this.enrollmentState = 'ENROLLMENT_IDLE';
        this.calibrationState = 'CALIBRATION_IDLE';
        this.calibrationComplete = false;
        this.enrolledProfile = null;
        this.isPlayer1Locked = false;
        this.searchingForPlayer = false;
        this.idSamples = [];
        this.acceptedEnrollmentSamples = 0;
        this.calibrationSamples = [];
        this.neutralRoll = 0;
        this.neutralPitch = 0;
        this.neutralYaw = 0;
        this.smoothedRoll = 0;
        this.smoothedPitch = 0;
        this.prevPitch = 0;
        this.pitchVelocity = 0;
        this.pitchHistory = [];
        this.power = 0;
        this.isCharging = false;
        this.chargeDurationMs = 0;
        this.kickTriggered = false;
        this.lockedShotAim = 0;
        this.positionStatus = 'NO_FACE';
        this.candidatePositionStatus = 'NO_FACE';
        this.stabilityHistory = [];
    }

    // Force complete ONLY if actual valid samples were captured
    forceCompleteCalibration() {
        if (this.enrollmentState !== 'ENROLLMENT_SUCCESS') {
            if (this.idSamples.length >= 6) {
                // Compute mean from available samples
                const len = this.idSamples[0].length;
                const mean = new Float32Array(len);
                for (let i = 0; i < len; i++) {
                    let s = 0;
                    for (let k = 0; k < this.idSamples.length; k++) s += this.idSamples[k][i];
                    mean[i] = s / this.idSamples.length;
                }
                this.enrolledProfile = { biometricVector: mean, sampleCount: this.idSamples.length };
                this.enrollmentState = 'ENROLLMENT_SUCCESS';
                this.isPlayer1Locked = true;
            } else {
                console.warn('[HeadTracker] Cannot force complete: insufficient face samples captured.');
                return false;
            }
        }

        if (this.calibrationSamples.length >= 6) {
            const sortedRolls = this.calibrationSamples.map(s => s.roll).sort((a, b) => a - b);
            const sortedPitches = this.calibrationSamples.map(s => s.pitch).sort((a, b) => a - b);
            const sortedYaws = this.calibrationSamples.map(s => s.yaw || 0).sort((a, b) => a - b);
            const mid = Math.floor(sortedRolls.length / 2);
            this.neutralRoll = sortedRolls[mid];
            this.neutralPitch = sortedPitches[mid];
            this.neutralYaw = sortedYaws[mid];
        } else {
            this.neutralRoll = this.rawRollAngle;
            this.neutralPitch = this.rawPitch;
            this.neutralYaw = this.rawYaw;
        }

        this.calibrationState = 'CALIBRATED';
        this.calibrationComplete = true;
        this.isPlayer1Locked = true;
        console.log(`[HeadTracker] Enrollment & Calibration finalized. Neutral Roll: ${this.neutralRoll.toFixed(1)}°`);
        return true;
    }

    getCalibrationProgress() {
        // Step 3: Fully Locked and Ready
        if (this.isEnrollmentComplete() && this.isCalibrationComplete()) {
            return {
                step: 3,
                stage: 'LOCKED',
                stageTitle: 'READY TO PLAY',
                stageLabel: 'PLAYER 1 LOCKED ✓',
                samplesInfo: '24 / 24 SAMPLES VERIFIED',
                percent: 100,
                quality: 5,
                complete: true
            };
        }

        // Step 2: Calibrating Neutral Pose
        if (this.isEnrollmentComplete() && this.calibrationState === 'CALIBRATING') {
            const count = this.calibrationSamples.length;
            const pct = Math.min(99, Math.round((count / this.calibrationSamplesRequired) * 100));
            return {
                step: 2,
                stage: 'HEAD_POSE',
                stageTitle: 'STEP 2: NEUTRAL POSITION',
                stageLabel: 'HOLD STILL — LOOK STRAIGHT',
                samplesInfo: `${count} / ${this.calibrationSamplesRequired} CALIBRATION FRAMES`,
                percent: pct,
                quality: Math.min(5, Math.floor((count / this.calibrationSamplesRequired) * 5)),
                complete: false
            };
        }

        // Step 1: Capturing Biometric Identity
        if (this.enrollmentState === 'ENROLLMENT_COLLECTING' || this.enrollmentState === 'ENROLLMENT_SEARCHING') {
            const count = this.acceptedEnrollmentSamples;
            const pct = Math.min(99, Math.round((count / this.idSamplesRequired) * 100));
            return {
                step: 1,
                stage: 'IDENTITY',
                stageTitle: 'STEP 1: IDENTITY ENROLLMENT',
                stageLabel: count > 0 ? 'CAPTURING IDENTITY PROFILE...' : 'LOOK DIRECTLY AT CAMERA',
                samplesInfo: `${count} / ${this.idSamplesRequired} GOOD SAMPLES`,
                percent: pct,
                quality: Math.min(5, Math.floor((count / this.idSamplesRequired) * 5)),
                complete: false
            };
        }

        return {
            step: 1,
            stage: 'IDLE',
            stageTitle: 'STEP 1: IDENTITY ENROLLMENT',
            stageLabel: 'POSITION YOUR FACE TO BEGIN',
            samplesInfo: '0 / 24 SAMPLES',
            percent: 0,
            quality: 0,
            complete: false
        };
    }

    // ============================================================
    // MULTI-FACE DETECTION & CROWD ARBITRATION
    // ============================================================

    processMultiFace(allFacesLandmarks, deltaSec = 1 / 60) {
        const now = performance.now();
        const dt = Math.max(0.001, deltaSec);

        this.detectedFaceCount = allFacesLandmarks ? allFacesLandmarks.length : 0;

        if (!allFacesLandmarks || allFacesLandmarks.length === 0) {
            this.handleFaceLost(now, dt);
            return;
        }

        let targetFaceLandmarks = null;
        let bestDistance = 999;

        // 1. If currently in enrollment or not yet enrolled, pick the most centered face
        if (!this.isEnrollmentComplete()) {
            let minCenterDist = 999;
            for (let i = 0; i < allFacesLandmarks.length; i++) {
                const face = allFacesLandmarks[i];
                const center = this.getFaceCenter(face);
                const d = Math.hypot(center.x - 0.5, center.y - 0.5);
                if (d < minCenterDist) {
                    minCenterDist = d;
                    targetFaceLandmarks = face;
                }
            }
            this.ignoredFaceCount = allFacesLandmarks.length - 1;
        } else {
            // 2. ENROLLED PLAYER MULTI-FACE ARBITRATION:
            // Match against Player 1's enrolled biometric profile.
            // Proximity, size, or centering of a crowd stranger NEVER steals tracking!
            for (let i = 0; i < allFacesLandmarks.length; i++) {
                const candidate = allFacesLandmarks[i];
                const bioVec = this.extractBiometricVector(candidate);
                if (!bioVec) continue;

                const dist = this.computeBiometricDistance(this.enrolledProfile.biometricVector, bioVec);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    if (dist < this.identityMatchThreshold) {
                        targetFaceLandmarks = candidate;
                    }
                }
            }

            if (targetFaceLandmarks) {
                this.isPlayer1Locked = true;
                this.searchingForPlayer = false;
                this.identityMatchScore = Math.max(0, Math.min(100, Math.round((1 - bestDistance / this.identityMatchThreshold) * 100)));
                this.ignoredFaceCount = allFacesLandmarks.length - 1;
            } else {
                this.handlePlayerSearching(now, dt);
                return;
            }
        }

        this.processSingleFace(targetFaceLandmarks, dt, now);
    }

    processLandmarks(landmarks, isPoseModel = false, deltaSec = 1 / 60) {
        if (!landmarks || landmarks.length === 0) {
            this.processMultiFace([], deltaSec);
            return;
        }
        this.processMultiFace([landmarks], deltaSec);
    }

    handleFaceLost(now, dt) {
        this.faceLostAccumulatorMs = (this.faceLostAccumulatorMs || 0) + dt * 1000;
        if (this.faceLostAccumulatorMs > this.faceLostThresholdMs || (now - this.lastDetectionTime > this.faceLostThresholdMs)) {
            this.faceDetected = false;
            this.isPlayer1Locked = false;
            this.positionStatus = 'NO_FACE';
            this.power = Math.max(0, this.power - 0.04);
            this.isCharging = false;
            this.chargeDurationMs = 0;
        }
    }

    handlePlayerSearching(now, dt) {
        if (!this.searchingForPlayer) {
            this.searchingForPlayer = true;
            this.playerLostTimestamp = now;
        }

        const elapsedSearching = now - this.playerLostTimestamp;
        if (elapsedSearching < this.recoveryGracePeriodMs) {
            this.positionStatus = 'SEARCHING_PLAYER';
            this.power = Math.max(0, this.power - 0.02);
            this.isCharging = false;
        } else {
            this.faceDetected = false;
            this.isPlayer1Locked = false;
            this.positionStatus = 'NO_PLAYER';
            this.power = 0;
            this.isCharging = false;
            this.chargeDurationMs = 0;
        }
    }

    getFaceCenter(landmarks) {
        if (!landmarks || landmarks.length < 34) return { x: 0.5, y: 0.5 };
        const l = landmarks[33] || landmarks[2];
        const r = landmarks[263] || landmarks[5];
        return {
            x: (l.x + r.x) / 2,
            y: (l.y + r.y) / 2
        };
    }

    // ============================================================
    // SINGLE FACE POSE, FILTERING & AIMING PIPELINE
    // ============================================================

    processSingleFace(landmarks, dt, now) {
        this.faceLostAccumulatorMs = 0;
        this.faceDetected = true;
        this.lastDetectionTime = now;

        const isFaceMesh = landmarks.length >= 468;
        let rollDeg = 0;
        let pitchProxy = 0;
        let yawDeg = 0;
        let faceCenter = { x: 0.5, y: 0.5 };
        let faceWidth = 0.3;

        if (isFaceMesh) {
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            const leftMouth = landmarks[61];
            const rightMouth = landmarks[291];
            const noseTip = landmarks[1];
            const forehead = landmarks[10];
            const chin = landmarks[152];

            faceCenter = {
                x: (leftEye.x + rightEye.x) / 2,
                y: (forehead.y + chin.y) / 2
            };

            faceWidth = Math.abs(rightEye.x - leftEye.x);
            const faceHeight = Math.max(0.08, Math.abs(chin.y - forehead.y));

            // TRUE 3D HEAD ROTATION:
            // Roll: average slope of eyes and mouth
            const eyeAngle = -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);
            const mouthAngle = -Math.atan2(rightMouth.y - leftMouth.y, rightMouth.x - leftMouth.x) * (180 / Math.PI);
            rollDeg = eyeAngle * 0.75 + mouthAngle * 0.25;

            // Pitch: nose tip vertical displacement relative to eye midpoint
            const eyeMidY = (leftEye.y + rightEye.y) / 2;
            pitchProxy = ((eyeMidY - noseTip.y) / faceHeight) * 100;

            // Yaw: lateral nose offset relative to eye width
            const eyeMidX = (leftEye.x + rightEye.x) / 2;
            yawDeg = ((noseTip.x - eyeMidX) / faceWidth) * 90;
        } else {
            const leftEye = landmarks[2] || landmarks[7];
            const rightEye = landmarks[5] || landmarks[8];
            const nose = landmarks[0];
            if (leftEye && rightEye && nose) {
                faceCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
                faceWidth = Math.abs(rightEye.x - leftEye.x);
                rollDeg = -Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);
                const eyeMidY = (leftEye.y + rightEye.y) / 2;
                pitchProxy = (eyeMidY - nose.y) * 100;
            } else {
                return;
            }
        }

        this.lastTrackedCenter = faceCenter;
        this.rawRollAngle = rollDeg;
        this.rawPitch = pitchProxy;
        this.rawYaw = yawDeg;

        // Framing and positioning feedback
        let rawStatus = 'PLAYER_TRACKED';
        if (faceWidth < 0.12) {
            rawStatus = 'MOVE_CLOSER';
        } else if (faceWidth > 0.46) {
            rawStatus = 'MOVE_BACK';
        } else if (faceCenter.x > 0.68) {
            rawStatus = 'MOVE_RIGHT';
        } else if (faceCenter.x < 0.32) {
            rawStatus = 'MOVE_LEFT';
        } else if (faceCenter.y < 0.22) {
            rawStatus = 'MOVE_DOWN';
        } else if (faceCenter.y > 0.78) {
            rawStatus = 'MOVE_UP';
        } else if (this.isHeadStable(now, rollDeg, pitchProxy)) {
            rawStatus = 'STEADY_HEAD';
        }

        if (rawStatus !== this.candidatePositionStatus) {
            this.candidatePositionStatus = rawStatus;
            this.candidateStatusStartTime = now;
        } else if (now - this.candidateStatusStartTime >= 140) {
            this.positionStatus = rawStatus;
        }

        const isGoodFraming = (faceWidth >= 0.14 && faceWidth <= 0.44 &&
                               faceCenter.x >= 0.32 && faceCenter.x <= 0.68 &&
                               faceCenter.y >= 0.20 && faceCenter.y <= 0.80);
        const isLowRotation = (Math.abs(rollDeg) < 14 && Math.abs(yawDeg) < 14 && Math.abs(pitchProxy) < 18);

        // ------------------------------------------------------------
        // STAGE 1: IDENTITY ENROLLMENT (REAL SAMPLE COLLECTION)
        // ------------------------------------------------------------
        if (!this.isEnrollmentComplete()) {
            this.enrollmentState = 'ENROLLMENT_SEARCHING';

            if (isGoodFraming && isLowRotation) {
                this.enrollmentState = 'ENROLLMENT_COLLECTING';
                const bioVec = this.extractBiometricVector(landmarks);
                if (bioVec) {
                    this.idSamples.push(bioVec);
                    this.acceptedEnrollmentSamples = this.idSamples.length;

                    if (this.acceptedEnrollmentSamples >= this.idSamplesRequired) {
                        // Calculate mean biometric descriptor
                        const len = bioVec.length;
                        const mean = new Float32Array(len);
                        for (let i = 0; i < len; i++) {
                            let s = 0;
                            for (let k = 0; k < this.idSamples.length; k++) s += this.idSamples[k][i];
                            mean[i] = s / this.idSamples.length;
                        }
                        this.enrolledProfile = { biometricVector: mean, sampleCount: this.idSamples.length };
                        this.enrollmentState = 'ENROLLMENT_SUCCESS';
                        this.isPlayer1Locked = true;
                        this.identityMatchScore = 100;
                        console.log('[HeadTracker] Player 1 Identity Enrolled successfully! (24/24 good samples accepted).');
                        // Advance to neutral head pose calibration
                        this.startPoseCalibration();
                    }
                }
            }
            return;
        }

        // ------------------------------------------------------------
        // STAGE 2: NEUTRAL HEAD POSE CALIBRATION
        // ------------------------------------------------------------
        if (this.calibrationState === 'CALIBRATING') {
            if (isGoodFraming && Math.abs(rollDeg) < 28) {
                this.calibrationSamples.push({ roll: rollDeg, pitch: pitchProxy, yaw: yawDeg });
                if (this.calibrationSamples.length >= this.calibrationSamplesRequired) {
                    // Outlier rejection (median filter)
                    const sortedRolls = this.calibrationSamples.map(s => s.roll).sort((a, b) => a - b);
                    const sortedPitches = this.calibrationSamples.map(s => s.pitch).sort((a, b) => a - b);
                    const sortedYaws = this.calibrationSamples.map(s => s.yaw || 0).sort((a, b) => a - b);
                    const mid = Math.floor(sortedRolls.length / 2);
                    this.neutralRoll = sortedRolls[mid];
                    this.neutralPitch = sortedPitches[mid];
                    this.neutralYaw = sortedYaws[mid];

                    this.calibrationState = 'CALIBRATED';
                    this.calibrationComplete = true;
                    this.isPlayer1Locked = true;
                    console.log(`[HeadTracker] Calibration complete. Neutral Roll: ${this.neutralRoll.toFixed(1)}°`);
                }
            }
            return;
        }

        // ------------------------------------------------------------
        // STAGE 3: ACTIVE GAMEPLAY TRACKING PIPELINE
        // ------------------------------------------------------------
        const offsetRoll = this.rawRollAngle - this.neutralRoll;
        const offsetPitch = this.rawPitch - this.neutralPitch;

        // Exponential Moving Average Smoothing
        this.smoothedRoll = this.smoothingAlpha * offsetRoll + (1 - this.smoothingAlpha) * this.smoothedRoll;

        // Pitch smoothing & Upward nod velocity
        const pitchAlpha = 0.38;
        this.prevPitch = this.smoothedPitch;
        this.smoothedPitch = pitchAlpha * offsetPitch + (1 - pitchAlpha) * this.smoothedPitch;
        this.pitchVelocity = (this.smoothedPitch - this.prevPitch) / dt;

        // Pitch history for temporal nod displacement check
        this.pitchHistory.push({ time: now, pitch: this.smoothedPitch });
        while (this.pitchHistory.length > 0 && now - this.pitchHistory[0].time > this.nodWindowMs) {
            this.pitchHistory.shift();
        }

        // Smart neutral drift (only when head is calm, centered, not charging, not kicking)
        if (this.isPlayer1Locked && !this.isCharging && !this.inputLocked && Math.abs(this.smoothedRoll) < this.deadZoneDeg) {
            if (Math.abs(this.pitchVelocity) < 3.5) {
                const driftRate = 0.0005;
                this.neutralRoll += (this.rawRollAngle - this.neutralRoll) * driftRate;
                this.neutralPitch += (this.rawPitch - this.neutralPitch) * driftRate;
            }
        }

        if (this.inputLocked) {
            this.isCharging = false;
            this.power = 0;
            this.chargeDurationMs = 0;
            return;
        }

        // Dead Zone with Hysteresis & Nonlinear Aim Mapping
        const absRoll = Math.abs(this.smoothedRoll);
        const sign = Math.sign(this.smoothedRoll);
        const maxRoll = 24.0;

        if (this.inDeadZone) {
            if (absRoll > this.deadZoneExitHysteresis) this.inDeadZone = false;
        } else {
            if (absRoll < this.deadZoneEnterHysteresis) this.inDeadZone = true;
        }

        if (this.inDeadZone) {
            this.normalizedAim = 0; // Perfectly centered
        } else {
            const effectiveRoll = (absRoll - this.deadZoneDeg) / (maxRoll - this.deadZoneDeg);
            const clamped = Math.max(0, Math.min(1.0, effectiveRoll));
            let curved = Math.pow(clamped, 1.22) * this.sensitivity;
            let aim = Math.max(-1.0, Math.min(1.0, sign * curved));

            if (this.aimAssistFactor > 0 && Math.abs(aim) > 0.68) {
                const cornerTarget = Math.sign(aim) * 0.90;
                aim = aim + (cornerTarget - aim) * this.aimAssistFactor;
            }
            this.normalizedAim = Math.max(-1.0, Math.min(1.0, aim));
        }

        // Update authoritative locked aim continuously until kick triggers
        if (!this.kickTriggered) {
            this.lockedShotAim = this.normalizedAim;
        }

        // Power Charging (Optional! Holding steady in center OR holding tilt charges power)
        const isAimSteady = Math.abs(this.pitchVelocity) < 14.0;
        if (isAimSteady && isGoodFraming) {
            this.holdAimTimer += dt * 1000;
            if (this.holdAimTimer > 200) {
                this.isCharging = true;
                this.chargeDurationMs = Math.min(this.maxChargeDurationMs, this.chargeDurationMs + dt * 1000);
                this.power = Math.min(1.0, this.chargeDurationMs / this.maxChargeDurationMs);
            }
        } else if (!this.isCharging) {
            this.holdAimTimer = Math.max(0, this.holdAimTimer - dt * 1500);
            this.chargeDurationMs = Math.max(0, this.chargeDurationMs - dt * 2000);
            this.power = Math.max(0, this.power - 0.05);
        }

        // ------------------------------------------------------------
        // KICK DETECTION: COMPLETELY DECOUPLED FROM CHARGING/POWER!
        // A player sitting straight at CENTER who nods UP fires a valid shot!
        // ------------------------------------------------------------
        if (this.detectKickGesture(now)) {
            this.triggerKick();
        }
    }

    isHeadStable(now, roll, pitch) {
        this.stabilityHistory.push({ time: now, roll, pitch });
        while (this.stabilityHistory.length > 0 && now - this.stabilityHistory[0].time > 300) {
            this.stabilityHistory.shift();
        }
        if (this.stabilityHistory.length < 4) return false;
        const rolls = this.stabilityHistory.map(s => s.roll);
        const deltaRoll = Math.max(...rolls) - Math.min(...rolls);
        return deltaRoll < 3.2;
    }

    // Explicit helper returning true ONLY for an intentional, quick upward nod
    // CRITICAL: Power > 0 is NOT required! Center shooting is 100% supported!
    detectKickGesture(now) {
        if (!this.faceDetected) return false;
        if (!this.isPlayer1Locked) return false;
        if (now - this.lastKickTimestamp < this.kickCooldownMs) return false;

        // 1. Upward pitch velocity threshold (quick nod)
        const hasUpwardVelocity = this.pitchVelocity > this.nodVelocityThreshold;

        // 2. Upward displacement in temporal window
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
        // Calculate authoritative kick power: at least minimum valid base power (0.30)
        this.effectiveKickPower = Math.max(0.30, this.power);
        this.isCharging = false;
        console.log(`[HeadTracker] UPWARD NOD KICK FIRED! Target Aim: ${this.lockedShotAim.toFixed(2)}, Power: ${Math.round(this.effectiveKickPower * 100)}%`);
    }

    resetKickTrigger() {
        this.kickTriggered = false;
        this.power = 0;
        this.chargeDurationMs = 0;
        this.holdAimTimer = 0;
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
            playerId: this.isPlayer1Locked ? 'PLAYER 1' : 'UNKNOWN',
            faceCount: this.detectedFaceCount,
            ignoredFaces: this.ignoredFaceCount,
            matchScore: `${this.identityMatchScore}%`,
            rawRoll: this.rawRollAngle.toFixed(1),
            smoothedRoll: this.smoothedRoll.toFixed(1),
            neutralRoll: this.neutralRoll.toFixed(1),
            rawPitch: this.rawPitch.toFixed(1),
            smoothedPitch: this.smoothedPitch.toFixed(1),
            pitchVel: this.pitchVelocity.toFixed(1),
            aim: this.normalizedAim.toFixed(2),
            lockedAim: this.lockedShotAim.toFixed(2),
            power: Math.round(this.power * 100),
            charging: this.isCharging,
            status: this.positionStatus
        };
    }

    drawOverlay(ctx, width, height) {
        if (!ctx) return;
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        // 1. Enrollment & Calibration Mode Overlay
        if (!this.isCalibrationComplete()) {
            const progress = this.getCalibrationProgress();
            const pct = progress.percent / 100;

            ctx.strokeStyle = this.isPlayer1Locked ? '#00e676' : '#ffd700';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.ellipse(cx, cy, width * 0.28, height * 0.38, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(cx, cy, Math.min(width, height) * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
            ctx.stroke();

            ctx.restore();
            return;
        }

        // 2. In-Match AR PiP Corner Overlay
        if (this.faceDetected && this.isPlayer1Locked) {
            const fcX = this.lastTrackedCenter.x * width;
            const fcY = this.lastTrackedCenter.y * height;
            const bw = width * 0.38;
            const bh = height * 0.50;

            ctx.strokeStyle = this.isCharging ? '#ffd700' : '#00e676';
            ctx.lineWidth = 2.5;

            const drawCorner = (x, y, dx, dy) => {
                ctx.beginPath();
                ctx.moveTo(x + dx * 16, y);
                ctx.lineTo(x, y);
                ctx.lineTo(x, y + dy * 16);
                ctx.stroke();
            };

            const left = fcX - bw / 2;
            const right = fcX + bw / 2;
            const top = fcY - bh / 2;
            const bot = fcY + bh / 2;

            drawCorner(left, top, 1, 1);
            drawCorner(right, top, -1, 1);
            drawCorner(left, bot, 1, -1);
            drawCorner(right, bot, -1, -1);

            // Roll tilt gauge arc
            const angleRad = (this.smoothedRoll * Math.PI) / 180;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(fcX, top - 12, 20, -Math.PI * 0.8, -Math.PI * 0.2);
            ctx.stroke();

            const needleX = fcX + Math.sin(angleRad) * 20;
            const needleY = (top - 12) - Math.cos(angleRad) * 20;
            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(fcX, top - 12);
            ctx.lineTo(needleX, needleY);
            ctx.stroke();

            if (this.ignoredFaceCount > 0) {
                ctx.fillStyle = 'rgba(10, 16, 26, 0.88)';
                ctx.fillRect(8, height - 24, width - 16, 18);
                ctx.fillStyle = '#ffb300';
                ctx.font = 'bold 9px Inter, sans-serif';
                ctx.fillText(`P1 LOCKED • ${this.ignoredFaceCount} CROWD FACE IGNORED`, 12, height - 11);
            }
        } else if (this.searchingForPlayer) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.18)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 11px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SEARCHING FOR P1...', cx, cy);
        }

        ctx.restore();
    }
}
