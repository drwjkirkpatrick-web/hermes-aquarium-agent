#!/usr/bin/env python3
"""
aquarium_limbic_demo.py
=======================
Demonstrates the full limbic-hermes → aquarium integration pipeline.

Simulates emotional events through the limbic system, computes the resulting
affect, and shows which image variant and overlays would be selected.

Usage:
    python aquarium_limbic_demo.py

Requires: limbic-hermes package installed
"""

import json
import sys
import time
from pathlib import Path

# ─── Add limbic-hermes to path ───
LIMBIC_HOME = Path.home() / "projects" / "limbic-hermes"
if LIMBIC_HOME.exists():
    sys.path.insert(0, str(LIMBIC_HOME))

try:
    from limbic_hermes.core import LimbicSystem
    from limbic_hermes.storage import write_state_file, get_default_state_dir
except ImportError as e:
    print(f"ERROR: Cannot import limbic_hermes: {e}")
    print("Please install limbic-hermes or adjust PYTHONPATH.")
    sys.exit(1)


# ─── Configuration ───
STATE_FILE = get_default_state_dir() / "aquarium_demo.json"
STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

# ─── Image variant selection (mirrors ImageManager.selectMood) ───
def select_image_mood(limbic_state: dict) -> str:
    """Select the best image variant based on limbic parameters."""
    vad = limbic_state.get("vad", {})
    neuro = limbic_state.get("neurochemistry", {})
    circadian = limbic_state.get("circadian_hour", 12.0)

    valence = max(0, min(1, (vad.get("valence", 0) + 1) / 2))
    melatonin = neuro.get("melatonin", 0.1)
    cortisol = neuro.get("cortisol", 0.1)
    allostatic = limbic_state.get("allostatic_load", 0)

    is_night = circadian >= 20 or circadian <= 6
    is_deep_night = 0 <= circadian <= 4
    dim_factor = 1 - (limbic_state.get("sleep_pressure", 0) * 0.6 + melatonin * 0.4)
    is_low_energy = melatonin > 0.35 or dim_factor < 0.4

    if is_deep_night and (allostatic > 0.55 or cortisol > 0.55):
        return "cinematic midnight hero"
    if is_night or is_low_energy:
        return "midnight / bioluminescent"
    if valence > 0.58 and not is_night:
        return "optimistic / golden hour"
    return "standard"


# ─── Overlay parameter computation ───
def compute_overlays(limbic_state: dict) -> dict:
    """Compute limbic-driven overlay parameters."""
    vad = limbic_state.get("vad", {})
    neuro = limbic_state.get("neurochemistry", {})

    valence = max(0, min(1, (vad.get("valence", 0) + 1) / 2))
    arousal = max(0, min(1, vad.get("arousal", 0.3)))
    dominance = max(0, min(1, vad.get("dominance", 0.5)))
    cortisol = neuro.get("cortisol", 0.1)
    dopamine = neuro.get("dopamine", 0.3)
    melatonin = neuro.get("melatonin", 0.1)
    allostatic = limbic_state.get("allostatic_load", 0)
    circadian = limbic_state.get("circadian_hour", 12.0)

    is_night = circadian >= 20 or circadian <= 6

    return {
        "valence": valence,
        "arousal": arousal,
        "dominance": dominance,
        "cortisol": cortisol,
        "dopamine": dopamine,
        "melatonin": melatonin,
        "dimFactor": 1 - (limbic_state.get("sleep_pressure", 0) * 0.6 + melatonin * 0.4),
        "erratic": cortisol * (1 + neuro.get("norepinephrine", 0.2) * 0.5),
        "grace": (dopamine * 0.5 + valence * 0.5) * (1 - cortisol * 0.5),
        "speedMult": arousal * neuro.get("orexin", 0.5) * (1 - melatonin * 0.8) * (1 - max(0, limbic_state.get("drive", {}).get("rest_need", 0)) * 0.5),
        "postureTilt": 0.25 - dominance * 0.4,
        "tremor": max(0, (allostatic - 0.6) * 0.3),
        "allostatic": allostatic,
        "isNight": is_night,
        "isDeepNight": 0 <= circadian <= 4,
        "phase": "day" if 7 <= circadian < 19 else ("dusk" if 19 <= circadian < 21 else ("night" if circadian >= 21 or circadian < 4 else "dawn")),
    }


# ─── Main simulation ───
def run_simulation():
    print("=" * 70)
    print("  HERMES AQUARIUM × LIMBIC-HERMES INTEGRATION DEMO")
    print("=" * 70)
    print()

    # Initialize limbic system
    limbic = LimbicSystem(profile_name="pulsatilla")
    limbic.set_circadian_hour(14)  # Afternoon

    # Scenario events: each event advances the simulation
    scenarios = [
        {
            "label": "🌅 Starting state — calm afternoon",
            "kind": "idle",
            "valence": 0.1,
            "arousal": 0.2,
            "dominance": 0.5,
            "importance": 0.2,
        },
        {
            "label": "💬 User sends a warm message",
            "kind": "user_message",
            "description": "friendly greeting from walker",
            "valence": 0.6,
            "arousal": 0.3,
            "dominance": 0.4,
            "importance": 0.6,
        },
        {
            "label": "✅ Task completed — blood chemistry analysis done",
            "kind": "task_complete",
            "valence": 0.8,
            "arousal": 0.4,
            "dominance": 0.7,
            "importance": 0.7,
        },
        {
            "label": "⚠️  Tool failure — API timeout",
            "kind": "tool_failure",
            "valence": -0.6,
            "arousal": 0.7,
            "dominance": 0.3,
            "importance": 0.8,
        },
        {
            "label": "🧠 Recovering, reasoning through the error",
            "kind": "thinking",
            "valence": -0.1,
            "arousal": 0.5,
            "dominance": 0.5,
            "importance": 0.5,
        },
        {
            "label": "🌙 Clock hits 10 PM — night mode",
            "action": "set_time",
            "hour": 22,
        },
        {
            "label": "🌙 Deep night, high cortisol from lingering stress",
            "kind": "conflict",
            "valence": -0.4,
            "arousal": 0.6,
            "dominance": 0.2,
            "importance": 0.7,
        },
        {
            "label": "😴 Finally resting — sleep pressure rising",
            "action": "rest",
            "duration": 3,
        },
        {
            "label": "🌅 Dawn — 5 AM, peaceful recovery",
            "action": "set_time",
            "hour": 5,
        },
        {
            "label": "🌅 Morning success — fresh start, task completed",
            "kind": "task_complete",
            "valence": 0.7,
            "arousal": 0.5,
            "dominance": 0.6,
            "importance": 0.6,
        },
    ]

    print(f"{'Step':<4} {'Image Variant':<28} {'Derived State':<14} {'VAD':<20} {'Overlays'}")
    print("-" * 120)

    for i, scenario in enumerate(scenarios, 1):
        print(f"\n{i:2d}. {scenario['label']}")

        if scenario.get("action") == "set_time":
            limbic.set_circadian_hour(scenario["hour"])
            limbic.update()
        elif scenario.get("action") == "rest":
            limbic.rest(duration_sec=scenario["duration"])
            limbic.update()
        else:
            limbic.observe_event(
                kind=scenario["kind"],
                description=scenario.get("description", ""),
                raw_valence=scenario.get("valence", 0),
                raw_arousal=scenario.get("arousal", 0),
                raw_dominance=scenario.get("dominance", 0),
                importance=scenario.get("importance", 0.5),
            )

        state = limbic.get_state()
        mood = select_image_mood(state)
        overlays = compute_overlays(state)

        vad = state["vad"]
        vad_str = f"V={vad['valence']:+.2f} A={vad['arousal']:.2f} D={vad['dominance']:.2f}"

        # Determine derived state
        derived = overlays["phase"]
        if state.get("allostatic_load", 0) > 0.8:
            derived = "busy"
        elif overlays["melatonin"] > 0.6 or overlays["dimFactor"] < 0.3:
            derived = "sleeping"
        elif overlays["cortisol"] > 0.7:
            derived = "error"
        elif vad["arousal"] > 0.6 and vad["valence"] > 0.3:
            derived = "success" if vad["valence"] > 0.5 else "active"
        elif vad["arousal"] > 0.4 and vad["valence"] < -0.2:
            derived = "alert"

        # Show key overlays
        overlay_keys = ["dimFactor", "erratic", "tremor"]
        overlay_str = ", ".join(f"{k}={overlays[k]:.2f}" for k in overlay_keys)

        print(f"    {mood:<28} {derived:<14} {vad_str} {overlay_str}")

        # Save state to file for aquarium
        write_state_file(state, STATE_FILE)

    # ─── Final summary ───
    print()
    print("=" * 70)
    print("  FINAL STATE SNAPSHOT")
    print("=" * 70)
    final = limbic.get_state()
    print(f"\nDominant affect: {final['dominant_affect']}")
    print(f"Expression vector: {json.dumps(final['expression_vector'], indent=2)}")
    print(f"\nNeurochemical highlights:")
    n = final["neurochemistry"]
    print(f"  dopamine={n['dopamine']:.2f}, serotonin={n['serotonin']:.2f}, "
          f"cortisol={n['cortisol']:.2f}, melatonin={n['melatonin']:.2f}")
    print(f"  orexin={n['orexin']:.2f}, norepinephrine={n['norepinephrine']:.2f}")
    print(f"\nSelected image mood: {select_image_mood(final)}")
    print(f"Circadian phase: {overlays['phase']} (hour={final['circadian_hour']:.1f})")
    print(f"\nState written to: {STATE_FILE}")
    print()
    print("Aquarium would render:")
    print(f"  • Background: {overlays['phase']} aquarium scene")
    print(f"  • Fish image: {select_image_mood(final)} variant of '{derived}' state")
    print(f"  • Overlays: valence tint={'warm' if overlays['valence'] > 0.5 else 'cool'}, "
          f"dimming={overlays['dimFactor']:.2f}")
    print(f"  • Effects: {'bioluminescent glow' if overlays['isNight'] else 'sunny particles'}, "
          f"{'stress vignette' if overlays['cortisol'] > 0.5 else 'calm atmosphere'}")


if __name__ == "__main__":
    run_simulation()
