/**
 * angelfish.js — The Hero Fish
 *
 * A procedural angelfish that changes appearance and behavior
 * based on the Hermes agent's current state.
 *
 * States: idle, active, thinking, success, error, sleeping, alert,
 *         learning, connecting, busy
 */

(function(global) {
    'use strict';

    // ─── Color palettes per state ───
    const STATE_COLORS = {
        idle:      { body: '#d0d8e0', stripe: '#1a1a2e', accent: '#8a9aaa', glow: null },
        active:    { body: '#e8f0ff', stripe: '#0a1628', accent: '#4da6ff', glow: '#a0d0ff' },
        thinking:  { body: '#d8e8f0', stripe: '#1a1a2e', accent: '#6a9cc5', glow: '#6090c0' },
        success:   { body: '#e8f5e8', stripe: '#0a2810', accent: '#4caf50', glow: '#7fff9f' },
        error:     { body: '#f0e0d8', stripe: '#2e1a10', accent: '#e89840', glow: '#ffaa44' },
        sleeping:  { body: '#a0a8b0', stripe: '#151520', accent: '#505868', glow: null },
        alert:     { body: '#f0f8ff', stripe: '#081830', accent: '#00e5ff', glow: '#00ffff' },
        learning:  { body: '#e8e0f0', stripe: '#1e1028', accent: '#9c6bc5', glow: '#bb88ff' },
        connecting:{ body: '#e0f0f5', stripe: '#0a2028', accent: '#44aaff', glow: '#44ddff' },
        busy:      { body: '#f5f0e0', stripe: '#282010', accent: '#e8a040', glow: '#ffcc66' }
    };

    // ─── Bubble patterns per state ───
    const STATE_BUBBLES = {
        idle:      { rate: 1.0,  size: [2, 4],  speed: 0.8, pattern: 'occasional' },
        active:    { rate: 3.0,  size: [2, 5],  speed: 1.5, pattern: 'trail' },
        thinking:  { rate: 0.5,  size: [3, 6],  speed: 0.4, pattern: 'single' },
        success:   { rate: 5.0,  size: [2, 7],  speed: 1.2, pattern: 'burst' },
        error:     { rate: 2.0,  size: [1, 3],  speed: 1.0, pattern: 'zigzag' },
        sleeping:  { rate: 0.1,  size: [1, 2],  speed: 0.2, pattern: 'none' },
        alert:     { rate: 4.0,  size: [2, 5],  speed: 1.8, pattern: 'burst' },
        learning:  { rate: 1.5,  size: [2, 6],  speed: 0.9, pattern: 'spiral' },
        connecting:{ rate: 2.5,  size: [2, 4],  speed: 1.0, pattern: 'orbit' },
        busy:      { rate: 6.0,  size: [1, 3],  speed: 2.0, pattern: 'chaos' }
    };

    class Angelfish {
        constructor(x, y, scale = 1) {
            this.x = x;
            this.y = y;
            this.vx = 0;
            this.vy = 0;
            this.angle = 0;
            this.scale = scale;

            // Animation properties
            this.finPhase = 0;
            this.tailPhase = 0;
            this.breathPhase = 0;
            this.hoverY = y;
            this.targetX = x;
            this.targetY = y;
            this.swimSpeed = 80;

            // State tracking
            this.state = 'idle';
            this.stateTime = 0;
            this.transition = 0; // 0..1 blend between states

            // Bubbles emitted by the fish
            this.bubbles = [];
            this.bubbleTimer = 0;

            // Eye expression
            this.blinkTimer = 0;
            this.isBlinking = false;

            // Size in logical pixels (at scale=1)
            this.width = 70;
            this.height = 110;
        }

        update(dt, time, stateManager, bounds) {
            const newState = stateManager.getState();
            if (newState !== this.state) {
                this.state = newState;
                this.stateTime = 0;
                this.transition = 0;
            }
            this.stateTime += dt;
            this.transition = Math.min(this.transition + dt * 2, 1);

            // Update animation phases
            this.finPhase += dt * this._finSpeed();
            this.tailPhase += dt * this._tailSpeed();
            this.breathPhase += dt * 1.5;

            // Hover offset (gentle bobbing)
            const hoverAmp = this._hoverAmplitude();
            this.y += Math.sin(time * 1.2 + this.x * 0.01) * hoverAmp * dt;

            // Movement behavior based on state
            this._updateMovement(dt, time, bounds);

            // Boundary constraints
            this.x = Utils.clamp(this.x, this.width * 0.5, bounds.w - this.width * 0.5);
            this.y = Utils.clamp(this.y, this.height * 0.5, bounds.h - this.height * 0.3);

            // Smooth angle toward velocity
            const targetAngle = Math.atan2(this.vy, this.vx);
            if (Math.abs(this.vx) > 5 || Math.abs(this.vy) > 5) {
                this.angle = Utils.lerpAngle(this.angle, targetAngle, dt * 3);
            }

            // Update bubbles
            this._updateBubbles(dt, time);

            // Blink
            this.blinkTimer -= dt;
            if (this.blinkTimer <= 0) {
                this.isBlinking = true;
                this.blinkTimer = Utils.rand(2, 5);
                setTimeout(() => { this.isBlinking = false; }, 150);
            }
        }

        _updateMovement(dt, time, bounds) {
            const margin = 60;
            const cx = bounds.w * 0.5;
            const cy = bounds.h * 0.4;

            switch (this.state) {
                case 'idle':
                    // Gentle drift around center
                    this.targetX = cx + Math.sin(time * 0.3) * (bounds.w * 0.25);
                    this.targetY = cy + Math.sin(time * 0.5) * (bounds.h * 0.15);
                    this._approachTarget(dt, 0.5);
                    break;

                case 'active':
                    // Purposeful cruising back and forth
                    this.targetX = (Math.sin(time * 0.6) > 0)
                        ? bounds.w - margin : margin;
                    this.targetY = cy + Math.sin(time * 0.8) * (bounds.h * 0.2);
                    this._approachTarget(dt, 1.5);
                    break;

                case 'thinking':
                    // Slow circles near center, slight nose-down tilt
                    const thinkR = 80;
                    this.targetX = cx + Math.cos(time * 0.4) * thinkR;
                    this.targetY = cy + 30 + Math.sin(time * 0.4) * thinkR * 0.5;
                    this._approachTarget(dt, 0.4);
                    break;

                case 'success':
                    // Victory loop!
                    this.targetX = cx + Math.sin(time * 2.0) * 60;
                    this.targetY = cy - 50 + Math.cos(time * 2.0) * 40;
                    this._approachTarget(dt, 1.0);
                    break;

                case 'error':
                    // Tight confused zigzags
                    this.targetX = this.x + (Math.sin(time * 4) * 100) * dt;
                    this.targetY = cy + Math.sin(time * 3) * 30;
                    this._approachTarget(dt, 0.8);
                    break;

                case 'sleeping':
                    // Drift to bottom, barely move
                    this.targetX = cx + Math.sin(time * 0.1) * 20;
                    this.targetY = bounds.h - 120;
                    this._approachTarget(dt, 0.3);
                    break;

                case 'alert':
                    // Quick dart toward "source" then hover
                    this.targetX = cx + Math.sin(time * 1.5) * 40;
                    this.targetY = cy - 40 + Math.sin(time * 2) * 20;
                    this._approachTarget(dt, 1.2);
                    break;

                case 'learning':
                    // Slow spiral upward
                    const learnT = time * 0.5;
                    this.targetX = cx + Math.sin(learnT) * 100;
                    this.targetY = cy + Math.cos(learnT) * 60;
                    this._approachTarget(dt, 0.6);
                    break;

                case 'connecting':
                    // Reaching outward motions
                    this.targetX = cx + Math.sin(time * 0.7) * (bounds.w * 0.3);
                    this.targetY = cy + Math.sin(time * 1.1) * (bounds.h * 0.2);
                    this._approachTarget(dt, 0.9);
                    break;

                case 'busy':
                    // Rapid small movements, staying near center
                    this.targetX = cx + (Math.sin(time * 3) * 60 + Math.sin(time * 7) * 20);
                    this.targetY = cy + (Math.cos(time * 2.5) * 40 + Math.cos(time * 6) * 15);
                    this._approachTarget(dt, 1.5);
                    break;
            }
        }

        _approachTarget(dt, speedMult) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const maxSpeed = this.swimSpeed * speedMult;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 1) {
                const speed = Math.min(dist * 2, maxSpeed);
                this.vx = (dx / dist) * speed;
                this.vy = (dy / dist) * speed;
            } else {
                this.vx *= 0.9;
                this.vy *= 0.9;
            }

            this.x += this.vx * dt;
            this.y += this.vy * dt;
        }

        _finSpeed() {
            const speeds = {
                idle: 2, active: 5, thinking: 1.5, success: 6,
                error: 7, sleeping: 0.5, alert: 4, learning: 3,
                connecting: 3.5, busy: 8
            };
            return speeds[this.state] || 2;
        }

        _tailSpeed() {
            return this._finSpeed() * 1.2;
        }

        _hoverAmplitude() {
            const amps = {
                idle: 8, active: 5, thinking: 4, success: 15,
                error: 12, sleeping: 2, alert: 10, learning: 6,
                connecting: 5, busy: 14
            };
            return amps[this.state] || 5;
        }

        // ─── Bubble emission ───
        _updateBubbles(dt, time) {
            const cfg = STATE_BUBBLES[this.state] || STATE_BUBBLES.idle;
            this.bubbleTimer -= dt * cfg.rate;

            if (this.bubbleTimer <= 0 && cfg.pattern !== 'none') {
                this.bubbleTimer = Utils.rand(0.3, 0.8);
                const count = cfg.pattern === 'burst' ? Utils.randInt(3, 7) :
                              cfg.pattern === 'chaos' ? Utils.randInt(2, 5) : 1;

                for (let i = 0; i < count; i++) {
                    const b = {
                        x: this.x + Utils.rand(-10, 10),
                        y: this.y - 30,
                        size: Utils.rand(cfg.size[0], cfg.size[1]),
                        vx: cfg.pattern === 'zigzag' ? Utils.rand(-30, 30) :
                             cfg.pattern === 'orbit' ? Math.cos(time + i) * 20 :
                             Utils.rand(-5, 5),
                        vy: -Utils.rand(cfg.speed * 20, cfg.speed * 40),
                        life: Utils.rand(1, 3),
                        age: 0
                    };
                    this.bubbles.push(b);
                }
            }

            // Update existing bubbles
            for (let i = this.bubbles.length - 1; i >= 0; i--) {
                const b = this.bubbles[i];
                b.age += dt;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                if (b.age >= b.life) this.bubbles.splice(i, 1);
            }
        }

        // ─── Drawing ───
        draw(ctx, time, isEink) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.scale(this.scale, this.scale);
            ctx.rotate(this.angle + Math.PI / 2); // Fish swims "up" by default

            if (isEink) {
                this._drawEink(ctx, time);
            } else {
                this._drawColor(ctx, time);
            }

            ctx.restore();

            // Draw bubbles in world space
            this._drawBubbles(ctx, isEink);
        }

        _drawColor(ctx, time) {
            const colors = STATE_COLORS[this.state] || STATE_COLORS.idle;
            const breath = Math.sin(this.breathPhase) * 0.05 + 1;

            // Body glow
            if (colors.glow) {
                ctx.save();
                ctx.shadowColor = colors.glow;
                ctx.shadowBlur = 15 + Math.sin(time * 3) * 5;
            }

            // ─── Main body (elongated diamond / angelfish shape) ───
            const bodyW = 22 * breath;
            const bodyH = 45;

            // Dorsal fin (top triangle)
            const dorsalW = 40;
            const dorsalH = 35;
            const dorsalSway = Math.sin(this.finPhase) * 3;

            ctx.fillStyle = colors.body;
            ctx.beginPath();
            ctx.moveTo(0, -bodyH * 0.3); // Neck
            ctx.quadraticCurveTo(-dorsalW * 0.5 + dorsalSway, -bodyH * 0.5 - dorsalH * 0.3,
                                 -dorsalW * 0.3 + dorsalSway * 0.5, -bodyH * 0.5 - dorsalH);
            ctx.quadraticCurveTo(0, -bodyH * 0.5 - dorsalH * 1.1,
                                 dorsalW * 0.3 - dorsalSway * 0.5, -bodyH * 0.5 - dorsalH);
            ctx.quadraticCurveTo(dorsalW * 0.5 - dorsalSway, -bodyH * 0.5 - dorsalH * 0.3,
                                 0, -bodyH * 0.3);
            ctx.fill();

            // Anal fin (bottom triangle)
            const analSway = Math.sin(this.finPhase + 1) * 3;
            ctx.beginPath();
            ctx.moveTo(0, bodyH * 0.4);
            ctx.quadraticCurveTo(-dorsalW * 0.5 + analSway, bodyH * 0.5 + dorsalH * 0.3,
                                 -dorsalW * 0.3 + analSway * 0.5, bodyH * 0.5 + dorsalH);
            ctx.quadraticCurveTo(0, bodyH * 0.5 + dorsalH * 1.1,
                                 dorsalW * 0.3 - analSway * 0.5, bodyH * 0.5 + dorsalH);
            ctx.quadraticCurveTo(dorsalW * 0.5 - analSway, bodyH * 0.5 + dorsalH * 0.3,
                                 0, bodyH * 0.4);
            ctx.fill();

            // Body core
            ctx.beginPath();
            ctx.ellipse(0, 0, bodyW * 0.7, bodyH * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tail (caudal fin)
            const tailSway = Math.sin(this.tailPhase) * 8;
            ctx.fillStyle = colors.body;
            ctx.beginPath();
            ctx.moveTo(-2, -5);
            ctx.quadraticCurveTo(-15 + tailSway, -12, -25 + tailSway * 1.5, -18);
            ctx.quadraticCurveTo(-18 + tailSway * 0.5, -5, -25 + tailSway * 1.2, 5);
            ctx.quadraticCurveTo(-15 + tailSway, 8, -2, 5);
            ctx.closePath();
            ctx.fill();

            // Pectoral fins (side)
            const pecSway = Math.sin(this.finPhase + 2) * 0.4;
            ctx.fillStyle = colors.accent + '40'; // Transparent
            ctx.beginPath();
            ctx.moveTo(bodyW * 0.4, -5);
            ctx.quadraticCurveTo(bodyW * 0.9, -15 + pecSway * 10,
                                 bodyW * 0.5, -22 + pecSway * 8);
            ctx.quadraticCurveTo(bodyW * 0.3, -12 + pecSway * 5, bodyW * 0.4, -5);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-bodyW * 0.4, -5);
            ctx.quadraticCurveTo(-bodyW * 0.9, -15 + pecSway * 10,
                                 -bodyW * 0.5, -22 + pecSway * 8);
            ctx.quadraticCurveTo(-bodyW * 0.3, -12 + pecSway * 5, -bodyW * 0.4, -5);
            ctx.fill();

            // Vertical stripes
            ctx.strokeStyle = colors.stripe;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.8;
            for (let i = -2; i <= 2; i++) {
                const sy = i * 8;
                ctx.beginPath();
                ctx.moveTo(-bodyW * 0.4, sy);
                ctx.lineTo(bodyW * 0.4, sy);
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;

            // Eye
            if (colors.glow) ctx.restore(); // End glow for eye

            this._drawEye(ctx, this.state === 'sleeping');

            // Gill detail
            ctx.strokeStyle = colors.accent + '60';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(-bodyW * 0.5, 0, 6, -Math.PI * 0.3, Math.PI * 0.3);
            ctx.stroke();
        }

        _drawEink(ctx, time) {
            // High-contrast silhouette for e-ink
            ctx.fillStyle = '#000';

            // Simplified angelfish shape
            ctx.beginPath();
            ctx.moveTo(0, -50); // Top of dorsal
            ctx.lineTo(-15, -20);
            ctx.lineTo(-20, 0); // Left widest
            ctx.lineTo(-15, 30);
            ctx.lineTo(0, 55); // Bottom of anal
            ctx.lineTo(15, 30);
            ctx.lineTo(20, 0); // Right widest
            ctx.lineTo(15, -20);
            ctx.closePath();
            ctx.fill();

            // Tail
            ctx.beginPath();
            ctx.moveTo(-18, -5);
            ctx.lineTo(-30, -15);
            ctx.lineTo(-32, 0);
            ctx.lineTo(-30, 10);
            ctx.lineTo(-18, 5);
            ctx.closePath();
            ctx.fill();

            // White eye (cutout effect)
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(10, -10, 4, 0, Math.PI * 2);
            ctx.fill();

            // Stripe hints (white lines)
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath();
                ctx.moveTo(-12, i * 10);
                ctx.lineTo(12, i * 10);
                ctx.stroke();
            }
        }

        _drawEye(ctx, isClosed) {
            const eyeX = 12;
            const eyeY = -15;
            const eyeR = 5.5;

            // White sclera
            ctx.fillStyle = '#f0f8ff';
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
            ctx.fill();

            if (isClosed) {
                // Sleeping: closed eye line
                ctx.strokeStyle = '#2a2a3a';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(eyeX - eyeR + 1, eyeY + 1);
                ctx.quadraticCurveTo(eyeX, eyeY - 1, eyeX + eyeR - 1, eyeY + 1);
                ctx.stroke();
            } else {
                // Pupil
                const pupilOff = (this.state === 'thinking') ? -1 : 0;
                ctx.fillStyle = '#1a1a2e';
                ctx.beginPath();
                ctx.arc(eyeX + 1 + pupilOff, eyeY, 3, 0, Math.PI * 2);
                ctx.fill();

                // Highlight
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(eyeX + 2 + pupilOff, eyeY - 1.5, 1.5, 0, Math.PI * 2);
                ctx.fill();

                // Expression: alert = wider eye
                if (this.state === 'alert' || this.state === 'success') {
                    ctx.strokeStyle = '#1a1a2e';
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.arc(eyeX, eyeY, eyeR + 1, -Math.PI * 0.7, -Math.PI * 0.3);
                    ctx.stroke();
                }

                // Expression: error = raised eyebrow area
                if (this.state === 'error') {
                    ctx.strokeStyle = '#1a1a2e';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(eyeX - 4, eyeY - 6);
                    ctx.quadraticCurveTo(eyeX + 2, eyeY - 9, eyeX + 6, eyeY - 5);
                    ctx.stroke();
                }
            }
        }

        _drawBubbles(ctx, isEink) {
            for (const b of this.bubbles) {
                if (isEink) {
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 0.8;
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                    ctx.stroke();
                } else {
                    const alpha = Math.max(0, 1 - b.age / b.life) * 0.5;
                    ctx.fillStyle = `rgba(200, 240, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    global.Angelfish = Angelfish;
})(window);
