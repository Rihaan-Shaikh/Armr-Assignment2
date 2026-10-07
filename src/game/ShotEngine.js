// Enhanced Shot Engine for TILT KICK
// Continuous 3D target coordinates, 7 distinct target zones,
// shot quality grading, woodwork collision, and a skill-rewarding Goalkeeper probability model.

import { settingsManager } from '../utils/SettingsManager.js';

export class ShotEngine {
    constructor() {
        // FIFA Standard Goal Dimensions (Scaled meters)
        this.goalWidth = 7.32;
        this.goalHeight = 2.44;
        this.halfWidth = this.goalWidth / 2; // 3.66m

        this.postRadius = 0.08;
        this.postThreshold = 0.16;
    }

    // Maps player's normalized aim (-1.0 to +1.0) and power (0.0 to 1.0) to continuous 3D world coordinates
    calculateTarget(aim, rawPower) {
        const powerMultiplier = settingsManager.get('shotPower') || 1.0;
        const effectivePower = Math.min(1.0, rawPower * powerMultiplier);

        // Horizontal target range: -3.85m to +3.85m (posts are at ±3.66m)
        const targetX = aim * 3.70;

        // Vertical target range:
        // Low driven: ~0.35m
        // Mid-height: ~1.25m
        // Top shelf upper 90: ~2.18m - 2.38m
        const baseHeight = 0.32 + Math.pow(effectivePower, 0.94) * 1.96;
        const targetY = Math.max(0.20, Math.min(2.50, baseHeight + (Math.random() - 0.5) * 0.06));

        return { x: targetX, y: targetY, effectivePower };
    }

    // Classifies shot into one of 7 distinct target zones
    getTargetZone(x, y) {
        const absX = Math.abs(x);
        const isLeft = x < -0.85;
        const isRight = x > 0.85;

        if (y > 1.68) {
            if (isLeft) return 'TOP_LEFT_90';
            if (isRight) return 'TOP_RIGHT_90';
            return 'TOP_CENTER';
        } else if (y < 0.85) {
            if (isLeft) return 'BOTTOM_LEFT';
            if (isRight) return 'BOTTOM_RIGHT';
            return 'BOTTOM_CENTER';
        } else {
            if (isLeft) return 'MID_LEFT';
            if (isRight) return 'MID_RIGHT';
            return 'CENTER';
        }
    }

    // Determine shot release quality: "PERFECT", "GREAT", "GOOD", "WEAK"
    getShotQuality(targetX, targetY, power) {
        const absX = Math.abs(targetX);
        const isCorner = absX > 2.2 && (targetY > 1.55 || targetY < 0.90);

        if (isCorner && power > 0.78) {
            return { label: 'PERFECT FINISH!', grade: 'PERFECT' };
        } else if (absX > 1.6 && power > 0.62) {
            return { label: 'GREAT STRIKE!', grade: 'GREAT' };
        } else if (power > 0.38) {
            return { label: 'GOOD EFFORT', grade: 'GOOD' };
        } else {
            return { label: 'WEAK SHOT', grade: 'WEAK' };
        }
    }

    // Evaluates shot outcome against the Goalkeeper using a FAIR model
    evaluateShot(targetX, targetY, effectivePower) {
        const absX = Math.abs(targetX);
        const y = targetY;
        const zone = this.getTargetZone(targetX, targetY);
        const quality = this.getShotQuality(targetX, targetY, effectivePower);
        const difficulty = settingsManager.get('keeperDifficulty') || 'medium';

        // 1. Post & Crossbar Rebound Detection
        const isPost = Math.abs(absX - this.halfWidth) <= this.postThreshold && y <= this.goalHeight + 0.05;
        const isCrossbar = Math.abs(y - this.goalHeight) <= 0.10 && absX <= this.halfWidth + 0.05;

        if (isCrossbar) {
            return {
                result: 'MISS',
                subType: 'CROSSBAR',
                title: 'OFF THE CROSSBAR!',
                subtitle: 'SO CLOSE!',
                points: 0,
                willSave: false,
                reactionDelay: 0.15,
                quality: quality.label,
                zone,
                targetX,
                targetY: this.goalHeight
            };
        }

        if (isPost) {
            return {
                result: 'MISS',
                subType: 'POST',
                title: 'OFF THE POST!',
                subtitle: 'DENIED BY THE WOODWORK!',
                points: 0,
                willSave: false,
                reactionDelay: 0.15,
                quality: quality.label,
                zone,
                targetX: Math.sign(targetX) * this.halfWidth,
                targetY
            };
        }

        // 2. Off-Target Miss Check
        if (absX > this.halfWidth + this.postThreshold || y > this.goalHeight + 0.10) {
            return {
                result: 'MISS',
                subType: 'WIDE',
                title: 'OFF TARGET!',
                subtitle: 'FIRED WIDE!',
                points: 0,
                willSave: false,
                reactionDelay: 0.20,
                quality: quality.label,
                zone,
                targetX,
                targetY
            };
        }

        // 3. FAIR Goalkeeper Save Model
        let reactionDelay = 0.15; // default medium
        let difficultySaveModifier = 0.0;

        if (difficulty === 'easy') {
            reactionDelay = 0.24;
            difficultySaveModifier = -0.22;
        } else if (difficulty === 'hard') {
            reactionDelay = 0.09;
            difficultySaveModifier = 0.12;
        }

        // Base save chance calculation:
        // Placement bonus: how close to the corner?
        const distFromCenter = Math.hypot(absX, y - 1.22) / 3.8;
        const placementBonus = distFromCenter * 0.75; // Up to -75% save chance for corner shots

        // Power bonus: high power significantly reduces keeper's chance to reach
        const powerBonus = effectivePower * 0.40;

        let baseSaveChance = 0.65;
        if (absX < 1.1) {
            baseSaveChance = 0.78; // Down the middle is easiest for keeper
        } else if (zone === 'TOP_LEFT_90' || zone === 'TOP_RIGHT_90') {
            baseSaveChance = 0.38; // Upper 90 corner
        } else if (zone === 'BOTTOM_LEFT' || zone === 'BOTTOM_RIGHT') {
            baseSaveChance = 0.44; // Low corners
        }

        let saveProb = baseSaveChance - placementBonus - powerBonus + difficultySaveModifier;
        saveProb = Math.max(0.06, Math.min(0.85, saveProb));

        // Upper 90 corner power shot guarantee (>78% power):
        // Highly rewarding to skillful players (88%+ goal success)
        if ((zone === 'TOP_LEFT_90' || zone === 'TOP_RIGHT_90') && effectivePower > 0.76) {
            saveProb = Math.min(0.10, saveProb);
        }

        // If keeper is turned off in Practice mode
        const keeperEnabled = settingsManager.get('practiceKeeper') !== false;
        if (!keeperEnabled) {
            saveProb = 0;
        }

        const willSave = Math.random() < saveProb;

        if (willSave) {
            return {
                result: 'SAVED',
                subType: 'KEEPER_SAVE',
                title: 'SAVED!',
                subtitle: 'BRILLIANT STOP BY THE KEEPER!',
                points: 0,
                willSave: true,
                reactionDelay,
                quality: quality.label,
                zone,
                targetX,
                targetY
            };
        }

        // GOAL SCORED!
        let points = 100;
        let title = 'GOAL!';
        let subtitle = 'CLINICAL PENALTY!';
        let resultType = 'GOAL';

        if (zone === 'TOP_LEFT_90' || zone === 'TOP_RIGHT_90') {
            points = 150;
            title = 'PERFECT!';
            subtitle = 'UPPER V — UNSTOPPABLE!';
            resultType = 'PERFECT';
        } else if (zone === 'BOTTOM_LEFT' || zone === 'BOTTOM_RIGHT') {
            points = 120;
            title = 'GOAL!';
            subtitle = 'DRILLED INTO THE BOTTOM CORNER!';
        } else if (quality.grade === 'GREAT') {
            points = 110;
            title = 'GOAL!';
            subtitle = 'POWERFUL FINISH!';
        }

        return {
            result: resultType,
            subType: zone,
            title,
            subtitle,
            points,
            willSave: false,
            reactionDelay,
            quality: quality.label,
            zone,
            targetX,
            targetY
        };
    }
}
