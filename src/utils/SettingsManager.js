// Settings & Stats Manager for TILT KICK
// Manages persisted configuration and local player career statistics in localStorage.

export const DEFAULT_SETTINGS = {
    // Controls
    headSensitivity: 1.0,         // 0.5x - 2.0x
    aimSmoothing: 'medium',       // 'low' (0.35), 'medium' (0.22), 'high' (0.12)
    deadZone: 7.0,                // 4.0° - 12.0° (degrees)
    shotPower: 1.0,               // 0.5 - 1.25 (50% - 125%)
    chargeSpeed: 'normal',        // 'slow', 'normal', 'fast'
    aimAssist: 'medium',          // 'off', 'low', 'medium'

    // Gameplay
    keeperDifficulty: 'medium',   // 'easy', 'medium', 'hard'
    matchLengthSec: 180,          // 60, 180, 300, 600
    practiceKeeper: true,         // true / false

    // Audio
    masterVolume: 0.8,            // 0.0 - 1.0
    soundEffects: true,           // true / false

    // Camera
    cameraPreview: true,          // true / false

    // Appearance Theme
    theme: 'auto',                // 'auto', 'day', 'night'

    // Accessibility
    reducedMotion: false          // true / false
};

export const DEFAULT_STATS = {
    matchesPlayed: 0,
    goals: 0,
    shots: 0,
    saves: 0,
    misses: 0,
    bestScore: 0,
    bestStreak: 0,
    perfectGoals: 0
};

class SettingsManager {
    constructor() {
        this.SETTINGS_KEY = 'tiltkick_settings_v3';
        this.STATS_KEY = 'tiltkick_stats_v3';
        this.settings = { ...DEFAULT_SETTINGS };
        this.stats = { ...DEFAULT_STATS };
        this.listeners = [];
        this.load();
    }

    load() {
        // Load Settings
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(this.SETTINGS_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    this.settings = this.sanitize(parsed);
                }
            }
        } catch (e) {
            console.warn('[SettingsManager] Using default settings.', e);
            this.settings = { ...DEFAULT_SETTINGS };
        }

        // Load Stats
        try {
            if (typeof localStorage !== 'undefined') {
                const rawStats = localStorage.getItem(this.STATS_KEY);
                if (rawStats) {
                    this.stats = { ...DEFAULT_STATS, ...JSON.parse(rawStats) };
                }
            }
        } catch (e) {
            this.stats = { ...DEFAULT_STATS };
        }
    }

    save() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(this.settings));
            }
            this.notify();
        } catch (e) {
            console.warn('[SettingsManager] Failed to save settings.', e);
        }
    }

    saveStats() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.STATS_KEY, JSON.stringify(this.stats));
            }
        } catch (e) {
            console.warn('[SettingsManager] Failed to save stats.', e);
        }
    }

    sanitize(data) {
        if (!data || typeof data !== 'object') return { ...DEFAULT_SETTINGS };

        const s = { ...DEFAULT_SETTINGS };

        if (typeof data.headSensitivity === 'number' && !isNaN(data.headSensitivity)) {
            s.headSensitivity = Math.max(0.5, Math.min(2.0, parseFloat(data.headSensitivity.toFixed(2))));
        }

        if (['low', 'medium', 'high'].includes(data.aimSmoothing)) {
            s.aimSmoothing = data.aimSmoothing;
        }

        if (typeof data.deadZone === 'number' && !isNaN(data.deadZone)) {
            s.deadZone = Math.max(4.0, Math.min(12.0, parseFloat(data.deadZone.toFixed(1))));
        }

        if (typeof data.shotPower === 'number' && !isNaN(data.shotPower)) {
            s.shotPower = Math.max(0.5, Math.min(1.25, parseFloat(data.shotPower.toFixed(2))));
        }

        if (['slow', 'normal', 'fast'].includes(data.chargeSpeed)) {
            s.chargeSpeed = data.chargeSpeed;
        }

        if (['off', 'low', 'medium'].includes(data.aimAssist)) {
            s.aimAssist = data.aimAssist;
        }

        if (['easy', 'medium', 'hard'].includes(data.keeperDifficulty)) {
            s.keeperDifficulty = data.keeperDifficulty;
        }

        if (typeof data.matchLengthSec === 'number' && !isNaN(data.matchLengthSec)) {
            s.matchLengthSec = Math.max(30, Math.min(600, Math.round(data.matchLengthSec)));
        }

        if (typeof data.practiceKeeper === 'boolean') {
            s.practiceKeeper = data.practiceKeeper;
        }

        if (typeof data.masterVolume === 'number' && !isNaN(data.masterVolume)) {
            s.masterVolume = Math.max(0.0, Math.min(1.0, parseFloat(data.masterVolume.toFixed(2))));
        }

        if (typeof data.soundEffects === 'boolean') {
            s.soundEffects = data.soundEffects;
        }

        if (typeof data.cameraPreview === 'boolean') {
            s.cameraPreview = data.cameraPreview;
        }

        if (['auto', 'day', 'night'].includes(data.theme)) {
            s.theme = data.theme;
        }

        if (typeof data.reducedMotion === 'boolean') {
            s.reducedMotion = data.reducedMotion;
        }

        return s;
    }

    getEffectiveTheme() {
        if (this.settings.theme === 'day') return 'day';
        if (this.settings.theme === 'night') return 'night';
        // AUTO: check device local time (6:00 to 18:59 = Day, else Night)
        const hour = new Date().getHours();
        return (hour >= 6 && hour < 19) ? 'day' : 'night';
    }

    getThemeLabel() {
        if (this.settings.theme === 'day') return 'DAY';
        if (this.settings.theme === 'night') return 'NIGHT';
        const eff = this.getEffectiveTheme();
        return `AUTO • ${eff.toUpperCase()}`;
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.settings = this.sanitize(this.settings);
        this.save();
    }

    getAll() {
        return { ...this.settings };
    }

    resetDefaults() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.save();
    }

    // Stats Management
    getStats() {
        const accuracy = this.stats.shots > 0 ? Math.round((this.stats.goals / this.stats.shots) * 100) : 0;
        return { ...this.stats, accuracy };
    }

    recordMatchResult(matchData) {
        this.stats.matchesPlayed++;
        this.stats.goals += (matchData.goals || 0);
        this.stats.shots += (matchData.shots || 0);
        this.stats.saves += (matchData.saves || 0);
        this.stats.misses += (matchData.misses || 0);
        this.stats.perfectGoals += (matchData.perfectGoals || 0);

        if (matchData.score > this.stats.bestScore) {
            this.stats.bestScore = matchData.score;
        }
        if (matchData.maxStreak && matchData.maxStreak > this.stats.bestStreak) {
            this.stats.bestStreak = matchData.maxStreak;
        }

        this.saveStats();
    }

    resetStats() {
        this.stats = { ...DEFAULT_STATS };
        this.saveStats();
    }

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    notify() {
        this.listeners.forEach(fn => {
            try { fn(this.settings); } catch (e) { console.error(e); }
        });
    }

    getSmoothingAlpha() {
        switch (this.settings.aimSmoothing) {
            case 'low': return 0.35;
            case 'high': return 0.12;
            case 'medium':
            default: return 0.22;
        }
    }

    getChargeRate() {
        switch (this.settings.chargeSpeed) {
            case 'slow': return 0.60;
            case 'fast': return 1.25;
            case 'normal':
            default: return 0.85;
        }
    }

    getAimAssistFactor() {
        switch (this.settings.aimAssist) {
            case 'off': return 0.0;
            case 'low': return 0.08;
            case 'medium':
            default: return 0.16;
        }
    }
}

export const settingsManager = new SettingsManager();
