/**
 * Effects Monsters: Yomi Ship, Giant Germ, Exiled Force, Gryphon Stormlord,
 * tribute summon triggers, Gale Swiftblade, Shadow Infiltrator, Void Monarch,
 * Umbra Herald, Soul Lantern Keeper and related graveyard/battle effects.
 * Split from card-effects.js (3609-4827).
 */
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
    } else if (destroyedInst.cardId === 'void-monarch') {
        // "If this card is destroyed by battle: Add 1 DARK monster from your Deck to your hand."
        var vmDef = cards[destroyedInst.cardId];
        var vmName = vmDef ? vmDef.name : 'Void Monarch';
        var vmDeck = GameState[destroyedWho] && GameState[destroyedWho].deck;

        addToFeed('<em>' + vmName + '</em> activates from the Graveyard!\n');
        addToFeed('<em>' + vmName + '</em> searches its Deck for a DARK monster to add to the hand!\n');

        if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

        if (vmDeck && vmDeck.length > 0) {
            var darkMonsters = [];
            for (var di = 0; di < vmDeck.length; di++) {
                var dmDef = cards[vmDeck[di]];
                if (dmDef && dmDef.type === 'monsters' && dmDef.attribute === 'DARK' && !dmDef.isToken) {
                    darkMonsters.push({ cardId: vmDeck[di], def: dmDef });
                }
            }

            if (darkMonsters.length === 0) {
                addToFeed('<em>' + vmName + '</em>: No DARK monsters in the Deck.\n\n');
                return;
            }

            var chosenDark = null;
            if (destroyedWho === 'player') {
                chosenDark = await promptPlayerVoidMonarchSearch(darkMonsters);
            } else {
                // AI: pick highest ATK DARK monster
                darkMonsters.sort(function(a, b) { return (b.def.atk || 0) - (a.def.atk || 0); });
                chosenDark = darkMonsters[0];
            }

            if (!chosenDark) {
                addToFeed('<em>' + vmName + '</em> search was cancelled.\n\n');
                return;
            }

            // Remove chosen card from deck
            var deckIdx = GameState[destroyedWho].deck.indexOf(chosenDark.cardId);
            if (deckIdx !== -1) {
                GameState[destroyedWho].deck.splice(deckIdx, 1);
                if (typeof window.deck !== 'undefined') window.deck = GameState[destroyedWho].deck;
            }

            var vmInst = new CardInstance(chosenDark.cardId);
            GameState[destroyedWho].hand.push(vmInst);
            addCardToHand(destroyedWho, chosenDark.cardId, vmInst.uid, false);
            updateHandDisplay(destroyedWho);
            updateResourceCounters();

            addToFeed('<em>' + vmName + '</em> added <strong>' + chosenDark.def.name + '</strong> to the hand!\n\n');
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

    // 1b. Void Sentinel: Negate 1 card in opponent's hand or Set on field
    else if (cardDef.id === 'void-sentinel') {
        var opp = GameState.getOpponent(who);
        var candidates = [];

        // Opponent's hand cards (revealed to the player)
        if (GameState[opp] && GameState[opp].hand) {
            GameState[opp].hand.forEach(function(inst) {
                var d = cards[inst.cardId];
                candidates.push({
                    side: opp,
                    zone: -1,
                    inst: inst,
                    def: d,
                    name: d ? d.name : 'Card',
                    customOwnerLabel: 'HAND',
                    customOwnerClass: 'tag-opponent',
                    statsHtml: '<span class="rebirth-tile-stats">' +
                        (d && d.type === 'monsters'
                            ? 'LVL ' + (d.level || 1) + ' • ATK ' + (d.atk || 0) + ' / DEF ' + (d.def || 0)
                            : (d ? d.type.toUpperCase() : 'CARD')) +
                        '</span>'
                });
            });
        }

        // Opponent's Set Spell/Trap cards on the field
        for (var z = 1; z <= 6; z++) {
            var s = GameState[opp].field.spells[z];
            if (s && s.position === 'set') {
                var sDef = cards[s.cardId];
                candidates.push({
                    side: opp,
                    zone: z,
                    inst: s,
                    def: sDef,
                    name: 'Set Card',
                    customOwnerLabel: 'SET • ZONE #' + z,
                    customOwnerClass: 'tag-opponent',
                    statsHtml: '<span class="rebirth-tile-stats">Set Spell/Trap</span>'
                });
            }
        }

        if (candidates.length === 0) {
            addToFeed('<em>Void Sentinel</em> was Tribute Summoned, but no valid cards found.\n\n');
            return;
        }

        addToFeed('<em>Void Sentinel</em> triggers! Look at opponent\'s hand and Set cards.\n');

        var chosen = await TargetEngine.requestTarget(who, {
            title: 'VOID SENTINEL',
            subtitle: 'CHOOSE 1 CARD TO NEGATE UNTIL END OF YOUR NEXT TURN',
            badge: { category: 'VOID GAZE', color: '#a855f7', glowColor: 'rgba(168, 85, 247, 0.45)' },
            candidates: candidates,
            aiPick: function(list) {
                // AI picks the player's highest-level monster or first card
                var monsters = list.filter(function(c) { return c.def && c.def.type === 'monsters'; });
                if (monsters.length > 0) {
                    monsters.sort(function(a, b) { return (b.def.level || 0) - (a.def.level || 0); });
                    return monsters[0];
                }
                return list[0];
            }
        });

        if (chosen) {
            var cDef = chosen.def || (chosen.inst ? cards[chosen.inst.cardId] : null);
            var cName = cDef ? cDef.name : 'a card';

            // Determine which turn the negation expires (end of summoner's next turn)
            var expiryTurn = turnCount + 2;

            // Store negation on the card instance
            if (chosen.inst) {
                chosen.inst.negatedUntilTurn = expiryTurn;
                chosen.inst.negatedBy = 'void-sentinel';
            }

            addToFeed('<em>Void Sentinel</em> locks its gaze on ' + formatWho(chosen.side) + '\'s <strong>' + cName + '</strong> — its effects are negated until the end of your next turn!\n\n');
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
// Gaia Power Field Spell Destruction Trigger (Special Summon Lv4 or lower EARTH from Deck)
// ---------------------------------------------------------------------------
var gaiaPowerResolver = null;

async function triggerGaiaPowerRebirth(who) {
    var deckArr = (GameState && GameState[who] && GameState[who].deck) ? GameState[who].deck : [];
    var freeZone = (typeof getFirstFreeZone === 'function') ? getFirstFreeZone(who) : undefined;

    var validTargets = [];
    deckArr.forEach(function(cardId) {
        var d = cards[cardId];
        if (d && d.type === 'monsters' && d.attribute === 'EARTH' && (d.level || 0) <= 4 && !d.isToken) {
            validTargets.push({ cardId: cardId, def: d });
        }
    });

    if (validTargets.length === 0) {
        addToFeed('<em>Gaia Power</em>: No eligible Level 4 or lower EARTH monsters in ' + formatWho(who) + '\'s Deck.\n\n');
        return;
    }
    if (freeZone === undefined) {
        addToFeed('<em>Gaia Power</em>: No free Monster Zones for ' + formatWho(who) + ' to Special Summon.\n\n');
        return;
    }

    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

    if (who === 'player') {
        await promptPlayerGaiaPower(validTargets);
    } else {
        validTargets.sort(function(a, b) { return (b.def.atk || 0) - (a.def.atk || 0); });
        var aiChoice = validTargets[0];
        addToFeed('<em>Gaia Power</em> is destroyed: Computer Special Summons <strong>' + aiChoice.def.name + '</strong> from their Deck!\n\n');
        await specialSummonMonsterFromDeck('computer', aiChoice.cardId, 'attack');
    }
}

function promptPlayerGaiaPower(validTargets) {
    return new Promise(function(resolve) {
        gaiaPowerResolver = resolve;

        var grid = $('#gaia-power-grid');
        grid.empty();

        // Deduplicate for display, count quantity
        var counts = {};
        validTargets.forEach(function(t) { counts[t.cardId] = (counts[t.cardId] || 0) + 1; });
        var uniqueIds = Object.keys(counts);

        uniqueIds.forEach(function(cardId) {
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
                $('#gaia-power-modal').fadeOut(120);
                addToFeed('<em>Gaia Power</em>: Special Summoned <strong>' + cardDef.name + '</strong> from your Deck!\n\n');
                await specialSummonMonsterFromDeck('player', cardId, position);
                if (typeof gaiaPowerResolver === 'function') {
                    var r = gaiaPowerResolver;
                    gaiaPowerResolver = null;
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

        $('#gaia-power-modal').fadeIn(150);
    });
}

function cancelGaiaPowerSelection() {
    $('#gaia-power-modal').fadeOut(120);
    if (typeof gaiaPowerResolver === 'function') {
        var r = gaiaPowerResolver;
        gaiaPowerResolver = null;
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


// ---------------------------------------------------------------------------
// Shadow Infiltrator: Discard 1 random card on battle damage
// ---------------------------------------------------------------------------

async function triggerShadowInfiltratorDiscard(attackerInst, attackerWho, defenderWho, damage) {
    var defenderHand = GameState[defenderWho] && GameState[defenderWho].hand;
    if (!defenderHand || defenderHand.length === 0) return;

    var randomIdx = Math.floor(Math.random() * defenderHand.length);
    var discardedInst = defenderHand.splice(randomIdx, 1)[0];
    var discardedDef = cards[discardedInst.cardId];

    GameState[defenderWho].graveyard.push(discardedInst);
    notifyUmbraHeraldGraveyardSend(defenderWho, discardedInst);

    addToFeed('<em>Shadow Infiltrator</em> forces ' + formatWho(defenderWho) + ' to discard <strong>' + (discardedDef ? discardedDef.name : 'a card') + '</strong>!\n\n');

    updateHandDisplay(defenderWho);
    updateGraveyardZones();
    updateResourceCounters();
}

// ---------------------------------------------------------------------------
// Void Monarch Ignition Effect: Banish 1 card from opponent's GY -> +500 ATK
// ---------------------------------------------------------------------------
var voidMonarchResolver = null;

async function activateVoidMonarch(who, zoneNum) {
    var opp = GameState.getOpponent(who);
    var oppGY = GameState[opp] && GameState[opp].graveyard;

    if (!oppGY || oppGY.length === 0) {
        if (who === 'player') {
            addToFeed('No cards in your opponent\'s Graveyard to banish for <em>Void Monarch</em>.\n\n');
        }
        return false;
    }

    var chosenInst = null;
    if (who === 'player') {
        chosenInst = await promptPlayerVoidMonarchBanish(oppGY);
    } else {
        // AI: target highest-ATK or most threatening card (pick last card - most recent)
        oppGY.forEach(function(inst) {
            var d = cards[inst.cardId];
            inst._score = (d && d.type === 'monsters') ? (d.atk || 0) : (d && d.type === 'spells' ? 800 : 600);
        });
        oppGY.sort(function(a, b) { return (b._score || 0) - (a._score || 0); });
        chosenInst = oppGY[0];
    }

    if (!chosenInst) {
        addToFeed('<em>Void Monarch</em> effect was cancelled.\n\n');
        return false;
    }

    // Remove from graveyard and banish
    var gyIdx = GameState[opp].graveyard.indexOf(chosenInst);
    if (gyIdx !== -1) GameState[opp].graveyard.splice(gyIdx, 1);
    if (!GameState[opp].banished) GameState[opp].banished = [];
    GameState[opp].banished.push(chosenInst);

    var chosenDef = cards[chosenInst.cardId];
    var chosenName = chosenDef ? chosenDef.name : 'a card';

    addToFeed('<em>Void Monarch</em> banishes <strong>' + chosenName + '</strong> from ' + formatWho(opp) + '\'s Graveyard!\n');

    // Apply +500 ATK until end of turn
    var monarchInst = GameState[who].field.monsters[zoneNum];
    if (monarchInst) {
        monarchInst.voidMonarchAtkBoost = (monarchInst.voidMonarchAtkBoost || 0) + 500;
        monarchInst.voidMonarchBoostTurn = turnCount;
    }

    updateResourceCounters();
    updateGraveyardZones();

    addToFeed('<em>Void Monarch</em> gains <strong>500 ATK</strong> until the end of this turn!\n\n');
    updateStatModBadges();

    return true;
}

// Player prompt for Void Monarch's GY banish selection
function promptPlayerVoidMonarchBanish(oppGY) {
    return new Promise(function(resolve) {
        var grid = $('#void-monarch-banish-grid');
        if (!grid.length) {
            // Fallback: auto-pick first if no modal DOM
            resolve(oppGY[0]);
            return;
        }
        grid.empty();
        voidMonarchResolver = resolve;

        oppGY.forEach(function(inst) {
            var d = cards[inst.cardId];
            var displayName = d ? d.name : 'Unknown';
            var typeLabel = d ? (d.type === 'monsters' ? (d.level || 0) + '★ ' + d.monsterType : d.type.toUpperCase()) : 'CARD';
            var stats = (d && d.type === 'monsters')
                ? 'ATK ' + (d.atk || 0) + ' / DEF ' + (d.def || 0)
                : (d && d.type === 'spells' ? 'SPELL' : 'TRAP');

            var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + (d ? d.file : 'card_back.png') + '" alt="' + displayName + '" class="rebirth-thumb-img">' +
                    '<span class="target-owner-tag tag-opponent">OPPONENT GY</span>' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + displayName + '</h4>' +
                    '<span class="rebirth-tile-stats">' + typeLabel + ' • ' + stats + '</span>' +
                '</div>' +
            '</div>');

            tile.on('click', function() {
                $('#void-monarch-banish-modal').fadeOut(120, function() {
                    voidMonarchResolver(inst);
                    voidMonarchResolver = null;
                });
            });

            grid.append(tile);
        });

        $('#void-monarch-banish-modal').fadeIn(150);
    });
}

// Player prompt for Void Monarch's Deck search (add to hand)
function promptPlayerVoidMonarchSearch(darkMonsters) {
    return new Promise(function(resolve) {
        var grid = $('#void-monarch-search-grid');
        if (!grid.length) {
            resolve(darkMonsters[0]);
            return;
        }
        grid.empty();
        voidMonarchResolver = resolve;

        darkMonsters.forEach(function(item) {
            var cardDef = item.def;
            var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + cardDef.file + '" alt="' + cardDef.name + '" class="rebirth-thumb-img">' +
                    '<span class="target-owner-tag tag-player">DECK</span>' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + cardDef.name + '</h4>' +
                    '<span class="rebirth-tile-stats">LVL ' + (cardDef.level || 1) + ' • ATK ' + (cardDef.atk || 0) + ' / DEF ' + (cardDef.def || 0) + '</span>' +
                '</div>' +
            '</div>');

            tile.on('click', function() {
                $('#void-monarch-search-modal').fadeOut(120, function() {
                    voidMonarchResolver(item);
                });
            });

            grid.append(tile);
        });

        $('#void-monarch-search-modal').fadeIn(150);
    });
}

// AI routine to activate Void Monarch's banish effect
async function AIPlayVoidMonarch() {
    var computerMonsters = GameState.getMonstersOnField('computer');
    var monarchEntry = computerMonsters.find(function(m) {
        return m.card.cardId === 'void-monarch' &&
               m.card.position !== 'defense-down' &&
               !m.card.faceDown &&
               m.card.voidMonarchBoostTurn !== turnCount;
    });

    if (!monarchEntry) return;

    // Only activate if player has cards in GY
    var playerGY = GameState.player && GameState.player.graveyard;
    if (!playerGY || playerGY.length === 0) return;

    if (typeof activateVoidMonarch === 'function') {
        await activateVoidMonarch('computer', monarchEntry.zone);
        await sleep(getAnimDuration(400));
    }
}

// ---------------------------------------------------------------------------
// Umbra Herald: When sent to the Graveyard -> Banish 1 opponent GY card
// ---------------------------------------------------------------------------
var umbraHeraldResolver = null;

// Central hook: call whenever a card instance is sent to the Graveyard.
// `who` is the side that owned/sent the card.
function notifyUmbraHeraldGraveyardSend(who, inst) {
    if (inst && inst.cardId === 'umbra-herald' && typeof triggerUmbraHeraldBanish === 'function') {
        setTimeout(function() {
            triggerUmbraHeraldBanish(who);
        }, 500);
    }
}

async function triggerUmbraHeraldBanish(who) {
    var opp = GameState.getOpponent(who);
    var oppGY = GameState[opp] && GameState[opp].graveyard;

    if (!oppGY || oppGY.length === 0) {
        if (who === 'player') {
            addToFeed('<em>Umbra Herald</em>: No cards in your opponent\'s Graveyard to banish.\n\n');
        }
        return false;
    }

    addToFeed('<em>Umbra Herald</em> activates from the Graveyard!\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');

    var chosenInst = null;
    if (who === 'player') {
        chosenInst = await promptPlayerUmbraHeraldBanish(oppGY);
    } else {
        // AI: target highest-ATK monster, then spells, then traps
        oppGY.forEach(function(inst) {
            var d = cards[inst.cardId];
            inst._score = (d && d.type === 'monsters') ? (d.atk || 0) : (d && d.type === 'spells' ? 800 : 600);
        });
        oppGY.sort(function(a, b) { return (b._score || 0) - (a._score || 0); });
        chosenInst = oppGY[0];
    }

    if (!chosenInst) {
        addToFeed('<em>Umbra Herald</em> effect was cancelled.\n\n');
        return false;
    }

    var gyIdx = GameState[opp].graveyard.indexOf(chosenInst);
    if (gyIdx !== -1) GameState[opp].graveyard.splice(gyIdx, 1);
    if (!GameState[opp].banished) GameState[opp].banished = [];
    GameState[opp].banished.push(chosenInst);

    var chosenDef = cards[chosenInst.cardId];
    var chosenName = chosenDef ? chosenDef.name : 'a card';

    addToFeed('<em>Umbra Herald</em> banishes <strong>' + chosenName + '</strong> from ' + formatWho(opp) + '\'s Graveyard!\n\n');

    updateGraveyardZones();
    updateResourceCounters();

    return true;
}

// Player prompt for Umbra Herald's GY banish selection
function promptPlayerUmbraHeraldBanish(oppGY) {
    return new Promise(function(resolve) {
        var grid = $('#umbra-herald-banish-grid');
        if (!grid.length) {
            resolve(oppGY[0]);
            return;
        }
        grid.empty();
        umbraHeraldResolver = resolve;

        oppGY.forEach(function(inst) {
            var d = cards[inst.cardId];
            var displayName = d ? d.name : 'Unknown';
            var typeLabel = d ? (d.type === 'monsters' ? (d.level || 0) + '★ ' + d.monsterType : d.type.toUpperCase()) : 'CARD';
            var stats = (d && d.type === 'monsters')
                ? 'ATK ' + (d.atk || 0) + ' / DEF ' + (d.def || 0)
                : (d && d.type === 'spells' ? 'SPELL' : 'TRAP');

            var tile = $('<div class="rebirth-card-tile target-trap-tile" style="cursor: pointer;">' +
                '<div class="rebirth-card-preview-frame">' +
                    '<img src="cards/' + (d ? d.file : 'card_back.png') + '" alt="' + displayName + '" class="rebirth-thumb-img">' +
                    '<span class="target-owner-tag tag-opponent">OPPONENT GY</span>' +
                '</div>' +
                '<div class="rebirth-tile-meta">' +
                    '<h4 class="rebirth-tile-name">' + displayName + '</h4>' +
                    '<span class="rebirth-tile-stats">' + typeLabel + ' • ' + stats + '</span>' +
                '</div>' +
            '</div>');

            tile.on('click', function() {
                $('#umbra-herald-banish-modal').fadeOut(120, function() {
                    umbraHeraldResolver(inst);
                    umbraHeraldResolver = null;
                });
            });

            grid.append(tile);
        });

        $('#umbra-herald-banish-modal').fadeIn(150);
    });
}
// ---------------------------------------------------------------------------
// Soul Lantern Keeper: Discard from hand during opponent's Battle Step ->
// battle damage from that attack becomes 0
// ---------------------------------------------------------------------------
var soulLanternKeeperResolver = null;

// Called immediately before LP subtraction at every battle damage site.
// Returns true if the damage was zeroed (card discarded to the Graveyard).
async function trySoulLanternKeeperZero(damagedWho, incomingDamage) {
    if (!incomingDamage || incomingDamage <= 0) return false;
    var hand = GameState[damagedWho] && GameState[damagedWho].hand;
    if (!hand) return false;

    var keeperIdx = -1;
    for (var i = 0; i < hand.length; i++) {
        if (hand[i] && hand[i].cardId === 'soul-lantern-keeper') {
            keeperIdx = i;
            break;
        }
    }
    if (keeperIdx === -1) return false;

    var useIt = false;
    if (damagedWho === 'player') {
        useIt = await promptPlayerSoulLanternKeeper(incomingDamage);
    } else {
        // AI: discard when the hit is significant or would be lethal
        useIt = (incomingDamage >= 1000 || incomingDamage >= GameState.computer.lp);
    }

    if (!useIt) return false;

    var keeperInst = hand.splice(keeperIdx, 1)[0];
    GameState[damagedWho].graveyard.push(keeperInst);
    notifyUmbraHeraldGraveyardSend(damagedWho, keeperInst);
    updateHandDisplay(damagedWho);
    updateGraveyardZones();
    updateResourceCounters();

    addToFeed(formatWho(damagedWho) + ' discards <em>Soul Lantern Keeper</em> — battle damage from this attack becomes <strong>0</strong>!\n\n');
    if (typeof BattleFX !== 'undefined') BattleFX.triggerScreenShake('light');
    return true;
}

function promptPlayerSoulLanternKeeper(incomingDamage) {
    return new Promise(function(resolve) {
        var modal = $('#soul-lantern-prompt-modal');
        if (!modal.length) {
            resolve(false);
            return;
        }
        $('#soul-lantern-damage-preview').text('Incoming battle damage: ' + incomingDamage);
        soulLanternKeeperResolver = resolve;
        modal.fadeIn(150);
    });
}

function resolveSoulLanternPrompt(useIt) {
    $('#soul-lantern-prompt-modal').fadeOut(120);
    if (typeof soulLanternKeeperResolver === 'function') {
        var r = soulLanternKeeperResolver;
        soulLanternKeeperResolver = null;
        r(useIt);
    }
}
