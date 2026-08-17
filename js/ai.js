// Returns (string) 'attack', 'defense-up', 'defense-down'
function AICalcMonsterPosition(monsterName) {
    var cardDef = cards[monsterName];
    if (!cardDef) return 'defense-down';

    const atk = getMonsterAtk({ cardId: monsterName });
    const def = getMonsterDef({ cardId: monsterName });

    // Dragon Capture Jar: Dragons cannot enter Attack Position while jar is active
    if (isDragonLocked() && cardDef.monsterType === 'Dragon') {
        return 'defense-down';
    }

    // Swords of Revealing Light: If AI attacks are locked, prefer defense
    if (isAttackBlocked('computer')) {
        return 'defense-down';
    }

    // Evaluate opponent's on-field offensive threats
    var playerMonsters = GameState.getMonstersOnField('player');

    // 1. Direct attack opportunity if opponent has no monsters
    if (playerMonsters.length === 0) {
        // Attack mode if monster has decent attack or higher atk than def
        if (atk >= 1000 || atk >= def) {
            return 'attack';
        }
        return 'defense-down';
    }

    // 2. Find opponent's highest face-up Attack threat
    var maxPlayerAtk = -1;
    var hasPlayerAttackThreat = false;

    playerMonsters.forEach(function(pm) {
        if (pm.card.position === 'attack') {
            var pAtk = getMonsterAtk(pm.card);
            if (pAtk > maxPlayerAtk) maxPlayerAtk = pAtk;
            hasPlayerAttackThreat = true;
        }
    });

    // If opponent has superior Attack monsters that would easily destroy this card and inflict LP damage
    if (hasPlayerAttackThreat && maxPlayerAtk > atk) {
        // Set in Defense to protect Life Points from battle damage!
        return 'defense-down';
    }

    // 3. If monster has superior ATK or higher ATK than DEF, summon in Attack Position.
    // NOTE: This includes summoning in Attack even when the opponent may control stronger
    // monsters (e.g. ones sitting in Defense). The incentive is deliberate: an exposed
    // Attack monster acts as BAIT — it invites the player to spend their attack destroying
    // it, so the AI trades a cheap card to absorb that attack instead of the player hitting
    // the AI's Life Points directly or attacking a more valuable target. Losing a monster
    // is preferable to losing LP.
    if (atk >= 1400 || atk >= def) {
        return 'attack';
    }

    // Default: Set face-down in defense for defensive/ambush monsters (e.g. Mystical Elf, Wall of Illusion)
    return 'defense-down';
}

// AI changes a monster's battle position with smooth animation and DOM/GameState sync
async function AIChangeMonsterPosition(zoneNum, newPosition) {
    var square = getSquareElm('computer', zoneNum);
    if (!square || !square.length) return;

    var monsterInst = GameState.computer.field.monsters[zoneNum];
    if (!monsterInst) return;

    var cardDef = cards[monsterInst.cardId];
    var isFlipSummon = (monsterInst.position === 'defense-down' && newPosition === 'attack');

    monsterInst.position = newPosition;
    monsterInst.turnPosChanged = turnCount;
    if (newPosition !== 'defense-down') {
        monsterInst.faceDown = false;
    }

    square.attr('data-card-position', newPosition);
    square.attr('data-turn-posChanged', turnCount);

    var zone = square.find('div.card-zone');
    var turnDuration = getAnimDuration(380);
    var animEasing = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

    if (newPosition === 'attack') {
        if (typeof zone.flip === 'function') zone.flip(false);
        await new Promise(function(resolve) {
            zone.transition({ rotate: '0deg' }, turnDuration, animEasing, resolve);
        });
        if (isFlipSummon) {
            addToFeed('Computer Flip Summons <em>' + cardDef.name + '</em> to Attack Position in zone #' + zoneNum + '.\n\n');
        } else {
            addToFeed('Computer switches <em>' + cardDef.name + '</em> to Attack Position in zone #' + zoneNum + '.\n\n');
        }
    } else if (newPosition === 'defense-up') {
        if (typeof zone.flip === 'function') zone.flip(false);
        await new Promise(function(resolve) {
            zone.transition({ rotate: '90deg' }, turnDuration, animEasing, resolve);
        });
        addToFeed('Computer switches <em>' + cardDef.name + '</em> to Defense Position in zone #' + zoneNum + '.\n\n');
    }

    if (typeof updateStatModBadges === 'function') updateStatModBadges();
    await sleep(getAnimDuration(250));
}

// Evaluate existing computer monsters on the field and switch battle positions strategically
async function AIEvaluatePositionChanges() {
    var computerMonsters = GameState.getMonstersOnField('computer');
    var isJarActive = (typeof isDragonLocked === 'function') && isDragonLocked();

    for (var i = 0; i < computerMonsters.length; i++) {
        var m = computerMonsters[i];
        var monsterInst = m.card;
        var zoneNum = m.zone;

        // Legal rule checks: cannot change if summoned this turn (unless it is a borrowed monster from Change of Heart) or already changed this turn
        if (monsterInst.turnSummoned === turnCount && !monsterInst.isBorrowed) continue;
        if (monsterInst.turnPosChanged === turnCount) continue;
        if (monsterInst.hasAttacked) continue;

        var cardDef = cards[monsterInst.cardId];
        if (!cardDef) continue;

        var currentPos = monsterInst.position;
        var atk = getMonsterAtk(monsterInst);
        var def = getMonsterDef(monsterInst);

        if (currentPos === 'defense-up' || currentPos === 'defense-down') {
            // Cannot switch to Attack Position if it is a Dragon under Dragon Capture Jar
            if (isJarActive && cardDef.monsterType === 'Dragon') continue;

            // Borrowed monsters with Change of Heart should always switch to Attack position to attack
            if (monsterInst.isBorrowed && atk > 0) {
                await AIChangeMonsterPosition(zoneNum, 'attack');
            } else if (atk >= 1400 || atk >= def) {
                // Favorable to switch to Attack if high ATK power or ATK >= DEF
                await AIChangeMonsterPosition(zoneNum, 'attack');
            }
        } else if (currentPos === 'attack') {
            // If monster has low ATK and higher DEF, and player has strong offensive threats
            var playerMonsters = GameState.getMonstersOnField('player');
            var playerHasBiggerThreat = playerMonsters.some(function(pm) {
                return getMonsterAtk(pm.card) > atk;
            });

            if (def > atk && playerHasBiggerThreat) {
                await AIChangeMonsterPosition(zoneNum, 'defense-up');
            }
        }
    }
}

// AI Battle Phase execution
async function AIPerformBattlePhase() {
    if (turnCount === 1) return; // Cannot attack on first turn

    // Swords of Revealing Light: computer monsters cannot attack while active
    if (isAttackBlocked('computer')) {
        addToFeed('[AI Tactical] Swords of Revealing Light locks down attacks.\n');
        return;
    }

    var computerMonsters = GameState.getMonstersOnField('computer');
    
    // Sort attackers by highest ATK first for optimal combat sequence
    computerMonsters.sort(function(a, b) {
        var defA = getMonsterAtk(a.card);
        var defB = getMonsterAtk(b.card);
        return defB - defA;
    });

    for (var i = 0; i < computerMonsters.length; i++) {
        var attacker = computerMonsters[i];
        
        // Re-verify attacker is still on field and in Attack position
        var currentAttacker = GameState.computer.field.monsters[attacker.zone];
        if (!currentAttacker || currentAttacker.position !== 'attack' || currentAttacker.hasAttacked) {
            continue;
        }

        var attackerDef = cards[currentAttacker.cardId];
        if (!attackerDef) continue;
        var attackerAtk = getMonsterAtk(currentAttacker);

        var playerMonsters = GameState.getMonstersOnField('player');

        // 1. DIRECT ATTACK when player field is empty
        if (playerMonsters.length === 0) {
            var computerMonsters = GameState.getMonstersOnField('computer');
            if (currentAttacker.cardId === 'harpie-lady' && computerMonsters.length <= 1) {
                // Harpie Lady cannot attack directly while she is the only monster controlled
                continue;
            }
            addToFeed('[AI Tactical] Direct attack opportunity detected!\n');
            await executeBattle('computer', attacker.zone, null);
            await sleep(700);
            continue;
        }

        // 2. Evaluate all legal player targets to find optimal/safe attacks
        var bestTargetZone = null;
        var bestScore = -99999;

        for (var p = 0; p < playerMonsters.length; p++) {
            var defender = playerMonsters[p];
            var defenderDef = cards[defender.card.cardId];
            if (!defenderDef) continue;

            var defPosition = defender.card.position;
            var defenderAtk = getMonsterAtk(defender.card);
            var defenderDefVal = getMonsterDef(defender.card);

            if (defPosition === 'attack') {
                // Face-Up Attack Target
                if (attackerAtk > defenderAtk) {
                    // Safe win: Inflicts battle damage & destroys opponent monster
                    var damageToPlayer = attackerAtk - defenderAtk;
                    var score = 1000 + damageToPlayer;
                    if (score > bestScore) {
                        bestScore = score;
                        bestTargetZone = defender.zone;
                    }
                } else if (attackerAtk === defenderAtk) {
                    // Equal ATK trade (mutual destruction): Only take trade if defender has high ATK threat
                    if (defenderAtk >= 1500 && bestScore < 200) {
                        bestScore = 200;
                        bestTargetZone = defender.zone;
                    }
                } else {
                    // Attacker ATK < Defender ATK: DO NOT ATTACK (prevents suicide & LP loss)
                    continue;
                }
            } else if (defPosition === 'defense-up') {
                // Face-Up Defense Target
                if (attackerAtk > defenderDefVal) {
                    // Safe destruction with no recoil
                    var score = 500 + (defenderDefVal / 10);
                    if (score > bestScore) {
                        bestScore = score;
                        bestTargetZone = defender.zone;
                    }
                } else {
                    // Attacker ATK <= Defender DEF: DO NOT ATTACK (would take recoil or do nothing)
                    continue;
                }
            } else if (defPosition === 'defense-down') {
                // Face-Down Defense Target
                // Only attack face-down cards if attacker has solid ATK power
                if (attackerAtk >= 1400) {
                    var score = 300;
                    if (score > bestScore) {
                        bestScore = score;
                        bestTargetZone = defender.zone;
                    }
                }
            }
        }

        // 3. Execute battle if a valid, non-suicidal target was found
        if (bestTargetZone !== null) {
            await executeBattle('computer', attacker.zone, bestTargetZone);
            await sleep(700);
        } else {
            addToFeed('[AI Tactical] ' + attackerDef.name + ' holds position (no favorable attack targets).\n');
        }
    }
}

// Step 1: Play Pot of Greed immediately if held to maximize card advantage & tactical options
async function AIPlayDrawCards() {
    var played = false;
    var maxIter = 3;
    while (maxIter-- > 0) {
        var pogInstance = GameState.computer.hand.find(function(c) { return c.cardId === 'pot-of-greed'; });
        if (!pogInstance || getNumOfFreeZones('computer') <= 0) break;

        var def = cards['pot-of-greed'];
        var zoneNum = getFirstFreeZone('computer');
        if (zoneNum === undefined) break;

        await playNonMonsterCard('computer', getHandCardElmByUid('computer', pogInstance.uid), getSquareElm('computer', zoneNum), def, 'slot');
        played = true;
        await sleep(getAnimDuration(400));
    }
    if (played) {
        updateResourceCounters();
    }
}

// Play Ookazi — prioritize as a finisher when player LP <= 800, otherwise play freely
async function AIPlayOokazi() {
    var ookaziInst = GameState.computer.hand.find(function(c) { return c.cardId === 'ookazi'; });
    if (!ookaziInst) return;
    if (getNumOfFreeZones('computer') <= 0) return;

    var playerLP = GameState.player.lifePoints;
    // Always play if it wins the game; otherwise play freely on AI turn
    if (playerLP <= 800 || true) {
        var zoneNum = getFirstFreeZone('computer');
        if (zoneNum === undefined) return;
        var def = cards['ookazi'];
        await playNonMonsterCard('computer', getHandCardElmByUid('computer', ookaziInst.uid), getSquareElm('computer', zoneNum), def, 'slot');
        updateResourceCounters();
        await sleep(getAnimDuration(400));
    }
}

// Play Hinotama — same eager strategy as Ookazi (500 direct damage)
async function AIPlayHinotama() {
    var inst = GameState.computer.hand.find(function(c) { return c.cardId === 'hinotama'; });
    if (!inst) return;
    if (getNumOfFreeZones('computer') <= 0) return;

    var zoneNum = getFirstFreeZone('computer');
    if (zoneNum === undefined) return;
    var def = cards['hinotama'];
    await playNonMonsterCard('computer', getHandCardElmByUid('computer', inst.uid), getSquareElm('computer', zoneNum), def, 'slot');
    updateResourceCounters();
    await sleep(getAnimDuration(400));
}

// Play Fissure — destroy the player's lowest ATK face-up monster before attacking
async function AIPlayFissure() {
    var inst = GameState.computer.hand.find(function(c) { return c.cardId === 'fissure'; });
    if (!inst) return;
    if (getNumOfFreeZones('computer') <= 0) return;

    // Only play if player has at least one face-up monster
    var playerFaceUp = GameState.getMonstersOnField('player').filter(function(m) {
        return m.card && !m.card.faceDown;
    });
    if (playerFaceUp.length === 0) return;

    var zoneNum = getFirstFreeZone('computer');
    if (zoneNum === undefined) return;
    var def = cards['fissure'];
    await playNonMonsterCard('computer', getHandCardElmByUid('computer', inst.uid), getSquareElm('computer', zoneNum), def, 'slot');
    updateResourceCounters();
    await sleep(getAnimDuration(400));
}

// Play Tribute to the Doomed — only if AI has >1 card in hand and player has a monster on field
async function AIPlayTributeToTheDoomed() {
    var inst = GameState.computer.hand.find(function(c) { return c.cardId === 'tribute-to-the-doomed'; });
    if (!inst) return;
    if (getNumOfFreeZones('computer') <= 0) return;

    // Needs at least 1 other card in hand to discard
    var otherCards = GameState.computer.hand.filter(function(c) { return c.uid !== inst.uid; });
    if (otherCards.length === 0) return;

    // Only play if there's a monster on the field worth destroying
    var allMonsters = [
        ...GameState.getMonstersOnField('player'),
        ...GameState.getMonstersOnField('computer')
    ];
    if (allMonsters.length === 0) return;

    var zoneNum = getFirstFreeZone('computer');
    if (zoneNum === undefined) return;
    var def = cards['tribute-to-the-doomed'];
    await playNonMonsterCard('computer', getHandCardElmByUid('computer', inst.uid), getSquareElm('computer', zoneNum), def, 'slot');
    updateResourceCounters();
    await sleep(getAnimDuration(400));
}

// AI evaluates whether to activate Time Wizard on field
async function AIPlayTimeWizard() {
    var computerMonsters = GameState.getMonstersOnField('computer');
    var wizardEntry = computerMonsters.find(function(m) {
        return m.card.cardId === 'time-wizard' && 
               m.card.position !== 'defense-down' && 
               m.card.lastEffectTurn !== turnCount;
    });

    if (!wizardEntry) return;

    var playerMonsters = GameState.getMonstersOnField('player');
    // Only activate if opponent has monsters to wipe or computer is in an advantageous position
    if (playerMonsters.length > 0) {
        var call = Math.random() < 0.5 ? 'heads' : 'tails';
        if (typeof executeTimeWizardEffect === 'function') {
            await executeTimeWizardEffect('computer', call, wizardEntry.zone);
            await sleep(getAnimDuration(500));
        }
    }
}

// AI evaluates whether to activate Harpie Lady on field
async function AIPlayHarpieLady() {
    var computerMonsters = GameState.getMonstersOnField('computer');
    var harpieEntry = computerMonsters.find(function(m) {
        return m.card.cardId === 'harpie-lady' && 
               m.card.position !== 'defense-down' && 
               m.card.lastEffectTurn !== turnCount;
    });

    if (!harpieEntry) return;

    var handTotal = (computer.hand.monsters ? computer.hand.monsters.length : 0) + 
                    (computer.hand.spells ? computer.hand.spells.length : 0) + 
                    (computer.hand.traps ? computer.hand.traps.length : 0);
    if (handTotal === 0) return;

    var playerTargets = [];
    for (var z = 1; z <= 6; z++) {
        if (GameState.player.field.spells[z]) {
            playerTargets.push({ zone: z, isField: false, inst: GameState.player.field.spells[z] });
        }
    }
    if (GameState.player.field.fieldZone) {
        playerTargets.push({ zone: null, isField: true, inst: GameState.player.field.fieldZone });
    }

    if (playerTargets.length === 0) return;

    var target = playerTargets[0];
    var discardCategory = null;
    var discardCardName = null;

    if (computer.hand.monsters.length > 0) {
        discardCategory = 'monsters';
        discardCardName = computer.hand.monsters[computer.hand.monsters.length - 1];
    } else if (computer.hand.spells.length > 0) {
        discardCategory = 'spells';
        discardCardName = computer.hand.spells[0];
    } else if (computer.hand.traps.length > 0) {
        discardCategory = 'traps';
        discardCardName = computer.hand.traps[0];
    }

    if (!discardCategory || !discardCardName) return;

    var idx = computer.hand[discardCategory].indexOf(discardCardName);
    if (idx !== -1) {
        computer.hand[discardCategory].splice(idx, 1);
    }
    GameState.computer.graveyard.push(new CardInstance(discardCardName));

    harpieEntry.card.lastEffectTurn = turnCount;

    var discardDef = cards[discardCardName];
    var targetDef = cards[target.inst.cardId];
    var targetName = targetDef ? targetDef.name : 'Spell/Trap card';

    addToFeed('Computer activates <em>Harpie Lady</em>: discards <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong> and destroys your <strong>' + targetName + '</strong>!\n\n');

    await destroySpellTrap('player', target.zone, target.isField, false);
    updateResourceCounters();
    updateGraveyardZones();
    await sleep(getAnimDuration(500));
}

// Step 2: AI Normal/Tribute Summons the best monster currently in hand
async function AISummonMonsterRoutine() {
    if (GameState.turn.normalSummonUsed) return;

    var currentHand = [...computer['hand']['monsters']];
    if (currentHand.length === 0) return;

    var fieldMonsters = GameState.getMonstersOnField('computer');
    var freeZones = getNumOfFreeZones('computer');

    // Find all summonable candidates based on tribute requirements
    var summonable = [];

    currentHand.forEach(function(mName) {
        var mDef = cards[mName];
        if (!mDef) return;
        var req = (typeof getRequiredTributes === 'function') ? getRequiredTributes(mDef.level) : 0;
        
        if (req === 0 && freeZones > 0) {
            summonable.push({ name: mName, def: mDef, reqTributes: 0, score: (mDef.atk || 0) });
        } else if (req > 0 && fieldMonsters.length >= req) {
            // Sort field monsters by ascending ATK to find the weakest tributes
            var sortedField = fieldMonsters.slice().sort(function(a, b) {
                return getMonsterAtk(a.card) - getMonsterAtk(b.card);
            });
            var tributes = sortedField.slice(0, req);
            var lostAtk = tributes.reduce(function(acc, t) { return acc + getMonsterAtk(t.card); }, 0);
            var gainAtk = (mDef.atk || 0);

            // AI considers tribute worth it if new monster ATK exceeds the single strongest sacrificed monster or total gain is positive
            if (gainAtk >= 2000 || gainAtk > (lostAtk * 0.8)) {
                summonable.push({
                    name: mName,
                    def: mDef,
                    reqTributes: req,
                    tributes: tributes,
                    score: gainAtk - (lostAtk * 0.5)
                });
            }
        }
    });

    if (summonable.length === 0) return;

    // Pick highest score monster
    summonable.sort(function(a, b) { return b.score - a.score; });
    var chosen = summonable[0];

    // If tribute required, send tributes to GY first
    if (chosen.reqTributes > 0 && chosen.tributes) {
        var tributeNames = [];
        for (var t = 0; t < chosen.tributes.length; t++) {
            var tributeItem = chosen.tributes[t];
            var tDef = cards[tributeItem.card.cardId];
            tributeNames.push(tDef ? tDef.name : 'a monster');
            await destroyMonster('computer', tributeItem.zone);
        }
        addToFeed('Computer Tributes <strong>' + tributeNames.join(' and ') + '</strong> to Tribute Summon <em>' + chosen.def.name + '</em>!\n\n');
        await sleep(getAnimDuration(350));
    }

    await summonMonster('computer', chosen.name);
    await sleep(getAnimDuration(300));
}

// Step 3: AI plays spells and sets traps dynamically with multi-pass hand re-evaluation
async function AIPlaySpellTrapCards() {
    var playedAny = false;
    var maxPasses = 5;

    while (maxPasses-- > 0) {
        var hand = GameState.computer.hand.slice();
        var cardPlayedThisPass = false;

        for (var i = 0; i < hand.length; i++) {
            var instance = hand[i];
            var def = cards[instance.cardId];
            if (!def || def.type === 'monsters') continue;

            // Verify this instance is still in hand
            var stillInHand = GameState.computer.hand.some(function(c) { return c.uid === instance.uid; });
            if (!stillInHand) continue;

            if (def.type === 'spells') {
                var shouldPlay = false;
                var zoneKind = 'slot';
                var targetSquare = null;

                if (def.subType === 'field') {
                    if (GameState.isFieldZoneEmpty('computer')) {
                        var playerFieldInst = GameState.player.field.fieldZone;
                        var isIdenticalActive = (playerFieldInst && playerFieldInst.cardId === def.id);
                        if (!isIdenticalActive) {
                            shouldPlay = true;
                            zoneKind = 'field';
                            targetSquare = getFieldZoneElm('computer');
                        }
                    }
                } else {
                    if (getNumOfFreeZones('computer') > 0) {
                        if (def.id === 'pot-of-greed') {
                            shouldPlay = true;
                        } else if (def.id === 'raigeki') {
                            shouldPlay = GameState.getMonstersOnField('player').length > 0;
                        } else if (def.id === 'dark-hole') {
                            var compCount = GameState.getMonstersOnField('computer').length;
                            var playerCount = GameState.getMonstersOnField('player').length;
                            shouldPlay = playerCount > 0 && (compCount === 0 || playerCount > compCount);
                        } else if (def.id === 'change-of-heart') {
                            shouldPlay = (getFirstFreeZone('computer') !== undefined) && (GameState.getMonstersOnField('player').length > 0);
                        } else if (def.id === 'remove-trap') {
                            shouldPlay = findFaceUpTrap('player') !== null;
                        } else if (def.id === 'fissure') {
                            var playerFaceUp = GameState.getMonstersOnField('player').filter(function(m) {
                                return m.card && !m.card.faceDown;
                            });
                            shouldPlay = playerFaceUp.length > 0;
                        } else if (def.id === 'monster-reborn') {
                            shouldPlay = (getFirstFreeZone('computer') !== undefined) && (getGraveyardMonsters().length > 0);
                        } else if (def.id === 'swords-of-revealing-light') {
                            shouldPlay = !hasActiveCard('computer', 'swords-of-revealing-light');
                        } else if (def.subType === 'equip') {
                            var compFaceUp = GameState.getMonstersOnField('computer').filter(function(m) {
                                return m.card && !m.card.faceDown && m.card.position !== 'defense-down';
                            });
                            shouldPlay = compFaceUp.length > 0;
                        } else {
                            shouldPlay = true;
                        }
                    }
                }

                if (shouldPlay) {
                    var zoneNum = zoneKind === 'field' ? null : getFirstFreeZone('computer');
                    if (zoneNum === undefined && zoneKind !== 'field') continue;

                    await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), targetSquare || getSquareElm('computer', zoneNum), def, zoneKind);
                    playedAny = true;
                    cardPlayedThisPass = true;
                    await sleep(getAnimDuration(300));
                    break;
                }

            } else if (def.type === 'traps') {
                var shouldSet = true;

                if (def.id === 'dragon-capture-jar') {
                    var alreadyActive = (typeof hasActiveCard === 'function') && (hasActiveCard('computer', 'dragon-capture-jar') || hasActiveCard('player', 'dragon-capture-jar'));
                    var alreadySet = (typeof findSetTrapZone === 'function') && (findSetTrapZone('computer', 'dragon-capture-jar') !== null);
                    if (alreadyActive || alreadySet) {
                        shouldSet = false;
                    } else {
                        // Tactical check: Does setting Dragon Capture Jar sabotage AI's own dragons?
                        var compMonsters = GameState.getMonstersOnField('computer');
                        var playerMonsters = GameState.getMonstersOnField('player');

                        var compHasDragon = compMonsters.some(function(m) {
                            var d = cards[m.card.cardId];
                            return d && d.monsterType === 'Dragon';
                        });

                        var playerHasDragon = playerMonsters.some(function(m) {
                            var d = cards[m.card.cardId];
                            return d && d.monsterType === 'Dragon';
                        });

                        // If AI controls dragons and player does not, hold the Jar to protect AI's offensive firepower
                        if (compHasDragon && !playerHasDragon) {
                            shouldSet = false;
                        }
                    }
                }

                if (shouldSet && getNumOfFreeZones('computer') > 0) {
                    var trapZone = getFirstFreeZone('computer');
                    if (trapZone === undefined) continue;

                    await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), getSquareElm('computer', trapZone), def, 'slot');
                    playedAny = true;
                    cardPlayedThisPass = true;
                    await sleep(getAnimDuration(300));
                    break;
                }
            }
        }

        if (!cardPlayedThisPass) break;
    }

    if (playedAny) {
        updateResourceCounters();
    }
}