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

        // Render translucent red X's over all monsters that will be destroyed (including face-down defense)
        $('.monster-destruct-preview-overlay').remove();
        ['player', 'computer'].forEach(function(who) {
            var monsters = GameState.getMonstersOnField(who);
            monsters.forEach(function(entry) {
                var square = getSquareElm(who, entry.zone);
                if (square && square.length) {
                    var zone = square.find('div.card-zone.main-zone');
                    if (zone.length && !zone.find('.monster-destruct-preview-overlay').length) {
                        var overlay = $('<div class="monster-destruct-preview-overlay">' +
                            '<div class="monster-destruct-x"></div>' +
                        '</div>');
                        zone.append(overlay);
                    }
                }
            });
        });

        var causeText = (summonedDef ? summonedDef.name.toUpperCase() : 'A MONSTER') + ' WAS SUMMONED — DESTROY ALL MONSTERS?';
        $('#tt-toast-cause').text(causeText);
        $('#torrential-tribute-action-bar').stop(true, true).fadeIn(150);
    });
}

function resolveTorrentialTributePrompt(shouldActivate) {
    $('#torrential-tribute-action-bar').stop(true, true).fadeOut(120);
    $('.monster-destruct-preview-overlay').remove();
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

function promptPlayerArcaneDisruptor(zoneNum, spellDef, who, spellZoneNum) {
    return new Promise(function(resolve) {
        arcaneDisruptorPromptResolver = resolve;

        // Clean up any lingering preview marks or highlights
        $('.monster-destruct-preview-overlay').remove();
        $('.counter-trap-source-highlight').removeClass('counter-trap-source-highlight');
        $('.counter-trap-target-highlight').removeClass('counter-trap-target-highlight');

        // 1. Highlight player's Arcane Disruptor (Counter Trap source)
        var playerTrapSq = getSpellSquareElm('player', zoneNum);
        if (playerTrapSq && playerTrapSq.length) {
            playerTrapSq.addClass('counter-trap-source-highlight');
        }

        // 2. Highlight opponent's activated Spell square and place a Red X on it
        var targetSq = (spellDef && spellDef.subType === 'field')
            ? getFieldZoneElm(who)
            : getSpellSquareElm(who, spellZoneNum);

        if (targetSq && targetSq.length) {
            targetSq.addClass('counter-trap-target-highlight');
            var zone = targetSq.find('div.card-zone');
            if (zone.length && !zone.find('.monster-destruct-preview-overlay').length) {
                var overlay = $('<div class="monster-destruct-preview-overlay">' +
                    '<div class="monster-destruct-x"></div>' +
                '</div>');
                zone.append(overlay);
            }
        }

        var spellName = spellDef ? spellDef.name : 'Spell Card';
        $('#ad-toast-cause').text('OPPONENT ACTIVATED ' + spellName.toUpperCase() + ' — DISCARD 1 TO NEGATE & BANISH?');
        $('#arcane-disruptor-action-bar').stop(true, true).fadeIn(150);
    });
}

function resolveArcaneDisruptorPrompt(shouldActivate) {
    $('#arcane-disruptor-action-bar').stop(true, true).fadeOut(120);
    $('.monster-destruct-preview-overlay').remove();
    $('.counter-trap-source-highlight').removeClass('counter-trap-source-highlight');
    $('.counter-trap-target-highlight').removeClass('counter-trap-target-highlight');
    if (typeof arcaneDisruptorPromptResolver === "function") {
        var res = arcaneDisruptorPromptResolver;
        arcaneDisruptorPromptResolver = null;
        res(shouldActivate);
    }
}

function promptPlayerArcaneDisruptorDiscard() {
    return new Promise(function(resolve) {
        arcaneDisruptorDiscardResolver = resolve;

        var hand = GameState.player.hand;
        if (!hand || hand.length === 0) {
            resolve(null);
            return;
        }

        // Update action bar to discard mode
        $('#ad-toast-cause').html('<span style="color: #f472b6; font-weight: bold;">SELECT 1 CARD FROM YOUR HAND</span> TO DISCARD');
        $('#arcane-disruptor-action-bar .tribute-bar-actions').html(
            '<button class="tribute-bar-btn btn-cancel" onclick="cancelArcaneDisruptorDiscard()">' +
                '<span>&times; CANCEL</span>' +
            '</button>'
        );
        $('#arcane-disruptor-action-bar').stop(true, true).fadeIn(150);

        $('body').addClass('counter-trap-discard-mode');
        $('#player-hand > .card').each(function() {
            $(this).addClass('counter-trap-discard-candidate');
            var cardRelative = $(this).find('.card-relative, .card-front').first();
            if (cardRelative.length && !cardRelative.find('.monster-destruct-preview-overlay').length) {
                var overlay = $('<div class="monster-destruct-preview-overlay">' +
                    '<div class="monster-destruct-x"></div>' +
                '</div>');
                cardRelative.append(overlay);
            }
        });

        // One-time click handler on hand cards during discard selection
        $('#player-hand').off('click.ad_discard').on('click.ad_discard', '> .card.counter-trap-discard-candidate', function(e) {
            e.stopPropagation();
            var uid = $(this).attr('data-uid');
            var cardId = $(this).attr('data-card-name');

            cleanupArcaneDisruptorDiscardUI();

            if (typeof arcaneDisruptorDiscardResolver === 'function') {
                var r = arcaneDisruptorDiscardResolver;
                arcaneDisruptorDiscardResolver = null;
                r({ uid: uid, cardId: cardId });
            }
        });
    });
}

function cleanupArcaneDisruptorDiscardUI() {
    $('body').removeClass('counter-trap-discard-mode');
    $('#player-hand > .card').removeClass('counter-trap-discard-candidate');
    $('#player-hand').off('click.ad_discard');
    $('#arcane-disruptor-action-bar').stop(true, true).fadeOut(120);
}

function cancelArcaneDisruptorDiscard() {
    cleanupArcaneDisruptorDiscardUI();
    $('.monster-destruct-preview-overlay').remove();
    $('.counter-trap-source-highlight').removeClass('counter-trap-source-highlight');
    $('.counter-trap-target-highlight').removeClass('counter-trap-target-highlight');
    if (typeof arcaneDisruptorDiscardResolver === 'function') {
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
        var shouldActivate = await promptPlayerArcaneDisruptor(trapZone, spellDef, who, zoneNum);
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

