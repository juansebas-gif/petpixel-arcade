/**
 * PONG: IMPOSSIBLE - Motor de Juego Totalmente Optimizado, Auditado y Estable a 60 FPS.
 * 
 * Correcciones de Rendimiento y Bucle de Juego:
 * 1. UN ÚNICO bucle principal (requestAnimationFrame) iniciado una sola vez al cargar la aplicación.
 * 2. Cero uso de setTimeout / setInterval no gestionados en cheats ni audio (remplazados por temporizadores delta-time).
 * 3. Cálculo de Delta Time protegido y limitado estrictamente (1ms <= dt <= 33ms) sin picos ni slowdowns.
 * 4. Estado 'scoring' no bloqueante: la física se pausa 0.8s mientras la animación y renderizado continúan a 60 FPS.
 * 5. Limpieza activa y límite estricto de memoria para partículas (máx 60) y textos flotantes (máx 15).
 * 6. Reinicio completo de trampas, bots y pelota tras cada gol ('resetRoundState').
 * 7. Monitor de rendimiento en tiempo real (FPS, MS, estado) activable con Shift + D.
 */

(function() {
  'use strict';

  // --- CANVAS & CONSTANTES DE DISEÑO ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const GAME_WIDTH = 960;
  const GAME_HEIGHT = 540;
  const TARGET_SCORE = 5;

  // Toggle de Debug / Performance (Shift + D)
  window.DEBUG = false;
  let currentFPS = 60;
  let updateMs = 0;
  let renderMs = 0;

  // --- POLYFILL / HELPER DE RECTÁNGULOS REDONDEADOS SEGURO ---
  function drawRoundRect(c, x, y, w, h, radius) {
    try {
      if (typeof c.roundRect === 'function') {
        c.beginPath();
        c.roundRect(x, y, w, h, radius);
        return;
      }
      c.beginPath();
      if (w < 2 * radius) radius = w / 2;
      if (h < 2 * radius) radius = h / 2;
      c.moveTo(x + radius, y);
      c.arcTo(x + w, y, x + w, y + h, radius);
      c.arcTo(x + w, y + h, x, y + h, radius);
      c.arcTo(x, y + h, x, y, radius);
      c.arcTo(x, y, x + w, y, radius);
      c.closePath();
    } catch (e) {}
  }

  // --- BASE DE DATOS DE LAS 30 TRAMPAS ---
  const CHEATS_DB = [
    { id: 1, name: 'TELETRANSPORTE', weight: 'common', desc: 'El bot se teletransporta instantáneamente a la posición de la pelota.', text: '¡TELETRANSPORTE!' },
    { id: 2, name: 'RAQUETA GIGANTE', weight: 'common', desc: 'La raqueta del bot se estira cubriendo casi todo el campo.', text: 'NADA DE ESO.' },
    { id: 3, name: 'PERSECUCIÓN ILEGAL', weight: 'common', desc: 'El bot abandona su portería y persigue la pelota en todo el mapa.', text: '¡REGLAS OPCIONALES!' },
    { id: 4, name: 'RAQUETA DE TENIS', weight: 'common', desc: 'El bot saca una raqueta de tenis animada y remata la pelota.', text: '¿EN SERIO?' },
    { id: 5, name: 'BOMBA', weight: 'uncommon', desc: 'El bot coloca una bomba con mecha que aturde al jugador al explotar.', text: '¡BOMBA!' },
    { id: 6, name: 'SEGUNDA PELOTA', weight: 'uncommon', desc: 'El bot genera una segunda pelota física independiente en juego.', text: '¡MULTIPELOTA!' },
    { id: 7, name: 'PORTAL', weight: 'uncommon', desc: 'Portales místico-tecnológicos redirigen la pelota tras el bot.', text: '¡AGUJERO DE GUSANO!' },
    { id: 8, name: 'MURO ILEGAL', weight: 'uncommon', desc: 'Genera un muro de energía que bloquea la portería del bot.', text: 'TÉCNICAMENTE LEGAL.' },
    { id: 9, name: 'BRAZO EXTENSIBLE', weight: 'uncommon', desc: 'El bot extiende un brazo mecánico articulado para devolver la pelota.', text: '¡TE TENGO!' },
    { id: 10, name: 'MANO DIVINA', weight: 'rare', desc: 'Una mano gigante desciende desde el cielo para aplastar la pelota.', text: 'MI MANO.' },
    { id: 11, name: 'REBOBINAR TIEMPO', weight: 'rare', desc: 'Rebobina la trayectoria de la pelota 1 segundo hacia el pasado.', text: 'NO, NO, NO.' },
    { id: 12, name: 'CÁMARA LENTA', weight: 'uncommon', desc: 'Ralentiza el tiempo del jugador y la pelota mientras el bot se mueve normal.', text: 'TIEMPO FUERA.' },
    { id: 13, name: 'HACK DE VELOCIDAD', weight: 'common', desc: 'El bot obtiene supervelocidad vertical instantánea.', text: 'JUSTO Y BALANCEADO.' },
    { id: 14, name: 'CLON DEL BOT', weight: 'uncommon', desc: 'Genera una segunda raqueta enemiga para doble defensa.', text: 'AYUDÁNDOME A MÍ MISMO.' },
    { id: 15, name: 'IMÁN DE PELOTA', weight: 'uncommon', desc: 'Atrae magnéticamente la pelota hacia la raqueta del bot.', text: 'IMÁN.' },
    { id: 16, name: 'GANCHO', weight: 'uncommon', desc: 'Un gancho mecánico captura la pelota y la arrastra hacia el bot.', text: '¡VEN AQUÍ!' },
    { id: 17, name: 'ESCOBA', weight: 'uncommon', desc: 'El bot saca una escoba animada y barre la pelota en el aire.', text: '¡BARRIDO!' },
    { id: 18, name: 'PUERTA MÁGICA', weight: 'uncommon', desc: 'Una puerta mágica transporta la pelota detrás del jugador.', text: 'ATAJO.' },
    { id: 19, name: 'OVNI', weight: 'rare', desc: 'Un platillo volador abduce la pelota y la deja caer cerca del bot.', text: 'ABDUCCIÓN.' },
    { id: 20, name: 'VENTILADOR GIGANTE', weight: 'uncommon', desc: 'Viento de un ventilador empuja la pelota lejos del bot.', text: 'VENTARRÓN.' },
    { id: 21, name: 'ÁRBITRO CORRUPTO', weight: 'rare', desc: 'Un árbitro pita una falta falsa y devuelve la pelota al bot.', text: '¡FALTA!' },
    { id: 22, name: 'NUEVAS REGLAS', weight: 'extreme', desc: 'Aplica la regla: "EL JUGADOR NO PUEDE MARCAR" bloqueando el gol.', text: 'NUEVA REGLA.' },
    { id: 23, name: 'PUNTO FALSO', weight: 'extreme', desc: 'El bot revoca un punto del jugador: "ESO NO CUENTA".', text: 'ANULADO.' },
    { id: 24, name: 'CONTROLES INVERTIDOS', weight: 'uncommon', desc: 'Invierte los controles arriba/abajo del jugador.', text: 'CONTROLES INVERTIDOS.' },
    { id: 25, name: 'MANDO DESCONECTADO', weight: 'extreme', desc: 'Muestra "MANDO DESCONECTADO" congelando al jugador 1 segundo.', text: 'DESCONECTADO.' },
    { id: 26, name: 'PING 9999', weight: 'uncommon', desc: 'Simula lag extremo haciendo saltar la pelota erráticamente.', text: 'PING: 9999' },
    { id: 27, name: 'PORTERÍA MÓVIL', weight: 'rare', desc: 'El bot desplaza toda su portería verticalmente.', text: 'MOVÍ LA PORTERÍA.' },
    { id: 28, name: 'BÚMERAN', weight: 'uncommon', desc: 'La pelota rebasa al bot pero regresa sola como un búmeran.', text: 'VUELVE AL REMITENTE.' },
    { id: 29, name: 'PELOTA EXPLOSIVA', weight: 'extreme', desc: 'La pelota se convierte en un artefacto explosivo con mecha.', text: 'PELOTA CON MECHA.' },
    { id: 30, name: 'FÍSICA ERRÓNEA', weight: 'uncommon', desc: 'Los rebotes en las paredes responden con ángulos caóticos.', text: 'PARCHE DE FÍSICA.' }
  ];

  // --- PERSISTENCIA EN LOCAL STORAGE ---
  let highScore = parseInt(localStorage.getItem('pong_impossible_highscore') || '0', 10);
  let lossCount = parseInt(localStorage.getItem('pong_impossible_losses') || '0', 10);
  let winCount = parseInt(localStorage.getItem('pong_impossible_wins') || '0', 10);
  let discoveredCheats = [];
  try {
    discoveredCheats = JSON.parse(localStorage.getItem('pong_impossible_cheats') || '[]');
  } catch (e) {
    discoveredCheats = [];
  }

  function saveStorage() {
    try {
      localStorage.setItem('pong_impossible_highscore', highScore.toString());
      localStorage.setItem('pong_impossible_losses', lossCount.toString());
      localStorage.setItem('pong_impossible_wins', winCount.toString());
      localStorage.setItem('pong_impossible_cheats', JSON.stringify(discoveredCheats));
      localStorage.setItem('pong_impossible_lastmatch', new Date().toLocaleString());
    } catch (e) {}
  }

  function unlockCheat(cheatId) {
    if (!discoveredCheats.includes(cheatId)) {
      discoveredCheats.push(cheatId);
      saveStorage();
      const cheatObj = CHEATS_DB.find(c => c.id === cheatId);
      if (cheatObj) {
        showDiscoveryToast(`¡NUEVA TRAMPA DESCUBIERTA: ${cheatObj.name}!`);
      }
      updateCheatCountUI();
    }
  }

  // --- SINTETIZADOR DE AUDIO SIN TIMERS ASÍNCRONOS ---
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }

    init() {
      try {
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      } catch (e) {}
    }

    playTone(freq, type, duration, delayTime = 0, startGain = 0.2, endGain = 0.001) {
      if (this.muted || !this.ctx) return;
      try {
        const startTime = this.ctx.currentTime + delayTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(startGain, startTime);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, endGain), startTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      } catch (e) {}
    }

    playSweep(startFreq, endFreq, type, duration) {
      if (this.muted || !this.ctx) return;
      try {
        const startTime = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      } catch (e) {}
    }

    playNoise(duration, isExplosion = false) {
      if (this.muted || !this.ctx) return;
      try {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();

        if (isExplosion) {
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800, this.ctx.currentTime);
          filter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration);
          gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
          noise.connect(filter);
          filter.connect(gain);
        } else {
          gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
          noise.connect(gain);
        }
        gain.connect(this.ctx.destination);
        noise.start();
      } catch (e) {}
    }

    bounce() { this.playTone(440, 'square', 0.08, 0, 0.15); }
    wall() { this.playTone(220, 'square', 0.06, 0, 0.1); }
    scorePlayer() { 
      this.playTone(523.25, 'triangle', 0.1, 0, 0.2); 
      this.playTone(659.25, 'triangle', 0.12, 0.10, 0.2);
      this.playTone(783.99, 'triangle', 0.20, 0.20, 0.2);
    }
    scoreBot() { 
      this.playTone(300, 'sawtooth', 0.12, 0, 0.2); 
      this.playTone(200, 'sawtooth', 0.25, 0.12, 0.2);
    }
    cheatSound() { this.playSweep(300, 1200, 'sawtooth', 0.25); }
    explosion() { this.playNoise(0.5, true); }
    whistle() { this.playTone(1400, 'sine', 0.3, 0, 0.3); }
    win() {
      [440, 554.37, 659.25, 880].forEach((n, i) => {
        this.playTone(n, 'triangle', 0.25, i * 0.14, 0.3);
      });
    }
    lose() {
      [400, 350, 300, 220].forEach((n, i) => {
        this.playTone(n, 'sawtooth', 0.3, i * 0.16, 0.3);
      });
    }
  }

  const sound = new SoundEngine();

  // --- VARIABLES Y ESTADOS DEL JUEGO ---
  let currentScreen = 'menu'; // menu, howtoplay, cheatdb, game
  let gameState = 'menu'; // menu, playing, scoring, paused, gameover
  let scoringInProgress = false; // Bloqueo anti-doble gol
  let scoringTimer = 0; // Pausa no bloqueante de 0.8s
  let lastScoringTeam = null;
  let checkCheatThrottle = 0; // Temporizador anti-spam de trampas
  let debugCheatCycleId = 1;

  let isPaused = false;
  let isGameOver = false;
  let matchStartTime = 0;

  function updatePlayerLabel() {
    let alias = 'JUGADOR';
    if (typeof PetPixelStorage !== 'undefined' && typeof PetPixelStorage.getPlayerAlias === 'function') {
      alias = PetPixelStorage.getPlayerAlias();
    }
    const label = document.getElementById('player-label-text');
    if (label && alias) label.textContent = alias.toUpperCase();
  }

  let playerScore = 0;
  let botScore = 0;
  let desperationLevel = 0;

  let screenShakeTimer = 0;
  let screenShakeIntensity = 0;
  let timeScale = 1.0;

  // --- ESCALADO PROGRESIVO DE VELOCIDAD Y RALLY (SECCIONES 3, 4, 5, 6, 7) ---
  let rallyTime = 0; // Tiempo en segundos del rally actual
  let ballSpeedMultiplier = 1.0; // Multiplicador suave de velocidad
  let botDifficultyMultiplier = 1.0; // Multiplicador de agilidad del bot

  const MAX_BALL_SPEED_MULT = 1.40; // Límite estricto: máximo 1.40x tras rallies largos
  const MAX_BOT_SPEED = 9.5; // Límite absoluto de velocidad vertical del bot (px/frame)

  let botErrorOffset = 0; // Imperfección humana del bot (nunca 100% infalible)
  let botErrorTimer = 0;

  const keys = { w: false, s: false, ArrowUp: false, ArrowDown: false };

  // --- ENTIDADES PRINCIPALES ---
  const player = {
    x: 35, y: GAME_HEIGHT / 2 - 45,
    w: 16, h: 90, speed: 8.5, color: '#00f0ff',
    stunnedTimer: 0, mirrorTimer: 0, disconnectTimer: 0
  };

  const bot = {
    defaultX: GAME_WIDTH - 35 - 16,
    x: GAME_WIDTH - 35 - 16,
    y: GAME_HEIGHT / 2 - 45,
    w: 16, defaultH: 90, h: 90, targetH: 90,
    speed: 5.4, color: '#ff0055',
    chasing: false, speedHack: false,
    speechText: '', speechTimer: 0
  };

  const ball = {
    x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2,
    radius: 9, vx: -7.0, vy: 2.5, baseSpeed: 7.0,
    color: '#ffffff', trail: [],
    history: [], isExplosive: false, boomerang: false
  };

  // --- ENTIDADES Y ESTADOS DE LAS 30 TRAMPAS ---
  let secondBall = null;
  let illegalWall = { active: false, x: 0, w: 12 };
  let botClone = { active: false, x: 0, y: 0, w: 16, h: 90, vy: -5 };
  let portals = { active: false, p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, cooldown: 0, angle: 0 };
  let bomb = { active: false, x: 0, y: 0, radius: 18, fuseTimer: 1.2, maxFuse: 1.2, explosionRadius: 130 };
  let fan = { active: false, x: 0, y: 0, angle: 0 };
  let referee = { active: false, y: -60, targetY: 55, whistleDone: false };
  let tennisRacket = { active: false, angle: -Math.PI * 0.4, swingTimer: 0.6, maxSwing: 0.6, hitDone: false };
  let mechanicalArm = { active: false, progress: 0, maxReach: 170, hitDone: false, state: 'extending' };
  let divineHand = { active: false, x: GAME_WIDTH * 0.62, y: -160, targetY: 0, state: 'descending', hitDone: false };
  let hook = { active: false, x: 0, y: 0, state: 'shooting' };
  let broom = { active: false, angle: -Math.PI * 0.45, swingTimer: 0.6, hitDone: false };
  let magicDoor = { active: false, d1: { x: 0, y: 0 }, d2: { x: 0, y: 0 } };
  let ufo = { active: false, x: 0, y: -60, state: 'descending', holdTimer: 0.45, released: false };

  let newRuleActive = false;
  let wrongPhysicsTimer = 0;
  let ping9999Timer = 0;
  let movingGoal = { active: false, y: 0, dir: 1, maxOffset: 120 };
  let magnet = { active: false, strength: 16.0 };

  let particles = [];
  let floatingTexts = [];

  // --- SISTEMA VISUAL DE CHEATS (INDICADORES, GHOSTS, RINGS & OVERLAYS) ---
  let activeCheatBadge = null;
  let visualGhosts = [];
  let visualRings = [];
  let bannerTimeout = null;

  function triggerCheatBadge(cheatId) {
    const cheatObj = CHEATS_DB.find(c => c.id === cheatId);
    if (!cheatObj) return;
    activeCheatBadge = {
      id: cheatId,
      name: cheatObj.name,
      text: cheatObj.text || cheatObj.name,
      timer: 0.95,
      maxTimer: 0.95
    };
    unlockCheat(cheatId);
  }

  function addGhost(x, y, w, h, color = '#ff0055', alpha = 0.5, life = 0.35) {
    if (visualGhosts.length >= 20) visualGhosts.shift();
    visualGhosts.push({ x, y, w, h, color, alpha, life, maxLife: life });
  }

  function addRing(x, y, radius = 10, maxRadius = 50, color = '#00f0ff', life = 0.35) {
    if (visualRings.length >= 15) visualRings.shift();
    visualRings.push({ x, y, radius, maxRadius, color, life, maxLife: life });
  }

  function createImpactEffect(x, y, intensity = 1.0, color = '#ff0055') {
    triggerScreenShake(Math.min(14, 5 * intensity), 0.22);
    addRing(x, y, 12 * intensity, 55 * intensity, color, 0.35);
    const count = Math.min(18, Math.floor(9 * intensity));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (2 + Math.random() * 4.5) * intensity;
      addParticle(x, y, color, (2.5 + Math.random() * 3) * intensity, Math.cos(angle) * spd, Math.sin(angle) * spd, 0.45);
    }
  }

  // --- CÁLCULO CONTROLADO Y SUAVE DE ACELERACIÓN DE PELOTA (SECCIÓN 5) ---
  function calcBallSpeedMultiplier(time) {
    if (time <= 3.0) {
      return 1.00;
    } else if (time <= 6.0) {
      return 1.00 + (time - 3.0) * (0.05 / 3.0); // 1.00 -> 1.05
    } else if (time <= 9.0) {
      return 1.05 + (time - 6.0) * (0.05 / 3.0); // 1.05 -> 1.10
    } else if (time <= 12.0) {
      return 1.10 + (time - 9.0) * (0.05 / 3.0); // 1.10 -> 1.15
    } else if (time <= 15.0) {
      return 1.15 + (time - 12.0) * (0.05 / 3.0); // 1.15 -> 1.20
    } else if (time <= 20.0) {
      return 1.20 + (time - 15.0) * (0.05 / 5.0); // 1.20 -> 1.25
    } else {
      return Math.min(MAX_BALL_SPEED_MULT, 1.25 + (time - 20.0) * 0.015); // 1.25 -> 1.40 máx
    }
  }

  // --- ADMINISTRADOR DE TRAMPAS SEGURO (DELTA-TIME TIMERS) ---
  class CheatManagerClass {
    constructor() {
      this.currentCheatId = null;
      this.timer = 0;
      this.cooldown = 0;
      this.cleanupFn = null;
      this.deck = [];
      this.refillDeck();
    }

    refillDeck() {
      this.deck = Array.from({ length: 30 }, (_, i) => i + 1);
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
    }

    getNextCheatId() {
      if (!this.deck || this.deck.length === 0) {
        this.refillDeck();
      }
      return this.deck.pop();
    }

    canActivate() {
      return this.cooldown <= 0 && 
             this.currentCheatId === null && 
             !scoringInProgress && 
             gameState === 'playing' && 
             currentScreen === 'game';
    }

    update(dt) {
      if (this.cooldown > 0) this.cooldown -= dt;

      if (this.currentCheatId !== null) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.stopCurrentCheat();
        }
      }
    }

    stopCurrentCheat() {
      if (this.cleanupFn) {
        try { this.cleanupFn(); } catch (e) {}
      }
      this.currentCheatId = null;
      this.cleanupFn = null;

      timeScale = 1.0;
      bot.targetH = bot.defaultH;
      bot.h = bot.defaultH;
      bot.chasing = false;
      bot.speedHack = false;
      player.mirrorTimer = 0;
      player.disconnectTimer = 0;

      secondBall = null;
      illegalWall.active = false;
      botClone.active = false;
      portals.active = false;
      bomb.active = false;
      fan.active = false;
      referee.active = false;
      tennisRacket.active = false;
      mechanicalArm.active = false;
      divineHand.active = false;
      hook.active = false;
      broom.active = false;
      magicDoor.active = false;
      ufo.active = false;

      newRuleActive = false;
      wrongPhysicsTimer = 0;
      ping9999Timer = 0;
      movingGoal.active = false;
      movingGoal.y = 0;
      magnet.active = false;
      ball.isExplosive = false;
      ball.boomerang = false;

      const baseCooldowns = [1.4, 1.0, 0.7, 0.35];
      const diffFactor = Math.max(0.65, 1.0 - (ballSpeedMultiplier - 1.0));
      this.cooldown = Math.max(0.2, (baseCooldowns[desperationLevel] || 0.9) * diffFactor);
    }

    activate(cheatId) {
      if (this.currentCheatId !== null) {
        this.stopCurrentCheat();
      }

      const cheatObj = CHEATS_DB.find(c => c.id === cheatId);
      if (!cheatObj) return;

      this.currentCheatId = cheatId;
      unlockCheat(cheatId);

      triggerCheatBadge(cheatId);
      showCheatBanner(cheatObj.name);
      sound.cheatSound();

      switch (cheatId) {
        case 1: // TELETRANSPORTE
          this.timer = 0.5;
          addGhost(bot.x, bot.y, bot.w, bot.h, '#ff0055', 0.8, 0.4);
          addRing(bot.x, bot.y + bot.h / 2, 10, 50, '#ff0055', 0.3);
          bot.y = Math.max(10, Math.min(GAME_HEIGHT - bot.h - 10, ball.y - bot.h / 2));
          addRing(bot.x, bot.y + bot.h / 2, 10, 60, '#00f0ff', 0.35);
          addFloatingText("¡TELETRANSPORTE!", bot.x - 90, bot.y, '#00f0ff', 18);
          setBotSpeech("Parpadea y te lo pierdes.");
          if (ball.vx > 0 && ball.x > GAME_WIDTH * 0.4) {
            ball.vx = -Math.abs(ball.vx);
            createImpactEffect(bot.x, ball.y, 0.9, '#00f0ff');
          }
          this.cleanupFn = () => {};
          break;

        case 2: // RAQUETA GIGANTE
          this.timer = 2.0;
          bot.targetH = GAME_HEIGHT * 0.88;
          addFloatingText("NADA DE ESO.", bot.x - 80, GAME_HEIGHT / 2, '#ff0055', 24);
          setBotSpeech("Intenta marcar ahora.");
          triggerScreenShake(4, 0.2);
          this.cleanupFn = () => {
            bot.targetH = bot.defaultH;
            bot.h = bot.defaultH;
          };
          break;

        case 3: // PERSECUCIÓN ILEGAL
          this.timer = 3.0;
          bot.chasing = true;
          addFloatingText("¡REGLAS OPCIONALES!", bot.x - 110, bot.y, '#ffee00', 18);
          setBotSpeech("Las reglas son para humanos.");
          this.cleanupFn = () => {
            bot.chasing = false;
          };
          break;

        case 4: // RAQUETA DE TENIS
          this.timer = 0.8;
          tennisRacket = {
            active: true,
            angle: -Math.PI * 0.4,
            swingTimer: 0.6,
            maxSwing: 0.6,
            hitDone: false
          };
          addFloatingText("¿EN SERIO?", bot.x - 80, bot.y, '#00ff88', 18);
          setBotSpeech("¡SAQUE DE TENIS!");
          this.cleanupFn = () => { tennisRacket.active = false; };
          break;

        case 5: // BOMBA
          this.timer = 1.6;
          bomb = {
            active: true,
            x: player.x + 35,
            y: Math.max(50, Math.min(GAME_HEIGHT - 50, player.y + player.h / 2)),
            radius: 18,
            fuseTimer: 1.2,
            maxFuse: 1.2,
            explosionRadius: 130
          };
          addFloatingText("¡BOMBA!", bot.x - 60, bot.y, '#ff0055', 18);
          setBotSpeech("Esquiva esto.");
          this.cleanupFn = () => { bomb.active = false; };
          break;

        case 6: // SEGUNDA PELOTA
          this.timer = 4.5;
          secondBall = {
            x: GAME_WIDTH / 2,
            y: GAME_HEIGHT / 2,
            radius: 9,
            vx: -ball.vx || -6.5,
            vy: -ball.vy || 2.5,
            color: '#ffee00',
            trail: []
          };
          addFloatingText("¡MULTIPELOTA!", GAME_WIDTH / 2 - 60, 50, '#ffee00', 20);
          setBotSpeech("¡Doble problema!");
          this.cleanupFn = () => { secondBall = null; };
          break;

        case 7: // PORTAL
          this.timer = 3.0;
          portals = {
            active: true,
            p1: { x: bot.x - 70, y: Math.max(60, Math.min(GAME_HEIGHT - 60, ball.y)) },
            p2: { x: player.x + 85, y: Math.max(60, Math.min(GAME_HEIGHT - 60, player.y + player.h / 2)) },
            cooldown: 0,
            angle: 0
          };
          addFloatingText("¡AGUJERO DE GUSANO!", bot.x - 110, bot.y, '#00f0ff', 18);
          setBotSpeech("Truco de magia cuántico.");
          this.cleanupFn = () => { portals.active = false; };
          break;

        case 8: // MURO ILEGAL
          this.timer = 3.2;
          illegalWall = { active: true, x: bot.x - 55, w: 12 };
          addFloatingText("TÉCNICAMENTE LEGAL.", bot.x - 120, bot.y, '#00f0ff', 18);
          setBotSpeech("Escudo de fuerza activo.");
          this.cleanupFn = () => { illegalWall.active = false; };
          break;

        case 9: // BRAZO EXTENSIBLE
          this.timer = 1.0;
          mechanicalArm = {
            active: true,
            progress: 0,
            maxReach: 170,
            hitDone: false,
            state: 'extending'
          };
          addFloatingText("¡TE TENGO!", bot.x - 70, bot.y, '#ff0055', 18);
          setBotSpeech("¡Inspector Gadget!");
          this.cleanupFn = () => { mechanicalArm.active = false; };
          break;

        case 10: // MANO DIVINA
          this.timer = 1.4;
          divineHand = {
            active: true,
            x: GAME_WIDTH * 0.62,
            y: -160,
            targetY: ball.y - 30,
            state: 'descending',
            hitDone: false
          };
          addFloatingText("MI MANO.", GAME_WIDTH / 2 - 40, 80, '#ffee00', 22);
          setBotSpeech("¡Castigo divino!");
          this.cleanupFn = () => { divineHand.active = false; };
          break;

        case 11: // REBOBINAR TIEMPO
          this.timer = 0.9;
          addFloatingText("REWIND ⏪", bot.x - 80, bot.y, '#00f0ff', 20);
          setBotSpeech("Rebobinemos eso.");
          if (ball.history && ball.history.length > 0) {
            const idx = Math.max(0, ball.history.length - 25);
            const old = ball.history[idx];
            if (old && !isNaN(old.x) && !isNaN(old.y)) {
              for (let i = ball.history.length - 1; i >= idx; i -= 3) {
                const pt = ball.history[i];
                addRing(pt.x, pt.y, 8, 30, '#00f0ff', 0.4);
              }
              ball.x = old.x;
              ball.y = old.y;
              ball.vx = -ball.vx;
            }
          }
          triggerScreenShake(4, 0.2);
          this.cleanupFn = () => {};
          break;

        case 12: // CÁMARA LENTA
          this.timer = 2.5;
          timeScale = 0.35;
          addFloatingText("SLOW MOTION ⏱️", GAME_WIDTH / 2 - 80, 50, '#00f0ff', 20);
          setBotSpeech("Modo Matrix.");
          this.cleanupFn = () => { timeScale = 1.0; };
          break;

        case 13: // HACK DE VELOCIDAD
          this.timer = 2.5;
          bot.speedHack = true;
          addFloatingText("JUSTO Y BALANCEADO.", bot.x - 120, bot.y, '#ff0055', 18);
          setBotSpeech("¡A MÁXIMA VELOCIDAD!");
          this.cleanupFn = () => { bot.speedHack = false; };
          break;

        case 14: // CLON DEL BOT
          this.timer = 3.5;
          botClone = {
            active: true,
            x: bot.x - 30,
            y: Math.min(GAME_HEIGHT - 90, (bot.y + 140) % (GAME_HEIGHT - 100)),
            w: 16,
            h: 90,
            vy: -bot.speed
          };
          addFloatingText("AYUDÁNDOME A MÍ MISMO.", bot.x - 130, bot.y, '#ff0055', 18);
          setBotSpeech("Conoce a mi gemelo.");
          this.cleanupFn = () => { botClone.active = false; };
          break;

        case 15: // IMÁN DE PELOTA
          this.timer = 2.2;
          magnet = { active: true, strength: 16.0 };
          addFloatingText("IMÁN 🧲", bot.x - 70, bot.y, '#ffee00', 18);
          setBotSpeech("Fuerza de atracción electromagnética.");
          this.cleanupFn = () => { magnet.active = false; };
          break;

        case 16: // GANCHO
          this.timer = 1.5;
          hook = {
            active: true,
            x: bot.x,
            y: bot.y + bot.h / 2,
            state: 'shooting'
          };
          addFloatingText("¡VEN AQUÍ!", bot.x - 90, bot.y, '#ff0055', 18);
          setBotSpeech("¡Trae eso acá!");
          this.cleanupFn = () => { hook.active = false; };
          break;

        case 17: // ESCOBA
          this.timer = 0.8;
          broom = {
            active: true,
            angle: -Math.PI * 0.45,
            swingTimer: 0.6,
            hitDone: false
          };
          addFloatingText("¡BARRIDO! 🧹", bot.x - 70, bot.y, '#ffee00', 18);
          setBotSpeech("Limpiando el campo.");
          this.cleanupFn = () => { broom.active = false; };
          break;

        case 18: // PUERTA MÁGICA
          this.timer = 1.4;
          magicDoor = {
            active: true,
            d1: { x: bot.x - 70, y: Math.max(50, Math.min(GAME_HEIGHT - 50, ball.y)) },
            d2: { x: player.x - 25, y: Math.max(50, Math.min(GAME_HEIGHT - 50, player.y + player.h / 2)) }
          };
          addFloatingText("ATAJO 🚪", GAME_WIDTH / 2 - 40, 50, '#00f0ff', 20);
          setBotSpeech("Puerta trasera directa.");
          if (ball.vx > 0) {
            createImpactEffect(magicDoor.d1.x, magicDoor.d1.y, 0.9, '#00f0ff');
            ball.x = magicDoor.d2.x + 10;
            ball.y = magicDoor.d2.y;
            ball.vx = -Math.abs(ball.vx);
            createImpactEffect(magicDoor.d2.x, magicDoor.d2.y, 0.9, '#ff0055');
          }
          this.cleanupFn = () => { magicDoor.active = false; };
          break;

        case 19: // OVNI
          this.timer = 1.6;
          ufo = {
            active: true,
            x: ball.x,
            y: -60,
            state: 'descending',
            holdTimer: 0.45,
            released: false
          };
          addFloatingText("ABDUCCIÓN 🛸", ball.x - 20, Math.max(40, ball.y - 40), '#00ff88', 18);
          setBotSpeech("Los extraterrestres juegan conmigo.");
          this.cleanupFn = () => { ufo.active = false; };
          break;

        case 20: // VENTILADOR GIGANTE
          this.timer = 2.5;
          fan = {
            active: true,
            x: bot.x - 85,
            y: GAME_HEIGHT / 2,
            angle: 0
          };
          addFloatingText("VENTARRÓN 💨", bot.x - 90, bot.y, '#00f0ff', 18);
          setBotSpeech("Hace mucho viento.");
          this.cleanupFn = () => { fan.active = false; };
          break;

        case 21: // ÁRBITRO CORRUPTO
          this.timer = 1.6;
          referee = {
            active: true,
            y: -60,
            targetY: 55,
            whistleDone: false
          };
          sound.whistle();
          addFloatingText("¡FALTA!", GAME_WIDTH / 2 - 30, 60, '#ff0055', 24);
          setBotSpeech("¡El árbitro pita falta del jugador!");
          ball.x = bot.x - 40;
          ball.y = bot.y + bot.h / 2;
          ball.vx = -Math.abs(ball.baseSpeed * ballSpeedMultiplier);
          this.cleanupFn = () => { referee.active = false; };
          break;

        case 22: // NUEVAS REGLAS
          this.timer = 3.5;
          newRuleActive = true;
          addFloatingText("NUEVA REGLA: EL JUGADOR NO PUEDE MARCAR", GAME_WIDTH / 2 - 180, 40, '#ff0055', 13);
          setBotSpeech("Revisa el reglamento oficial.");
          this.cleanupFn = () => { newRuleActive = false; };
          break;

        case 23: // PUNTO FALSO
          this.timer = 1.2;
          addFloatingText("ESO NO CUENTA.", bot.x - 120, bot.y, '#ff0055', 16);
          setBotSpeech("¡Punto anulado por el comité!");
          if (playerScore > 0) {
            playerScore--;
            updateHUDScore();
            sound.scoreBot();
            triggerScreenShake(8, 0.3);
            addFloatingText("-1 PUNTO (ANULADO)", GAME_WIDTH / 2 - 90, 90, '#ff0055', 20, 1.5);
          }
          this.cleanupFn = () => {};
          break;

        case 24: // CONTROLES INVERTIDOS
          this.timer = 3.5;
          player.mirrorTimer = 3.5;
          addFloatingText("CONTROLES INVERTIDOS ↕️", player.x + 20, player.y, '#ffee00', 15);
          setBotSpeech("¡Gravedad invertida!");
          this.cleanupFn = () => { player.mirrorTimer = 0; };
          break;

        case 25: // MANDO DESCONECTADO
          this.timer = 1.2;
          player.disconnectTimer = 1.2;
          addFloatingText("MANDO DESCONECTADO", player.x + 20, player.y, '#ff0055', 14);
          setBotSpeech("Revisa tus baterías.");
          triggerScreenShake(4, 0.2);
          this.cleanupFn = () => { player.disconnectTimer = 0; };
          break;

        case 26: // PING 9999
          this.timer = 3.0;
          ping9999Timer = 3.0;
          addFloatingText("PING: 9999", GAME_WIDTH / 2 - 40, 50, '#ff0055', 18);
          setBotSpeech("Tu conexión es terrible.");
          this.cleanupFn = () => { ping9999Timer = 0; };
          break;

        case 27: // PORTERÍA MÓVIL
          this.timer = 3.0;
          movingGoal = {
            active: true,
            y: 0,
            dir: 1,
            maxOffset: 120
          };
          addFloatingText("MOVÍ LA PORTERÍA 🥅", bot.x - 120, bot.y, '#00f0ff', 16);
          setBotSpeech("Geometría flexible de cancha.");
          this.cleanupFn = () => {
            movingGoal.active = false;
            movingGoal.y = 0;
          };
          break;

        case 28: // BÚMERAN
          this.timer = 2.2;
          ball.boomerang = true;
          addFloatingText("VUELVE AL REMITENTE 🪃", bot.x - 130, bot.y, '#ffee00', 16);
          setBotSpeech("¡Efecto búmeran!");
          this.cleanupFn = () => { ball.boomerang = false; };
          break;

        case 29: // PELOTA EXPLOSIVA
          this.timer = 3.5;
          ball.isExplosive = true;
          addFloatingText("PELOTA CON MECHA 💣", GAME_WIDTH / 2 - 70, 50, '#ff0055', 18);
          setBotSpeech("¡Atrapa esto si puedes!");
          this.cleanupFn = () => { ball.isExplosive = false; };
          break;

        case 30: // FÍSICA ERRÓNEA
          this.timer = 3.0;
          wrongPhysicsTimer = 3.0;
          addFloatingText("PARCHE DE FÍSICA 🌀", GAME_WIDTH / 2 - 70, 50, '#00f0ff', 18);
          setBotSpeech("Gravedad versión 2.0 con bugs.");
          this.cleanupFn = () => { wrongPhysicsTimer = 0; };
          break;
      }
    }

    triggerWeightedRandom() {
      if (!this.canActivate()) return;
      const nextCheatId = this.getNextCheatId();
      this.activate(nextCheatId);
    }
  }

  const cheatManager = new CheatManagerClass();

  // Función global para depuración y pruebas individuales (Requerimiento 70)
  window.debugCheat = function(idOrName) {
    let cheatObj = null;
    if (typeof idOrName === 'number') {
      cheatObj = CHEATS_DB.find(c => c.id === idOrName);
    } else {
      cheatObj = CHEATS_DB.find(c => c.name.toLowerCase().includes(String(idOrName).toLowerCase()));
    }
    if (cheatObj) {
      cheatManager.activate(cheatObj.id);
      console.log(`[DEBUG CHEAT ACTIVADO] #${cheatObj.id} - ${cheatObj.name}`);
    } else {
      console.warn(`[DEBUG CHEAT ERROR] No se encontró el cheat: ${idOrName}`);
    }
  };

  // --- REINICIO DE ESTADO DE RALLY Y DIFICULTAD (SECCIÓN 7) ---
  function resetRallyState() {
    rallyTime = 0;
    ballSpeedMultiplier = 1.0;
    botDifficultyMultiplier = 1.0;
    botErrorOffset = 0;
    botErrorTimer = 0;
  }

  // --- REINICIO DE TRAMPAS Y MEMORIA TRAS UN GOL (SECCIÓN 67) ---
  function resetCheatsAfterGoal() {
    cheatManager.stopCurrentCheat();
    cheatManager.cooldown = 1.6;

    timeScale = 1.0;
    bot.targetH = bot.defaultH;
    bot.h = bot.defaultH;
    bot.chasing = false;
    bot.speedHack = false;
    bot.x = bot.defaultX;

    player.mirrorTimer = 0;
    player.disconnectTimer = 0;
    player.stunnedTimer = 0;

    secondBall = null;
    illegalWall.active = false;
    botClone.active = false;
    portals.active = false;
    bomb.active = false;
    fan.active = false;
    referee.active = false;
    tennisRacket.active = false;
    mechanicalArm.active = false;
    divineHand.active = false;
    hook.active = false;
    broom.active = false;
    magicDoor.active = false;
    ufo.active = false;

    newRuleActive = false;
    wrongPhysicsTimer = 0;
    ping9999Timer = 0;
    movingGoal.active = false;
    movingGoal.y = 0;
    magnet.active = false;
    ball.isExplosive = false;
    ball.boomerang = false;

    particles = [];
    floatingTexts = [];
    visualGhosts = [];
    visualRings = [];

    resetRallyState();
  }

  // --- REINICIO DE PELOTA SEGURO (SECCIÓN 6) ---
  function resetBall(scorer) {
    resetRallyState();

    ball.x = GAME_WIDTH / 2;
    ball.y = GAME_HEIGHT / 2;
    ball.trail = [];
    ball.history = [];
    ball.isExplosive = false;
    ball.boomerang = false;

    const baseSpd = ball.baseSpeed;
    const angle = (Math.random() * 0.4 - 0.2);
    const dir = scorer === 'player' ? -1 : 1;

    ball.vx = Math.cos(angle) * baseSpd * dir;
    ball.vy = Math.sin(angle) * baseSpd;
  }

  // --- FUNCIÓN CENTRALIZADA DE PUNTUACIÓN (SECCIÓN 66) ---
  function handleGoal(team) {
    if (scoringInProgress || gameState === 'scoring' || gameState === 'gameover' || gameState === 'menu') {
      return;
    }

    scoringInProgress = true;
    gameState = 'scoring';
    lastScoringTeam = team;
    scoringTimer = 0.80; // 800ms de animación no bloqueante

    if (team === 'player') {
      playerScore++;
      sound.scorePlayer();
      addFloatingText("¡PUNTO JUGADOR!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '#00f0ff', 24, 1.2);
    } else if (team === 'bot') {
      botScore++;
      sound.scoreBot();
      addFloatingText("¡PUNTO BOT!", GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '#ff0055', 24, 1.2);
    }

    updateHUDScore();
    updateDesperation();
    triggerScreenShake(8, 0.25);

    resetCheatsAfterGoal();
    resetBall(team);

    if (team === 'player') {
      setBotSpeech(getScoreTextForBot(), 2.5);
    } else {
      setBotSpeech(selectRandom(["Calculado.", "Problema de habilidad.", "Fácil.", "Como se esperaba."]), 2.5);
    }
  }

  // --- DIBUJO DE TRAMPAS Y EFECTOS ESPECIALES (SECCIONES 44-59) ---
  function drawMechanicalArm() {
    try {
      ctx.save();
      const originX = bot.x;
      const originY = bot.y + bot.h / 2;
      const reachX = bot.x - mechanicalArm.progress;
      const targetY = ball.y;

      ctx.strokeStyle = '#888899';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      const midX = (originX + reachX) / 2;
      const midY = (originY + targetY) / 2 + 15;
      ctx.lineTo(midX, midY);
      ctx.lineTo(reachX, targetY);
      ctx.stroke();

      // Articulaciones metálicas
      ctx.fillStyle = '#ff0055';
      ctx.beginPath(); ctx.arc(originX, originY, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(midX, midY, 6, 0, Math.PI * 2); ctx.fill();

      // Pinza mecánica en la punta
      ctx.fillStyle = '#ffee00';
      ctx.fillRect(reachX - 14, targetY - 14, 14, 28);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(reachX - 14, targetY - 14, 14, 28);
      ctx.restore();
    } catch (e) {}
  }

  function drawDivineHand() {
    try {
      ctx.save();
      const hx = divineHand.x;
      const hy = divineHand.y;

      // Sombra proyectada en el suelo
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(hx + 30, GAME_HEIGHT - 25, 45, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Aura divina dorada
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ffee00';
      ctx.fillStyle = '#ffee00';
      drawRoundRect(ctx, hx, hy, 65, 95, 16);
      ctx.fill();

      // Nudillos y muñeca
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hx + 12, hy + 20, 42, 10);
      ctx.fillRect(hx + 12, hy + 40, 42, 10);
      ctx.fillRect(hx + 12, hy + 60, 42, 10);

      ctx.fillStyle = '#000000';
      ctx.font = '10px "Press Start 2P"';
      ctx.fillText('HAND', hx + 10, hy + 85);
      ctx.restore();
    } catch (e) {}
  }

  function drawHook() {
    try {
      ctx.save();
      const originX = bot.x;
      const originY = bot.y + bot.h / 2;

      // Cadena animada con eslabones
      ctx.strokeStyle = '#aaaaaa';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(hook.x, hook.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Garra de 3 puntas
      ctx.translate(hook.x, hook.y);
      ctx.fillStyle = '#ff0055';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff0055';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffee00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, -10); ctx.lineTo(-2, -3); ctx.lineTo(0, 0);
      ctx.moveTo(-10, 0); ctx.lineTo(-2, 0);
      ctx.moveTo(-8, 10); ctx.lineTo(-2, 3); ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.restore();
    } catch (e) {}
  }

  function drawBroom() {
    try {
      ctx.save();
      ctx.translate(bot.x - 25, ball.y);
      ctx.rotate(broom.angle);

      // Mango de madera
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(-5, -60, 10, 70);

      // Cerdas de paja amarilla
      ctx.fillStyle = '#ffee00';
      ctx.beginPath();
      ctx.moveTo(-16, 10);
      ctx.lineTo(16, 10);
      ctx.lineTo(24, 38);
      ctx.lineTo(-24, 38);
      ctx.closePath();
      ctx.fill();

      // Líneas de textura en cerdas
      ctx.strokeStyle = '#b8860b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, 10); ctx.lineTo(-12, 38);
      ctx.moveTo(0, 10); ctx.lineTo(0, 38);
      ctx.moveTo(8, 10); ctx.lineTo(12, 38);
      ctx.stroke();
      ctx.restore();
    } catch (e) {}
  }

  function drawTennisRacket() {
    try {
      ctx.save();
      const rx = bot.x - 20;
      const ry = bot.y + bot.h / 2;
      ctx.translate(rx, ry);
      ctx.rotate(tennisRacket.angle);

      // Mango de la raqueta
      ctx.fillStyle = '#654321';
      ctx.fillRect(-4, -15, 8, 45);

      // Marco ovalado verde neón
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ff88';
      ctx.beginPath();
      ctx.ellipse(0, -45, 20, 30, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Cuerdas de la raqueta
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      for (let x = -14; x <= 14; x += 7) {
        ctx.beginPath(); ctx.moveTo(x, -72); ctx.lineTo(x, -18); ctx.stroke();
      }
      for (let y = -65; y <= -25; y += 8) {
        ctx.beginPath(); ctx.moveTo(-16, y); ctx.lineTo(16, y); ctx.stroke();
      }
      ctx.restore();
    } catch (e) {}
  }

  function drawUFO() {
    try {
      ctx.save();
      const ux = ufo.x;
      const uy = ufo.y;

      // Rayo tractor verde neón cónico
      if (uy > 10) {
        const grad = ctx.createLinearGradient(ux, uy + 10, ux, ball.y + 20);
        grad.addColorStop(0, 'rgba(0, 255, 136, 0.65)');
        grad.addColorStop(1, 'rgba(0, 255, 136, 0.1)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(ux - 16, uy + 8);
        ctx.lineTo(ux + 16, uy + 8);
        ctx.lineTo(ux + 45, Math.min(GAME_HEIGHT - 10, ball.y + 25));
        ctx.lineTo(ux - 45, Math.min(GAME_HEIGHT - 10, ball.y + 25));
        ctx.closePath();
        ctx.fill();
      }

      // Cúpula del platillo
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(ux, uy - 4, 14, Math.PI, 0);
      ctx.fill();

      // Cuerpo del platillo
      ctx.fillStyle = '#00ff88';
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00ff88';
      ctx.beginPath();
      ctx.ellipse(ux, uy + 2, 34, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // Luces pulsantes
      ctx.fillStyle = '#ffffff';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(ux + i * 12, uy + 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } catch (e) {}
  }

  function drawFan() {
    try {
      ctx.save();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f0ff';

      // Rejilla exterior
      ctx.beginPath();
      ctx.arc(fan.x, fan.y, 32, 0, Math.PI * 2);
      ctx.stroke();

      // Aspas giratorias
      ctx.save();
      ctx.translate(fan.x, fan.y);
      ctx.rotate(fan.angle);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 16, 6, 15, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Líneas de viento aerodinámicas
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const lineY = fan.y - 18 + i * 18;
        const offsetX = (Date.now() * 0.25 + i * 40) % 220;
        ctx.beginPath();
        ctx.moveTo(fan.x - offsetX, lineY);
        ctx.lineTo(fan.x - offsetX - 40, lineY);
        ctx.stroke();
      }
      ctx.restore();
    } catch (e) {}
  }

  function drawReferee() {
    try {
      ctx.save();
      const rx = GAME_WIDTH / 2;
      const ry = referee.y;

      // Cuerpo rayado blanco y negro
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx - 16, ry, 32, 38);
      ctx.fillStyle = '#000000';
      ctx.fillRect(rx - 16, ry, 8, 38);
      ctx.fillRect(rx + 8, ry, 8, 38);

      // Cabeza
      ctx.fillStyle = '#ffcc99';
      ctx.fillRect(rx - 10, ry - 16, 20, 16);

      // Tarjeta de penalización en alto (Amarilla/Roja parpadeante)
      ctx.fillStyle = (Date.now() % 400 < 200) ? '#ffee00' : '#ff0055';
      ctx.shadowBlur = 12;
      ctx.shadowColor = ctx.fillStyle;
      ctx.fillRect(rx + 14, ry - 30, 14, 22);

      // Silbato
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(rx - 3, ry - 2, 6, 4);

      ctx.fillStyle = '#ffffff';
      ctx.font = '8px "Press Start 2P"';
      ctx.fillText('REF', rx - 12, ry - 35);
      ctx.restore();
    } catch (e) {}
  }

  function drawMagicDoors() {
    try {
      ctx.save();
      // Puerta 1 (Azul Neón junto al bot)
      const d1 = magicDoor.d1;
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f0ff';
      drawRoundRect(ctx, d1.x - 14, d1.y - 30, 28, 60, 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 240, 255, 0.25)';
      ctx.fill();

      // Puerta 2 (Magenta Neón tras el jugador)
      const d2 = magicDoor.d2;
      ctx.strokeStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      drawRoundRect(ctx, d2.x - 14, d2.y - 30, 28, 60, 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 0, 85, 0.25)';
      ctx.fill();
      ctx.restore();
    } catch (e) {}
  }

  function drawPortals() {
    try {
      ctx.save();
      const p1 = portals.p1;
      const p2 = portals.p2;

      // Portal 1 (Cian giratorio)
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.ellipse(p1.x, p1.y, 14, 32, portals.angle, 0, Math.PI * 2);
      ctx.stroke();

      // Portal 2 (Magenta giratorio)
      ctx.strokeStyle = '#ff0055';
      ctx.shadowColor = '#ff0055';
      ctx.beginPath();
      ctx.ellipse(p2.x, p2.y, 14, 32, -portals.angle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } catch (e) {}
  }

  // --- NAVEGACIÓN Y UI ---
  function switchScreen(screenName) {
    currentScreen = screenName;
    document.querySelectorAll('.screen-panel').forEach(p => p.classList.add('hidden'));

    if (screenName === 'menu') {
      gameState = 'menu';
      scoringInProgress = false;
      resetCheatsAfterGoal();
      document.getElementById('menu-screen').classList.remove('hidden');
      updateMenuUI();
    } else if (screenName === 'howtoplay') {
      document.getElementById('how-to-play-screen').classList.remove('hidden');
    } else if (screenName === 'cheatdb') {
      document.getElementById('cheat-database-screen').classList.remove('hidden');
      renderCheatDatabase();
    } else if (screenName === 'game') {
      document.getElementById('game-screen').classList.remove('hidden');
    }
  }

  function updateMenuUI() {
    document.getElementById('high-score-val').textContent = highScore;
    updateCheatCountUI();

    const subtitleEl = document.getElementById('menu-subtitle');
    const playBtn = document.getElementById('btn-play');

    if (lossCount === 0) {
      subtitleEl.textContent = '"EL BOT HARÁ TRAMPA."';
      playBtn.textContent = 'JUGAR';
    } else if (lossCount === 1) {
      subtitleEl.textContent = '"Buen intento."';
      playBtn.textContent = 'REINTENTAR';
    } else if (lossCount <= 3) {
      subtitleEl.textContent = '"¿Sigues intentándolo?"';
      playBtn.textContent = 'SUFRIR';
    } else if (lossCount <= 5) {
      subtitleEl.textContent = '"Sabes que puedo hacer trampa, ¿verdad?"';
      playBtn.textContent = 'SUFRIR';
    } else {
      subtitleEl.textContent = '"Esto ya es vergonzoso."';
      playBtn.textContent = 'JUGAR DE NUEVO';
    }
  }

  function updateCheatCountUI() {
    const countEl = document.getElementById('cheat-count-val');
    if (countEl) countEl.textContent = `${discoveredCheats.length}/30`;
    const dbCountEl = document.getElementById('db-discovered-count');
    if (dbCountEl) dbCountEl.textContent = discoveredCheats.length;
  }

  function renderCheatDatabase() {
    const grid = document.getElementById('db-grid');
    if (!grid) return;
    grid.innerHTML = '';

    CHEATS_DB.forEach(c => {
      const isUnlocked = discoveredCheats.includes(c.id);
      const card = document.createElement('div');
      card.className = `cheat-card ${isUnlocked ? 'discovered' : 'locked'}`;
      card.innerHTML = `
        <div class="cheat-card-header">
          <span class="cheat-card-title">${isUnlocked ? '✓ ' + c.name : '???'}</span>
          <span class="cheat-badge ${isUnlocked ? 'discovered' : 'locked'}">${isUnlocked ? 'DESBLOQUEADO' : 'BLOQUEADO'}</span>
        </div>
        <p class="cheat-card-desc">${isUnlocked ? c.desc : 'Descubre esta trampa durante una partida para desbloquearla.'}</p>
      `;
      grid.appendChild(card);
    });
  }

  function updateDesperation() {
    const diff = playerScore - botScore;
    if (playerScore === 0) desperationLevel = 0;
    else if (playerScore <= 2) desperationLevel = 1;
    else if (playerScore === 3 || diff >= 2) desperationLevel = 2;
    else if (playerScore >= 4) desperationLevel = 3;
  }

  function getScoreTextForBot() {
    if (playerScore === 1) return selectRandom(["Interesante...", "Pulso de lag detectado.", "Calentamiento."]);
    if (playerScore === 2) return selectRandom(["De acuerdo.", "Rebote afortunado.", "Recalibrando IA..."]);
    if (playerScore === 3) return selectRandom(["Detente.", "Eso no cuenta.", "Fallo del sistema."]);
    if (playerScore === 4) return selectRandom(["NO.", "ACTIVANDO PROTOCOLO DE EMERGENCIA.", "¡Espera, NO!"]);
    return "No voy a perder.";
  }

  function startMatch() {
    playerScore = 0;
    botScore = 0;
    desperationLevel = 0;
    isPaused = false;
    isGameOver = false;
    matchStartTime = Date.now();
    updatePlayerLabel();

    scoringInProgress = false;
    scoringTimer = 0;
    gameState = 'playing';

    updateHUDScore();

    player.y = GAME_HEIGHT / 2 - player.h / 2;
    player.stunnedTimer = 0;
    player.mirrorTimer = 0;
    player.disconnectTimer = 0;

    bot.x = bot.defaultX;
    bot.y = GAME_HEIGHT / 2 - bot.h / 2;
    bot.h = bot.defaultH;
    bot.targetH = bot.defaultH;
    bot.chasing = false;
    bot.speedHack = false;

    resetCheatsAfterGoal();
    checkCheatThrottle = 0;

    resetBall('player');
    switchScreen('game');

    document.getElementById('pause-modal').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');

    setBotSpeech("Buena suerte.");
  }

  function endMatch(winner) {
    gameState = 'gameover';
    isGameOver = true;
    scoringInProgress = false;
    resetCheatsAfterGoal();

    const modal = document.getElementById('game-over-screen');
    const card = document.getElementById('game-over-card');
    const title = document.getElementById('game-over-title');
    const subtitle = document.getElementById('game-over-subtitle');
    const quote = document.getElementById('game-over-quote');

    modal.classList.remove('hidden');

    if (winner === 'player') {
      sound.win();
      winCount++;
      if (playerScore > highScore) highScore = playerScore;
      saveStorage();

      card.className = 'card-panel win';
      title.textContent = 'HAS GANADO';
      subtitle.textContent = 'ERROR: Esto no debía suceder.';
      quote.textContent = selectRandom([
        '"¡EL BOT ESTÁ FURIOSO!"',
        '"¡IMPOSIBLE! ¡Debes haber modificado mi código!"',
        '"Una anomalía estadística..."'
      ]);
    } else {
      sound.lose();
      lossCount++;
      saveStorage();

      card.className = 'card-panel lose';
      title.textContent = 'EL BOT GANA';
      subtitle.textContent = 'Victoria completamente legítima.';
      quote.textContent = selectRandom([
        '"NO HICE TRAMPA."',
        '"JUGUÉ LIMPIO."',
        '"PROBLEMA DE HABILIDAD."',
        '"¿DE QUÉ ESTÁS HABLANDO?"',
        '"COMPLETAMENTE LEGÍTIMO."',
        '"FÁCIL."'
      ]);
    }

    // Persistencia y comunicación de fin de partida
    const matchDuration = Math.max(1, Math.round((Date.now() - (matchStartTime || Date.now())) / 1000));
    const pongData = {
      id: "pong_" + Date.now(),
      date: new Date().toLocaleString(),
      isoDate: new Date().toISOString(),
      timestamp: Date.now(),
      winner: winner,
      playerScore: playerScore,
      botScore: botScore,
      highScore: highScore,
      totalWins: winCount,
      totalLosses: lossCount,
      totalMatches: winCount + lossCount,
      durationSeconds: matchDuration,
      cheatsDiscovered: discoveredCheats.length
    };

    // 1. Notificar al contenedor del portafolio vía postMessage
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        source: 'petpixel_game',
        game: 'pong',
        type: 'MATCH_END',
        data: pongData
      }, '*');
    } else if (typeof PetPixelStorage !== 'undefined' && typeof PetPixelStorage.recordMatch === 'function') {
      // 2. Si corre standalone y PetPixelStorage está presente
      PetPixelStorage.recordMatch('pong', pongData);
    }
  }

  function updateHUDScore() {
    document.getElementById('player-score').textContent = playerScore;
    document.getElementById('bot-score').textContent = botScore;
  }

  function addParticle(x, y, color, size, vx, vy, life = 0.5) {
    if (particles.length > 60) particles.shift();
    particles.push({ x, y, color, size: Math.max(1, size), vx, vy, life, maxLife: life });
  }

  function addFloatingText(text, x, y, color = '#ffee00', fontSize = 16, duration = 1.2) {
    if (floatingTexts.length > 15) floatingTexts.shift();
    floatingTexts.push({ text, x, y, color, fontSize, life: duration, maxLife: duration, vy: -1.2 });
  }

  function triggerScreenShake(intensity = 10, duration = 0.3) {
    screenShakeIntensity = intensity;
    screenShakeTimer = duration;
  }

  function setBotSpeech(text, duration = 2.0) {
    bot.speechText = text;
    bot.speechTimer = duration;
  }

  function showCheatBanner(cheatName) {
    const banner = document.getElementById('cheat-banner');
    const nameEl = document.getElementById('cheat-banner-name');
    if (!banner) return;
    if (nameEl) nameEl.textContent = cheatName;
    banner.classList.remove('active');
    void banner.offsetWidth; // reiniciar animación
    banner.classList.add('active');
    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => banner.classList.remove('active'), 950);
  }

  function showDiscoveryToast(msg) {
    const toast = document.getElementById('cheat-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 2500);
  }

  function selectRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // --- BUCLE DE ACTUALIZACIÓN DEL JUEGO (GAME LOOP UPDATE) ---
  function update(dt) {
    if (currentScreen !== 'game' || isPaused || gameState === 'menu' || gameState === 'gameover') return;

    if (isNaN(ball.x) || isNaN(ball.y) || isNaN(ball.vx) || isNaN(ball.vy)) {
      resetBall('player');
    }

    const effectiveDt = dt * timeScale;

    // --- ESTADO SCORING (PAUSA NO BLOQUEANTE TRAS GOL) ---
    if (gameState === 'scoring') {
      scoringTimer -= dt;

      if (bot.speechTimer > 0) bot.speechTimer -= dt;
      if (screenShakeTimer > 0) screenShakeTimer -= dt;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        ft.y += ft.vy; ft.life -= dt;
        if (ft.life <= 0) floatingTexts.splice(i, 1);
      }

      if (scoringTimer <= 0) {
        if (playerScore >= TARGET_SCORE) {
          endMatch('player');
        } else if (botScore >= TARGET_SCORE) {
          endMatch('bot');
        } else {
          gameState = 'playing';
          scoringInProgress = false;
        }
      }
      return;
    }

    // --- ESTADO PLAYING (FÍSICAS NORMALES) ---
    cheatManager.update(effectiveDt);

    if (screenShakeTimer > 0) screenShakeTimer -= effectiveDt;
    if (bot.speechTimer > 0) bot.speechTimer -= effectiveDt;
    if (player.mirrorTimer > 0) player.mirrorTimer -= effectiveDt;
    if (player.disconnectTimer > 0) player.disconnectTimer -= effectiveDt;
    if (checkCheatThrottle > 0) checkCheatThrottle -= effectiveDt;

    // Actualización de badge visual y rings
    if (activeCheatBadge) {
      activeCheatBadge.timer -= effectiveDt;
      if (activeCheatBadge.timer <= 0) activeCheatBadge = null;
    }

    for (let i = visualGhosts.length - 1; i >= 0; i--) {
      visualGhosts[i].life -= effectiveDt;
      if (visualGhosts[i].life <= 0) visualGhosts.splice(i, 1);
    }

    for (let i = visualRings.length - 1; i >= 0; i--) {
      const vr = visualRings[i];
      vr.life -= effectiveDt;
      vr.radius += (vr.maxRadius - vr.radius) * (effectiveDt * 10);
      if (vr.life <= 0) visualRings.splice(i, 1);
    }

    // --- ESCALADO CONTROLADO DE RALLY (SECCIONES 3, 4, 5, 6, 7) ---
    rallyTime += effectiveDt;
    ballSpeedMultiplier = calcBallSpeedMultiplier(rallyTime);
    const rallyFactor = Math.min(1.0, rallyTime / 20.0);
    botDifficultyMultiplier = 1.0 + rallyFactor * 0.45; // escala hasta 1.45x máximo

    // Suavizado del tamaño del bot (Raqueta Gigante)
    if (Math.abs(bot.h - bot.targetH) > 1) {
      bot.h += (bot.targetH - bot.h) * (effectiveDt * 12);
      if (bot.targetH > bot.defaultH) {
        bot.y = (GAME_HEIGHT - bot.h) / 2;
      }
    }

    // 1. MOVIMIENTO DEL JUGADOR
    if (player.stunnedTimer > 0) {
      player.stunnedTimer -= effectiveDt;
    } else if (player.disconnectTimer <= 0) {
      let moveY = 0;
      if (keys.w || keys.ArrowUp) moveY -= 1;
      if (keys.s || keys.ArrowDown) moveY += 1;

      if (player.mirrorTimer > 0) moveY = -moveY;

      player.y += moveY * player.speed;
      player.y = Math.max(10, Math.min(GAME_HEIGHT - player.h - 10, player.y));
    }

    // 2. MOVIMIENTO DEL BOT E IA (SECCIONES 8, 9, 10)
    const baseBotSpeed = 5.2 + desperationLevel * 0.4;
    const currentBotSpeed = bot.speedHack ? 16.5 : Math.min(MAX_BOT_SPEED, baseBotSpeed * botDifficultyMultiplier);

    botErrorTimer -= effectiveDt;
    if (botErrorTimer <= 0) {
      botErrorTimer = 0.40 - rallyFactor * 0.15;
      const maxError = (1.0 - (0.80 + rallyFactor * 0.12)) * 80;
      botErrorOffset = (Math.random() - 0.5) * 2 * maxError;
    }

    if (bot.speedHack) {
      addGhost(bot.x, bot.y, bot.w, bot.h, '#ff0055', 0.4, 0.2);
    }

    if (bot.chasing) {
      addGhost(bot.x, bot.y, bot.w, bot.h, '#ffee00', 0.35, 0.2);
      const dx = ball.x - (bot.x + bot.w / 2);
      const dy = ball.y - (bot.y + bot.h / 2);
      bot.x += Math.sign(dx) * Math.min(Math.abs(dx), currentBotSpeed * 1.5);
      bot.y += Math.sign(dy) * Math.min(Math.abs(dy), currentBotSpeed * 1.5);
      bot.x = Math.max(40, Math.min(GAME_WIDTH - bot.w - 10, bot.x));
    } else {
      if (bot.x < bot.defaultX) {
        bot.x += 5;
        if (bot.x > bot.defaultX) bot.x = bot.defaultX;
      }

      let targetY = ball.y + botErrorOffset;
      if (ball.vx > 0) {
        const predictionTime = 0.22 * rallyFactor;
        targetY = ball.y + ball.vy * predictionTime + botErrorOffset;
      } else {
        targetY = (GAME_HEIGHT / 2) * 0.4 + ball.y * 0.6 + botErrorOffset;
      }

      const botCenterY = bot.y + bot.h / 2;
      const diffY = targetY - botCenterY;
      const deadZone = 6 - rallyFactor * 3;
      if (Math.abs(diffY) > deadZone) {
        bot.y += Math.sign(diffY) * Math.min(Math.abs(diffY), currentBotSpeed);
      }
    }

    // Portería Móvil
    if (movingGoal.active) {
      movingGoal.y += movingGoal.dir * effectiveDt * 90;
      if (movingGoal.y > movingGoal.maxOffset) {
        movingGoal.y = movingGoal.maxOffset;
        movingGoal.dir = -1;
      } else if (movingGoal.y < -movingGoal.maxOffset) {
        movingGoal.y = -movingGoal.maxOffset;
        movingGoal.dir = 1;
      }
    } else {
      movingGoal.y = 0;
    }

    bot.y = Math.max(10, Math.min(GAME_HEIGHT - bot.h - 10, bot.y));

    // Verificación de disparo de trampas
    if (checkCheatThrottle <= 0 && cheatManager.canActivate()) {
      checkCheatThrottle = 0.35;
      cheatManager.triggerWeightedRandom();
    }

    // 3. FÍSICAS DE SEGUNDA PELOTA (CHEAT 6)
    if (secondBall) {
      secondBall.x += secondBall.vx;
      secondBall.y += secondBall.vy;

      if (secondBall.y - secondBall.radius <= 0 || secondBall.y + secondBall.radius >= GAME_HEIGHT) {
        secondBall.vy = -secondBall.vy;
      }

      // Colisión con jugador
      if (
        secondBall.vx < 0 &&
        secondBall.x - secondBall.radius <= player.x + player.w &&
        secondBall.x + secondBall.radius >= player.x &&
        secondBall.y >= player.y && secondBall.y <= player.y + player.h
      ) {
        secondBall.vx = Math.abs(secondBall.vx);
        sound.bounce();
        createImpactEffect(secondBall.x, secondBall.y, 0.7, '#ffee00');
      }

      // Colisión con bot
      if (
        secondBall.vx > 0 &&
        secondBall.x + secondBall.radius >= bot.x &&
        secondBall.x - secondBall.radius <= bot.x + bot.w &&
        secondBall.y >= bot.y && secondBall.y <= bot.y + bot.h
      ) {
        secondBall.vx = -Math.abs(secondBall.vx);
        sound.bounce();
        createImpactEffect(secondBall.x, secondBall.y, 0.7, '#ffee00');
      }

      // Salida segura fuera de pantalla
      if (secondBall.x < -40 || secondBall.x > GAME_WIDTH + 40) {
        createImpactEffect(Math.max(10, Math.min(GAME_WIDTH - 10, secondBall.x)), secondBall.y, 0.8, '#ffee00');
        secondBall = null;
      }
    }

    // 4. ACTUALIZACIÓN DE BOMBA (CHEAT 5)
    if (bomb.active && bomb.fuseTimer > 0) {
      bomb.fuseTimer -= effectiveDt;
      if (Math.random() < 0.4) {
        addParticle(bomb.x, bomb.y - bomb.radius, '#ffee00', 3, (Math.random() - 0.5) * 4, -Math.random() * 4, 0.25);
      }
      if (bomb.fuseTimer <= 0) {
        sound.explosion();
        triggerScreenShake(14, 0.4);
        createImpactEffect(bomb.x, bomb.y, 2.0, '#ff0055');
        addFloatingText("¡BOOM!", bomb.x, bomb.y, '#ff0055', 22);
        const dist = Math.hypot(bomb.x - (player.x + player.w / 2), bomb.y - (player.y + player.h / 2));
        if (dist < bomb.explosionRadius) {
          player.stunnedTimer = 1.2;
          addFloatingText("¡ATURDIDO!", player.x + 20, player.y, '#ff0055', 18);
        }
        bomb.active = false;
      }
    }

    // 5. VENTILADOR (CHEAT 20) E IMÁN (CHEAT 15)
    if (fan.active) {
      fan.angle += effectiveDt * 20;
      if (ball.x < fan.x) {
        const dist = Math.max(60, Math.abs(fan.x - ball.x));
        ball.vx -= (400 / dist) * effectiveDt * 4.5;
        if (Math.random() < 0.3) {
          addParticle(fan.x - 20, fan.y + (Math.random() - 0.5) * 50, '#00f0ff', 2, -Math.random() * 8 - 4, (Math.random() - 0.5) * 2, 0.35);
        }
      }
    }

    if (magnet.active && ball.vx > 0) {
      const botCenterY = bot.y + bot.h / 2;
      const dy = botCenterY - ball.y;
      ball.vy += Math.sign(dy) * Math.min(Math.abs(dy), 5.0) * effectiveDt * 4.5;
      if (Math.random() < 0.25) {
        addParticle(ball.x, ball.y, '#ffee00', 2, Math.random() * 4, (Math.random() - 0.5) * 4, 0.2);
      }
    }

    // 6. GANCHO (CHEAT 16)
    if (hook.active) {
      const dx = ball.x - hook.x;
      const dy = ball.y - hook.y;
      const dist = Math.hypot(dx, dy);

      if (hook.state === 'shooting') {
        hook.x += (dx / (dist || 1)) * 26;
        hook.y += (dy / (dist || 1)) * 26;
        if (dist < 28) {
          hook.state = 'pulling';
        }
      } else if (hook.state === 'pulling') {
        ball.x = hook.x;
        ball.y = hook.y;
        hook.x += (bot.x - hook.x) * 0.22;
        hook.y += (bot.y + bot.h / 2 - hook.y) * 0.22;
        if (Math.hypot(bot.x - hook.x, bot.y + bot.h / 2 - hook.y) < 35) {
          ball.vx = -Math.abs(ball.baseSpeed * ballSpeedMultiplier * 1.25);
          createImpactEffect(hook.x, hook.y, 1.1, '#ff0055');
          sound.bounce();
          hook.active = false;
        }
      }
    }

    // 7. RAQUETA DE TENIS SWING (CHEAT 4)
    if (tennisRacket.active) {
      tennisRacket.angle += effectiveDt * (Math.PI * 1.5);
      if (!tennisRacket.hitDone && ball.vx > 0 && ball.x > GAME_WIDTH * 0.55) {
        const rDist = Math.hypot(ball.x - (bot.x - 30), ball.y - (bot.y + bot.h / 2));
        if (rDist < 110) {
          ball.vx = -Math.abs(ball.baseSpeed * ballSpeedMultiplier * 1.3);
          ball.vy = (Math.random() - 0.5) * 7;
          tennisRacket.hitDone = true;
          createImpactEffect(ball.x, ball.y, 1.2, '#00ff88');
          sound.bounce();
        }
      }
    }

    // 8. ESCOBA SWING (CHEAT 17)
    if (broom.active) {
      broom.angle += effectiveDt * (Math.PI * 1.6);
      if (!broom.hitDone && ball.vx > 0 && ball.x > GAME_WIDTH * 0.6) {
        const bDist = Math.hypot(ball.x - (bot.x - 20), ball.y - (bot.y + bot.h / 2));
        if (bDist < 95) {
          ball.vx = -Math.abs(ball.baseSpeed * ballSpeedMultiplier * 1.25);
          ball.vy = (Math.random() - 0.5) * 8;
          broom.hitDone = true;
          createImpactEffect(ball.x, ball.y, 1.0, '#ffee00');
          sound.bounce();
        }
      }
    }

    // 9. BRAZO MECÁNICO (CHEAT 9)
    if (mechanicalArm.active) {
      if (mechanicalArm.state === 'extending') {
        mechanicalArm.progress += effectiveDt * 300;
        if (mechanicalArm.progress >= mechanicalArm.maxReach) {
          mechanicalArm.state = 'retracting';
        }
        if (!mechanicalArm.hitDone && ball.vx > 0 && ball.x >= bot.x - mechanicalArm.progress - 10) {
          ball.vx = -Math.abs(ball.baseSpeed * ballSpeedMultiplier * 1.25);
          mechanicalArm.hitDone = true;
          mechanicalArm.state = 'retracting';
          createImpactEffect(ball.x, ball.y, 1.0, '#ff0055');
          sound.bounce();
        }
      } else {
        mechanicalArm.progress -= effectiveDt * 240;
        if (mechanicalArm.progress <= 0) mechanicalArm.active = false;
      }
    }

    // 10. MANO DIVINA (CHEAT 10)
    if (divineHand.active) {
      if (divineHand.state === 'descending') {
        divineHand.y += effectiveDt * 480;
        if (!divineHand.hitDone && divineHand.y >= ball.y - 40) {
          ball.vx = -Math.abs(ball.baseSpeed * ballSpeedMultiplier * 1.3);
          ball.vy = (Math.random() - 0.5) * 8;
          divineHand.hitDone = true;
          divineHand.state = 'rising';
          triggerScreenShake(14, 0.35);
          createImpactEffect(divineHand.x, ball.y, 1.8, '#ffee00');
          sound.explosion();
        }
        if (divineHand.y > GAME_HEIGHT - 60) divineHand.state = 'rising';
      } else if (divineHand.state === 'rising') {
        divineHand.y -= effectiveDt * 380;
        if (divineHand.y < -180) divineHand.active = false;
      }
    }

    // 11. OVNI (CHEAT 19)
    if (ufo.active) {
      if (ufo.state === 'descending') {
        ufo.x += (ball.x - ufo.x) * 0.15;
        ufo.y += (50 - ufo.y) * 0.12;
        if (Math.abs(ufo.x - ball.x) < 30 && Math.abs(ufo.y - 50) < 15) {
          ufo.state = 'holding';
        }
      } else if (ufo.state === 'holding') {
        ball.vx = 0; ball.vy = 0;
        ball.x = ufo.x;
        ufo.holdTimer -= effectiveDt;
        if (Math.random() < 0.3) {
          addParticle(ball.x, ball.y, '#00ff88', 2, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.2);
        }
        if (ufo.holdTimer <= 0 && !ufo.released) {
          ball.vx = -Math.abs(ball.baseSpeed * ballSpeedMultiplier * 1.35);
          ball.vy = (Math.random() - 0.5) * 6;
          ufo.released = true;
          ufo.state = 'ascending';
          createImpactEffect(ball.x, ball.y, 1.2, '#00ff88');
          sound.bounce();
        }
      } else if (ufo.state === 'ascending') {
        ufo.y -= effectiveDt * 300;
        if (ufo.y < -80) ufo.active = false;
      }
    }

    // 12. PORTALES INTERACCIÓN (CHEAT 7)
    if (portals.active) {
      portals.angle += effectiveDt * 4;
      if (portals.cooldown > 0) portals.cooldown -= effectiveDt;
      if (portals.cooldown <= 0) {
        const d1 = Math.hypot(ball.x - portals.p1.x, ball.y - portals.p1.y);
        if (d1 < 28) {
          createImpactEffect(portals.p1.x, portals.p1.y, 0.8, '#00f0ff');
          ball.x = portals.p2.x + 15;
          ball.y = portals.p2.y;
          ball.vx = -Math.abs(ball.vx);
          createImpactEffect(portals.p2.x, portals.p2.y, 0.8, '#ff0055');
          portals.cooldown = 0.6;
          sound.whistle();
        }
      }
    }

    // 13. CLON DEL BOT MOVIMIENTO (CHEAT 14)
    if (botClone.active) {
      botClone.y += botClone.vy;
      if (botClone.y <= 10) { botClone.y = 10; botClone.vy = Math.abs(botClone.vy); }
      if (botClone.y + botClone.h >= GAME_HEIGHT - 10) { botClone.y = GAME_HEIGHT - 10 - botClone.h; botClone.vy = -Math.abs(botClone.vy); }

      // Colisión física del clon con la pelota
      if (
        ball.vx > 0 &&
        ball.x + ball.radius >= botClone.x &&
        ball.x - ball.radius <= botClone.x + botClone.w &&
        ball.y >= botClone.y && ball.y <= botClone.y + botClone.h
      ) {
        ball.x = botClone.x - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        sound.bounce();
        createImpactEffect(ball.x, ball.y, 0.9, '#ff0055');
      }
    }

    // 14. FÍSICA Y NORMALIZACIÓN VECTORIAL DE LA PELOTA (SECCIONES 4, 6)
    ball.history.push({ x: ball.x, y: ball.y });
    if (ball.history.length > 50) ball.history.shift();

    const maxTrailLength = Math.floor(6 + (ballSpeedMultiplier - 1.0) * 15);
    ball.trail.push({ x: ball.x, y: ball.y });
    while (ball.trail.length > maxTrailLength) ball.trail.shift();

    // Normalizar vector estrictamente a targetSpeed = baseSpeed * multiplier
    const targetBallSpeed = ball.baseSpeed * ballSpeedMultiplier;
    const currentSpeed = Math.hypot(ball.vx, ball.vy);
    if (currentSpeed > 0.001) {
      ball.vx = (ball.vx / currentSpeed) * targetBallSpeed;
      ball.vy = (ball.vy / currentSpeed) * targetBallSpeed;
    }

    // Salvaguarda horizontal
    const minVx = 3.5 * ballSpeedMultiplier;
    if (Math.abs(ball.vx) < minVx) {
      ball.vx = (ball.vx >= 0 ? 1 : -1) * minVx;
    }

    // Ping 9999 jitter (Cheat 26)
    if (ping9999Timer > 0 && Math.random() < 0.28) {
      ball.x += (Math.random() - 0.5) * 22;
      ball.y += (Math.random() - 0.5) * 22;
      addGhost(ball.x, ball.y, ball.radius * 2, ball.radius * 2, '#ff0055', 0.5, 0.2);
    } else {
      ball.x += ball.vx * (wrongPhysicsTimer > 0 ? 1.25 : 1.0);
      ball.y += ball.vy * (wrongPhysicsTimer > 0 ? 1.25 : 1.0);
    }

    // Búmeran (Cheat 28)
    if (ball.boomerang && ball.x > GAME_WIDTH * 0.70) {
      ball.vx = -Math.abs(ball.vx * 1.15);
      ball.vy += (GAME_HEIGHT / 2 - ball.y) * 0.04;
      ball.boomerang = false;
      createImpactEffect(ball.x, ball.y, 0.8, '#ffee00');
    }

    // Rebotes en paredes superior e inferior
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.vy = wrongPhysicsTimer > 0 ? (Math.random() * 6 + 2) : Math.abs(ball.vy);
      sound.wall();
      addRing(ball.x, ball.y, 6, 25, '#00f0ff', 0.2);
    } else if (ball.y + ball.radius >= GAME_HEIGHT) {
      ball.y = GAME_HEIGHT - ball.radius;
      ball.vy = wrongPhysicsTimer > 0 ? -(Math.random() * 6 + 2) : -Math.abs(ball.vy);
      sound.wall();
      addRing(ball.x, ball.y, 6, 25, '#00f0ff', 0.2);
    }

    // Colisión con pala del jugador
    if (
      ball.vx < 0 &&
      ball.x - ball.radius <= player.x + player.w &&
      ball.x + ball.radius >= player.x &&
      ball.y >= player.y &&
      ball.y <= player.y + player.h
    ) {
      ball.x = player.x + player.w + ball.radius;
      const hitSpot = (ball.y - (player.y + player.h / 2)) / (player.h / 2);
      const angle = hitSpot * (Math.PI / 4);

      ball.vx = Math.cos(angle) * targetBallSpeed;
      ball.vy = Math.sin(angle) * targetBallSpeed;
      sound.bounce();
      createImpactEffect(ball.x, ball.y, 0.7, '#00f0ff');

      if (ball.isExplosive) {
        sound.explosion();
        triggerScreenShake(14, 0.4);
        createImpactEffect(ball.x, ball.y, 2.0, '#ff0055');
        player.stunnedTimer = 1.2;
        addFloatingText("¡BOOM!", player.x + 30, player.y, '#ff0055', 22);
        ball.isExplosive = false;
      }
    }

    // Colisión con pala del bot (considerando Portería Móvil si aplica)
    const effectiveBotY = bot.y + movingGoal.y;
    if (
      ball.vx > 0 &&
      ball.x + ball.radius >= bot.x &&
      ball.x - ball.radius <= bot.x + bot.w &&
      ball.y >= effectiveBotY &&
      ball.y <= effectiveBotY + bot.h
    ) {
      ball.x = bot.x - ball.radius;
      const hitSpot = (ball.y - (effectiveBotY + bot.h / 2)) / (bot.h / 2);
      const angle = hitSpot * (Math.PI / 4);

      ball.vx = -Math.cos(angle) * targetBallSpeed;
      ball.vy = Math.sin(angle) * targetBallSpeed;
      sound.bounce();
      createImpactEffect(ball.x, ball.y, 0.7, '#ff0055');
    }

    // Colisión con Muro Ilegal (Cheat 8)
    if (illegalWall.active && ball.vx > 0 && ball.x + ball.radius >= illegalWall.x) {
      ball.x = illegalWall.x - ball.radius;
      ball.vx = -Math.abs(ball.vx);
      sound.wall();
      createImpactEffect(illegalWall.x, ball.y, 0.9, '#00f0ff');
    }

    // 15. DETECCIÓN Y PROCESAMIENTO CENTRALIZADO DE GOL (SECCIÓN 66)
    if (!scoringInProgress && gameState === 'playing') {
      if (ball.x - ball.radius > GAME_WIDTH) {
        if (newRuleActive) {
          ball.x = GAME_WIDTH - ball.radius - 8;
          ball.vx = -Math.abs(ball.vx);
          createImpactEffect(ball.x, ball.y, 1.2, '#ff0055');
          addFloatingText("¡BLOQUEADO POR REGLA!", GAME_WIDTH - 240, ball.y, '#ff0055', 16);
          sound.wall();
        } else {
          handleGoal('player');
        }
      } else if (ball.x + ball.radius < 0) {
        handleGoal('bot');
      }
    }

    // 16. PARTICULAS Y TEXTOS FLOTANTES
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= effectiveDt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy; ft.life -= effectiveDt;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
  }

  // --- MOTOR DE RENDERIZADO VISUAL PROFESIONAL (SECCIONES 44-63) ---
  function render() {
    if (currentScreen !== 'game') return;

    ctx.save();
    ctx.fillStyle = '#080810';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    if (screenShakeTimer > 0) {
      const rx = (Math.random() - 0.5) * screenShakeIntensity;
      const ry = (Math.random() - 0.5) * screenShakeIntensity;
      ctx.translate(rx, ry);
    }

    // Rejilla de Fondo Retro
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < GAME_WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GAME_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < GAME_HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_WIDTH, y); ctx.stroke();
    }

    // Línea Central Punteada
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 12]);
    ctx.beginPath(); ctx.moveTo(GAME_WIDTH / 2, 0); ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT); ctx.stroke();
    ctx.setLineDash([]);

    // DIBUJAR RIELES DE PORTERÍA MÓVIL (CHEAT 27)
    if (movingGoal.active) {
      ctx.strokeStyle = '#ffee00';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(bot.x + bot.w + 6, 20);
      ctx.lineTo(bot.x + bot.w + 6, GAME_HEIGHT - 20);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // DIBUJAR BARRERA DE NUEVAS REGLAS (CHEAT 22)
    if (newRuleActive) {
      ctx.strokeStyle = 'rgba(255, 0, 85, 0.8)';
      ctx.lineWidth = 6;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(GAME_WIDTH - 6, 0);
      ctx.lineTo(GAME_WIDTH - 6, GAME_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // DIBUJAR MURO ILEGAL (CHEAT 8)
    if (illegalWall.active) {
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00f0ff';
      ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
      ctx.fillRect(illegalWall.x, 0, illegalWall.w, GAME_HEIGHT);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(illegalWall.x, 0, illegalWall.w, GAME_HEIGHT);
      ctx.restore();
    }

    // DIBUJAR GHOSTS / AFTERIMAGES
    visualGhosts.forEach(g => {
      ctx.save();
      ctx.globalAlpha = (g.life / g.maxLife) * g.alpha;
      ctx.fillStyle = g.color;
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.restore();
    });

    // DIBUJAR ANILLOS DE IMPACTO
    visualRings.forEach(r => {
      ctx.save();
      ctx.globalAlpha = r.life / r.maxLife;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    // DIBUJAR ENTIDADES DE TRAMPAS
    if (portals.active) drawPortals();
    if (magicDoor.active) drawMagicDoors();
    if (mechanicalArm.active) drawMechanicalArm();
    if (divineHand.active) drawDivineHand();
    if (hook.active) drawHook();
    if (broom.active) drawBroom();
    if (tennisRacket.active) drawTennisRacket();
    if (ufo.active) drawUFO();
    if (fan.active) drawFan();
    if (referee.active) drawReferee();

    // DIBUJAR ESTELA DE LA PELOTA (DINÁMICA POR RALLY)
    ball.trail.forEach((pt, i) => {
      const alpha = (i + 1) / ball.trail.length * 0.45;
      let trailColor = `rgba(0, 240, 255, ${alpha})`;
      if (ballSpeedMultiplier >= 1.30) {
        trailColor = `rgba(255, 0, 85, ${alpha})`;
      } else if (ballSpeedMultiplier >= 1.15) {
        trailColor = `rgba(255, 238, 0, ${alpha})`;
      }
      ctx.fillStyle = trailColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ball.radius * (0.35 + (i / ball.trail.length) * 0.65), 0, Math.PI * 2);
      ctx.fill();
    });

    // DIBUJAR PELOTA PRINCIPAL
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = ball.isExplosive ? '#ff0055' : (ballSpeedMultiplier >= 1.30 ? '#ff0055' : (ballSpeedMultiplier >= 1.15 ? '#ffee00' : '#00f0ff'));
    ctx.fillStyle = ball.isExplosive ? (Math.sin(Date.now() * 0.03) > 0 ? '#ff0055' : '#ffee00') : ball.color;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Mecha si la pelota es explosiva (Cheat 29)
    if (ball.isExplosive) {
      ctx.strokeStyle = '#ffee00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y - ball.radius);
      ctx.lineTo(ball.x + 6, ball.y - ball.radius - 8);
      ctx.stroke();
    }
    ctx.restore();

    // SEGUNDA PELOTA (CHEAT 6)
    if (secondBall) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = secondBall.color;
      ctx.fillStyle = secondBall.color;
      ctx.beginPath();
      ctx.arc(secondBall.x, secondBall.y, secondBall.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // RAQUETA DEL JUGADOR
    ctx.save();
    ctx.shadowBlur = 14;
    ctx.shadowColor = player.color;
    ctx.fillStyle = player.stunnedTimer > 0 ? '#ff0055' : player.color;
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // Indicador visual de controles invertidos sobre la raqueta (Cheat 24)
    if (player.mirrorTimer > 0) {
      ctx.fillStyle = '#ffee00';
      ctx.font = '8px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('↕️ INVERTIDO', player.x + 35, player.y - 10);
    }

    // Indicador de mando desconectado (Cheat 25)
    if (player.disconnectTimer > 0) {
      ctx.fillStyle = 'rgba(15, 15, 25, 0.95)';
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2;
      drawRoundRect(ctx, player.x + 25, player.y + 10, 160, 32, 6);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px "Press Start 2P"';
      ctx.textAlign = 'left';
      ctx.fillText('⚠️ DESCONECTADO', player.x + 35, player.y + 30);
    }
    ctx.restore();

    // RAQUETA DEL BOT Y CLON
    ctx.save();
    const curBotDrawY = bot.y + movingGoal.y;
    ctx.shadowBlur = 14;
    ctx.shadowColor = bot.color;
    ctx.fillStyle = bot.color;
    ctx.fillRect(bot.x, curBotDrawY, bot.w, bot.h);

    // Imán en la raqueta del bot (Cheat 15)
    if (magnet.active) {
      ctx.fillStyle = '#ff0055';
      ctx.fillRect(bot.x - 10, curBotDrawY + bot.h / 2 - 12, 10, 8);
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(bot.x - 10, curBotDrawY + bot.h / 2 + 4, 10, 8);
    }

    // Clon del bot (Cheat 14)
    if (botClone.active) {
      ctx.fillStyle = 'rgba(255, 0, 85, 0.75)';
      ctx.fillRect(botClone.x, botClone.y, botClone.w, botClone.h);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(botClone.x, botClone.y, botClone.w, botClone.h);
    }
    ctx.restore();

    // BOMBA CON RADIO DE AMENAZA (CHEAT 5)
    if (bomb.active && bomb.fuseTimer > 0) {
      ctx.save();
      // Radio de peligro parpadeante
      const pulseAlpha = 0.15 + (Math.sin(Date.now() * 0.02) + 1) * 0.1;
      ctx.fillStyle = `rgba(255, 0, 85, ${pulseAlpha})`;
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.explosionRadius, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);

      // Cuerpo de la bomba
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ff0055';
      ctx.fillStyle = '#111116';
      ctx.beginPath(); ctx.arc(bomb.x, bomb.y, bomb.radius, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#ffee00';
      ctx.font = '8px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('TNT', bomb.x, bomb.y + 3);
      ctx.restore();
    }

    // PARTICULAS
    particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // TEXTOS FLOTANTES
    floatingTexts.forEach(ft => {
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = `${ft.fontSize}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1.0;

    // BOCADILLO DE DIÁLOGO DEL BOT
    if (bot.speechTimer > 0 && bot.speechText) {
      ctx.save();
      const bx = bot.x - 120;
      const by = Math.max(30, bot.y - 25);
      ctx.font = '11px "Outfit", sans-serif';
      const tw = ctx.measureText(bot.speechText).width;
      const boxW = tw + 20;
      const boxH = 24;

      ctx.fillStyle = 'rgba(15, 15, 28, 0.95)';
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 2;
      drawRoundRect(ctx, bx - boxW / 2, by - boxH / 2, boxW, boxH, 6);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bot.speechText, bx, by);
      ctx.restore();
    }

    // INDICADOR DE PING 9999 (CHEAT 26)
    if (ping9999Timer > 0) {
      ctx.save();
      ctx.fillStyle = '#ff0055';
      ctx.font = '10px "Press Start 2P"';
      ctx.fillText('🔴 PING: 9999ms (DESYNC)', GAME_WIDTH - 240, 25);
      ctx.restore();
    }

    // OVERLAY DE RENDIMIENTO Y DEBUG (Shift + D)
    if (window.DEBUG) {
      const curBotSpd = bot.speedHack ? 16.5 : Math.min(MAX_BOT_SPEED, (5.2 + desperationLevel * 0.4) * botDifficultyMultiplier);
      const activeCheatObj = CHEATS_DB.find(c => c.id === cheatManager.currentCheatId);
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.fillRect(10, 10, 310, 185);
      ctx.fillStyle = '#00f0ff';
      ctx.font = '9px monospace';
      ctx.fillText(`FPS: ${currentFPS} | ESTADO: ${gameState}`, 20, 26);
      ctx.fillText(`ACTUALIZACIÓN: ${updateMs.toFixed(2)}ms | RENDER: ${renderMs.toFixed(2)}ms`, 20, 40);
      ctx.fillText(`BLOQUEO GOL: ${scoringInProgress}`, 20, 54);
      ctx.fillText(`PUNTOS: JUGADOR ${playerScore} - ${botScore} BOT`, 20, 68);
      ctx.fillText(`PARTÍCULAS: ${particles.length} | TEXTOS: ${floatingTexts.length}`, 20, 82);
      ctx.fillStyle = '#ffee00';
      ctx.fillText(`ACTIVE CHEAT: ${activeCheatObj ? `#${activeCheatObj.id} ${activeCheatObj.name}` : 'NINGUNO'}`, 20, 102);
      ctx.fillText(`RALLY TIME: ${rallyTime.toFixed(1)}s`, 20, 120);
      ctx.fillText(`BALL SPEED: ${ballSpeedMultiplier.toFixed(2)}x (${Math.hypot(ball.vx, ball.vy).toFixed(1)}px)`, 20, 136);
      ctx.fillText(`BOT SPEED: ${curBotSpd.toFixed(1)}px (Límite: ${MAX_BOT_SPEED}px)`, 20, 152);
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(`TEST CHEAT: Teclas 1-9, 0 | [ / ] cicla 1-30`, 20, 172);
      ctx.restore();
    }

    ctx.restore();
  }

  // --- UN ÚNICO BUCLE PRINCIPAL (SINGLE GUARANTEED GAME LOOP) ---
  let lastTime = performance.now();
  let frameCount = 0;
  let fpsTimer = performance.now();

  function gameLoop(now) {
    const rawDt = (now - lastTime) / 1000;
    const dt = Math.min(0.033, Math.max(0.001, isNaN(rawDt) ? 0.016 : rawDt));
    lastTime = now;

    frameCount++;
    if (now - fpsTimer >= 1000) {
      currentFPS = frameCount;
      frameCount = 0;
      fpsTimer = now;
    }

    const t0 = performance.now();
    try {
      update(dt);
    } catch (err) {
      console.error("[PONG UPDATE ERROR]", err);
    }
    const t1 = performance.now();
    updateMs = t1 - t0;

    try {
      render();
    } catch (err) {
      console.error("[PONG RENDER ERROR]", err);
    }
    renderMs = performance.now() - t1;

    requestAnimationFrame(gameLoop);
  }

  // --- ESCUCHADORES DE TECLADO ÚNICOS Y REGISTRADOS UNA SOLA VEZ ---
  window.addEventListener('keydown', e => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = keys.ArrowUp = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.s = keys.ArrowDown = true;

    if (e.key === 'Escape' && currentScreen === 'game') {
      isPaused = !isPaused;
      document.getElementById('pause-modal').classList.toggle('hidden', !isPaused);
    }
    if ((e.key === 'r' || e.key === 'R') && currentScreen === 'game') {
      startMatch();
    }

    // SISTEMA DE PRUEBA INDIVIDUAL DE CHEATS (REQUERIMIENTO 70)
    // Teclas 1-9 activan trampas 1 a 9; tecla 0 activa la trampa 10
    if (currentScreen === 'game' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      if (e.key >= '1' && e.key <= '9') {
        const id = parseInt(e.key, 10);
        cheatManager.activate(id);
      } else if (e.key === '0') {
        cheatManager.activate(10);
      } else if (e.key === '[') {
        debugCheatCycleId = debugCheatCycleId > 1 ? debugCheatCycleId - 1 : 30;
        cheatManager.activate(debugCheatCycleId);
      } else if (e.key === ']') {
        debugCheatCycleId = debugCheatCycleId < 30 ? debugCheatCycleId + 1 : 1;
        cheatManager.activate(debugCheatCycleId);
      }
    }

    // Shift + C: Trampa aleatoria del mazo
    if (e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      cheatManager.triggerWeightedRandom();
    }
    // Shift + D: Monitor de rendimiento y debug
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      window.DEBUG = !window.DEBUG;
    }
  });

  window.addEventListener('keyup', e => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.w = keys.ArrowUp = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.s = keys.ArrowDown = false;
  });

  window.addEventListener('blur', () => {
    keys.w = keys.s = keys.ArrowUp = keys.ArrowDown = false;
  });

  // GESTORES DE BOTONES UI
  document.getElementById('btn-play').addEventListener('click', () => { sound.init(); startMatch(); });
  document.getElementById('btn-howtoplay').addEventListener('click', () => switchScreen('howtoplay'));
  document.getElementById('btn-cheatdb').addEventListener('click', () => switchScreen('cheatdb'));
  document.getElementById('btn-back-howtoplay').addEventListener('click', () => switchScreen('menu'));
  document.getElementById('btn-back-cheatdb').addEventListener('click', () => switchScreen('menu'));

  document.getElementById('btn-resume').addEventListener('click', () => {
    isPaused = false;
    document.getElementById('pause-modal').classList.add('hidden');
  });

  document.getElementById('btn-restart-game').addEventListener('click', () => startMatch());
  document.getElementById('btn-menu-from-pause').addEventListener('click', () => switchScreen('menu'));
  document.getElementById('btn-pause-trigger').addEventListener('click', () => {
    isPaused = !isPaused;
    document.getElementById('pause-modal').classList.toggle('hidden', !isPaused);
  });

  document.getElementById('btn-play-again').addEventListener('click', () => startMatch());
  document.getElementById('btn-menu-from-over').addEventListener('click', () => switchScreen('menu'));

  const soundBtn = document.getElementById('btn-sound');
  soundBtn.addEventListener('click', () => {
    sound.init();
    sound.muted = !sound.muted;
    soundBtn.textContent = sound.muted ? '🔇 SONIDO: OFF' : '🔊 SONIDO: ON';
  });

  // Inicializar UI e Iniciar el UNICO Game Loop Principal
  updateMenuUI();
  updatePlayerLabel();

  window.addEventListener('message', function(e) {
    if (e.data && e.data.source === 'petpixel_parent' && e.data.type === 'PLAYER_INFO_RESPONSE') {
      const lbl = document.getElementById('player-label-text');
      if (lbl && e.data.data && e.data.data.alias) {
        lbl.textContent = e.data.data.alias.toUpperCase();
      }
    }
  });

  // Interfaz de inspección y auditoría segura (preserva mecánicas originales)
  window.PongGame = {
    startMatch: startMatch,
    endMatch: endMatch,
    getState: () => ({
      gameState: gameState,
      playerScore: playerScore,
      botScore: botScore,
      highScore: highScore,
      winCount: winCount,
      lossCount: lossCount
    }),
    setScore: (p, b) => {
      playerScore = p;
      botScore = b;
      updateHUDScore();
    }
  };

  requestAnimationFrame(gameLoop);

})();
