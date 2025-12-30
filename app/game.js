function cloneBoard(board) {
  return board.map(row => row.slice());
}

function initialBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(0));
  // black (-1) arriba, red (+1) abajo, en casillas oscuras
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = -1;
  }
  for (let r = 5; r < 8; r++) {
    for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) b[r][c] = 1;
  }
  return b;
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isKing(v) { return Math.abs(v) === 2; }
function colorOf(v) { return v > 0 ? "red" : (v < 0 ? "black" : null); }

function dirsForPiece(v, mode) {
  const king = isKing(v);
  const col = colorOf(v);
  if (!col) return [];
  // siempre direcciones unitarias; la distancia se calcula en el consumidor
  if (king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
  return col === "red" ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
}

function opponentColor(col) { return col === "red" ? "black" : "red"; }

function wouldPromote(v, r) {
  const col = colorOf(v);
  if (col === "red") return r === 0 && Math.abs(v) === 1;
  if (col === "black") return r === 7 && Math.abs(v) === 1;
  return false;
}

function promoteIfNeeded(v) {
  return (Math.abs(v) === 1) ? (v > 0 ? 2 : -2) : v;
}

function computeCapturesFrom(board, fromR, fromC) {
  const v = board[fromR][fromC];
  const col = colorOf(v);
  if (!col) return [];

  // Reyes voladores: pueden capturar a distancia
  if (isKing(v)) {
    const results = [];
    const start = { r: fromR, c: fromC, board: cloneBoard(board), path: [[fromR, fromC]], caps: [] };

    function dfs(node) {
      const piece = node.board[node.r][node.c];
      let extended = false;

      for (const [dr, dc] of dirsForPiece(piece)) {
        let enemyR = null;
        let enemyC = null;
        for (let step = 1; step < 8; step++) {
          const nr = node.r + dr * step;
          const nc = node.c + dc * step;
          if (!inBounds(nr, nc)) break;
          const cell = node.board[nr][nc];
          if (cell === 0) {
            if (enemyR !== null) {
              // aterrizajes posibles después de un enemigo
              const nb = cloneBoard(node.board);
              nb[node.r][node.c] = 0;
              nb[enemyR][enemyC] = 0;
              nb[nr][nc] = piece;
              dfs({
                r: nr,
                c: nc,
                board: nb,
                path: node.path.concat([[nr, nc]]),
                caps: node.caps.concat([[enemyR, enemyC]])
              });
              extended = true;
            }
            continue;
          }

          // pieza encontrada
          const cellColor = colorOf(cell);
          if (cellColor === col) break; // bloqueado por propia
          if (cellColor === opponentColor(col)) {
            if (enemyR !== null) break; // ya había una en esta diagonal
            enemyR = nr;
            enemyC = nc;
            continue;
          }
        }
      }

      if (!extended && node.caps.length > 0) {
        results.push({ from: [fromR, fromC], path: node.path, captures: node.caps });
      }
    }

    dfs(start);
    return results;
  }

  const results = [];
  const start = { r: fromR, c: fromC, board: cloneBoard(board), path: [[fromR, fromC]], caps: [] };

  function dfs(node) {
    const piece = node.board[node.r][node.c];
    const canCrownNow = wouldPromote(piece, node.r);

    // Regla American/English: si llegas a la fila de coronación, coronas al FINAL y no sigues capturando en ese turno.
    if (canCrownNow && node.path.length > 1) {
      results.push({ from: [fromR, fromC], path: node.path, captures: node.caps });
      return;
    }

    const dirs = dirsForPiece(piece);
    let extended = false;

    for (const [dr, dc] of dirs) {
      // dr/dc are unit steps; land two steps away when jumping
      const enemyR = node.r + dr;
      const enemyC = node.c + dc;
      const landingR = enemyR + dr;
      const landingC = enemyC + dc;
      if (!inBounds(landingR, landingC) || !inBounds(enemyR, enemyC)) continue;
      const mid = node.board[enemyR][enemyC];
      if (mid === 0) continue;
      if (colorOf(mid) !== opponentColor(colorOf(piece))) continue;
      if (node.board[landingR][landingC] !== 0) continue;

      // aplicar salto
      const nb = cloneBoard(node.board);
      nb[node.r][node.c] = 0;
      nb[enemyR][enemyC] = 0;
      nb[landingR][landingC] = piece;

      dfs({
        r: landingR,
        c: landingC,
        board: nb,
        path: node.path.concat([[landingR, landingC]]),
        caps: node.caps.concat([[enemyR, enemyC]])
      });

      extended = true;
    }

    if (!extended && node.path.length > 1) {
      results.push({ from: [fromR, fromC], path: node.path, captures: node.caps });
    }
  }

  dfs(start);
  return results;
}

function computeMoves(board, turnColor) {
  // 1) capturas obligatorias
  const captures = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      if (colorOf(v) !== turnColor) continue;
      captures.push(...computeCapturesFrom(board, r, c));
    }
  }
  if (captures.length > 0) return { forced: true, moves: captures };

  // 2) movimientos normales
  const normals = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      if (colorOf(v) !== turnColor) continue;
      if (isKing(v)) {
        for (const [dr, dc] of dirsForPiece(v)) {
          for (let step = 1; step < 8; step++) {
            const tr = r + dr * step, tc = c + dc * step;
            if (!inBounds(tr, tc)) break;
            if (board[tr][tc] !== 0) break;
            normals.push({ from: [r, c], path: [[r, c], [tr, tc]], captures: [] });
          }
        }
      } else {
        for (const [dr, dc] of dirsForPiece(v)) {
          const tr = r + dr, tc = c + dc;
          if (!inBounds(tr, tc)) continue;
          if (board[tr][tc] !== 0) continue;
          normals.push({ from: [r, c], path: [[r, c], [tr, tc]], captures: [] });
        }
      }
    }
  }
  return { forced: false, moves: normals };
}

function applyMove(board, move) {
  const b = cloneBoard(board);
  const [sr, sc] = move.path[0];
  let piece = b[sr][sc];
  b[sr][sc] = 0;

  for (let i = 1; i < move.path.length; i++) {
    const [pr, pc] = move.path[i - 1];
    const [nr, nc] = move.path[i];
    const dr = Math.sign(nr - pr);
    const dc = Math.sign(nc - pc);
    // eliminar cualquier pieza en el camino diagonal (en un movimiento legal solo habrá oponentes)
    let cr = pr + dr, cc = pc + dc;
    while (cr !== nr || cc !== nc) {
      if (b[cr][cc] !== 0) b[cr][cc] = 0;
      cr += dr;
      cc += dc;
    }
  }

  const [er, ec] = move.path[move.path.length - 1];
  if (wouldPromote(piece, er)) piece = promoteIfNeeded(piece);
  b[er][ec] = piece;

  return b;
}

function serializeMoveMap(moves) {
  const map = {};
  for (const m of moves) {
    const k = `${m.from[0]},${m.from[1]}`;
    if (!map[k]) map[k] = [];
    map[k].push(m.path);
  }
  return map;
}

function hasAnyPieces(board, col) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const v = board[r][c];
    if (v !== 0 && colorOf(v) === col) return true;
  }
  return false;
}

module.exports = {
  initialBoard,
  computeMoves,
  applyMove,
  serializeMoveMap,
  hasAnyPieces,
  colorOf
};
