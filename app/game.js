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
  if (mode === "step") {
    if (king) return [[-1,-1],[-1,1],[1,-1],[1,1]];
    return col === "red" ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
  }
  // capture
  if (king) return [[-2,-2],[-2,2],[2,-2],[2,2]];
  return col === "red" ? [[-2,-2],[-2,2]] : [[2,-2],[2,2]];
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

    const dirs = dirsForPiece(piece, "cap");
    let extended = false;

    for (const [dr, dc] of dirs) {
      const mr = node.r + dr / 2;
      const mc = node.c + dc / 2;
      const tr = node.r + dr;
      const tc = node.c + dc;
      if (!inBounds(tr, tc) || !inBounds(mr, mc)) continue;
      const mid = node.board[mr][mc];
      if (mid === 0) continue;
      if (colorOf(mid) !== opponentColor(colorOf(piece))) continue;
      if (node.board[tr][tc] !== 0) continue;

      // aplicar salto
      const nb = cloneBoard(node.board);
      nb[node.r][node.c] = 0;
      nb[mr][mc] = 0;
      nb[tr][tc] = piece;

      dfs({
        r: tr,
        c: tc,
        board: nb,
        path: node.path.concat([[tr, tc]]),
        caps: node.caps.concat([[mr, mc]])
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
      for (const [dr, dc] of dirsForPiece(v, "step")) {
        const tr = r + dr, tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        if (board[tr][tc] !== 0) continue;
        normals.push({ from: [r, c], path: [[r, c], [tr, tc]], captures: [] });
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
    // si es salto, borrar la pieza capturada
    if (Math.abs(nr - pr) === 2 && Math.abs(nc - pc) === 2) {
      const mr = (nr + pr) / 2;
      const mc = (nc + pc) / 2;
      b[mr][mc] = 0;
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
