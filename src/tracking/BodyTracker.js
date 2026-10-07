// Body Tracker for TILT KICK
// High-Fidelity Stand & Play Pose Engine
// Features: Full-Body Framing Verification, Multi-Sample Stance Calibration,
// Invariant Torso Lean Aiming, Decoupled Leg/Snap Kick Detection with Aim Freeze.

export class BodyTracker {
    constructor() {
        // Output Aim & Shot state
        this.normalizedAim = 0;        // -1.0 (left) to +1.0 (right)
        this.rawAim = 0;
        this.smoothedAim = 0;
        this.smoothingAlpha = 0.28;
        this.deadzone = 0.065;
        this.power = 0;
        this.isCharging = false;
        this.chargeStartTime = 0;

        // Kick triggers & aim freezing
        this.kickTriggered = false;
        this.lockedShotAim = null;
        this.lastKickTimestamp = 0;
        this.kickCooldownMs = 1100;
        this.minShotPower = 0.30;       // Decoupled kick guarantee: minimum 30% power even with 0 charge!

        // Framing & Pose state
        this.bodyDetected = false;
        this.isFramed = false;
        this.isBodyLocked = false;
        this.positionStatus = 'NO_BODY';
        this.lastDetectionTime = 0;
        this.lastLandmarks = null;

        // Ankle velocity tracking for leg kicks
        this.lastAnkleY = { left: 0, right: 0 };
        this.kickVelocityThreshold = 0.055; // Upward delta in normalized screen space

        // Torso snap kick tracking
        this.previousLeanX = 0;
        this.lastLeanVelocity = 0;

        // Multi-Sample Stance Calibration (24 real accepted samples)
        this.isCalibrating = false;
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        this.samplesRequired = 24;
        this.neutralLeanX = 0;
        this.calibrationStartTime = 0;

        // Status stabilization debounce
        this.candidateStatus = 'NO_BODY';
        this.candidateStatusTime = 0;
    }

    resetCalibration() {
        this.isCalibrating = false;
        this.calibrationComplete = false;
        this.isBodyLocked = false;
        this.calibrationSamples = [];
        this.neutralLeanX = 0;
        this.power = 0;
        this.isCharging = false;
        this.kickTriggered = false;
        this.lockedShotAim = null;
        this.positionStatus = 'NO_BODY';
        this.bodyDetected = false;
    }

    startCalibration() {
        this.isCalibrating = true;
        this.calibrationComplete = false;
        this.isBodyLocked = false;
        this.calibrationSamples = [];
        this.calibrationStartTime = performance.now();
        this.power = 0;
        this.kickTriggered = false;
        this.lockedShotAim = null;
        console.log('[BodyTracker] Stance calibration started (requires 24 stable full-body frames).');
    }

    forceCompleteCalibration() {
        if (this.calibrationSamples.length > 0) {
            // Trim outliers (lowest 15% and highest 15%)
            const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
            const trimCount = Math.floor(sorted.length * 0.15);
            const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
            const sum = trimmed.reduce((acc, v) => acc + v, 0);
            this.neutralLeanX = sum / (trimmed.length || 1);
        } else {
            this.neutralLeanX = 0;
        }

        this.isCalibrating = false;
        this.calibrationComplete = true;
        this.isBodyLocked = true;
        console.log(`[BodyTracker] Stance calibration COMPLETE. Neutral lean: ${this.neutralLeanX.toFixed(4)}`);
    }

    getCalibrationProgress() {
        if (this.calibrationComplete && this.isBodyLocked) {
            return {
                percent: 100,
                quality: 5,
                complete: true,
                stage: 'LOCKED',
                stageLabel: 'BODY STANCE LOCKED ✓',
                samples: this.samplesRequired,
                required: this.samplesRequired
            };
        }
        if (!this.isCalibrating) {
            return {
                percent: 0,
                quality: 0,
                complete: false,
                stage: 'IDLE',
                stageLabel: 'READY TO CALIBRATE',
                samples: 0,
                required: this.samplesRequired
            };
        }

        const count = this.calibrationSamples.length;
        const pct = Math.min(99, Math.round((count / this.samplesRequired) * 100));
        const quality = Math.min(5, Math.floor((count / this.samplesRequired) * 5));

        return {
            percent: pct,
            quality,
            complete: false,
            stage: 'CALIBRATING',
            stageLabel: `STANCE CAPTURE: ${count} / ${this.samplesRequired} SAMPLES`,
            samples: count,
            required: this.samplesRequired
        };
    }

    processLandmarks(landmarks) {
        const now = performance.now();

        // 1. Verify landmark integrity
        if (!landmarks || landmarks.length < 29) {
            if (now - this.lastDetectionTime > 450) {
                this.bodyDetected = false;
                this.isFramed = false;
                this.positionStatus = 'NO_BODY';
                this.power = Math.max(0, this.power - 0.05);
                this.isCharging = false;
            }
            this.lastLandmarks = null;
            return;
        }

        // Keypoints:
        // 11: left_shoulder, 12: right_shoulder
        // 23: left_hip, 24: right_hip
        // 25: left_knee, 26: right_knee
        // 27: left_ankle, 28: right_ankle
        const lShoulder = landmarks[11];
        const rShoulder = landmarks[12];
        const lHip = landmarks[23];
        const rHip = landmarks[24];
        const lKnee = landmarks[25];
        const rKnee = landmarks[26];
        const lAnkle = landmarks[27];
        const rAnkle = landmarks[28];

        // Check keypoint visibility
        const upperVisible = (lShoulder?.visibility ?? 0) > 0.45 && (rShoulder?.visibility ?? 0) > 0.45;
        const coreVisible = (lHip?.visibility ?? 0) > 0.40 && (rHip?.visibility ?? 0) > 0.40;
        const lowerVisible = ((lKnee?.visibility ?? 0) > 0.35 || (rKnee?.visibility ?? 0) > 0.35);

        if (!upperVisible || !coreVisible) {
            this.bodyDetected = false;
            this.isFramed = false;
            this.updatePositionStatus('FULL_BODY_REQUIRED', now);
            return;
        }

        this.bodyDetected = true;
        this.lastDetectionTime = now;
        this.lastLandmarks = landmarks;

        // 2. Body Framing Evaluation
        const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
        const hipMidX = (lHip.x + rHip.x) / 2;
        const bodyCenterX = (shoulderMidX + hipMidX) / 2;
        const shoulderSpan = Math.abs(rShoulder.x - lShoulder.x);

        let rawStatus = 'BODY_FRAMED';
        if (shoulderSpan > 0.46 || (lHip && lHip.y > 0.88)) {
            rawStatus = 'MOVE_BACK';
        } else if (shoulderSpan < 0.11) {
            rawStatus = 'MOVE_CLOSER';
        } else if (bodyCenterX > 0.68) {
            rawStatus = 'MOVE_RIGHT';
        } else if (bodyCenterX < 0.32) {
            rawStatus = 'MOVE_LEFT';
        } else if (!lowerVisible && lHip.y > 0.75) {
            rawStatus = 'FULL_BODY_REQUIRED';
        } else {
            rawStatus = 'BODY_FRAMED';
        }

        this.updatePositionStatus(rawStatus, now);
        this.isFramed = (this.positionStatus === 'BODY_FRAMED');

        // Torso lean delta: X displacement between shoulders and hips
        const leanX = (shoulderMidX - hipMidX);

        // 3. Stance Calibration Mode (Captures real stable samples)
        if (this.isCalibrating) {
            if (this.isFramed) {
                // Reject high motion / unstable frames during calibration
                const motionDelta = Math.abs(leanX - this.previousLeanX);
                if (motionDelta < 0.04) {
                    this.calibrationSamples.push(leanX);
                }
            }
            this.previousLeanX = leanX;

            if (this.calibrationSamples.length >= this.samplesRequired) {
                this.forceCompleteCalibration();
            }
            return;
        }

        this.previousLeanX = leanX;

        // 4. Invariant Aim Translation
        // Mirrored coordinate system: lean right aims right (+aim)
        const relLean = -(leanX - this.neutralLeanX) * 11.5;
        this.rawAim = relLean;

        // Temporal smoothing
        this.smoothedAim = this.smoothingAlpha * relLean + (1 - this.smoothingAlpha) * this.smoothedAim;

        // Dead zone & Hysteresis
        if (Math.abs(this.smoothedAim) < this.deadzone) {
            this.normalizedAim = 0;
            if (this.isCharging) {
                this.isCharging = false;
                this.chargeStartTime = 0;
            }
            this.power = Math.max(0, this.power - 0.04);
        } else {
            const mag = (Math.abs(this.smoothedAim) - this.deadzone) / (1.0 - this.deadzone);
            this.normalizedAim = Math.max(-1.0, Math.min(1.0, Math.sign(this.smoothedAim) * Math.min(1.0, mag)));

            // Optional power charge while holding intentional lean
            if (!this.isCharging) {
                this.isCharging = true;
                this.chargeStartTime = now;
            }
            this.power = Math.min(1.0, this.power + (1 / 60) * 0.80);
        }

        // 5. Kick Gesture Detection (Leg lift / Ankle snap OR Body snap)
        // CRITICAL: KICK IS COMPLETELY DECOUPLED FROM POWER!
        // An active stance nod / leg lift triggers a kick even at 0 power!
        if (now - this.lastKickTimestamp > this.kickCooldownMs && !this.kickTriggered) {
            let kickDetected = false;

            // Leg lift detection (ankle vertical velocity)
            if (lAnkle && rAnkle && this.lastAnkleY.left > 0 && this.lastAnkleY.right > 0) {
                const lDeltaY = this.lastAnkleY.left - lAnkle.y; // In screen space, lifting foot decreases Y
                const rDeltaY = this.lastAnkleY.right - rAnkle.y;

                if (lDeltaY > this.kickVelocityThreshold || rDeltaY > this.kickVelocityThreshold) {
                    kickDetected = true;
                }
            }

            if (kickDetected) {
                this.triggerKick();
            }
        }

        if (lAnkle && rAnkle) {
            this.lastAnkleY = { left: lAnkle.y, right: rAnkle.y };
        }
    }

    triggerKick() {
        // Freeze aim at moment of kick so the physical movement doesn't alter trajectory
        this.lockedShotAim = this.normalizedAim;
        // Guarantee minimum playable shot power
        this.power = Math.max(this.minShotPower, this.power);
        this.kickTriggered = true;
        this.lastKickTimestamp = performance.now();
        console.log(`[BodyTracker] KICK TRIGGERED! Aim: ${this.lockedShotAim.toFixed(2)}, Power: ${(this.power * 100).toFixed(0)}%`);
    }

    resetKickTrigger() {
        this.kickTriggered = false;
        this.lockedShotAim = null;
        this.power = 0;
        this.isCharging = false;
    }

    updatePositionStatus(status, now) {
        if (status !== this.candidateStatus) {
            this.candidateStatus = status;
            this.candidateStatusTime = now;
        } else if (now - this.candidateStatusTime >= 150) {
            this.positionStatus = status;
        }
    }

    drawOverlay(ctx, width, height) {
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        if (this.isCalibrating) {
            const count = this.calibrationSamples.length;
            const pct = Math.min(100, Math.round((count / this.samplesRequired) * 100));

            // Calibration athletic guide box
            ctx.strokeStyle = this.isFramed ? '#00e676' : '#ffd700';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 8]);
            ctx.strokeRect(width * 0.18, height * 0.08, width * 0.64, height * 0.84);
            ctx.setLineDash([]);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(this.isFramed ? 'HOLD NATURAL STANCE' : 'STAND IN FULL FRAME', cx, cy - 14);

            ctx.fillStyle = '#00e676';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(`CAPTURING STANCE: ${count} / ${this.samplesRequired} (${pct}%)`, cx, cy + 14);
            ctx.restore();
            return;
        }

        if (!this.bodyDetected || !this.lastLandmarks) {
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.7)';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, 10, width - 20, height - 20);
            ctx.fillStyle = 'rgba(255, 68, 68, 0.95)';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('STEP BACK (STAND & PLAY)', cx, cy);
            ctx.restore();
            return;
        }

        // Draw neon athletic skeleton
        const lm = this.lastLandmarks;
        const connections = [
            [11, 12], // shoulders
            [11, 23], [12, 24], // torso sides
            [23, 24], // hips
            [11, 13], [13, 15], // left arm
            [12, 14], [14, 16], // right arm
            [23, 25], [25, 27], // left leg
            [24, 26], [26, 28]  // right leg
        ];

        ctx.strokeStyle = this.kickTriggered ? '#ffd700' : (this.isBodyLocked ? '#00e676' : '#00b0ff');
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';

        connections.forEach(([i, j]) => {
            if (lm[i] && lm[j] && (lm[i].visibility ?? 0) > 0.4 && (lm[j].visibility ?? 0) > 0.4) {
                // Mirrored coordinates (1 - x)
                const x1 = (1 - lm[i].x) * width;
                const y1 = lm[i].y * height;
                const x2 = (1 - lm[j].x) * width;
                const y2 = lm[j].y * height;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        });

        // Joints
        ctx.fillStyle = '#ffd700';
        [11, 12, 23, 24, 25, 26, 27, 28].forEach(idx => {
            if (lm[idx] && (lm[idx].visibility ?? 0) > 0.4) {
                const x = (1 - lm[idx].x) * width;
                const y = lm[idx].y * height;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Top Aim Bar
        const barW = width * 0.7;
        const barY = 20;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - barW / 2, barY);
        ctx.lineTo(cx + barW / 2, barY);
        ctx.stroke();

        const activeAim = (this.lockedShotAim !== null) ? this.lockedShotAim : this.normalizedAim;
        const dotX = cx + (activeAim) * (barW / 2);
        ctx.fillStyle = this.kickTriggered ? '#ffd700' : (Math.abs(activeAim) > 0.1 ? '#00e676' : '#ffffff');
        ctx.beginPath();
        ctx.arc(dotX, barY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
