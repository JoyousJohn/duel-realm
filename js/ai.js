// Returns (string) 'attack', 'defense-up', 'defense-down'
function AICalcMonsterPosition(monsterName) {
    var cardDef = cards[monsterName];
    if (!cardDef) return 'defense-down';

    const atk = getMonsterAtk({ cardId: monsterName });
    const def = getMonsterDef({ cardId: monsterName });

    // FLIP effect monsters should always be Set in defense-down
    if (monsterName === 'man-eater-bug' || monsterName === 'zephyr-imp' || monsterName === 'dragon-piper' || monsterName === 'aurora-golem') {
        return 'defense-down';
    }

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
        // Attack mode if monster has positive offensive attack power
        if (atk >= 1000 || (atk > 0 && atk >= def)) {
            return 'attack';
        }
        return 'defense-down';
    }

    // 2. Find opponent's highest face-up Attack threat and piercing threats
    var maxPlayerAtk = -1;
    var hasPlayerAttackThreat = false;
    var maxPiercingAtk = -1;
    var hasPiercingThreat = false;

    playerMonsters.forEach(function(pm) {
        var isFaceUp = !pm.card.faceDown && pm.card.position !== 'defense-down';
        var pDef = cards[pm.card.cardId];
        var pAtk = (typeof getMonsterAtk === 'function') ? getMonsterAtk(pm.card) : (pDef ? pDef.atk || 0 : 0);

        if (pm.card.position === 'attack') {
            if (pAtk > maxPlayerAtk) maxPlayerAtk = pAtk;
            hasPlayerAttackThreat = true;
        }

        var isPiercing = isFaceUp && (pm.card.cardId === 'aegis-seraph' || (pDef && pDef.piercing === true));
        if (isPiercing && pAtk > maxPiercingAtk) {
            maxPiercingAtk = pAtk;
            hasPiercingThreat = true;
        }
    });

    // Piercing threat tactical consideration:
    // If the opponent controls a superior piercing attacker (e.g. Aegis Seraph) and our monster's ATK > DEF,
    // summoning in Attack Position results in strictly LESS LP damage than Defense Position (e.g. 1800 - 1200 ATK = 600 vs 1800 - 400 DEF = 1400),
    // and additionally prevents the opponent from triggering piercing combat draws!
    if (hasPiercingThreat && maxPiercingAtk > atk && atk > def) {
        return 'attack';
    }

    // If opponent has superior Attack monsters that would easily destroy this card and inflict LP damage
    if (hasPlayerAttackThreat && maxPlayerAtk > atk) {
        // Set in Defense to protect Life Points from battle damage!
        return 'defense-down';
    }

    // 3. Summon in Attack Position only if monster has real combat stats (1400+ or solid 1000+ with atk >= def)
    if (atk >= 1400 || (atk >= 1000 && atk >= def)) {
        return 'attack';
    }

    // Default: Set face-down in defense for defensive/ambush/weak monsters
    return 'defense-down';
}

// AI changes a monster's battle position with smooth animation and DOM/GameState sync
async function AIChangeMonsterPosition(zoneNum, newPosition) {
    var square = getSquareElm('computer', zoneNum);
    if (!square || !square.length) return;

    var monsterInst = GameState.computer.field.monsters[zoneNum];
    if (!monsterInst) return;

    var cardDef = cards[monsterInst.cardId];
    var wasFaceDown = (monsterInst.position === 'defense-down');
    var isFlipSummon = wasFaceDown;

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
        if (wasFaceDown && typeof triggerFlipEffect === 'function') {
            var flippedInst = GameState.computer.field.monsters[zoneNum];
            if (flippedInst) await triggerFlipEffect(flippedInst, 'computer', zoneNum);
        }
    } else if (newPosition === 'defense-up') {
        if (typeof zone.flip === 'function') zone.flip(false);
        await new Promise(function(resolve) {
            zone.transition({ rotate: '90deg' }, turnDuration, animEasing, resolve);
        });
        if (wasFaceDown) {
            addToFeed('Computer Flip Summons <em>' + cardDef.name + '</em> to Defense Position in zone #' + zoneNum + '.\n\n');
        } else {
            addToFeed('Computer switches <em>' + cardDef.name + '</em> to Defense Position in zone #' + zoneNum + '.\n\n');
        }
        if (wasFaceDown && typeof triggerFlipEffect === 'function') {
            var flippedInstDef = GameState.computer.field.monsters[zoneNum];
            if (flippedInstDef) await triggerFlipEffect(flippedInstDef, 'computer', zoneNum);
        }
    }

    if (wasFaceDown) {
        var flippedSummonInst = GameState.computer.field.monsters[zoneNum];
        if (flippedSummonInst) {
            EventBus.emitAsync('MONSTER_SUMMONED', { who: 'computer', instance: flippedSummonInst, zone: zoneNum, isFlipSummon: true });
        }
    }

    updateStatModBadges();
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

        if (monsterInst.cardId === 'aurora-golem') {
            var golemFacesTargets = GameState.getMonstersOnField('player').length > 0;
            if (currentPos === 'defense-down' || (currentPos === 'attack' && golemFacesTargets)) {
                await AIChangeMonsterPosition(zoneNum, 'defense-up');
            } else if (currentPos === 'defense-up' && !golemFacesTargets) {
                await AIChangeMonsterPosition(zoneNum, 'attack');
            }
            continue;
        }

        if (currentPos === 'defense-up' || currentPos === 'defense-down') {
            // Cannot switch to Attack Position if it is a Dragon under Dragon Capture Jar
            if (isJarActive && cardDef.monsterType === 'Dragon') continue;

            var isToken = monsterInst.isToken || cardDef.isToken || cardDef.subType === 'token';
            if (isToken && atk === 0) continue; // 0-ATK tokens should remain in defense to absorb attacks

            // Borrowed monsters with Change of Heart should always switch to Attack position to attack
            if (monsterInst.isBorrowed && atk > 0) {
                await AIChangeMonsterPosition(zoneNum, 'attack');
            } else if (atk >= 1400 || (atk >= 1000 && atk >= def)) {
                // Favorable to switch to Attack if high ATK power or solid 1000+ ATK with ATK >= DEF
                await AIChangeMonsterPosition(zoneNum, 'attack');
            }
        } else if (currentPos === 'attack') {
            // If monster has low ATK and higher DEF, or is a 0-ATK token exposed to attacks
            var isToken = monsterInst.isToken || cardDef.isToken || cardDef.subType === 'token';
            var playerMonsters = GameState.getMonstersOnField('player');
            var playerHasBiggerThreat = playerMonsters.some(function(pm) {
                return getMonsterAtk(pm.card) > atk;
            });

            var hasPiercingAttacker = playerMonsters.some(function(pm) {
                var isFaceUp = !pm.card.faceDown && pm.card.position !== 'defense-down';
                var pDef = cards[pm.card.cardId];
                var pAtk = (typeof getMonsterAtk === 'function') ? getMonsterAtk(pm.card) : (pDef ? pDef.atk || 0 : 0);
                var isPiercing = isFaceUp && (pm.card.cardId === 'aegis-seraph' || (pDef && pDef.piercing === true));
                return isPiercing && pAtk > atk;
            });

            // Do not switch to defense if facing a superior piercing attacker and ATK > DEF (as defense would take MORE damage and trigger draws)
            if (hasPiercingAttacker && atk > def) {
                // Stay in Attack Position to minimize piercing damage and deny combat draws
            } else if ((def > atk && playerHasBiggerThreat) || (isToken && atk === 0)) {
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
        if (currentAttacker.cardId === 'lionhearted-locomotive') {
            var halvedBase = Math.floor((attackerDef.atk || 0) / 2);
            var fieldMods = getFieldMods(attackerDef);
            var equipMods = getEquipMods(currentAttacker);
            attackerAtk = Math.max(0, halvedBase + fieldMods.atk + equipMods.atk);
        }

        // Monsters with 0 or negative ATK (such as 0-ATK tokens) cannot/should not declare attacks
        if (attackerAtk <= 0) {
            continue;
        }

        var playerMonsters = GameState.getMonstersOnField('player');

        // 1. DIRECT ATTACK when player field is empty
        if (playerMonsters.length === 0) {
            var compMonstersList = GameState.getMonstersOnField('computer');
            if (currentAttacker.cardId === 'harpie-lady' && compMonstersList.length <= 1) {
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
            var isFaceUpYomiShip = (defender.card.cardId === 'yomi-ship' && !defender.card.faceDown);

            if (defPosition === 'attack') {
                // Face-Up Attack Target
                if (attackerAtk > defenderAtk) {
                    var damageToPlayer = attackerAtk - defenderAtk;
                    var isLethal = (damageToPlayer >= (GameState.player.lp || 0));

                    if (isFaceUpYomiShip) {
                        if (isLethal) {
                            // Lethal blow: Deliver game-winning strike despite recoil
                            var score = 10000 + damageToPlayer;
                            if (score > bestScore) {
                                bestScore = score;
                                bestTargetZone = defender.zone;
                            }
                        } else {
                            var isFodder = (attackerDef.isToken || (attackerDef.level || 0) <= 3 || attackerAtk <= 1000);
                            if (isFodder) {
                                // Disposable / weak monster trade to safely remove Yomi Ship
                                var score = 400 + damageToPlayer;
                                if (score > bestScore) {
                                    bestScore = score;
                                    bestTargetZone = defender.zone;
                                }
                            } else {
                                // High-value / boss monster: DO NOT attack Yomi Ship (suicide)
                                continue;
                            }
                        }
                    } else {
                        // Safe win: Inflicts battle damage & destroys opponent monster
                        var score = 1000 + damageToPlayer;
                        if (score > bestScore) {
                            bestScore = score;
                            bestTargetZone = defender.zone;
                        }
                    }
                } else if (attackerAtk === defenderAtk) {
                    if (isFaceUpYomiShip) {
                        continue;
                    }
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
                    if (isFaceUpYomiShip) {
                        var isFodder = (attackerDef.isToken || (attackerDef.level || 0) <= 3 || attackerAtk <= 1000);
                        if (isFodder) {
                            var score = 350;
                            if (score > bestScore) {
                                bestScore = score;
                                bestTargetZone = defender.zone;
                            }
                        } else {
                            // High-value monster should not kill defense Yomi Ship for 0 damage and suicide
                            continue;
                        }
                    } else if (defender.card.cardId === 'nether-wraith') {
                        // Nether Wraith cannot be destroyed by battle in defense
                        continue;
                    } else {
                        // Safe destruction with no recoil
                        var score = 500 + (defenderDefVal / 10);
                        if (score > bestScore) {
                            bestScore = score;
                            bestTargetZone = defender.zone;
                        }
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

// Step 1: Play Pot of Greed & Bargain of Fortune immediately if held to maximize card advantage & tactical options
async function AIPlayDrawCards() {
    var played = false;
    var maxIter = 5;
    while (maxIter-- > 0) {
        var drawInst = GameState.computer.hand.find(function(c) { return c.cardId === 'pot-of-greed' || c.cardId === 'bargain-of-fortune'; });
        if (!drawInst || getNumOfFreeZones('computer') <= 0) break;

        var def = cards[drawInst.cardId];
        var zoneNum = getFirstFreeZone('computer');
        if (zoneNum === undefined || !def) break;

        await playNonMonsterCard('computer', getHandCardElmByUid('computer', drawInst.uid), getSquareElm('computer', zoneNum), def, 'slot');
        played = true;
        await sleep(getAnimDuration(400));
    }
    if (played) {
        updateResourceCounters();
    }
}

// Play Ookazi — play freely for 800 direct damage
async function AIPlayOokazi() {
    var ookaziInst = GameState.computer.hand.find(function(c) { return c.cardId === 'ookazi'; });
    if (!ookaziInst) return;
    if (getNumOfFreeZones('computer') <= 0) return;

    var zoneNum = getFirstFreeZone('computer');
    if (zoneNum === undefined) return;
    var def = cards['ookazi'];
    await playNonMonsterCard('computer', getHandCardElmByUid('computer', ookaziInst.uid), getSquareElm('computer', zoneNum), def, 'slot');
    updateResourceCounters();
    await sleep(getAnimDuration(400));
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

    // Only play if player has at least one face-up monster that isn't immune
    var playerFaceUp = GameState.getMonstersOnField('player').filter(function(m) {
        return m.card && !m.card.faceDown && !isImmuneToSpellTargeting(m.card, 'computer');
    });
    if (playerFaceUp.length === 0) return;

    var zoneNum = getFirstFreeZone('computer');
    if (zoneNum === undefined) return;
    var def = cards['fissure'];
    await playNonMonsterCard('computer', getHandCardElmByUid('computer', inst.uid), getSquareElm('computer', zoneNum), def, 'slot');
    updateResourceCounters();
    await sleep(getAnimDuration(400));
}

// Play Dark Hole during the early removal pass — BEFORE committing summons,
// so the wipe never destroys monsters the AI just played this turn.
// Only worth it when: the AI controls nothing, it is badly outnumbered
// (2+ monster deficit), or the opponent's board is significantly stronger.
async function AIPlayDarkHole() {
    var inst = GameState.computer.hand.find(function(c) { return c.cardId === 'dark-hole'; });
    if (!inst) return;
    if (getNumOfFreeZones('computer') <= 0) return;

    var playerMonsters = GameState.getMonstersOnField('player');
    if (playerMonsters.length === 0) return;

    var compMonsters = GameState.getMonstersOnField('computer');

    // Total ATK comparison (face-up, attack-position boards matter most)
    var playerAtk = 0;
    playerMonsters.forEach(function(m) {
        if (m.card && !m.card.faceDown && m.card.position !== 'defense-down') playerAtk += getMonsterAtk(m.card);
    });
    var compAtk = 0;
    compMonsters.forEach(function(m) {
        if (m.card && !m.card.faceDown && m.card.position !== 'defense-down') compAtk += getMonsterAtk(m.card);
    });

    var shouldWipe =
        compMonsters.length === 0 ||
        (playerMonsters.length - compMonsters.length) >= 2 ||
        (playerAtk > compAtk && playerAtk - compAtk >= 1000);

    if (!shouldWipe) return;

    var zoneNum = getFirstFreeZone('computer');
    if (zoneNum === undefined) return;
    var def = cards['dark-hole'];
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
        ...GameState.getMonstersOnField('player').filter(function(m) {
            return !isImmuneToSpellTargeting(m.card, 'computer');
        }),
        ...GameState.getMonstersOnField('computer').filter(function(m) {
            return !isImmuneToSpellTargeting(m.card, 'computer');
        })
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

    if (!GameState.computer.hand || GameState.computer.hand.length === 0) return;

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

    // Prefer discarding a monster or first available card in hand
    var discardInst = GameState.computer.hand.find(function(c) {
        var d = cards[c.cardId];
        return d && d.type === 'monsters';
    }) || GameState.computer.hand[0];

    if (!discardInst) return;

    var gIdx = GameState.computer.hand.findIndex(function(c) { return c.uid === discardInst.uid; });
    if (gIdx === -1) return;
    var discardedInst = GameState.computer.hand[gIdx];

    harpieEntry.card.lastEffectTurn = turnCount;

    var discardDef = cards[discardedInst.cardId];
    var targetDef = cards[target.inst.cardId];
    var targetName = targetDef ? targetDef.name : 'Spell/Trap card';

    addToFeed('Computer activates <em>Harpie Lady</em>: discards <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong> and destroys your <strong>' + targetName + '</strong>!\n\n');

    await discardCardToGraveyard('computer', discardedInst);

    await destroySpellTrap('player', target.zone, target.isField, false);
    updateResourceCounters();
    updateGraveyardZones();
    await sleep(getAnimDuration(500));
}

// AI evaluates whether to activate Exiled Force on field
async function AIPlayExiledForce() {
    var computerMonsters = GameState.getMonstersOnField('computer');
    var exiledEntry = computerMonsters.find(function(m) {
        return m.card.cardId === 'exiled-force' && 
               m.card.position !== 'defense-down' && 
               m.card.lastEffectTurn !== turnCount;
    });

    if (!exiledEntry) return;

    var playerMonsters = GameState.getMonstersOnField('player');
    if (playerMonsters.length === 0) return;

    // Target the highest threat player monster
    playerMonsters.sort(function(a, b) {
        return getMonsterAtk(b.card) - getMonsterAtk(a.card);
    });

    var target = playerMonsters[0];
    var targetDef = cards[target.card.cardId];
    var targetName = targetDef ? targetDef.name : 'Monster';

    addToFeed('Computer Tributes <em>Exiled Force</em> to destroy your <strong>' + targetName + '</strong>!\n\n');

    if (typeof BattleFX !== 'undefined') {
        BattleFX.triggerScreenShake('medium');
    }

    await destroyMonster('computer', exiledEntry.zone);
    await destroyMonster('player', target.zone);
    updateResourceCounters();
    updateGraveyardZones();
    await sleep(getAnimDuration(500));
}

// AI evaluates whether to activate Gale Swiftblade on field
async function AIPlayGaleSwiftblade() {
    var computerMonsters = GameState.getMonstersOnField('computer');
    var galeEntry = computerMonsters.find(function(m) {
        return m.card.cardId === 'gale-swiftblade' && 
               m.card.position !== 'defense-down' && 
               !m.card.faceDown &&
               m.card.usedGaleTurn !== turnCount;
    });

    if (!galeEntry) return;

    var playerMonsters = GameState.getMonstersOnField('player').filter(function(m) {
        return m.card && !m.card.faceDown && m.card.position !== 'defense-down';
    });
    if (playerMonsters.length === 0) return;

    if (typeof activateGaleSwiftblade === 'function') {
        await activateGaleSwiftblade('computer', galeEntry.zone);
        await sleep(getAnimDuration(350));
    }
}

// AI evaluates whether to fire Pyrelord of the First Dawn's dawnfire burn
async function AIPlayPyrelordBurn() {
    var computerMonsters = GameState.getMonstersOnField('computer');
    var pyrelordEntry = computerMonsters.find(function(m) {
        return m.card.cardId === 'pyrelord-of-the-first-dawn' &&
               m.card.position !== 'defense-down' &&
               !m.card.faceDown &&
               m.card.pyrelordBurnTurn !== turnCount;
    });
    if (!pyrelordEntry) return;

    var playerMonsterCount = GameState.getMonstersOnField('player').length;
    // Fire when it deals meaningful damage (1200+) or can threaten lethal
    if (playerMonsterCount * 600 < 1200 && GameState.player.lp >= 1800) return;

    if (typeof activatePyrelordBurn === 'function') {
        await activatePyrelordBurn('computer', pyrelordEntry.zone);
        await sleep(getAnimDuration(350));
    }
}

// Step 2b: AI plays summon enabler spells (Double Tribute Surge, Phantom Catalyst, Mausoleum) BEFORE the summon routine
async function AIPlaySummonEnablerSpells() {
    var hand = GameState.computer.hand.slice();
    for (var i = 0; i < hand.length; i++) {
        var instance = hand[i];
        var def = cards[instance.cardId];
        if (!def || def.type !== 'spells') continue;

        // Verify instance is still in hand
        var stillInHand = GameState.computer.hand.some(function(c) { return c.uid === instance.uid; });
        if (!stillInHand) continue;

        // 1. Double Tribute Surge
        if (def.id === 'double-tribute-surge') {
            var handMonsters = GameState.computer.hand.filter(function(c) {
                var d = cards[c.cardId]; return d && d.type === 'monsters';
            });
            var hasHighLvl = handMonsters.some(function(c) {
                var d = cards[c.cardId]; return d && (d.level >= 5 || d.id === 'infernal-incinerator');
            });
            var freeZones = getNumOfFreeZones('computer');
            if ((hasHighLvl && handMonsters.length >= 2) || (handMonsters.length >= 2 && freeZones >= 2)) {
                var zoneNum = getFirstFreeZone('computer');
                if (zoneNum !== undefined) {
                    await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), getSquareElm('computer', zoneNum), def, 'slot');
                    await sleep(getAnimDuration(300));
                }
            }
        }
        // 2. Phantom Catalyst
        else if (def.id === 'phantom-catalyst') {
            var compMons = GameState.getMonstersOnField('computer').length;
            var playerMons = GameState.getMonstersOnField('player').length;
            var handMonsters = GameState.computer.hand.filter(function(c) {
                var d = cards[c.cardId]; return d && d.type === 'monsters';
            });
            var hasHighLvl = handMonsters.some(function(c) {
                var d = cards[c.cardId]; return d && (d.level >= 5 || d.id === 'infernal-incinerator');
            });
            var freeZones = getNumOfFreeZones('computer');
            if (freeZones >= 1 && (hasHighLvl || compMons === 0 || playerMons > compMons)) {
                var zoneNum = getFirstFreeZone('computer');
                if (zoneNum !== undefined) {
                    await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), getSquareElm('computer', zoneNum), def, 'slot');
                    await sleep(getAnimDuration(300));
                }
            }
        }
        // 3. Mausoleum of Offerings
        else if (def.id === 'mausoleum-of-offerings') {
            if (GameState.isFieldZoneEmpty('computer')) {
                var handMonsters = GameState.computer.hand.filter(function(c) {
                    var d = cards[c.cardId]; return d && d.type === 'monsters';
                });
                var hasHighLvl = handMonsters.some(function(c) {
                    var d = cards[c.cardId]; return d && (d.level >= 5 || d.id === 'infernal-incinerator');
                });
                if (hasHighLvl && GameState.computer.lp >= 2500) {
                    await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), getFieldZoneElm('computer'), def, 'field');
                    await sleep(getAnimDuration(300));
                }
            }
        }
        // 4. Vanguard's Accord
        else if (def.id === 'vanguards-accord') {
            var compMons = GameState.getMonstersOnField('computer').length;
            var compDeck = (GameState.computer && GameState.computer.deck) ? GameState.computer.deck : [];
            var hasTarget = compDeck.some(function(id) {
                var d = cards[id];
                return d && d.type === 'monsters' && (!d.subType || d.subType === 'normal' || d.subType === '') && (d.level || 0) <= 4 && !d.isToken;
            });
            var freeZones = getNumOfFreeZones('computer');
            if (compMons === 0 && hasTarget && freeZones >= 1) {
                var zoneNum = getFirstFreeZone('computer');
                if (zoneNum !== undefined) {
                    await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), getSquareElm('computer', zoneNum), def, 'slot');
                    await sleep(getAnimDuration(300));
                }
            }
        }
        // 5. Tribute of the Ages
        else if (def.id === 'tribute-of-the-ages') {
            var handMonsters = GameState.computer.hand.filter(function(c) {
                var d = cards[c.cardId]; return d && d.type === 'monsters';
            });
            var hasHighLvl = handMonsters.some(function(c) {
                var d = cards[c.cardId]; return d && (d.level >= 5 || d.id === 'infernal-incinerator');
            });
            var playerFaceUp = GameState.getMonstersOnField('player').filter(function(m) {
                var d = cards[m.card.cardId];
                return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && !(m.card.cannotBeTributed || (d && d.cannotBeTributed));
            });
            if (hasHighLvl && playerFaceUp.length > 0 && getNumOfFreeZones('computer') >= 1) {
                var zoneNum = getFirstFreeZone('computer');
                if (zoneNum !== undefined) {
                    await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), getSquareElm('computer', zoneNum), def, 'slot');
                    await sleep(getAnimDuration(300));
                }
            }
        }
    }
}

// Step 3: AI Normal/Tribute Summons the best monster currently in hand

// Effective ATK a hand monster will have once summoned, accounting for an
// active opposing Gravity Tether (-100 ATK per Level on face-up monsters).
function AIEffectiveSummonAtk(mDef) {
    if (!mDef) return 0;
    var atk = (mDef.atk || 0);
    if (typeof hasActiveCard === 'function' && hasActiveCard('player', 'gravity-tether')) {
        atk = Math.max(0, atk - ((mDef.level || 1) * 100));
    }
    return atk;
}

async function AISummonMonsterRoutine() {
    if (GameState.turn.normalSummonUsed && (!GameState.turn.extraNormalSummons || GameState.turn.extraNormalSummons <= 0)) return;

    var currentHand = GameState.computer.hand.filter(function(c) {
        var d = cards[c.cardId];
        return d && d.type === 'monsters';
    }).map(function(c) { return c.cardId; });

    if (currentHand.length === 0) return;

    var fieldMonsters = GameState.getMonstersOnField('computer');
    var freeZones = getNumOfFreeZones('computer');

    // Check if Tribute of the Ages is active for the computer and resolve valid opponent candidate
    var soulTarget = (GameState.turn && GameState.turn.tributeOfTheAgesTarget && GameState.turn.tributeOfTheAgesTarget.who === 'computer') ? GameState.turn.tributeOfTheAgesTarget : null;
    var validOppCandidate = null;
    if (soulTarget && GameState[soulTarget.opp] && GameState[soulTarget.opp].field && GameState[soulTarget.opp].field.monsters[soulTarget.zone]) {
        var oppInst = GameState[soulTarget.opp].field.monsters[soulTarget.zone];
        if (oppInst && (!soulTarget.uid || oppInst.uid === soulTarget.uid) && !oppInst.faceDown && oppInst.position !== 'defense-down') {
            validOppCandidate = { who: soulTarget.opp, zone: soulTarget.zone, card: oppInst, isOpponent: true };
        }
    }

    // Find all summonable candidates based on tribute requirements
    var summonable = [];

    currentHand.forEach(function(mName) {
        var mDef = cards[mName];
        if (!mDef) return;
        var isInfernal = (mName === 'infernal-incinerator');
        if (isInfernal) {
            var eligibleTributes = fieldMonsters.filter(function(entry) {
                var isFaceDown = entry.card.faceDown || entry.card.position === 'defense-down';
                return !isFaceDown && (typeof getMonsterAtk === 'function' ? getMonsterAtk(entry.card) >= 2000 : (cards[entry.card.cardId] && cards[entry.card.cardId].atk >= 2000));
            });
            if (eligibleTributes.length > 0) {
                eligibleTributes.sort(function(a, b) {
                    return getMonsterAtk(a.card) - getMonsterAtk(b.card);
                });
                var tribute = eligibleTributes[0];
                var oppMonstersCount = GameState.getMonstersOnField('player').length;
                var otherOwnMonsters = Math.max(0, fieldMonsters.length - 1);
                var estimatedAtk = AIEffectiveSummonAtk(mDef) + (oppMonstersCount * 200) - (otherOwnMonsters * 500);
                summonable.push({
                    name: mName,
                    def: mDef,
                    reqTributes: 1,
                    tributes: [tribute],
                    isInfernal: true,
                    score: estimatedAtk - (getMonsterAtk(tribute.card) * 0.6)
                });
            }
            return;
        }

        var req = (typeof getRequiredTributes === 'function') ? getRequiredTributes(mDef.level) : 0;
        var isMausoleum = (typeof isMausoleumActive === 'function') && isMausoleumActive() && mDef.id !== 'solar-apex-tyrant';
        var lpCost = req * 1000;

        // Effect-retrigger monsters (e.g. Void Sentinel) are only worth tribute
        // summoning (via tributes OR Mausoleum LP) if their on-summon effect
        // has live targets.
        if (mDef.id === 'void-sentinel' && req > 0) {
            var vsPlayerHand = (GameState.player.hand) ? GameState.player.hand.length : 0;
            var vsPlayerSets = 0;
            for (var vsz = 1; vsz <= 6; vsz++) {
                var vsp = GameState.player.field.spells[vsz];
                if (vsp && vsp.position === 'set') vsPlayerSets++;
            }
            if (vsPlayerHand === 0 && vsPlayerSets === 0) return;
        }

        if (req === 0 && freeZones > 0) {
            summonable.push({ name: mName, def: mDef, reqTributes: 0, score: AIEffectiveSummonAtk(mDef) });
        } else if (req > 0 && isMausoleum && freeZones > 0 && GameState.computer.lp > lpCost + 1000) {
            // Mausoleum of Offerings option: pay LP to summon high-level monster directly
            var gainAtk = AIEffectiveSummonAtk(mDef);
            if (gainAtk >= 1800) {
                summonable.push({
                    name: mName,
                    def: mDef,
                    reqTributes: req,
                    isMausoleum: true,
                    lpCost: lpCost,
                    score: gainAtk * 1.15 - (lpCost * 0.25)
                });
            }
        } else if (req > 0) {
            var tributableField = fieldMonsters.filter(function(entry) {
                var fDef = cards[entry.card.cardId];
                return !entry.card.cannotBeTributed && !(fDef && fDef.cannotBeTributed);
            }).map(function(entry) {
                return { who: 'computer', zone: entry.zone, card: entry.card, isOpponent: false };
            });

            // Never tribute a copy of X to tribute summon another copy of X
            // unless an opponent monster is being sacrificed instead.
            tributableField = tributableField.filter(function(t) {
                return t.card.cardId !== mDef.id;
            });

            if (validOppCandidate) {
                tributableField.push(validOppCandidate);
            }

            if (tributableField.length < req) return;

            // Prioritize opponent's sacrifice target first (costs 0 lost ATK for computer), then lowest ATK own monsters
            var sortedField = tributableField.slice().sort(function(a, b) {
                if (a.isOpponent && !b.isOpponent) return -1;
                if (!a.isOpponent && b.isOpponent) return 1;
                return getMonsterAtk(a.card) - getMonsterAtk(b.card);
            });
            var tributes = sortedField.slice(0, req);
            var lostAtk = tributes.reduce(function(acc, t) { return acc + (t.isOpponent ? 0 : getMonsterAtk(t.card)); }, 0);
            var gainAtk = AIEffectiveSummonAtk(mDef);

            // AI considers tribute worth it if opponent monster is sacrificed or gain is positive
            if (validOppCandidate || gainAtk >= 2000 || gainAtk > (lostAtk * 0.8)) {
                var score = gainAtk - (lostAtk * 0.5) + (validOppCandidate ? 1500 : 0);
                if (mDef.id === 'jinzoid') {
                    var playerSetTraps = 0;
                    for (var pz = 1; pz <= 6; pz++) {
                        var ps = GameState.player.field.spells[pz];
                        if (ps && ps.position === 'set') playerSetTraps++;
                    }
                    score += (playerSetTraps * 400);
                }
                if (mDef.id === 'aegis-seraph') {
                    var playerDefMonsters = GameState.getMonstersOnField('player').filter(function(m) {
                        return m.card && (m.card.position === 'defense-up' || m.card.position === 'defense-down');
                    }).length;
                    score += 400 + (playerDefMonsters * 300);
                }
                if (mDef.id === 'void-sentinel') {
                    // Value based on opponent's hand size and set cards
                    var playerHandSize = (GameState.player.hand) ? GameState.player.hand.length : 0;
                    var playerSetTraps = 0;
                    for (var vz = 1; vz <= 6; vz++) {
                        var vs = GameState.player.field.spells[vz];
                        if (vs && vs.position === 'set') playerSetTraps++;
                    }
                    score += 300 + (playerHandSize * 200) + (playerSetTraps * 250);
                }
                if (mDef.id === 'void-monarch') {
                    // Value banish effect based on opponent's GY size
                    var playerGY = (GameState.player.graveyard) ? GameState.player.graveyard.length : 0;
                    score += 200 + (playerGY * 150);
                }
                if (mDef.id === 'solar-apex-tyrant') {
                    // 3200 ATK boss — huge value when board will be solo (no -500 penalty)
                    var compMonCount = GameState.getMonstersOnField('computer').length;
                    // Prefer if AI can clear its own chaff first or already solo
                    if (compMonCount === 0) score += 600;
                    else if (compMonCount === 1) score += 350;
                    else score -= 200; // avoid summoning into -500 penalty unless overwhelming
                    // Bonus for opponent monsters to burn off
                    var playerMons = GameState.getMonstersOnField('player').length;
                    score += playerMons * 180;
                }
                summonable.push({
                    name: mName,
                    def: mDef,
                    reqTributes: req,
                    tributes: tributes,
                    score: score
                });
            }
        }
    });

    if (summonable.length === 0) return;

    // Pick highest score monster
    summonable.sort(function(a, b) { return b.score - a.score; });
    var chosen = summonable[0];

    // If Mausoleum of Offerings was used
    if (chosen.isMausoleum) {
        GameState.computer.lp -= chosen.lpCost;
        updateResourceCounters();
        if (typeof showFloatingDamage === 'function') {
            showFloatingDamage('computer', chosen.lpCost);
        }
        var mode = AICalcMonsterPosition(chosen.name);
        var firstFree = getFirstFreeZone('computer');
        var actionType = (mode === 'defense-down') ? 'Tribute Set' : 'Tribute Summon';
        var stanceLabel = (mode === 'defense-down') ? 'Defense Position' : 'Attack Position';
        var monsterLabel = (mode === 'defense-down') ? 'a monster' : '<em>' + chosen.def.name + '</em>';

        addToFeed('Computer pays <strong>' + chosen.lpCost + ' LP</strong> via <em>Mausoleum of Offerings</em> to ' + actionType + ' ' + monsterLabel + ' in ' + stanceLabel + ' in zone #' + firstFree + ' without Tributing.\n\n');
        await sleep(getAnimDuration(350));
        await summonMonster('computer', chosen.name, false);
        if (typeof checkTributeSummonTriggers === 'function') {
            await checkTributeSummonTriggers('computer', chosen.def, firstFree);
        }
        await sleep(getAnimDuration(300));
        return;
    }

    // If tribute required, send tributes to GY first
    if (chosen.reqTributes > 0 && chosen.tributes) {
        var tributeNames = [];
        for (var t = 0; t < chosen.tributes.length; t++) {
            var tributeItem = chosen.tributes[t];
            var tWho = tributeItem.who || 'computer';
            var tZone = tributeItem.zone;
            var tDef = cards[tributeItem.card.cardId];
            var prefix = (tWho === 'player') ? "Player's " : "";
            tributeNames.push(prefix + (tDef ? tDef.name : 'a monster'));
            await destroyMonster(tWho, tZone);
            if (tWho === 'player' && GameState.turn && GameState.turn.tributeOfTheAgesTarget) {
                delete GameState.turn.tributeOfTheAgesTarget;
                var pSq = getSquareElm('player', tZone);
                if (pSq) pSq.find('.tribute-of-ages-badge').remove();
            }
        }

        var discardedCount = 0;
        if (chosen.isInfernal) {
            var infernalInst = GameState.computer.hand.find(function(c) { return c.cardId === chosen.name; });
            var remainingCards = GameState.computer.hand.filter(function(c) {
                return infernalInst ? c.uid !== infernalInst.uid : c.cardId !== chosen.name;
            });
            discardedCount = remainingCards.length;

            for (var d = 0; d < remainingCards.length; d++) {
                await discardCardToGraveyard('computer', remainingCards[d]);
            }

            GameState.computer.hand = infernalInst ? [infernalInst] : [];
            updateHandDisplay('computer');
            updateResourceCounters();
        }

        var mode = AICalcMonsterPosition(chosen.name);
        var firstFree = getFirstFreeZone('computer');
        var actionType = (mode === 'defense-down') ? 'Tribute Set' : 'Tribute Summon';
        var stanceLabel = (mode === 'defense-down') ? 'Defense Position' : 'Attack Position';
        var monsterLabel = (mode === 'defense-down') ? 'a monster' : '<em>' + chosen.def.name + '</em>';

        var discardMsg = (chosen.isInfernal && discardedCount > 0)
            ? ' and discards ' + discardedCount + ' other card(s) from hand'
            : '';

        addToFeed('Computer Tributes <strong>' + tributeNames.join(' and ') + '</strong>' + discardMsg + ' to ' + actionType + ' ' + monsterLabel + ' in ' + stanceLabel + ' in zone #' + firstFree + '.\n\n');
        await sleep(getAnimDuration(350));
        await summonMonster('computer', chosen.name, true);
        if (typeof checkTributeSummonTriggers === 'function') {
            await checkTributeSummonTriggers('computer', chosen.def, firstFree);
        }
    } else {
        await summonMonster('computer', chosen.name, false);
    }
    await sleep(getAnimDuration(300));
}

// Tactical evaluation for equipping an equip spell to a computer monster
function AIEvaluateEquipSpell(equipDef) {
    if (!equipDef || equipDef.subType !== 'equip') return null;
    var faceUpOwn = GameState.getMonstersOnField('computer').filter(function(m) {
        var fDef = cards[m.card.cardId];
        // Monsters that self-destruct when targeted (e.g. Nether Wraith) can
        // never be valid equip targets — equipping them kills them.
        if (fDef && (fDef.selfDestructsOnTargeting || m.card.selfDestructsOnTargeting)) return false;
        return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && (typeof isImmuneToSpellTargeting === 'function' ? !isImmuneToSpellTargeting(m.card, 'computer') : true);
    });
    if (faceUpOwn.length === 0) return null;

    var playerMonsters = GameState.getMonstersOnField('player');
    var maxPlayerAtk = 0;
    playerMonsters.forEach(function(pm) {
        if (pm.card && pm.card.position === 'attack') {
            var pAtk = getMonsterAtk(pm.card);
            if (pAtk > maxPlayerAtk) maxPlayerAtk = pAtk;
        }
    });

    var hasSwordsProtection = hasActiveCard('computer', 'swords-of-revealing-light');
    var hasTrapProtection = (typeof findSetTrapZone === 'function') && (
        findSetTrapZone('computer', 'radiant-backlash') !== null ||
        findSetTrapZone('computer', 'prism-of-retribution') !== null ||
        findSetTrapZone('computer', 'vortex-recall') !== null ||
        findSetTrapZone('computer', 'warding-veil') !== null ||
        findSetTrapZone('computer', 'mirrorfall') !== null
    );
    var hasSafeBoard = hasSwordsProtection || hasTrapProtection || playerMonsters.length === 0;

    var candidates = [];
    faceUpOwn.forEach(function(m) {
        var mDef = cards[m.card.cardId];
        if (!mDef) return;

        // Check type/attribute restrictions if equip has them
        if (equipDef.targetType && mDef.monsterType !== equipDef.targetType) return;
        if (equipDef.targetAttribute && mDef.attribute !== equipDef.targetAttribute) return;

        var currentAtk = getMonsterAtk(m.card);
        var boost = equipDef.atkMod || 0;
        var projectedAtk = currentAtk + boost;

        var score = -1;

        // 1. Breakthrough: Equipping allows monster to defeat a player monster it couldn't beat before
        if (maxPlayerAtk > 0 && currentAtk < maxPlayerAtk && projectedAtk >= maxPlayerAtk) {
            score = 2000 + projectedAtk;
        }
        // 2. Safe Board / Dominant Beatstick: Board is protected, or player has no monsters, or projected ATK is safely above player's strongest monster
        else if (hasSafeBoard || projectedAtk > maxPlayerAtk + 200) {
            score = 1000 + projectedAtk;
        }
        // 3. Lethal Mitigation: Player would inflict lethal damage this turn without the stat boost
        else if (maxPlayerAtk > currentAtk && (maxPlayerAtk - currentAtk >= (GameState.computer.lp || 0))) {
            score = 800 + projectedAtk;
        }
        // 4. Doomed Monster without Breakthrough or Protection:
        // If projectedAtk < maxPlayerAtk and we have no protection, playing the equip is futile — hold it!
        else {
            score = -1;
        }

        if (score > 0) {
            candidates.push({ entry: m, score: score, projectedAtk: projectedAtk });
        }
    });

    if (candidates.length === 0) return null;
    candidates.sort(function(a, b) { return b.score - a.score; });
    return candidates[0].entry;
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
                        if (!isIdenticalActive && shouldAIPlayFieldSpell(def)) {
                            shouldPlay = true;
                            zoneKind = 'field';
                            targetSquare = getFieldZoneElm('computer');
                        }
                    }
                } else {
                    if (getNumOfFreeZones('computer') > 0) {
                        if (def.ai && typeof def.ai.shouldPlay === 'function') {
                            shouldPlay = def.ai.shouldPlay('computer', instance);
                        } else if (def.id === 'pot-of-greed' || def.id === 'celestial-tithe' || def.id === 'bargain-of-fortune') {
                            shouldPlay = true;
                        } else if (def.id === 'raigeki') {
                            shouldPlay = GameState.getMonstersOnField('player').length > 0;
                        } else if (def.id === 'dark-hole') {
                            // Handled in the early removal pass (AIPlayDarkHole)
                            // so the wipe never hits monsters summoned this turn.
                            shouldPlay = false;
                        } else if (def.id === 'change-of-heart') {
                            var cohTargets = GameState.getMonstersOnField('player').filter(function(m) {
                                return !isImmuneToSpellTargeting(m.card, 'computer');
                            });
                            shouldPlay = (getFirstFreeZone('computer') !== undefined) && cohTargets.length > 0;
                        } else if (def.id === 'remove-trap') {
                            shouldPlay = findFaceUpTrap('player') !== null;
                        } else if (def.id === 'mystical-space-typhoon') {
                            var hasPlayerST = false;
                            for (var z = 1; z <= 6; z++) {
                                if (GameState.player.field.spells[z]) hasPlayerST = true;
                            }
                            if (GameState.player.field.fieldZone) hasPlayerST = true;
                            shouldPlay = hasPlayerST;
                        } else if (def.id === 'heavy-storm') {
                            var compSTCount = 0;
                            for (var z1 = 1; z1 <= 6; z1++) {
                                if (GameState.computer.field.spells[z1]) compSTCount++;
                            }
                            if (GameState.computer.field.fieldZone) compSTCount++;

                            var playerSTCount = 0;
                            for (var z2 = 1; z2 <= 6; z2++) {
                                if (GameState.player.field.spells[z2]) playerSTCount++;
                            }
                            if (GameState.player.field.fieldZone) playerSTCount++;

                            shouldPlay = playerSTCount > 0 && (compSTCount === 0 || playerSTCount > compSTCount);
                        } else if (def.id === 'fissure') {
                            var playerMonsters = GameState.getMonstersOnField('player');
                            var targetablePlayerMonsters = playerMonsters.filter(function(m) {
                                return !isImmuneToSpellTargeting(m.card, 'computer');
                            });
                            shouldPlay = targetablePlayerMonsters.length > 0;
                        } else if (def.id === 'tribute-to-the-doomed') {
                            var monstersOnField = Queries.getAllMonsters();
                            var targetableMonsters = monstersOnField.filter(function(m) {
                                return !isImmuneToSpellTargeting(m.card, 'computer');
                            });
                            var hasDiscardCandidate = GameState.computer.hand.length >= 2;
                            shouldPlay = targetableMonsters.length > 0 && hasDiscardCandidate;
                        } else if (def.id === 'monster-reborn') {
                            var targetableGY = (typeof getGraveyardMonsters === 'function') ? getGraveyardMonsters() : [];
                            shouldPlay = targetableGY.length > 0 && getFirstFreeZone('computer') !== undefined;
                        } else if (def.id === 'mausoleum-of-offerings') {
                            var playerMons = GameState.getMonstersOnField('player').length;
                            var compMons = GameState.getMonstersOnField('computer').length;
                            var handMonsters = GameState.computer.hand.filter(function(c) {
                                var d = cards[c.cardId]; return d && d.type === 'monsters';
                            });
                            var hasHighLvl = handMonsters.some(function(c) {
                                var d = cards[c.cardId]; return d && (d.level >= 5 || d.id === 'infernal-incinerator');
                            });
                            shouldPlay = GameState.isFieldZoneEmpty('computer') &&
                                ((hasHighLvl && getFirstFreeZone('computer') !== undefined) || ((compMons === 0 || playerMons > compMons) && getFirstFreeZone('computer') !== undefined));
                        } else if (def.id === 'vanguards-accord') {
                            var compCount = GameState.getMonstersOnField('computer').length;
                            var compDeck = (GameState.computer && GameState.computer.deck) ? GameState.computer.deck : [];
                            var hasValidTarget = compDeck.some(function(id) {
                                var d = cards[id];
                                return d && d.type === 'monsters' && (!d.subType || d.subType === 'normal' || d.subType === '') && (d.level || 0) <= 4 && !d.isToken;
                            });
                            shouldPlay = (compCount === 0 && hasValidTarget && getFirstFreeZone('computer') !== undefined);
                        } else if (def.id === 'lunar-grimoire') {
                            var faceUpMonsters = GameState.getMonstersOnField('player').filter(function(m) {
                                var d = cards[m.card.cardId];
                                var isToken = m.card.isToken || (d && (d.isToken || d.subType === 'token'));
                                return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && !isToken && !isImmuneToSpellTargeting(m.card, 'computer');
                            });
                            shouldPlay = faceUpMonsters.length > 0;
                        } else if (def.id === 'astral-phantoms') {
                            var compMons = GameState.getMonstersOnField('computer').length;
                            var playerMons = GameState.getMonstersOnField('player').length;
                            shouldPlay = (compMons === 0 || playerMons > compMons) && getFirstFreeZone('computer') !== undefined;
                        } else if (def.id === 'essence-siphon') {
                            var compFaceUpMons = GameState.getMonstersOnField('computer').filter(function(m) {
                                return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && !isImmuneToSpellTargeting(m.card, 'computer');
                            });
                            var playerFaceUpMons = GameState.getMonstersOnField('player').filter(function(m) {
                                return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && !isImmuneToSpellTargeting(m.card, 'computer');
                            });
                            shouldPlay = compFaceUpMons.length > 0 && playerFaceUpMons.length > 0 && playerFaceUpMons.some(function(pm) {
                                return getMonsterAtk(pm.card) >= 1000;
                            });
                        } else if (def.id === 'double-tribute-surge') {
                            var handMonsters = GameState.computer.hand.filter(function(c) {
                                var d = cards[c.cardId]; return d && d.type === 'monsters';
                            });
                            var hasHighLvl = handMonsters.some(function(c) {
                                var d = cards[c.cardId]; return d && (d.level >= 5 || d.id === 'infernal-incinerator');
                            });
                            shouldPlay = (hasHighLvl && handMonsters.length >= 2) || (handMonsters.length >= 2 && getNumOfFreeZones('computer') >= 2);
                        } else if (def.id === 'phantom-catalyst') {
                            var compMons = GameState.getMonstersOnField('computer').length;
                            var playerMons = GameState.getMonstersOnField('player').length;
                            var handMonsters = GameState.computer.hand.filter(function(c) {
                                var d = cards[c.cardId]; return d && d.type === 'monsters';
                            });
                            var hasHighLvl = handMonsters.some(function(c) {
                                var d = cards[c.cardId]; return d && (d.level >= 5 || d.id === 'infernal-incinerator');
                            });
                            shouldPlay = (hasHighLvl && getFirstFreeZone('computer') !== undefined) || ((compMons === 0 || playerMons > compMons) && getFirstFreeZone('computer') !== undefined);
                        } else if (def.id === 'tribute-of-the-ages') {
                            var opp = GameState.getOpponent('computer');
                            var oppMonsters = GameState.getMonstersOnField(opp).filter(function(m) {
                                var d = cards[m.card.cardId];
                                return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && !(m.card.cannotBeTributed || (d && d.cannotBeTributed)) && !isImmuneToSpellTargeting(m.card, 'computer');
                            });
                            var hasTributeMonsterInHand = GameState.computer.hand.some(function(c) {
                                var d = cards[c.cardId];
                                return d && d.type === 'monsters' && (d.level >= 5 || d.id === 'infernal-incinerator');
                            });
                            shouldPlay = (oppMonsters.length > 0 && hasTributeMonsterInHand && getFirstFreeZone('computer') !== undefined);
                        } else if (def.id === 'swords-of-revealing-light') {
                            shouldPlay = !hasActiveCard('computer', 'swords-of-revealing-light');
                        } else if (def.id === 'gravity-tether') {
                            shouldPlay = !hasActiveCard('computer', 'gravity-tether');
                        } else if (def.subType === 'equip') {
                            var bestEquipTarget = AIEvaluateEquipSpell(def);
                            shouldPlay = (bestEquipTarget !== null);
                        } else {
                            // Only default to true if the card actually meets its activation condition
                            shouldPlay = (typeof def.canActivate !== 'function') || def.canActivate('computer');
                        }
                    }
                }

                // Double check that activation condition is strictly met
                if (shouldPlay && typeof def.canActivate === 'function' && !def.canActivate('computer')) {
                    shouldPlay = false;
                }

                if (shouldPlay) {
                    var zoneNum = zoneKind === 'field' ? null : getFirstFreeZone('computer');
                    if (zoneNum === undefined && zoneKind !== 'field') continue;

                    var success = await playNonMonsterCard('computer', getHandCardElmByUid('computer', instance.uid), targetSquare || getSquareElm('computer', zoneNum), def, zoneKind);
                    if (success !== false) {
                        playedAny = true;
                        cardPlayedThisPass = true;
                        await sleep(getAnimDuration(300));
                        break;
                    }
                }

            } else if (def.type === 'traps') {
                var shouldSet = true;

                if (def.id === 'dragon-capture-jar') {
                    var alreadyActive = (typeof hasActiveCard === 'function') && (hasActiveCard('computer', 'dragon-capture-jar') || hasActiveCard('player', 'dragon-capture-jar'));
                    var alreadySet = (typeof findSetTrapZone === 'function') && (findSetTrapZone('computer', 'dragon-capture-jar') !== null);
                    if (alreadyActive || alreadySet) {
                        shouldSet = false;
                    } else {
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

                        if (compHasDragon && !playerHasDragon) {
                            shouldSet = false;
                        }
                    }
                } else if (def.id === 'torrential-tribute' || def.id === 'radiant-backlash' || def.id === 'crypt-awakening' || def.id === 'eldritch-tether' || def.id === 'arcane-disruptor' || def.id === 'arcane-ward' || def.id === 'prism-of-retribution' || def.id === 'vortex-recall' || def.id === 'eclipse-null-prism' || def.id === 'warding-veil' || def.id === 'mirrorfall') {
                    var alreadySet = (typeof findSetTrapZone === 'function') && (findSetTrapZone('computer', def.id) !== null);
                    if (alreadySet) {
                        shouldSet = false;
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

        // Check if AI can activate a set Crypt Awakening or Eldritch Tether
        var setRevivalZone = (typeof findSetTrapZone === 'function') ? (findSetTrapZone('computer', 'eldritch-tether') || findSetTrapZone('computer', 'crypt-awakening')) : null;
        if (setRevivalZone !== null && getFirstFreeZone('computer') !== undefined) {
            var gyMonsters = GameState.computer.graveyard.filter(function(c) {
                var d = cards[c.cardId];
                return d && d.type === 'monsters' && !d.isToken && d.subType !== 'token';
            });
            if (gyMonsters.length > 0) {
                var trapInst = GameState.computer.field.spells[setRevivalZone];
                if (trapInst) {
                    await activateCard('computer', trapInst, setRevivalZone);
                    playedAny = true;
                }
            }
        }

        // Check if AI can activate a set Vortex Recall to bounce a high-threat player monster
        var setVRZone = (typeof findSetTrapZone === 'function') ? findSetTrapZone('computer', 'vortex-recall') : null;
        if (setVRZone !== null) {
            var playerMonsters = GameState.getMonstersOnField('player');
            var highThreat = playerMonsters.some(function(m) {
                var d = cards[m.card.cardId];
                var atk = (typeof getMonsterAtk === 'function') ? getMonsterAtk(m.card) : (d ? d.atk || 0 : 0);
                return atk >= 1600 || (d && d.level >= 5);
            });
            if (highThreat) {
                var vrInst = GameState.computer.field.spells[setVRZone];
                if (vrInst) {
                    await activateCard('computer', vrInst, setVRZone);
                    playedAny = true;
                }
            }
        }

        if (!cardPlayedThisPass) break;
    }

    if (playedAny) {
        updateResourceCounters();
    }
}

/**
 * Tactical evaluation of whether the AI should activate a Field Spell.
 * Ensures the AI doesn't activate field spells that disproportionately empower the player
 * or waste Mausoleum of Offerings without high-level tribute monsters.
 */
function shouldAIPlayFieldSpell(fieldDef) {
    if (!fieldDef) return false;

    // 1. Mausoleum of Offerings: only play if AI has a high-level monster in hand and sufficient LP
    if (fieldDef.id === 'mausoleum-of-offerings') {
        var compLP = GameState.computer.lp;
        var hasTributeMonsterInHand = GameState.computer.hand.some(function(c) {
            var d = cards[c.cardId];
            if (!d || d.type !== 'monsters') return false;
            var reqTributes = (typeof getRequiredTributes === 'function') ? getRequiredTributes(d.level) : 0;
            return reqTributes > 0 && compLP > (reqTributes * 1000);
        });
        return hasTributeMonsterInHand;
    }

    // 2. Stat-altering Field Spells: calculate net ATK differential
    var compMonsters = GameState.getMonstersOnField('computer');
    var playerMonsters = GameState.getMonstersOnField('player');

    // Also factor in monsters in AI's hand that could be summoned
    var compHandMonsters = GameState.computer.hand.filter(function(c) {
        var d = cards[c.cardId];
        return d && d.type === 'monsters';
    });

    var compBenefit = 0;
    compMonsters.forEach(function(m) {
        var mDef = cards[m.card.cardId];
        if (mDef) {
            var simMods = getFieldMods(mDef, fieldDef.id);
            var curMods = getFieldMods(mDef);
            compBenefit += (simMods.atk - curMods.atk);
        }
    });
    compHandMonsters.forEach(function(c) {
        var mDef = cards[c.cardId];
        if (mDef) {
            var simMods = getFieldMods(mDef, fieldDef.id);
            var curMods = getFieldMods(mDef);
            compBenefit += Math.floor((simMods.atk - curMods.atk) * 0.6); // Weight hand monsters moderately
        }
    });

    var playerBenefit = 0;
    playerMonsters.forEach(function(m) {
        var isFaceUp = m.card && !m.card.faceDown && m.card.position !== 'defense-down';
        if (isFaceUp) {
            var mDef = cards[m.card.cardId];
            if (mDef) {
                var simMods = getFieldMods(mDef, fieldDef.id);
                var curMods = getFieldMods(mDef);
                playerBenefit += (simMods.atk - curMods.atk);
            }
        }
    });

    // 1. Never play if player gets any positive ATK boost while AI gets 0 or negative boost
    if (playerBenefit > 0 && compBenefit <= 0) {
        return false;
    }

    // 2. Never play if player's gain exceeds AI's gain
    if (playerBenefit >= compBenefit && playerBenefit > 0) {
        return false;
    }

    // 3. If AI has 0 gain and no hand monsters that benefit, do not play
    if (compBenefit <= 0) {
        return false;
    }

    return true;
}
// AI Special Summons Umbra Herald from hand when it controls a face-up Fiend
async function AISpecialSummonUmbraHerald() {
    var heraldInst = GameState.computer.hand.find(function(c) { return c.cardId === 'umbra-herald'; });
    if (!heraldInst) return;
    if (getNumOfFreeZones('computer') <= 0) return;
    if (typeof controlsFaceUpFiend !== 'function' || !controlsFaceUpFiend('computer')) return;

    var zone = getFirstFreeZone('computer');
    var mode = AICalcMonsterPosition('umbra-herald');
    var source = getHandCardElm('computer', 'umbra-herald');
    var target = getSquareElm('computer', zone);

    target.attr('data-card-name', 'umbra-herald');
    target.attr('data-card-type', 'monsters');
    target.attr('data-card-position', mode);

    addToFeed('Computer Special Summons <em>Umbra Herald</em> in zone #' + zone + ' without using its Normal Summon!\n\n');
    await sleep(getAnimDuration(300));
    await moveCard('computer', source, target, mode, true, true);
}
