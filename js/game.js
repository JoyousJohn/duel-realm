var deck;

var player = {'hand': [], 'field': []};
var computer = {'hand': [], 'field': []};

var activeCard = null; // Currently selected jQuery card element
var selectedSquare = null; // Currently selected jQuery square element

// Global Game & Animation Settings
var GameSettings = {
    animationSpeed: parseFloat(localStorage.getItem('yugi_anim_speed')) || 1.5
};

function getAnimDuration(baseMs) {
    var speed = (typeof GameSettings !== 'undefined' && GameSettings.animationSpeed) ? GameSettings.animationSpeed : 1.0;
    return Math.max(20, Math.round(baseMs / speed));
}

function setAnimationSpeed(speed) {
    speed = parseFloat(speed) || 1.0;
    GameSettings.animationSpeed = speed;
    localStorage.setItem('yugi_anim_speed', speed);
    updateSpeedButtonsUI();
    addToFeed('Animation speed set to ' + speed + 'x\n\n');
}

function formatWho(who) {
    if (!who) return '';
    return who.charAt(0).toUpperCase() + who.slice(1).toLowerCase();
}

function updateSpeedButtonsUI() {
    var current = (typeof GameSettings !== 'undefined' && GameSettings.animationSpeed) ? GameSettings.animationSpeed : 1.5;
    $('.speed-btn').each(function() {
        var btnSpeed = parseFloat($(this).attr('data-speed'));
        if (Math.abs(btnSpeed - current) < 0.05) {
            $(this).addClass('active');
        } else {
            $(this).removeClass('active');
        }
    });
}

$(document).ready(function() {
    updateSpeedButtonsUI();
});

// Initialize EventBus listeners
EventBus.on('FEED_LOG', function(message) {
    addToFeed(message);
});

EventBus.on('LP_CHANGED', function(data) {
    updateLPDisplay();
    if (data.lp <= 0) {
        var isPlayerWinner = (data.who === 'computer');
        var winnerName = isPlayerWinner ? 'Player' : 'Computer';
        addToFeed('\n*** ' + winnerName.toUpperCase() + ' WINS THE DUEL! ***\n\n');
        setTimeout(function() {
            showGameOverModal(isPlayerWinner);
        }, 550);
    }
});

function updateLPDisplay() {
    $('#player-lp').text(GameState.player.lp + ' LP');
    $('#opponent-lp').text(GameState.computer.lp + ' LP');
}

function updateResourceCounters() {
    var playerDeckCount = (GameState && GameState.player && GameState.player.deck) ? GameState.player.deck.length : 0;
    var playerGyList = (GameState && GameState.player && GameState.player.graveyard) ? GameState.player.graveyard : [];
    var playerGyCount = playerGyList.length;

    var compDeckCount = (GameState && GameState.computer && GameState.computer.deck) ? GameState.computer.deck.length : 40;
    var compGyList = (GameState && GameState.computer && GameState.computer.graveyard) ? GameState.computer.graveyard : [];
    var compGyCount = compGyList.length;

    $('#player-deck-overhead-count').text(playerDeckCount);
    $('#computer-deck-overhead-count').text(compDeckCount);

    $('#player-gy-overhead-count').text(playerGyCount);
    $('#computer-gy-overhead-count').text(compGyCount);

    updateGraveyardZones();
    updateActionableCards();
    updateStatModBadges();
}

// Inflict direct damage on who's Life Points
function damageLP(who, amount) {
    if (amount <= 0) return;
    GameState[who].lp = Math.max(0, GameState[who].lp - amount);
    if (typeof BattleFX !== 'undefined') {
        BattleFX.spawnFloatingDamage(who === 'computer' ? $('#opponent-lp') : $('#player-lp'), amount, 'direct');
        BattleFX.animateLPCount(who, GameState[who].lp);
    }
    EventBus.emit('LP_CHANGED', { who: who, lp: GameState[who].lp, damage: amount });
    updateResourceCounters();
}

// Remove hand card DOM elements that are no longer in GameState
function updateHandDisplay(who) {
    var hand = GameState[who].hand;
    getHand(who).find('div.card').each(function() {
        var uid = $(this).attr('data-uid');
        var stillExists = hand.some(function(c) { return c.uid === uid; });
        if (!stillExists) {
            animateHandReorder(getHand(who), this, getAnimDuration(380));
        }
    });
    updateResourceCounters();
}

/**
 * Scan player's field monsters and hand cards to apply ambient glow to actionable cards (Pattern 1)
 */
function updateActionableCards() {
    var isPlayerTurn = (typeof turn !== 'undefined' && turn === 0 && GameState && GameState.turn && GameState.turn.active === 'player');
    var isMainPhase = (typeof phase !== 'undefined' && (phase === 2 || phase === 4));

    // 1. Scan On-Field Monsters
    $('#player-field .card-zone-square[data-zone]').each(function() {
        var zoneNum = parseInt($(this).attr('data-zone'));
        var cardType = $(this).attr('data-card-type');
        var monster = (GameState && GameState.player && GameState.player.field && GameState.player.field.monsters) ? GameState.player.field.monsters[zoneNum] : null;
        var zoneElem = $(this).find('.card-zone.main-zone');

        if (!zoneElem.length) return;

        if (isPlayerTurn && monster && cardType === 'monsters') {
            var canAttack = (monster.position === 'attack' && turnCount !== 1 && !monster.hasAttacked);
            if (canAttack && isAttackBlocked('player')) {
                canAttack = false;
            }

            var canChangePos = (monster.turnPosChanged != turnCount && !monster.hasAttacked);
            if (canChangePos && isDragonLocked()) {
                var monsterDef = cards[monster.cardId];
                if (monsterDef && monsterDef.monsterType === 'Dragon' && monster.position !== 'attack') {
                    canChangePos = false; // Cannot switch to Attack while jar is up
                }
            }

            var hasHandCards = (GameState && GameState.player && GameState.player.hand) ? (GameState.player.hand.length > 0) : false;
            var canUseEffect = false;
            if (isMainPhase && monster.position !== 'defense-down' && monster.lastEffectTurn !== turnCount) {
                if (monster.cardId === 'time-wizard') {
                    canUseEffect = true;
                } else if (monster.cardId === 'harpie-lady' && hasHandCards && (typeof hasSpellTrapOnField === 'function' && hasSpellTrapOnField())) {
                    canUseEffect = true;
                }
            }

            if (canAttack || canChangePos || canUseEffect) {
                zoneElem.addClass('card-actionable');
            } else {
                zoneElem.removeClass('card-actionable');
            }
        } else {
            zoneElem.removeClass('card-actionable');
        }
    });

    // 2. Scan Player Hand (monsters summonable + spells/traps playable during Main Phase)
    var canPlayFromHand = isPlayerTurn && isMainPhase;

    $('#player-hand > .card').each(function() {
        var cardName = $(this).attr('data-card-name');
        var cardDef = cards[cardName];
        if (!cardDef) return;

        var isPlayable = false;
        if (canPlayFromHand) {
            isPlayable = isCardCurrentlyPlayable(cardDef);
        }

        if (isPlayable) {
            $(this).addClass('card-actionable');
        } else {
            $(this).removeClass('card-actionable');
        }

        // Check if this monster is a Tribute Summon ready to be summoned
        var isTributeReady = false;
        if (canPlayFromHand && cardDef.type === 'monsters' && isPlayable) {
            var reqTributes = (typeof getRequiredTributes === 'function') ? getRequiredTributes(cardDef.level) : 0;
            if (cardDef.id === 'infernal-incinerator' || reqTributes > 0) {
                isTributeReady = true;
            }
        }

        var existingTributeBadge = $(this).find('.hand-tribute-badge');
        if (isTributeReady) {
            if (!existingTributeBadge.length) {
                $(this).append('<div class="hand-tribute-badge"><span class="hand-tribute-icon">🔥</span><span class="hand-tribute-label">TRIBUTE</span></div>');
            }
        } else {
            existingTributeBadge.remove();
        }

        // During Main Phase, mark cards that have no available action so they
        // can be visually de-emphasized (e.g. partial grayscale)
        if (canPlayFromHand && !isPlayable) {
            $(this).addClass('card-not-actionable');
        } else {
            $(this).removeClass('card-not-actionable');
        }
    });
}

// Graveyard Inspector Modal
function openGraveyardModal(who) {
    var isPlayer = (who === 'player');
    $('#gy-modal-category').text(isPlayer ? 'PLAYER ARCHIVE' : 'OPPONENT ARCHIVE');
    $('#gy-modal-title').text(isPlayer ? 'PLAYER GRAVEYARD' : 'OPPONENT GRAVEYARD');

    var gyList = (GameState && GameState[who] && GameState[who].graveyard) ? GameState[who].graveyard : [];
    
    var cardIds = gyList.map(function(item) {
        return typeof item === 'string' ? item : item.cardId;
    });

    $('#gy-modal-count').text(cardIds.length + ' ' + (cardIds.length === 1 ? 'CARD' : 'CARDS') + ' IN GRAVEYARD');

    var grid = $('#gy-cards-grid');
    grid.empty();

    if (cardIds.length === 0) {
        $('#gy-empty-state').show();
        grid.hide();
    } else {
        $('#gy-empty-state').hide();
        grid.show();

        // Render from top of graveyard downwards (newest first)
        for (var i = cardIds.length - 1; i >= 0; i--) {
            var cId = cardIds[i];
            var cDef = cards[cId];
            if (!cDef) continue;

            var statsText = '';
            if (cDef.type === 'monsters') {
                statsText = 'ATK ' + cDef.atk + ' / DEF ' + cDef.def;
            } else {
                statsText = (cDef.subType ? cDef.subType.toUpperCase() : '') + ' ' + cDef.type.toUpperCase();
            }

            var cardTile = $('<div class="gy-card-tile card" data-card-name="' + cId + '">' +
                '<div class="gy-card-img-wrap">' +
                    '<img src="cards/' + cDef.file + '" alt="' + cDef.name + '">' +
                '</div>' +
                '<div class="gy-card-info-bar">' +
                    '<span class="gy-card-name">' + cDef.name + '</span>' +
                    '<span class="gy-card-stats">' + statsText + '</span>' +
                '</div>' +
            '</div>');

            grid.append(cardTile);
        }
    }

    $('#graveyard-modal').fadeIn(150);
}

function closeGraveyardModal() {
    $('#graveyard-modal').fadeOut(120);
}

function updateGraveyardZones() {
    ['player', 'computer'].forEach(function(who) {
        var gyList = (GameState && GameState[who] && GameState[who].graveyard) ? GameState[who].graveyard : [];
        var gyZone = $('#' + who + '-graveyard-zone');
        var placeholder = gyZone.find('.gy-empty-placeholder');
        var stackLayers = gyZone.find('.gy-stack-layers');

        $('#' + who + '-gy-overhead-count').text(gyList.length);

        if (gyList.length === 0) {
            placeholder.show();
            stackLayers.hide();
        } else {
            placeholder.hide();
            stackLayers.show();

            var topCard = gyList[gyList.length - 1];
            var cardId = typeof topCard === 'string' ? topCard : topCard.cardId;
            var cDef = cards[cardId];
            if (cDef) {
                gyZone.find('.gy-top-card-img').attr('src', 'cards/' + cDef.file).show();
            }

            // Manage 3D pile depth based on card count
            if (gyList.length >= 4) {
                gyZone.find('.gy-layer-1, .gy-layer-2, .gy-layer-3').css('opacity', '1');
            } else if (gyList.length === 3) {
                gyZone.find('.gy-layer-1, .gy-layer-2').css('opacity', '1');
                gyZone.find('.gy-layer-3').css('opacity', '0');
            } else if (gyList.length === 2) {
                gyZone.find('.gy-layer-1').css('opacity', '1');
                gyZone.find('.gy-layer-2, .gy-layer-3').css('opacity', '0');
            } else {
                gyZone.find('.gy-layer-1, .gy-layer-2, .gy-layer-3').css('opacity', '0');
            }
        }
    });

    updateBanishedZones();
}

function openBanishedModal(who) {
    var isPlayer = (who === 'player');
    $('#banished-modal-category').text(isPlayer ? 'PLAYER ARCHIVE' : 'OPPONENT ARCHIVE');
    $('#banished-modal-title').text(isPlayer ? 'PLAYER BANISHED ZONE' : 'OPPONENT BANISHED ZONE');

    var banishedList = (GameState && GameState[who] && GameState[who].banished) ? GameState[who].banished : [];
    
    var cardIds = banishedList.map(function(item) {
        return typeof item === 'string' ? item : (item.cardId || (item.card && item.card.cardId));
    }).filter(Boolean);

    $('#banished-modal-count').text(cardIds.length + ' ' + (cardIds.length === 1 ? 'CARD' : 'CARDS') + ' REMOVED FROM PLAY');

    var grid = $('#banished-cards-grid');
    grid.empty();

    if (cardIds.length === 0) {
        $('#banished-empty-state').show();
        grid.hide();
    } else {
        $('#banished-empty-state').hide();
        grid.show();

        // Render from top of banished pile downwards (newest first)
        for (var i = cardIds.length - 1; i >= 0; i--) {
            var cId = cardIds[i];
            var cDef = cards[cId];
            if (!cDef) continue;

            var statsText = '';
            if (cDef.type === 'monsters') {
                statsText = 'ATK ' + cDef.atk + ' / DEF ' + cDef.def;
            } else {
                statsText = (cDef.subType ? cDef.subType.toUpperCase() : '') + ' ' + cDef.type.toUpperCase();
            }

            var cardTile = $('<div class="gy-card-tile card" data-card-name="' + cId + '">' +
                '<div class="gy-card-img-wrap">' +
                    '<img src="cards/' + cDef.file + '" alt="' + cDef.name + '">' +
                '</div>' +
                '<div class="gy-card-info-bar">' +
                    '<span class="gy-card-name">' + cDef.name + '</span>' +
                    '<span class="gy-card-stats">' + statsText + '</span>' +
                '</div>' +
            '</div>');

            grid.append(cardTile);
        }
    }

    $('#banished-modal').fadeIn(150);
}

function closeBanishedModal() {
    $('#banished-modal').fadeOut(120);
}

function updateBanishedZones() {
    ['player', 'computer'].forEach(function(who) {
        var banishedList = (GameState && GameState[who] && GameState[who].banished) ? GameState[who].banished : [];
        var tab = $('#' + who + '-banished-tab');
        var countElem = $('#' + who + '-banished-count');

        countElem.text(banishedList.length);

        if (banishedList.length > 0) {
            tab.fadeIn(200);
        } else {
            tab.fadeOut(150);
        }
    });
}

// System / Pause Menu Handlers
function openSystemMenu() {
    updateSpeedButtonsUI();
    $('#system-menu-modal').fadeIn(150);
}

function closeSystemMenu() {
    $('#system-menu-modal').fadeOut(120);
}

function concedeDuel() {
    closeSystemMenu();
    addToFeed('\n*** Player surrendered the duel. ***\n\n');
    showPopup('YOU CONCEDED');
    setTimeout(function() {
        endGame();
    }, 800);
}

function restartDuel() {
    closeSystemMenu();
    endGame();
    setTimeout(function() {
        startGame();
    }, 200);
}

// Duel Outcome (Victory / Defeat) Handlers
function showGameOverModal(isVictory) {
    var modal = $('#duel-outcome-modal');
    var panel = modal.find('.outcome-modal-panel');
    var iconVictory = $('#outcome-icon-victory');
    var iconDefeat = $('#outcome-icon-defeat');
    var title = $('#outcome-main-title');
    var subTitle = $('#outcome-sub-title');

    if (isVictory) {
        panel.removeClass('is-defeat');
        iconVictory.show();
        iconDefeat.hide();
        title.text('VICTORY');
        subTitle.text("OPPONENT'S LIFE POINTS REDUCED TO 0");
    } else {
        panel.addClass('is-defeat');
        iconVictory.hide();
        iconDefeat.show();
        title.text('DEFEAT');
        subTitle.text('YOUR LIFE POINTS HAVE BEEN DEPLETED');
    }

    // Populate Stats
    $('#outcome-stat-turns').text(turnCount || 1);
    $('#outcome-stat-player-lp').text(GameState.player.lp + ' LP');
    $('#outcome-stat-enemy-lp').text(GameState.computer.lp + ' LP');
    var enemyLostCount = (GameState.computer && GameState.computer.graveyard) ? GameState.computer.graveyard.length : 0;
    $('#outcome-stat-enemy-gy').text(enemyLostCount + (enemyLostCount === 1 ? ' CARD' : ' CARDS'));

    modal.css('display', 'flex').hide().fadeIn(300);
}

function restartDuelFromOutcome() {
    $('#duel-outcome-modal').fadeOut(150);
    restartDuel();
}

function returnToTitleFromOutcome() {
    $('#duel-outcome-modal').fadeOut(150);
    endGame();
}

// Add n cards to player/computer's hand with animated draw flight sequence
async function getCards(who, num) {

    var drawnCards = [];

    for (var i = 0; i < num; i++) {
        var cardName = null;

        if (GameState[who] && GameState[who].deck && GameState[who].deck.length > 0) {
            cardName = GameState[who].deck.pop();
            if (who === 'player' && typeof deck !== 'undefined') {
                deck = GameState.player.deck;
            }
        } else {
            var pool = (typeof getCollectibleCardIds === 'function')
                ? getCollectibleCardIds()
                : Object.keys(cards).filter(function(id) { var d = cards[id]; return d && !d.isToken && d.subType !== 'token'; });
            cardName = random(pool);
        }

        if (!cardName || !cards[cardName]) continue;

        var instance = new CardInstance(cardName);
        GameState[who].hand.push(instance);

        var cardElm = addCardToHand(who, cardName, instance.uid, true);
        drawnCards.push({ name: cardName, elm: cardElm });
    }

    if (typeof BattleFX !== 'undefined' && drawnCards.length > 0) {
        if (drawnCards.length > 1) {
            // Rapid staggered multi-draw
            var drawPromises = [];
            for (var k = 0; k < drawnCards.length; k++) {
                (function(cardInfo, idx) {
                    var p = new Promise(function(res) {
                        setTimeout(async function() {
                            await BattleFX.animateCardDraw(who, cardInfo.name, cardInfo.elm, true);
                            res();
                        }, idx * 70);
                    });
                    drawPromises.push(p);
                })(drawnCards[k], k);
            }
            await Promise.all(drawPromises);
        } else {
            // Single card turn draw
            await BattleFX.animateCardDraw(who, drawnCards[0].name, drawnCards[0].elm, false);
        }
    } else {
        drawnCards.forEach(function(c) {
            if (c.elm) $(c.elm).css({ opacity: 1, visibility: 'visible' });
        });
    }

    updateResourceCounters();
    if (typeof BattleFX !== 'undefined') BattleFX.updateDeckVisuals();
}

async function summonMonster(who, monsterName, skipFeed) {
    const firstFreeZone = getFirstFreeZone(who);
    if (firstFreeZone === undefined) return;

    const mode = AICalcMonsterPosition(monsterName);
    const source = getHandCardElm(who, monsterName);
    const target = getSquareElm(who, firstFreeZone);

    // Reserve slot in DOM and GameState immediately before async animation starts
    target.attr('data-card-name', monsterName);
    target.attr('data-card-type', 'monsters');
    target.attr('data-card-position', mode);

    await moveCard(who, source, target, mode, skipFeed);
}

// Move a monster card (from hand) to a monster zone on the board
async function moveCard(who, source, targetSquare, mode, skipFeed) {

    let isDefense, faceDown;
    if (mode === 'attack') {
        isDefense = false;
        faceDown = false;
    } else if (mode === 'defense-down') {
        isDefense = true;
        faceDown = true;
    } else if (mode === 'defense-up') {
        isDefense = true;
        faceDown = false;
    }

    const cardName = $(source).attr('data-card-name') || $(targetSquare).attr('data-card-name');
    const cardType = $(source).attr('data-card-type') || 'monsters';
    const zoneNum = parseInt($(targetSquare).attr('data-zone'));

    // Reserve GameState immediately
    var instance = new CardInstance(cardName);
    instance.position = mode;
    instance.turnSummoned = turnCount;
    instance.turnPosChanged = turnCount;
    GameState[who].field.monsters[zoneNum] = instance;

    // Reserve DOM attributes
    targetSquare.attr('data-card-name', cardName);
    targetSquare.attr('data-card-type', cardType);
    targetSquare.attr('data-card-position', mode);

    if (!skipFeed) {
        var cardDef = cards[cardName];
        var monsterDisplayName = cardDef ? cardDef.name : cardName;
        if (mode === 'defense-down') {
            if (who === 'player') {
                addToFeed('Player sets <em>' + monsterDisplayName + '</em> in Defense Position in zone #' + zoneNum + '.\n\n');
            } else {
                addToFeed('Computer sets a monster in Defense Position in zone #' + zoneNum + '.\n\n');
            }
        } else if (mode === 'defense-up') {
            addToFeed(formatWho(who) + ' summons <em>' + monsterDisplayName + '</em> in Defense Position in zone #' + zoneNum + '.\n\n');
        } else {
            addToFeed(formatWho(who) + ' Normal Summons <em>' + monsterDisplayName + '</em> in Attack Position in zone #' + zoneNum + '.\n\n');
        }
    }

    // Find and remove from GameState hand
    var handIdx = GameState[who].hand.findIndex(function(c) { return c.cardId === cardName; });
    if (handIdx > -1) GameState[who].hand.splice(handIdx, 1);

    if (window[who] && window[who]['field'] && window[who]['field'][cardType]) {
        window[who]['field'][cardType].push({'zone': zoneNum, 'cardName': cardName, 'cardType': cardType, 'cardPosition': mode});
    }

    if (who === GameState.turn.active && cardType === 'monsters') {
        if (GameState.turn.normalSummonUsed && GameState.turn.extraNormalSummons > 0) {
            GameState.turn.extraNormalSummons--;
        } else {
            GameState.turn.normalSummonUsed = true;
        }
    }

    await animateCardPlacement(who, source, targetSquare, faceDown, isDefense, cardName, cardType, mode);

    await EventBus.emitAsync('MONSTER_SUMMONED', { who: who, instance: instance, zone: zoneNum });
    updateActionableCards();
    updateStatModBadges();
}

// Shared flight/flip/rotate animation when a card leaves the hand and lands on a square
function animateCardPlacement(who, source, targetSquare, faceDown, isDefense, cardName, cardType, mode) {
    return new Promise(function(resolve) {
        const faceUp = !faceDown;
        let isPlayer = (who === 'player');
        let isComputer = (who === 'computer');

        cardName = cardName || $(source).attr('data-card-name');
        cardType = cardType || $(source).attr('data-card-type') || 'monsters';
        mode = mode || (faceDown ? 'defense-down' : (isDefense ? 'defense-up' : 'attack'));

        var cardDef = cards[cardName];
        var imgSrc = cardDef ? cardDef.file : '';

        let targetZone = targetSquare.find('div.card-zone');

        // Measure exact coordinates inside #mat 3D perspective plane
        var sourceCoord = getMatLocalCoord(source);
        var targetCoord = getMatLocalCoord(targetZone);

        var cardWidth = (targetZone && targetZone.outerWidth()) ? targetZone.outerWidth() : ($(source).outerWidth() || 70);
        var cardHeight = (targetZone && targetZone.outerHeight()) ? targetZone.outerHeight() : ($(source).outerHeight() || 102);
        var targetTop = targetCoord.top;
        var targetLeft = targetCoord.left;

        // Keep target slot visibly clean/empty during flight
        targetZone.css({ 'visibility': 'hidden', 'opacity': '0' });

        var faceContent = '<div class="card-back"></div>';
        if (imgSrc) {
            faceContent += '<div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div>';
        }

        var flightClone = $('<div class="card card-draw-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + cardWidth + 'px; height: ' + cardHeight + 'px; top: ' + sourceCoord.top + 'px; left: ' + sourceCoord.left + 'px;">' +
            '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' +
                faceContent +
            '</div>' +
        '</div>');

        var frontElem = flightClone.find('.card-front');
        var backElem = flightClone.find('.card-back');

        if (isComputer) {
            // AI starts face-down (back visible at 0deg, front at 180deg)
            backElem.css({ transform: 'rotateY(0deg)' });
            frontElem.css({ transform: 'rotateY(180deg)' });
        } else {
            // Player starts face-up (front visible at 0deg, back at 180deg)
            frontElem.css({ transform: 'rotateY(0deg)' });
            backElem.css({ transform: 'rotateY(180deg)' });
        }

        $('#mat').append(flightClone);

        var animDuration = getAnimDuration(720);
        var animEasing = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

        // Smoothly re-center remaining cards in hand using FLIP layout animation
        animateHandReorder($(source).parent(), source, getAnimDuration(380));

        // Trigger synchronized 3D flip concurrently with flight & rotation
        if (isComputer && faceUp) {
            // AI flips face-up simultaneously as it travels
            backElem.transition({ rotateY: '180deg' }, animDuration, animEasing);
            frontElem.transition({ rotateY: '0deg' }, animDuration, animEasing);
        } else if (isPlayer && faceDown) {
            // Player flips face-down simultaneously as it rotates 90° and travels
            frontElem.transition({ rotateY: '180deg' }, animDuration, animEasing);
            backElem.transition({ rotateY: '0deg' }, animDuration, animEasing);
        }

        // Clear any active card selection aura immediately
        resetActiveCardClass();
        activeCard = null;

        // Flight translation and 90° horizontal stance rotation in perfect lockstep
        flightClone.transition({
            top: targetTop,
            left: targetLeft,
            rotate: isDefense ? '90deg' : '0',
            scale: 1
        }, animDuration, animEasing, function() {
            // Land on target square: apply DOM attributes and card image
            targetSquare.attr('data-card-type', cardType);
            targetSquare.attr('data-card-name', cardName);
            targetSquare.attr('data-card-position', mode);
            targetSquare.attr('data-turn-moved', turnCount);
            targetSquare.attr('data-turn-posChanged', turnCount);

            updateCardImage(targetSquare);

            if (typeof $.fn.flip === 'function') {
                try {
                    targetZone.flip({
                        'trigger': 'manual'
                    });
                    targetZone.flip(!faceUp);
                } catch (err) {}
            }

            if (faceUp) {
                targetZone.find('.front').css({
                    'display': 'flex',
                    'visibility': 'visible',
                    'opacity': '1',
                    'transform': 'rotateY(0deg)'
                });
                targetZone.find('.back').css({
                    'transform': 'rotateY(180deg)'
                });
            } else {
                targetZone.find('.front').css({
                    'transform': 'rotateY(180deg)'
                });
                targetZone.find('.back').css({
                    'display': 'flex',
                    'visibility': 'visible',
                    'opacity': '1',
                    'transform': 'rotateY(0deg)'
                });
            }

            if (isDefense) {
                targetZone.css('transform', 'rotate(90deg)');
            } else {
                targetZone.css('transform', 'rotate(0deg)');
            }

            targetZone.css({ 'visibility': 'visible', 'display': 'block', 'opacity': '1' });
            flightClone.remove();
            updateResourceCounters();
            resolve();
        });
    });
}


/**
 * Calculate untransformed local (top, left) coordinates of an element relative to #mat
 * @param {HTMLElement|jQuery} element 
 */
function getMatLocalCoord(element) {
    var el = $(element)[0];
    var mat = document.getElementById('mat');
    if (!el || !mat) return { top: 0, left: 0 };

    var top = 0;
    var left = 0;
    var curr = el;
    while (curr && curr !== mat && curr !== document.body) {
        top += curr.offsetTop || 0;
        left += curr.offsetLeft || 0;
        curr = curr.offsetParent;
    }
    return { top: top, left: left };
}

/**
 * Smoothly re-center remaining hand cards using FLIP (First, Last, Invert, Play) technique
 * @param {jQuery} handContainer - Hand flex container (#player-hand or #computer-hand)
 * @param {jQuery} removedCardElem - The card leaving the hand
 * @param {number} duration - Animation duration in ms
 */
function animateHandReorder(handContainer, removedCardElem, duration) {
    var hand = $(handContainer);
    if (!hand.length) return;

    var isCompHand = hand.is('#computer-hand') || hand.closest('#computer-hand').length > 0;
    var baseTransform = isCompHand ? 'rotateX(-35deg)' : 'rotateX(0deg)';

    var siblings = hand.children('.card').not(removedCardElem);
    
    // 1. FIRST: Record initial bounding boxes
    var firstPositions = [];
    siblings.each(function() {
        firstPositions.push({
            elem: this,
            rect: this.getBoundingClientRect()
        });
    });

    // 2. Remove the card from DOM flow immediately
    $(removedCardElem).remove();

    // 3. LAST: Record new bounding boxes after DOM removal
    var animDur = duration || getAnimDuration(380);

    firstPositions.forEach(function(item) {
        var lastRect = item.elem.getBoundingClientRect();
        var dx = item.rect.left - lastRect.left;
        var dy = item.rect.top - lastRect.top;

        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            // 4. INVERT: Apply inverted delta instantly with no transition
            $(item.elem).css({
                transform: 'translate3d(' + dx + 'px, ' + dy + 'px, 0) ' + baseTransform,
                transition: 'none'
            });

            // Force reflow
            void item.elem.offsetWidth;

            // 5. PLAY: Animate smoothly to natural position (0, 0)
            $(item.elem).css({
                transform: 'translate3d(0, 0, 0) ' + baseTransform,
                transition: 'transform ' + animDur + 'ms cubic-bezier(0.2, 0.9, 0.3, 1)'
            });

            // 6. CLEANUP: Reset inline styles so base stylesheet transforms persist uniformly
            setTimeout(function() {
                $(item.elem).css({
                    transform: '',
                    transition: ''
                });
            }, animDur + 20);
        }
    });
}

// Select card in player hand
$(document).on('click', '#player-hand > .card', function() {

    if ($('body').hasClass('spell-target-selection-mode')) return;

    if (turn !== 0) return;
    if ($(this).attr('is-moving-clone')) return;

    var cardId = $(this).attr('data-card-name');
    var cardDef = getCardDef(cardId);

    if ($(this).is(activeCard)) {
        $('.active-card').removeClass('active-card');
        activeCard = null;
        hideSummonOptionsIfVisible();
        hidePositionChangeOptionsIfVisible();
        hideAtkMenuIfVisible();
        clearAvailableZones();
        updateStatModBadges();
        return;
    }

    if (activeCard !== null) { 
        $('.active-card').removeClass('active-card');
        hideSummonOptionsIfVisible();
        hidePositionChangeOptionsIfVisible();
        hideAtkMenuIfVisible();
        updateStatModBadges();
    }

    // Hand cards: do not select unless they can actually be played now
    if (cardDef && !isCardCurrentlyPlayable(cardDef)) {
        var reason = getCardUnplayableReason(cardDef);
        addToFeed('(Rule) Cannot play <em>' + cardDef.name + '</em>. ' + reason + '\n\n');
        return;
    }

    activeCard = $(this);
    $(this).addClass('active-card');

    if (cardDef && cardDef.type === 'spells' && cardDef.subType === 'field') {
        updateStatModBadges(cardDef.id);
    } else {
        updateStatModBadges();
    }

    if (turn === 0 && cardDef) showAvailableZonesForCard(cardDef);
});

$(document).on('click', '#player-field div.card-zone-square, #opponent-field div.card-zone-square', function() {

    if ($('body').hasClass('spell-target-selection-mode')) return;

    if ($('body').hasClass('tribute-selection-mode')) {
        if ($(this).hasClass('tribute-candidate-highlight')) {
            var zoneNum = parseInt($(this).attr('data-zone'));
            toggleTributeCandidateOnMat(zoneNum, $(this));
        }
        return;
    }

    if ($(this).closest('#opponent-field').length > 0) return;

    const thisSelectedZone = $(this).find('div.card-zone.main-zone');

    if (thisSelectedZone.is(activeCard)) {
        $('.active-card').removeClass('active-card');
        activeCard = null;
        selectedSquare = null;
        hideSummonOptionsIfVisible();
        hidePositionChangeOptionsIfVisible();
        hideAtkMenuIfVisible();
        return;
    }

    if (turn === 1) return;
    
    const squareIsEmpty = isSquareEmpty($(this));
    selectedSquare = $(this);

    // ---- Card placement from hand onto an empty square ----
    if (activeCard !== null && squareIsEmpty) {
        var activeCardId = activeCard.attr('data-card-name');
        var activeCardDef = getCardDef(activeCardId);
        var zoneKind = $(this).attr('data-zone-kind') || 'slot';

        if (activeCardDef && activeCardDef.type !== 'monsters') {
            playNonMonsterCard('player', activeCard, $(this), activeCardDef, zoneKind);
            return;
        } else if (activeCardDef && activeCardDef.type === 'monsters') {
            if (zoneKind === 'field') {
                addToFeed('(Action) Monsters cannot be summoned into the Field Spell Zone.\n\n');
                return;
            }

            var normalSummonExhausted = (typeof GameState !== 'undefined' && GameState && GameState.turn && GameState.turn.normalSummonUsed && (!GameState.turn.extraNormalSummons || GameState.turn.extraNormalSummons <= 0));
            if (normalSummonExhausted) {
                addToFeed('(Action) You have already used your Normal Summon/Set for this turn.\n\n');
                resetActiveCardClass();
                clearAvailableZones();
                activeCard = null;
                selectedSquare = null;
                return;
            }

            var reqTributes = (typeof getRequiredTributes === 'function') ? getRequiredTributes(activeCardDef.level) : 0;
            if (activeCardDef.id === 'infernal-incinerator' || reqTributes > 0) {
                startOnMatTributeSelection(activeCard, activeCardDef, $(this), activeCardDef.id === 'infernal-incinerator' ? 1 : reqTributes);
                return;
            }

            var summonOptions = $('#summon-options');
            $('#summon-card-title').text(activeCardDef.name || 'SUMMON MONSTER');
            $('#summon-card-stats').text('LVL ' + (activeCardDef.level || 1) + ' • ' + (activeCardDef.attribute || '') + ' • [' + (activeCardDef.monsterType || 'Monster') + '] • ATK ' + activeCardDef.atk + ' / DEF ' + activeCardDef.def);

            var isJarActive = (typeof isDragonLocked === 'function') && isDragonLocked();
            var isDragon = (activeCardDef.monsterType === 'Dragon');

            if (isJarActive && isDragon) {
                $('#summon-jar-warning-banner').show();
                $('#stance-attack-desc').html('<span style="color: #fbbf24; font-weight: 600;">⚠ Dragon Capture Jar is active: Card will be forced into Defense Position upon landing.</span>');
            } else {
                $('#summon-jar-warning-banner').hide();
                $('#stance-attack-desc').text('Summon upright to declare attacks and inflict battle damage');
            }

            summonOptions.fadeIn(150);
            return;
        }
    }

    // Clicking an occupied square
    if (!squareIsEmpty) {
        resetActiveCardClass();
        selectedSquare = $(this);
        activeCard = $(this).find('div.card-zone.main-zone');
        $(this).find('div.card-zone.main-zone').addClass('active-card');
    }

    const cardType = $(this).attr('data-card-type');
    const cardPosition = $(this).attr('data-card-position');
    const turnPosChanged = $(this).attr('data-turn-posChanged');
    const isPlayerField = $(this).closest('#player-field').length > 0;

    // Direct Attack Target Selection & Position Switch Bar (for monsters)
    if (isPlayerField && !squareIsEmpty && cardType === 'monsters') {
        const zoneNum = parseInt($(this).attr('data-zone'));
        const monsterInst = GameState.player.field.monsters[zoneNum];

        var isJarActive = (typeof isDragonLocked === 'function') && isDragonLocked();
        var cardDef = monsterInst ? cards[monsterInst.cardId] : null;
        var isDragonLockedMonster = isJarActive && cardDef && (cardDef.monsterType === 'Dragon');

        var canAttack = (cardPosition === 'attack' && turnCount !== 1 && monsterInst && !monsterInst.hasAttacked && !isDragonLockedMonster);
        var canChangePos = (turnPosChanged != turnCount && monsterInst && !monsterInst.hasAttacked && !isDragonLockedMonster);

        // Immediately illuminate legal attack targets on the mat
        if (canAttack && typeof BattleFX !== 'undefined') {
            BattleFX.startPlayerTargetSelection(zoneNum);
        } else if (typeof BattleFX !== 'undefined') {
            BattleFX.cancelTargetSelection();
        }

        var ctxBar = $('#card-context-actions');
        var btnDefense = $('#ctx-btn-defense');
        var btnToAttack = $('#ctx-btn-to-attack');
        var btnEffect = $('#ctx-btn-effect');

        btnDefense.hide();
        btnToAttack.hide();
        btnEffect.hide();
        btnToAttack.prop('disabled', false).removeClass('is-locked').find('span').text('TO ATTACK');

        var isMainPhase = (typeof phase !== 'undefined' && (phase === 2 || phase === 4));
        var hasHandCards = (GameState && GameState.player && GameState.player.hand) ? (GameState.player.hand.length > 0) : false;
        var canUseEffect = false;
        var effectBtnText = 'ACTIVATE EFFECT';

        if (isMainPhase && monsterInst && cardPosition !== 'defense-down' && monsterInst.lastEffectTurn !== turnCount) {
            if (monsterInst.cardId === 'time-wizard') {
                canUseEffect = true;
                effectBtnText = 'TIME ROULETTE';
            } else if (monsterInst.cardId === 'harpie-lady' && hasHandCards && (typeof hasSpellTrapOnField === 'function' && hasSpellTrapOnField())) {
                canUseEffect = true;
                effectBtnText = 'HUNTING CLAW';
            } else if (monsterInst.cardId === 'exiled-force') {
                var allFieldMonsters = (GameState) ? [...GameState.getMonstersOnField('player'), ...GameState.getMonstersOnField('computer')] : [];
                if (allFieldMonsters.length > 0) {
                    canUseEffect = true;
                    effectBtnText = 'EXILE STRIKE';
                }
            } else if (monsterInst.cardId === 'gryphon-stormlord') {
                var anyOtherMonsters = (GameState) ? [...GameState.getMonstersOnField('player'), ...GameState.getMonstersOnField('computer')].filter(function(entry) {
                    return entry.zone !== zoneNum || entry.side !== 'player';
                }) : [];
                if (anyOtherMonsters.length > 0) {
                    canUseEffect = true;
                    effectBtnText = 'CYCLONE BOUNCE';
                }
            } else if (monsterInst.cardId === 'gale-swiftblade') {
                var oppFaceUp = (GameState) ? GameState.getMonstersOnField('computer').filter(function(entry) {
                    return entry.card && !entry.card.faceDown && entry.card.position !== 'defense-down';
                }) : [];
                if (oppFaceUp.length > 0 && monsterInst.usedGaleTurn !== turnCount) {
                    canUseEffect = true;
                    effectBtnText = 'GALE SLASH (HALVE ATK/DEF)';
                }
            }
        }

        if (canUseEffect) {
            btnEffect.find('span').text(effectBtnText);
            btnEffect.show();
        }

        var showCtx = false;
        if (cardPosition !== 'attack' && isDragonLockedMonster) {
            // Dragon Capture Jar active: show explicit locked disabled state
            btnToAttack.prop('disabled', true).addClass('is-locked');
            btnToAttack.find('span').text('🔒 LOCKED BY DRAGON CAPTURE JAR');
            btnToAttack.show();
            showCtx = true;
        } else if (canChangePos) {
            if (cardPosition === 'attack') {
                btnDefense.show();
            } else {
                btnToAttack.show();
            }
            showCtx = true;
        }

        if (canUseEffect) {
            showCtx = true;
        }

        if (showCtx) {
            ctxBar.show();
            var offset = $(this).offset();
            var barWidth = ctxBar.outerWidth() || 180;
            var squareWidth = $(this).outerWidth() || 100;
            ctxBar.css({
                top: (offset.top - 42) + 'px',
                left: (offset.left + (squareWidth / 2) - (barWidth / 2)) + 'px'
            });
        } else {
            ctxBar.hide();
        }
    } else if (isPlayerField && !squareIsEmpty && (cardType === 'spells' || cardType === 'traps')) {
        const zoneNum = parseInt($(this).attr('data-zone'));
        const spellInst = (GameState && GameState.player && GameState.player.field && GameState.player.field.spells) ? GameState.player.field.spells[zoneNum] : null;
        var isMainPhase = (typeof phase !== 'undefined' && (phase === 2 || phase === 4));
        var cardDef = spellInst ? cards[spellInst.cardId] : null;

        if (isMainPhase && spellInst && cardDef && (cardDef.id === 'vortex-recall' || cardDef.id === 'crypt-awakening' || cardDef.id === 'mystical-space-typhoon' || cardDef.id === 'dragon-capture-jar')) {
            var ctxBar = $('#card-context-actions');
            $('#ctx-btn-defense').hide();
            $('#ctx-btn-to-attack').hide();
            var btnEffect = $('#ctx-btn-effect');
            btnEffect.find('span').text('ACTIVATE ' + (cardDef.name ? cardDef.name.toUpperCase() : 'TRAP'));
            btnEffect.show();
            ctxBar.show();
            var offset = $(this).offset();
            var barWidth = ctxBar.outerWidth() || 180;
            var squareWidth = $(this).outerWidth() || 100;
            ctxBar.css({
                top: (offset.top - 42) + 'px',
                left: (offset.left + (squareWidth / 2) - (barWidth / 2)) + 'px'
            });
        } else {
            if (typeof BattleFX !== 'undefined') BattleFX.cancelTargetSelection();
            $('#card-context-actions').hide();
        }
    } else {
        if (typeof BattleFX !== 'undefined') BattleFX.cancelTargetSelection();
        $('#card-context-actions').hide();
    }
});

// Dismiss floating context menu when clicking anywhere else
$(document).on('click', function(e) {
    if (!$(e.target).closest('#card-context-actions, .card-zone-square, #player-hand').length) {
        hideAtkMenuIfVisible();
        resetActiveCardClass();
    }
});

function cancelSummonAction() {
    $('#summon-options').fadeOut(120);
    resetActiveCardClass();
    clearAvailableZones();
    activeCard = null;
    selectedSquare = null;
}

function cancelPositionChangeAction() {
    $('#change-position-options').fadeOut(120);
    resetActiveCardClass();
    hideAtkMenuIfVisible();
    activeCard = null;
    selectedSquare = null;
}

async function summonOptionSelected(position) {
    if (!activeCard || !selectedSquare) return;

    var sourceCard = activeCard;
    var targetSq = selectedSquare;
    var monsterName = sourceCard.attr('data-card-name');

    resetActiveCardClass();
    $('#summon-options').hide();
    clearAvailableZones();

    activeCard = null;
    selectedSquare = null;

    await moveCard('player', sourceCard, targetSq, position);

    updateActionableCards();
    updateResourceCounters();
}

// ==========================================================================
// Tribute Summon System (Direct On-Mat Selection UX)
// ==========================================================================

var pendingTributeSourceCard = null;
var pendingTributeCardDef = null;
var pendingTributeTargetSquare = null;
var pendingTributeReqCount = 0;
var selectedTributeZones = [];

function startOnMatTributeSelection(sourceCard, cardDef, targetSquare, reqCount) {
    var normalSummonExhausted = (typeof GameState !== 'undefined' && GameState && GameState.turn && GameState.turn.normalSummonUsed && (!GameState.turn.extraNormalSummons || GameState.turn.extraNormalSummons <= 0));
    if (normalSummonExhausted) {
        addToFeed('(Action) You have already used your Normal Summon/Set for this turn.\n\n');
        cancelTributeSelection();
        return;
    }

    pendingTributeSourceCard = sourceCard;
    pendingTributeCardDef = cardDef;
    pendingTributeTargetSquare = targetSquare;
    pendingTributeReqCount = reqCount;
    selectedTributeZones = [];

    var isInfernal = (cardDef.id === 'infernal-incinerator');
    var isMausoleum = (typeof isMausoleumActive === 'function') && isMausoleumActive();
    var lpCost = reqCount * 1000;
    var canAffordMausoleum = isMausoleum && !isInfernal && (GameState.player.lp > lpCost);

    if (isInfernal) {
        pendingTributeReqCount = 1;
        $('#tribute-bar-card-name').text('INFERNAL INCINERATOR');
        var sourceUid = sourceCard.attr('data-uid');
        var otherHandCards = GameState.player.hand.filter(function(c) { return c.uid !== sourceUid; });
        var discardNote = otherHandCards.length > 0
            ? ' (' + otherHandCards.length + ' HAND CARD' + (otherHandCards.length > 1 ? 'S' : '') + ' DISCARDED)'
            : ' (0 DISCARDS)';
        $('#tribute-bar-counter').text('SELECT 1 MONSTER WITH 2000+ ATK (0/1)' + discardNote);
    } else {
        $('#tribute-bar-card-name').text(cardDef.name || 'TRIBUTE SUMMON');
        $('#tribute-bar-counter').text('SELECT ' + reqCount + ' MONSTER' + (reqCount > 1 ? 'S' : '') + ' ON YOUR FIELD (0/' + reqCount + ')');
    }

    // Filter eligible monster zones on player field
    var ownMonsters = GameState.getMonstersOnField('player').filter(function(entry) {
        var mDef = cards[entry.card.cardId];
        return !entry.card.cannotBeTributed && !(mDef && mDef.cannotBeTributed);
    });

    if (isInfernal) {
        ownMonsters = ownMonsters.filter(function(entry) {
            var isFaceDown = entry.card.faceDown || entry.card.position === 'defense-down';
            return !isFaceDown && (typeof getMonsterAtk === 'function' ? getMonsterAtk(entry.card) >= 2000 : (cards[entry.card.cardId] && cards[entry.card.cardId].atk >= 2000));
        });
    }

    // Tribute of the Ages: Check if an opponent monster is bound for sacrifice
    var soulTarget = (GameState.turn && GameState.turn.tributeOfTheAgesTarget && GameState.turn.tributeOfTheAgesTarget.who === 'player') ? GameState.turn.tributeOfTheAgesTarget : null;
    var validOppCandidate = null;
    if (soulTarget && GameState[soulTarget.opp] && GameState[soulTarget.opp].field && GameState[soulTarget.opp].field.monsters[soulTarget.zone]) {
        var oppInst = GameState[soulTarget.opp].field.monsters[soulTarget.zone];
        if (oppInst && (!soulTarget.uid || oppInst.uid === soulTarget.uid) && !oppInst.faceDown && oppInst.position !== 'defense-down') {
            validOppCandidate = { who: soulTarget.opp, zone: soulTarget.zone, card: oppInst };
        }
    }

    var totalEligible = ownMonsters.length + (validOppCandidate ? 1 : 0);

    // If no valid candidates exist
    if (totalEligible < reqCount) {
        if (canAffordMausoleum) {
            $('#tribute-bar-counter').text('NO MONSTERS ON FIELD — PAY ' + lpCost + ' LP VIA MAUSOLEUM');
        } else {
            if (isInfernal) {
                addToFeed('You control no face-up monsters with 2000+ ATK to tribute for <em>' + cardDef.name + '</em>.\n');
            } else {
                addToFeed('You have not enough monsters on the field to tribute for <em>' + cardDef.name + '</em>.\n');
            }
            cancelTributeSelection();
            return;
        }
    }

    // Activate on-mat highlight mode
    $('body').addClass('tribute-selection-mode');
    ownMonsters.forEach(function(entry) {
        var sq = getSquareElm('player', entry.zone);
        sq.addClass('tribute-candidate-highlight');
    });
    if (validOppCandidate) {
        var oppSq = getSquareElm(validOppCandidate.who, validOppCandidate.zone);
        oppSq.addClass('tribute-candidate-highlight');
    }

    // Configure Mausoleum buttons
    if (canAffordMausoleum) {
        $('#mausoleum-cost-atk').text(lpCost);
        $('#mausoleum-cost-def').text(lpCost);
        $('#mausoleum-btn-attack').show();
        $('#mausoleum-btn-defense').show();
    } else {
        $('#mausoleum-btn-attack').hide();
        $('#mausoleum-btn-defense').hide();
    }

    updateTributeActionBarUI();
    $('#tribute-action-bar').fadeIn(150);
}

function toggleTributeCandidateOnMat(zoneNum, squareElm) {
    var isOpp = squareElm.closest('#opponent-field').length > 0;
    var targetWho = isOpp ? 'computer' : 'player';

    var idx = selectedTributeZones.findIndex(function(t) { return t.who === targetWho && t.zone === zoneNum; });
    if (idx !== -1) {
        selectedTributeZones.splice(idx, 1);
        squareElm.removeClass('is-tribute-selected').find('.tribute-selected-badge').remove();
    } else {
        if (selectedTributeZones.length < pendingTributeReqCount) {
            selectedTributeZones.push({ who: targetWho, zone: zoneNum });
            squareElm.addClass('is-tribute-selected').append('<div class="tribute-selected-badge">🔥</div>');
        } else if (pendingTributeReqCount === 1) {
            // Auto swap if single tribute
            $('.card-zone-square').removeClass('is-tribute-selected').find('.tribute-selected-badge').remove();
            selectedTributeZones = [{ who: targetWho, zone: zoneNum }];
            squareElm.addClass('is-tribute-selected').append('<div class="tribute-selected-badge">🔥</div>');
        }
    }
    updateTributeActionBarUI();
}

function updateTributeActionBarUI() {
    var count = selectedTributeZones.length;
    var req = pendingTributeReqCount;
    var cardDef = pendingTributeCardDef;
    var isInfernal = cardDef && (cardDef.id === 'infernal-incinerator');

    if (isInfernal) {
        $('#tribute-bar-counter').text('SELECT 1 MONSTER WITH 2000+ ATK (' + count + '/' + req + ')');
    } else {
        var soulActive = (GameState.turn && GameState.turn.tributeOfTheAgesTarget && GameState.turn.tributeOfTheAgesTarget.who === 'player');
        var promptText = soulActive
            ? 'SELECT ' + req + ' MONSTER' + (req > 1 ? 'S' : '') + ' (OPPONENT TARGET AVAILABLE) (' + count + '/' + req + ')'
            : 'SELECT ' + req + ' MONSTER' + (req > 1 ? 'S' : '') + ' ON YOUR FIELD (' + count + '/' + req + ')';
        $('#tribute-bar-counter').text(promptText);
    }

    var isReady = (count === req);
    $('#tribute-btn-attack').prop('disabled', !isReady);
    $('#tribute-btn-defense').prop('disabled', !isReady);
}

function cancelTributeSelection() {
    clearTributeSelectionMode();
    resetActiveCardClass();
    clearAvailableZones();
    activeCard = null;
    selectedSquare = null;
}

function clearTributeSelectionMode() {
    $('body').removeClass('tribute-selection-mode');
    $('.card-zone-square').removeClass('tribute-candidate-highlight is-tribute-selected').find('.tribute-selected-badge').remove();
    $('#tribute-action-bar').fadeOut(120);

    pendingTributeSourceCard = null;
    pendingTributeCardDef = null;
    pendingTributeTargetSquare = null;
    pendingTributeReqCount = 0;
    selectedTributeZones = [];
}

async function confirmTributeSummon(position) {
    if (selectedTributeZones.length !== pendingTributeReqCount) return;

    var sourceCard = pendingTributeSourceCard;
    var targetSq = pendingTributeTargetSquare;
    var cardDef = pendingTributeCardDef;
    var tributeZones = [...selectedTributeZones];
    var isInfernal = (cardDef.id === 'infernal-incinerator');

    clearTributeSelectionMode();

    // Collect tribute monster names for narrative feed
    var tributeNames = [];
    for (var i = 0; i < tributeZones.length; i++) {
        var t = tributeZones[i];
        var tWho = t.who || 'player';
        var z = t.zone || t;
        var mInst = GameState[tWho].field.monsters[z];
        var mDef = mInst ? cards[mInst.cardId] : null;
        var namePrefix = (tWho === 'computer') ? "Opponent's " : "";
        tributeNames.push(namePrefix + (mDef ? mDef.name : 'a monster'));
        await destroyMonster(tWho, z);
        if (tWho === 'computer' && GameState.turn && GameState.turn.tributeOfTheAgesTarget) {
            delete GameState.turn.tributeOfTheAgesTarget;
            var oppSq = getSquareElm('computer', z);
            if (oppSq) oppSq.find('.tribute-of-ages-badge').remove();
        }
    }

    var discardedNames = [];
    if (isInfernal) {
        var sourceUid = sourceCard.attr('data-uid');
        var remainingCards = GameState.player.hand.filter(function(c) { return c.uid !== sourceUid; });
        for (var d = 0; d < remainingCards.length; d++) {
            var dInst = remainingCards[d];
            var dDef = cards[dInst.cardId];
            discardedNames.push(dDef ? dDef.name : 'a card');
            GameState.player.graveyard.push(dInst);
        }
        GameState.player.hand = GameState.player.hand.filter(function(c) { return c.uid === sourceUid; });
        updateHandDisplay('player');
        updateResourceCounters();
    }

    var zoneNum = parseInt(targetSq.attr('data-zone'));
    var actionType = (position === 'defense-down') ? 'Tribute Set' : 'Tribute Summon';
    var stanceLabel = (position === 'defense-down') ? 'Defense Position' : 'Attack Position';

    var discardMsg = (isInfernal && discardedNames.length > 0)
        ? ' and discards ' + discardedNames.length + ' other card(s) (<strong>' + discardedNames.join(', ') + '</strong>)'
        : '';

    addToFeed('Player Tributes <strong>' + tributeNames.join(' and ') + '</strong>' + discardMsg + ' to ' + actionType + ' <em>' + cardDef.name + '</em> in ' + stanceLabel + ' in zone #' + zoneNum + '.\n\n');

    resetActiveCardClass();
    clearAvailableZones();

    activeCard = null;
    selectedSquare = null;

    await moveCard('player', sourceCard, targetSq, position, true);

    // Trigger Tribute Summon monster abilities (e.g. Titan, Leviathan)
    if (typeof checkTributeSummonTriggers === 'function') {
        await checkTributeSummonTriggers('player', cardDef, zoneNum);
    }

    // Consume Normal Summon for turn
    if (GameState.turn.normalSummonUsed && GameState.turn.extraNormalSummons > 0) {
        GameState.turn.extraNormalSummons--;
    } else {
        GameState.turn.normalSummonUsed = true;
    }
    updateActionableCards();
    updateResourceCounters();
}

async function confirmMausoleumSummon(position) {
    var sourceCard = pendingTributeSourceCard;
    var targetSq = pendingTributeTargetSquare;
    var cardDef = pendingTributeCardDef;
    var lpCost = pendingTributeReqCount * 1000;

    if (GameState.player.lp <= lpCost) {
        addToFeed('You do not have enough Life Points to pay the ' + lpCost + ' LP cost for <em>Mausoleum of Offerings</em>.\n');
        return;
    }

    clearTributeSelectionMode();

    // Deduct LP cost
    GameState.player.lp -= lpCost;
    updateResourceCounters();
    if (typeof showFloatingDamage === 'function') {
        showFloatingDamage('player', lpCost);
    }

    var zoneNum = parseInt(targetSq.attr('data-zone'));
    var actionType = (position === 'defense-down') ? 'Tribute Set' : 'Tribute Summon';
    var stanceLabel = (position === 'defense-down') ? 'Defense Position' : 'Attack Position';

    addToFeed('Player pays <strong>' + lpCost + ' LP</strong> via <em>Mausoleum of Offerings</em> to ' + actionType + ' <em>' + cardDef.name + '</em> in ' + stanceLabel + ' in zone #' + zoneNum + ' without Tributing.\n\n');

    resetActiveCardClass();
    clearAvailableZones();

    activeCard = null;
    selectedSquare = null;

    await moveCard('player', sourceCard, targetSq, position, true);

    // Trigger Tribute Summon monster abilities (e.g. Titan, Leviathan)
    if (typeof checkTributeSummonTriggers === 'function') {
        await checkTributeSummonTriggers('player', cardDef, zoneNum);
    }

    // Consume Normal Summon for turn
    if (GameState.turn.normalSummonUsed && GameState.turn.extraNormalSummons > 0) {
        GameState.turn.extraNormalSummons--;
    } else {
        GameState.turn.normalSummonUsed = true;
    }
    updateActionableCards();
    updateResourceCounters();
}

// Remove a CardInstance from who's GameState.hand by uid
function removeCardInstanceFromHand(who, uid) {
    var hand = GameState[who].hand;
    for (var i = 0; i < hand.length; i++) {
        if (hand[i].uid === uid) {
            hand.splice(i, 1);
            return true;
        }
    }
    return false;
}

// Route a spell/trap/field card from the hand to a player field square
async function playNonMonsterCard(who, source, targetSquare, cardDef, zoneKind) {
    var uid = source.attr('data-uid');
    var handIdx = GameState[who].hand.findIndex(function(c) { return c.uid === uid; });
    if (handIdx < 0) return;

    var instance = GameState[who].hand[handIdx];

    var isValidTarget = false;
    if (zoneKind === 'field') {
        isValidTarget = (cardDef.type === 'spells' && cardDef.subType === 'field');
    } else {
        isValidTarget = (cardDef.type !== 'monsters' && cardDef.subType !== 'field');
    }

    if (!isValidTarget) {
        if (cardDef.subType === 'field') {
            addToFeed('(Action) Field Spell <em>' + cardDef.name + '</em> can only be played in the dedicated Field Spell Zone.\n\n');
        } else if (zoneKind === 'field') {
            addToFeed('(Action) Only Field Spell cards can be played in the Field Spell Zone.\n\n');
        } else {
            addToFeed('(Action) <em>' + cardDef.name + '</em> cannot be placed there.\n\n');
        }
        return;
    }

    if (cardDef.id === 'change-of-heart') {
        var opp = GameState.getOpponent(who);
        var oppMonsters = GameState.getMonstersOnField(opp);
        var freeZones = getAvailableSquaresElms(who).length;
        if (oppMonsters.length === 0 || freeZones < 2) {
            var reason = (oppMonsters.length === 0) ? 'Opponent controls no monsters.' : 'No space on your field to hold the opponent monster.';
            addToFeed('(Action) Cannot play <em>' + cardDef.name + '</em>. ' + reason + '\n\n');
            return;
        }
    }

    resetActiveCardClass();
    clearAvailableZones();
    hideSummonOptionsIfVisible();
    hidePositionChangeOptionsIfVisible();
    hideAtkMenuIfVisible();
    activeCard = null;
    selectedSquare = null;

    var isTrap = (cardDef.type === 'traps');
    var zoneNum = (zoneKind === 'field') ? null : parseInt(targetSquare.attr('data-zone'));

    if (zoneKind === 'field') {
        GameState[who].field.fieldZone = instance;
    } else {
        GameState[who].field.spells[zoneNum] = instance;
    }

    // Set placement attributes
    if (isTrap) {
        instance.position = 'set';
        instance.faceDown = true;
    } else {
        instance.position = 'active';
    }
    instance.turnSummoned = turnCount;

    // Sync DOM data attributes immediately to reserve slot
    targetSquare.attr('data-card-name', cardDef.id);
    targetSquare.attr('data-card-type', cardDef.type);
    targetSquare.attr('data-card-position', instance.position);

    // Remove instance from GameState hand
    removeCardInstanceFromHand(who, instance.uid);

    // Animate the card flying from hand to the square and place on arrival
    await animateCardPlacement(who, source, targetSquare, isTrap, false, cardDef.id, cardDef.type, instance.position);

    // Flip set trap face-down visually
    if (isTrap) {
        var zoneElm = targetSquare.find('div.card-zone');
        if (typeof zoneElm.flip === 'function') {
            zoneElm.flip(true);
        }
        targetSquare.attr('data-card-position', 'set');
    }

    var zoneDesc = (zoneKind === 'field') ? 'in the Field Zone' : ('in zone #' + zoneNum);
    if (isTrap) {
        if (who === 'player') {
            addToFeed('Player sets <em>' + cardDef.name + '</em> ' + zoneDesc + '.\n\n');
        } else {
            addToFeed('Computer sets a Trap ' + zoneDesc + '.\n\n');
        }
    } else {
        addToFeed(formatWho(who) + ' activates <em>' + cardDef.name + '</em> ' + zoneDesc + '.\n\n');
    }

    // Immediate resolution for one-shot spells; traps wait for their trigger
    if (cardDef.type === 'spells') {
        await activateCard(who, instance, zoneNum);
    }
}

function changePositionSelected(position) {

    resetActiveCardClass();
    $('#change-position-options').hide();
    hideAtkMenuIfVisible();

    var parentSquare = activeCard.closest('.card-zone-square');
    var zoneNum = parseInt(parentSquare.attr('data-zone'));

    // Dragon Capture Jar: Dragons cannot switch to Attack Position
    if (position === 'attack') {
        var zoneInstance = GameState.player.field.monsters[zoneNum];
        var zoneDef = zoneInstance ? cards[zoneInstance.cardId] : null;
        if (zoneDef && zoneDef.monsterType === 'Dragon' && isDragonLocked()) {
            addToFeed('(Locked) Dragon Capture Jar prevents <em>' + zoneDef.name + '</em> from switching to Attack Position.\n\n');
            return;
        }
    }

    var prevPosition = parentSquare.attr('data-card-position');
    parentSquare.attr('data-card-position', position);
    parentSquare.attr('data-turn-posChanged', turnCount);

    // Sync GameState
    if (GameState.player.field.monsters[zoneNum]) {
        GameState.player.field.monsters[zoneNum].position = position;
        GameState.player.field.monsters[zoneNum].turnPosChanged = turnCount;
    }

    var turnDuration = getAnimDuration(380);
    var animEasing = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

    if (position === 'attack') {
        activeCard.flip(false);
        activeCard.transition({ rotate: '0' }, turnDuration, animEasing, function() {
            updateActionableCards();
            updateStatModBadges();
            if (prevPosition === 'defense-down' && typeof triggerFlipEffect === 'function') {
                var mInst = GameState.player.field.monsters[zoneNum];
                triggerFlipEffect(mInst, 'player', zoneNum);
            }
        });
    } else if (position === 'defense-up') {
        activeCard.flip(false);
        activeCard.transition({ rotate: '90deg' }, turnDuration, animEasing, function() {
            updateActionableCards();
            updateStatModBadges();
            if (prevPosition === 'defense-down' && typeof triggerFlipEffect === 'function') {
                var mInst = GameState.player.field.monsters[zoneNum];
                triggerFlipEffect(mInst, 'player', zoneNum);
            }
        });
    } else if (position === 'defense-down') {
        activeCard.flip(true);
        activeCard.transition({ rotate: '90deg' }, turnDuration, animEasing, function() {
            updateActionableCards();
            updateStatModBadges();
        });
    }
}

// Activate monster ignition effect or set spell/trap card
function activateSelectedMonsterEffect() {
    hideAtkMenuIfVisible();
    if (!selectedSquare || !selectedSquare.length) return;

    var zoneNum = parseInt(selectedSquare.attr('data-zone'));

    // Check if selected square is a set Spell/Trap
    var spellInst = (GameState && GameState.player && GameState.player.field && GameState.player.field.spells) ? GameState.player.field.spells[zoneNum] : null;
    if (spellInst) {
        var sDef = cards[spellInst.cardId];
        if (sDef) {
            activateCard('player', spellInst, zoneNum);
            return;
        }
    }

    var monsterInst = (GameState && GameState.player && GameState.player.field && GameState.player.field.monsters) ? GameState.player.field.monsters[zoneNum] : null;
    if (!monsterInst) return;

    var def = cards[monsterInst.cardId];
    if (def && typeof def.onIgnitionEffect === 'function') {
        def.onIgnitionEffect('player', zoneNum);
        return;
    }

    if (monsterInst.cardId === 'time-wizard') {
        openTimeWizardModal(zoneNum);
    } else if (monsterInst.cardId === 'harpie-lady') {
        openHarpieLadyDiscardModal(zoneNum);
    } else if (monsterInst.cardId === 'exiled-force') {
        openExiledForceTargetModal(zoneNum);
    } else if (monsterInst.cardId === 'gryphon-stormlord') {
        openGryphonStormlordModal(zoneNum);
    }
}

// Request Attack from Player UI
function requestAttack() {
    hideAtkMenuIfVisible();
    if (!selectedSquare) return;

    if (GameState.turn && GameState.turn.battlePhaseLocked) {
        addToFeed('(Rule) You cannot conduct your Battle Phase the turn you activate Tribute of the Ages.\n\n');
        return;
    }

    var attackerZone = parseInt(selectedSquare.attr('data-zone'));
    var attackerCard = GameState.player.field.monsters[attackerZone];

    if (!attackerCard || attackerCard.hasAttacked) {
        return;
    }

    if (typeof BattleFX !== 'undefined') {
        BattleFX.startPlayerTargetSelection(attackerZone);
    } else {
        var computerMonsters = GameState.getMonstersOnField('computer');
        if (computerMonsters.length === 0) {
            executeBattle('player', attackerZone, null);
        } else {
            executeBattle('player', attackerZone, computerMonsters[0].zone);
        }
    }
}

// Titan of the Obsidian Peak: Gain LP equal to the destroyed monster's original ATK
async function triggerTitanLpGain(titanWho, destroyedDef, gainSquare) {
    if (!destroyedDef || (destroyedDef.atk || 0) <= 0) return;
    var absorbedAtk = destroyedDef.atk || 0;
    GameState[titanWho].lp += absorbedAtk;
    updateResourceCounters();
    if (typeof BattleFX !== 'undefined') {
        BattleFX.spawnFloatingDamage(gainSquare, absorbedAtk, 'heal');
        BattleFX.animateLPCount(titanWho, GameState[titanWho].lp);
    }
    addToFeed('<em>Titan of the Obsidian Peak</em> absorbs energy: ' + formatWho(titanWho) + ' gains <strong>' + absorbedAtk + ' LP</strong>!\n\n');
}

// Aegis Seraph: Draw 1 card when inflicting battle damage to the opponent
async function triggerAegisSeraphDraw(who, instance, square) {
    if (!instance || instance.cardId !== 'aegis-seraph') return;
    addToFeed('<em>Aegis Seraph</em> draws power from combat: ' + formatWho(who) + ' draws 1 card!\n\n');
    await getCards(who, 1);
    updateResourceCounters();
}

// Unified Battle Resolution Engine
async function executeBattle(attackerWho, attackerZone, defenderZone) {

    resetActiveCardClass();
    hideAtkMenuIfVisible();
    activeCard = null;
    selectedSquare = null;

    var defenderWho = (attackerWho === 'player') ? 'computer' : 'player';
    var attackerInst = GameState[attackerWho].field.monsters[attackerZone];
    if (!attackerInst) return;

    var attackerDef = cards[attackerInst.cardId];

    // Swords of Revealing Light: opponent's monsters cannot declare an attack
    if (isAttackBlocked(attackerWho)) {
        addToFeed('(Locked) Swords of Revealing Light prevents <em>' + (attackerDef ? attackerDef.name : 'monster') + '</em> from attacking.\n\n');
        return;
    }

    // Modified stats from field spells and card effects
    var attackerAtk = getMonsterAtk(attackerInst);
    if (attackerInst.cardId === 'lionhearted-locomotive') {
        var baseAtk = attackerDef.atk || 0;
        var halvedBase = Math.floor(baseAtk / 2);
        var fieldMods = getFieldMods(attackerDef);
        var equipMods = getEquipMods(attackerInst);
        attackerAtk = Math.max(0, halvedBase + fieldMods.atk + equipMods.atk);
        addToFeed('<em>Lionhearted Locomotive</em>\'s ATK is halved to ' + attackerAtk + ' until the end of the Damage Step!\n');
    }

    // Radiant Backlash response on attack declaration
    if (typeof checkRadiantBacklashResponse === 'function') {
        var rbTriggered = await checkRadiantBacklashResponse(attackerWho, attackerZone, defenderWho);
        if (rbTriggered) {
            return;
        }
    }

    // Prism of Retribution response on attack declaration
    if (typeof checkPrismOfRetributionResponse === 'function') {
        var porTriggered = await checkPrismOfRetributionResponse(attackerWho, attackerZone, defenderWho, attackerAtk, attackerDef);
        if (porTriggered) {
            return;
        }
    }

    // Vortex Recall response on attack declaration
    if (typeof checkVortexRecallAttackResponse === 'function') {
        var vrTriggered = await checkVortexRecallAttackResponse(attackerWho, attackerZone, defenderWho);
        if (vrTriggered) {
            return;
        }
    }

    var attackerSquare = getSquareElm(attackerWho, attackerZone);
    attackerInst.hasAttacked = true;

    // Set Battle Phase on HUD Tracker
    setPhase(3); // BP - Battle Phase

    if (defenderZone === 'direct' || defenderZone === null || defenderZone === undefined) {
        // DIRECT ATTACK
        var damage = attackerAtk;
        GameState[defenderWho].lp = Math.max(0, GameState[defenderWho].lp - damage);

        // Play Direct Attack Strike Animation
        if (typeof BattleFX !== 'undefined') {
            await BattleFX.animateAttack(attackerSquare, null, true);
        }

        addToFeed(formatWho(attackerWho) + '\'s ' + attackerDef.name + ' direct attacks for ' + damage + ' damage!\n\n');
        
        if (typeof BattleFX !== 'undefined') {
            BattleFX.spawnFloatingDamage(defenderWho === 'computer' ? $('#opponent-lp') : $('#player-lp'), damage, 'direct');
            BattleFX.animateLPCount(defenderWho, GameState[defenderWho].lp);
        }
        EventBus.emit('LP_CHANGED', { who: defenderWho, lp: GameState[defenderWho].lp, damage: damage });

        // Aegis Seraph: Draw 1 card on direct battle damage
        if (attackerInst.cardId === 'aegis-seraph' && damage > 0) {
            await triggerAegisSeraphDraw(attackerWho, attackerInst, attackerSquare);
        }

        // Shadow Infiltrator: Discard 1 random card on battle damage
        if (attackerInst.cardId === 'shadow-infiltrator' && damage > 0) {
            await triggerShadowInfiltratorDiscard(attackerInst, attackerWho, defenderWho, damage);
        }

        // Damage Step End event (Chainsaw Insect via onDamageStepEnd)
        EventBus.emit('DAMAGE_STEP_END', {
            attackerInst: attackerInst,
            attackerWho: attackerWho,
            defenderInst: null,
            defenderWho: defenderWho,
            directAttack: true
        });

        if (attackerWho === 'player' && GameState.player.lp > 0 && GameState.computer.lp > 0) {
            setPhase(4); // M2 - Main Phase 2
        }
        updateResourceCounters();
        return;
    }

    // MONSTER VS MONSTER
    var defenderInst = GameState[defenderWho].field.monsters[defenderZone];
    if (!defenderInst) return;

    var defenderDef = cards[defenderInst.cardId];
    var defenderSquare = getSquareElm(defenderWho, defenderZone);

    // Abyssal Leviathan: Force defender into face-up Attack Position (Flip effects suppressed)
    if (attackerInst.cardId === 'abyssal-leviathan' && (defenderInst.position === 'defense-up' || defenderInst.position === 'defense-down')) {
        var wasFaceDown = (defenderInst.position === 'defense-down');
        defenderInst.position = 'attack';
        defenderInst.faceDown = false;
        defenderSquare.attr('data-card-position', 'attack');
        defenderSquare.find('div.card-zone').flip(false).css({ 'transform': 'rotate(0deg)' });
        updateCardImage(defenderSquare);
        addToFeed('<em>Abyssal Leviathan</em> forces <strong>' + defenderDef.name + '</strong> into face-up Attack Position before battle!' + (wasFaceDown ? ' (Flip effects suppressed)\n' : '\n'));
        await sleep(getAnimDuration(300));
    }

    // Flip face-up if attacked while face-down (Damage Step Reveal)
    if (defenderInst.position === 'defense-down') {
        defenderInst.position = 'defense-up';
        defenderSquare.attr('data-card-position', 'defense-up');
        addToFeed(defenderDef.name + ' was flipped face-up!\n');
        if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateFlipReveal === 'function') {
            await BattleFX.animateFlipReveal(defenderSquare);
        } else {
            defenderSquare.find('div.card-zone').flip(false);
            await sleep(250);
        }
        if (typeof triggerFlipEffect === 'function') {
            await triggerFlipEffect(defenderInst, defenderWho, defenderZone);
        }
    }

    // Play 3D Combat Lunge & Impact Animation
    if (typeof BattleFX !== 'undefined') {
        await BattleFX.animateAttack(attackerSquare, defenderSquare, false);
    }

    var defenderAtk = getMonsterAtk(defenderInst);
    var defenderDefVal = getMonsterDef(defenderInst);

    addToFeed(formatWho(attackerWho) + '\'s ' + attackerDef.name + ' (ATK ' + attackerAtk + ') attacks ' + defenderDef.name + '!\n');

    if (defenderInst.position === 'attack') {
        // ATK vs ATK
        if (attackerAtk > defenderAtk) {
            var diff = attackerAtk - defenderAtk;
            GameState[defenderWho].lp = Math.max(0, GameState[defenderWho].lp - diff);
            
            if (typeof BattleFX !== 'undefined') {
                BattleFX.spawnFloatingDamage(defenderSquare, diff, 'standard');
                BattleFX.animateLPCount(defenderWho, GameState[defenderWho].lp);
            }
            EventBus.emit('LP_CHANGED', { who: defenderWho, lp: GameState[defenderWho].lp, damage: diff });

            if (defenderInst.cardId === 'nether-wraith') {
                addToFeed('<em>Nether Wraith</em> cannot be destroyed by battle! ' + formatWho(defenderWho) + ' takes ' + diff + ' damage.\n\n');
            } else {
                await destroyMonster(defenderWho, defenderZone);
                addToFeed(defenderDef.name + ' is destroyed! ' + formatWho(defenderWho) + ' takes ' + diff + ' damage.\n\n');

                // Titan of the Obsidian Peak: Gain LP equal to destroyed monster's original ATK
                if (attackerInst.cardId === 'titan-of-the-obsidian-peak') {
                    await triggerTitanLpGain(attackerWho, defenderDef, attackerSquare);
                }

                if (typeof triggerBattleDestructionGraveyardEffect === 'function') {
                    await triggerBattleDestructionGraveyardEffect(defenderInst, defenderWho, defenderZone, attackerInst, attackerWho, attackerZone);
                }
            }

            // Aegis Seraph: Draw 1 card on battle damage
            if (attackerInst.cardId === 'aegis-seraph' && diff > 0) {
                await triggerAegisSeraphDraw(attackerWho, attackerInst, attackerSquare);
            }

            // Shadow Infiltrator: Discard 1 random card on battle damage
            if (attackerInst.cardId === 'shadow-infiltrator' && diff > 0) {
                await triggerShadowInfiltratorDiscard(attackerInst, attackerWho, defenderWho, diff);
            }
        } else if (attackerAtk === defenderAtk) {
            var destPromises = [];
            if (attackerInst.cardId !== 'nether-wraith') destPromises.push(destroyMonster(attackerWho, attackerZone));
            if (defenderInst.cardId !== 'nether-wraith') destPromises.push(destroyMonster(defenderWho, defenderZone));
            await Promise.all(destPromises);
            addToFeed('Both monsters had equal ATK!\n\n');

            // Titan of the Obsidian Peak: Gains LP if it destroyed an opponent's monster in the double KO
            if (attackerInst.cardId === 'titan-of-the-obsidian-peak') {
                await triggerTitanLpGain(attackerWho, defenderDef, attackerSquare);
            } else if (defenderInst.cardId === 'titan-of-the-obsidian-peak') {
                await triggerTitanLpGain(defenderWho, attackerDef, defenderSquare);
            }
        } else {
            var diff = defenderAtk - attackerAtk;
            GameState[attackerWho].lp = Math.max(0, GameState[attackerWho].lp - diff);

            if (typeof BattleFX !== 'undefined') {
                BattleFX.spawnFloatingDamage(attackerSquare, diff, 'standard');
                BattleFX.animateLPCount(attackerWho, GameState[attackerWho].lp);
            }
            EventBus.emit('LP_CHANGED', { who: attackerWho, lp: GameState[attackerWho].lp, damage: diff });

            if (attackerInst.cardId === 'nether-wraith') {
                addToFeed('<em>Nether Wraith</em> cannot be destroyed by battle! ' + formatWho(attackerWho) + ' takes ' + diff + ' damage.\n\n');
            } else {
                await destroyMonster(attackerWho, attackerZone);
                addToFeed(attackerDef.name + ' is destroyed! ' + formatWho(attackerWho) + ' takes ' + diff + ' damage.\n\n');

                // Titan of the Obsidian Peak: Gain LP when attacked and the attacker is destroyed
                if (defenderInst.cardId === 'titan-of-the-obsidian-peak') {
                    await triggerTitanLpGain(defenderWho, attackerDef, defenderSquare);
                }

                if (typeof triggerBattleDestructionGraveyardEffect === 'function') {
                    await triggerBattleDestructionGraveyardEffect(attackerInst, attackerWho, attackerZone, defenderInst, defenderWho, defenderZone);
                }
            }

            // Shadow Infiltrator: Counter-attack battle damage discard
            if (defenderInst.cardId === 'shadow-infiltrator' && diff > 0) {
                await triggerShadowInfiltratorDiscard(defenderInst, defenderWho, attackerWho, diff);
            }
        }
    } else {
        // ATK vs DEF
        if (attackerAtk > defenderDefVal) {
            var isPiercing = (attackerInst.cardId === 'aegis-seraph' || (attackerDef && attackerDef.piercing === true));
            var pierceDamage = isPiercing ? (attackerAtk - defenderDefVal) : 0;

            if (isPiercing && pierceDamage > 0) {
                GameState[defenderWho].lp = Math.max(0, GameState[defenderWho].lp - pierceDamage);
                if (typeof BattleFX !== 'undefined') {
                    BattleFX.spawnFloatingDamage(defenderSquare, pierceDamage, 'piercing');
                    BattleFX.animateLPCount(defenderWho, GameState[defenderWho].lp);
                }
                EventBus.emit('LP_CHANGED', { who: defenderWho, lp: GameState[defenderWho].lp, damage: pierceDamage });
            }

            if (defenderInst.cardId === 'nether-wraith') {
                addToFeed('<em>Nether Wraith</em> cannot be destroyed by battle!' + (pierceDamage > 0 ? ' ' + formatWho(defenderWho) + ' takes <strong>' + pierceDamage + '</strong> piercing damage.\n\n' : '\n\n'));
            } else {
                await destroyMonster(defenderWho, defenderZone);
                var pierceNotice = (pierceDamage > 0) ? ' ' + formatWho(defenderWho) + ' takes <strong>' + pierceDamage + '</strong> piercing damage.\n\n' : ' No LP damage.\n\n';
                addToFeed(defenderDef.name + ' in DEF mode is destroyed!' + pierceNotice);

                // Titan of the Obsidian Peak: Gain LP equal to destroyed monster's original ATK
                if (attackerInst.cardId === 'titan-of-the-obsidian-peak') {
                    await triggerTitanLpGain(attackerWho, defenderDef, attackerSquare);
                }

                if (typeof triggerBattleDestructionGraveyardEffect === 'function') {
                    await triggerBattleDestructionGraveyardEffect(defenderInst, defenderWho, defenderZone, attackerInst, attackerWho, attackerZone);
                }
            }

            // Aegis Seraph: Draw 1 card on piercing battle damage
            if (attackerInst.cardId === 'aegis-seraph' && pierceDamage > 0) {
                await triggerAegisSeraphDraw(attackerWho, attackerInst, attackerSquare);
            }
        } else if (attackerAtk < defenderDefVal) {
            var diff = defenderDefVal - attackerAtk;
            GameState[attackerWho].lp = Math.max(0, GameState[attackerWho].lp - diff);

            if (typeof BattleFX !== 'undefined') {
                BattleFX.spawnFloatingDamage(attackerSquare, diff, 'def-blocked');
                BattleFX.animateLPCount(attackerWho, GameState[attackerWho].lp);
            }
            EventBus.emit('LP_CHANGED', { who: attackerWho, lp: GameState[attackerWho].lp, damage: diff });

            addToFeed(attackerDef.name + ' could not pierce DEF! ' + formatWho(attackerWho) + ' takes ' + diff + ' damage.\n\n');

            // Shadow Infiltrator: Wall defense battle damage discard
            if (defenderInst.cardId === 'shadow-infiltrator' && diff > 0) {
                await triggerShadowInfiltratorDiscard(defenderInst, defenderWho, attackerWho, diff);
            }
        } else {
            addToFeed('ATK matched DEF. No monsters destroyed and no damage taken.\n\n');
        }
    }

    // Damage Step End event (Chainsaw Insect via onDamageStepEnd)
    EventBus.emit('DAMAGE_STEP_END', {
        attackerInst: attackerInst,
        attackerWho: attackerWho,
        defenderInst: defenderInst,
        defenderWho: defenderWho,
        directAttack: false
    });

    // Monolith of Echoes: Return attacking monster to owner's hand
    if (defenderInst.cardId === 'monolith-of-echoes' && GameState[attackerWho].field.monsters[attackerZone]) {
        addToFeed('<em>Monolith of Echoes</em> activated: ' + formatWho(attackerWho) + '\'s <strong>' + attackerDef.name + '</strong> is returned to the hand!\n\n');
        await returnMonsterToHand(attackerWho, attackerZone);
    }

    if (attackerWho === 'player' && GameState.player.lp > 0 && GameState.computer.lp > 0) {
        setPhase(4); // M2 - Main Phase 2
    }
    updateResourceCounters();
}

// ---------------------------------------------------------------------------
// Centralized Zone Mutation & Lifecycle Actions
// ---------------------------------------------------------------------------
var Actions = {
    // Purges all dynamic badges, dataset attributes, classes, and flip transforms on a board square
    resetSquareDOM: function(who, zoneNum) {
        var square = getSquareElm(who, zoneNum);
        if (!square || !square.length) return;

        square.find('.borrowed-monster-badge, .def-locked-badge, .flip-effect-badge, .stat-mod-badge, .equip-tag-badge, .immune-badge, .no-tribute-badge, .attack-locked-badge, .effect-ready-badge, .action-badge').remove();
        square.removeClass('available-zone spell-available-zone field-available-zone active-attacker-zone');

        square.attr('data-card-type', '');
        square.attr('data-card-name', '');
        square.attr('data-card-position', '');
        square.attr('data-turn-moved', '');
        square.attr('data-turn-posChanged', '');

        var zone = square.find('div.card-zone');
        zone.removeClass('available-zone spell-available-zone field-available-zone active-card card-actionable active-attacker-zone');
        zone.off('.flip');
        zone.removeData('flip-model');
        zone.removeAttr('style');
        zone.removeData('transform');
        zone.find('img').removeAttr('src');
        zone.find('.front, .back').removeAttr('style').removeData('transform');
        zone.css('opacity', 0).show().fadeTo(200, 1);
    },

    // Purges the field spell zone square
    resetFieldZoneDOM: function(who) {
        var square = getFieldZoneElm(who);
        if (!square || !square.length) return;

        square.removeClass('available-zone spell-available-zone field-available-zone active-card card-actionable');
        square.attr('data-card-type', '');
        square.attr('data-card-name', '');
        square.attr('data-card-position', '');

        var zone = square.find('div.card-zone');
        zone.off('.flip');
        zone.removeData('flip-model');
        zone.removeAttr('style');
        zone.removeData('transform');
        zone.find('img').removeAttr('src').hide();
        zone.find('.front, .back').removeAttr('style').removeData('transform');
        zone.css('opacity', 0).show().fadeTo(200, 1);
    }
};

async function destroyMonster(who, zoneNum) {
    var cardInst = GameState[who].field.monsters[zoneNum];
    if (!cardInst) return;

    cardInst.hasAttacked = false;
    cardInst.faceDown = false;
    cardInst.isBorrowed = false;
    var ownerWho = cardInst.originalOwner || who;

    var mDef = cards[cardInst.cardId];
    var isToken = cardInst.isToken || (mDef && (mDef.isToken || mDef.subType === 'token'));
    if (!isToken) {
        GameState[ownerWho].graveyard.push(cardInst);
    }
    delete GameState[who].field.monsters[zoneNum];

    // Spear Cretin: After being flipped, when sent to GY, triggers revival for both players
    if (cardInst.cardId === 'spear-cretin' && cardInst.spearCretinPrimed) {
        cardInst.spearCretinPrimed = false;
        if (typeof triggerSpearCretinGraveyardEffect === 'function') {
            setTimeout(function() {
                triggerSpearCretinGraveyardEffect();
            }, 500);
        }
    }

    // Continuous Trap binding (Crypt Awakening): If monster is destroyed, destroy bound trap
    if (cardInst.boundTrapUid) {
        var bTrapUid = cardInst.boundTrapUid;
        cardInst.boundTrapUid = null;
        var bTrapZone = null;
        for (var sz = 1; sz <= 6; sz++) {
            if (GameState[who].field.spells[sz] && GameState[who].field.spells[sz].uid === bTrapUid) {
                bTrapZone = sz;
                break;
            }
        }
        if (bTrapZone !== null) {
            await destroySpellTrap(who, bTrapZone, false);
        }
    }

    // Equip cards attached to the destroyed monster are destroyed with it
    var equipZones = [];
    for (var z = 1; z <= 6; z++) {
        var sp = GameState[who].field.spells[z];
        if (sp && sp.equippedToUid === cardInst.uid) equipZones.push(z);
    }
    for (var e = 0; e < equipZones.length; e++) {
        await destroySpellTrap(who, equipZones[e], false);
    }

    var square = getSquareElm(who, zoneNum);
    if (typeof BattleFX !== 'undefined') {
        await BattleFX.animateMonsterDestruction(square);
    }
    Actions.resetSquareDOM(who, zoneNum);

    clearAvailableZones();
    updateStatModBadges();
    updateActionableCards();
    updateGraveyardZones();
    updateResourceCounters();

    await EventBus.emitAsync('MONSTER_DESTROYED', { cardInst: cardInst, who: who, zone: zoneNum });
    await EventBus.emitAsync('CARD_SENT_TO_GRAVE', { cardInst: cardInst, who: who, zone: zoneNum, fromField: true });
}

// Return a monster from field to owner's hand (e.g. Hane-Hane)
async function returnMonsterToHand(who, zoneNum) {
    var cardInst = GameState[who].field.monsters[zoneNum];
    if (!cardInst) return;

    // Equip cards attached to the returned monster are destroyed
    var equipZones = [];
    for (var z = 1; z <= 6; z++) {
        var sp = GameState[who].field.spells[z];
        if (sp && sp.equippedToUid === cardInst.uid) equipZones.push(z);
    }
    for (var e = 0; e < equipZones.length; e++) {
        await destroySpellTrap(who, equipZones[e], false);
    }

    var ownerWho = cardInst.originalOwner || who;
    cardInst.hasAttacked = false;
    cardInst.faceDown = false;
    cardInst.position = 'attack';
    cardInst.isBorrowed = false;
    cardInst.equippedToUid = null;

    delete GameState[who].field.monsters[zoneNum];

    // Add back to owner's hand
    GameState[ownerWho].hand.push(cardInst);
    var cardElm = addCardToHand(ownerWho, cardInst.cardId, cardInst.uid, true);
    var cardDef = cards[cardInst.cardId];
    var cardType = cardDef ? cardDef.type : 'monsters';
    if (window[ownerWho] && window[ownerWho]['hand'] && window[ownerWho]['hand'][cardType]) {
        window[ownerWho]['hand'][cardType].push(cardInst.cardId);
    }
    if (cardElm) {
        cardElm.css({ opacity: 0, visibility: 'hidden' });
    }

    if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateCardBounceToHand === 'function') {
        await BattleFX.animateCardBounceToHand(who, zoneNum, ownerWho, cardInst.cardId, cardElm);
    } else if (cardElm) {
        cardElm.css({ opacity: 1, visibility: 'visible' });
    }

    Actions.resetSquareDOM(who, zoneNum);
    updateResourceCounters();
}

// Destroy a spell/trap/field card: move to graveyard, clear state + DOM
async function destroySpellTrap(who, zoneNum, isFieldZone, suppressGraveEffect) {
    var graveInst;

    if (isFieldZone) {
        var fieldInst = GameState[who].field.fieldZone;
        if (!fieldInst) return;
        graveInst = fieldInst;
        GameState[who].graveyard.push(fieldInst);
        GameState[who].field.fieldZone = null;

        var square = getFieldZoneElm(who);
        if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateSpellToGraveyard === 'function') {
            await BattleFX.animateSpellToGraveyard(square);
        }
        Actions.resetFieldZoneDOM(who);
    } else {
        var spellInst = GameState[who].field.spells[zoneNum];
        if (!spellInst) return;
        graveInst = spellInst;

        if (spellInst.equippedToUid) {
            removeEquipTag(who, spellInst.equippedToUid);
            spellInst.equippedToUid = null;
            updateStatModBadges();
        }

        // Continuous Trap binding (Crypt Awakening): If trap leaves field, destroy bound monster
        if (spellInst.boundMonsterUid) {
            var bMonUid = spellInst.boundMonsterUid;
            spellInst.boundMonsterUid = null;
            var bMonZone = null;
            for (var mz = 1; mz <= 6; mz++) {
                if (GameState[who].field.monsters[mz] && GameState[who].field.monsters[mz].uid === bMonUid) {
                    bMonZone = mz;
                    break;
                }
            }
            if (bMonZone !== null) {
                await destroyMonster(who, bMonZone);
            }
        }

        GameState[who].graveyard.push(spellInst);
        delete GameState[who].field.spells[zoneNum];

        var square = getSpellSquareElm(who, zoneNum);
        if (typeof BattleFX !== 'undefined' && typeof BattleFX.animateSpellToGraveyard === 'function') {
            await BattleFX.animateSpellToGraveyard(square);
        }
        Actions.resetSquareDOM(who, zoneNum);
    }

    updateGraveyardZones();
    updateResourceCounters();
    updateStatModBadges();

    await EventBus.emitAsync('SPELL_TRAP_DESTROYED', { cardInst: graveInst, who: who, zone: zoneNum, isFieldZone: isFieldZone });
    await EventBus.emitAsync('CARD_SENT_TO_GRAVE', { cardInst: graveInst, who: who, zone: zoneNum, isFieldZone: isFieldZone, suppressGraveEffect: suppressGraveEffect });
}

// Special Summon a monster from a graveyard (or spawn a token) to a free monster zone.
// `sourceWho` is the side whose graveyard the monster comes from; it is summoned
// onto `targetWho`'s field. Returns the freeZone number on success, or false on failure.
async function specialSummonMonster(targetWho, cardId, sourceWho, position) {
    position = position || 'attack';
    var def = cards[cardId];
    if (!def || def.type !== 'monsters') return false;

    if (sourceWho === undefined) sourceWho = targetWho;

    var freeZone = getFirstFreeZone(targetWho);
    if (freeZone === undefined) {
        addToFeed('(Special Summon) No free monster zones for <em>' + def.name + '</em>.\n\n');
        return false;
    }

    var isToken = (def.isToken || def.subType === 'token' || cardId.indexOf('token') > -1);
    var instance;

    if (isToken) {
        // Tokens are created fresh on field, not pulled from the graveyard
        instance = {
            cardId: cardId,
            uid: 'token_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
            position: position,
            faceDown: (position === 'defense-down'),
            hasAttacked: false,
            turnSummoned: turnCount,
            turnPosChanged: turnCount,
            originalOwner: targetWho,
            isToken: true,
            cannotBeTributed: (def.cannotBeTributed === true),
            equips: []
        };
    } else {
        // Remove one matching instance from the source graveyard
        var gy = GameState[sourceWho].graveyard;
        var sourceIdx = -1;
        for (var i = 0; i < gy.length; i++) {
            if (gy[i].cardId === cardId) {
                sourceIdx = i;
                break;
            }
        }
        if (sourceIdx === -1) return false;

        instance = gy[sourceIdx];
        gy.splice(sourceIdx, 1);
        if (!instance.originalOwner) {
            instance.originalOwner = sourceWho;
        }
        instance.position = position;
        instance.faceDown = (position === 'defense-down');
        instance.hasAttacked = false; // Fresh attack state for Special Summon
        instance.turnSummoned = turnCount;
        instance.turnPosChanged = turnCount;
    }

    GameState[targetWho].field.monsters[freeZone] = instance;

    var targetSquare = getSquareElm(targetWho, freeZone);
    var zone = targetSquare.find('div.card-zone');

    // Clean any prior rotation/flip styles
    zone.removeAttr('style');
    zone.removeData('transform');
    zone.find('.front, .back').removeAttr('style');
    zone.find('.front, .back').removeData('transform');

    if (isToken) {
        // Ethereal token materialization animation directly on the target zone
        var tokenBurst = $('<div class="card" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + zone.outerWidth() + 'px; height: ' + zone.outerHeight() + 'px; top: ' + zone.offset().top + 'px; left: ' + zone.offset().left + 'px; opacity: 0; transform: scale(0.4);">' +
            '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' +
                '<div class="card-front"><img class="card-img" src="cards/' + def.file + '"></div>' +
            '</div>' +
        '</div>');
        $('body').append(tokenBurst);
        await new Promise(function(resolve) {
            tokenBurst.transition({
                opacity: 1,
                scale: 1.05
            }, getAnimDuration(260), 'cubic-bezier(0.2, 0.9, 0.3, 1)', function() {
                tokenBurst.transition({ scale: 1 }, getAnimDuration(100), function() {
                    tokenBurst.remove();
                    resolve();
                });
            });
        });
    } else {
        // Spirit-flight animation from graveyard to monster zone
        var gyZone = $('#' + sourceWho + '-graveyard-zone');
        var gyOffset = gyZone.length ? gyZone.offset() : null;
        var targetOffset = zone.offset();
        if (gyOffset && targetOffset) {
            var isHiddenFlight = (position === 'defense-down');
            var flightFace = isHiddenFlight
                ? '<div class="card-back"></div>'
                : '<div class="card-front"><img class="card-img" src="cards/' + def.file + '"></div>';
            var flightClone = $('<div class="card card-draw-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + zone.outerWidth() + 'px; height: ' + zone.outerHeight() + 'px; top: ' + gyOffset.top + 'px; left: ' + gyOffset.left + 'px;">' +
                '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' +
                    flightFace +
                '</div>' +
            '</div>');
            $('body').append(flightClone);
            await new Promise(function(resolve) {
                flightClone.transition({
                    top: targetOffset.top,
                    left: targetOffset.left,
                    scale: 1
                }, getAnimDuration(420), 'cubic-bezier(0.2, 0.9, 0.3, 1)', function() {
                    flightClone.remove();
                    resolve();
                });
            });
        }
    }

    // Build the board square markup
    targetSquare.attr('data-card-type', 'monsters');
    targetSquare.attr('data-card-name', cardId);
    targetSquare.attr('data-card-position', position);
    targetSquare.attr('data-turn-moved', turnCount);
    targetSquare.attr('data-turn-posChanged', turnCount);
    updateCardImage(targetSquare);

    if (position === 'defense-down') {
        if (typeof zone.flip === 'function') {
            try {
                zone.flip({ trigger: 'manual' });
                zone.flip(true);
            } catch (e) {}
        }
        zone.css({
            'visibility': 'visible',
            'display': 'block',
            'opacity': '1',
            'transform': 'rotate(90deg)'
        });
        zone.find('.back').css({
            'transform': 'rotateY(0deg)',
            'visibility': 'visible',
            'display': 'block',
            'opacity': '1'
        });
        zone.find('.front').css({
            'transform': 'rotateY(180deg)',
            'display': 'none'
        });
        // Face-down Defense: conceal the monster's identity from the opponent
        var specialLabel = (targetWho === 'computer')
            ? 'a monster'
            : '<em>' + def.name + '</em>';
        addToFeed(formatWho(targetWho) + ' Special Summons ' + specialLabel + ' in face-down Defense Position.\n\n');
    } else if (position === 'defense-up') {
        if (typeof zone.flip === 'function') {
            try {
                zone.flip({ trigger: 'manual' });
                zone.flip(false);
            } catch (e) {}
        }
        zone.css({
            'visibility': 'visible',
            'display': 'block',
            'opacity': '1',
            'transform': 'rotate(90deg)'
        });
        zone.find('.front').css({
            'display': 'flex',
            'visibility': 'visible',
            'opacity': '1',
            'transform': 'rotateY(0deg)'
        });
        zone.find('.back').css({
            'transform': 'rotateY(180deg)'
        });
        addToFeed(formatWho(targetWho) + ' Special Summons <em>' + def.name + '</em> in face-up Defense Position.\n\n');
    } else {
        if (typeof zone.flip === 'function') {
            try {
                zone.flip({ trigger: 'manual' });
                zone.flip(false);
            } catch (e) {}
        }
        zone.css({
            'visibility': 'visible',
            'display': 'block',
            'opacity': '1',
            'transform': 'rotate(0deg)'
        });
        zone.find('.front').css({
            'display': 'flex',
            'visibility': 'visible',
            'opacity': '1',
            'transform': 'rotateY(0deg)'
        });
        zone.find('.back').css({
            'transform': 'rotateY(180deg)'
        });
        addToFeed(formatWho(targetWho) + ' Special Summons <em>' + def.name + '</em> in Attack Position.\n\n');
    }

    if (sourceWho !== targetWho) {
        targetSquare.find('.borrowed-monster-badge').remove();
        var badgeLabel = (targetWho === 'player') ? "OPPONENT'S MONSTER" : "PLAYER'S MONSTER";
        var borrowedBadge = $('<div class="borrowed-monster-badge">' +
            '<span class="borrowed-badge-icon">⇄</span>' +
            '<span class="borrowed-badge-label">' + badgeLabel + '</span>' +
        '</div>');
        targetSquare.append(borrowedBadge);
    }

    updateGraveyardZones();
    updateResourceCounters();
    updateStatModBadges();
    updateActionableCards();

    await EventBus.emitAsync('MONSTER_SUMMONED', { who: targetWho, instance: instance, zone: freeZone, isSpecialSummon: true });
    return freeZone;
}

// Special Summon a monster directly from a player's Deck (e.g. Giant Germ, Vanguard's Accord)
async function specialSummonMonsterFromDeck(who, cardId, position) {
    position = position || 'attack';
    var isDefense = position.startsWith('defense');
    var def = cards[cardId];
    if (!def || def.type !== 'monsters') return false;

    var freeZone = getFirstFreeZone(who);
    if (freeZone === undefined) {
        addToFeed('(Special Summon) No free monster zones for <em>' + def.name + '</em>.\n\n');
        return false;
    }

    // Locate and remove 1 copy from who's deck
    var deckArr = GameState[who] && GameState[who].deck;
    if (!deckArr || !deckArr.length) return false;

    var idx = deckArr.indexOf(cardId);
    if (idx === -1) return false;

    deckArr.splice(idx, 1);
    if (who === 'player' && typeof deck !== 'undefined') {
        deck = GameState.player.deck;
    }

    var instance = new CardInstance(cardId);
    instance.originalOwner = who;
    instance.position = position;
    instance.faceDown = false;
    instance.hasAttacked = false;
    instance.turnSummoned = turnCount;
    instance.turnPosChanged = turnCount;
    GameState[who].field.monsters[freeZone] = instance;

    var targetSquare = getSquareElm(who, freeZone);
    var zone = targetSquare.find('div.card-zone');

    // Clean prior styles
    zone.removeAttr('style');
    zone.removeData('transform');
    zone.find('.front, .back').removeAttr('style');
    zone.find('.front, .back').removeData('transform');

    // Flight animation from deck zone to field zone
    var deckZoneElm = $('#' + who + '-deck-zone');
    var deckOffset = deckZoneElm.length ? deckZoneElm.offset() : null;
    var targetOffset = zone.offset();
    if (deckOffset && targetOffset) {
        var flightClone = $('<div class="card card-draw-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + zone.outerWidth() + 'px; height: ' + zone.outerHeight() + 'px; top: ' + deckOffset.top + 'px; left: ' + deckOffset.left + 'px;">' +
            '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' +
                '<div class="card-front"><img class="card-img" src="cards/' + def.file + '"></div>' +
            '</div>' +
        '</div>');
        $('body').append(flightClone);
        await new Promise(function(resolve) {
            flightClone.transition({
                top: targetOffset.top,
                left: targetOffset.left,
                rotate: isDefense ? '90deg' : '0deg',
                scale: 1
            }, getAnimDuration(420), 'cubic-bezier(0.2, 0.9, 0.3, 1)', function() {
                flightClone.remove();
                resolve();
            });
        });
    }

    targetSquare.attr('data-card-type', 'monsters');
    targetSquare.attr('data-card-name', cardId);
    targetSquare.attr('data-card-position', position);
    targetSquare.attr('data-turn-moved', turnCount);
    targetSquare.attr('data-turn-posChanged', turnCount);
    updateCardImage(targetSquare);

    if (typeof zone.flip === 'function') {
        try {
            zone.flip({ trigger: 'manual' });
            zone.flip(false);
        } catch (e) {}
    }

    zone.css({
        'visibility': 'visible',
        'display': 'block',
        'opacity': '1',
        'transform': isDefense ? 'rotate(90deg)' : 'rotate(0deg)'
    });
    zone.find('.front').css({
        'display': 'flex',
        'visibility': 'visible',
        'opacity': '1',
        'transform': 'rotateY(0deg)'
    });
    zone.find('.back').css({
        'transform': 'rotateY(180deg)'
    });

    var posLabel = isDefense ? 'Defense Position' : 'Attack Position';
    addToFeed(formatWho(who) + ' Special Summons <em>' + def.name + '</em> from the Deck in ' + posLabel + ' to Zone #' + freeZone + '.\n');

    updateResourceCounters();
    if (typeof BattleFX !== 'undefined') BattleFX.updateDeckVisuals();
    updateStatModBadges();
    updateActionableCards();

    await EventBus.emitAsync('MONSTER_SUMMONED', { who: who, instance: instance, zone: freeZone, isSpecialSummon: true });
    return true;
}

function addCardToHand(who, card, uid, isDrawing) {

    var imgSrc = cards[card]['file'];
    var type = cards[card]['type'];

    var faceOrder;
    if (who === 'player') { 
        faceOrder = '<div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div><div class="card-back"></div>';
    } else if (who === 'computer') {
        faceOrder = '<div class="card-back"></div>';
    }

    var uidAttr = uid ? ' data-uid="' + uid + '"' : '';
    var initialStyle = isDrawing ? 'opacity: 0; visibility: hidden;' : '';
    var cardElm = $('<div class="card"' + uidAttr + ' data-card-name="' + card + '" data-card-type="' + type + '" style="' + initialStyle + '"><div class="card-relative" style="position: relative;">' + faceOrder + '</div></div>');
    $('#' + who + '-hand').append(cardElm);
    return cardElm;
}

// Randomize the 3 showcase cards floating in the title screen background
function randomizeTitleScreenCards() {
    var bgCardImgs = $('.homescreen-bg-cards .homescreen-bg-card');
    if (!bgCardImgs.length || typeof cards === 'undefined') return;

    var validKeys = Object.keys(cards).filter(function(k) {
        return cards[k] && cards[k].file && cards[k].type === 'monsters';
    });

    if (validKeys.length < 3) {
        validKeys = Object.keys(cards).filter(function(k) {
            return cards[k] && cards[k].file;
        });
    }

    if (validKeys.length === 0) return;

    var shuffled = shuffleArray(validKeys);
    bgCardImgs.each(function(index) {
        if (shuffled[index]) {
            var cardDef = cards[shuffled[index]];
            $(this).attr('src', 'cards/' + cardDef.file);
            $(this).attr('alt', cardDef.name || '');
        }
    });
}

$(document).ready(function() {
    randomizeTitleScreenCards();
    updateSpeedButtonsUI();
    if (typeof preloadAllCollectibleCards === 'function') {
        preloadAllCollectibleCards();
    }
});
