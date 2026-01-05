const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function coord(r, c) {
  return { r, c };
}

function coordKey(c) {
  return `${c.r},${c.c}`;
}

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

function dirsForPiece(v, { capture = false } = {}) {
  const king = isKing(v);
  const col = colorOf(v);
  if (!col) return [];
  if (king) return DIAGONALS;
  const forward = col === "red" ? -1 : 1;
  // Peones: solo hacia adelante tanto para mover como para capturar
  return [[forward, -1], [forward, 1]];
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

function capturedMeta(board, r, c) {
  const val = board[r][c];
  return {
    coord: coord(r, c),
    pieceType: isKing(val) ? "king" : "man",
    color: colorOf(val)
  };
}

function buildMove({ piece, path, captures }) {
  const last = path[path.length - 1];
  return {
    pieceFrom: path[0],
    pieceTo: last,
    path,
    captures,
    isCapture: captures.length > 0,
    promotes: !isKing(piece) && wouldPromote(piece, last.r)
  };
}

function generateManCaptureSequences(board, from) {
  const v = board[from.r][from.c];
  const col = colorOf(v);
  if (!col) return [];

  const results = [];
  const start = { r: from.r, c: from.c, board: cloneBoard(board), caps: [], path: [from] };

  function dfs(node) {
    let extended = false;
    for (const [dr, dc] of dirsForPiece(v, { capture: true })) {
      const midR = node.r + dr;
      const midC = node.c + dc;
      const landR = midR + dr;
      const landC = midC + dc;
      if (!inBounds(midR, midC) || !inBounds(landR, landC)) continue;
      const mid = node.board[midR][midC];
      if (mid === 0 || colorOf(mid) !== opponentColor(col)) continue;
      if (node.board[landR][landC] !== 0) continue;

      const promotesHere = wouldPromote(v, landR);
      const nb = cloneBoard(node.board);
      nb[node.r][node.c] = 0;
      nb[midR][midC] = 0;
      nb[landR][landC] = v;

      const nextNode = {
        r: landR,
        c: landC,
        board: nb,
        caps: node.caps.concat([capturedMeta(node.board, midR, midC)]),
        path: node.path.concat([coord(landR, landC)])
      };

      if (promotesHere) {
        results.push(buildMove({ piece: v, path: nextNode.path, captures: nextNode.caps }));
        extended = true;
        continue;
      }

      dfs(nextNode);
      extended = true;
    }

    if (!extended && node.caps.length > 0) {
      results.push(buildMove({ piece: v, path: node.path, captures: node.caps }));
    }
  }

  dfs(start);
  return results;
}

function generateKingCaptureSequences(board, from) {
  const v = board[from.r][from.c];
  const col = colorOf(v);
  if (!col || !isKing(v)) return [];

  const results = [];
  const start = { r: from.r, c: from.c, board: cloneBoard(board), caps: [], path: [from] };

  function dfs(node) {
    let extended = false;
    for (const [dr, dc] of dirsForPiece(v, { capture: true })) {
      let enemy = null;
      let step = 1;
      while (true) {
        const nr = node.r + dr * step;
        const nc = node.c + dc * step;
        if (!inBounds(nr, nc)) break;
        const cell = node.board[nr][nc];
        if (cell === 0) {
          if (enemy) {
            // aterrizaje detrás de la captura
            const nb = cloneBoard(node.board);
            nb[node.r][node.c] = 0;
            nb[enemy.r][enemy.c] = 0;
            nb[nr][nc] = v;
            dfs({
              r: nr,
              c: nc,
              board: nb,
              caps: node.caps.concat([capturedMeta(node.board, enemy.r, enemy.c)]),
              path: node.path.concat([coord(nr, nc)])
            });
            extended = true;
          }
          step += 1;
          continue;
        }

        const cellColor = colorOf(cell);
        if (cellColor === col) break; // bloqueado
        if (cellColor === opponentColor(col)) {
          if (enemy) break; // dos piezas en la misma diagonal -> no se puede
          enemy = { r: nr, c: nc };
          step += 1;
          continue;
        }
      }
    }

    if (!extended && node.caps.length > 0) {
      results.push(buildMove({ piece: v, path: node.path, captures: node.caps }));
    }
  }

  dfs(start);
  return results;
}

function generateAllCaptures(board, color) {
  const captures = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      if (v === 0 || colorOf(v) !== color) continue;
      const from = coord(r, c);
      if (isKing(v)) {
        captures.push(...generateKingCaptureSequences(board, from));
      } else {
        captures.push(...generateManCaptureSequences(board, from));
      }
    }
  }
  return captures;
}

function generateNormalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      if (v === 0 || colorOf(v) !== color) continue;
      const from = coord(r, c);
      if (isKing(v)) {
        for (const [dr, dc] of dirsForPiece(v)) {
          for (let step = 1; step < 8; step++) {
            const tr = r + dr * step;
            const tc = c + dc * step;
            if (!inBounds(tr, tc)) break;
            if (board[tr][tc] !== 0) break;
            const path = [from, coord(tr, tc)];
            moves.push(buildMove({ piece: v, path, captures: [] }));
          }
        }
      } else {
        for (const [dr, dc] of dirsForPiece(v)) {
          const tr = r + dr;
          const tc = c + dc;
          if (!inBounds(tr, tc)) continue;
          if (board[tr][tc] !== 0) continue;
          const path = [from, coord(tr, tc)];
          moves.push(buildMove({ piece: v, path, captures: [] }));
        }
      }
    }
  }
  return moves;
}

function filterByQuantityAndQuality(captures) {
  if (captures.length === 0) return [];
  const maxCaptured = Math.max(...captures.map(m => m.captures.length));
  const withMax = captures.filter(m => m.captures.length === maxCaptured);
  const maxKings = Math.max(...withMax.map(m => m.captures.filter(c => c.pieceType === "king").length));
  return withMax.filter(m => m.captures.filter(c => c.pieceType === "king").length === maxKings);
}

function dedupeCaptureSources(captures) {
  const seen = new Set();
  const pieces = [];
  for (const mv of captures) {
    const key = coordKey(mv.pieceFrom);
    if (seen.has(key)) continue;
    seen.add(key);
    pieces.push(mv.pieceFrom);
  }
  return pieces;
}

function getPiecesThatCanCapture(board, color) {
  const captures = generateAllCaptures(board, color);
  return dedupeCaptureSources(captures);
}

function computeMoves(board, turnColor) {
  const allCaptures = generateAllCaptures(board, turnColor);
  const piecesWithCapture = dedupeCaptureSources(allCaptures);
  const filteredCaptures = filterByQuantityAndQuality(allCaptures);
  const forced = allCaptures.length > 0;
  const normals = generateNormalMoves(board, turnColor);
  const moves = allCaptures.concat(normals);
  return { forced, moves, captures: filteredCaptures, normals, allCaptures, piecesWithCapture };
}

function applyMove(board, move) {
  const b = cloneBoard(board);
  const { pieceFrom, pieceTo, captures, promotes } = move;
  let piece = b[pieceFrom.r][pieceFrom.c];
  b[pieceFrom.r][pieceFrom.c] = 0;

  for (const cap of captures) {
    b[cap.coord.r][cap.coord.c] = 0;
  }

  if (promotes || wouldPromote(piece, pieceTo.r)) {
    piece = promoteIfNeeded(piece);
  }
  b[pieceTo.r][pieceTo.c] = piece;
  return b;
}

function serializeMoveMap(moves) {
  const map = {};
  for (const m of moves) {
    const k = coordKey(m.pieceFrom);
    if (!map[k]) map[k] = [];
    map[k].push(m);
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

function moveSignature(move) {
  const pathSig = move.path.map(p => `${p.r},${p.c}`).join("|");
  const capsSig = move.captures.map(c => `${c.coord.r},${c.coord.c},${c.pieceType},${c.color}`).join("|");
  return `${pathSig}#${capsSig}`;
}

module.exports = {
  initialBoard,
  computeMoves,
  applyMove,
  serializeMoveMap,
  hasAnyPieces,
  colorOf,
  coord,
  coordKey,
  moveSignature,
  generateKingCaptureSequences,
  generateManCaptureSequences,
  getPiecesThatCanCapture
};
