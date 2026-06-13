# Hermes Aquarium Dashboard

A living, procedural aquarium dashboard for Raspberry Pi 4 that visualizes the Hermes agent's internal state through a hero angelfish. Built for LCD, IPS, and e-Ink displays.

![Aquarium preview](aquarium-preview.png)

## What it does

- **Hero angelfish** animates in real-time with colors, fin motion, and glow that reflect the agent's current affective state
- **10 agent states** mapped to distinct fish behaviors: idle, active, thinking, success, error, sleeping, alert, learning, connecting, busy
- **Procedural environment**: dynamic water caustics, swaying plants, personality rocks, rising bubbles
- **Responsive across Pi screen sizes**: 7" 800×480 LCD, 5"/7.5" e-Ink, 10.1" IPS, HDMI 720p/1080p
- **E-ink fallback mode**: high-contrast black-and-white with dithering, static frame rendering
- **Agent state bridge**: reads `localStorage` key `hermes_agent_state` or a JSON state file

## Quick start on Raspberry Pi

```bash
# Clone
git clone git@github.com:drwjkirkpatrick-web/hermes-aquarium-dashboard.git
cd hermes-aquarium-dashboard

# Serve (any static server works)
python3 -m http.server 8080

# Open in browser or set as Pi startup page
# For kiosk mode:
chromium-browser --kiosk --app=http://localhost:8080
```

## Architecture

```
index.html
├── css/aquarium.css      # Pi display breakpoints, e-ink overrides
└── js/
    ├── utils.js            # Math helpers, easing, noise, screen detection
    ├── state-manager.js    # Agent state machine (10 states)
    ├── environment.js      # Plants, rocks, bubbles, water background
    ├── angelfish.js        # Hero fish: state colors, fins, glow, motion
    └── aquarium.js         # Main orchestrator + animation loop
```

All graphics are procedural Canvas 2D — no external image sprites required.

## Screen profiles

Detected automatically via `detectScreenProfile()`:

| Profile | Resolution | Display type |
|---------|-----------|--------------|
| `pi_7_lcd` | 800×480 | 7" Raspberry Pi Touch LCD |
| `pi_5_ink` | 640×384 | 5" Waveshare e-Ink |
| `pi_7_5_ink` | 800×480 | 7.5" Waveshare e-Ink |
| `pi_10_ips` | 1280×800 | 10.1" IPS |
| `hdmi_720p` | 1280×720 | Standard HDMI |
| `hdmi_1080p` | 1920×1080 | Full HD HDMI |

## Agent state → fish mapping

| State | Fish behavior | Color |
|-------|--------------|-------|
| idle | Slow drift, gentle fins | Soft amber |
| active | Steady swimming, alert posture | Bright gold |
| thinking | Hovering, fin flutter | Cyan pulse |
| success | Victory loop, bright glow | Vivid green |
| error | Rapid dart, drooping fins | Red flash |
| sleeping | Dimmed, settled near bottom | Deep blue |
| alert | Upright, scanning | Orange burst |
| learning | Curious circling | Purple shimmer |
| connecting | Pulsing rhythm | White pulse |
| busy | Faster beat, tighter turns | Saturated gold |

## E-ink mode

Toggle with the **E-Ink** button or add `?eink=1` to the URL.

- Switches to black-and-white rendering
- Disables continuous animation (static frame updates on state change)
- Applies Bayer dithering for smooth tones
- Uses `image-rendering: pixelated` for crisp edges

## Agent state bridge

The dashboard reads agent state from:

1. **`localStorage`** key `hermes_agent_state` (set by the Hermes agent or a bridge script)
2. **JSON file** via a small HTTP endpoint or file read

Example state payload:
```json
{
  "state": "thinking",
  "vad": { "valence": 0.2, "arousal": 0.6, "dominance": 0.5 },
  "timestamp": 1718300000
}
```

## Limbic system integration

The dashboard pairs with the [`limbic-hermes`](https://github.com/drwjkirkpatrick-web/limbic-hermes) module:

- Limbic VAD state drives fish color temperature, fin speed, posture, and glow
- `dominant_affect` → fish animation state
- `drive.rest_need` → glow dimming and slower movement

See `limbic_hermes/limbic_bridge.js` in the limbic repo for the browser-side bridge.

## Development

```bash
# Local server
python3 -m http.server 8888

# Open http://localhost:8888
# Add ?debug=1 for FPS counter and state overlay
```

## Image generation prompts

The 31-step prompt list for generating aquarium assets is saved in `PROMPTS.md`. These are designed for Midjourney, DALL-E, or Flux and cover:

- Phase 1: Foundation (water, light, plants, rocks)
- Phase 2: Character (angelfish hero in 7 states)
- Phase 3: Polish (bubbles, particles, UI chrome)

## License

MIT — made for Hermes agent experimentation on Raspberry Pi.

## Author

Walker Kirkpatrick — Oregon naturopathic physician, Hermes agent builder.
