use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tower_sessions::Session;
use uuid::Uuid;

use crate::{db, AppState};

#[derive(Deserialize)]
pub struct AuthPayload {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub id:       String,
    pub username: String,
}

#[derive(Serialize)]
pub struct ErrResponse {
    pub error: String,
}

fn bad(msg: &str) -> (StatusCode, Json<ErrResponse>) {
    (StatusCode::BAD_REQUEST, Json(ErrResponse { error: msg.to_string() }))
}

fn username_valid(s: &str) -> bool {
    let len = s.len();
    len >= 3
        && len <= 20
        && s.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(payload): Json<AuthPayload>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrResponse>)> {
    if !username_valid(&payload.username) {
        return Err(bad("invalid_username"));
    }
    if payload.password.len() < 6 {
        return Err(bad("password_too_short"));
    }

    let existing = db::find_user_by_username(&state.pool, &payload.username)
        .await
        .map_err(|_| bad("db_error"))?;
    if existing.is_some() {
        return Err(bad("username_taken"));
    }

    let hash = bcrypt::hash(&payload.password, 10).map_err(|_| bad("hash_error"))?;
    let id = Uuid::new_v4().to_string();
    db::create_user(&state.pool, &id, &payload.username, &hash)
        .await
        .map_err(|_| bad("db_error"))?;

    session.insert("user_id", &id).await.ok();
    session.insert("username", &payload.username).await.ok();

    Ok(Json(AuthResponse { id, username: payload.username }))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    session: Session,
    Json(payload): Json<AuthPayload>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<ErrResponse>)> {
    let user = db::find_user_by_username(&state.pool, &payload.username)
        .await
        .map_err(|_| bad("db_error"))?
        .ok_or_else(|| bad("invalid_credentials"))?;

    let ok = bcrypt::verify(&payload.password, &user.password_hash).unwrap_or(false);
    if !ok {
        return Err(bad("invalid_credentials"));
    }

    session.insert("user_id", &user.id).await.ok();
    session.insert("username", &user.username).await.ok();

    Ok(Json(AuthResponse { id: user.id, username: user.username }))
}

pub async fn logout(session: Session) -> StatusCode {
    session.flush().await.ok();
    StatusCode::OK
}

pub async fn me(session: Session) -> Result<Json<AuthResponse>, StatusCode> {
    let id: Option<String>       = session.get("user_id").await.ok().flatten();
    let username: Option<String> = session.get("username").await.ok().flatten();
    match (id, username) {
        (Some(id), Some(username)) => Ok(Json(AuthResponse { id, username })),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
