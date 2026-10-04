// Complete UI Controller for TILT KICK
// Manages all visual menus, HUD elements, targeting reticle, animations, advanced settings,
// guided camera setup, practice toolbar, match length selector, career stats, and confirmation modals.

import { soundEngine } from '../audio/SoundEngine.js';
import { settingsManager } from '../utils/SettingsManager.js';

export class UIManager {
    constructor() {
        this.dom = {
            // Screens
            mainMenu: document.getElementById('screen-main-menu'),
            trackingModeSelect: document.getElementById('screen-tracking-mode'),
            gameModeSelect: document.getElementById('screen-game-mode'),
            matchLengthSelect: document.getElementById('screen-match-length'),
            howToPlay: document.getElementById('screen-how-to-play'),
            gameplayHUD: document.getElementById('gameplay-hud'),

            // Modals
            settings: document.getElementById('screen-settings'),
            statsModal: document.getElementById('modal-stats'),
            confirmModal: document.getElementById('modal-confirm'),
            pauseModal: document.getElementById('modal-pause'),
            calibrationOverlay: document.getElementById('calibration-overlay'),
            countdownOverlay: document.getElementById('countdown-overlay'),
            resultBanner: document.getElementById('result-banner'),
            playerSwitchModal: document.getElementById('player-switch-modal'),
            gameOverModal: document.getElementById('game-over-modal'),
            debugOverlay: document.getElementById('debug-overlay'),

            // Practice Toolbar
            practiceToolbar: document.getElementById('practice-toolbar'),
            btnPracticeKeeper: document.getElementById('btn-practice-keeper'),
            btnPracticeDiff: document.getElementById('btn-practice-diff'),
            btnPracticeReset: document.getElementById('btn-practice-reset'),
            btnPracticeExit: document.getElementById('btn-practice-exit'),

            // HUD Elements
            hudStatusPill: document.getElementById('hud-status-pill'),
            soloStats: document.getElementById('solo-stats'),
            twoPlayerStats: document.getElementById('two-player-stats'),
            scoreVal: document.getElementById('score-val'),
            timerVal: document.getElementById('timer-val'),
            bestScoreVal: document.getElementById('best-score-val'),
            p1ScoreVal: document.getElementById('p1-score-val'),
            p2ScoreVal: document.getElementById('p2-score-val'),
            pTimerVal: document.getElementById('p-timer-val'),

            // Reticle & Power
            aimReticle: document.getElementById('aim-reticle'),
            reticleLabel: document.getElementById('reticle-label'),
            aimGuideDot: document.getElementById('aim-guide-dot'),
            powerFill: document.getElementById('power-meter-fill'),
            powerPct: document.getElementById('power-meter-pct'),
            shotQualityBadge: document.getElementById('shot-quality-badge'),
            shotQualityText: document.getElementById('shot-quality-text'),

            // Guided Camera Setup
            faceGuideFrame: document.getElementById('face-guide-frame'),
            bodyGuideFrame: document.getElementById('body-guide-frame'),
            calWebcamPreview: document.getElementById('cal-webcam-preview'),
            calCameraFallback: document.getElementById('cal-camera-fallback'),
            calFallbackTitle: document.getElementById('cal-fallback-title'),
            calFallbackDesc: document.getElementById('cal-fallback-desc'),
            calStatusBadge: document.getElementById('cal-status-badge'),
            calStatusIcon: document.getElementById('cal-status-icon'),
            calStatusText: document.getElementById('cal-status-text'),
            calProgressFill: document.getElementById('cal-progress-fill'),
            calSubtext: document.getElementById('cal-subtext'),
            calStepCount: document.getElementById('cal-step-count'),
            calQualityDots: document.getElementById('cal-quality-dots'),
            calSuccessCard: document.getElementById('cal-success-card'),
            btnCalStartMatch: document.getElementById('btn-cal-start-match'),
            btnCalRecalibrate: document.getElementById('btn-cal-recalibrate'),
            btnCalReady: document.getElementById('btn-cal-ready'),
            btnCalBack: document.getElementById('btn-cal-back'),

            // PiP Camera
            pipContainer: document.getElementById('pip-webcam-container'),
            pipStatusBadge: document.getElementById('pip-status-badge'),
            pipToggleBtn: document.getElementById('pip-toggle-btn'),

            // Top action buttons
            btnPause: document.getElementById('btn-pause'),
            audioToggleBtn: document.getElementById('audio-toggle-btn')
        };

        // Callbacks to GameManager & TiltKickApp
        this.onPlayClicked = null;
        this.onTrackingModeSelected = null;
        this.onGameModeSelected = null;
        this.onMatchLengthConfirmed = null;
        this.onRestartClicked = null;
        this.onMainMenuClicked = null;
        this.onResumeClicked = null;
        this.onRecalibrateClicked = null;
        this.onCalReadyClicked = null;
        this.onCalStartMatchClicked = null;
        this.onCalRecalibrateClicked = null;
        this.onCalBackClicked = null;
        this.onCalRetryCameraClicked = null;
        this.onCalFallbackKeyClicked = null;

        // Practice callbacks
        this.onPracticeKeeperToggle = null;
        this.onPracticeReset = null;

        // State variables
        this.pendingGameMode = 'solo';
        this.selectedMatchSec = settingsManager.get('matchLengthSec') || 180;
        this.calibrationStartTime = 0;
        this.calibrationDuration = 2200;

        this.initEventListeners();
        this.initSettingsUI();
        this.initMatchLengthUI();
        this.updateAudioButtonState();
    }

    initEventListeners() {
        // Main Menu buttons
        document.getElementById('btn-play')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = 'solo';
            this.showScreen('trackingModeSelect');
        });

        document.getElementById('btn-practice')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = 'practice';
            this.showScreen('trackingModeSelect');
        });

        document.getElementById('btn-how-to')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('howToPlay');
        });

        document.getElementById('btn-settings')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showModal('settings');
        });

        document.getElementById('btn-stats')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showStatsModal();
        });

        // Tracking Mode Select Cards
        document.getElementById('card-mode-head')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onTrackingModeSelected) this.onTrackingModeSelected('head');
            if (this.pendingGameMode === 'practice') {
                if (this.onGameModeSelected) this.onGameModeSelected('practice');
            } else {
                this.showScreen('gameModeSelect');
            }
        });

        document.getElementById('card-mode-body')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onTrackingModeSelected) this.onTrackingModeSelected('body');
            if (this.pendingGameMode === 'practice') {
                if (this.onGameModeSelected) this.onGameModeSelected('practice');
            } else {
                this.showScreen('gameModeSelect');
            }
        });

        document.getElementById('btn-back-tracking')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('mainMenu');
        });

        // Game Mode Select Cards
        document.getElementById('card-game-solo')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = 'solo';
            this.showMatchLengthScreen('solo');
        });

        document.getElementById('card-game-2p')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.pendingGameMode = '2player';
            this.showMatchLengthScreen('2player');
        });

        document.getElementById('btn-back-game')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('trackingModeSelect');
        });

        // How to Play Screen
        const btnHowToHead = document.getElementById('tab-how-to-head');
        const btnHowToBody = document.getElementById('tab-how-to-body');
        const contentHead = document.getElementById('how-to-content-head');
        const contentBody = document.getElementById('how-to-content-body');

        btnHowToHead?.addEventListener('click', () => {
            soundEngine.playClick();
            btnHowToHead.classList.add('active');
            btnHowToBody?.classList.remove('active');
            if (contentHead) contentHead.style.display = 'grid';
            if (contentBody) contentBody.style.display = 'none';
        });

        btnHowToBody?.addEventListener('click', () => {
            soundEngine.playClick();
            btnHowToBody.classList.add('active');
            btnHowToHead?.classList.remove('active');
            if (contentHead) contentHead.style.display = 'none';
            if (contentBody) contentBody.style.display = 'grid';
        });

        document.getElementById('btn-close-how-to')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('mainMenu');
        });

        // Pause Menu Handlers with Confirmation Dialogs
        this.dom.btnPause?.addEventListener('click', () => {
            soundEngine.playClick();
            this.togglePauseModal();
        });

        document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onResumeClicked) this.onResumeClicked();
        });

        document.getElementById('btn-pause-settings')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showModal('settings');
        });

        document.getElementById('btn-pause-recalibrate')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onRecalibrateClicked) this.onRecalibrateClicked();
        });

        document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showConfirmModal({
                title: 'RESTART MATCH?',
                message: 'Your current match score and streak will be reset.',
                confirmText: 'RESTART',
                onConfirm: () => {
                    this.hideModal('pauseModal');
                    if (this.onRestartClicked) this.onRestartClicked();
                }
            });
        });

        document.getElementById('btn-pause-menu')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showConfirmModal({
                title: 'LEAVE MATCH?',
                message: 'Are you sure you want to return to the main menu?',
                confirmText: 'LEAVE',
                onConfirm: () => {
                    this.hideModal('pauseModal');
                    this.showScreen('mainMenu');
                    if (this.onMainMenuClicked) this.onMainMenuClicked();
                }
            });
        });

        // Guided Calibration Buttons
        document.getElementById('btn-cal-start-match')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalStartMatchClicked) this.onCalStartMatchClicked();
        });

        document.getElementById('btn-cal-recalibrate')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalRecalibrateClicked) this.onCalRecalibrateClicked();
        });

        document.getElementById('btn-cal-ready')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalReadyClicked) this.onCalReadyClicked();
        });

        document.getElementById('btn-cal-back')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideCalibrationScreen();
            if (this.onCalBackClicked) {
                this.onCalBackClicked();
            } else {
                this.showScreen('mainMenu');
                if (this.onMainMenuClicked) this.onMainMenuClicked();
            }
        });

        document.getElementById('btn-cal-retry')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalRetryCameraClicked) this.onCalRetryCameraClicked();
        });

        document.getElementById('btn-cal-fallback-key')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onCalFallbackKeyClicked) this.onCalFallbackKeyClicked();
        });

        // Practice Mode Toolbar Buttons
        this.dom.btnPracticeKeeper?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onPracticeKeeperToggle) {
                const isEnabled = this.onPracticeKeeperToggle();
                this.dom.btnPracticeKeeper.innerText = isEnabled ? 'KEEPER: ON' : 'KEEPER: OFF';
            }
        });

        this.dom.btnPracticeDiff?.addEventListener('click', () => {
            soundEngine.playClick();
            const current = settingsManager.get('keeperDifficulty');
            const next = current === 'easy' ? 'medium' : (current === 'medium' ? 'hard' : 'easy');
            settingsManager.set('keeperDifficulty', next);
            this.dom.btnPracticeDiff.innerText = `DIFF: ${next.toUpperCase().slice(0, 4)}`;
        });

        this.dom.btnPracticeReset?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onPracticeReset) this.onPracticeReset();
        });

        this.dom.btnPracticeExit?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('mainMenu');
            if (this.onMainMenuClicked) this.onMainMenuClicked();
        });

        // Audio Button
        this.dom.audioToggleBtn?.addEventListener('click', () => {
            soundEngine.toggleMute();
            this.updateAudioButtonState();
        });

        // PiP Cam Toggle Button
        this.dom.pipToggleBtn?.addEventListener('click', () => {
            soundEngine.playClick();
            const isCollapsed = this.dom.pipContainer?.classList.toggle('collapsed');
            this.dom.pipToggleBtn.innerText = isCollapsed ? 'CAM: OFF' : 'CAM: ON';
        });

        // Game Over Buttons
        document.getElementById('btn-game-over-again')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('gameOverModal');
            if (this.onRestartClicked) this.onRestartClicked();
        });

        document.getElementById('btn-game-over-share')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.shareMatchResult();
        });

        document.getElementById('btn-game-over-menu')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('gameOverModal');
            this.showScreen('mainMenu');
            if (this.onMainMenuClicked) this.onMainMenuClicked();
        });

        // Stats Modal buttons
        document.getElementById('btn-close-stats')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('statsModal');
        });
        document.getElementById('btn-done-stats')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('statsModal');
        });
        document.getElementById('btn-reset-stats')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (confirm('Clear all your career statistics and records?')) {
                settingsManager.resetStats();
                this.renderStatsGrid();
            }
        });

        // Keyboard hotkeys
        window.addEventListener('keydown', (e) => {
            if (e.key === '`' || e.key === '~') {
                this.toggleDebugOverlay();
            }
        });
    }

    initMatchLengthUI() {
        const presets = document.querySelectorAll('.time-presets-grid .btn-preset');
        const slider = document.getElementById('custom-time-slider');
        const durationVal = document.getElementById('match-duration-val');
        const summaryPill = document.getElementById('match-summary-pill');

        const formatTime = (sec) => {
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}:${s < 10 ? '0' : ''}${s}`;
        };

        const updateDisplay = (sec) => {
            this.selectedMatchSec = sec;
            if (durationVal) durationVal.innerText = formatTime(sec);
            if (summaryPill) {
                const modeName = this.pendingGameMode === '2player' ? '2 PLAYER MATCH' : 'SOLO MATCH';
                summaryPill.innerText = `${modeName} — ${formatTime(sec)}${this.pendingGameMode === '2player' ? ' PER PLAYER' : ''}`;
            }
            if (slider) slider.value = sec;

            presets.forEach(btn => {
                if (parseInt(btn.dataset.sec, 10) === sec) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        };

        presets.forEach(btn => {
            btn.addEventListener('click', () => {
                soundEngine.playClick();
                const sec = parseInt(btn.dataset.sec, 10);
                updateDisplay(sec);
            });
        });

        slider?.addEventListener('input', (e) => {
            const sec = parseInt(e.target.value, 10);
            updateDisplay(sec);
        });

        document.getElementById('btn-start-match')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (this.onMatchLengthConfirmed) {
                this.onMatchLengthConfirmed(this.selectedMatchSec);
            }
            if (this.onGameModeSelected) {
                this.onGameModeSelected(this.pendingGameMode);
            }
        });

        document.getElementById('btn-back-match-length')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.showScreen('gameModeSelect');
        });

        updateDisplay(this.selectedMatchSec);
    }

    showMatchLengthScreen(gameMode) {
        this.pendingGameMode = gameMode;
        const sub = document.getElementById('match-length-sub');
        if (sub) {
            sub.innerText = gameMode === '2player'
                ? 'Each player receives this exact time allocation'
                : 'Select duration for your penalty session';
        }
        this.showScreen('matchLengthSelect');
    }

    showStatsModal() {
        this.renderStatsGrid();
        this.showModal('statsModal');
    }

    renderStatsGrid() {
        const stats = settingsManager.getStats();
        const grid = document.getElementById('stats-grid');
        if (!grid) return;

        grid.innerHTML = `
            <div class="stat-tile">
                <div class="stat-tile-val gold">${stats.bestScore}</div>
                <div class="stat-tile-label">High Score</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.goals}</div>
                <div class="stat-tile-label">Goals Scored</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.accuracy}%</div>
                <div class="stat-tile-label">Shot Accuracy</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.bestStreak}</div>
                <div class="stat-tile-label">Best Goal Streak</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.matchesPlayed}</div>
                <div class="stat-tile-label">Matches Played</div>
            </div>
            <div class="stat-tile">
                <div class="stat-tile-val">${stats.perfectGoals}</div>
                <div class="stat-tile-label">Top Corner Finish</div>
            </div>
        `;
    }

    showConfirmModal({ title, message, confirmText = 'CONFIRM', onConfirm }) {
        const titleEl = document.getElementById('confirm-title');
        const descEl = document.getElementById('confirm-desc');
        const btnYes = document.getElementById('btn-confirm-yes');
        const btnNo = document.getElementById('btn-confirm-no');

        if (titleEl) titleEl.innerText = title;
        if (descEl) descEl.innerText = message;
        if (btnYes) btnYes.innerText = confirmText;

        const handleConfirm = () => {
            cleanup();
            this.hideModal('confirmModal');
            if (onConfirm) onConfirm();
        };

        const handleCancel = () => {
            cleanup();
            this.hideModal('confirmModal');
        };

        const cleanup = () => {
            btnYes?.removeEventListener('click', handleConfirm);
            btnNo?.removeEventListener('click', handleCancel);
        };

        btnYes?.addEventListener('click', handleConfirm);
        btnNo?.addEventListener('click', handleCancel);

        this.showModal('confirmModal');
    }

    initSettingsUI() {
        const s = settingsManager.getAll();

        // 1. Sliders
        const sensSlider = document.getElementById('setting-sensitivity');
        const sensVal = document.getElementById('setting-sensitivity-val');
        if (sensSlider && sensVal) {
            sensSlider.value = s.headSensitivity;
            sensVal.innerText = `${s.headSensitivity.toFixed(1)}x`;
            sensSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                sensVal.innerText = `${val.toFixed(1)}x`;
                settingsManager.set('headSensitivity', val);
            });
        }

        const deadzoneSlider = document.getElementById('setting-deadzone');
        const deadzoneVal = document.getElementById('setting-deadzone-val');
        if (deadzoneSlider && deadzoneVal) {
            deadzoneSlider.value = s.deadZone;
            deadzoneVal.innerText = `${s.deadZone.toFixed(1)}°`;
            deadzoneSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                deadzoneVal.innerText = `${val.toFixed(1)}°`;
                settingsManager.set('deadZone', val);
            });
        }

        const shotPowerSlider = document.getElementById('setting-shotpower');
        const shotPowerVal = document.getElementById('setting-shotpower-val');
        if (shotPowerSlider && shotPowerVal) {
            shotPowerSlider.value = s.shotPower;
            shotPowerVal.innerText = `${Math.round(s.shotPower * 100)}%`;
            shotPowerSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                shotPowerVal.innerText = `${Math.round(val * 100)}%`;
                settingsManager.set('shotPower', val);
            });
        }

        const volumeSlider = document.getElementById('setting-volume');
        const volumeVal = document.getElementById('setting-volume-val');
        if (volumeSlider && volumeVal) {
            volumeSlider.value = s.masterVolume;
            volumeVal.innerText = `${Math.round(s.masterVolume * 100)}%`;
            volumeSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                volumeVal.innerText = `${Math.round(val * 100)}%`;
                soundEngine.setMasterVolume(val);
            });
        }

        // 2. Toggles
        const soundToggle = document.getElementById('setting-sound-toggle');
        if (soundToggle) {
            soundToggle.checked = s.soundEffects;
            soundToggle.addEventListener('change', (e) => {
                soundEngine.setMuted(!e.target.checked);
                this.updateAudioButtonState();
            });
        }

        const camToggle = document.getElementById('setting-cam-toggle');
        if (camToggle) {
            camToggle.checked = s.cameraPreview;
            camToggle.addEventListener('change', (e) => {
                settingsManager.set('cameraPreview', e.target.checked);
                this.toggleCameraPreview(e.target.checked);
            });
        }

        // 3. Segmented Controls Helper
        const setupSegmented = (containerId, settingKey) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            const buttons = container.querySelectorAll('.seg-btn');
            const currentVal = settingsManager.get(settingKey);

            buttons.forEach(btn => {
                if (btn.dataset.val === currentVal) btn.classList.add('active');
                else btn.classList.remove('active');

                btn.addEventListener('click', () => {
                    soundEngine.playClick();
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    settingsManager.set(settingKey, btn.dataset.val);
                });
            });
        };

        setupSegmented('seg-smoothing', 'aimSmoothing');
        setupSegmented('seg-chargespeed', 'chargeSpeed');
        setupSegmented('seg-aimassist', 'aimAssist');
        setupSegmented('seg-difficulty', 'keeperDifficulty');

        // 4. Modal action buttons
        document.getElementById('btn-close-settings')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('settings');
        });

        document.getElementById('btn-save-settings-close')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('settings');
        });

        document.getElementById('btn-setting-recalibrate')?.addEventListener('click', () => {
            soundEngine.playClick();
            this.hideModal('settings');
            if (this.onRecalibrateClicked) this.onRecalibrateClicked();
        });

        document.getElementById('btn-reset-defaults')?.addEventListener('click', () => {
            soundEngine.playClick();
            if (confirm('Reset all settings to default values?')) {
                settingsManager.resetDefaults();
                this.initSettingsUI();
            }
        });
    }

    updateAudioButtonState() {
        if (!this.dom.audioToggleBtn) return;
        const muted = soundEngine.isMuted();
        this.dom.audioToggleBtn.innerHTML = muted
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    }

    toggleCameraPreview(visible) {
        if (this.dom.pipContainer) {
            if (!visible) this.dom.pipContainer.classList.add('collapsed');
            else this.dom.pipContainer.classList.remove('collapsed');
        }
        if (this.dom.pipToggleBtn) {
            this.dom.pipToggleBtn.innerText = visible ? 'CAM: ON' : 'CAM: OFF';
        }
    }

    showScreen(screenKey) {
        const screens = [
            this.dom.mainMenu,
            this.dom.trackingModeSelect,
            this.dom.gameModeSelect,
            this.dom.matchLengthSelect,
            this.dom.howToPlay,
            this.dom.gameplayHUD
        ];

        screens.forEach(s => {
            if (s) {
                s.classList.remove('active');
                s.style.display = 'none';
            }
        });

        const target = this.dom[screenKey];
        if (target) {
            target.style.display = 'flex';
            requestAnimationFrame(() => target.classList.add('active'));
        }

        // Show Pause button & PiP during gameplay only
        if (screenKey === 'gameplayHUD') {
            if (this.dom.pipContainer) this.dom.pipContainer.style.display = 'block';
            if (this.dom.btnPause) this.dom.btnPause.style.display = 'flex';
        } else {
            if (this.dom.pipContainer) this.dom.pipContainer.style.display = 'none';
            if (this.dom.btnPause) this.dom.btnPause.style.display = 'none';
            if (this.dom.practiceToolbar) this.dom.practiceToolbar.style.display = 'none';
        }
    }

    showModal(modalKey) {
        const target = this.dom[modalKey];
        if (target) {
            target.style.display = 'flex';
            requestAnimationFrame(() => target.classList.add('visible'));
        }
    }

    hideModal(modalKey) {
        const target = this.dom[modalKey];
        if (target) {
            target.classList.remove('visible');
            setTimeout(() => { target.style.display = 'none'; }, 240);
        }
    }

    showPauseModal() {
        this.showModal('pauseModal');
    }

    hidePauseModal() {
        this.hideModal('pauseModal');
    }

    togglePauseModal() {
        if (this.dom.pauseModal?.classList.contains('visible')) {
            if (this.onResumeClicked) this.onResumeClicked();
        } else {
            this.showPauseModal();
        }
    }

    showGameplayHUD() {
        this.showScreen('gameplayHUD');
        if (this.dom.practiceToolbar) this.dom.practiceToolbar.style.display = 'none';
    }

    showPracticeHUD() {
        this.showScreen('gameplayHUD');
        if (this.dom.practiceToolbar) this.dom.practiceToolbar.style.display = 'flex';
        if (this.dom.soloStats) this.dom.soloStats.style.display = 'none';
        if (this.dom.twoPlayerStats) this.dom.twoPlayerStats.style.display = 'none';
    }

    setStatusText(text) {
        if (this.dom.hudStatusPill) {
            this.dom.hudStatusPill.innerText = text;
        }
    }

    showCalibrationScreen(playerNum = 1, trackingMode = 'head', inputManager = null) {
        const cal = this.dom.calibrationOverlay;
        if (!cal) return;

        const title = document.getElementById('cal-title');
        const desc = document.getElementById('cal-desc');

        if (title) title.innerText = `SET UP YOUR CAMERA — PLAYER ${playerNum}`;
        if (desc) {
            desc.innerText = trackingMode === 'head'
                ? 'Position your face inside the guide.'
                : 'Position your full body inside the guide.';
        }

        // Show proper framing guide
        if (this.dom.faceGuideFrame) {
            this.dom.faceGuideFrame.style.display = trackingMode === 'head' ? 'flex' : 'none';
            this.dom.faceGuideFrame.className = 'face-guide-frame';
        }
        if (this.dom.bodyGuideFrame) {
            this.dom.bodyGuideFrame.style.display = trackingMode === 'body' ? 'flex' : 'none';
            this.dom.bodyGuideFrame.className = 'body-guide-frame';
        }

        // Attach live camera stream to calibration preview
        if (inputManager && this.dom.calWebcamPreview) {
            inputManager.attachPreviewTo(this.dom.calWebcamPreview);
        }

        // Reset progress bar, quality dots, and success card
        if (this.dom.calProgressFill) this.dom.calProgressFill.style.width = '0%';
        if (this.dom.calQualityDots) {
            const dots = this.dom.calQualityDots.querySelectorAll('.qdot');
            dots.forEach(d => d.classList.remove('filled'));
        }
        if (this.dom.calSuccessCard) this.dom.calSuccessCard.style.display = 'none';

        // Reset buttons: hide Start Match and Recalibrate until calibration succeeds
        if (this.dom.btnCalStartMatch) this.dom.btnCalStartMatch.style.display = 'none';
        if (this.dom.btnCalRecalibrate) this.dom.btnCalRecalibrate.style.display = 'none';
        if (this.dom.btnCalReady) this.dom.btnCalReady.style.display = 'none';
        if (this.dom.btnCalBack) this.dom.btnCalBack.style.display = 'inline-block';

        // Check if camera permission error is active
        if (inputManager && !inputManager.cameraAllowed) {
            this.showCameraError(inputManager.cameraError);
        } else if (this.dom.calCameraFallback) {
            this.dom.calCameraFallback.style.display = 'none';
        }

        // Initial status badge
        if (this.dom.calStatusBadge && this.dom.calStatusText) {
            this.dom.calStatusBadge.className = 'cal-status-badge';
            if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '○';
            this.dom.calStatusText.innerText = trackingMode === 'head' ? 'FACE NOT DETECTED' : 'BODY NOT DETECTED';
        }
        if (this.dom.calSubtext) {
            this.dom.calSubtext.innerText = 'Position your head in the center guide';
        }
        if (this.dom.calStepCount) {
            this.dom.calStepCount.innerText = '';
        }

        this.calibrationStartTime = performance.now();
        cal.style.display = 'flex';
        cal.classList.add('visible');
    }

    updateCalibrationFeedback(positionStatus = 'OK', isTracking = true, progress = null, trackingMode = 'head') {
        if (!this.dom.calStatusBadge || !this.dom.calStatusText) return;

        let label = 'LOOK STRAIGHT';
        let icon = '🎯';
        let badgeClass = 'cal-status-badge';
        let guideModifier = '';
        let hint = 'Hold still to calibrate';

        switch (positionStatus) {
            case 'CAMERA_DENIED':
                this.showCameraError('NotAllowedError');
                return;
            case 'CAMERA_UNAVAILABLE':
                this.showCameraError('CameraUnavailable');
                return;
            case 'NO_FACE':
                label = '○ FACE NOT DETECTED';
                icon = '○';
                badgeClass = 'cal-status-badge';
                guideModifier = '';
                hint = 'Position your face inside the framing guide';
                break;
            case 'NO_BODY':
                label = '○ BODY NOT DETECTED';
                icon = '○';
                badgeClass = 'cal-status-badge';
                guideModifier = '';
                hint = 'Step back until your body is inside the framing guide';
                break;
            case 'MOVE_CLOSER':
                label = 'MOVE CLOSER';
                icon = '🔍';
                badgeClass = 'cal-status-badge warning';
                guideModifier = 'tracking';
                hint = 'Come slightly closer to the camera';
                break;
            case 'MOVE_BACK':
                label = 'MOVE BACK';
                icon = '↔️';
                badgeClass = 'cal-status-badge warning';
                guideModifier = 'tracking';
                hint = 'Step or lean slightly back from the camera';
                break;
            case 'MOVE_RIGHT':
                label = 'MOVE RIGHT';
                icon = '👉';
                badgeClass = 'cal-status-badge warning';
                guideModifier = 'tracking';
                hint = 'Move slightly to your right to center yourself';
                break;
            case 'MOVE_LEFT':
                label = 'MOVE LEFT';
                icon = '👈';
                badgeClass = 'cal-status-badge warning';
                guideModifier = 'tracking';
                hint = 'Move slightly to your left to center yourself';
                break;
            case 'MOVE_DOWN':
                label = 'MOVE DOWN';
                icon = '👇';
                badgeClass = 'cal-status-badge warning';
                guideModifier = 'tracking';
                hint = 'Lower your position or tilt camera up';
                break;
            case 'MOVE_UP':
                label = 'MOVE UP';
                icon = '☝️';
                badgeClass = 'cal-status-badge warning';
                guideModifier = 'tracking';
                hint = 'Raise your position or tilt camera down';
                break;
            case 'FACE_DETECTED':
                label = '✓ FACE DETECTED';
                icon = '✓';
                badgeClass = 'cal-status-badge ok';
                guideModifier = 'aligned';
                hint = 'LOOK STRAIGHT — Keep your head still';
                break;
            case 'LOOK_STRAIGHT':
                label = 'LOOK STRAIGHT — HOLD STILL';
                icon = '✓';
                badgeClass = 'cal-status-badge ok';
                guideModifier = 'aligned calibrating';
                hint = 'Calibrating neutral position...';
                break;
            case 'BODY_DETECTED':
                label = '✓ BODY DETECTED';
                icon = '✓';
                badgeClass = 'cal-status-badge ok';
                guideModifier = 'aligned calibrating';
                hint = 'STAND STRAIGHT — Ready to calibrate';
                break;
            case 'OK':
            default:
                label = isTracking ? '✓ FACE DETECTED' : 'LOOK STRAIGHT';
                icon = '✓';
                badgeClass = 'cal-status-badge ok';
                guideModifier = isTracking ? 'aligned' : '';
                hint = 'Keep your head still';
                break;
        }

        this.dom.calStatusText.innerText = label;
        if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = icon;
        this.dom.calStatusBadge.className = badgeClass;

        if (this.dom.calSubtext) this.dom.calSubtext.innerText = hint;

        // Update framing guide styling
        const activeGuide = trackingMode === 'head' ? this.dom.faceGuideFrame : this.dom.bodyGuideFrame;
        if (activeGuide) {
            const baseClass = trackingMode === 'head' ? 'face-guide-frame' : 'body-guide-frame';
            activeGuide.className = guideModifier ? `${baseClass} ${guideModifier}` : baseClass;
        }

        // Animate calibration progress bar & quality dots
        if (progress) {
            const pct = progress.percent || 0;
            if (this.dom.calProgressFill) {
                this.dom.calProgressFill.style.width = `${pct}%`;
            }

            if (this.dom.calStepCount) {
                if (pct > 0 && pct < 100) {
                    const stepNum = pct < 35 ? '3' : pct < 70 ? '2' : '1';
                    this.dom.calStepCount.innerText = stepNum;
                } else if (pct >= 100) {
                    this.dom.calStepCount.innerText = 'CALIBRATED';
                } else {
                    this.dom.calStepCount.innerText = '';
                }
            }

            if (this.dom.calQualityDots) {
                const dots = this.dom.calQualityDots.querySelectorAll('.qdot');
                dots.forEach((dot, idx) => {
                    if (idx < progress.quality) {
                        dot.classList.add('filled');
                    } else {
                        dot.classList.remove('filled');
                    }
                });
            }
        }
    }

    showCalibrationSuccess() {
        if (this.dom.calStatusBadge && this.dom.calStatusText) {
            this.dom.calStatusBadge.className = 'cal-status-badge success';
            if (this.dom.calStatusIcon) this.dom.calStatusIcon.innerText = '✓';
            this.dom.calStatusText.innerText = 'CALIBRATED ✓';
        }

        if (this.dom.faceGuideFrame) {
            this.dom.faceGuideFrame.className = 'face-guide-frame complete';
        }
        if (this.dom.bodyGuideFrame) {
            this.dom.bodyGuideFrame.className = 'body-guide-frame complete';
        }

        if (this.dom.calProgressFill) {
            this.dom.calProgressFill.style.width = '100%';
        }
        if (this.dom.calStepCount) {
            this.dom.calStepCount.innerText = 'SAVED ✓';
        }
        if (this.dom.calSubtext) {
            this.dom.calSubtext.innerText = 'Neutral position established successfully.';
        }

        if (this.dom.calQualityDots) {
            const dots = this.dom.calQualityDots.querySelectorAll('.qdot');
            dots.forEach(d => d.classList.add('filled'));
        }

        // Show confirmation success card
        if (this.dom.calSuccessCard) {
            this.dom.calSuccessCard.style.display = 'flex';
        }

        // Explicit user confirmation: display YES, START MATCH and RECALIBRATE buttons
        if (this.dom.btnCalStartMatch) {
            this.dom.btnCalStartMatch.style.display = 'inline-block';
            this.dom.btnCalStartMatch.focus();
        }
        if (this.dom.btnCalRecalibrate) {
            this.dom.btnCalRecalibrate.style.display = 'inline-block';
        }
        if (this.dom.btnCalReady) {
            this.dom.btnCalReady.style.display = 'none';
        }
        if (this.dom.btnCalBack) {
            this.dom.btnCalBack.style.display = 'inline-block';
        }
    }

    showCameraError(errorType) {
        if (!this.dom.calCameraFallback) return;

        const title = this.dom.calFallbackTitle || document.getElementById('cal-fallback-title');
        const desc = this.dom.calFallbackDesc || document.getElementById('cal-fallback-desc');

        if (errorType === 'NotAllowedError') {
            if (title) title.innerText = 'CAMERA ACCESS NEEDED';
            if (desc) desc.innerText = 'We need your camera to track your movement. Please allow camera permissions in your browser.';
        } else {
            if (title) title.innerText = 'CAMERA UNAVAILABLE';
            if (desc) desc.innerText = 'Unable to connect to a camera stream. You can retry or switch to keyboard controls.';
        }

        this.dom.calCameraFallback.style.display = 'flex';
    }

    hideCameraError() {
        if (this.dom.calCameraFallback) {
            this.dom.calCameraFallback.style.display = 'none';
        }
    }

    hideCalibrationScreen() {
        const cal = this.dom.calibrationOverlay;
        if (cal) {
            cal.classList.remove('visible');
            setTimeout(() => { cal.style.display = 'none'; }, 200);
        }
    }

    showCountdown(value) {
        this.hideCalibrationScreen();
        const overlay = this.dom.countdownOverlay;
        const text = document.getElementById('countdown-text');
        if (overlay && text) {
            text.innerText = value;
            text.classList.remove('pulse');
            void text.offsetWidth;
            text.classList.add('pulse');
            overlay.style.display = 'flex';
            overlay.classList.add('visible');
        }
    }

    hideCountdown() {
        const overlay = this.dom.countdownOverlay;
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => { overlay.style.display = 'none'; }, 200);
        }
    }

    updateSoloHUD(score, timeSec, bestScore) {
        if (this.dom.soloStats) this.dom.soloStats.style.display = 'flex';
        if (this.dom.twoPlayerStats) this.dom.twoPlayerStats.style.display = 'none';

        if (this.dom.scoreVal) this.dom.scoreVal.innerText = score.toString();
        if (this.dom.bestScoreVal) this.dom.bestScoreVal.innerText = bestScore.toString();
        this.updateSoloTime(timeSec);
    }

    updateSoloTime(timeSec) {
        if (!this.dom.timerVal) return;
        const m = Math.floor(timeSec / 60);
        const s = Math.floor(timeSec % 60);
        this.dom.timerVal.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    updateTwoPlayerHUD(p1Score, p2Score, currentP, timeSec) {
        if (this.dom.soloStats) this.dom.soloStats.style.display = 'none';
        if (this.dom.twoPlayerStats) this.dom.twoPlayerStats.style.display = 'flex';

        if (this.dom.p1ScoreVal) this.dom.p1ScoreVal.innerText = p1Score.toString();
        if (this.dom.p2ScoreVal) this.dom.p2ScoreVal.innerText = p2Score.toString();

        if (this.dom.pTimerVal) {
            const m = Math.floor(timeSec / 60);
            const s = Math.floor(timeSec % 60);
            this.dom.pTimerVal.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        const p1Card = document.getElementById('p1-hud-card');
        const p2Card = document.getElementById('p2-hud-card');
        if (p1Card && p2Card) {
            if (currentP === 1) {
                p1Card.classList.add('active-turn');
                p2Card.classList.remove('active-turn');
            } else {
                p2Card.classList.add('active-turn');
                p1Card.classList.remove('active-turn');
            }
        }
    }

    updateAimReticle(aimNormalized, power = 0) {
        if (this.dom.aimReticle) {
            const containerW = window.innerWidth;
            const centerX = containerW / 2;
            const maxOffset = Math.min(390, containerW * 0.36);
            const targetX = centerX + aimNormalized * maxOffset;

            this.dom.aimReticle.style.transform = `translate3d(${targetX}px, -50%, 0)`;

            // Subtle scale when power is armed
            if (power > 0.7) {
                this.dom.aimReticle.classList.add('armed');
            } else {
                this.dom.aimReticle.classList.remove('armed');
            }
        }

        if (this.dom.aimGuideDot) {
            const pct = (aimNormalized + 1.0) / 2.0 * 100;
            this.dom.aimGuideDot.style.left = `${pct}%`;
        }
    }

    updatePowerMeter(powerNormalized) {
        const pct = Math.round(powerNormalized * 100);
        if (this.dom.powerFill) {
            this.dom.powerFill.style.width = `${pct}%`;
            if (pct >= 85) {
                this.dom.powerFill.style.backgroundColor = '#ff3b30'; // Red high alert
            } else if (pct >= 50) {
                this.dom.powerFill.style.backgroundColor = '#ffd700'; // Gold
            } else {
                this.dom.powerFill.style.backgroundColor = '#00e676'; // Pitch Green
            }
        }
        if (this.dom.powerPct) {
            this.dom.powerPct.innerText = `${pct}%`;
        }
    }

    showShotQuality(label) {
        const badge = this.dom.shotQualityBadge;
        const text = this.dom.shotQualityText;
        if (badge && text) {
            text.innerText = label;
            badge.style.display = 'block';
            badge.classList.remove('pop');
            void badge.offsetWidth;
            badge.classList.add('pop');
            setTimeout(() => { badge.style.display = 'none'; }, 1100);
        }
    }

    showShotResultBanner(title, subtitle, points, resultType) {
        const banner = this.dom.resultBanner;
        if (!banner) return;

        const bTitle = document.getElementById('result-title');
        const bSub = document.getElementById('result-sub');
        const bPts = document.getElementById('result-points');

        if (bTitle) bTitle.innerText = title;
        if (bSub) bSub.innerText = subtitle;
        if (bPts) {
            bPts.innerText = points > 0 ? `+${points} PTS` : '';
            bPts.style.display = points > 0 ? 'inline-block' : 'none';
        }

        banner.className = 'result-banner';
        if (resultType === 'PERFECT') banner.classList.add('perfect');
        else if (resultType === 'GOAL') banner.classList.add('goal');
        else if (resultType === 'SAVED') banner.classList.add('saved');
        else banner.classList.add('miss');

        banner.style.display = 'flex';
        requestAnimationFrame(() => banner.classList.add('visible'));

        setTimeout(() => {
            banner.classList.remove('visible');
            setTimeout(() => { banner.style.display = 'none'; }, 300);
        }, 1900);
    }

    showPlayerSwitchModal(nextPlayerNum, lastPlayerScore, onReady) {
        const modal = this.dom.playerSwitchModal;
        if (!modal) {
            onReady();
            return;
        }

        const title = document.getElementById('switch-title');
        const summary = document.getElementById('switch-score-summary');
        const btnReady = document.getElementById('btn-switch-ready');

        if (title) title.innerText = `PASS THE PHONE TO PLAYER ${nextPlayerNum}`;
        if (summary) summary.innerText = `PLAYER 1 FINISHED WITH ${lastPlayerScore} POINTS`;

        const handler = () => {
            btnReady?.removeEventListener('click', handler);
            this.hideModal('playerSwitchModal');
            onReady();
        };

        btnReady?.addEventListener('click', handler);
        this.showModal('playerSwitchModal');
    }

    showSoloGameOver(stats) {
        const modal = this.dom.gameOverModal;
        if (!modal) return;

        this.lastMatchShareData = { mode: 'solo', ...stats };

        const title = document.getElementById('game-over-title');
        const sub = document.getElementById('game-over-subtitle');
        const details = document.getElementById('game-over-details');

        if (title) title.innerText = 'FULL TIME';
        if (sub) {
            sub.style.display = 'block';
            sub.innerText = `YOUR SCORE: ${stats.score}`;
        }

        if (details) {
            details.innerHTML = `
                <div class="stat-row"><span>HIGH SCORE</span><strong>${stats.bestScore}</strong></div>
                <div class="stat-row"><span>GOALS</span><strong>${stats.goals}</strong></div>
                <div class="stat-row"><span>SHOTS TAKEN</span><strong>${stats.shotsTaken}</strong></div>
                <div class="stat-row"><span>ACCURACY</span><strong>${stats.accuracy}%</strong></div>
                <div class="stat-row"><span>SAVES DENIED</span><strong>${stats.saves}</strong></div>
                <div class="stat-row"><span>MISSES</span><strong>${stats.misses}</strong></div>
            `;
        }

        this.showModal('gameOverModal');
    }

    showTwoPlayerGameOver(data) {
        const modal = this.dom.gameOverModal;
        if (!modal) return;

        this.lastMatchShareData = { mode: '2player', ...data };

        const title = document.getElementById('game-over-title');
        const sub = document.getElementById('game-over-subtitle');
        const details = document.getElementById('game-over-details');

        if (title) title.innerText = 'FULL TIME';
        if (sub) {
            sub.style.display = 'none';
            sub.innerText = '';
        }

        const isP1Winner = data.player1Score > data.player2Score;
        const isP2Winner = data.player2Score > data.player1Score;

        if (details) {
            details.innerHTML = `
                <div class="versus-result-container">
                    <div class="versus-cards">
                        <div class="versus-player-card ${isP1Winner ? 'winner' : ''}">
                            <div class="versus-player-label">PLAYER 1</div>
                            <div class="versus-player-score">${data.player1Score}</div>
                            <div class="versus-player-sub">${data.p1Goals || 0} GOALS • ${data.p1Accuracy || 0}% ACC</div>
                        </div>
                        <div class="versus-divider">VS</div>
                        <div class="versus-player-card ${isP2Winner ? 'winner' : ''}">
                            <div class="versus-player-label">PLAYER 2</div>
                            <div class="versus-player-score">${data.player2Score}</div>
                            <div class="versus-player-sub">${data.p2Goals || 0} GOALS • ${data.p2Accuracy || 0}% ACC</div>
                        </div>
                    </div>
                    <div class="versus-winner-banner">
                        <span class="winner-trophy">🏆</span>
                        <span class="winner-text">${data.winner}</span>
                    </div>
                </div>
            `;
        }

        this.showModal('gameOverModal');
    }

    shareMatchResult() {
        const btn = document.getElementById('btn-game-over-share');
        let text = '⚽ TILT KICK — FULL TIME\n';
        if (this.lastMatchShareData) {
            if (this.lastMatchShareData.mode === '2player') {
                text += `PLAYER 1\n${this.lastMatchShareData.player1Score}\n\n`;
                text += `PLAYER 2\n${this.lastMatchShareData.player2Score}\n\n`;
                text += `${this.lastMatchShareData.winner}\n`;
            } else {
                text += `FINAL SCORE: ${this.lastMatchShareData.score} pts\n`;
                text += `GOALS: ${this.lastMatchShareData.goals} • ACCURACY: ${this.lastMatchShareData.accuracy}%\n`;
            }
        }
        text += 'Play TILT KICK in your browser!';

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (btn) {
                    const prev = btn.innerText;
                    btn.innerText = 'COPIED! ✓';
                    setTimeout(() => {
                        btn.innerText = prev;
                    }, 2000);
                }
            }).catch(() => {
                window.prompt('Copy match result to share:', text);
            });
        } else {
            window.prompt('Copy match result to share:', text);
        }
    }

    updateTrackingBadge(statusText, isTracking) {
        if (!this.dom.pipStatusBadge) return;
        this.dom.pipStatusBadge.innerText = statusText;
        if (isTracking) {
            this.dom.pipStatusBadge.className = 'pip-badge tracking';
        } else {
            this.dom.pipStatusBadge.className = 'pip-badge searching';
        }
    }

    toggleDebugOverlay() {
        const overlay = this.dom.debugOverlay;
        if (!overlay) return;
        const isHidden = overlay.style.display === 'none';
        overlay.style.display = isHidden ? 'block' : 'none';
    }

    updateDebugStats(stats) {
        if (!this.dom.debugOverlay || this.dom.debugOverlay.style.display === 'none') return;
        document.getElementById('dbg-status').innerText = stats.status;
        document.getElementById('dbg-raw').innerText = `${stats.rawAngle}°`;
        document.getElementById('dbg-smoothed').innerText = `${stats.smoothedAngle}°`;
        document.getElementById('dbg-neutral').innerText = `${stats.neutralAngle}°`;
        document.getElementById('dbg-deadzone').innerText = `${stats.deadZone}°`;
        document.getElementById('dbg-aim').innerText = stats.aim;
        document.getElementById('dbg-power').innerText = `${stats.power}%`;
    }
}
