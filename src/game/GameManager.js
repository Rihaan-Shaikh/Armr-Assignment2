// Master Game Manager for TILT KICK
// Implements full state machine for Solo, Practice, and 2-Player Pass-and-Play modes,
// pause system with timer freezing, authoritative locked-aim shot execution, and goalkeeper reaction sequencing.

import { soundEngine } from '../audio/SoundEngine.js';
import { ShotEngine } from './ShotEngine.js';
import { settingsManager } from '../utils/SettingsManager.js';

export class GameManager {
    constructor(stadiumScene, ball, goalkeeper, inputManager, uiManager) {
        this.stadiumScene = stadiumScene;
        this.ball = ball;
        this.goalkeeper = goalkeeper;
        this.inputManager = inputManager;
        this.uiManager = uiManager;
        this.shotEngine = new ShotEngine();

        // Game configuration
        this.gameMode = 'solo'; // 'solo' | '2player' | 'practice'
        this.trackingMode = 'head'; // 'head' | 'body'

        // State Machine
        // 'BOOT' | 'MAIN_MENU' | 'CALIBRATION' | 'COUNTDOWN' | 'AIMING' | 'CHARGING' | 'SHOT_IN_FLIGHT' | 'RESULT_BANNER' | 'PAUSED' | 'PLAYER_SWITCH' | 'GAME_OVER'
        this.state = 'BOOT';
        this.prePauseState = 'AIMING';

        // Match Timer
        this.matchLengthSec = settingsManager.get('matchLengthSec') || 180;
        this.timeRemaining = this.matchLengthSec;

        // Solo Mode Stats
        this.score = 0;
        this.goals = 0;
        this.shotsTaken = 0;
        this.saves = 0;
        this.misses = 0;
        this.perfectGoals = 0;
        this.currentStreak = 0;
        this.maxStreak = 0;
        this.bestScore = parseInt(localStorage.getItem('tiltkick_highscore') || '0', 10);

        // 2-Player Mode State
        this.currentPlayer = 1;
        this.player1Score = 0;
        this.player2Score = 0;
        this.player1Goals = 0;
        this.player2Goals = 0;
        this.player1Shots = 0;
        this.player2Shots = 0;
        this.player1Results = []; // ['GOAL', 'SAVED', 'MISS'...]
        this.player2Results = [];

        // Practice Mode State
        this.practiceKeeper = settingsManager.get('practiceKeeper') !== false;

        // Active Shot State
        this.currentAim = 0;
        this.currentPower = 0;
        this.activeShotResult = null;
        this.shotFlightTimer = 0;
        this.lastSoundChargeTime = 0;

        // Sequence Timers
        this.countdownValue = 3;
        this.countdownTimer = 0;
        this.pauseSafetyTimer = null;
    }

    setGameMode(mode) {
        this.gameMode = mode;
        console.log(`[GameManager] Game mode set to: ${mode}`);
    }

    setTrackingMode(mode) {
        this.trackingMode = mode;
        this.inputManager.setMode(mode);
        console.log(`[GameManager] Tracking mode set to: ${mode}`);
    }

    setMatchLength(sec) {
        this.matchLengthSec = Math.max(30, Math.min(600, sec));
        settingsManager.set('matchLengthSec', this.matchLengthSec);
    }

    startNewGame() {
        soundEngine.init();
        this.matchLengthSec = settingsManager.get('matchLengthSec') || 180;
        this.timeRemaining = this.matchLengthSec;

        if (this.gameMode === 'solo') {
            this.score = 0;
            this.goals = 0;
            this.shotsTaken = 0;
            this.saves = 0;
            this.misses = 0;
            this.perfectGoals = 0;
            this.currentStreak = 0;
            this.maxStreak = 0;
            this.uiManager.updateSoloHUD(this.score, this.timeRemaining, this.bestScore);
        } else if (this.gameMode === '2player') {
            this.currentPlayer = 1;
            this.player1Score = 0;
            this.player2Score = 0;
            this.player1Goals = 0;
            this.player2Goals = 0;
            this.player1Shots = 0;
            this.player2Shots = 0;
            this.player1Results = [];
            this.player2Results = [];
            this.uiManager.updateTwoPlayerHUD(
                this.player1Score, this.player2Score,
                this.currentPlayer, this.timeRemaining
            );
        } else if (this.gameMode === 'practice') {
            this.score = 0;
            this.goals = 0;
            this.shotsTaken = 0;
            this.uiManager.showPracticeHUD();
        }

        this.beginCalibration();
    }

    async beginCalibration() {
        this.state = 'CALIBRATION';
        this.inputManager.lockInput(false);
        this.uiManager.showCalibrationScreen(this.currentPlayer, this.trackingMode, this.inputManager);

        const camOk = await this.inputManager.startCamera();
        if (camOk) {
            this.uiManager.hideCameraError();
            this.inputManager.startCalibration();
        } else {
            this.uiManager.showCameraError(this.inputManager.cameraError);
        }
    }

    onCalibrationComplete() {
        this.state = 'CALIBRATED_WAIT';
        soundEngine.playCountdown(true);
        this.uiManager.showCalibrationSuccess();
    }

    confirmCalibrationStart() {
        if (this.state !== 'CALIBRATED_WAIT' && this.state !== 'CALIBRATION') return;
        this.uiManager.hideCalibrationScreen();
        this.startCountdown();
    }

    startCountdown() {
        this.state = 'COUNTDOWN';
        this.countdownValue = 3;
        this.countdownTimer = 0.95;
        this.uiManager.showCountdown(this.countdownValue);
        soundEngine.playCountdown(false);
    }

    beginAiming() {
        this.state = 'AIMING';
        this.ball.reset();
        this.goalkeeper.reset();
        this.inputManager.lockInput(false);
        this.inputManager.resetKickTrigger();
        this.currentAim = 0;
        this.currentPower = 0;

        if (this.gameMode === 'practice') {
            this.uiManager.showPracticeHUD();
            this.uiManager.setStatusText('PRACTICE: TILT TO AIM • NOD ↑ TO KICK');
        } else {
            this.uiManager.showGameplayHUD();
            this.uiManager.setStatusText(this.trackingMode === 'head' ? 'TILT TO AIM' : 'LEAN TO AIM');
        }
        soundEngine.playWhistle();
    }

    executeKick(aim, power) {
        if (this.state !== 'AIMING' && this.state !== 'CHARGING') return;

        this.state = 'SHOT_IN_FLIGHT';
        this.inputManager.lockInput(true); // Lock input during ball flight
        this.shotsTaken++;

        // CRITICAL REQUIREMENT 6: Use lockedShotAim if available so nod doesn't move reticle!
        const authoritativeAim = this.inputManager.getLockedKickAim(aim);
        this.currentAim = authoritativeAim;
        this.currentPower = Math.max(0.2, power);

        if (this.gameMode === '2player') {
            if (this.currentPlayer === 1) this.player1Shots++;
            else this.player2Shots++;
        }

        // Calculate continuous target and evaluate against goalkeeper
        const target = this.shotEngine.calculateTarget(this.currentAim, this.currentPower);
        const evaluation = this.shotEngine.evaluateShot(target.x, target.y, target.effectivePower);
        this.activeShotResult = evaluation;

        // Sound & HUD
        soundEngine.playKick(this.currentPower);
        this.uiManager.setStatusText('KICK! — BALL IN FLIGHT');
        this.uiManager.showShotQuality(evaluation.quality);

        // Launch ball
        this.ball.shoot(evaluation.targetX, evaluation.targetY, this.currentPower);

        // Goalkeeper reaction with difficulty-based delay
        this.goalkeeper.reactToShot(
            evaluation.targetX,
            evaluation.targetY,
            evaluation.willSave,
            evaluation.reactionDelay
        );

        this.shotFlightTimer = this.ball.flightDuration + 0.18;
    }

    resolveShotOutcome() {
        this.state = 'RESULT_BANNER';
        const res = this.activeShotResult;

        if (res.result === 'GOAL' || res.result === 'PERFECT') {
            this.goals++;
            this.currentStreak++;
            if (this.currentStreak > this.maxStreak) this.maxStreak = this.currentStreak;
            if (res.result === 'PERFECT') this.perfectGoals++;

            this.score += res.points;
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                localStorage.setItem('tiltkick_highscore', this.bestScore.toString());
            }

            if (this.gameMode === '2player') {
                if (this.currentPlayer === 1) {
                    this.player1Score += res.points;
                    this.player1Goals++;
                    this.player1Results.push('GOAL');
                } else {
                    this.player2Score += res.points;
                    this.player2Goals++;
                    this.player2Results.push('GOAL');
                }
            }

            soundEngine.playGoal();
            this.stadiumScene.triggerGoalCelebration(res.targetX, res.targetY);
        } else if (res.result === 'SAVED') {
            this.saves++;
            this.currentStreak = 0;
            if (this.gameMode === '2player') {
                if (this.currentPlayer === 1) this.player1Results.push('SAVED');
                else this.player2Results.push('SAVED');
            }
            soundEngine.playSave();
            this.ball.deflect();
        } else {
            // MISS
            this.misses++;
            this.currentStreak = 0;
            if (this.gameMode === '2player') {
                if (this.currentPlayer === 1) this.player1Results.push('MISS');
                else this.player2Results.push('MISS');
            }
            if (res.subType === 'CROSSBAR' || res.subType === 'POST') {
                soundEngine.playPost();
                this.stadiumScene.triggerPostClang();
                this.ball.reboundPost(res.subType === 'CROSSBAR');
            } else {
                soundEngine.playMiss();
            }
        }

        // Update Scoreboards
        if (this.gameMode === 'solo') {
            this.uiManager.updateSoloHUD(this.score, this.timeRemaining, this.bestScore);
        } else if (this.gameMode === '2player') {
            this.uiManager.updateTwoPlayerHUD(
                this.player1Score, this.player2Score,
                this.currentPlayer, this.timeRemaining
            );
        }

        // Show result banner
        this.uiManager.showShotResultBanner(res.title, res.subtitle, res.points, res.result);

        // Advance to next turn
        setTimeout(() => {
            if (this.state === 'RESULT_BANNER') {
                this.advanceTurn();
            }
        }, 2100);
    }

    advanceTurn() {
        if (this.gameMode === 'solo') {
            if (this.timeRemaining <= 0) {
                this.endGame();
            } else {
                this.beginAiming();
            }
        } else if (this.gameMode === 'practice') {
            this.beginAiming();
        } else if (this.gameMode === '2player') {
            if (this.timeRemaining <= 0) {
                if (this.currentPlayer === 1) {
                    // Switch to Player 2
                    this.currentPlayer = 2;
                    this.timeRemaining = this.matchLengthSec;
                    this.state = 'PLAYER_SWITCH';
                    this.inputManager.pauseProcessing(true);
                    this.uiManager.showPlayerSwitchModal(2, this.player1Score, () => {
                        this.inputManager.resetPlayerSession();
                        this.inputManager.pauseProcessing(false);
                        this.beginCalibration(); // Fresh calibration for Player 2 reusing single active stream
                    });
                } else {
                    // Player 2 full time: Game over
                    this.endGame();
                }
            } else {
                this.beginAiming();
            }
        }
    }

    togglePause() {
        if (this.state === 'MAIN_MENU' || this.state === 'BOOT' || this.state === 'GAME_OVER') return;

        if (this.state === 'PAUSED') {
            this.resumeGame();
        } else {
            this.pauseGame();
        }
    }

    pauseGame() {
        this.prePauseState = this.state;
        this.state = 'PAUSED';
        this.inputManager.lockInput(true);
        this.inputManager.pauseProcessing(true);
        this.uiManager.showPauseModal();

        // Safety timeout: If user leaves match paused for > 60s, stop camera hardware stream
        if (this.pauseSafetyTimer) clearTimeout(this.pauseSafetyTimer);
        this.pauseSafetyTimer = setTimeout(() => {
            if (this.state === 'PAUSED') {
                console.log('[GameManager] Pause inactive for 60s. Auto-stopping camera for privacy.');
                this.inputManager.stopCamera();
            }
        }, 60000);
    }

    async resumeGame() {
        if (this.pauseSafetyTimer) {
            clearTimeout(this.pauseSafetyTimer);
            this.pauseSafetyTimer = null;
        }
        this.uiManager.hidePauseModal();
        this.state = this.prePauseState === 'PAUSED' ? 'AIMING' : this.prePauseState;

        // If camera was stopped during prolonged pause, re-acquire seamlessly
        if (!this.inputManager.isCameraActive() && this.inputManager.cameraAllowed) {
            await this.inputManager.startCamera();
        }
        this.inputManager.pauseProcessing(false);
        this.inputManager.lockInput(false);
    }

    recalibrate() {
        if (this.pauseSafetyTimer) {
            clearTimeout(this.pauseSafetyTimer);
            this.pauseSafetyTimer = null;
        }
        this.uiManager.hidePauseModal();
        this.inputManager.resetCalibration();
        this.beginCalibration();
    }

    // Practice Mode Utilities
    resetPracticeShot() {
        if (this.gameMode === 'practice') {
            this.beginAiming();
        }
    }

    togglePracticeKeeper() {
        this.practiceKeeper = !this.practiceKeeper;
        settingsManager.set('practiceKeeper', this.practiceKeeper);
        return this.practiceKeeper;
    }

    endGame() {
        if (this.pauseSafetyTimer) {
            clearTimeout(this.pauseSafetyTimer);
            this.pauseSafetyTimer = null;
        }
        this.state = 'GAME_OVER';
        this.inputManager.lockInput(true);
        this.inputManager.stopCamera(); // CAMERA = OFF immediately upon match end / Full Time
        soundEngine.playWhistle();

        if (this.gameMode === 'solo') {
            const accuracy = this.shotsTaken > 0 ? Math.round((this.goals / this.shotsTaken) * 100) : 0;
            // Record Career Stats
            settingsManager.recordMatchResult({
                score: this.score,
                goals: this.goals,
                shots: this.shotsTaken,
                saves: this.saves,
                misses: this.misses,
                perfectGoals: this.perfectGoals,
                maxStreak: this.maxStreak
            });

            this.uiManager.showSoloGameOver({
                score: this.score,
                bestScore: this.bestScore,
                goals: this.goals,
                shotsTaken: this.shotsTaken,
                saves: this.saves,
                misses: this.misses,
                accuracy: accuracy
            });
        } else if (this.gameMode === '2player') {
            let winner = 'DRAW';
            if (this.player1Score > this.player2Score) winner = 'PLAYER 1 WINS';
            else if (this.player2Score > this.player1Score) winner = 'PLAYER 2 WINS';

            const p1Acc = this.player1Shots > 0 ? Math.round((this.player1Goals / this.player1Shots) * 100) : 0;
            const p2Acc = this.player2Shots > 0 ? Math.round((this.player2Goals / this.player2Shots) * 100) : 0;

            this.uiManager.showTwoPlayerGameOver({
                player1Score: this.player1Score,
                player2Score: this.player2Score,
                winner: winner,
                p1Goals: this.player1Goals,
                p2Goals: this.player2Goals,
                p1Shots: this.player1Shots,
                p2Shots: this.player2Shots,
                p1Accuracy: p1Acc,
                p2Accuracy: p2Acc,
                p1Results: this.player1Results,
                p2Results: this.player2Results
            });
        }
    }

    update(delta = 1 / 60) {
        // Paused state: halt updates
        if (this.state === 'PAUSED') return;

        // 1. Update Subsystems
        this.inputManager.update(delta);
        this.ball.update(delta);
        this.goalkeeper.update(delta);
        this.stadiumScene.update(delta);

        // 2. State Machine Handling
        if (this.state === 'CALIBRATION') {
            const posStatus = this.inputManager.getPositionStatus();
            const isTracking = this.inputManager.isTracking();
            const progress = this.inputManager.getCalibrationProgress();
            this.uiManager.updateCalibrationFeedback(posStatus, isTracking, progress, this.trackingMode);

            if (this.inputManager.isCalibrationComplete()) {
                this.onCalibrationComplete();
            }
        } else if (this.state === 'COUNTDOWN') {
            this.countdownTimer -= delta;
            if (this.countdownTimer <= 0) {
                this.countdownValue--;
                if (this.countdownValue > 0) {
                    this.countdownTimer = 0.95;
                    this.uiManager.showCountdown(this.countdownValue);
                    soundEngine.playCountdown(false);
                } else if (this.countdownValue === 0) {
                    this.countdownTimer = 0.8;
                    this.uiManager.showCountdown('KICK!');
                    soundEngine.playCountdown(true);
                } else {
                    this.uiManager.hideCountdown();
                    this.beginAiming();
                }
            }
        } else if (this.state === 'AIMING' || this.state === 'CHARGING') {
            // Match timer countdown (Solo & 2-Player)
            if (this.gameMode === 'solo' || this.gameMode === '2player') {
                this.timeRemaining = Math.max(0, this.timeRemaining - delta);
                if (this.gameMode === 'solo') {
                    this.uiManager.updateSoloTime(this.timeRemaining);
                } else {
                    this.uiManager.updateTwoPlayerHUD(
                        this.player1Score, this.player2Score,
                        this.currentPlayer, this.timeRemaining
                    );
                }

                if (this.timeRemaining <= 0) {
                    this.advanceTurn();
                    return;
                }
            }

            // Normalized input
            const aim = this.inputManager.getAim();
            const power = this.inputManager.getPower();
            this.currentAim = aim;
            this.currentPower = power;

            // Contextual HUD Status Feedback
            if (this.gameMode !== 'practice') {
                if (power <= 0.05) {
                    this.uiManager.setStatusText(this.trackingMode === 'head' ? 'TILT TO AIM' : 'LEAN TO AIM');
                } else if (power < 0.35) {
                    this.uiManager.setStatusText(`CHARGING... ${Math.round(power * 100)}%`);
                } else if (power < 0.75) {
                    this.uiManager.setStatusText('TARGET LOCKED — NOD ↑ TO KICK');
                } else {
                    this.uiManager.setStatusText('PERFECT RANGE — NOD ↑ TO KICK');
                }
            }

            // Keeper anticipation when player is charging power
            if (power > 0.25) {
                this.goalkeeper.anticipate();
            }

            // Power audio hum
            if (power > 0.1 && performance.now() - this.lastSoundChargeTime > 120) {
                soundEngine.playCharge(power);
                this.lastSoundChargeTime = performance.now();
            }

            // Update UI Reticle & Power Bar
            this.uiManager.updateAimReticle(aim, power);
            this.uiManager.updatePowerMeter(power);

            // Kick trigger check
            if (this.inputManager.isKickTriggered()) {
                this.executeKick(aim, power);
                this.inputManager.resetKickTrigger();
            }
        } else if (this.state === 'SHOT_IN_FLIGHT') {
            this.shotFlightTimer -= delta;
            if (this.shotFlightTimer <= 0) {
                this.resolveShotOutcome();
            }
        }
    }
}
