/**
 * limbic-bridge.js — Limbic-Hermes → Aquarium Bridge
 *
 * Reads the limbic state from localStorage (key: hermes_limbic_state)
 * and translates neurochemical variables into fish behavior parameters.
 *
 * Mapping:
 *   - cortisol           → movement erraticness (high = darting/jagged)
 *   - valence            → body color temperature (negative = cool/dark,
 *                                                  positive = warm/bright)
 *   - arousal            → fin speed, swim speed, overall activity
 *   - dominance          → posture upright vs drooping, boldness
 *   - sleep_pressure / melatonin → dimming, glow reduction, slowed fins
 *   - allostatic_load    → fatigue glitch / tremor probability
 *   - dopamine           → gracefulness of movement curves
 *   - neurochemistry.orexin → wakefulness override
 */
(function(global) {
    'use strict';

    const LIMBIC_KEY = 'hermes_limbic_state';

    // Default neutral limbic snapshot
    const DEFAULT_LIMBIC = {
        vad: { valence: 0, arousal: 0.3, dominance: 0.5 },
        neurochemistry: {
            cortisol: 0.1,
            dopamine: 0.3,
            melatonin: 0.1,
            orexin: 0.5,
            serotonin: 0.5,
            norepinephrine: 0.2
        },
        drive: { rest_need: 0.1, task_load: 0.2 },
        allostatic_load: 0.1,
        sleep_pressure: 0.1,
        dominant_affect: 'calm'
    };

    class LimbicBridge {
        constructor() {
            this.limbic = null;      // last parsed limbic state
            this.params = {};        // derived fish params
            this.lastRead = 0;
        }

        // ── Read limbic state from localStorage ──
        read() {
            try {
                const raw = localStorage.getItem(LIMBIC_KEY);
                if (raw) {
                    this.limbic = JSON.parse(raw);
                    this.lastRead = performance.now();
                    return true;
                }
            } catch (e) {
                console.warn('LimbicBridge: failed to parse limbic state', e);
            }
            this.limbic = DEFAULT_LIMBIC;
            return false;
        }

        // ── Compute fish behavior parameters from limbic state ──
        compute() {
            const L = this.limbic || DEFAULT_LIMBIC;
            const vad = L.vad || DEFAULT_LIMBIC.vad;
            const chem = L.neurochemistry || DEFAULT_LIMBIC.neurochemistry;
            const drive = L.drive || DEFAULT_LIMBIC.drive;

            // Normalize helpers
            const clamp01 = v => Math.max(0, Math.min(1, v || 0));

            const valence   = clamp01((vad.valence + 1) / 2);   // -1..1 → 0..1
            const arousal   = clamp01(vad.arousal);
            const dominance = clamp01(vad.dominance);
            const cortisol  = clamp01(chem.cortisol);
            const dopamine  = clamp01(chem.dopamine);
            const melatonin = clamp01(chem.melatonin);
            const orexin    = clamp01(chem.orexin || 0.5);
            const serotonin = clamp01(chem.serotonin);
            const norepinephrine = clamp01(chem.norepinephrine);
            const restNeed  = clamp01(drive.rest_need);
            const taskLoad  = clamp01(drive.task_load);
            const allostatic = clamp01(L.allostatic_load || 0);
            const sleepPressure = clamp01(L.sleep_pressure || restNeed);

            // ── Color temperature from valence ──
            // valence < 0.5 → cool blue/purple tones; > 0.5 → warm amber/gold
            const hue = Utils.lerp(220, 45, valence);   // blue → amber
            const sat = Utils.lerp(0.3, 0.9, valence);
            const lit = Utils.lerp(0.35, 0.65, valence);

            // ── Dimming from sleep pressure / melatonin ──
            const dimFactor = 1 - (sleepPressure * 0.6 + melatonin * 0.4);

            // ── Movement erraticness from cortisol ──
            // high cortisol → jagged target changes, fast direction switches
            const erratic = cortisol * (1 + norepinephrine * 0.5);

            // ── Grace / smoothness from dopamine + valence ──
            // high dopamine + positive valence → long smooth curves
            const grace = (dopamine * 0.5 + valence * 0.5) * (1 - cortisol * 0.5);

            // ── Speed from arousal, damped by rest need and melatonin ──
            const wakefulness = orexin * (1 - melatonin * 0.8);
            const speedMult = arousal * wakefulness * (1 - restNeed * 0.5);

            // ── Posture from dominance ──
            // low dominance → droop (nose down), high → upright proud
            const postureTilt = Utils.lerp(0.25, -0.15, dominance); // radians offset

            // ── Glitch / fatigue tremor from allostatic load ──
            const tremor = allostatic > 0.6 ? (allostatic - 0.6) * 0.3 : 0;
            const glitchChance = allostatic > 0.7 ? (allostatic - 0.7) * 2 : 0;

            // ── Fin speed ──
            const finSpeedBase = 1 + speedMult * 6;
            const finSpeed = finSpeedBase * (1 + erratic * 0.5);

            // ── Bubble rate ──
            const bubbleRate = 0.5 + speedMult * 4 + erratic * 2;

            // ── State classifier ──
            let derivedState = 'idle';
            if (sleepPressure > 0.7 || melatonin > 0.6) {
                derivedState = 'sleeping';
            } else if (cortisol > 0.7 || (arousal > 0.7 && valence < 0.4)) {
                derivedState = 'error';          // high cortisol → erratic (mapped to error visual)
            } else if (allostatic > 0.8) {
                derivedState = 'busy';
            } else if (arousal > 0.6 && valence > 0.5 && dopamine > 0.5) {
                derivedState = 'success';        // graceful positive activation
            } else if (arousal > 0.5 && valence > 0.4) {
                derivedState = 'active';
            } else if (arousal > 0.4 && valence < 0.4) {
                derivedState = 'alert';
            } else if (taskLoad > 0.5 && arousal > 0.3) {
                derivedState = 'thinking';
            }

            this.params = {
                valence,
                arousal,
                dominance,
                cortisol,
                dopamine,
                melatonin,
                sleepPressure,
                allostatic,
                hue,
                sat,
                lit,
                dimFactor,
                erratic,
                grace,
                speedMult,
                postureTilt,
                tremor,
                glitchChance,
                finSpeed,
                bubbleRate,
                derivedState,
                rawLimbic: L
            };

            return this.params;
        }

        // ── Write derived state for the aquarium state manager ──
        writeToStateManager() {
            const p = this.params;
            try {
                localStorage.setItem(StateManager.STORAGE_KEY, JSON.stringify({
                    state: p.derivedState,
                    timestamp: Date.now(),
                    demo: false,
                    limbic: true,
                    limbicParams: {
                        hue: p.hue,
                        sat: p.sat,
                        lit: p.lit,
                        dimFactor: p.dimFactor,
                        erratic: p.erratic,
                        grace: p.grace,
                        speedMult: p.speedMult,
                        postureTilt: p.postureTilt,
                        tremor: p.tremor,
                        glitchChance: p.glitchChance,
                        finSpeed: p.finSpeed,
                        bubbleRate: p.bubbleRate
                    }
                }));
            } catch (e) {
                console.warn('LimbicBridge: failed to write state', e);
            }
        }

        // ── Full refresh cycle ──
        refresh() {
            this.read();
            this.compute();
            this.writeToStateManager();
            return this.params;
        }

        // ── Getters ──
        getParams() { return this.params; }
        getLimbic()  { return this.limbic; }
    }

    global.LimbicBridge = LimbicBridge;
})(window);
