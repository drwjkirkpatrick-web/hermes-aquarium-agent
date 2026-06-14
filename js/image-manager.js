/**
 * image-manager.js v2 — Image Asset Management for Hermes Aquarium
 *
 * Loads, caches, and selects the appropriate generated image based on:
 *   - Hermes agent state (idle, active, thinking, ...)
 *   - Screen aspect ratio (landscape, portrait, square)
 *   - Limbic mood variant (standard, optimistic, midnight, cinematic)
 *
 * v2 changes:
 *   - WebP-first with PNG fallback
 *   - Progressive quality tiers (fast→standard→high)
 *   - Quality scoring from MANIFEST.json
 *   - Lazy loading for non-current states
 */

(function(global) {
    'use strict';

    const STATES = ['idle','active','thinking','success','error','sleeping','alert','learning','connecting','busy'];
    const ASPECTS = ['landscape','portrait','square'];
    const MOODS = ['standard', 'opt', 'mid', 'cine'];

    class ImageManager {
        constructor(options = {}) {
            this.basePath = options.basePath || 'assets/images';
            this.webpPath = options.webpPath || 'assets/images/webp';
            this.useWebP = options.useWebP !== false;
            this.webpSupported = this._checkWebPSupport();
            this.cache = new Map();          // filename → Image
            this.stateMap = {};              // state → aspect → mood[]
            this.currentEntry = null;
            this.nextEntry = null;
            this.transitionAlpha = 1.0;
            this.isTransitioning = false;
            this.transitionSpeed = options.transitionSpeed || 0.04;
            this.maxCacheSize = options.maxCacheSize || 12;
            this.onLoad = options.onLoad || (() => {});
            this.preloadTier = options.preloadTier || 'fast';  // fast|standard|high

            // Progressive loading queue
            this.pendingLoads = [];
            this.isLoading = false;
            this.priorityQueue = [];

            // Quality scores from manifest
            this.qualityScores = {};
            this._loadManifest();

            this._buildInventory();
        }

        _checkWebPSupport() {
            const canvas = document.createElement('canvas');
            if (canvas.getContext && canvas.getContext('2d')) {
                return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
            }
            return false;
        }

        async _loadManifest() {
            try {
                const resp = await fetch(`${this.basePath}/MANIFEST.json`, { cache: 'no-store' });
                if (resp.ok) {
                    this.qualityScores = await resp.json();
                }
            } catch (e) {
                // Manifest optional
            }
        }

        _buildInventory() {
            for (const state of STATES) {
                this.stateMap[state] = {};
                for (const aspect of ASPECTS) {
                    this.stateMap[state][aspect] = [];
                    for (const mood of MOODS) {
                        const suffix = mood === 'standard' ? '' : `_${mood}`;
                        const filename = `${state}_${aspect}${suffix}`;

                        // Determine best format
                        const { url, format } = this._getBestUrl(filename);

                        this.stateMap[state][aspect].push({
                            filename,
                            mood,
                            format,
                            loaded: false,
                            image: null,
                            url,
                            webpUrl: `${this.webpPath}/${filename}.webp`,
                            pngUrl: `${this.basePath}/${filename}.png`,
                            error: false,
                            quality: this.qualityScores[filename] || 0.5,
                        });
                    }
                }
            }
        }

        _getBestUrl(filename) {
            // Prefer WebP if supported and available
            if (this.webpSupported && this.useWebP) {
                return {
                    url: `${this.webpPath}/${filename}.webp`,
                    format: 'webp',
                };
            }
            return {
                url: `${this.basePath}/${filename}.png`,
                format: 'png',
            };
        }

        // ─── Progressive quality tiers ───
        setPreloadTier(tier) {
            this.preloadTier = tier;
        }

        // ─── Preload images for a given state/aspect ───
        async preload(state, aspect) {
            const entries = this.stateMap[state]?.[aspect] || [];
            const entriesToLoad = entries.filter(e => !e.loaded && !e.error);

            // Sort by quality score (best first)
            entriesToLoad.sort((a, b) => b.quality - a.quality);

            // Load current format first, then fallback
            for (const entry of entriesToLoad) {
                await this._loadEntry(entry);
            }
        }

        // ─── Load a single entry with format fallback ───
        async _loadEntry(entry) {
            if (entry.loaded || entry.error) return;

            // Check cache first
            const cacheKey = entry.webpUrl;  // Cache by full URL
            if (this.cache.has(cacheKey)) {
                entry.image = this.cache.get(cacheKey);
                entry.loaded = true;
                return;
            }

            try {
                const img = await this._loadImage(entry.url);
                entry.image = img;
                entry.loaded = true;
                this.cache.set(cacheKey, img);
                this.onLoad(entry.filename, img);
            } catch (e) {
                // Try PNG fallback
                if (entry.url !== entry.pngUrl) {
                    try {
                        const img = await this._loadImage(entry.pngUrl);
                        entry.image = img;
                        entry.loaded = true;
                        this.cache.set(entry.pngUrl, img);
                        this.onLoad(entry.filename, img);
                        return;
                    } catch (e2) {
                        // Both failed
                    }
                }
                entry.error = true;
                entry.loaded = true;
                console.warn('ImageManager: failed to load', entry.filename);
            }
        }

        _loadImage(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`Failed to load ${url}`));
                img.src = url;
            });
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

            if (isDeepNight && (allostatic > 0.55 || cortisol > 0.55)) return 'cine';
            if (isNight || isLowEnergy) return 'mid';
            if (valence > 0.58 && !isNight) return 'opt';
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

            if (this.currentEntry && this.currentEntry.filename === entry.filename) return false;

            this.nextEntry = entry;
            this.transitionAlpha = 0;
            this.isTransitioning = true;
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
            const imgRatio = imgW / imgH;

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
                if (this.currentEntry && this.currentEntry.image) {
                    ctx.globalAlpha = Math.max(0, 1 - this.transitionAlpha);
                    this._drawCover(ctx, this.currentEntry.image, w, h);
                }
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

        // ─── Draw limbic overlay effects ───
        drawOverlays(ctx, w, h, limbicParams) {
            const lp = limbicParams || {};
            const valence = lp.valence !== undefined ? lp.valence : 0.5;
            const dimFactor = lp.dimFactor !== undefined ? lp.dimFactor : 1.0;
            const dopamine = lp.dopamine !== undefined ? lp.dopamine : 0.3;
            const isNight = lp.isNight || false;
            const cortisol = lp.cortisol !== undefined ? lp.cortisol : 0;
            const allostatic = lp.allostatic !== undefined ? lp.allostatic : 0;

            // 1. Color temperature
            if (valence > 0.6) {
                ctx.fillStyle = `rgba(255, 200, 100, ${(valence - 0.6) * 0.15})`;
                ctx.fillRect(0, 0, w, h);
            } else if (valence < 0.4) {
                ctx.fillStyle = `rgba(100, 150, 255, ${(0.4 - valence) * 0.15})`;
                ctx.fillRect(0, 0, w, h);
            }

            // 2. Dimming
            if (dimFactor < 1.0) {
                ctx.fillStyle = `rgba(0, 10, 30, ${1 - dimFactor})`;
                ctx.fillRect(0, 0, w, h);
            }

            // 3. Bioluminescent glow
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

            // 4. Cortisol vignette
            if (cortisol > 0.5) {
                const vig = ctx.createRadialGradient(w/2, h/2, h*0.3, w/2, h/2, h*0.9);
                vig.addColorStop(0, 'rgba(0,0,0,0)');
                vig.addColorStop(1, `rgba(180, 60, 30, ${(cortisol - 0.5) * 0.25})`);
                ctx.fillStyle = vig;
                ctx.fillRect(0, 0, w, h);
            }

            // 5. Allostatic grain
            if (allostatic > 0.5) {
                ctx.fillStyle = `rgba(0, 0, 0, ${(allostatic - 0.5) * 0.1})`;
                for (let y = 0; y < h; y += 3) {
                    for (let x = 0; x < w; x += 3) {
                        if (Math.random() < 0.3) ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
        }

        // ─── Cache stats for debug ───
        getCacheStats() {
            return {
                cacheSize: this.cache.size,
                maxCacheSize: this.maxCacheSize,
                webpSupported: this.webpSupported,
                useWebP: this.useWebP,
                preloadTier: this.preloadTier,
            };
        }

        getCurrentInfo() {
            return {
                filename: this.currentEntry?.filename || 'none',
                format: this.currentEntry?.format || 'none',
                next: this.nextEntry?.filename || 'none',
                transitioning: this.isTransitioning,
                alpha: this.transitionAlpha,
            };
        }
    }

    global.ImageManager = ImageManager;
})(window);
