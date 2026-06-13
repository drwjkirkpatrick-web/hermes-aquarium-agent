/**
 * utils.js — Shared utility functions for the Aquarium Dashboard
 *
 * Provides: random helpers, easing functions, color utilities,
 *           screen profile detection, and simple noise approximation.
 */

(function(global) {
    'use strict';

    const Utils = {

        // ── Random ──
        rand(min, max) {
            return Math.random() * (max - min) + min;
        },

        randInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },

        randChoice(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        },

        // ── Easing functions (for smooth animations) ──
        easeInOutSine(t) {
            return -(Math.cos(Math.PI * t) - 1) / 2;
        },

        easeOutBack(t) {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        },

        easeInOutQuad(t) {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        },

        // Smoothly interpolate between a and b by factor t (0..1)
        lerp(a, b, t) {
            return a + (b - a) * t;
        },

        // Interpolate angles (handles wraparound)
        lerpAngle(a, b, t) {
            let diff = b - a;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            return a + diff * t;
        },

        // ── Distance ──
        dist(x1, y1, x2, y2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            return Math.sqrt(dx * dx + dy * dy);
        },

        // ── Clamp ──
        clamp(val, min, max) {
            return Math.max(min, Math.min(max, val));
        },

        // ── Simple 1D noise (smoother than Math.random) ──
        // Uses a few sine waves at different frequencies
        simpleNoise(x, t = 0) {
            return (
                Math.sin(x * 0.5 + t * 0.3) * 0.5 +
                Math.sin(x * 1.2 - t * 0.5) * 0.25 +
                Math.sin(x * 2.7 + t * 0.7) * 0.125
            );
        },

        // ── Screen Profile Detection ──
        // Returns the best-matching Pi display profile based on viewport size
        detectScreenProfile() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const ratio = w / h;

            // Match known Pi screen dimensions
            if (w <= 800 && h <= 480) {
                return { name: 'pi7-touch', w: 800, h: 480, eink: false, scale: 1.0 };
            }
            if (w <= 800 && h <= 600) {
                return { name: 'eink5', w: 800, h: 600, eink: true, scale: 1.0 };
            }
            if (w <= 900 && h <= 530) {
                return { name: 'eink75', w: 880, h: 528, eink: true, scale: 1.1 };
            }
            if (w <= 1280 && h <= 720) {
                return { name: 'hdmi720', w: 1280, h: 720, eink: false, scale: 1.5 };
            }
            if (w <= 1400 && h <= 850) {
                return { name: 'pi10-ips', w: 1280, h: 800, eink: false, scale: 1.6 };
            }
            if (w >= 1600) {
                return { name: 'hdmi1080', w: 1920, h: 1080, eink: false, scale: 2.4 };
            }

            // Fallback: compute scale based on area relative to 800x480
            const baseArea = 800 * 480;
            const area = w * h;
            const scale = Math.sqrt(area / baseArea);
            return { name: 'auto', w, h, eink: false, scale: Utils.clamp(scale, 0.8, 3.0) };
        },

        // ── Color utilities ──
        hexToRgb(hex) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return { r, g, b };
        },

        rgbToString(r, g, b, a = 1) {
            if (a < 1) {
                return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
            }
            return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
        },

        // Interpolate between two hex colors
        lerpColor(hexA, hexB, t) {
            const a = Utils.hexToRgb(hexA);
            const b = Utils.hexToRgb(hexB);
            return Utils.rgbToString(
                Utils.lerp(a.r, b.r, t),
                Utils.lerp(a.g, b.g, t),
                Utils.lerp(a.b, b.b, t)
            );
        },

        // ── Request Animation Frame wrapper with delta time ──
        createLoop(updateFn, renderFn) {
            let lastTime = performance.now();
            let frameCount = 0;
            let fps = 0;
            let lastFpsTime = lastTime;

            function tick(now) {
                const dt = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms
                lastTime = now;

                frameCount++;
                if (now - lastFpsTime >= 1000) {
                    fps = frameCount;
                    frameCount = 0;
                    lastFpsTime = now;
                }

                updateFn(dt, now);
                renderFn(dt, now);

                requestAnimationFrame(tick);
            }

            return {
                start() { requestAnimationFrame(tick); },
                getFps() { return fps; }
            };
        },

        // ── Debounce for resize events ──
        debounce(fn, ms = 200) {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), ms);
            };
        }
    };

    global.Utils = Utils;
})(window);
