/**
 * weather-sync.js — Weather Integration Module
 *
 * Polls wttr.in (free, no API key) for current weather in a configurable
 * location and maps conditions to aquarium visual parameters. Smoothly
 * transitions between weather states when conditions change.
 *
 * Usage:
 *   const weather = new WeatherSync({ location: 'London', updateInterval: 600000 });
 *   await weather.fetchWeather();
 *   const params = weather.getAquariumParams(); // { tint, bubbleRateMultiplier, currentVariant, description, ... }
 *   // In animation loop:
 *   weather.update(dt, performance.now() / 1000);
 */
(function(global) {
    'use strict';

    const DEFAULT_LOCATION = 'auto';            // wttr.in auto-detects by IP
    const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    const CACHE_KEY = 'hermes_aquarium_weather_cache';
    const CACHE_TTL_MS = 30 * 60 * 1000;        // 30 minutes
    const FETCH_TIMEOUT_MS = 15000;
    const TRANSITION_DURATION_S = 3.0;          // seconds to blend weather changes

    // ── World Weather Online code → category mapping ──
    // Categories: sunny, cloudy, rain, snow, storm, unknown
    const CODE_MAP = {
        // Sunny / clear
        113: 'sunny',
        // Partly cloudy
        116: 'cloudy',
        // Cloudy / overcast / fog / mist
        119: 'cloudy', 122: 'cloudy',
        143: 'cloudy', 248: 'cloudy', 260: 'cloudy',
        // Rain (light → heavy)
        176: 'rain', 263: 'rain', 266: 'rain', 293: 'rain', 296: 'rain',
        299: 'rain', 302: 'rain', 305: 'rain', 308: 'rain',
        353: 'rain', 356: 'rain', 359: 'rain',
        // Freezing / sleet
        182: 'snow', 185: 'snow', 281: 'snow', 284: 'snow',
        311: 'snow', 314: 'snow', 317: 'snow', 320: 'snow',
        362: 'snow', 365: 'snow',
        // Snow
        179: 'snow', 227: 'snow', 230: 'snow',
        323: 'snow', 326: 'snow', 329: 'snow', 332: 'snow',
        335: 'snow', 338: 'snow', 350: 'snow',
        368: 'snow', 371: 'snow', 374: 'snow', 377: 'snow',
        // Storm / thunder
        200: 'storm', 386: 'storm', 389: 'storm', 392: 'storm', 395: 'storm',
    };

    function _codeToCategory(code) {
        return CODE_MAP[parseInt(code, 10)] || 'unknown';
    }

    function _clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    function _easeInOutSine(t) {
        return -(Math.cos(Math.PI * t) - 1) / 2;
    }

    // ─── WeatherSync Class ───
    class WeatherSync {
        constructor(options = {}) {
            this.location = options.location || DEFAULT_LOCATION;
            this.updateInterval = options.updateInterval || DEFAULT_INTERVAL_MS;
            this.onError = options.onError || (() => {});
            this.onUpdate = options.onUpdate || (() => {});

            // Raw data
            this.lastWeather = null;
            this.lastFetchTime = 0;
            this.isFetching = false;
            this.fetchError = null;

            // Params
            this.currentParams = this._buildDefaultParams();
            this.targetParams = this._buildDefaultParams();
            this.transitionProgress = 1.0;

            // Restore from localStorage cache on init
            this._loadCache();
        }

        // ── Build neutral default params ──
        _buildDefaultParams() {
            return {
                tint: { r: 0, g: 0, b: 0, a: 0 },          // RGBA overlay tint
                bubbleRateMultiplier: 1.0,                  // bubble spawn rate multiplier
                currentVariant: 'standard',                 // image mood variant
                description: 'No data',                       // human-readable weather
                category: 'unknown',                        // internal category
                tempC: null,
                humidity: null,
                windSpeed: null,
                currentSpeedMultiplier: 1.0,                // water-current speed multiplier
                vignetteColor: null,                        // {r,g,b,a} or null
            };
        }

        // ── localStorage cache ──
        _loadCache() {
            try {
                const raw = localStorage.getItem(CACHE_KEY);
                if (!raw) return;
                const cached = JSON.parse(raw);
                if (cached.timestamp && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
                    this.lastWeather = cached.data;
                    this.lastFetchTime = cached.timestamp;
                    const params = this._weatherToParams(this.lastWeather);
                    this.currentParams = { ...params };
                    this.targetParams = { ...params };
                }
            } catch (e) {
                /* ignore corrupt cache */
            }
        }

        _saveCache() {
            if (!this.lastWeather) return;
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: this.lastWeather,
                }));
            } catch (e) {
                /* ignore storage errors */
            }
        }

        // ── Public: fetch weather from wttr.in ──
        async fetchWeather() {
            if (this.isFetching) return this.lastWeather;
            this.isFetching = true;
            this.fetchError = null;

            const loc = encodeURIComponent(this.location);
            const url = `https://wttr.in/${loc}?format=j1`;

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

                const resp = await fetch(url, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                clearTimeout(timeoutId);

                if (!resp.ok) {
                    throw new Error(`wttr.in returned HTTP ${resp.status}`);
                }

                const data = await resp.json();
                this.lastWeather = data;
                this.lastFetchTime = Date.now();
                this._saveCache();

                // Compute new target and start transition
                const params = this._weatherToParams(data);
                this.targetParams = params;
                this.transitionProgress = 0.0;

                this.onUpdate(params);
                return data;
            } catch (err) {
                this.fetchError = err.message || String(err);
                this.onError(err);
                // Fallback: return cached data if available, else null
                return this.lastWeather || null;
            } finally {
                this.isFetching = false;
            }
        }

        // ── Convert wttr.in JSON → aquarium params ──
        _weatherToParams(data) {
            if (!data || !Array.isArray(data.current_condition) || !data.current_condition[0]) {
                return this._buildDefaultParams();
            }

            const cc = data.current_condition[0];
            const code = parseInt(cc.weatherCode, 10);
            const category = _codeToCategory(code);

            const tempC = parseFloat(cc.temp_C) || 0;
            const humidity = parseFloat(cc.humidity) || 50;
            const windKmph = parseFloat(cc.windspeedKmph) || 0;
            const desc = (cc.weatherDesc && cc.weatherDesc[0] && cc.weatherDesc[0].value)
                ? cc.weatherDesc[0].value
                : 'Unknown';

            return this._categoryToParams(category, tempC, humidity, windKmph, desc);
        }

        // ── Map weather category to visual parameters ──
        _categoryToParams(category, tempC, humidity, windKmph, desc) {
            const base = this._buildDefaultParams();
            base.tempC = tempC;
            base.humidity = humidity;
            base.windSpeed = windKmph;
            base.description = desc;
            base.category = category;

            switch (category) {
                case 'sunny':
                    // Sunny → optimistic image variants, warm subtle tint
                    base.tint = { r: 255, g: 230, b: 170, a: 0.06 };
                    base.bubbleRateMultiplier = 1.0;
                    base.currentVariant = 'opt';
                    base.currentSpeedMultiplier = 1.0;
                    base.vignetteColor = null;
                    break;

                case 'cloudy':
                    // Cloudy → neutral/muted colors, subtle grey tint
                    base.tint = { r: 160, g: 170, b: 180, a: 0.10 };
                    base.bubbleRateMultiplier = 0.8;
                    base.currentVariant = 'standard';
                    base.currentSpeedMultiplier = 0.7;
                    base.vignetteColor = null;
                    break;

                case 'rain':
                    // Rain → darker tint, more bubbles, faster water current
                    base.tint = { r: 50, g: 60, b: 80, a: 0.22 };
                    base.bubbleRateMultiplier = 1.7;
                    base.currentVariant = 'standard';
                    base.currentSpeedMultiplier = 1.5;
                    base.vignetteColor = null;
                    break;

                case 'snow':
                    // Snow / ice → cool blue overlay, fewer bubbles, slower current
                    base.tint = { r: 120, g: 180, b: 255, a: 0.15 };
                    base.bubbleRateMultiplier = 0.6;
                    base.currentVariant = 'mid';
                    base.currentSpeedMultiplier = 0.5;
                    base.vignetteColor = { r: 180, g: 210, b: 255, a: 0.08 };
                    break;

                case 'storm':
                    // Storm → high erratic feel, red vignette, many bubbles, fast current
                    base.tint = { r: 35, g: 30, b: 45, a: 0.28 };
                    base.bubbleRateMultiplier = 2.2;
                    base.currentVariant = 'cine';
                    base.currentSpeedMultiplier = 2.0;
                    base.vignetteColor = { r: 180, g: 40, b: 30, a: 0.22 };
                    break;

                default:
                    // Unknown → neutral fallback
                    base.tint = { r: 0, g: 0, b: 0, a: 0 };
                    base.bubbleRateMultiplier = 1.0;
                    base.currentVariant = 'standard';
                    base.currentSpeedMultiplier = 1.0;
                    base.vignetteColor = null;
                    break;
            }

            // Temperature modifiers
            if (tempC > 30) {
                // Very hot → warm amber overlay
                base.tint = this._blendTints(base.tint, { r: 255, g: 140, b: 60, a: 0.06 });
            } else if (tempC < 0) {
                // Very cold → deepen blue
                base.tint = this._blendTints(base.tint, { r: 80, g: 140, b: 255, a: 0.10 });
            }

            // Wind boosts current & bubbles
            if (windKmph > 30) {
                base.currentSpeedMultiplier *= 1.3;
                base.bubbleRateMultiplier *= 1.2;
            }

            return base;
        }

        _blendTints(a, b) {
            const t = b.a || 0;
            const inv = 1 - t;
            return {
                r: _clamp01(a.r * inv + b.r * t),
                g: _clamp01(a.g * inv + b.g * t),
                b: _clamp01(a.b * inv + b.b * t),
                a: _clamp01(a.a + b.a),
            };
        }

        // ── Public: get current (interpolated) aquarium params ──
        getAquariumParams() {
            return { ...this.currentParams };
        }

        // ── Public: update — call from animation loop ──
        update(dt, now) {
            // Auto-fetch when updateInterval has elapsed
            const elapsedMs = (now * 1000) - this.lastFetchTime;
            if (elapsedMs > this.updateInterval && !this.isFetching) {
                this.fetchWeather().catch(() => {});
            }

            // Smoothly interpolate current params toward target
            if (this.transitionProgress < 1.0) {
                this.transitionProgress = Math.min(1.0, this.transitionProgress + dt / TRANSITION_DURATION_S);
                const t = (global.Utils && global.Utils.easeInOutSine)
                    ? global.Utils.easeInOutSine(this.transitionProgress)
                    : _easeInOutSine(this.transitionProgress);

                this.currentParams.tint = this._lerpTint(
                    this.currentParams.tint, this.targetParams.tint, t
                );
                this.currentParams.bubbleRateMultiplier = this._lerp(
                    this.currentParams.bubbleRateMultiplier,
                    this.targetParams.bubbleRateMultiplier,
                    t
                );
                this.currentParams.currentSpeedMultiplier = this._lerp(
                    this.currentParams.currentSpeedMultiplier,
                    this.targetParams.currentSpeedMultiplier,
                    t
                );
                this.currentParams.vignetteColor = this._lerpVignette(
                    this.currentParams.vignetteColor,
                    this.targetParams.vignetteColor,
                    t
                );

                // Discrete fields switch at midpoint for visual stability
                if (this.transitionProgress >= 0.5) {
                    this.currentParams.currentVariant = this.targetParams.currentVariant;
                    this.currentParams.description = this.targetParams.description;
                    this.currentParams.category = this.targetParams.category;
                    this.currentParams.tempC = this.targetParams.tempC;
                    this.currentParams.humidity = this.targetParams.humidity;
                    this.currentParams.windSpeed = this.targetParams.windSpeed;
                }
            }
        }

        // ── Helpers ──
        _lerp(a, b, t) {
            return a + (b - a) * t;
        }

        _lerpTint(a, b, t) {
            if (!a || !b) return b || a || { r: 0, g: 0, b: 0, a: 0 };
            return {
                r: this._lerp(a.r, b.r, t),
                g: this._lerp(a.g, b.g, t),
                b: this._lerp(a.b, b.b, t),
                a: this._lerp(a.a, b.a, t),
            };
        }

        _lerpVignette(a, b, t) {
            if (!a && !b) return null;
            if (!a) return b ? { r: b.r, g: b.g, b: b.b, a: b.a * t } : null;
            if (!b) return { r: a.r, g: a.g, b: a.b, a: a.a * (1 - t) };
            return this._lerpTint(a, b, t);
        }

        // ── Public: force an immediate refresh ──
        async refresh() {
            return this.fetchWeather();
        }

        // ── Public: last fetch error (null if none) ──
        getLastError() {
            return this.fetchError;
        }

        // ── Public: diagnostic status object ──
        getStatus() {
            return {
                location: this.location,
                updateInterval: this.updateInterval,
                lastFetchTime: this.lastFetchTime,
                isFetching: this.isFetching,
                lastError: this.fetchError,
                hasCache: !!this.lastWeather,
                category: this.currentParams.category,
                transitionProgress: this.transitionProgress,
            };
        }
    }

    global.WeatherSync = WeatherSync;
})(window);
