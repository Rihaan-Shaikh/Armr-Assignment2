// Web Audio API Synthesizer for TILT KICK
// 100% self-contained, zero external audio asset dependencies, guaranteed zero 404s.
// Integrated with SettingsManager for master volume and mute controls.

import { settingsManager } from '../utils/SettingsManager.js';

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.volume = settingsManager.get('masterVolume');
        this.enabled = settingsManager.get('soundEffects');

        // Listen for setting changes
        settingsManager.subscribe((s) => {
            this.volume = s.masterVolume;
            this.enabled = s.soundEffects;
            this.updateGain();
        });
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
                this.masterGain = this.ctx.createGain();
                this.updateGain();
                this.masterGain.connect(this.ctx.destination);
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    updateGain() {
        if (this.masterGain && this.ctx) {
            const targetGain = this.enabled ? this.volume : 0.0;
            this.masterGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
        }
    }

    setMasterVolume(val) {
        this.volume = Math.max(0, Math.min(1.0, val));
        settingsManager.set('masterVolume', this.volume);
        this.updateGain();
    }

    setMuted(muted) {
        this.enabled = !muted;
        settingsManager.set('soundEffects', this.enabled);
        this.updateGain();
    }

    toggleMute() {
        const newMuted = this.enabled; // If enabled, toggle will mute
        this.setMuted(newMuted);
        return newMuted;
    }

    isMuted() {
        return !this.enabled || this.volume <= 0.001;
    }

    // Tactile UI click
    playClick() {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.05);
    }

    // Countdown beeps (3, 2, 1, KICK)
    playCountdown(isFinal = false) {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = isFinal ? 'triangle' : 'sine';
        const freq = isFinal ? 880 : 440;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(isFinal ? 0.5 : 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.35 : 0.15));

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + (isFinal ? 0.35 : 0.15));
    }

    // Power meter charging hum (frequency rises with power)
    playCharge(powerNormalized) {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = 'sine';
        const startFreq = 220 + powerNormalized * 400;
        osc.frequency.setValueAtTime(startFreq, now);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.06);
    }

    // Punchy soccer ball kick impact
    playKick(power = 1.0) {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Sub bass thump
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);

        gain.gain.setValueAtTime(Math.min(1.0, 0.4 + power * 0.5), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.22);

        // Noise transient slap
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        noise.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
    }

    // Goal fanfare + stadium crowd cheer roar
    playGoal() {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;

        // Triumphant chord fanfare: C5, E5, G5, C6
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const noteStart = now + idx * 0.08;

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, noteStart);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2200, noteStart);

            gain.gain.setValueAtTime(0.2, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.6);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.masterGain);

            osc.start(noteStart);
            osc.stop(noteStart + 0.6);
        });

        // Crowd roar filtered noise
        const roarDuration = 2.0;
        const bufferSize = Math.floor(this.ctx.sampleRate * roarDuration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const crowdNoise = this.ctx.createBufferSource();
        crowdNoise.buffer = buffer;

        const biquad = this.ctx.createBiquadFilter();
        biquad.type = 'bandpass';
        biquad.frequency.setValueAtTime(650, now);
        biquad.Q.setValueAtTime(1.2, now);

        const crowdGain = this.ctx.createGain();
        crowdGain.gain.setValueAtTime(0.01, now);
        crowdGain.gain.linearRampToValueAtTime(0.4, now + 0.4);
        crowdGain.gain.exponentialRampToValueAtTime(0.001, now + roarDuration);

        crowdNoise.connect(biquad);
        biquad.connect(crowdGain);
        crowdGain.connect(this.masterGain);

        crowdNoise.start(now);
    }

    // Goalkeeper gloves save slap
    playSave() {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.15);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.18);
    }

    // Metallic crossbar/post hit ping
    playPost() {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        [1200, 2450, 3600].forEach((freq) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.45);
        });
    }

    // Referee match whistle (dual resonant tones)
    playWhistle() {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const frequencies = [2400, 2800];

        frequencies.forEach(freq => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.4);
        });
    }

    // Miss crowd groan
    playMiss() {
        if (this.isMuted()) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.5);
    }
}

export const soundEngine = new SoundEngine();
