/**
 * Card Effects (compat shim) — split into focused modules.
 *
 * Original 4,827-line monolith has been divided:
 *  - js/effects-core.js       (shared helpers + negation)
 *  - js/effects-targeting.js  (on-mat spell target picker)
 *  - js/effects-dispatch.js   (activateCard dispatcher)
 *  - js/effects-spells.js     (spell modals: Rebirth, TTTD, equip, MST, etc.)
 *  - js/effects-traps.js      (trap responses: Prism, Vortex, Radiant, etc.)
 *  - js/effects-monsters.js   (monster ignition/flip/graveyard/battle triggers)
 *
 * This file remains as a no-op compatibility shim so legacy caches and
 * old service-worker assets don't 404. All logic now lives in the modules
 * above, loaded via <script> tags in index.html before this shim.
 */
// No code — see modules above.
