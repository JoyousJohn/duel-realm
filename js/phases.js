var phase;
var turn;
var turnCount = 0;

var phases = [
    { 'phaseNum': 0, 'phaseName': 'Draw Phase' },
    { 'phaseNum': 1, 'phaseName': 'Standby Phase' },
    { 'phaseNum': 2, 'phaseName': 'Main Phase 1' },
    { 'phaseNum': 3, 'phaseName': 'Battle Phase' },
    { 'phaseNum': 4, 'phaseName': 'Main Phase 2' },
    { 'phaseNum': 5, 'phaseName': 'End Phase' },
    { 'phaseNum': 6, 'phaseName': 'Game Start' }
];

async function startGame() {
    prepareGame();

    setPhase(6);

    await getCards('player', 5);
    await getCards('computer', 5);
    
    turn = Math.round(Math.random()); // 0: player, 1: computer
    turn ? computerTurn() : playerTurn();
}

async function playerTurn() {

    showPopup("YOUR TURN");

    updateTurn(0); // Set phase to player
    GameState.turn.active = 'player';
    GameState.turn.count = turnCount;
    GameState.turn.normalSummonUsed = false;

    // Reset attack flags for player monsters
    var playerMonsters = GameState.getMonstersOnField('player');
    playerMonsters.forEach(function(m) { m.card.hasAttacked = false; });

    // 1. Draw Phase
    setPhase(0); // DP
    await getCards('player', 1);
    await sleep(getAnimDuration(250));

    // 2. Standby Phase
    setPhase(1); // SP
    checkStandbyTraps('computer');
    await sleep(getAnimDuration(200));

    // 3. Main Phase 1
    setPhase(2); // M1

    if (activeCard !== null) {
        showAvailableZones();
    }
}

async function computerTurn() {

    showPopup("COMPUTER'S TURN");

    updateTurn(1); // Set phase to computer
    GameState.turn.active = 'computer';
    GameState.turn.count = turnCount;
    GameState.turn.normalSummonUsed = false;

    // Reset attack flags for computer monsters
    var computerMonsters = GameState.getMonstersOnField('computer');
    computerMonsters.forEach(function(m) { m.card.hasAttacked = false; });

    setPhase(0); // Draw 
    await getCards('computer', 1);
    await sleep(getAnimDuration(350));

    setPhase(1); // Standby
    checkStandbyTraps('player');
    await sleep(getAnimDuration(150));

    setPhase(2); // Main Phase 1

    // 1. AI evaluates existing field monsters to flip/change position
    if (typeof AIEvaluatePositionChanges === 'function') {
        await AIEvaluatePositionChanges();
    }

    // 2. Play draw acceleration (Pot of Greed) FIRST to maximize options
    if (typeof AIPlayDrawCards === 'function') {
        await AIPlayDrawCards();
    }

    // 3. AI Normal Summons 1 monster per turn with full hand visibility
    if (typeof AISummonMonsterRoutine === 'function') {
        await AISummonMonsterRoutine();
    }

    // 4. Play burn spells (Ookazi, Hinotama) before battle to potentially finish the game
    if (typeof AIPlayOokazi === 'function') {
        await AIPlayOokazi();
    }
    if (typeof AIPlayHinotama === 'function') {
        await AIPlayHinotama();
    }

    // 4b. Play Fissure to clear blockers before the battle phase
    if (typeof AIPlayFissure === 'function') {
        await AIPlayFissure();
    }

    // 4c. Play Tribute to the Doomed to remove a key monster (costs a hand card)
    if (typeof AIPlayTributeToTheDoomed === 'function') {
        await AIPlayTributeToTheDoomed();
    }

    // 5. Computer plays spells and sets traps dynamically
    await AIPlaySpellTrapCards();

    setPhase(3); // Battle Phase
    await AIPerformBattlePhase();
    await sleep(getAnimDuration(500));

    setPhase(4); // Main Phase 2
    if (typeof AIEvaluatePositionChanges === 'function') {
        await AIEvaluatePositionChanges();
    }
    if (typeof AISummonMonsterRoutine === 'function') {
        await AISummonMonsterRoutine();
    }
    await AIPlaySpellTrapCards();

    setPhase(5); // End Phase
    await handleEndPhaseEffects('computer');
    await sleep(getAnimDuration(600));

    // Only continue if game is still active
    if (GameState.player.lp > 0 && GameState.computer.lp > 0) {
        playerTurn();
    }
}

function updateTurn(newTurn) { 
    turn = newTurn;
    turnCount++;
    $('#turn-num-display').text('TURN ' + turnCount);

    if (turn === 0) {
        $('#turn-info').text("YOUR TURN");
        $('#hud-turn-badge').removeClass('is-computer-turn').addClass('is-player-turn');
        $('#duel-turn-indicator').removeClass('indicator-computer').addClass('indicator-player');
        $('#end-turn-btn').prop('disabled', false).css('opacity', '1');
        $('#end-turn-btn-label').text('END TURN');
    } else {
        $('#turn-info').text("OPPONENT TURN");
        $('#hud-turn-badge').removeClass('is-player-turn').addClass('is-computer-turn');
        $('#duel-turn-indicator').removeClass('indicator-player').addClass('indicator-computer');
        $('#end-turn-btn').prop('disabled', true).css('opacity', '0.5');
        $('#end-turn-btn-label').text('OPPONENT TURN');
    }

    if (typeof updateResourceCounters === 'function') updateResourceCounters();
} 

function updatePhaseInfo() {
    if (phases[phase]) {
        $('#game-phase').text(phases[phase].phaseName.toUpperCase());
        $('#phase-tracker .phase-step').removeClass('active');
        $('#phase-tracker .phase-step[data-phase="' + phase + '"]').addClass('active');
        if (typeof updateActionableCards === 'function') updateActionableCards();
    }
}

function getPhaseFormat() {
    return phases[phase] ? "[" + phases[phase]['phaseName'] + "]" : "[Phase]";
}

async function requestEndTurn() {
    if (turn === 0) {

        if (activeCard) {
            $('.active-card').removeClass('active-card');
            clearAvailableZones();
            activeCard = null;
        }

        $('.card-actionable').removeClass('card-actionable');
        hideSummonOptionsIfVisible();
        hidePositionChangeOptionsIfVisible();
        hideAtkMenuIfVisible();

        // 6. End Phase
        setPhase(5); // EP
        await handleEndPhaseEffects('player');
        await sleep(350);

        computerTurn();

    } else { alert('not your turn'); }
}

function prepareGame() {
    $('#homescreen').hide(); 
    $('#summon-options').hide();
    $('#change-position-options').hide();
    $('#attack-menu').hide();
    $('#system-menu-modal').hide();
    $('#graveyard-modal').hide();
    $('#viewport').show();

    GameState.reset();
    GameState.status = 'PLAYING';

    player = { 
        'hand': { 'monsters': [], 'spells': [], 'traps': []},
        'field': { 'monsters': [], 'spells': [], 'traps': []},
        'graveyard': { 'monsters': [], 'spells': [], 'traps': []}
    };
    computer = { 
        'hand': { 'monsters': [], 'spells': [], 'traps': []},
        'field': { 'monsters': [], 'spells': [], 'traps': []},
        'graveyard': { 'monsters': [], 'spells': [], 'traps': []}
    };

    updateLPDisplay();
    buildPlayerDeck();
    if (typeof updateResourceCounters === 'function') updateResourceCounters();
    if (typeof BattleFX !== 'undefined') BattleFX.updateDeckVisuals();
}

function setPhase(newPhase) {
    phase = newPhase;
    GameState.turn.phase = newPhase;
    updatePhaseInfo();
}

function showPopup(text) {
    $('#turn-popup > span').text(text);
    $('#turn-popup').fadeIn();
    setTimeout(function(){ $('#turn-popup').fadeOut(); }, 1000);
}

function endGame() {
    $('#viewport').hide();
    if (typeof randomizeTitleScreenCards === 'function') randomizeTitleScreenCards();
    $('#homescreen').show(); 
    $('#duel-outcome-modal').hide();
    $('#feed').text('');
    clearHand('player');
    clearHand('computer');
    player = null;
    computer = null;
    turnCount = 0;

    if (activeCard) {
        clearAvailableZones();
        activeCard = null;
    }

    GameState.reset();
    resetAllSquares();   
}

function addToFeed(gameMove) {
    if (!gameMove) return;

    var text = String(gameMove)
        .replace(/\[COMPUTER\]\s*/gi, 'Computer ')
        .replace(/\[PLAYER\]\s*/gi, 'Player ')
        .replace(/\bcomputer's\b/gi, 'Computer\'s')
        .replace(/\bplayer's\b/gi, 'Player\'s')
        .replace(/\bcomputer\b/gi, 'Computer')
        .replace(/\bplayer\b/gi, 'Player')
        .trim();

    // Auto-detect and bold/color all card names registered in the game
    if (typeof cards !== 'undefined') {
        var cardNames = Object.values(cards)
            .map(function(c) { return c.name; })
            .filter(function(n) { return Boolean(n); })
            .sort(function(a, b) { return b.length - a.length; });

        cardNames.forEach(function(cName) {
            var escaped = cName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Match plain card name or existing <em>Card Name</em>
            var emRegex = new RegExp('<em>' + escaped + '</em>', 'gi');
            text = text.replace(emRegex, '§CN§' + cName + '§/CN§');

            var plainRegex = new RegExp('\\b' + escaped + '\\b', 'gi');
            text = text.replace(plainRegex, '§CN§' + cName + '§/CN§');
        });
    }

    // Replace duelist names with styled actor badges
    text = text
        .replace(/\bComputer('s)?\b/g, '<span class="feed-actor feed-computer">Computer$1</span>')
        .replace(/\bPlayer('s)?\b/g, '<span class="feed-actor feed-player">Player$1</span>');

    // Convert markers to gold card name highlights
    text = text
        .replace(/§CN§/g, '<strong class="feed-card-name">')
        .replace(/§\/CN§/g, '</strong>');

    var logItem = $('<div class="feed-log-item">' + text + '</div>');
    $('#feed').append(logItem);

    var feedElem = document.getElementById('feed');
    if (feedElem) feedElem.scrollTop = feedElem.scrollHeight;
}

// Clear & reset all fields
function resetAllSquares(squareElm) {

    $('.card-zone-square').each(function() {
        $(this).find('div.card-zone').off(".flip");
        $(this).attr('data-card-type', "");
        $(this).attr('data-card-name', "");
        $(this).attr('data-card-position', "");
        $(this).attr('data-turn-moved', "");
        $(this).attr('data-turn-posChanged', "");

        $(this).find('div.card-zone').removeData("flip-model");
        $(this).find('div.card-zone').removeData('transform');
        $(this).find('div.card-zone').removeAttr('style');
        
        $(this).find('img').removeAttr('src').hide();
        $(this).find('img').removeAttr('style');
        
        $(this).find('.front, .back').removeAttr('style');
        $(this).find('.front, .back').removeData('transform');
    });

    $('.swords-turn-counter-badge').remove();
    $('.borrowed-monster-badge').remove();
    $('.stat-mod-badge').remove();
    $('.def-locked-badge').remove();
}