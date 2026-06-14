/**
 * angelfish.js — The Hero Fish (Image-Based with Procedural Overlays)
 *
 * Renders the angelfish using the generated image assets for the body,
 * with procedural effects overlaid: bubbles, glow, particles, and
 * limbic-driven color temperature shifts.
 *
 * States: idle, active, thinking, success, error, sleeping, alert,
 *         learning, connecting, busy
 */

(function(global) {
    'use strict';

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

            // ── Image-based rendering ──
            this.currentImage = null;     // Image() element
            this.imageAlpha = 1.0;
            this.imageTransition = 0;     // 0-1 for image crossfade
            this.lastImageSrc = '';

            // Particle effects
            this.particles = [];
            this.particleTimer = 0;

            // Glow intensity (driven by limbic dopamine / arousal)
            this.glowIntensity = 0;
            this.targetGlow = 0;
        }

        update(dt, time, stateManager, bounds, limbicParams = {}) {
            const newState = stateManager.getState();
            if (newState !== this.state) {
                this.state = newState;
                this.stateTime = 0;
                this.transition = 0;
            }
            this.stateTime += dt;
            this.transition = Math.min(this.transition + dt * 2, 1);

            // Store limbic params
            this.limbic = limbicParams;
            const lp = limbicParams;
            const hasLimbic = lp && Object.keys(lp).length > 0;

            // ── Limbic-driven animation modifiers ──

            // Fin speed: base from state, scaled by arousal + erratic cortisol
            let finSpeed = this._finSpeed();
            if (hasLimbic) {
                finSpeed *= (lp.speedMult || 0.5) * 2;
                finSpeed += (lp.erratic || 0) * 4;
            }

            let tailSpeed = finSpeed * 1.2;

            // Hover amplitude
            let hoverAmp = this._hoverAmplitude();
            if (hasLimbic) {
                hoverAmp *= (lp.dimFactor || 1);
                if (lp.grace > 0.5) hoverAmp *= 1.2;
            }

            // Update animation phases
            this.finPhase += dt * finSpeed;
            this.tailPhase += dt * tailSpeed;
            this.breathPhase += dt * 1.5;

            // Hover offset with optional tremor
            let tremorX = 0, tremorY = 0;
            if (hasLimbic && lp.tremor > 0) {
                tremorX = (Math.random() - 0.5) * lp.tremor * 20;
                tremorY = (Math.random() - 0.5) * lp.tremor * 20;
            }
            this.y += Math.sin(time * 1.2 + this.x * 0.01) * hoverAmp * dt + tremorY * dt;
            this.x += tremorX * dt;

            // Movement behavior
            this._updateMovement(dt, time, bounds, lp);

            // Boundary constraints
            this.x = Utils.clamp(this.x, this.width * 0.5, bounds.w - this.width * 0.5);
            this.y = Utils.clamp(this.y, this.height * 0.5, bounds.h - this.height * 0.3);

            // Smooth angle toward velocity
            const targetAngle = Math.atan2(this.vy, this.vx);
            let postureOffset = 0;
            if (hasLimbic) postureOffset = lp.postureTilt || 0;
            if (Math.abs(this.vx) > 5 || Math.abs(this.vy) > 5) {
                this.angle = Utils.lerpAngle(this.angle, targetAngle + postureOffset, dt * 3);
            }

            // Update bubbles with limbic
            this._updateBubbles(dt, time, lp);

            // Update particles
            this._updateParticles(dt, time, bounds, lp);

            // Update glow (limbic-driven)
            this.targetGlow = hasLimbic ? (lp.dopamine || 0.3) * (1 - (lp.melatonin || 0) * 0.5) : 0;
            this.glowIntensity = Utils.lerp(this.glowIntensity, this.targetGlow, dt * 2);

            // Blink
            this.blinkTimer -= dt;
            if (this.blinkTimer <= 0) {
                this.isBlinking = true;
                this.blinkTimer = Utils.rand(2, 5);
                setTimeout(() => { this.isBlinking = false; }, 150);
            }
        }

        // ─── Image assignment ───
        setImage(imageElement) {
            if (!imageElement || this.currentImage === imageElement) return;
            this.currentImage = imageElement;
            this.imageAlpha = 0;  // Start transparent, fade in
        }

        // ─── Movement behaviors ───
        _updateMovement(dt, time, bounds, lp = {}) {
            const margin = 60;
            const cx = bounds.w * 0.5;
            const cy = bounds.h * 0.4;
            const hasLimbic = lp && Object.keys(lp).length > 0;

            const grace = hasLimbic ? (lp.grace || 0.5) : 0.5;
            const erratic = hasLimbic ? (lp.erratic || 0) : 0;

            let approachFactor = 1;
            if (hasLimbic) {
                approachFactor = (lp.speedMult || 0.5) * 2;
                if (erratic > 0.5) approachFactor *= 1.5;
            }

            switch (this.state) {
                case 'idle':
                    this.targetX = cx + Math.sin(time * 0.3) * (bounds.w * 0.25);
                    this.targetY = cy + Math.sin(time * 0.5) * (bounds.h * 0.15);
                    this._approachTarget(dt, 0.5 * approachFactor);
                    break;

                case 'active':
                    this.targetX = (Math.sin(time * 0.6) > 0)
                        ? bounds.w - margin : margin;
                    this.targetY = cy + Math.sin(time * 0.8) * (bounds.h * 0.2);
                    this._approachTarget(dt, 1.5 * approachFactor);
                    break;

                case 'thinking':
                    const thinkR = 80;
                    this.targetX = cx + Math.cos(time * 0.4) * thinkR;
                    this.targetY = cy + 30 + Math.sin(time * 0.4) * thinkR * 0.5;
                    this._approachTarget(dt, 0.4 * approachFactor);
                    break;

                case 'success':
                    this.targetX = cx + Math.sin(time * 2.0) * 60;
                    this.targetY = cy - 50 + Math.cos(time * 2.0) * 40;
                    this._approachTarget(dt, 1.0 * approachFactor);
                    break;

                case 'error':
                    this.targetX = this.x + (Math.sin(time * 4) * 100) * dt;
                    this.targetY = cy + Math.sin(time * 3) * 30;
                    this._approachTarget(dt, 0.8 * approachFactor);
                    break;

                case 'sleeping':
                    this.targetX = cx + Math.sin(time * 0.1) * 20;
                    this.targetY = bounds.h - 120;
                    this._approachTarget(dt, 0.3 * approachFactor);
                    break;

                case 'alert':
                    this.targetX = cx + Math.sin(time * 1.5) * 40;
                    this.targetY = cy - 40 + Math.sin(time * 2) * 20;
                    this._approachTarget(dt, 1.2 * approachFactor);
                    break;

                case 'learning':
                    const learnT = time * 0.5;
                    this.targetX = cx + Math.sin(learnT) * 100;
                    this.targetY = cy + Math.cos(learnT) * 60;
                    this._approachTarget(dt, 0.6 * approachFactor);
                    break;

                case 'connecting':
                    this.targetX = cx + Math.sin(time * 0.7) * (bounds.w * 0.3);
                    this.targetY = cy + Math.sin(time * 1.1) * (bounds.h * 0.2);
                    this._approachTarget(dt, 0.9 * approachFactor);
                    break;

                case 'busy':
                    this.targetX = cx + (Math.sin(time * 3) * 60 + Math.sin(time * 7) * 20);
                    this.targetY = cy + (Math.cos(time * 2.5) * 40 + Math.cos(time * 6) * 15);
                    this._approachTarget(dt, 1.5 * approachFactor);
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

        _hoverAmplitude() {
            const amps = {
                idle: 8, active: 5, thinking: 4, success: 15,
                error: 12, sleeping: 2, alert: 10, learning: 6,
                connecting: 5, busy: 14
            };
            return amps[this.state] || 5;
        }

        // ─── Bubble emission ───
        _updateBubbles(dt, time, lp = {}) {
            const hasLimbic = lp && Object.keys(lp).length > 0;
            const cfg = STATE_BUBBLES[this.state] || STATE_BUBBLES.idle;
            let rate = cfg.rate;
            if (hasLimbic) {
                rate = lp.bubbleRate || cfg.rate;
                if (lp.erratic > 0.5) rate += lp.erratic * 3;
            }
            this.bubbleTimer -= dt * rate;

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
                        age: 0,
                        // Limbic-aware: warm bubbles for positive valence
                        warmth: hasLimbic ? lp.valence : 0.5,
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

        // ─── Particle effects ───
        _updateParticles(dt, time, bounds, lp = {}) {
            const hasLimbic = lp && Object.keys(lp).length > 0;
            const dopamine = hasLimbic ? (lp.dopamine || 0) : 0;
            const arousal = hasLimbic ? (lp.arousal || 0) : 0;
            const isNight = hasLimbic ? (lp.isNight || false) : false;

            // Emit particles based on state + limbic
            this.particleTimer -= dt;
            const baseRate = isNight ? 0.1 : 0.3;
            const particleRate = baseRate + dopamine * 0.4 + arousal * 0.2;

            if (this.particleTimer <= 0) {
                this.particleTimer = Utils.rand(0.5, 1.5) / particleRate;

                if (this.state === 'success' || this.state === 'active' || dopamine > 0.5) {
                    // Sparkle particles
                    for (let i = 0; i < (this.state === 'success' ? 3 : 1); i++) {
                        this.particles.push({
                            x: this.x + Utils.rand(-30, 30),
                            y: this.y + Utils.rand(-40, 40),
                            vx: Utils.rand(-20, 20),
                            vy: Utils.rand(-30, -5),
                            size: Utils.rand(1, 3),
                            life: Utils.rand(0.5, 1.5),
                            age: 0,
                            type: 'sparkle',
                            hue: isNight ? 200 : (dopamine > 0.5 ? 45 : 180), // blue or gold
                        });
                    }
                }
            }

            // Update particles
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.age += dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 10 * dt; // gravity
                if (p.age >= p.life) this.particles.splice(i, 1);
            }
        }

        // ─── Drawing ───
        draw(ctx, time, isEink) {
            if (isEink) {
                this._drawEink(ctx, time);
                return;
            }

            ctx.save();

            // ── Limbic-driven glow behind the fish ──
            if (this.glowIntensity > 0.1) {
                ctx.save();
                ctx.shadowColor = this.limbic?.isNight
                    ? `rgba(100, 220, 255, ${this.glowIntensity * 0.4})`
                    : `rgba(255, 200, 100, ${this.glowIntensity * 0.3})`;
                ctx.shadowBlur = 20 + this.glowIntensity * 30;

                // Draw a subtle glow ellipse
                const glowGrad = ctx.createRadialGradient(
                    this.x, this.y, 5,
                    this.x, this.y, 60 * this.scale
                );
                glowGrad.addColorStop(0, `rgba(255, 255, 255, ${this.glowIntensity * 0.15})`);
                glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 60 * this.scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // ── Draw the fish image ──
            if (this.currentImage && this.currentImage.complete) {
                const img = this.currentImage;
                const imgW = 80 * this.scale;
                const imgH = 100 * this.scale;

                ctx.globalAlpha = this.imageAlpha;
                ctx.translate(this.x, this.y);
                ctx.rotate(this.angle + Math.PI / 2);
                ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH);
                ctx.rotate(-(this.angle + Math.PI / 2));
                ctx.translate(-this.x, -this.y);
                ctx.globalAlpha = 1.0;

                // Fade in new images
                if (this.imageAlpha < 1) {
                    this.imageAlpha = Math.min(1, this.imageAlpha + 0.05);
                }
            }

            ctx.restore();

            // ── Draw bubbles in world space ──
            this._drawBubbles(ctx);

            // ── Draw particles ──
            this._drawParticles(ctx);
        }

        _drawBubbles(ctx) {
            for (const b of this.bubbles) {
                const alpha = 1 - (b.age / b.life);
                // Limbic-aware bubble color: warm for positive valence
                const warmth = b.warmth || 0.5;
                const r = Math.floor(100 + warmth * 155);
                const g = Math.floor(150 + warmth * 105);
                const b_ = 255;

                ctx.fillStyle = `rgba(${r}, ${g}, ${b_}, ${0.25 * alpha})`;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                ctx.fill();

                // White highlight
                ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * alpha})`;
                ctx.beginPath();
                ctx.arc(b.x - b.size * 0.3, b.y - b.size * 0.3, b.size * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        _drawParticles(ctx) {
            for (const p of this.particles) {
                const alpha = 1 - (p.age / p.life);
                const progress = p.age / p.life;

                if (p.type === 'sparkle') {
                    // Twinkling star particle
                    const twinkle = Math.sin(p.age * 10) * 0.3 + 0.7;
                    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${alpha * twinkle})`;
                    ctx.beginPath();
                    // Draw a small 4-point star
                    const s = p.size * (1 - progress * 0.3);
                    ctx.moveTo(p.x, p.y - s);
                    ctx.lineTo(p.x + s * 0.3, p.y - s * 0.3);
                    ctx.lineTo(p.x + s, p.y);
                    ctx.lineTo(p.x + s * 0.3, p.y + s * 0.3);
                    ctx.lineTo(p.x, p.y + s);
                    ctx.lineTo(p.x - s * 0.3, p.y + s * 0.3);
                    ctx.lineTo(p.x - s, p.y);
                    ctx.lineTo(p.x - s * 0.3, p.y - s * 0.3);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }

        _drawEink(ctx, time) {
            // High-contrast silhouette for e-ink
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.moveTo(0, -50);
            ctx.lineTo(-15, -20);
            ctx.lineTo(-20, 0);
            ctx.lineTo(-15, 30);
            ctx.lineTo(0, 55);
            ctx.lineTo(15, 30);
            ctx.lineTo(20, 0);
            ctx.lineTo(15, -20);
            ctx.closePath();
            ctx.fill();

            // Simplified tail
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(-20, -10 + Math.sin(time * 3) * 5);
            ctx.lineTo(-15, 0);
            ctx.lineTo(-20, 8 + Math.sin(time * 3) * 5);
            ctx.lineTo(0, 5);
            ctx.fill();
        }
    }

    // ─── Bubble patterns per state (kept for compatibility) ───
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

    global.Angelfish = Angelfish;
})(window);
