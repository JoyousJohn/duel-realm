/**
 * Card Effects Engine: Spell, Trap, and Monster activation dispatchers,
 * flip effects, graveyard triggers, and monster ignition & tribute triggers.
 */

// ---------------------------------------------------------------------------
// Card Activation & Resolution
// ---------------------------------------------------------------------------

// A monster with "cannot be targeted by the effects of Spell Cards" immunity (Deepsea Warrior).
// Per card text, the immunity is symmetrical: neither player can target this card with Spell effects (including Equip Spells).
function isImmuneToSpellTargeting(monsterInst, spellController) {
    if (!monsterInst) return false;
    if (monsterInst.cardId !== 'deepsea-warrior') return false;
    if (monsterInst.faceDown || monsterInst.position === 'defense-down') return false;
    return true;
}

// ---------------------------------------------------------------------------
// On-Mat Spell Target Selection (Smashing Ground / Fissure tie-break)
// Lets the player click an opponent monster among tied candidates, mirroring
// the on-mat tribute selection UX (highlight + floating action bar toast).
// ---------------------------------------------------------------------------
var pendingSpellTarget = {
    active: false,
    resolve: null,
    prompt: '',
    candidates: [],
    selectedCand: null
};

// Generalized on-mat field picker. Returns a Promise resolving with the chosen
// candidate object (from opts.candidates) or null if cancelled.
//   opts: {
//     cardName:     title in the toast bar,
//     prompt:       instruction, e.g. 'SELECT 1 OPPONENT MONSTER ...' (bar appends ' (n/1)'),
//     confirmLabel, confirmIcon: label + icon on the confirm button,
//     candidates:   [{ side, zone, isField?, inst?, def?, ... }],
//     aiPick:       (cands) -> candidate for the AI path (default: first candidate)
//   }
// Non-player callers resolve immediately through aiPick (no UI).
function requestFieldTargetChoice(who, opts) {
    if (who !== 'player') {
        var aiList = opts.candidates.slice();
        var pick = (typeof opts.aiPick === 'function') ? opts.aiPick(aiList) : aiList[0];
        return Promise.resolve(pick || null);
    }

    return new Promise(function(resolve) {
        pendingSpellTarget.active = true;
        pendingSpellTarget.resolve = resolve;
        pendingSpellTarget.prompt = opts.prompt || 'SELECT A TARGET';
        pendingSpellTarget.candidates = opts.candidates || [];
        pendingSpellTarget.selectedCand = null;

        $('#spell-target-bar-card-name').text((opts.cardName || 'SPELL').toUpperCase());
        $('#spell-target-btn-label').text(opts.confirmLabel || 'DESTROY');
        $('#spell-target-btn-icon').text(opts.confirmIcon || '💥');
        $('#spell-target-btn-confirm').prop('disabled', true);
        updateSpellTargetCounter();

        $('body').addClass('spell-target-selection-mode');
        pendingSpellTarget.candidates.forEach(function(c) {
            highlightSpellTargetSquare(c.side, c.zone, c.isField);
        });

        $('#spell-target-action-bar').fadeIn(150);
    });
}

// Add the candidate glow to a square on either player's mat (incl. field zone).
function highlightSpellTargetSquare(side, zone, isField) {
    var field = (typeof getField === 'function') ? getField(side) : $('.field');
    if (!field || !field.length) return;
    if (isField) {
        field.find('.field-zone-square').addClass('spell-target-candidate');
    } else {
        field.find('.card-zone-square[data-zone="' + zone + '"]').addClass('spell-target-candidate');
    }
}

// Single-selection toggle when a highlighted square is clicked.
function selectSpellTargetZone(side, zoneNum, squareElm) {
    if (!pendingSpellTarget.active) return;
    clearSpellTargetSelected();
    for (var i = 0; i < pendingSpellTarget.candidates.length; i++) {
        var c = pendingSpellTarget.candidates[i];
        var candZone = (c.isField) ? null : c.zone;
        var pickedZone = (squareElm.hasClass('field-zone-square')) ? null : zoneNum;
        if (c.side === side && candZone === pickedZone) {
            pendingSpellTarget.selectedCand = c;
            break;
        }
    }
    if (pendingSpellTarget.selectedCand) {
        squareElm.addClass('spell-target-selected').append('<div class="spell-target-selected-badge">💥</div>');
        $('#spell-target-btn-confirm').prop('disabled', false);
    } else {
        $('#spell-target-btn-confirm').prop('disabled', true);
    }
    updateSpellTargetCounter();
}

function confirmSpellTargetSelection() {
    if (!pendingSpellTarget.active || pendingSpellTarget.selectedCand === null) return;
    var resolve = pendingSpellTarget.resolve;
    var cand = pendingSpellTarget.selectedCand;
    clearSpellTargetSelectionMode();
    if (resolve) resolve(cand);
}

function cancelSpellTargetSelection() {
    if (!pendingSpellTarget.active) return;
    var resolve = pendingSpellTarget.resolve;
    clearSpellTargetSelectionMode();
    if (resolve) resolve(null);
}

function updateSpellTargetCounter() {
    var n = (pendingSpellTarget.selectedCand !== null) ? 1 : 0;
    $('#spell-target-bar-counter').text(pendingSpellTarget.prompt + ' (' + n + '/1)');
}

function clearSpellTargetSelected() {
    $('.card-zone-square').removeClass('spell-target-selected').find('.spell-target-selected-badge').remove();
}

function clearSpellTargetSelectionMode() {
    pendingSpellTarget.active = false;
    pendingSpellTarget.prompt = '';
    pendingSpellTarget.candidates = [];
    pendingSpellTarget.selectedCand = null;
    pendingSpellTarget.resolve = null;

    $('body').removeClass('spell-target-selection-mode');
    $('.card-zone-square').removeClass('spell-target-candidate spell-target-selected').find('.spell-target-selected-badge').remove();
    $('#spell-target-action-bar').fadeOut(120);
}

// Clicking any highlighted field square during spell target selection picks it.
$(document).on('click', '.card-zone-square', function(e) {
    if (!pendingSpellTarget.active) return;
    e.stopPropagation();
    e.preventDefault();
    var isField = $(this).hasClass('field-zone-square');
    if (!$(this).hasClass('spell-target-candidate')) return;
    var side = ($(this).closest('#computer-field').length) ? 'computer' : 'player';
    var zoneNum = isField ? null : parseInt($(this).attr('data-zone'));
    selectSpellTargetZone(side, zoneNum, $(this));
});

// Resolve a face-up spell/trap card that has just activated.
async function activateCard(who, instance, zoneNum) {
    var cardId = instance.cardId;
    var def = cards[cardId];
    if (!def) return;

    var opp = GameState.getOpponent(who);

    // Arcane Ward: Opponent cannot activate Spell/Trap Cards for the rest of this turn
    if (GameState.turn && GameState.turn.spellTrapLocked && GameState.turn.spellTrapLockedBy === who) {
        addToFeed('(Locked) <em>Arcane Ward</em>\'s barrier prevents ' + formatWho(who) + ' from activating Spell/Trap Cards this turn.\n\n');
        // Clean up from field if prematurely placed
        await destroySpellTrap(who, zoneNum, false);
        return;
    }

    // Jinzoid trap negation
    if (def.type === 'traps' && isJinzoidActive()) {
        addToFeed('(Negated) <em>Jinzoid</em>\'s continuous field negation prevents Trap Cards from activating!\n\n');
        return;
    }

    // Counter Trap Interception: Arcane Ward responds to Spell OR Trap activations
    if (def.type === 'spells' || def.type === 'traps') {
        var wardBlocked = await checkArcaneWardResponse(who, instance, zoneNum, def);
        if (wardBlocked) {
            return;
        }
    }

    // Counter Trap Interception: Check Arcane Disruptor response on Spell activation
    if (def.type === 'spells') {
        var disrupted = await checkArcaneDisruptorResponse(who, instance, zoneNum, def);
        if (disrupted) {
            return;
        }
    }

    // Declarative Unified Registry Resolution
    if (typeof def.onActivate === 'function') {
        var ctx = { who: who, instance: instance, zoneNum: zoneNum, opp: opp, def: def };
        var res = await def.onActivate(ctx);
        if (res !== false) {
            return;
        }
    }

    switch (cardId) {
        case 'pot-of-greed':
            addToFeed(def.name + ' activated: ' + formatWho(who) + ' draws 2 cards.\n');
            await getCards(who, 2);
            await destroySpellTrap(who, zoneNum, false);
            break;

        case 'bargain-of-fortune': {
            addToFeed(def.name + ' activated: ' + formatWho(who) + ' draws 1 card, and ' + formatWho(opp) + ' gains 1000 LP!\n');
            await getCards(who, 1);
            GameState[opp].lp += 1000;
            updateLPDisplay();
            updateResourceCounters();
            if (typeof BattleFX !== 'undefined') {
                var oppLpElm = opp === 'computer' ? $('#opponent-lp') : $('#player-lp');
                if (oppLpElm && oppLpElm.length) {
                    BattleFX.spawnFloatingDamage(oppLpElm, 1000, 'heal');
                }
                BattleFX.animateLPCount(opp, GameState[opp].lp, true);
            }
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'tribute-of-the-ages': {
            addToFeed('<em>' + def.name + '</em> activated.\n');
            var oppTributable = [];
            var list = GameState.getMonstersOnField(opp);
            list.forEach(function(entry) {
                var mDef = cards[entry.card.cardId];
                if (entry.card && !entry.card.faceDown && entry.card.position !== 'defense-down' && !(entry.card.cannotBeTributed || (mDef && mDef.cannotBeTributed))) {
                    oppTributable.push({
                        side: opp,
                        zone: entry.zone,
                        inst: entry.card,
                        def: mDef
                    });
                }
            });

            if (oppTributable.length === 0) {
                addToFeed('Opponent controls no eligible face-up monsters; Tribute of the Ages fizzles.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var chosen = await TargetEngine.requestTarget(who, {
                title: 'TRIBUTE OF THE AGES',
                subtitle: 'SELECT 1 OPPONENT MONSTER TO SACRIFICE THIS TURN',
                badge: { category: 'SOUL TARGET', color: '#8b5cf6', glowColor: 'rgba(139, 92, 246, 0.45)' },
                candidates: oppTributable,
                aiPick: function(cands) {
                    cands.sort(function(a, b) { return getMonsterAtk(b.inst) - getMonsterAtk(a.inst); });
                    return cands[0];
                }
            });

            if (!chosen) {
                addToFeed('Tribute of the Ages was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var targetInst = GameState[chosen.side].field.monsters[chosen.zone];
            var targetDef = cards[targetInst.cardId];

            GameState.turn.tributeOfTheAgesTarget = {
                who: who,
                opp: chosen.side,
                zone: chosen.zone,
                uid: targetInst.uid
            };
            GameState.turn.battlePhaseLocked = true;

            var targetSq = getSquareElm(chosen.side, chosen.zone);
            if (targetSq && targetSq.length) {
                targetSq.find('.tribute-of-ages-badge').remove();
                targetSq.append('<div class="tribute-of-ages-badge" title="Tribute of the Ages Target">✨ SACRIFICE</div>');
            }

            addToFeed('<em>Tribute of the Ages</em> binds <strong>' + (targetDef ? targetDef.name : 'Monster') + '</strong> on ' + formatWho(chosen.side) + '\'s field! ' + formatWho(who) + ' can Tribute it for a Tribute Summon this turn. (' + formatWho(who) + '\'s Battle Phase is skipped this turn).\n\n');

            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');
            updateActionableCards();
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'celestial-tithe': {
            addToFeed(def.name + ' activated: ' + formatWho(who) + ' draws 3 cards, then discards 2 cards.\n');
            await getCards(who, 3);
            if (who === 'player') {
                await promptPlayerCelestialTitheDiscards();
            } else {
                var handCards = GameState.computer.hand.slice();
                if (handCards.length >= 2) {
                    handCards.sort(function(a, b) {
                        var dA = cards[a.cardId]; var dB = cards[b.cardId];
                        var atkA = (dA && dA.type === 'monsters') ? (dA.atk || 0) : -1;
                        var atkB = (dB && dB.type === 'monsters') ? (dB.atk || 0) : -1;
                        return atkA - atkB;
                    });
                    for (var d = 0; d < 2; d++) {
                        var discardInst = handCards[d];
                        var dIdx = GameState.computer.hand.findIndex(function(c) { return c.uid === discardInst.uid; });
                        if (dIdx !== -1) {
                            var discarded = GameState.computer.hand.splice(dIdx, 1)[0];
                            GameState.computer.graveyard.push(discarded);
                        }
                    }
                    updateHandDisplay('computer');
                    updateGraveyardZones();
                }
            }
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'crypt-awakening':
        case 'eldritch-tether': {
            addToFeed(def.name + ' activated: resurrecting a monster from the Graveyard in Attack Position!\n');
            var trapInst = GameState[who].field.spells[zoneNum];
            if (trapInst) {
                trapInst.position = 'active';
                trapInst.faceDown = false;
            }
            if (who === 'player') {
                await promptPlayerCryptAwakening(zoneNum, def);
            } else {
                var gyMonsters = GameState.computer.graveyard.filter(function(c) {
                    var d = cards[c.cardId];
                    return d && d.type === 'monsters' && !d.isToken && d.subType !== 'token';
                });
                if (gyMonsters.length > 0 && getFirstFreeZone('computer') !== undefined) {
                    gyMonsters.sort(function(a, b) {
                        var dA = cards[a.cardId]; var dB = cards[b.cardId];
                        return (dB.atk || 0) - (dA.atk || 0);
                    });
                    var bestMon = gyMonsters[0];
                    var freeZ = await specialSummonMonster('computer', bestMon.cardId, 'computer', 'attack');
                    var summonedInst = (freeZ !== false && GameState.computer.field.monsters[freeZ]) ? GameState.computer.field.monsters[freeZ] : null;
                    if (summonedInst && trapInst) {
                        trapInst.boundMonsterUid = summonedInst.uid;
                        summonedInst.boundTrapUid = trapInst.uid;
                    }
                    updateGraveyardZones();
                    var bDef = cards[bestMon.cardId];
                    if (summonedInst) {
                        addToFeed('Computer\'s ' + def.name + ' resurrected <strong>' + (bDef ? bDef.name : 'monster') + '</strong> in Attack Position!\n\n');
                    }
                } else {
                    addToFeed('No valid monster in Graveyard to revive; ' + def.name + ' remains on field.\n');
                }
            }
            break;
        }

        case 'vortex-recall': {
            addToFeed(def.name + ' activated: returning 1 monster on the field to the owner\'s hand!\n');
            var allMonsters = (typeof Queries !== 'undefined') ? Queries.getAllMonsters() : [];
            if (allMonsters.length === 0) {
                addToFeed('No monsters on the field to return to hand; Vortex Recall resolves with no effect.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var chosen = await requestFieldTargetChoice(who, {
                cardName: 'VORTEX RECALL',
                prompt: 'SELECT 1 MONSTER ON THE FIELD TO RETURN TO HAND',
                confirmLabel: 'BOUNCE',
                confirmIcon: '🌀',
                candidates: allMonsters,
                aiPick: function(cands) {
                    var oppTargets = cands.filter(function(c) { return c.side !== who; });
                    if (oppTargets.length > 0) {
                        oppTargets.sort(function(a, b) {
                            return (getMonsterAtk(b.inst || b.card) || 0) - (getMonsterAtk(a.inst || a.card) || 0);
                        });
                        return oppTargets[0];
                    }
                    return cands[0];
                }
            });

            if (!chosen) {
                addToFeed('Vortex Recall was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            await applyVortexRecallTarget(chosen.side, chosen.zone);
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'vanguards-accord': {
            addToFeed(def.name + ' activated: calling a Level 4 or lower Normal Monster from the Deck!\n');
            if (who === 'player') {
                await promptPlayerVanguardsAccord(who, zoneNum);
            } else {
                var compDeck = (GameState.computer && GameState.computer.deck) ? GameState.computer.deck : [];
                var normalMonsters = compDeck.filter(function(id) {
                    var d = cards[id];
                    return d && d.type === 'monsters' && (!d.subType || d.subType === 'normal' || d.subType === '') && (d.level || 0) <= 4 && !d.isToken;
                });
                if (normalMonsters.length > 0 && getFirstFreeZone('computer') !== undefined) {
                    normalMonsters.sort(function(a, b) {
                        var dA = cards[a]; var dB = cards[b];
                        return ((dB ? dB.atk : 0) || 0) - ((dA ? dA.atk : 0) || 0);
                    });
                    var chosenId = normalMonsters[0];
                    await specialSummonMonsterFromDeck('computer', chosenId, 'attack');
                } else {
                    addToFeed('No eligible Normal Monsters in Deck; Vanguard\'s Accord resolves with no effect.\n');
                }
            }
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'lunar-grimoire': {
            addToFeed(def.name + ' activated: changing a face-up monster to face-down Defense Position.\n');
            var faceUpMonsters = [];
            ['player', 'computer'].forEach(function(side) {
                for (var z = 1; z <= 6; z++) {
                    var m = GameState[side].field.monsters[z];
                    var d = m ? cards[m.cardId] : null;
                    var isToken = m && (m.isToken || (d && (d.isToken || d.subType === 'token')));
                    if (m && !m.faceDown && m.position !== 'defense-down' && !isToken && !isImmuneToSpellTargeting(m, who)) {
                        faceUpMonsters.push({ side: side, zone: z, card: m });
                    }
                }
            });

            if (faceUpMonsters.length === 0) {
                addToFeed('No face-up monsters on the field; Lunar Grimoire resolves with no effect.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var chosen = await requestFieldTargetChoice(who, {
                cardName: 'LUNAR GRIMOIRE',
                prompt: 'SELECT 1 FACE-UP MONSTER TO FLIP TO FACE-DOWN DEFENSE',
                confirmLabel: 'FLIP DEFENSE',
                confirmIcon: '📖',
                candidates: faceUpMonsters,
                aiPick: function(cands) {
                    var playerTargets = cands.filter(function(t) { return t.side === 'player'; });
                    if (playerTargets.length > 0) {
                        playerTargets.sort(function(a, b) {
                            return (getMonsterAtk(b.card) || 0) - (getMonsterAtk(a.card) || 0);
                        });
                        return playerTargets[0];
                    }
                    return cands[0];
                }
            });

            if (!chosen) {
                addToFeed('Lunar Grimoire was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            await applyLunarGrimoireFlip(chosen.side, chosen.zone);
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'astral-phantoms': {
            addToFeed(def.name + ' activated: summoning Phantom Tokens in Defense Position!\n');
            var originElm = (typeof getSpellSquareElm === 'function') ? getSpellSquareElm(who, zoneNum) : null;
            var astralPromises = [];
            for (var k = 0; k < 3; k++) {
                if (getFirstFreeZone(who) === undefined) break;
                astralPromises.push(specialSummonMonster(who, 'phantom-token', who, 'defense-up', originElm));
                if (k < 2 && typeof sleep === 'function') await sleep(90);
            }
            var astralZones = await Promise.all(astralPromises);
            var summonedCount = 0;
            for (var az = 0; az < astralZones.length; az++) {
                if (astralZones[az] === false) continue;
                var tokenInst = GameState[who].field.monsters[astralZones[az]];
                if (tokenInst) {
                    tokenInst.cannotBeTributed = true;
                    tokenInst.isToken = true;
                }
                summonedCount++;
            }
            addToFeed('Special Summoned ' + summonedCount + ' Phantom Token(s) to ' + formatWho(who) + '\'s field.\n\n');
            updateActionableCards();
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'double-tribute-surge': {
            GameState.turn.extraNormalSummons = (GameState.turn.extraNormalSummons || 0) + 1;
            addToFeed('<em>' + def.name + '</em> activated! ' + formatWho(who) + ' can conduct an additional Normal Summon/Set this turn.\n\n');
            updateActionableCards();
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'phantom-catalyst': {
            addToFeed(def.name + ' activated: summoning Catalyst Tokens in Defense Position!\n');
            var catalystOrigin = (typeof getSpellSquareElm === 'function') ? getSpellSquareElm(who, zoneNum) : null;
            var catalystPromises = [];
            for (var k = 0; k < 2; k++) {
                if (getFirstFreeZone(who) === undefined) break;
                catalystPromises.push(specialSummonMonster(who, 'catalyst-token', who, 'defense-up', catalystOrigin));
                if (k < 1 && typeof sleep === 'function') await sleep(90);
            }
            var catalystZones = await Promise.all(catalystPromises);
            var summonedCount = 0;
            for (var cz = 0; cz < catalystZones.length; cz++) {
                if (catalystZones[cz] === false) continue;
                var tokenInst = GameState[who].field.monsters[catalystZones[cz]];
                if (tokenInst) {
                    tokenInst.cannotBeTributed = false;
                    tokenInst.isToken = true;
                }
                summonedCount++;
            }
            addToFeed('Special Summoned ' + summonedCount + ' Catalyst Token(s) to ' + formatWho(who) + '\'s field (available for Tribute Summons).\n\n');
            updateActionableCards();
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'ookazi': {
            addToFeed('<em>' + def.name + '</em> activated! ' + formatWho(opp) + ' takes <strong>800</strong> points of direct damage!\n');
            damageLP(opp, 800);
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'hinotama': {
            addToFeed('<em>' + def.name + '</em> activated! ' + formatWho(opp) + ' takes <strong>500</strong> points of direct damage!\n');
            damageLP(opp, 500);
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'essence-siphon': {
            addToFeed('<em>' + def.name + '</em> activated.\n');
            var allMonsters = [];
            ['player', 'computer'].forEach(function(side) {
                var list = GameState.getMonstersOnField(side);
                list.forEach(function(entry) {
                    if (entry.card && !entry.card.faceDown && entry.card.position !== 'defense-down' && !isImmuneToSpellTargeting(entry.card, who)) {
                        allMonsters.push({
                            side: side,
                            zone: entry.zone,
                            inst: entry.card,
                            def: cards[entry.card.cardId]
                        });
                    }
                });
            });

            if (allMonsters.length < 2) {
                addToFeed('Requires at least 2 face-up monsters on the field; Essence Siphon fizzles.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var donorChoice = await requestFieldTargetChoice(who, {
                cardName: 'ESSENCE SIPHON (1/2)',
                prompt: 'SELECT 1 FACE-UP MONSTER TO DRAIN ATK FROM',
                confirmLabel: 'DRAIN ATK',
                confirmIcon: '🩸',
                candidates: allMonsters,
                aiPick: function(cands) {
                    var oppCands = cands.filter(function(c) { return c.side !== who; });
                    if (oppCands.length) {
                        oppCands.sort(function(a, b) { return getMonsterAtk(b.inst) - getMonsterAtk(a.inst); });
                        return oppCands[0];
                    }
                    cands.sort(function(a, b) { return getMonsterAtk(b.inst) - getMonsterAtk(a.inst); });
                    return cands[0];
                }
            });

            if (!donorChoice) {
                addToFeed('Essence Siphon was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var remainingCandidates = allMonsters.filter(function(c) {
                return !(c.side === donorChoice.side && c.zone === donorChoice.zone);
            });

            var recipientChoice = await requestFieldTargetChoice(who, {
                cardName: 'ESSENCE SIPHON (2/2)',
                prompt: 'SELECT 1 FACE-UP MONSTER TO RECEIVE ATK',
                confirmLabel: 'EMPOWER',
                confirmIcon: '✨',
                candidates: remainingCandidates,
                aiPick: function(cands) {
                    var ownCands = cands.filter(function(c) { return c.side === who; });
                    if (ownCands.length) {
                        ownCands.sort(function(a, b) { return getMonsterAtk(b.inst) - getMonsterAtk(a.inst); });
                        return ownCands[0];
                    }
                    return cands[0];
                }
            });

            if (!recipientChoice) {
                addToFeed('Essence Siphon was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var donorInst = GameState[donorChoice.side].field.monsters[donorChoice.zone];
            var recipientInst = GameState[recipientChoice.side].field.monsters[recipientChoice.zone];
            if (donorInst && recipientInst) {
                var donorDef = cards[donorInst.cardId];
                var recipientDef = cards[recipientInst.cardId];
                var currentDonorAtk = getMonsterAtk(donorInst);
                var siphonedAtk = Math.floor(currentDonorAtk / 2);

                donorInst.tempStatMods = donorInst.tempStatMods || { atk: 0, def: 0 };
                donorInst.tempStatMods.atk -= siphonedAtk;

                recipientInst.tempStatMods = recipientInst.tempStatMods || { atk: 0, def: 0 };
                recipientInst.tempStatMods.atk += siphonedAtk;

                addToFeed('<em>Essence Siphon</em>: Siphoned <strong>' + siphonedAtk + ' ATK</strong> from ' + formatWho(donorChoice.side) + '\'s <strong>' + (donorDef ? donorDef.name : 'Monster') + '</strong> and empowered ' + formatWho(recipientChoice.side) + '\'s <strong>' + (recipientDef ? recipientDef.name : 'Monster') + '</strong> (+' + siphonedAtk + ' ATK) until the End Phase!\n\n');

                if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
                updateStatModBadges();
                updateActionableCards();
            }

            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'remove-trap': {
            addToFeed(def.name + ' activated.\n');
            var allTraps = getAllFaceUpTraps();
            if (allTraps.length === 0) {
                addToFeed('No face-up trap to destroy; Remove Trap fizzles.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var candidates = allTraps.map(function(t) {
                return { side: t.who, zone: t.zone, card: t.card };
            });

            var chosen = await requestFieldTargetChoice(who, {
                cardName: 'REMOVE TRAP',
                prompt: 'SELECT 1 FACE-UP TRAP CARD ON THE FIELD TO DESTROY',
                confirmLabel: 'DESTROY',
                confirmIcon: '💥',
                candidates: candidates,
                aiPick: function(cands) {
                    var oppTraps = cands.filter(function(t) { return t.side !== who; });
                    return oppTraps.length > 0 ? oppTraps[0] : cands[0];
                }
            });

            if (!chosen) {
                addToFeed('Remove Trap was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var trapDef = cards[chosen.card.cardId];
            await destroySpellTrap(chosen.side, chosen.zone, false);
            addToFeed('Remove Trap destroyed ' + (trapDef ? trapDef.name : 'Trap') + ' on ' + chosen.side + '\'s field!\n');
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'mystical-space-typhoon': {
            addToFeed(def.name + ' activated.\n');
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
                addToFeed('No valid Spell or Trap cards on the field to destroy; ' + def.name + ' fizzles.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            if (who === 'player') {
                openMSTTargetModal(who, zoneNum);
            } else {
                // AI targeting preference:
                // 1. Opponent's swords of revealing light or dragon capture jar
                // 2. Opponent's field spell
                // 3. Opponent's set trap
                // 4. Any opponent spell/trap
                var aiTarget = targets.find(function(t) { return t.side === 'player' && t.inst.cardId === 'swords-of-revealing-light'; }) ||
                               targets.find(function(t) { return t.side === 'player' && t.inst.cardId === 'dragon-capture-jar'; }) ||
                               targets.find(function(t) { return t.side === 'player' && t.isField; }) ||
                               targets.find(function(t) { return t.side === 'player'; }) ||
                               targets[0];

                var targetDef = cards[aiTarget.inst.cardId];
                var isFaceDown = aiTarget.inst.faceDown || aiTarget.inst.position === 'set';
                var targetName = (isFaceDown && aiTarget.side === 'player') ? (targetDef ? targetDef.name : 'Set Card') : (targetDef ? targetDef.name : 'Spell/Trap');

                addToFeed('Mystical Space Typhoon destroyed ' + targetName + ' on ' + formatWho(aiTarget.side) + '\'s field!\n\n');
                await destroySpellTrap(aiTarget.side, aiTarget.zone, aiTarget.isField, false);
                await destroySpellTrap(who, zoneNum, false);
            }
            break;
        }

        case 'heavy-storm': {
            addToFeed('<em>' + def.name + '</em> activated: All Spell and Trap cards on the field are destroyed!\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');

            var allST = [];
            ['player', 'computer'].forEach(function(side) {
                for (var z = 1; z <= 6; z++) {
                    if (GameState[side].field.spells[z] && !(side === who && z === zoneNum)) {
                        allST.push({ side: side, zone: z, isField: false });
                    }
                }
                if (GameState[side].field.fieldZone && !(side === who && zoneNum === null)) {
                    allST.push({ side: side, zone: null, isField: true });
                }
            });

            for (var i = 0; i < allST.length; i++) {
                await destroySpellTrap(allST[i].side, allST[i].zone, allST[i].isField, false);
            }

            await destroySpellTrap(who, zoneNum, zoneNum === null, false);
            break;
        }

        case 'monster-reborn': {
            var availableTargets = getGraveyardMonsters();
            if (availableTargets.length === 0) {
                addToFeed('[SPELL] ' + def.name + ' fizzles - no monsters in either graveyard.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (getFirstFreeZone(who) === undefined) {
                addToFeed('[SPELL] ' + def.name + ' fizzles - no free monster zones.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (who === 'player') {
                openRebirthTargetModal('player');
            } else {
                // AI: auto-pick highest ATK
                availableTargets.sort(function(a, b) {
                    return (cards[b.cardId] ? cards[b.cardId].atk || 0 : 0) - (cards[a.cardId] ? cards[a.cardId].atk || 0 : 0);
                });
                var aiTarget = availableTargets[0];
                await destroySpellTrap(who, zoneNum, false);
                await specialSummonMonster(who, aiTarget.cardId, aiTarget.who);
            }
            break;
        }

        case 'gravity-tether': {
            instance.position = 'active';
            targetSquareStateFix(who, zoneNum, 'active');
            addToFeed('<em>' + def.name + '</em> activated: All face-up monsters controlled by ' + formatWho(opp) + ' lose <strong>100 ATK</strong> per Level!\n\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');
            updateStatModBadges();
            updateActionableCards();
            break;
        }

        case 'swords-of-revealing-light': {
            // Flip all opponent face-down monsters face-up
            var oppMonsters = GameState.getMonstersOnField(opp);
            for (var i = 0; i < oppMonsters.length; i++) {
                var mInst = oppMonsters[i].card;
                if (mInst.position === 'defense-down') {
                    mInst.position = 'defense-up';
                    var sq = getSquareElm(opp, oppMonsters[i].zone);
                    sq.attr('data-card-position', 'defense-up');
                    sq.find('div.card-zone').flip(false);
                }
            }
            instance.position = 'active';
            instance.turnCounter = 3;
            targetSquareStateFix(who, zoneNum, 'active');
            updateSwordsVisualCounter(who, zoneNum, 3);
            addToFeed(def.name + ' activated. Opponent monsters cannot attack for 3 turns.\n');
            break;
        }

        case 'dark-hole': {
            addToFeed(def.name + ' activated: All monsters on the field are destroyed!\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');
            var allMonsters = [];
            GameState.getMonstersOnField('player').forEach(function(m) { allMonsters.push({ who: 'player', zone: m.zone }); });
            GameState.getMonstersOnField('computer').forEach(function(m) { allMonsters.push({ who: 'computer', zone: m.zone }); });
            for (var i = 0; i < allMonsters.length; i++) {
                await destroyMonster(allMonsters[i].who, allMonsters[i].zone);
            }
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'raigeki': {
            addToFeed(def.name + ' activated: All monsters your opponent controls are destroyed!\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');
            var oppMonsters = GameState.getMonstersOnField(opp);
            for (var i = 0; i < oppMonsters.length; i++) {
                await destroyMonster(opp, oppMonsters[i].zone);
            }
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'fissure': {
            var faceUpOpp = GameState.getMonstersOnField(opp).filter(function(m) {
                return m.card && !m.card.faceDown && !isImmuneToSpellTargeting(m.card, who);
            });
            if (faceUpOpp.length === 0) {
                addToFeed(def.name + ' fizzles — no valid face-up opponent monsters.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            // Find the lowest effective ATK monster
            faceUpOpp.sort(function(a, b) {
                return getMonsterAtk(a.card) - getMonsterAtk(b.card);
            });
            var target = faceUpOpp[0];
            var targetDef = cards[target.card.cardId];
            addToFeed(def.name + ' activated: <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong> (' + getMonsterAtk(target.card) + ' ATK) is destroyed!\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');
            await destroyMonster(opp, target.zone);
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'smashing-ground': {
            var faceUpOpp = GameState.getMonstersOnField(opp).filter(function(m) {
                return m.card && !m.card.faceDown && !isImmuneToSpellTargeting(m.card, who);
            });
            if (faceUpOpp.length === 0) {
                addToFeed(def.name + ' fizzles — no valid face-up opponent monsters.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            // Find the highest effective DEF monster
            faceUpOpp.sort(function(a, b) {
                return getMonsterDef(b.card) - getMonsterDef(a.card);
            });
            var target = faceUpOpp[0];
            var targetDef = cards[target.card.cardId];
            addToFeed(def.name + ' activated: <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong> (' + getMonsterDef(target.card) + ' DEF) is destroyed!\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
            await destroyMonster(opp, target.zone);
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'tribute-to-the-doomed': {
            // Needs a card in hand to discard (besides itself on the field)
            var handCards = GameState[who].hand.filter(function(c) { return c.uid !== instance.uid; });
            var allFieldMonsters = [
                ...GameState.getMonstersOnField('player'),
                ...GameState.getMonstersOnField('computer')
            ];
            if (handCards.length === 0) {
                addToFeed(def.name + ' fizzles — no cards in hand to discard.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (allFieldMonsters.length === 0) {
                addToFeed(def.name + ' fizzles — no monsters on the field to destroy.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (who === 'player') {
                openTributeToTheDoomedDiscard('player', zoneNum);
            } else {
                // AI: discard lowest ATK monster (or first non-monster) and destroy highest ATK opponent monster
                handCards.sort(function(a, b) {
                    var dA = cards[a.cardId]; var dB = cards[b.cardId];
                    var atkA = (dA && dA.type === 'monsters') ? (dA.atk || 0) : -1;
                    var atkB = (dB && dB.type === 'monsters') ? (dB.atk || 0) : -1;
                    return atkA - atkB;
                });
                var discardInst = handCards[0];
                var discardDef = cards[discardInst.cardId];
                // Remove from hand and push to graveyard
                var handIdx = GameState.computer.hand.findIndex(function(c) { return c.uid === discardInst.uid; });
                if (handIdx !== -1) {
                    var discardedCard = GameState.computer.hand.splice(handIdx, 1)[0];
                    GameState.computer.graveyard.push(discardedCard);
                }
                addToFeed('<em>' + def.name + '</em>: AI discards <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong>.\n');
                updateHandDisplay('computer');
                updateGraveyardZones();

                // Target highest ATK opponent monster (skip any immune to spell targeting)
                var oppField = GameState.getMonstersOnField('player').filter(function(m) {
                    return !isImmuneToSpellTargeting(m.card, who);
                });
                oppField.sort(function(a, b) { return getMonsterAtk(b.card) - getMonsterAtk(a.card); });
                var aiTarget = oppField[0] || allFieldMonsters.filter(function(m) {
                    return !isImmuneToSpellTargeting(m.card, who);
                })[0];
                var aiTargetWho = oppField.length > 0 ? 'player' : (allFieldMonsters[0] ? allFieldMonsters[0].who : null);
                if (!aiTarget || aiTargetWho === null) {
                    addToFeed('<em>' + def.name + '</em> fizzles — no valid monsters to target.\n');
                    await destroySpellTrap(who, zoneNum, false);
                    break;
                }
                var aiTargetDef = cards[aiTarget.card.cardId];
                addToFeed('<em>' + def.name + '</em>: <strong>' + (aiTargetDef ? aiTargetDef.name : 'monster') + '</strong> is destroyed!\n');
                if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
                await destroyMonster(aiTargetWho, aiTarget.zone);
                await destroySpellTrap(who, zoneNum, false);
            }
            break;
        }


        case 'change-of-heart': {
            var oppMonsters = GameState.getMonstersOnField(opp).filter(function(m) {
                return !isImmuneToSpellTargeting(m.card, who);
            });
            if (oppMonsters.length === 0) {
                addToFeed(def.name + ' fizzles - no targetable opponent monsters on the field.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (getFirstFreeZone(who) === undefined) {
                addToFeed(def.name + ' fizzles - no free monster zones.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var candidates = oppMonsters.map(function(m) {
                return { side: opp, zone: m.zone, card: m.card };
            });

            var chosen = await requestFieldTargetChoice(who, {
                cardName: 'CHANGE OF HEART',
                prompt: 'SELECT 1 OPPONENT MONSTER TO TAKE CONTROL OF',
                confirmLabel: 'CONTROL',
                confirmIcon: '💖',
                candidates: candidates,
                aiPick: function(cands) {
                    cands.sort(function(a, b) {
                        return getMonsterAtk(b.card) - getMonsterAtk(a.card);
                    });
                    return cands[0];
                }
            });

            if (!chosen) {
                addToFeed('Change of Heart was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            await destroySpellTrap(who, zoneNum, false);
            await applyChangeOfHeart(who, chosen.zone);
            break;
        }

        case 'black-pendant':
        case 'horn-of-the-unicorn': {
            var faceUpOwn = getFaceUpMonstersOnField(who).filter(function(m) {
                return !isImmuneToSpellTargeting(m.card, who);
            });
            if (faceUpOwn.length === 0) {
                addToFeed('<em>' + def.name + '</em> fizzles — no eligible face-up monster to equip.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            var candidates = faceUpOwn.map(function(m) {
                return { side: who, zone: m.zone, card: m.card };
            });

            var chosen = await requestFieldTargetChoice(who, {
                cardName: def.name.toUpperCase(),
                prompt: 'SELECT 1 FACE-UP MONSTER TO EQUIP',
                confirmLabel: 'EQUIP',
                confirmIcon: '⚔️',
                candidates: candidates,
                aiPick: function(cands) {
                    var aiTarget = (typeof AIEvaluateEquipSpell === 'function') ? AIEvaluateEquipSpell(def) : null;
                    if (aiTarget) {
                        var found = cands.find(function(c) { return c.zone === aiTarget.zone; });
                        if (found) return found;
                    }
                    cands.sort(function(a, b) { return getMonsterAtk(b.card) - getMonsterAtk(a.card); });
                    return cands[0];
                }
            });

            if (!chosen) {
                addToFeed(def.name + ' was cancelled.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            await applyEquipCard(who, zoneNum, chosen.zone);
            break;
        }

        case 'yami':
        case 'wasteland':
        case 'mountain':
        case 'sogen':
        case 'forest':
        case 'umi':
        case 'mystic-plasma-zone':
        case 'luminous-spark':
        case 'tectonic-domain':
        case 'gaia-power':
        case 'mausoleum-of-offerings':
            // Continuous field spells: already placed in field zone; just ensure active state
            instance.position = 'active';
            instance.turnCounter = null;
            updateResourceCounters();
            break;

        default:
            addToFeed('No effect implemented for ' + (def.name || cardId) + '.\n');
            break;
    }
}

// Keep DOM in sync with a just-activated spell/trap instance.
function targetSquareStateFix(who, zoneNum, position) {
    var square = zoneNum === null || zoneNum === undefined ? getFieldZoneElm(who) : getSpellSquareElm(who, zoneNum);
    if (square && square.length) {
        square.attr('data-card-position', position);
        square.find('div.card-zone').flip(false);
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
                result.push({ who: who, cardId: inst.cardId });
            }
        });
    });
    return result;
}

// ---------------------------------------------------------------------------
// Monster Reborn Target Modal (player path)
// ---------------------------------------------------------------------------

function openRebirthTargetModal(who) {
    var grid = $('#rebirth-cards-grid');
    grid.empty();

    var targets = getGraveyardMonsters();
    if (targets.length === 0) {
        $('#rebirth-empty-state').show();
        grid.hide();
        $('#rebirth-target-modal').fadeIn(150);
        return;
    }

    $('#rebirth-empty-state').hide();
    grid.show();

    targets.forEach(function(target) {
        var def = cards[target.cardId];
        if (!def) return;

        var tile = $('<div class="rebirth-card-tile" data-target-who="' + target.who + '" data-target-card="' + target.cardId + '">' +
            '<div class="rebirth-card-img-wrap">' +
                '<img src="cards/' + def.file + '" alt="' + def.name + '">' +
            '</div>' +
            '<div class="rebirth-card-info-bar">' +
                '<span class="rebirth-card-name">' + def.name + '</span>' +
                '<span class="rebirth-card-stats">ATK ' + (def.atk || 0) + ' / DEF ' + (def.def || 0) + '</span>' +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            var targetWho = $(this).attr('data-target-who');
            var targetCard = $(this).attr('data-target-card');
            monsterRebornTargetSelected(who, targetWho, targetCard);
        });

        grid.append(tile);
    });

    $('#rebirth-target-modal').fadeIn(150);
}

async function monsterRebornTargetSelected(controllerWho, sourceWho, cardId) {
    $('#rebirth-target-modal').fadeOut(120);

    // The Monster Reborn spell instance is in the controller's spell zones.
    var zoneNum = findSpellZoneByCard(controllerWho, 'monster-reborn');
    if (zoneNum !== null) {
        await destroySpellTrap(controllerWho, zoneNum, false);
    }

    await specialSummonMonster(controllerWho, cardId, sourceWho);
}

// Cancel Monster Reborn target selection: the spell fizzles.
function cancelRebirthTarget() {
    $('#rebirth-target-modal').fadeOut(120);
    $('#rebirth-cards-grid').empty();

    var zoneNum = findSpellZoneByCard('player', 'monster-reborn');
    if (zoneNum !== null) {
        destroySpellTrap('player', zoneNum, false);
        addToFeed('Monster Reborn was cancelled and sent to the graveyard.\n');
    }
}

// ---------------------------------------------------------------------------
// Remove Trap Target Modal (player path)
// ---------------------------------------------------------------------------

var pendingRemoveTrapSourceZone = null;

function openRemoveTrapModal(who, sourceZoneNum) {
    pendingRemoveTrapSourceZone = sourceZoneNum;
    var grid = $('#remove-trap-grid');
    grid.empty();

    var allTraps = getAllFaceUpTraps();

    if (allTraps.length === 0) {
        $('#remove-trap-empty-state').show();
        grid.hide();
        $('#remove-trap-modal').fadeIn(150);
        return;
    }

    $('#remove-trap-empty-state').hide();
    grid.show();

    allTraps.forEach(function(target) {
        var cardDef = cards[target.card.cardId];
        var isOpp = (target.who === 'computer');
        var ownerLabel = isOpp ? 'OPPONENT' : 'YOUR FIELD';
        var ownerClass = isOpp ? 'tag-opponent' : 'tag-player';

        var cardTile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                '<span class="target-owner-tag ' + ownerClass + '">' + ownerLabel + ' • ZONE #' + target.zone + '</span>' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                '<span class="rebirth-tile-stats" style="color: #f472b6;">[CONTINUOUS TRAP]</span>' +
            '</div>' +
        '</div>');

        cardTile.on('click', function() {
            applyRemoveTrapTarget(who, target.who, target.zone, pendingRemoveTrapSourceZone);
        });

        grid.append(cardTile);
    });

    $('#remove-trap-modal').fadeIn(150);
}

function cancelRemoveTrapTarget() {
    $('#remove-trap-modal').fadeOut(120);
    if (pendingRemoveTrapSourceZone !== null) {
        destroySpellTrap('player', pendingRemoveTrapSourceZone, false);
        pendingRemoveTrapSourceZone = null;
        addToFeed('Remove Trap was cancelled and sent to the graveyard.\n');
    }
}

async function applyRemoveTrapTarget(who, targetWho, targetZoneNum, sourceZoneNum) {
    $('#remove-trap-modal').fadeOut(120);
    pendingRemoveTrapSourceZone = null;

    var targetInst = GameState[targetWho].field.spells[targetZoneNum];
    var trapDef = targetInst ? cards[targetInst.cardId] : null;
    var trapName = trapDef ? trapDef.name : 'Trap Card';

    await destroySpellTrap(targetWho, targetZoneNum, false);
    addToFeed('Remove Trap destroyed ' + trapName + ' on ' + targetWho + '\'s field!\n');

    if (sourceZoneNum !== null && sourceZoneNum !== undefined) {
        await destroySpellTrap(who, sourceZoneNum, false);
    }
}

// Find the spell zone where `cardId` sits on `who`'s field (or null).
function findSpellZoneByCard(who, cardId) {
    var spells = GameState[who].field.spells;
    for (var i = 1; i <= 6; i++) {
        if (spells[i] && spells[i].cardId === cardId) return i;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Tribute to the Doomed — Two-Step Player Modal
// ---------------------------------------------------------------------------

var tttdSourceZone = null;
var tttdDiscardedCardId = null;

function openTributeToTheDoomedDiscard(who, sourceZoneNum) {
    tttdSourceZone = sourceZoneNum;
    tttdDiscardedCardId = null;

    var grid = $('#tttd-discard-grid');
    grid.empty();

    // Show all hand cards except the TTTD card itself (which is on the field)
    var handCards = GameState.player.hand;

    handCards.forEach(function(inst) {
        var cardDef = cards[inst.cardId];
        if (!cardDef) return;

        var isMonster = cardDef.type === 'monsters';
        var statsHtml = isMonster
            ? '<span class="rebirth-tile-stats">ATK ' + (cardDef.atk || 0) + ' / DEF ' + (cardDef.def || 0) + '</span>'
            : '<span class="rebirth-tile-stats" style="color: #86efac;">[' + (cardDef.subType || 'SPELL').toUpperCase() + ']</span>';

        var tile = $('<div class="rebirth-card-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                statsHtml +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            tttdDiscardCardSelected(inst.uid);
        });

        grid.append(tile);
    });

    $('#tttd-discard-modal').fadeIn(150);
}

function tttdDiscardCardSelected(uid) {
    $('#tttd-discard-modal').fadeOut(120);

    // Remove the card from hand
    var idx = GameState.player.hand.findIndex(function(c) { return c.uid === uid; });
    if (idx !== -1) {
        var discarded = GameState.player.hand.splice(idx, 1)[0];
        GameState.player.graveyard.push(discarded);
        tttdDiscardedCardId = discarded.cardId;
        var discardDef = cards[tttdDiscardedCardId];
        addToFeed('<em>Tribute to the Doomed</em>: You discard <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong>.\n');
        updateHandDisplay('player');
        updateGraveyardZones();
    }

    // Now open Step 2 — pick a monster to destroy
    openTributeToTheDoomedTarget();
}

async function openTributeToTheDoomedTarget() {
    var allMonsters = (typeof Queries !== 'undefined') ? Queries.getAllMonsters().filter(function(m) {
        return !isImmuneToSpellTargeting(m.inst || m.card, 'player');
    }) : [];

    if (allMonsters.length === 0) {
        addToFeed('Tribute to the Doomed fizzles — no valid monsters to destroy.\n');
        var sourceZone = tttdSourceZone;
        tttdSourceZone = null;
        tttdDiscardedCardId = null;
        if (sourceZone !== null) {
            await destroySpellTrap('player', sourceZone, false);
        }
        return;
    }

    var chosen = await requestFieldTargetChoice('player', {
        cardName: 'TRIBUTE TO THE DOOMED',
        prompt: 'SELECT 1 MONSTER ON THE FIELD TO DESTROY',
        confirmLabel: 'DESTROY',
        confirmIcon: '💥',
        candidates: allMonsters,
        aiPick: function(cands) {
            var oppTargets = cands.filter(function(c) { return c.side === 'computer'; });
            return oppTargets.length > 0 ? oppTargets[0] : cands[0];
        }
    });

    if (!chosen) {
        addToFeed('Tribute to the Doomed target selection was cancelled.\n');
        var sourceZone = tttdSourceZone;
        tttdSourceZone = null;
        tttdDiscardedCardId = null;
        if (sourceZone !== null) {
            await destroySpellTrap('player', sourceZone, false);
        }
        return;
    }

    await applyTributeToTheDoomedTarget(chosen.side, chosen.zone);
}


async function applyTributeToTheDoomedTarget(targetWho, targetZone) {
    $('#tttd-target-modal').fadeOut(120);

    var targetInst = GameState[targetWho].field.monsters[targetZone];
    var targetDef = targetInst ? cards[targetInst.cardId] : null;
    addToFeed('<em>Tribute to the Doomed</em>: <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong> is destroyed!\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
    await destroyMonster(targetWho, targetZone);

    var sourceZone = tttdSourceZone;
    tttdSourceZone = null;
    tttdDiscardedCardId = null;
    if (sourceZone !== null) {
        await destroySpellTrap('player', sourceZone, false);
    }
}

function cancelTributeToTheDoomed() {
    $('#tttd-discard-modal').fadeOut(120);
    $('#tttd-target-modal').fadeOut(120);
    if (tttdSourceZone !== null) {
        destroySpellTrap('player', tttdSourceZone, false);
        addToFeed('Tribute to the Doomed was cancelled.\n');
        tttdSourceZone = null;
        tttdDiscardedCardId = null;
    }
}
// ---------------------------------------------------------------------------
// Flip Effect Engine (e.g. Man-Eater Bug)
// ---------------------------------------------------------------------------

var manEaterBugPending = null;

async function triggerFlipEffect(monsterInst, who, zoneNum) {
    if (!monsterInst) return;
    var def = cards[monsterInst.cardId];
    if (!def) return;

    if (monsterInst.cardId === 'man-eater-bug') {
        addToFeed('<em>' + def.name + '</em> FLIP EFFECT activated!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');

        var allMonsters = (typeof Queries !== 'undefined') ? Queries.getAllMonsters() : [];
        if (allMonsters.length === 0) {
            addToFeed('No monsters on the field to destroy.\n');
            return;
        }

        var candidates = allMonsters;
        var nonSelfMonsters = allMonsters.filter(function(m) {
            return !(m.side === who && m.zone === zoneNum);
        });
        if (nonSelfMonsters.length > 0) {
            candidates = nonSelfMonsters;
        }

        var chosen = await requestFieldTargetChoice(who, {
            cardName: 'MAN-EATER BUG',
            prompt: 'SELECT 1 MONSTER ON THE FIELD TO DESTROY',
            confirmLabel: 'DESTROY',
            confirmIcon: '💥',
            candidates: candidates,
            aiPick: function(cands) {
                var oppTargets = cands.filter(function(c) { return c.side !== who; });
                if (oppTargets.length > 0) {
                    oppTargets.sort(function(a, b) {
                        return (getMonsterAtk(b.inst || b.card) || 0) - (getMonsterAtk(a.inst || a.card) || 0);
                    });
                    return oppTargets[0];
                }
                return cands[0];
            }
        });

        if (!chosen) {
            addToFeed('Man-Eater Bug effect was cancelled.\n');
            return;
        }

        var targetDef = chosen.def || (chosen.inst ? cards[chosen.inst.cardId] : (chosen.card ? cards[chosen.card.cardId] : null));
        addToFeed('<em>Man-Eater Bug</em> destroyed <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong> on ' + formatWho(chosen.side) + '\'s field!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
        await destroyMonster(chosen.side, chosen.zone);

    } else if (monsterInst.cardId === 'zephyr-imp') {
        addToFeed('<em>' + def.name + '</em> FLIP EFFECT activated!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

        var allMonsters = (typeof Queries !== 'undefined') ? Queries.getAllMonsters() : [];
        if (allMonsters.length === 0) {
            addToFeed('No monsters on the field to return to hand.\n');
            return;
        }

        var candidates = allMonsters;
        var nonSelfMonsters = allMonsters.filter(function(m) {
            return !(m.side === who && m.zone === zoneNum);
        });
        if (nonSelfMonsters.length > 0) {
            candidates = nonSelfMonsters;
        }

        var chosen = await requestFieldTargetChoice(who, {
            cardName: 'ZEPHYR IMP',
            prompt: 'SELECT 1 MONSTER ON THE FIELD TO RETURN TO HAND',
            confirmLabel: 'BOUNCE',
            confirmIcon: '🪶',
            candidates: candidates,
            aiPick: function(cands) {
                var oppTargets = cands.filter(function(c) { return c.side !== who; });
                if (oppTargets.length > 0) {
                    oppTargets.sort(function(a, b) {
                        return (getMonsterAtk(b.inst || b.card) || 0) - (getMonsterAtk(a.inst || a.card) || 0);
                    });
                    return oppTargets[0];
                }
                return cands[0];
            }
        });

        if (!chosen) {
            addToFeed('Zephyr Imp effect was cancelled.\n');
            return;
        }

        var targetDef = chosen.def || (chosen.inst ? cards[chosen.inst.cardId] : (chosen.card ? cards[chosen.card.cardId] : null));
        addToFeed('<em>Zephyr Imp</em> returned <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong> on ' + formatWho(chosen.side) + '\'s field to hand!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
        await returnMonsterToHand(chosen.side, chosen.zone);

    } else if (monsterInst.cardId === 'dragon-piper') {
        addToFeed('<em>' + def.name + '</em> FLIP EFFECT activated!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

        // Find all face-up Dragon Capture Jars on both fields
        var jarsToDestroy = [];
        ['player', 'computer'].forEach(function(side) {
            if (GameState[side] && GameState[side].field && GameState[side].field.spells) {
                for (var z = 1; z <= 6; z++) {
                    var sInst = GameState[side].field.spells[z];
                    if (sInst && sInst.cardId === 'dragon-capture-jar' && sInst.position !== 'set' && !sInst.faceDown) {
                        jarsToDestroy.push({ side: side, zone: z });
                    }
                }
            }
        });

        if (jarsToDestroy.length === 0) {
            addToFeed('<em>' + def.name + '</em>: No face-up Dragon Capture Jars on the field to destroy.\n\n');
        } else {
            addToFeed('<em>' + def.name + '</em> destroys ' + jarsToDestroy.length + ' face-up <strong>Dragon Capture Jar</strong>(s)!\n');
            if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');

            for (var j = 0; j < jarsToDestroy.length; j++) {
                var targetJar = jarsToDestroy[j];
                await destroySpellTrap(targetJar.side, targetJar.zone, false, false);
            }

            // "If you destroy any, change all face-up Dragon-Type monsters on the field to Attack Position."
            var dragonsChanged = [];
            ['player', 'computer'].forEach(function(side) {
                if (GameState[side] && GameState[side].field && GameState[side].field.monsters) {
                    for (var z = 1; z <= 6; z++) {
                        var m = GameState[side].field.monsters[z];
                        if (m && !m.faceDown && m.position !== 'defense-down') {
                            var mDef = cards[m.cardId];
                            if (mDef && mDef.monsterType === 'Dragon') {
                                if (m.position !== 'attack') {
                                    m.position = 'attack';
                                    var sq = $('#' + side + '-field .card-zone-square[data-zone="' + z + '"]');
                                    sq.attr('data-card-position', 'attack');
                                    var cz = sq.find('.card-zone.main-zone');
                                    if (typeof cz.flip === 'function') cz.flip(false);
                                    cz.transition({ rotate: '0deg' }, getAnimDuration(350), 'cubic-bezier(0.2, 0.9, 0.3, 1)');
                                    dragonsChanged.push((side === 'player' ? 'Player\'s ' : 'Computer\'s ') + (mDef ? mDef.name : 'Dragon'));
                                }
                            }
                        }
                    }
                }
            });

            if (dragonsChanged.length > 0) {
                addToFeed('<em>' + def.name + '</em> melody commands: <strong>' + dragonsChanged.join(', ') + '</strong> rise into Attack Position!\n\n');
            } else {
                addToFeed('<em>' + def.name + '</em> melody echoes across the duel arena (no Dragon-Type monsters in Defense Position).\n\n');
            }

            updateActionableCards();
            updateStatModBadges();
        }
    } else if (monsterInst.cardId === 'spear-cretin') {
        monsterInst.spearCretinPrimed = true;
        addToFeed('<em>' + def.name + '</em> FLIP EFFECT primed: When this card is sent to the Graveyard, both players can Special Summon 1 monster from their respective Graveyards!\n\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');
    }
}

// ---------------------------------------------------------------------------
// Spear Cretin Graveyard Revival Engine
// ---------------------------------------------------------------------------

var pendingSpearCretinChosenCard = null;

async function triggerSpearCretinGraveyardEffect() {
    addToFeed('<em>Spear Cretin</em> activates from the Graveyard!\nBoth players may Special Summon 1 monster from their respective Graveyards!\n\n');

    // 1. Resolve AI / Computer side revival
    var compMonstersInGY = (GameState.computer && GameState.computer.graveyard) ? GameState.computer.graveyard.filter(function(inst) {
        return cards[inst.cardId] && cards[inst.cardId].type === 'monsters';
    }) : [];

    var compFreeZones = getNumOfFreeZones('computer');
    if (compMonstersInGY.length > 0 && compFreeZones > 0) {
        // AI chooses highest ATK monster
        compMonstersInGY.sort(function(a, b) {
            return (cards[b.cardId].atk || 0) - (cards[a.cardId].atk || 0);
        });
        var chosenComp = compMonstersInGY[0];
        var compPos = AICalcMonsterPosition(chosenComp.cardId);
        if (compPos === 'defense-up') compPos = 'defense-down'; // Spear Cretin is face-up Attack or face-down Defense
        await specialSummonMonster('computer', chosenComp.cardId, 'computer', compPos);
    } else if (compMonstersInGY.length === 0) {
        addToFeed('Computer has no monsters in Graveyard for Spear Cretin.\n');
    } else {
        addToFeed('Computer has no free zones for Spear Cretin.\n');
    }

    // 2. Resolve Player side revival
    var playerMonstersInGY = (GameState.player && GameState.player.graveyard) ? GameState.player.graveyard.filter(function(inst) {
        return cards[inst.cardId] && cards[inst.cardId].type === 'monsters';
    }) : [];

    var playerFreeZones = getNumOfFreeZones('player');
    if (playerMonstersInGY.length > 0 && playerFreeZones > 0) {
        openSpearCretinTargetModal();
    } else if (playerMonstersInGY.length === 0) {
        addToFeed('You have no monsters in your Graveyard for Spear Cretin.\n');
    } else {
        addToFeed('You have no free monster zones for Spear Cretin.\n');
    }
}

function openSpearCretinTargetModal() {
    var grid = $('#spear-cretin-grid');
    grid.empty();

    var playerMonstersInGY = (GameState.player && GameState.player.graveyard) ? GameState.player.graveyard.filter(function(inst) {
        return cards[inst.cardId] && cards[inst.cardId].type === 'monsters';
    }) : [];

    if (playerMonstersInGY.length === 0) {
        $('#spear-cretin-modal').fadeOut(120);
        return;
    }

    playerMonstersInGY.forEach(function(inst) {
        var cardDef = cards[inst.cardId];
        if (!cardDef) return;

        var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                '<span class="target-owner-tag tag-player">YOUR GRAVEYARD</span>' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                '<span class="rebirth-tile-stats">ATK ' + (cardDef.atk || 0) + ' / DEF ' + (cardDef.def || 0) + '</span>' +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            spearCretinCardSelected(inst.cardId);
        });

        grid.append(tile);
    });

    $('#spear-cretin-modal').fadeIn(150);
}

function spearCretinCardSelected(cardId) {
    pendingSpearCretinChosenCard = cardId;
    var cardDef = cards[cardId];
    $('#spear-cretin-chosen-name').text(cardDef ? cardDef.name : 'MONSTER');
    $('#spear-cretin-modal').fadeOut(120);
    $('#spear-cretin-position-modal').fadeIn(150);
}

async function applySpearCretinPosition(position) {
    $('#spear-cretin-position-modal').fadeOut(120);
    var cardId = pendingSpearCretinChosenCard;
    pendingSpearCretinChosenCard = null;
    if (cardId) {
        await specialSummonMonster('player', cardId, 'player', position);
    }
}

function cancelSpearCretinPosition() {
    $('#spear-cretin-position-modal').fadeOut(120);
    openSpearCretinTargetModal();
}

function cancelSpearCretinTarget() {
    $('#spear-cretin-modal').fadeOut(120);
    addToFeed('Spear Cretin effect selection was dismissed.\n');
}

// ---------------------------------------------------------------------------
// Abyssal Scout Tutor Search Handlers
// ---------------------------------------------------------------------------
var abyssalScoutResolver = null;

async function triggerAbyssalScoutSearch(who) {
    var deck = GameState[who].deck;
    if (!deck || deck.length === 0) return;

    var validTargets = [];
    deck.forEach(function(cardId, idx) {
        var def = cards[cardId];
        if (def && def.type === 'monsters' && (def.atk || 0) <= 1500) {
            validTargets.push({ cardId: cardId, def: def, index: idx });
        }
    });

    if (validTargets.length === 0) {
        addToFeed('No monsters with 1500 or less ATK in ' + formatWho(who) + '\'s deck for Abyssal Scout.\n');
        return;
    }

    if (who === 'player') {
        var chosenCardId = await promptPlayerAbyssalScout(validTargets);
        if (!chosenCardId) return;

        var dIdx = GameState.player.deck.indexOf(chosenCardId);
        if (dIdx !== -1) {
            GameState.player.deck.splice(dIdx, 1);
            if (typeof window.deck !== 'undefined') window.deck = GameState.player.deck;
        }

        var instance = new CardInstance(chosenCardId);
        GameState.player.hand.push(instance);
        addCardToHand('player', chosenCardId, instance.uid, false);
        var chosenDef = cards[chosenCardId];
        updateHandDisplay('player');
        updateActionableCards();
        updateResourceCounters();

        addToFeed('<em>Abyssal Scout</em>: Added <strong>' + (chosenDef ? chosenDef.name : 'monster') + '</strong> (ATK ' + (chosenDef ? chosenDef.atk : 0) + ') from Deck to hand!\n\n');
    } else {
        validTargets.sort(function(a, b) {
            var prioA = (a.cardId === 'man-eater-bug' || a.cardId === 'exiled-force' || a.cardId === 'yomi-ship') ? 2000 : (a.def.atk || 0);
            var prioB = (b.cardId === 'man-eater-bug' || b.cardId === 'exiled-force' || b.cardId === 'yomi-ship') ? 2000 : (b.def.atk || 0);
            return prioB - prioA;
        });
        var aiChoice = validTargets[0];
        var dIdx = GameState.computer.deck.indexOf(aiChoice.cardId);
        if (dIdx !== -1) GameState.computer.deck.splice(dIdx, 1);

        var instance = new CardInstance(aiChoice.cardId);
        GameState.computer.hand.push(instance);
        addCardToHand('computer', aiChoice.cardId, instance.uid, false);
        updateHandDisplay('computer');
        updateResourceCounters();

        addToFeed('Computer activates <em>Abyssal Scout</em>: added <strong>' + aiChoice.def.name + '</strong> to hand!\n\n');
    }
}

function promptPlayerAbyssalScout(validTargets) {
    return new Promise(function(resolve) {
        abyssalScoutResolver = resolve;
        var grid = $('#abyssal-scout-grid');
        grid.empty();

        var distinctCards = {};
        validTargets.forEach(function(item) {
            distinctCards[item.cardId] = (distinctCards[item.cardId] || 0) + 1;
        });

        Object.keys(distinctCards).forEach(function(cardId) {
            var cardDef = cards[cardId];
            if (!cardDef) return;

            var countBadge = distinctCards[cardId] > 1 ? ' (x' + distinctCards[cardId] + ')' : '';
            var typeBadge = 'LVL ' + (cardDef.level || 1) + ' • ATK ' + (cardDef.atk || 0) + ' / DEF ' + (cardDef.def || 0);

            var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                    '<span class="target-owner-tag tag-player">DECK' + countBadge + '</span>' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                    '<span class="rebirth-tile-stats">' + typeBadge + '</span>' +
                '</div>' +
            '</div>');

            tile.on('click', function() {
                $('#abyssal-scout-modal').fadeOut(120);
                if (typeof abyssalScoutResolver === 'function') {
                    var r = abyssalScoutResolver;
                    abyssalScoutResolver = null;
                    r(cardId);
                }
            });

            grid.append(tile);
        });

        $('#abyssal-scout-modal').fadeIn(150);
    });
}

// ---------------------------------------------------------------------------
// Celestial Tithe Discard Handlers
// ---------------------------------------------------------------------------
var celestialTitheResolver = null;
var celestialTitheSelectedUids = [];

function promptPlayerCelestialTitheDiscards() {
    return new Promise(function(resolve) {
        celestialTitheResolver = resolve;
        celestialTitheSelectedUids = [];

        var hand = GameState.player.hand;
        if (!hand || hand.length <= 2) {
            var discardedUids = (hand || []).map(function(c) { return c.uid; });
            applyCelestialTitheDiscards(discardedUids);
            resolve();
            return;
        }

        $('#ct-toast-counter').text('SELECT 2 CARDS FROM YOUR HAND TO DISCARD (0/2)');
        $('#ct-toast-confirm-btn').hide();
        $('#celestial-tithe-action-bar').stop(true, true).fadeIn(150);

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

        // Click handler to toggle up to 2 cards in hand for Celestial Tithe
        $('#player-hand').off('click.ct_discard').on('click.ct_discard', '> .card.counter-trap-discard-candidate', function(e) {
            e.stopPropagation();
            var uid = $(this).attr('data-uid');
            var idx = celestialTitheSelectedUids.indexOf(uid);

            if (idx !== -1) {
                // Deselect
                celestialTitheSelectedUids.splice(idx, 1);
                $(this).removeClass('active-card');
                $(this).find('.monster-destruct-preview-overlay').removeClass('force-show-destruct-x');
            } else {
                // Select up to 2
                if (celestialTitheSelectedUids.length < 2) {
                    celestialTitheSelectedUids.push(uid);
                    $(this).addClass('active-card');
                    $(this).find('.monster-destruct-preview-overlay').addClass('force-show-destruct-x');
                }
            }

            var count = celestialTitheSelectedUids.length;
            $('#ct-toast-counter').text('SELECT 2 CARDS FROM YOUR HAND TO DISCARD (' + count + '/2)');
            if (count === 2) {
                $('#ct-toast-confirm-btn').show();
            } else {
                $('#ct-toast-confirm-btn').hide();
            }
        });
    });
}

function confirmCelestialTitheDiscards() {
    if (celestialTitheSelectedUids.length !== 2) return;
    cleanupCelestialTitheUI();
    applyCelestialTitheDiscards(celestialTitheSelectedUids);
    if (typeof celestialTitheResolver === 'function') {
        var r = celestialTitheResolver;
        celestialTitheResolver = null;
        r();
    }
}

function cleanupCelestialTitheUI() {
    $('body').removeClass('counter-trap-discard-mode');
    $('#player-hand > .card').removeClass('counter-trap-discard-candidate active-card');
    $('.monster-destruct-preview-overlay').removeClass('force-show-destruct-x');
    $('#player-hand').off('click.ct_discard');
    $('#celestial-tithe-action-bar').stop(true, true).fadeOut(120);
}

function applyCelestialTitheDiscards(uids) {
    var discardedNames = [];
    uids.forEach(function(uid) {
        var idx = GameState.player.hand.findIndex(function(c) { return c.uid === uid; });
        if (idx !== -1) {
            var discarded = GameState.player.hand.splice(idx, 1)[0];
            GameState.player.graveyard.push(discarded);
            var dDef = cards[discarded.cardId];
            discardedNames.push(dDef ? dDef.name : 'a card');
        }
    });
    updateHandDisplay('player');
    updateGraveyardZones();
    addToFeed('You discard <strong>' + discardedNames.join(' and ') + '</strong> for Celestial Tithe.\n\n');
}

// ---------------------------------------------------------------------------
// Radiant Backlash Attack Response Handlers
// ---------------------------------------------------------------------------
var radiantBacklashResolver = null;

async function checkRadiantBacklashResponse(attackerWho, attackerZone, defenderWho) {
    if (isJinzoidActive()) return false;
    var rbZone = findSetTrapZone(defenderWho, 'radiant-backlash');
    if (rbZone === null) return false;

    var atkMonsters = [];
    for (var z = 1; z <= 6; z++) {
        var m = GameState[attackerWho].field.monsters[z];
        if (m && m.position === 'attack') {
            atkMonsters.push({ zone: z, card: m });
        }
    }
    if (atkMonsters.length === 0) return false;

    if (defenderWho === 'player') {
        var shouldActivate = await promptPlayerRadiantBacklash(rbZone, atkMonsters);
        if (!shouldActivate) return false;

        var trapSquare = getSpellSquareElm('player', rbZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find('div.card-zone');
            if (typeof trapZoneElm.flip === 'function') {
                try {
                    trapZoneElm.flip({ trigger: 'manual' });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed('Player activates Trap Card: <strong>Radiant Backlash</strong>!\n');
        addToFeed('💥 A shimmering prism barrier reflects the attack, destroying all enemy Attack Position monsters!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');
        await sleep(getAnimDuration(450));

        await destroySpellTrap('player', rbZone, false);

        for (var i = 0; i < atkMonsters.length; i++) {
            await destroyMonster(attackerWho, atkMonsters[i].zone);
        }
        addToFeed('Radiant Backlash obliterated ' + atkMonsters.length + ' attacking monster(s)!\n\n');

        if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
            BattleFX.cancelTargetSelection();
        }
        return true;
    } else {
        var trapSquare = getSpellSquareElm('computer', rbZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find('div.card-zone');
            if (typeof trapZoneElm.flip === 'function') {
                try {
                    trapZoneElm.flip({ trigger: 'manual' });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed('Computer activates Trap Card: <strong>Radiant Backlash</strong>!\n');
        addToFeed('💥 The computer\'s Radiant Backlash unleashes a devastating prismatic blast!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('heavy');
        await sleep(getAnimDuration(450));

        await destroySpellTrap('computer', rbZone, false);

        for (var i = 0; i < atkMonsters.length; i++) {
            await destroyMonster(attackerWho, atkMonsters[i].zone);
        }
        addToFeed('Radiant Backlash destroyed all ' + atkMonsters.length + ' of your Attack Position monster(s)!\n\n');

        if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
            BattleFX.cancelTargetSelection();
        }
        return true;
    }
}

function promptPlayerRadiantBacklash(zoneNum, atkMonsters) {
    return new Promise(function(resolve) {
        radiantBacklashResolver = resolve;

        $('#rb-modal-casualty-preview').html(
            '<strong>Enemy Casualties:</strong> ' +
            '<span style="color: #f87171;">' + atkMonsters.length + ' Attack Monster(s) destroyed</span>'
        );

        $('#radiant-backlash-prompt-modal').fadeIn(150);
    });
}

function resolveRadiantBacklashPrompt(shouldActivate) {
    $('#radiant-backlash-prompt-modal').fadeOut(120);
    if (typeof radiantBacklashResolver === 'function') {
        var res = radiantBacklashResolver;
        radiantBacklashResolver = null;
        res(shouldActivate);
    }
}

// ---------------------------------------------------------------------------
// Crypt Awakening Graveyard Revival Handlers
// ---------------------------------------------------------------------------
var cryptAwakeningResolver = null;
var pendingCryptAwakeningTrapZone = null;

function promptPlayerCryptAwakening(zoneNum, trapDef) {
    return new Promise(function(resolve) {
        cryptAwakeningResolver = resolve;
        pendingCryptAwakeningTrapZone = zoneNum;

        var trapName = (trapDef && trapDef.name) ? trapDef.name : 'Continuous Trap';
        $('#crypt-awakening-modal .action-modal-card-name').text(trapName.toUpperCase());
        $('#crypt-awakening-modal .action-header-category').text(trapName.toUpperCase() + ' • RESURRECTION');

        var grid = $('#crypt-awakening-grid');
        grid.empty();

        var gyMonsters = GameState.player.graveyard.filter(function(inst) {
            var def = cards[inst.cardId];
            return def && def.type === 'monsters' && !def.isToken && def.subType !== 'token';
        });

        if (gyMonsters.length === 0 || getFirstFreeZone('player') === undefined) {
            addToFeed('No valid monster in Graveyard or no free zone for ' + trapName + '.\n');
            resolve();
            return;
        }

        gyMonsters.forEach(function(inst) {
            var cardDef = cards[inst.cardId];
            if (!cardDef) return;

            var typeBadge = 'LVL ' + (cardDef.level || 1) + ' • ATK ' + (cardDef.atk || 0) + ' / DEF ' + (cardDef.def || 0);

            var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                    '<span class="target-owner-tag tag-player">GRAVEYARD</span>' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                    '<span class="rebirth-tile-stats">' + typeBadge + '</span>' +
                '</div>' +
            '</div>');

            tile.on('click', async function() {
                $('#crypt-awakening-modal').fadeOut(120);
                
                var trapZone = pendingCryptAwakeningTrapZone;
                pendingCryptAwakeningTrapZone = null;

                var freeZ = await specialSummonMonster('player', inst.cardId, 'player', 'attack');
                var summonedInst = (freeZ !== false && GameState.player.field.monsters[freeZ]) ? GameState.player.field.monsters[freeZ] : null;
                var trapInst = trapZone !== null ? GameState.player.field.spells[trapZone] : null;
                if (summonedInst && trapInst) {
                    trapInst.boundMonsterUid = summonedInst.uid;
                    summonedInst.boundTrapUid = trapInst.uid;
                }
                updateGraveyardZones();
                updateResourceCounters();

                addToFeed(trapName + ' resurrected <strong>' + cardDef.name + '</strong> in Attack Position!\n\n');

                if (typeof cryptAwakeningResolver === 'function') {
                    var r = cryptAwakeningResolver;
                    cryptAwakeningResolver = null;
                    r();
                }
            });

            grid.append(tile);
        });

        $('#crypt-awakening-modal').fadeIn(150);
    });
}

function cancelCryptAwakeningTarget() {
    $('#crypt-awakening-modal').fadeOut(120);
    pendingCryptAwakeningTrapZone = null;
    if (typeof cryptAwakeningResolver === 'function') {
        var r = cryptAwakeningResolver;
        cryptAwakeningResolver = null;
        r();
    }
}

// ---------------------------------------------------------------------------
// Lunar Grimoire Target & Flip Handlers
// ---------------------------------------------------------------------------
var lunarGrimoireResolver = null;

function promptPlayerLunarGrimoireTarget(targets) {
    return new Promise(function(resolve) {
        lunarGrimoireResolver = resolve;

        var grid = $('#lunar-grimoire-grid');
        grid.empty();

        targets.forEach(function(item) {
            var cardDef = cards[item.card.cardId];
            if (!cardDef) return;

            var sideLabel = item.side === 'player' ? 'YOU' : 'OPPONENT';
            var tagClass = item.side === 'player' ? 'tag-player' : 'tag-opponent';
            var stats = 'ATK ' + (typeof getMonsterAtk === 'function' ? getMonsterAtk(item.card) : cardDef.atk) + ' / DEF ' + (typeof getMonsterDef === 'function' ? getMonsterDef(item.card) : cardDef.def);

            var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                    '<span class="target-owner-tag ' + tagClass + '">' + sideLabel + ' #' + item.zone + '</span>' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                    '<span class="rebirth-tile-stats">' + stats + '</span>' +
                '</div>' +
            '</div>');

            tile.on('click', async function() {
                $('#lunar-grimoire-modal').fadeOut(120);
                await applyLunarGrimoireFlip(item.side, item.zone);
                if (typeof lunarGrimoireResolver === 'function') {
                    var r = lunarGrimoireResolver;
                    lunarGrimoireResolver = null;
                    r();
                }
            });

            grid.append(tile);
        });

        $('#lunar-grimoire-modal').fadeIn(150);
    });
}

function cancelLunarGrimoireTarget() {
    $('#lunar-grimoire-modal').fadeOut(120);
    if (typeof lunarGrimoireResolver === 'function') {
        var r = lunarGrimoireResolver;
        lunarGrimoireResolver = null;
        r();
    }
}

async function applyLunarGrimoireFlip(side, zoneNum) {
    var monsterInst = GameState[side].field.monsters[zoneNum];
    if (!monsterInst) return;

    var mDef = cards[monsterInst.cardId];

    // Check Nether Wraith self-destruction on targeting
    if (monsterInst.cardId === 'nether-wraith') {
        addToFeed('<em>Nether Wraith</em> was targeted by Lunar Grimoire! Its self-destruction effect activates!\n');
        await destroyMonster(side, zoneNum);
        return;
    }

    monsterInst.position = 'defense-down';
    monsterInst.faceDown = true;

    var square = getSquareElm(side, zoneNum);
    if (square && square.length) {
        square.attr('data-card-position', 'defense-down');
        var cardZone = square.find('div.card-zone');
        if (typeof cardZone.flip === 'function') {
            try {
                cardZone.flip({ trigger: 'manual' });
                cardZone.flip(true);
            } catch (e) {}
        }
        var turnDuration = getAnimDuration(380);
        var animEasing = 'cubic-bezier(0.2, 0.9, 0.3, 1)';
        await new Promise(function(resolve) {
            cardZone.transition({ rotate: '90deg' }, turnDuration, animEasing, resolve);
        });
    }

    updateStatModBadges();
    addToFeed('<em>Lunar Grimoire</em> changed ' + formatWho(side) + '\'s <strong>' + (mDef ? mDef.name : 'monster') + '</strong> to face-down Defense Position!\n\n');
}

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

// All monsters on `who`'s field that are currently face-up (valid equip targets)
function getFaceUpMonstersOnField(who) {
    return GameState.getMonstersOnField(who).filter(function(m) {
        return m.card && !m.card.faceDown && m.card.position !== 'defense-down';
    });
}

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
        discardedInst = GameState.player.hand.splice(gIdx, 1)[0];
    } else {
        discardedInst = new CardInstance(cardName);
    }

    GameState.player.graveyard.push(discardedInst);
    updateHandDisplay('player');
    updateGraveyardZones();

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

// ---------------------------------------------------------------------------
// Battle Destruction Graveyard Effects (e.g. Yomi Ship, Giant Germ)
// ---------------------------------------------------------------------------

async function triggerBattleDestructionGraveyardEffect(destroyedInst, destroyedWho, destroyedZone, destroyerInst, destroyerWho, destroyerZone) {
    if (!destroyedInst) return;

    if (destroyedInst.cardId === 'yomi-ship') {
        var cardDef = cards[destroyedInst.cardId];
        var cardName = cardDef ? cardDef.name : 'Yomi Ship';

        // Check if the destroyer monster is still present on the field
        var currentDestroyer = GameState[destroyerWho] && GameState[destroyerWho].field && GameState[destroyerWho].field.monsters[destroyerZone];
        if (currentDestroyer && (!destroyerInst || !destroyerInst.uid || currentDestroyer.uid === destroyerInst.uid)) {
            var destroyerDef = cards[currentDestroyer.cardId];
            var destroyerName = destroyerDef ? destroyerDef.name : 'the monster';

            addToFeed('<em>' + cardName + '</em> activates from the Graveyard!\n' +
                'The ghostly phantom vessel drags down and destroys ' + formatWho(destroyerWho) + '\'s <strong>' + destroyerName + '</strong>!\n\n');

            if (typeof BattleFX !== 'undefined') {
                BattleFX.triggerScreenShake('medium');
            }

            await destroyMonster(destroyerWho, destroyerZone);
        }
    } else if (destroyedInst.cardId === 'giant-germ') {
        var cardDef = cards[destroyedInst.cardId];
        var cardName = cardDef ? cardDef.name : 'Giant Germ';
        var oppWho = GameState.getOpponent(destroyedWho);
        var burnDmg = 500;

        GameState[oppWho].lp = Math.max(0, GameState[oppWho].lp - burnDmg);
        addToFeed('<em>' + cardName + '</em> activates from the Graveyard!\n' +
            'Inflicts 500 damage to ' + formatWho(oppWho) + '!\n');

        if (typeof BattleFX !== 'undefined') {
            BattleFX.spawnFloatingDamage(oppWho === 'computer' ? $('#opponent-lp') : $('#player-lp'), burnDmg, 'burn');
            BattleFX.animateLPCount(oppWho, GameState[oppWho].lp);
            BattleFX.triggerScreenShake('light');
        }
        EventBus.emit('LP_CHANGED', { who: oppWho, lp: GameState[oppWho].lp, damage: burnDmg });

        // Search deck for additional copies of Giant Germ and Special Summon them in Attack Position
        var deckArr = GameState[destroyedWho] && GameState[destroyedWho].deck;
        if (deckArr && deckArr.length > 0) {
            var germCopies = deckArr.filter(function(id) { return id === 'giant-germ'; }).length;
            var freeZonesCount = getNumOfFreeZones(destroyedWho);
            var toSummon = Math.min(germCopies, freeZonesCount);

            if (toSummon > 0) {
                addToFeed(formatWho(destroyedWho) + ' calls forth ' + toSummon + ' additional <em>Giant Germ</em> from the Deck!\n');
                for (var g = 0; g < toSummon; g++) {
                    await specialSummonMonsterFromDeck(destroyedWho, 'giant-germ');
                    await sleep(300);
                }
            } else if (germCopies === 0) {
                addToFeed('No additional copies of <em>Giant Germ</em> found in ' + formatWho(destroyedWho) + '\'s Deck.\n\n');
            } else {
                addToFeed('No free monster zones to Special Summon additional copies of <em>Giant Germ</em>.\n\n');
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Exiled Force Engine (Ignition Effect: Tribute self -> Destroy 1 monster)
// ---------------------------------------------------------------------------

var pendingExiledForceZone = null;

function openExiledForceTargetModal(zoneNum) {
    pendingExiledForceZone = zoneNum;

    var grid = $('#exiled-force-target-grid');
    grid.empty();

    var allMonsters = [];
    ['computer', 'player'].forEach(function(side) {
        for (var z = 1; z <= 6; z++) {
            var inst = GameState[side].field.monsters[z];
            if (inst && !(side === 'player' && z === zoneNum)) {
                allMonsters.push({ side: side, zone: z, inst: inst });
            }
        }
    });

    if (allMonsters.length === 0) {
        addToFeed('No other monsters on the field to destroy.\n');
        return;
    }

    allMonsters.forEach(function(entry) {
        var cardDef = cards[entry.inst.cardId];
        var isFaceDown = entry.inst.faceDown || entry.inst.position === 'defense-down';
        var isOpp = entry.side === 'computer';
        var ownerLabel = isOpp ? 'OPPONENT' : 'YOUR FIELD';
        var ownerClass = isOpp ? 'tag-opponent' : 'tag-player';
        var zoneLabel = 'MONSTER ZONE #' + entry.zone;

        var imgSrc = (isFaceDown && isOpp) ? 'cards/card_back.png' : 'cards/' + (cardDef ? cardDef.file : 'card_back.png');
        var displayName = (isFaceDown && isOpp) ? 'Face-Down Monster' : (cardDef ? cardDef.name : 'Monster');
        var statsHtml = (isFaceDown && isOpp)
            ? '<span class="rebirth-tile-stats">Position: Set (Face-Down)</span>'
            : '<span class="rebirth-tile-stats">ATK ' + getMonsterAtk(entry.inst) + ' / DEF ' + getMonsterDef(entry.inst) + '</span>';

        var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="' + imgSrc + '" alt="' + displayName + '" class="rebirth-thumb-img">' +
                '<span class="target-owner-tag ' + ownerClass + '">' + ownerLabel + ' • ' + zoneLabel + '</span>' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + displayName + '</h4>' +
                statsHtml +
            '</div>' +
        '</div>');

        tile.on('click', function() {
            applyExiledForceTarget(entry.side, entry.zone);
        });

        grid.append(tile);
    });

    $('#exiled-force-target-modal').fadeIn(150);
}

function cancelExiledForceEffect() {
    $('#exiled-force-target-modal').fadeOut(120);
    pendingExiledForceZone = null;
    resetActiveCardClass();
    hideAtkMenuIfVisible();
}

async function applyExiledForceTarget(targetSide, targetZone) {
    $('#exiled-force-target-modal').fadeOut(120);
    var sourceZone = pendingExiledForceZone;
    pendingExiledForceZone = null;

    if (sourceZone === null) return;

    var targetInst = GameState[targetSide].field.monsters[targetZone];
    var targetDef = targetInst ? cards[targetInst.cardId] : null;
    var targetName = targetDef ? targetDef.name : 'Monster';

    addToFeed('You Tribute <strong>Exiled Force</strong> to destroy ' + formatWho(targetSide) + '\'s <strong>' + targetName + '</strong>!\n\n');

    if (typeof BattleFX !== 'undefined') {
        BattleFX.triggerScreenShake('medium');
    }

    // Tribute Exiled Force
    await destroyMonster('player', sourceZone);

    // Destroy target monster
    await destroyMonster(targetSide, targetZone);

    resetActiveCardClass();
    hideAtkMenuIfVisible();
    updateStatModBadges();
    updateActionableCards();
    updateResourceCounters();
}

// ---------------------------------------------------------------------------
// Gryphon Stormlord: Cyclone Bounce Ignition Modal
// ---------------------------------------------------------------------------
async function openGryphonStormlordModal(sourceZone) {
    var sourceInst = GameState.player.field.monsters[sourceZone];
    if (!sourceInst) return;

    var candidates = [];
    ['player', 'computer'].forEach(function(side) {
        var monsters = GameState.getMonstersOnField(side);
        monsters.forEach(function(entry) {
            if (side !== 'player' || entry.zone !== sourceZone) {
                var mDef = cards[entry.card.cardId];
                candidates.push({
                    side: side,
                    zone: entry.zone,
                    inst: entry.card,
                    def: mDef,
                    name: mDef ? mDef.name : 'Monster',
                    type: 'monsters'
                });
            }
        });
    });

    if (candidates.length === 0) {
        addToFeed('No other monsters on the field to return to hand.\n');
        return;
    }

    var chosen = await requestFieldTargetChoice('player', {
        cardName: 'Gryphon Stormlord',
        prompt: 'SELECT 1 MONSTER ON THE FIELD TO RETURN TO HAND',
        confirmLabel: 'BOUNCE',
        confirmIcon: '🌀',
        candidates: candidates
    });

    if (!chosen) return;

    sourceInst.lastEffectTurn = turnCount;
    addToFeed('You activate <em>Gryphon Stormlord</em>\'s Cyclone Bounce!\n');
    if (typeof BattleFX !== 'undefined') {
        BattleFX.triggerScreenShake('small');
    }
    await returnMonsterToHand(chosen.side, chosen.zone);
    resetActiveCardClass();
    hideAtkMenuIfVisible();
}

// AI routine to trigger Gryphon Stormlord bounce
async function AIPlayGryphonStormlord() {
    var gryphonMonsters = GameState.getMonstersOnField('computer').filter(function(entry) {
        return entry.card.cardId === 'gryphon-stormlord' && entry.card.position !== 'defense-down' && entry.card.lastEffectTurn !== turnCount;
    });

    for (var g = 0; g < gryphonMonsters.length; g++) {
        var gryphonEntry = gryphonMonsters[g];
        var playerMonsters = GameState.getMonstersOnField('player');
        if (playerMonsters.length === 0) continue;

        // Find opponent monster with highest ATK
        playerMonsters.sort(function(a, b) {
            return getMonsterAtk(b.card) - getMonsterAtk(a.card);
        });

        var target = playerMonsters[0];
        var targetDef = cards[target.card.cardId];
        var targetName = targetDef ? targetDef.name : 'Monster';

        gryphonEntry.card.lastEffectTurn = turnCount;
        addToFeed('Computer activates <em>Gryphon Stormlord</em>\'s Cyclone Bounce on your <strong>' + targetName + '</strong>!\n\n');
        if (typeof BattleFX !== 'undefined') {
            BattleFX.triggerScreenShake('small');
        }
        await returnMonsterToHand('player', target.zone);
        await sleep(getAnimDuration(400));
    }
}

// ---------------------------------------------------------------------------
// Universal Tribute Summon Trigger Resolution (Titan, Leviathan, etc.)
// ---------------------------------------------------------------------------
async function checkTributeSummonTriggers(who, cardDef, zoneNum) {
    if (!cardDef) return;

    // 1. Titan of the Obsidian Peak: Destroy 1 face-down card
    if (cardDef.id === 'titan-of-the-obsidian-peak') {
        var faceDownCandidates = [];
        ['player', 'computer'].forEach(function(side) {
            for (var z = 1; z <= 6; z++) {
                var m = GameState[side].field.monsters[z];
                if (m && (m.faceDown || m.position === 'defense-down')) {
                    faceDownCandidates.push({
                        side: side,
                        zone: z,
                        isMonster: true,
                        inst: m,
                        name: 'Face-Down Monster',
                        def: cards[m.cardId]
                    });
                }
                var s = GameState[side].field.spells[z];
                if (s && s.position === 'set') {
                    faceDownCandidates.push({
                        side: side,
                        zone: z,
                        isSpellTrap: true,
                        inst: s,
                        name: 'Set Spell/Trap',
                        def: cards[s.cardId]
                    });
                }
            }
        });

        if (faceDownCandidates.length === 0) {
            addToFeed('<em>Titan of the Obsidian Peak</em> was Tribute Summoned, but no face-down cards were found on the field.\n\n');
            return;
        }

        addToFeed('<em>Titan of the Obsidian Peak</em> triggers! Destroy 1 face-down card on the field.\n');

        var chosen = await TargetEngine.requestTarget(who, {
            title: 'TITAN OF THE OBSIDIAN PEAK',
            subtitle: 'TARGET 1 FACE-DOWN CARD TO DESTROY',
            badge: { category: 'OBSIDIAN SHATTER', color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.45)' },
            candidates: faceDownCandidates,
            aiPick: function(list) {
                var oppCards = list.filter(function(c) { return c.side === 'player'; });
                return oppCards.length > 0 ? oppCards[0] : list[0];
            }
        });

        if (chosen) {
            var cDef = chosen.def || (chosen.inst ? cards[chosen.inst.cardId] : null);
            var cName = cDef ? cDef.name : 'face-down card';
            addToFeed('<em>Titan of the Obsidian Peak</em> shatters ' + formatWho(chosen.side) + '\'s <strong>' + cName + '</strong>!\n\n');
            if (typeof BattleFX !== 'undefined') {
                BattleFX.triggerScreenShake('medium');
            }
            if (chosen.isMonster) {
                await destroyMonster(chosen.side, chosen.zone);
            } else {
                await destroySpellTrap(chosen.side, chosen.zone, false);
            }
        }
    }

    // 2. Abyssal Leviathan: Destroy up to 2 Spell/Trap cards
    else if (cardDef.id === 'abyssal-leviathan') {
        var stCandidates = [];
        ['player', 'computer'].forEach(function(side) {
            for (var z = 1; z <= 6; z++) {
                var s = GameState[side].field.spells[z];
                if (s) {
                    stCandidates.push({
                        side: side,
                        zone: z,
                        isField: false,
                        inst: s,
                        def: cards[s.cardId],
                        name: cards[s.cardId] ? cards[s.cardId].name : 'Spell/Trap'
                    });
                }
            }
            if (GameState[side].field.fieldZone) {
                var fz = GameState[side].field.fieldZone;
                stCandidates.push({
                    side: side,
                    zone: null,
                    isField: true,
                    inst: fz,
                    def: cards[fz.cardId],
                    name: cards[fz.cardId] ? cards[fz.cardId].name : 'Field Spell'
                });
            }
        });

        if (stCandidates.length === 0) {
            addToFeed('<em>Abyssal Leviathan</em> was Tribute Summoned, but no Spell or Trap cards were found.\n\n');
            return;
        }

        addToFeed('<em>Abyssal Leviathan</em> triggers! Destroy up to 2 Spell/Trap cards on the field.\n');

        // First target
        var target1 = await TargetEngine.requestTarget(who, {
            title: 'ABYSSAL LEVIATHAN (1/2)',
            subtitle: 'SELECT FIRST SPELL/TRAP CARD TO DESTROY',
            badge: { category: 'TIDAL SURGE', color: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.45)' },
            candidates: stCandidates,
            aiPick: function(list) {
                var oppCards = list.filter(function(c) { return c.side === 'player'; });
                return oppCards.length > 0 ? oppCards[0] : list[0];
            }
        });

        if (target1) {
            var tDef1 = target1.def || (target1.inst ? cards[target1.inst.cardId] : null);
            addToFeed('<em>Abyssal Leviathan</em> destroys ' + formatWho(target1.side) + '\'s <strong>' + (tDef1 ? tDef1.name : 'Spell/Trap') + '</strong>!\n');
            if (target1.isField) {
                await destroySpellTrap(target1.side, null, true);
            } else {
                await destroySpellTrap(target1.side, target1.zone, false);
            }

            // Filter out destroyed target for second target
            var remainingST = stCandidates.filter(function(c) {
                return (c.side !== target1.side) || (c.isField !== target1.isField) || (c.zone !== target1.zone);
            });

            if (remainingST.length > 0) {
                var target2 = await TargetEngine.requestTarget(who, {
                    title: 'ABYSSAL LEVIATHAN (2/2)',
                    subtitle: 'SELECT SECOND SPELL/TRAP CARD TO DESTROY (OR CANCEL)',
                    badge: { category: 'TIDAL SURGE', color: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.45)' },
                    candidates: remainingST,
                    aiPick: function(list) {
                        var oppCards = list.filter(function(c) { return c.side === 'player'; });
                        return oppCards.length > 0 ? oppCards[0] : null;
                    }
                });

                if (target2) {
                    var tDef2 = target2.def || (target2.inst ? cards[target2.inst.cardId] : null);
                    addToFeed('<em>Abyssal Leviathan</em> destroys ' + formatWho(target2.side) + '\'s <strong>' + (tDef2 ? tDef2.name : 'Spell/Trap') + '</strong>!\n\n');
                    if (target2.isField) {
                        await destroySpellTrap(target2.side, null, true);
                    } else {
                        await destroySpellTrap(target2.side, target2.zone, false);
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Vanguard's Accord Deck Summon Handlers
// ---------------------------------------------------------------------------
var vanguardsAccordResolver = null;

function promptPlayerVanguardsAccord(sourceWho, sourceZone) {
    return new Promise(function(resolve) {
        vanguardsAccordResolver = resolve;

        var grid = $('#vanguards-accord-grid');
        grid.empty();

        var playerDeck = (GameState.player && GameState.player.deck) ? GameState.player.deck : [];
        var eligibleIds = playerDeck.filter(function(id) {
            var d = cards[id];
            return d && d.type === 'monsters' && (!d.subType || d.subType === 'normal' || d.subType === '') && (d.level || 0) <= 4 && !d.isToken;
        });

        // Deduplicate for display, count quantity
        var counts = {};
        eligibleIds.forEach(function(id) { counts[id] = (counts[id] || 0) + 1; });
        var uniqueEligible = Object.keys(counts);

        if (uniqueEligible.length === 0) {
            addToFeed('No eligible Level 4 or lower Normal Monsters found in Deck.\n');
            resolve();
            return;
        }

        uniqueEligible.forEach(function(cardId) {
            var cardDef = cards[cardId];
            if (!cardDef) return;

            var stats = 'LVL ' + (cardDef.level || 1) + ' • ATK ' + cardDef.atk + ' / DEF ' + cardDef.def;
            var countBadge = (counts[cardId] > 1) ? (' <span class="tag-player">x' + counts[cardId] + '</span>') : '';

            var tile = $('<div class="rebirth-card-tile target-trap-tile">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + cardDef.name + countBadge + '</h4>' +
                    '<span class="rebirth-tile-stats">' + stats + '</span>' +
                    '<div class="rebirth-tile-actions">' +
                        '<button class="rebirth-action-btn btn-summon-atk"><span>⚔ ATK</span></button>' +
                        '<button class="rebirth-action-btn btn-summon-def"><span>🛡 DEF</span></button>' +
                    '</div>' +
                '</div>' +
            '</div>');

            var executeSummon = async function(position) {
                $('#vanguards-accord-modal').fadeOut(120);
                await specialSummonMonsterFromDeck('player', cardId, position);
                if (typeof vanguardsAccordResolver === 'function') {
                    var r = vanguardsAccordResolver;
                    vanguardsAccordResolver = null;
                    r();
                }
            };

            tile.find('.btn-summon-atk').on('click', function(e) {
                e.stopPropagation();
                executeSummon('attack');
            });

            tile.find('.btn-summon-def').on('click', function(e) {
                e.stopPropagation();
                executeSummon('defense-up');
            });

            // Clicking the card frame itself defaults to Attack Position
            tile.find('.rebirth-card-preview-frame, .rebirth-tile-name, .rebirth-tile-stats').on('click', function() {
                executeSummon('attack');
            });

            grid.append(tile);
        });

        $('#vanguards-accord-modal').fadeIn(150);
    });
}

function cancelVanguardsAccordSelection() {
    $('#vanguards-accord-modal').fadeOut(120);
    if (typeof vanguardsAccordResolver === 'function') {
        var r = vanguardsAccordResolver;
        vanguardsAccordResolver = null;
        r();
    }
}

// ---------------------------------------------------------------------------
// Gale Swiftblade Ignition Effect (Halve 1 Opponent Monster ATK/DEF)
// ---------------------------------------------------------------------------
async function activateGaleSwiftblade(who, zoneNum) {
    var monsterInst = GameState[who].field.monsters[zoneNum];
    if (!monsterInst) return;

    if (monsterInst.usedGaleTurn === turnCount) {
        if (who === 'player') {
            addToFeed('<em>Gale Swiftblade</em> has already used its effect this turn.\n\n');
        }
        return;
    }

    var opp = GameState.getOpponent(who);
    var candidates = [];
    for (var z = 1; z <= 6; z++) {
        var m = GameState[opp].field.monsters[z];
        if (m && !m.faceDown && m.position !== 'defense-down') {
            var d = cards[m.cardId];
            candidates.push({
                side: opp,
                zone: z,
                inst: m,
                card: m,
                name: d ? d.name : 'Monster',
                def: d
            });
        }
    }

    if (candidates.length === 0) {
        if (who === 'player') {
            addToFeed('No face-up opponent monsters to target with <em>Gale Swiftblade</em>.\n\n');
        }
        return;
    }

    var chosen = await requestFieldTargetChoice(who, {
        cardName: 'Gale Swiftblade',
        prompt: 'SELECT 1 OPPONENT FACE-UP MONSTER TO HALVE ATK & DEF',
        confirmLabel: 'HALVE',
        confirmIcon: '🎯',
        candidates: candidates,
        aiPick: function(list) {
            list.sort(function(a, b) {
                var atkA = (typeof getMonsterAtk === 'function') ? getMonsterAtk(a.inst || a.card) : (a.def ? a.def.atk || 0 : 0);
                var atkB = (typeof getMonsterAtk === 'function') ? getMonsterAtk(b.inst || b.card) : (b.def ? b.def.atk || 0 : 0);
                return atkB - atkA;
            });
            return list[0];
        }
    });

    if (chosen && (chosen.inst || chosen.card)) {
        var targetInst = chosen.inst || chosen.card;
        var targetDef = chosen.def || cards[targetInst.cardId];

        monsterInst.usedGaleTurn = turnCount;
        targetInst.isGaleHalved = true;
        targetInst.galeHalvedTurn = turnCount;

        var newAtk = (typeof getMonsterAtk === 'function') ? getMonsterAtk(targetInst) : Math.floor((targetDef.atk || 0) / 2);
        var newDef = (typeof getMonsterDef === 'function') ? getMonsterDef(targetInst) : Math.floor((targetDef.def || 0) / 2);

        if (typeof BattleFX !== 'undefined') {
            BattleFX.triggerScreenShake('light');
        }

        addToFeed(formatWho(who) + ' activates <em>Gale Swiftblade</em>: ' + formatWho(chosen.side) + '\'s <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong> has its ATK & DEF halved to <strong>' + newAtk + ' ATK / ' + newDef + ' DEF</strong> until the end of the turn!\n\n');
        updateResourceCounters();
        updateStatModBadges();
    }
}



