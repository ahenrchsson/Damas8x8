use damas_common::{ClientMsg, Color, GameState, LobbyRoom, ServerMsg};
use leptos::*;
use wasm_bindgen::{closure::Closure, JsCast};
use web_sys::{MessageEvent, WebSocket};

use crate::{UserInfo};

#[derive(Clone)]
pub struct WsCtx {
    ws:           StoredValue<Option<WebSocket>>,
    pub lobbies:  RwSignal<Vec<LobbyRoom>>,
    pub current_room: WriteSignal<Option<String>>,
    pub toast_msg:    RwSignal<Option<String>>,
}

impl WsCtx {
    pub fn new(
        set_user:  WriteSignal<Option<UserInfo>>,
        set_gs:    WriteSignal<Option<GameState>>,
        set_color: WriteSignal<Option<Color>>,
        set_room:  WriteSignal<Option<String>>,
    ) -> Self {
        let lobbies   = create_rw_signal(Vec::<LobbyRoom>::new());
        let toast_msg = create_rw_signal(None::<String>);
        let ws_handle = StoredValue::new(None::<WebSocket>);

        let origin = web_sys::window()
            .and_then(|w| w.location().host().ok())
            .unwrap_or_default();
        let proto  = if origin.starts_with("localhost") { "ws" } else { "wss" };
        let url    = format!("{proto}://{origin}/ws");

        let ws = WebSocket::new(&url).expect("WebSocket connect");

        // onmessage
        let lobbies2   = lobbies;
        let toast2     = toast_msg;
        let onmessage  = Closure::<dyn FnMut(MessageEvent)>::new(move |evt: MessageEvent| {
            let text = evt.data().as_string().unwrap_or_default();
            let msg: ServerMsg = match serde_json::from_str(&text) {
                Ok(m)  => m,
                Err(_) => return,
            };
            match msg {
                ServerMsg::UserOk => {}
                ServerMsg::State(gs) => {
                    set_gs.set(Some(gs.clone()));
                    set_room.set(Some(gs.code.clone()));
                }
                ServerMsg::LobbyRooms(list) => lobbies2.set(list),
                ServerMsg::GameOver { winner, reason } => {
                    let msg = match winner {
                        Some(Color::Red)   => "¡Ganan las Rojas!",
                        Some(Color::Black) => "¡Ganan las Negras!",
                        None               => "¡Tablas!",
                    };
                    show_toast_str(&toast2, &format!("{msg} ({reason})"));
                }
                ServerMsg::BlowOffered { code: _, blowable_pieces } => {
                    let n = blowable_pieces.len();
                    show_toast_str(&toast2, &format!(
                        "¡El rival no capturó! Pulsa 'Soplar' o haz click en la ficha ({n} disponible{})",
                        if n == 1 { "" } else { "s" }
                    ));
                }
                ServerMsg::DrawOffer { .. } => {
                    show_toast_str(&toast2, "El rival solicita tablas. Acepta o rechaza.");
                }
                ServerMsg::Hint { from, to, .. } => {
                    show_toast_str(&toast2, &format!(
                        "Pista: mueve {},{} → {},{}",
                        from.r, from.c, to.r, to.c
                    ));
                }
                ServerMsg::ChatMsg(_) | ServerMsg::GlobalChatMsg(_) => {}
                ServerMsg::GlobalChatHistory(_) => {}
                ServerMsg::Err { error } => {
                    if error != "buzz" {
                        show_toast_str(&toast2, &format!("Error: {error}"));
                    }
                }
                ServerMsg::ResumePrompt { .. } => {}
            }
        });
        ws.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        onmessage.forget();

        ws_handle.set_value(Some(ws));

        Self { ws: ws_handle, lobbies, current_room: set_room, toast_msg }
    }

    pub fn send(&self, msg: &ClientMsg) {
        if let Some(ws) = self.ws.get_value() {
            if let Ok(json) = serde_json::to_string(msg) {
                let _ = ws.send_with_str(&json);
            }
        }
    }

    pub fn logout(&self) {
        self.send(&ClientMsg::Auth { user_id: String::new(), username: String::new() });
    }

    pub fn show_toast(&self, msg: &str) {
        show_toast_str(&self.toast_msg, msg);
    }
}

fn show_toast_str(signal: &RwSignal<Option<String>>, msg: &str) {
    signal.set(Some(msg.to_string()));
    let signal2 = *signal;
    set_timeout(move || signal2.set(None), std::time::Duration::from_secs(4));
}
