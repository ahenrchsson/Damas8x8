# Damas 8x8 – Lobby PvP con ranking

Juego de damas con experiencia multijugador estilo lobby, salas PvP/observadores, chats separados y controles de partida.

## Variables de entorno
Configura un archivo `.env` (o variables del sistema) con:

```
PUBLIC_BASE_URL=http://127.0.0.1:<puerto>
POSTGRES_PASSWORD=<contraseña_segura>
SESSION_SECRET=<secreto_de_sesión>
TRUST_PROXY=true
APP_PORT=<puerto_expuesto>
```

## Puesta en marcha

```bash
docker compose up --build
```

- App disponible en `http://localhost:${APP_PORT}`.
- Se crea la base de datos y tablas de usuarios, partidas y rating automáticamente.

## Flujo y UI
- **Lobby en tiempo real**: listado de salas con estado (esperando / en juego / finalizada), contador de observadores y acciones Unirse / Observar.
- **Chats**: chat global (lobby/observadores) y chat interno de partida solo para jugadores activos.
- **Controles de partida**: solicitud de tablas, rendición, estado de turno/obligatorias y aviso de “soplar ficha”.
- **Re-conexión**: si la sesión tiene partida activa, el frontend ofrece reanudarla tras un refresh.
- **Ranking**: disponible en un drawer mediante el botón “Ranking Global”.

## Endpoints REST
- `POST /api/auth/register` — registro (username/password).
- `POST /api/auth/login` — login.
- `POST /api/auth/logout` — logout.
- `GET /api/me` — sesión actual y Elo.
- `GET /api/leaderboard` — top 50 Elo.

## Eventos Socket.io
- Lobby/estado: `listRooms`, `lobbyRooms` (emitido por server), `observeRoom`, `newRoom { mode, name }`, `joinRoom { code }`.
- Sesión y reconexión: `setUser`, `resumePrompt`, `rejoinRoom { code }`, `declineResume { code }`.
- Juego: `state`, `move { code, move }`, `gameOver`, `blowOffered`, `blowPiece`, `requestDraw`, `respondDraw { accept }`, `resign`.
- Chats: `globalMessage { text }`, `globalChat`, `globalChatHistory`, `chatMessage { code, text }` (solo jugadores).
  - El payload `move` incluye la ruta completa (`path`) y la lista ordenada de capturas (`captures`) generadas por el motor; el servidor valida que la secuencia enviada exista dentro de las jugadas legales calculadas para el turno.

## Reglas implementadas
- **Soplar ficha**: si un jugador omite una captura obligatoria, el rival recibe la opción inmediata de eliminar esa ficha.
- **Tablas**: solicitud con respuesta de rival; si acepta, la partida finaliza en empate y ambos vuelven al lobby.
- **Rendición**: confirmación y victoria automática del rival.
- **Capturas obligatorias y coronación**: soportadas por la lógica de movimientos del backend.
- **Previsualización de rutas**: el tablero resalta saltos y capturas numeradas y permite elegir o modificar rutas completas (incluyendo alternativas hacia un mismo destino) antes de confirmar el movimiento.

## Notas
- El estado de salas, chats y partidas se mantiene en el backend mientras el proceso está vivo. La sesión HTTP vincula automáticamente al usuario a su sala activa para reanudar tras un refresh.
