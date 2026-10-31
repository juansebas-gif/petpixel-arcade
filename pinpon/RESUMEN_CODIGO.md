# 📖 RESUMEN GENERAL DEL CÓDIGO - PONG: IMPOSSIBLE

> **Proyecto:** *Pong: Impossible - "El Bot Hará Trampa"*  
> **Tecnologías:** HTML5 Canvas, Vanilla CSS3, JavaScript Moderno (ES6+, Web Audio API, LocalStorage).  
> **Arquitectura:** Bucle de juego basado en Delta-Time (`requestAnimationFrame`) a 60 FPS, sin dependencias externas.

---

## 📁 1. Estructura de Archivos del Proyecto

El proyecto consta de tres archivos centrales organizados en la raíz:

```text
pinpon/
├── index.html          # Estructura semántica, pantallas de interfaz y canvas
├── visual.css          # Estilos visuales retro-arcade, estética CRT y animaciones
├── game.js             # Motor de juego, físicas, IA tramposa, audio y lógica
└── RESUMEN_CODIGO.md   # Este documento explicativo
```

---

## 🖥️ 2. `index.html` — Estructura y Vistas

Define el esqueleto de la aplicación y la jerarquía de navegación mediante contenedores superpuestos (`.screen-panel`), alternados vía clases CSS:

1. **Efectos de pantalla retro (Overlays):**
   - `.crt-overlay`: Simulación de líneas de escaneo (scanlines) estilo monitor CRT.
   - `.vignette`: Sombreado radial perimetral para efecto de pantalla curvada.
2. **Pantallas principales:**
   - **Menú Principal (`#menu-screen`):** Título neón animado, insignia de máxima puntuación guardada, botones para jugar, instrucciones y la base de datos de trampas.
   - **Cómo Jugar (`#how-to-play-screen`):** Guía de controles (`W/S`, flechas, `ESC`, `R`), objetivo (llegar a 5 puntos) y advertencia sobre el comportamiento del bot.
   - **Base de Trampas (`#cheat-database-screen`):** Álbum / grid de 30 trampas coleccionables que muestra cuáles han sido desbloqueadas y cuáles permanecen como secreto.
   - **Pantalla de Partida (`#game-screen`):** 
     - **HUD superior:** Marcador Jugador vs Bot, botón de silenciar/activar sonido y botón de pausa.
     - **Canvas (`#gameCanvas`):** Lienzo de 960 × 540 px donde se renderiza todo el juego.
     - **Notificaciones superpuestas:** Banner rojo de activación de trampa (`#cheat-banner`) y toast dorado de desbloqueo (`#cheat-toast`).
     - **Modales flotantes:** Menú de Pausa (`#pause-modal`) y Pantalla de Fin de Juego (`#game-over-screen` con estadísticas y frases sarcásticas del bot).

---

## 🎨 3. `visual.css` — Sistema Visual y Diseño Arcade

Diseñado con una estética **Cyberpunk / Retro Arcade**:

- **Paleta de Colores en Variables CSS (`:root`):**
  - Fondo oscuro inmersivo (`#0a0a14`), cian neón para el jugador (`#00f0ff`), rosa neón para el bot tramposo (`#ff0055`) y amarillo neón para acentos y avisos (`#ffee00`).
- **Tipografías:**
  - `'Press Start 2P'`: Tipografía pixelada para títulos, contadores y badges retro.
  - `'Outfit'`: Tipografía sans-serif geométrica para descripciones y textos legibles.
- **Efectos y Micro-Animaciones:**
  - Glow / resplandores `box-shadow` y `text-shadow`.
  - Animaciones clave: `neonPulse` (parpadeo de títulos), `bannerSlide` (entrada del aviso de trampa) y `toastPop` (notificación de logro).
  - Efectos visuales de cartas en la Base de Datos clasificados por rareza (*Común*, *Poco común*, *Rara*, *Extrema*) con bordes luminosos y estados bloqueado/desbloqueado.

---

## ⚙️ 4. `game.js` — Motor de Juego y Lógica Central

Con más de 1800 líneas, es el núcleo interactivo del juego. Está encapsulado en un **IIFE** (`(function() { 'use strict'; ... })()`) para proteger el ámbito global.

### A. Bucle de Juego de Alto Rendimiento (60 FPS)
- **Bucle Único:** Gestionado por `requestAnimationFrame(gameLoop)`.
- **Delta-Time Seguro:** Calcula la diferencia de tiempo entre cuadros (`dt`), acotada estrictamente entre **1ms y 33ms** para evitar saltos o congelamientos si la pestaña pierde el foco.
- **Sin `setTimeout` o `setInterval` Huérfanos:** Todos los temporizadores (mechas de bombas, duración de trampas, pausas de gol) operan decrementando variables con `dt`.
- **Pausa de Gol No Bloqueante:** Al anotar, `scoringInProgress` bloquea nuevos goles durante 0.8s mientras el renderizado continúa fluido a 60 FPS.

### B. Sistema de Sonido Procedural (`SoundEngine`)
- Utiliza la **Web Audio API** nativa sin requerir archivos `.mp3` ni `.wav`.
- Genera ondas sonoras sintetizadas en tiempo real:
  - *Rebotes de raqueta:* Onda cuadrada corta (`square`, 440 Hz).
  - *Rebote en pared:* Onda grave (`square`, 220 Hz).
  - *Gol del jugador:* Arpegio ascendente brillante (`triangle`).
  - *Gol del bot:* Tono descendente zumbante (`sawtooth`).
  - *Trampas:* Barrido de frecuencias rápido (`sweep`).
  - *Explosiones:* Ruido blanco aleatorio procesado con filtro paso bajo (`BiquadFilter`).

### C. Físicas y Dinámica de Partida
- **Escalado Progresivo de Rally:** Mientras la pelota permanece en juego sin que nadie anote, la velocidad de la pelota aumenta gradualmente (hasta un máximo de **2.4x**) y la agilidad del bot se incrementa (hasta **1.65x**).
- **IA del Bot:**
  - Seguimiento vertical con imperfección calculada (`botErrorOffset`) para que el jugador tenga oportunidad de superarlo en jugadas limpias.
  - **Nivel de Desesperación (0 a 3):** A medida que el jugador lleva ventaja en el marcador, el bot reduce el cooldown entre trampas y reacciona con mayor agresividad.
  - **Bocadillos de Diálogo:** El bot habla en pantalla con burlas y excusas ("*Las reglas son para humanos*", "*No hice trampa*", etc.).

### D. Administrador de Trampas (`CheatManagerClass`)
- Sistema de mazo aleatorio (`deck`) de 30 elementos sin repeticiones inmediatas.
- Mecanismo de activación y limpieza garantizada (`cleanupFn`) para devolver el estado del juego a la normalidad al expirar el tiempo de la trampa.

---

## 🃏 5. Catálogo Completo de las 30 Trampas del Bot

| # | Nombre | Tipo / Rareza | Efecto en Juego |
|---|---|---|---|
| **1** | **Teletransporte** | Común | El bot aparece instantáneamente frente a la pelota y la repele. |
| **2** | **Raqueta Gigante** | Común | La raqueta del bot crece hasta cubrir el 88% del alto de la pantalla. |
| **3** | **Persecución Ilegal** | Común | El bot abandona su línea y persigue la pelota por todo el campo. |
| **4** | **Raqueta de Tenis** | Común | Saca una raqueta externa animada y propina un remate veloz con ángulo aleatorio. |
| **5** | **Bomba** | Poco común | Planta una bomba en el área del jugador que explota y lo aturde/inmoviliza. |
| **6** | **Segunda Pelota** | Poco común | Spawnea una pelota física adicional de color amarillo en juego simultáneo. |
| **7** | **Portal** | Poco común | Conecta dos portales dimensionales que teletransportan la pelota hacia el jugador. |
| **8** | **Muro Ilegal** | Poco común | Levanta una barrera láser vertical impenetrable delante de la portería del bot. |
| **9** | **Brazo Extensible** | Poco común | Extiende un brazo mecánico articulado hacia el centro del campo para devolver el balón. |
| **10** | **Mano Divina** | Rara | Una mano gigante cae desde la parte superior aplastando la pelota en contraataque. |
| **11** | **Rebobinar Tiempo** | Rara | Regresa la pelota a su posición de hace 1 segundo invirtiendo su dirección. |
| **12** | **Cámara Lenta** | Poco común | Reduce la velocidad del tiempo a un 35% afectando a la pelota y al jugador. |
| **13** | **Hack de Velocidad** | Común | El bot se desplaza verticalmente a velocidad hipersónica (22 px/frame). |
| **14** | **Clon del Bot** | Poco común | Crea un segundo bot enemigo que defiende en tándem la portería. |
| **15** | **Imán de Pelota** | Poco común | Genera una fuerza gravitatoria que atrae magnéticamente la pelota hacia el bot. |
| **16** | **Gancho** | Poco común | Dispara un arpón mecánico que atrapa la pelota y la jala hacia su portería. |
| **17** | **Escoba** | Poco común | Aparece una escoba que barre físicamente la pelota alejándola de su arco. |
| **18** | **Puerta Mágica** | Poco común | Dos puertas de teletransporte reubican la pelota directo a la espalda del jugador. |
| **19** | **OVNI** | Rara | Un platillo volador con rayo tractor abduce la pelota y la suelta a favor del bot. |
| **20** | **Ventilador Gigante**| Poco común | Genera ráfagas de viento que soplan y desvían la trayectoria del tiro. |
| **21** | **Árbitro Corrupto** | Rara | Aparece un árbitro con silbato que pita una falta inexistente y anula el tiro del jugador. |
| **22** | **Nuevas Reglas** | Extrema | Decreta *"El jugador no puede marcar"*: la pelota rebota en la línea de gol del bot. |
| **23** | **Punto Falso** | Extrema | Si el jugador anota, el bot le descuenta el punto alegando que *"no cuenta"*. |
| **24** | **Controles Invertidos**| Poco común | Invierte el eje de movimiento del jugador (`Arriba` pasa a ser `Abajo`). |
| **25** | **Mando Desconectado**| Extrema | Congela la raqueta del jugador 1 segundo con un aviso de desconexión. |
| **26** | **Ping 9999** | Poco común | La pelota sufre lag simulado, teletransportándose erráticamente a tirones. |
| **27** | **Portería Móvil** | Rara | La línea de gol del bot se desplaza arriba y abajo para esquivar la entrada del gol. |
| **28** | **Búmeran** | Poco común | La pelota sobrepasa al bot, frena en seco y regresa flotando hacia el jugador. |
| **29** | **Pelota Explosiva** | Extrema | La pelota se transforma en una bomba con mecha que estalla al llegar a la raqueta. |
| **30** | **Física Errónea** | Poco común | Los rebotes con los bordes superior e inferior reaccionan con ángulos caóticos impredecibles. |

---

## 💾 6. Persistencia de Datos (`localStorage`)

El juego almacena de forma persistente en el navegador:
- `pong_impossible_highscore`: Mayor puntaje obtenido.
- `pong_impossible_wins`: Cantidad de victorias del jugador.
- `pong_impossible_losses`: Cantidad de derrotas frente al bot.
- `pong_impossible_cheats`: Array serializado en JSON con los IDs de las trampas que el jugador ha presenciado y desbloqueado en el álbum.

---

## 🛠️ 7. Atajos y Controles de Teclado

- **Movimiento de la raqueta:** Teclas `W` / `S` o flechas de dirección `⬆` / `⬇`.
- **Pausar el juego:** Tecla `ESC`.
- **Reiniciar partida:** Tecla `R`.
- **Menú de Rendimiento / Debug:** `Shift + D` (Muestra en pantalla FPS reales, tiempos de update/render en ms, objetos activos y multiplicadores de rally).
- **Forzar Trampa (Modo Prueba):** `Shift + C` (Dispara una trampa inmediata del bot para testing).
