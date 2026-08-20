var hoverCardName;

$(document).on('mouseenter', '.card-zone-square, .card', function() {
    var square = $(this).closest('.card-zone-square');
    var isOpponentField = $(this).closest('#computer-field').length > 0;
    var isOpponentHand = $(this).closest('#computer-hand').length > 0;

    if (isOpponentHand) {
        hoverCardName = null;
        $('#info-panel').removeClass('sidebar-inspecting');
        $('#duel-log-module').show();
        $('#scanner-active').hide();
        $('#scanner-idle').show();
        $('#preview-card-img').removeAttr('src');
        return;
    }

    if (isOpponentField) {
        var pos = $(this).attr('data-card-position') || (square.length ? square.attr('data-card-position') : '');
        var zoneNum = square.length ? parseInt(square.attr('data-zone')) : null;

        // Check GameState as well to guarantee face-down cards are completely hidden
        var monsterInst = (zoneNum && GameState && GameState.computer && GameState.computer.field && GameState.computer.field.monsters) ? GameState.computer.field.monsters[zoneNum] : null;
        var spellInst = (zoneNum && GameState && GameState.computer && GameState.computer.field && GameState.computer.field.spells) ? GameState.computer.field.spells[zoneNum] : null;

        var isFaceDown = (pos === 'defense-down' || pos === 'set' || (pos && pos.indexOf('down') > -1) || 
                          (monsterInst && (monsterInst.position === 'defense-down' || monsterInst.faceDown)) || 
                          (spellInst && (spellInst.position === 'set' || spellInst.faceDown)));

        if (isFaceDown) {
            hoverCardName = null;
            $('#info-panel').removeClass('sidebar-inspecting');
            $('#duel-log-module').show();
            $('#scanner-active').hide();
            $('#scanner-idle').show();
            $('#preview-card-img').removeAttr('src');
            return;
        }
    }

    var cardName = $(this).attr('data-card-name') || (square.length ? square.attr('data-card-name') : '');
    if (!cardName || !cards[cardName]) { return; }

    hoverCardName = cardName;

    var cardData = cards[cardName];
    var cardImgURL = 'cards/' + cardData.file;

    // Set Image
    $('#preview-card-img').attr('src', cardImgURL);

    // Set Name
    $('#preview-card-name').text(cardData.name || 'Unknown Card');

    // Type Badge & Details
    var typeBadge = $('#preview-card-badge');
    typeBadge.removeClass('badge-monster badge-spell badge-trap');

    if (cardData.type === 'monsters') {
        typeBadge.addClass('badge-monster').text('MONSTER');
        $('#preview-card-attr').text(cardData.attribute || 'EARTH').show();
        $('#preview-card-monster-type').text((cardData.monsterType || 'Monster').toUpperCase()).show();
        
        var stars = '★'.repeat(cardData.level || 4);
        $('#preview-card-level-row').text(stars + ' (LVL ' + (cardData.level || 4) + ')').show();
        var typeKindLabel = cardData.subType === 'effect' ? 'Effect' : (cardData.isToken ? 'Token' : 'Normal');
        $('#preview-card-types').text('[' + (cardData.monsterType || 'Monster') + ' / ' + typeKindLabel + ']').show();
        
        // Show ATK & DEF gauges with active stat modifiers (+/-)
        var baseAtk = cardData.atk !== undefined ? cardData.atk : 0;
        var baseDef = cardData.def !== undefined ? cardData.def : 0;
        var atkMod = 0;
        var defMod = 0;
        var effAtk = baseAtk;
        var effDef = baseDef;

        var zoneNum = square.length ? parseInt(square.attr('data-zone')) : null;
        var monsterInst = null;
        if (zoneNum && typeof GameState !== 'undefined' && GameState) {
            monsterInst = isOpponentField
                ? (GameState.computer && GameState.computer.field ? GameState.computer.field.monsters[zoneNum] : null)
                : (GameState.player && GameState.player.field ? GameState.player.field.monsters[zoneNum] : null);
        }

        if (monsterInst && typeof getMonsterAtk === 'function') {
            effAtk = getMonsterAtk(monsterInst);
            effDef = getMonsterDef(monsterInst);
            atkMod = effAtk - baseAtk;
            defMod = effDef - baseDef;
        } else {
            var mods = (typeof getFieldMods === 'function') ? getFieldMods(cardData) : { atk: 0, def: 0 };
            atkMod = mods.atk;
            defMod = mods.def;
            effAtk = Math.max(0, baseAtk + atkMod);
            effDef = Math.max(0, baseDef + defMod);
        }

        var atkValElem = $('#preview-atk-val');
        var defValElem = $('#preview-def-val');
        var atkModElem = $('#preview-atk-mod');
        var defModElem = $('#preview-def-mod');

        atkValElem.removeClass('has-stat-buff has-stat-debuff');
        defValElem.removeClass('has-stat-buff has-stat-debuff');

        if (atkMod !== 0 || defMod !== 0) {
            if (atkMod !== 0) {
                var atkIsPos = atkMod > 0;
                var atkSign = atkIsPos ? '+' : '';
                var atkModText = atkSign + atkMod;
                var atkModClass = atkIsPos ? 'mod-buff' : 'mod-debuff';
                var atkValueClass = atkIsPos ? 'has-stat-buff' : 'has-stat-debuff';
                atkValElem.text(effAtk).addClass(atkValueClass);
                atkModElem.removeClass('mod-buff mod-debuff').addClass(atkModClass).text(atkModText).show();
            } else {
                atkValElem.text(effAtk);
                atkModElem.hide();
            }

            if (defMod !== 0) {
                var defIsPos = defMod > 0;
                var defSign = defIsPos ? '+' : '';
                var defModText = defSign + defMod;
                var defModClass = defIsPos ? 'mod-buff' : 'mod-debuff';
                var defValueClass = defIsPos ? 'has-stat-buff' : 'has-stat-debuff';
                defValElem.text(effDef).addClass(defValueClass);
                defModElem.removeClass('mod-buff mod-debuff').addClass(defModClass).text(defModText).show();
            } else {
                defValElem.text(effDef);
                defModElem.hide();
            }
        } else {
            atkValElem.text(baseAtk);
            defValElem.text(baseDef);
            atkModElem.hide();
            defModElem.hide();
        }

        $('#preview-combat-stats').show();

        // Only show effect description if the monster is an effect monster with an effect
        if (cardData.subType === 'effect' && cardData.desc) {
            $('#preview-card-desc').text(cardData.desc);
            $('.preview-desc-container, #preview-desc-module').show();
        } else {
            $('.preview-desc-container, #preview-desc-module').hide();
        }
    } else if (cardData.type === 'spells') {
        typeBadge.addClass('badge-spell').text('SPELL');
        $('#preview-card-attr').text((cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL')).show();
        $('#preview-card-monster-type').hide();
        $('#preview-card-level-row').hide();
        $('#preview-card-types').text('[' + (cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL') + ' SPELL CARD]').show();
        $('#preview-combat-stats').hide();
        $('#preview-card-desc').text(cardData.desc || 'Activate to unleash arcane spell abilities.');
        $('.preview-desc-container, #preview-desc-module').show();
    } else if (cardData.type === 'traps') {
        typeBadge.addClass('badge-trap').text('TRAP');
        $('#preview-card-attr').text((cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL')).show();
        $('#preview-card-monster-type').hide();
        $('#preview-card-level-row').hide();
        $('#preview-card-types').text('[' + (cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL') + ' TRAP CARD]').show();
        $('#preview-combat-stats').hide();
        $('#preview-card-desc').text(cardData.desc || 'Set face-down to counter opponent actions when triggered.');
        $('.preview-desc-container, #preview-desc-module').show();
    }

    // Switch View
    $('#info-panel').addClass('sidebar-inspecting');
    $('#duel-log-module').hide();
    $('#scanner-idle').hide();
    $('#scanner-active').show();
});

$(document).on('mouseleave', '.card-zone-square, .card', function() {
    hoverCardName = null;
    $('#info-panel').removeClass('sidebar-inspecting');
    $('#duel-log-module').show();
    $('#scanner-active').hide();
    $('#scanner-idle').show();
    $('#preview-card-img').removeAttr('src');
});

// ---------------------------------------------------------------------------
// Draggable Left Sidebar Resizer
// ---------------------------------------------------------------------------
function initSidebarResizer() {
    var sidebar = $('#info-panel');
    if (!sidebar.length) return;

    var resizer = $('#sidebar-resizer');
    if (!resizer.length) {
        resizer = $('<div id="sidebar-resizer" class="sidebar-resizer" title="Drag to resize sidebar"></div>');
        sidebar.prepend(resizer);
    }

    var MIN_WIDTH = 200;
    var MAX_WIDTH = Math.min(650, Math.floor(window.innerWidth * 0.55));

    function setSidebarWidth(w) {
        w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
        document.documentElement.style.setProperty('--sidebar-width', w + 'px');
        sidebar.css({
            'width': w + 'px',
            'min-width': w + 'px',
            'max-width': w + 'px',
            'flex': '0 0 ' + w + 'px'
        });
    }

    // Restore saved width from localStorage if present
    var savedWidth = localStorage.getItem('duel_realm_sidebar_width');
    if (savedWidth) {
        var parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
            setSidebarWidth(parsed);
        }
    }

    var isDragging = false;
    var startX = 0;
    var startWidth = 0;

    resizer.on('mousedown touchstart', function(e) {
        e.preventDefault();
        e.stopPropagation();

        isDragging = true;
        resizer.addClass('is-dragging');
        $('body').addClass('sidebar-is-resizing');

        startX = e.type === 'touchstart' ? e.originalEvent.touches[0].clientX : e.clientX;
        startWidth = sidebar.outerWidth();

        MAX_WIDTH = Math.min(650, Math.floor(window.innerWidth * 0.55));
    });

    $(document).on('mousemove touchmove', function(e) {
        if (!isDragging) return;

        var clientX = e.type === 'touchmove' ? e.originalEvent.touches[0].clientX : e.clientX;
        var newWidth = startWidth + (clientX - startX);
        setSidebarWidth(newWidth);
    });

    $(document).on('mouseup touchend touchcancel', function(e) {
        if (!isDragging) return;

        isDragging = false;
        resizer.removeClass('is-dragging');
        $('body').removeClass('sidebar-is-resizing');

        var finalWidth = sidebar.outerWidth();
        localStorage.setItem('duel_realm_sidebar_width', finalWidth);
    });
}

$(document).ready(function() {
    initSidebarResizer();
});