const assert = require("assert");
const {
  computeMoves,
  getPiecesThatCanCapture,
  pickLegalAIMove,
  moveSignature
} = require("../game");

function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(0));
}

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

test("enforces capture obligation and Ley de Calidad", () => {
  const b = emptyBoard();
  // Dos capturas posibles (una a dama), ambas de igual cantidad -> gana calidad
  b[5][2] = 1; // rojo
  b[4][3] = -1; // peón negro
  b[5][6] = 1; // rojo
  b[4][5] = -2; // dama negra

  const res = computeMoves(b, "red");
  assert.strictEqual(res.forced, true);
  assert.strictEqual(res.captures.length, 1, "solo la captura óptima se marca como recomendada");
  const chosen = res.captures[0];
  assert.ok(chosen.isCapture);
  assert.strictEqual(chosen.captures.length, 1);
  assert.strictEqual(chosen.captures[0].pieceType, "king");
  assert.ok(res.moves.some((m) => !m.isCapture), "debe permitir movimientos simples para habilitar soplar");
});

test("detects every piece that can capture", () => {
  const b = emptyBoard();
  b[5][0] = 1; // rojo con captura
  b[4][1] = -1;
  b[2][4] = 1; // segundo rojo con captura
  b[1][5] = -1;

  const pieces = getPiecesThatCanCapture(b, "red");
  const sigs = pieces.map((p) => `${p.r},${p.c}`);
  assert.strictEqual(pieces.length, 2);
  assert.ok(sigs.includes("5,0"));
  assert.ok(sigs.includes("2,4"));

  const res = computeMoves(b, "red");
  const resSigs = res.piecesWithCapture.map((p) => `${p.r},${p.c}`);
  assert.deepStrictEqual(new Set(resSigs).size, 2);
  assert.ok(resSigs.includes("5,0"));
  assert.ok(resSigs.includes("2,4"));
});

test("flying kings chain captures with variable landings", () => {
  const b = emptyBoard();
  b[6][0] = 2; // rey rojo
  b[4][2] = -1; // negro
  b[2][4] = -1; // negro

  const res = computeMoves(b, "red");
  const captureRoutes = res.moves.filter((m) => m.isCapture);
  assert.strictEqual(res.forced, true);
  assert.strictEqual(captureRoutes.length, 2, "debe haber dos aterrizajes posibles tras la última captura");
  captureRoutes.forEach((mv) => {
    assert.strictEqual(mv.captures.length, 2);
    assert.deepStrictEqual(mv.captures.map((c) => c.coord), [{ r: 4, c: 2 }, { r: 2, c: 4 }]);
    assert.strictEqual(mv.path.length, 3);
  });
});

test("keeps alternative routes that share a destination", () => {
  const b = emptyBoard();
  b[6][0] = 2; // rey rojo
  b[4][2] = -1; // primer salto
  b[1][5] = -1; // segundo salto alcanzable desde dos rutas

  const res = computeMoves(b, "red");
  const captureRoutes = res.moves.filter((m) => m.isCapture);
  assert.strictEqual(captureRoutes.length, 2, "debe exponer ambas rutas");
  const destinations = captureRoutes.map((m) => `${m.pieceTo.r},${m.pieceTo.c}`);
  assert.strictEqual(new Set(destinations).size, 1, "ambas rutas comparten destino final");
  const prefixes = captureRoutes.map((m) => m.path.map((p) => `${p.r},${p.c}`).join("|"));
  assert.notStrictEqual(prefixes[0], prefixes[1], "las rutas deben diferir en su secuencia");
});

test("red man cannot capture backwards", () => {
  const b = emptyBoard();
  b[3][2] = 1; // peón rojo
  b[4][3] = -1; // solo captura hacia atrás disponible

  const res = computeMoves(b, "red");
  assert.strictEqual(res.forced, false, "no debe forzar captura hacia atrás");
  assert.strictEqual(res.captures.length, 0);
  assert.ok(res.moves.every((m) => !m.isCapture), "ningún movimiento debe ser captura");
});

test("black man cannot capture backwards", () => {
  const b = emptyBoard();
  b[4][3] = -1; // peón negro
  b[3][2] = 1; // pieza roja detrás (captura ilegal)

  const res = computeMoves(b, "black");
  assert.strictEqual(res.forced, false);
  assert.strictEqual(res.captures.length, 0);
  assert.ok(res.moves.every((m) => !m.isCapture));
});

test("kings can capture backwards", () => {
  const b = emptyBoard();
  b[3][2] = 2; // rey rojo
  b[4][3] = -1; // pieza negra detrás

  const res = computeMoves(b, "red");
  assert.strictEqual(res.forced, true);
  const captureRoutes = res.moves.filter((m) => m.isCapture);
  assert.ok(captureRoutes.length > 0 && captureRoutes.every((m) => m.isCapture));
  const destinations = captureRoutes.map((m) => `${m.pieceTo.r},${m.pieceTo.c}`);
  assert.ok(destinations.includes("5,4"), "debe poder capturar hacia atrás y aterrizar detrás de la pieza");
});

test("promotion ends man capture sequence", () => {
  const b = emptyBoard();
  b[5][2] = -1; // peón negro
  b[6][3] = 1; // primera captura
  b[6][5] = 1; // quedaría disponible si pudiera seguir como dama

  const res = computeMoves(b, "black");
  assert.strictEqual(res.forced, true);
  const captureRoutes = res.moves.filter((m) => m.isCapture);
  assert.strictEqual(captureRoutes.length, 1, "solo debe haber una jugada de captura");
  const mv = captureRoutes[0];
  assert.ok(mv.promotes, "el peón debe coronarse");
  assert.strictEqual(mv.captures.length, 1, "la secuencia termina al coronar");
  assert.strictEqual(mv.path.length, 2, "no debe encadenar capturas post-coronación");
});

test("kings are considered for capture preference", () => {
  const b = emptyBoard();
  b[6][0] = 2; // dama roja
  b[5][1] = -1; // peón negro
  b[2][4] = -1; // segundo negro en la misma diagonal

  const res = computeMoves(b, "red");
  assert.ok(res.forced, true);
  assert.ok(res.piecesWithCapture.some((p) => p.r === 6 && p.c === 0), "la dama debe contarse como pieza capturadora");
  const recommended = res.captures || [];
  assert.ok(recommended.length > 0, "debe haber capturas recomendadas");
  assert.ok(recommended.every((m) => m.captures.length >= 1), "las rutas recomendadas de dama son capturas");
});

test("king capture is invalid without landing square", () => {
  const b = emptyBoard();
  b[2][1] = 2; // dama roja
  b[1][0] = -1; // pieza negra en el borde, sin casilla para caer

  const res = computeMoves(b, "red");
  const captures = res.moves.filter((m) => m.isCapture);
  assert.strictEqual(captures.length, 0, "no debe incluir captura sin casilla de aterrizaje");
});

test("man capture is invalid when landing square is occupied", () => {
  const b = emptyBoard();
  b[4][3] = 1; // peón rojo
  b[3][4] = -1; // pieza negra adyacente
  b[2][5] = -1; // casilla de aterrizaje ocupada

  const res = computeMoves(b, "red");
  const captures = res.moves.filter((m) => m.isCapture);
  assert.strictEqual(captures.length, 0, "no debe capturar si la casilla detrás está ocupada");
});

test("AI move selection always returns a legal move", () => {
  const b = emptyBoard();
  b[5][0] = 1; // rojo
  b[4][1] = -1; // negro capturable
  b[2][2] = -1; // segundo negro para asegurar al menos un movimiento

  const { move, generated, legalMoves } = pickLegalAIMove(b, "red");
  const sigs = (legalMoves || []).map((m) => moveSignature(m));
  assert.ok(move, "la IA debe devolver un movimiento");
  assert.ok(sigs.includes(moveSignature(move)), "el movimiento de IA debe estar en legalMoves");
  assert.ok(generated.moves.some((m) => moveSignature(m) === moveSignature(move)), "el movimiento debe provenir del generador");
});
