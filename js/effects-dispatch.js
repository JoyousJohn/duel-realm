/**
 * Effects Dispatch: Central activateCard dispatcher for Spell/Trap/Field
 * activations. Delegates to per-card modules (effects-spells, effects-traps,
 * effects-monsters, effects-targeting, effects-core) for prompt/resolve.
 */
async function activateCard(who, instance, zoneNum) {
    var cardId = instance.cardId;
    var def = cards[cardId];
    if (!def) return;

    var opp = GameState.getOpponent(who);

    // Arcane Ward: Opponent cannot activate Spell/Trap Cards for the rest of this turn
    if (GameState.turn && GameState.turn.spellTrapLocked && GameState.turn.spellTrapLockedBy === who) {
        addToFeed('(Locked) <em>Arcane Ward</em>\'s barrier prevents ' + formatWho(who) + ' from activating Spell/Trap Cards this turn.\n\n');
        // Clean up from field if prematurely placed
        await destroySpellTrap(who, zoneNum, zoneNum === null || zoneNum === undefined, false);
        return;
    }

    // Jinzoid trap negation
    if (def.type === 'traps' && isJinzoidActive()) {
        addToFeed('(Negated) <em>Jinzoid</em>\'s continuous field negation prevents Trap Cards from activating!\n\n');
        return;
    }

    // Void Sentinel: Check if this card instance is negated
    if (instance && isNegatedByVoidSentinel(instance)) {
        addToFeed('(Negated) <em>' + def.name + '</em> is locked by <em>Void Sentinel</em>\'s gaze — its effects cannot be activated!\n\n');
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
                            notifyUmbraHeraldGraveyardSend('computer', discarded);
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
            targetSquareStateFix(who, zoneNum, 'active');
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
                    addToFeed('No valid monster in Graveyard to revive; ' + def.name + ' returns to Set Position.\n');
                    revertContinuousTrapToSet(who, zoneNum);
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

            if (donorInst && donorInst.cardId === 'nether-wraith') {
                addToFeed('<em>Nether Wraith</em> was targeted by Essence Siphon! Its self-destruction effect activates!\n');
                await destroyMonster(donorChoice.side, donorChoice.zone);
                donorInst = null;
            }
            if (recipientInst && recipientInst.cardId === 'nether-wraith') {
                addToFeed('<em>Nether Wraith</em> was targeted by Essence Siphon! Its self-destruction effect activates!\n');
                await destroyMonster(recipientChoice.side, recipientChoice.zone);
                recipientInst = null;
            }

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
                    notifyUmbraHeraldGraveyardSend('computer', discardedCard);
                }
                addToFeed('<em>' + def.name + '</em>: AI discards <strong>' + (discardDef ? discardDef.name : 'a card') + '</strong>.\n');
                updateHandDisplay('computer');
                updateGraveyardZones();

                // Target highest ATK opponent monster (skip any immune to spell targeting)
                var oppField = GameState.getMonstersOnField('player').filter(function(m) {
                    return !isImmuneToSpellTargeting(m.card, who);
                });
                oppField.sort(function(a, b) { return getMonsterAtk(b.card) - getMonsterAtk(a.card); });
                var aiTarget = oppField[0];
                var aiTargetWho = 'player';

                if (!aiTarget) {
                    // No opponent monsters available to destroy
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
