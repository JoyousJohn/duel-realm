var hoverCardName;

$(document).on('mouseenter', '.card-zone-square, .card', function() {
    var square = $(this).closest('.card-zone-square');
    var isOpponentField = $(this).closest('#computer-field').length > 0;
    var isOpponentHand = $(this).closest('#computer-hand').length > 0;

    if (isOpponentHand) {
        hoverCardName = null;
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
        $('#preview-card-types').text('[' + (cardData.monsterType || 'Monster') + ' / ' + (cardData.attribute || 'EARTH') + ']').show();
        
        // Show ATK & DEF gauges with active stat modifiers (+/-)
        var baseAtk = cardData.atk !== undefined ? cardData.atk : 0;
        var baseDef = cardData.def !== undefined ? cardData.def : 0;
        var mod = (typeof getFieldModifier === 'function') ? getFieldModifier(cardData) : 0;

        var effAtk = Math.max(0, baseAtk + mod);
        var effDef = Math.max(0, baseDef + mod);

        var atkValElem = $('#preview-atk-val');
        var defValElem = $('#preview-def-val');
        var atkModElem = $('#preview-atk-mod');
        var defModElem = $('#preview-def-mod');

        atkValElem.removeClass('has-stat-buff has-stat-debuff');
        defValElem.removeClass('has-stat-buff has-stat-debuff');

        if (mod !== 0) {
            var isPos = mod > 0;
            var sign = isPos ? '+' : '';
            var modText = sign + mod;
            var modClass = isPos ? 'mod-buff' : 'mod-debuff';
            var valueClass = isPos ? 'has-stat-buff' : 'has-stat-debuff';

            atkValElem.text(effAtk).addClass(valueClass);
            defValElem.text(effDef).addClass(valueClass);

            atkModElem.removeClass('mod-buff mod-debuff').addClass(modClass).text(modText).show();
            defModElem.removeClass('mod-buff mod-debuff').addClass(modClass).text(modText).show();
        } else {
            atkValElem.text(baseAtk);
            defValElem.text(baseDef);
            atkModElem.hide();
            defModElem.hide();
        }

        $('#preview-combat-stats').show();

        // Lore/Effect
        $('#preview-card-desc').text(cardData.desc || (cardData.name + ' stands primed for tactical combat on the duel arena.'));
    } else if (cardData.type === 'spells') {
        typeBadge.addClass('badge-spell').text('SPELL');
        $('#preview-card-attr').text((cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL')).show();
        $('#preview-card-monster-type').hide();
        $('#preview-card-level-row').hide();
        $('#preview-card-types').text('[' + (cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL') + ' SPELL CARD]').show();
        $('#preview-combat-stats').hide();
        $('#preview-card-desc').text(cardData.desc || 'Activate to unleash arcane spell abilities.');
    } else if (cardData.type === 'traps') {
        typeBadge.addClass('badge-trap').text('TRAP');
        $('#preview-card-attr').text((cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL')).show();
        $('#preview-card-monster-type').hide();
        $('#preview-card-level-row').hide();
        $('#preview-card-types').text('[' + (cardData.subType ? cardData.subType.toUpperCase() : 'NORMAL') + ' TRAP CARD]').show();
        $('#preview-combat-stats').hide();
        $('#preview-card-desc').text(cardData.desc || 'Set face-down to counter opponent actions when triggered.');
    }

    // Switch View
    $('#scanner-idle').hide();
    $('#scanner-active').show();
});

$(document).on('mouseleave', '.card-zone-square, .card', function() {
    hoverCardName = null;
    $('#scanner-active').hide();
    $('#scanner-idle').show();
    $('#preview-card-img').removeAttr('src');
});