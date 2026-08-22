/**
 * Effects Spells: Rebirth, Remove Trap, Tribute to the Doomed, Change of Heart,
 * Equip Spells, Swords, MST, Vanguard's Accord, Gaia Power and related modals.
 * Split from card-effects.js (1140-2353) for maintainability.
 */
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
    var inst = GameState.player.hand.find(function(c) { return c.uid === uid; });
    if (inst) {
        tttdDiscardedCardId = inst.cardId;
        var discardDef = cards[tttdDiscardedCardId];
        addToFeed('<em>Tribute to the Doomed</em>: You discard <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong>.\n');
        discardCardToGraveyard('player', inst);
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
    } else if (monsterInst.cardId === 'aurora-golem') {
        addToFeed('<em>' + def.name + '</em> FLIP EFFECT activated!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

        // Gather LIGHT monsters from own hand and graveyard
        var lightCandidates = [];

        // From hand
        if (GameState[who] && GameState[who].hand) {
            GameState[who].hand.forEach(function(hInst) {
                var hDef = cards[hInst.cardId];
                if (hDef && hDef.type === 'monsters' && hDef.attribute === 'LIGHT' && !hDef.isToken) {
                    lightCandidates.push({
                        source: 'hand',
                        inst: hInst,
                        def: hDef,
                        name: hDef.name
                    });
                }
            });
        }

        // From graveyard
        if (GameState[who] && GameState[who].graveyard) {
            GameState[who].graveyard.forEach(function(gInst) {
                var gDef = cards[gInst.cardId];
                if (gDef && gDef.type === 'monsters' && gDef.attribute === 'LIGHT' && !gDef.isToken) {
                    lightCandidates.push({
                        source: 'graveyard',
                        inst: gInst,
                        def: gDef,
                        name: gDef.name
                    });
                }
            });
        }

        if (lightCandidates.length === 0) {
            addToFeed('<em>' + def.name + '</em>: No LIGHT monsters in hand or Graveyard to Special Summon.\n\n');
        } else if (getNumOfFreeZones(who) <= 0) {
            addToFeed('<em>' + def.name + '</em>: No free monster zones to Special Summon.\n\n');
        } else {
            var chosenLight = null;
            if (who === 'player') {
                chosenLight = await promptPlayerAuroraGolem(who, lightCandidates);
            } else {
                // AI picks the highest-ATK LIGHT monster
                lightCandidates.sort(function(a, b) {
                    return (b.def.atk || 0) - (a.def.atk || 0);
                });
                chosenLight = lightCandidates[0];
            }

            if (!chosenLight) {
                addToFeed('<em>' + def.name + '</em> effect was dismissed.\n\n');
                return;
            }

            var lightDef = chosenLight.def;
            var chosenCardId = chosenLight.inst.cardId;
            var freeZone = getFirstFreeZone(who);
            if (freeZone === undefined) {
                addToFeed('(Special Summon) No free monster zones for <em>' + lightDef.name + '</em>.\n\n');
                return;
            }

            addToFeed(formatWho(who) + ' Special Summons <em>' + lightDef.name + '</em> from the ' + (chosenLight.source === 'hand' ? 'hand' : 'Graveyard') + ' in Defense Position!\n\n');

            if (chosenLight.source === 'hand') {
                // Use moveCard so the hand DOM element animates out naturally
                var handElm = getHandCardElmByUid(who, chosenLight.inst.uid);
                if (handElm && handElm.length) {
                    var targetSquare = getSquareElm(who, freeZone);
                    targetSquare.attr('data-card-name', chosenCardId);
                    targetSquare.attr('data-card-type', 'monsters');
                    targetSquare.attr('data-card-position', 'defense-up');
                    var auroraHandIdx = GameState[who].hand.indexOf(chosenLight.inst);
                    if (auroraHandIdx !== -1) GameState[who].hand.splice(auroraHandIdx, 1);
                    await moveCard(who, handElm, targetSquare, 'defense-up', true, true);
                } else {
                    // Fallback: place directly
                    var instance = new CardInstance(chosenCardId);
                    instance.position = 'defense-up';
                    instance.turnSummoned = turnCount;
                    instance.turnPosChanged = turnCount;
                    GameState[who].field.monsters[freeZone] = instance;
                    var hIdx = GameState[who].hand.indexOf(chosenLight.inst);
                    if (hIdx !== -1) GameState[who].hand.splice(hIdx, 1);
                    var sq = getSquareElm(who, freeZone);
                    sq.attr('data-card-name', chosenCardId);
                    sq.attr('data-card-type', 'monsters');
                    sq.attr('data-card-position', 'defense-up');
                    if (typeof updateActionableCards === 'function') updateActionableCards();
                }
            } else {
                // Graveyard source: use specialSummonMonster's spirit-flight animation
                await specialSummonMonster(who, chosenCardId, who, 'defense-up');
            }

            updateHandDisplay(who);
            updateGraveyardZones();
            updateResourceCounters();
            updateActionableCards();
        }
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

// Prompt player to choose a LIGHT monster from hand or Graveyard for Aurora Golem
function promptPlayerAuroraGolem(who, candidates) {
    return new Promise(function(resolve) {
        var grid = $('#aurora-golem-grid');
        grid.empty();

        // Group by cardId to show counts and dedupe tiles
        var distinct = {};
        var byCardId = {};
        candidates.forEach(function(c) {
            var cid = c.def.id;
            distinct[cid] = (distinct[cid] || 0) + 1;
            if (!byCardId[cid]) byCardId[cid] = c;
        });

        Object.keys(distinct).forEach(function(cardId) {
            var sample = byCardId[cardId];
            var cDef = sample.def;
            var countBadge = distinct[cardId] > 1 ? ' (x' + distinct[cardId] + ')' : '';
            var typeBadge = 'LVL ' + (cDef.level || 1) + ' • ATK ' + (cDef.atk || 0) + ' / DEF ' + (cDef.def || 0);
            var sourceLabel = sample.source === 'hand' ? 'HAND' : 'GRAVEYARD';
            var ownerClass = sample.source === 'hand' ? 'tag-player' : 'tag-graveyard';

            var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + cDef.file + '" alt="' + cDef.name + '" class="rebirth-thumb-img">' +
                    '<span class="target-owner-tag ' + ownerClass + '">' + sourceLabel + countBadge + '</span>' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + cDef.name + '</h4>' +
                    '<span class="rebirth-tile-stats">' + typeBadge + '</span>' +
                '</div>' +
            '</div>');

            tile.on('click', function() {
                $('#aurora-golem-modal').fadeOut(120, function() {
                    resolve(sample);
                });
            });

            grid.append(tile);
        });

        $('#aurora-golem-modal').fadeIn(150);
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
        var inst = GameState.player.hand.find(function(c) { return c.uid === uid; });
        if (inst) {
            var dDef = cards[inst.cardId];
            discardedNames.push(dDef ? dDef.name : 'a card');
            discardCardToGraveyard('player', inst);
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
            revertContinuousTrapToSet('player', pendingCryptAwakeningTrapZone);
            pendingCryptAwakeningTrapZone = null;
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
    if (pendingCryptAwakeningTrapZone !== null) {
        revertContinuousTrapToSet('player', pendingCryptAwakeningTrapZone);
    }
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
// Bloodprice Altar: Continuous Spell burn on attack declaration
// ---------------------------------------------------------------------------
async function applyBloodpriceAltarBurn(attackerWho) {
    var defenderWho = (attackerWho === 'player') ? 'computer' : 'player';
    if (!hasActiveCard(defenderWho, 'bloodprice-altar')) return;

    var BLOODPRICE_DAMAGE = 400;
    GameState[attackerWho].lp = Math.max(0, GameState[attackerWho].lp - BLOODPRICE_DAMAGE);

    addToFeed('🩸 <em>Bloodprice Altar</em> exacts its toll — ' + formatWho(attackerWho) + ' takes <strong>' + BLOODPRICE_DAMAGE + '</strong> damage for declaring an attack!\n');
    if (typeof BattleFX !== 'undefined') {
        BattleFX.spawnFloatingDamage(attackerWho === 'computer' ? $('#opponent-lp') : $('#player-lp'), BLOODPRICE_DAMAGE, 'direct');
        BattleFX.animateLPCount(attackerWho, GameState[attackerWho].lp);
    }
    EventBus.emit('LP_CHANGED', { who: attackerWho, lp: GameState[attackerWho].lp, damage: BLOODPRICE_DAMAGE });
    updateResourceCounters();
}
