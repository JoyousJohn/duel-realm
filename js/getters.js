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

// (bool) Does `who` control at least one face-up Fiend monster?
function controlsFaceUpFiend(who) {
    if (typeof GameState === 'undefined' || !GameState) return false;
    var monsters = GameState.getMonstersOnField(who);
    for (var i = 0; i < monsters.length; i++) {
        var d = cards[monsters[i].card.cardId];
        if (d && d.monsterType === 'Fiend' && !monsters[i].card.faceDown && monsters[i].card.position !== 'defense-down') {
            return true;
        }
    }
    return false;
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

// (int) Return the number of tributes required to summon a monster by Level
function getRequiredTributes(level) {
    if (!level || level <= 4) return 0;
    if (level <= 6) return 1;
    if (level >= 10) return 3;
    return 2;
}

// ---------------------------------------------------------------------------
// Unified Query API
// ---------------------------------------------------------------------------
var Queries = {
    // Face-up monsters controlled by `who`
    getFaceUpMonsters: function(who) {
        if (!GameState || !GameState[who]) return [];
        return GameState.getMonstersOnField(who).filter(function(m) {
            return m.card && !m.card.faceDown && m.card.position !== 'defense-down';
        });
    },

    // Face-up monsters controlled by opponent of `who`
    getOpponentFaceUpMonsters: function(who) {
        var opp = (typeof GameState !== 'undefined' && GameState.getOpponent) ? GameState.getOpponent(who) : (who === 'player' ? 'computer' : 'player');
        return this.getFaceUpMonsters(opp);
    },

    // All monsters on field across both players
    getAllMonsters: function() {
        if (!GameState) return [];
        return [
            ...GameState.getMonstersOnField('player').map(function(m) { return Object.assign({}, m, { side: 'player' }); }),
            ...GameState.getMonstersOnField('computer').map(function(m) { return Object.assign({}, m, { side: 'computer' }); })
        ];
    },

    // All Spells/Traps on `who`'s field (including Field Zone)
    getSpellTraps: function(who) {
        var result = [];
        if (!GameState || !GameState[who] || !GameState[who].field) return result;
        for (var z = 1; z <= 6; z++) {
            var inst = GameState[who].field.spells[z];
            if (inst) result.push({ side: who, zone: z, isField: false, inst: inst });
        }
        if (GameState[who].field.fieldZone) {
            result.push({ side: who, zone: null, isField: true, inst: GameState[who].field.fieldZone });
        }
        return result;
    },

    // All Spells/Traps across both fields
    getAllSpellTraps: function() {
        return [...this.getSpellTraps('computer'), ...this.getSpellTraps('player')];
    },

    // Face-up traps on `who`'s field
    getFaceUpTraps: function(who) {
        return this.getSpellTraps(who).filter(function(entry) {
            var def = cards[entry.inst.cardId];
            return def && def.type === 'traps' && entry.inst.position !== 'set' && !entry.inst.faceDown;
        });
    },

    // Graveyard monsters across either or specific player
    getGraveyardMonsters: function(who) {
        if (typeof getGraveyardMonsters === 'function') {
            var gy = getGraveyardMonsters();
            if (who) return gy.filter(function(m) { return m.who === who; });
            return gy;
        }
        return [];
    }
};