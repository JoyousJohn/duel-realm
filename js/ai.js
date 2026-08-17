// Returns (string) 'attack', 'defense-up', 'defense-down'
function AICalcMonsterPosition(monsterName) {
    var cardDef = cards[monsterName];
    if (!cardDef) return 'defense-down';

    const atk = getMonsterAtk({ cardId: monsterName });
    const def = getMonsterDef({ cardId: monsterName });

    // Dragon Capture Jar: Dragons cannot enter Attack Position while jar is active
    if (isDragonLocked() && cardDef.monsterType === 'Dragon') {
        return (def >= atk) ? 'defense-up' : 'defense-down';
    }

    // Swords of Revealing Light: If AI attacks are locked, prefer defense
    if (isAttackBlocked('computer')) {
        return (def >= atk) ? 'defense-up' : 'defense-down';
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

    // 3. If monster has superior ATK or higher ATK than DEF, summon in Attack Position
    if (atk >= 1400 || atk >= def) {
        return 'attack';
    }

    // Default: Set face-down in defense for defensive/ambush monsters (e.g. Mystical Elf, Wall of Illusion)
    return (def >= 1500) ? 'defense-down' : 'defense-up';
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

        // Legal rule checks: cannot change if summoned this turn or already changed this turn
        if (monsterInst.turnSummoned === turnCount) continue;
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

            // Favorable to switch to Attack if high ATK power or ATK >= DEF
            if (atk >= 1400 || atk >= def) {
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

// Step 2: AI Normal Summons the best monster currently in hand
async function AISummonMonsterRoutine() {
    if (GameState.turn.normalSummonUsed || getNumOfFreeZones('computer') <= 0) return;

    var currentHand = [...computer['hand']['monsters']];
    if (currentHand.length === 0) return;

    currentHand.sort(function(a, b) {
        var defA = cards[a];
        var defB = cards[b];
        return (defB ? defB.atk || 0 : 0) - (defA ? defA.atk || 0 : 0);
    });

    var monsterName = currentHand[0];
    await summonMonster('computer', monsterName);
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
                        } else if (def.id === 'monster-reborn') {
                            shouldPlay = (getFirstFreeZone('computer') !== undefined) && (getGraveyardMonsters().length > 0);
                        } else if (def.id === 'swords-of-revealing-light') {
                            shouldPlay = !hasActiveCard('computer', 'swords-of-revealing-light');
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