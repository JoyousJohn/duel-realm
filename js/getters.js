function getHand(who) { return $('#' + who + '-hand') }

function getField(who) { return $('#' + who + '-field') }

function getSquareElm(who, zoneNum) { return getField(who).find('.card-zone-square[data-zone="' + zoneNum + '"]') }

function getSpellSquareElm(who, zoneNum) { return getField(who).find('.card-zone-square[data-zone="' + zoneNum + '"]') }

function getFieldZoneElm(who) { return getField(who).find('.field-zone-square') }

function getHandCardElm(who, cardName) { 
    return getHand(who).find('div.card[data-card-name="' + cardName + '"]').not('[is-source-of-clone=true]').eq(0) 
}

function getHandCardElmByUid(who, uid) {
    return getHand(who).find('div.card[data-uid="' + uid + '"]').eq(0);
}

// (int) Return the ID of the first available card zone
function getFirstFreeZone(who) {
    for (var i = 1; i <= 6; i++) {
        var isMonster = (typeof GameState !== 'undefined' && GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters && GameState[who].field.monsters[i]);
        var isSpell = (typeof GameState !== 'undefined' && GameState && GameState[who] && GameState[who].field && GameState[who].field.spells && GameState[who].field.spells[i]);
        var sq = getSquareElm(who, i);
        var domCardName = sq.attr('data-card-name');
        if (!isMonster && !isSpell && (!domCardName || domCardName === '')) {
            return i;
        }
    }
    return undefined;
}

// (int) Return how many free zones left
function getNumOfFreeZones(who) {
    let freeZones = 0;
    for (var i = 1; i <= 6; i++) {
        var isMonster = (typeof GameState !== 'undefined' && GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters && GameState[who].field.monsters[i]);
        var isSpell = (typeof GameState !== 'undefined' && GameState && GameState[who] && GameState[who].field && GameState[who].field.spells && GameState[who].field.spells[i]);
        var sq = getSquareElm(who, i);
        var domCardName = sq.attr('data-card-name');
        if (!isMonster && !isSpell && (!domCardName || domCardName === '')) {
            freeZones++;
        }
    }
    return freeZones;
}

// (int) Return the ID of the first available spell/trap card zone (same slot pool)
function getFirstFreeSpellZone(who) {
    return getFirstFreeZone(who);
}

// (int) Return how many free spell/trap zones left
function getNumOfFreeSpellZones(who) {
    return getNumOfFreeZones(who);
}

// (int) Return how many monsters are on who's field
function getNumOfMonstersOnField(who) {
    let count = 0;
    const field = getField(who);
    $(field).find('.card-zone-square[data-zone]').each(function() {
        if ($(this).attr('data-card-type') === 'monsters' && $(this).attr('data-card-name')) {
            count++;
        }
    });
    return count;
}

// (int) Return number of defense position monsters on who's field
function getNumOfDefPosMonstersOnField(who) {
    let defenseMonsters = 0;
    const field = getField(who);

    $(field).find('.card-zone-square[data-zone]').each(function() {
        var cardType = $(this).attr('data-card-type');
        var mode = $(this).attr('data-card-position');
        if (cardType === 'monsters' && mode && mode.startsWith('defense')) {
            defenseMonsters++;   
        }
    })
    return defenseMonsters;
}

function getAvailableSquaresElms(who) {
    let freeZones = []
    const field = getField(who || 'player')
    $(field).find('.card-zone-square[data-zone]').each(function() {
        if (isSquareEmpty($(this))) freeZones.push($(this))
    })
    return freeZones
}

function getAvailableSpellSquaresElms(who) {
    return getAvailableSquaresElms(who);
}

// (boolean) Return if squareElm is empty
function isSquareEmpty(squareElm) {
    if (!squareElm || !squareElm.length) return false;
    var zoneNum = parseInt(squareElm.attr('data-zone'));
    var isPlayer = squareElm.closest('#player-field').length > 0;
    var who = isPlayer ? 'player' : 'computer';

    var isMonster = (typeof GameState !== 'undefined' && GameState && GameState[who] && GameState[who].field && GameState[who].field.monsters && GameState[who].field.monsters[zoneNum]);
    var isSpell = (typeof GameState !== 'undefined' && GameState && GameState[who] && GameState[who].field && GameState[who].field.spells && GameState[who].field.spells[zoneNum]);
    var domCardName = squareElm.attr('data-card-name');

    return !isMonster && !isSpell && (!domCardName || domCardName === '');
}

function isSummonOptionsVisible() { return $('#summon-options').is(':visible') }

function isPositionChangeOptionsVisible() { return $('#change-position-options').is(':visible') }

function isAtkMenuVisible() { return $('#attack-menu, #card-context-actions').is(':visible'); }