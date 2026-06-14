/**
 * audio-engine.js — Ambient Generative Audio for Hermes Aquarium
 *
 * Web Audio API generative soundscape driven by limbic parameters.
 * Creates underwater ambience, bubbling SFX, and emotional tones.
 *
 * Limbic mappings:
 *   - cortisol          → discordant undertones
 *   - dopamine          → melodic chimes
 *   - valence           → warm/cool timbre
 *   - isNight           → deeper reverb, slower tempo
 *   - melatonin         → volume reduction, softer dynamics
 *   - arousal           → activity density (notes/minute)
 *   - allostatic_load   → background tension drone
 */

(function(global) {
    'use strict';

    class AquariumAudio {
        constructor(options = {}) {
            this.ctx = null;
            this.masterGain = null;
            this.limbicParams = {};
            this.isPlaying = false;
            this.isMuted = options.muted || false;
            this.baseVolume = options.baseVolume || 0.3;

            // Audio nodes
            this.ambienceGain = null;
            this.bubbleGain = null;
            this.chimeGain = null;
            this.droneGain = null;
            this.tensionGain = null;

            // Generators
            this.ambienceNode = null;
            this.droneNode = null;

            // Schedulers
            this.chimeTimer = 0;
            this.bubbleTimer = 0;
            this.nextChimeTime = 0;
            this.nextBubbleTime = 0;

            this.analyser = null;
            this.frequencyData = null;
        }

        // ─── Initialize audio context (must be user-initiated) ───
        init() {
            if (this.ctx) return true;
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();

                // Master chain
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = this.isMuted ? 0 : this.baseVolume;
                this.masterGain.connect(this.ctx.destination);

                // Analyser for visualizations
                this.analyser = this.ctx.createAnalyser();
                this.analyser.fftSize = 64;
                this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
                this.masterGain.connect(this.analyser);

                // Sub-mixes
                this.ambienceGain = this.ctx.createGain();
                this.ambienceGain.gain.value = 0.6;
                this.ambienceGain.connect(this.masterGain);

                this.bubbleGain = this.ctx.createGain();
                this.bubbleGain.gain.value = 0.4;
                this.bubbleGain.connect(this.masterGain);

                this.chimeGain = this.ctx.createGain();
                this.chimeGain.gain.value = 0.25;
                this.chimeGain.connect(this.masterGain);

                this.droneGain = this.ctx.createGain();
                this.droneGain.gain.value = 0.15;
                this.droneGain.connect(this.masterGain);

                this.tensionGain = this.ctx.createGain();
                this.tensionGain.gain.value = 0;
                this.tensionGain.connect(this.masterGain);

                // Start generative layers
                this._startAmbience();
                this._startDrone();
                this.isPlaying = true;
                return true;
            } catch (e) {
                console.warn('AquariumAudio: Web Audio API not available', e);
                return false;
            }
        }

        // ─── Ambient underwater noise (filtered pink noise) ───
        _startAmbience() {
            if (!this.ctx) return;

            const bufferSize = 2 * this.ctx.sampleRate;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);

            // Pink noise algorithm
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }

            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;

            // Low-pass filter for underwater muffling
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            filter.Q.value = 0.5;

            source.connect(filter);
            filter.connect(this.ambienceGain);
            source.start();
            this.ambienceNode = source;
            this.ambienceFilter = filter;
        }

        // ─── Background drone (subtle emotional tone) ───
        _startDrone() {
            if (!this.ctx) return;

            // Sine wave drone at ~55Hz with slight detune
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            osc1.type = 'sine';
            osc2.type = 'sine';
            osc1.frequency.value = 55;
            osc2.frequency.value = 55.5;

            const gain = this.ctx.createGain();
            gain.gain.value = 0.05;

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.droneGain);
            osc1.start();
            osc2.start();
            this.droneNode = { osc1, osc2, gain };
        }

        // ─── Play a melodic chime (dopamine-driven) ───
        _playChime() {
            if (!this.ctx || this.isMuted) return;

            const lp = this.limbicParams || {};
            const valence = lp.valence !== undefined ? lp.valence : 0.5;
            const dopamine = lp.dopamine !== undefined ? lp.dopamine : 0.3;
            const isNight = lp.isNight || false;

            // Scale based on valence: major for positive, minor for negative
            const baseFreq = isNight ? 220 : 262;  // A3 vs C4
            const scale = valence > 0.5
                ? [1, 1.125, 1.25, 1.5, 1.667, 1.875, 2]     // Major-ish
                : [1, 1.067, 1.25, 1.4, 1.6, 1.8, 2];        // Minor-ish

            const noteIdx = Math.floor(Math.random() * scale.length);
            const freq = baseFreq * scale[noteIdx];
            const duration = 0.3 + dopamine * 0.5;

            const osc = this.ctx.createOscillator();
            osc.type = valence > 0.5 ? 'sine' : 'triangle';
            osc.frequency.value = freq;

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1 * dopamine, this.ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            // Reverb-ish delay
            const delay = this.ctx.createDelay();
            delay.delayTime.value = isNight ? 0.4 : 0.2;
            const delayGain = this.ctx.createGain();
            delayGain.gain.value = 0.3;

            osc.connect(gain);
            gain.connect(this.chimeGain);
            gain.connect(delay);
            delay.connect(delayGain);
            delayGain.connect(this.chimeGain);

            osc.start();
            osc.stop(this.ctx.currentTime + duration + 0.5);
        }

        // ─── Play a bubble sound ───
        _playBubble() {
            if (!this.ctx || this.isMuted) return;

            const lp = this.limbicParams || {};
            const arousal = lp.arousal !== undefined ? lp.arousal : 0.3;

            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            const startFreq = 800 + Math.random() * 400;
            osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(startFreq * 0.3, this.ctx.currentTime + 0.15);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.05 + arousal * 0.05, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

            // Underwater filter
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1200;

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.bubbleGain);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);
        }

        // ─── Update — schedule events based on limbic params ───
        update(dt, time) {
            if (!this.ctx || !this.isPlaying) return;

            const lp = this.limbicParams || {};
            const dopamine = lp.dopamine !== undefined ? lp.dopamine : 0.3;
            const arousal = lp.arousal !== undefined ? lp.arousal : 0.3;
            const isNight = lp.isNight || false;
            const cortisol = lp.cortisol !== undefined ? lp.cortisol : 0;
            const melatonin = lp.melatonin !== undefined ? lp.melatonin : 0;
            const allostatic = lp.allostatic !== undefined ? lp.allostatic : 0;

            // Adjust ambient filter for depth (night = deeper)
            if (this.ambienceFilter) {
                const targetFreq = isNight ? 250 : 400;
                const currentFreq = this.ambienceFilter.frequency.value;
                this.ambienceFilter.frequency.value = Utils.lerp(currentFreq, targetFreq, 0.01);
            }

            // Adjust drone (valence changes harmonic relationship)
            if (this.droneNode) {
                const detune = (lp.valence || 0.5) * 2 - 1;  // -1 to 1
                this.droneNode.osc2.frequency.value = 55 + detune * 2;
            }

            // Chime scheduling (dopamine-driven frequency)
            const chimeInterval = isNight
                ? 4 + (1 - dopamine) * 6
                : 2 + (1 - dopamine) * 4;
            this.chimeTimer += dt;
            if (this.chimeTimer >= chimeInterval) {
                this._playChime();
                this.chimeTimer = 0;
            }

            // Bubble scheduling (arousal-driven)
            const bubbleInterval = Math.max(0.1, 0.5 - arousal * 0.3);
            this.bubbleTimer += dt;
            if (this.bubbleTimer >= bubbleInterval) {
                this._playBubble();
                this.bubbleTimer = 0;
            }

            // Tension drone (allostatic load / cortisol)
            if (this.tensionGain) {
                const targetTension = Math.max(cortisol * 0.3, allostatic * 0.2);
                this.tensionGain.gain.value = Utils.lerp(
                    this.tensionGain.gain.value, targetTension, 0.02
                );
            }

            // Master volume (melatonin dims everything)
            if (this.masterGain) {
                const melatoninDamp = 1 - melatonin * 0.5;
                const targetVol = this.isMuted ? 0 : this.baseVolume * melatoninDamp;
                this.masterGain.gain.value = Utils.lerp(
                    this.masterGain.gain.value, targetVol, 0.05
                );
            }

            // Update frequency data for visualization
            if (this.analyser) {
                this.analyser.getByteFrequencyData(this.frequencyData);
            }
        }

        // ─── Set limbic params (called from aquarium.js) ───
        setLimbicParams(params) {
            this.limbicParams = params || {};
        }

        // ─── Controls ───
        mute()   { this.isMuted = true;  if (this.masterGain) this.masterGain.gain.value = 0; }
        unmute() { this.isMuted = false; if (this.masterGain) this.masterGain.gain.value = this.baseVolume; }
        toggleMute() { this.isMuted ? this.unmute() : this.mute(); }
        setVolume(v) { this.baseVolume = Utils.clamp(v, 0, 1); if (!this.isMuted && this.masterGain) this.masterGain.gain.value = this.baseVolume; }

        // ─── Get frequency data for visualization ───
        getFrequencyData() {
            if (!this.analyser) return new Uint8Array(0);
            this.analyser.getByteFrequencyData(this.frequencyData);
            return new Uint8Array(this.frequencyData);
        }

        getAverageFrequency() {
            if (!this.frequencyData || !this.frequencyData.length) return 0;
            return this.frequencyData.reduce((a, b) => a + b, 0) / this.frequencyData.length;
        }
    }

    global.AquariumAudio = AquariumAudio;
})(window);
