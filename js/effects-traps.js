/**
 * Effects Traps: Prism of Retribution, Vortex Recall, Radiant Backlash,
 * Crypt Awakening, Lunar Grimoire, standby traps, equip application,
 * End Phase effects, Time Wizard, Harpie Lady and related handlers.
 * Split from card-effects.js (2355-3608).
 */
// ---------------------------------------------------------------------------
// Prism of Retribution Attack Response Handlers
// ---------------------------------------------------------------------------
var prismOfRetributionResolver = null;

async function checkPrismOfRetributionResponse(attackerWho, attackerZone, defenderWho, attackerAtk, attackerDef) {
    if (isJinzoidActive()) return false;
    var porZone = findSetTrapZone(defenderWho, 'prism-of-retribution');
    if (porZone === null) return false;

    if (defenderWho === 'player') {
        var shouldActivate = await promptPlayerPrismOfRetribution(porZone, attackerAtk, attackerDef);
        if (!shouldActivate) return false;

        var trapSquare = getSpellSquareElm('player', porZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find('div.card-zone');
            if (typeof trapZoneElm.flip === 'function') {
                try {
                    trapZoneElm.flip({ trigger: 'manual' });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed('Player activates Trap Card: <strong>Prism of Retribution</strong>!\n');
        addToFeed('💎 Prism of Retribution absorbs and reflects the attack! ' + formatWho(attackerWho) + ' takes <strong>' + attackerAtk + '</strong> damage!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');
        await sleep(getAnimDuration(450));

        await destroySpellTrap('player', porZone, false);

        GameState[attackerWho].lp = Math.max(0, GameState[attackerWho].lp - attackerAtk);
        if (typeof BattleFX !== 'undefined') {
            BattleFX.spawnFloatingDamage(attackerWho === 'computer' ? $('#opponent-lp') : $('#player-lp'), attackerAtk, 'direct');
            BattleFX.animateLPCount(attackerWho, GameState[attackerWho].lp);
        }
        EventBus.emit('LP_CHANGED', { who: attackerWho, lp: GameState[attackerWho].lp, damage: attackerAtk });
        updateResourceCounters();

        if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
            BattleFX.cancelTargetSelection();
        }
        return true;
    } else {
        var shouldAIActivate = (attackerAtk >= 1400) || (GameState.computer.lp <= attackerAtk) || (GameState.player.lp <= attackerAtk);
        if (!shouldAIActivate) return false;

        var trapSquare = getSpellSquareElm('computer', porZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find('div.card-zone');
            if (typeof trapZoneElm.flip === 'function') {
                try {
                    trapZoneElm.flip({ trigger: 'manual' });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed('Computer activates Trap Card: <strong>Prism of Retribution</strong>!\n');
        addToFeed('💎 The computer\'s Prism of Retribution reflects the attack back at you for <strong>' + attackerAtk + '</strong> damage!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');
        await sleep(getAnimDuration(450));

        await destroySpellTrap('computer', porZone, false);

        GameState[attackerWho].lp = Math.max(0, GameState[attackerWho].lp - attackerAtk);
        if (typeof BattleFX !== 'undefined') {
            BattleFX.spawnFloatingDamage(attackerWho === 'computer' ? $('#opponent-lp') : $('#player-lp'), attackerAtk, 'direct');
            BattleFX.animateLPCount(attackerWho, GameState[attackerWho].lp);
        }
        EventBus.emit('LP_CHANGED', { who: attackerWho, lp: GameState[attackerWho].lp, damage: attackerAtk });
        updateResourceCounters();

        if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
            BattleFX.cancelTargetSelection();
        }
        return true;
    }
}

function promptPlayerPrismOfRetribution(zoneNum, attackerAtk, attackerDef) {
    return new Promise(function(resolve) {
        prismOfRetributionResolver = resolve;

        $('#por-trigger-cause').text((attackerDef ? attackerDef.name : 'OPPONENT') + ' DECLARED AN ATTACK!');
        $('#por-modal-damage-preview').html(
            '<strong>Incoming Monster:</strong> ' + (attackerDef ? attackerDef.name : 'Monster') + '<br>' +
            '<strong>Reflected Damage to Opponent:</strong> <span style="color: #f472b6; font-weight: bold;">' + attackerAtk + ' LP</span>'
        );

        $('#prism-of-retribution-prompt-modal').fadeIn(150);
    });
}

function resolvePrismOfRetributionPrompt(shouldActivate) {
    $('#prism-of-retribution-prompt-modal').fadeOut(120);
    if (typeof prismOfRetributionResolver === 'function') {
        var res = prismOfRetributionResolver;
        prismOfRetributionResolver = null;
        res(shouldActivate);
    }
}

// ---------------------------------------------------------------------------
// Warding Veil Attack Response Handlers
// ---------------------------------------------------------------------------
var wardingVeilResolver = null;

async function checkWardingVeilResponse(attackerWho, attackerZone, defenderWho, attackerDef) {
    if (isJinzoidActive()) return false;
    var wvZone = findSetTrapZone(defenderWho, 'warding-veil');
    if (wvZone === null) return false;

    if (defenderWho === 'player') {
        var shouldActivate = await promptPlayerWardingVeil(wvZone, attackerDef);
        if (!shouldActivate) return false;
        await activateWardingVeil('player', wvZone, attackerWho, attackerDef);
        return true;
    } else {
        var shouldAIActivate = (GameState.computer.lp <= 2000) || (GameState.player.lp <= 4000);
        if (!shouldAIActivate) return false;
        await activateWardingVeil('computer', wvZone, attackerWho, attackerDef);
        return true;
    }
}

async function activateWardingVeil(trapWho, zoneNum, attackerWho, attackerDef) {
    var trapSquare = getSpellSquareElm(trapWho, zoneNum);
    if (trapSquare && trapSquare.length) {
        var trapZoneElm = trapSquare.find('div.card-zone');
        if (typeof trapZoneElm.flip === 'function') {
            try {
                trapZoneElm.flip({ trigger: 'manual' });
                trapZoneElm.flip(false);
            } catch (e) {}
        }
    }

    addToFeed((trapWho === 'player' ? 'Player' : 'Computer') + ' activates Trap Card: <strong>Warding Veil</strong>!\n');
    addToFeed('🛡️ Warding Veil shrouds ' + formatWho(trapWho) + ' in protective light — the attack is negated and no battle damage can be taken this turn!\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');
    await sleep(getAnimDuration(450));

    setNoBattleDamage(trapWho);

    await destroySpellTrap(trapWho, zoneNum, false);

    if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
        BattleFX.cancelTargetSelection();
    }
}

function promptPlayerWardingVeil(zoneNum, attackerDef) {
    return new Promise(function(resolve) {
        wardingVeilResolver = resolve;

        $('#wv-trigger-cause').text((attackerDef ? attackerDef.name : 'OPPONENT') + ' DECLARED AN ATTACK!');
        $('#wv-modal-preview').html(
            '<strong>Incoming Monster:</strong> ' + (attackerDef ? attackerDef.name : 'Monster')
        );

        $('#warding-veil-prompt-modal').fadeIn(150);
    });
}

function resolveWardingVeilPrompt(shouldActivate) {
    $('#warding-veil-prompt-modal').fadeOut(120);
    if (typeof wardingVeilResolver === 'function') {
        var res = wardingVeilResolver;
        wardingVeilResolver = null;
        res(shouldActivate);
    }
}

// ---------------------------------------------------------------------------
// Mirrorfall Attack Response Handlers
// ---------------------------------------------------------------------------
var mirrorfallResolver = null;

async function checkMirrorfallResponse(attackerWho, attackerZone, defenderWho) {
    if (isJinzoidActive()) return false;
    var mfZone = findSetTrapZone(defenderWho, 'mirrorfall');
    if (mfZone === null) return false;

    var atkMonsters = [];
    for (var z = 1; z <= 6; z++) {
        var m = GameState[attackerWho].field.monsters[z];
        if (m && m.position === 'attack') {
            atkMonsters.push({ zone: z, card: m });
        }
    }
    if (atkMonsters.length === 0) return false;

    if (defenderWho === 'player') {
        var shouldActivate = await promptPlayerMirrorfall(mfZone, atkMonsters);
        if (!shouldActivate) return false;
        await activateMirrorfall('player', mfZone, attackerWho, atkMonsters);
        return true;
    } else {
        var shouldAIActivate = (atkMonsters.length >= 2) || (attackerAtkThreshold(atkMonsters));
        if (!shouldAIActivate) return false;
        await activateMirrorfall('computer', mfZone, attackerWho, atkMonsters);
        return true;
    }
}

function attackerAtkThreshold(atkMonsters) {
    for (var i = 0; i < atkMonsters.length; i++) {
        if (getMonsterAtk(atkMonsters[i].card) >= 1500) return true;
    }
    return false;
}

async function activateMirrorfall(trapWho, zoneNum, attackerWho, atkMonsters) {
    var trapSquare = getSpellSquareElm(trapWho, zoneNum);
    if (trapSquare && trapSquare.length) {
        var trapZoneElm = trapSquare.find('div.card-zone');
        if (typeof trapZoneElm.flip === 'function') {
            try {
                trapZoneElm.flip({ trigger: 'manual' });
                trapZoneElm.flip(false);
            } catch (e) {}
        }
    }

    addToFeed((trapWho === 'player' ? 'Player' : 'Computer') + ' activates Trap Card: <strong>Mirrorfall</strong>!\n');
    addToFeed('🪞 A mirror barrier shatters into a storm of shards, striking down all enemy Attack Position monsters!\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');
    await sleep(getAnimDuration(450));

    await destroySpellTrap(trapWho, zoneNum, false);

    for (var i = 0; i < atkMonsters.length; i++) {
        await destroyMonster(attackerWho, atkMonsters[i].zone);
    }
    addToFeed('Mirrorfall destroyed ' + atkMonsters.length + ' Attack Position monster(s)!\n\n');

    if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
        BattleFX.cancelTargetSelection();
    }
}

function promptPlayerMirrorfall(zoneNum, atkMonsters) {
    return new Promise(function(resolve) {
        mirrorfallResolver = resolve;

        $('#mf-modal-casualty-preview').html(
            '<strong>Enemy Casualties:</strong> ' +
            '<span style="color: #f87171;">' + atkMonsters.length + ' Attack Monster(s) destroyed</span>'
        );

        $('#mirrorfall-prompt-modal').fadeIn(150);
    });
}

function resolveMirrorfallPrompt(shouldActivate) {
    $('#mirrorfall-prompt-modal').fadeOut(120);
    if (typeof mirrorfallResolver === 'function') {
        var res = mirrorfallResolver;
        mirrorfallResolver = null;
        res(shouldActivate);
    }
}

// ---------------------------------------------------------------------------
// Vortex Recall Attack Response & Target Handlers
// ---------------------------------------------------------------------------
var vortexRecallResolver = null;
var vortexRecallPromptResolver = null;

async function checkVortexRecallAttackResponse(attackerWho, attackerZone, defenderWho) {
    if (isJinzoidActive()) return false;
    var vrZone = findSetTrapZone(defenderWho, 'vortex-recall');
    if (vrZone === null) return false;

    var attackerInst = GameState[attackerWho].field.monsters[attackerZone];
    if (!attackerInst) return false;
    var attackerDef = cards[attackerInst.cardId];

    if (defenderWho === 'player') {
        var shouldActivate = await promptPlayerVortexRecallAttack(vrZone, attackerDef, attackerZone);
        if (!shouldActivate) return false;

        var trapSquare = getSpellSquareElm('player', vrZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find('div.card-zone');
            if (typeof trapZoneElm.flip === 'function') {
                try {
                    trapZoneElm.flip({ trigger: 'manual' });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed('Player activates Trap Card: <strong>Vortex Recall</strong>!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
        await sleep(getAnimDuration(350));

        await destroySpellTrap('player', vrZone, false);

        // Prompt target selection for Vortex Recall
        await promptPlayerVortexRecallTarget('player', vrZone);

        if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
            BattleFX.cancelTargetSelection();
        }
        return true;
    } else {
        // AI Decision to activate Vortex Recall on player attack
        var atkVal = (typeof getMonsterAtk === 'function') ? getMonsterAtk(attackerInst) : (attackerDef.atk || 0);
        var compMonsters = GameState.getMonstersOnField('computer');
        var maxCompAtk = compMonsters.reduce(function(max, m) {
            var val = (typeof getMonsterAtk === 'function') ? getMonsterAtk(m.card) : (cards[m.card.cardId] ? cards[m.card.cardId].atk || 0 : 0);
            return Math.max(max, val);
        }, 0);

        if (atkVal >= 1400 || atkVal > maxCompAtk || compMonsters.length === 0) {
            var trapSquare = getSpellSquareElm('computer', vrZone);
            if (trapSquare && trapSquare.length) {
                var trapZoneElm = trapSquare.find('div.card-zone');
                if (typeof trapZoneElm.flip === 'function') {
                    try {
                        trapZoneElm.flip({ trigger: 'manual' });
                        trapZoneElm.flip(false);
                    } catch (e) {}
                }
            }

            addToFeed('Computer activates Trap Card: <strong>Vortex Recall</strong>!\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
            await sleep(getAnimDuration(350));

            await destroySpellTrap('computer', vrZone, false);
            await applyVortexRecallTarget(attackerWho, attackerZone);

            if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
                BattleFX.cancelTargetSelection();
            }
            return true;
        }
        return false;
    }
}

function promptPlayerVortexRecallAttack(zoneNum, attackerDef, attackerZone) {
    return new Promise(function(resolve) {
        vortexRecallPromptResolver = resolve;

        // Clean up any lingering preview marks or highlights
        $('.monster-destruct-preview-overlay').remove();
        $('.counter-trap-source-highlight').removeClass('counter-trap-source-highlight');
        $('.counter-trap-target-highlight').removeClass('counter-trap-target-highlight');

        // 1. Highlight player's Vortex Recall (Trap source) in purple
        var playerTrapSq = getSpellSquareElm('player', zoneNum);
        if (playerTrapSq && playerTrapSq.length) {
            playerTrapSq.addClass('counter-trap-source-highlight');
        }

        // 2. Highlight attacking enemy monster
        if (typeof attackerZone !== 'undefined' && attackerZone !== null) {
            var targetSq = getSquareElm('computer', attackerZone);
            if (targetSq && targetSq.length) {
                targetSq.addClass('counter-trap-target-highlight');
            }
        }

        var causeText = (attackerDef ? attackerDef.name.toUpperCase() : 'OPPONENT') + ' DECLARED AN ATTACK — ACTIVATE VORTEX RECALL?';
        $('#vr-toast-cause').text(causeText);
        $('#vortex-recall-action-bar').stop(true, true).fadeIn(150);
    });
}

function resolveVortexRecallPrompt(shouldActivate) {
    $('#vortex-recall-action-bar').stop(true, true).fadeOut(120);
    $('.counter-trap-source-highlight').removeClass('counter-trap-source-highlight');
    $('.counter-trap-target-highlight').removeClass('counter-trap-target-highlight');
    if (typeof vortexRecallPromptResolver === 'function') {
        var res = vortexRecallPromptResolver;
        vortexRecallPromptResolver = null;
        res(shouldActivate);
    }
}

async function promptPlayerVortexRecallTarget(sourceWho, sourceZone) {
    var allTargets = (typeof Queries !== 'undefined') ? Queries.getAllMonsters() : [];
    if (allTargets.length === 0) {
        addToFeed('No valid monster targets on the field for Vortex Recall.\n');
        return;
    }

    var chosen = await requestFieldTargetChoice(sourceWho, {
        cardName: 'VORTEX RECALL',
        prompt: 'SELECT 1 MONSTER ON THE FIELD TO RETURN TO HAND',
        confirmLabel: 'BOUNCE',
        confirmIcon: '🌀',
        candidates: allTargets,
        aiPick: function(cands) {
            var oppTargets = cands.filter(function(c) { return c.side !== sourceWho; });
            return oppTargets.length > 0 ? oppTargets[0] : cands[0];
        }
    });

    if (!chosen) {
        addToFeed('Vortex Recall was dismissed.\n');
        return;
    }

    await applyVortexRecallTarget(chosen.side, chosen.zone);
}



async function applyVortexRecallTarget(side, zoneNum) {
    var monsterInst = GameState[side].field.monsters[zoneNum];
    if (!monsterInst) return;

    var mDef = cards[monsterInst.cardId];

    // Nether Wraith self-destruction on targeting
    if (monsterInst.cardId === 'nether-wraith') {
        addToFeed('<em>Nether Wraith</em> was targeted by Vortex Recall! Its self-destruction effect activates!\n');
        await destroyMonster(side, zoneNum);
        return;
    }

    addToFeed('🌀 <em>Vortex Recall</em> returned ' + formatWho(side) + '\'s <strong>' + (mDef ? mDef.name : 'monster') + '</strong> to the hand!\n\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
    await returnMonsterToHand(side, zoneNum);
}

// Auto-activate continuous traps at the start of the controller's turn
// (opponent just ended their turn). Currently handles Dragon Capture Jar.
function checkStandbyTraps(controllerWho) {
    var jarZone = findSetTrapZone(controllerWho, 'dragon-capture-jar');
    if (jarZone === null) return;

    var jarInst = GameState[controllerWho].field.spells[jarZone];
    jarInst.position = 'active';
    jarInst.faceDown = false;

    var square = getSpellSquareElm(controllerWho, jarZone);
    square.attr('data-card-position', 'active');
    square.find('div.card-zone').flip(false);

    var trapDef = cards['dragon-capture-jar'];
    addToFeed(trapDef.name + ' activates! All face-up Dragons are switched to Defense Position.\n');

    // Rotate all face-up Dragon monsters (both sides) into Defense Position
    ['player', 'computer'].forEach(function(who) {
        var monsters = GameState.getMonstersOnField(who);
        monsters.forEach(function(m) {
            var mDef = cards[m.card.cardId];
            if (mDef && mDef.monsterType === 'Dragon' && m.card.position === 'attack') {
                m.card.position = 'defense-up';
                var sq = getSquareElm(who, m.zone);
                sq.attr('data-card-position', 'defense-up');
                sq.attr('data-turn-posChanged', turnCount);
                sq.find('div.card-zone').flip(false);
                sq.find('div.card-zone').css('transform', 'rotate(90deg)');
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Change of Heart Target Modal (player path)
// ---------------------------------------------------------------------------

function openChangeOfHeartModal(who) {
    var grid = $('#change-of-heart-grid');
    grid.empty();

    var opp = GameState.getOpponent(who);
    var oppMonsters = GameState.getMonstersOnField(opp).filter(function(m) {
        // Spell targeting immunity (e.g. Deepsea Warrior) blocks the take
        return !isImmuneToSpellTargeting(m.card, who);
    });

    if (oppMonsters.length === 0) {
        $('#change-of-heart-empty-state').show();
        grid.hide();
        $('#change-of-heart-modal').fadeIn(150);
        return;
    }

    $('#change-of-heart-empty-state').hide();
    grid.show();

    oppMonsters.forEach(function(target) {
        var def = cards[target.card.cardId];
        if (!def) return;

        var isFaceDown = (target.card.position === 'defense-down' || target.card.faceDown);
        var tileImg = isFaceDown ? 'cards/card_back.png' : ('cards/' + def.file);
        var tileName = isFaceDown ? 'Face-Down Defense Monster' : def.name;
        var tileStats = isFaceDown 
            ? ('ZONE #' + target.zone + ' • ATK ??? / DEF ???') 
            : ('ZONE #' + target.zone + ' • ATK ' + (def.atk || 0) + ' / DEF ' + (def.def || 0));

        var tile = $('<div class="rebirth-card-tile" data-target-zone="' + target.zone + '" data-target-card="' + target.card.cardId + '">' +
            '<div class="rebirth-card-img-wrap">' +
                '<img src="' + tileImg + '" alt="' + tileName + '">' +
            '</div>' +
            '<div class="rebirth-card-info-bar">' +
                '<span class="rebirth-card-name">' + tileName + '</span>' +
                '<span class="rebirth-card-stats">' + tileStats + '</span>' +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            var targetZone = parseInt($(this).attr('data-target-zone'));
            changeOfHeartTargetSelected(who, targetZone);
        });

        grid.append(tile);
    });

    $('#change-of-heart-modal').fadeIn(150);
}

async function changeOfHeartTargetSelected(controllerWho, targetOppZone) {
    $('#change-of-heart-modal').fadeOut(120);

    var zoneNum = findSpellZoneByCard(controllerWho, 'change-of-heart');
    if (zoneNum !== null) {
        await destroySpellTrap(controllerWho, zoneNum, false);
    }

    await applyChangeOfHeart(controllerWho, targetOppZone);
}

function cancelChangeOfHeartTarget() {
    $('#change-of-heart-modal').fadeOut(120);
    $('#change-of-heart-grid').empty();

    var zoneNum = findSpellZoneByCard('player', 'change-of-heart');
    if (zoneNum !== null) {
        destroySpellTrap('player', zoneNum, false);
        addToFeed('Change of Heart was cancelled and sent to the graveyard.\n');
    }
}

async function applyChangeOfHeart(controllerWho, targetOppZone) {
    var opp = GameState.getOpponent(controllerWho);
    var monsterInst = GameState[opp].field.monsters[targetOppZone];
    if (!monsterInst) return;

    if (monsterInst.cardId === 'nether-wraith') {
        addToFeed('<em>Nether Wraith</em> was targeted by Change of Heart! Its self-destruction effect activates!\n\n');
        await destroyMonster(opp, targetOppZone);
        return;
    }

    var freeZone = getFirstFreeZone(controllerWho);
    if (freeZone === undefined) {
        addToFeed('(Change of Heart) No free zones on ' + controllerWho + '\'s field — effect fizzles.\n\n');
        var fizzleZone = findSpellZoneByCard(controllerWho, 'change-of-heart');
        if (fizzleZone !== null) {
            await destroySpellTrap(controllerWho, fizzleZone, false);
        }
        return;
    }

    // Flag original owner and original zone so it can return to the exact same spot at End Phase
    monsterInst.originalOwner = opp;
    monsterInst.originalZone = targetOppZone;
    monsterInst.isBorrowed = true;
    monsterInst.hasAttacked = false; // Reset attack state so new controller can attack

    var oppSquare = getSquareElm(opp, targetOppZone);
    var targetSquare = getSquareElm(controllerWho, freeZone);

    // Remove from opponent state
    delete GameState[opp].field.monsters[targetOppZone];

    var isFaceDown = (monsterInst.position === 'defense-down' || monsterInst.faceDown);

    // Smooth 3D mat flight animation from opponent field to controller field
    if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateCardTransfer === 'function') {
        await BattleFX.animateCardTransfer(oppSquare, targetSquare, monsterInst.cardId, monsterInst.position);
    } else {
        oppSquare.attr('data-card-type', '');
        oppSquare.attr('data-card-name', '');
        oppSquare.attr('data-card-position', '');
        oppSquare.find('img').removeAttr('src').hide();
        oppSquare.find('.card-zone').off('.flip');
        oppSquare.find('.card-zone').removeData('flip-model');
        oppSquare.find('.card-zone').removeAttr('style');
    }

    // Place into controller's field preserving exact stance
    GameState[controllerWho].field.monsters[freeZone] = monsterInst;
    targetSquare.attr('data-card-type', 'monsters');
    targetSquare.attr('data-card-name', monsterInst.cardId);
    targetSquare.attr('data-card-position', monsterInst.position);
    targetSquare.attr('data-turn-moved', turnCount);
    updateCardImage(targetSquare);

    var zone = targetSquare.find('div.card-zone');
    if (typeof zone.flip === 'function') {
        try {
            zone.flip({ trigger: 'manual' });
            zone.flip(isFaceDown);
        } catch (e) {}
    }

    if (!isFaceDown) {
        zone.find('.front').css({
            'display': 'flex',
            'visibility': 'visible',
            'opacity': '1',
            'transform': 'rotateY(0deg)'
        });
        zone.find('.back').css({
            'transform': 'rotateY(180deg)'
        });
    } else {
        zone.find('.front').css({
            'transform': 'rotateY(180deg)'
        });
        zone.find('.back').css({
            'display': 'block',
            'visibility': 'visible',
            'opacity': '1',
            'transform': 'rotateY(0deg)'
        });
    }

    if (monsterInst.position && monsterInst.position.startsWith('defense')) {
        zone.css('transform', 'rotate(90deg)');
    } else {
        zone.css('transform', 'rotate(0deg)');
    }
    zone.css({ 'visibility': 'visible', 'display': 'block', 'opacity': '1' });

    var def = cards[monsterInst.cardId];
    var displayName = isFaceDown ? 'Face-Down Defense Monster' : (def ? def.name : 'Monster');
    addToFeed(controllerWho + ' takes control of <em>' + displayName + '</em> in zone #' + freeZone + ' with Change of Heart until the End Phase!\n\n');

    // Add floating badge above borrowed monster with 1 turn duration
    targetSquare.find('.borrowed-monster-badge').remove();
    var badgeLabel = (controllerWho === 'player') ? "OPPONENT'S MONSTER • 1 TURN" : "PLAYER'S MONSTER • 1 TURN";
    var borrowedBadge = $('<div class="borrowed-monster-badge">' +
        '<span class="borrowed-badge-icon">⇄</span>' +
        '<span class="borrowed-badge-label">' + badgeLabel + '</span>' +
    '</div>');
    targetSquare.append(borrowedBadge);

    updateResourceCounters();
}

// ---------------------------------------------------------------------------
// Equip Spells — Targeting + Application
// ---------------------------------------------------------------------------

var pendingEquipSourceZone = null;

function openEquipTargetModal(who, sourceZoneNum) {
    pendingEquipSourceZone = sourceZoneNum;

    var grid = $('#equip-target-grid');
    grid.empty();

    var faceUp = getFaceUpMonstersOnField(who);
    if (faceUp.length === 0) {
        $('#equip-empty-state').show();
        grid.hide();
        $('#equip-target-modal').fadeIn(150);
        return;
    }

    $('#equip-empty-state').hide();
    grid.show();

    faceUp.forEach(function(target) {
        var def = cards[target.card.cardId];
        if (!def) return;

        var tile = $('<div class="rebirth-card-tile" data-target-zone="' + target.zone + '">' +
            '<div class="rebirth-card-img-wrap">' +
                '<img src="cards/' + def.file + '" alt="' + def.name + '">' +
            '</div>' +
            '<div class="rebirth-card-info-bar">' +
                '<span class="rebirth-card-name">' + def.name + '</span>' +
                '<span class="rebirth-card-stats">ZONE #' + target.zone + ' • ATK ' + getMonsterAtk(target.card) + ' / DEF ' + getMonsterDef(target.card) + '</span>' +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            var targetZone = parseInt($(this).attr('data-target-zone'));
            equipTargetSelected(who, targetZone);
        });

        grid.append(tile);
    });

    $('#equip-target-modal').fadeIn(150);
}

function equipTargetSelected(who, targetZone) {
    $('#equip-target-modal').fadeOut(120);
    var zoneNum = pendingEquipSourceZone;
    pendingEquipSourceZone = null;

    var equipInst = GameState[who].field.spells[zoneNum];
    var monsterInst = GameState[who].field.monsters[targetZone];
    if (!equipInst || !monsterInst) return;

    applyEquipCard(who, zoneNum, targetZone);
}

function cancelEquipTarget() {
    $('#equip-target-modal').fadeOut(120);
    $('#equip-target-grid').empty();

    var zoneNum = pendingEquipSourceZone;
    pendingEquipSourceZone = null;

    if (zoneNum !== null && zoneNum !== undefined && GameState.player.field.spells[zoneNum]) {
        destroySpellTrap('player', zoneNum, false, true);
        addToFeed('The equip card was cancelled and sent to the graveyard.\n');
    }
}

async function applyEquipCard(who, sourceZoneNum, targetZone) {
    var equipInst = GameState[who].field.spells[sourceZoneNum];
    var monsterInst = GameState[who].field.monsters[targetZone];
    if (!equipInst || !monsterInst) return;

    if (monsterInst.cardId === 'nether-wraith') {
        addToFeed('<em>Nether Wraith</em> was targeted by an Equip Card! Its self-destruction effect activates!\n\n');
        await destroyMonster(who, targetZone);
        await destroySpellTrap(who, sourceZoneNum, false);
        return;
    }

    var equipDef = cards[equipInst.cardId];
    var monsterDef = cards[monsterInst.cardId];

    equipInst.equippedToUid = monsterInst.uid;
    equipInst.position = 'active';

    // Visual tag on the equipped monster
    var monsterSquare = getSquareElm(who, targetZone);
    if (monsterSquare && monsterSquare.length) {
        monsterSquare.find('.equip-tag-badge').remove();
        var tag = $('<div class="equip-tag-badge">' +
            '<span class="equip-tag-icon">⚔</span>' +
            '<span class="equip-tag-label">EQUIPPED</span>' +
        '</div>');
        monsterSquare.append(tag);
    }

    updateResourceCounters();
    updateStatModBadges();

    var equipName = equipDef ? equipDef.name : 'the card';
    var monsterName = monsterDef ? monsterDef.name : 'a monster';
    if (who === 'player') {
        addToFeed('You equip <em>' + equipName + '</em> to <strong>' + monsterName + '</strong> in zone #' + targetZone + '.\n');
    } else {
        addToFeed('Computer equips <em>' + equipName + '</em> to <strong>' + monsterName + '</strong> in zone #' + targetZone + '.\n');
    }
}

// ---------------------------------------------------------------------------
// End Phase Effects
// ---------------------------------------------------------------------------

// Decrement Swords of Revealing Light counters and return Change of Heart monsters
async function handleEndPhaseEffects(who) {
    var opp = GameState.getOpponent(who);

    // 1. Swords of Revealing Light counts down at the End Phase of the OPPONENT of the controller
    // Since `who` is ending their turn, decrement if `opp` controls active Swords:
    var swordsZone = findActiveSwordsZone(opp);
    if (swordsZone !== null) {
        var swordsInst = GameState[opp].field.spells[swordsZone];
        swordsInst.turnCounter = (swordsInst.turnCounter || 3) - 1;

        var def = cards['swords-of-revealing-light'];
        if (swordsInst.turnCounter <= 0) {
            addToFeed(def.name + ' shatters after 3 opponent turns.\n');
            updateSwordsVisualCounter(opp, swordsZone, 0);
            await destroySpellTrap(opp, swordsZone, false);
        } else {
            updateSwordsVisualCounter(opp, swordsZone, swordsInst.turnCounter);
            addToFeed(def.name + ' has ' + swordsInst.turnCounter + ' opponent turn' + (swordsInst.turnCounter === 1 ? '' : 's') + ' remaining.\n');
        }
    }

    // 2. Return any monsters taken via Change of Heart to their original owner
    var monsters = GameState.getMonstersOnField(who);
    for (var m = 0; m < monsters.length; m++) {
        var mInst = monsters[m].card;
        var currentZone = monsters[m].zone;
        if (mInst.isBorrowed && mInst.originalOwner && mInst.originalOwner !== who) {
            var origOwner = mInst.originalOwner;
            var origZone = mInst.originalZone;

            // Prioritize returning to the exact original zone if it is free
            var returnZone;
            if (origZone && isSquareEmpty(getSquareElm(origOwner, origZone))) {
                returnZone = origZone;
            } else {
                returnZone = getFirstFreeZone(origOwner);
            }

            var curSq = getSquareElm(who, currentZone);
            var retSq = returnZone !== undefined ? getSquareElm(origOwner, returnZone) : null;

            // Remove borrowed badge
            curSq.find('.borrowed-monster-badge').remove();

            // Remove from current controller state
            delete GameState[who].field.monsters[currentZone];
            delete mInst.originalOwner;
            delete mInst.originalZone;
            delete mInst.isBorrowed;

            var mDef = cards[mInst.cardId];

            if (returnZone !== undefined && retSq) {
                retSq.find('.borrowed-monster-badge').remove();
                var isFaceDown = (mInst.position === 'defense-down' || mInst.faceDown);

                // Smooth card flight returning to opponent's side of the mat
                if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateCardTransfer === 'function') {
                    await BattleFX.animateCardTransfer(curSq, retSq, mInst.cardId, mInst.position);
                } else {
                    curSq.attr('data-card-type', '');
                    curSq.attr('data-card-name', '');
                    curSq.attr('data-card-position', '');
                    curSq.find('img').removeAttr('src').hide();
                    curSq.find('.card-zone').off('.flip');
                    curSq.find('.card-zone').removeData('flip-model');
                    curSq.find('.card-zone').removeAttr('style');
                }

                GameState[origOwner].field.monsters[returnZone] = mInst;
                retSq.attr('data-card-type', 'monsters');
                retSq.attr('data-card-name', mInst.cardId);
                retSq.attr('data-card-position', mInst.position);
                updateCardImage(retSq);

                var retZone = retSq.find('div.card-zone');
                if (typeof retZone.flip === 'function') {
                    try {
                        retZone.flip({ trigger: 'manual' });
                        retZone.flip(isFaceDown);
                    } catch (e) {}
                }

                if (!isFaceDown) {
                    retZone.find('.front').css({
                        'display': 'flex',
                        'visibility': 'visible',
                        'opacity': '1',
                        'transform': 'rotateY(0deg)'
                    });
                    retZone.find('.back').css({
                        'transform': 'rotateY(180deg)'
                    });
                } else {
                    retZone.find('.front').css({
                        'transform': 'rotateY(180deg)'
                    });
                    retZone.find('.back').css({
                        'display': 'block',
                        'visibility': 'visible',
                        'opacity': '1',
                        'transform': 'rotateY(0deg)'
                    });
                }

                if (mInst.position && mInst.position.startsWith('defense')) {
                    retZone.css('transform', 'rotate(90deg)');
                } else {
                    retZone.css('transform', 'rotate(0deg)');
                }
                retZone.css({ 'visibility': 'visible', 'display': 'block', 'opacity': '1' });

                addToFeed('<em>' + (mDef ? mDef.name : 'Monster') + '</em> returns to zone #' + returnZone + ' on ' + origOwner + '\'s side of the field.\n\n');
            } else {
                curSq.attr('data-card-type', '');
                curSq.attr('data-card-name', '');
                curSq.attr('data-card-position', '');
                curSq.find('img').removeAttr('src').hide();
                curSq.find('.card-zone').off('.flip');
                curSq.find('.card-zone').removeData('flip-model');
                curSq.find('.card-zone').removeAttr('style');
                GameState[origOwner].graveyard.push(mInst);
                notifyUmbraHeraldGraveyardSend(origOwner, mInst);
                addToFeed('No free zones on ' + origOwner + '\'s field; <em>' + (mDef ? mDef.name : 'Monster') + '</em> is sent to the graveyard.\n\n');
            }
        }
    }

    // 3. Reset turn-temporary stat modifiers (e.g. Essence Siphon)
    ['player', 'computer'].forEach(function(side) {
        var sideMonsters = GameState.getMonstersOnField(side);
        sideMonsters.forEach(function(entry) {
            if (entry.card && entry.card.tempStatMods) {
                delete entry.card.tempStatMods;
            }
            // Void Monarch: +500 ATK ignition boost expires at the end of the turn
            if (entry.card && entry.card.cardId === 'void-monarch' && entry.card.voidMonarchAtkBoost) {
                entry.card.voidMonarchAtkBoost = 0;
                entry.card.voidMonarchBoostTurn = null;
            }
        });
    });

    // 4. Reset turn flags (e.g. Tribute of the Ages target and battle phase lock)
    if (GameState.turn) {
        delete GameState.turn.tributeOfTheAgesTarget;
        delete GameState.turn.battlePhaseLocked;
        delete GameState.turn.spellTrapLocked;
        delete GameState.turn.spellTrapLockedBy;
    }
    $('.tribute-of-ages-badge, .tributable-bound-badge').remove();
    updateStatModBadges();

    updateGraveyardZones();
    updateResourceCounters();
    updateStatModBadges();
}

// ==========================================================================
// Time Wizard Engine (Ignition Effect: Time Roulette / Coin Toss)
// ==========================================================================

var pendingTimeWizardZone = null;
var pendingTimeWizardWho = null;

function openTimeWizardModal(zoneNum) {
    pendingTimeWizardZone = zoneNum;
    pendingTimeWizardWho = 'player';

    $('#time-wizard-coin').css({
        'transition': 'none',
        'transform': 'rotateY(0deg)'
    });
    $('#coin-toss-status').text('Make your call to spin Time Roulette!');
    $('#coin-toss-buttons button').prop('disabled', false);
    $('#time-wizard-cancel-btn').show();
    $('#time-wizard-modal').fadeIn(150);
}

function cancelTimeWizardEffect() {
    $('#time-wizard-modal').fadeOut(120);
    pendingTimeWizardZone = null;
    pendingTimeWizardWho = null;
    resetActiveCardClass();
    hideAtkMenuIfVisible();
}

async function onTimeWizardCall(playerChoice) {
    $('#coin-toss-buttons button').prop('disabled', true);
    $('#time-wizard-cancel-btn').hide();
    
    var zoneNum = pendingTimeWizardZone;
    var who = pendingTimeWizardWho || 'player';
    
    await executeTimeWizardEffect(who, playerChoice, zoneNum);
}

async function executeTimeWizardEffect(who, callChoice, zoneNum) {
    var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
    if (!monsterInst || monsterInst.cardId !== 'time-wizard') {
        $('#time-wizard-modal').fadeOut(120);
        return;
    }

    monsterInst.lastEffectTurn = turnCount;

    var opp = GameState.getOpponent(who);
    var isPlayer = (who === 'player');
    var prefix = isPlayer ? 'You' : 'Computer';
    
    addToFeed('<em>Time Wizard</em> activates <strong>Time Roulette</strong>! ' + prefix + ' called <strong>' + callChoice.toUpperCase() + '</strong>.\n');

    // If computer activated, show the modal for dramatic animation
    if (!isPlayer) {
        $('#time-wizard-coin').css({
            'transition': 'none',
            'transform': 'rotateY(0deg)'
        });
        $('#coin-toss-status').text('Computer calls ' + callChoice.toUpperCase() + '...');
        $('#coin-toss-buttons button').prop('disabled', true);
        $('#time-wizard-cancel-btn').hide();
        $('#time-wizard-modal').fadeIn(150);
        await sleep(600);
    }

    // Coin toss calculation
    var isHeads = Math.random() < 0.5;
    var coinResult = isHeads ? 'heads' : 'tails';
    var isCorrect = (callChoice.toLowerCase() === coinResult);

    // Animate Coin Toss
    var extraSpins = 5;
    var targetDeg = (extraSpins * 360) + (isHeads ? 0 : 180);

    $('#coin-toss-status').text('Tossing the coin...');
    
    var coinElm = $('#time-wizard-coin');
    coinElm.css({
        'transition': 'transform 1.8s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'transform': 'rotateY(' + targetDeg + 'deg)'
    });

    await sleep(2000);

    var resultText = isHeads ? 'HEADS' : 'TAILS';
    if (isCorrect) {
        $('#coin-toss-status').html('<span style="color: #4ade80;">RESULT: ' + resultText + ' • CALL CORRECT!</span>');
        addToFeed('Coin toss landed on <strong>' + resultText + '</strong>! The call was <strong style="color:#4ade80;">CORRECT</strong>!\n');
    } else {
        $('#coin-toss-status').html('<span style="color: #f87171;">RESULT: ' + resultText + ' • CALL WRONG!</span>');
        addToFeed('Coin toss landed on <strong>' + resultText + '</strong>! The call was <strong style="color:#f87171;">WRONG</strong>!\n');
    }

    await sleep(1200);
    $('#time-wizard-modal').fadeOut(200);
    await sleep(250);

    if (isCorrect) {
        // Success: Destroy all monsters opponent controls
        addToFeed('<em>Time Wizard</em> rapidly accelerates time — destroying all monsters ' + formatWho(opp) + ' controls!\n');
        
        var oppMonsters = [];
        for (var z = 1; z <= 6; z++) {
            if (GameState[opp].field.monsters[z]) {
                oppMonsters.push(z);
            }
        }

        if (oppMonsters.length === 0) {
            addToFeed('No monsters on ' + formatWho(opp) + '\'s field to destroy.\n\n');
        } else {
            for (var i = 0; i < oppMonsters.length; i++) {
                var oppZone = oppMonsters[i];
                var oppInst = GameState[opp].field.monsters[oppZone];
                var oppDef = oppInst ? cards[oppInst.cardId] : null;
                addToFeed('<em>Time Wizard</em> destroyed ' + formatWho(opp) + '\'s <strong>' + (oppDef ? oppDef.name : 'monster') + '</strong>!\n');
                await destroyMonster(opp, oppZone);
            }
            addToFeed('\n');
        }
    } else {
        // Failure: Destroy all monsters activator controls, and take damage equal to half the total ATK of those destroyed monsters
        addToFeed('<em>Time Wizard</em>\'s roulette spell backfires!\n');

        var ownMonsters = [];
        var totalAtk = 0;

        for (var z = 1; z <= 6; z++) {
            var inst = GameState[who].field.monsters[z];
            if (inst) {
                ownMonsters.push({ zone: z, inst: inst, atk: getMonsterAtk(inst) });
                totalAtk += getMonsterAtk(inst);
            }
        }

        var damageAmount = Math.floor(totalAtk / 2);

        // Destroy all activator's monsters
        for (var j = 0; j < ownMonsters.length; j++) {
            var item = ownMonsters[j];
            var mDef = item.inst ? cards[item.inst.cardId] : null;
            addToFeed('<em>Time Wizard</em>\'s explosion destroys ' + (isPlayer ? 'your' : 'Computer\'s') + ' <strong>' + (mDef ? mDef.name : 'monster') + '</strong>!\n');
            await destroyMonster(who, item.zone);
        }

        addToFeed(prefix + ' takes <strong>' + damageAmount + '</strong> damage (half of destroyed monsters\' total ' + totalAtk + ' ATK)!\n\n');
        damageLP(who, damageAmount);
    }

    resetActiveCardClass();
    hideAtkMenuIfVisible();
    updateStatModBadges();
    updateActionableCards();
    updateResourceCounters();
}

// ==========================================================================
// Harpie Lady Engine (Ignition Effect: Discard 1 -> Destroy 1 Spell/Trap)
// ==========================================================================

var pendingHarpieLadyZone = null;
var pendingHarpieLadyDiscardUid = null;

function openHarpieLadyDiscardModal(zoneNum) {
    pendingHarpieLadyZone = zoneNum;
    pendingHarpieLadyDiscardUid = null;

    var grid = $('#harpie-lady-discard-grid');
    grid.empty();

    var handElms = $('#player-hand > .card');
    if (handElms.length === 0) {
        addToFeed('You have no cards in hand to discard for Harpie Lady.\n');
        return;
    }

    handElms.each(function() {
        var cardName = $(this).attr('data-card-name');
        var cardUid = $(this).attr('data-uid');
        var cardDef = cards[cardName];
        if (!cardDef) return;

        var typeBadge = cardDef.type === 'monsters' 
            ? 'LVL ' + (cardDef.level || 1) + ' • ATK ' + (cardDef.atk || 0) + ' / DEF ' + (cardDef.def || 0)
            : (cardDef.subType ? cardDef.subType.toUpperCase() + ' ' : '') + cardDef.type.slice(0, -1).toUpperCase();

        var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                '<span class="target-owner-tag tag-player">HAND</span>' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                '<span class="rebirth-tile-stats">' + typeBadge + '</span>' +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            applyHarpieLadyDiscard(cardUid, cardName);
        });

        grid.append(tile);
    });

    $('#harpie-lady-discard-modal').fadeIn(150);
}

function cancelHarpieLadyEffect() {
    $('#harpie-lady-discard-modal').fadeOut(120);
    $('#harpie-lady-target-modal').fadeOut(120);
    pendingHarpieLadyZone = null;
    pendingHarpieLadyDiscardUid = null;
    resetActiveCardClass();
    hideAtkMenuIfVisible();
}

async function applyHarpieLadyDiscard(cardUid, cardName) {
    $('#harpie-lady-discard-modal').fadeOut(120);
    pendingHarpieLadyDiscardUid = cardUid;

    var def = cards[cardName];
    addToFeed('You discard <strong>' + (def ? def.name : 'a card') + '</strong> from your hand for Harpie Lady.\n');

    var discardedInst = null;
    var gIdx = -1;
    if (cardUid) {
        gIdx = GameState.player.hand.findIndex(function(c) { return c.uid === cardUid; });
    }
    if (gIdx === -1 && cardName) {
        gIdx = GameState.player.hand.findIndex(function(c) { return c.cardId === cardName; });
    }
    if (gIdx !== -1) {
        discardedInst = GameState.player.hand[gIdx];
    } else {
        discardedInst = new CardInstance(cardName);
    }

    discardCardToGraveyard('player', discardedInst);

    await sleep(300);
    openHarpieLadyTargetModal();
}

async function openHarpieLadyTargetModal() {
    var targets = (typeof Queries !== 'undefined') ? Queries.getAllSpellTraps() : [];

    if (targets.length === 0) {
        addToFeed('No Spell or Trap cards on the field to destroy.\n');
        return;
    }

    var chosen = await requestFieldTargetChoice('player', {
        cardName: 'HARPIE LADY',
        prompt: 'SELECT 1 SPELL OR TRAP CARD ON THE FIELD TO DESTROY',
        confirmLabel: 'DESTROY',
        confirmIcon: '🦅',
        candidates: targets,
        aiPick: function(cands) {
            var oppTargets = cands.filter(function(c) { return c.side === 'computer'; });
            return oppTargets.length > 0 ? oppTargets[0] : cands[0];
        }
    });

    if (!chosen) {
        addToFeed('Harpie Lady effect target selection was cancelled.\n');
        return;
    }

    await applyHarpieLadyTarget(chosen.side, chosen.zone, chosen.isField);
}

async function applyHarpieLadyTarget(side, zoneNum, isFieldZone) {
    $('#harpie-lady-target-modal').fadeOut(120);

    var zone = pendingHarpieLadyZone;
    var monsterInst = (GameState.player && GameState.player.field && GameState.player.field.monsters) ? GameState.player.field.monsters[zone] : null;
    if (monsterInst) {
        monsterInst.lastEffectTurn = turnCount;
    }

    var targetInst = isFieldZone ? GameState[side].field.fieldZone : GameState[side].field.spells[zoneNum];
    var targetDef = targetInst ? cards[targetInst.cardId] : null;
    var targetName = targetDef ? targetDef.name : 'Spell/Trap card';

    addToFeed('<em>Harpie Lady</em> targeted and destroyed ' + formatWho(side) + '\'s <strong>' + targetName + '</strong>!\n\n');

    await destroySpellTrap(side, zoneNum, isFieldZone, false);

    pendingHarpieLadyZone = null;
    pendingHarpieLadyDiscardUid = null;
    resetActiveCardClass();
    hideAtkMenuIfVisible();
    updateStatModBadges();
    updateActionableCards();
    updateResourceCounters();
}

// ==========================================================================
// Mystical Space Typhoon Target Engine
// ==========================================================================

var pendingMSTWho = null;
var pendingMSTZone = null;

function openMSTTargetModal(who, zoneNum) {
    pendingMSTWho = who;
    pendingMSTZone = zoneNum;

    var grid = $('#mst-target-grid');
    grid.empty();

    var targets = [];
    ['computer', 'player'].forEach(function(side) {
        for (var z = 1; z <= 6; z++) {
            var inst = GameState[side].field.spells[z];
            if (inst && !(side === who && z === zoneNum)) {
                targets.push({ side: side, zone: z, isField: false, inst: inst });
            }
        }
        var fieldInst = GameState[side].field.fieldZone;
        if (fieldInst) {
            targets.push({ side: side, zone: null, isField: true, inst: fieldInst });
        }
    });

    if (targets.length === 0) {
        addToFeed('No other Spell or Trap cards on the field to destroy.\n');
        $('#mst-target-modal').fadeOut(120);
        destroySpellTrap(who, zoneNum, false);
        return;
    }

    targets.forEach(function(entry) {
        var cardDef = cards[entry.inst.cardId];
        var isFaceDown = entry.inst.faceDown || entry.inst.position === 'set';
        var isOpp = entry.side === 'computer';
        var ownerLabel = isOpp ? 'OPPONENT' : 'YOUR FIELD';
        var ownerClass = isOpp ? 'tag-opponent' : 'tag-player';
        var zoneLabel = entry.isField ? 'FIELD ZONE' : 'SPELL ZONE #' + entry.zone;

        var imgSrc = (isFaceDown && isOpp) ? 'cards/card_back.png' : 'cards/' + (cardDef ? cardDef.file : 'card_back.png');
        var displayName = (isFaceDown && isOpp) ? 'Set Card (Hidden)' : (cardDef ? cardDef.name : 'Spell/Trap');
        var subTypeLabel = (isFaceDown && isOpp) ? 'Face-Down' : (cardDef ? (cardDef.subType || cardDef.type).toUpperCase() : '');

        var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="' + imgSrc + '" alt="' + displayName + '" class="rebirth-thumb-img">' +
                '<span class="target-owner-tag ' + ownerClass + '">' + ownerLabel + ' • ' + zoneLabel + '</span>' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + displayName + '</h4>' +
                '<span class="rebirth-tile-stats">' + subTypeLabel + '</span>' +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            applyMSTTarget(entry.side, entry.zone, entry.isField);
        });

        grid.append(tile);
    });

    $('#mst-target-modal').fadeIn(150);
}

function cancelMSTEffect() {
    $('#mst-target-modal').fadeOut(120);
    if (pendingMSTWho && pendingMSTZone !== null) {
        destroySpellTrap(pendingMSTWho, pendingMSTZone, false);
    }
    pendingMSTWho = null;
    pendingMSTZone = null;
    resetActiveCardClass();
    hideAtkMenuIfVisible();
}

async function applyMSTTarget(side, zoneNum, isFieldZone) {
    $('#mst-target-modal').fadeOut(120);

    var targetInst = isFieldZone ? GameState[side].field.fieldZone : GameState[side].field.spells[zoneNum];
    var targetDef = targetInst ? cards[targetInst.cardId] : null;
    var targetName = targetDef ? targetDef.name : 'Spell/Trap card';

    addToFeed('<em>Mystical Space Typhoon</em> destroyed ' + formatWho(side) + '\'s <strong>' + targetName + '</strong>!\n\n');

    await destroySpellTrap(side, zoneNum, isFieldZone, false);

    if (pendingMSTWho && pendingMSTZone !== null) {
        await destroySpellTrap(pendingMSTWho, pendingMSTZone, false);
    }

    pendingMSTWho = null;
    pendingMSTZone = null;
    resetActiveCardClass();
    hideAtkMenuIfVisible();
    updateStatModBadges();
    updateActionableCards();
    updateResourceCounters();
}

