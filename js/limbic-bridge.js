/**
 * limbic-bridge.js — Enhanced Limbic-Hermes → Aquarium Bridge
 *
 * Reads limbic state from localStorage (set by Hermes agent) or polls the
 * limbic-hermes dashboard server at port 8787. Translates neurochemical
 * variables into fish behavior parameters AND image variant selection.
 *
 * Integration with limbic-hermes v5:
 *   - Connects to /api/state endpoint
 *   - Reads full neurochemical state (100+ variables)
 *   - Computes image mood, circadian phase, and overlay parameters
 *   - Emotionally consistent across state transitions
 *
 * Mapping:
 *   - cortisol           → movement erraticness, red vignette
 *   - valence            → body color temperature (standard → optimistic)
 *   - arousal            → fin speed, swim speed, activity
 *   - dominance          → posture upright vs drooping
 *   - sleep_pressure / melatonin → dimming, glow reduction, midnight images
 *   - allostatic_load    → fatigue grain overlay
 *   - dopamine           → gracefulness, bioluminescent glow
 *   - circadian_hour     → day/night cycle (standard vs midnight variants)
 *   - neurochemistry.orexin → wakefulness override
 */
(function(global) {
    'use strict';

    const LIMBIC_KEY = 'hermes_limbic_state';
    const LIMBIC_API_URL = 'http://localhost:8787/api/state';

    // Default neutral limbic snapshot
    const DEFAULT_LIMBIC = {
        vad: { valence: 0, arousal: 0.3, dominance: 0.5 },
        neurochemistry: {
            cortisol: 0.1, dopamine: 0.3, melatonin: 0.1,
            orexin: 0.5, serotonin: 0.5, norepinephrine: 0.2,
            allostatic_load: 0.1,
        },
        drive: { rest_need: 0.1, task_load: 0.2 },
        allostatic_load: 0.1,
        sleep_pressure: 0.1,
        circadian_hour: 12.0,
        dominant_affect: 'calm',
    };

    class LimbicBridge {
        constructor(options = {}) {
            this.limbic = null;           // last parsed limbic state
            this.params = {};             // derived fish params
            this.imageParams = {};        // image selection + overlay params
            this.lastRead = 0;
            this.useApi = options.useApi !== false;  // default: try API first
            this.apiUrl = options.apiUrl || LIMBIC_API_URL;
            this.apiConnected = false;
            this.lastApiError = null;
            this.consecutiveErrors = 0;

            // Historical tracking for emotional consistency
            this.valenceHistory = [];
            this.arousalHistory = [];
            this.historyWindow = 10;

            // Phase tracking
            this.dayPhase = 'day';        // day / dusk / night / dawn
            this.lastDayPhase = 'day';
            this.phaseTransition = 0;     // 0-1 during transition
        }

        // ── Read limbic state ──
        async read() {
            let state = null;

            // Try API first if enabled
            if (this.useApi && this.consecutiveErrors < 3) {
                try {
                    state = await this._fetchApi();
                    this.apiConnected = true;
                    this.lastApiError = null;
                    this.consecutiveErrors = 0;
                } catch (e) {
                    this.lastApiError = e.message;
                    this.consecutiveErrors++;
                    if (this.consecutiveErrors >= 3) {
                        this.apiConnected = false;
                    }
                }
            }

            // Fall back to localStorage
            if (!state) {
                state = this._readLocal();
            }

            // Fall back to default
            if (!state) {
                state = DEFAULT_LIMBIC;
                this.apiConnected = false;
            }

            this.limbic = state;
            this.lastRead = performance.now();

            // Track history
            const v = (state.vad?.valence ?? 0);
            const a = (state.vad?.arousal ?? 0.3);
            this.valenceHistory.push(v);
            this.arousalHistory.push(a);
            if (this.valenceHistory.length > this.historyWindow) {
                this.valenceHistory.shift();
                this.arousalHistory.shift();
            }

            return state;
        }

        async _fetchApi() {
            const res = await fetch(this.apiUrl, {
                cache: 'no-store',
                headers: { 'Accept': 'application/json' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            // API returns nested state; extract if needed
            return data.state || data;
        }

        _readLocal() {
            try {
                const raw = localStorage.getItem(LIMBIC_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) {
                console.warn('LimbicBridge: failed to parse localStorage', e);
            }
            return null;
        }

        // ── Write limbic state (for external updates) ──
        static writeState(state) {
            try {
                localStorage.setItem(LIMBIC_KEY, JSON.stringify({
                    ...state,
                    timestamp: Date.now(),
                }));
                return true;
            } catch (e) {
                return false;
            }
        }

        // ── Compute day phase from circadian hour ──
        _computeDayPhase(hour) {
            // 0-4: deep night, 4-7: dawn, 7-19: day, 19-21: dusk, 21-24: night
            if (hour >= 4 && hour < 7) return 'dawn';
            if (hour >= 7 && hour < 19) return 'day';
            if (hour >= 19 && hour < 21) return 'dusk';
            if (hour >= 21 || hour < 4) return 'night';
            return 'day';
        }

        // ── Smooth day phase transition ──
        _updatePhaseTransition(newPhase) {
            if (newPhase !== this.lastDayPhase) {
                this.dayPhase = newPhase;
                this.lastDayPhase = newPhase;
                this.phaseTransition = 0;
            } else {
                this.phaseTransition = Math.min(1, this.phaseTransition + 0.01);
            }
        }

        // ── Compute fish behavior parameters ──
        compute() {
            const L = this.limbic || DEFAULT_LIMBIC;
            const vad = L.vad || DEFAULT_LIMBIC.vad;
            const chem = L.neurochemistry || DEFAULT_LIMBIC.neurochemistry;
            const drive = L.drive || DEFAULT_LIMBIC.drive;
            const circadian = L.circadian_hour ?? 12.0;

            // Normalize helpers
            const clamp01 = v => Math.max(0, Math.min(1, v || 0));

            const valence   = clamp01((vad.valence + 1) / 2);
            const arousal   = clamp01(vad.arousal);
            const dominance = clamp01(vad.dominance);
            const cortisol  = clamp01(chem.cortisol);
            const dopamine  = clamp01(chem.dopamine);
            const melatonin = clamp01(chem.melatonin);
            const orexin    = clamp01(chem.orexin || 0.5);
            const serotonin = clamp01(chem.serotonin);
            const norepinephrine = clamp01(chem.norepinephrine);
            const allostatic = clamp01(L.allostatic_load || 0);
            const sleepPressure = clamp01(L.sleep_pressure ?? (drive.rest_need || 0));
            const restNeed  = clamp01(drive.rest_need);
            const taskLoad  = clamp01(drive.task_load);

            // Day phase
            const phase = this._computeDayPhase(circadian);
            this._updatePhaseTransition(phase);
            const isNight = phase === 'night' || phase === 'dawn';
            const isDeepNight = circadian >= 0 && circadian <= 4;

            // ── Color temperature from valence ──
            // valence < 0.5 → cool blue/purple tones; > 0.5 → warm amber/gold
            const hue = Utils.lerp(220, 45, valence);
            const sat = Utils.lerp(0.3, 0.9, valence);
            const lit = Utils.lerp(0.35, 0.65, valence);

            // ── Dimming from sleep pressure / melatonin ──
            const dimFactor = 1 - (sleepPressure * 0.6 + melatonin * 0.4);

            // ── Movement erraticness from cortisol ──
            const erratic = cortisol * (1 + norepinephrine * 0.5);

            // ── Grace / smoothness from dopamine + valence ──
            const grace = (dopamine * 0.5 + valence * 0.5) * (1 - cortisol * 0.5);

            // ── Speed from arousal, damped by rest need and melatonin ──
            const wakefulness = orexin * (1 - melatonin * 0.8);
            const speedMult = arousal * wakefulness * (1 - restNeed * 0.5);

            // ── Posture from dominance ──
            const postureTilt = Utils.lerp(0.25, -0.15, dominance);

            // ── Glitch / fatigue tremor from allostatic load ──
            const tremor = allostatic > 0.6 ? (allostatic - 0.6) * 0.3 : 0;

            // ── Fin speed ──
            const finSpeedBase = 1 + speedMult * 6;
            const finSpeed = finSpeedBase * (1 + erratic * 0.5);

            // ── Bubble rate ──
            const bubbleRate = 0.5 + speedMult * 4 + erratic * 2;

            // ── Image mood variant selection ──
            let imageMood = 'standard';
            if (isDeepNight && (allostatic > 0.55 || cortisol > 0.55)) {
                imageMood = 'cine';
            } else if (isNight || melatonin > 0.35 || dimFactor < 0.5) {
                imageMood = 'mid';
            } else if (valence > 0.58 && !isNight) {
                imageMood = 'opt';
            }

            // ── State classifier (same as before, with limbic additions) ──
            let derivedState = 'idle';
            if (sleepPressure > 0.7 || melatonin > 0.6) {
                derivedState = 'sleeping';
            } else if (cortisol > 0.7 || (arousal > 0.7 && valence < 0.4)) {
                derivedState = 'error';
            } else if (allostatic > 0.8) {
                derivedState = 'busy';
            } else if (arousal > 0.6 && valence > 0.5 && dopamine > 0.5) {
                derivedState = 'success';
            } else if (arousal > 0.5 && valence > 0.4) {
                derivedState = 'active';
            } else if (arousal > 0.4 && valence < 0.4) {
                derivedState = 'alert';
            } else if (taskLoad > 0.5 && arousal > 0.3) {
                derivedState = 'thinking';
            }

            // ── Emotional consistency: smooth valence transitions ──
            const avgValence = this.valenceHistory.length
                ? this.valenceHistory.reduce((a, b) => a + b, 0) / this.valenceHistory.length
                : valence;
            const emotionalMomentum = avgValence - valence;

            // ── Overlay parameters ──
            const overlayParams = {
                valence,
                arousal,
                dominance,
                cortisol,
                dopamine,
                melatonin,
                dimFactor,
                erratic,
                grace,
                speedMult,
                postureTilt,
                tremor,
                allostatic,
                isNight,
                isDeepNight,
                phase,
                phaseTransition: this.phaseTransition,
                emotionalMomentum,
                circadian,
            };

            this.params = {
                valence, arousal, dominance,
                cortisol, dopamine, melatonin, serotonin, norepinephrine,
                sleepPressure, allostatic, orexin,
                hue, sat, lit,
                dimFactor, erratic, grace, speedMult,
                postureTilt, tremor,
                finSpeed, bubbleRate,
                derivedState,
                rawLimbic: L,
            };

            this.imageParams = {
                mood: imageMood,
                derivedState,
                overlays: overlayParams,
                isNight,
                isDeepNight,
                phase,
                dimFactor,
                valence,
            };

            return { fishParams: this.params, imageParams: this.imageParams };
        }

        // ── Write derived state for the aquarium state manager ──
        writeToStateManager() {
            const p = this.params;
            const img = this.imageParams;
            try {
                localStorage.setItem(StateManager.STORAGE_KEY, JSON.stringify({
                    state: p.derivedState,
                    timestamp: Date.now(),
                    demo: false,
                    limbic: true,
                    limbicParams: {
                        hue: p.hue, sat: p.sat, lit: p.lit,
                        dimFactor: p.dimFactor,
                        erratic: p.erratic,
                        grace: p.grace,
                        speedMult: p.speedMult,
                        postureTilt: p.postureTilt,
                        tremor: p.tremor,
                        finSpeed: p.finSpeed,
                        bubbleRate: p.bubbleRate,
                    },
                    imageParams: img,
                }));
            } catch (e) {
                console.warn('LimbicBridge: failed to write state', e);
            }
        }

        // ── Full refresh cycle ──
        async refresh() {
            await this.read();
            this.compute();
            this.writeToStateManager();
            return { fishParams: this.params, imageParams: this.imageParams };
        }

        // ── Getters ──
        getParams()  { return this.params; }
        getImageParams() { return this.imageParams; }
        getLimbic()  { return this.limbic; }
        isApiConnected() { return this.apiConnected; }
        getConnectionStatus() {
            return {
                apiConnected: this.apiConnected,
                consecutiveErrors: this.consecutiveErrors,
                lastError: this.lastApiError,
                usingFallback: !this.apiConnected,
            };
        }
    }

    global.LimbicBridge = LimbicBridge;
})(window);
