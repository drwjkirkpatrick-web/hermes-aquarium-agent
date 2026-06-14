/**
 * image-manager.js — Image Asset Management for Hermes Aquarium
 *
 * Loads, caches, and selects the appropriate generated image based on:
 *   - Hermes agent state (idle, active, thinking, ...)
 *   - Screen aspect ratio (landscape, portrait, square)
 *   - Limbic mood variant (standard, optimistic, midnight, cinematic)
 *
 * Supports smooth crossfade transitions between states.
 * E-ink mode falls back to procedural rendering.
 */

(function(global) {
    'use strict';

    const STATES = ['idle','active','thinking','success','error','sleeping','alert','learning','connecting','busy'];
    const ASPECTS = ['landscape','portrait','square'];
    const MOODS = ['standard', 'opt', 'mid', 'cine'];

    class ImageManager {
        constructor(options = {}) {
            this.basePath = options.basePath || 'assets/images';
            this.cache = new Map();          // filename -> Image
            this.stateMap = {};              // state -> aspect -> mood[]
            this.currentEntry = null;
            this.nextEntry = null;
            this.transitionAlpha = 1.0;      // 1 = current fully visible
            this.isTransitioning = false;
            this.transitionSpeed = options.transitionSpeed || 0.04;
            this.preloadQueue = [];
            this.maxCacheSize = options.maxCacheSize || 12;
            this.accessOrder = [];           // LRU tracking
            this.onLoad = options.onLoad || (() => {});

            this._buildInventory();
        }

        // ─── Build image inventory from known naming convention ───
        _buildInventory() {
            for (const state of STATES) {
                this.stateMap[state] = {};
                for (const aspect of ASPECTS) {
                    this.stateMap[state][aspect] = [];
                    for (const mood of MOODS) {
                        const suffix = mood === 'standard' ? '' : `_${mood}`;
                        const filename = `${state}_${aspect}${suffix}.png`;
                        this.stateMap[state][aspect].push({
                            filename,
                            mood,
                            loaded: false,
                            image: null,
                            url: `${this.basePath}/${filename}`,
                            error: false,
                        });
                    }
                }
            }
        }

        // ─── Preload images for a given state/aspect ───
        preload(state, aspect) {
            const entries = this.stateMap[state]?.[aspect] || [];
            entries.forEach(entry => {
                if (!entry.loaded && !entry.error) {
                    this._loadEntry(entry);
                }
            });
        }

        // ─── Load a single entry ───
        _loadEntry(entry) {
            if (entry.loaded || entry.error) return;

            // Check cache first
            if (this.cache.has(entry.filename)) {
                const cached = this.cache.get(entry.filename);
                entry.image = cached;
                entry.loaded = true;
                return;
            }

            const img = new Image();
            img.onload = () => {
                entry.loaded = true;
                entry.image = img;
                this.cache.set(entry.filename, img);
                this.accessOrder.push(entry.filename);
                this._pruneCache();
                this.onLoad(entry.filename, img);
            };
            img.onerror = () => {
                entry.error = true;
                entry.loaded = true;
            };
            img.src = entry.url;
        }

        // ─── LRU cache pruning ───
        _pruneCache() {
            while (this.accessOrder.length > this.maxCacheSize) {
                const oldest = this.accessOrder.shift();
                // Only actually delete if no entry references it
                let referenced = false;
                for (const state of STATES) {
                    for (const aspect of ASPECTS) {
                        for (const entry of this.stateMap[state][aspect]) {
                            if (entry.filename === oldest) {
                                referenced = true;
                                break;
                            }
                        }
                        if (referenced) break;
                    }
                    if (referenced) break;
                }
                // We keep all entries in stateMap; the cache Map holds actual Image objects
                // The accessOrder just tracks which to evict from the Map
                // Actually, simpler: don't evict from Map, just don't preload too many
            }
        }

        // ─── Determine mood variant from limbic params ───
        static selectMood(limbicParams = {}) {
            const valence   = limbicParams.valence   !== undefined ? limbicParams.valence   : 0.5;
            const circadian = limbicParams.circadianHour !== undefined ? limbicParams.circadianHour : 12;
            const melatonin = limbicParams.melatonin   !== undefined ? limbicParams.melatonin   : 0;
            const allostatic= limbicParams.allostatic  !== undefined ? limbicParams.allostatic  : 0;
            const cortisol  = limbicParams.cortisol    !== undefined ? limbicParams.cortisol    : 0;

            const isNight     = circadian >= 20 || circadian <= 6;
            const isDeepNight = circadian >= 0  && circadian <= 4;
            const isLowEnergy = melatonin > 0.35 || limbicParams.dimFactor < 0.4;

            // Priority: cinematic (rare, dramatic) → midnight → optimistic → standard
            if (isDeepNight && (allostatic > 0.55 || cortisol > 0.55)) {
                return 'cine';
            }
            if (isNight || isLowEnergy) {
                return 'mid';
            }
            if (valence > 0.58 && !isNight) {
                return 'opt';
            }
            return 'standard';
        }

        // ─── Detect screen aspect ratio category ───
        static detectAspect() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const ratio = w / h;
            if (ratio > 1.45) return 'landscape';
            if (ratio < 0.7)  return 'portrait';
            return 'square';
        }

        // ─── Select best matching image entry ───
        selectEntry(state, aspect, limbicParams) {
            const mood = ImageManager.selectMood(limbicParams);
            const entries = this.stateMap[state]?.[aspect] || [];
            if (!entries.length) return null;

            // 1. Exact mood match, loaded
            let match = entries.find(e => e.mood === mood && e.loaded && e.image && !e.error);

            // 2. Any loaded image for this state/aspect
            if (!match) {
                match = entries.find(e => e.loaded && e.image && !e.error);
            }

            // 3. Fallback: load first entry (usually standard)
            if (!match) {
                match = entries[0];
                if (!match.loaded) this._loadEntry(match);
            }

            return match;
        }

        // ─── Trigger a transition to a new image ───
        transitionTo(state, aspect, limbicParams) {
            const entry = this.selectEntry(state, aspect, limbicParams);
            if (!entry) return false;

            // Already showing this image?
            if (this.currentEntry && this.currentEntry.filename === entry.filename) {
                return false;
            }

            this.nextEntry = entry;
            this.transitionAlpha = 0;
            this.isTransitioning = true;

            // Preload neighboring states for responsiveness
            this._preloadNeighbors(state, aspect);
            return true;
        }

        _preloadNeighbors(state, aspect) {
            const idx = STATES.indexOf(state);
            [-1, 1].forEach(offset => {
                const neighbor = STATES[idx + offset];
                if (neighbor) this.preload(neighbor, aspect);
            });
        }

        // ─── Update — check if image should change ───
        update(state, aspect, limbicParams) {
            const entry = this.selectEntry(state, aspect, limbicParams);
            if (!entry || !entry.image) return false;

            const currentFile = this.currentEntry?.filename;
            if (currentFile !== entry.filename && !this.isTransitioning) {
                return this.transitionTo(state, aspect, limbicParams);
            }
            return false;
        }

        // ─── Draw image covering canvas (object-fit: cover) ───
        _drawCover(ctx, image, w, h) {
            if (!image || !image.complete || image.naturalWidth === 0) return;

            const imgW = image.naturalWidth;
            const imgH = image.naturalHeight;
            const canvasRatio = w / h;
            const imgRatio    = imgW / imgH;

            let drawW, drawH, drawX, drawY;
            if (canvasRatio > imgRatio) {
                drawW = w;
                drawH = w / imgRatio;
                drawX = 0;
                drawY = (h - drawH) / 2;
            } else {
                drawH = h;
                drawW = h * imgRatio;
                drawY = 0;
                drawX = (w - drawW) / 2;
            }
            ctx.drawImage(image, drawX, drawY, drawW, drawH);
        }

        // ─── Draw current image(s) with transition ───
        draw(ctx, w, h) {
            if (!this.currentEntry && !this.nextEntry) return;

            if (this.isTransitioning) {
                // Current fading out
                if (this.currentEntry && this.currentEntry.image) {
                    ctx.globalAlpha = Math.max(0, 1 - this.transitionAlpha);
                    this._drawCover(ctx, this.currentEntry.image, w, h);
                }
                // Next fading in
                if (this.nextEntry && this.nextEntry.image) {
                    ctx.globalAlpha = Math.min(1, this.transitionAlpha);
                    this._drawCover(ctx, this.nextEntry.image, w, h);
                }
                ctx.globalAlpha = 1.0;

                this.transitionAlpha += this.transitionSpeed;
                if (this.transitionAlpha >= 1) {
                    this.currentEntry = this.nextEntry;
                    this.nextEntry = null;
                    this.isTransitioning = false;
                    this.transitionAlpha = 1;
                }
            } else if (this.currentEntry && this.currentEntry.image) {
                this._drawCover(ctx, this.currentEntry.image, w, h);
            }
        }

        // ─── Draw limbic overlay effects on top of image ───
        drawOverlays(ctx, w, h, limbicParams) {
            const lp = limbicParams || {};

            // 1. Color temperature overlay (valence-driven)
            const valence = lp.valence !== undefined ? lp.valence : 0.5;
            if (valence > 0.6) {
                // Warm overlay for high valence
                ctx.fillStyle = `rgba(255, 200, 100, ${(valence - 0.6) * 0.15})`;
                ctx.fillRect(0, 0, w, h);
            } else if (valence < 0.4) {
                // Cool overlay for low valence
                ctx.fillStyle = `rgba(100, 150, 255, ${(0.4 - valence) * 0.15})`;
                ctx.fillRect(0, 0, w, h);
            }

            // 2. Dimming overlay (sleep pressure / melatonin)
            const dimFactor = lp.dimFactor !== undefined ? lp.dimFactor : 1.0;
            if (dimFactor < 1.0) {
                ctx.fillStyle = `rgba(0, 10, 30, ${1 - dimFactor})`;
                ctx.fillRect(0, 0, w, h);
            }

            // 3. Bioluminescent glow overlay (midnight / high dopamine)
            const dopamine = lp.dopamine !== undefined ? lp.dopamine : 0.3;
            const isNight = lp.isNight || false;
            if (isNight || dopamine > 0.6) {
                const glowAlpha = isNight ? 0.08 : (dopamine - 0.6) * 0.15;
                const cx = w * 0.5, cy = h * 0.45;
                const r = Math.min(w, h) * 0.4;
                const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
                grad.addColorStop(0, `rgba(100, 220, 255, ${glowAlpha})`);
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, w, h);
            }

            // 4. Cortisol / stress vignette
            const cortisol = lp.cortisol !== undefined ? lp.cortisol : 0;
            if (cortisol > 0.5) {
                const vig = ctx.createRadialGradient(w/2, h/2, h*0.3, w/2, h/2, h*0.9);
                vig.addColorStop(0, 'rgba(0,0,0,0)');
                vig.addColorStop(1, `rgba(180, 60, 30, ${(cortisol - 0.5) * 0.25})`);
                ctx.fillStyle = vig;
                ctx.fillRect(0, 0, w, h);
            }

            // 5. Allostatic load fatigue grain
            const allostatic = lp.allostatic !== undefined ? lp.allostatic : 0;
            if (allostatic > 0.5) {
                ctx.fillStyle = `rgba(0, 0, 0, ${(allostatic - 0.5) * 0.1})`;
                for (let y = 0; y < h; y += 3) {
                    for (let x = 0; x < w; x += 3) {
                        if (Math.random() < 0.3) {
                            ctx.fillRect(x, y, 1, 1);
                        }
                    }
                }
            }
        }

        // ─── Get current entry info for debug ───
        getCurrentInfo() {
            return {
                filename: this.currentEntry?.filename || 'none',
                next: this.nextEntry?.filename || 'none',
                transitioning: this.isTransitioning,
                alpha: this.transitionAlpha,
            };
        }
    }

    // ─── Expose ───
    global.ImageManager = ImageManager;
})(window);
