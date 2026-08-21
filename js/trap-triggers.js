/**
 * Trap Triggers Engine: Auto-trigger event handlers (MONSTER_SUMMONED),
 * counter trap interception (Arcane Disruptor), and banishment utilities.
 * Attack response windows (Radiant Backlash, Prism of Retribution) and
 * standby upkeep traps live in card-effects.js.
 */

// ---------------------------------------------------------------------------
// Trap Auto-Trigger Engine (Summon Responses: Trap Hole & Torrential Tribute)
// ---------------------------------------------------------------------------

// Called after any monster is Normal Summoned or Special Summoned.
EventBus.on("MONSTER_SUMMONED", async function(data) {
    if (typeof GameState === "undefined" || !GameState || !data) return;
    if (typeof isJinzoidActive === "function" && isJinzoidActive()) return;

    var summonerWho = data.who;
    var opponent = GameState.getOpponent(summonerWho);
    var instance = data.instance;
    var def = cards[instance.cardId];
    if (!def || def.type !== "monsters") return;

    // Trap Hole triggers strictly on face-up Normal Summons with ATK >= 1000 (not face-down Sets or Special Summons)
    if (!data.isSpecialSummon && instance.position !== "defense-down" && !instance.faceDown) {
        var trapHoleZone = findSetTrapZone(opponent, "trap-hole");
        if (trapHoleZone !== null) {
            var atk = (typeof getMonsterAtk === "function") ? getMonsterAtk(instance) : (def.atk || 0);
            if (atk >= 1000) {
                var trapDef = cards["trap-hole"];
                var trapSquare = getSpellSquareElm(opponent, trapHoleZone);
                
                // Reveal Trap Hole face-up on the field before resolving
                if (trapSquare && trapSquare.length) {
                    var trapZone = trapSquare.find("div.card-zone");
                    if (typeof trapZone.flip === "function") {
                        try {
                            trapZone.flip({ trigger: "manual" });
                            trapZone.flip(false);
                        } catch (e) {}
                    }
                }

                addToFeed(trapDef.name + " activates against " + def.name + " (ATK " + atk + ")!\n");
                if (typeof BattleFX !== "undefined") {
                    BattleFX.triggerScreenShake("medium");
                }

                await sleep(getAnimDuration(400));
                await destroySpellTrap(opponent, trapHoleZone, false);
                await destroyMonster(summonerWho, data.zone);
                addToFeed("Trap Hole destroyed " + def.name + "!\n\n");

                if (typeof BattleFX !== "undefined" && typeof BattleFX.cancelTargetSelection === "function") {
                    BattleFX.cancelTargetSelection();
                }
            }
        }
    }

    // Torrential Tribute response window
    // Triggers when any monster is Summoned face-up (Normal, Tribute, Special, or Flip Summon)
    if (instance.position !== "defense-down" && !instance.faceDown) {
        // 1. Check Player's Torrential Tribute
        var playerTTZone = findSetTrapZone("player", "torrential-tribute");
        if (playerTTZone !== null) {
            var activatedByPlayer = await promptPlayerTorrentialTribute(playerTTZone, def);
            if (activatedByPlayer) {
                await executeTorrentialTribute("player", playerTTZone);
                return;
            }
        }

        // 2. Check Computer's Torrential Tribute
        var compTTZone = findSetTrapZone("computer", "torrential-tribute");
        if (compTTZone !== null) {
            var compMonsters = GameState.getMonstersOnField("computer");
            var playerMonsters = GameState.getMonstersOnField("player");
            
            var compTotalAtk = compMonsters.reduce(function(sum, m) { return sum + ((typeof getMonsterAtk === "function") ? getMonsterAtk(m.card) : (cards[m.card.cardId] ? cards[m.card.cardId].atk || 0 : 0)); }, 0);
            var playerTotalAtk = playerMonsters.reduce(function(sum, m) { return sum + ((typeof getMonsterAtk === "function") ? getMonsterAtk(m.card) : (cards[m.card.cardId] ? cards[m.card.cardId].atk || 0 : 0)); }, 0);
            
            // AI triggers if player controls more monsters, higher total ATK, multiple threats, or summoned a high ATK monster
            var instAtk = (typeof getMonsterAtk === "function") ? getMonsterAtk(instance) : (def.atk || 0);
            var shouldTrigger = (playerMonsters.length > compMonsters.length) || 
                                (playerTotalAtk >= compTotalAtk && playerMonsters.length > 0) ||
                                (playerMonsters.length >= 2) ||
                                (summonerWho === "player" && instAtk >= 1500 && compMonsters.length <= 1);
            
            if (shouldTrigger) {
                await sleep(getAnimDuration(300));
                await executeTorrentialTribute("computer", compTTZone);
                return;
            }
        }
    }

    // Dragon Capture Jar: If active and the summoned monster is a face-up Dragon in Attack Position, continuously force it into Defense Position
    var currentMonster = GameState[summonerWho].field.monsters[data.zone];
    if (currentMonster && def.monsterType === "Dragon" && currentMonster.position === "attack" && (typeof isDragonLocked === "function") && isDragonLocked()) {
        var square = getSquareElm(summonerWho, data.zone);
        if (square && square.length) {
            await sleep(getAnimDuration(220));
            currentMonster.position = "defense-up";
            currentMonster.turnPosChanged = turnCount;
            square.attr("data-card-position", "defense-up");
            square.attr("data-turn-posChanged", turnCount);
            var zone = square.find("div.card-zone");
            
            await new Promise(function(resolve) {
                zone.transition({ rotate: "90deg" }, getAnimDuration(380), "cubic-bezier(0.2, 0.9, 0.3, 1)", resolve);
            });

            addToFeed("Dragon Capture Jar forces <em>" + def.name + "</em> into Defense Position!\n\n");
            if (typeof updateStatModBadges === "function") updateStatModBadges();
            if (typeof updateActionableCards === "function") updateActionableCards();
        }
    }
});

// ---------------------------------------------------------------------------
// Torrential Tribute Prompt & Execution
// ---------------------------------------------------------------------------

var torrentialTributeResolver = null;

function promptPlayerTorrentialTribute(zoneNum, summonedDef) {
    return new Promise(function(resolve) {
        torrentialTributeResolver = resolve;

        var playerMonstersCount = GameState.getMonstersOnField("player").length;
        var compMonstersCount = GameState.getMonstersOnField("computer").length;

        $("#tt-trigger-cause").text((summonedDef ? summonedDef.name.toUpperCase() : "A MONSTER") + " WAS SUMMONED");
        $("#tt-modal-casualty-preview").html(
            "<strong>Predicted Casualties:</strong> " +
            "<span style=\"color: #93c5fd; margin-right: 8px;\">Your Monsters: " + playerMonstersCount + "</span> • " +
            "<span style=\"color: #f87171; margin-left: 8px;\">Opponent Monsters: " + compMonstersCount + "</span>"
        );

        $("#torrential-tribute-modal").fadeIn(150);
    });
}

function resolveTorrentialTributePrompt(shouldActivate) {
    $("#torrential-tribute-modal").fadeOut(120);
    if (typeof torrentialTributeResolver === "function") {
        var res = torrentialTributeResolver;
        torrentialTributeResolver = null;
        res(shouldActivate);
    }
}

async function executeTorrentialTribute(who, zoneNum) {
    var trapSquare = getSpellSquareElm(who, zoneNum);

    // Reveal Trap card face-up
    if (trapSquare && trapSquare.length) {
        var trapZone = trapSquare.find("div.card-zone");
        if (typeof trapZone.flip === "function") {
            try {
                trapZone.flip({ trigger: "manual" });
                trapZone.flip(false);
            } catch (e) {}
        }
    }

    addToFeed("<strong>" + (who === "player" ? "Player" : "Computer") + "</strong> activates Trap Card: <strong>Torrential Tribute</strong>!\n");
    addToFeed("🌊 A massive tidal wave sweeps over the arena, engulfing all monsters in a devastating flood!\n");

    if (typeof BattleFX !== "undefined") {
        BattleFX.triggerScreenShake("heavy");
    }

    await sleep(getAnimDuration(450));

    // Destroy the trap itself
    await destroySpellTrap(who, zoneNum, false);

    // Collect all monsters currently on both fields
    var victims = [];
    ["player", "computer"].forEach(function(side) {
        var monsters = GameState.getMonstersOnField(side);
        monsters.forEach(function(m) {
            victims.push({ side: side, zone: m.zone, cardId: m.card.cardId });
        });
    });

    if (victims.length > 0) {
        for (var i = 0; i < victims.length; i++) {
            var v = victims[i];
            await destroyMonster(v.side, v.zone);
        }
        addToFeed("<em>Torrential Tribute</em> destroyed all " + victims.length + " monster(s) on the field!\n\n");
    } else {
        addToFeed("No monsters remained on the field to be destroyed.\n\n");
    }

    // Cancel any ongoing battle highlights
    if (typeof BattleFX !== "undefined" && typeof BattleFX.cancelTargetSelection === "function") {
        BattleFX.cancelTargetSelection();
    }
    if (typeof updateActionableCards === "function") updateActionableCards();
    if (typeof updateStatModBadges === "function") updateStatModBadges();
}

// ---------------------------------------------------------------------------
// Arcane Disruptor Counter Trap Handlers
// ---------------------------------------------------------------------------

var arcaneDisruptorPromptResolver = null;
var arcaneDisruptorDiscardResolver = null;

function promptPlayerArcaneDisruptor(zoneNum, spellDef) {
    return new Promise(function(resolve) {
        arcaneDisruptorPromptResolver = resolve;

        var spellName = spellDef ? spellDef.name : "Spell Card";
        var spellEffect = (spellDef && spellDef.desc) ? spellDef.desc : "No description available.";
        var spellTypeLabel = (spellDef && spellDef.subType) ? spellDef.subType.toUpperCase() + " SPELL" : "SPELL CARD";

        $("#ad-trigger-cause").text(spellName.toUpperCase() + " WAS ACTIVATED!");
        $("#ad-prompt-description").html(
            "Opponent activated <strong>" + spellName + "</strong>.<br>" +
            "Activate your face-down <span style=\"color: #f472b6; font-weight: bold;\">Arcane Disruptor</span> to negate it and remove it from play? (Requires 1 discard)"
        );

        $("#ad-spell-header").text("ACTIVATED " + spellTypeLabel + ": " + spellName.toUpperCase());
        $("#ad-spell-effect-text").text("\"" + spellEffect + "\"");

        $("#arcane-disruptor-prompt-modal").fadeIn(150);
    });
}

function resolveArcaneDisruptorPrompt(shouldActivate) {
    $("#arcane-disruptor-prompt-modal").fadeOut(120);
    if (typeof arcaneDisruptorPromptResolver === "function") {
        var res = arcaneDisruptorPromptResolver;
        arcaneDisruptorPromptResolver = null;
        res(shouldActivate);
    }
}

function promptPlayerArcaneDisruptorDiscard() {
    return new Promise(function(resolve) {
        arcaneDisruptorDiscardResolver = resolve;
        var grid = $("#arcane-disruptor-discard-grid");
        grid.empty();

        var hand = GameState.player.hand;
        if (!hand || hand.length === 0) {
            resolve(null);
            return;
        }

        hand.forEach(function(inst) {
            var cardDef = cards[inst.cardId];
            if (!cardDef) return;

            var typeBadge = cardDef.type === "monsters"
                ? "LVL " + (cardDef.level || 1) + " • ATK " + (cardDef.atk || 0) + " / DEF " + (cardDef.def || 0)
                : (cardDef.subType ? cardDef.subType.toUpperCase() + " " : "") + cardDef.type.slice(0, -1).toUpperCase();

            var tile = $("<div class=\"rebirth-card-tile target-trap-tile\" style=\"cursor: pointer;\">" +
                "<div class=\"rebirth-card-preview-frame\">" +
                    "<img src=\"cards/" + cardDef.file + "\" alt=\"" + cardDef.name + "\" class=\"rebirth-thumb-img\">" +
                    "<span class=\"target-owner-tag tag-player\">HAND</span>" +
                "</div>" +
                "<div class=\"rebirth-tile-meta\">" +
                    "<h4 class=\"rebirth-tile-name\">" + cardDef.name + "</h4>" +
                    "<span class=\"rebirth-tile-stats\">" + typeBadge + "</span>" +
                "</div>" +
            "</div>");

            tile.on("click", function() {
                $("#arcane-disruptor-discard-modal").fadeOut(120);
                if (typeof arcaneDisruptorDiscardResolver === "function") {
                    var r = arcaneDisruptorDiscardResolver;
                    arcaneDisruptorDiscardResolver = null;
                    r({ uid: inst.uid, cardId: inst.cardId });
                }
            });

            grid.append(tile);
        });

        $("#arcane-disruptor-discard-modal").fadeIn(150);
    });
}

function cancelArcaneDisruptorDiscard() {
    $("#arcane-disruptor-discard-modal").fadeOut(120);
    if (typeof arcaneDisruptorDiscardResolver === "function") {
        var r = arcaneDisruptorDiscardResolver;
        arcaneDisruptorDiscardResolver = null;
        r(null);
    }
}

async function banishSpellTrapCard(who, zoneNum, isFieldZone) {
    var banishedInst = null;
    if (isFieldZone) {
        var fieldInst = GameState[who].field.fieldZone;
        if (fieldInst) {
            banishedInst = fieldInst;
            GameState[who].field.fieldZone = null;
            var square = getFieldZoneElm(who);
            if (typeof BattleFX !== "undefined" && typeof BattleFX.animateSpellToGraveyard === "function") {
                await BattleFX.animateSpellToGraveyard(square);
            }
            Actions.resetFieldZoneDOM(who);
        }
    } else {
        var spellInst = GameState[who].field.spells[zoneNum];
        if (spellInst) {
            banishedInst = spellInst;
            if (spellInst.equippedToUid) {
                removeEquipTag(who, spellInst.equippedToUid);
                spellInst.equippedToUid = null;
                if (typeof updateStatModBadges === "function") updateStatModBadges();
            }
            delete GameState[who].field.spells[zoneNum];
            var square = getSpellSquareElm(who, zoneNum);
            if (typeof BattleFX !== "undefined" && typeof BattleFX.animateSpellToGraveyard === "function") {
                await BattleFX.animateSpellToGraveyard(square);
            }
            Actions.resetSquareDOM(who, zoneNum);
        }
    }
    if (banishedInst) {
        if (!GameState[who].banished) GameState[who].banished = [];
        GameState[who].banished.push(banishedInst);
    }
    updateResourceCounters();
    updateGraveyardZones();
}

var arcaneWardPromptResolver = null;

function promptPlayerArcaneWard(zoneNum, targetDef) {
    return new Promise(function(resolve) {
        arcaneWardPromptResolver = resolve;

        var cardName = targetDef ? targetDef.name : "Card";
        var cardEffect = (targetDef && targetDef.desc) ? targetDef.desc : "No description available.";
        var cardTypeLabel = (targetDef && targetDef.type === "traps") ? "TRAP CARD" : ((targetDef && targetDef.subType) ? targetDef.subType.toUpperCase() + " SPELL" : "SPELL CARD");

        $("#aw-trigger-cause").text(cardName.toUpperCase() + " WAS ACTIVATED!");
        $("#aw-prompt-description").html(
            "Opponent activated <strong>" + cardName + "</strong>.<br>" +
            "Activate your face-down <span style=\"color: #c084fc; font-weight: bold;\">Arcane Ward</span> to negate it and destroy it?"
        );

        $("#aw-card-header").text("ACTIVATED " + cardTypeLabel + ": " + cardName.toUpperCase());
        $("#aw-card-effect-text").text("\"" + cardEffect + "\"");

        $("#arcane-ward-prompt-modal").fadeIn(150);
    });
}

function resolveArcaneWardPrompt(shouldActivate) {
    $("#arcane-ward-prompt-modal").fadeOut(120);
    if (typeof arcaneWardPromptResolver === "function") {
        var res = arcaneWardPromptResolver;
        arcaneWardPromptResolver = null;
        res(shouldActivate);
    }
}

async function checkArcaneWardResponse(who, instance, zoneNum, targetDef) {
    if (typeof isJinzoidActive === "function" && isJinzoidActive()) return false;
    if (targetDef && targetDef.id === "arcane-ward") return false;

    var opp = GameState.getOpponent(who);
    var trapZone = findSetTrapZone(opp, "arcane-ward");
    if (trapZone === null) return false;

    if (opp === "player") {
        var shouldActivate = await promptPlayerArcaneWard(trapZone, targetDef);
        if (!shouldActivate) return false;

        var trapSquare = getSpellSquareElm("player", trapZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find("div.card-zone");
            if (typeof trapZoneElm.flip === "function") {
                try {
                    trapZoneElm.flip({ trigger: "manual" });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed("Player activates Counter Trap: <strong>Arcane Ward</strong>!\n");
        addToFeed("🛡 Arcane Ward envelops the field in a shimmering barrier, negating <em>" + targetDef.name + "</em>!\n");
        if (typeof BattleFX !== "undefined") BattleFX.triggerScreenShake("medium");
        await sleep(getAnimDuration(400));

        await destroySpellTrap("player", trapZone, false);
        await destroySpellTrap(who, zoneNum, targetDef.subType === "field");
        addToFeed("<em>" + targetDef.name + "</em> was negated and destroyed!\n\n");
        GameState.turn.spellTrapLocked = true;
        GameState.turn.spellTrapLockedBy = who;
        return true;
    } else {
        var highThreatCards = ["raigeki", "dark-hole", "change-of-heart", "pot-of-greed", "monster-reborn", "heavy-storm", "fissure", "tribute-to-the-doomed", "tribute-of-the-ages", "gravity-tether", "swords-of-revealing-light"];
        var shouldAIActivate = (highThreatCards.indexOf(targetDef.id) !== -1) || (targetDef.type === "traps");

        if (!shouldAIActivate) return false;

        var trapSquare = getSpellSquareElm("computer", trapZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find("div.card-zone");
            if (typeof trapZoneElm.flip === "function") {
                try {
                    trapZoneElm.flip({ trigger: "manual" });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed("Computer activates Counter Trap: <strong>Arcane Ward</strong>!\n");
        addToFeed("🛡 Computer's Arcane Ward shimmers, negating your <em>" + targetDef.name + "</em>!\n");
        if (typeof BattleFX !== "undefined") BattleFX.triggerScreenShake("medium");
        await sleep(getAnimDuration(400));

        await destroySpellTrap("computer", trapZone, false);
        await destroySpellTrap(who, zoneNum, targetDef.subType === "field");
        addToFeed("Your <em>" + targetDef.name + "</em> was negated and destroyed!\n\n");
        GameState.turn.spellTrapLocked = true;
        GameState.turn.spellTrapLockedBy = who;
        return true;
    }
}

async function checkArcaneDisruptorResponse(who, instance, zoneNum, spellDef) {
    if (typeof isJinzoidActive === "function" && isJinzoidActive()) return false;
    var opp = GameState.getOpponent(who);
    var trapZone = findSetTrapZone(opp, "arcane-disruptor");
    if (trapZone === null) return false;

    // Check if opponent has any cards in hand to discard
    if (!GameState[opp].hand || GameState[opp].hand.length === 0) return false;

    if (opp === "player") {
        var shouldActivate = await promptPlayerArcaneDisruptor(trapZone, spellDef);
        if (!shouldActivate) return false;

        var discardCard = await promptPlayerArcaneDisruptorDiscard();
        if (!discardCard) return false;

        // Perform hand discard
        var discardedInst = null;
        var gIdx = -1;
        if (discardCard.uid) {
            gIdx = GameState.player.hand.findIndex(function(c) { return c.uid === discardCard.uid; });
        }
        if (gIdx === -1 && discardCard.cardId) {
            gIdx = GameState.player.hand.findIndex(function(c) { return c.cardId === discardCard.cardId; });
        }
        if (gIdx !== -1) {
            discardedInst = GameState.player.hand.splice(gIdx, 1)[0];
        } else {
            discardedInst = new CardInstance(discardCard.cardId);
        }

        var dDef = cards[discardedInst.cardId];
        GameState.player.graveyard.push(discardedInst);
        updateHandDisplay("player");
        updateGraveyardZones();

        // Reveal & destroy Arcane Disruptor
        var trapSquare = getSpellSquareElm("player", trapZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find("div.card-zone");
            if (typeof trapZoneElm.flip === "function") {
                try {
                    trapZoneElm.flip({ trigger: "manual" });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed("Player activates Counter Trap: <strong>Arcane Disruptor</strong>!\n");
        addToFeed("⚡ Arcane Disruptor radiates an intense pulse, discarding <strong>" + (dDef ? dDef.name : "a card") + "</strong> to negate <em>" + spellDef.name + "</em>!\n");
        if (typeof BattleFX !== "undefined") BattleFX.triggerScreenShake("medium");
        await sleep(getAnimDuration(400));

        await destroySpellTrap("player", trapZone, false);

        // Banish the opponent's activated Spell Card
        await banishSpellTrapCard(who, zoneNum, spellDef.subType === "field");
        addToFeed("<em>" + spellDef.name + "</em> was negated and removed from play!\n\n");
        return true;
    } else {
        // AI Decision
        var handCards = GameState.computer.hand.slice();
        if (handCards.length === 0) return false;

        var highThreatSpells = ["raigeki", "dark-hole", "change-of-heart", "pot-of-greed", "monster-reborn", "heavy-storm", "fissure", "tribute-to-the-doomed"];
        var shouldAIActivate = (highThreatSpells.indexOf(spellDef.id) !== -1) || (handCards.length >= 2);

        if (!shouldAIActivate) return false;

        handCards.sort(function(a, b) {
            var dA = cards[a.cardId]; var dB = cards[b.cardId];
            var atkA = (dA && dA.type === "monsters") ? (dA.atk || 0) : -1;
            var atkB = (dB && dB.type === "monsters") ? (dB.atk || 0) : -1;
            return atkA - atkB;
        });
        var aiDiscard = handCards[0];
        var aiDiscardDef = cards[aiDiscard.cardId];

        var handIdx = GameState.computer.hand.findIndex(function(c) { return c.uid === aiDiscard.uid; });
        if (handIdx !== -1) {
            var discarded = GameState.computer.hand.splice(handIdx, 1)[0];
            GameState.computer.graveyard.push(discarded);
        }
        updateHandDisplay("computer");
        updateGraveyardZones();

        var trapSquare = getSpellSquareElm("computer", trapZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find("div.card-zone");
            if (typeof trapZoneElm.flip === "function") {
                try {
                    trapZoneElm.flip({ trigger: "manual" });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed("Computer activates Counter Trap: <strong>Arcane Disruptor</strong>!\n");
        addToFeed("⚡ Computer discards <strong>" + (aiDiscardDef ? aiDiscardDef.name : "a card") + "</strong> to negate your <em>" + spellDef.name + "</em>!\n");
        if (typeof BattleFX !== "undefined") BattleFX.triggerScreenShake("medium");
        await sleep(getAnimDuration(400));

        await destroySpellTrap("computer", trapZone, false);

        await banishSpellTrapCard(who, zoneNum, spellDef.subType === "field");
        addToFeed("Your <em>" + spellDef.name + "</em> was negated and removed from play!\n\n");
        return true;
    }
}

