/**
 * Effects Core Engine: TargetEngine, lifecycle event bus triggers,
 * continuous field locks (Jinzoid, Dragon Capture Jar, Swords of Revealing Light, Mausoleum),
 * and universal board mutation utilities.
 */

// ---------------------------------------------------------------------------
// Universal Promise-Based Tactical Target Engine
// ---------------------------------------------------------------------------
var TargetEngine = {
    _activeResolver: null,

    // Request a target candidate from player or AI
    // config: {
    //   title: string,
    //   subtitle: string,
    //   badge: { category: string, color: string, glowColor: string },
    //   candidates: Array<{ side, zone, isField, inst, name, def, type }>,
    //   aiPick: Function(candidates) -> candidate
    // }
    requestTarget: function(who, config) {
        var self = this;
        var candidates = config.candidates || [];

        if (candidates.length === 0) {
            return Promise.resolve(null);
        }

        // Computer AI Resolution
        if (who === "computer") {
            return new Promise(function(resolve) {
                var chosen = null;
                if (typeof config.aiPick === "function") {
                    chosen = config.aiPick(candidates);
                }
                if (!chosen) chosen = candidates[0];
                setTimeout(function() {
                    resolve(chosen);
                }, (typeof getAnimDuration === "function") ? getAnimDuration(300) : 300);
            });
        }

        // Player UI Resolution
        return new Promise(function(resolve) {
            self._activeResolver = resolve;

            // Update modal headers & badges
            $("#tactical-target-title").text(config.title || "SELECT TARGET");
            $("#tactical-target-subtitle").text(config.subtitle || "CHOOSE A VALID TARGET CARD");
            
            var badgeCat = (config.badge && config.badge.category) ? config.badge.category : "TARGET SELECTION";
            var badgeColor = (config.badge && config.badge.color) ? config.badge.color : "#0ea5e9";
            var glowColor = (config.badge && config.badge.glowColor) ? config.badge.glowColor : "rgba(14, 165, 233, 0.45)";

            $("#tactical-target-category").text(badgeCat).css("color", badgeColor);
            $("#tactical-target-dot").css({ background: badgeColor, "box-shadow": "0 0 8px " + badgeColor });
            $("#tactical-target-glow").css("background", "radial-gradient(circle, " + glowColor + " 0%, transparent 70%)");

            var grid = $("#tactical-target-grid");
            grid.empty();

            candidates.forEach(function(entry) {
                var cardDef = entry.def || (entry.inst ? cards[entry.inst.cardId] : (entry.cardId ? cards[entry.cardId] : null));
                var isFaceDown = entry.inst ? (entry.inst.faceDown || entry.inst.position === "defense-down" || entry.inst.position === "set") : false;
                var isOpp = entry.side === "computer";
                var ownerLabel = entry.customOwnerLabel || (isOpp ? "OPPONENT" : "YOUR FIELD");
                var ownerClass = entry.customOwnerClass || (isOpp ? "tag-opponent" : "tag-player");
                var zoneLabel = entry.zoneLabel || (entry.isField ? "FIELD ZONE" : (entry.zone !== undefined ? "ZONE #" + entry.zone : ""));

                var imgSrc = (isFaceDown && isOpp) ? "cards/card_back.png" : "cards/" + (cardDef ? cardDef.file : "card_back.png");
                var displayName = (isFaceDown && isOpp) ? "Face-Down Card" : (cardDef ? cardDef.name : (entry.name || "Card"));
                
                var statsHtml = "";
                if (entry.statsHtml) {
                    statsHtml = entry.statsHtml;
                } else if (isFaceDown && isOpp) {
                    statsHtml = "<span class=\"rebirth-tile-stats\">Set (Hidden)</span>";
                } else if (cardDef && cardDef.type === "monsters") {
                    var curAtk = entry.inst ? (typeof getMonsterAtk === "function" ? getMonsterAtk(entry.inst) : cardDef.atk) : (cardDef.atk || 0);
                    var curDef = entry.inst ? (typeof getMonsterDef === "function" ? getMonsterDef(entry.inst) : cardDef.def) : (cardDef.def || 0);
                    statsHtml = "<span class=\"rebirth-tile-stats\">ATK " + curAtk + " / DEF " + curDef + "</span>";
                } else if (cardDef) {
                    statsHtml = "<span class=\"rebirth-tile-stats\">" + (cardDef.subType || cardDef.type || "Spell/Trap").toUpperCase() + "</span>";
                }

                var tile = $("<div class=\"rebirth-card-tile target-trap-tile\" style=\"cursor: pointer;\">" +
                    "<div class=\"rebirth-card-preview-frame\">" +
                        "<img src=\"" + imgSrc + "\" alt=\"" + displayName + "\" class=\"rebirth-thumb-img\">" +
                        "<span class=\"target-owner-tag " + ownerClass + "\">" + ownerLabel + (zoneLabel ? " • " + zoneLabel : "") + "</span>" +
                    "</div>" +
                    "<div class=\"rebirth-tile-meta\">" +
                        "<h4 class=\"rebirth-tile-name\">" + displayName + "</h4>" +
                        statsHtml +
                    "</div>" +
                "</div>");

                tile.on("click", function() {
                    self._resolveTarget(entry);
                });

                grid.append(tile);
            });

            $("#tactical-target-modal").fadeIn(150);
        });
    },

    _resolveTarget: function(target) {
        $("#tactical-target-modal").fadeOut(120);
        if (this._activeResolver) {
            var res = this._activeResolver;
            this._activeResolver = null;
            res(target);
        }
    },

    cancelTarget: function() {
        this._resolveTarget(null);
        if (typeof resetActiveCardClass === "function") resetActiveCardClass();
        if (typeof hideAtkMenuIfVisible === "function") hideAtkMenuIfVisible();
    }
};

// ---------------------------------------------------------------------------
// Card Reactive Triggers Engine (EventBus Subscriptions)
// ---------------------------------------------------------------------------
function initCardTriggers() {
    if (typeof EventBus === "undefined") return;
    if (initCardTriggers._initialized) return;
    initCardTriggers._initialized = true;

    EventBus.on("CARD_SENT_TO_GRAVE", async function(data) {
        if (data.suppressGraveEffect) return;
        var cardInst = data.cardInst;
        if (!cardInst) return;
        if (cardInst.cardId === "abyssal-scout" && data.fromField && typeof triggerAbyssalScoutSearch === "function") {
            await triggerAbyssalScoutSearch(data.who);
        }
        var cardDef = cards[cardInst.cardId];
        if (cardDef && typeof cardDef.onSentToGraveyard === "function") {
            await cardDef.onSentToGraveyard(data);
        }
    });

    EventBus.on("DAMAGE_STEP_END", async function(data) {
        if (data.attackerInst) {
            var attDef = cards[data.attackerInst.cardId];
            if (attDef && typeof attDef.onDamageStepEnd === "function") {
                await attDef.onDamageStepEnd(Object.assign({ role: "attacker" }, data));
            }
        }
        if (data.defenderInst) {
            var defDef = cards[data.defenderInst.cardId];
            if (defDef && typeof defDef.onDamageStepEnd === "function") {
                await defDef.onDamageStepEnd(Object.assign({ role: "defender" }, data));
            }
        }
    });

    EventBus.on("BATTLE_DESTROYED", async function(data) {
        if (data.destroyedInst) {
            var cardDef = cards[data.destroyedInst.cardId];
            if (cardDef && typeof cardDef.onBattleDestroyed === "function") {
                await cardDef.onBattleDestroyed(data);
            }
        }
    });
}

$(document).ready(function() {
    initCardTriggers();
});

// ---------------------------------------------------------------------------
// Persistent Effect Helpers
// ---------------------------------------------------------------------------

// Does `who` have an active (face-up) copy of cardId in spell zones or field zone?
function hasActiveCard(who, cardId) {
    var spells = GameState[who].field.spells;
    for (var i = 1; i <= 6; i++) {
        if (spells[i] && spells[i].cardId === cardId && spells[i].position !== "set") {
            return true;
        }
    }
    var fieldZone = GameState[who].field.fieldZone;
    if (fieldZone && fieldZone.cardId === cardId) return true;
    return false;
}

// Swords of Revealing Light: the opponent of the controller cannot attack.
// `attackerWho` is the side trying to attack.
function isAttackBlocked(attackerWho) {
    var defenderWho = attackerWho === "player" ? "computer" : "player";
    return hasActiveCard(defenderWho, "swords-of-revealing-light");
}

// Jinzoid: while face-up on the field, Trap Cards and their effects cannot be activated / are negated
function isJinzoidActive() {
    if (typeof GameState === "undefined" || !GameState) return false;
    var active = false;
    ["player", "computer"].forEach(function(who) {
        if (GameState[who] && GameState[who].field && GameState[who].field.monsters) {
            for (var z = 1; z <= 6; z++) {
                var m = GameState[who].field.monsters[z];
                if (m && (m.cardId === "jinzoid" || m.cardId === "jinzo") && !m.faceDown && m.position !== "defense-down") {
                    active = true;
                }
            }
        }
    });
    return active;
}

// Dragon Capture Jar: while face-up, Dragons cannot be in/switch to Attack Position.
function isDragonLocked() {
    if (isJinzoidActive()) return false;
    return hasActiveCard("player", "dragon-capture-jar") || hasActiveCard("computer", "dragon-capture-jar");
}

// Mausoleum of Offerings: while face-up in either Field Zone, turn player can pay 1000 LP per required tribute
function isMausoleumActive() {
    var pField = GameState && GameState.player && GameState.player.field ? GameState.player.field.fieldZone : null;
    var cField = GameState && GameState.computer && GameState.computer.field ? GameState.computer.field.fieldZone : null;
    return (pField && pField.cardId === "mausoleum-of-offerings" && pField.position !== "set") ||
           (cField && cField.cardId === "mausoleum-of-offerings" && cField.position !== "set");
}

// ---------------------------------------------------------------------------
// Shared Field / Graveyard Helpers (migrated from card-effects.js)
// ---------------------------------------------------------------------------

// A monster with "cannot be targeted by the effects of Spell Cards" immunity (Deepsea Warrior).
function isImmuneToSpellTargeting(monsterInst, spellController) {
    if (!monsterInst) return false;
    if (monsterInst.cardId !== 'deepsea-warrior') return false;
    if (monsterInst.faceDown || monsterInst.position === 'defense-down') return false;
    return true;
}

// Keep DOM in sync with a just-activated spell/trap instance.
function targetSquareStateFix(who, zoneNum, position) {
    var square = zoneNum === null || zoneNum === undefined ? getFieldZoneElm(who) : getSpellSquareElm(who, zoneNum);
    if (square && square.length) {
        square.attr('data-card-position', position);
        square.find('div.card-zone').flip(false);
    }
}

// Return a continuous trap that failed to resolve back to its face-down Set state.
function revertContinuousTrapToSet(who, zoneNum) {
    if (zoneNum === null || zoneNum === undefined) return;
    var inst = GameState[who] && GameState[who].field.spells[zoneNum];
    if (inst) {
        inst.position = 'set';
        inst.faceDown = true;
    }
    var square = getSpellSquareElm(who, zoneNum);
    if (square && square.length) {
        square.attr('data-card-position', 'set');
        var zoneElm = square.find('div.card-zone');
        if (typeof zoneElm.flip === 'function') {
            try {
                zoneElm.flip({ trigger: 'manual' });
                zoneElm.flip(true);
            } catch (e) {}
        }
    }
}

// Find the first face-up trap on a side's spell zones.
function findFaceUpTrap(who) {
    var spells = GameState[who].field.spells;
    for (var i = 1; i <= 6; i++) {
        var inst = spells[i];
        if (inst && cards[inst.cardId] && cards[inst.cardId].type === 'traps' && inst.position !== 'set') {
            return { zone: i, card: inst };
        }
    }
    return null;
}

// Find all face-up traps across both fields (as array of { who, zone, card })
function getAllFaceUpTraps() {
    var result = [];
    ['computer', 'player'].forEach(function(side) {
        var spells = GameState[side].field.spells;
        for (var i = 1; i <= 6; i++) {
            var inst = spells[i];
            if (inst && cards[inst.cardId] && cards[inst.cardId].type === 'traps' && inst.position !== 'set') {
                result.push({ who: side, zone: i, card: inst });
            }
        }
    });
    return result;
}

// Collect monster instances from both graveyards (as { who, cardId }).
function getGraveyardMonsters() {
    var result = [];
    ['player', 'computer'].forEach(function(who) {
        GameState[who].graveyard.forEach(function(inst) {
            var def = cards[inst.cardId];
            if (def && def.type === 'monsters' && !def.isToken && def.subType !== 'token' && !inst.isToken) {
                if (def.cannotBeSpecialSummoned) return;
                result.push({ who: who, cardId: inst.cardId });
            }
        });
    });
    return result;
}

// Find the spell zone where `cardId` sits on `who`'s field (or null).
function findSpellZoneByCard(who, cardId) {
    var spells = GameState[who].field.spells;
    for (var i = 1; i <= 6; i++) {
        if (spells[i] && spells[i].cardId === cardId) return i;
    }
    return null;
}

// Find the spell zone on `who`'s field containing a SET copy of cardId (or null).
function findSetTrapZone(who, cardId) {
    var spells = GameState[who].field.spells;
    for (var i = 1; i <= 6; i++) {
        if (spells[i] && spells[i].cardId === cardId && spells[i].position === 'set') {
            return i;
        }
    }
    return null;
}

// All monsters on `who`'s field that are currently face-up (valid equip targets)
function getFaceUpMonstersOnField(who) {
    return GameState.getMonstersOnField(who).filter(function(m) {
        return m.card && !m.card.faceDown && m.card.position !== 'defense-down';
    });
}

// Find the active (face-up) Swords zone on `who`'s field (or null).
function findActiveSwordsZone(who) {
    var spells = GameState[who].field.spells;
    for (var i = 1; i <= 6; i++) {
        if (spells[i] && spells[i].cardId === 'swords-of-revealing-light' && spells[i].position === 'active') {
            return i;
        }
    }
    return null;
}

// Update or create the visual turn counter badge floating over Swords of Revealing Light
function updateSwordsVisualCounter(who, zoneNum, turnsLeft) {
    var square = getSpellSquareElm(who, zoneNum);
    if (!square || !square.length) return;

    var existingBadge = square.find('.swords-turn-counter-badge');
    if (turnsLeft > 0) {
        var label = turnsLeft + (turnsLeft === 1 ? ' TURN' : ' TURNS');
        if (!existingBadge.length) {
            existingBadge = $('<div class="swords-turn-counter-badge">' +
                '<span class="swords-counter-icon">⚔</span>' +
                '<span class="swords-counter-label">' + label + '</span>' +
            '</div>');
            square.append(existingBadge);
        } else {
            existingBadge.find('.swords-counter-label').text(label);
        }
        existingBadge.addClass('counter-updated');
        setTimeout(function() { existingBadge.removeClass('counter-updated'); }, 400);
    } else if (existingBadge.length) {
        existingBadge.remove();
    }
}

function hasSpellTrapOnField() {
    var targets = [];
    ['player', 'computer'].forEach(function(side) {
        for (var z = 1; z <= 6; z++) {
            if (GameState[side].field.spells[z]) {
                targets.push({ side: side, zone: z, isField: false });
            }
        }
        if (GameState[side].field.fieldZone) {
            targets.push({ side: side, zone: null, isField: true });
        }
    });
    return targets.length > 0;
}

// Remove the EQUIPPED visual tag from a monster square (by monster uid).
function removeEquipTag(who, monsterUid) {
    var monsters = GameState[who].field.monsters;
    for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
        if (monsters[zoneNum] && monsters[zoneNum].uid === monsterUid) {
            var square = getSquareElm(who, zoneNum);
            if (square && square.length) square.find('.equip-tag-badge').remove();
            return;
        }
    }
}

// Void Sentinel: Check if a card instance is currently negated
function isNegatedByVoidSentinel(cardInst) {
    if (!cardInst || !cardInst.negatedUntilTurn) return false;
    return turnCount <= cardInst.negatedUntilTurn;
}

function cleanupExpiredNegations() {
    ['player', 'computer'].forEach(function(who) {
        if (GameState[who] && GameState[who].hand) {
            GameState[who].hand.forEach(function(inst) {
                if (inst.negatedUntilTurn && turnCount > inst.negatedUntilTurn) {
                    inst.negatedUntilTurn = null;
                    inst.negatedBy = null;
                }
            });
        }
        for (var z = 1; z <= 6; z++) {
            var m = GameState[who].field.monsters[z];
            if (m && m.negatedUntilTurn && turnCount > m.negatedUntilTurn) {
                m.negatedUntilTurn = null;
                m.negatedBy = null;
            }
        }
        for (var z = 1; z <= 6; z++) {
            var s = GameState[who].field.spells[z];
            if (s && s.negatedUntilTurn && turnCount > s.negatedUntilTurn) {
                s.negatedUntilTurn = null;
                s.negatedBy = null;
            }
        }
    });
}

