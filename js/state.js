// Central Event Bus for decoupled communication
var EventBus = {
    events: {},
    on: function(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    },
    off: function(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(function(cb) { return cb !== callback; });
    },
    emit: function(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(function(callback) {
            try { callback(data); } catch (err) { console.error('EventBus error:', err); }
        });
    }
};

// Card Instance representing an individual card in play or hand
function CardInstance(cardId) {
    this.uid = 'card_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    this.cardId = cardId;
    this.position = 'attack'; // monsters: 'attack' | 'defense-up' | 'defense-down'; spells/traps: 'set' | 'active'
    this.turnSummoned = null;
    this.turnPosChanged = null;
    this.hasAttacked = false;
    this.faceDown = false;   // true for set traps (and face-down monsters)
    this.turnCounter = null; // Swords of Revealing Light remaining turns
}

CardInstance.prototype.getDef = function() {
    return cards[this.cardId] || null;
};

// Central GameState: Single source of truth
var GameState = {
    status: 'IDLE', // 'IDLE' | 'PLAYING' | 'ENDED'
    turn: {
        active: 'player', // 'player' | 'computer'
        count: 0,
        phase: 0, // 0: Draw, 1: Standby, 2: Main 1, 3: Battle, 4: Main 2, 5: End, 6: Game Start
        normalSummonUsed: false
    },
    player: {
        lp: 8000,
        deck: [],
        hand: [], // Array of CardInstance
        field: {
            monsters: {}, // zoneNum (1-6) -> CardInstance
            spells: {},
            fieldZone: null
        },
        graveyard: []
    },
    computer: {
        lp: 8000,
        deck: [],
        hand: [], // Array of CardInstance
        field: {
            monsters: {}, // zoneNum (1-6) -> CardInstance
            spells: {},
            fieldZone: null
        },
        graveyard: []
    },
    selected: {
        handCard: null,     // CardInstance or null
        handElement: null,  // jQuery element
        fieldSquare: null,  // jQuery element
        activeCard: null    // jQuery element
    },

    reset: function() {
        this.status = 'IDLE';
        this.turn = {
            active: 'player',
            count: 0,
            phase: 0,
            normalSummonUsed: false
        };
        this.player = {
            lp: 8000,
            deck: [],
            hand: [],
            field: { monsters: {}, spells: {}, fieldZone: null },
            graveyard: []
        };
        this.computer = {
            lp: 8000,
            deck: [],
            hand: [],
            field: { monsters: {}, spells: {}, fieldZone: null },
            graveyard: []
        };
        this.selected = {
            handCard: null,
            handElement: null,
            fieldSquare: null,
            activeCard: null
        };
    },

    getPlayerState: function(who) {
        return this[who];
    },

    getOpponent: function(who) {
        return who === 'player' ? 'computer' : 'player';
    },

    getFreeMonsterZone: function(who) {
        for (var i = 1; i <= 6; i++) {
            if (!this[who].field.monsters[i] && !this[who].field.spells[i]) return i;
        }
        return null;
    },

    getNumOfFreeZones: function(who) {
        var free = 0;
        for (var i = 1; i <= 6; i++) {
            if (!this[who].field.monsters[i] && !this[who].field.spells[i]) free++;
        }
        return free;
    },

    getMonstersOnField: function(who) {
        var list = [];
        for (var i = 1; i <= 6; i++) {
            if (this[who].field.monsters[i]) {
                list.push({ zone: i, card: this[who].field.monsters[i] });
            }
        }
        return list;
    },

    getFreeSpellZone: function(who) {
        return this.getFreeMonsterZone(who);
    },

    getNumOfFreeSpellZones: function(who) {
        return this.getNumOfFreeZones(who);
    },

    getSpellsOnField: function(who) {
        var list = [];
        for (var i = 1; i <= 6; i++) {
            if (this[who].field.spells[i]) {
                list.push({ zone: i, card: this[who].field.spells[i] });
            }
        }
        if (this[who].field.fieldZone) {
            list.push({ zone: 'field', card: this[who].field.fieldZone });
        }
        return list;
    },

    isFieldZoneEmpty: function(who) {
        return !this[who].field.fieldZone;
    },

    getFieldZoneInstance: function(who) {
        return this[who].field.fieldZone || null;
    },

    removeCardFromField: function(who, kind, zone) {
        var instance = null;
        if (zone === 'field') {
            instance = this[who].field.fieldZone;
            this[who].field.fieldZone = null;
        } else if (kind === 'monsters') {
            instance = this[who].field.monsters[zone] || null;
            delete this[who].field.monsters[zone];
        } else if (kind === 'spells') {
            instance = this[who].field.spells[zone] || null;
            delete this[who].field.spells[zone];
        } else {
            // Unspecified kind: check both
            if (this[who].field.monsters[zone]) {
                instance = this[who].field.monsters[zone];
                delete this[who].field.monsters[zone];
            } else if (this[who].field.spells[zone]) {
                instance = this[who].field.spells[zone];
                delete this[who].field.spells[zone];
            }
        }
        if (instance) this[who].graveyard.push(instance);
        return instance;
    }
};
