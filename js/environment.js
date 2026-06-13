/**
 * environment.js — The Aquarium World
 *
 * Renders: water background with caustic rays, swaying plants,
 *          personality rocks, bubbles, particles, and sand.
 */

(function(global) {
    'use strict';

    // ─── Plant Class: swaying green aquatic plants ───
    class Plant {
        constructor(x, baseY, height, type = 'vallisneria', isForeground = false) {
            this.x = x;
            this.baseY = baseY;
            this.height = height;
            this.type = type;          // 'vallisneria' (tall thin) or 'crypt' (bushy)
            this.isForeground = isForeground;
            this.swayOffset = Math.random() * Math.PI * 2;
            this.swaySpeed = Utils.rand(0.8, 1.4);
            this.segments = Math.floor(height / (isForeground ? 12 : 18));
            this.leafWidths = [];
            for (let i = 0; i < this.segments; i++) {
                this.leafWidths.push(Utils.rand(0.6, 1.4));
            }
        }

        update(dt, time) {
            // Plants sway based on simple noise + sine
            this.swayAngle = Utils.simpleNoise(this.x * 0.01, time) * 0.15 +
                             Math.sin(time * this.swaySpeed + this.swayOffset) * 0.1;
        }

        draw(ctx, time, isEink) {
            ctx.save();
            const segH = this.height / this.segments;
            let curX = this.x;
            let curY = this.baseY;

            // Build the plant as a tapered ribbon
            ctx.beginPath();
            ctx.moveTo(curX - 3, curY);

            for (let i = 0; i < this.segments; i++) {
                const progress = i / this.segments;
                const sway = Math.sin(time * this.swaySpeed + this.swayOffset + i * 0.3) *
                               (10 * (1 - progress * 0.5)) * (this.isForeground ? 1.5 : 1);
                curX += sway * dt * 60 * 0.016; // Normalize to ~60fps feel
                curY -= segH;
                const w = (1 - progress * 0.7) * 6 * this.leafWidths[i];
                ctx.lineTo(curX - w, curY);
            }

            // Right edge going back down
            for (let i = this.segments - 1; i >= 0; i--) {
                const progress = i / this.segments;
                const sway = Math.sin(time * this.swaySpeed + this.swayOffset + i * 0.3) *
                               (10 * (1 - progress * 0.5)) * (this.isForeground ? 1.5 : 1);
                const px = this.x + sway * 0.5;
                const py = this.baseY - (i + 1) * segH;
                const w = (1 - progress * 0.7) * 6 * this.leafWidths[i];
                ctx.lineTo(px + w, py);
            }

            ctx.closePath();

            if (isEink) {
                ctx.fillStyle = '#000';
                ctx.fill();
            } else {
                // Gradient from deep green at bottom to lighter at top
                const grad = ctx.createLinearGradient(this.x, this.baseY, this.x, this.baseY - this.height);
                if (this.isForeground) {
                    grad.addColorStop(0, '#0d4f1c');
                    grad.addColorStop(0.5, '#1a8a35');
                    grad.addColorStop(1, '#2ecc71');
                } else {
                    grad.addColorStop(0, '#0a3d18');
                    grad.addColorStop(0.5, '#0f5c28');
                    grad.addColorStop(1, '#1a6b33');
                }
                ctx.fillStyle = grad;
                ctx.fill();

                // Add translucent glow for background plants
                if (!this.isForeground) {
                    ctx.globalAlpha = 0.15;
                    ctx.fillStyle = '#4ade80';
                    ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            }
            ctx.restore();
        }
    }

    // ─── Rock Class: personality stones at the bottom ───
    class Rock {
        constructor(x, y, size, personality) {
            this.x = x;
            this.y = y;
            this.size = size;          // Base radius
            this.personality = personality;
            this.points = this._generateShape();
        }

        _generateShape() {
            const pts = [];
            const count = 8 + Math.floor(this.size / 4);
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                let r = this.size * Utils.rand(0.7, 1.3);
                // Flatten bottom
                if (angle > Math.PI * 0.7 && angle < Math.PI * 1.3) {
                    r *= 0.5;
                }
                // Personality bumps
                if (this.personality === 'tall') {
                    if (angle > Math.PI * 0.3 && angle < Math.PI * 0.7) r *= 1.4;
                } else if (this.personality === 'round') {
                    r = this.size * Utils.rand(0.9, 1.1);
                } else if (this.personality === 'cave') {
                    if (angle > Math.PI * 0.8 && angle < Math.PI * 1.2) r *= 0.3;
                }
                pts.push({
                    x: Math.cos(angle) * r,
                    y: Math.sin(angle) * r * 0.7 // Flatten vertically
                });
            }
            return pts;
        }

        draw(ctx, isEink) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.beginPath();
            ctx.moveTo(this.points[0].x, this.points[0].y);
            for (let i = 1; i < this.points.length; i++) {
                const p = this.points[i];
                const prev = this.points[i - 1];
                const cpX = (prev.x + p.x) / 2 + Utils.rand(-2, 2);
                const cpY = (prev.y + p.y) / 2 + Utils.rand(-2, 2);
                ctx.quadraticCurveTo(cpX, cpY, p.x, p.y);
            }
            ctx.closePath();

            if (isEink) {
                ctx.fillStyle = '#000';
                ctx.fill();
            } else {
                // Rock gradient: cool grey-brown
                const grad = ctx.createRadialGradient(
                    -this.size * 0.2, -this.size * 0.3, 2,
                    0, 0, this.size
                );
                grad.addColorStop(0, '#8a8a7a');
                grad.addColorStop(0.6, '#5c5c52');
                grad.addColorStop(1, '#3a3a34');
                ctx.fillStyle = grad;
                ctx.fill();

                // Moss highlight
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#4a7c3a';
                ctx.beginPath();
                ctx.arc(-this.size * 0.1, -this.size * 0.2, this.size * 0.4, Math.PI, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
            ctx.restore();
        }
    }

    // ─── Bubble Class: rising air bubbles ───
    class Bubble {
        constructor(x, y, size) {
            this.reset(x, y, size);
        }

        reset(x, y, size) {
            this.x = x !== undefined ? x : Utils.rand(0, window.innerWidth);
            this.y = y !== undefined ? y : window.innerHeight + Utils.rand(0, 100);
            this.baseX = this.x;
            this.size = size || Utils.rand(1.5, 4.5);
            this.speed = Utils.rand(20, 50) / this.size; // Smaller bubbles rise slower
            this.wobbleSpeed = Utils.rand(1.5, 3);
            this.wobbleAmp = Utils.rand(5, 15);
            this.wobbleOffset = Math.random() * Math.PI * 2;
            this.life = 0;
        }

        update(dt, time) {
            this.life += dt;
            this.y -= this.speed * dt * 60;
            this.x = this.baseX + Math.sin(time * this.wobbleSpeed + this.wobbleOffset) * this.wobbleAmp;

            // Reset if above top
            if (this.y < -this.size * 2) {
                this.reset();
                this.y = window.innerHeight + Utils.rand(0, 50);
            }
        }

        draw(ctx, isEink) {
            if (isEink) {
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.stroke();
                // Small highlight dot
                ctx.fillStyle = '#000';
                ctx.beginPath();
                ctx.arc(this.x - this.size * 0.3, this.y - this.size * 0.3, this.size * 0.2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Soft bubble with highlight
                ctx.fillStyle = `rgba(200, 240, 255, ${0.25 + this.size * 0.05})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();

                // White highlight
                ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + this.size * 0.05})`;
                ctx.beginPath();
                ctx.arc(this.x - this.size * 0.3, this.y - this.size * 0.3, this.size * 0.35, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ─── Particle: ambient marine snow / motes ───
    class Particle {
        constructor(w, h) {
            this.reset(w, h);
        }

        reset(w, h) {
            this.x = Utils.rand(0, w);
            this.y = Utils.rand(0, h);
            this.vx = Utils.rand(-3, 3);
            this.vy = Utils.rand(-1, 2);
            this.size = Utils.rand(0.5, 2);
            this.alpha = Utils.rand(0.1, 0.4);
            this.life = Utils.rand(0, 100);
        }

        update(dt, w, h) {
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;
            this.life += dt;

            // Drift with "current"
            this.x += Math.sin(this.life * 0.3) * 0.3;

            if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) {
                this.reset(w, h);
            }
        }

        draw(ctx, isEink) {
            if (isEink) return; // Skip on e-ink
            ctx.fillStyle = `rgba(180, 230, 255, ${this.alpha})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ─── Water Background Renderer ───
    class WaterBackground {
        constructor() {
            this.rayOffset = 0;
        }

        draw(ctx, w, h, time, isEink) {
            if (isEink) {
                // E-ink: simple dithered water texture
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#000';
                for (let y = 0; y < h; y += 4) {
                    for (let x = 0; x < w; x += 4) {
                        if ((x + y) % 8 === 0 || (x - y) % 8 === 0) {
                            ctx.fillRect(x, y, 2, 2);
                        }
                    }
                }
                return;
            }

            // Full color: deep ocean gradient
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#0a5a7a');   // Surface: lighter teal
            grad.addColorStop(0.3, '#054a66');
            grad.addColorStop(0.7, '#02344a');
            grad.addColorStop(1, '#001d2e'); // Deep: dark blue-black
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // Caustic light rays from surface
            this.drawCaustics(ctx, w, h, time);

            // Subtle surface shimmer
            ctx.fillStyle = 'rgba(100, 220, 255, 0.03)';
            for (let i = 0; i < 5; i++) {
                const x = (Math.sin(time * 0.2 + i * 1.5) * 0.5 + 0.5) * w;
                const rw = w * 0.15 + Math.sin(time + i) * w * 0.05;
                ctx.fillRect(x - rw / 2, 0, rw, h * 0.6);
            }
        }

        drawCaustics(ctx, w, h, time) {
            ctx.save();
            ctx.globalAlpha = 0.04;
            ctx.strokeStyle = '#a0e8ff';
            ctx.lineWidth = 2;

            for (let i = 0; i < 8; i++) {
                const xBase = (i / 8) * w + Math.sin(time * 0.3 + i) * w * 0.05;
                ctx.beginPath();
                ctx.moveTo(xBase, 0);
                for (let y = 0; y < h; y += 10) {
                    const xOff = Math.sin(y * 0.02 + time * 0.8 + i * 2) * 15;
                    ctx.lineTo(xBase + xOff, y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // ─── Sand Floor ───
    function drawSand(ctx, w, h, isEink) {
        const sandY = h - h * 0.08;
        if (isEink) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, sandY, w, h - sandY);
            // Dithered texture
            ctx.fillStyle = '#fff';
            for (let x = 0; x < w; x += 3) {
                const wave = Math.sin(x * 0.05) * 3;
                if (x % 6 === 0) ctx.fillRect(x, sandY + wave + 2, 1, 1);
            }
            return;
        }

        const grad = ctx.createLinearGradient(0, sandY, 0, h);
        grad.addColorStop(0, '#c9b896');
        grad.addColorStop(0.5, '#b8a27a');
        grad.addColorStop(1, '#9c8560');
        ctx.fillStyle = grad;
        ctx.fillRect(0, sandY, w, h - sandY);

        // Subtle ripple lines on sand
        ctx.strokeStyle = 'rgba(140, 120, 90, 0.2)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, sandY + 5);
            for (let y = sandY + 5; y < h; y += 5) {
                ctx.lineTo(x + Math.sin(y * 0.1 + x * 0.02) * 5, y);
            }
            ctx.stroke();
        }
    }

    // ─── Exports ───
    global.Environment = {
        Plant,
        Rock,
        Bubble,
        Particle,
        WaterBackground,
        drawSand
    };
})(window);
