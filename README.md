# Hermes Aquarium Dashboard v3

A living, emotionally intelligent aquarium dashboard for Raspberry Pi 4 that visualizes the Hermes agent's internal state through **generated pixel-art angelfish images**, **procedural bioluminescent overlays**, **generative audio**, **weather sync**, and a **neurochemical HUD**. Built for LCD, IPS, and e-Ink displays.

## What's New in v3

| Feature | v2 | v3 |
|---------|----|----|
| Image format | PNG only | **WebP-first (91.9% smaller, 70MB → 5.7MB)** |
| Audio | None | **Generative underwater ambience + limbic-driven tones** |
| Interaction | None | **Tap, swipe, long-press, keyboard shortcuts** |
| HUD | Status text only | **Live sparklines for 4 neurochemicals** |
| Variants | 100 images | **100 images + quality-scored MANIFEST** |
| Offline | None | **Service Worker + PWA installable** |
| Weather | None | **wttr.in sync affecting aquarium mood** |
| Capture | None | **MP4/WebM recording with share message** |
| Accessibility | Basic | **Reduced motion, ARIA, keyboard nav, screen reader** |
| Quality control | Manual | **Automated sharpness scoring + regen flagging** |

## Quick start on Raspberry Pi

```bash
# Clone
git clone git@github.com:drwjkirkpatrick-web/hermes-aquarium-agent.git
cd hermes-aquarium-agent

# Serve (any static server works)
python3 -m http.server 8080

# Open in browser or set as Pi startup page
chromium-browser --kiosk --app=http://localhost:8080
```

## Architecture

```
index.html
├── css/aquarium.css           # Pi display breakpoints, e-ink overrides, button styles
├── manifest.json              # PWA manifest
├── sw.js                      # Service Worker (offline caching)
├── image_quality_pipeline.py  # Automated quality scoring
├── aquarium_limbic_demo.py    # Python simulation test harness
└── js/
    ├── utils.js                 # Math helpers, easing, noise, screen detection
    ├── state-manager.js         # Agent state machine (10 states)
    ├── limbic-bridge.js         # Full limbic integration, API polling, circadian
    ├── image-manager.js         # WebP/PNG loading, LRU cache, mood selection
    ├── audio-engine.js          # ★ Generative underwater ambience + tones
    ├── touch-engine.js          # ★ Gestures: tap, swipe, long-press, keyboard
    ├── hud-overlay.js           # ★ Neurochemical sparklines HUD
    ├── weather-sync.js          # ★ wttr.in weather integration
    ├── capture-module.js        # ★ MP4 recording + download
    ├── environment.js           # Plants, rocks, bubbles, water background
    ├── angelfish.js             # Image-based fish + particle overlays
    └── aquarium.js              # Main orchestrator
```

## Generated Image Assets

**100 images across a 3D emotional space:**

| Dimension | Options | Count |
|-----------|---------|-------|
| **State** | idle, active, thinking, success, error, sleeping, alert, learning, connecting, busy | 10 |
| **Aspect** | landscape (16:9), portrait (16:9), square (1:1) | 3 |
| **Mood** | standard, optimistic (`_opt`), midnight (`_mid`), cinematic (`_cine`) | 3–4 |

**WebP conversion:** 70.73 MB PNG → **5.70 MB WebP** (91.9% reduction)

**Naming convention:**
```
{state}_{aspect}[_mood].png     # PNG fallback
{state}_{aspect}[_mood].webp    # WebP primary

idle_landscape.png          # standard, landscape
success_square_opt.png      # optimistic, square
error_landscape_cine.png    # cinematic midnight, landscape
```

### Mood selection logic

| Condition | Selected Mood | Visual |
|-----------|---------------|--------|
| Day + valence > 0.58 | **optimistic** | Warm golden light |
| Night or melatonin > 0.35 | **midnight** | Deep blue, bioluminescent glow |
| Deep night + stress > 0.55 | **cinematic** | Dramatic particles, high contrast |
| Default | **standard** | Natural aquarium lighting |

### Automated quality control

Run `python image_quality_pipeline.py` to:
- Score each image on sharpness (Laplacian variance)
- Check color consistency against expected palette
- Flag suspiciously small files (< 5KB)
- Generate `MANIFEST.json` with quality scores
- Create `regen_list.txt` for files below threshold

## Subsystem Details

### 1. WebP-first Image Loading

The `ImageManager` auto-detects WebP support and falls back to PNG. Progressive loading:
1. Current state/aspect loads immediately
2. Neighboring states preload in background
3. LRU cache evicts least-recently-used images

### 2. Generative Audio Engine

| Limbic Input | Audio Effect |
|-------------|--------------|
| `isNight` | Deeper reverb, darker low-pass filter |
| `dopamine` | More frequent melodic chimes |
| `cortisol` | Discordant undertones, tension drone |
| `valence` | Major vs minor scale selection |
| `arousal` | Bubble density and activity |
| `melatonin` | Master volume dimming |

Layers:
- **Ambience**: Pink noise through low-pass filter (underwater muffling)
- **Drone**: 55Hz sub-bass with valence-driven detune
- **Chimes**: Sine/triangle tones from dopamine-triggered scheduling
- **Bubbles**: FM synthesis for bubble pops
- **Tension**: Sustained discord from cortisol/allostatic load

Toggle with **M** key or 🔊 button. Requires user interaction to initialize (browser autoplay policy).

### 3. Touch & Gesture System

| Gesture | Action |
|---------|--------|
| **Tap** on fish | Poke (temporary cortisol spike, fish darts) |
| **Long-press** | Feed (food particles, fish chases) |
| **Swipe left/right** | Cycle through agent states |
| **Double-tap** | Toggle neurochemical HUD |
| **Arrow keys** | Cycle states |
| **Space/Enter** | Toggle HUD |
| **M** | Mute/unmute audio |
| **C** | Start/stop capture recording |
| **P** | Poke fish |
| **F** | Feed fish |
| **E** | Toggle e-ink mode |

Respects `prefers-reduced-motion` — disables poke animations.

### 4. Neurochemical HUD

Toggle with **H** key or 🧠 button. Shows:
- 4 horizontal sparklines (60-second history, 3600 samples)
- Color-coded: dopamine=blue, cortisol=red, serotonin=green, melatonin=purple
- Current numeric values
- Circadian phase indicator (☀️/🌙)
- Positioned top-right, semi-transparent

### 5. Weather Sync

Polls `wttr.in` every 10 minutes (free, no API key):

| Weather | Aquarium Effect |
|---------|-----------------|
| Sunny | Warm amber tint, optimistic variants favored |
| Cloudy | Grey-blue muted tint, neutral mood |
| Rain | Darker, 1.7× bubbles, faster current |
| Snow/ice | Cool blue overlay, fewer bubbles |
| Storm | Very dark, 2.2× bubbles, red vignette, cinematic variants |

### 6. Capture & Export

Press **C** or 📷 button to record 5 seconds:
- Uses Canvas.captureStream() + MediaRecorder
- Auto-downloads as `.webm` file
- Generates share message with current affect summary
- Fallback: frame-by-frame capture for GIF generation

### 7. PWA + Offline Mode

- `manifest.json` for installable PWA
- `sw.js` caches core assets + images
- Cache-first strategy for images, network-first for API
- Works offline after first visit
- Auto-detects new versions

### 8. Accessibility

- Respects `prefers-reduced-motion`
- ARIA labels on all interactive elements
- Screen reader announcements for state changes
- Keyboard-only navigation support
- Focus indicators on all buttons
- Semantic HTML regions

## Limbic Integration

### Backend: limbic-hermes dashboard server

Connects to HTTP API on **port 8787**:

```
GET  http://localhost:8787/api/state   → Full limbic state JSON
POST http://localhost:8787/api/state   → Inject events
```

### Neurochemical → Visual mapping

| Variable | Image | Overlay | Audio |
|----------|-------|---------|-------|
| `vad.valence` | optimistic vs standard | warm/cool tint | major/minor scale |
| `vad.arousal` | — | — | bubble density |
| `neurochemistry.cortisol` | — | red vignette | tension drone |
| `neurochemistry.dopamine` | — | bioluminescent glow | melodic chimes |
| `neurochemistry.melatonin` | midnight variant | dimming overlay | volume reduction |
| `neurochemistry.orexin` | — | — | wakefulness |
| `allostatic_load` | — | grain overlay | — |
| `circadian_hour` | day/night cycle | phase transition | reverb depth |

### Overlay system (5 layers)

1. **Color temperature** — warm gold (valence > 0.6) or cool blue (valence < 0.4)
2. **Dimming** — dark overlay from melatonin + sleep pressure
3. **Bioluminescent glow** — radial cyan/gold gradient (dopamine × night)
4. **Stress vignette** — red/orange corners (cortisol > 0.5)
5. **Fatigue grain** — random pixel noise (allostatic > 0.5)

## Screen profiles

| Profile | Resolution | Aspect | Use case |
|---------|-----------|--------|----------|
| `pi_7_lcd` | 800×480 | 5:3 | 7" Raspberry Pi Touch LCD |
| `pi_5_ink` | 640×384 | 5:3 | 5" Waveshare e-Ink |
| `pi_7_5_ink` | 800×480 | 5:3 | 7.5" Waveshare e-Ink |
| `pi_10_ips` | 1280×800 | 16:10 | 10.1" IPS |
| `hdmi_720p` | 1280×720 | 16:9 | Standard HDMI |
| `hdmi_1080p` | 1920×1080 | 16:9 | Full HD HDMI |

Aspect ratio detected dynamically — rotates between landscape/portrait/square on resize.

## E-ink mode

Toggle with **E** key or ⬛ button, or add `?eink=1` to the URL.

- Falls back to procedural rendering (no images loaded)
- High-contrast black-and-white with dithering
- Static frame updates on state change
- `image-rendering: pixelated` for crisp edges
- All audio, HUD, and overlays disabled

## Demo / Testing

### Python simulation

```bash
python aquarium_limbic_demo.py
```

Simulates 10 emotional events through the full limbic pipeline:
- Selected image variant
- Derived agent state
- VAD values
- Overlay parameters
- Final emotional snapshot

### Manual state injection

```javascript
// In browser console
localStorage.setItem('hermes_agent_state', JSON.stringify({
  state: 'success',
  timestamp: Date.now(),
  demo: false
}));
```

Or via limbic-hermes API:

```bash
curl -X POST http://localhost:8787/api/state \
  -H "Content-Type: application/json" \
  -d '{"kind":"task_complete","raw_valence":0.8,"importance":0.7}'
```

## Development

```bash
# Local server
python3 -m http.server 8888

# Open http://localhost:8888
# Debug panel shows: FPS | screen profile | current image | limbic status | cache stats
# Add ?debug=1 for verbose logging
```

### Key modules

| File | Responsibility |
|------|--------------|
| `js/image-manager.js` | WebP/PNG loading, LRU cache, mood selection, crossfade transitions |
| `js/limbic-bridge.js` | API polling, circadian tracking, overlay computation, emotional smoothing |
| `js/audio-engine.js` | Pink noise ambience, generative chimes, bubble SFX, tension drone |
| `js/touch-engine.js` | Multi-touch gestures, mouse, keyboard, accessibility announcements |
| `js/hud-overlay.js` | Sparkline rendering, circadian indicator, numeric readouts |
| `js/weather-sync.js` | wttr.in API, weather→aquarium parameter mapping |
| `js/capture-module.js` | Canvas recording, MediaRecorder, auto-download, share formatting |
| `js/aquarium.js` | Orchestration: async refresh, image transitions, render loop |

## License

MIT — made for Hermes agent experimentation on Raspberry Pi.

## Author

Walker Kirkpatrick — Hermes agent builder.
