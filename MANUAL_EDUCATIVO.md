# 📘 MANUAL EDUCATIVO: INTEGRACIÓN DE VIDEOJUEGOS WEB EN PETPIXEL

> **Estudio:** PetPixel — Indie Game Studio  
> **Autor:** Juan Sebastian Peñaranda Acosta  
> **Área:** Ingeniería Multimedia / Desarrollo Web Interactivo  
> **Juegos Integrados:** *Fútbol 2D Atari* (10 Personajes & Habilidades) y *Pong: Impossible* (30 Trampas & IA)  

---

## 🎯 1. Propósito Didáctico

Este manual describe detalladamente los conceptos de arquitectura web, diseño lúdico y buenas prácticas aplicadas para integrar videojuegos nativos en HTML5 Canvas dentro de un portafolio profesional existente.

El objetivo fue incorporar dos experiencias jugables independientes sin alterar su código interno, preservando su rendimiento a **60 FPS**, sus físicas 2D y sus sistemas de audio, asegurando al mismo tiempo una experiencia de navegación cohesiva, moderna y accesible.

---

## 🏗️ 2. Arquitectura de Integración: ¿Por qué Cápsulas de Ejecución (Runners)?

Al integrar videojuegos desarrollados en JavaScript puro en un sitio web multipágina preexistente, surgen dos grandes estrategias:

### Estrategia A: Fusión Directa en el Mismo DOM (Monolítico)
* **Riesgos:**
  - **Colisión de eventos de teclado:** Ambos juegos escuchan `keydown` (`W`, `S`, flechas, `Espacio`). Si se ejecutan en el mismo documento, pulsar `Espacio` en el portafolio podría pausar ambos o hacer scroll en la ventana.
  - **Conflictos de estilos CSS:** Reglas globales como `html, body { overflow: hidden; }` o el reset universal `* { ... }` de los juegos podrían romper el header y los estilos del portafolio.
  - **Sobrecarga de Game Loops:** Múltiples ciclos de `requestAnimationFrame` corriendo en paralelo degradan el rendimiento y la batería.

### Estrategia B: Cápsula Aislada Mediante Páginas Runner con Iframes (Seleccionada)
* **Ventajas Técnicas:**
  - **Aislamiento Hermético de Alcance (Scope Isolation):** Cada juego corre en su propio contexto de ejecución `window` y `document`. Las variables globales (`canvas`, `ctx`, `gameState`) nunca entran en conflicto.
  - **Preservación Total del Código Original:** No fue necesario renombrar funciones, refactorizar IDs ni eliminar mecánicas. Los 10 personajes, el turbo, las colisiones y las 30 trampas se conservan al 100%.
  - **Enfoque de Teclado Controlado:** La página anfitriona enfoca automáticamente el iframe (`iframe.focus()`), permitiendo que el usuario juegue al instante sin interferencias de scroll exterior.
  - **Soporte de Pantalla Completa:** La página runner proporciona un botón de *Fullscreen* que expande el lienzo a toda la pantalla del dispositivo.

```
Portafolio PetPixel (Entorno Principal)
 │
 ├── arcade.html ──────────────────► Catálogo de Videojuegos (Tarjetas, Previews, Fichas)
 │     ├── [Jugar Fútbol] ─────────► /juegos/futbol.html (Runner con Iframe a 'futbol 2d atari')
 │     └── [Jugar Pong] ───────────► /juegos/pong.html   (Runner con Iframe a 'pinpon')
 └── Retorno Fluido ◄────────────── Botón "← Volver a Zona Arcade" en cada Runner
```

---

## 🗺️ 3. Sistema de Rutas y Navegación

La estructura de rutas se diseñó para cumplir los estándares de desarrollo web tanto en entornos estáticos locales (`file:///`) como en servidores de producción (Apache, Nginx, Vercel, GitHub Pages):

| Ruta Lógica | Archivo Físico | Función |
|---|---|---|
| `/` o `/index.html` | `index.html` | Portada con llamada a la acción hacia la Zona Arcade. |
| `/arcade.html` | `arcade.html` | Galería principal Arcade con tarjetas informativas de ambos juegos. |
| `/juegos/futbol` | `juegos/futbol.html` y `juegos/futbol/index.html` | Entorno de ejecución de *Fútbol 2D Atari*. |
| `/juegos/pong` | `juegos/pong.html` y `juegos/pong/index.html` | Entorno de ejecución de *Pong: Impossible*. |
| `/futbol 2d atari/futbol.html` | `futbol 2d atari/futbol.html` | Archivo nativo del juego Fútbol 2D. |
| `/pinpon/index.html` | `pinpon/index.html` | Archivo nativo del juego Pong: Impossible. |

### Enlaces Relativos Seguros:
- Desde la raíz (`arcade.html`): `juegos/futbol.html` y `juegos/pong.html`.
- Desde `juegos/futbol.html`: `../arcade.html` y `../futbol%202d%20atari/futbol.html`.
- Desde `juegos/futbol/index.html`: `../../arcade.html` y `../../futbol%202d%20atari/futbol.html`.
- **Doble soporte URL:** Se crearon tanto los archivos directos (`.html`) como las carpetas con `index.html` para admitir URLs limpias (`/juegos/futbol/`) en servidores HTTP.

---

## ⚙️ 4. Ciclo de Carga y Ejecución de los Juegos

### Fútbol 2D Atari
1. **Inicialización del Canvas:** Define un espacio virtual de `960 × 560 px`. La función `resizeCanvasView()` escala automáticamente el contenedor manteniendo la relación de aspecto sin deformar los elementos.
2. **Motor de Físicas:**
   - Vector de velocidad, masa, fricción de pasto y coeficiente de restitución.
   - Colisiones Círculo-Círculo (jugadores, balón) y Círculo-Rectángulo (barreras del Constructor).
3. **Delta-Time:**
   - Calcula `dt = Math.min((now - lastTime) / 1000, 0.05)`.
   - Garantiza que la velocidad de movimiento y los tiempos de recarga de habilidades sean idénticos en monitores de 60Hz, 120Hz o 144Hz.
4. **Dilatación Temporal (Sandevistan):** Ralentiza el factor de tiempo del entorno a `0.28x` permitiendo al jugador esquivar y rematar con estelas de neón.
5. **Código Secreto "balto" (Easter Egg):**
   - **Activación:** Si el usuario escribe de forma consecutiva la palabra `balto` en el teclado durante la partida.
   - **Efecto:** Anula el tiempo de recarga (`skillCooldownTimer = 0`) del personaje del Jugador 1, permitiendo usar su habilidad especial sin límite de espera.
   - **Indicador Visual:** El HUD superior muestra el estado `BALTO ∞` en color cian resplandeciente y el canvas proyecta un banner retro arcade.
   - **Condiciones de Desactivación:**
     1. Escribir nuevamente la palabra `balto` (interruptor on/off).
     2. Anotación de 3 goles en el partido (contador acumulado).
     3. Finalización del partido (por victoria o manual).
     4. Salida al menú de selección de personajes o reinicio de la partida.

### Pong: Impossible
1. **Lienzo Proporcional:** `960 × 540 px` con estilización responsiva en `visual.css` mediante `object-fit: contain`.
2. **Síntesis Web Audio API Procedural:**
   - Generación en tiempo real de tonos arcade (ondas cuadradas para raquetas, triangulares para puntos del jugador, sawtooth para puntos del bot y ruido blanco filtrado para explosiones).
   - Sin dependencias de archivos `.mp3` ni demoras de red.
3. **Inteligencia Artificial Tramposa:**
   - Algoritmo reactivo que analiza el marcador y la trayectoria de la bola.
   - Activa 30 trampas coleccionables (teletransporte, bombas, inversión de controles, aceleración sónica).

---

## 🔌 5. Comunicación y Control Portafolio-Juego

Para garantizar la mejor experiencia de usuario sin alterar los juegos:

1. **Gestión Automática del Foco:**
   ```javascript
   function focusIframe() {
       if (iframe && iframe.contentWindow) {
           iframe.focus();
           iframe.contentWindow.focus();
       }
   }
   window.addEventListener('load', () => setTimeout(focusIframe, 300));
   ```
   Esto asegura que cuando el usuario entra a la página del juego, las pulsaciones de teclado (`WASD`, Flechas, `E`, `Enter`, `ESC`) sean capturadas inmediatamente por el juego y no por la barra de desplazamiento del navegador.

2. **Detección Fuera del Iframe (Fallback de Retorno):**
   Si un usuario o profesor abre directamente `futbol 2d atari/futbol.html` o `pinpon/index.html` de forma independiente, un script no invasivo detecta:
   ```javascript
   if (window.self === window.top) {
       document.getElementById('standalone-return-bar').style.display = 'flex';
   }
   ```
   Mostrando una barra superior discreta con el enlace "← Volver al Portafolio". Si el juego está dentro del iframe, la barra permanece completamente oculta.

3. **Modo Pantalla Completa Nativo (Full Screen API):**
   El botón `⛶ Pantalla Completa` en el runner activa `requestFullscreen()` sobre el contenedor del gabinete, permitiendo una experiencia inmersiva estilo máquina recreativa tanto en escritorio como en tabletas.

---

## 📱 6. Adaptabilidad Móvil y Accesibilidad

- **Responsive Design:** Ambos lienzos emplean cálculo de aspecto adaptable con `max-width: 100%`, evitando desbordamientos horizontales o barras de desplazamiento indeseadas.
- **Modo Oscuro Integrado:** La sección Arcade y los runners respetan fielmente la paleta de colores existente del estudio PetPixel (`#0b0f19`, `#151c2e`, `#7c3aed`, `#38bdf8`), garantizando armonía estética.
- **Guía de Controles Permanente:** Cada runner incluye una barra de atajos visibles y una ficha técnica completa debajo del juego para consulta rápida de mecánicas y habilidades.

---

## 💾 7. Fase 2: Sistema de Persistencia con LocalStorage

En la segunda fase se implementó un sistema de persistencia centralizado y robusto que permite almacenar las estadísticas, récords, identidad del jugador e historial de encuentros sin requerir servidores o bases de datos externas.

### A. Biblioteca Reutilizable: `storage.js`
El módulo `PetPixelStorage` implementa el patrón UMD (Universal Module Definition) para ejecutarse de forma idéntica en navegadores y en entornos de testing Node.js.

```javascript
// Funciones expuestas por PetPixelStorage:
PetPixelStorage.getData();                   // Retorna el árbol completo en formato objeto JSON
PetPixelStorage.saveData(data);              // Serializa y guarda en LocalStorage con try/catch
PetPixelStorage.getPlayerAlias();            // Retorna el alias actual o 'Jugador 1'
PetPixelStorage.setPlayerAlias(newAlias);    // Valida y actualiza el alias del jugador
PetPixelStorage.recordMatch(game, matchData);// Registra un partido de Fútbol o Pong
PetPixelStorage.clearFutbolHistory();        // Limpia el historial preservando el perfil
PetPixelStorage.initPostMessageListener();   // Escucha mensajes seguros desde los iframes
```

### B. Estructura y Esquema del Objeto JSON
Los datos se almacenan bajo la clave `petpixel_arcade_data` con la siguiente estructura:

```json
{
  "version": "2.0",
  "player": {
    "alias": "JuanchoPixel",
    "avatar": "🎮",
    "updatedAt": "2026-10-31T21:30:00.000Z"
  },
  "futbol": {
    "matchesPlayed": 5,
    "wins": 4,
    "losses": 1,
    "draws": 0,
    "goalsScored": 14,
    "goalsConceded": 6,
    "bestResult": {
      "playerScore": 3,
      "rivalScore": 0,
      "diff": 3,
      "date": "31/10/2026, 16:30",
      "rivalChar": "Constructor"
    },
    "history": [
      {
        "id": "futbol_1730410200000_123",
        "date": "31/10/2026, 16:30",
        "isoDate": "2026-10-31T21:30:00.000Z",
        "timestamp": 1730410200000,
        "mode": "1P vs IA",
        "playerAlias": "JuanchoPixel",
        "p1Character": "Velocista",
        "p2Character": "Constructor",
        "scoreBlue": 3,
        "scoreOrange": 1,
        "winner": "blue",
        "winnerLabel": "JUGADOR 1 (JuanchoPixel)",
        "durationSeconds": 94,
        "durationFormatted": "01:34"
      }
    ]
  },
  "pong": {
    "highScore": 5,
    "matchesPlayed": 3,
    "wins": 2,
    "losses": 1,
    "lastMatchDate": "31/10/2026, 16:40",
    "cheatsDiscovered": 8
  }
}
```

### C. Protocolo de Comunicación Segura con `postMessage`
Dado que ambos juegos se ejecutan dentro de elementos `<iframe>`, la comunicación con el portafolio principal se realiza mediante el estándar `window.postMessage`:

1. **Emisión desde el Iframe:**
   Cuando finaliza un partido en Fútbol o Pong, el juego genera el paquete de datos y lo envía al contexto padre:
   ```javascript
   window.parent.postMessage({
       source: 'petpixel_game',
       game: 'futbol', // o 'pong'
       type: 'MATCH_END',
       data: matchData
   }, '*');
   ```
2. **Recepción y Validación en el Portafolio:**
   `storage.js` valida que el mensaje contenga el identificador de origen `source: 'petpixel_game'` y el tipo de evento esperado antes de invocar `recordMatch()`.
3. **Respaldo Standalone:**
   Si el juego es abierto directamente en una pestaña independiente (fuera del iframe), `storage.js` es detectado localmente y el resultado se guarda directamente en LocalStorage.

### D. Prevención de Duplicados y Manejo de Errores
- **IDs Únicos:** Cada encuentro incluye un `id` generado con marca temporal y entropía aleatoria. Si el mismo ID ya existe en el arreglo `history`, la función descarta la inserción para prevenir duplicaciones.
- **Tolerancia a Fallos:** Todas las operaciones con `localStorage` están envueltas en bloques `try/catch`. Si el usuario navega en modo incógnito estricto o con cuota agotada, el módulo activa automáticamente un fallback en memoria, evitando que la aplicación se congele o genere excepciones en consola.
- **Sincronización Reactiva:** Cada guardado exitoso dispara el evento `petpixel:storage-updated`, permitiendo que el tablero de estadísticas y la tabla de historial en `arcade.html` se actualicen en tiempo real sin necesidad de recargar la página.

---

## 🔬 8. Fase 2.1: Lecciones de la Auditoría Funcional en Navegador Real

La ejecución automatizada en navegador real (Google Chrome vía CDP) reveló lecciones pedagógicas fundamentales en el desarrollo frontend moderno:

1. **La trampa de la doble persistencia en arquitecturas Iframe:**
   Cuando un archivo HTML embebido en un `iframe` comparte el mismo dominio que su contenedor padre, ambos acceden a la misma base de datos `localStorage`. Si el iframe dispara un `postMessage` al contenedor y al mismo tiempo invoca directamente la función de guardado local, el dato se guardará dos veces. La solución arquitectónica es establecer una política estricta de responsabilidad: **si hay ventana padre (`window.parent !== window`), el iframe solo delega vía mensaje; la responsabilidad de escritura en almacenamiento recae exclusivamente en el documento contenedor.**

2. **Sincronización con bases de datos heredadas (Legacy Migration):**
   Al migrar aplicaciones independientes que ya poseían sus propias variables de almacenamiento (`pong_impossible_wins`), el sistema central debe sincronizar mediante lecturas idempotentes (`Math.max`), reconociendo si el payload entrante ya contiene el total acumulado de victorias para no incrementar doblemente la cuenta.

3. **Defensa contra marcas temporales nulas:**
   En entornos interactivos donde el usuario puede finalizar un encuentro manualmente sin haber pasado por todos los estados de un selector, los cálculos de tiempo transcurrido (`now - startTime`) deben contar con valores de seguridad por defecto para evitar diferencias astronómicas que corrompan el formato de visualización del historial.

4. **Validación estricta de origen en mensajería entre ventanas:**
   Para prevenir ataques de inyección mediante mensajes cruzados (Cross-Window Scripting o Spoofing), el receptor de `postMessage` debe verificar rigurosamente el origen `event.origin === window.location.origin`, la estructura del payload y la existencia de esquemas válidos antes de persistir cualquier registro.

---

## 🚀 9. Fase 4: Despliegue en Producción (GitHub & Vercel)

El paso final en el ciclo de vida de desarrollo de software es llevar la aplicación web desde el entorno local de desarrollo hasta un entorno de producción en la nube accesible públicamente mediante HTTPS.

### A. Arquitectura de Despliegue Estático (JAMstack)
PetPixel es un portafolio web estático moderno enriquecido con JavaScript vanilla, Web Audio API y Canvas 2D. No requiere un servidor dinámico con Node.js en tiempo de ejecución, lo que permite aprovechar las redes de distribución de contenido (Edge CDN) globales de **Vercel**:
- **Baja latencia:** Los archivos HTML, CSS, JS e imágenes se sirven desde el nodo de red más cercano al visitante.
- **HTTPS Automático:** Certificado SSL/TLS gestionado de forma transparente sin costos de mantenimiento.
- **Inmutabilidad:** Cada commit en GitHub genera una vista previa (*Preview Deployment*) aislada antes de pasar a la rama principal (`main`).

### B. Configuración de `vercel.json`
El archivo de manifiesto `vercel.json` estandariza el comportamiento del servidor perimetral de Vercel:
1. `cleanUrls: true`: Permite que rutas como `/arcade` o `/juegos/futbol` se resuelvan limpiamente sin forzar la extensión `.html`.
2. `X-Frame-Options: SAMEORIGIN`: Protege el portafolio contra ataques de Clickjacking garantizando que los `<iframe>` de los juegos solo puedan ser incrustados desde el propio dominio de PetPixel.
3. `Cache-Control`: Configura cabeceras de caché estáticas prolongadas para recursos multimedia en `/assets/` optimizando drásticamente la velocidad de carga.
4. `Permissions-Policy: fullscreen=(self), autoplay=(self)`: Otorga permisos explícitos al contenedor y a los juegos para alternar a pantalla completa y reproducir audio retro sin bloqueos de navegador.

### C. Comportamiento de LocalStorage en Dominio Definitivo
En la web, el mecanismo de almacenamiento `localStorage` está estrictamente delimitado por la **Same-Origin Policy** (Esquema + Dominio + Puerto):
- Al pasar de `file:///` o `localhost` a `https://tu-proyecto.vercel.app`, el navegador asigna un almacenamiento aislado e independiente para el dominio.
- Tanto la página anfitriona (`/juegos/futbol.html`) como el iframe (`/futbol 2d atari/futbol.html`) comparten exactamente el mismo origen HTTPS (`https://tu-proyecto.vercel.app`), lo que garantiza que los datos de partidas, alias y récords fluyan y se sincronicen de manera unificada y persistente.

### D. Procedimiento Paso a Paso para el Usuario

1. **Subir el Repositorio a GitHub:**
   - Crear un repositorio nuevo en GitHub (público o privado) con el nombre `petpixel-arcade`.
   - Vincular el repositorio local y subir la rama `main`:
     ```bash
     git remote add origin https://github.com/juansebas-gif/petpixel-arcade.git
     git branch -M main
     git push -u origin main
     ```
2. **Conectar e Importar en Vercel:**
   - Iniciar sesión en [vercel.com](https://vercel.com) con la cuenta de GitHub.
   - Seleccionar **"Add New Project"** e importar el repositorio `petpixel-arcade`.
   - En **Framework Preset**, seleccionar **"Other"** (sitio estático estándar).
   - En **Root Directory**, mantener `./`.
   - Hacer clic en **"Deploy"**. Vercel detectará automáticamente `vercel.json` y publicará el sitio en menos de 1 minuto bajo una URL segura HTTPS.



