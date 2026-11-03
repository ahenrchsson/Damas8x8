use axum::{
    extract::{State, WebSocketUpgrade, ws::WebSocket},
    middleware,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use dotenvy::dotenv;
use sqlx::postgres::PgPoolOptions;
use std::{net::SocketAddr, sync::Arc};
use tower_http::{cors::CorsLayer, services::ServeDir};
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::PostgresStore;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod db;
mod room;
mod ws;

pub use room::AppState;

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await
        .expect("Failed to connect to Postgres");

    db::migrate(&pool).await.expect("Migration failed");

    let session_store = PostgresStore::new(pool.clone());
    session_store.migrate().await.expect("Session migration failed");

    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_expiry(Expiry::OnInactivity(time::Duration::days(7)));

    let state = Arc::new(AppState::new(pool.clone()));

    let api = Router::new()
        .route("/auth/register", post(auth::register))
        .route("/auth/login",    post(auth::login))
        .route("/auth/logout",   post(auth::logout))
        .route("/auth/me",       get(auth::me));

    let app = Router::new()
        .nest("/api", api)
        .route("/ws", get(ws_handler))
        .fallback_service(ServeDir::new("dist").append_index_html_on_directories(true))
        .layer(CorsLayer::permissive())
        .layer(session_layer)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    session: tower_sessions::Session,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws::handle_socket(socket, state, session))
}
