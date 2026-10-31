# GUÍA DIDÁCTICA Y DEFENSA TÉCNICA: FÚTBOL 2D ATARI CON 10 PERSONAJES

**Asignatura:** Ingeniería Web  
**Evaluación:** Parcial 1  
**Tecnologías:** HTML5 Canvas, JavaScript ES6+ Vanilla, CSS3 Retro Arcade  

---

## 1. Arquitectura General y Sistema de Personajes

El sistema de personajes se diseñó siguiendo el principio de **configuración orientada a datos** (*Data-Driven Design*) para evitar duplicar código y prevenir la proliferación de scripts independientes.

### Objeto Central `CHARACTERS`
En `js/futbol.js`, cada uno de los 10 personajes cuenta con una definición estandarizada:

```javascript
CHARACTERS[id] = {
    id: "velocista",
    name: "VELOCISTA",
    skillName: "Sandevistan",
    desc: "Aceleración extrema x2.2...",
    icon: "⚡",
    color: "#ffe600",
    stroke: "#fff799",
    cooldown: 8.0,      // Tiempo de recarga en segundos
    duration: 2.6,      // Duración activa si aplica
    onActivate(player, opponent, ball, match),
    onUpdate(player, opponent, ball, match, dt),
    getSpeedMultiplier(player),
    onBallKick(player, ball, kickInfo),
    onDraw(player, ctx),
    aiShouldActivate(player, opponent, ball, match)
};
```

Toda la lógica de control, tiempos de recarga, visualización y toma de decisiones de la IA consulta esta estructura de manera uniforme.

---

## 2. Implementación Técnica de las Diez Habilidades

| # | Personaje | Habilidad | Implementación Técnica | Reglas de Protección y Seguridad |
|---|---|---|---|---|
| **1** | **VELOCISTA** | *Sandevistan* | **Dilatación Temporal (Bullet Time):** Durante `3.0s`, ralentiza el flujo del tiempo de todo el entorno (`dtWorld`, `dtBall`, `dtKeepers` y rival al `28%`, es decir `0.28x`) mientras el Velocista se mueve a velocidad normal/ágil (`1.25x`) dejando estelas cromáticas (amarillo neón y cian cyberpunk). | Crea la auténtica experiencia Sandevistan: el usuario ve la pelota y a los rivales flotando en cámara lenta mientras él maniobra y remata a placer. Viñeta perimetral de distorsión en canvas. |
| **2** | **CONSTRUCTOR** | *Barrera* | Instancia un obstáculo rectangular en `match.barriers` durante `5.0s`. Dispone de colisión continua contra balón y jugadores. | Coordenadas restringidas para evitar que se coloque dentro de una portería o encierre a un jugador. |
| **3** | **CLONADOR** | *Duplicación* | Crea una copia en `match.clones` por `4.5s`. El clon persigue el balón y colisiona con el rival. | **Regla anti-gol:** Si el clon toca el balón cerca de la línea de gol, amortigua o desvía lateralmente, impidiendo que el clon anote por sí solo. |
| **4** | **TIRADOR** | *Recarga Perfecta* | Mecánica inspirada en *Gears of War*. Al activar `E`/`Enter`, una aguja recorre una barra de progreso de `0.0` a `1.0`. Si se pulsa de nuevo en la **Zona Perfecta (0.60 a 0.80)**, concede `+85%` de potencia al tiro y velocidad aumentada; si se falla, otorga un impulso menor. | Los temporizadores corren con `deltaTime`. La IA sincroniza su pulsación con precisión quirúrgica en `0.65`. |
| **5** | **LANZADOR** | *Agarre y Lanzamiento* | Comprueba distancia al rival (`< 80px`). Si está al alcance, lo lanza `145px` en la dirección de ataque y le aplica `stunTimer = 1.2s`. | Aplica `grabImmunityTimer = 4.0s` en la víctima para evitar atraparla en bucles infinitos de agarre. La posición final se restringe estrictamente dentro de los límites de la cancha. |
| **6** | **IMÁN** | *Atracción* | Activa un campo magnético de `3.0s`. En `onUpdate`, calcula el vector hacia el jugador y suma una fuerza gradual proporcional a `ball.vx` y `ball.vy`. | No teletransporta el balón; es una fuerza física que el rival puede contrarrestar pateando o corriendo en dirección contraria. |
| **7** | **FANTASMA** | *Intangibilidad* | Durante `3.2s`, activa `player.isGhost = true` con transparencia `0.45` y contorno espectral. En la resolución de colisiones, se omite el contacto jugador-jugador. | **Límites infranqueables:** Sigue colisionando normalmente con las paredes de la cancha, los postes, las barreras del Constructor y la pelota. |
| **8** | **REBOTADOR** | *Disparo Especial* | Carga el siguiente disparo del jugador. Al patear, incrementa la velocidad un `+75%` y activa `ball.reboundActiveTimer = 2.8s`, elevando el factor de restitución contra paredes y postes a `1.15`. | El efecto se consume al patear. Si no se contacta el balón en `5.0s`, la carga se disipa automáticamente. |
| **9** | **ANCLA** | *Fortaleza* | Concede inercia masiva durante `3.5s`. En `resolvePlayerPlayerCollision`, el Ancla no cede terreno y desplaza al rival al hacer contacto físico. | Mantiene su velocidad normal de desplazamiento y no es invulnerable al balón o las reglas del partido. |
| **10** | **INTERCAMBIADOR** | *Cambio de Posición* | Verifica rango máximo de `380px`. Si es válido, intercambia instantáneamente las coordenadas `(x, y)` entre ambos jugadores con destellos cuánticos. | Aplica `swapImmunityTimer = 4.0s` a ambos para evitar bucles. Limita las coordenadas resultantes para que ninguno quede fuera del campo ni atrapado en la red. |

---

## 3. Temporizadores, Pausa y Recargas con `deltaTime`

- **Sin `setInterval` ni `setTimeout`:** Ninguna habilidad utiliza temporizadores asíncronos del navegador que continuarían corriendo durante una pausa.
- **Integración en `update(deltaTime)`:**
  ```javascript
  if (player.skillCooldownTimer > 0) player.skillCooldownTimer -= dt;
  if (player.skillActiveTimer > 0) player.skillActiveTimer -= dt;
  if (player.stunTimer > 0) player.stunTimer -= dt;
  ```
- **Comportamiento en Pausa:** Si `gameState.isPaused === true`, `update()` retorna de inmediato, congelando la física, las recargas y las duraciones en su valor exacto.
- **Límite de Salto:** Se impone `MAX_DELTA = 0.05` para evitar saltos numéricos bruscos si el usuario minimiza la pestaña o cambia de ventana.

---

## 4. Manejo de Colisiones

El juego separa las colisiones en funciones geométricas dedicadas:

1. **Círculo vs Círculo (Jugador - Balón / Jugador - Jugador):**
   Usa la distancia euclidiana `Math.hypot(dx, dy)`. Si la distancia es menor a la suma de radios, separa las entidades a lo largo del vector normal y calcula la transferencia de momento.
2. **Círculo vs Rectángulo (Balón/Jugador - Barrera del Constructor):**
   Encuentra el punto más cercano en el rectángulo `closestX = Math.max(min, Math.min(max, ball.x))` y calcula la distancia normal para rebotar o empujar fuera del obstáculo.
3. **Círculo vs Círculo Estático (Balón - Postes):**
   Rebote elástico reflejando el vector de velocidad con respecto a la normal del poste mediante producto punto: `v' = (v - 2 * (v · n) * n) * restitución`.
4. **Círculo vs Segmentos (Paredes y Redes):**
   Comprueba límites superior, inferior y las mallas traseras/laterales de las porterías.

---

## 5. Cómo Crear un Nuevo Personaje en el Futuro

Para agregar un undécimo personaje (por ejemplo, *Tornado*):

1. **Agregar la entrada en `CHARACTERS`:**
   ```javascript
   CHARACTERS.tornado = {
       id: "tornado",
       name: "TORNADO",
       skillName: "Remolino",
       desc: "Genera una corriente de aire que desvía la trayectoria del balón.",
       icon: "🌪️",
       color: "#74b9ff",
       stroke: "#dfe6e9",
       cooldown: 8.5,
       duration: 2.0,
       onActivate(player, opponent, ball, match) { ... },
       onUpdate(player, opponent, ball, match, dt) { ... },
       aiShouldActivate(player, opponent, ball, match) { ... }
   };
   ```
2. La grilla del selector (`buildCharacterGrid`) leerá automáticamente el catálogo y agregará la tarjeta con sus estilos, badges y lógica de selección sin modificar el HTML.

---

## 6. Historial Técnico de Modificaciones

- **`futbol.html`:** Incorporación de HUD superior para J1 y J2 (avatares, barras de turbo y cooldown de habilidades), selector modal de los 10 personajes y actualización de instrucciones de teclas.
- **`css/futbol.css`:** Maquetación de tarjetas retro de personajes, medidores dinámicos de turbo y enfriamiento, badges de turno y diseño adaptable a pantallas de cualquier resolución.
- **`js/futbol.js`:** Implementación del catálogo `CHARACTERS` de 10 héroes, sistema de turbo con consumo/recarga de energía, IA táctica para cada personaje, barra de recarga estilo Gears of War, colisiones de barreras, gestión de clones e inmunidades anti-bucles.
- **Errores encontrados y resueltos:**
  - *Problema:* El clonador podía anotar autogoles o empujar la pelota directamente al arco rival.  
    *Solución:* Se programó una amortiguación y desvío lateral cuando el clon contacta el balón.
  - *Problema:* El lanzador e intercambiador podían generar bucles repetitivos de control.  
    *Solución:* Se implementaron temporizadores de inmunidad temporal (`grabImmunityTimer` y `swapImmunityTimer` de 4s).

