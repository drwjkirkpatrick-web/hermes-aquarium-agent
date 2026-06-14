/**
 * hud-overlay.js — Real-time Neurochemical HUD Overlay
 *
 * Displays live sparklines for dopamine, cortisol, serotonin, and melatonin.
 * Toggleable via 'h' key or a corner button. Integrates cleanly with
 * aquarium.js — instantiate in the main loop and call update()/draw() each frame.
 *
 * Usage:
 *   const hud = new NeurochemicalHUD();
 *   hud.init();
 *   // In your update() loop:
 *   hud.update(fishParams);
 *   // In your render() loop:
 *   hud.draw(ctx, canvas.width, canvas.height);
 */
(function(global) {
    'use strict';

    class NeurochemicalHUD {
        constructor(options = {}) {
            /** @type {boolean} */
            this.visible = options.visible !== false;

            /** @type {number} Samples to keep (~60 s @ 60 fps) */
            this.maxHistory = options.maxHistory || 3600;

            /** @type {number} CSS pixels per row */
            this.lineHeight = options.lineHeight || 18;

            /** @type {number} CSS pixels width of each sparkline */
            this.sparkWidth = options.sparkWidth || 120;

            /** @type {number} Panel padding in CSS pixels */
            this.padding = options.padding || 8;

            /** @type {number|null} Fixed left position (null = auto top-right) */
            this.x = options.x ?? null;

            /** @type {number|null} Fixed top position (null = auto top-right) */
            this.y = options.y ?? null;

            // Ring buffers (Float32Array for efficiency)
            this.history = {
                dopamine:  new Float32Array(this.maxHistory),
                cortisol:  new Float32Array(this.maxHistory),
                serotonin: new Float32Array(this.maxHistory),
                melatonin: new Float32Array(this.maxHistory),
            };

            this.head = 0;   // next write index
            this.count = 0;  // valid samples written so far

            this.current = {
                dopamine: 0,
                cortisol: 0,
                serotonin: 0,
                melatonin: 0,
            };

            this.circadianHour = 12;

            this.toggleBtn = null;
            this._onKey = this._onKey.bind(this);
        }

        /* ─────────────────────────────── Lifecycle ─────────────────────────────── */

        init() {
            document.addEventListener('keydown', this._onKey);
            this._createToggleButton();
            return this;
        }

        destroy() {
            document.removeEventListener('keydown', this._onKey);
            if (this.toggleBtn && this.toggleBtn.parentNode) {
                this.toggleBtn.parentNode.removeChild(this.toggleBtn);
                this.toggleBtn = null;
            }
        }

        /* ─────────────────────────────── Controls ──────────────────────────────── */

        toggle() {
            this.visible = !this.visible;
            if (this.toggleBtn) {
                this.toggleBtn.style.opacity = this.visible ? '1' : '0.35';
            }
        }

        _onKey(e) {
            if (e.key === 'h' || e.key === 'H') {
                e.preventDefault();
                this.toggle();
            }
        }

        _createToggleButton() {
            if (this.toggleBtn) return;
            const btn = document.createElement('button');
            btn.id = 'hudToggle';
            btn.title = 'Toggle neurochemical HUD (h)';
            btn.textContent = '🧠';
            Object.assign(btn.style, {
                position: 'fixed',
                top: '8px',
                right: '48px',          /* offset from e-ink toggle */
                zIndex: '1000',
                fontSize: '14px',
                lineHeight: '1',
                padding: '4px 6px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(0,0,0,0.45)',
                color: '#fff',
                cursor: 'pointer',
                userSelect: 'none',
                pointerEvents: 'auto',
                transition: 'opacity 0.2s',
            });
            btn.addEventListener('click', () => this.toggle());
            document.body.appendChild(btn);
            this.toggleBtn = btn;
        }

        /* ─────────────────────────────── Update ────────────────────────────────── */

        /**
         * Call every frame with limbic-derived params (the fishParams object
         * produced by LimbicBridge.compute()).
         */
        update(params) {
            const clamp01 = v => Math.max(0, Math.min(1, v || 0));

            const d = clamp01(params.dopamine);
            const c = clamp01(params.cortisol);
            const s = clamp01(params.serotonin);
            const m = clamp01(params.melatonin);

            const idx = this.head;
            this.history.dopamine[idx]  = d;
            this.history.cortisol[idx]   = c;
            this.history.serotonin[idx]  = s;
            this.history.melatonin[idx]  = m;

            this.head = (this.head + 1) % this.maxHistory;
            if (this.count < this.maxHistory) this.count++;

            this.current.dopamine  = d;
            this.current.cortisol  = c;
            this.current.serotonin = s;
            this.current.melatonin = m;

            // Circadian hour from raw limbic snapshot if available
            if (params.rawLimbic && typeof params.rawLimbic.circadian_hour === 'number') {
                this.circadianHour = params.rawLimbic.circadian_hour;
            } else if (typeof params.circadian === 'number') {
                this.circadianHour = params.circadian;
            }
        }

        /* ─────────────────────────────── Render ────────────────────────────────── */

        draw(ctx, w, h) {
            if (!this.visible) return;

            const dpr = window.devicePixelRatio || 1;
            const cssW = w / dpr;
            const cssH = h / dpr;

            const pad = this.padding;
            const lineH = this.lineHeight;
            const sparkW = this.sparkWidth;
            const labelW = 70;
            const valW = 36;
            const totalW = labelW + sparkW + valW + pad * 3;
            const headerH = 20;
            const totalH = lineH * 4 + pad * 2 + headerH;

            const x = this.x !== null ? this.x : cssW - totalW - pad;
            const y = this.y !== null ? this.y : pad;

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            // ── Panel background (rounded) ──
            this._drawRoundedRect(ctx, x, y, totalW, totalH, 6);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // ── Header + circadian icon ──
            ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            const icon = this._circadianIcon();
            ctx.fillText(`${icon} Neurochemical HUD`, x + pad, y + pad);

            // ── Sparkline rows ──
            const rows = [
                { key: 'dopamine',  label: 'Dopamine',  color: '#4dabf7' }, // blue
                { key: 'cortisol',  label: 'Cortisol',  color: '#ff6b6b' }, // red
                { key: 'serotonin', label: 'Serotonin', color: '#51cf66' }, // green
                { key: 'melatonin', label: 'Melatonin', color: '#be4bdb' }, // purple
            ];

            const startY = y + pad + headerH;
            const sparkH = 12;

            rows.forEach((row, i) => {
                const ry = startY + i * lineH;
                const val = this.current[row.key];

                // Label
                ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
                ctx.font = '10px system-ui, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(row.label, x + pad, ry);

                // Sparkline
                const sx = x + labelW + pad;
                const sy = ry + 9; // baseline

                ctx.strokeStyle = row.color;
                ctx.lineWidth = 1.5;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.beginPath();

                const hist = this.history[row.key];
                const samples = this.count;
                const drawCount = Math.min(samples, sparkW); // ~1 point per pixel
                const firstIdx = (this.head - drawCount + this.maxHistory) % this.maxHistory;

                for (let j = 0; j < drawCount; j++) {
                    const bufIdx = (firstIdx + j) % this.maxHistory;
                    const v = hist[bufIdx];
                    const px = sx + j * (sparkW / (drawCount - 1 || 1));
                    const py = sy - v * sparkH;
                    if (j === 0) ctx.moveTo(px, py);
                    else         ctx.lineTo(px, py);
                }
                ctx.stroke();

                // Current value (numeric)
                ctx.fillStyle = row.color;
                ctx.font = 'bold 10px system-ui, sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(val.toFixed(2), x + totalW - pad, ry);
            });

            ctx.restore();
        }

        /* ─────────────────────────────── Helpers ───────────────────────────────── */

        _circadianIcon() {
            const h = this.circadianHour;
            // Day: 06:00 – 18:00
            if (h >= 6 && h < 18) return '☀️';
            return '🌙';
        }

        _drawRoundedRect(ctx, x, y, wRect, hRect, r) {
            const rr = Math.min(r, wRect / 2, hRect / 2);
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.lineTo(x + wRect - rr, y);
            ctx.arcTo(x + wRect, y, x + wRect, y + rr, rr);
            ctx.lineTo(x + wRect, y + hRect - rr);
            ctx.arcTo(x + wRect, y + hRect, x + wRect - rr, y + hRect, rr);
            ctx.lineTo(x + rr, y + hRect);
            ctx.arcTo(x, y + hRect, x, y + hRect - rr, rr);
            ctx.lineTo(x, y + rr);
            ctx.arcTo(x, y, x + rr, y, rr);
            ctx.closePath();
        }
    }

    global.NeurochemicalHUD = NeurochemicalHUD;
})(window);
