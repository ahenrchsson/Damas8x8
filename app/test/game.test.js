const assert = require("assert");
const { computeMoves } = require("../game");

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
  assert.strictEqual(res.normals.length, 0);
  assert.strictEqual(res.moves.length, 1, "solo debe quedar la captura de mayor calidad");
  const chosen = res.moves[0];
  assert.ok(chosen.isCapture);
  assert.strictEqual(chosen.captures.length, 1);
  assert.strictEqual(chosen.captures[0].pieceType, "king");
});

test("flying kings chain captures with variable landings", () => {
  const b = emptyBoard();
  b[6][0] = 2; // rey rojo
  b[4][2] = -1; // negro
  b[2][4] = -1; // negro

  const res = computeMoves(b, "red");
  assert.strictEqual(res.forced, true);
  assert.strictEqual(res.moves.length, 2, "debe haber dos aterrizajes posibles tras la última captura");
  res.moves.forEach((mv) => {
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
  assert.strictEqual(res.moves.length, 2, "debe exponer ambas rutas");
  const destinations = res.moves.map((m) => `${m.pieceTo.r},${m.pieceTo.c}`);
  assert.strictEqual(new Set(destinations).size, 1, "ambas rutas comparten destino final");
  const prefixes = res.moves.map((m) => m.path.map((p) => `${p.r},${p.c}`).join("|"));
  assert.notStrictEqual(prefixes[0], prefixes[1], "las rutas deben diferir en su secuencia");
});
