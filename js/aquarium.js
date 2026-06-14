/**
 * aquarium.js — Main Orchestrator (Full Enhancement Suite)
 *
 * Initializes the canvas, manages all subsystems, and runs the animation loop.
 * Subsystems: image assets, limbic bridge, audio, touch, HUD, weather, capture.
 */

(function(global) {
    'use strict';

    const canvas = document.getElementById('aquariumCanvas');
    const ctx = canvas.getContext('2d');
    const statusOverlay = document.getElementById('statusOverlay');
    const statusText = document.getElementById('statusText');
    const debugPanel = document.getElementById('debugPanel');
    const profileName = document.getElementById('profileName');
    const fpsCounter = document.getElementById('fpsCounter');
    const einkToggle = document.getElementById('einkToggle');
    const hudToggle = document.getElementById('hudToggle');
    const audioToggle = document.getElementById('audioToggle');
    const captureBtn = document.getElementById('captureBtn');
    const weatherIndicator = document.getElementById('weatherIndicator');
    const weatherIcon = document.getElementById('weatherIcon');
    const weatherTemp = document.getElementById('weatherTemp');
    const limbicIndicator = document.getElementById('limbicIndicator');
    const cacheIndicator = document.getElementById('cacheIndicator');
    const srAnnouncer = document.getElementById('sr-announcer');

    // ─── State manager ───
    const stateManager = new StateManager();

    // ─── Limbic bridge ───
    const limbicBridge = new LimbicBridge({ useApi: true });
    let limbicResult = { fishParams: {}, imageParams: {} };
    let limbicConnected = false;

    // ─── Image Manager (v2 with WebP) ───
    const imageManager = new ImageManager({
        basePath: 'assets/images',
        webpPath: 'assets/images/webp',
        useWebP: true,
        transitionSpeed: 0.03,
        maxCacheSize: 10,
    });

    // ─── Audio Engine ───
    const audioEngine = new AquariumAudio({ baseVolume: 0.25 });

    // ─── Touch Engine ───
    const touchEngine = new TouchEngine(canvas, {
        stateManager,
        audioEngine,
        onPoke: (x, y) => {
            // Temporary cortisol spike on poke
            announce('Poked the fish!');
            // Spawn a food particle at the tap position
            if (heroFish) {
                heroFish.targetX = x;
                heroFish.targetY = y;
            }
        },
        onFeed: (x, y) => {
            announce('Fed the fish');
            // Could spawn food particles here
        },
        onSwipe: (dir, dx, dy) => {
            announce(`Swiped ${dir}`);
        },
        onDoubleTap: () => {
            toggleHud();
        },
        onKey: (key) => {
            if (key === 'mute') toggleAudio();
            if (key === 'eink') toggleEink();
        },
    });

    // ─── HUD Overlay ───
    const hud = new NeurochemicalHUD();

    // ─── Weather Sync ───
    const weatherSync = new WeatherSync({
        location: 'auto',
        updateInterval: 10 * 60 * 1000,  // 10 minutes
    });

    // ─── Capture Module ───
    const captureModule = new CaptureModule({
        canvas,
        recordDuration: 5000,
        onStart: () => {
            captureBtn.textContent = '⏹️';
            announce('Recording started');
        },
        onStop: (result) => {
            captureBtn.textContent = '📷';
            announce('Recording saved');

            // Auto-download
            captureModule.download(result);

            // Share message
            const msg = CaptureModule.formatShareMessage({
                state: stateManager.getState(),
                dominant_affect: limbicResult.fishParams?.rawLimbic?.dominant_affect || 'calm',
                valence: (limbicResult.fishParams?.valence || 0.5),
                arousal: (limbicResult.fishParams?.arousal || 0),
                imageMood: limbicResult.imageParams?.mood || 'standard',
            });
            console.log('Share message:', msg);
        },
        onError: (...args) => console.error('Capture error:', ...args),
    });

    // ─── Screen profile ───
    let profile = Utils.detectScreenProfile();
    let isEink = profile.eink || document.body.classList.contains('e-ink');
    let currentAspect = 'landscape';

    // ─── World objects ───
    let waterBg, plants = [], rocks = [], bubbles = [], particles = [];
    let heroFish;
    let foodParticles = [];

    // ─── Announcement helper ───
    function announce(msg) {
        if (srAnnouncer) srAnnouncer.textContent = msg;
    }

    // ─── Resize ───
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        ctx.scale(dpr, dpr);

        profile = Utils.detectScreenProfile();
        isEink = profile.eink || document.body.classList.contains('e-ink');
        currentAspect = ImageManager.detectAspect();

        buildWorld();

        if (profileName) {
            profileName.textContent = `${profile.name} (${Math.round(window.innerWidth)}×${Math.round(window.innerHeight)})`;
        }
    }
    const debouncedResize = Utils.debounce(resize, 250);
    window.addEventListener('resize', debouncedResize);

    // ─── Build world ───
    function buildWorld() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const s = profile.scale;

        waterBg = new Environment.WaterBackground();
        plants = [];

        const plantCount = Math.floor(w / (isEink ? 80 : 60));
        for (let i = 0; i < Math.ceil(plantCount * 0.4); i++) {
            const px = Utils.rand(5, w * 0.15);
            plants.push(new Environment.Plant(
                px, h - h * 0.08, Utils.rand(80, 150) * s,
                Math.random() > 0.5 ? 'vallisneria' : 'crypt', false
            ));
        }
        for (let i = 0; i < Math.ceil(plantCount * 0.4); i++) {
            const px = Utils.rand(w * 0.85, w - 5);
            plants.push(new Environment.Plant(
                px, h - h * 0.08, Utils.rand(80, 150) * s,
                Math.random() > 0.5 ? 'vallisneria' : 'crypt', false
            ));
        }
        if (!isEink) {
            for (let i = 0; i < Math.ceil(plantCount * 0.15); i++) {
                const side = Math.random() > 0.5 ? 'left' : 'right';
                const px = side === 'left' ? Utils.rand(2, w * 0.1) : Utils.rand(w * 0.9, w - 2);
                plants.push(new Environment.Plant(px, h, Utils.rand(60, 100) * s, 'crypt', true));
            }
        }

        rocks = [];
        const rockCount = isEink ? 3 : Math.floor(w / 250 * s);
        const personalities = ['tall', 'round', 'cave', 'round', 'tall'];
        for (let i = 0; i < rockCount; i++) {
            rocks.push(new Environment.Rock(
                Utils.rand(w * 0.1, w * 0.9),
                h - Utils.rand(5, 25) * s,
                Utils.rand(12, 25) * s,
                personalities[i % personalities.length]
            ));
        }

        bubbles = [];
        const bubbleCount = isEink ? 5 : 15;
        for (let i = 0; i < bubbleCount; i++) {
            bubbles.push(new Environment.Bubble(
                Utils.rand(0, w), Utils.rand(0, h), Utils.rand(1.5, 5)
            ));
        }

        particles = [];
        if (!isEink) {
            const particleCount = Math.floor((w * h) / 12000);
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Environment.Particle(w, h));
            }
        }

        if (!heroFish) {
            heroFish = new Angelfish(w * 0.5, h * 0.45, s);
        } else {
            heroFish.scale = s;
        }
    }

    // ─── Toggle helpers ───
    function toggleEink() {
        document.body.classList.toggle('e-ink');
        isEink = document.body.classList.contains('e-ink');
        buildWorld();
    }

    function toggleHud() {
        if (hud) hud.toggle();
    }

    function toggleAudio() {
        if (!audioEngine.ctx) {
            audioEngine.init();
            audioToggle.textContent = '🔊';
            announce('Audio enabled');
        } else {
            audioEngine.toggleMute();
            audioToggle.textContent = audioEngine.isMuted ? '🔇' : '🔊';
            announce(audioEngine.isMuted ? 'Audio muted' : 'Audio unmuted');
        }
    }

    // ─── Limbic refresh ───
    async function refreshLimbic() {
        try {
            const result = await limbicBridge.refresh();
            limbicResult = result;
            limbicConnected = true;

            const imgParams = result.imageParams || {};
            const fishParams = result.fishParams || {};
            const derivedState = fishParams.derivedState || stateManager.getState();

            if (statusText) {
                const affect = (result.fishParams?.rawLimbic?.dominant_affect || '');
                statusText.textContent = `${derivedState}${affect ? ' · ' + affect : ''}`;
            }

            if (limbicIndicator) {
                const v = (fishParams.valence || 0.5);
                const a = (fishParams.arousal || 0);
                const isNight = imgParams.isNight || false;
                limbicIndicator.textContent = ` | ${isNight ? '🌙' : '☀️'} V${(v*2-1).toFixed(2)} A${a.toFixed(2)} [${imgParams.mood || 'std'}]`;
            }

            // Update audio with limbic params
            if (audioEngine.isPlaying) {
                audioEngine.setLimbicParams(fishParams);
            }

            // Update HUD
            if (hud && hud.visible) {
                hud.update(fishParams);
            }

            if (!isEink) {
                const entry = imageManager.selectEntry(derivedState, currentAspect, imgParams.overlays || {});
                if (entry && entry.image) {
                    heroFish.setImage(entry.image);
                }
                imageManager.update(derivedState, currentAspect, imgParams.overlays || {});
            }

            return result;
        } catch (e) {
            console.warn('Aquarium: limbic refresh failed:', e);
            limbicConnected = false;
            return null;
        }
    }

    // ─── Weather update ───
    async function refreshWeather() {
        try {
            await weatherSync.fetchWeather();
            const params = weatherSync.getAquariumParams();
            if (weatherIcon && weatherTemp) {
                weatherIcon.textContent = params.icon || '🌤️';
                weatherTemp.textContent = `${Math.round(params.tempC || 20)}°`;
            }
        } catch (e) {
            // Silent fail — weather is optional
        }
    }

    // ─── Main update ───
    function update(dt, time) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        stateManager.update(dt, time);

        // Limbic refresh every ~2 seconds
        if (Math.floor(time * 10) % 20 === 0) {
            refreshLimbic();
        }

        // Weather update
        if (weatherSync) weatherSync.update(dt, performance.now());

        // Re-detect aspect
        const detected = ImageManager.detectAspect();
        if (detected !== currentAspect) {
            currentAspect = detected;
            if (!isEink) {
                const imgParams = limbicResult.imageParams || {};
                imageManager.update(stateManager.getState(), currentAspect, imgParams.overlays || {});
            }
        }

        // Update audio
        if (audioEngine.isPlaying) {
            audioEngine.update(dt, time);
        }

        // Update environment
        plants.forEach(p => p.update(dt, time));
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

        ctx.clearRect(0, 0, w, h);

        if (isEink) {
            // E-ink procedural rendering
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#000';
            for (let y = 0; y < h; y += 4) {
                for (let x = 0; x < w; x += 4) {
                    if ((x + y) % 8 === 0 || (x - y) % 8 === 0) ctx.fillRect(x, y, 2, 2);
                }
            }
            const sandY = h - h * 0.08;
            ctx.fillRect(0, sandY, w, h - sandY);
            heroFish.draw(ctx, time, true);
            return;
        }

        // ─── Full color mode ───
        const imgParams = limbicResult.imageParams || {};
        const overlays = imgParams.overlays || {};

        // Apply weather tint
        const weatherParams = weatherSync ? weatherSync.getAquariumParams() : {};
        if (weatherParams.tint) {
            ctx.fillStyle = weatherParams.tint;
            ctx.fillRect(0, 0, w, h);
        }

        // Background
        waterBg.draw(ctx, w, h, time, false);
        Environment.drawSand(ctx, w, h, false);

        // Background plants
        plants.filter(p => !p.isForeground).forEach(p => p.draw(ctx, time, false));
        rocks.forEach(r => r.draw(ctx, false));
        particles.forEach(p => p.draw(ctx, false));
        bubbles.forEach(b => b.draw(ctx, false));

        // Image manager (hero fish background)
        imageManager.draw(ctx, w, h);

        // Limbic overlays
        imageManager.drawOverlays(ctx, w, h, overlays);

        // Hero fish
        heroFish.draw(ctx, time, false);

        // Foreground plants
        plants.filter(p => p.isForeground).forEach(p => p.draw(ctx, time, false));

        // HUD
        if (hud && hud.visible) {
            hud.draw(ctx, w, h);
        }
    }

    // ─── Start everything ───
    async function init() {
        resize();

        // Preload images for initial state
        imageManager.preload(stateManager.getState(), currentAspect);

        // Init HUD
        hud.init();

        // Init weather
        refreshWeather();

        // Initial limbic refresh
        await refreshLimbic();

        const loop = Utils.createLoop(update, render);
        loop.start();

        // Periodic FPS + debug update
        setInterval(() => {
            if (fpsCounter) fpsCounter.textContent = loop.getFps();

            if (cacheIndicator) {
                const stats = imageManager.getCacheStats();
                cacheIndicator.textContent = ` | cache:${stats.cacheSize}/${stats.maxCacheSize} ${stats.webpSupported ? 'webp' : 'png'}`;
            }
        }, 1000);
    }

    // ─── Button bindings ───
    einkToggle.addEventListener('click', toggleEink);
    hudToggle.addEventListener('click', toggleHud);
    audioToggle.addEventListener('click', toggleAudio);
    captureBtn.addEventListener('click', () => {
        if (captureModule.isRecording) {
            captureModule.stop();
        } else {
            captureModule.start('mp4');
        }
    });

    // Keyboard shortcut for capture
    document.addEventListener('keydown', e => {
        if (e.key === 'c' || e.key === 'C') {
            if (captureModule.isRecording) {
                captureModule.stop();
            } else {
                captureModule.start('mp4');
            }
        }
    });

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);
