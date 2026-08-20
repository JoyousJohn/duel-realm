/**
 * Card Effects Engine: spell / trap / field spell resolution,
 * stat modifiers, trap auto-triggers, and persistent effects.
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
        if (who === 'computer') {
            return new Promise(function(resolve) {
                var chosen = null;
                if (typeof config.aiPick === 'function') {
                    chosen = config.aiPick(candidates);
                }
                if (!chosen) chosen = candidates[0];
                setTimeout(function() {
                    resolve(chosen);
                }, (typeof getAnimDuration === 'function') ? getAnimDuration(300) : 300);
            });
        }

        // Player UI Resolution
        return new Promise(function(resolve) {
            self._activeResolver = resolve;

            // Update modal headers & badges
            $('#tactical-target-title').text(config.title || 'SELECT TARGET');
            $('#tactical-target-subtitle').text(config.subtitle || 'CHOOSE A VALID TARGET CARD');
            
            var badgeCat = (config.badge && config.badge.category) ? config.badge.category : 'TARGET SELECTION';
            var badgeColor = (config.badge && config.badge.color) ? config.badge.color : '#0ea5e9';
            var glowColor = (config.badge && config.badge.glowColor) ? config.badge.glowColor : 'rgba(14, 165, 233, 0.45)';

            $('#tactical-target-category').text(badgeCat).css('color', badgeColor);
            $('#tactical-target-dot').css({ background: badgeColor, 'box-shadow': '0 0 8px ' + badgeColor });
            $('#tactical-target-glow').css('background', 'radial-gradient(circle, ' + glowColor + ' 0%, transparent 70%)');

            var grid = $('#tactical-target-grid');
            grid.empty();

            candidates.forEach(function(entry) {
                var cardDef = entry.def || (entry.inst ? cards[entry.inst.cardId] : (entry.cardId ? cards[entry.cardId] : null));
                var isFaceDown = entry.inst ? (entry.inst.faceDown || entry.inst.position === 'defense-down' || entry.inst.position === 'set') : false;
                var isOpp = entry.side === 'computer';
                var ownerLabel = entry.customOwnerLabel || (isOpp ? 'OPPONENT' : 'YOUR FIELD');
                var ownerClass = entry.customOwnerClass || (isOpp ? 'tag-opponent' : 'tag-player');
                var zoneLabel = entry.zoneLabel || (entry.isField ? 'FIELD ZONE' : (entry.zone !== undefined ? 'ZONE #' + entry.zone : ''));

                var imgSrc = (isFaceDown && isOpp) ? 'cards/card_back.png' : 'cards/' + (cardDef ? cardDef.file : 'card_back.png');
                var displayName = (isFaceDown && isOpp) ? 'Face-Down Card' : (cardDef ? cardDef.name : (entry.name || 'Card'));
                
                var statsHtml = '';
                if (entry.statsHtml) {
                    statsHtml = entry.statsHtml;
                } else if (isFaceDown && isOpp) {
                    statsHtml = '<span class="rebirth-tile-stats">Set (Hidden)</span>';
                } else if (cardDef && cardDef.type === 'monsters') {
                    var curAtk = entry.inst ? (typeof getMonsterAtk === 'function' ? getMonsterAtk(entry.inst) : cardDef.atk) : (cardDef.atk || 0);
                    var curDef = entry.inst ? (typeof getMonsterDef === 'function' ? getMonsterDef(entry.inst) : cardDef.def) : (cardDef.def || 0);
                    statsHtml = '<span class="rebirth-tile-stats">ATK ' + curAtk + ' / DEF ' + curDef + '</span>';
                } else if (cardDef) {
                    statsHtml = '<span class="rebirth-tile-stats">' + (cardDef.subType || cardDef.type || 'Spell/Trap').toUpperCase() + '</span>';
                }

                var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                    '<div class="rebirth-card-preview-frame">' +
                        '<img src="' + imgSrc + '" alt="' + displayName + '" class="rebirth-thumb-img">' +
                        '<span class="target-owner-tag ' + ownerClass + '">' + ownerLabel + (zoneLabel ? ' • ' + zoneLabel : '') + '</span>' +
                    '</div>' +
                    '<div class="rebirth-tile-meta">' +
                        '<h4 class="rebirth-tile-name">' + displayName + '</h4>' +
                        statsHtml +
                    '</div>' +
                '</div>');

                tile.on('click', function() {
                    self._resolveTarget(entry);
                });

                grid.append(tile);
            });

            $('#tactical-target-modal').fadeIn(150);
        });
    },

    _resolveTarget: function(target) {
        $('#tactical-target-modal').fadeOut(120);
        if (this._activeResolver) {
            var res = this._activeResolver;
            this._activeResolver = null;
            res(target);
        }
    },

    cancelTarget: function() {
        this._resolveTarget(null);
        if (typeof resetActiveCardClass === 'function') resetActiveCardClass();
        if (typeof hideAtkMenuIfVisible === 'function') hideAtkMenuIfVisible();
    }
};

// ---------------------------------------------------------------------------
// Card Reactive Triggers Engine (EventBus Subscriptions)
// ---------------------------------------------------------------------------
function initCardTriggers() {
    if (typeof EventBus === 'undefined') return;

    EventBus.on('CARD_SENT_TO_GRAVE', async function(data) {
        if (data.suppressGraveEffect) return;
        var cardInst = data.cardInst;
        if (!cardInst) return;
        if (cardInst.cardId === 'abyssal-scout' && data.fromField) {
            await triggerAbyssalScoutSearch(data.who);
        }
        var cardDef = cards[cardInst.cardId];
        if (cardDef && typeof cardDef.onSentToGraveyard === 'function') {
            await cardDef.onSentToGraveyard(data);
        }
    });

    EventBus.on('DAMAGE_STEP_END', async function(data) {
        if (data.attackerInst) {
            var attDef = cards[data.attackerInst.cardId];
            if (attDef && typeof attDef.onDamageStepEnd === 'function') {
                await attDef.onDamageStepEnd(Object.assign({ role: 'attacker' }, data));
            }
        }
        if (data.defenderInst) {
            var defDef = cards[data.defenderInst.cardId];
            if (defDef && typeof defDef.onDamageStepEnd === 'function') {
                await defDef.onDamageStepEnd(Object.assign({ role: 'defender' }, data));
            }
        }
    });

    EventBus.on('BATTLE_DESTROYED', async function(data) {
        if (data.destroyedInst) {
            var cardDef = cards[data.destroyedInst.cardId];
            if (cardDef && typeof cardDef.onBattleDestroyed === 'function') {
                await cardDef.onBattleDestroyed(data);
            }
        }
    });
}

$(document).ready(function() {
    initCardTriggers();
});

// ---------------------------------------------------------------------------
// Field Spell Stat Modifiers
// ---------------------------------------------------------------------------

// Return { atk, def } stat modifiers for a monster card definition based on
// active field spells on BOTH sides (or projected override for player field).
// Separate ATK and DEF to support asymmetric field spells (e.g. Mystic Plasma Zone: +500 ATK / -400 DEF).
function getFieldMods(monsterDef, overridePlayerFieldId) {
    if (!monsterDef || monsterDef.type !== 'monsters') return { atk: 0, def: 0 };

    var atkMod = 0;
    var defMod = 0;
    var bothSides = ['player', 'computer'];

    for (var s = 0; s < bothSides.length; s++) {
        var who = bothSides[s];
        var fieldId = null;
        if (who === 'player' && overridePlayerFieldId !== undefined) {
            fieldId = overridePlayerFieldId;
        } else {
            var fieldInst = (typeof GameState !== 'undefined' && GameState && GameState[who] && GameState[who].field) ? GameState[who].field.fieldZone : null;
            if (fieldInst) fieldId = fieldInst.cardId;
        }
        if (!fieldId) continue;

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
    var selfMod = 0;

    if (instance.cardId === 'infernal-incinerator' && typeof GameState !== 'undefined' && GameState) {
        if (!instance.faceDown && instance.position !== 'defense-down') {
            var controller = null;
            ['player', 'computer'].forEach(function(who) {
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

    return Math.max(0, (def.atk || 0) + fieldMods.atk + equipMods.atk + selfMod);
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

// Mausoleum of Offerings: while face-up in either Field Zone, turn player can pay 1000 LP per required tribute
function isMausoleumActive() {
    var pField = GameState && GameState.player && GameState.player.field ? GameState.player.field.fieldZone : null;
    var cField = GameState && GameState.computer && GameState.computer.field ? GameState.computer.field.fieldZone : null;
    return (pField && pField.cardId === 'mausoleum-of-offerings' && pField.position !== 'set') ||
           (cField && cField.cardId === 'mausoleum-of-offerings' && cField.position !== 'set');
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

        case 'crypt-awakening': {
            addToFeed(def.name + ' activated: resurrecting a monster from the Graveyard in Attack Position!\n');
            var trapInst = GameState[who].field.spells[zoneNum];
            if (trapInst) {
                trapInst.position = 'active';
                trapInst.faceDown = false;
            }
            if (who === 'player') {
                await promptPlayerCryptAwakening(zoneNum);
            } else {
                var gyMonsters = GameState.computer.graveyard.filter(function(c) {
                    var d = cards[c.cardId];
                    return d && d.type === 'monsters';
                });
                if (gyMonsters.length > 0 && getFirstFreeZone('computer') !== undefined) {
                    gyMonsters.sort(function(a, b) {
                        var dA = cards[a.cardId]; var dB = cards[b.cardId];
                        return (dB.atk || 0) - (dA.atk || 0);
                    });
                    var bestMon = gyMonsters[0];
                    var gIdx = GameState.computer.graveyard.findIndex(function(c) { return c.uid === bestMon.uid; });
                    if (gIdx !== -1) GameState.computer.graveyard.splice(gIdx, 1);
                    
                    var freeZ = getFirstFreeZone('computer');
                    await specialSummonMonster('computer', bestMon.cardId, 'computer', 'attack');
                    var summonedInst = GameState.computer.field.monsters[freeZ];
                    if (summonedInst && trapInst) {
                        trapInst.boundMonsterUid = summonedInst.uid;
                        summonedInst.boundTrapUid = trapInst.uid;
                    }
                    updateGraveyardZones();
                } else {
                    addToFeed('No valid monster in Graveyard to revive; Crypt Awakening remains on field.\n');
                }
            }
            break;
        }

        case 'lunar-grimoire': {
            addToFeed(def.name + ' activated: changing a face-up monster to face-down Defense Position.\n');
            var faceUpMonsters = [];
            ['player', 'computer'].forEach(function(side) {
                for (var z = 1; z <= 6; z++) {
                    var m = GameState[side].field.monsters[z];
                    if (m && !m.faceDown && m.position !== 'defense-down') {
                        faceUpMonsters.push({ side: side, zone: z, card: m });
                    }
                }
            });

            if (faceUpMonsters.length === 0) {
                addToFeed('No face-up monsters on the field; Lunar Grimoire resolves with no effect.\n');
            } else if (who === 'player') {
                await promptPlayerLunarGrimoireTarget(faceUpMonsters);
            } else {
                var playerTargets = faceUpMonsters.filter(function(t) { return t.side === 'player'; });
                if (playerTargets.length > 0) {
                    playerTargets.sort(function(a, b) {
                        return (getMonsterAtk(b.card) || 0) - (getMonsterAtk(a.card) || 0);
                    });
                    await applyLunarGrimoireFlip(playerTargets[0].side, playerTargets[0].zone);
                } else {
                    await applyLunarGrimoireFlip(faceUpMonsters[0].side, faceUpMonsters[0].zone);
                }
            }
            await destroySpellTrap(who, zoneNum, false);
            break;
        }

        case 'astral-phantoms': {
            addToFeed(def.name + ' activated: summoning Phantom Tokens in Defense Position!\n');
            var summonedCount = 0;
            for (var k = 0; k < 3; k++) {
                var freeZ = getFirstFreeZone(who);
                if (freeZ === undefined) break;
                await specialSummonMonster(who, 'phantom-token', who, 'defense-up');
                var tokenInst = GameState[who].field.monsters[freeZ];
                if (tokenInst) {
                    tokenInst.cannotBeTributed = true;
                    tokenInst.isToken = true;
                }
                summonedCount++;
            }
            addToFeed('Special Summoned ' + summonedCount + ' Phantom Token(s) to ' + formatWho(who) + '\'s field.\n\n');
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
                if (GameState[side].field.fieldZone) {
                    allST.push({ side: side, zone: null, isField: true });
                }
            });

            for (var i = 0; i < allST.length; i++) {
                await destroySpellTrap(allST[i].side, allST[i].zone, allST[i].isField, false);
            }

            await destroySpellTrap(who, zoneNum, false);
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

        case 'smashing-ground': {
            var faceUpOpp = GameState.getMonstersOnField(opp).filter(function(m) {
                return m.card && !m.card.faceDown;
            });
            if (faceUpOpp.length === 0) {
                addToFeed(def.name + ' fizzles — no face-up opponent monsters.\n');
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

        case 'black-pendant':
        case 'horn-of-the-unicorn': {
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
    } else if (monsterInst.cardId === 'hane-hane') {
        addToFeed('<em>' + def.name + '</em> FLIP EFFECT activated!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

        var allMonsters = [
            ...GameState.getMonstersOnField('player').map(function(m) { return Object.assign({}, m, { side: 'player' }); }),
            ...GameState.getMonstersOnField('computer').map(function(m) { return Object.assign({}, m, { side: 'computer' }); })
        ];

        if (allMonsters.length === 0) {
            addToFeed('No monsters on the field to return to hand.\n');
            return;
        }

        if (who === 'player') {
            openHaneHaneModal();
        } else {
            // AI auto-targets strongest player monster to bounce
            var playerMonsters = GameState.getMonstersOnField('player');
            if (playerMonsters.length > 0) {
                playerMonsters.sort(function(a, b) {
                    return getMonsterAtk(b.card) - getMonsterAtk(a.card);
                });
                var target = playerMonsters[0];
                var targetDef = cards[target.card.cardId];
                addToFeed('<em>Hane-Hane</em> returns ' + (targetDef ? targetDef.name : 'monster') + ' on player\'s field to hand!\n');
                if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
                await returnMonsterToHand('player', target.zone);
            } else {
                // If no player monsters, target highest ATK monster on field
                allMonsters.sort(function(a, b) {
                    return getMonsterAtk(b.card) - getMonsterAtk(a.card);
                });
                var fallback = allMonsters[0];
                var fallbackDef = cards[fallback.card.cardId];
                addToFeed('<em>Hane-Hane</em> returns ' + (fallbackDef ? fallbackDef.name : 'monster') + ' to hand!\n');
                await returnMonsterToHand(fallback.side, fallback.zone);
            }
        }
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

            if (typeof updateActionableCards === 'function') updateActionableCards();
            if (typeof updateStatModBadges === 'function') updateStatModBadges();
        }
    } else if (monsterInst.cardId === 'spear-cretin') {
        monsterInst.spearCretinPrimed = true;
        addToFeed('<em>' + def.name + '</em> FLIP EFFECT primed: When this card is sent to the Graveyard, both players can Special Summon 1 monster from their respective Graveyards!\n\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');
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

function openHaneHaneModal() {
    var grid = $('#hane-hane-grid');
    grid.empty();

    var allMonsters = [
        ...GameState.getMonstersOnField('player').map(function(m) { return Object.assign({}, m, { side: 'player' }); }),
        ...GameState.getMonstersOnField('computer').map(function(m) { return Object.assign({}, m, { side: 'computer' }); })
    ];

    if (allMonsters.length === 0) {
        $('#hane-hane-modal').fadeOut(120);
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
                applyHaneHaneTarget(side, zone);
            };
        })(entry.side, entry.zone));

        grid.append(tile);
    });

    $('#hane-hane-modal').fadeIn(150);
}

async function applyHaneHaneTarget(targetWho, targetZone) {
    $('#hane-hane-modal').fadeOut(120);

    var targetInst = GameState[targetWho].field.monsters[targetZone];
    var targetDef = targetInst ? cards[targetInst.cardId] : null;
    addToFeed('<em>Hane-Hane</em> returned <strong>' + (targetDef ? targetDef.name : 'monster') + '</strong> to hand!\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
    await returnMonsterToHand(targetWho, targetZone);
}

function cancelHaneHaneTarget() {
    $('#hane-hane-modal').fadeOut(120);
    addToFeed('Hane-Hane effect selection was dismissed.\n');
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

    // Torrential Tribute response window
    // Triggers when any monster is Summoned face-up (Normal, Tribute, Special, or Flip Summon)
    if (instance.position !== 'defense-down' && !instance.faceDown) {
        // 1. Check Player's Torrential Tribute
        var playerTTZone = findSetTrapZone('player', 'torrential-tribute');
        if (playerTTZone !== null) {
            var activatedByPlayer = await promptPlayerTorrentialTribute(playerTTZone, def);
            if (activatedByPlayer) {
                await executeTorrentialTribute('player', playerTTZone);
                return;
            }
        }

        // 2. Check Computer's Torrential Tribute
        var compTTZone = findSetTrapZone('computer', 'torrential-tribute');
        if (compTTZone !== null) {
            var compMonsters = GameState.getMonstersOnField('computer');
            var playerMonsters = GameState.getMonstersOnField('player');
            
            var compTotalAtk = compMonsters.reduce(function(sum, m) { return sum + getMonsterAtk(m.card); }, 0);
            var playerTotalAtk = playerMonsters.reduce(function(sum, m) { return sum + getMonsterAtk(m.card); }, 0);
            
            // AI triggers if player controls more monsters, higher total ATK, multiple threats, or summoned a high ATK monster
            var shouldTrigger = (playerMonsters.length > compMonsters.length) || 
                                (playerTotalAtk >= compTotalAtk && playerMonsters.length > 0) ||
                                (playerMonsters.length >= 2) ||
                                (summonerWho === 'player' && getMonsterAtk(instance) >= 1500 && compMonsters.length <= 1);
            
            if (shouldTrigger) {
                await sleep(getAnimDuration(300));
                await executeTorrentialTribute('computer', compTTZone);
                return;
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

// ---------------------------------------------------------------------------
// Torrential Tribute Prompt & Execution
// ---------------------------------------------------------------------------

var torrentialTributeResolver = null;

function promptPlayerTorrentialTribute(zoneNum, summonedDef) {
    return new Promise(function(resolve) {
        torrentialTributeResolver = resolve;

        var playerMonstersCount = GameState.getMonstersOnField('player').length;
        var compMonstersCount = GameState.getMonstersOnField('computer').length;

        $('#tt-trigger-cause').text((summonedDef ? summonedDef.name.toUpperCase() : 'A MONSTER') + ' WAS SUMMONED');
        $('#tt-modal-casualty-preview').html(
            '<strong>Predicted Casualties:</strong> ' +
            '<span style="color: #93c5fd; margin-right: 8px;">Your Monsters: ' + playerMonstersCount + '</span> • ' +
            '<span style="color: #f87171; margin-left: 8px;">Opponent Monsters: ' + compMonstersCount + '</span>'
        );

        $('#torrential-tribute-modal').fadeIn(150);
    });
}

function resolveTorrentialTributePrompt(shouldActivate) {
    $('#torrential-tribute-modal').fadeOut(120);
    if (typeof torrentialTributeResolver === 'function') {
        var res = torrentialTributeResolver;
        torrentialTributeResolver = null;
        res(shouldActivate);
    }
}

async function executeTorrentialTribute(who, zoneNum) {
    var trapSquare = getSpellSquareElm(who, zoneNum);

    // Reveal Trap card face-up
    if (trapSquare && trapSquare.length) {
        var trapZone = trapSquare.find('div.card-zone');
        if (typeof trapZone.flip === 'function') {
            try {
                trapZone.flip({ trigger: 'manual' });
                trapZone.flip(false);
            } catch (e) {}
        }
    }

    addToFeed('<strong>' + (who === 'player' ? 'Player' : 'Computer') + '</strong> activates Trap Card: <strong>Torrential Tribute</strong>!\n');
    addToFeed('🌊 A massive tidal wave sweeps over the arena, engulfing all monsters in a devastating flood!\n');

    if (typeof BattleFX !== 'undefined') {
        BattleFX.triggerScreenShake('heavy');
    }

    await sleep(getAnimDuration(450));

    // Destroy the trap itself
    await destroySpellTrap(who, zoneNum, false);

    // Collect all monsters currently on both fields
    var victims = [];
    ['player', 'computer'].forEach(function(side) {
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
        addToFeed('<em>Torrential Tribute</em> destroyed all ' + victims.length + ' monster(s) on the field!\n\n');
    } else {
        addToFeed('No monsters remained on the field to be destroyed.\n\n');
    }

    // Cancel any ongoing battle highlights
    if (typeof BattleFX !== 'undefined' && typeof BattleFX.cancelTargetSelection === 'function') {
        BattleFX.cancelTargetSelection();
    }
    if (typeof updateActionableCards === 'function') updateActionableCards();
    if (typeof updateStatModBadges === 'function') updateStatModBadges();
}

// ---------------------------------------------------------------------------
// Arcane Disruptor Counter Trap Handlers
// ---------------------------------------------------------------------------

var arcaneDisruptorPromptResolver = null;
var arcaneDisruptorDiscardResolver = null;

function promptPlayerArcaneDisruptor(zoneNum, spellDef) {
    return new Promise(function(resolve) {
        arcaneDisruptorPromptResolver = resolve;

        var spellName = spellDef ? spellDef.name : 'Spell Card';
        var spellEffect = (spellDef && spellDef.desc) ? spellDef.desc : 'No description available.';
        var spellTypeLabel = (spellDef && spellDef.subType) ? spellDef.subType.toUpperCase() + ' SPELL' : 'SPELL CARD';

        $('#ad-trigger-cause').text(spellName.toUpperCase() + ' WAS ACTIVATED!');
        $('#ad-prompt-description').html(
            'Opponent activated <strong>' + spellName + '</strong>.<br>' +
            'Activate your face-down <span style="color: #f472b6; font-weight: bold;">Arcane Disruptor</span> to negate it and remove it from play? (Requires 1 discard)'
        );

        $('#ad-spell-header').text('ACTIVATED ' + spellTypeLabel + ': ' + spellName.toUpperCase());
        $('#ad-spell-effect-text').text('"' + spellEffect + '"');

        $('#arcane-disruptor-prompt-modal').fadeIn(150);
    });
}

function resolveArcaneDisruptorPrompt(shouldActivate) {
    $('#arcane-disruptor-prompt-modal').fadeOut(120);
    if (typeof arcaneDisruptorPromptResolver === 'function') {
        var res = arcaneDisruptorPromptResolver;
        arcaneDisruptorPromptResolver = null;
        res(shouldActivate);
    }
}

function promptPlayerArcaneDisruptorDiscard() {
    return new Promise(function(resolve) {
        arcaneDisruptorDiscardResolver = resolve;
        var grid = $('#arcane-disruptor-discard-grid');
        grid.empty();

        var hand = GameState.player.hand;
        if (!hand || hand.length === 0) {
            resolve(null);
            return;
        }

        hand.forEach(function(inst) {
            var cardDef = cards[inst.cardId];
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
                $('#arcane-disruptor-discard-modal').fadeOut(120);
                if (typeof arcaneDisruptorDiscardResolver === 'function') {
                    var r = arcaneDisruptorDiscardResolver;
                    arcaneDisruptorDiscardResolver = null;
                    r({ uid: inst.uid, cardId: inst.cardId });
                }
            });

            grid.append(tile);
        });

        $('#arcane-disruptor-discard-modal').fadeIn(150);
    });
}

function cancelArcaneDisruptorDiscard() {
    $('#arcane-disruptor-discard-modal').fadeOut(120);
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
            if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateSpellToGraveyard === 'function') {
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
                if (typeof updateStatModBadges === 'function') updateStatModBadges();
            }
            delete GameState[who].field.spells[zoneNum];
            var square = getSpellSquareElm(who, zoneNum);
            if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateSpellToGraveyard === 'function') {
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

async function checkArcaneDisruptorResponse(who, instance, zoneNum, spellDef) {
    var opp = GameState.getOpponent(who);
    var trapZone = findSetTrapZone(opp, 'arcane-disruptor');
    if (trapZone === null) return false;

    // Check if opponent has any cards in hand to discard
    if (!GameState[opp].hand || GameState[opp].hand.length === 0) return false;

    if (opp === 'player') {
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
        updateHandDisplay('player');
        updateGraveyardZones();

        // Reveal & destroy Arcane Disruptor
        var trapSquare = getSpellSquareElm('player', trapZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find('div.card-zone');
            if (typeof trapZoneElm.flip === 'function') {
                try {
                    trapZoneElm.flip({ trigger: 'manual' });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed('Player activates Counter Trap: <strong>Arcane Disruptor</strong>!\n');
        addToFeed('⚡ Arcane Disruptor radiates an intense pulse, discarding <strong>' + (dDef ? dDef.name : 'a card') + '</strong> to negate <em>' + spellDef.name + '</em>!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
        await sleep(getAnimDuration(400));

        await destroySpellTrap('player', trapZone, false);

        // Banish the opponent's activated Spell Card
        await banishSpellTrapCard(who, zoneNum, spellDef.subType === 'field');
        addToFeed('<em>' + spellDef.name + '</em> was negated and removed from play!\n\n');
        return true;
    } else {
        // AI Decision
        var handCards = GameState.computer.hand.slice();
        if (handCards.length === 0) return false;

        var highThreatSpells = ['raigeki', 'dark-hole', 'change-of-heart', 'pot-of-greed', 'monster-reborn', 'heavy-storm', 'fissure', 'tribute-to-the-doomed'];
        var shouldAIActivate = (highThreatSpells.indexOf(spellDef.id) !== -1) || (handCards.length >= 2);

        if (!shouldAIActivate) return false;

        handCards.sort(function(a, b) {
            var dA = cards[a.cardId]; var dB = cards[b.cardId];
            var atkA = (dA && dA.type === 'monsters') ? (dA.atk || 0) : -1;
            var atkB = (dB && dB.type === 'monsters') ? (dB.atk || 0) : -1;
            return atkA - atkB;
        });
        var aiDiscard = handCards[0];
        var aiDiscardDef = cards[aiDiscard.cardId];

        var handIdx = GameState.computer.hand.findIndex(function(c) { return c.uid === aiDiscard.uid; });
        if (handIdx !== -1) {
            var discarded = GameState.computer.hand.splice(handIdx, 1)[0];
            GameState.computer.graveyard.push(discarded);
        }
        updateHandDisplay('computer');
        updateGraveyardZones();

        var trapSquare = getSpellSquareElm('computer', trapZone);
        if (trapSquare && trapSquare.length) {
            var trapZoneElm = trapSquare.find('div.card-zone');
            if (typeof trapZoneElm.flip === 'function') {
                try {
                    trapZoneElm.flip({ trigger: 'manual' });
                    trapZoneElm.flip(false);
                } catch (e) {}
            }
        }

        addToFeed('Computer activates Counter Trap: <strong>Arcane Disruptor</strong>!\n');
        addToFeed('⚡ Computer discards <strong>' + (aiDiscardDef ? aiDiscardDef.name : 'a card') + '</strong> to negate your <em>' + spellDef.name + '</em>!\n');
        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('medium');
        await sleep(getAnimDuration(400));

        await destroySpellTrap('computer', trapZone, false);

        await banishSpellTrapCard(who, zoneNum, spellDef.subType === 'field');
        addToFeed('Your <em>' + spellDef.name + '</em> was negated and removed from play!\n\n');
        return true;
    }
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
        addCardToHand('player', chosenCardId, instance.uid, true);
        var chosenDef = cards[chosenCardId];
        updateHandDisplay('player');
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
        addCardToHand('computer', aiChoice.cardId, instance.uid, true);
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
        $('#celestial-tithe-counter').text('SELECT 2 CARDS FROM YOUR HAND TO SEND TO GRAVEYARD (0/2)');
        $('#celestial-tithe-confirm-btn').hide();

        var grid = $('#celestial-tithe-grid');
        grid.empty();

        var hand = GameState.player.hand;
        if (!hand || hand.length <= 2) {
            var discardedUids = (hand || []).map(function(c) { return c.uid; });
            applyCelestialTitheDiscards(discardedUids);
            resolve();
            return;
        }

        hand.forEach(function(inst) {
            var cardDef = cards[inst.cardId];
            if (!cardDef) return;

            var typeBadge = cardDef.type === 'monsters'
                ? 'LVL ' + (cardDef.level || 1) + ' • ATK ' + (cardDef.atk || 0) + ' / DEF ' + (cardDef.def || 0)
                : (cardDef.subType ? cardDef.subType.toUpperCase() + ' ' : '') + cardDef.type.slice(0, -1).toUpperCase();

            var tile = $('<div class="rebirth-card-tile target-trap-tile" data-uid="' + inst.uid + '" style="cursor: pointer;">' +
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
                var uid = inst.uid;
                var idx = celestialTitheSelectedUids.indexOf(uid);
                if (idx !== -1) {
                    celestialTitheSelectedUids.splice(idx, 1);
                    tile.removeClass('selected-tribute-tile');
                } else {
                    if (celestialTitheSelectedUids.length < 2) {
                        celestialTitheSelectedUids.push(uid);
                        tile.addClass('selected-tribute-tile');
                    }
                }

                var count = celestialTitheSelectedUids.length;
                $('#celestial-tithe-counter').text('SELECT 2 CARDS FROM YOUR HAND TO SEND TO GRAVEYARD (' + count + '/2)');
                if (count === 2) {
                    $('#celestial-tithe-confirm-btn').show();
                } else {
                    $('#celestial-tithe-confirm-btn').hide();
                }
            });

            grid.append(tile);
        });

        $('#celestial-tithe-modal').fadeIn(150);
    });
}

function confirmCelestialTitheDiscards() {
    if (celestialTitheSelectedUids.length !== 2) return;
    $('#celestial-tithe-modal').fadeOut(120);
    applyCelestialTitheDiscards(celestialTitheSelectedUids);
    if (typeof celestialTitheResolver === 'function') {
        var r = celestialTitheResolver;
        celestialTitheResolver = null;
        r();
    }
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

function promptPlayerCryptAwakening(zoneNum) {
    return new Promise(function(resolve) {
        cryptAwakeningResolver = resolve;
        pendingCryptAwakeningTrapZone = zoneNum;

        var grid = $('#crypt-awakening-grid');
        grid.empty();

        var gyMonsters = GameState.player.graveyard.filter(function(inst) {
            var def = cards[inst.cardId];
            return def && def.type === 'monsters';
        });

        if (gyMonsters.length === 0 || getFirstFreeZone('player') === undefined) {
            addToFeed('No valid monster in Graveyard or no free zone for Crypt Awakening.\n');
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
                
                var gIdx = GameState.player.graveyard.findIndex(function(c) { return c.uid === inst.uid; });
                if (gIdx !== -1) GameState.player.graveyard.splice(gIdx, 1);

                var freeZ = getFirstFreeZone('player');
                await specialSummonMonster('player', inst.cardId, 'player', 'attack');
                var summonedInst = GameState.player.field.monsters[freeZ];
                var trapInst = GameState.player.field.spells[pendingCryptAwakeningTrapZone];
                if (summonedInst && trapInst) {
                    trapInst.boundMonsterUid = summonedInst.uid;
                    summonedInst.boundTrapUid = trapInst.uid;
                }
                updateGraveyardZones();
                updateResourceCounters();

                addToFeed('Crypt Awakening resurrected <strong>' + cardDef.name + '</strong> in Attack Position!\n\n');

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
    }

    if (typeof updateStatModBadges === 'function') updateStatModBadges();
    addToFeed('<em>Lunar Grimoire</em> changed ' + formatWho(side) + '\'s <strong>' + (mDef ? mDef.name : 'monster') + '</strong> to face-down Defense Position!\n\n');
}

// ---------------------------------------------------------------------------
// Prism of Retribution Attack Response Handlers
// ---------------------------------------------------------------------------
var prismOfRetributionResolver = null;

async function checkPrismOfRetributionResponse(attackerWho, attackerZone, defenderWho, attackerAtk, attackerDef) {
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

// Update or create visual ATK/DEF stat modifier badges (+/- diff) for all face-up monsters.
// Accepts optional previewFieldSpellId to render projected stat preview badges when a field spell is selected in hand.
function updateStatModBadges(previewFieldSpellId) {
    var isPreviewMode = (typeof previewFieldSpellId === 'string' && previewFieldSpellId.length > 0);
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
                var mods = isPreviewMode ? getFieldMods(def, previewFieldSpellId) : getFieldMods(def);
                var equipMods = getEquipMods(monsterInst);
                var atkMod = mods.atk + equipMods.atk;
                var defMod = mods.def + equipMods.def;

                existingBadge.remove();

                if (atkMod !== 0 || defMod !== 0) {
                    var previewExtraClass = isPreviewMode ? ' stat-mod-field-preview' : '';

                    if (atkMod === defMod) {
                        // Symmetric: single combined badge
                        var isPos = atkMod > 0;
                        var badgeClass = 'stat-mod-badge ' + (isPos ? 'stat-mod-buff' : 'stat-mod-debuff') + previewExtraClass;
                        var icon = isPreviewMode ? '⚡' : (isPos ? '▲' : '▼');
                        var badge = $('<div class="' + badgeClass + '">' +
                            '<span class="stat-mod-icon">' + icon + '</span>' +
                            '<span class="stat-mod-label">' + (isPos ? '+' : '') + atkMod + '</span>' +
                        '</div>');
                        square.append(badge);
                    } else {
                        // Asymmetric: show ATK and DEF separately
                        if (atkMod !== 0) {
                            var atkIsPos = atkMod > 0;
                            var atkIcon = isPreviewMode ? '⚡' : (atkIsPos ? '▲' : '▼');
                            var atkBadge = $('<div class="stat-mod-badge ' + (atkIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + previewExtraClass + '">' +
                                '<span class="stat-mod-icon">' + atkIcon + '</span>' +
                                '<span class="stat-mod-label">ATK ' + (atkIsPos ? '+' : '') + atkMod + '</span>' +
                            '</div>');
                            square.append(atkBadge);
                        }
                        if (defMod !== 0) {
                            var defIsPos = defMod > 0;
                            var defIcon = isPreviewMode ? '⚡' : (defIsPos ? '▲' : '▼');
                            var defBadge = $('<div class="stat-mod-badge ' + (defIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + previewExtraClass + '">' +
                                '<span class="stat-mod-icon">' + defIcon + '</span>' +
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
            var mods = isPreviewMode ? getFieldMods(cardDef, previewFieldSpellId) : getFieldMods(cardDef);
            var atkMod = mods.atk;
            var defMod = mods.def;

            existingBadge.remove();

            if (atkMod !== 0 || defMod !== 0) {
                var previewExtraClass = isPreviewMode ? ' stat-mod-field-preview' : '';
                if (atkMod === defMod) {
                    // Symmetric: single combined preview badge
                    var isPos = atkMod > 0;
                    var modClass = (isPos ? 'stat-mod-buff' : 'stat-mod-debuff') + ' stat-mod-preview' + previewExtraClass;
                    var icon = isPreviewMode ? '⚡' : (isPos ? '▲' : '▼');
                    $(this).append($('<div class="stat-mod-badge ' + modClass + '">' +
                        '<span class="stat-mod-icon">' + icon + '</span>' +
                        '<span class="stat-mod-label">' + (isPos ? '+' : '') + atkMod + '</span>' +
                    '</div>'));
                } else {
                    // Asymmetric: show ATK and DEF separately
                    if (atkMod !== 0) {
                        var atkIsPos = atkMod > 0;
                        var atkIcon = isPreviewMode ? '⚡' : (atkIsPos ? '▲' : '▼');
                        $(this).append($('<div class="stat-mod-badge ' + (atkIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + ' stat-mod-preview' + previewExtraClass + '">' +
                            '<span class="stat-mod-icon">' + atkIcon + '</span>' +
                            '<span class="stat-mod-label">ATK ' + (atkIsPos ? '+' : '') + atkMod + '</span>' +
                        '</div>'));
                    }
                    if (defMod !== 0) {
                        var defIsPos = defMod > 0;
                        var defIcon = isPreviewMode ? '⚡' : (defIsPos ? '▲' : '▼');
                        $(this).append($('<div class="stat-mod-badge ' + (defIsPos ? 'stat-mod-buff' : 'stat-mod-debuff') + ' stat-mod-preview' + previewExtraClass + '">' +
                            '<span class="stat-mod-icon">' + defIcon + '</span>' +
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
    if (typeof updateStatModBadges === 'function') updateStatModBadges();
    if (typeof updateActionableCards === 'function') updateActionableCards();
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
    if (typeof updateStatModBadges === 'function') updateStatModBadges();
    if (typeof updateActionableCards === 'function') updateActionableCards();
    updateResourceCounters();
}



