use sqlx::PgPool;

pub async fn migrate(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id            TEXT PRIMARY KEY,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            recovery_code TEXT,
            created_at    TIMESTAMPTZ DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS ratings (
            user_id  TEXT PRIMARY KEY REFERENCES users(id),
            rating   INT  NOT NULL DEFAULT 1200,
            wins     INT  NOT NULL DEFAULT 0,
            losses   INT  NOT NULL DEFAULT 0,
            draws    INT  NOT NULL DEFAULT 0
        );
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[derive(Debug, sqlx::FromRow)]
pub struct DbUser {
    pub id:            String,
    pub username:      String,
    pub password_hash: String,
}

pub async fn find_user_by_username(pool: &PgPool, username: &str) -> Result<Option<DbUser>, sqlx::Error> {
    sqlx::query_as::<_, DbUser>("SELECT id, username, password_hash FROM users WHERE username = $1")
        .bind(username)
        .fetch_optional(pool)
        .await
}

pub async fn create_user(pool: &PgPool, id: &str, username: &str, hash: &str) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(username)
        .bind(hash)
        .execute(pool)
        .await?;
    sqlx::query("INSERT INTO ratings (user_id) VALUES ($1) ON CONFLICT DO NOTHING")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Debug, sqlx::FromRow, serde::Serialize)]
pub struct RatingRow {
    pub user_id:  String,
    pub username: String,
    pub rating:   i32,
    pub wins:     i32,
    pub losses:   i32,
    pub draws:    i32,
}

pub async fn get_leaderboard(pool: &PgPool) -> Result<Vec<RatingRow>, sqlx::Error> {
    sqlx::query_as::<_, RatingRow>(
        "SELECT r.user_id, u.username, r.rating, r.wins, r.losses, r.draws
         FROM ratings r JOIN users u ON r.user_id = u.id
         ORDER BY r.rating DESC LIMIT 50",
    )
    .fetch_all(pool)
    .await
}

pub async fn update_rating_after_game(
    pool: &PgPool,
    winner_id: Option<&str>,
    loser_id: Option<&str>,
    draw: bool,
) -> Result<(), sqlx::Error> {
    if draw {
        if let (Some(a), Some(b)) = (winner_id, loser_id) {
            sqlx::query("UPDATE ratings SET draws = draws + 1 WHERE user_id = $1")
                .bind(a).execute(pool).await?;
            sqlx::query("UPDATE ratings SET draws = draws + 1 WHERE user_id = $1")
                .bind(b).execute(pool).await?;
        }
    } else {
        if let Some(w) = winner_id {
            sqlx::query("UPDATE ratings SET wins = wins + 1, rating = rating + 15 WHERE user_id = $1")
                .bind(w).execute(pool).await?;
        }
        if let Some(l) = loser_id {
            sqlx::query("UPDATE ratings SET losses = losses + 1, rating = GREATEST(rating - 15, 100) WHERE user_id = $1")
                .bind(l).execute(pool).await?;
        }
    }
    Ok(())
}
