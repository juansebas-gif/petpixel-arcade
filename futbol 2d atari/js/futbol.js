/**
 * ============================================================================
 * FÚTBOL 2D ATARI — SISTEMA DE 10 PERSONAJES CON HABILIDADES ESPECIALES
 * ============================================================================
 * Evaluación Parcial 1 — Ingeniería Web
 * Tecnologías: HTML5 Canvas, JavaScript ES6+ Vanilla (Sin librerías externas)
 *
 * Arquitectura del sistema:
 *  1. Constantes del mundo y configuración física base
 *  2. Catálogo central de los 10 personajes y sus habilidades únicas
 *  3. Estado global de partida, entidades y listas reutilizables (sin basura de memoria)
 *  4. Flujo de selección de modo y selección de personajes (1P vs IA y 2P Local)
 *  5. Sistema de Turbo independiente (Shift Izq / Shift Der con barra de energía)
 *  6. Ciclo principal gameLoop(timestamp) con deltaTime limitado
 *  7. update(deltaTime): Controles, IA táctica, física de balón, habilidades y colisiones
 *  8. Detección y resolución de colisiones (incluye barreras de Constructor y clones)
 *  9. Detección geométrica de gol, celebraciones y reinicios limpios
 * 10. draw(): Renderizado retro arcade Atari en Canvas con efectos visuales para cada habilidad
 * ============================================================================
 */

"use strict";

// ============================================================================
// 1. CONSTANTES DEL MUNDO Y CONFIGURACIÓN FÍSICA BASE
// ============================================================================
const WORLD = {
    WIDTH: 960,
    HEIGHT: 560,
    FIELD_LEFT: 56,
    FIELD_RIGHT: 904,
    FIELD_TOP: 36,
    FIELD_BOTTOM: 524,
    CENTER_X: 480,
    CENTER_Y: 280,
    CENTER_RADIUS: 66,
    GOAL_DEPTH: 42,
    GOAL_WIDTH: 148,
    GOAL_TOP: 280 - 74,    // 206
    GOAL_BOTTOM: 280 + 74, // 354
    POST_RADIUS: 7
};

const PHYSICS = {
    MAX_DELTA: 0.05,            // Máximo 50 ms por fotograma para evitar saltos
    PLAYER_SPEED: 265,          // Velocidad estándar de los jugadores de campo
    GOALKEEPER_SPEED: 235,      // Velocidad de los arqueros
    TURBO_MULTIPLIER: 1.55,     // Multiplicador de velocidad al usar turbo
    TURBO_DRAIN_RATE: 38,       // Consumo de energía de turbo por segundo (0 a 100)
    TURBO_RECOVERY_RATE: 22,    // Recuperación de turbo por segundo
    BALL_FRICTION: 1.45,        // Desaceleración gradual por fricción con el césped
    BALL_MAX_SPEED: 820,        // Límite de velocidad del balón
    BALL_BOUNCE_WALL: 0.85,     // Restitución contra paredes y postes
    KICK_BASE_IMPULSE: 220,     // Impulso base al tocar el balón
    KICK_TRANSFER: 1.15,        // Transferencia de velocidad del jugador al balón
    GOAL_CELEBRATION_TIME: 1.75 // Duración del cartel de ¡GOL!
};

// ============================================================================
// 2. CATÁLOGO CENTRAL DE LOS 10 PERSONAJES Y SUS HABILIDADES
// ============================================================================
const CHARACTERS = {
    velocista: {
        id: "velocista",
        name: "VELOCISTA",
        skillName: "Sandevistan",
        desc: "Sandevistan: Dilatación temporal durante 3s que ralentiza al rival, arqueros y balón a cámara lenta (0.28x) mientras tú te mueves a velocidad normal.",
        icon: "⚡",
        color: "#ffe600",
        stroke: "#fff799",
        cooldown: 8.5,
        duration: 3.0,
        onActivate(player, opponent, ball, match) {
            player.skillActiveTimer = this.duration;
            match.triggerArcadeNotice(player, "¡SANDEVISTAN — DILATACIÓN TEMPORAL!");
        },
        onUpdate(player, opponent, ball, match, dt) {
            if (player.skillActiveTimer > 0) {
                // Registrar estelas cromáticas (amarillo neón y cian cyberpunk)
                if (!player.afterimages) player.afterimages = [];
                const color = player.afterimages.length % 2 === 0 ? "rgba(0, 240, 255, " : "rgba(255, 230, 0, ";
                player.afterimages.push({ x: player.x, y: player.y, alpha: 0.85, color });
                if (player.afterimages.length > 9) player.afterimages.shift();
            }
        },
        getSpeedMultiplier(player) {
            return player.skillActiveTimer > 0 ? 1.25 : 1.0;
        },
        onDraw(player, ctx) {
            if (player.afterimages && player.afterimages.length > 0) {
                for (let i = 0; i < player.afterimages.length; i++) {
                    const img = player.afterimages[i];
                    img.alpha -= 0.035;
                    if (img.alpha > 0.04) {
                        ctx.fillStyle = `${img.color}${img.alpha * 0.45})`;
                        ctx.beginPath();
                        ctx.arc(img.x, img.y, player.radius, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.strokeStyle = `${img.color}${img.alpha * 0.7})`;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }
                }
            }
        },
        aiShouldActivate(player, opponent, ball, match) {
            const distBall = Math.hypot(ball.x - player.x, ball.y - player.y);
            return distBall > 180 || (ball.x < WORLD.CENTER_X && player.team === "orange");
        }
    },

    constructor: {
        id: "constructor",
        name: "CONSTRUCTOR",
        skillName: "Barrera",
        desc: "Coloca una barrera temporal de 5s que bloquea el balón y a los jugadores.",
        icon: "🧱",
        color: "#ff9f1a",
        stroke: "#ffd599",
        cooldown: 10.0,
        duration: 5.0,
        onActivate(player, opponent, ball, match) {
            // Desplegar barrera frente al jugador según su dirección o equipo
            const forwardX = player.team === "blue" ? 48 : -48;
            let barX = player.x + forwardX;
            let barY = player.y;

            // Restricción: No colocar dentro de la portería ni fuera del campo
            barX = Math.max(WORLD.FIELD_LEFT + 40, Math.min(WORLD.FIELD_RIGHT - 40, barX));
            barY = Math.max(WORLD.FIELD_TOP + 35, Math.min(WORLD.FIELD_BOTTOM - 35, barY));

            match.barriers.push({
                x: barX,
                y: barY,
                width: 14,
                height: 64,
                duration: this.duration,
                maxDuration: this.duration,
                team: player.team,
                color: player.team === "blue" ? "#2998ff" : "#ff7824"
            });
            match.triggerArcadeNotice(player, "¡BARRERA DESPLEGADA!");
        },
        onUpdate(player, opponent, ball, match, dt) {},
        aiShouldActivate(player, opponent, ball, match) {
            // La IA levanta la barrera cuando el rival azul se acerca peligrosamente a su arco
            return ball.x > WORLD.CENTER_X + 100 && player.x > ball.x;
        }
    },

    clonador: {
        id: "clonador",
        name: "CLONADOR",
        skillName: "Duplicación",
        desc: "Genera un clon temporal de 4.5s que intercepta el balón y distrae al rival.",
        icon: "👥",
        color: "#00d2d3",
        stroke: "#a4f5f5",
        cooldown: 11.0,
        duration: 4.5,
        onActivate(player, opponent, ball, match) {
            match.clones.push({
                team: player.team,
                x: player.x,
                y: player.y + (player.y > WORLD.CENTER_Y ? -45 : 45),
                vx: 0,
                vy: 0,
                radius: player.radius,
                color: "#00d2d3",
                duration: this.duration,
                maxDuration: this.duration,
                speed: PHYSICS.PLAYER_SPEED * 0.95
            });
            match.triggerArcadeNotice(player, "¡DUPLICACIÓN!");
        },
        onUpdate(player, opponent, ball, match, dt) {},
        aiShouldActivate(player, opponent, ball, match) {
            return match.clones.length === 0 && Math.abs(ball.x - WORLD.CENTER_X) < 200;
        }
    },

    tirador: {
        id: "tirador",
        name: "TIRADOR",
        skillName: "Recarga Perfecta",
        desc: "Barra estilo Gears of War: pulsa en la zona perfecta para +100% potencia y turbo.",
        icon: "🎯",
        color: "#2ecc71",
        stroke: "#a9dfbf",
        cooldown: 7.5,
        duration: 1.1,
        onActivate(player, opponent, ball, match) {
            // Si la barra ya está corriendo, pulsar nuevamente evalúa la recarga perfecta
            if (player.activeReload && player.activeReload.active) {
                const prog = player.activeReload.progress;
                // Zona perfecta entre 0.60 y 0.80
                if (prog >= 0.60 && prog <= 0.80) {
                    player.superShotActive = true;
                    player.perfectBuffTimer = 3.0;
                    player.activeReload.active = false;
                    match.triggerArcadeNotice(player, "¡RECARGA PERFECTA!");
                } else {
                    player.minorBuffTimer = 2.0;
                    player.activeReload.active = false;
                    match.triggerArcadeNotice(player, "RECARGA NORMAL");
                }
                return;
            }

            // Iniciar la barra de recarga activa
            player.activeReload = {
                active: true,
                progress: 0,
                speed: 1.15 // Duración aprox 1.1s
            };
            match.triggerArcadeNotice(player, "¡RECARGA ACTIVA!");
        },
        onUpdate(player, opponent, ball, match, dt) {
            if (player.activeReload && player.activeReload.active) {
                player.activeReload.progress += player.activeReload.speed * dt;
                if (player.activeReload.progress >= 1.0) {
                    player.activeReload.active = false;
                    player.minorBuffTimer = 1.5;
                }
            }
            if (player.perfectBuffTimer > 0) player.perfectBuffTimer -= dt;
            if (player.minorBuffTimer > 0) player.minorBuffTimer -= dt;
        },
        getSpeedMultiplier(player) {
            return player.perfectBuffTimer > 0 ? 1.35 : 1.0;
        },
        onBallKick(player, ball, kickInfo) {
            if (player.superShotActive || player.perfectBuffTimer > 0) {
                ball.vx *= 1.85;
                ball.vy *= 1.85;
                player.superShotActive = false;
            }
        },
        onDraw(player, ctx) {
            // Dibujar la barra de recarga activa flotando sobre el jugador
            if (player.activeReload && player.activeReload.active) {
                const bw = 54;
                const bh = 8;
                const bx = player.x - bw / 2;
                const by = player.y - player.radius - 20;

                // Fondo gris
                ctx.fillStyle = "#111622";
                ctx.fillRect(bx, by, bw, bh);
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, by, bw, bh);

                // Zona perfecta (60% al 80%) en verde brillante
                ctx.fillStyle = "#2ecc71";
                ctx.fillRect(bx + bw * 0.60, by, bw * 0.20, bh);

                // Aguja indicadora
                const needleX = bx + bw * player.activeReload.progress;
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(needleX - 1.5, by - 2, 3, bh + 4);
            }
        },
        aiShouldActivate(player, opponent, ball, match) {
            if (player.activeReload && player.activeReload.active) {
                // La IA pulsa con precisión justo en la zona perfecta
                return player.activeReload.progress >= 0.65;
            }
            const distBall = Math.hypot(ball.x - player.x, ball.y - player.y);
            return distBall < 140;
        }
    },

    lanzador: {
        id: "lanzador",
        name: "LANZADOR",
        skillName: "Agarre y Lanzamiento",
        desc: "Agarra al rival cercano y lo arroja aturdiéndolo por 1.2s.",
        icon: "🤼",
        color: "#e74c3c",
        stroke: "#f5b7b1",
        cooldown: 11.0,
        duration: 0.4,
        onActivate(player, opponent, ball, match) {
            const dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);
            if (dist > 80) {
                match.triggerArcadeNotice(player, "¡RIVAL FUERA DE ALCANCE!");
                return;
            }
            if (opponent.grabImmunityTimer > 0) {
                match.triggerArcadeNotice(player, "¡RIVAL INMUNE!");
                return;
            }

            // Dirección del lanzamiento: alejándolo hacia su propio campo
            const throwDirX = player.team === "blue" ? 1 : -1;
            opponent.x += throwDirX * 145;
            opponent.y += (opponent.y < WORLD.CENTER_Y ? 35 : -35);

            // Evitar que caiga fuera del campo o dentro de la portería
            clampEntityToField(opponent, opponent.radius);

            // Aturdimiento e inmunidad anti-bucle
            opponent.stunTimer = 1.2;
            opponent.grabImmunityTimer = 4.0;
            match.triggerArcadeNotice(player, "¡RIVAL LANZADO!");
        },
        onUpdate(player, opponent, ball, match, dt) {},
        aiShouldActivate(player, opponent, ball, match) {
            const dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);
            return dist < 75 && opponent.grabImmunityTimer <= 0;
        }
    },

    iman: {
        id: "iman",
        name: "IMÁN",
        skillName: "Atracción",
        desc: "Ejerce una fuerza magnética gradual que atrae la pelota durante 3 segundos.",
        icon: "🧲",
        color: "#9b59b6",
        stroke: "#d7bde2",
        cooldown: 9.0,
        duration: 3.0,
        onActivate(player, opponent, ball, match) {
            player.skillActiveTimer = this.duration;
            match.triggerArcadeNotice(player, "¡CAMPO MAGNÉTICO!");
        },
        onUpdate(player, opponent, ball, match, dt) {
            if (player.skillActiveTimer > 0) {
                const dx = player.x - ball.x;
                const dy = player.y - ball.y;
                const dist = Math.hypot(dx, dy);

                if (dist > 18 && dist < 380) {
                    const pullPower = 420;
                    const force = (pullPower / Math.max(dist, 50)) * 60;
                    ball.vx += (dx / dist) * force * dt;
                    ball.vy += (dy / dist) * force * dt;
                }
            }
        },
        onDraw(player, ctx) {
            if (player.skillActiveTimer > 0) {
                const pulse = (Date.now() % 600) / 600;
                ctx.strokeStyle = `rgba(155, 89, 182, ${1 - pulse})`;
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(player.x, player.y, player.radius + pulse * 65, 0, Math.PI * 2);
                ctx.stroke();
            }
        },
        aiShouldActivate(player, opponent, ball, match) {
            const dist = Math.hypot(ball.x - player.x, ball.y - player.y);
            return dist > 70 && dist < 280;
        }
    },

    fantasma: {
        id: "fantasma",
        name: "FANTASMA",
        skillName: "Intangibilidad",
        desc: "Atraviesa temporalmente a otros jugadores durante 3.2s sin perder el balón.",
        icon: "👻",
        color: "#ecf0f1",
        stroke: "#bdc3c7",
        cooldown: 8.5,
        duration: 3.2,
        onActivate(player, opponent, ball, match) {
            player.skillActiveTimer = this.duration;
            player.isGhost = true;
            match.triggerArcadeNotice(player, "¡INTANGIBILIDAD!");
        },
        onUpdate(player, opponent, ball, match, dt) {
            player.isGhost = player.skillActiveTimer > 0;
        },
        onDraw(player, ctx) {
            if (player.isGhost) {
                ctx.strokeStyle = "rgba(236, 240, 241, 0.7)";
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(player.x, player.y, player.radius + 6, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        },
        aiShouldActivate(player, opponent, ball, match) {
            const distOpponent = Math.hypot(opponent.x - player.x, opponent.y - player.y);
            return distOpponent < 65;
        }
    },

    rebotador: {
        id: "rebotador",
        name: "REBOTADOR",
        skillName: "Disparo Especial",
        desc: "Tu siguiente golpe al balón adquiere hiperfuerza y rebote superelástico.",
        icon: "💥",
        color: "#ff3366",
        stroke: "#ff99bb",
        cooldown: 9.0,
        duration: 5.0,
        onActivate(player, opponent, ball, match) {
            player.skillActiveTimer = this.duration;
            player.hasReboundShot = true;
            match.triggerArcadeNotice(player, "¡DISPARO ESPECIAL CARGADO!");
        },
        onUpdate(player, opponent, ball, match, dt) {
            if (player.skillActiveTimer <= 0) {
                player.hasReboundShot = false;
            }
        },
        onBallKick(player, ball, kickInfo) {
            if (player.hasReboundShot) {
                ball.vx *= 1.75;
                ball.vy *= 1.75;
                ball.reboundActiveTimer = 2.8;
                player.hasReboundShot = false;
                player.skillActiveTimer = 0;
            }
        },
        onDraw(player, ctx) {
            if (player.hasReboundShot) {
                ctx.strokeStyle = "#ff3366";
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(player.x, player.y, player.radius + 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        },
        aiShouldActivate(player, opponent, ball, match) {
            const dist = Math.hypot(ball.x - player.x, ball.y - player.y);
            return dist < 65;
        }
    },

    ancla: {
        id: "ancla",
        name: "ANCLA",
        skillName: "Fortaleza",
        desc: "Acoraza al jugador durante 3.5s: inamovible, empuja rivales y bloquea el balón.",
        icon: "⚓",
        color: "#7f8c8d",
        stroke: "#bdc3c7",
        cooldown: 9.0,
        duration: 3.5,
        onActivate(player, opponent, ball, match) {
            player.skillActiveTimer = this.duration;
            player.isAnchor = true;
            match.triggerArcadeNotice(player, "¡FORTALEZA ACTIVA!");
        },
        onUpdate(player, opponent, ball, match, dt) {
            player.isAnchor = player.skillActiveTimer > 0;
        },
        onDraw(player, ctx) {
            if (player.isAnchor) {
                ctx.strokeStyle = "#95a5a6";
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
                ctx.stroke();
            }
        },
        aiShouldActivate(player, opponent, ball, match) {
            const dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);
            return dist < 60;
        }
    },

    intercambiador: {
        id: "intercambiador",
        name: "INTERCAMBIADOR",
        skillName: "Cambio de Posición",
        desc: "Intercambia tu posición instantáneamente con el rival dentro de 380px.",
        icon: "🔄",
        color: "#8e44ad",
        stroke: "#bb8fce",
        cooldown: 12.0,
        duration: 0.1,
        onActivate(player, opponent, ball, match) {
            const dist = Math.hypot(opponent.x - player.x, opponent.y - player.y);
            if (dist > 380) {
                match.triggerArcadeNotice(player, "¡RIVAL MUY LEJOS!");
                return;
            }
            if (opponent.swapImmunityTimer > 0) {
                match.triggerArcadeNotice(player, "¡ENFRIAMIENTO DE TELETRANSPORTE!");
                return;
            }

            // Efecto visual de teletransporte en ambas posiciones
            match.teleportFlashes.push({ x: player.x, y: player.y, timer: 0.4 });
            match.teleportFlashes.push({ x: opponent.x, y: opponent.y, timer: 0.4 });

            // Intercambiar coordenadas X, Y
            const tempX = player.x;
            const tempY = player.y;
            player.x = opponent.x;
            player.y = opponent.y;
            opponent.x = tempX;
            opponent.y = tempY;

            // Restringir a ambos dentro del terreno y fuera de arcos
            clampEntityToField(player, player.radius);
            clampEntityToField(opponent, opponent.radius);

            opponent.swapImmunityTimer = 4.0;
            player.swapImmunityTimer = 4.0;
            match.triggerArcadeNotice(player, "¡INTERCAMBIO DE POSICIÓN!");
        },
        onUpdate(player, opponent, ball, match, dt) {},
        aiShouldActivate(player, opponent, ball, match) {
            // La IA intercambia si el rival azul está mucho más cerca de la portería naranja que ella
            return opponent.x > WORLD.CENTER_X + 120 && player.x < opponent.x - 80;
        }
    }
};

// ============================================================================
// 3. ESTADO GLOBAL DE PARTIDA Y ENTIDADES PREASIGNADAS
// ============================================================================
const gameState = {
    mode: "1P",                // "1P" o "2P"
    isRunning: false,          // true cuando la partida está en juego
    isPaused: false,           // true cuando se pausa el juego
    isGoalCooldown: false,     // Cooldown tras gol para evitar conteos duplicados
    goalTimer: 0,
    goalBannerText: "",
    goalBannerColor: "#fff",
    scoreBlue: 0,
    scoreOrange: 0,
    lastTimestamp: 0,
    // Persistencia y control de partido
    TARGET_GOALS: 3,           // Primer equipo en llegar a 3 goles gana el partido
    matchStartTime: 0,         // Timestamp de inicio para calcular duración
    matchDurationSeconds: 0,   // Segundos acumulados efectivos de juego
    isMatchOver: false,        // Indica si el partido terminó
    // Aviso arcade temporal en canvas
    arcadeNotice: { text: "", color: "#fff", timer: 0 }
};

// Colecciones dinámicas pero reutilizadas del partido
const match = {
    barriers: [],
    clones: [],
    teleportFlashes: [],
    triggerArcadeNotice(player, text) {
        gameState.arcadeNotice.text = text;
        gameState.arcadeNotice.color = player.team === "blue" ? "#2998ff" : "#ff7824";
        gameState.arcadeNotice.timer = 1.3;
    }
};

// Teclas registradas
const keys = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ShiftLeft: false,
    KeyE: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    ShiftRight: false,
    Enter: false
};

// ============================================================================
// CÓDIGO SECRETO "balto": Habilidad especial sin enfriamiento para J1
// ============================================================================
const secretBaltoCode = {
    target: "balto",
    buffer: "",
    active: false,
    goalsCount: 0
};

// Entidad del balón
const ball = {
    x: WORLD.CENTER_X,
    y: WORLD.CENTER_Y,
    vx: 0,
    vy: 0,
    radius: 11,
    reboundActiveTimer: 0
};

// 4 Participantes fijos en cancha
const players = {
    blueField: {
        team: "blue",
        role: "field",
        charId: "velocista",
        x: 290,
        y: WORLD.CENTER_Y,
        vx: 0,
        vy: 0,
        radius: 19,
        turboEnergy: 100,
        skillCooldownTimer: 0,
        skillActiveTimer: 0,
        stunTimer: 0,
        grabImmunityTimer: 0,
        swapImmunityTimer: 0,
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
        minX: WORLD.FIELD_LEFT + 14,
        maxX: WORLD.FIELD_LEFT + 125,
        minY: WORLD.GOAL_TOP - 36,
        maxY: WORLD.GOAL_BOTTOM + 36
    },
    orangeField: {
        team: "orange",
        role: "field",
        charId: "constructor",
        x: 670,
        y: WORLD.CENTER_Y,
        vx: 0,
        vy: 0,
        radius: 19,
        turboEnergy: 100,
        skillCooldownTimer: 0,
        skillActiveTimer: 0,
        stunTimer: 0,
        grabImmunityTimer: 0,
        swapImmunityTimer: 0,
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

const playerList = [
    players.blueField,
    players.blueKeeper,
    players.orangeField,
    players.orangeKeeper
];

const goalPosts = [
    { x: WORLD.FIELD_LEFT,  y: WORLD.GOAL_TOP,    radius: WORLD.POST_RADIUS },
    { x: WORLD.FIELD_LEFT,  y: WORLD.GOAL_BOTTOM, radius: WORLD.POST_RADIUS },
    { x: WORLD.FIELD_RIGHT, y: WORLD.GOAL_TOP,    radius: WORLD.POST_RADIUS },
    { x: WORLD.FIELD_RIGHT, y: WORLD.GOAL_BOTTOM, radius: WORLD.POST_RADIUS }
];

// ============================================================================
// 4. ELEMENTOS DEL DOM Y CONFIGURACIÓN INICIAL
// ============================================================================
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const stageWrapper = document.getElementById("stage-wrapper");
const aspectBox = document.querySelector(".canvas-aspect-box");

// HUD Elementos
const scoreBlueEl = document.getElementById("score-blue");
const scoreOrangeEl = document.getElementById("score-orange");
const modeIndicatorEl = document.getElementById("mode-indicator");

const hudJ1Icon = document.getElementById("hud-j1-icon");
const hudJ1Name = document.getElementById("hud-j1-name");
const hudJ1Turbo = document.getElementById("hud-j1-turbo");
const hudJ1SkillFill = document.getElementById("hud-j1-skill-fill");
const hudJ1SkillText = document.getElementById("hud-j1-skill-text");

const hudJ2Icon = document.getElementById("hud-j2-icon");
const hudJ2Name = document.getElementById("hud-j2-name");
const hudJ2Tag = document.getElementById("hud-j2-tag");
const hudJ2Key = document.getElementById("hud-j2-key");
const hudJ2Turbo = document.getElementById("hud-j2-turbo");
const hudJ2SkillFill = document.getElementById("hud-j2-skill-fill");
const hudJ2SkillText = document.getElementById("hud-j2-skill-text");

// Botones y Overlays
const btnPause = document.getElementById("btn-pause");
const btnRestart = document.getElementById("btn-restart");
const btnFinishMatch = document.getElementById("btn-finish-match");
const btnChangeChars = document.getElementById("btn-change-chars");

// Modal Fin de Partido
const matchOverOverlay = document.getElementById("match-over-overlay");
const moTitle = document.getElementById("mo-title");
const moScoreBlue = document.getElementById("mo-score-blue");
const moScoreOrange = document.getElementById("mo-score-orange");
const moMode = document.getElementById("mo-mode");
const moDuration = document.getElementById("mo-duration");
const moP1 = document.getElementById("mo-p1");
const moP2 = document.getElementById("mo-p2");
const btnMoRematch = document.getElementById("btn-mo-rematch");
const btnMoChange = document.getElementById("btn-mo-change");

const modeOverlayEl = document.getElementById("mode-overlay");
const btnMode1P = document.getElementById("btn-mode-1p");
const btnMode2P = document.getElementById("btn-mode-2p");

const charOverlayEl = document.getElementById("char-overlay");
const charGridEl = document.getElementById("char-grid");
const charSelectionTitle = document.getElementById("char-selection-title");
const charTurnBadge = document.getElementById("char-turn-badge");

const slotBlueName = document.getElementById("slot-blue-name");
const slotBlueSkill = document.getElementById("slot-blue-skill");
const slotOrangeTag = document.getElementById("slot-orange-tag");
const slotOrangeName = document.getElementById("slot-orange-name");
const slotOrangeSkill = document.getElementById("slot-orange-skill");

const btnBackMode = document.getElementById("btn-back-mode");
const btnStartMatch = document.getElementById("btn-start-match");

// Variables de estado de selección de personajes
let selectionTurn = "blue"; // "blue" o "orange"
let tempBlueChar = "velocista";
let tempOrangeChar = "constructor";

// ============================================================================
// 5. PANTALLA Y SELECCIÓN DE PERSONAJES
// ============================================================================

/**
 * Renderiza la grilla de selección con los 10 personajes.
 */
function buildCharacterGrid() {
    charGridEl.innerHTML = "";
    const charKeys = Object.keys(CHARACTERS);

    charKeys.forEach((key) => {
        const c = CHARACTERS[key];
        const card = document.createElement("div");
        card.className = "char-card";
        card.dataset.charId = c.id;

        const isBlueSelected = tempBlueChar === c.id;
        const isOrangeSelected = tempOrangeChar === c.id;

        if (isBlueSelected) card.classList.add("selected-blue");
        if (isOrangeSelected) card.classList.add("selected-orange");

        card.innerHTML = `
            <div class="char-card-icon" style="color:${c.color}">${c.icon}</div>
            <div class="char-card-name">${c.name}</div>
            <div class="char-card-skill">${c.skillName}</div>
            <div class="char-card-desc">${c.desc}</div>
            <div class="char-card-meta">Recarga: ${c.cooldown}s</div>
            ${isBlueSelected ? '<span class="char-card-badge badge-blue">J1</span>' : ''}
            ${isOrangeSelected ? '<span class="char-card-badge badge-orange">' + (gameState.mode === "1P" ? "IA" : "J2") + '</span>' : ''}
        `;

        card.addEventListener("click", () => handleCharacterCardClick(c.id));
        charGridEl.appendChild(card);
    });

    updateSelectionSummaryUI();
}

/**
 * Gestiona el clic en una tarjeta de personaje según el turno.
 */
function handleCharacterCardClick(charId) {
    if (selectionTurn === "blue") {
        tempBlueChar = charId;
        if (gameState.mode === "2P") {
            selectionTurn = "orange";
            charSelectionTitle.textContent = "SELECCIONA EL PERSONAJE DE JUGADOR 2";
            charTurnBadge.textContent = "TURNO: JUGADOR 2 (NARANJA)";
            charTurnBadge.classList.add("turn-orange");
        }
    } else {
        tempOrangeChar = charId;
        if (gameState.mode === "2P") {
            selectionTurn = "blue";
            charSelectionTitle.textContent = "SELECCIONA EL PERSONAJE DE JUGADOR 1";
            charTurnBadge.textContent = "TURNO: JUGADOR 1 (AZUL)";
            charTurnBadge.classList.remove("turn-orange");
        }
    }
    buildCharacterGrid();
}

/**
 * Actualiza el resumen visual inferior de la pantalla de selección.
 */
function updateSelectionSummaryUI() {
    const blueC = CHARACTERS[tempBlueChar];
    const orangeC = CHARACTERS[tempOrangeChar];

    slotBlueName.textContent = blueC.name;
    slotBlueSkill.textContent = `${blueC.skillName} (Recarga: ${blueC.cooldown}s)`;

    slotOrangeTag.textContent = gameState.mode === "1P" ? "RIVAL (IA)" : "JUGADOR 2 (NARANJA)";
    slotOrangeName.textContent = orangeC.name;
    slotOrangeSkill.textContent = `${orangeC.skillName} (Recarga: ${orangeC.cooldown}s)`;
}

/**
 * Abre el selector de personajes para el modo configurado.
 */
function openCharacterSelect(mode) {
    gameState.mode = mode;
    modeOverlayEl.classList.remove("active");
    charOverlayEl.classList.add("active");

    selectionTurn = "blue";
    charSelectionTitle.textContent = gameState.mode === "1P"
        ? "SELECCIONA TU PERSONAJE"
        : "SELECCIONA EL PERSONAJE DE JUGADOR 1";
    charTurnBadge.textContent = "TURNO: JUGADOR 1 (AZUL)";
    charTurnBadge.classList.remove("turn-orange");

    // En 1P, asignar un rival complementario automáticamente
    if (gameState.mode === "1P" && tempBlueChar === tempOrangeChar) {
        tempOrangeChar = tempBlueChar === "velocista" ? "constructor" : "velocista";
    }

    buildCharacterGrid();
}

// ============================================================================
// 6. INICIO, PAUSA Y REINICIO DE PARTIDA
// ============================================================================

/**
 * Inicia la partida con los personajes y modos seleccionados.
 */
function startMatch() {
    players.blueField.charId = tempBlueChar;
    players.orangeField.charId = tempOrangeChar;

    gameState.scoreBlue = 0;
    gameState.scoreOrange = 0;
    gameState.isPaused = false;
    gameState.isGoalCooldown = false;
    gameState.goalTimer = 0;
    gameState.isRunning = true;
    gameState.isMatchOver = false;
    gameState.matchStartTime = Date.now();
    gameState.matchDurationSeconds = 0;

    // Resetear código secreto Balto
    secretBaltoCode.active = false;
    secretBaltoCode.goalsCount = 0;
    secretBaltoCode.buffer = "";

    if (matchOverOverlay) matchOverOverlay.classList.remove("active");
    if (btnFinishMatch) btnFinishMatch.style.display = "inline-block";

    // Limpiar entidades temporales
    match.barriers = [];
    match.clones = [];
    match.teleportFlashes = [];

    // Resetear contadores de habilidades
    players.blueField.skillCooldownTimer = 0;
    players.blueField.skillActiveTimer = 0;
    players.blueField.turboEnergy = 100;
    players.blueField.stunTimer = 0;

    players.orangeField.skillCooldownTimer = 0;
    players.orangeField.skillActiveTimer = 0;
    players.orangeField.turboEnergy = 100;
    players.orangeField.stunTimer = 0;

    charOverlayEl.classList.remove("active");
    modeOverlayEl.classList.remove("active");

    // Configurar HUD
    const blueC = CHARACTERS[tempBlueChar];
    const orangeC = CHARACTERS[tempOrangeChar];

    hudJ1Icon.textContent = blueC.icon;
    hudJ1Name.textContent = blueC.name;

    hudJ2Icon.textContent = orangeC.icon;
    hudJ2Name.textContent = orangeC.name;
    hudJ2Tag.textContent = gameState.mode === "1P" ? "RIVAL (IA)" : "JUGADOR 2 (NARANJA)";
    hudJ2Key.textContent = gameState.mode === "1P" ? "[IA]" : "[ENTER]";

    modeIndicatorEl.textContent = gameState.mode === "1P" ? "1P VS IA" : "2 JUGADORES";
    btnPause.textContent = "PAUSA (ESPACIO)";

    updateScoreboardDOM();
    resetPositions();
}

/**
 * Coloca los participantes y el balón en su posición inicial de saque.
 */
function resetPositions() {
    ball.x = WORLD.CENTER_X;
    ball.y = WORLD.CENTER_Y;
    ball.vx = 0;
    ball.vy = 0;
    ball.reboundActiveTimer = 0;

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
 * Limpia y reanuda el juego tras un gol.
 */
function resetAfterGoal() {
    resetPositions();
    match.barriers = [];
    match.clones = [];
    gameState.isGoalCooldown = false;
    gameState.goalTimer = 0;
    gameState.goalBannerText = "";
}

/**
 * Alterna el estado de pausa.
 */
function togglePause() {
    if (!gameState.isRunning) return;
    gameState.isPaused = !gameState.isPaused;
    btnPause.textContent = gameState.isPaused ? "REANUDAR (ESPACIO)" : "PAUSA (ESPACIO)";
}

function updateScoreboardDOM() {
    scoreBlueEl.textContent = String(gameState.scoreBlue);
    scoreOrangeEl.textContent = String(gameState.scoreOrange);
}

// ============================================================================
// 7. GAME LOOP PRINCIPAL (requestAnimationFrame + deltaTime)
// ============================================================================
function gameLoop(timestamp) {
    if (gameState.lastTimestamp === 0) {
        gameState.lastTimestamp = timestamp;
    }

    let deltaTime = (timestamp - gameState.lastTimestamp) / 1000;
    gameState.lastTimestamp = timestamp;

    if (deltaTime > PHYSICS.MAX_DELTA) deltaTime = PHYSICS.MAX_DELTA;
    if (deltaTime < 0) deltaTime = 0;

    update(deltaTime);
    draw();

    requestAnimationFrame(gameLoop);
}

/**
 * Actualiza la simulación física, entradas, IA, habilidades y colisiones.
 */
function update(deltaTime) {
    if (!gameState.isRunning || gameState.isPaused || gameState.isMatchOver) {
        return;
    }

    gameState.matchDurationSeconds += deltaTime;

    // Actualizar aviso arcade en pantalla
    if (gameState.arcadeNotice.timer > 0) {
        gameState.arcadeNotice.timer -= deltaTime;
    }

    // Si se acaba de anotar un gol, celebrar y esperar el saque
    if (gameState.isGoalCooldown) {
        gameState.goalTimer -= deltaTime;
        updateBall(deltaTime);
        resolveBallWallCollisions();
        if (gameState.goalTimer <= 0) {
            if (gameState.scoreBlue >= gameState.TARGET_GOALS || gameState.scoreOrange >= gameState.TARGET_GOALS) {
                const winner = gameState.scoreBlue > gameState.scoreOrange ? "blue" : "orange";
                finishMatch(winner);
            } else {
                resetAfterGoal();
            }
        }
        return;
    }

    // 1. Detección de Dilatación Temporal (Sandevistan)
    const blueSandevistan = (players.blueField.charId === "velocista" && players.blueField.skillActiveTimer > 0);
    const orangeSandevistan = (players.orangeField.charId === "velocista" && players.orangeField.skillActiveTimer > 0);

    const SLOW_FACTOR = 0.28; // 28% de la velocidad normal para simular cámara lenta
    let dtBlue = deltaTime;
    let dtOrange = deltaTime;
    let dtKeepers = deltaTime;
    let dtBall = deltaTime;
    let dtWorld = deltaTime;

    if (blueSandevistan && !orangeSandevistan) {
        // J1 activa Sandevistan: se mueve a tiempo normal y TODO lo demás va en cámara lenta
        dtOrange *= SLOW_FACTOR;
        dtKeepers *= SLOW_FACTOR;
        dtBall *= SLOW_FACTOR;
        dtWorld *= SLOW_FACTOR;
    } else if (orangeSandevistan && !blueSandevistan) {
        // J2 / IA activa Sandevistan: se mueve a tiempo normal y el resto va en cámara lenta
        dtBlue *= SLOW_FACTOR;
        dtKeepers *= SLOW_FACTOR;
        dtBall *= SLOW_FACTOR;
        dtWorld *= SLOW_FACTOR;
    } else if (blueSandevistan && orangeSandevistan) {
        // Ambos velocistas activos: ambos van a tiempo normal, pelota y arqueros en cámara lenta
        dtKeepers *= SLOW_FACTOR;
        dtBall *= SLOW_FACTOR;
        dtWorld *= SLOW_FACTOR;
    }

    // 2. Actualizar sistema de turbo y recargas de los jugadores (avanzan en tiempo real)
    updatePlayerStatus(players.blueField, deltaTime);
    updatePlayerStatus(players.orangeField, deltaTime);

    // 3. Actualizar controles humanos (J1 con dtBlue, J2 con dtOrange, arqueros con dtKeepers)
    updatePlayer(dtBlue, dtOrange, dtKeepers);

    // 4. Actualizar IA si está en modo 1P (con dtOrange y dtKeepers)
    if (gameState.mode === "1P") {
        updateAI(dtOrange, dtKeepers);
    }

    // 5. Actualizar entidades temporales (barreras y clones con dtWorld)
    updateMatchEntities(dtWorld);

    // 6. Actualizar física del balón (con dtBall)
    updateBall(dtBall);

    // 7. Resolver todas las colisiones
    resolveCollisions();

    // 8. Verificar gol
    checkGoal();

    // 9. Refrescar barras del HUD
    updateHUDDOM();
}

// ============================================================================
// 8. SISTEMA DE HABILIDADES, TURBO Y CONTROLES
// ============================================================================

/**
 * Dispara la habilidad del personaje si el jugador no está aturdido ni en recarga.
 */
function triggerCharacterSkill(player, opponent) {
    if (player.stunTimer > 0) return;

    const charDef = CHARACTERS[player.charId];
    if (!charDef) return;

    // Caso especial del Tirador: Si ya activó la barra, pulsar de nuevo realiza la comprobación
    if (player.charId === "tirador" && player.activeReload && player.activeReload.active) {
        charDef.onActivate(player, opponent, ball, match);
        return;
    }

    // Comprobar si la habilidad está lista o si el código secreto "balto" está activo
    const isBalto = (player.team === "blue" && secretBaltoCode.active);
    if (player.skillCooldownTimer <= 0 || isBalto) {
        charDef.onActivate(player, opponent, ball, match);
        player.skillCooldownTimer = isBalto ? 0 : charDef.cooldown;
    }
}

/**
 * Gestiona el enfriamiento de habilidades, duración activa, inmunidades y turbo.
 */
function updatePlayerStatus(player, dt) {
    // Cooldown de la habilidad (si Balto está activo en J1 se mantiene en 0)
    if (player.team === "blue" && secretBaltoCode.active) {
        player.skillCooldownTimer = 0;
    } else if (player.skillCooldownTimer > 0) {
        player.skillCooldownTimer -= dt;
        if (player.skillCooldownTimer < 0) player.skillCooldownTimer = 0;
    }

    // Temporizador de duración de habilidad activa
    if (player.skillActiveTimer > 0) {
        player.skillActiveTimer -= dt;
        if (player.skillActiveTimer < 0) player.skillActiveTimer = 0;
    }

    // Aturdimiento
    if (player.stunTimer > 0) {
        player.stunTimer -= dt;
        if (player.stunTimer < 0) player.stunTimer = 0;
    }

    // Inmunidades anti-bucle de agarre o intercambio
    if (player.grabImmunityTimer > 0) player.grabImmunityTimer -= dt;
    if (player.swapImmunityTimer > 0) player.swapImmunityTimer -= dt;

    // Ejecutar lógica por fotograma del personaje
    const charDef = CHARACTERS[player.charId];
    if (charDef && charDef.onUpdate) {
        const opponent = player.team === "blue" ? players.orangeField : players.blueField;
        charDef.onUpdate(player, opponent, ball, match, dt);
    }
}

/**
 * Procesa el movimiento y turbo de los jugadores humanos.
 * Respeta la dilatación temporal de Sandevistan según dtBlue, dtOrange y dtKeepers.
 */
function updatePlayer(dtBlue, dtOrange, dtKeepers) {
    // --- JUGADOR 1 (AZUL) ---
    if (players.blueField.stunTimer <= 0) {
        let dirX = 0;
        let dirY = 0;
        if (keys.KeyW) dirY -= 1;
        if (keys.KeyS) dirY += 1;
        if (keys.KeyA) dirX -= 1;
        if (keys.KeyD) dirX += 1;

        // Turbo con Shift Izquierdo
        const isTurbo = keys.ShiftLeft && players.blueField.turboEnergy > 5;
        if (isTurbo) {
            players.blueField.turboEnergy -= PHYSICS.TURBO_DRAIN_RATE * dtBlue;
        } else {
            players.blueField.turboEnergy = Math.min(100, players.blueField.turboEnergy + PHYSICS.TURBO_RECOVERY_RATE * dtBlue);
        }

        const charDef = CHARACTERS[players.blueField.charId];
        const charMult = charDef && charDef.getSpeedMultiplier ? charDef.getSpeedMultiplier(players.blueField) : 1.0;
        const totalSpeed = PHYSICS.PLAYER_SPEED * (isTurbo ? PHYSICS.TURBO_MULTIPLIER : 1.0) * charMult;

        moveEntityWithDirection(players.blueField, dirX, dirY, totalSpeed, dtBlue);
    } else {
        players.blueField.vx = 0;
        players.blueField.vy = 0;
    }

    // Arquero azul (afectado por dtKeepers)
    updateControlledGoalkeeper(players.blueKeeper, (keys.KeyW ? -1 : 0) + (keys.KeyS ? 1 : 0), true, dtKeepers);

    // --- JUGADOR 2 EN MODO 2P (NARANJA) ---
    if (gameState.mode === "2P") {
        if (players.orangeField.stunTimer <= 0) {
            let oDirX = 0;
            let oDirY = 0;
            if (keys.ArrowUp) oDirY -= 1;
            if (keys.ArrowDown) oDirY += 1;
            if (keys.ArrowLeft) oDirX -= 1;
            if (keys.ArrowRight) oDirX += 1;

            const isTurboOrange = keys.ShiftRight && players.orangeField.turboEnergy > 5;
            if (isTurboOrange) {
                players.orangeField.turboEnergy -= PHYSICS.TURBO_DRAIN_RATE * dtOrange;
            } else {
                players.orangeField.turboEnergy = Math.min(100, players.orangeField.turboEnergy + PHYSICS.TURBO_RECOVERY_RATE * dtOrange);
            }

            const charDefO = CHARACTERS[players.orangeField.charId];
            const charMultO = charDefO && charDefO.getSpeedMultiplier ? charDefO.getSpeedMultiplier(players.orangeField) : 1.0;
            const totalSpeedO = PHYSICS.PLAYER_SPEED * (isTurboOrange ? PHYSICS.TURBO_MULTIPLIER : 1.0) * charMultO;

            moveEntityWithDirection(players.orangeField, oDirX, oDirY, totalSpeedO, dtOrange);
        } else {
            players.orangeField.vx = 0;
            players.orangeField.vy = 0;
        }

        updateControlledGoalkeeper(players.orangeKeeper, (keys.ArrowUp ? -1 : 0) + (keys.ArrowDown ? 1 : 0), false, dtKeepers);
    }
}

/**
 * Aplica movimiento normalizando diagonales para conservar rapidez constante.
 */
function moveEntityWithDirection(entity, dirX, dirY, speed, deltaTime) {
    if (dirX !== 0 && dirY !== 0) {
        const invLen = 0.70710678;
        dirX *= invLen;
        dirY *= invLen;
    }

    entity.vx = dirX * speed;
    entity.vy = dirY * speed;
    entity.x += entity.vx * deltaTime;
    entity.y += entity.vy * deltaTime;

    clampPlayerToBounds(entity);
}

/**
 * Controla al arquero acompañando verticalmente al equipo y vigilando el arco.
 */
function updateControlledGoalkeeper(keeper, inputDirY, isBlueTeam, deltaTime) {
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
// 9. INTELIGENCIA ARTIFICIAL TÁCTICA (MODO 1 JUGADOR)
// ============================================================================
/**
 * Control de Inteligencia Artificial considerando la dilatación temporal de Sandevistan.
 */
function updateAI(dtOrange, dtKeepers) {
    const aiPlayer = players.orangeField;
    const aiKeeper = players.orangeKeeper;

    if (aiPlayer.stunTimer > 0) {
        aiPlayer.vx = 0;
        aiPlayer.vy = 0;
        return;
    }

    // Decisión táctica de habilidad especial para cualquiera de los 10 personajes
    const charDef = CHARACTERS[aiPlayer.charId];
    if (charDef && charDef.aiShouldActivate) {
        if (aiPlayer.skillCooldownTimer <= 0 || (aiPlayer.charId === "tirador" && aiPlayer.activeReload && aiPlayer.activeReload.active)) {
            if (charDef.aiShouldActivate(aiPlayer, players.blueField, ball, match)) {
                triggerCharacterSkill(aiPlayer, players.blueField);
            }
        }
    }

    // Gestión del turbo en IA: Activa turbo si está lejos del balón y tiene energía
    const distBall = Math.hypot(ball.x - aiPlayer.x, ball.y - aiPlayer.y);
    const useAITurbo = distBall > 190 && aiPlayer.turboEnergy > 30;
    if (useAITurbo) {
        aiPlayer.turboEnergy -= PHYSICS.TURBO_DRAIN_RATE * dtOrange;
    } else {
        aiPlayer.turboEnergy = Math.min(100, aiPlayer.turboEnergy + PHYSICS.TURBO_RECOVERY_RATE * dtOrange);
    }

    const charMult = charDef && charDef.getSpeedMultiplier ? charDef.getSpeedMultiplier(aiPlayer) : 1.0;
    const aiSpeed = (PHYSICS.PLAYER_SPEED * 0.94) * (useAITurbo ? PHYSICS.TURBO_MULTIPLIER : 1.0) * charMult;

    // Coordenada objetivo para la IA (Arco Azul)
    const targetGoalX = WORLD.FIELD_LEFT;
    const targetGoalY = WORLD.CENTER_Y;

    let aimX = ball.x;
    let aimY = ball.y;

    if (aiPlayer.x < ball.x - 8) {
        // Rodear el balón para no empujarlo hacia la propia meta
        aimX = ball.x + 36;
        aimY = ball.y + (aiPlayer.y < ball.y ? -44 : 44);
    } else {
        // Perfilarse detrás del balón apuntando hacia la portería izquierda
        const distToBall = Math.hypot(ball.x - aiPlayer.x, ball.y - aiPlayer.y);
        if (distToBall > 46) {
            const gdx = ball.x - targetGoalX;
            const gdy = ball.y - targetGoalY;
            const glen = Math.hypot(gdx, gdy) || 1;
            aimX = ball.x + (gdx / glen) * 22;
            aimY = ball.y + (gdy / glen) * 22;
        }
    }

    const dx = aimX - aiPlayer.x;
    const dy = aimY - aiPlayer.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 3) {
        aiPlayer.vx = (dx / dist) * aiSpeed;
        aiPlayer.vy = (dy / dist) * aiSpeed;
    } else {
        aiPlayer.vx = 0;
        aiPlayer.vy = 0;
    }

    aiPlayer.x += aiPlayer.vx * dtOrange;
    aiPlayer.y += aiPlayer.vy * dtOrange;
    clampPlayerToBounds(aiPlayer);

    // Arquero de la IA (afectado por dtKeepers)
    const guardY = Math.max(WORLD.GOAL_TOP + 16, Math.min(WORLD.GOAL_BOTTOM - 16, ball.y));
    const guardX = ball.x > WORLD.FIELD_RIGHT - 150 ? WORLD.FIELD_RIGHT - 42 : WORLD.FIELD_RIGHT - 26;

    const kdx = guardX - aiKeeper.x;
    const kdy = guardY - aiKeeper.y;

    aiKeeper.vx = Math.abs(kdx) > 4 ? Math.sign(kdx) * (PHYSICS.GOALKEEPER_SPEED * 0.7) : 0;
    aiKeeper.vy = Math.abs(kdy) > 4 ? Math.sign(kdy) * PHYSICS.GOALKEEPER_SPEED : 0;

    aiKeeper.x += aiKeeper.vx * dtKeepers;
    aiKeeper.y += aiKeeper.vy * dtKeepers;
    clampPlayerToBounds(aiKeeper);
}

// ============================================================================
// 10. ENTIDADES TEMPORALES (BARRERAS Y CLONES)
// ============================================================================
function updateMatchEntities(dt) {
    // 1. Barreras del Constructor
    for (let i = match.barriers.length - 1; i >= 0; i--) {
        const b = match.barriers[i];
        b.duration -= dt;
        if (b.duration <= 0) {
            match.barriers.splice(i, 1);
        }
    }

    // 2. Clones del Clonador
    for (let i = match.clones.length - 1; i >= 0; i--) {
        const c = match.clones[i];
        c.duration -= dt;
        if (c.duration <= 0) {
            match.clones.splice(i, 1);
            continue;
        }

        // El clon persigue el balón para interceptar y estorbar
        const dx = ball.x - c.x;
        const dy = ball.y - c.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 4) {
            c.vx = (dx / dist) * c.speed;
            c.vy = (dy / dist) * c.speed;
        } else {
            c.vx = 0;
            c.vy = 0;
        }

        c.x += c.vx * dt;
        c.y += c.vy * dt;
        clampEntityToField(c, c.radius);

        // Colisión del clon con el balón: regla fundamental "No puede marcar goles por sí solo"
        const distBall = Math.hypot(ball.x - c.x, ball.y - c.y);
        const minDist = c.radius + ball.radius;

        if (distBall < minDist) {
            const nx = distBall > 0.001 ? (ball.x - c.x) / distBall : 1;
            const ny = distBall > 0.001 ? (ball.y - c.y) / distBall : 0;

            ball.x = c.x + nx * minDist;
            ball.y = c.y + ny * minDist;

            // Desviar lateralmente o amortiguar sin empujar hacia la portería rival
            ball.vx = nx * 140;
            ball.vy = ny * 140;
        }

        // Colisión del clon con el rival para bloquear su paso
        const rival = c.team === "blue" ? players.orangeField : players.blueField;
        const distRival = Math.hypot(rival.x - c.x, rival.y - c.y);
        if (distRival < c.radius + rival.radius) {
            const pushX = (rival.x - c.x) / (distRival || 1);
            const pushY = (rival.y - c.y) / (distRival || 1);
            rival.x += pushX * 3;
            rival.y += pushY * 3;
            clampPlayerToBounds(rival);
        }
    }

    // 3. Efectos de teletransporte del Intercambiador
    for (let i = match.teleportFlashes.length - 1; i >= 0; i--) {
        match.teleportFlashes[i].timer -= dt;
        if (match.teleportFlashes[i].timer <= 0) {
            match.teleportFlashes.splice(i, 1);
        }
    }
}

// ============================================================================
// 11. FÍSICA DEL BALÓN
// ============================================================================
function updateBall(deltaTime) {
    if (ball.reboundActiveTimer > 0) {
        ball.reboundActiveTimer -= deltaTime;
    }

    ball.x += ball.vx * deltaTime;
    ball.y += ball.vy * deltaTime;

    const damping = Math.exp(-PHYSICS.BALL_FRICTION * deltaTime);
    ball.vx *= damping;
    ball.vy *= damping;

    if (Math.hypot(ball.vx, ball.vy) < 4) {
        ball.vx = 0;
        ball.vy = 0;
    }
}

// ============================================================================
// 12. COLISIONES GEOMÉTRICAS (JUGADORES, BALÓN, BARRERAS Y POSTES)
// ============================================================================
function resolveCollisions() {
    // 1. Colisiones jugador contra jugador (omite si alguno tiene Intangibilidad del Fantasma)
    for (let i = 0; i < playerList.length; i++) {
        for (let j = i + 1; j < playerList.length; j++) {
            const p1 = playerList[i];
            const p2 = playerList[j];

            if (p1.isGhost || p2.isGhost) {
                continue; // Atraviesa temporalmente
            }
            resolvePlayerPlayerCollision(p1, p2);
        }
    }

    // 2. Colisiones de cada jugador con el balón
    for (let i = 0; i < playerList.length; i++) {
        resolvePlayerBallCollision(playerList[i]);
    }

    // 3. Colisiones con las barreras del Constructor
    for (let i = 0; i < match.barriers.length; i++) {
        resolveBarrierCollisions(match.barriers[i]);
    }

    // 4. Colisiones con los 4 postes
    for (let i = 0; i < goalPosts.length; i++) {
        resolveBallPostCollision(goalPosts[i]);
    }

    // 5. Rebotes contra paredes y mallas
    resolveBallWallCollisions();
}

function clampPlayerToBounds(player) {
    if (player.x < player.minX) player.x = player.minX;
    if (player.x > player.maxX) player.x = player.maxX;
    if (player.y < player.minY) player.y = player.minY;
    if (player.y > player.maxY) player.y = player.maxY;
}

function clampEntityToField(entity, radius) {
    const minX = WORLD.FIELD_LEFT + radius;
    const maxX = WORLD.FIELD_RIGHT - radius;
    const minY = WORLD.FIELD_TOP + radius;
    const maxY = WORLD.FIELD_BOTTOM - radius;

    if (entity.x < minX) entity.x = minX;
    if (entity.x > maxX) entity.x = maxX;
    if (entity.y < minY) entity.y = minY;
    if (entity.y > maxY) entity.y = maxY;
}

function resolvePlayerPlayerCollision(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const minDist = p1.radius + p2.radius;

    if (dist > 0 && dist < minDist) {
        const overlap = (minDist - dist);
        const nx = dx / dist;
        const ny = dy / dist;

        // Si Ancla está activo en p1, p1 no retrocede y empuja a p2
        if (p1.isAnchor) {
            p2.x += nx * overlap;
            p2.y += ny * overlap;
        } else if (p2.isAnchor) {
            p1.x -= nx * overlap;
            p1.y -= ny * overlap;
        } else {
            p1.x -= nx * (overlap * 0.5);
            p1.y -= ny * (overlap * 0.5);
            p2.x += nx * (overlap * 0.5);
            p2.y += ny * (overlap * 0.5);
        }

        clampPlayerToBounds(p1);
        clampPlayerToBounds(p2);
    }
}

function resolvePlayerBallCollision(player) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    const minDist = player.radius + ball.radius;

    if (dist < minDist) {
        const nx = dist > 0.0001 ? dx / dist : (player.team === "blue" ? 1 : -1);
        const ny = dist > 0.0001 ? dy / dist : 0;

        const overlap = minDist - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;

        const playerSpeed = Math.hypot(player.vx, player.vy);
        const kickPower = PHYSICS.KICK_BASE_IMPULSE + playerSpeed * PHYSICS.KICK_TRANSFER;

        ball.vx = nx * kickPower + player.vx * 0.35;
        ball.vy = ny * kickPower + player.vy * 0.35;

        // Disparador de hook por personaje (Tirador o Rebotador)
        const charDef = CHARACTERS[player.charId];
        if (charDef && charDef.onBallKick) {
            charDef.onBallKick(player, ball, { nx, ny, kickPower });
        }

        const currentSpeed = Math.hypot(ball.vx, ball.vy);
        if (currentSpeed > PHYSICS.BALL_MAX_SPEED) {
            const scale = PHYSICS.BALL_MAX_SPEED / currentSpeed;
            ball.vx *= scale;
            ball.vy *= scale;
        }
    }
}

/**
 * Colisión continua contra la barrera del Constructor para balón y jugadores.
 */
function resolveBarrierCollisions(barrier) {
    const halfW = barrier.width / 2;
    const halfH = barrier.height / 2;

    // Colisión con el balón
    const closestBX = Math.max(barrier.x - halfW, Math.min(barrier.x + halfW, ball.x));
    const closestBY = Math.max(barrier.y - halfH, Math.min(barrier.y + halfH, ball.y));
    const distBX = ball.x - closestBX;
    const distBY = ball.y - closestBY;
    const distB = Math.hypot(distBX, distBY);

    if (distB < ball.radius) {
        const nx = distB > 0.001 ? distBX / distB : 1;
        const ny = distB > 0.001 ? distBY / distB : 0;
        ball.x = closestBX + nx * ball.radius;
        ball.y = closestBY + ny * ball.radius;

        // Rebote elástico
        if (Math.abs(nx) > Math.abs(ny)) {
            ball.vx = -ball.vx * PHYSICS.BALL_BOUNCE_WALL;
        } else {
            ball.vy = -ball.vy * PHYSICS.BALL_BOUNCE_WALL;
        }
    }

    // Colisión con cada jugador
    for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        const closestPX = Math.max(barrier.x - halfW, Math.min(barrier.x + halfW, p.x));
        const closestPY = Math.max(barrier.y - halfH, Math.min(barrier.y + halfH, p.y));
        const distPX = p.x - closestPX;
        const distPY = p.y - closestPY;
        const distP = Math.hypot(distPX, distPY);

        if (distP < p.radius) {
            const nx = distP > 0.001 ? distPX / distP : 1;
            const ny = distP > 0.001 ? distPY / distP : 0;
            p.x = closestPX + nx * p.radius;
            p.y = closestPY + ny * p.radius;
            clampPlayerToBounds(p);
        }
    }
}

function resolveBallPostCollision(post) {
    const dx = ball.x - post.x;
    const dy = ball.y - post.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.radius + post.radius;

    if (dist < minDist) {
        const nx = dist > 0.0001 ? dx / dist : 1;
        const ny = dist > 0.0001 ? dy / dist : 0;

        ball.x += nx * (minDist - dist);
        ball.y += ny * (minDist - dist);

        const dot = ball.vx * nx + ball.vy * ny;
        if (dot < 0) {
            const bounce = ball.reboundActiveTimer > 0 ? 1.15 : PHYSICS.BALL_BOUNCE_WALL;
            ball.vx = (ball.vx - 2 * dot * nx) * bounce;
            ball.vy = (ball.vy - 2 * dot * ny) * bounce;
        }
    }
}

function resolveBallWallCollisions() {
    const r = ball.radius;
    const bounceFactor = ball.reboundActiveTimer > 0 ? 1.15 : PHYSICS.BALL_BOUNCE_WALL;

    // Bandas superior e inferior
    if (ball.y - r < WORLD.FIELD_TOP) {
        ball.y = WORLD.FIELD_TOP + r;
        ball.vy = Math.abs(ball.vy) * bounceFactor;
    } else if (ball.y + r > WORLD.FIELD_BOTTOM) {
        ball.y = WORLD.FIELD_BOTTOM - r;
        ball.vy = -Math.abs(ball.vy) * bounceFactor;
    }

    const isInsideGoalMouthY = ball.y - r >= WORLD.GOAL_TOP && ball.y + r <= WORLD.GOAL_BOTTOM;
    const isAlreadyInLeftPocket = ball.x < WORLD.FIELD_LEFT;
    const isAlreadyInRightPocket = ball.x > WORLD.FIELD_RIGHT;

    // Extremo izquierdo
    if (isAlreadyInLeftPocket || (isInsideGoalMouthY && ball.x - r < WORLD.FIELD_LEFT)) {
        const leftNetBack = WORLD.FIELD_LEFT - WORLD.GOAL_DEPTH;
        if (ball.x - r < leftNetBack) {
            ball.x = leftNetBack + r;
            ball.vx = Math.abs(ball.vx) * 0.5;
        }
        if (ball.y - r < WORLD.GOAL_TOP) {
            ball.y = WORLD.GOAL_TOP + r;
            ball.vy = Math.abs(ball.vy) * 0.5;
        } else if (ball.y + r > WORLD.GOAL_BOTTOM) {
            ball.y = WORLD.GOAL_BOTTOM - r;
            ball.vy = -Math.abs(ball.vy) * 0.5;
        }
    } else if (ball.x - r < WORLD.FIELD_LEFT) {
        ball.x = WORLD.FIELD_LEFT + r;
        ball.vx = Math.abs(ball.vx) * bounceFactor;
    }

    // Extremo derecho
    if (isAlreadyInRightPocket || (isInsideGoalMouthY && ball.x + r > WORLD.FIELD_RIGHT)) {
        const rightNetBack = WORLD.FIELD_RIGHT + WORLD.GOAL_DEPTH;
        if (ball.x + r > rightNetBack) {
            ball.x = rightNetBack - r;
            ball.vx = -Math.abs(ball.vx) * 0.5;
        }
        if (ball.y - r < WORLD.GOAL_TOP) {
            ball.y = WORLD.GOAL_TOP + r;
            ball.vy = Math.abs(ball.vy) * 0.5;
        } else if (ball.y + r > WORLD.GOAL_BOTTOM) {
            ball.y = WORLD.GOAL_BOTTOM - r;
            ball.vy = -Math.abs(ball.vy) * 0.5;
        }
    } else if (ball.x + r > WORLD.FIELD_RIGHT) {
        ball.x = WORLD.FIELD_RIGHT - r;
        ball.vx = -Math.abs(ball.vx) * bounceFactor;
    }
}

// ============================================================================
// 13. DETECCIÓN DE GOL
// ============================================================================
function checkGoal() {
    if (gameState.isGoalCooldown) return;

    const r = ball.radius;
    const withinGoalPostsY = ball.y > WORLD.GOAL_TOP && ball.y < WORLD.GOAL_BOTTOM;
    if (!withinGoalPostsY) return;

    if (ball.x + r < WORLD.FIELD_LEFT) {
        registerGoal("orange");
    } else if (ball.x - r > WORLD.FIELD_RIGHT) {
        registerGoal("blue");
    }
}

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
        gameState.goalBannerColor = "#ff7824";
    }

    // Regla del código secreto Balto: se desactiva tras 3 goles
    if (secretBaltoCode.active) {
        secretBaltoCode.goalsCount += 1;
        if (secretBaltoCode.goalsCount >= 3) {
            secretBaltoCode.active = false;
            secretBaltoCode.goalsCount = 0;
            match.triggerArcadeNotice(players.blueField, "CÓDIGO BALTO AGOTADO (3 GOLES)");
        }
    }

    updateScoreboardDOM();
}

// ============================================================================
// 14. ACTUALIZACIÓN DEL DOM DEL HUD (BARRAS DE TURBO Y RECARGA)
// ============================================================================
function updateHUDDOM() {
    // 1. Jugador 1
    const p1 = players.blueField;
    hudJ1Turbo.style.width = `${Math.max(0, Math.min(100, p1.turboEnergy))}%`;

    const charDef1 = CHARACTERS[p1.charId];
    if (charDef1) {
        if (secretBaltoCode.active) {
            hudJ1SkillFill.style.width = "100%";
            hudJ1SkillText.textContent = "BALTO ∞";
            hudJ1SkillText.style.color = "#00f0ff";
        } else if (p1.skillCooldownTimer <= 0) {
            hudJ1SkillFill.style.width = "100%";
            hudJ1SkillText.textContent = "LISTA";
            hudJ1SkillText.style.color = "#ffd13b";
        } else {
            const pct = (1 - p1.skillCooldownTimer / charDef1.cooldown) * 100;
            hudJ1SkillFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
            hudJ1SkillText.textContent = `${p1.skillCooldownTimer.toFixed(1)}s`;
            hudJ1SkillText.style.color = "#8d98ab";
        }
    }

    // 2. Jugador 2 / IA
    const p2 = players.orangeField;
    hudJ2Turbo.style.width = `${Math.max(0, Math.min(100, p2.turboEnergy))}%`;

    const charDef2 = CHARACTERS[p2.charId];
    if (charDef2) {
        if (p2.skillCooldownTimer <= 0) {
            hudJ2SkillFill.style.width = "100%";
            hudJ2SkillText.textContent = "LISTA";
            hudJ2SkillText.style.color = "#ffd13b";
        } else {
            const pct2 = (1 - p2.skillCooldownTimer / charDef2.cooldown) * 100;
            hudJ2SkillFill.style.width = `${Math.max(0, Math.min(100, pct2))}%`;
            hudJ2SkillText.textContent = `${p2.skillCooldownTimer.toFixed(1)}s`;
            hudJ2SkillText.style.color = "#8d98ab";
        }
    }
}

// ============================================================================
// 15. RENDERIZADO VISUAL EN CANVAS 2D
// ============================================================================
function draw() {
    ctx.clearRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    drawPitch();
    drawGoals();
    drawBarriers();
    drawClones();
    drawPlayers();
    drawBall();
    drawOverlaysAndEffects();
}

function drawPitch() {
    ctx.fillStyle = "#124922";
    ctx.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

    const pitchWidth = WORLD.FIELD_RIGHT - WORLD.FIELD_LEFT;
    const pitchHeight = WORLD.FIELD_BOTTOM - WORLD.FIELD_TOP;
    const stripeCount = 10;
    const stripeWidth = pitchWidth / stripeCount;

    for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#19642f" : "#1d7236";
        ctx.fillRect(WORLD.FIELD_LEFT + i * stripeWidth, WORLD.FIELD_TOP, stripeWidth, pitchHeight);
    }

    ctx.strokeStyle = "#e9f5ec";
    ctx.lineWidth = 4;
    ctx.strokeRect(WORLD.FIELD_LEFT, WORLD.FIELD_TOP, pitchWidth, pitchHeight);

    ctx.beginPath();
    ctx.moveTo(WORLD.CENTER_X, WORLD.FIELD_TOP);
    ctx.lineTo(WORLD.CENTER_X, WORLD.FIELD_BOTTOM);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(WORLD.CENTER_X, WORLD.CENTER_Y, WORLD.CENTER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#e9f5ec";
    ctx.beginPath();
    ctx.arc(WORLD.CENTER_X, WORLD.CENTER_Y, 5, 0, Math.PI * 2);
    ctx.fill();

    const penaltyWidth = 128;
    const penaltyHeight = 256;
    const smallBoxWidth = 52;
    const smallBoxHeight = 148;

    ctx.strokeRect(WORLD.FIELD_LEFT, WORLD.CENTER_Y - penaltyHeight / 2, penaltyWidth, penaltyHeight);
    ctx.strokeRect(WORLD.FIELD_LEFT, WORLD.CENTER_Y - smallBoxHeight / 2, smallBoxWidth, smallBoxHeight);

    ctx.strokeRect(WORLD.FIELD_RIGHT - penaltyWidth, WORLD.CENTER_Y - penaltyHeight / 2, penaltyWidth, penaltyHeight);
    ctx.strokeRect(WORLD.FIELD_RIGHT - smallBoxWidth, WORLD.CENTER_Y - smallBoxHeight / 2, smallBoxWidth, smallBoxHeight);
}

function drawGoals() {
    const leftGoalX = WORLD.FIELD_LEFT - WORLD.GOAL_DEPTH;
    const rightGoalX = WORLD.FIELD_RIGHT;

    ctx.fillStyle = "rgba(8, 15, 22, 0.55)";
    ctx.fillRect(leftGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);
    ctx.fillRect(rightGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);

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

    ctx.lineWidth = 4;
    ctx.strokeStyle = "#56a8ff";
    ctx.strokeRect(leftGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);

    ctx.strokeStyle = "#ff944d";
    ctx.strokeRect(rightGoalX, WORLD.GOAL_TOP, WORLD.GOAL_DEPTH, WORLD.GOAL_WIDTH);

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

function drawBarriers() {
    for (let i = 0; i < match.barriers.length; i++) {
        const b = match.barriers[i];
        const halfW = b.width / 2;
        const halfH = b.height / 2;

        ctx.fillStyle = b.color;
        ctx.fillRect(b.x - halfW, b.y - halfH, b.width, b.height);

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x - halfW, b.y - halfH, b.width, b.height);

        // Barra de vida de la barrera
        const pct = b.duration / b.maxDuration;
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillRect(b.x - halfW + 2, b.y - halfH + 2, (b.width - 4), (b.height - 4) * pct);
    }
}

function drawClones() {
    for (let i = 0; i < match.clones.length; i++) {
        const c = match.clones[i];
        ctx.fillStyle = "rgba(0, 210, 211, 0.45)";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#a4f5f5";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("CLON", c.x, c.y);
    }
}

function drawPlayers() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < playerList.length; i++) {
        const p = playerList[i];
        const isField = p.role === "field";
        const charDef = isField ? CHARACTERS[p.charId] : null;

        // Renderizado especial previo del personaje (ej. estelas del velocista)
        if (charDef && charDef.onDraw) {
            charDef.onDraw(p, ctx);
        }

        // Sombra
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.beginPath();
        ctx.arc(p.x + 2, p.y + 4, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Cuerpo del jugador
        const mainColor = charDef ? charDef.color : p.color;
        const strokeColor = charDef ? charDef.stroke : p.stroke;

        ctx.save();
        if (p.isGhost) {
            ctx.globalAlpha = 0.45;
        }

        ctx.fillStyle = mainColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 3;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();

        // Insignia / Ícono interior
        ctx.fillStyle = "#000000";
        ctx.font = isField ? "13px Consolas, monospace" : "bold 11px Consolas, monospace";
        ctx.fillText(isField ? charDef.icon : p.label, p.x, p.y);

        ctx.restore();

        // Indicador de Aturdimiento
        if (p.stunTimer > 0) {
            ctx.fillStyle = "#ffd13b";
            ctx.font = "bold 12px Consolas, monospace";
            ctx.fillText("💫", p.x, p.y - p.radius - 8);
        }
    }
}

function drawBall() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.arc(ball.x + 2, ball.y + 3, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Color del balón: si está en rebote especial brilla en rosa neón
    ctx.fillStyle = ball.reboundActiveTimer > 0 ? "#ff3366" : "#ffffff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#111622";
    ctx.stroke();

    ctx.fillStyle = "#111622";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawOverlaysAndEffects() {
    // 0. Efecto de Dilatación Temporal de Sandevistan (Bullet Time)
    const blueSandevistan = (players.blueField.charId === "velocista" && players.blueField.skillActiveTimer > 0);
    const orangeSandevistan = (players.orangeField.charId === "velocista" && players.orangeField.skillActiveTimer > 0);

    if (blueSandevistan || orangeSandevistan) {
        const sColor = blueSandevistan ? "rgba(0, 240, 255, 0.22)" : "rgba(255, 230, 0, 0.22)";
        const sBorder = blueSandevistan ? "#00f0ff" : "#ffe600";

        // Viñeta perimetral de distorsión
        const grad = ctx.createRadialGradient(
            WORLD.CENTER_X, WORLD.CENTER_Y, WORLD.WIDTH * 0.2,
            WORLD.CENTER_X, WORLD.CENTER_Y, WORLD.WIDTH * 0.58
        );
        grad.addColorStop(0, "rgba(0, 0, 0, 0)");
        grad.addColorStop(1, sColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

        // Líneas de aberración temporal cyberpunk
        ctx.strokeStyle = blueSandevistan ? "rgba(0, 240, 255, 0.18)" : "rgba(255, 230, 0, 0.18)";
        ctx.lineWidth = 1;
        const scanOffset = (Date.now() / 12) % 24;
        for (let y = WORLD.FIELD_TOP; y < WORLD.FIELD_BOTTOM; y += 24) {
            ctx.beginPath();
            ctx.moveTo(WORLD.FIELD_LEFT, y + scanOffset);
            ctx.lineTo(WORLD.FIELD_RIGHT, y + scanOffset);
            ctx.stroke();
        }

        // Banner superior persistente de cámara lenta
        ctx.fillStyle = "rgba(8, 12, 20, 0.88)";
        ctx.fillRect(WORLD.CENTER_X - 190, 12, 380, 26);
        ctx.strokeStyle = sBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(WORLD.CENTER_X - 190, 12, 380, 26);

        ctx.fillStyle = sBorder;
        ctx.font = "bold 13px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⏳ SANDEVISTAN: DILATACIÓN TEMPORAL (0.28x)", WORLD.CENTER_X, 25);
    }

    // 1. Destellos de teletransporte
    for (let i = 0; i < match.teleportFlashes.length; i++) {
        const tf = match.teleportFlashes[i];
        ctx.strokeStyle = "rgba(187, 143, 206, 0.85)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(tf.x, tf.y, 35 * (1 - tf.timer / 0.4), 0, Math.PI * 2);
        ctx.stroke();
    }

    // 2. Aviso flotante de activación de habilidad en Canvas
    if (gameState.arcadeNotice.timer > 0) {
        ctx.fillStyle = "rgba(10, 14, 22, 0.8)";
        ctx.fillRect(WORLD.CENTER_X - 180, 50, 360, 36);
        ctx.strokeStyle = gameState.arcadeNotice.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(WORLD.CENTER_X - 180, 50, 360, 36);

        ctx.fillStyle = gameState.arcadeNotice.color;
        ctx.font = "bold 16px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(gameState.arcadeNotice.text, WORLD.CENTER_X, 68);
    }

    // 3. Cartel de Gol
    if (gameState.isGoalCooldown && gameState.goalBannerText) {
        ctx.fillStyle = "rgba(10, 14, 22, 0.85)";
        ctx.fillRect(WORLD.CENTER_X - 240, WORLD.CENTER_Y - 52, 480, 104);

        ctx.strokeStyle = gameState.goalBannerColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(WORLD.CENTER_X - 240, WORLD.CENTER_Y - 52, 480, 104);

        ctx.fillStyle = gameState.goalBannerColor;
        ctx.font = "bold 28px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(gameState.goalBannerText, WORLD.CENTER_X, WORLD.CENTER_Y - 10);

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "bold 14px Consolas, monospace";
        ctx.fillText("PREPARANDO SAQUE CENTRAL...", WORLD.CENTER_X, WORLD.CENTER_Y + 26);
    }

    // 4. Cartel de Pausa
    if (gameState.isRunning && gameState.isPaused) {
        ctx.fillStyle = "rgba(8, 11, 18, 0.72)";
        ctx.fillRect(0, 0, WORLD.WIDTH, WORLD.HEIGHT);

        ctx.fillStyle = "#ffd13b";
        ctx.font = "bold 34px Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PARTIDA PAUSADA", WORLD.CENTER_X, WORLD.CENTER_Y - 12);

        ctx.fillStyle = "#ffffff";
        ctx.font = "15px Consolas, monospace";
        ctx.fillText("Pulsa ESPACIO o el botón superior para continuar", WORLD.CENTER_X, WORLD.CENTER_Y + 26);
    }
}

// ============================================================================
// 16. EVENTOS DE ENTRADA (TECLADO Y VENTANA)
// ============================================================================
function isTypingInTextField(eventTarget) {
    if (!eventTarget) return false;
    const tag = eventTarget.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || eventTarget.isContentEditable === true;
}

window.addEventListener("keydown", (event) => {
    if (isTypingInTextField(event.target)) return;

    // Detección de código secreto consecutivo "balto"
    if (event.key && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        secretBaltoCode.buffer = (secretBaltoCode.buffer + event.key.toLowerCase()).slice(-5);
        if (secretBaltoCode.buffer === "balto") {
            secretBaltoCode.buffer = "";
            secretBaltoCode.active = !secretBaltoCode.active;
            if (secretBaltoCode.active) {
                secretBaltoCode.goalsCount = 0;
                players.blueField.skillCooldownTimer = 0;
                match.triggerArcadeNotice(players.blueField, "★ ¡CÓDIGO BALTO: HABILIDAD INFINITA! ★");
            } else {
                secretBaltoCode.goalsCount = 0;
                match.triggerArcadeNotice(players.blueField, "CÓDIGO BALTO DESACTIVADO");
            }
        }
    }

    if (event.code === "Space") {
        event.preventDefault();
        togglePause();
        return;
    }

    // Activación de Habilidad Especial J1 con E
    if (event.code === "KeyE") {
        event.preventDefault();
        if (gameState.isRunning && !gameState.isPaused) {
            triggerCharacterSkill(players.blueField, players.orangeField);
        }
        return;
    }

    // Activación de Habilidad Especial J2 con Enter (Modo 2P)
    if (event.code === "Enter") {
        event.preventDefault();
        if (gameState.isRunning && !gameState.isPaused && gameState.mode === "2P") {
            triggerCharacterSkill(players.orangeField, players.blueField);
        }
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

window.addEventListener("blur", () => {
    for (const code in keys) {
        keys[code] = false;
    }
});

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

window.addEventListener("resize", resizeCanvasView);

// Botones de navegación e inicio
btnMode1P.addEventListener("click", () => openCharacterSelect("1P"));
btnMode2P.addEventListener("click", () => openCharacterSelect("2P"));

btnBackMode.addEventListener("click", () => {
    secretBaltoCode.active = false;
    secretBaltoCode.goalsCount = 0;
    secretBaltoCode.buffer = "";
    charOverlayEl.classList.remove("active");
    modeOverlayEl.classList.add("active");
});

btnStartMatch.addEventListener("click", () => startMatch());

btnPause.addEventListener("click", () => {
    togglePause();
    btnPause.blur();
});

btnRestart.addEventListener("click", () => {
    startMatch();
    btnRestart.blur();
});

if (btnFinishMatch) {
    btnFinishMatch.addEventListener("click", () => {
        if (!gameState.isRunning) return;
        const winner = gameState.scoreBlue > gameState.scoreOrange ? "blue" : (gameState.scoreOrange > gameState.scoreBlue ? "orange" : "draw");
        finishMatch(winner);
        btnFinishMatch.blur();
    });
}

btnChangeChars.addEventListener("click", () => {
    secretBaltoCode.active = false;
    secretBaltoCode.goalsCount = 0;
    secretBaltoCode.buffer = "";
    gameState.isRunning = false;
    gameState.isPaused = false;
    if (matchOverOverlay) matchOverOverlay.classList.remove("active");
    openCharacterSelect(gameState.mode);
    btnChangeChars.blur();
});

if (btnMoRematch) {
    btnMoRematch.addEventListener("click", () => {
        if (matchOverOverlay) matchOverOverlay.classList.remove("active");
        startMatch();
    });
}

if (btnMoChange) {
    btnMoChange.addEventListener("click", () => {
        secretBaltoCode.active = false;
        secretBaltoCode.goalsCount = 0;
        secretBaltoCode.buffer = "";
        if (matchOverOverlay) matchOverOverlay.classList.remove("active");
        gameState.isRunning = false;
        gameState.isPaused = false;
        openCharacterSelect(gameState.mode);
    });
}

/**
 * Finaliza la partida, registra estadísticas y notifica al portafolio.
 */
function finishMatch(winner) {
    gameState.isRunning = false;
    gameState.isGoalCooldown = false;
    gameState.isMatchOver = true;

    // Desactivar código Balto al terminar la partida
    secretBaltoCode.active = false;
    secretBaltoCode.goalsCount = 0;
    secretBaltoCode.buffer = "";

    if (btnFinishMatch) btnFinishMatch.style.display = "none";

    const start = (gameState.matchStartTime && gameState.matchStartTime > 0) ? gameState.matchStartTime : Date.now();
    const durationSec = Math.max(1, Math.round(gameState.matchDurationSeconds || (Date.now() - start) / 1000));
    const m = Math.floor(durationSec / 60);
    const s = durationSec % 60;
    const durationFormatted = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;

    let playerAlias = "Jugador 1";
    if (typeof PetPixelStorage !== "undefined" && typeof PetPixelStorage.getPlayerAlias === "function") {
        playerAlias = PetPixelStorage.getPlayerAlias();
    }

    let winnerLabel = "EMPATE";
    let winnerTitle = "¡EMPATE!";
    if (winner === "blue") {
        winnerLabel = `JUGADOR 1 (${playerAlias})`;
        winnerTitle = `¡VICTORIA DE ${playerAlias.toUpperCase()}!`;
    } else if (winner === "orange") {
        winnerLabel = gameState.mode === "1P" ? "RIVAL (IA)" : "JUGADOR 2";
        winnerTitle = gameState.mode === "1P" ? "¡VICTORIA DE LA IA!" : "¡VICTORIA DE JUGADOR 2!";
    }

    const p1Char = CHARACTERS[players.blueField.charId] ? CHARACTERS[players.blueField.charId].name : "Velocista";
    const p2Char = CHARACTERS[players.orangeField.charId] ? CHARACTERS[players.orangeField.charId].name : "Constructor";

    const matchData = {
        id: "futbol_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        date: new Date().toLocaleString(),
        isoDate: new Date().toISOString(),
        timestamp: Date.now(),
        mode: gameState.mode === "1P" ? "1P vs IA" : "2P Local",
        playerAlias: playerAlias,
        p1Character: p1Char,
        p2Character: p2Char,
        scoreBlue: gameState.scoreBlue,
        scoreOrange: gameState.scoreOrange,
        winner: winner,
        winnerLabel: winnerLabel,
        durationSeconds: durationSec,
        durationFormatted: durationFormatted
    };

    // 1. Desplegar modal fin de partido
    if (matchOverOverlay) {
        moTitle.textContent = winnerTitle;
        moScoreBlue.textContent = gameState.scoreBlue;
        moScoreOrange.textContent = gameState.scoreOrange;
        moMode.textContent = matchData.mode;
        moDuration.textContent = durationFormatted;
        moP1.textContent = `${p1Char} (${playerAlias})`;
        moP2.textContent = p2Char;
        matchOverOverlay.classList.add("active");
    }

    // 2. Notificar vía postMessage al portafolio
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            source: "petpixel_game",
            game: "futbol",
            type: "MATCH_END",
            data: matchData
        }, "*");
    } else if (typeof PetPixelStorage !== "undefined" && typeof PetPixelStorage.recordMatch === "function") {
        // 3. Si corre standalone, registrar directamente
        PetPixelStorage.recordMatch("futbol", matchData);
    }
}

// Inicialización
resizeCanvasView();
resetPositions();
requestAnimationFrame(gameLoop);

// Interfaz de inspección y auditoría segura (preserva mecánicas originales)
window.FutbolGame = {
    finishMatch: finishMatch,
    resetPositions: resetPositions,
    getState: () => ({
        mode: gameState.mode,
        scoreBlue: gameState.scoreBlue,
        scoreOrange: gameState.scoreOrange,
        isOver: gameState.isOver,
        isPaused: gameState.isPaused
    }),
    setScore: (blue, orange) => {
        gameState.scoreBlue = blue;
        gameState.scoreOrange = orange;
    },
    setMode: (mode) => {
        gameState.mode = mode;
    },
    setStartTime: (t) => {
        gameState.matchStartTime = t;
    }
};
