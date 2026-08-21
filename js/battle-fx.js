/**
 * BattleFX: AAA Combat Animation & VFX Engine for Duel Realm: Tactics
 */
var BattleFX = {

    isAnimating: false,

    /**
     * Animate full card attack strike across the 3D duel arena
     * @param {jQuery} attackerSquare - jQuery element of the attacking card zone
     * @param {jQuery|null} defenderSquare - jQuery element of target monster, or null if direct attack
     * @param {boolean} isDirect - True if attacking Life Points directly
     */
    animateAttack: async function(attackerSquare, defenderSquare, isDirect) {
        this.isAnimating = true;
        var self = this;

        return new Promise(async function(resolve) {
            var attackerCard = $(attackerSquare).find('.card-zone.main-zone');
            if (!attackerCard.length) attackerCard = $(attackerSquare);

            var targetElem = defenderSquare;
            if (isDirect) {
                var isPlayerAttacking = $(attackerSquare).closest('#player-field').length > 0;
                targetElem = isPlayerAttacking ? $('#opponent-lp') : $('#player-lp');
            }

            if (!targetElem || !targetElem.length) {
                self.isAnimating = false;
                resolve();
                return;
            }

            // 1. Calculate Vector Delta between Attacker & Defender in screen pixels
            var sourceOffset = attackerCard.offset();
            var targetOffset = targetElem.offset();

            var dx = (targetOffset.left + (targetElem.outerWidth() / 2)) - (sourceOffset.left + (attackerCard.outerWidth() / 2));
            var dy = (targetOffset.top + (targetElem.outerHeight() / 2)) - (sourceOffset.top + (attackerCard.outerHeight() / 2));

            // Normalize and determine pull-back windup vector
            var distance = Math.sqrt(dx * dx + dy * dy);
            var windupDist = 18;
            var windupX = distance > 0 ? -(dx / distance) * windupDist : 0;
            var windupY = distance > 0 ? -(dy / distance) * windupDist : 18;

            // Apply combat aura
            attackerCard.addClass('card-attacking-aura');

            // 2. Phase 1: Windup Anticipation
            await new Promise(function(r) {
                attackerCard.transition({
                    x: windupX,
                    y: windupY,
                    scale: 1.12
                }, getAnimDuration(180), 'cubic-bezier(0.25, 1, 0.5, 1)', r);
            });

            // 3. Phase 2: Rapid Lunge Strike (Travel 75% of distance to target)
            var strikeX = dx * 0.78;
            var strikeY = dy * 0.78;

            await new Promise(function(r) {
                attackerCard.transition({
                    x: strikeX,
                    y: strikeY,
                    scale: 1.18
                }, getAnimDuration(160), 'cubic-bezier(0.12, 0.9, 0.3, 1)', r);
            });

            // 4. Phase 3: Impact Blast & Screen Shake
            self.triggerScreenShake(isDirect ? 'heavy' : 'light');
            self.spawnImpactVFX(targetElem, isDirect);

            // 5. Phase 4: Recoil & Return to Base Zone
            await new Promise(function(r) {
                attackerCard.transition({
                    x: 0,
                    y: 0,
                    scale: 1
                }, getAnimDuration(280), 'cubic-bezier(0.16, 1, 0.3, 1)', function() {
                    attackerCard.removeClass('card-attacking-aura active-card');
                    if (typeof resetActiveCardClass === 'function') resetActiveCardClass();
                    self.isAnimating = false;
                    r();
                });
            });

            resolve();
        });
    },

    /**
     * Trigger Screen / Arena Micro-Shake
     */
    triggerScreenShake: function(intensity) {
        var mat = $('#mat');
        var shakeClass = intensity === 'heavy' ? 'screen-shake-heavy' : 'screen-shake-light';
        mat.removeClass('screen-shake-light screen-shake-heavy');
        void mat[0].offsetWidth; // Force reflow
        mat.addClass(shakeClass);
        setTimeout(function() {
            mat.removeClass('screen-shake-light screen-shake-heavy');
        }, intensity === 'heavy' ? 420 : 300);
    },

    /**
     * Spawn dynamic SVG/CSS impact burst at target coordinates
     */
    spawnImpactVFX: function(targetElem, isDirect) {
        if (!targetElem || !targetElem.length) return;
        var offset = targetElem.offset();
        var cx = offset.left + (targetElem.outerWidth() / 2);
        var cy = offset.top + (targetElem.outerHeight() / 2);

        var burst = $('<div class="impact-shockwave-burst"></div>').css({
            left: cx,
            top: cy
        });

        var slash = $('<div class="impact-slash-spark"></div>').css({
            left: cx,
            top: cy
        });

        $('body').append(burst).append(slash);

        setTimeout(function() {
            burst.remove();
            slash.remove();
        }, 500);
    },

    /**
     * Spawn Floating Combat Damage Numbers above target
     */
    spawnFloatingDamage: function(targetElem, damageAmount, type) {
        if (!damageAmount || damageAmount <= 0) return;
        if (!targetElem || !targetElem.length) return;

        var offset = targetElem.offset();
        var cx = offset.left + (targetElem.outerWidth() / 2);
        var cy = offset.top + 10;

        var extraClass = '';
        if (type === 'direct') extraClass = 'direct-hit';
        else if (type === 'def-blocked') extraClass = 'def-blocked';

        var label = '-' + damageAmount + ' LP';
        var floatElm = $('<div class="floating-damage-number ' + extraClass + '">' + label + '</div>').css({
            left: cx - 40,
            top: cy
        });

        $('body').append(floatElm);

        setTimeout(function() {
            floatElm.remove();
        }, 1000);
    },

    /**
     * Smoothly animate numerical countdown for Life Points
     */
    animateLPCount: function(who, targetLP) {
        var lpElement = who === 'player' ? $('#player-lp') : $('#opponent-lp');
        if (!lpElement.length) return;

        lpElement.addClass('lp-damage-flash');
        setTimeout(function() {
            lpElement.removeClass('lp-damage-flash');
        }, 500);

        var currentText = lpElement.text().replace(/[^0-9]/g, '');
        var startLP = parseInt(currentText) || targetLP;
        var diff = startLP - targetLP;
        if (diff === 0) {
            lpElement.text(targetLP + ' LP');
            return;
        }

        var duration = 500;
        var startTime = performance.now();

        function step(now) {
            var elapsed = now - startTime;
            var progress = Math.min(1, elapsed / duration);
            var current = Math.round(startLP - (diff * progress));
            lpElement.text(current + ' LP');
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                lpElement.text(targetLP + ' LP');
            }
        }

        requestAnimationFrame(step);
    },

    /**
     * Animate Monster Destruction (Shatter effect into Graveyard)
     */
    animateMonsterDestruction: function(squareElm) {
        var self = this;
        return new Promise(function(resolve) {
            var zone = $(squareElm).find('div.card-zone');
            var isPlayer = $(squareElm).closest('#player-field').length > 0;
            var who = isPlayer ? 'player' : 'computer';
            var gyZone = $('#' + who + '-graveyard-zone');

            var position = $(squareElm).attr('data-card-position');
            var isFaceDown = (position === 'defense-down');
            var isDefense = position && position.startsWith('defense');

            zone.addClass('monster-shattered');

            setTimeout(function() {
                var sourceOffset = zone.offset();
                var gyOffset = gyZone.offset();
                var cardName = $(squareElm).attr('data-card-name');
                var cardDef = cards[cardName];
                var imgSrc = cardDef ? cardDef.file : '';

                // Clear square data attributes to reveal placeholder state
                $(squareElm).attr('data-card-type', '');
                $(squareElm).attr('data-card-name', '');
                $(squareElm).attr('data-card-position', '');
                $(squareElm).attr('data-turn-moved', '');
                $(squareElm).attr('data-turn-posChanged', '');
                $(squareElm).removeClass('available-zone spell-available-zone field-available-zone active-attacker-zone');
                $(squareElm).find('.borrowed-monster-badge').remove();
                $(squareElm).find('.def-locked-badge').remove();
                $(squareElm).find('.flip-effect-badge').remove();
                $(squareElm).find('.immune-badge').remove();
                $(squareElm).find('.no-tribute-badge').remove();
                $(squareElm).find('.attack-locked-badge').remove();
                $(squareElm).find('.effect-ready-badge').remove();
                $(squareElm).find('.stat-mod-badge').remove();

                zone.removeClass('monster-shattered available-zone spell-available-zone field-available-zone active-card card-actionable active-attacker-zone');
                zone.off('.flip');
                zone.removeData('flip-model');
                zone.removeAttr('style');
                zone.find('img').removeAttr('src').hide();
                zone.find('.front, .back').removeAttr('style');
                zone.find('.front, .back').removeData('transform');
                zone.removeData('transform');
                
                // Smoothly fade in the empty dashed placeholder border
                zone.css('opacity', 0).show().fadeTo(getAnimDuration(420), 1);

                if (imgSrc && gyOffset) {
                    var animDur = getAnimDuration(380);
                    var animEasing = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

                    var frontMarkup = '<div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div>';
                    var backMarkup = '<div class="card-back"></div>';

                    var spiritClone = $('<div class="card card-draw-flight" style="width: ' + zone.outerWidth() + 'px; height: ' + zone.outerHeight() + 'px; top: ' + sourceOffset.top + 'px; left: ' + sourceOffset.left + 'px; filter: grayscale(0.3) brightness(1.15); opacity: 0.95;">' +
                        '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' +
                            frontMarkup +
                            backMarkup +
                        '</div>' +
                    '</div>');

                    var frontElm = spiritClone.find('.card-front');
                    var backElm = spiritClone.find('.card-back');

                    if (isFaceDown) {
                        // Start face-down (back at 0deg, front at 180deg)
                        backElm.css({ transform: 'rotateY(0deg)', display: 'block', visibility: 'visible', opacity: 1 });
                        frontElm.css({ transform: 'rotateY(180deg)' });
                    } else {
                        // Start face-up (front at 0deg, back at 180deg)
                        frontElm.css({ transform: 'rotateY(0deg)', display: 'flex', visibility: 'visible', opacity: 1 });
                        backElm.css({ transform: 'rotateY(180deg)' });
                    }

                    if (isDefense) {
                        spiritClone.css('transform', 'rotate(90deg)');
                    }

                    $('body').append(spiritClone);

                    // Concurrently flip face-up as it travels toward the Graveyard
                    if (isFaceDown) {
                        backElm.transition({ rotateY: '180deg' }, animDur, animEasing);
                        frontElm.transition({ rotateY: '0deg' }, animDur, animEasing);
                    }

                    spiritClone.transition({
                        top: gyOffset.top,
                        left: gyOffset.left,
                        rotate: '0deg',
                        scale: 0.92,
                        opacity: 0.4
                    }, animDur, animEasing, function() {
                        spiritClone.remove();
                        updateGraveyardZones();
                        resolve();
                    });
                } else {
                    updateGraveyardZones();
                    resolve();
                }
            }, getAnimDuration(400));
        });
    },

    /**
     * Smooth 3D Flip Reveal for face-down card when attacked in battle or flipped by effect
     */
    animateFlipReveal: function(squareElm) {
        return new Promise(function(resolve) {
            var zone = $(squareElm).find('div.card-zone');
            var cardName = $(squareElm).attr('data-card-name');
            var cardDef = cards[cardName];
            var position = $(squareElm).attr('data-card-position') || 'defense-up';
            var isDefense = position.startsWith('defense');

            if (!cardDef) {
                resolve();
                return;
            }

            // Ensure card image is loaded in front
            updateCardImage(squareElm);

            var frontElm = zone.find('.front');
            var backElm = zone.find('.back');

            // Initialize 3D perspective & starting transforms
            zone.css({
                'perspective': '800px',
                'transform-style': 'preserve-3d',
                'transition': 'none'
            });

            if (isDefense) {
                zone.css('transform', 'rotate(90deg)');
            } else {
                zone.css('transform', 'rotate(0deg)');
            }

            frontElm.css({
                'display': 'flex',
                'visibility': 'visible',
                'opacity': '1',
                'transform': 'rotateY(180deg)',
                'backface-visibility': 'hidden'
            });

            backElm.css({
                'display': 'block',
                'visibility': 'visible',
                'opacity': '1',
                'transform': 'rotateY(0deg)',
                'backface-visibility': 'hidden'
            });

            var animDur = getAnimDuration(420);
            var animEasing = 'cubic-bezier(0.2, 0.9, 0.3, 1)';

            // Perform smooth synchronized 3D flip
            frontElm.transition({ rotateY: '0deg' }, animDur, animEasing);
            backElm.transition({ rotateY: '180deg' }, animDur, animEasing, function() {
                if (typeof zone.flip === 'function') {
                    try {
                        zone.flip({ trigger: 'manual' });
                        zone.flip(false);
                    } catch (e) {}
                }
                frontElm.css({
                    'display': 'flex',
                    'visibility': 'visible',
                    'opacity': '1',
                    'transform': 'rotateY(0deg)'
                });
                backElm.css({
                    'transform': 'rotateY(180deg)'
                });
                updateStatModBadges();
                resolve();
            });
        });
    },

    /**
     * Animate Spell/Trap departure into Graveyard
     */
    animateSpellToGraveyard: function(squareElm) {
        var self = this;
        return new Promise(function(resolve) {
            var zone = $(squareElm).find('div.card-zone');
            var isPlayer = $(squareElm).closest('#player-field').length > 0;
            var who = isPlayer ? 'player' : 'computer';
            var gyZone = $('#' + who + '-graveyard-zone');

            var sourceOffset = zone.offset();
            var gyOffset = gyZone.offset();
            var cardName = $(squareElm).attr('data-card-name');
            var cardDef = cards[cardName];
            var imgSrc = cardDef ? cardDef.file : '';

            // Clear square data attributes to reveal placeholder state
            $(squareElm).attr('data-card-type', '');
            $(squareElm).attr('data-card-name', '');
            $(squareElm).attr('data-card-position', '');
            $(squareElm).attr('data-turn-moved', '');
            $(squareElm).attr('data-turn-posChanged', '');
            $(squareElm).find('.swords-turn-counter-badge').remove();

            zone.off('.flip');
            zone.removeData('flip-model');
            zone.removeAttr('style');
            zone.find('img').removeAttr('src').hide();
            zone.find('.front, .back').removeAttr('style');
            zone.find('.front, .back').removeData('transform');
            zone.removeData('transform');
            zone.css('opacity', 0).show().fadeTo(getAnimDuration(420), 1);

            if (imgSrc && gyOffset) {
                var flightClone = $('<div class="card card-draw-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + zone.outerWidth() + 'px; height: ' + zone.outerHeight() + 'px; top: ' + sourceOffset.top + 'px; left: ' + sourceOffset.left + 'px; filter: brightness(1.1);">' +
                    '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' +
                        '<div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div>' +
                    '</div>' +
                '</div>');

                $('body').append(flightClone);

                flightClone.transition({
                    top: gyOffset.top,
                    left: gyOffset.left,
                    scale: 0.95,
                    opacity: 0.4
                }, getAnimDuration(450), 'cubic-bezier(0.2, 0.9, 0.3, 1)', function() {
                    flightClone.remove();
                    updateGraveyardZones();
                    resolve();
                });
            } else {
                updateGraveyardZones();
                resolve();
            }
        });
    },

    /**
     * Animate smooth card transfer between two field squares (e.g. Change of Heart)
     */
    animateCardTransfer: function(fromSquare, toSquare, cardName, position) {
        var self = this;
        return new Promise(function(resolve) {
            var fromZone = $(fromSquare).find('div.card-zone');
            var toZone = $(toSquare).find('div.card-zone');

            var cardDef = cards[cardName];
            var imgSrc = cardDef ? cardDef.file : '';

            var fromOffset = fromZone.offset();
            var toOffset = toZone.offset();

            var cardWidth = (fromZone && fromZone.outerWidth()) ? fromZone.outerWidth() : 70;
            var cardHeight = (fromZone && fromZone.outerHeight()) ? fromZone.outerHeight() : 102;
            var isFaceDown = (position === 'defense-down');
            var isDefense = position && position.startsWith('defense');

            // Clear fromSquare DOM
            $(fromSquare).attr('data-card-type', '');
            $(fromSquare).attr('data-card-name', '');
            $(fromSquare).attr('data-card-position', '');
            $(fromSquare).attr('data-turn-moved', '');
            $(fromSquare).attr('data-turn-posChanged', '');
            $(fromSquare).find('.borrowed-monster-badge').remove();
            $(fromSquare).find('.stat-mod-badge').remove();

            fromZone.off('.flip');
            fromZone.removeData('flip-model');
            fromZone.removeAttr('style');
            fromZone.find('img').removeAttr('src').hide();
            fromZone.find('.front, .back').removeAttr('style');
            fromZone.find('.front, .back').removeData('transform');
            fromZone.removeData('transform');
            fromZone.css('opacity', 0).show().fadeTo(getAnimDuration(300), 1);

            toZone.css({ 'visibility': 'hidden', 'opacity': '0' });

            if (fromOffset && toOffset) {
                var faceContent = isFaceDown 
                    ? '<div class="card-back"></div>' 
                    : '<div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div>';

                var flightClone = $('<div class="card card-draw-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + cardWidth + 'px; height: ' + cardHeight + 'px; top: ' + fromOffset.top + 'px; left: ' + fromOffset.left + 'px; filter: drop-shadow(0 0 16px rgba(212, 175, 55, 0.9)) brightness(1.1);">' +
                    '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' +
                        faceContent +
                    '</div>' +
                '</div>');

                if (isDefense) {
                    flightClone.css('transform', 'rotate(90deg)');
                }

                $('body').append(flightClone);

                flightClone.transition({
                    top: toOffset.top,
                    left: toOffset.left,
                    rotate: isDefense ? '90deg' : '0deg',
                    scale: 1.05
                }, getAnimDuration(480), 'cubic-bezier(0.2, 0.9, 0.3, 1)', function() {
                    flightClone.remove();
                    resolve();
                });
            } else {
                resolve();
            }
        });
    },

    /**
     * Enter interactive target selection mode for player attacks
     */
    startPlayerTargetSelection: function(attackerZone) {
        var computerMonsters = GameState.getMonstersOnField('computer');
        var isBlocked = (typeof isAttackBlocked === 'function') && isAttackBlocked('player');
        var attackerInst = (GameState.player && GameState.player.field && GameState.player.field.monsters) ? GameState.player.field.monsters[attackerZone] : null;
        var playerMonsters = GameState.getMonstersOnField('player');
        var isHarpieDirectRestricted = (attackerInst && attackerInst.cardId === 'harpie-lady' && playerMonsters.length <= 1);

        // Direct attack if opponent field is clear
        if (computerMonsters.length === 0) {
            $('#opponent-lp').addClass('targetable-lp');
            if (isBlocked) {
                $('#opponent-lp').addClass('is-blocked');
                addToFeed('(Targeting) Opponent field is clear, but Swords of Revealing Light prevents your monsters from attacking.\n');
                $('#opponent-lp').off('click.targetAttack').on('click.targetAttack', function() {
                    addToFeed('[Attack Blocked] Swords of Revealing Light prevents your monsters from attacking!\n');
                });
            } else if (isHarpieDirectRestricted) {
                $('#opponent-lp').addClass('is-blocked');
                addToFeed('(Targeting) Harpie Lady cannot attack directly while you control no other monsters.\n');
                $('#opponent-lp').off('click.targetAttack').on('click.targetAttack', function() {
                    addToFeed('[Attack Restricted] Harpie Lady cannot attack directly while she is your only monster on the field!\n');
                });
            } else {
                $('#opponent-lp').removeClass('is-blocked');
                addToFeed('(Targeting) Opponent field is clear! Click opponent LP to Direct Attack.\n');
                $('#opponent-lp').off('click.targetAttack').one('click.targetAttack', function() {
                    $('#opponent-lp').removeClass('targetable-lp');
                    executeBattle('player', attackerZone, null);
                });
            }
            return;
        }

        // Highlight opponent monsters as selectable attack targets
        $('.attack-targetable-zone').removeClass('attack-targetable-zone is-blocked');

        if (isBlocked) {
            addToFeed('(Targeting) Opponent monsters cannot be attacked due to Swords of Revealing Light.\n');
        } else {
            addToFeed('(Targeting) Select an opponent monster to attack.\n');
        }

        for (var i = 0; i < computerMonsters.length; i++) {
            var zoneElm = getSquareElm('computer', computerMonsters[i].zone);
            zoneElm.addClass('attack-targetable-zone');
            if (isBlocked) {
                zoneElm.addClass('is-blocked');
            }
        }

        // Click handler on opponent monster squares
        $('#computer-field .card-zone-square').off('click.targetAttack').on('click.targetAttack', function(e) {
            e.stopPropagation();
            var targetZoneNum = parseInt($(this).attr('data-zone'));
            var targetMonster = GameState.computer.field.monsters[targetZoneNum];

            if (targetMonster) {
                if (isBlocked) {
                    addToFeed('[Attack Blocked] Swords of Revealing Light prevents your monsters from attacking!\n');
                    return;
                }
                $('#computer-field .card-zone-square').removeClass('attack-targetable-zone is-blocked').off('click.targetAttack');
                $('#opponent-lp').removeClass('targetable-lp is-blocked').off('click.targetAttack');
                executeBattle('player', attackerZone, targetZoneNum);
            }
        });
    },

    cancelTargetSelection: function() {
        $('.attack-targetable-zone').removeClass('attack-targetable-zone is-blocked');
        $('#opponent-lp').removeClass('targetable-lp is-blocked').off('click.targetAttack');
        if (typeof resetActiveCardClass === 'function') resetActiveCardClass();
    },

    /**
     * Animate Card Draw flight from Deck to Hand
     * @param {string} who - 'player' or 'computer'
     * @param {string} cardName - ID of the card drawn
     * @param {jQuery} targetCardElm - Target placeholder card element in hand
     */
    animateCardDraw: function(who, cardName, targetCardElm, isFast) {
        var self = this;
        return new Promise(function(resolve) {
            try {
                var deckZone = $('#' + who + '-deck-zone');
                if (!deckZone.length || !targetCardElm || !targetCardElm.length) {
                    if (targetCardElm) targetCardElm.css({ opacity: 1, visibility: 'visible' });
                    self.updateDeckVisuals();
                    resolve();
                    return;
                }

                var deckTop = deckZone.find('.deck-stack-top');
                var deckOffset = (deckTop.length ? deckTop : deckZone).offset();
                var targetOffset = targetCardElm.offset();

                var cardDef = cards[cardName];
                var imgSrc = cardDef ? cardDef.file : 'card_back_2.png';
                var isPlayer = (who === 'player');

                var cardWidth = (targetCardElm && targetCardElm.outerWidth()) ? targetCardElm.outerWidth() : (deckZone.find('.card-zone').outerWidth() || 70);
                var cardHeight = (targetCardElm && targetCardElm.outerHeight()) ? targetCardElm.outerHeight() : (deckZone.find('.card-zone').outerHeight() || 102);

                var faceOrder;
                if (isPlayer) {
                    faceOrder = '<div class="card-back"></div><div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div>';
                } else {
                    // AI Draw: Strictly face-down (player cannot see card art)
                    faceOrder = '<div class="card-back" style="width: 100%; height: 100%; position: relative;"></div>';
                }

                var flightClone = $('<div class="card card-draw-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + cardWidth + 'px; height: ' + cardHeight + 'px; top: ' + deckOffset.top + 'px; left: ' + deckOffset.left + 'px;">' +
                    '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' + faceOrder + '</div>' +
                '</div>');

                if (isPlayer && typeof $.fn.flip === 'function') {
                    try {
                        flightClone.find('.card-relative').flip({
                            trigger: 'manual',
                            axis: 'y'
                        });
                        // Start face-down
                        flightClone.find('.card-relative').flip(false);
                    } catch (e) {}
                }

                $('body').append(flightClone);

                var liftDuration = isFast ? getAnimDuration(70) : getAnimDuration(110);
                var flipDelay = isFast ? getAnimDuration(50) : getAnimDuration(90);
                var flightDuration = isFast ? getAnimDuration(220) : getAnimDuration(300);

                // Pop off deck with slight lift
                flightClone.transition({
                    y: isPlayer ? -15 : 15,
                    scale: 1.05
                }, liftDuration, 'ease', function() {

                    // Flip face-up if player mid-draw
                    if (isPlayer && typeof $.fn.flip === 'function') {
                        setTimeout(function() {
                            try {
                                flightClone.find('.card-relative').flip(true);
                            } catch (e) {}
                        }, flipDelay);
                    }

                    // Flight trajectory to target slot in hand
                    flightClone.transition({
                        top: targetOffset.top,
                        left: targetOffset.left,
                        x: 0,
                        y: 0,
                        scale: 1
                    }, flightDuration, 'cubic-bezier(0.2, 0.9, 0.3, 1)', function() {
                        flightClone.remove();
                        targetCardElm.css({ opacity: 1, visibility: 'visible' });
                        self.updateDeckVisuals();
                        resolve();
                    });
                });
            } catch (err) {
                console.error('animateCardDraw error:', err);
                if (targetCardElm) targetCardElm.css({ opacity: 1, visibility: 'visible' });
                self.updateDeckVisuals();
                resolve();
            }
        });
    },

    /**
     * Animate card bounce flight from on-mat square to owner's hand
     * @param {string} sourceWho - Side currently controlling the monster on field ('player' or 'computer')
     * @param {number} sourceZone - Zone number of the monster on field
     * @param {string} ownerWho - Player receiving the card in hand ('player' or 'computer')
     * @param {string} cardName - ID of the bounced card
     * @param {jQuery} targetCardElm - Target card placeholder in recipient's hand
     */
    animateCardBounceToHand: function(sourceWho, sourceZone, ownerWho, cardName, targetCardElm) {
        var self = this;
        return new Promise(function(resolve) {
            try {
                var sourceSquare = getSquareElm(sourceWho, sourceZone);
                var sourceCardZone = sourceSquare ? sourceSquare.find('div.card-zone') : null;

                if (!sourceSquare || !sourceSquare.length || !targetCardElm || !targetCardElm.length) {
                    if (targetCardElm) targetCardElm.css({ opacity: 1, visibility: 'visible' });
                    resolve();
                    return;
                }

                var startOffset = (sourceCardZone && sourceCardZone.length) ? sourceCardZone.offset() : sourceSquare.offset();
                var targetOffset = targetCardElm.offset();

                var cardDef = cards[cardName];
                var imgSrc = cardDef ? cardDef.file : 'card_back_2.png';
                var isRecipientPlayer = (ownerWho === 'player');

                var cardWidth = (targetCardElm && targetCardElm.outerWidth()) ? targetCardElm.outerWidth() : 70;
                var cardHeight = (targetCardElm && targetCardElm.outerHeight()) ? targetCardElm.outerHeight() : 102;

                var isFaceDown = sourceSquare.attr('data-card-position') === 'defense-down';

                var faceOrder = '<div class="card-back"></div><div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div>';

                var flightClone = $('<div class="card card-bounce-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + cardWidth + 'px; height: ' + cardHeight + 'px; top: ' + startOffset.top + 'px; left: ' + startOffset.left + 'px; box-shadow: 0 0 24px rgba(56, 189, 248, 0.7); pointer-events: none; border-radius: 4px; overflow: hidden;">' +
                    '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' + faceOrder + '</div>' +
                '</div>');

                if (typeof $.fn.flip === 'function') {
                    try {
                        flightClone.find('.card-relative').flip({
                            trigger: 'manual',
                            axis: 'y'
                        });
                        flightClone.find('.card-relative').flip(!isFaceDown);
                    } catch (e) {}
                }

                // Hide the on-mat source element while flight takes place
                if (sourceCardZone) sourceCardZone.css('opacity', 0);

                $('body').append(flightClone);

                var liftDuration = getAnimDuration(110);
                var flightDuration = getAnimDuration(380);

                // Pop upwards off the field mat with an aura glow
                flightClone.transition({
                    y: (sourceWho === 'player') ? -25 : 25,
                    rotate: '0deg',
                    scale: 1.12
                }, liftDuration, 'ease-out', function() {

                    // If returning to AI hand, flip to face-down in mid-flight
                    if (!isRecipientPlayer && typeof $.fn.flip === 'function') {
                        setTimeout(function() {
                            try {
                                flightClone.find('.card-relative').flip(false);
                            } catch (e) {}
                        }, getAnimDuration(90));
                    } else if (isRecipientPlayer && isFaceDown && typeof $.fn.flip === 'function') {
                        // Reveal face-up if returning to player's hand
                        setTimeout(function() {
                            try {
                                flightClone.find('.card-relative').flip(true);
                            } catch (e) {}
                        }, getAnimDuration(90));
                    }

                    // Arc trajectory directly into hand
                    flightClone.transition({
                        top: targetOffset.top,
                        left: targetOffset.left,
                        x: 0,
                        y: 0,
                        rotate: '0deg',
                        scale: 1
                    }, flightDuration, 'cubic-bezier(0.2, 0.9, 0.3, 1)', function() {
                        flightClone.remove();
                        targetCardElm.css({ opacity: 1, visibility: 'visible' });
                        resolve();
                    });
                });
            } catch (err) {
                console.error('animateCardBounceToHand error:', err);
                if (targetCardElm) targetCardElm.css({ opacity: 1, visibility: 'visible' });
                resolve();
            }
        });
    },

    /**
     * Animate Card Discard flight from Hand into Graveyard
     * @param {string} who - 'player' or 'computer'
     * @param {string} cardName - ID of the card discarded
     * @param {jQuery} targetCardElm - Target card element in hand
     */
    animateCardDiscard: function(who, cardName, targetCardElm) {
        var self = this;
        return new Promise(function(resolve) {
            try {
                var gyZone = $('#' + who + '-graveyard-zone');
                var gyTarget = gyZone.length ? (gyZone.find('.card-zone').length ? gyZone.find('.card-zone') : gyZone) : null;
                if (!gyTarget || !gyTarget.length) {
                    if (targetCardElm) targetCardElm.remove();
                    if (typeof updateHandDisplay === 'function') updateHandDisplay(who);
                    updateGraveyardZones();
                    resolve();
                    return;
                }

                var gyOffset = gyTarget.offset();
                var cardDef = (typeof cards !== 'undefined' && cards[cardName]) ? cards[cardName] : null;
                var imgSrc = cardDef ? cardDef.file : 'card_back_2.png';
                var isPlayer = (who === 'player');

                var sourceOffset;
                var cardWidth = 70;
                var cardHeight = 102;

                if (targetCardElm && targetCardElm.length && targetCardElm.is(':visible')) {
                    sourceOffset = targetCardElm.offset();
                    cardWidth = targetCardElm.outerWidth() || 70;
                    cardHeight = targetCardElm.outerHeight() || 102;
                    // Trigger hand reorder immediately and hide placeholder card
                    if (typeof animateHandReorder === 'function' && typeof getHand === 'function') {
                        animateHandReorder(getHand(who), targetCardElm[0], getAnimDuration(380));
                    } else {
                        targetCardElm.css({ opacity: 0, visibility: 'hidden' });
                    }
                } else {
                    var handContainer = $('#' + who + '-hand');
                    sourceOffset = (handContainer.length && handContainer.is(':visible')) ? handContainer.offset() : gyOffset;
                }

                var faceOrder = '<div class="card-back"></div><div class="card-front"><img class="card-img" src="cards/' + imgSrc + '"></div>';

                var flightClone = $('<div class="card card-discard-flight" style="position: absolute !important; z-index: 99999; margin: 0; width: ' + cardWidth + 'px; height: ' + cardHeight + 'px; top: ' + sourceOffset.top + 'px; left: ' + sourceOffset.left + 'px;">' +
                    '<div class="card-relative" style="position: relative; width: 100%; height: 100%;">' + faceOrder + '</div>' +
                '</div>');

                if (typeof $.fn.flip === 'function') {
                    try {
                        flightClone.find('.card-relative').flip({
                            trigger: 'manual',
                            axis: 'y'
                        });
                        // Computer starts face-down (false), Player starts face-up (true)
                        flightClone.find('.card-relative').flip(isPlayer);
                    } catch (e) {}
                }

                $('body').append(flightClone);

                var liftDuration = getAnimDuration(160);
                var flipDelay = getAnimDuration(80);
                var flightDuration = getAnimDuration(420);

                // 1. Elevate out of hand with shadow aura
                flightClone.transition({
                    y: isPlayer ? -30 : 30,
                    scale: 1.18,
                    rotate: isPlayer ? -8 : 8
                }, liftDuration, 'cubic-bezier(0.18, 0.89, 0.32, 1.28)', function() {

                    // Flip face-up to reveal discarded card to player if computer discarded
                    if (!isPlayer && typeof $.fn.flip === 'function') {
                        setTimeout(function() {
                            try {
                                flightClone.find('.card-relative').flip(true);
                            } catch (e) {}
                        }, flipDelay);
                    }

                    // 2. Flight to Graveyard Zone
                    flightClone.transition({
                        top: gyOffset.top,
                        left: gyOffset.left,
                        x: 0,
                        y: 0,
                        rotate: 0,
                        scale: 0.95,
                        opacity: 0.7
                    }, flightDuration, 'cubic-bezier(0.22, 1, 0.36, 1)', function() {
                        flightClone.remove();
                        if (typeof updateHandDisplay === 'function') updateHandDisplay(who);
                        updateGraveyardZones();
                        resolve();
                    });
                });
            } catch (err) {
                console.error('animateCardDiscard error:', err);
                if (typeof updateHandDisplay === 'function') updateHandDisplay(who);
                updateGraveyardZones();
                resolve();
            }
        });
    },

    /**
     * Update 3D Deck Stack Visual Heights & Badges
     */
    updateDeckVisuals: function() {
        var playerDeckCount = (GameState && GameState.player && GameState.player.deck) ? GameState.player.deck.length : (typeof deck !== 'undefined' && deck ? deck.length : 40);
        var computerDeckCount = (GameState && GameState.computer && GameState.computer.deck) ? GameState.computer.deck.length : 40;

        $('#player-deck-overhead-count').text(playerDeckCount);
        $('#computer-deck-overhead-count').text(computerDeckCount);

        // Adjust player stack layers based on remaining deck count
        if (playerDeckCount < 20) {
            $('#player-deck-zone .deck-layer-3').css('opacity', '0');
        } else {
            $('#player-deck-zone .deck-layer-3').css('opacity', '1');
        }

        if (playerDeckCount < 10) {
            $('#player-deck-zone .deck-layer-2').css('opacity', '0');
        } else {
            $('#player-deck-zone .deck-layer-2').css('opacity', '1');
        }

        if (playerDeckCount === 0) {
            $('#player-deck-zone .deck-layer-1, #player-deck-zone .deck-stack-top').css('opacity', '0');
        } else {
            $('#player-deck-zone .deck-layer-1, #player-deck-zone .deck-stack-top').css('opacity', '1');
        }

        // Adjust computer stack layers based on remaining deck count
        if (computerDeckCount < 20) {
            $('#computer-deck-zone .deck-layer-3').css('opacity', '0');
        } else {
            $('#computer-deck-zone .deck-layer-3').css('opacity', '1');
        }

        if (computerDeckCount < 10) {
            $('#computer-deck-zone .deck-layer-2').css('opacity', '0');
        } else {
            $('#computer-deck-zone .deck-layer-2').css('opacity', '1');
        }

        if (computerDeckCount === 0) {
            $('#computer-deck-zone .deck-layer-1, #computer-deck-zone .deck-stack-top').css('opacity', '0');
        } else {
            $('#computer-deck-zone .deck-layer-1, #computer-deck-zone .deck-stack-top').css('opacity', '1');
        }
    }
};
