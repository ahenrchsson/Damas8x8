const { Pool } = require("pg");

function makePool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl });
}

async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ratings (
      user_id     INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      rating      INTEGER NOT NULL DEFAULT 1200,
      wins        INTEGER NOT NULL DEFAULT 0,
      losses      INTEGER NOT NULL DEFAULT 0,
      draws       INTEGER NOT NULL DEFAULT 0,
      games       INTEGER NOT NULL DEFAULT 0,
      last_played TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS active_rooms (
      user_id   INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      room_code TEXT NOT NULL,
      mode      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id INTEGER PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      last_color_ai TEXT CHECK (last_color_ai IN ('red','black')),
      last_color_pvp TEXT CHECK (last_color_pvp IN ('red','black'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id           BIGSERIAL PRIMARY KEY,
      played_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      rated        BOOLEAN NOT NULL DEFAULT TRUE,
      room_code    TEXT,
      player_red   INTEGER REFERENCES app_users(id),
      player_black INTEGER REFERENCES app_users(id),
      winner       INTEGER REFERENCES app_users(id),
      result       TEXT NOT NULL, -- 'red' | 'black' | 'draw'
      moves        JSONB
    );

    CREATE INDEX IF NOT EXISTS idx_ratings_rating ON ratings(rating DESC);
    CREATE INDEX IF NOT EXISTS idx_games_played_at ON games(played_at DESC);
  `);
}

async function ensureUserRating(pool, userId) {
  await pool.query(
    `INSERT INTO ratings (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function getRating(pool, userId) {
  const { rows } = await pool.query(`SELECT * FROM ratings WHERE user_id=$1`, [userId]);
  return rows[0] || null;
}

async function upsertRating(pool, userId, fields) {
  const keys = Object.keys(fields);
  const vals = Object.values(fields);
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(", ");
  await pool.query(
    `UPDATE ratings SET ${sets} WHERE user_id=$1`,
    [userId, ...vals]
  );
}

module.exports = {
  makePool,
  migrate,
  ensureUserRating,
  getRating,
  upsertRating,
  async setActiveRoom(pool, userId, roomCode, mode) {
    await pool.query(`
      INSERT INTO active_rooms (user_id, room_code, mode)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET room_code=EXCLUDED.room_code, mode=EXCLUDED.mode, created_at=NOW()
    `, [userId, roomCode, mode]);
  },
  async clearActiveRoom(pool, userId) {
    await pool.query(`DELETE FROM active_rooms WHERE user_id=$1`, [userId]);
  },
  async getActiveRoom(pool, userId) {
    const { rows } = await pool.query(`SELECT * FROM active_rooms WHERE user_id=$1`, [userId]);
    return rows[0] || null;
  },
  async getUserPrefs(pool, userId) {
    const { rows } = await pool.query(`SELECT * FROM user_prefs WHERE user_id=$1`, [userId]);
    return rows[0] || null;
  },
  async setUserPrefs(pool, userId, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const cols = keys.map((k) => `${k} = EXCLUDED.${k}`).join(", ");
    const values = keys.map((k) => fields[k]);
    await pool.query(`
      INSERT INTO user_prefs (user_id, ${keys.join(", ")})
      VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(", ")})
      ON CONFLICT (user_id) DO UPDATE SET ${cols}
    `, [userId, ...values]);
  }
};
