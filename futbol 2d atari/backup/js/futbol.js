/**
 * ============================================================================
 * PARCIAL 1 — VIDEOJUEGO FÚTBOL 2D ATARI (HTML5 Canvas + ES6+)
 * ============================================================================
 * Arquitectura modular pensada para explicarse y modificarse rápidamente:
 *  1. Configuración y constantes de la cancha (sistema lógico 960x560)
 *  2. Estado global preasignado (sin crear basura en memoria por fotograma)
 *  3. Ciclo principal: gameLoop(timestamp) -> update(deltaTime) + draw()
 *  4. Movimiento de jugadores humanos: updatePlayer(deltaTime)
 *  5. Inteligencia Artificial: updateAI(deltaTime)
 *  6. Física y fricción del balón: updateBall(deltaTime)
 *  7. Colisiones geométricas separadas: resolveCollisions()
 *  8. Detección de gol y reinicio seguro: checkGoal() y resetAfterGoal()
 * ============================================================================
 */

"use strict";

// ============================================================================
// 1. CONSTANTES DE LA CANCHA Y CONFIGURACIÓN FÍSICA
// ============================================================================
const WORLD = {
    WIDTH: 960,
    HEIGHT: 560,
    // Límites internos de la línea de banda y línea de fondo
    FIELD_LEFT: 56,
    FIELD_RIGHT: 904,
    FIELD_TOP: 36,
    FIELD_BOTTOM: 524,
    CENTER_X: 480,
    CENTER_Y: 280,
    CENTER_RADIUS: 66,
    // Dimensiones de las porterías (izquierda y derecha)
    GOAL_DEPTH: 42,
    GOAL_WIDTH: 148,
    GOAL_TOP: 280 - 74,    // 206
    GOAL_BOTTOM: 280 + 74, // 354
    POST_RADIUS: 7
};

const PHYSICS = {
    MAX_DELTA: 0.05,            // Máximo 50ms por frame para evitar saltos tras pausa o cambio de pestaña
    PLAYER_SPEED: 270,          // Píxeles por segundo del jugador de campo
    GOALKEEPER_SPEED: 235,      // Velocidad del arquero dentro de su área
    AI_FIELD_SPEED: 245,        // Velocidad de la IA (ligeramente menor para ser justa)
    AI_KEEPER_SPEED: 220,
    BALL_FRICTION: 1.45,        // Factor de desaceleración progresiva por segundo
    BALL_MAX_SPEED: 760,        // Velocidad máxima del balón
    BALL_BOUNCE_WALL: 0.84,     // Coeficiente de restitución contra paredes y postes
    KICK_BASE_IMPULSE: 215,     // Impulso mínimo al tocar el balón
    KICK_TRANSFER: 1.15,        // Transferencia de velocidad del jugador al balón
    GOAL_CELEBRATION_TIME: 1.75 // Segundos que dura el mensaje de ¡GOL! antes de reanudar
};

/*
 * [PUNTO DE EXTENSIÓN — MECÁNICAS SORPRESA PARA EL PARCIAL]
 * Si el profesor pide agregar una regla nueva en la prueba presencial, puedes
 * activar o añadir parámetros aquí:
 *  - TURBO: Multiplicar PHYSICS.PLAYER_SPEED * 1.6 mientras se presiona ShiftLeft.
 *  - VIENTO: Definir const WIND = { x: 45, y: 0 } y sumarlo a ball.vx en updateBall().
 *  - GOL GANA / LÍMITE DE GOLES: Definir WINNING_SCORE = 5 y verificarlo en checkGoal().
 *  - OBSTÁCULOS: Añadir círculos fijos en el arreglo goalPosts o en un arreglo obstacles.
 */

// ============================================================================
// 2. REFERENCIAS AL DOM Y CONTEXTO 2D
// ============================================================================
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const stageWrapper = document.getElementById("stage-wrapper");
const aspectBox = document.querySelector(".canvas-aspect-box");

const scoreBlueEl = document.getElementById("score-blue");
const scoreOrangeEl = document.getElementById("score-orange");
const modeIndicatorEl = document.getElementById("mode-indicator");
const orangeLabelEl = document.getElementById("orange-label");
const menuOverlayEl = document.getElementById("menu-overlay");

const btnPause = document.getElementById("btn-pause");
const btnRestart = document.getElementById("btn-restart");
const btnMenu = document.getElementById("btn-menu");
const btnMode1P = document.getElementById("btn-mode-1p");
const btnMode2P = document.getElementById("btn-mode-2p");

// ============================================================================
// 3. ESTADO DEL JUEGO Y ENTIDADES PREASIGNADAS (SIN BASURA POR FRAME)
// ============================================================================
const gameState = {
    mode: "1P",              // "1P" (Contra IA) o "2P" (2 Jugadores Locales)
    isRunning: false,        // true cuando se ha elegido modo y la partida está activa
    isPaused: false,         // true cuando el juego está en pausa
    isGoalCooldown: false,   // Evita contar el mismo gol múltiples veces mientras celebra
    goalTimer: 0,            // Temporizador para el mensaje de ¡GOL!
    goalBannerText: "",      // Texto que se dibuja tras anotar
    goalBannerColor: "#fff",
    scoreBlue: 0,
    scoreOrange: 0,
    lastTimestamp: 0
};

// Estado del teclado (evita crear objetos en los eventos keydown/keyup)
const keys = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// Entidad del balón
const ball = {
    x: WORLD.CENTER_X,
    y: WORLD.CENTER_Y,
    vx: 0,
    vy: 0,
    radius: 11
};

// Entidades de los 4 participantes en cancha (2 jugadores de campo y 2 arqueros)
const players = {
    blueField: {
        team: "blue",
        role: "field",
        label: "J1",
        x: 290,
        y: WORLD.CENTER_Y,
        vx: 0,
        vy: 0,
        radius: 19,
        color: "#2998ff",
        stroke: "#bfe0ff",
        minX: WORLD.FIELD_LEFT + 19,
        maxX: WORLD.FIELD_RIGHT - 19,
        minY: WORLD.FIELD_TOP + 19,
        maxY: WORLD.FIELD_BOTTOM - 19
    },
    blueKeeper: {
        team: "blue",
        role: "keeper",
        label: "GK",
        x: WORLD.FIELD_LEFT + 28,
        y: WORLD.CENTER_Y,
        vx: 0,
        vy: 0,
        radius: 17,
        color: "#1565c0",
        stroke: "#90caf9",
        // El arquero se mueve dentro de su área grande
        minX: WORLD.FIELD_LEFT + 14,
        maxX: WORLD.FIELD_LEFT + 125,
        minY: WORLD.GOAL_TOP - 36,
        maxY: WORLD.GOAL_BOTTOM + 36
    },
    orangeField: {
        team: "orange",
        role: "field",
        label: "J2",
        x: 670,
        y: WORLD.CENTER_Y,
        vx: 0,
        vy: 0,
        radius: 19,
        color: "#ff7b24",
        stroke: "#ffe0b2",
        minX: WORLD.FIELD_LEFT + 19,
        maxX: WORLD.FIELD_RIGHT - 19,
        minY: WORLD.FIELD_TOP + 19,
        maxY: WORLD.FIELD_BOTTOM - 19
    },
    orangeKeeper: {
        team: "orange",
        role: "keeper",
        label: "GK",
        x: WORLD.FIELD_RIGHT - 28,
        y: WORLD.CENTER_Y,
        vx: 0,
        vy: 0,
        radius: 17,
        color: "#d84315",
        stroke: "#ffccbc",
        minX: WORLD.FIELD_RIGHT - 125,
        maxX: WORLD.FIELD_RIGHT - 14,
        minY: WORLD.GOAL_TOP - 36,
        maxY: WORLD.GOAL_BOTTOM + 36
    }
};

// Lista fija de los 4 jugadores para iterar sin crear arreglos nuevos en cada frame
const playerList = [
    players.blueField,
    players.blueKeeper,
    players.orangeField,
    players.orangeKeeper
];

// Los 4 postes de las dos porterías para colisiones geométricas exactas
const goalPosts = [
    { x: WORLD.FIELD_LEFT,  y: WORLD.GOAL_TOP,    radius: WORLD.POST_RADIUS },
    { x: WORLD.FIELD_LEFT,  y: WORLD.GOAL_BOTTOM, radius: WORLD.POST_RADIUS },
    { x: WORLD.FIELD_RIGHT, y: WORLD.GOAL_TOP,    radius: WORLD.POST_RADIUS },
    { x: WORLD.FIELD_RIGHT, y: WORLD.GOAL_BOTTOM, radius: WORLD.POST_RADIUS }
];

// ============================================================================
// 4. ADAPTACIÓN DEL CANVAS A LA VENTANA (RESPONSIVE CONSERVANDO PROPORCIÓN)
// ============================================================================
function resizeCanvasView() {
    const availableWidth = stageWrapper.clientWidth;
    const availableHeight = stageWrapper.clientHeight;
    const targetAspect = WORLD.WIDTH / WORLD.HEIGHT;

    let displayWidth = availableWidth;
    let displayHeight = Math.floor(displayWidth / targetAspect);

    if (displayHeight > availableHeight) {
        displayHeight = availableHeight;
        displayWidth = Math.floor(displayHeight * targetAspect);
    }

    aspectBox.style.width = `${displayWidth}px`;
    aspectBox.style.height = `${displayHeight}px`;
}

// ============================================================================
// 5. INICIO, REINICIO Y PAUSA DE LA PARTIDA
// ============================================================================

/**
 * Inicia una nueva partida en el modo seleccionado ("1P" o "2P").
 * @param {string} selectedMode - "1P" contra IA o "2P" para 2 jugadores locales.
 */
function startGame(selectedMode) {
    if (selectedMode) {
        gameState.mode = selectedMode;
    }

    gameState.scoreBlue = 0;
    gameState.scoreOrange = 0;
    gameState.isPaused = false;
    gameState.isGoalCooldown = false;
    gameState.goalTimer = 0;
    gameState.isRunning = true;

    players.orangeField.label = gameState.mode === "1P" ? "IA" : "J2";
    modeIndicatorEl.textContent = gameState.mode === "1P" ? "1P VS IA" : "2 JUGADORES";
    orangeLabelEl.textContent = gameState.mode === "1P" ? "NARANJA (IA)" : "NARANJA (J2)";
    btnPause.textContent = "PAUSAR (ESPACIO)";

    updateScoreboardDOM();
    resetPositions();

    menuOverlayEl.classList.remove("active");
}

/**
 * Coloca a los jugadores, arqueros y balón en sus coordenadas iniciales de saque.
 */
function resetPositions() {
    ball.x = WORLD.CENTER_X;
    ball.y = WORLD.CENTER_Y;
    ball.vx = 0;
    ball.vy = 0;

    players.blueField.x = 290;
    players.blueField.y = WORLD.CENTER_Y;
    players.blueField.vx = 0;
    players.blueField.vy = 0;

    players.blueKeeper.x = WORLD.FIELD_LEFT + 28;
    players.blueKeeper.y = WORLD.CENTER_Y;
    players.blueKeeper.vx = 0;
    players.blueKeeper.vy = 0;

    players.orangeField.x = 670;
    players.orangeField.y = WORLD.CENTER_Y;
    players.orangeField.vx = 0;
    players.orangeField.vy = 0;

    players.orangeKeeper.x = WORLD.FIELD_RIGHT - 28;
    players.orangeKeeper.y = WORLD.CENTER_Y;
    players.orangeKeeper.vx = 0;
    players.orangeKeeper.vy = 0;
}

/**
 * Reinicia el balón y los jugadores después de que termina la celebración de un gol.
 */
function resetAfterGoal() {
    resetPositions();
    gameState.isGoalCooldown = false;
    gameState.goalTimer = 0;
    gameState.goalBannerText = "";
}

/**
 * Alterna el estado de pausa de la partida.
 */
function togglePause() {
    if (!gameState.isRunning) {
        return;
    }
    gameState.isPaused = !gameState.isPaused;
    btnPause.textContent = gameState.isPaused ? "REANUDAR (ESPACIO)" : "PAUSAR (ESPACIO)";
}

/**
 * Actualiza los números del marcador en el HTML.
 */
function updateScoreboardDOM() {
    scoreBlueEl.textContent = String(gameState.scoreBlue);
    scoreOrangeEl.textContent = String(gameState.scoreOrange);
}

// ============================================================================
// 6. GAME LOOP PRINCIPAL (requestAnimationFrame + deltaTime)
// ============================================================================

/**
 * Bucle principal de animación invocado por el navegador.
 * @param {number} timestamp - Tiempo actual en milisegundos.
 */
function gameLoop(timestamp) {
    if (gameState.lastTimestamp === 0) {
        gameState.lastTimestamp = timestamp;
    }

    // Cálculo de deltaTime en segundos, limitado a MAX_DELTA para evitar saltos
    let deltaTime = (timestamp - gameState.lastTimestamp) / 1000;
    gameState.lastTimestamp = timestamp;

    if (deltaTime > PHYSICS.MAX_DELTA) {
        deltaTime = PHYSICS.MAX_DELTA;
    }
    if (deltaTime < 0) {
        deltaTime = 0;
    }

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

/**
 * Actualiza toda la lógica de movimiento, IA, física, colisiones y reglas de gol.
 * @param {number} deltaTime - Tiempo transcurrido desde el último fotograma (en segundos).
 */
function update(deltaTime) {
    if (!gameState.isRunning || gameState.isPaused) {
        return;
    }

    // Si se acaba de marcar un gol, esperamos unos instantes antes de volver a sacar
    if (gameState.isGoalCooldown) {
        gameState.goalTimer -= deltaTime;
        // El balón sigue moviéndose suavemente dentro de la red durante la celebración
        updateBall(deltaTime);
        resolveBallWallCollisions();
        if (gameState.goalTimer <= 0) {
            resetAfterGoal();
        }
        return;
    }

    // 1. Actualizar controles del Jugador 1 (y Jugador 2 si está en modo 2P)
    updatePlayer(deltaTime);

    // 2. Actualizar Inteligencia Artificial si está en modo 1P
    if (gameState.mode === "1P") {
        updateAI(deltaTime);
    }

    // 3. Actualizar posición y desaceleración del balón
    updateBall(deltaTime);

    // 4. Resolver colisiones (jugadores, límites, postes y balón)
    resolveCollisions();

    // 5. Comprobar si el balón cruzó por completo alguna línea de gol
    checkGoal();
}

// ============================================================================
// 7. CONTROL DE JUGADORES Y ARQUEROS HUMANOS
// ============================================================================

/**
 * Procesa las teclas presionadas para mover al Equipo Azul (W/A/S/D)
 * y al Equipo Naranja en modo 2 Jugadores (Flechas).
 * @param {number} deltaTime - Tiempo del fotograma en segundos.
 */
function updatePlayer(deltaTime) {
    // --- EQUIPO AZUL (W/A/S/D) ---
    let blueDirX = 0;
    let blueDirY = 0;
    if (keys.KeyW) blueDirY -= 1;
    if (keys.KeyS) blueDirY += 1;
    if (keys.KeyA) blueDirX -= 1;
    if (keys.KeyD) blueDirX += 1;

    moveEntityWithDirection(players.blueField, blueDirX, blueDirY, PHYSICS.PLAYER_SPEED, deltaTime);

    // El arquero azul acompaña verticalmente con las teclas W/S y se posiciona de forma inteligente en X
    updateControlledGoalkeeper(players.blueKeeper, blueDirY, true, deltaTime);

    // --- EQUIPO NARANJA EN MODO 2 JUGADORES (FLECHAS) ---
    if (gameState.mode === "2P") {
        let orangeDirX = 0;
        let orangeDirY = 0;
        if (keys.ArrowUp) orangeDirY -= 1;
        if (keys.ArrowDown) orangeDirY += 1;
        if (keys.ArrowLeft) orangeDirX -= 1;
        if (keys.ArrowRight) orangeDirX += 1;

        moveEntityWithDirection(players.orangeField, orangeDirX, orangeDirY, PHYSICS.PLAYER_SPEED, deltaTime);
        updateControlledGoalkeeper(players.orangeKeeper, orangeDirY, false, deltaTime);
    }
}

/**
 * Mueve un jugador normalizando la diagonal para que no corra más rápido en diagonal.
 */
function moveEntityWithDirection(player, dirX, dirY, speed, deltaTime) {
    if (dirX !== 0 && dirY !== 0) {
        const invLen = 0.70710678; // 1 / Math.sqrt(2)
        dirX *= invLen;
        dirY *= invLen;
    }

    player.vx = dirX * speed;
    player.vy = dirY * speed;
    player.x += player.vx * deltaTime;
    player.y += player.vy * deltaTime;

    clampPlayerToBounds(player);
}

/**
 * Mueve al arquero del equipo humano combinando el control vertical del usuario
 * con un seguimiento suave del balón cuando el balón se acerca al área.
 */
function updateControlledGoalkeeper(keeper, inputDirY, isBlueTeam, deltaTime) {
    // Si el jugador presiona arriba/abajo, el arquero responde; si no, sigue suavemente la altura del balón
    let targetVy = 0;
    if (inputDirY !== 0) {
        targetVy = inputDirY * PHYSICS.GOALKEEPER_SPEED;
    } else {
        const clampedBallY = Math.max(WORLD.GOAL_TOP + 18, Math.min(WORLD.GOAL_BOTTOM - 18, ball.y));
        const diffY = clampedBallY - keeper.y;
        if (Math.abs(diffY) > 6) {
            targetVy = Math.sign(diffY) * (PHYSICS.GOALKEEPER_SPEED * 0.75);
        }
    }

    // Posición horizontal base frente al arco
    const homeX = isBlueTeam ? WORLD.FIELD_LEFT + 28 : WORLD.FIELD_RIGHT - 28;
    const diffX = homeX - keeper.x;
    const targetVx = Math.abs(diffX) > 3 ? Math.sign(diffX) * 120 : 0;

    keeper.vx = targetVx;
    keeper.vy = targetVy;
    keeper.x += keeper.vx * deltaTime;
    keeper.y += keeper.vy * deltaTime;

    clampPlayerToBounds(keeper);
}

// ============================================================================
// 8. INTELIGENCIA ARTIFICIAL (MODO 1 JUGADOR)
// ============================================================================

/**
 * Controla al jugador de campo naranja y a su arquero en modo 1P contra IA.
 * La IA calcula un punto detrás del balón (respecto a la portería azul) para
 * perfilarse y disparar hacia el arco izquierdo.
 * @param {number} deltaTime - Tiempo del fotograma en segundos.
 */
function updateAI(deltaTime) {
    const aiPlayer = players.orangeField;
    const aiKeeper = players.orangeKeeper;

    // Coordenada objetivo: la portería azul (izquierda)
    const targetGoalX = WORLD.FIELD_LEFT;
    const targetGoalY = WORLD.CENTER_Y;

    // Vector desde la portería azul hacia el balón
    const goalToBallX = ball.x - targetGoalX;
    const goalToBallY = ball.y - targetGoalY;
    const distGoalToBall = Math.hypot(goalToBallX, goalToBallY) || 1;
    const normX = goalToBallX / distGoalToBall;
    const normY = goalToBallY / distGoalToBall;

    let aimX = ball.x;
    let aimY = ball.y;

    // Si la IA está a la izquierda del balón (entre el arco rival y el balón),
    // rodea ligeramente el balón para no empujarlo hacia su propio arco.
    if (aiPlayer.x < ball.x - 8) {
        aimX = ball.x + 34;
        aimY = ball.y + (aiPlayer.y < ball.y ? -42 : 42);
    } else {
        // Si ya está detrás del balón, apunta unos píxeles detrás para impactar hacia el arco azul
        const distToBall = Math.hypot(ball.x - aiPlayer.x, ball.y - aiPlayer.y);
        if (distToBall > 48) {
            aimX = ball.x + normX * 22;
            aimY = ball.y + normY * 22;
        } else {
            // Ataque directo al balón para disparar
            aimX = ball.x;
            aimY = ball.y;
        }
    }

    const dx = aimX - aiPlayer.x;
    const dy = aimY - aiPlayer.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 2) {
        aiPlayer.vx = (dx / dist) * PHYSICS.AI_FIELD_SPEED;
        aiPlayer.vy = (dy / dist) * PHYSICS.AI_FIELD_SPEED;
    } else {
        aiPlayer.vx = 0;
        aiPlayer.vy = 0;
    }

    aiPlayer.x += aiPlayer.vx * deltaTime;
    aiPlayer.y += aiPlayer.vy * deltaTime;
    clampPlayerToBounds(aiPlayer);

    // --- ARQUERO DE LA IA ---
    // Protege el arco derecho siguiendo la coordenada Y del balón y saliendo un poco si el balón entra al área
    const guardY = Math.max(WORLD.GOAL_TOP + 16, Math.min(WORLD.GOAL_BOTTOM - 16, ball.y));
    const guardX = ball.x > WORLD.FIELD_RIGHT - 150 ? WORLD.FIELD_RIGHT - 42 : WORLD.FIELD_RIGHT - 26;

    const kdx = guardX - aiKeeper.x;
    const kdy = guardY - aiKeeper.y;

    aiKeeper.vx = Math.abs(kdx) > 4 ? Math.sign(kdx) * (PHYSICS.AI_KEEPER_SPEED * 0.7) : 0;
    aiKeeper.vy = Math.abs(kdy) > 4 ? Math.sign(kdy) * PHYSICS.AI_KEEPER_SPEED : 0;

    aiKeeper.x += aiKeeper.vx * deltaTime;
    aiKeeper.y += aiKeeper.vy * deltaTime;
    clampPlayerToBounds(aiKeeper);
}

// ============================================================================
// 9. FÍSICA DEL BALÓN
// ============================================================================

/**
 * Actualiza la posición del balón y aplica fricción progresiva sobre el césped.
 * @param {number} deltaTime - Tiempo del fotograma en segundos.
 */
function updateBall(deltaTime) {
    /*
     * [PUNTO DE EXTENSIÓN — VIENTO O CURVA]
     * Si en el examen piden agregar viento lateral o vertical:
     * ball.vx += WIND_X * deltaTime;
     * ball.vy += WIND_Y * deltaTime;
     */

    // Avance de posición según velocidad actual
    ball.x += ball.vx * deltaTime;
    ball.y += ball.vy * deltaTime;

    // Fricción exponencial independiente de los FPS
    const damping = Math.exp(-PHYSICS.BALL_FRICTION * deltaTime);
    ball.vx *= damping;
    ball.vy *= damping;

    // Detener por completo cuando la velocidad es casi nula
    if (Math.hypot(ball.vx, ball.vy) < 4) {
        ball.vx = 0;
        ball.vy = 0;
    }
}

// ============================================================================
// 10. COLISIONES GEOMÉTRICAS (PAREDES, PORTERÍAS, POSTES Y JUGADORES)
// ============================================================================

/**
 * Ejecuta todas las rutinas de detección y respuesta de colisión del juego.
 */
function resolveCollisions() {
    // 1. Evitar que los jugadores se superpongan entre sí
    for (let i = 0; i < playerList.length; i++) {
        for (let j = i + 1; j < playerList.length; j++) {
            resolvePlayerPlayerCollision(playerList[i], playerList[j]);
        }
    }

    // 2. Colisiones entre cada jugador/arquero y el balón
    for (let i = 0; i < playerList.length; i++) {
        resolvePlayerBallCollision(playerList[i]);
    }

    // 3. Colisiones del balón con los 4 postes de las porterías
    for (let i = 0; i < goalPosts.length; i++) {
        resolveBallPostCollision(goalPosts[i]);
    }

    // 4. Rebotes del balón contra las bandas, líneas de fondo y mallas de las porterías
    resolveBallWallCollisions();
}

/**
 * Restringe a un jugador o arquero dentro de sus límites permitidos.
 */
function clampPlayerToBounds(player) {
    if (player.x < player.minX) player.x = player.minX;
    if (player.x > player.maxX) player.x = player.maxX;
    if (player.y < player.minY) player.y = player.minY;
    if (player.y > player.maxY) player.y = player.maxY;
}

/**
 * Separa dos jugadores circulares si entran en contacto.
 */
function resolvePlayerPlayerCollision(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const minDist = p1.radius + p2.radius;

    if (dist > 0 && dist < minDist) {
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;

        p1.x -= nx * overlap;
        p1.y -= ny * overlap;
        p2.x += nx * overlap;
        p2.y += ny * overlap;

        clampPlayerToBounds(p1);
        clampPlayerToBounds(p2);
    }
}

/**
 * Resuelve el impacto circular entre un jugador y el balón, transfiriendo impulso.
 */
function resolvePlayerBallCollision(player) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = player.radius + ball.radius;

    if (dist < minDist) {
        // Vector normal unitario desde el centro del jugador hacia el balón
        const nx = dist > 0.0001 ? dx / dist : (player.team === "blue" ? 1 : -1);
        const ny = dist > 0.0001 ? dy / dist : 0;

        // Separar el balón de inmediato para evitar que quede atrapado dentro del jugador
        const overlap = minDist - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;

        // Calcular velocidad del impacto según la rapidez del jugador
        const playerSpeed = Math.hypot(player.vx, player.vy);
        const kickPower = PHYSICS.KICK_BASE_IMPULSE + playerSpeed * PHYSICS.KICK_TRANSFER;

        ball.vx = nx * kickPower + player.vx * 0.35;
        ball.vy = ny * kickPower + player.vy * 0.35;

        // Limitar la velocidad máxima del balón para que no atraviese muros
        const currentBallSpeed = Math.hypot(ball.vx, ball.vy);
        if (currentBallSpeed > PHYSICS.BALL_MAX_SPEED) {
            const scale = PHYSICS.BALL_MAX_SPEED / currentBallSpeed;
            ball.vx *= scale;
            ball.vy *= scale;
        }
    }
}

/**
 * Resuelve el rebote elástico del balón contra cualquiera de los 4 postes metálicos.
 */
function resolveBallPostCollision(post) {
    const dx = ball.x - post.x;
    const dy = ball.y - post.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + post.radius;

    if (dist < minDist) {
        const nx = dist > 0.0001 ? dx / dist : 1;
        const ny = dist > 0.0001 ? dy / dist : 0;

        // Empujar el balón fuera del poste
        const overlap = minDist - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;

        // Reflejar el vector velocidad respecto a la normal del poste
        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
            ball.vx = (ball.vx - 2 * dot * nx) * PHYSICS.BALL_BOUNCE_WALL;
            ball.vy = (ball.vy - 2 * dot * ny) * PHYSICS.BALL_BOUNCE_WALL;
        }
    }
}

/**
 * Rebota el balón contra las bandas superior/inferior, las líneas de fondo y
 * las redes laterales/traseras de las porterías (sin permitir que atraviese la malla por fuera).
 */
function resolveBallWallCollisions() {
    const r = ball.radius;

    // 1. Bandas superior e inferior de la cancha general
    if (ball.y - r < WORLD.FIELD_TOP) {
        ball.y = WORLD.FIELD_TOP + r;
        ball.vy = Math.abs(ball.vy) * PHYSICS.BALL_BOUNCE_WALL;
    } else if (ball.y + r > WORLD.FIELD_BOTTOM) {
        ball.y = WORLD.FIELD_BOTTOM - r;
        ball.vy = -Math.abs(ball.vy) * PHYSICS.BALL_BOUNCE_WALL;
    }

    // Verificar si el centro vertical del balón está alineado con la boca de la portería
    const isInsideGoalMouthY =
        ball.y - r >= WORLD.GOAL_TOP &&
        ball.y + r <= WORLD.GOAL_BOTTOM;

    const isAlreadyInLeftGoalPocket = ball.x < WORLD.FIELD_LEFT;
    const isAlreadyInRightGoalPocket = ball.x > WORLD.FIELD_RIGHT;

    // 2. Extremo izquierdo (Línea de fondo izquierda y red de la portería azul)
    if (isAlreadyInLeftGoalPocket || (isInsideGoalMouthY && ball.x - r < WORLD.FIELD_LEFT)) {
        // Fondo de la red izquierda
        const leftNetBack = WORLD.FIELD_LEFT - WORLD.GOAL_DEPTH;
        if (ball.x - r < leftNetBack) {
            ball.x = leftNetBack + r;
            ball.vx = Math.abs(ball.vx) * 0.5;
        }
        // Redes laterales superior e inferior de la portería izquierda
        if (ball.y - r < WORLD.GOAL_TOP) {
            ball.y = WORLD.GOAL_TOP + r;
            ball.vy = Math.abs(ball.vy) * 0.5;
        } else if (ball.y + r > WORLD.GOAL_BOTTOM) {
            ball.y = WORLD.GOAL_BOTTOM - r;
            ball.vy = -Math.abs(ball.vy) * 0.5;
        }
    } else if (ball.x - r < WORLD.FIELD_LEFT) {
        // Rebote normal contra la línea de fondo izquierda fuera de la portería
        ball.x = WORLD.FIELD_LEFT + r;
        ball.vx = Math.abs(ball.vx) * PHYSICS.BALL_BOUNCE_WALL;
    }

    // 3. Extremo derecho (Línea de fondo derecha y red de la portería naranja)
    if (isAlreadyInRightGoalPocket || (isInsideGoalMouthY && ball.x + r > WORLD.FIELD_RIGHT)) {
        // Fondo de la red derecha
        const rightNetBack = WORLD.FIELD_RIGHT + WORLD.GOAL_DEPTH;
        if (ball.x + r > rightNetBack) {
            ball.x = rightNetBack - r;
            ball.vx = -Math.abs(ball.vx) * 0.5;
        }
        // Redes laterales superior e inferior de la portería derecha
        if (ball.y - r < WORLD.GOAL_TOP) {
            ball.y = WORLD.GOAL_TOP + r;
            ball.vy = Math.abs(ball.vy) * 0.5;
        } else if (ball.y + r > WORLD.GOAL_BOTTOM) {
            ball.y = WORLD.GOAL_BOTTOM - r;
            ball.vy = -Math.abs(ball.vy) * 0.5;
        }
    } else if (ball.x + r > WORLD.FIELD_RIGHT) {
        // Rebote normal contra la línea de fondo derecha fuera de la portería
        ball.x = WORLD.FIELD_RIGHT - r;
        ball.vx = -Math.abs(ball.vx) * PHYSICS.BALL_BOUNCE_WALL;
    }
}

// ============================================================================
// 11. DETECCIÓN DE GOL Y MARCADOR
// ============================================================================

/**
 * Comprueba si el balón cruzó COMPLETAMENTE la línea de meta dentro de los dos postes.
 */
function checkGoal() {
    if (gameState.isGoalCooldown) {
        return;
    }

    const r = ball.radius;
    const withinGoalPostsY = ball.y > WORLD.GOAL_TOP && ball.y < WORLD.GOAL_BOTTOM;

    if (!withinGoalPostsY) {
        return;
    }

    // Si el borde derecho del balón cruzó totalmente la línea izquierda -> Gol del equipo Naranja
    if (ball.x + r < WORLD.FIELD_LEFT) {
        registerGoal("orange");
    }
    // Si el borde izquierdo del balón cruzó totalmente la línea derecha -> Gol del equipo Azul
    else if (ball.x - r > WORLD.FIELD_RIGHT) {
        registerGoal("blue");
    }
}

/**
 * Suma el gol al equipo correspondiente, muestra el aviso en pantalla y activa el temporizador de reinicio.
 * @param {"blue" | "orange"} scoringTeam - Equipo que acaba de anotar.
 */
function registerGoal(scoringTeam) {
    gameState.isGoalCooldown = true;
    gameState.goalTimer = PHYSICS.GOAL_CELEBRATION_TIME;

    if (scoringTeam === "blue") {
        gameState.scoreBlue += 1;
        gameState.goalBannerText = "¡GOL DEL EQUIPO AZUL!";
        gameState.goalBannerColor = "#2998ff";
    } else {
        gameState.scoreOrange += 1;
        gameState.goalBannerText = "¡GOL DEL EQUIPO NARANJA!";
        gameState.goalBannerColor = "#ff7b24";
    }

    updateScoreboardDOM();
}

// ============================================================================
// 12. RENDERIZADO EN CANVAS 2D (ESTÉTICA ATARI ARCADE)
// ============================================================================

/**
 * Dibuja todos los elementos de la escena en el Canvas.
 */
function draw() {
    ctx.clearRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    drawPitch();
    drawGoals();
    drawPlayers();
    drawBall();
    drawCanvasOverlays();
}

/**
 * Dibuja el césped a franjas estilo arcade, las líneas reglamentarias, áreas y círculo central.
 */
function drawPitch() {
    // Fondo exterior de la cancha
    ctx.fillStyle = "#124922";
    ctx.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    // Franjas verticales de césped dentro del terreno de juego
    const pitchWidth = WORLD.FIELD_RIGHT - WORLD.FIELD_LEFT;
    const pitchHeight = WORLD.FIELD_BOTTOM - WORLD.FIELD_TOP;
    const stripeCount = 10;
    const stripeWidth = pitchWidth / stripeCount;

    for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#1b6b33" : "#1f783a";
        ctx.fillRect(
            WORLD.FIELD_LEFT + i * stripeWidth,
            WORLD.FIELD_TOP,
            stripeWidth,
            pitchHeight
        );
    }

    // Configuración de líneas blancas de cal
    ctx.strokeStyle = "#e9f5ec";
    ctx.lineWidth = 4;

    // Contorno exterior de la cancha
    ctx.strokeRect(WORLD.FIELD_LEFT, WORLD.FIELD_TOP, pitchWidth, pitchHeight);

    // Línea de medio campo
    ctx.beginPath();
    ctx.moveTo(WORLD.CENTER_X, WORLD.FIELD_TOP);
    ctx.lineTo(WORLD.CENTER_X, WORLD.FIELD_BOTTOM);
    ctx.stroke();

    // Círculo central y punto de saque
    ctx.beginPath();
    ctx.arc(WORLD.CENTER_X, WORLD.CENTER_Y, WORLD.CENTER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#e9f5ec";
    ctx.beginPath();
    ctx.arc(WORLD.CENTER_X, WORLD.CENTER_Y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Área grande y área chica izquierda (Equipo Azul)
    const penaltyWidth = 128;
    const penaltyHeight = 256;
    const smallBoxWidth = 52;
    const smallBoxHeight = 148;

    ctx.strokeRect(
        WORLD.FIELD_LEFT,
        WORLD.CENTER_Y - penaltyHeight / 2,
        penaltyWidth,
        penaltyHeight
    );
    ctx.strokeRect(
        WORLD.FIELD_LEFT,
        WORLD.CENTER_Y - smallBoxHeight / 2,
        smallBoxWidth,
        smallBoxHeight
    );

    // Área grande y área chica derecha (Equipo Naranja)
    ctx.strokeRect(
        WORLD.FIELD_RIGHT - penaltyWidth,
        WORLD.CENTER_Y - penaltyHeight / 2,
        penaltyWidth,
        penaltyHeight
    );
    ctx.strokeRect(
        WORLD.FIELD_RIGHT - smallBoxWidth,
        WORLD.CENTER_Y - smallBoxHeight / 2,
        smallBoxWidth,
        smallBoxHeight
    );
}

/**
 * Dibuja las dos porterías con su red cuadriculada y los 4 postes circulares.
 */
function drawGoals() {
    const leftGoalX = WORLD.FIELD_LEFT - WORLD.GOAL_DEPTH;
    const rightGoalX = WORLD.FIELD_RIGHT;

    // Fondo oscuro de las porterías
    ctx.fillStyle = "rgba(8, 15, 22, 0.55)";
    ctx.fillRect(leftGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);
    ctx.fillRect(rightGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);

    // Malla reticulada estilo retro
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    const step = 10;

    for (let x = leftGoalX; x <= WORLD.FIELD_LEFT; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, WORLD.GOAL_TOP);
        ctx.lineTo(x, WORLD.GOAL_BOTTOM);
        ctx.stroke();
    }
    for (let x = rightGoalX; x <= rightGoalX + WORLD.GOAL_DEPTH; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, WORLD.GOAL_TOP);
        ctx.lineTo(x, WORLD.GOAL_BOTTOM);
        ctx.stroke();
    }
    for (let y = WORLD.GOAL_TOP; y <= WORLD.GOAL_BOTTOM; y += step) {
        ctx.beginPath();
        ctx.moveTo(leftGoalX, y);
        ctx.lineTo(WORLD.FIELD_LEFT, y);
        ctx.moveTo(rightGoalX, y);
        ctx.lineTo(rightGoalX + WORLD.GOAL_DEPTH, y);
        ctx.stroke();
    }

    // Estructura metálica de cada portería
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#56a8ff";
    ctx.strokeRect(leftGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);

    ctx.strokeStyle = "#ff944d";
    ctx.strokeRect(rightGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);

    // Los 4 postes de colisión
    for (let i = 0; i < goalPosts.length; i++) {
        const post = goalPosts[i];
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(post.x, post.y, post.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#1b2432";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

/**
 * Dibuja a los dos jugadores y a sus respectivos arqueros con distintivos claros.
 */
function drawPlayers() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 12px Consolas, monospace";

    for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];

        // Sombra en el césped
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.beginPath();
        ctx.arc(p.x + 2, p.y + 4, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Cuerpo circular del jugador
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Borde retro de alto contraste
        ctx.lineWidth = 3;
        ctx.strokeStyle = p.stroke;
        ctx.stroke();

        // Etiqueta interior (J1, J2/IA, GK)
        ctx.fillStyle = "#ffffff";
        ctx.fillText(p.label, p.x, p.y);
    }
}

/**
 * Dibuja el balón con alto contraste para que siempre sea fácil de seguir.
 */
function drawBall() {
    // Sombra del balón
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.arc(ball.x + 2, ball.y + 3, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Esfera blanca brillante
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#111622";
    ctx.stroke();

    // Pentágono central estilo balón clásico
    ctx.fillStyle = "#111622";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 4, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Dibuja en el Canvas los avisos de ¡GOL! o de PARTIDA PAUSADA cuando corresponden.
 */
function drawCanvasOverlays() {
    // Mensaje de celebración de gol
    if (gameState.isGoalCooldown && gameState.goalBannerText) {
        ctx.fillStyle = "rgba(10, 14, 22, 0.78)";
        ctx.fillRect(WORLD.CENTER_X - 240, WORLD.CENTER_Y - 52, 480, 104);

        ctx.strokeStyle = gameState.goalBannerColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(WORLD.CENTER_X - 240, WORLD.CENTER_Y - 52, 480, 104);

        ctx.fillStyle = gameState.goalBannerColor;
        ctx.font = "bold 30px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(gameState.goalBannerText, WORLD.CENTER_X, WORLD.CENTER_Y - 10);

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 15px Consolas, monospace";
        ctx.fillText("PREPARANDO SAQUE CENTRAL...", WORLD.CENTER_X, WORLD.CENTER_Y + 26);
    }

    // Cartel de Pausa
    if (gameState.isRunning && gameState.isPaused) {
        ctx.fillStyle = "rgba(8, 11, 18, 0.68)";
        ctx.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

        ctx.fillStyle = "#ffd13b";
        ctx.font = "bold 36px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("JUEGO EN PAUSA", WORLD.CENTER_X, WORLD.CENTER_Y - 12);

        ctx.fillStyle = "#ffffff";
        ctx.font = "16px Consolas, monospace";
        ctx.fillText("Presiona ESPACIO o el botón superior para continuar", WORLD.CENTER_X, WORLD.CENTER_Y + 28);
    }
}

// ============================================================================
// 13. EVENTOS DE TECLADO, INTERFAZ Y FOCO DE VENTANA
// ============================================================================

/**
 * Verifica si el foco actual está en un campo de texto para no interceptar la barra espaciadora.
 */
function isTypingInTextField(eventTarget) {
    if (!eventTarget) return false;
    const tag = eventTarget.tagName;
    return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        eventTarget.isContentEditable === true
    );
}

window.addEventListener("keydown", (event) => {
    // Evitar que Espacio pause el juego si el usuario está escribiendo en un input/textarea
    if (isTypingInTextField(event.target)) {
        return;
    }

    if (event.code === "Space") {
        event.preventDefault();
        togglePause();
        return;
    }

    if (event.code in keys) {
        event.preventDefault();
        keys[event.code] = true;
    }
});

window.addEventListener("keyup", (event) => {
    if (event.code in keys) {
        keys[event.code] = false;
    }
});

// Si la ventana pierde el foco, soltamos las teclas para que ningún jugador quede corriendo solo
window.addEventListener("blur", () => {
    for (const code in keys) {
        keys[code] = false;
    }
});

window.addEventListener("resize", resizeCanvasView);

// Botones de la interfaz
btnMode1P.addEventListener("click", () => startGame("1P"));
btnMode2P.addEventListener("click", () => startGame("2P"));
btnPause.addEventListener("click", () => {
    togglePause();
    btnPause.blur();
});
btnRestart.addEventListener("click", () => {
    startGame(gameState.mode);
    btnRestart.blur();
});
btnMenu.addEventListener("click", () => {
    gameState.isRunning = false;
    gameState.isPaused = false;
    menuOverlayEl.classList.add("active");
    btnMenu.blur();
});

// Inicializar vista adaptable y arrancar el ciclo de renderizado
resizeCanvasView();
resetPositions();
requestAnimationFrame(gameLoop);

