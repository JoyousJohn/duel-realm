/**
 * Effects Targeting: On-mat spell target selection UX for spells that need
 * player to pick a field square among tied candidates (Fissure tie-break etc.)
 * Mirrors the on-mat tribute selection UX.
 */

// ---------------------------------------------------------------------------
// On-Mat Spell Target Selection (Smashing Ground / Fissure tie-break)
// ---------------------------------------------------------------------------
var pendingSpellTarget = {
    active: false,
    resolve: null,
    prompt: '',
    candidates: [],
    selectedCand: null
};

// Generalized on-mat field picker. Returns a Promise resolving with the chosen
// candidate object (from opts.candidates) or null if cancelled.
//   opts: {
//     cardName:     title in the toast bar,
//     prompt:       instruction, e.g. 'SELECT 1 OPPONENT MONSTER ...' (bar appends ' (n/1)'),
//     confirmLabel, confirmIcon: label + icon on the confirm button,
//     candidates:   [{ side, zone, isField?, inst?, def?, ... }],
//     aiPick:       (cands) -> candidate for the AI path (default: first candidate)
//   }
// Non-player callers resolve immediately through aiPick (no UI).
function requestFieldTargetChoice(who, opts) {
    if (who !== 'player') {
        var aiList = opts.candidates.slice();
        var pick = (typeof opts.aiPick === 'function') ? opts.aiPick(aiList) : aiList[0];
        return Promise.resolve(pick || null);
    }

    return new Promise(function(resolve) {
        pendingSpellTarget.active = true;
        pendingSpellTarget.resolve = resolve;
        pendingSpellTarget.prompt = opts.prompt || 'SELECT A TARGET';
        pendingSpellTarget.candidates = opts.candidates || [];
        pendingSpellTarget.selectedCand = null;

        $('#spell-target-bar-card-name').text((opts.cardName || 'SPELL').toUpperCase());
        $('#spell-target-btn-label').text(opts.confirmLabel || 'DESTROY');
        $('#spell-target-btn-icon').text(opts.confirmIcon || '💥');
        $('#spell-target-btn-confirm').prop('disabled', true);
        updateSpellTargetCounter();

        $('body').addClass('spell-target-selection-mode');
        pendingSpellTarget.candidates.forEach(function(c) {
            highlightSpellTargetSquare(c.side, c.zone, c.isField);
        });

        $('#spell-target-action-bar').fadeIn(150);
    });
}

// Add the candidate glow to a square on either player's mat (incl. field zone).
function highlightSpellTargetSquare(side, zone, isField) {
    var field = (typeof getField === 'function') ? getField(side) : $('.field');
    if (!field || !field.length) return;
    if (isField) {
        field.find('.field-zone-square').addClass('spell-target-candidate');
    } else {
        field.find('.card-zone-square[data-zone="' + zone + '"]').addClass('spell-target-candidate');
    }
}

// Single-selection toggle when a highlighted square is clicked.
function selectSpellTargetZone(side, zoneNum, squareElm) {
    if (!pendingSpellTarget.active) return;
    clearSpellTargetSelected();
    for (var i = 0; i < pendingSpellTarget.candidates.length; i++) {
        var c = pendingSpellTarget.candidates[i];
        var candZone = (c.isField) ? null : c.zone;
        var pickedZone = (squareElm.hasClass('field-zone-square')) ? null : zoneNum;
        if (c.side === side && candZone === pickedZone) {
            pendingSpellTarget.selectedCand = c;
            break;
        }
    }
    if (pendingSpellTarget.selectedCand) {
        squareElm.addClass('spell-target-selected').append('<div class="spell-target-selected-badge">💥</div>');
        $('#spell-target-btn-confirm').prop('disabled', false);
    } else {
        $('#spell-target-btn-confirm').prop('disabled', true);
    }
    updateSpellTargetCounter();
}

function confirmSpellTargetSelection() {
    if (!pendingSpellTarget.active || pendingSpellTarget.selectedCand === null) return;
    var resolve = pendingSpellTarget.resolve;
    var cand = pendingSpellTarget.selectedCand;
    clearSpellTargetSelectionMode();
    if (resolve) resolve(cand);
}

function cancelSpellTargetSelection() {
    if (!pendingSpellTarget.active) return;
    var resolve = pendingSpellTarget.resolve;
    clearSpellTargetSelectionMode();
    if (resolve) resolve(null);
}

function updateSpellTargetCounter() {
    var n = (pendingSpellTarget.selectedCand !== null) ? 1 : 0;
    $('#spell-target-bar-counter').text(pendingSpellTarget.prompt + ' (' + n + '/1)');
}

function clearSpellTargetSelected() {
    $('.card-zone-square').removeClass('spell-target-selected').find('.spell-target-selected-badge').remove();
}

function clearSpellTargetSelectionMode() {
    pendingSpellTarget.active = false;
    pendingSpellTarget.prompt = '';
    pendingSpellTarget.candidates = [];
    pendingSpellTarget.selectedCand = null;
    pendingSpellTarget.resolve = null;

    $('body').removeClass('spell-target-selection-mode');
    $('.card-zone-square').removeClass('spell-target-candidate spell-target-selected').find('.spell-target-selected-badge').remove();
    $('#spell-target-action-bar').fadeOut(120);
}

// Clicking any highlighted field square during spell target selection picks it.
$(document).on('click', '.card-zone-square', function(e) {
    if (!pendingSpellTarget.active) return;
    e.stopPropagation();
    e.preventDefault();
    var isField = $(this).hasClass('field-zone-square');
    if (!$(this).hasClass('spell-target-candidate')) return;
    var side = ($(this).closest('#computer-field').length) ? 'computer' : 'player';
    var zoneNum = isField ? null : parseInt($(this).attr('data-zone'));
    selectSpellTargetZone(side, zoneNum, $(this));
});
