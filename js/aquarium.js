/**
 * aquarium.js — Main Orchestrator (Image + Limbic Integrated)
 *
 * Initializes the canvas, creates the world, spawns the hero angelfish,
 * manages image assets via ImageManager, and polls limbic state.
 * Handles resize events, e-ink toggle, and debug display.
 */

(function(global) {
    'use strict';

    // ─── Canvas setup ───
    const canvas = document.getElementById('aquariumCanvas');
    const ctx = canvas.getContext('2d');
    const statusOverlay = document.getElementById('statusOverlay');
    const statusText = document.getElementById('statusText');
    const debugPanel = document.getElementById('debugPanel');
    const profileName = document.getElementById('profileName');
    const fpsCounter = document.getElementById('fpsCounter');
    const einkToggle = document.getElementById('einkToggle');
    const limbicIndicator = document.getElementById('limbicIndicator');

    // ─── State manager ───
    const stateManager = new StateManager();

    // ─── Limbic bridge (enhanced v2) ───
    const limbicBridge = new LimbicBridge({ useApi: true });
    let limbicResult = { fishParams: {}, imageParams: {} };
    let limbicConnected = false;

    // ─── Image Manager ───
    const imageManager = new ImageManager({
        basePath: 'assets/images',
        transitionSpeed: 0.03,
        maxCacheSize: 10,
    });

    // ─── Screen profile ───
    let profile = Utils.detectScreenProfile();
    let isEink = profile.eink || document.body.classList.contains('e-ink');
    let currentAspect = 'landscape';

    // ─── World objects ───
    let waterBg, plants = [], rocks = [], bubbles = [], particles = [];
    let heroFish;

    // ─── Resize handling ───
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.scale(dpr, dpr);

        profile = Utils.detectScreenProfile();
        isEink = profile.eink || document.body.classList.contains('e-ink');
        currentAspect = ImageManager.detectAspect();

        // Rebuild world objects for new size
        buildWorld();

        if (debugPanel) {
            profileName.textContent = `${profile.name} (${Math.round(window.innerWidth)}×${Math.round(window.innerHeight)})`;
        }
    }

    const debouncedResize = Utils.debounce(resize, 250);
    window.addEventListener('resize', debouncedResize);

    // ─── Build / rebuild the world ───
    function buildWorld() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const s = profile.scale;

        // Water background (reusable)
        waterBg = new Environment.WaterBackground();

        // ── Plants: tall swaying green, left and right edges ──
        plants = [];
        const plantCount = Math.floor(w / (isEink ? 80 : 60));

        // Background plants (left edge)
        for (let i = 0; i < Math.ceil(plantCount * 0.4); i++) {
            const px = Utils.rand(5, w * 0.15);
            const pHeight = Utils.rand(80, 150) * s;
            plants.push(new Environment.Plant(
                px, h - h * 0.08, pHeight,
                Math.random() > 0.5 ? 'vallisneria' : 'crypt',
                false
            ));
        }

        // Background plants (right edge)
        for (let i = 0; i < Math.ceil(plantCount * 0.4); i++) {
            const px = Utils.rand(w * 0.85, w - 5);
            const pHeight = Utils.rand(80, 150) * s;
            plants.push(new Environment.Plant(
                px, h - h * 0.08, pHeight,
                Math.random() > 0.5 ? 'vallisneria' : 'crypt',
                false
            ));
        }

        // Foreground plants (fewer, slightly in front)
        if (!isEink) {
            for (let i = 0; i < Math.ceil(plantCount * 0.15); i++) {
                const side = Math.random() > 0.5 ? 'left' : 'right';
                const px = side === 'left'
                    ? Utils.rand(2, w * 0.1)
                    : Utils.rand(w * 0.9, w - 2);
                plants.push(new Environment.Plant(
                    px, h, Utils.rand(60, 100) * s, 'crypt', true
                ));
            }
        }

        // ── Rocks: sparse, bottom, with personality ──
        rocks = [];
        const rockCount = isEink ? 3 : Math.floor(w / 250 * s);
        const personalities = ['tall', 'round', 'cave', 'round', 'tall'];
        for (let i = 0; i < rockCount; i++) {
            const rx = Utils.rand(w * 0.1, w * 0.9);
            const ry = h - Utils.rand(5, 25) * s;
            const rsize = Utils.rand(12, 25) * s;
            rocks.push(new Environment.Rock(rx, ry, rsize, personalities[i % personalities.length]));
        }

        // ── Ambient bubbles ──
        bubbles = [];
        const bubbleCount = isEink ? 5 : 15;
        for (let i = 0; i < bubbleCount; i++) {
            bubbles.push(new Environment.Bubble(
                Utils.rand(0, w),
                Utils.rand(0, h),
                Utils.rand(1.5, 5)
            ));
        }

        // ── Floating particles ──
        particles = [];
        if (!isEink) {
            const particleCount = Math.floor((w * h) / 12000);
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Environment.Particle(w, h));
            }
        }

        // ── Hero fish ──
        if (!heroFish) {
            heroFish = new Angelfish(w * 0.5, h * 0.45, s);
        } else {
            heroFish.scale = s;
            heroFish.x = Utils.lerp(heroFish.x, w * 0.5, 0.1);
            heroFish.y = Utils.lerp(heroFish.y, h * 0.45, 0.1);
        }
    }

    // ─── E-Ink toggle ───
    einkToggle.addEventListener('click', () => {
        document.body.classList.toggle('e-ink');
        isEink = document.body.classList.contains('e-ink');
    });

    // ─── Async limbic refresh ───
    async function refreshLimbic() {
        try {
            const result = await limbicBridge.refresh();
            limbicResult = result;
            limbicConnected = true;

            const imgParams = result.imageParams || {};
            const fishParams = result.fishParams || {};
            const derivedState = fishParams.derivedState || stateManager.getState();

            // Update status overlay with emotional context
            if (statusText) {
                const affect = (result.fishParams?.rawLimbic?.dominant_affect || '');
                const mood = imgParams.mood || 'standard';
                statusText.textContent = `${derivedState}${affect ? ' · ' + affect : ''}`;
            }

            // Update limbic indicator
            if (limbicIndicator) {
                const v = (fishParams.valence || 0.5);
                const a = (fishParams.arousal || 0);
                const isNight = imgParams.isNight || false;
                limbicIndicator.textContent = ` | ${isNight ? '🌙' : '☀️'} V${(v*2-1).toFixed(2)} A${a.toFixed(2)} [${imgParams.mood || 'std'}]`;
            }

            // Set fish image from ImageManager
            if (!isEink) {
                const entry = imageManager.selectEntry(
                    derivedState,
                    currentAspect,
                    imgParams.overlays || {}
                );
                if (entry && entry.image) {
                    heroFish.setImage(entry.image);
                }

                // Trigger image transition if needed
                imageManager.update(derivedState, currentAspect, imgParams.overlays || {});
            }

            return result;
        } catch (e) {
            console.warn('Aquarium: limbic refresh failed:', e);
            limbicConnected = false;
            return null;
        }
    }

    // ─── Main update ───
    function update(dt, time) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Update state manager
        stateManager.update(dt, time);

        // Refresh limbic bridge every ~2 seconds
        if (Math.floor(time * 10) % 20 === 0) {
            refreshLimbic();
        }

        // Re-detect aspect ratio
        const detected = ImageManager.detectAspect();
        if (detected !== currentAspect) {
            currentAspect = detected;
            if (!isEink) {
                const imgParams = limbicResult.imageParams || {};
                imageManager.update(
                    stateManager.getState(),
                    currentAspect,
                    imgParams.overlays || {}
                );
            }
        }

        // Update environment
        plants.forEach(p => p.update(dt, time));
        rocks.forEach(r => { /* static */ });
        bubbles.forEach(b => b.update(dt, time));
        particles.forEach(p => p.update(dt, w, h));

        // Update hero fish with limbic params
        const fishParams = limbicResult.fishParams || {};
        heroFish.update(dt, time, stateManager, { w, h }, fishParams);
    }

    // ─── Main render ───
    function render(dt, time) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Clear
        ctx.clearRect(0, 0, w, h);

        if (isEink) {
            // E-ink: procedural rendering only
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);

            // Dithered water
            ctx.fillStyle = '#000';
            for (let y = 0; y < h; y += 4) {
                for (let x = 0; x < w; x += 4) {
                    if ((x + y) % 8 === 0 || (x - y) % 8 === 0) {
                        ctx.fillRect(x, y, 2, 2);
                    }
                }
            }

            // Sand
            const sandY = h - h * 0.08;
            ctx.fillRect(0, sandY, w, h - sandY);

            // Simplified fish
            heroFish.draw(ctx, time, true);
            return;
        }

        // ─── FULL COLOR MODE: Image-first rendering ───

        // 1. Draw background image (if available) or procedural water
        const imgParams = limbicResult.imageParams || {};
        const overlays = imgParams.overlays || {};

        // Check if there's a background image to use
        // For now, draw procedural water first, then image on top
        waterBg.draw(ctx, w, h, time, false);

        // 2. Sand floor
        Environment.drawSand(ctx, w, h, false);

        // 3. Background plants
        plants.filter(p => !p.isForeground).forEach(p => p.draw(ctx, time, false));

        // 4. Rocks
        rocks.forEach(r => r.draw(ctx, false));

        // 5. Ambient particles
        particles.forEach(p => p.draw(ctx, false));

        // 6. Ambient bubbles
        bubbles.forEach(b => b.draw(ctx, false));

        // 7. Draw image manager transition (hero fish background)
        // The image manager draws the fish image
        imageManager.draw(ctx, w, h);

        // 8. Limbic overlay effects (temperature, dimming, glow)
        imageManager.drawOverlays(ctx, w, h, overlays);

        // 9. HERO FISH — procedural overlays on top of image
        // The fish draws sparkle particles, bubbles, etc.
        heroFish.draw(ctx, time, false);

        // 10. Foreground plants
        plants.filter(p => p.isForeground).forEach(p => p.draw(ctx, time, false));

        // 11. Debug overlay
        if (debugPanel && fpsCounter) {
            // FPS updated by loop
        }
    }

    // ─── Start everything ───
    async function init() {
        resize();

        // Preload images for the initial state
        imageManager.preload(stateManager.getState(), currentAspect);

        // Do an initial limbic refresh
        await refreshLimbic();

        const loop = Utils.createLoop(update, render);
        loop.start();

        // Periodic FPS update
        setInterval(() => {
            if (fpsCounter) fpsCounter.textContent = loop.getFps();

            // Update debug with image info
            if (debugPanel) {
                const imgInfo = imageManager.getCurrentInfo();
                if (imgInfo.filename !== 'none') {
                    // Append image info to existing text
                    const base = profileName.textContent.split(' | ')[0];
                    profileName.textContent = `${base} | img: ${imgInfo.filename}`;
                }
            }
        }, 1000);
    }

    // Kick off when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);
