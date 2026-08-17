# Duel Realm: Tactics

A classic tactical Trading Card Game (TCG) simulator that runs entirely in the browser.

---

## 🎨 Card Asset Generation Guidelines

When generating new card artwork using AI image generators or preparing new card image files, follow these strict rules:

### 1. Full Bleed & Zero Background Rule
* **Edge-to-Edge:** The card rectangle must fill **100% of the image frame**.
* **No Outer Padding:** Never include tables, wood textures, hands, card mats, background scenery, or borders outside the card rectangle.
* **Aspect Ratio:** Standard card aspect ratio is `2:3` (or approx. 1:1.45).

### 2. Prompt Template
When prompting for card generation, explicitly include constraints:
```text
Yu-Gi-Oh classic trading card game [Monster/Spell/Trap] card [Card Name], full bleed direct front scan, card fills 100% of the image frame, no background, no table, no outer borders, vintage [monster yellow / spell green / trap pink] card frame, [card artwork description], level [X], ATK [X] DEF [X]
```

### 3. Image Specifications
* **File Format:** `.png`
* **Destination Folder:** `cards/`
* **File Naming:** Lowercase with spaces matching card names (e.g. `cards/blue-eyes.png`, `cards/dark magician.png`, `cards/summoned skull.png`).
* **Registry:** Add card metadata to `js/cards.js`.
