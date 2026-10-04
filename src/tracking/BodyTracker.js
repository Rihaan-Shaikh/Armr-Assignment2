// Body Tracker for TILT KICK
// Implements Stand & Play pose tracking:
// Torso Lean / Hip Position → Aim
// Stance Hold → Power
// Leg Kick / Snapback → Kick Trigger

export class BodyTracker {
    constructor() {
        this.normalizedAim = 0;       // -1.0 to +1.0
        this.power = 0;               // 0.0 to 1.0
        this.kickTriggered = false;
        this.isCalibrating = false;
        this.calibrationSamples = [];
        this.calibrationDuration = 2500;
        this.calibrationStartTime = 0;

        this.neutralLeanX = 0;
        this.smoothedAim = 0;
        this.smoothingAlpha = 0.25;
        this.bodyDetected = false;
        this.lastDetectionTime = 0;

        // Kick detection via ankle velocity
        this.lastAnkleY = { left: 0, right: 0 };
        this.kickVelocityThreshold = 0.06; // Normalized height delta
        this.lastKickTimestamp = 0;
        this.kickCooldownMs = 1200;

        this.lastLandmarks = null;
        this.positionStatus = 'NO_BODY';
        this.candidatePositionStatus = 'NO_BODY';
        this.candidateStatusStartTime = 0;
        this.calibrationComplete = false;
        this.calibrationSamplesRequired = 45;
    }

    resetCalibration() {
        this.isCalibrating = false;
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        this.neutralLeanX = 0;
        this.power = 0;
        this.kickTriggered = false;
        this.positionStatus = 'NO_BODY';
    }

    startCalibration() {
        this.isCalibrating = true;
        this.calibrationComplete = false;
        this.calibrationSamples = [];
        this.calibrationStartTime = performance.now();
        this.power = 0;
        this.kickTriggered = false;
    }

    forceCompleteCalibration() {
        if (this.calibrationSamples.length > 0) {
            const sum = this.calibrationSamples.reduce((a, b) => a + b, 0);
            this.neutralLeanX = sum / (this.calibrationSamples.length || 1);
        } else {
            this.neutralLeanX = 0;
        }
        this.isCalibrating = false;
        this.calibrationComplete = true;
        console.log(`[BodyTracker] Calibrated neutral body lean: ${this.neutralLeanX.toFixed(4)}`);
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

    processLandmarks(landmarks) {
        const now = performance.now();
        if (!landmarks || landmarks.length < 29) {
            if (now - this.lastDetectionTime > 400) {
                this.bodyDetected = false;
                this.positionStatus = 'NO_BODY';
                this.power = Math.max(0, this.power - 0.05);
            }
            this.lastLandmarks = null;
            return;
        }

        this.bodyDetected = true;
        this.lastDetectionTime = now;
        this.lastLandmarks = landmarks;

        // Landmarks indices:
        // 11: left_shoulder, 12: right_shoulder
        // 23: left_hip, 24: right_hip
        // 25: left_knee, 26: right_knee
        // 27: left_ankle, 28: right_ankle
        const lShoulder = landmarks[11];
        const rShoulder = landmarks[12];
        const lHip = landmarks[23];
        const rHip = landmarks[24];
        const lAnkle = landmarks[27];
        const rAnkle = landmarks[28];

        if (!lShoulder || !rShoulder || !lHip || !rHip) return;

        // Calculate body torso center & lean
        // Because of horizontal mirroring: right on screen = lower X in normalized image
        const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;
        const hipMidX = (lHip.x + rHip.x) / 2;
        const bodyCenterX = (shoulderMidX + hipMidX) / 2;
        const shoulderSpan = Math.abs(rShoulder.x - lShoulder.x);

        // Body guidance positioning feedback
        let rawStatus = 'BODY_DETECTED';
        if (shoulderSpan > 0.44 || (lHip && lHip.y > 0.90)) {
            rawStatus = 'MOVE_BACK';
        } else if (shoulderSpan < 0.12) {
            rawStatus = 'MOVE_CLOSER';
        } else if (bodyCenterX > 0.65) {
            rawStatus = 'MOVE_RIGHT';
        } else if (bodyCenterX < 0.35) {
            rawStatus = 'MOVE_LEFT';
        } else {
            rawStatus = 'BODY_DETECTED';
        }

        if (rawStatus !== this.candidatePositionStatus) {
            this.candidatePositionStatus = rawStatus;
            this.candidateStatusStartTime = now;
        } else if (now - this.candidateStatusStartTime >= 180) {
            this.positionStatus = rawStatus;
        }

        // Lean delta: difference between shoulders and hips
        const leanX = (shoulderMidX - hipMidX);

        if (this.isCalibrating) {
            if (this.positionStatus === 'BODY_DETECTED') {
                this.calibrationSamples.push(leanX);
            }
            const elapsed = now - this.calibrationStartTime;
            if (this.calibrationSamples.length >= this.calibrationSamplesRequired ||
                (elapsed >= this.calibrationDuration && this.calibrationSamples.length >= 15)) {
                this.forceCompleteCalibration();
            }
            return;
        }

        // Relative lean (inverted for mirrored display so leaning right aims right)
        const currentLean = -(leanX - this.neutralLeanX) * 12.0;

        // Smooth aim
        this.smoothedAim = this.smoothingAlpha * currentLean + (1 - this.smoothingAlpha) * this.smoothedAim;

        // Deadzone
        const deadzone = 0.15;
        if (Math.abs(this.smoothedAim) < deadzone) {
            this.normalizedAim = 0;
            // Snapping back while charged triggers kick
            if (this.power >= 0.3 && now - this.lastKickTimestamp > this.kickCooldownMs) {
                this.triggerKick();
            } else {
                this.power = Math.max(0, this.power - 0.05);
            }
        } else {
            const rawAim = (Math.abs(this.smoothedAim) - deadzone) / (1.0 - deadzone);
            this.normalizedAim = Math.max(-1.0, Math.min(1.0, Math.sign(this.smoothedAim) * rawAim));

            // Charging power
            this.power = Math.min(1.0, this.power + (1 / 60) * 0.85);
        }

        // Leg kick detection (raising foot / ankle upwards)
        if (lAnkle && rAnkle) {
            // Note: in MediaPipe, Y=0 is top, Y=1 is bottom, so moving foot up decreases Y
            if (this.lastAnkleY.left > 0 && this.lastAnkleY.right > 0) {
                const lDeltaY = this.lastAnkleY.left - lAnkle.y;
                const rDeltaY = this.lastAnkleY.right - rAnkle.y;

                if ((lDeltaY > this.kickVelocityThreshold || rDeltaY > this.kickVelocityThreshold) &&
                    this.power >= 0.2 && (now - this.lastKickTimestamp > this.kickCooldownMs)) {
                    this.triggerKick();
                }
            }
            this.lastAnkleY = { left: lAnkle.y, right: rAnkle.y };
        }
    }

    triggerKick() {
        this.kickTriggered = true;
        this.lastKickTimestamp = performance.now();
    }

    resetKickTrigger() {
        this.kickTriggered = false;
        this.power = 0;
    }

    drawOverlay(ctx, width, height) {
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;

        if (this.isCalibrating) {
            const elapsed = performance.now() - this.calibrationStartTime;
            const progress = Math.min(1.0, elapsed / this.calibrationDuration);

            // Calibration box
            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 8]);
            ctx.strokeRect(width * 0.2, height * 0.1, width * 0.6, height * 0.8);
            ctx.setLineDash([]);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('STAND IN FRAME', cx, cy - 10);
            ctx.fillStyle = '#ffd700';
            ctx.font = '12px sans-serif';
            ctx.fillText(`Calibrating ${Math.round(progress * 100)}%`, cx, cy + 16);
            ctx.restore();
            return;
        }

        if (!this.bodyDetected || !this.lastLandmarks) {
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.7)';
            ctx.lineWidth = 2;
            ctx.strokeRect(8, 8, width - 16, height - 16);
            ctx.fillStyle = 'rgba(255, 68, 68, 0.9)';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('STEP BACK (STAND & PLAY)', cx, cy);
            ctx.restore();
            return;
        }

        // Draw neon athletic stick skeleton
        const lm = this.lastLandmarks;
        const connections = [
            [11, 12], // shoulders
            [11, 23], [12, 24], // torso
            [23, 24], // hips
            [11, 13], [13, 15], // left arm
            [12, 14], [14, 16], // right arm
            [23, 25], [25, 27], // left leg
            [24, 26], [26, 28]  // right leg
        ];

        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        connections.forEach(([i, j]) => {
            if (lm[i] && lm[j] && lm[i].visibility > 0.4 && lm[j].visibility > 0.4) {
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

        // Draw joints
        ctx.fillStyle = '#ffd700';
        [11, 12, 23, 24, 25, 26, 27, 28].forEach(idx => {
            if (lm[idx] && lm[idx].visibility > 0.4) {
                const x = (1 - lm[idx].x) * width;
                const y = lm[idx].y * height;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Top Aim Bar
        const barW = width * 0.7;
        const barY = 22;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cx - barW / 2, barY);
        ctx.lineTo(cx + barW / 2, barY);
        ctx.stroke();

        const dotX = cx + (this.normalizedAim) * (barW / 2);
        ctx.fillStyle = Math.abs(this.normalizedAim) > 0.1 ? '#00e676' : '#ffffff';
        ctx.beginPath();
        ctx.arc(dotX, barY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
