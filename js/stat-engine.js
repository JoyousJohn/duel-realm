/**
 * Stat Engine: Field and Equip spell modifier calculations,
 * dynamic monster stat resolution, and on-mat HUD stat modifier badges.
 */

// ---------------------------------------------------------------------------
// Field Spell Stat Modifiers
// ---------------------------------------------------------------------------

// Return { atk, def } stat modifiers for a monster card definition based on
// active field spells on BOTH sides (or projected override for player field).
// Separate ATK and DEF to support asymmetric field spells (e.g. Mystic Plasma Zone: +500 ATK / -400 DEF).
function getFieldMods(monsterDef, overridePlayerFieldId) {
    if (!monsterDef || monsterDef.type !== "monsters") return { atk: 0, def: 0 };

    var atkMod = 0;
    var defMod = 0;
    var bothSides = ["player", "computer"];

    for (var s = 0; s < bothSides.length; s++) {
        var who = bothSides[s];
        var fieldId = null;
        if (who === "player" && overridePlayerFieldId !== undefined) {
            fieldId = overridePlayerFieldId;
        } else {
            var fieldInst = (typeof GameState !== "undefined" && GameState && GameState[who] && GameState[who].field) ? GameState[who].field.fieldZone : null;
            if (fieldInst) fieldId = fieldInst.cardId;
        }
        if (!fieldId) continue;

        if (fieldId === "yami") {
            if (monsterDef.monsterType === "Fiend" || monsterDef.monsterType === "Spellcaster") {
                atkMod += 200; defMod += 200;
            } else if (monsterDef.monsterType === "Fairy") {
                atkMod -= 200; defMod -= 200;
            }
        } else if (fieldId === "wasteland") {
            if (monsterDef.monsterType === "Dinosaur" || monsterDef.monsterType === "Zombie" || monsterDef.monsterType === "Rock") {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === "mountain") {
            if (monsterDef.monsterType === "Dragon" || monsterDef.monsterType === "Winged Beast" || monsterDef.monsterType === "Thunder") {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === "sogen") {
            if (monsterDef.monsterType === "Warrior" || monsterDef.monsterType === "Beast-Warrior") {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === "forest") {
            if (monsterDef.monsterType === "Insect" || monsterDef.monsterType === "Beast" || monsterDef.monsterType === "Plant" || monsterDef.monsterType === "Beast-Warrior") {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === "umi") {
            if (monsterDef.monsterType === "Fish" || monsterDef.monsterType === "Sea Serpent" || monsterDef.monsterType === "Thunder" || monsterDef.monsterType === "Aqua") {
                atkMod += 200; defMod += 200;
            } else if (monsterDef.monsterType === "Machine" || monsterDef.monsterType === "Pyro") {
                atkMod -= 200; defMod -= 200;
            }
        } else if (fieldId === "mystic-plasma-zone") {
            if (monsterDef.attribute === "DARK") {
                atkMod += 500; defMod -= 400;
            }
        } else if (fieldId === "luminous-spark") {
            if (monsterDef.attribute === "LIGHT") {
                atkMod += 500; defMod -= 400;
            }
        } else if (fieldId === "tectonic-domain" || fieldId === "gaia-power") {
            if (monsterDef.attribute === "EARTH") {
                atkMod += 500; defMod -= 400;
            }
        }
    }

    return { atk: atkMod, def: defMod };
}

// Legacy helper — returns combined ATK+DEF modifier for backward compatibility
function getFieldModifier(monsterDef) {
    var mods = getFieldMods(monsterDef);
    return mods.atk;
}

// Return { atk, def } stat modifiers contributed by all equipped cards on a monster
// instance (equip spells link to their monster via `equippedToUid`).
function getEquipMods(monsterInst) {
    var atkMod = 0;
    var defMod = 0;
    if (!monsterInst || !monsterInst.uid) return { atk: 0, def: 0 };

    ["player", "computer"].forEach(function(who) {
        var spells = GameState[who].field.spells;
        for (var i = 1; i <= 6; i++) {
            var inst = spells[i];
            if (!inst || !inst.equippedToUid) continue;
            var equipDef = cards[inst.cardId];
            if (!equipDef || equipDef.type !== "spells" || equipDef.subType !== "equip") continue;
            if (inst.equippedToUid !== monsterInst.uid) continue;
            atkMod += (equipDef.atkMod || 0);
            defMod += (equipDef.defMod || 0);
        }
    });

    return { atk: atkMod, def: defMod };
}

// Effective ATK of a monster CardInstance (base + field/equip ATK modifier, min 0)
function getMonsterAtk(instance) {
    var def = cards[instance.cardId];
    if (!def || def.type !== "monsters") return 0;
    var fieldMods = getFieldMods(def);
    var equipMods = getEquipMods(instance);
    var selfMod = 0;

    if (instance.cardId === "infernal-incinerator" && typeof GameState !== "undefined" && GameState) {
        if (!instance.faceDown && instance.position !== "defense-down") {
            var controller = null;
            ["player", "computer"].forEach(function(who) {
                if (GameState[who] && GameState[who].field && GameState[who].field.monsters) {
                    for (var z = 1; z <= 6; z++) {
                        var m = GameState[who].field.monsters[z];
                        if (m && (m === instance || (instance.uid && m.uid === instance.uid))) {
                            controller = who;
                            break;
                        }
                    }
                }
            });

            if (controller) {
                var opp = GameState.getOpponent(controller);
                var oppMonstersCount = GameState.getMonstersOnField(opp).length;
                var ownMonstersCount = GameState.getMonstersOnField(controller).length;
                var otherOwnMonsters = Math.max(0, ownMonstersCount - 1);
                selfMod += (oppMonstersCount * 200) - (otherOwnMonsters * 500);
            }
        }
    }

    if (instance.cardId === "gryphon-stormlord" && typeof GameState !== "undefined" && GameState) {
        if (!instance.faceDown && instance.position !== "defense-down") {
            var otherWingedBeastCount = 0;
            ["player", "computer"].forEach(function(who) {
                var mons = GameState.getMonstersOnField(who);
                mons.forEach(function(entry) {
                    var m = entry.card;
                    if (m && m !== instance && (!instance.uid || m.uid !== instance.uid)) {
                        if (!m.faceDown && m.position !== "defense-down") {
                            var mDef = cards[m.cardId];
                            if (mDef && mDef.monsterType === "Winged Beast") {
                                otherWingedBeastCount++;
                            }
                        }
                    }
                });
            });
            selfMod += (otherWingedBeastCount * 300);
        }
    }

    var tempMod = (instance && instance.tempStatMods && typeof instance.tempStatMods.atk === "number") ? instance.tempStatMods.atk : 0;
    var totalAtk = Math.max(0, (def.atk || 0) + fieldMods.atk + equipMods.atk + selfMod + tempMod);
    if (instance && instance.isGaleHalved && instance.galeHalvedTurn === turnCount) {
        totalAtk = Math.floor(totalAtk / 2);
    }
    return totalAtk;
}

// Effective DEF of a monster CardInstance (base + field/equip DEF modifier, min 0)
function getMonsterDef(instance) {
    var def = cards[instance.cardId];
    if (!def || def.type !== "monsters") return 0;
    var fieldMods = getFieldMods(def);
    var equipMods = getEquipMods(instance);
    var selfMod = 0;

    if (instance.cardId === "gryphon-stormlord" && typeof GameState !== "undefined" && GameState) {
        if (!instance.faceDown && instance.position !== "defense-down") {
            var otherWingedBeastCount = 0;
            ["player", "computer"].forEach(function(who) {
                var mons = GameState.getMonstersOnField(who);
                mons.forEach(function(entry) {
                    var m = entry.card;
                    if (m && m !== instance && (!instance.uid || m.uid !== instance.uid)) {
                        if (!m.faceDown && m.position !== "defense-down") {
                            var mDef = cards[m.cardId];
                            if (mDef && mDef.monsterType === "Winged Beast") {
                                otherWingedBeastCount++;
                            }
                        }
                    }
                });
            });
            selfMod += (otherWingedBeastCount * 300);
        }
    }

    var tempMod = (instance && instance.tempStatMods && typeof instance.tempStatMods.def === "number") ? instance.tempStatMods.def : 0;
    var totalDef = Math.max(0, (def.def || 0) + fieldMods.def + equipMods.def + selfMod + tempMod);
    if (instance && instance.isGaleHalved && instance.galeHalvedTurn === turnCount) {
        totalDef = Math.floor(totalDef / 2);
    }
    return totalDef;
}

// ---------------------------------------------------------------------------
// On-Mat Stat Modifier Badges
// ---------------------------------------------------------------------------

// Update or create visual ATK/DEF stat modifier badges (+/- diff) for all face-up monsters.
// Accepts optional previewFieldSpellId to render projected stat preview badges when a field spell is selected in hand.
function updateStatModBadges(previewFieldSpellId) {
    var isPreviewMode = (typeof previewFieldSpellId === "string" && previewFieldSpellId.length > 0);
    var sides = ["player", "computer"];

    sides.forEach(function(who) {
        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;

            var existingBadge = square.find(".stat-mod-badge");

            if (monsterInst && !isFaceDown) {
                var def = cards[monsterInst.cardId];
                var mods = isPreviewMode ? getFieldMods(def, previewFieldSpellId) : getFieldMods(def);
                var equipMods = getEquipMods(monsterInst);
                var tempAtk = (monsterInst.tempStatMods && typeof monsterInst.tempStatMods.atk === "number") ? monsterInst.tempStatMods.atk : 0;
                var tempDef = (monsterInst.tempStatMods && typeof monsterInst.tempStatMods.def === "number") ? monsterInst.tempStatMods.def : 0;
                var atkMod = mods.atk + equipMods.atk + tempAtk;
                var defMod = mods.def + equipMods.def + tempDef;

                existingBadge.remove();

                if (atkMod !== 0 || defMod !== 0) {
                    var previewExtraClass = isPreviewMode ? " stat-mod-field-preview" : "";

                    if (atkMod === defMod) {
                        // Symmetric: single combined badge
                        var isPos = atkMod > 0;
                        var badgeClass = "stat-mod-badge " + (isPos ? "stat-mod-buff" : "stat-mod-debuff") + previewExtraClass;
                        var icon = isPreviewMode ? "⚡" : (isPos ? "▲" : "▼");
                        var badge = $("<div class=\"" + badgeClass + "\">" +
                            "<span class=\"stat-mod-icon\">" + icon + "</span>" +
                            "<span class=\"stat-mod-label\">" + (isPos ? "+" : "") + atkMod + "</span>" +
                        "</div>");
                        square.append(badge);
                    } else {
                        // Asymmetric: show ATK and DEF separately
                        if (atkMod !== 0) {
                            var atkIsPos = atkMod > 0;
                            var atkIcon = isPreviewMode ? "⚡" : (atkIsPos ? "▲" : "▼");
                            var atkBadge = $("<div class=\"stat-mod-badge " + (atkIsPos ? "stat-mod-buff" : "stat-mod-debuff") + previewExtraClass + "\">" +
                                "<span class=\"stat-mod-icon\">" + atkIcon + "</span>" +
                                "<span class=\"stat-mod-label\">ATK " + (atkIsPos ? "+" : "") + atkMod + "</span>" +
                            "</div>");
                            square.append(atkBadge);
                        }
                        if (defMod !== 0) {
                            var defIsPos = defMod > 0;
                            var defIcon = isPreviewMode ? "⚡" : (defIsPos ? "▲" : "▼");
                            var defBadge = $("<div class=\"stat-mod-badge " + (defIsPos ? "stat-mod-buff" : "stat-mod-debuff") + previewExtraClass + "\">" +
                                "<span class=\"stat-mod-icon\">" + defIcon + "</span>" +
                                "<span class=\"stat-mod-label\">DEF " + (defIsPos ? "+" : "") + defMod + "</span>" +
                            "</div>");
                            square.append(defBadge);
                        }
                    }
                }
            } else if (existingBadge.length) {
                existingBadge.remove();
            }
        }
    });

    // 2. Player hand monsters (washed-out preview badges)
    $("#player-hand > .card").each(function() {
        var cardName = $(this).attr("data-card-name");
        var cardDef = cards[cardName];
        var existingBadge = $(this).find(".stat-mod-badge");

        if (cardDef && cardDef.type === "monsters") {
            var mods = isPreviewMode ? getFieldMods(cardDef, previewFieldSpellId) : getFieldMods(cardDef);
            var atkMod = mods.atk;
            var defMod = mods.def;

            existingBadge.remove();

            if (atkMod !== 0 || defMod !== 0) {
                var previewExtraClass = isPreviewMode ? " stat-mod-field-preview" : "";
                if (atkMod === defMod) {
                    // Symmetric: single combined preview badge
                    var isPos = atkMod > 0;
                    var modClass = (isPos ? "stat-mod-buff" : "stat-mod-debuff") + " stat-mod-preview" + previewExtraClass;
                    var icon = isPreviewMode ? "⚡" : (isPos ? "▲" : "▼");
                    $(this).append($("<div class=\"stat-mod-badge " + modClass + "\">" +
                        "<span class=\"stat-mod-icon\">" + icon + "</span>" +
                        "<span class=\"stat-mod-label\">" + (isPos ? "+" : "") + atkMod + "</span>" +
                    "</div>"));
                } else {
                    // Asymmetric: show ATK and DEF separately
                    if (atkMod !== 0) {
                        var atkIsPos = atkMod > 0;
                        var atkIcon = isPreviewMode ? "⚡" : (atkIsPos ? "▲" : "▼");
                        $(this).append($("<div class=\"stat-mod-badge " + (atkIsPos ? "stat-mod-buff" : "stat-mod-debuff") + " stat-mod-preview" + previewExtraClass + "\">" +
                            "<span class=\"stat-mod-icon\">" + atkIcon + "</span>" +
                            "<span class=\"stat-mod-label\">ATK " + (atkIsPos ? "+" : "") + atkMod + "</span>" +
                        "</div>"));
                    }
                    if (defMod !== 0) {
                        var defIsPos = defMod > 0;
                        var defIcon = isPreviewMode ? "⚡" : (defIsPos ? "▲" : "▼");
                        $(this).append($("<div class=\"stat-mod-badge " + (defIsPos ? "stat-mod-buff" : "stat-mod-debuff") + " stat-mod-preview" + previewExtraClass + "\">" +
                            "<span class=\"stat-mod-icon\">" + defIcon + "</span>" +
                            "<span class=\"stat-mod-label\">DEF " + (defIsPos ? "+" : "") + defMod + "</span>" +
                        "</div>"));
                    }
                }
            }
        } else if (existingBadge.length) {
            existingBadge.remove();
        }
    });

    // 3. Update DEF LOCKED badges for Dragon monsters under Dragon Capture Jar
    updateDefLockedBadges();

    // 4. Update FLIP badges for face-down Defense monsters with flip effects
    updateFlipBadges();

    // 5. Update IMMUNE badges for monsters immune to Spell targeting
    updateImmuneBadges();
}

// Update or create visual "DEF LOCKED" badges for Dragon monsters affected by Dragon Capture Jar
function updateDefLockedBadges() {
    var isLocked = (typeof isDragonLocked === "function") && isDragonLocked();

    ["player", "computer"].forEach(function(who) {
        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;
            var existing = square.find(".def-locked-badge");

            if (monsterInst && !isFaceDown && isLocked) {
                var def = cards[monsterInst.cardId];
                if (def && def.monsterType === "Dragon") {
                    if (!existing.length) {
                        var badge = $("<div class=\"def-locked-badge\">" +
                            "<span class=\"def-locked-icon\">🔒</span>" +
                            "<span class=\"def-locked-label\">DEF LOCKED</span>" +
                        "</div>");
                        square.append(badge);
                    }
                    continue;
                }
            }

            if (existing.length) {
                existing.remove();
            }
        }
    });
}

// Face-down Defense monsters with a FLIP effect get a "FLIP" badge so the
// controller knows the monster is a flip monster waiting to be triggered.
// Only shown for the human player's own monsters — showing it on the AI's
// face-down monsters would leak that they are flip monsters.
var FLIP_EFFECT_MONSTERS = ["man-eater-bug", "hane-hane", "dragon-piper", "spear-cretin"];

function updateFlipBadges() {
    for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
        var square = getSquareElm("player", zoneNum);
        if (!square || !square.length) continue;

        var monsterInst = (GameState && GameState.player && GameState.player.field && GameState.player.field.monsters) ? GameState.player.field.monsters[zoneNum] : null;
        var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;
        var existing = square.find(".flip-effect-badge");

        if (monsterInst && isFaceDown && FLIP_EFFECT_MONSTERS.indexOf(monsterInst.cardId) !== -1) {
            if (!existing.length) {
                var badge = $("<div class=\"flip-effect-badge\">" +
                    "<span class=\"flip-badge-icon\">🔄</span>" +
                    "<span class=\"flip-badge-label\">FLIP</span>" +
                "</div>");
                square.append(badge);
            }
        } else if (existing.length) {
            existing.remove();
        }
    }
}

// Monsters immune to Spell targeting (e.g. Deepsea Warrior) get an "IMMUNE"
// badge while face-up, so both players can see the protection.
function updateImmuneBadges() {
    ["player", "computer"].forEach(function(who) {
        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;
            var existing = square.find(".immune-badge");

            if (monsterInst && !isFaceDown && monsterInst.cardId === "deepsea-warrior") {
                if (!existing.length) {
                    var badge = $("<div class=\"immune-badge\">" +
                        "<span class=\"immune-badge-icon\">🛡</span>" +
                        "<span class=\"immune-badge-label\">IMMUNE</span>" +
                    "</div>");
                    square.append(badge);
                }
            } else if (existing.length) {
                existing.remove();
            }
        }
    });
}
