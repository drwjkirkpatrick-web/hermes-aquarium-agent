/**
 * aquarium.js — Main Orchestrator
 *
 * Initializes the canvas, creates the world (plants, rocks, bubbles, particles),
 * spawns the hero angelfish, and runs the animation loop.
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

    // ─── State manager ───
    const stateManager = new StateManager();

    // ─── Limbic bridge ───
    const limbicBridge = new LimbicBridge();
    let limbicParams = {};
    const limbicIndicator = document.getElementById('limbicIndicator');

    // ─── Screen profile ───
    let profile = Utils.detectScreenProfile();
    let isEink = profile.eink || document.body.classList.contains('e-ink');

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
            // Keep fish but adjust scale
            heroFish.scale = s;
            // Gently pull toward center
            heroFish.x = Utils.lerp(heroFish.x, w * 0.5, 0.1);
            heroFish.y = Utils.lerp(heroFish.y, h * 0.45, 0.1);
        }
    }

    // ─── E-Ink toggle ───
    einkToggle.addEventListener('click', () => {
        document.body.classList.toggle('e-ink');
        isEink = document.body.classList.contains('e-ink');
    });

    // ─── Main update ───
    function update(dt, time) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Update state manager
        stateManager.update(dt, time);

        // Refresh limbic bridge every ~2 seconds (or when state changes)
        if (Math.floor(time * 10) % 20 === 0) {
            limbicParams = limbicBridge.refresh();
            if (limbicIndicator) {
                const affect = limbicParams.rawLimbic?.dominant_affect || '—';
                limbicIndicator.textContent = ` | limbic: ${affect} (V${(limbicParams.valence*2-1).toFixed(2)} A${limbicParams.arousal.toFixed(2)})`;
            }
        }

        // Update environment
        plants.forEach(p => p.update(dt, time));
        rocks.forEach(r => { /* rocks are static */ });
        bubbles.forEach(b => b.update(dt, time));
        particles.forEach(p => p.update(dt, w, h));

        // Update hero fish (pass limbic params for nuanced behavior)
        heroFish.update(dt, time, stateManager, { w, h }, limbicParams);

        // Update status overlay text
        const state = stateManager.getState();
        if (statusText) {
            statusText.textContent = state;
            statusOverlay.classList.remove('hidden');
        }
    }

    // ─── Main render ───
    function render(dt, time) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // 1. Water background
        waterBg.draw(ctx, w, h, time, isEink);

        // 2. Sand floor
        Environment.drawSand(ctx, w, h, isEink);

        // 3. Background plants
        plants.filter(p => !p.isForeground).forEach(p => p.draw(ctx, time, isEink));

        // 4. Rocks
        rocks.forEach(r => r.draw(ctx, isEink));

        // 5. Ambient particles
        particles.forEach(p => p.draw(ctx, isEink));

        // 6. Ambient bubbles (behind fish)
        bubbles.forEach(b => b.draw(ctx, isEink));

        // 7. HERO FISH
        heroFish.draw(ctx, time, isEink);

        // 8. Foreground plants (in front of fish)
        plants.filter(p => p.isForeground).forEach(p => p.draw(ctx, time, isEink));

        // Debug: FPS
        if (debugPanel && fpsCounter) {
            // Handled by loop wrapper
        }
    }

    // ─── Start everything ───
    function init() {
        resize();

        const loop = Utils.createLoop(update, render);
        loop.start();

        // Periodic FPS update
        setInterval(() => {
            if (fpsCounter) fpsCounter.textContent = loop.getFps();
        }, 1000);
    }

    // Kick off when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);
