function createDeckCardElement(cardId, quant, isVault) {
    var cardDef = cards[cardId];
    if (!cardDef) return null;

    var badgeText = isVault ? 'x' + quant + ' avail' : 'x' + quant;
    var $card = $('<div>', {
        id: cardId,
        class: 'deck-card-item',
        'data-card-id': cardId,
        quant: quant
    });

    var $img = $('<img>', {
        class: 'deck-card-img',
        src: 'cards/' + cardDef.file,
        alt: cardDef.name
    });

    var $badge = $('<p>', {
        class: 'deck-card-badge',
        text: badgeText
    });

    $card.append($img).append($badge);
    return $card;
}

function addToDeck(cardId) {
    var currentSize = getBuildingDeckSize();
    if (currentSize >= 60) return;

    var $playerDeckCard = $('#player-deck > div#' + cardId);
    var $vaultCard = $('#deck-selector > div#' + cardId);

    // If card is already in player deck, increment
    if ($playerDeckCard.length) {
        var currentQuant = parseInt($playerDeckCard.attr('quant')) || 1;
        var newQuant = currentQuant + 1;
        $playerDeckCard.attr('quant', newQuant);
        $playerDeckCard.find('.deck-card-badge').text('x' + newQuant);
    } else {
        var $newCard = createDeckCardElement(cardId, 1, false);
        $('#player-deck').append($newCard);
    }

    // Decrement available count in vault
    if ($vaultCard.length) {
        var availQuant = parseInt($vaultCard.attr('quant')) || 1;
        var newAvail = availQuant - 1;
        if (newAvail <= 0) {
            $vaultCard.remove();
        } else {
            $vaultCard.attr('quant', newAvail);
            $vaultCard.find('.deck-card-badge').text('x' + newAvail + ' avail');
        }
    }

    setBuildingDeckSize(currentSize + 1);
}

function removeFromDeck(cardId) {
    var $playerDeckCard = $('#player-deck > div#' + cardId);
    if (!$playerDeckCard.length) return;

    var currentQuant = parseInt($playerDeckCard.attr('quant')) || 1;
    var currentSize = getBuildingDeckSize();

    if (currentQuant <= 1) {
        $playerDeckCard.remove();
    } else {
        var newQuant = currentQuant - 1;
        $playerDeckCard.attr('quant', newQuant);
        $playerDeckCard.find('.deck-card-badge').text('x' + newQuant);
    }

    // Return to vault
    var $vaultCard = $('#deck-selector > div#' + cardId);
    if ($vaultCard.length) {
        var availQuant = parseInt($vaultCard.attr('quant')) || 0;
        var newAvail = availQuant + 1;
        $vaultCard.attr('quant', newAvail);
        $vaultCard.find('.deck-card-badge').text('x' + newAvail + ' avail');
    } else {
        var $newVaultCard = createDeckCardElement(cardId, 1, true);
        $('#deck-selector').append($newVaultCard);
    }

    setBuildingDeckSize(Math.max(0, currentSize - 1));
}

function buildDecks() {

    $('#homescreen').hide(); 
    $('#deck-builder').show();

    $('#player-deck').empty();
    $('#deck-selector').empty();

    var totalCount = 0;
    var cardList = JSON.parse(localStorage.getItem('deck')) || {};

    // Populate active deck list (left side)
    for (const cardInDeck in cardList) {
        if (!cards[cardInDeck]) continue;
        var quant = parseInt(cardList[cardInDeck]) || 1;
        totalCount += quant;

        var $card = createDeckCardElement(cardInDeck, quant, false);
        $('#player-deck').append($card);
    }

    // Populate available cards (right side vault)
    for (const card in cards) {
        var quantAvailable = 3;

        if (cardList && card in cardList) {
            var numOfCardInDeck = parseInt(cardList[card]) || 0;
            quantAvailable -= numOfCardInDeck;
            if (quantAvailable <= 0) continue;
        }

        var $vaultCard = createDeckCardElement(card, quantAvailable, true);
        $('#deck-selector').append($vaultCard);
    }

    setBuildingDeckSize(totalCount);
}

function clearDeck() {
    localStorage.removeItem('deck');
    $('#player-deck').empty();
    $('#deck-selector').empty();
    buildDecks();
}

function doneSelecting() {
    if (typeof randomizeTitleScreenCards === 'function') randomizeTitleScreenCards();
    $('#homescreen').show(); 
    $('#deck-builder').hide();
    $('#deck-selector').empty();

    if (!getBuildingDeckSize()) {
        localStorage.removeItem('deck');
        $('#player-deck').empty();
        return;
    }

    var deckList = {};
    $('#player-deck > .deck-card-item').each(function() { 
        var quant = $(this).attr('quant');
        var cardId = $(this).attr('id');
        deckList[cardId] = quant;    
    });

    localStorage.setItem('deck', JSON.stringify(deckList));
    $('#player-deck').empty();
}

// Click to ADD card from vault
$(document).on('click', '#deck-selector > .deck-card-item', function() {
    var cardId = $(this).attr('id');
    addToDeck(cardId);
});

// Click to REMOVE card from active deck
$(document).on('click', '#player-deck > .deck-card-item', function() {
    var cardId = $(this).attr('id');
    removeFromDeck(cardId);
});

function getBuildingDeckSize() {
    return parseInt($('#card-count').attr('card-Count')) || 0;
}

function setBuildingDeckSize(newSize) {
    $('#card-count').attr('card-Count', newSize);
    $('#card-count').text('Deck size: ' + newSize + '/60');
}