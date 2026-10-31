/**
 * ============================================================================
 * PETPIXEL ARCADE STORAGE & STATS MANAGER
 * Sistema centralizado de persistencia en LocalStorage para Fútbol 2D y Pong.
 * ============================================================================
 * 
 * Características:
 *  - Serialización y deserialización segura JSON con manejo de errores (try/catch).
 *  - Prevención de duplicados mediante ID y timestamp únicos.
 *  - Sincronización bidireccional con claves existentes de Pong.
 *  - Comunicación segura vía postMessage con iframes.
 *  - Eventos de actualización en tiempo real ('petpixel:storage-updated').
 */

(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PetPixelStorage = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {
    'use strict';

    const STORAGE_KEY = 'petpixel_arcade_data';
    const PONG_HIGH_KEY = 'pong_impossible_highscore';
    const PONG_WINS_KEY = 'pong_impossible_wins';
    const PONG_LOSSES_KEY = 'pong_impossible_losses';
    const PONG_CHEATS_KEY = 'pong_impossible_cheats';

    // Memoria en caso de cuota excedida o modo incógnito restrictivo
    let memoryFallback = null;

    function isLocalStorageAvailable() {
        try {
            const testKey = '__storage_test__';
            window.localStorage.setItem(testKey, testKey);
            window.localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    const hasLocalStorage = isLocalStorageAvailable();

    function getDefaultData() {
        return {
            version: '2.0',
            player: {
                alias: 'Jugador 1',
                avatar: '🎮',
                updatedAt: new Date().toISOString()
            },
            futbol: {
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                goalsScored: 0,
                goalsConceded: 0,
                bestResult: {
                    playerScore: 0,
                    rivalScore: 0,
                    diff: -999,
                    date: null,
                    rivalChar: null
                },
                history: []
            },
            pong: {
                highScore: 0,
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                lastMatchDate: null,
                lastMatchId: null,
                cheatsDiscovered: 0
            }
        };
    }

    /**
     * Sincroniza datos heredados de Pong (si existen en LocalStorage)
     */
    function syncPongLegacy(data) {
        if (!hasLocalStorage) return data;
        try {
            const legacyHigh = parseInt(window.localStorage.getItem(PONG_HIGH_KEY) || '0', 10);
            const legacyWins = parseInt(window.localStorage.getItem(PONG_WINS_KEY) || '0', 10);
            const legacyLosses = parseInt(window.localStorage.getItem(PONG_LOSSES_KEY) || '0', 10);
            let legacyCheatsCount = 0;
            try {
                const cheats = JSON.parse(window.localStorage.getItem(PONG_CHEATS_KEY) || '[]');
                legacyCheatsCount = Array.isArray(cheats) ? cheats.length : 0;
            } catch (e) {}

            data.pong.highScore = Math.max(data.pong.highScore || 0, legacyHigh);
            data.pong.wins = Math.max(data.pong.wins || 0, legacyWins);
            data.pong.losses = Math.max(data.pong.losses || 0, legacyLosses);
            data.pong.matchesPlayed = Math.max(data.pong.matchesPlayed || 0, data.pong.wins + data.pong.losses);
            data.pong.cheatsDiscovered = Math.max(data.pong.cheatsDiscovered || 0, legacyCheatsCount);
        } catch (e) {
            console.warn('[PetPixelStorage] Error sincronizando claves heredadas de Pong:', e);
        }
        return data;
    }

    /**
     * Obtiene el árbol completo de datos
     */
    function getData() {
        let raw = null;
        if (hasLocalStorage) {
            try {
                raw = window.localStorage.getItem(STORAGE_KEY);
            } catch (e) {
                console.warn('[PetPixelStorage] Error al leer LocalStorage:', e);
            }
        } else {
            raw = memoryFallback;
        }

        let parsed = null;
        if (raw) {
            try {
                parsed = JSON.parse(raw);
            } catch (e) {
                console.error('[PetPixelStorage] JSON corrupto, inicializando defaults:', e);
            }
        }

        if (!parsed || typeof parsed !== 'object') {
            parsed = getDefaultData();
        }

        // Asegurar estructura
        if (!parsed.player) parsed.player = getDefaultData().player;
        if (!parsed.futbol) parsed.futbol = getDefaultData().futbol;
        if (!parsed.pong) parsed.pong = getDefaultData().pong;
        if (!Array.isArray(parsed.futbol.history)) parsed.futbol.history = [];

        parsed = syncPongLegacy(parsed);
        return parsed;
    }

    /**
     * Guarda el árbol completo de datos
     */
    function saveData(data) {
        if (!data || typeof data !== 'object') return false;
        try {
            data.player.updatedAt = new Date().toISOString();
            const serialized = JSON.stringify(data);
            if (hasLocalStorage) {
                window.localStorage.setItem(STORAGE_KEY, serialized);
                // Mantener sincronizadas las claves de Pong
                if (data.pong) {
                    window.localStorage.setItem(PONG_HIGH_KEY, String(data.pong.highScore || 0));
                    window.localStorage.setItem(PONG_WINS_KEY, String(data.pong.wins || 0));
                    window.localStorage.setItem(PONG_LOSSES_KEY, String(data.pong.losses || 0));
                }
            } else {
                memoryFallback = serialized;
            }

            // Disparar evento de actualización a la ventana
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                try {
                    window.dispatchEvent(new CustomEvent('petpixel:storage-updated', { detail: data }));
                } catch (e) {}
            }
            return true;
        } catch (e) {
            console.error('[PetPixelStorage] Error al guardar datos en LocalStorage:', e);
            return false;
        }
    }

    /**
     * Obtiene el alias actual del jugador
     */
    function getPlayerAlias() {
        const data = getData();
        return (data.player && data.player.alias) ? data.player.alias.trim() : 'Jugador 1';
    }

    /**
     * Actualiza el alias del jugador
     */
    function setPlayerAlias(newAlias) {
        if (!newAlias || typeof newAlias !== 'string') return false;
        const clean = newAlias.trim().substring(0, 24);
        if (clean.length === 0) return false;

        const data = getData();
        data.player.alias = clean;
        const saved = saveData(data);
        return saved;
    }

    /**
     * Registra el resultado de un partido (Fútbol o Pong)
     */
    function recordMatch(game, matchData) {
        if (!matchData || typeof matchData !== 'object') return false;
        const data = getData();

        if (game === 'futbol') {
            // Validar que no sea un registro duplicado por ID o timestamp
            const matchId = matchData.id || ('futbol_' + (matchData.timestamp || Date.now()));
            const alreadyExists = data.futbol.history.some(m => m.id === matchId);
            if (alreadyExists) {
                console.warn('[PetPixelStorage] Partido de Fútbol ya registrado previamente:', matchId);
                return false;
            }

            // Construir registro normalizado
            const durationSec = Math.max(1, parseInt(matchData.durationSeconds, 10) || 0);
            const m = Math.floor(durationSec / 60);
            const s = durationSec % 60;
            const durationFormatted = matchData.durationFormatted || 
                `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;

            const record = {
                id: matchId,
                date: matchData.date || new Date().toLocaleString(),
                isoDate: matchData.isoDate || new Date().toISOString(),
                timestamp: matchData.timestamp || Date.now(),
                mode: matchData.mode || '1P vs IA',
                playerAlias: matchData.playerAlias || getPlayerAlias(),
                p1Character: matchData.p1Character || 'Velocista',
                p2Character: matchData.p2Character || 'Constructor',
                scoreBlue: parseInt(matchData.scoreBlue, 10) || 0,
                scoreOrange: parseInt(matchData.scoreOrange, 10) || 0,
                winner: matchData.winner || 'draw', // 'blue', 'orange', 'draw'
                winnerLabel: matchData.winnerLabel || 'Empate',
                durationSeconds: durationSec,
                durationFormatted: durationFormatted
            };

            // Insertar al inicio del historial (máximo 50 partidas)
            data.futbol.history.unshift(record);
            if (data.futbol.history.length > 50) {
                data.futbol.history = data.futbol.history.slice(0, 50);
            }

            data.futbol.matchesPlayed = (data.futbol.matchesPlayed || 0) + 1;
            data.futbol.goalsScored = (data.futbol.goalsScored || 0) + record.scoreBlue;
            data.futbol.goalsConceded = (data.futbol.goalsConceded || 0) + record.scoreOrange;

            if (record.winner === 'blue') {
                data.futbol.wins = (data.futbol.wins || 0) + 1;
            } else if (record.winner === 'orange') {
                data.futbol.losses = (data.futbol.losses || 0) + 1;
            } else {
                data.futbol.draws = (data.futbol.draws || 0) + 1;
            }

            // Evaluar mejor resultado
            const diff = record.scoreBlue - record.scoreOrange;
            const currentBest = data.futbol.bestResult || { diff: -999 };
            if (diff > (currentBest.diff || -999) || (diff === currentBest.diff && record.scoreBlue > (currentBest.playerScore || 0))) {
                data.futbol.bestResult = {
                    playerScore: record.scoreBlue,
                    rivalScore: record.scoreOrange,
                    diff: diff,
                    date: record.date,
                    rivalChar: record.p2Character
                };
            }

            return saveData(data);

        } else if (game === 'pong') {
            const matchId = matchData.id || ('pong_' + (matchData.timestamp || Date.now()));
            if (data.pong.lastMatchId === matchId) {
                console.warn('[PetPixelStorage] Partida de Pong ya registrada previamente:', matchId);
                return false;
            }
            data.pong.lastMatchId = matchId;

            // Si el juego provee los acumulados totales de Pong (winCount / lossCount),
            // sincronizar directamente para evitar duplicar el incremento de saveStorage() de Pong
            if (typeof matchData.totalWins === 'number' && typeof matchData.totalLosses === 'number') {
                data.pong.wins = Math.max(data.pong.wins || 0, matchData.totalWins);
                data.pong.losses = Math.max(data.pong.losses || 0, matchData.totalLosses);
                data.pong.matchesPlayed = Math.max(data.pong.matchesPlayed || 0, data.pong.wins + data.pong.losses);
            } else {
                const isWin = matchData.winner === 'player';
                data.pong.matchesPlayed = (data.pong.matchesPlayed || 0) + 1;
                if (isWin) {
                    data.pong.wins = (data.pong.wins || 0) + 1;
                } else {
                    data.pong.losses = (data.pong.losses || 0) + 1;
                }
            }

            const playerScore = parseInt(matchData.playerScore, 10) || 0;
            data.pong.highScore = Math.max(data.pong.highScore || 0, playerScore, parseInt(matchData.highScore, 10) || 0);
            data.pong.lastMatchDate = matchData.date || new Date().toLocaleString();
            if (typeof matchData.cheatsDiscovered === 'number') {
                data.pong.cheatsDiscovered = Math.max(data.pong.cheatsDiscovered || 0, matchData.cheatsDiscovered);
            }

            return saveData(data);
        }

        return false;
    }

    /**
     * Limpia el historial de partidos de Fútbol manteniendo el récord y alias
     */
    function clearFutbolHistory() {
        const data = getData();
        data.futbol.history = [];
        data.futbol.matchesPlayed = 0;
        data.futbol.wins = 0;
        data.futbol.losses = 0;
        data.futbol.draws = 0;
        data.futbol.goalsScored = 0;
        data.futbol.goalsConceded = 0;
        data.futbol.bestResult = {
            playerScore: 0,
            rivalScore: 0,
            diff: -999,
            date: null,
            rivalChar: null
        };
        return saveData(data);
    }

    /**
     * Resetea todas las estadísticas de ambos juegos a su estado inicial
     */
    function resetAllStats() {
        const alias = getPlayerAlias();
        const fresh = getDefaultData();
        fresh.player.alias = alias;
        return saveData(fresh);
    }

    let isPostMessageListening = false;

    /**
     * Inicializa el receptor seguro de postMessage para comunicarse con iframes
     */
    function initPostMessageListener() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
        if (isPostMessageListening) return;
        isPostMessageListening = true;

        window.addEventListener('message', function(event) {
            // Validar origen en entornos con dominio definido
            if (event.origin && event.origin !== 'null' && typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
                if (event.origin !== window.location.origin) {
                    console.warn('[PetPixelStorage] Mensaje rechazado: origen no permitido', event.origin);
                    return;
                }
            }

            // Validar estructura y origen del payload
            if (!event.data || typeof event.data !== 'object') return;
            if (event.data.source !== 'petpixel_game') return;

            // Procesar tipo de evento
            if (event.data.type === 'MATCH_END') {
                const game = event.data.game;
                const matchData = event.data.data;
                if ((game !== 'futbol' && game !== 'pong') || !matchData || typeof matchData !== 'object') {
                    console.warn('[PetPixelStorage] Payload MATCH_END inválido descartado');
                    return;
                }
                recordMatch(game, matchData);
            } else if (event.data.type === 'REQUEST_PLAYER_INFO') {
                // Enviar datos del jugador al iframe que lo solicite
                if (event.source && typeof event.source.postMessage === 'function') {
                    event.source.postMessage({
                        source: 'petpixel_parent',
                        type: 'PLAYER_INFO_RESPONSE',
                        data: {
                            alias: getPlayerAlias()
                        }
                    }, '*');
                }
            }
        });
    }

    // Auto-inicializar escucha de mensajes
    initPostMessageListener();

    return {
        getData: getData,
        saveData: saveData,
        getPlayerAlias: getPlayerAlias,
        setPlayerAlias: setPlayerAlias,
        recordMatch: recordMatch,
        clearFutbolHistory: clearFutbolHistory,
        resetAllStats: resetAllStats,
        initPostMessageListener: initPostMessageListener
    };
}));
