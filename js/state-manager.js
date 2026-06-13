/**
 * state-manager.js — Agent State Management
 *
 * Reads agent state from localStorage (set by Hermes agent or another process)
 * and exposes it to the aquarium. Falls back to demo cycling mode.
 */

(function(global) {
    'use strict';

    // Agent states that the fish can express
    const AGENT_STATES = [
        'idle',      // Waiting for work
        'active',    // Currently processing
        'thinking',  // Reasoning / LLM inference
        'success',   // Task completed
        'error',     // Something went wrong
        'sleeping',  // Standby / low power
        'alert',     // New notification
        'learning',  // Training / fine-tuning
        'connecting', // Talking to another service
        'busy'       // Overloaded / many tasks
    ];

    // Default state
    const DEFAULT_STATE = 'idle';

    // localStorage key where Hermes can write its current status
    const STORAGE_KEY = 'hermes_agent_state';

    class StateManager {
        constructor() {
            this.currentState = DEFAULT_STATE;
            this.previousState = DEFAULT_STATE;
            this.stateTime = 0;       // How long in current state (seconds)
            this.changedAt = 0;       // Timestamp of last change
            this.demoMode = true;     // Auto-cycle states for demo
            this.demoInterval = 8;    // Seconds between demo state changes
            this.lastDemoSwitch = 0;

            // Try to read initial state from storage
            this.readFromStorage();
        }

        // ── Read state from localStorage ──
        readFromStorage() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    if (AGENT_STATES.includes(data.state)) {
                        this.setState(data.state);
                        this.demoMode = data.demo !== undefined ? data.demo : false;
                    }
                }
            } catch (e) {
                // localStorage unavailable or invalid JSON — stay in demo
                console.log('StateManager: no stored state, using demo mode');
            }
        }

        // ── External API: set state ──
        setState(newState) {
            if (!AGENT_STATES.includes(newState)) {
                console.warn(`StateManager: unknown state "${newState}", ignoring`);
                return false;
            }
            if (newState === this.currentState) return false;

            this.previousState = this.currentState;
            this.currentState = newState;
            this.stateTime = 0;
            this.changedAt = performance.now() / 1000;
            return true;
        }

        // ── External API: write state (for Hermes agent to call) ──
        static writeState(state, details = {}) {
            if (!AGENT_STATES.includes(state)) return false;
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    state: state,
                    timestamp: Date.now(),
                    demo: false,
                    ...details
                }));
                return true;
            } catch (e) {
                return false;
            }
        }

        // ── Update called every frame ──
        update(dt, now) {
            this.stateTime += dt;

            // Poll localStorage occasionally for external updates
            if (this.stateTime > 2 && Math.floor(this.stateTime * 10) % 20 === 0) {
                this.readFromStorage();
            }

            // Demo mode: cycle through states automatically
            if (this.demoMode && now - this.lastDemoSwitch > this.demoInterval) {
                this.lastDemoSwitch = now;
                const idx = AGENT_STATES.indexOf(this.currentState);
                const next = AGENT_STATES[(idx + 1) % AGENT_STATES.length];
                this.setState(next);
            }
        }

        // ── Query current state ──
        getState() { return this.currentState; }
        getPreviousState() { return this.previousState; }
        getStateTime() { return this.stateTime; }
        isDemo() { return this.demoMode; }

        // ── Toggle demo mode ──
        toggleDemo() {
            this.demoMode = !this.demoMode;
            this.lastDemoSwitch = performance.now() / 1000;
        }
    }

    // Expose state list as constant
    StateManager.STATES = AGENT_STATES;
    StateManager.STORAGE_KEY = STORAGE_KEY;

    global.StateManager = StateManager;
})(window);
