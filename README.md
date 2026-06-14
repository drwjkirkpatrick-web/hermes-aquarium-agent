# Hermes Aquarium Dashboard v2

A living, emotionally intelligent aquarium dashboard for Raspberry Pi 4 that visualizes the Hermes agent's internal state through **generated pixel-art angelfish images** and **procedural bioluminescent overlays**. Built for LCD, IPS, and e-Ink displays.

## What's New in v2

The dashboard has been rebuilt around a **full limbic-hermes integration** with generated image assets:

| Feature | v1 | v2 |
|---------|----|----|
| Fish rendering | Procedural Canvas 2D | **Pixel-art images + procedural overlays** |
| Emotional depth | 10 discrete states | **Continuous VAD + 100+ neurochemicals** |
| Time of day | Static | **Circadian-aware (day/dusk/night/dawn)** |
| Image variants | None | **4 moods: standard, optimistic, midnight, cinematic** |
| Backend connection | localStorage only | **HTTP API polling (port 8787)** |
| Asset count | 0 images | **100 images, 70.73 MB** |

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
├── css/aquarium.css           # Pi display breakpoints, e-ink overrides
└── js/
    ├── utils.js                 # Math helpers, easing, noise, screen detection
    ├── state-manager.js         # Agent state machine (10 states)
    ├── limbic-bridge.js         # ★ NEW: Full limbic integration, API polling
    ├── image-manager.js         # ★ NEW: Load/cache/select images by mood
    ├── environment.js           # Plants, rocks, bubbles, water background
    ├── angelfish.js             # ★ REWRITTEN: Image-based + particle overlays
    └── aquarium.js              # ★ ENHANCED: Async limbic refresh, transitions
```

## Generated Image Assets

**100 images across a 3D emotional space:**

| Dimension | Options | Count |
|-----------|---------|-------|
| **State** | idle, active, thinking, success, error, sleeping, alert, learning, connecting, busy | 10 |
| **Aspect** | landscape (16:9), portrait (16:9), square (1:1) | 3 |
| **Mood** | standard, optimistic (`_opt`), midnight (`_mid`), cinematic (`_cine`) | 3–4 |

**Naming convention:**
```
{state}_{aspect}[_mood].png

idle_landscape.png          # standard, landscape
success_square_opt.png      # optimistic, square
error_landscape_cine.png    # cinematic midnight, landscape
```

### Mood selection logic

The `ImageManager.selectMood()` function uses limbic parameters:

| Condition | Selected Mood | Visual |
|-----------|---------------|--------|
| Day + valence > 0.58 | **optimistic** | Warm golden light |
| Night or melatonin > 0.35 | **midnight** | Deep blue, bioluminescent glow |
| Deep night + stress > 0.55 | **cinematic** | Dramatic particles, high contrast |
| Default | **standard** | Natural aquarium lighting |

### Total asset size: **70.73 MB** (100 PNGs)

## Limbic Integration

### Backend: limbic-hermes dashboard server

The dashboard connects to the [`limbic-hermes`](https://github.com/drwjkirkpatrick-web/limbic-hermes) Python module's HTTP API on **port 8787**:

```
GET  http://localhost:8787/api/state   → Full limbic state JSON
POST http://localhost:8787/api/state   → Inject events
```

### What flows through

The bridge reads **100+ neurochemical variables** and computes:

| Limbic Variable | Dashboard Effect |
|-----------------|--------------------|
| `vad.valence` | Image mood (standard → optimistic), warm/cool color overlay |
| `vad.arousal` | Fish movement speed, fin flutter, bubble rate |
| `vad.dominance` | Posture upright vs drooping |
| `neurochemistry.cortisol` | Erratic movement, red stress vignette |
| `neurochemistry.dopamine` | Gracefulness, bioluminescent glow |
| `neurochemistry.melatonin` | Dimming, midnight image variant |
| `neurochemistry.orexin` | Wakefulness override |
| `allostatic_load` | Fatigue grain overlay |
| `circadian_hour` | Day/night cycle: standard vs midnight images |
| `drive.rest_need` | Glow dimming, slower animation |

### Overlay system (5 effect layers)

Rendered on top of the image in real-time:

1. **Color temperature** — warm gold tint for positive valence, cool blue for negative
2. **Dimming** — dark overlay from melatonin / sleep pressure
3. **Bioluminescent glow** — radial cyan/gold gradient from dopamine × night phase
4. **Stress vignette** — red/orange corner vignette from cortisol > 0.5
5. **Fatigue grain** — random pixel noise from allostatic load > 0.5

### Emotional consistency

The bridge maintains a **valence history buffer** (last 10 samples) to smooth transitions:
- Prevents flickering between optimistic and midnight
- Computes `emotionalMomentum` for gradual state shifts
- `phaseTransition` smoothly blends day → dusk → night → dawn

## Agent state → fish mapping

| State | Image mood | Behavior | Color base |
|-------|-----------|----------|------------|
| idle | standard/opt | Slow drift, gentle fins | Soft teal |
| active | standard/opt | Steady swimming | Bright blue |
| thinking | standard/mid | Hovering, fin flutter | Slate blue |
| success | opt/cine | Victory loop, sparkle particles | Emerald + gold |
| error | mid/cine | Rapid dart, glitch particles | Orange + red |
| sleeping | mid | Dimmed, settled near bottom | Deep grey |
| alert | mid/cine | Upright, scanning | Cyan burst |
| learning | mid/cine | Curious circling | Purple shimmer |
| connecting | standard/opt | Pulsing rhythm | Teal |
| busy | opt/cine | Faster beat, chaos particles | Amber |

## Screen profiles

Detected automatically via `Utils.detectScreenProfile()` and `ImageManager.detectAspect()`:

| Profile | Resolution | Aspect | Use case |
|---------|-----------|--------|----------|
| `pi_7_lcd` | 800×480 | 5:3 | 7" Raspberry Pi Touch LCD |
| `pi_5_ink` | 640×384 | 5:3 | 5" Waveshare e-Ink |
| `pi_7_5_ink` | 800×480 | 5:3 | 7.5" Waveshare e-Ink |
| `pi_10_ips` | 1280×800 | 16:10 | 10.1" IPS |
| `hdmi_720p` | 1280×720 | 16:9 | Standard HDMI |
| `hdmi_1080p` | 1920×1080 | 16:9 | Full HD HDMI |

Aspect ratio is detected dynamically — rotates between landscape/portrait/square on resize.

## E-ink mode

Toggle with the **E-Ink** button or add `?eink=1` to the URL.

- Falls back to **procedural rendering** (no images loaded)
- High-contrast black-and-white with dithering
- Static frame updates on state change
- `image-rendering: pixelated` for crisp edges
- All limbic overlays disabled (simplified silhouette)

## Demo / Testing

### Python simulation

```bash
# From the repo root
python aquarium_limbic_demo.py
```

Simulates 10 emotional events through the full limbic pipeline and prints:
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

Or via the limbic-hermes API:

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
# The debug panel shows: FPS | screen profile | current image filename | limbic status
```

### Key modules

| File | Responsibility |
|------|--------------|
| `js/image-manager.js` | LRU image cache, mood selection, crossfade transitions, aspect detection |
| `js/limbic-bridge.js` | API polling, circadian phase tracking, overlay parameter computation, emotional smoothing |
| `js/angelfish.js` | Image assignment, sparkle particles, bubble emission, glow effects |
| `js/aquarium.js` | Orchestration: async limbic refresh, image transitions, render loop |
| `aquarium_limbic_demo.py` | Python test harness for the full pipeline |

## License

MIT — made for Hermes agent experimentation on Raspberry Pi.

## Author

Walker Kirkpatrick — Oregon naturopathic physician, Hermes agent builder.
