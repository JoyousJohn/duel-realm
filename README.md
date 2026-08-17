# ⚔️ Duel Realm: Tactics

A classic tactical Trading Card Game (TCG) simulator running natively in the browser with authentic retro rules, animated visual effects, and an autonomous AI opponent.

---

## 🎮 Features

* **Authentic TCG Mechanics:**
  * Strict phase flow: *Draw Phase*, *Standby Phase*, *Main Phase 1*, *Battle Phase*, *Main Phase 2*, and *End Phase*.
  * **Tribute Summoning System:** Level 1–4 monsters require 0 Tributes, Level 5–6 require 1 Tribute, and Level 7+ require 2 Tributes.
  * **Normal Summon vs. Set:** Normal Summons enter face-up in Attack Position; Normal Sets enter face-down in Defense Position.
  * **Card Types & Sub-Types:** Monsters (Normal, Effect, Flip), Spells (Normal, Continuous, Equip, Field, Quick-Play), and Traps (Normal, Continuous).

* **Rich Interactive Effects:**
  * Dynamic effect engines for iconic cards including *Time Wizard* (3D Coin Toss), *Harpie Lady* (Hunting Claw Discard/Destruction), *Mystical Space Typhoon*, *Monster Reborn*, *Change of Heart*, *Swords of Revealing Light*, *Dragon Capture Jar*, and *Black Pendant*.
  * Dedicated Field Spell Zone and interactive targeting modals.

* **Autonomous AI Opponent:**
  * Strategic decision engine capable of tribute cost-benefit calculations, intelligent spell/trap timing, priority-based removal targeting, and calculated battle declarations.

* **Immersive Presentation:**
  * 3D perspective battle arena with smooth flight animations, floating battle damage counters, graveyard viewers, and real-time duel log feed.

---

## 📁 Project Architecture

```text
├── cards/                  # High-resolution retro card artwork assets (.png)
├── css/
│   ├── style.css           # Core styling, tactical HUD modals, and layout
│   ├── card.css            # 3D card rendering, frames, and flip animations
│   └── card-effects.css    # Particle FX, glows, and battle animations
├── js/
│   ├── state.js            # Central GameState manager & CardInstance structure
│   ├── cards.js            # Card database, base stats, and effect descriptions
│   ├── game.js             # Core board interactions, summoning, and modal controllers
│   ├── card-effects.js     # Spell, Trap, and Monster effect resolution engine
│   ├── phases.js           # Turn lifecycle and phase management
│   ├── ai.js               # Autonomous AI decision-making algorithms
│   ├── battle-fx.js        # Battle calculations, screen shake, and damage indicators
│   ├── getters.js          # Board and state query utilities
│   ├── setters.js          # Board updates and playability validators
│   └── preview.js          # Card inspection hover & sidebar preview
├── index.html              # Main game interface and tactical modals
└── .agentrules             # Internal AI assistant rules and generation prompts
```

---

## 🚀 Running Locally

Because *Duel Realm: Tactics* is built with pure client-side web technologies, no build step or package installation is required.

Serve the directory with any local static HTTP server:

```bash
# Using Python
python -m http.server 8000

# Or using Node (npx)
npx serve .
```

Open `http://localhost:8000` (or the URL output by your server) in your browser.
