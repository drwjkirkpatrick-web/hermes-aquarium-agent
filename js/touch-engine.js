/**
 * touch-engine.js — Touch / Gesture Interactivity + Accessibility
 *
 * Maps user input to limbic events and aquarium interactions.
 * Supports touch, mouse, and keyboard.
 *
 * Gestures:
 *   - Tap / click on fish      → poke (temporary cortisol spike)
 *   - Long-press on canvas      → feed (food particles, fish chases)
 *   - Swipe left/right          → cycle states
 *   - Double-tap                → toggle debug HUD
 *   - Keyboard arrows           → cycle states
 *   - Space                     → toggle HUD
 *   - M key                     → mute/unmute audio
 *
 * Accessibility:
 *   - Respects prefers-reduced-motion
 *   - ARIA labels for screen readers
 *   - Focus indicators
 *   - Keyboard navigation
 */

(function(global) {
    'use strict';

    const TAP_THRESHOLD = 300;       // ms for tap vs long-press
    const SWIPE_THRESHOLD = 50;      // px for swipe
    const DOUBLE_TAP_DELAY = 300;  // ms between taps for double-tap

    class TouchEngine {
        constructor(canvas, options = {}) {
            this.canvas = canvas;
            this.onPoke = options.onPoke || (() => {});
            this.onFeed = options.onFeed || (() => {});
            this.onSwipe = options.onSwipe || (() => {});
            this.onDoubleTap = options.onDoubleTap || (() => {});
            this.onKey = options.onKey || (() => {});
            this.stateManager = options.stateManager || null;
            this.audioEngine = options.audioEngine || null;

            // Touch tracking
            this.touchStartTime = 0;
            this.touchStartPos = { x: 0, y: 0 };
            this.lastTapTime = 0;
            this.isLongPress = false;
            this.longPressTimer = null;
            this.isTouching = false;

            // Reduced motion
            this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
                this.prefersReducedMotion = e.matches;
            });

            this._bindEvents();
        }

        _bindEvents() {
            // ─── Touch events ───
            this.canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
            this.canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
            this.canvas.addEventListener('touchend', e => this._onTouchEnd(e), { passive: false });
            this.canvas.addEventListener('touchcancel', e => this._onTouchCancel(e), { passive: false });

            // ─── Mouse events ───
            this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
            this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
            this.canvas.addEventListener('mouseup', e => this._onMouseUp(e));
            this.canvas.addEventListener('dblclick', e => this._onDoubleClick(e));

            // ─── Keyboard events ───
            document.addEventListener('keydown', e => this._onKeyDown(e));

            // ─── Prevent context menu on long press ───
            this.canvas.addEventListener('contextmenu', e => {
                e.preventDefault();
                return false;
            });
        }

        // ─── Touch handlers ───
        _onTouchStart(e) {
            e.preventDefault();
            const touch = e.touches[0];
            this.isTouching = true;
            this.touchStartTime = Date.now();
            this.touchStartPos = { x: touch.clientX, y: touch.clientY };
            this.isLongPress = false;

            this.longPressTimer = setTimeout(() => {
                this.isLongPress = true;
                this._triggerFeed(this.touchStartPos.x, this.touchStartPos.y);
            }, TAP_THRESHOLD);
        }

        _onTouchMove(e) {
            e.preventDefault();
            if (!this.isTouching) return;

            const touch = e.touches[0];
            const dx = touch.clientX - this.touchStartPos.x;
            const dy = touch.clientY - this.touchStartPos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            // Cancel long press if moved too far
            if (dist > SWIPE_THRESHOLD && this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }

        _onTouchEnd(e) {
            e.preventDefault();
            if (!this.isTouching) return;
            this.isTouching = false;

            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }

            const touch = e.changedTouches[0];
            const dx = touch.clientX - this.touchStartPos.x;
            const dy = touch.clientY - this.touchStartPos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const duration = Date.now() - this.touchStartTime;

            // Check for double-tap
            const now = Date.now();
            if (now - this.lastTapTime < DOUBLE_TAP_DELAY) {
                this._triggerDoubleTap(touch.clientX, touch.clientY);
                this.lastTapTime = 0;
                return;
            }
            this.lastTapTime = now;

            if (this.isLongPress) {
                // Already triggered feed in timer
                return;
            }

            if (dist > SWIPE_THRESHOLD && duration < TAP_THRESHOLD) {
                // Swipe
                const direction = dx > 0 ? 'right' : 'left';
                this._triggerSwipe(direction, dx, dy);
            } else if (duration < TAP_THRESHOLD) {
                // Tap
                this._triggerPoke(touch.clientX, touch.clientY);
            }
        }

        _onTouchCancel(e) {
            this.isTouching = false;
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }

        // ─── Mouse handlers ───
        _onMouseDown(e) {
            this.isTouching = true;
            this.touchStartTime = Date.now();
            this.touchStartPos = { x: e.clientX, y: e.clientY };
            this.isLongPress = false;

            this.longPressTimer = setTimeout(() => {
                this.isLongPress = true;
                this._triggerFeed(this.touchStartPos.x, this.touchStartPos.y);
            }, TAP_THRESHOLD);
        }

        _onMouseMove(e) {
            if (!this.isTouching) return;
            const dx = e.clientX - this.touchStartPos.x;
            const dy = e.clientY - this.touchStartPos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist > SWIPE_THRESHOLD && this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }

        _onMouseUp(e) {
            if (!this.isTouching) return;
            this.isTouching = false;

            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }

            const dx = e.clientX - this.touchStartPos.x;
            const dy = e.clientY - this.touchStartPos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const duration = Date.now() - this.touchStartTime;

            if (this.isLongPress) return;

            if (dist > SWIPE_THRESHOLD && duration < TAP_THRESHOLD) {
                this._triggerSwipe(dx > 0 ? 'right' : 'left', dx, dy);
            } else if (duration < TAP_THRESHOLD) {
                this._triggerPoke(e.clientX, e.clientY);
            }
        }

        _onDoubleClick(e) {
            this._triggerDoubleTap(e.clientX, e.clientY);
        }

        // ─── Keyboard handlers ───
        _onKeyDown(e) {
            // Ignore if typing in an input
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                    e.preventDefault();
                    this._cycleState(1);
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    this._cycleState(-1);
                    break;
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    this.onDoubleTap?.();
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    this.onKey?.('mute');
                    if (this.audioEngine) this.audioEngine.toggleMute();
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    this._triggerPoke(window.innerWidth/2, window.innerHeight/2);
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    this._triggerFeed(window.innerWidth/2, window.innerHeight/2);
                    break;
                case 'e':
                case 'E':
                    e.preventDefault();
                    this.onKey?.('eink');
                    break;
            }
        }

        // ─── Action triggers ───
        _triggerPoke(x, y) {
            if (this.prefersReducedMotion) return;  // No poke in reduced motion

            this.onPoke(x, y);

            // Audio feedback
            if (this.audioEngine && this.audioEngine.ctx) {
                const osc = this.audioEngine.ctx.createOscillator();
                const gain = this.audioEngine.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = 400;
                osc.frequency.exponentialRampToValueAtTime(200, this.audioEngine.ctx.currentTime + 0.1);
                gain.gain.value = 0.05;
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioEngine.ctx.currentTime + 0.15);
                osc.connect(gain);
                gain.connect(this.audioEngine.ctx.destination);
                osc.start();
                osc.stop(this.audioEngine.ctx.currentTime + 0.2);
            }
        }

        _triggerFeed(x, y) {
            this.onFeed(x, y);

            // Audio feedback
            if (this.audioEngine && this.audioEngine.ctx) {
                const osc = this.audioEngine.ctx.createOscillator();
                const gain = this.audioEngine.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, this.audioEngine.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(300, this.audioEngine.ctx.currentTime + 0.3);
                gain.gain.value = 0.1;
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioEngine.ctx.currentTime + 0.4);
                osc.connect(gain);
                gain.connect(this.audioEngine.ctx.destination);
                osc.start();
                osc.stop(this.audioEngine.ctx.currentTime + 0.5);
            }
        }

        _triggerSwipe(direction, dx, dy) {
            this.onSwipe(direction, dx, dy);
        }

        _triggerDoubleTap(x, y) {
            this.onDoubleTap(x, y);
        }

        _cycleState(direction) {
            const states = ['idle','active','thinking','success','error','sleeping','alert','learning','connecting','busy'];
            if (!this.stateManager) return;

            const current = this.stateManager.getState();
            const idx = states.indexOf(current);
            const nextIdx = (idx + direction + states.length) % states.length;
            const nextState = states[nextIdx];

            // Set state with limbic-aware metadata
            this.stateManager.setState(nextState);

            // Audio feedback
            if (this.audioEngine && this.audioEngine.ctx) {
                const osc = this.audioEngine.ctx.createOscillator();
                const gain = this.audioEngine.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = direction > 0 ? 500 : 350;
                gain.gain.value = 0.03;
                gain.gain.exponentialRampToValueAtTime(0.001, this.audioEngine.ctx.currentTime + 0.1);
                osc.connect(gain);
                gain.connect(this.audioEngine.ctx.destination);
                osc.start();
                osc.stop(this.audioEngine.ctx.currentTime + 0.15);
            }
        }

        // ─── Accessibility helpers ───
        announceToScreenReader(message) {
            const announcer = document.getElementById('sr-announcer') || (() => {
                const el = document.createElement('div');
                el.id = 'sr-announcer';
                el.setAttribute('aria-live', 'polite');
                el.setAttribute('aria-atomic', 'true');
                el.style.position = 'absolute';
                el.style.left = '-10000px';
                el.style.width = '1px';
                el.style.height = '1px';
                el.style.overflow = 'hidden';
                document.body.appendChild(el);
                return el;
            })();
            announcer.textContent = message;
        }

        getReducedMotion() {
            return this.prefersReducedMotion;
        }
    }

    global.TouchEngine = TouchEngine;
})(window);
