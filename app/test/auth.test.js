const assert = require("assert");
const { PASSWORD_REGEX_SOURCE } = require("../authRules");

const PASSWORD_REGEX = new RegExp(PASSWORD_REGEX_SOURCE);

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

test("password regex enforces required rules", () => {
  assert.ok(PASSWORD_REGEX.test("Andres0424"), "Andres0424 debe ser válida");
  assert.ok(!PASSWORD_REGEX.test("andres0424"), "andres0424 debe ser inválida");
  assert.ok(!PASSWORD_REGEX.test("ANDRES0424"), "ANDRES0424 debe ser inválida");
  assert.ok(!PASSWORD_REGEX.test("Andresabcd"), "Andresabcd debe ser inválida");
  assert.ok(!PASSWORD_REGEX.test("An0"), "An0 debe ser inválida");
});
