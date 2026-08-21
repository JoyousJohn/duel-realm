// Helper to get all non-token collectible cards
function getCollectibleCardIds() {
    return Object.keys(cards).filter(function(id) {
        var def = cards[id];
        return def && !def.isToken && def.subType !== 'token';
    });
}

// Populates deck variable from localStorage and shuffles it
function buildPlayerDeck() {

    var rawDeck = localStorage.getItem('deck');
    var buildingDeckList = [];
    var collectibleIds = getCollectibleCardIds();

    if (rawDeck === null) {
        var shuffledPool = shuffleArray([...collectibleIds]);
        buildingDeckList = (shuffledPool.length >= 40) ? shuffledPool.slice(0, 40) : [...collectibleIds];
    } else {
        var localDeck = JSON.parse(rawDeck) || {};
        var cardList = Object.keys(localDeck);

        for (var c in cardList) {
            var cardId = cardList[c];
            var def = cards[cardId];
            if (!def || def.isToken || def.subType === 'token') continue;
            var quantOfThisCard = parseInt(localDeck[cardId]) || 0;
            
            for (var i = 0; i < quantOfThisCard; i++) {
                buildingDeckList.push(cardId);
            }
        }

        // If user chose less than 40 cards in their custom deck, populate the rest with random cards up to 40
        if (buildingDeckList.length > 0 && buildingDeckList.length < 40) {
            var unusedPool = shuffleArray(collectibleIds.filter(function(id) {
                return !buildingDeckList.includes(id);
            }));

            while (buildingDeckList.length < 40 && unusedPool.length > 0) {
                buildingDeckList.push(unusedPool.pop());
            }

            while (buildingDeckList.length < 40) {
                buildingDeckList.push(random(collectibleIds));
            }
        }
    }

    if (buildingDeckList.length === 0) {
        var shuffledPool = shuffleArray([...collectibleIds]);
        buildingDeckList = (shuffledPool.length >= 40) ? shuffledPool.slice(0, 40) : [...collectibleIds];
    }

    // Shuffle and assign player deck stack
    deck = shuffleArray(buildingDeckList);
    if (GameState && GameState.player) {
        GameState.player.deck = [...deck];
    }

    // Build and shuffle AI computer deck (40 cards)
    var computerDeckList = [];
    for (var k = 0; k < 40; k++) {
        computerDeckList.push(random(collectibleIds));
    }
    if (GameState && GameState.computer) {
        GameState.computer.deck = shuffleArray(computerDeckList);
    }

    // Preload all card images in both players' decks immediately
    preloadDuelDecks();
}

// Preload an array of card IDs into browser memory & cache
function preloadCardImages(cardIds) {
    if (!Array.isArray(cardIds) || typeof cards === 'undefined') return;
    var preloaded = window._preloadedCardImages = window._preloadedCardImages || {};
    var uniqueIds = Array.from(new Set(cardIds));

    uniqueIds.forEach(function(cardId) {
        var cardDef = cards[cardId];
        if (cardDef && cardDef.file && !preloaded[cardDef.file]) {
            var img = new Image();
            img.src = 'cards/' + cardDef.file;
            preloaded[cardDef.file] = img;
        }
    });
}

// Preload all cards in active duel decks and card backs
function preloadDuelDecks() {
    var deckCards = [];
    if (GameState && GameState.player && GameState.player.deck) {
        deckCards = deckCards.concat(GameState.player.deck);
    }
    if (GameState && GameState.computer && GameState.computer.deck) {
        deckCards = deckCards.concat(GameState.computer.deck);
    }

    // Include common tokens and card back graphics
    ['card_back.png', 'card_back_2.png', 'catalyst_token.png'].forEach(function(f) {
        var preloaded = window._preloadedCardImages = window._preloadedCardImages || {};
        if (!preloaded[f]) {
            var img = new Image();
            img.src = 'cards/' + f;
            preloaded[f] = img;
        }
    });

    preloadCardImages(deckCards);
}

// Background progressive preloading of all cards during idle moments
function preloadAllCollectibleCards() {
    var collectibleIds = (typeof getCollectibleCardIds === 'function') ? getCollectibleCardIds() : [];
    if (collectibleIds.length === 0 && typeof cards !== 'undefined') {
        collectibleIds = Object.keys(cards);
    }

    var i = 0;
    function loadNextBatch() {
        if (i >= collectibleIds.length) return;
        var batch = collectibleIds.slice(i, i + 8);
        preloadCardImages(batch);
        i += 8;
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(loadNextBatch, { timeout: 1000 });
        } else {
            setTimeout(loadNextBatch, 250);
        }
    }

    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(loadNextBatch, { timeout: 1500 });
    } else {
        setTimeout(loadNextBatch, 600);
    }
}

// Legacy compatibility stubs (hand management is handled natively via GameState[who].hand)
function removeCardFromHandVar(who, cardId, type) {}
function removeMonsterFromHandVar(who, monsterName) {}
function removeSpellFromHandVar(who, spellName) {}
function removeTrapFromHandVar(who, trapName) {}

function updateCardImage(squareElm) {
    const cardName = $(squareElm).attr('data-card-name');
    const target = $(squareElm);
    if (cardName && cards[cardName]) {
        var imgSrc = 'cards/' + cards[cardName]['file'];
        target.find('img').attr('src', imgSrc).css({
            'display': 'block',
            'visibility': 'visible',
            'opacity': '1'
        }).show();
        target.find('.front').css('display', 'flex');
    } else {
        target.find('img').removeAttr('src').hide();
    }
}

function clearHand(who) {
    $('#' + who + '-hand').empty();
}

function clearAvailableZones() {
    $('#player-field .card-zone-square').removeClass('available-zone spell-available-zone field-available-zone');
    $('#player-field .card-zone-square .card-zone.main-zone').removeClass('available-zone spell-available-zone field-available-zone');
    $('.field-zone-square').removeClass('available-zone spell-available-zone field-available-zone');
    $('.field-zone-square .card-zone.main-zone').removeClass('available-zone spell-available-zone field-available-zone');
    if (typeof activeCard === 'undefined' || !activeCard || !activeCard.length) {
        updateStatModBadges();
    }
}

// Highlight available zones where monster cards can be placed on player field
function showAvailableZones() {
    const availableSquares = getAvailableSquaresElms('player');
    for (const square of availableSquares) {
        square.find('div.card-zone.main-zone').addClass('available-zone');
    }   
}

// Highlight the correct target zones depending on the selected hand card
function showAvailableZonesForCard(cardDef) {
    if (!cardDef) return;

    if (cardDef.type === 'monsters') {
        showAvailableZones();
        return;
    }

    if (cardDef.type === 'spells' && cardDef.subType === 'field') {
        var fieldZone = getFieldZoneElm('player');
        if (isSquareEmpty(fieldZone)) {
            fieldZone.find('div.card-zone.main-zone').addClass('field-available-zone');
        }
        return;
    }

    // Normal spells + all traps can go into any available slot on the row
    var freeSquares = getAvailableSquaresElms('player');
    for (var i = 0; i < freeSquares.length; i++) {
        freeSquares[i].find('div.card-zone.main-zone').addClass('spell-available-zone');
    }
}

// (boolean) True if the player's hand card can currently be played somewhere
function isCardCurrentlyPlayable(cardDef) {
    if (!cardDef) return false;

    // Declarative Unified Registry Resolution
    if (typeof cardDef.canActivate === 'function') {
        return cardDef.canActivate('player');
    }

    var freeSlots = getNumOfFreeZones('player');
    var normalSummonExhausted = (typeof GameState !== 'undefined' && GameState && GameState.turn && GameState.turn.normalSummonUsed && (!GameState.turn.extraNormalSummons || GameState.turn.extraNormalSummons <= 0));

    if (cardDef.type === 'monsters') {
        if (normalSummonExhausted) return false;
        if (cardDef.id === 'infernal-incinerator') {
            var ownMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('player') : [];
            var eligibleTributes = ownMonsters.filter(function(m) {
                return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && (typeof getMonsterAtk === 'function' ? getMonsterAtk(m.card) >= 2000 : (cards[m.card.cardId] && cards[m.card.cardId].atk >= 2000));
            });
            return eligibleTributes.length > 0;
        }
        var reqTributes = getRequiredTributes(cardDef.level);
        var isMausoleum = (typeof isMausoleumActive === 'function') && isMausoleumActive();
        var lpCost = reqTributes * 1000;
        var canMausoleum = isMausoleum && (typeof GameState !== 'undefined') && GameState && GameState.player && (GameState.player.lp > lpCost);

        var eligibleTributes = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('player').filter(function(entry) {
            var mDef = cards[entry.card.cardId];
            return !entry.card.cannotBeTributed && !(mDef && mDef.cannotBeTributed);
        }).length : 0;

        if (eligibleTributes < reqTributes && !canMausoleum) return false;
        if (reqTributes === 0 && freeSlots <= 0) return false;
        if (reqTributes > 0 && (freeSlots + (canMausoleum ? 0 : reqTributes)) < 1 && freeSlots <= 0) return false;
        return true;
    }
    if (cardDef.type === 'spells' && cardDef.subType === 'field') {
        return isSquareEmpty(getFieldZoneElm('player'));
    }

    if (freeSlots <= 0) return false;

    // Equip spells need a face-up monster on your field to attach to
    if (cardDef.type === 'spells' && cardDef.subType === 'equip') {
        var ownMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('player') : [];
        var faceUpOwn = ownMonsters.filter(function(m) { return m.card && !m.card.faceDown && m.card.position !== 'defense-down'; });
        return faceUpOwn.length > 0;
    }

    // Tactical spell checks
    if (cardDef.id === 'change-of-heart') {
        var oppMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('computer').filter(function(m) {
            return !isImmuneToSpellTargeting(m.card, 'player');
        }) : [];
        // Need at least 1 targetable opponent monster and at least 2 free zones (1 for spell + 1 for monster)
        return oppMonsters.length > 0 && freeSlots >= 2;
    }

    if (cardDef.id === 'monster-reborn') {
        var gyMonsters = (typeof getGraveyardMonsters === 'function') ? getGraveyardMonsters() : [];
        return gyMonsters.length > 0 && freeSlots >= 2;
    }

    if (cardDef.id === 'raigeki') {
        var oppMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('computer') : [];
        return oppMonsters.length > 0;
    }

    if (cardDef.id === 'fissure' || cardDef.id === 'smashing-ground') {
        var oppMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('computer') : [];
        var faceUpOpp = oppMonsters.filter(function(m) { return m.card && !m.card.faceDown && !isImmuneToSpellTargeting(m.card, 'player'); });
        return faceUpOpp.length > 0;
    }

    if (cardDef.id === 'remove-trap') {
        var hasFaceUpTrap = (typeof findFaceUpTrap === 'function') && (findFaceUpTrap('computer') !== null || findFaceUpTrap('player') !== null);
        return hasFaceUpTrap;
    }

    if (cardDef.id === 'mystical-space-typhoon' || cardDef.id === 'heavy-storm') {
        var hasSpellTrap = false;
        ['player', 'computer'].forEach(function(side) {
            if (typeof GameState !== 'undefined' && GameState && GameState[side] && GameState[side].field) {
                for (var z = 1; z <= 6; z++) {
                    if (GameState[side].field.spells[z]) hasSpellTrap = true;
                }
                if (GameState[side].field.fieldZone) hasSpellTrap = true;
            }
        });
        return hasSpellTrap && freeSlots > 0;
    }

    return true;
}

// Get descriptive reason why card cannot be played
function getCardUnplayableReason(cardDef) {
    if (!cardDef) return 'Invalid card.';

    // Declarative Unified Registry Resolution
    if (typeof cardDef.unplayableReason === 'function') {
        return cardDef.unplayableReason('player');
    }

    var freeSlots = getNumOfFreeZones('player');
    var normalSummonExhausted = (typeof GameState !== 'undefined' && GameState && GameState.turn && GameState.turn.normalSummonUsed && (!GameState.turn.extraNormalSummons || GameState.turn.extraNormalSummons <= 0));

    if (cardDef.type === 'monsters') {
        if (normalSummonExhausted) {
            return 'You have already used your Normal Summon / Set for this turn.';
        }
        if (cardDef.id === 'infernal-incinerator') {
            var ownMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('player') : [];
            var eligibleTributes = ownMonsters.filter(function(m) {
                return m.card && !m.card.faceDown && m.card.position !== 'defense-down' && (typeof getMonsterAtk === 'function' ? getMonsterAtk(m.card) >= 2000 : (cards[m.card.cardId] && cards[m.card.cardId].atk >= 2000));
            });
            if (eligibleTributes.length === 0) {
                return 'Requires Tributing 1 face-up monster you control with 2000+ ATK (and discards other hand cards).';
            }
            return '';
        }
        var reqTributes = getRequiredTributes(cardDef.level);
        var isMausoleum = (typeof isMausoleumActive === 'function') && isMausoleumActive();
        var lpCost = reqTributes * 1000;
        var canMausoleum = isMausoleum && (typeof GameState !== 'undefined') && GameState && GameState.player && (GameState.player.lp > lpCost);

        var ownMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('player').length : 0;
        if (ownMonsters < reqTributes && !canMausoleum) {
            if (reqTributes === 1) {
                return 'Requires 1 Tribute (Level 5-6), but you control no monsters on your field.';
            } else {
                return 'Requires 2 Tributes (Level 7+), but you only control ' + ownMonsters + ' monster(s) on your field.';
            }
        }
        if (freeSlots <= 0 && reqTributes === 0) {
            return 'There are no free slots on your field.';
        }
    }

    if (cardDef.type === 'spells' && cardDef.subType === 'field') {
        return 'The field spell zone is already occupied.';
    }

    if (freeSlots <= 0) {
        return 'There are no free slots on your field.';
    }

    if (cardDef.type === 'spells' && cardDef.subType === 'equip') {
        return 'You need a face-up monster on your field to equip this card to.';
    }

    if (cardDef.id === 'change-of-heart') {
        var oppMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('computer').filter(function(m) {
            return !isImmuneToSpellTargeting(m.card, 'player');
        }) : [];
        if (oppMonsters.length === 0) {
            return 'Opponent controls no monsters you can take (some may be immune to Spell targeting).';
        }
        if (freeSlots < 2) {
            return 'You need space on your field to hold the opponent monster.';
        }
    }

    if (cardDef.id === 'monster-reborn') {
        var gyMonsters = (typeof getGraveyardMonsters === 'function') ? getGraveyardMonsters() : [];
        if (gyMonsters.length === 0) {
            return 'There are no monsters in either graveyard.';
        }
        if (freeSlots < 2) {
            return 'You need an open monster slot to summon the revived monster.';
        }
    }

    if (cardDef.id === 'raigeki') {
        return 'Opponent controls no monsters to destroy.';
    }

    if (cardDef.id === 'fissure' || cardDef.id === 'smashing-ground') {
        return 'Opponent controls no targetable face-up monsters to destroy.';
    }

    if (cardDef.id === 'remove-trap') {
        return 'There are no face-up Trap cards on the field to destroy.';
    }

    if (cardDef.id === 'mystical-space-typhoon' || cardDef.id === 'heavy-storm') {
        return 'There are no Spell or Trap cards on the field to destroy.';
    }

    return 'Card cannot be activated right now.';
}

function hideSummonOptionsIfVisible() {
    if (isSummonOptionsVisible()) $('#summon-options').hide();
}

// Hide the position change buttons that show up when clicking placed monster
function hidePositionChangeOptionsIfVisible() {
    if (isPositionChangeOptionsVisible()) $('#change-position-options').hide();
}

function hideAtkMenuIfVisible() {
    $('#attack-menu, #card-context-actions').hide();
    if (typeof BattleFX !== 'undefined') BattleFX.cancelTargetSelection();
}

// Show any change position options that were hidden when showing valid position changes
function showAllPositionChanges() {
    $('#change-position-options .tactical-action-btn').each(function() {
        if ($(this).is(':hidden')) $(this).show(); 
    });
}

// Remove CSS from active caard
function resetActiveCardClass() {
    $('.active-card').removeClass('active-card') 
}

// Only affects element if 'speed' field was changed in .flip init, i.e. if was set to -1, or 1, so .flip status can be set with no animation
async function updateFlipSpeed(flipElm, newSpeed) {
    flipElm = $(flipElm)
    flipElm.data('flip-model').setting.speed = 500; // Not sure if affects anything
    flipElm.find('div.front, div.back').css('transition', 'all ' + newSpeed + 'ms ease-out 0s') // Change transition speed
}























function random(list) {
    return list[Math.floor(Math.random()*list.length)];
}

function shuffleArray(array) {
    var arr = array.slice();
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Remove first occurance of value from arr
function remove(arr, value) {
    var index = arr.indexOf(value);
    if (index > -1) {
        arr.splice(index, 1);
    }
    return arr;
}