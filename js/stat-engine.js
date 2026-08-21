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
    var fieldsToEvaluate = [];

    // Collect currently active field spells on both sides
    for (var s = 0; s < bothSides.length; s++) {
        var who = bothSides[s];
        var fieldInst = (typeof GameState !== "undefined" && GameState && GameState[who] && GameState[who].field) ? GameState[who].field.fieldZone : null;
        if (fieldInst && fieldInst.cardId) {
            fieldsToEvaluate.push(fieldInst.cardId);
        }
    }

    // If previewing a field spell from hand, stack it on top of existing active field spells
    if (typeof overridePlayerFieldId === "string" && overridePlayerFieldId.length > 0) {
        fieldsToEvaluate.push(overridePlayerFieldId);
    }

    for (var i = 0; i < fieldsToEvaluate.length; i++) {
        var fieldId = fieldsToEvaluate[i];
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

    // Gravity Tether: Opponent's monsters lose 100 ATK per Level
    if (typeof GameState !== "undefined" && GameState) {
        var mController = null;
        ["player", "computer"].forEach(function(who) {
            if (GameState[who] && GameState[who].field && GameState[who].field.monsters) {
                for (var z = 1; z <= 6; z++) {
                    var m = GameState[who].field.monsters[z];
                    if (m && (m === instance || (instance.uid && m.uid === instance.uid))) {
                        mController = who;
                        break;
                    }
                }
            }
        });

        if (mController) {
            var oppSide = GameState.getOpponent(mController);
            if (GameState[oppSide] && GameState[oppSide].field && GameState[oppSide].field.spells) {
                for (var sz = 1; sz <= 6; sz++) {
                    var sp = GameState[oppSide].field.spells[sz];
                    if (sp && sp.cardId === "gravity-tether" && sp.position === "active") {
                        var lvl = def.level || 1;
                        selfMod -= (lvl * 100);
                    }
                }
            }
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
                var curFieldMods = getFieldMods(def);
                var effectiveAtk = getMonsterAtk(monsterInst);
                var baseAtk = def.atk || 0;
                var atkMod = isPreviewMode ? (effectiveAtk - baseAtk + mods.atk - curFieldMods.atk) : (effectiveAtk - baseAtk);

                var effectiveDef = getMonsterDef(monsterInst);
                var baseDef = def.def || 0;
                var defMod = isPreviewMode ? (effectiveDef - baseDef + mods.def - curFieldMods.def) : (effectiveDef - baseDef);

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
                        // Asymmetric: show ATK and DEF separately (DEF bottom layer, ATK top layer)
                        if (defMod !== 0) {
                            var defIsPos = defMod > 0;
                            var defIcon = isPreviewMode ? "⚡" : (defIsPos ? "▲" : "▼");
                            var defBadge = $("<div class=\"stat-mod-badge stat-mod-def " + (defIsPos ? "stat-mod-buff" : "stat-mod-debuff") + previewExtraClass + "\">" +
                                "<span class=\"stat-mod-icon\">" + defIcon + "</span>" +
                                "<span class=\"stat-mod-label\">DEF " + (defIsPos ? "+" : "") + defMod + "</span>" +
                            "</div>");
                            square.append(defBadge);
                        }
                        if (atkMod !== 0) {
                            var atkIsPos = atkMod > 0;
                            var atkIcon = isPreviewMode ? "⚡" : (atkIsPos ? "▲" : "▼");
                            var atkBadge = $("<div class=\"stat-mod-badge stat-mod-atk " + (atkIsPos ? "stat-mod-buff" : "stat-mod-debuff") + previewExtraClass + "\">" +
                                "<span class=\"stat-mod-icon\">" + atkIcon + "</span>" +
                                "<span class=\"stat-mod-label\">ATK " + (atkIsPos ? "+" : "") + atkMod + "</span>" +
                            "</div>");
                            square.append(atkBadge);
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
                    // Asymmetric: show ATK and DEF separately (DEF bottom layer, ATK top layer)
                    if (defMod !== 0) {
                        var defIsPos = defMod > 0;
                        var defIcon = isPreviewMode ? "⚡" : (defIsPos ? "▲" : "▼");
                        $(this).append($("<div class=\"stat-mod-badge stat-mod-def " + (defIsPos ? "stat-mod-buff" : "stat-mod-debuff") + " stat-mod-preview" + previewExtraClass + "\">" +
                            "<span class=\"stat-mod-icon\">" + defIcon + "</span>" +
                            "<span class=\"stat-mod-label\">DEF " + (defIsPos ? "+" : "") + defMod + "</span>" +
                        "</div>"));
                    }
                    if (atkMod !== 0) {
                        var atkIsPos = atkMod > 0;
                        var atkIcon = isPreviewMode ? "⚡" : (atkIsPos ? "▲" : "▼");
                        $(this).append($("<div class=\"stat-mod-badge stat-mod-atk " + (atkIsPos ? "stat-mod-buff" : "stat-mod-debuff") + " stat-mod-preview" + previewExtraClass + "\">" +
                            "<span class=\"stat-mod-icon\">" + atkIcon + "</span>" +
                            "<span class=\"stat-mod-label\">ATK " + (atkIsPos ? "+" : "") + atkMod + "</span>" +
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

    // 6. Update NO TRIBUTE badges for tokens/monsters that cannot be tributed
    updateNoTributeBadges();

    // 7. Update ATTACK LOCKED badges for monsters restricted from attacking
    updateAttackLockedBadges();

    // 8. Update EFFECT READY badges for monsters with available ignition effects
    updateEffectReadyBadges();

    // 9. Update TRIBUTABLE badges for opponent monsters bound by Tribute of the Ages
    updateTributeBoundBadges();

    // 10. Update Destruction Preview Red X Marks when mass removal cards are selected
    updateDestructionPreviewMarks();
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
var FLIP_EFFECT_MONSTERS = ["man-eater-bug", "zephyr-imp", "dragon-piper", "spear-cretin"];

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

// Monsters and tokens that cannot be tributed for a Tribute Summon (e.g. Phantom Tokens)
// get a "NO TRIBUTE" badge while face-up, so players immediately know they cannot be sacrificed.
function updateNoTributeBadges() {
    ["player", "computer"].forEach(function(who) {
        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;
            var existing = square.find(".no-tribute-badge");

            var def = monsterInst ? cards[monsterInst.cardId] : null;
            var cannotBeTributed = monsterInst && !isFaceDown && (monsterInst.cannotBeTributed === true || (def && def.cannotBeTributed === true));

            if (cannotBeTributed) {
                if (!existing.length) {
                    var badge = $("<div class=\"no-tribute-badge\">" +
                        "<span class=\"no-tribute-icon\">🛡️</span>" +
                        "<span class=\"no-tribute-label\">NO TRIBUTE</span>" +
                    "</div>");
                    square.append(badge);
                }
            } else if (existing.length) {
                existing.remove();
            }
        }
    });
}

// Face-up Attack Position monsters that cannot declare attacks (e.g. Swords of Revealing Light,
// Tribute of the Ages lock, Turn 1 restriction, 0 ATK, or cannotAttack flag) get an "ATTACK LOCKED" badge.
function updateAttackLockedBadges() {
    var isTurn1 = (typeof turnCount !== 'undefined' && turnCount === 1);
    var sides = ["player", "computer"];

    sides.forEach(function(who) {
        var isSwordsBlocked = (typeof isAttackBlocked === 'function') && isAttackBlocked(who);
        var isBattleLocked = (typeof GameState !== 'undefined' && GameState && GameState.turn && GameState.turn.battlePhaseLocked && GameState.turn.active === who);

        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;
            var existing = square.find(".attack-locked-badge");

            if (monsterInst && !isFaceDown && monsterInst.position === 'attack') {
                var effectiveAtk = typeof getMonsterAtk === 'function' ? getMonsterAtk(monsterInst) : (cards[monsterInst.cardId] ? cards[monsterInst.cardId].atk : 0);
                var isLocked = isSwordsBlocked || isBattleLocked || isTurn1 || effectiveAtk <= 0 || (monsterInst.cannotAttack === true);

                if (isLocked) {
                    if (!existing.length) {
                        var badge = $("<div class=\"attack-locked-badge\">" +
                            "<span class=\"attack-locked-icon\">⚔️</span>" +
                            "<span class=\"attack-locked-label\">LOCKED</span>" +
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

// Face-up monsters on the active player's field with available ignition effects get an "EFFECT READY" badge.
function updateEffectReadyBadges() {
    var isPlayerTurn = (typeof turn !== 'undefined' && turn === 0 && GameState && GameState.turn && GameState.turn.active === 'player');
    var isMainPhase = (typeof phase !== 'undefined' && phase === 1);
    var hasHandCards = (GameState && GameState.player && GameState.player.hand) ? (GameState.player.hand.length > 0) : false;

    for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
        var square = getSquareElm("player", zoneNum);
        if (!square || !square.length) continue;

        var monsterInst = (GameState && GameState.player && GameState.player.field && GameState.player.field.monsters) ? GameState.player.field.monsters[zoneNum] : null;
        var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;
        var existing = square.find(".effect-ready-badge");

        var canUseEffect = false;
        if (isPlayerTurn && isMainPhase && monsterInst && !isFaceDown && monsterInst.lastEffectTurn !== turnCount) {
            var def = cards[monsterInst.cardId];
            if (def) {
                if (typeof def.canActivateIgnition === 'function') {
                    canUseEffect = def.canActivateIgnition('player', zoneNum);
                } else if (monsterInst.cardId === 'time-wizard') {
                    canUseEffect = true;
                } else if (monsterInst.cardId === 'harpie-lady') {
                    canUseEffect = hasHandCards && (typeof hasSpellTrapOnField === 'function' && hasSpellTrapOnField());
                } else if (monsterInst.cardId === 'exiled-force') {
                    canUseEffect = GameState.getMonstersOnField('computer').length > 0;
                } else if (monsterInst.cardId === 'gryphon-stormlord') {
                    canUseEffect = hasHandCards && GameState.player.hand.some(function(c) { var d = cards[c.cardId]; return d && d.attribute === 'WIND'; });
                } else if (typeof def.onIgnitionEffect === 'function') {
                    canUseEffect = true;
                }
            }
        }

        if (canUseEffect) {
            if (!existing.length) {
                var badge = $("<div class=\"effect-ready-badge\">" +
                    "<span class=\"effect-ready-icon\">⚡</span>" +
                    "<span class=\"effect-ready-label\">EFFECT</span>" +
                "</div>");
                square.append(badge);
            }
        } else if (existing.length) {
            existing.remove();
        }
    }
}

// Opponent monsters bound by Tribute of the Ages get a "TRIBUTABLE" badge so both players
// immediately see that this monster can be sacrificed for a Tribute Summon this turn.
function updateTributeBoundBadges() {
    var soulTarget = (GameState && GameState.turn && GameState.turn.tributeOfTheAgesTarget) ? GameState.turn.tributeOfTheAgesTarget : null;

    ["player", "computer"].forEach(function(who) {
        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === "defense-down" || monsterInst.faceDown) : false;
            var existing = square.find(".tributable-bound-badge");

            var isTarget = soulTarget && soulTarget.opp === who && soulTarget.zone === zoneNum && monsterInst && monsterInst.uid === soulTarget.uid && !isFaceDown;

            if (isTarget) {
                if (!existing.length) {
                    var badge = $("<div class=\"tributable-bound-badge\">" +
                        "<span class=\"tributable-bound-icon\">🔮</span>" +
                        "<span class=\"tributable-bound-label\">TRIBUTABLE</span>" +
                    "</div>");
                    square.append(badge);
                }
            } else if (existing.length) {
                existing.remove();
            }
        }
    });
}

// Renders translucent red X destruction preview overlays over revealed/face-up monsters
// that would be destroyed if the currently selected hand card is activated.
function updateDestructionPreviewMarks() {
    var activeHandCard = (typeof activeCard !== 'undefined' && activeCard && activeCard.length && activeCard.closest('#player-hand').length > 0) ? activeCard : null;
    var cardId = activeHandCard ? activeHandCard.attr('data-card-name') : null;
    var cardDef = cardId ? getCardDef(cardId) : null;

    // First remove all existing destruction preview marks and target checkmarks
    $('.monster-destruct-preview-overlay, .monster-target-preview-overlay').remove();

    if (!cardDef || typeof GameState === 'undefined' || !GameState) return;

    var targetsToMark = []; // Array of { who, zone }
    var isGreenCheck = false;

    if (cardDef.id === 'lunar-grimoire') {
        // Lunar Grimoire can target any face-up Attack or face-up Defense monster (except tokens and spell-immune)
        isGreenCheck = true;
        ['player', 'computer'].forEach(function(who) {
            var monsters = GameState.getMonstersOnField(who);
            monsters.forEach(function(entry) {
                var m = entry.card;
                var d = m ? cards[m.cardId] : null;
                var isToken = m && (m.isToken || (d && (d.isToken || d.subType === 'token')));
                var isFaceUp = m && !m.faceDown && m.position !== 'defense-down';
                var isImmune = (typeof isImmuneToSpellTargeting === 'function') && isImmuneToSpellTargeting(m, 'player');
                if (isFaceUp && !isToken && !isImmune) {
                    targetsToMark.push({ who: who, zone: entry.zone });
                }
            });
        });
    } else if (cardDef.id === 'dark-hole') {
        // Dark Hole destroys all monsters on both fields (face-up and face-down defense)
        ['player', 'computer'].forEach(function(who) {
            var monsters = GameState.getMonstersOnField(who);
            monsters.forEach(function(entry) {
                targetsToMark.push({ who: who, zone: entry.zone });
            });
        });
    } else if (cardDef.id === 'raigeki') {
        // Raigeki destroys all opponent monsters that are revealed/visible to the player
        var oppMonsters = GameState.getMonstersOnField('computer');
        oppMonsters.forEach(function(entry) {
            var isFaceDown = entry.card && (entry.card.position === 'defense-down' || entry.card.faceDown);
            if (!isFaceDown) {
                targetsToMark.push({ who: 'computer', zone: entry.zone });
            }
        });
    } else if (cardDef.id === 'fissure') {
        // Fissure destroys the face-up opponent monster with the lowest ATK
        var faceUpOpp = GameState.getMonstersOnField('computer').filter(function(m) {
            return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && (typeof isImmuneToSpellTargeting === 'function' ? !isImmuneToSpellTargeting(m.card, 'player') : true);
        });
        if (faceUpOpp.length > 0) {
            faceUpOpp.sort(function(a, b) {
                var atkA = (typeof getMonsterAtk === 'function') ? getMonsterAtk(a.card) : (cards[a.card.cardId] ? cards[a.card.cardId].atk || 0 : 0);
                var atkB = (typeof getMonsterAtk === 'function') ? getMonsterAtk(b.card) : (cards[b.card.cardId] ? cards[b.card.cardId].atk || 0 : 0);
                return atkA - atkB;
            });
            targetsToMark.push({ who: 'computer', zone: faceUpOpp[0].zone });
        }
    } else if (cardDef.id === 'smashing-ground') {
        // Smashing Ground destroys the face-up opponent monster with the highest DEF
        var faceUpOpp = GameState.getMonstersOnField('computer').filter(function(m) {
            return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && (typeof isImmuneToSpellTargeting === 'function' ? !isImmuneToSpellTargeting(m.card, 'player') : true);
        });
        if (faceUpOpp.length > 0) {
            faceUpOpp.sort(function(a, b) {
                var defA = (typeof getMonsterDef === 'function') ? getMonsterDef(a.card) : (cards[a.card.cardId] ? cards[a.card.cardId].def || 0 : 0);
                var defB = (typeof getMonsterDef === 'function') ? getMonsterDef(b.card) : (cards[b.card.cardId] ? cards[b.card.cardId].def || 0 : 0);
                return defB - defA;
            });
            targetsToMark.push({ who: 'computer', zone: faceUpOpp[0].zone });
        }
    }

    // Render red X or green checkmark overlays on the matched squares
    targetsToMark.forEach(function(target) {
        var square = getSquareElm(target.who, target.zone);
        if (square && square.length) {
            var zone = square.find('div.card-zone.main-zone');
            if (zone.length) {
                if (isGreenCheck && !zone.find('.monster-target-preview-overlay').length) {
                    var checkOverlay = $('<div class="monster-target-preview-overlay">' +
                        '<div class="monster-target-checkmark"></div>' +
                    '</div>');
                    zone.append(checkOverlay);
                } else if (!isGreenCheck && !zone.find('.monster-destruct-preview-overlay').length) {
                    var overlay = $('<div class="monster-destruct-preview-overlay">' +
                        '<div class="monster-destruct-x"></div>' +
                    '</div>');
                    zone.append(overlay);
                }
            }
        }
    });
}
