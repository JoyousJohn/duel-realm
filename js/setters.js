// Populates deck variable from localStorage and shuffles it
function buildPlayerDeck() {

    var rawDeck = localStorage.getItem('deck');
    var buildingDeckList = [];

    if (rawDeck === null) {
        buildingDeckList = Object.keys(cards);
    } else {
        var localDeck = JSON.parse(rawDeck) || {};
        var cardList = Object.keys(localDeck);

        for (var c in cardList) {
            var cardId = cardList[c];
            if (!cards[cardId]) continue;
            var quantOfThisCard = parseInt(localDeck[cardId]) || 0;
            
            for (var i = 0; i < quantOfThisCard; i++) {
                buildingDeckList.push(cardId);
            }
        }
    }

    if (buildingDeckList.length === 0) {
        buildingDeckList = Object.keys(cards);
    }

    // Shuffle and assign player deck stack
    deck = shuffleArray(buildingDeckList);
    if (GameState && GameState.player) {
        GameState.player.deck = [...deck];
    }

    // Build and shuffle AI computer deck (35 cards)
    var allCardIds = Object.keys(cards);
    var computerDeckList = [];
    for (var k = 0; k < 35; k++) {
        computerDeckList.push(random(allCardIds));
    }
    if (GameState && GameState.computer) {
        GameState.computer.deck = shuffleArray(computerDeckList);
    }
}

// Remove card string from who.hand.<type> array
function removeCardFromHandVar(who, cardId, type) {
    if (window[who] && window[who]['hand'] && window[who]['hand'][type]) {
        window[who]['hand'][type] = remove(window[who]['hand'][type], cardId);
    }
}

// Remove monster string from who.monsters array
function removeMonsterFromHandVar(who, monsterName) {
    removeCardFromHandVar(who, monsterName, 'monsters');
}

// Remove spell string from who.spells array
function removeSpellFromHandVar(who, spellName) {
    removeCardFromHandVar(who, spellName, 'spells');
}

// Remove trap string from who.traps array
function removeTrapFromHandVar(who, trapName) {
    removeCardFromHandVar(who, trapName, 'traps');
}

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

    var freeSlots = getNumOfFreeZones('player');
    var normalSummonUsed = (typeof GameState !== 'undefined' && GameState && GameState.turn && GameState.turn.normalSummonUsed);

    if (cardDef.type === 'monsters') {
        if (normalSummonUsed) return false;
        var reqTributes = getRequiredTributes(cardDef.level);
        var ownMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('player').length : 0;
        if (ownMonsters < reqTributes) return false;
        if (reqTributes === 0 && freeSlots <= 0) return false;
        if (reqTributes > 0 && (freeSlots + reqTributes) < 1) return false;
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
        var oppMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('computer') : [];
        // Need at least 1 opponent monster and at least 2 free zones (1 for spell + 1 for monster)
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

    if (cardDef.id === 'fissure') {
        var oppMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('computer') : [];
        var faceUpOpp = oppMonsters.filter(function(m) { return m.card && !m.card.faceDown; });
        return faceUpOpp.length > 0;
    }

    if (cardDef.id === 'remove-trap') {
        var hasFaceUpTrap = (typeof findFaceUpTrap === 'function') && (findFaceUpTrap('computer') !== null || findFaceUpTrap('player') !== null);
        return hasFaceUpTrap;
    }

    return true;
}

// Get descriptive reason why card cannot be played
function getCardUnplayableReason(cardDef) {
    if (!cardDef) return 'Invalid card.';
    var freeSlots = getNumOfFreeZones('player');
    var normalSummonUsed = (typeof GameState !== 'undefined' && GameState && GameState.turn && GameState.turn.normalSummonUsed);

    if (cardDef.type === 'monsters') {
        if (normalSummonUsed) {
            return 'You have already used your Normal Summon / Set for this turn.';
        }
        var reqTributes = getRequiredTributes(cardDef.level);
        var ownMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('player').length : 0;
        if (ownMonsters < reqTributes) {
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
        var oppMonsters = (typeof GameState !== 'undefined' && GameState) ? GameState.getMonstersOnField('computer') : [];
        if (oppMonsters.length === 0) {
            return 'Opponent controls no monsters to take.';
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

    if (cardDef.id === 'fissure') {
        return 'Opponent controls no face-up monsters to destroy.';
    }

    if (cardDef.id === 'remove-trap') {
        return 'There are no face-up Trap cards on the field to destroy.';
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