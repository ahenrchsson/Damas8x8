mod auth;
mod board;
mod chat;
mod controls;
mod lobby;
mod ws;

use damas_common::{Color, GameState};
use leptos::*;
use leptos_router::*;
use ws::WsCtx;

#[derive(Clone, Debug, PartialEq)]
pub struct UserInfo {
    pub id:       String,
    pub username: String,
}

fn main_app() -> impl IntoView {
    let (user, set_user)       = create_signal::<Option<UserInfo>>(None);
    let (game_state, set_gs)   = create_signal::<Option<GameState>>(None);
    let (my_color, set_color)  = create_signal::<Option<Color>>(None);
    let (current_room, set_room) = create_signal::<Option<String>>(None);

    let ws_ctx = WsCtx::new(
        set_user.clone(),
        set_gs.clone(),
        set_color.clone(),
        set_room.clone(),
    );
    provide_context(ws_ctx.clone());
    provide_context(user);
    provide_context(set_user);
    provide_context(game_state);
    provide_context(set_gs);
    provide_context(my_color);
    provide_context(set_color);
    provide_context(current_room);
    provide_context(set_room);

    view! {
        <Router>
            <header>
                <h1>"♟ Damas 8×8"</h1>
                {move || user.get().map(|u| view! {
                    <span style="font-size:13px;color:var(--muted)">
                        { format!("Jugando como {}", u.username) }
                    </span>
                    <button class="ghost" style="padding:4px 10px;font-size:12px"
                        on:click=move |_| ws_ctx.logout()>
                        "Salir"
                    </button>
                })}
            </header>
            <div class="layout">
                <Routes>
                    <Route path="/" view=home_view />
                </Routes>
            </div>
        </Router>
    }
}

fn home_view() -> impl IntoView {
    let user = use_context::<ReadSignal<Option<UserInfo>>>().unwrap();
    let game_state = use_context::<ReadSignal<Option<GameState>>>().unwrap();

    view! {
        {move || if user.get().is_none() {
            view! { <div style="flex:1;display:flex;align-items:center;justify-content:center">
                { auth::auth_card() }
            </div> }.into_view()
        } else if game_state.get().is_some() {
            view! {
                <div class="sidebar">{ controls::controls_panel() }</div>
                <div class="main-area">
                    { board::board_view() }
                    { chat::chat_panel() }
                </div>
            }.into_view()
        } else {
            view! {
                <div class="sidebar">{ lobby::lobby_panel() }</div>
                <div class="main-area">
                    <p class="hint-msg">"Selecciona o crea una sala para comenzar."</p>
                </div>
            }.into_view()
        }}
    }
}

#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn hydrate() {
    console_error_panic_hook::set_once();
    leptos::mount_to_body(main_app);
}
