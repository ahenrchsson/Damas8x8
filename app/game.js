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
      const landingSquares = [];
      while (true) {
        const nr = node.r + dr * step;
        const nc = node.c + dc * step;
        if (!inBounds(nr, nc)) break;
        const cell = node.board[nr][nc];
        if (cell === 0) {
          if (enemy) landingSquares.push({ r: nr, c: nc });
          step += 1;
          continue;
        }

        const cellColor = colorOf(cell);
        if (cellColor === col) break; // bloqueado por pieza propia
        if (cellColor === opponentColor(col)) {
          if (enemy) break; // dos piezas en la misma diagonal -> captura inválida
          enemy = { r: nr, c: nc };
          step += 1;
          continue;
        }
      }

      // Debe existir al menos una casilla vacía detrás de la pieza enemiga
      for (const landing of landingSquares) {
        const nb = cloneBoard(node.board);
        nb[node.r][node.c] = 0;
        nb[enemy.r][enemy.c] = 0;
        nb[landing.r][landing.c] = v;
        dfs({
          r: landing.r,
          c: landing.c,
          board: nb,
          caps: node.caps.concat([capturedMeta(node.board, enemy.r, enemy.c)]),
          path: node.path.concat([coord(landing.r, landing.c)])
        });
        extended = true;
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

const AI_DIFFICULTY_CONFIG = {
  easy: {
    maxDepth: 3,
    timeLimitMs: 120,
    useIterativeDeepening: false,
    useTransposition: false,
    useQuiescence: false,
    randomness: 0.6,
    blunderChance: 0.25
  },
  medium: {
    maxDepth: 5,
    timeLimitMs: 250,
    useIterativeDeepening: false,
    useTransposition: false,
    useQuiescence: true,
    randomness: 0.2,
    blunderChance: 0.1
  },
  hard: {
    maxDepth: 8,
    timeLimitMs: 700,
    useIterativeDeepening: true,
    useTransposition: true,
    useQuiescence: true,
    randomness: 0,
    blunderChance: 0
  },
  extreme: {
    maxDepth: 11,
    timeLimitMs: 1200,
    useIterativeDeepening: true,
    useTransposition: true,
    useQuiescence: true,
    randomness: 0,
    blunderChance: 0
  }
};

const EVAL_WEIGHTS = {
  man: 100,
  king: 360,
  center: 12,
  advance: 6,
  backRank: 8,
  mobility: 4,
  connected: 6,
  blocked: -10,
  captureThreat: -15,
  promotionThreat: 22,
  kingAdvantage: 30
};

const WIN_SCORE = 50_000;
const QUIESCENCE_MAX_DEPTH = 6;

function createSeededRng(seed = 123456789) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function resolveAIDifficulty(difficulty, overrides = {}) {
  const base = AI_DIFFICULTY_CONFIG[difficulty] || AI_DIFFICULTY_CONFIG.easy;
  return { ...base, ...overrides };
}

function createZobrist() {
  const pieceKeys = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => Array(4).fill(0n))
  );
  let seed = 0x9e3779b9n;
  const nextRand = () => {
    seed ^= seed << 13n;
    seed ^= seed >> 7n;
    seed ^= seed << 17n;
    return seed & ((1n << 53n) - 1n);
  };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      for (let i = 0; i < 4; i++) {
        pieceKeys[r][c][i] = nextRand();
      }
    }
  }
  const turnKey = nextRand();
  return {
    pieceKeys,
    turnKey,
    hash(board, turnColor) {
      let h = 0n;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const v = board[r][c];
          if (v === 0) continue;
          let idx = 0;
          if (v === 1) idx = 0;
          if (v === 2) idx = 1;
          if (v === -1) idx = 2;
          if (v === -2) idx = 3;
          h ^= pieceKeys[r][c][idx];
        }
      }
      if (turnColor === "black") h ^= turnKey;
      return h;
    }
  };
}

function evaluateBoard(board, perspectiveColor) {
  let score = 0;
  let myMen = 0;
  let oppMen = 0;
  let myKings = 0;
  let oppKings = 0;
  let myConnected = 0;
  let oppConnected = 0;
  let myBlocked = 0;
  let oppBlocked = 0;
  let myAdvance = 0;
  let oppAdvance = 0;
  let myCenter = 0;
  let oppCenter = 0;
  let myBackRank = 0;
  let oppBackRank = 0;
  let myPromotionThreat = 0;
  let oppPromotionThreat = 0;

  const centerSquares = new Set([
    "2,3", "2,5", "3,2", "3,4", "4,3", "4,5", "5,2", "5,4"
  ]);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      if (v === 0) continue;
      const col = colorOf(v);
      const isMine = col === perspectiveColor;
      const king = isKing(v);
      const material = king ? EVAL_WEIGHTS.king : EVAL_WEIGHTS.man;
      score += isMine ? material : -material;

      if (isMine) {
        if (king) myKings += 1; else myMen += 1;
      } else {
        if (king) oppKings += 1; else oppMen += 1;
      }

      const centerKey = `${r},${c}`;
      if (centerSquares.has(centerKey)) {
        if (isMine) myCenter += 1; else oppCenter += 1;
      }

      if (!king) {
        const advance = col === "red" ? 7 - r : r;
        if (isMine) myAdvance += advance; else oppAdvance += advance;
        if ((col === "red" && r === 7) || (col === "black" && r === 0)) {
          if (isMine) myBackRank += 1; else oppBackRank += 1;
        }
        if ((col === "red" && r <= 2) || (col === "black" && r >= 5)) {
          if (isMine) myPromotionThreat += 1; else oppPromotionThreat += 1;
        }

        const forward = col === "red" ? -1 : 1;
        let hasMove = false;
        for (const dc of [-1, 1]) {
          const tr = r + forward;
          const tc = c + dc;
          if (inBounds(tr, tc) && board[tr][tc] === 0) {
            hasMove = true;
            break;
          }
          const jumpR = r + forward * 2;
          const jumpC = c + dc * 2;
          if (inBounds(jumpR, jumpC) && inBounds(tr, tc)) {
            const mid = board[tr][tc];
            if (mid !== 0 && colorOf(mid) === opponentColor(col) && board[jumpR][jumpC] === 0) {
              hasMove = true;
              break;
            }
          }
        }
        if (!hasMove) {
          if (isMine) myBlocked += 1; else oppBlocked += 1;
        }
      }

      for (const [dr, dc] of DIAGONALS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const neighbor = board[nr][nc];
        if (neighbor !== 0 && colorOf(neighbor) === col) {
          if (isMine) myConnected += 1; else oppConnected += 1;
        }
      }
    }
  }

  score += (myKings - oppKings) * EVAL_WEIGHTS.kingAdvantage;
  score += (myCenter - oppCenter) * EVAL_WEIGHTS.center;
  score += (myAdvance - oppAdvance) * EVAL_WEIGHTS.advance;
  score += (myBackRank - oppBackRank) * EVAL_WEIGHTS.backRank;
  score += (myConnected - oppConnected) * EVAL_WEIGHTS.connected;
  score += (myBlocked - oppBlocked) * EVAL_WEIGHTS.blocked;
  score += (myPromotionThreat - oppPromotionThreat) * EVAL_WEIGHTS.promotionThreat;

  const myMoves = computeMoves(board, perspectiveColor);
  const oppMoves = computeMoves(board, opponentColor(perspectiveColor));
  score += (myMoves.moves.length - oppMoves.moves.length) * EVAL_WEIGHTS.mobility;
  if (myMoves.moves.length === 0) score -= WIN_SCORE / 2;
  if (oppMoves.moves.length === 0) score += WIN_SCORE / 2;
  if ((oppMoves.allCaptures || []).length > 0) {
    score += EVAL_WEIGHTS.captureThreat * (oppMoves.allCaptures.length);
  }

  const totalPieces = myMen + myKings + oppMen + oppKings;
  if (totalPieces <= 8) {
    score += (myKings - oppKings) * 40;
    score += (myPromotionThreat - oppPromotionThreat) * 18;
  }

  return score;
}

function moveOrderingScore(move, state, depth, transpositionBest) {
  let score = 0;
  if (transpositionBest && moveSignature(move) === transpositionBest) score += 10000;
  if (move.isCapture) {
    score += 4000 + move.captures.length * 300;
    score += move.captures.filter((c) => c.pieceType === "king").length * 250;
  }
  if (move.promotes) score += 1800;
  const killer = state.killerMoves.get(depth) || [];
  if (killer.some((sig) => sig === moveSignature(move))) score += 900;
  const historyScore = state.historyHeuristic.get(moveSignature(move)) || 0;
  score += historyScore;
  return score;
}

function orderMoves(moves, state, depth, transpositionBest) {
  return moves
    .map((m) => ({ m, s: moveOrderingScore(m, state, depth, transpositionBest) }))
    .sort((a, b) => b.s - a.s)
    .map((entry) => entry.m);
}

function createSearchState(config, rng) {
  return {
    config,
    rng,
    zobrist: createZobrist(),
    transposition: new Map(),
    killerMoves: new Map(),
    historyHeuristic: new Map(),
    start: Date.now(),
    deadline: config.timeLimitMs ? Date.now() + config.timeLimitMs : Infinity,
    aborted: false
  };
}

function recordKillerMove(state, depth, move) {
  const sig = moveSignature(move);
  const list = state.killerMoves.get(depth) || [];
  if (!list.includes(sig)) {
    list.unshift(sig);
    state.killerMoves.set(depth, list.slice(0, 2));
  }
}

function recordHistory(state, move, depth) {
  const sig = moveSignature(move);
  const current = state.historyHeuristic.get(sig) || 0;
  state.historyHeuristic.set(sig, current + depth * depth);
}

function timeRemaining(state) {
  return Date.now() <= state.deadline;
}

function ensureTime(state) {
  if (!timeRemaining(state)) {
    state.aborted = true;
    throw new Error("timeout");
  }
}

function getTransposition(state, hash) {
  if (!state.config.useTransposition) return null;
  return state.transposition.get(hash) || null;
}

function storeTransposition(state, hash, entry) {
  if (!state.config.useTransposition) return;
  state.transposition.set(hash, entry);
}

function quiescenceSearch(board, color, alpha, beta, state, depthRemaining) {
  ensureTime(state);
  const standPat = evaluateBoard(board, color);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (depthRemaining <= 0) return standPat;

  const generated = computeMoves(board, color);
  const captures = generated.allCaptures || [];
  if (!captures.length) return standPat;
  const ordered = orderMoves(captures, state, depthRemaining, null);

  for (const move of ordered) {
    const nextBoard = applyMove(board, move);
    const score = -quiescenceSearch(nextBoard, opponentColor(color), -beta, -alpha, state, depthRemaining - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(board, color, depth, alpha, beta, state) {
  ensureTime(state);
  const hash = state.zobrist.hash(board, color);
  const cached = getTransposition(state, hash);
  if (cached && cached.depth >= depth) {
    if (cached.flag === "EXACT") return cached.score;
    if (cached.flag === "LOWER" && cached.score > alpha) alpha = cached.score;
    if (cached.flag === "UPPER" && cached.score < beta) beta = cached.score;
    if (alpha >= beta) return cached.score;
  }

  const generated = computeMoves(board, color);
  const legalMoves = generated.moves || [];
  if (legalMoves.length === 0) {
    return -WIN_SCORE + depth;
  }

  if (depth === 0) {
    if (state.config.useQuiescence && (generated.allCaptures || []).length > 0) {
      return quiescenceSearch(board, color, alpha, beta, state, QUIESCENCE_MAX_DEPTH);
    }
    return evaluateBoard(board, color);
  }

  const bestFromCache = cached?.bestMove || null;
  const ordered = orderMoves(legalMoves, state, depth, bestFromCache);
  let bestScore = -Infinity;
  let bestMove = ordered[0];
  const originalAlpha = alpha;

  for (const move of ordered) {
    const nextBoard = applyMove(board, move);
    const score = -negamax(nextBoard, opponentColor(color), depth - 1, -beta, -alpha, state);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      recordKillerMove(state, depth, move);
      recordHistory(state, move, depth);
      break;
    }
  }

  let flag = "EXACT";
  if (bestScore <= originalAlpha) flag = "UPPER";
  else if (bestScore >= beta) flag = "LOWER";
  storeTransposition(state, hash, { depth, score: bestScore, flag, bestMove: moveSignature(bestMove) });
  return bestScore;
}

function pickFromTopMoves(candidates, count, rng) {
  if (candidates.length <= 1) return candidates[0];
  const limit = Math.min(count, candidates.length);
  const idx = Math.floor(rng() * limit);
  return candidates[idx];
}

function selectAIMove(board, color, config, rng) {
  const state = createSearchState(config, rng);
  const generated = computeMoves(board, color);
  const legalMoves = generated.moves || [];
  if (!legalMoves.length) return { move: null, generated, legalMoves };

  const evaluateMove = (move, depth) => {
    const nextBoard = applyMove(board, move);
    return -negamax(nextBoard, opponentColor(color), depth - 1, -Infinity, Infinity, state);
  };

  const scoredMoves = [];
  if (config.useIterativeDeepening) {
    let bestMove = legalMoves[0];
    for (let depth = 1; depth <= config.maxDepth; depth++) {
      if (!timeRemaining(state)) break;
      let localBest = null;
      let localScore = -Infinity;
      const ordered = orderMoves(legalMoves, state, depth, null);
      try {
        for (const move of ordered) {
          const score = evaluateMove(move, depth);
          if (score > localScore) {
            localScore = score;
            localBest = move;
          }
        }
        if (!state.aborted && localBest) {
          bestMove = localBest;
        } else {
          break;
        }
      } catch (err) {
        if (err.message !== "timeout") throw err;
        break;
      }
    }
    return { move: bestMove, generated, legalMoves };
  }

  const depth = Math.max(1, config.maxDepth);
  for (const move of orderMoves(legalMoves, state, depth, null)) {
    try {
      const score = evaluateMove(move, depth);
      scoredMoves.push({ move, score });
    } catch (err) {
      if (err.message !== "timeout") throw err;
      break;
    }
  }
  if (scoredMoves.length === 0) {
    return { move: legalMoves[0], generated, legalMoves };
  }
  scoredMoves.sort((a, b) => b.score - a.score);
  if (config.blunderChance && rng() < config.blunderChance && scoredMoves.length > 1) {
    return { move: scoredMoves[1].move, generated, legalMoves };
  }
  if (config.randomness > 0 && scoredMoves.length > 1) {
    const topCount = Math.max(2, Math.ceil(scoredMoves.length * config.randomness));
    return { move: pickFromTopMoves(scoredMoves.map((s) => s.move), topCount, rng), generated, legalMoves };
  }
  return { move: scoredMoves[0].move, generated, legalMoves };
}

function pickLegalAIMove(board, color, options = {}) {
  const difficulty = options.difficulty || "easy";
  const rng = options.rng || Math.random;
  const config = resolveAIDifficulty(difficulty, {
    timeLimitMs: options.timeLimitMs ?? AI_DIFFICULTY_CONFIG[difficulty]?.timeLimitMs
  });

  const result = selectAIMove(board, color, config, rng);
  if (!result.move) return result;

  const legalMoves = result.legalMoves || [];
  const match = legalMoves.find((m) => moveSignature(m) === moveSignature(result.move));
  if (!match) {
    const fallback = legalMoves[0] || null;
    return { ...result, move: fallback };
  }
  return { ...result, move: match };
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
  getPiecesThatCanCapture,
  pickLegalAIMove
};
