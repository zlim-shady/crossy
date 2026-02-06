// ===== CONSTANTS =====
const CELL_SIZE = 40;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const COLS = CANVAS_WIDTH / CELL_SIZE; // 20
const ROWS = CANVAS_HEIGHT / CELL_SIZE; // 15

const COLORS = {
    road: '#555',
    roadStripe: '#666',
    car: '#e74c3c',
    chicken: '#f1c40f',
    chickenOutline: '#f39c12'
};

const GameState = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    GAME_OVER: 'GAME_OVER',
    LEADERBOARD: 'LEADERBOARD',
    NAME_INPUT: 'NAME_INPUT'
};

const DEBUG_HITBOXES = false; // Set to true to visualize collision boxes

const LEADERBOARD_STORAGE_KEY = 'invertedCrossyRoadLeaderboard';

// ===== GAME STATE VARIABLES =====
let canvas, ctx;
let currentState = GameState.MENU;
let previousState = GameState.MENU; // For returning from leaderboard

// Leaderboard data
let leaderboard = [];
let playerNameInput = '';
let playerRank = 0;

// Chicken sprite image
let chickenSprite = new Image();
chickenSprite.src = 'assets/chickens.png';
let chickenSpriteLoaded = false;
chickenSprite.onload = () => { chickenSpriteLoaded = true; };

// Car sprite images
let carFrontSprite = new Image();
carFrontSprite.src = 'assets/car-front.png';
let carFrontSpriteLoaded = false;
carFrontSprite.onload = () => { carFrontSpriteLoaded = true; };

let carRearSprite = new Image();
carRearSprite.src = 'assets/car-rear.png';
let carRearSpriteLoaded = false;
carRearSprite.onload = () => { carRearSpriteLoaded = true; };

let carSideSprite = new Image();
carSideSprite.src = 'assets/car-side.png';
let carSideSpriteLoaded = false;
carSideSprite.onload = () => { carSideSpriteLoaded = true; };
let lastTimestamp = 0;
let lastMoveTime = 0;
const MOVE_COOLDOWN = 200; // ms

let car = {
    x: 9,           // column (0-19)
    targetX: 9,     // target column for smooth animation
    y: 7,           // screen row position (centered for better visibility)
    width: 1,       // cells
    height: 2,      // cells (occupies 2 rows)
    worldY: 0,      // actual position in world space
    targetWorldY: 0, // target world position for smooth animation
    facing: 'up'    // direction car is facing: 'up', 'down', 'left', 'right'
};

let chickens = [];
let roadRows = [];

let score = 0;
let distance = 0;
let gameTime = 0;

let keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false
};

// ===== TOUCH DEVICE DETECTION =====
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ===== RAIN MODE (VIDEO BACKGROUND) =====
let rainMode = false;

// ===== CANVAS SETUP =====
function setupCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Add touch-device class for CSS styling
    if (isTouchDevice) {
        document.body.classList.add('touch-device');
    }
}

// ===== INPUT HANDLERS =====
document.addEventListener('keydown', (e) => {
    // Handle rain mode toggle (R key)
    if (e.code === 'KeyR') {
        e.preventDefault();
        toggleRainMode();
        return;
    }

    // Handle leaderboard shortcut (W key)
    if (e.code === 'KeyW') {
        e.preventDefault();
        handleLeaderboardKey();
        return;
    }

    // Handle ESC or SPACE key for returning from leaderboard
    if (e.code === 'Escape' || (e.code === 'Space' && currentState === GameState.LEADERBOARD)) {
        e.preventDefault();
        if (currentState === GameState.LEADERBOARD) {
            setState(previousState);
        }
        return;
    }

    // Handle name input
    if (currentState === GameState.NAME_INPUT) {
        e.preventDefault();
        handleNameInput(e);
        return;
    }

    if (e.code in keys) {
        e.preventDefault();

        if (e.code === 'Space') {
            handleSpacePress();
        } else {
            keys[e.code] = true;
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code in keys) {
        e.preventDefault();
        keys[e.code] = false;
    }
});

// ===== TOUCH EVENT HANDLERS =====
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

function setupTouchHandlers() {
    if (!isTouchDevice) return;

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Also handle touches on the game message overlay for menu/game over
    const gameMessage = document.getElementById('gameMessage');
    gameMessage.addEventListener('touchstart', handleTouchStart, { passive: false });
    gameMessage.addEventListener('touchend', handleTouchEnd, { passive: false });
}

function handleTouchStart(e) {
    // Allow button/input clicks to work normally
    const target = e.target;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
        return; // Don't prevent default for buttons/inputs
    }
    e.preventDefault();
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
}

function handleTouchMove(e) {
    // Allow input interactions to work normally
    const target = e.target;
    if (target.tagName === 'INPUT') {
        return;
    }
    e.preventDefault(); // Prevent scrolling during gameplay
}

function handleTouchEnd(e) {
    // Allow button/input clicks to work normally
    const target = e.target;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
        return; // Don't prevent default for buttons/inputs
    }
    e.preventDefault();
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const deltaTime = Date.now() - touchStartTime;
    const threshold = 30; // Minimum swipe distance in pixels

    // Determine if it's a tap or swipe
    const isTap = Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold;

    if (isTap) {
        // Check if tap was outside message content box (for leaderboard dismiss)
        if (currentState === GameState.LEADERBOARD) {
            const messageContent = document.querySelector('.message-content');
            if (messageContent) {
                const rect = messageContent.getBoundingClientRect();
                const tapX = touch.clientX;
                const tapY = touch.clientY;
                // If tap is outside the content box, go back
                if (tapX < rect.left || tapX > rect.right || tapY < rect.top || tapY > rect.bottom) {
                    setState(previousState);
                    return;
                }
            }
        }
        handleTap();
    } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > 0) {
            handleSwipeRight();
        } else {
            handleSwipeLeft();
        }
    } else {
        // Vertical swipe
        if (deltaY > 0) {
            handleSwipeDown();
        } else {
            handleSwipeUp();
        }
    }
}

function handleTap() {
    if (currentState === GameState.MENU || currentState === GameState.GAME_OVER) {
        // Start or restart game
        handleSpacePress();
    } else if (currentState === GameState.PLAYING) {
        // Move forward
        simulateKeyPress('ArrowUp');
    } else if (currentState === GameState.LEADERBOARD) {
        // Return from leaderboard
        setState(previousState);
    }
}

function handleSwipeUp() {
    if (currentState === GameState.PLAYING) {
        simulateKeyPress('ArrowUp');
    }
}

function handleSwipeDown() {
    if (currentState === GameState.PLAYING) {
        simulateKeyPress('ArrowDown');
    }
}

function handleSwipeLeft() {
    if (currentState === GameState.PLAYING) {
        simulateKeyPress('ArrowLeft');
    }
}

function handleSwipeRight() {
    if (currentState === GameState.PLAYING) {
        simulateKeyPress('ArrowRight');
    }
}

function simulateKeyPress(keyCode) {
    const currentTime = Date.now();
    if (currentTime - lastMoveTime > MOVE_COOLDOWN) {
        // Temporarily set key as pressed to trigger movement in update()
        keys[keyCode] = true;
        // Reset after a short delay
        setTimeout(() => {
            keys[keyCode] = false;
        }, 50);
    }
}

// Touch keyboard handlers for name input
function handleTouchKeyPress(letter) {
    if (currentState === GameState.NAME_INPUT && playerNameInput.length < 3) {
        playerNameInput += letter;
        updateNameInputDisplay();
    }
}

function handleTouchBackspace() {
    if (currentState === GameState.NAME_INPUT && playerNameInput.length > 0) {
        playerNameInput = playerNameInput.slice(0, -1);
        updateNameInputDisplay();
    }
}

function handleTouchEnter() {
    if (currentState === GameState.NAME_INPUT && playerNameInput.length === 3) {
        insertHighScore(playerNameInput, score, playerRank);
        playerNameInput = '';
        setState(GameState.LEADERBOARD);
    }
}

// ===== RAIN MODE TOGGLE =====
function toggleRainMode() {
    rainMode = !rainMode;
    const video = document.getElementById('bg-video');

    if (rainMode) {
        document.body.classList.add('rain-mode');
        video.play();
    } else {
        document.body.classList.remove('rain-mode');
        video.pause();
    }

    // Update menu display if currently on menu
    if (currentState === GameState.MENU) {
        setState(GameState.MENU);
    }
}

function handleSpacePress() {
    if (currentState === GameState.MENU) {
        setState(GameState.PLAYING);
        resetGame();
    } else if (currentState === GameState.GAME_OVER) {
        setState(GameState.MENU);
        setState(GameState.PLAYING);
        resetGame();
    }
}

function handleLeaderboardKey() {
    if (currentState === GameState.MENU || currentState === GameState.GAME_OVER) {
        previousState = currentState;
        setState(GameState.LEADERBOARD);
    } else if (currentState === GameState.LEADERBOARD) {
        setState(previousState);
    }
}

function handleNameInput(e) {
    // Handle letter keys A-Z
    if (e.code.startsWith('Key') && playerNameInput.length < 3) {
        const letter = e.code.replace('Key', '');
        playerNameInput += letter;
        updateNameInputDisplay();
    }

    // Handle backspace
    if (e.code === 'Backspace' && playerNameInput.length > 0) {
        playerNameInput = playerNameInput.slice(0, -1);
        updateNameInputDisplay();
    }

    // Handle enter to confirm (only when 3 chars entered)
    if (e.code === 'Enter' && playerNameInput.length === 3) {
        insertHighScore(playerNameInput, score, playerRank);
        playerNameInput = '';
        setState(GameState.LEADERBOARD);
    }
}

function updateNameInputDisplay() {
    const messageContent = document.querySelector('.message-content');
    if (messageContent) {
        messageContent.innerHTML = renderNameInputHTML();
    }
}

// ===== GAME STATE FUNCTIONS =====
function setState(newState) {
    currentState = newState;
    const messageEl = document.getElementById('gameMessage');
    const messageContent = messageEl.querySelector('.message-content');

    switch (newState) {
        case GameState.MENU:
            messageEl.classList.remove('hidden');
            const rainStatus = rainMode ? 'ON' : 'OFF';
            const rainBtnText = rainMode ? 'STOP RAIN' : 'MAKE IT RAIN';
            if (isTouchDevice) {
                messageContent.innerHTML = `
                    <h1>Inverted Crossy Road</h1>
                    <div class="controls">
                        <p><strong>Tap</strong> Move Forward</p>
                        <p><strong>Swipe ←→</strong> Change Lanes</p>
                        <p><strong>Swipe ↓</strong> Move Backward</p>
                    </div>
                    <div class="menu-buttons-row">
                        <button class="start-btn" onclick="handleSpacePress()">START</button>
                        <button class="icon-btn-square" onclick="handleLeaderboardKey()"><img src="assets/trophy.png" alt="Leaderboard" class="trophy-icon"></button>
                    </div>
                `;
            } else {
                messageContent.innerHTML = `
                    <h1>Inverted Crossy Road</h1>
                    <p>Press <strong>SPACE</strong> to Start</p>
                    <div class="controls">
                        <p><strong>↑↓</strong> Move Forward/Backward</p>
                        <p><strong>←→</strong> Change Lanes</p>
                        <p><strong>R</strong> ${rainBtnText}</p>
                    </div>
                    <button class="leaderboard-btn" onclick="handleLeaderboardKey()">LEADERBOARD (W)</button>
                `;
            }
            break;
        case GameState.PLAYING:
            messageEl.classList.add('hidden');
            break;
        case GameState.GAME_OVER:
            messageEl.classList.remove('hidden');
            if (isTouchDevice) {
                messageContent.innerHTML = `
                    <h1>Game Over!</h1>
                    <p>Final Score: <strong>${score}</strong></p>
                    <p>Distance: <strong>${distance}m</strong></p>
                    <div class="menu-buttons-row">
                        <button class="start-btn" onclick="handleSpacePress()">RESTART</button>
                        <button class="icon-btn-square" onclick="handleLeaderboardKey()"><img src="assets/trophy.png" alt="Leaderboard" class="trophy-icon"></button>
                    </div>
                `;
            } else {
                messageContent.innerHTML = `
                    <h1>Game Over!</h1>
                    <p>Final Score: <strong>${score}</strong></p>
                    <p>Distance: <strong>${distance}m</strong></p>
                    <p style="margin-top: 30px;">Press <strong>SPACE</strong> to Restart</p>
                    <button class="leaderboard-btn" onclick="handleLeaderboardKey()">LEADERBOARD (W)</button>
                `;
            }
            break;
        case GameState.LEADERBOARD:
            messageEl.classList.remove('hidden');
            messageContent.innerHTML = renderLeaderboardHTML();
            break;
        case GameState.NAME_INPUT:
            messageEl.classList.remove('hidden');
            messageContent.innerHTML = renderNameInputHTML();
            // Auto-focus the input on mobile
            if (isTouchDevice) {
                setTimeout(() => {
                    const input = document.getElementById('name-input-field');
                    if (input) input.focus();
                }, 100);
            }
            break;
    }
}

function resetGame() {
    car.x = 9;
    car.targetX = 9;
    car.y = 7;  // More centered (was 12)
    car.worldY = 0;
    car.targetWorldY = 0;
    car.facing = 'up';

    chickens = [];
    roadRows = [];

    score = 0;
    distance = 0;
    gameTime = 0;

    lastMoveTime = 0;

    // Initialize road rows - but spawn chickens across visible range
    for (let i = 0; i < 100; i++) {
        const row = {
            direction: Math.random() < 0.5 ? -1 : 1,
            baseSpeed: 0.5 + Math.random() * 1.0,
            populated: true
        };
        roadRows.push(row);
    }

    // Spawn chickens in the visible range around the car
    // Car at worldY=0, y=7 means visible worldY range is approximately -7 to +7
    for (let worldY = -5; worldY < 20; worldY++) {
        if (worldY === 0 || worldY === 1) continue; // Skip car starting position

        if (Math.random() < 0.7) {
            const numChickens = Math.floor(Math.random() * 3) + 2;
            for (let j = 0; j < numChickens; j++) {
                const randomX = Math.random() * (COLS - 4) + 2;
                const rowIndex = worldY >= 0 ? worldY : 0;
                const direction = roadRows[rowIndex].direction;
                chickens.push({
                    x: randomX,
                    y: worldY,
                    direction: direction,
                    speed: 0.8,
                    width: 1,
                    height: 1
                });
            }
        }
    }

    updateScoreDisplay();
}


function updateScoreDisplay() {
    document.getElementById('score').textContent = score;
    document.getElementById('distance').textContent = distance;
}

// ===== LEADERBOARD FUNCTIONS =====
let useFirebase = false;
let leaderboardRef = null;

function initLeaderboard() {
    // Check if Firebase is available
    if (typeof database !== 'undefined' && database !== null) {
        useFirebase = true;
        leaderboardRef = database.ref('leaderboard');

        // Listen for real-time updates
        leaderboardRef.orderByChild('score').limitToLast(10).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Convert to array and sort by score descending
                const entries = Object.values(data);
                entries.sort((a, b) => b.score - a.score);

                // Update leaderboard with Firebase data
                leaderboard = entries.slice(0, 10).map((entry, index) => ({
                    rank: index + 1,
                    name: entry.name,
                    score: entry.score
                }));

                // Pad to 10 entries if needed
                while (leaderboard.length < 10) {
                    leaderboard.push({ rank: leaderboard.length + 1, name: '---', score: 0 });
                }
            } else {
                // Initialize with blank entries
                initBlankLeaderboard();
            }

            // Update display if currently viewing leaderboard
            if (currentState === GameState.LEADERBOARD) {
                const messageContent = document.querySelector('.message-content');
                if (messageContent) {
                    messageContent.innerHTML = renderLeaderboardHTML();
                }
            }
        });

        console.log('Leaderboard using Firebase (shared/global)');
    } else {
        // Fallback to localStorage
        useFirebase = false;
        const saved = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
        if (saved) {
            leaderboard = JSON.parse(saved);
        } else {
            initBlankLeaderboard();
        }
        console.log('Leaderboard using localStorage (local only)');
    }
}

function initBlankLeaderboard() {
    leaderboard = [];
    for (let i = 0; i < 10; i++) {
        leaderboard.push({ rank: i + 1, name: '---', score: 0 });
    }
}

function saveLeaderboard() {
    if (!useFirebase) {
        localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard));
    }
    // Firebase saves are handled in insertHighScore
}

function checkHighScore(playerScore) {
    // Check if score qualifies for top 10
    for (let i = 0; i < leaderboard.length; i++) {
        if (playerScore > leaderboard[i].score) {
            return i + 1; // Return rank (1-10)
        }
    }
    return 0; // Not in top 10
}

function insertHighScore(name, playerScore, rank) {
    const newEntry = { name: name.toUpperCase(), score: playerScore };

    if (useFirebase && leaderboardRef) {
        // Push to Firebase - the real-time listener will update local leaderboard
        leaderboardRef.push(newEntry)
            .then(() => {
                console.log('Score saved to Firebase');
                // Clean up old entries if more than 10
                pruneLeaderboard();
            })
            .catch((error) => {
                console.error('Error saving to Firebase:', error);
                // Fallback to local save
                insertHighScoreLocal(name, playerScore, rank);
            });
    } else {
        insertHighScoreLocal(name, playerScore, rank);
    }
}

function insertHighScoreLocal(name, playerScore, rank) {
    // Insert new score at the correct position
    const newEntry = { rank: rank, name: name.toUpperCase(), score: playerScore };
    leaderboard.splice(rank - 1, 0, newEntry);

    // Keep only top 10
    leaderboard = leaderboard.slice(0, 10);

    // Update ranks
    for (let i = 0; i < leaderboard.length; i++) {
        leaderboard[i].rank = i + 1;
    }

    localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard));
}

function pruneLeaderboard() {
    if (!useFirebase || !leaderboardRef) return;

    // Get all entries and remove those beyond top 10
    leaderboardRef.orderByChild('score').once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        const entries = Object.entries(data);
        if (entries.length <= 10) return;

        // Sort by score ascending (lowest first)
        entries.sort((a, b) => a[1].score - b[1].score);

        // Remove entries beyond top 10
        const toRemove = entries.slice(0, entries.length - 10);
        toRemove.forEach(([key]) => {
            leaderboardRef.child(key).remove();
        });
    });
}

function formatScoreWithDots(score, totalWidth) {
    const scoreStr = score.toString();
    const dotsNeeded = totalWidth - scoreStr.length;
    return '.'.repeat(Math.max(0, dotsNeeded)) + scoreStr;
}

function renderLeaderboardHTML() {
    let html = '<div class="leaderboard-container">';
    html += '<h1>HIGH SCORES</h1>';
    if (useFirebase) {
        html += '<p class="leaderboard-type">GLOBAL LEADERBOARD</p>';
    } else {
        html += '<p class="leaderboard-type">LOCAL SCORES</p>';
    }

    if (isTouchDevice) {
        // Two-column layout for mobile
        html += '<div class="leaderboard-columns">';
        html += '<div class="leaderboard-list">';
        for (let i = 0; i < 5; i++) {
            const entry = leaderboard[i];
            const rankStr = entry.rank.toString();
            html += `<div class="leaderboard-entry">
                <span class="rank">${rankStr}.</span>
                <span class="name">${entry.name}</span>
                <span class="score">${entry.score}</span>
            </div>`;
        }
        html += '</div>';
        html += '<div class="leaderboard-list">';
        for (let i = 5; i < 10; i++) {
            const entry = leaderboard[i];
            const rankStr = entry.rank.toString();
            html += `<div class="leaderboard-entry">
                <span class="rank">${rankStr}.</span>
                <span class="name">${entry.name}</span>
                <span class="score">${entry.score}</span>
            </div>`;
        }
        html += '</div>';
        html += '</div>';
        html += '<p class="leaderboard-hint">Tap outside to go back</p>';
    } else {
        html += '<div class="leaderboard-list">';
        for (const entry of leaderboard) {
            const rankStr = entry.rank.toString().padStart(2, ' ');
            const scoreFormatted = formatScoreWithDots(entry.score, 8);
            html += `<div class="leaderboard-entry">
                <span class="rank">${rankStr}.</span>
                <span class="name">${entry.name}</span>
                <span class="dots">${scoreFormatted}</span>
            </div>`;
        }
        html += '</div>';
        html += '<p class="leaderboard-hint">Press <strong>SPACE</strong>, <strong>W</strong>, or <strong>ESC</strong> to go back</p>';
    }
    html += '</div>';
    return html;
}

function renderNameInputHTML() {
    const displayName = playerNameInput.padEnd(3, '_').split('').join(' ');
    let html = '<div class="name-input-container">';
    html += '<h1>NEW HIGH SCORE!</h1>';
    html += `<p class="your-score">YOUR SCORE: <strong>${score}</strong></p>`;
    html += `<p class="your-rank">RANK: <strong>#${playerRank}</strong></p>`;
    html += '<p class="enter-initials">ENTER YOUR INITIALS:</p>';

    if (isTouchDevice) {
        // Use native input for mobile keyboard
        html += `<input type="text" id="name-input-field" class="name-input-native" maxlength="3" autocomplete="off" autocapitalize="characters" pattern="[A-Za-z]*" value="${playerNameInput}" placeholder="___">`;
        html += `<button class="leaderboard-btn submit-btn" onclick="submitMobileName()">SUBMIT</button>`;
    } else {
        html += `<div class="name-input">[ <span class="name-chars">${displayName}</span> ]</div>`;
        if (playerNameInput.length < 3) {
            html += '<p class="input-hint">Type A-Z</p>';
        } else {
            html += '<p class="input-hint">Press <strong>ENTER</strong> to confirm</p>';
        }
    }

    html += '</div>';
    return html;
}

function submitMobileName() {
    const input = document.getElementById('name-input-field');
    if (input) {
        const name = input.value.toUpperCase().replace(/[^A-Z]/g, '');
        if (name.length === 3) {
            insertHighScore(name, score, playerRank);
            playerNameInput = '';
            setState(GameState.LEADERBOARD);
        } else {
            // Shake or indicate error - need 3 letters
            input.focus();
        }
    }
}

// ===== SPAWN FUNCTIONS =====
// Chickens are now pre-populated, no dynamic spawning needed

function getDifficultyMultiplier() {
    return 1 + (distance / 100);
}

// ===== UPDATE FUNCTIONS =====
function update(deltaTime) {
    const dt = deltaTime / 1000; // Convert to seconds
    const currentTime = Date.now();

    // Update game time and score
    gameTime += dt;
    score = Math.floor(distance * 10 + gameTime);
    updateScoreDisplay();

    // Handle car movement input
    if (currentTime - lastMoveTime > MOVE_COOLDOWN) {
        let moved = false;

        if (keys.ArrowUp) {
            car.targetWorldY += 1;
            distance = Math.max(distance, Math.floor(car.targetWorldY));
            car.facing = 'up';
            moved = true;
        }

        if (keys.ArrowDown && car.targetWorldY > 0) {
            car.targetWorldY -= 1;
            car.facing = 'down';
            moved = true;
        }

        if (keys.ArrowLeft && car.targetX > 0) {
            car.targetX -= 1;
            car.facing = 'left';
            moved = true;
        }

        if (keys.ArrowRight && car.targetX < COLS - 1) {
            car.targetX += 1;
            car.facing = 'right';
            moved = true;
        }

        if (moved) {
            lastMoveTime = currentTime;
        }
    }

    // Smooth animation for car position
    const lerpSpeed = 8; // Higher = faster interpolation
    car.x += (car.targetX - car.x) * lerpSpeed * dt;
    car.worldY += (car.targetWorldY - car.worldY) * lerpSpeed * dt;

    // Update chickens
    updateChickens(dt);

    // Cull off-screen chickens
    cullChickens();

    // Generate new rows and chickens ahead as player moves forward
    const furthestRow = Math.floor(car.targetWorldY) + 15;
    const existingChickensMaxY = chickens.length > 0 ? Math.max(...chickens.map(c => c.y)) : 0;

    if (furthestRow > existingChickensMaxY) {
        for (let worldY = existingChickensMaxY + 1; worldY <= furthestRow; worldY++) {
            // Ensure roadRows array is large enough
            while (roadRows.length <= worldY) {
                roadRows.push({
                    direction: Math.random() < 0.5 ? -1 : 1,
                    baseSpeed: 0.5 + Math.random() * 1.0
                });
            }

            // Spawn chickens on this row
            if (Math.random() < 0.7) {
                const numChickens = Math.floor(Math.random() * 3) + 2;
                for (let j = 0; j < numChickens; j++) {
                    const randomX = Math.random() * (COLS - 4) + 2;
                    const rowIndex = Math.max(0, worldY);
                    chickens.push({
                        x: randomX,
                        y: worldY,
                        direction: roadRows[rowIndex].direction,
                        speed: roadRows[rowIndex].baseSpeed,
                        width: 1,
                        height: 1
                    });
                }
            }
        }
    }
}

function updateChickens(dt) {
    chickens.forEach(chicken => {
        chicken.x += chicken.direction * chicken.speed * dt;
    });

    // Continuously spawn new chickens from off-screen on visible rows
    spawnOffscreenChickens(dt);
}

let spawnTimer = 0;
const SPAWN_INTERVAL = 0.8; // Spawn check every 0.8 seconds

function spawnOffscreenChickens(dt) {
    spawnTimer += dt;

    if (spawnTimer < SPAWN_INTERVAL) return;
    spawnTimer = 0;

    // Get visible row range
    const visibleRowStart = Math.floor(car.worldY) - 10;
    const visibleRowEnd = Math.floor(car.worldY) + 15;

    // Check each visible row for spawning
    for (let worldY = visibleRowStart; worldY <= visibleRowEnd; worldY++) {
        if (worldY < 0) continue;

        // Ensure roadRows exists for this row
        while (roadRows.length <= worldY) {
            roadRows.push({
                direction: Math.random() < 0.5 ? -1 : 1,
                baseSpeed: 0.5 + Math.random() * 1.0
            });
        }

        const row = roadRows[worldY];

        // Count chickens currently on this row
        const chickensOnRow = chickens.filter(c => c.y === worldY).length;

        // Spawn if row has few chickens (random chance)
        if (chickensOnRow < 2 && Math.random() < 0.3) {
            // Spawn from the edge based on direction
            // If moving right (direction 1), spawn from left edge
            // If moving left (direction -1), spawn from right edge
            const spawnX = row.direction > 0 ? -1.5 : COLS + 1.5;

            chickens.push({
                x: spawnX,
                y: worldY,
                direction: row.direction,
                speed: row.baseSpeed,
                width: 1,
                height: 1
            });
        }
    }
}

function cullChickens() {
    const visibleRowStart = Math.floor(car.worldY) - 20;
    const visibleRowEnd = Math.floor(car.worldY) + 5;

    chickens = chickens.filter(chicken => {
        // Remove if off screen horizontally
        if (chicken.x < -2 || chicken.x > COLS + 2) return false;

        // Remove if too far from visible area
        if (chicken.y < visibleRowStart - 5 || chicken.y > visibleRowEnd + 5) return false;

        return true;
    });
}

// ===== COLLISION DETECTION =====
function checkCollisions() {
    if (DEBUG_HITBOXES) {
        // Calculate car bounds for logging
        const carCenterY = car.worldY + 1.0; // Always at sprite center
        const carHeight = (car.facing === 'left' || car.facing === 'right') ? 0.6 : 1.6;
        const carFrontY = carCenterY + carHeight / 2;
        const carBackY = carCenterY - carHeight / 2;

        // Log car and nearby chickens for debugging
        const nearbyChickens = chickens.filter(c => {
            const dy = Math.abs(carCenterY - (c.y + 0.5));
            const dx = Math.abs((car.x + 0.5) - (c.x + 0.5));
            return dy < 2 && dx < 2;
        });

        if (nearbyChickens.length > 0) {
            console.log(`Car: x=${car.x.toFixed(2)}, worldY=${car.worldY.toFixed(2)}, Front=${carFrontY.toFixed(2)}, Back=${carBackY.toFixed(2)}, facing=${car.facing}`);
            nearbyChickens.forEach(c => {
                const cFront = c.y + 0.5 + 0.35;
                const cBack = c.y + 0.5 - 0.35;
                console.log(`  Nearby chicken: x=${c.x.toFixed(2)}, y=${c.y}, Front=${cFront.toFixed(2)}, Back=${cBack.toFixed(2)}`);
            });
        }
    }

    for (let chicken of chickens) {
        if (checkCollision(car, chicken)) {
            return true;
        }
    }
    return false;
}

function checkCollision(car, chicken) {
    // CAR COLLISION BOX IN WORLD COORDINATES
    // Always centered at the sprite position
    const carCenterX = car.x + 0.5;
    const carCenterY = car.worldY + 1.0; // Center of car sprite (2 cells tall)

    // Car dimensions - swap when rotated
    let carWidth, carHeight;
    if (car.facing === 'left' || car.facing === 'right') {
        // Horizontal: wide and short
        carWidth = 1.6;
        carHeight = 0.6;
    } else {
        // Vertical: narrow and tall
        carWidth = 0.6;
        carHeight = 1.6;
    }

    const halfCarWidth = carWidth / 2;
    const halfCarHeight = carHeight / 2;

    // Car bounding box edges
    const carFrontY = carCenterY + halfCarHeight;  // Top edge (ahead)
    const carBackY = carCenterY - halfCarHeight;   // Bottom edge (behind)
    const carLeftX = carCenterX - halfCarWidth;
    const carRightX = carCenterX + halfCarWidth;

    // CHICKEN COLLISION CIRCLE IN WORLD COORDINATES
    // Chicken position: chicken.x (left edge), chicken.y (bottom edge)
    // Chicken is 1 cell, centered at x + 0.5, y + 0.5
    const chickenCenterX = chicken.x + 0.5;
    const chickenCenterY = chicken.y + 0.5;
    const chickenRadius = 0.35;

    const chickenFrontY = chickenCenterY + chickenRadius;
    const chickenBackY = chickenCenterY - chickenRadius;
    const chickenLeftX = chickenCenterX - chickenRadius;
    const chickenRightX = chickenCenterX + chickenRadius;

    // Calculate distance between centers
    const dx = Math.abs(carCenterX - chickenCenterX);
    const dy = Math.abs(carCenterY - chickenCenterY);

    // Rectangle-circle collision:
    // If chicken center is beyond car box + radius, no collision
    if (dx > halfCarWidth + chickenRadius) return false;
    if (dy > halfCarHeight + chickenRadius) return false;

    // If chicken center is within car box, definitely collision
    if (dx <= halfCarWidth) {
        if (dy <= halfCarHeight + chickenRadius) {
            if (DEBUG_HITBOXES) {
                console.log(`COLLISION! Car(${car.facing}): Front=${carFrontY.toFixed(1)} Back=${carBackY.toFixed(1)}, Chicken: Front=${chickenFrontY.toFixed(1)} Back=${chickenBackY.toFixed(1)}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);
            }
            return true;
        }
    }
    if (dy <= halfCarHeight) {
        if (dx <= halfCarWidth + chickenRadius) {
            if (DEBUG_HITBOXES) {
                console.log(`COLLISION! Car(${car.facing}): Front=${carFrontY.toFixed(1)} Back=${carBackY.toFixed(1)}, Chicken: Front=${chickenFrontY.toFixed(1)} Back=${chickenBackY.toFixed(1)}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);
            }
            return true;
        }
    }

    // Check corner collision (circle vs rectangle corner)
    const cornerDx = dx - halfCarWidth;
    const cornerDy = dy - halfCarHeight;
    if (cornerDx * cornerDx + cornerDy * cornerDy <= chickenRadius * chickenRadius) {
        if (DEBUG_HITBOXES) {
            console.log(`COLLISION (corner)! Car(${car.facing}): Front=${carFrontY.toFixed(1)} Back=${carBackY.toFixed(1)}, Chicken: Front=${chickenFrontY.toFixed(1)} Back=${chickenBackY.toFixed(1)}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);
        }
        return true;
    }

    return false;
}

function boxesIntersect(box1, box2) {
    return box1.x < box2.x + box2.width &&
           box1.x + box1.width > box2.x &&
           box1.y < box2.y + box2.height &&
           box1.y + box1.height > box2.y;
}

// ===== RENDER FUNCTIONS =====
function renderDebugHitboxes() {
    const offsetY = (car.worldY % 1) * CELL_SIZE;

    // Draw car hitbox - dimensions change based on facing, but center stays same
    let carWidth, carHeight;
    if (car.facing === 'left' || car.facing === 'right') {
        carWidth = 1.6;
        carHeight = 0.6;
    } else {
        carWidth = 0.6;
        carHeight = 1.6;
    }
    const carWorldCenterY = car.worldY + 1.0; // Always at sprite center

    // Car SPRITE is always at FIXED screen position
    const screenX = car.x * CELL_SIZE;
    const screenY = car.y * CELL_SIZE;

    // Car sprite center in screen coordinates (car sprite is 2 cells tall)
    const carSpriteScreenCenterX = screenX + CELL_SIZE / 2;
    const carSpriteScreenCenterY = screenY + CELL_SIZE; // Center of 2-cell sprite

    // For collision hitbox visualization:
    // Vertical: hitbox matches sprite (centered at sprite center)
    // Horizontal: hitbox is wide/short, but still centered at sprite center
    const carScreenCenterX = carSpriteScreenCenterX;
    const carScreenCenterY = carSpriteScreenCenterY;

    // Draw car collision box centered on sprite
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(
        carScreenCenterX - (carWidth * CELL_SIZE / 2),
        carScreenCenterY - (carHeight * CELL_SIZE / 2),
        carWidth * CELL_SIZE,
        carHeight * CELL_SIZE
    );

    // Draw car center point
    ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
    ctx.beginPath();
    ctx.arc(carScreenCenterX, carScreenCenterY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Calculate car front and back Y in WORLD coordinates
    const carWorldCenterX = car.x + 0.5;
    const halfCarHeight = carHeight / 2;
    const carFrontY = carWorldCenterY + halfCarHeight; // Top edge (ahead)
    const carBackY = carWorldCenterY - halfCarHeight;  // Bottom edge (behind)

    // Draw car info text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '12px monospace';
    const facingLabel = car.facing === 'left' || car.facing === 'right' ? ' (HORIZONTAL)' : '';
    const sizeLabel = car.facing === 'left' || car.facing === 'right' ? ' 1.6x0.6' : ' 0.6x1.6';
    ctx.fillText(`Car: x=${car.x.toFixed(1)}, wY=${car.worldY.toFixed(1)}${facingLabel}${sizeLabel}`, carScreenCenterX + 30, carScreenCenterY - 24);
    ctx.fillText(`World Center: (${carWorldCenterX.toFixed(1)}, ${carWorldCenterY.toFixed(1)})`, carScreenCenterX + 30, carScreenCenterY - 12);
    ctx.fillText(`Screen Center: (${(carScreenCenterX/CELL_SIZE).toFixed(1)}, ${(carScreenCenterY/CELL_SIZE).toFixed(1)})`, carScreenCenterX + 30, carScreenCenterY);
    ctx.fillText(`Front Y: ${carFrontY.toFixed(1)} | Back Y: ${carBackY.toFixed(1)}`, carScreenCenterX + 30, carScreenCenterY + 12);

    // Draw chicken hitboxes - match EXACT sprite rendering (no offsetY to avoid discontinuity, +CELL_SIZE to align with car collision)
    chickens.forEach(chicken => {
        const relativeRow = chicken.y - car.worldY;
        const screenY = (car.y - relativeRow) * CELL_SIZE + CELL_SIZE;

        if (screenY > -CELL_SIZE && screenY < CANVAS_HEIGHT) {
            const chickenRadius = 0.35; // Match collision detection
            // Use EXACT same calculation as sprite rendering
            const centerX = chicken.x * CELL_SIZE + CELL_SIZE / 2;
            const centerY = screenY + CELL_SIZE / 2;

            // Draw chicken collision circle
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, chickenRadius * CELL_SIZE, 0, Math.PI * 2);
            ctx.stroke();

            // Draw chicken center point
            ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
            ctx.fill();

            // Draw chicken position text
            const chickenWorldCenterX = chicken.x + 0.5;
            const chickenWorldCenterY = chicken.y + 0.5;
            const chickenFrontY = chickenWorldCenterY + chickenRadius;
            const chickenBackY = chickenWorldCenterY - chickenRadius;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = '10px monospace';
            ctx.fillText(`x=${chicken.x.toFixed(1)}, y=${chicken.y}`, centerX + 20, centerY - 5);
            ctx.fillText(`C:(${chickenWorldCenterX.toFixed(1)},${chickenWorldCenterY.toFixed(1)})`, centerX + 20, centerY + 5);
            ctx.fillText(`F:${chickenFrontY.toFixed(1)} B:${chickenBackY.toFixed(1)}`, centerX + 20, centerY + 15);
        }
    });
}

function render() {
    // Clear canvas
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Render road
    renderRoad();

    // Render chickens
    renderChickens();

    // Render car
    renderCar();

    // Debug: Render hitboxes
    if (DEBUG_HITBOXES && currentState === GameState.PLAYING) {
        renderDebugHitboxes();
    }
}

function renderRoad() {
    // Use same offset calculation as chickens for consistent scrolling
    const offsetY = (car.worldY % 1) * CELL_SIZE;

    for (let screenRow = 0; screenRow <= ROWS; screenRow++) {
        // Calculate which world row this screen row represents
        const relativeRow = car.y - screenRow;
        const worldRow = Math.floor(car.worldY + relativeRow);
        // Apply offset same way as chickens, plus CELL_SIZE to align with car collision center
        const screenY = screenRow * CELL_SIZE + offsetY + CELL_SIZE;

        // Alternate stripe pattern
        if (worldRow % 2 === 0) {
            ctx.fillStyle = COLORS.roadStripe;
            ctx.fillRect(0, screenY, CANVAS_WIDTH, CELL_SIZE);
        }

        // Draw lane dividers (smooth scrolling)
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(CANVAS_WIDTH, screenY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function renderChickens() {
    if (!chickenSpriteLoaded) return;

    // The sprite has two chickens with whitespace
    // Left chicken (faces right): roughly 14%-37% of image width
    // Right chicken (faces left): roughly 57%-80% of image width
    // Vertical: chickens are in roughly 28%-85% of height

    const imgW = chickenSprite.width;
    const imgH = chickenSprite.height;

    // Crop coordinates for each chicken (percentage-based, tighter crop)
    const leftChicken = {
        x: imgW * 0.14,
        y: imgH * 0.28,
        w: imgW * 0.23,
        h: imgH * 0.57
    };

    const rightChicken = {
        x: imgW * 0.57,
        y: imgH * 0.28,
        w: imgW * 0.23,
        h: imgH * 0.57
    };

    // Calculate aspect ratio from sprite (width / height)
    const aspectRatio = leftChicken.w / leftChicken.h;

    // Render height is 60% larger than a full cell
    const renderHeight = CELL_SIZE * 0.92 * 1.6;
    const renderWidth = renderHeight * aspectRatio;

    chickens.forEach(chicken => {
        // Calculate screen position
        const relativeRow = chicken.y - car.worldY;
        const screenY = (car.y - relativeRow) * CELL_SIZE + CELL_SIZE;

        // Only render if on screen
        if (screenY > -CELL_SIZE * 1.5 && screenY < CANVAS_HEIGHT + CELL_SIZE) {
            const centerX = chicken.x * CELL_SIZE + CELL_SIZE / 2;
            const centerY = screenY + CELL_SIZE / 2;

            // Hobble animation based on position (creates walking cycle)
            const walkCycle = (chicken.x * 3) % 1;
            const bobAmount = Math.sin(walkCycle * Math.PI * 2) * 3;

            // Select sprite based on direction
            // Left chicken = facing right (direction > 0)
            // Right chicken = facing left (direction < 0)
            const sprite = chicken.direction > 0 ? leftChicken : rightChicken;

            // Draw the chicken sprite maintaining aspect ratio
            ctx.drawImage(
                chickenSprite,
                sprite.x, sprite.y, sprite.w, sprite.h,  // Source rectangle (cropped)
                centerX - renderWidth / 2,
                centerY - renderHeight / 2 + bobAmount,
                renderWidth,
                renderHeight  // Destination with correct aspect ratio
            );
        }
    });
}


function renderCar() {
    const screenY = car.y * CELL_SIZE;
    const screenX = car.x * CELL_SIZE;
    const centerX = screenX + CELL_SIZE / 2;
    const centerY = screenY + CELL_SIZE;

    ctx.save();
    ctx.translate(centerX, centerY);

    if (car.facing === 'up') {
        drawCarRearSprite(ctx, CELL_SIZE);
    } else if (car.facing === 'down') {
        drawCarFrontSprite(ctx, CELL_SIZE);
    } else if (car.facing === 'left') {
        drawCarSideSprite(ctx, CELL_SIZE, false);
    } else if (car.facing === 'right') {
        drawCarSideSprite(ctx, CELL_SIZE, true);
    }

    ctx.restore();
}

function drawCarFrontSprite(ctx, cellSize) {
    if (!carFrontSpriteLoaded) {
        drawCarFrontView(ctx, cellSize);
        return;
    }

    const imgW = carFrontSprite.width;
    const imgH = carFrontSprite.height;

    // Crop out whitespace - adjusted to not cut off top
    const cropX = imgW * 0.28;
    const cropY = imgH * 0.08;
    const cropW = imgW * 0.44;
    const cropH = imgH * 0.84;

    // Calculate aspect ratio
    const aspectRatio = cropW / cropH;

    // Car should be 2 cells tall
    const renderHeight = cellSize * 2;
    const renderWidth = renderHeight * aspectRatio;

    // Draw centered at origin (we're already translated)
    ctx.drawImage(
        carFrontSprite,
        cropX, cropY, cropW, cropH,
        -renderWidth / 2,
        -renderHeight / 2,
        renderWidth,
        renderHeight
    );
}

function drawCarRearSprite(ctx, cellSize) {
    if (!carRearSpriteLoaded) {
        drawCarRearView(ctx, cellSize);
        return;
    }

    const imgW = carRearSprite.width;
    const imgH = carRearSprite.height;

    // Crop out whitespace - adjusted to not cut off top
    const cropX = imgW * 0.28;
    const cropY = imgH * 0.08;
    const cropW = imgW * 0.44;
    const cropH = imgH * 0.84;

    // Calculate aspect ratio
    const aspectRatio = cropW / cropH;

    // Car should be 2 cells tall
    const renderHeight = cellSize * 2;
    const renderWidth = renderHeight * aspectRatio;

    // Draw centered at origin (we're already translated)
    ctx.drawImage(
        carRearSprite,
        cropX, cropY, cropW, cropH,
        -renderWidth / 2,
        -renderHeight / 2,
        renderWidth,
        renderHeight
    );
}

function drawCarSideSprite(ctx, cellSize, facingRight) {
    if (!carSideSpriteLoaded) {
        drawCarSideView(ctx, cellSize, facingRight);
        return;
    }

    const imgW = carSideSprite.width;
    const imgH = carSideSprite.height;

    // Crop out whitespace - top-down horizontal car view
    const cropX = imgW * 0.18;
    const cropY = imgH * 0.25;
    const cropW = imgW * 0.64;
    const cropH = imgH * 0.50;

    // Calculate aspect ratio of the horizontal sprite
    const aspectRatio = cropW / cropH;

    // Height is 1.25 cells, width based on aspect ratio (reduced by 10%)
    const renderHeight = cellSize * 1.25;
    const renderWidth = renderHeight * aspectRatio * 0.9;

    // Mirror horizontally for facing right
    if (facingRight) {
        ctx.scale(-1, 1);
    }

    // Draw centered at origin
    ctx.drawImage(
        carSideSprite,
        cropX, cropY, cropW, cropH,
        -renderWidth / 2,
        -renderHeight / 2,
        renderWidth,
        renderHeight
    );

    // Reset scale if we flipped
    if (facingRight) {
        ctx.scale(-1, 1);
    }
}

function drawCarRearView(ctx, cellSize) {
    const w = cellSize * 0.9;
    const h = cellSize * 2 - 6;
    const hw = w / 2;
    const hh = h / 2;

    // Shadow - ellipse underneath
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, hh + 2, hw + 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main body - smooth teardrop shape
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    // Start at front tip (top)
    ctx.moveTo(0, -hh);
    // Front curves outward
    ctx.bezierCurveTo(-hw * 0.6, -hh + 5, -hw, -hh + 25, -hw, -hh * 0.3);
    // Side goes to rear
    ctx.bezierCurveTo(-hw - 3, hh * 0.3, -hw, hh - 8, -hw + 5, hh);
    // Rear curve (bottom)
    ctx.quadraticCurveTo(0, hh + 8, hw - 5, hh);
    // Right side curves back
    ctx.bezierCurveTo(hw, hh - 8, hw + 3, hh * 0.3, hw, -hh * 0.3);
    // Right front curves to tip
    ctx.bezierCurveTo(hw, -hh + 25, hw * 0.6, -hh + 5, 0, -hh);
    ctx.closePath();
    ctx.fill();

    // Body edge highlight (left)
    ctx.strokeStyle = '#EF5350';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hw + 3, -hh + 30);
    ctx.bezierCurveTo(-hw + 1, -hh * 0.2, -hw + 1, hh * 0.2, -hw + 5, hh - 15);
    ctx.stroke();

    // Body shadow line (right)
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hw - 3, -hh + 30);
    ctx.bezierCurveTo(hw - 1, -hh * 0.2, hw - 1, hh * 0.2, hw - 5, hh - 15);
    ctx.stroke();

    // Rear windshield + cabin glass (large dark area)
    ctx.fillStyle = '#1E2832';
    ctx.beginPath();
    ctx.moveTo(-hw + 8, -hh + 32);
    ctx.bezierCurveTo(-hw + 5, -hh + 40, -hw + 6, 0, -hw + 10, hh * 0.25);
    ctx.lineTo(hw - 10, hh * 0.25);
    ctx.bezierCurveTo(hw - 6, 0, hw - 5, -hh + 40, hw - 8, -hh + 32);
    ctx.closePath();
    ctx.fill();

    // Glass reflection strip
    ctx.fillStyle = 'rgba(120, 170, 220, 0.2)';
    ctx.beginPath();
    ctx.moveTo(-hw + 12, -hh + 38);
    ctx.lineTo(-hw + 10, -hh * 0.1);
    ctx.lineTo(-2, -hh * 0.1);
    ctx.lineTo(0, -hh + 38);
    ctx.closePath();
    ctx.fill();

    // Hood center ridge
    ctx.strokeStyle = '#D32F2F';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -hh + 5);
    ctx.lineTo(0, -hh + 28);
    ctx.stroke();

    // Subtle hood vents
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, -hh + 12);
    ctx.lineTo(-4, -hh + 25);
    ctx.moveTo(6, -hh + 12);
    ctx.lineTo(4, -hh + 25);
    ctx.stroke();

    // Taillights (dark red base)
    ctx.fillStyle = '#7B1A1A';
    ctx.beginPath();
    ctx.roundRect(-hw + 2, hh - 14, 10, 6, 2);
    ctx.roundRect(hw - 12, hh - 14, 10, 6, 2);
    ctx.fill();

    // Taillight glow (bright red inner)
    ctx.fillStyle = '#EF5350';
    ctx.beginPath();
    ctx.roundRect(-hw + 4, hh - 12, 6, 3, 1);
    ctx.roundRect(hw - 10, hh - 12, 6, 3, 1);
    ctx.fill();

    // Turn signals (amber)
    ctx.fillStyle = '#FFB300';
    ctx.beginPath();
    ctx.roundRect(-hw, hh - 6, 6, 3, 1);
    ctx.roundRect(hw - 6, hh - 6, 6, 3, 1);
    ctx.fill();

    // Rear bumper detail
    ctx.strokeStyle = '#B71C1C';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-hw + 12, hh - 2);
    ctx.lineTo(hw - 12, hh - 2);
    ctx.stroke();
}

function drawCarFrontView(ctx, cellSize) {
    const w = cellSize * 0.9;
    const h = cellSize * 2 - 6;
    const hw = w / 2;
    const hh = h / 2;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, hh + 2, hw + 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main body - teardrop with front at bottom
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    // Start at rear (top, narrower)
    ctx.moveTo(-hw + 8, -hh);
    ctx.quadraticCurveTo(0, -hh - 5, hw - 8, -hh);
    // Right side curves outward toward front
    ctx.bezierCurveTo(hw, -hh + 15, hw + 3, -hh * 0.2, hw, hh * 0.4);
    // Front right curve
    ctx.bezierCurveTo(hw, hh - 10, hw * 0.7, hh, 0, hh + 3);
    // Front left curve
    ctx.bezierCurveTo(-hw * 0.7, hh, -hw, hh - 10, -hw, hh * 0.4);
    // Left side curves back to rear
    ctx.bezierCurveTo(-hw - 3, -hh * 0.2, -hw, -hh + 15, -hw + 8, -hh);
    ctx.closePath();
    ctx.fill();

    // Body highlight (left)
    ctx.strokeStyle = '#EF5350';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hw + 3, -hh + 20);
    ctx.bezierCurveTo(-hw + 1, 0, -hw + 2, hh * 0.5, -hw + 8, hh - 10);
    ctx.stroke();

    // Body shadow (right)
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hw - 3, -hh + 20);
    ctx.bezierCurveTo(hw - 1, 0, hw - 2, hh * 0.5, hw - 8, hh - 10);
    ctx.stroke();

    // Hood with raised center section
    ctx.fillStyle = '#D32F2F';
    ctx.beginPath();
    ctx.moveTo(-10, -hh * 0.15);
    ctx.lineTo(-8, hh - 22);
    ctx.quadraticCurveTo(0, hh - 18, 8, hh - 22);
    ctx.lineTo(10, -hh * 0.15);
    ctx.quadraticCurveTo(0, -hh * 0.25, -10, -hh * 0.15);
    ctx.closePath();
    ctx.fill();

    // Hood center ridge
    ctx.strokeStyle = '#B71C1C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -hh * 0.1);
    ctx.lineTo(0, hh - 18);
    ctx.stroke();

    // Windshield (dark)
    ctx.fillStyle = '#1E2832';
    ctx.beginPath();
    ctx.moveTo(-hw + 6, -hh + 8);
    ctx.lineTo(-hw + 8, -hh * 0.2);
    ctx.lineTo(hw - 8, -hh * 0.2);
    ctx.lineTo(hw - 6, -hh + 8);
    ctx.closePath();
    ctx.fill();

    // Roof/cabin top
    ctx.fillStyle = '#2D3748';
    ctx.beginPath();
    ctx.moveTo(-hw + 10, -hh + 6);
    ctx.quadraticCurveTo(0, -hh - 2, hw - 10, -hh + 6);
    ctx.lineTo(hw - 6, -hh + 10);
    ctx.quadraticCurveTo(0, -hh + 3, -hw + 6, -hh + 10);
    ctx.closePath();
    ctx.fill();

    // Windshield reflection
    ctx.fillStyle = 'rgba(120, 170, 220, 0.18)';
    ctx.beginPath();
    ctx.moveTo(-hw + 10, -hh + 12);
    ctx.lineTo(-hw + 10, -hh * 0.15);
    ctx.lineTo(-3, -hh * 0.15);
    ctx.lineTo(-3, -hh + 12);
    ctx.closePath();
    ctx.fill();

    // Headlights (bright white)
    ctx.fillStyle = '#FFFDE7';
    ctx.beginPath();
    ctx.roundRect(-hw + 1, hh - 18, 12, 7, 2);
    ctx.roundRect(hw - 13, hh - 18, 12, 7, 2);
    ctx.fill();

    // Headlight inner glow
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-hw + 3, hh - 16, 8, 4, 1);
    ctx.roundRect(hw - 11, hh - 16, 8, 4, 1);
    ctx.fill();

    // Front grille
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.roundRect(-10, hh - 8, 20, 5, 2);
    ctx.fill();

    // Grille mesh detail
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -6; i <= 6; i += 4) {
        ctx.moveTo(i, hh - 7);
        ctx.lineTo(i, hh - 4);
    }
    ctx.stroke();

    // Front bumper line
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-hw + 10, hh);
    ctx.lineTo(hw - 10, hh);
    ctx.stroke();
}

function drawCarSideView(ctx, cellSize, facingRight) {
    const dir = facingRight ? 1 : -1;
    const carLen = cellSize * 2.4;
    const carH = cellSize * 0.75;
    const hLen = carLen / 2;
    const hH = carH / 2;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(dir * 5, hH + 15, hLen - 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rear wheel
    drawWheel(ctx, -dir * hLen * 0.52, hH + 8, cellSize * 0.32);
    // Front wheel
    drawWheel(ctx, dir * hLen * 0.52, hH + 8, cellSize * 0.32);

    // Main body
    ctx.fillStyle = '#E53935';
    ctx.beginPath();

    // Start from rear bottom
    ctx.moveTo(-dir * hLen + dir * 8, hH + 2);

    // Rear curves up
    ctx.quadraticCurveTo(-dir * hLen, hH, -dir * hLen + dir * 3, -hH * 0.4);

    // Rear top curves to roof
    ctx.quadraticCurveTo(-dir * hLen * 0.5, -hH - 8, -dir * hLen * 0.2, -hH - 12);

    // Roof line
    ctx.lineTo(dir * hLen * 0.05, -hH - 12);

    // Windshield slopes down dramatically
    ctx.quadraticCurveTo(dir * hLen * 0.25, -hH - 5, dir * hLen * 0.4, -hH * 0.3);

    // Hood slopes down to very low front
    ctx.quadraticCurveTo(dir * hLen * 0.7, -hH * 0.15, dir * hLen - dir * 5, hH * 0.1);

    // Front bumper curves down
    ctx.quadraticCurveTo(dir * hLen + dir * 2, hH * 0.3, dir * hLen - dir * 3, hH + 2);

    // Front wheel well
    ctx.lineTo(dir * hLen * 0.7, hH + 2);
    ctx.quadraticCurveTo(dir * hLen * 0.52, hH - 6, dir * hLen * 0.34, hH + 2);

    // Undercarriage
    ctx.lineTo(-dir * hLen * 0.34, hH + 2);

    // Rear wheel well
    ctx.quadraticCurveTo(-dir * hLen * 0.52, hH - 6, -dir * hLen * 0.7, hH + 2);

    ctx.closePath();
    ctx.fill();

    // Body outline
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Upper body highlight
    ctx.strokeStyle = '#EF5350';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-dir * hLen * 0.45, -hH - 6);
    ctx.quadraticCurveTo(-dir * hLen * 0.1, -hH - 10, dir * hLen * 0.05, -hH - 10);
    ctx.stroke();

    // Side body crease (signature NSX line)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-dir * hLen + dir * 12, hH * 0.1);
    ctx.quadraticCurveTo(0, -hH * 0.05, dir * hLen - dir * 20, hH * 0.05);
    ctx.stroke();

    // Window (dark glass)
    ctx.fillStyle = '#1E2832';
    ctx.beginPath();
    ctx.moveTo(-dir * hLen * 0.38, -hH * 0.25);
    ctx.quadraticCurveTo(-dir * hLen * 0.35, -hH - 5, -dir * hLen * 0.18, -hH - 8);
    ctx.lineTo(dir * hLen * 0.03, -hH - 8);
    ctx.quadraticCurveTo(dir * hLen * 0.2, -hH - 3, dir * hLen * 0.32, -hH * 0.2);
    ctx.lineTo(dir * hLen * 0.12, -hH * 0.25);
    ctx.closePath();
    ctx.fill();

    // Window frame
    ctx.strokeStyle = '#2D3748';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Window reflection
    ctx.fillStyle = 'rgba(120, 170, 220, 0.15)';
    ctx.beginPath();
    ctx.moveTo(-dir * hLen * 0.32, -hH * 0.2);
    ctx.lineTo(-dir * hLen * 0.28, -hH - 4);
    ctx.lineTo(-dir * hLen * 0.1, -hH - 4);
    ctx.lineTo(-dir * hLen * 0.05, -hH * 0.2);
    ctx.closePath();
    ctx.fill();

    // Side air intake (NSX signature - large black rectangle)
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath();
    ctx.moveTo(-dir * hLen * 0.22, -hH * 0.2);
    ctx.lineTo(-dir * hLen * 0.22, hH * 0.4);
    ctx.lineTo(-dir * hLen * 0.42, hH * 0.4);
    ctx.quadraticCurveTo(-dir * hLen * 0.45, hH * 0.1, -dir * hLen * 0.38, -hH * 0.2);
    ctx.closePath();
    ctx.fill();

    // Intake mesh lines
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
        const y = -hH * 0.1 + i * hH * 0.15;
        ctx.moveTo(-dir * hLen * 0.4, y);
        ctx.lineTo(-dir * hLen * 0.24, y);
    }
    ctx.stroke();

    // Door line
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dir * hLen * 0.08, -hH * 0.2);
    ctx.lineTo(dir * hLen * 0.08, hH * 0.6);
    ctx.stroke();

    // Headlight housing
    ctx.fillStyle = '#FFFDE7';
    ctx.beginPath();
    ctx.ellipse(dir * (hLen - 12), -hH * 0.05, 5, 7, dir * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Headlight inner
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(dir * (hLen - 12), -hH * 0.05, 3, 4, dir * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Front turn signal (yellow, low on bumper)
    ctx.fillStyle = '#FFB300';
    ctx.beginPath();
    ctx.roundRect(dir * (hLen - 15), hH * 0.35, 8, 4, 1);
    ctx.fill();

    // Taillight housing
    ctx.fillStyle = '#7B1A1A';
    ctx.beginPath();
    ctx.roundRect(-dir * hLen + dir * 5, -hH * 0.35, 6, 10, 2);
    ctx.fill();

    // Taillight glow
    ctx.fillStyle = '#EF5350';
    ctx.beginPath();
    ctx.roundRect(-dir * hLen + dir * 6, -hH * 0.3, 4, 6, 1);
    ctx.fill();

    // Rear turn signal
    ctx.fillStyle = '#FFB300';
    ctx.beginPath();
    ctx.roundRect(-dir * hLen + dir * 5, hH * 0.15, 5, 3, 1);
    ctx.fill();

    // Side mirror
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    ctx.ellipse(dir * hLen * 0.15, -hH * 0.5, 4, 5, dir * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Mirror stem
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dir * hLen * 0.12, -hH * 0.45);
    ctx.lineTo(dir * hLen * 0.1, -hH * 0.3);
    ctx.stroke();
}

function drawWheel(ctx, x, y, size) {
    // Tire (dark rubber)
    ctx.fillStyle = '#1F1F1F';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();

    // Tire edge/sidewall
    ctx.strokeStyle = '#0A0A0A';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Rim outer (silver)
    ctx.fillStyle = '#A0A0A0';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Rim inner (lighter)
    ctx.fillStyle = '#C0C0C0';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 5 spokes
    ctx.fillStyle = '#909090';
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(x + cos * size * 0.2, y + sin * size * 0.2);
        ctx.lineTo(x + cos * size * 0.7 - sin * 3, y + sin * size * 0.7 + cos * 3);
        ctx.lineTo(x + cos * size * 0.7 + sin * 3, y + sin * size * 0.7 - cos * 3);
        ctx.closePath();
        ctx.fill();
    }

    // Spoke highlights
    ctx.strokeStyle = '#D0D0D0';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * size * 0.25, y + Math.sin(angle) * size * 0.25);
        ctx.lineTo(x + Math.cos(angle) * size * 0.65, y + Math.sin(angle) * size * 0.65);
        ctx.stroke();
    }

    // Center cap (dark)
    ctx.fillStyle = '#505050';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Center cap highlight
    ctx.fillStyle = '#707070';
    ctx.beginPath();
    ctx.arc(x - size * 0.05, y - size * 0.05, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
}

// ===== GAME LOOP =====
function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    if (currentState === GameState.PLAYING) {
        update(deltaTime);

        if (checkCollisions()) {
            // Check if player made top 10
            playerRank = checkHighScore(score);
            if (playerRank > 0) {
                playerNameInput = '';
                setState(GameState.NAME_INPUT);
            } else {
                setState(GameState.GAME_OVER);
            }
        }
    }

    render();
    requestAnimationFrame(gameLoop);
}

// ===== INITIALIZATION =====
function init() {
    setupCanvas();
    setupTouchHandlers();
    initLeaderboard();
    setState(GameState.MENU);
    requestAnimationFrame(gameLoop);
}

// Start the game when page loads
window.addEventListener('load', init);
