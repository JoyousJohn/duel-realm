/**
 * Card Effects Engine: spell / trap / field spell resolution,
 * stat modifiers, trap auto-triggers, and persistent effects.
 */

// ---------------------------------------------------------------------------
// Field Spell Stat Modifiers
// ---------------------------------------------------------------------------

// Return { atk, def } stat modifiers for a monster card definition based on
// active field spells on BOTH sides. Separate ATK and DEF to support
// asymmetric field spells (e.g. Mystic Plasma Zone: +500 ATK / -400 DEF).
function getFieldMods(monsterDef) {
    if (!monsterDef || monsterDef.type !== 'monsters') return { atk: 0, def: 0 };

    var atkMod = 0;
    var defMod = 0;
    var bothSides = ['player', 'computer'];

    for (var s = 0; s < bothSides.length; s++) {
        var who = bothSides[s];
        var fieldInst = GameState[who].field.fieldZone;
        if (!fieldInst) continue;

        var fieldId = fieldInst.cardId;
        if (fieldId === 'yami') {
            if (monsterDef.monsterType === 'Fiend' || monsterDef.monsterType === 'Spellcaster') {
                atkMod += 300; defMod += 300;
            } else if (monsterDef.monsterType === 'Fairy') {
                atkMod -= 200; defMod -= 200;
            }
        } else if (fieldId === 'wasteland') {
            if (monsterDef.monsterType === 'Dinosaur' || monsterDef.monsterType === 'Zombie' || monsterDef.monsterType === 'Rock') {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === 'mountain') {
            if (monsterDef.monsterType === 'Dragon' || monsterDef.monsterType === 'Winged Beast' || monsterDef.monsterType === 'Thunder') {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === 'sogen') {
            if (monsterDef.monsterType === 'Warrior' || monsterDef.monsterType === 'Beast-Warrior') {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === 'forest') {
            if (monsterDef.monsterType === 'Insect' || monsterDef.monsterType === 'Beast' || monsterDef.monsterType === 'Plant' || monsterDef.monsterType === 'Beast-Warrior') {
                atkMod += 200; defMod += 200;
            }
        } else if (fieldId === 'umi') {
            if (monsterDef.monsterType === 'Fish' || monsterDef.monsterType === 'Sea Serpent' || monsterDef.monsterType === 'Thunder' || monsterDef.monsterType === 'Aqua') {
                atkMod += 200; defMod += 200;
            } else if (monsterDef.monsterType === 'Machine' || monsterDef.monsterType === 'Pyro') {
                atkMod -= 200; defMod -= 200;
            }
        } else if (fieldId === 'mystic-plasma-zone') {
            if (monsterDef.attribute === 'DARK') {
                atkMod += 500; defMod -= 400;
            }
        } else if (fieldId === 'luminous-spark') {
            if (monsterDef.attribute === 'LIGHT') {
                atkMod += 500; defMod -= 400;
            }
        } else if (fieldId === 'gaia-power') {
            if (monsterDef.attribute === 'EARTH') {
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

    ['player', 'computer'].forEach(function(who) {
        var spells = GameState[who].field.spells;
        for (var i = 1; i <= 6; i++) {
            var inst = spells[i];
            if (!inst || !inst.equippedToUid) continue;
            var equipDef = cards[inst.cardId];
            if (!equipDef || equipDef.type !== 'spells' || equipDef.subType !== 'equip') continue;
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
    if (!def || def.type !== 'monsters') return 0;
    var fieldMods = getFieldMods(def);
    var equipMods = getEquipMods(instance);
    return Math.max(0, (def.atk || 0) + fieldMods.atk + equipMods.atk);
}

// Effective DEF of a monster CardInstance (base + field/equip DEF modifier, min 0)
function getMonsterDef(instance) {
    var def = cards[instance.cardId];
    if (!def || def.type !== 'monsters') return 0;
    var fieldMods = getFieldMods(def);
    var equipMods = getEquipMods(instance);
    return Math.max(0, (def.def || 0) + fieldMods.def + equipMods.def);
}

// ---------------------------------------------------------------------------
// Persistent Effect Helpers
// ---------------------------------------------------------------------------

// Does `who` have an active (face-up) copy of cardId in spell zones or field zone?
function hasActiveCard(who, cardId) {
    var spells = GameState[who].field.spells;
    for (var i = 1; i <= 6; i++) {
        if (spells[i] && spells[i].cardId === cardId && spells[i].position !== 'set') {
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
    var defenderWho = attackerWho === 'player' ? 'computer' : 'player';
    return hasActiveCard(defenderWho, 'swords-of-revealing-light');
}

// Dragon Capture Jar: while face-up, Dragons cannot be in/switch to Attack Position.
function isDragonLocked() {
    return hasActiveCard('player', 'dragon-capture-jar') || hasActiveCard('computer', 'dragon-capture-jar');
}

// ---------------------------------------------------------------------------
// Card Activation & Resolution
// ---------------------------------------------------------------------------

// Resolve a face-up spell/trap card that has just activated.
async function activateCard(who, instance, zoneNum) {
    var cardId = instance.cardId;
    var def = cards[cardId];
    if (!def) return;

    var opp = GameState.getOpponent(who);

    switch (cardId) {
        case 'pot-of-greed':
            addToFeed(def.name + ' activated: ' + formatWho(who) + ' draws 2 cards.\n');
            await getCards(who, 2);
            await destroySpellTrap(who, zoneNum, false);
            break;

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

        case 'remove-trap': {
            addToFeed(def.name + ' activated.\n');
            var allTraps = getAllFaceUpTraps();
            if (allTraps.length === 0) {
                addToFeed('No face-up trap to destroy; Remove Trap fizzles.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }

            if (who === 'player') {
                openRemoveTrapModal('player', zoneNum);
            } else {
                // AI picks opponent's face-up trap
                var aiChoice = allTraps.find(function(t) { return t.who === 'player'; }) || allTraps[0];
                var trapDef = cards[aiChoice.card.cardId];
                await destroySpellTrap(aiChoice.who, aiChoice.zone, false);
                addToFeed('Remove Trap destroyed ' + (trapDef ? trapDef.name : 'Trap') + ' on ' + aiChoice.who + '\'s field!\n');
                await destroySpellTrap(who, zoneNum, false);
            }
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
                return m.card && !m.card.faceDown;
            });
            if (faceUpOpp.length === 0) {
                addToFeed(def.name + ' fizzles — no face-up opponent monsters.\n');
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
                // Remove from hand
                var handIdx = GameState.computer.hand.findIndex(function(c) { return c.uid === discardInst.uid; });
                if (handIdx !== -1) GameState.computer.hand.splice(handIdx, 1);
                addToFeed('<em>' + def.name + '</em>: AI discards <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong>.\n');
                updateHandDisplay('computer');

                // Target highest ATK opponent monster
                var oppField = GameState.getMonstersOnField('player');
                oppField.sort(function(a, b) { return getMonsterAtk(b.card) - getMonsterAtk(a.card); });
                var aiTarget = oppField[0] || allFieldMonsters[0];
                var aiTargetWho = oppField.length > 0 ? 'player' : allFieldMonsters[0].who;
                var aiTargetDef = cards[aiTarget.card.cardId];
                addToFeed('<em>' + def.name + '</em>: <strong>' + (aiTargetDef ? aiTargetDef.name : 'monster') + '</strong> is destroyed!\n');
                if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
                await destroyMonster(aiTargetWho, aiTarget.zone);
                await destroySpellTrap(who, zoneNum, false);
            }
            break;
        }


        case 'change-of-heart': {
            var oppMonsters = GameState.getMonstersOnField(opp);
            if (oppMonsters.length === 0) {
                addToFeed(def.name + ' fizzles - no opponent monsters on the field.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (getFirstFreeZone(who) === undefined) {
                addToFeed(def.name + ' fizzles - no free monster zones.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (who === 'player') {
                openChangeOfHeartModal('player');
            } else {
                // AI: auto-pick highest ATK monster
                oppMonsters.sort(function(a, b) {
                    var defA = cards[a.card.cardId];
                    var defB = cards[b.card.cardId];
                    return (defB ? defB.atk || 0 : 0) - (defA ? defA.atk || 0 : 0);
                });
                var aiTarget = oppMonsters[0];
                await destroySpellTrap(who, zoneNum, false);
                await applyChangeOfHeart('computer', aiTarget.zone);
            }
            break;
        }

        case 'black-pendant': {
            var faceUpOwn = getFaceUpMonstersOnField(who);
            if (faceUpOwn.length === 0) {
                addToFeed('<em>' + def.name + '</em> fizzles — no face-up monster to equip.\n');
                await destroySpellTrap(who, zoneNum, false);
                break;
            }
            if (who === 'player') {
                openEquipTargetModal('player', zoneNum);
            } else {
                // AI: equip to its strongest face-up monster
                faceUpOwn.sort(function(a, b) {
                    return getMonsterAtk(b.card) - getMonsterAtk(a.card);
                });
                var aiEquipTarget = faceUpOwn[0];
                await applyEquipCard('computer', zoneNum, aiEquipTarget.zone);
            }
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
        case 'gaia-power':
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
            if (def && def.type === 'monsters') {
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
        tttdDiscardedCardId = discarded.cardId;
        var discardDef = cards[tttdDiscardedCardId];
        addToFeed('<em>Tribute to the Doomed</em>: You discard <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong>.\n');
        updateHandDisplay('player');
    }

    // Now open Step 2 — pick a monster to destroy
    openTributeToTheDoomedTarget();
}

function openTributeToTheDoomedTarget() {
    var grid = $('#tttd-target-grid');
    grid.empty();

    var allMonsters = [
        ...GameState.getMonstersOnField('player').map(function(m) { return Object.assign({}, m, { side: 'player' }); }),
        ...GameState.getMonstersOnField('computer').map(function(m) { return Object.assign({}, m, { side: 'computer' }); })
    ];

    allMonsters.forEach(function(entry) {
        var cardDef = cards[entry.card.cardId];
        if (!cardDef) return;
        var isFaceDown = entry.card.faceDown || entry.card.position === 'defense-down';
        var isOpp = entry.side === 'computer';
        var ownerLabel = isOpp ? 'OPPONENT' : 'YOUR FIELD';
        var ownerClass = isOpp ? 'tag-opponent' : 'tag-player';

        var imgSrc = isFaceDown ? 'cards/card_back.png' : 'cards/' + cardDef.file;
        var displayName = isFaceDown ? '???' : cardDef.name;
        var statsHtml = isFaceDown
            ? '<span class="rebirth-tile-stats">Face-Down</span>'
            : '<span class="rebirth-tile-stats">ATK ' + getMonsterAtk(entry.card) + ' / DEF ' + getMonsterDef(entry.card) + '</span>';

        var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="' + imgSrc + '" alt="' + displayName + '" class="rebirth-thumb-img">' +
                '<span class="target-owner-tag ' + ownerClass + '">' + ownerLabel + ' • ZONE #' + entry.zone + '</span>' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + displayName + '</h4>' +
                statsHtml +
            '</div>' +
        '</div>');

        tile.on('click', (function(side, zone) {
            return function() {
                applyTributeToTheDoomedTarget(side, zone);
            };
        })(entry.side, entry.zone));

        grid.append(tile);
    });

    $('#tttd-target-modal').fadeIn(150);
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
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

        var allMonsters = [
            ...GameState.getMonstersOnField('player').map(function(m) { return Object.assign({}, m, { side: 'player' }); }),
            ...GameState.getMonstersOnField('computer').map(function(m) { return Object.assign({}, m, { side: 'computer' }); })
        ];

        if (allMonsters.length === 0) {
            addToFeed('No monsters on the field to destroy.\n');
            return;
        }

        if (who === 'player') {
            openManEaterBugModal();
        } else {
            // AI auto-targets strongest player monster
            var playerMonsters = GameState.getMonstersOnField('player');
            if (playerMonsters.length > 0) {
                playerMonsters.sort(function(a, b) {
                    return getMonsterAtk(b.card) - getMonsterAtk(a.card);
                });
                var target = playerMonsters[0];
                var targetDef = cards[target.card.cardId];
                addToFeed('<em>Man-Eater Bug</em> destroys ' + (targetDef ? targetDef.name : 'monster') + ' on player\'s field!\n');
                if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
                await destroyMonster('player', target.zone);
            } else {
                // If no player monsters, target highest ATK monster on field
                allMonsters.sort(function(a, b) {
                    return getMonsterAtk(b.card) - getMonsterAtk(a.card);
                });
                var fallback = allMonsters[0];
                var fallbackDef = cards[fallback.card.cardId];
                addToFeed('<em>Man-Eater Bug</em> destroys ' + (fallbackDef ? fallbackDef.name : 'monster') + '!\n');
                await destroyMonster(fallback.side, fallback.zone);
            }
        }
    }
}

function openManEaterBugModal() {
    var grid = $('#man-eater-bug-grid');
    grid.empty();

    var allMonsters = [
        ...GameState.getMonstersOnField('player').map(function(m) { return Object.assign({}, m, { side: 'player' }); }),
        ...GameState.getMonstersOnField('computer').map(function(m) { return Object.assign({}, m, { side: 'computer' }); })
    ];

    if (allMonsters.length === 0) {
        $('#man-eater-bug-modal').fadeOut(120);
        return;
    }

    allMonsters.forEach(function(entry) {
        var cardDef = cards[entry.card.cardId];
        if (!cardDef) return;
        var isFaceDown = entry.card.faceDown || entry.card.position === 'defense-down';
        var isOpp = entry.side === 'computer';
        var ownerLabel = isOpp ? 'OPPONENT' : 'YOUR FIELD';
        var ownerClass = isOpp ? 'tag-opponent' : 'tag-player';

        var imgSrc = isFaceDown ? 'cards/card_back.png' : 'cards/' + cardDef.file;
        var displayName = isFaceDown ? '???' : cardDef.name;
        var statsHtml = isFaceDown
            ? '<span class="rebirth-tile-stats">Face-Down</span>'
            : '<span class="rebirth-tile-stats">ATK ' + getMonsterAtk(entry.card) + ' / DEF ' + getMonsterDef(entry.card) + '</span>';

        var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
            '<div class="rebirth-card-preview-frame">' +
                '<img src="' + imgSrc + '" alt="' + displayName + '" class="rebirth-thumb-img">' +
                '<span class="target-owner-tag ' + ownerClass + '">' + ownerLabel + ' • ZONE #' + entry.zone + '</span>' +
            '</div>' +
            '<div class="rebirth-tile-meta">' +
                '<h4 class="rebirth-tile-name">' + displayName + '</h4>' +
                statsHtml +
            '</div>' +
        '</div>');

        tile.on('click', (function(side, zone) {
            return function() {
                applyManEaterBugTarget(side, zone);
            };
        })(entry.side, entry.zone));

        grid.append(tile);
    });

    $('#man-eater-bug-modal').fadeIn(150);
}

async function applyManEaterBugTarget(targetWho, targetZone) {
    $('#man-eater-bug-modal').fadeOut(120);

    var targetInst = GameState[targetWho].field.monsters[targetZone];
    var targetDef = targetInst ? cards[targetInst.cardId] : null;
    addToFeed('<em>Man-Eater Bug</em> destroyed <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong>!\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
    await destroyMonster(targetWho, targetZone);
}

function cancelManEaterBugTarget() {
    $('#man-eater-bug-modal').fadeOut(120);
    addToFeed('Man-Eater Bug effect selection was dismissed.\n');
}

// ---------------------------------------------------------------------------
// Trap Auto-Trigger Engine
// ---------------------------------------------------------------------------

// Called after any monster is Normal Summoned.
EventBus.on('MONSTER_SUMMONED', async function(data) {
    if (typeof GameState === 'undefined' || !GameState || !data) return;

    var summonerWho = data.who;
    var opponent = GameState.getOpponent(summonerWho);
    var instance = data.instance;
    var def = cards[instance.cardId];
    if (!def || def.type !== 'monsters') return;

    // Trap Hole triggers strictly on face-up Normal Summons with ATK >= 1000 (not face-down Sets or Special Summons)
    if (!data.isSpecialSummon && instance.position !== 'defense-down' && !instance.faceDown) {
        var trapHoleZone = findSetTrapZone(opponent, 'trap-hole');
        if (trapHoleZone !== null) {
            var atk = getMonsterAtk(instance);
            if (atk >= 1000) {
                var trapDef = cards['trap-hole'];
                var trapSquare = getSpellSquareElm(opponent, trapHoleZone);
                
                // Reveal Trap Hole face-up on the field before resolving
                if (trapSquare && trapSquare.length) {
                    var trapZone = trapSquare.find('div.card-zone');
                    if (typeof trapZone.flip === 'function') {
                        try {
                            trapZone.flip({ trigger: 'manual' });
                            trapZone.flip(false);
                        } catch (e) {}
                    }
                }

                addToFeed(trapDef.name + ' activates against ' + def.name + ' (ATK ' + atk + ')!\n');
                if (typeof BattleFX !== 'undefined') {
                    BattleFX.triggerScreenShake('medium');
                }

                await sleep(getAnimDuration(400));
                await destroySpellTrap(opponent, trapHoleZone, false);
                await destroyMonster(summonerWho, data.zone);
                addToFeed('Trap Hole destroyed ' + def.name + '!\n\n');

                // The summoned monster is gone, so clear any lingering attack-target
                // highlighting that was active around the opponent's monsters.
                if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
                    BattleFX.cancelTargetSelection();
                }
            }
        }
    }

    // Dragon Capture Jar: If active and the summoned monster is a face-up Dragon in Attack Position, continuously force it into Defense Position
    var currentMonster = GameState[summonerWho].field.monsters[data.zone];
    if (currentMonster && def.monsterType === 'Dragon' && currentMonster.position === 'attack' && (typeof isDragonLocked === 'function') && isDragonLocked()) {
        var square = getSquareElm(summonerWho, data.zone);
        if (square && square.length) {
            await sleep(getAnimDuration(220));
            currentMonster.position = 'defense-up';
            currentMonster.turnPosChanged = turnCount;
            square.attr('data-card-position', 'defense-up');
            square.attr('data-turn-posChanged', turnCount);
            var zone = square.find('div.card-zone');
            
            await new Promise(function(resolve) {
                zone.transition({ rotate: '90deg' }, getAnimDuration(380), 'cubic-bezier(0.2, 0.9, 0.3, 1)', resolve);
            });

            addToFeed('Dragon Capture Jar forces <em>' + def.name + '</em> into Defense Position!\n\n');
            if (typeof updateStatModBadges === 'function') updateStatModBadges();
            if (typeof updateActionableCards === 'function') updateActionableCards();
        }
    }
});

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
    var oppMonsters = GameState.getMonstersOnField(opp);

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
        addToFeed('(Change of Heart) No free zones on ' + controllerWho + '\'s field.\n\n');
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

    updateGraveyardZones();
    updateResourceCounters();
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

// Update or create visual ATK/DEF stat modifier badges (+/- diff) for all face-up monsters
function updateStatModBadges() {
    var sides = ['player', 'computer'];
    sides.forEach(function(who) {
        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === 'defense-down' || monsterInst.faceDown) : false;

            var existingBadge = square.find('.stat-mod-badge');

            if (monsterInst && !isFaceDown) {
                var def = cards[monsterInst.cardId];
                var mods = getFieldMods(def);
                var equipMods = getEquipMods(monsterInst);
                var atkMod = mods.atk + equipMods.atk;
                var defMod = mods.def + equipMods.def;

                existingBadge.remove();

                if (atkMod !== 0 || defMod !== 0) {
                    if (atkMod === defMod) {
                        // Symmetric: single combined badge
                        var isPos = atkMod > 0;
                        var badgeClass = 'stat-mod-badge ' + (isPos ? 'stat-mod-buff' : 'stat-mod-debuff');
                        var badge = $('<div class="' + badgeClass + '">' +
                            '<span class="stat-mod-icon">' + (isPos ? '▲' : '▼') + '</span>' +
                            '<span class="stat-mod-label">' + (isPos ? '+' : '') + atkMod + '</span>' +
                        '</div>');
                        square.append(badge);
                    } else {
                        // Asymmetric: show ATK and DEF separately
                        if (atkMod !== 0) {
                            var atkIsPos = atkMod > 0;
                            var atkBadge = $('<div class="stat-mod-badge ' + (atkIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + '">' +
                                '<span class="stat-mod-icon">' + (atkIsPos ? '▲' : '▼') + '</span>' +
                                '<span class="stat-mod-label">ATK ' + (atkIsPos ? '+' : '') + atkMod + '</span>' +
                            '</div>');
                            square.append(atkBadge);
                        }
                        if (defMod !== 0) {
                            var defIsPos = defMod > 0;
                            var defBadge = $('<div class="stat-mod-badge ' + (defIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + '">' +
                                '<span class="stat-mod-icon">' + (defIsPos ? '▲' : '▼') + '</span>' +
                                '<span class="stat-mod-label">DEF ' + (defIsPos ? '+' : '') + defMod + '</span>' +
                            '</div>');
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
    $('#player-hand > .card').each(function() {
        var cardName = $(this).attr('data-card-name');
        var cardDef = cards[cardName];
        var existingBadge = $(this).find('.stat-mod-badge');

        if (cardDef && cardDef.type === 'monsters') {
            var mods = getFieldMods(cardDef);
            var atkMod = mods.atk;
            var defMod = mods.def;

            existingBadge.remove();

            if (atkMod !== 0 || defMod !== 0) {
                if (atkMod === defMod) {
                    // Symmetric: single combined preview badge
                    var isPos = atkMod > 0;
                    var modClass = (isPos ? 'stat-mod-buff' : 'stat-mod-debuff') + ' stat-mod-preview';
                    $(this).append($('<div class="stat-mod-badge ' + modClass + '">' +
                        '<span class="stat-mod-icon">' + (isPos ? '▲' : '▼') + '</span>' +
                        '<span class="stat-mod-label">' + (isPos ? '+' : '') + atkMod + '</span>' +
                    '</div>'));
                } else {
                    // Asymmetric: show ATK and DEF separately
                    if (atkMod !== 0) {
                        var atkIsPos = atkMod > 0;
                        $(this).append($('<div class="stat-mod-badge ' + (atkIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + ' stat-mod-preview">' +
                            '<span class="stat-mod-icon">' + (atkIsPos ? '▲' : '▼') + '</span>' +
                            '<span class="stat-mod-label">ATK ' + (atkIsPos ? '+' : '') + atkMod + '</span>' +
                        '</div>'));
                    }
                    if (defMod !== 0) {
                        var defIsPos = defMod > 0;
                        $(this).append($('<div class="stat-mod-badge ' + (defIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + ' stat-mod-preview">' +
                            '<span class="stat-mod-icon">' + (defIsPos ? '▲' : '▼') + '</span>' +
                            '<span class="stat-mod-label">DEF ' + (defIsPos ? '+' : '') + defMod + '</span>' +
                        '</div>'));
                    }
                }
            }
        } else if (existingBadge.length) {
            existingBadge.remove();
        }
    });

    // 3. Update DEF LOCKED badges for Dragon monsters under Dragon Capture Jar
    updateDefLockedBadges();
}

// Update or create visual "DEF LOCKED" badges for Dragon monsters affected by Dragon Capture Jar
function updateDefLockedBadges() {
    var isLocked = (typeof isDragonLocked === 'function') && isDragonLocked();

    ['player', 'computer'].forEach(function(who) {
        for (var zoneNum = 1; zoneNum <= 6; zoneNum++) {
            var square = getSquareElm(who, zoneNum);
            if (!square || !square.length) continue;

            var monsterInst = (GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters) ? GameState[who].field.monsters[zoneNum] : null;
            var isFaceDown = monsterInst ? (monsterInst.position === 'defense-down' || monsterInst.faceDown) : false;
            var existing = square.find('.def-locked-badge');

            if (monsterInst && !isFaceDown && isLocked) {
                var def = cards[monsterInst.cardId];
                if (def && def.monsterType === 'Dragon') {
                    if (!existing.length) {
                        var badge = $('<div class="def-locked-badge">' +
                            '<span class="def-locked-icon">🔒</span>' +
                            '<span class="def-locked-label">DEF LOCKED</span>' +
                        '</div>');
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
    if (typeof updateStatModBadges === 'function') updateStatModBadges();
    if (typeof updateActionableCards === 'function') updateActionableCards();
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

    var handElm = $('#player-hand > .card[data-uid="' + cardUid + '"]');
    if (!handElm.length) {
        handElm = $('#player-hand > .card[data-card-name="' + cardName + '"]').first();
    }
    
    var removed = false;
    ['monsters', 'spells', 'traps'].forEach(function(cat) {
        if (removed) return;
        var idx = player.hand[cat].indexOf(cardName);
        if (idx !== -1) {
            player.hand[cat].splice(idx, 1);
            removed = true;
        }
    });

    GameState.player.graveyard.push(new CardInstance(cardName));

    if (handElm.length) {
        handElm.fadeOut(250, function() {
            handElm.remove();
            updateResourceCounters();
            updateGraveyardZones();
        });
    } else {
        updateResourceCounters();
        updateGraveyardZones();
    }

    await sleep(300);
    openHarpieLadyTargetModal();
}

function openHarpieLadyTargetModal() {
    var grid = $('#harpie-lady-target-grid');
    grid.empty();

    var targets = [];
    ['computer', 'player'].forEach(function(side) {
        for (var z = 1; z <= 6; z++) {
            var inst = GameState[side].field.spells[z];
            if (inst) {
                targets.push({ side: side, zone: z, isField: false, inst: inst });
            }
        }
        var fieldInst = GameState[side].field.fieldZone;
        if (fieldInst) {
            targets.push({ side: side, zone: null, isField: true, inst: fieldInst });
        }
    });

    if (targets.length === 0) {
        addToFeed('No Spell or Trap cards on the field to destroy.\n');
        $('#harpie-lady-target-modal').fadeOut(120);
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
            applyHarpieLadyTarget(entry.side, entry.zone, entry.isField);
        });

        grid.append(tile);
    });

    $('#harpie-lady-target-modal').fadeIn(150);
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
    if (typeof updateStatModBadges === 'function') updateStatModBadges();
    if (typeof updateActionableCards === 'function') updateActionableCards();
    updateResourceCounters();
}


