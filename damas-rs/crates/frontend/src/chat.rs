use damas_common::{ClientMsg, Color, GameState};
use leptos::*;
use crate::ws::WsCtx;

pub fn chat_panel() -> impl IntoView {
    let ws         = use_context::<WsCtx>().unwrap();
    let game_state = use_context::<ReadSignal<Option<GameState>>>().unwrap();
    let my_color   = use_context::<ReadSignal<Option<Color>>>().unwrap();
    let input      = create_rw_signal(String::new());

    let send = {
        let ws = ws.clone();
        move |_| {
            let text = input.get().trim().to_string();
            if text.is_empty() { return; }
            let code = game_state.get().map(|gs| gs.code.clone()).unwrap_or_default();
            if !code.is_empty() {
                ws.send(&ClientMsg::Chat { code, text });
                input.set(String::new());
            }
        }
    };

    view! {
        <div class="card" style="width:min(480px,95vw)">
            <h3>"Chat"</h3>
            <div class="chat-log">
                {move || game_state.get().map(|gs| {
                    gs.messages.iter().map(|m| {
                        let color_class = match m.color {
                            Some(Color::Red)   => "red",
                            Some(Color::Black) => "black",
                            None               => "",
                        };
                        view! {
                            <div class="chat-msg">
                                <span class=format!("author {color_class}")>
                                    { format!("{}: ", m.author) }
                                </span>
                                { m.text.clone() }
                            </div>
                        }
                    }).collect_view()
                })}
            </div>
            {move || {
                let mc = my_color.get();
                let over = game_state.get().map(|gs| gs.over).unwrap_or(true);
                if mc.is_some() && !over {
                    view! {
                        <div class="row" style="margin-top:8px">
                            <input placeholder="Mensaje…"
                                prop:value=input
                                on:input=move |e| input.set(event_target_value(&e))
                                on:keydown={let send = send.clone(); move |e| {
                                    if e.key() == "Enter" { send(()); }
                                }} />
                            <button on:click=send>"Enviar"</button>
                        </div>
                    }.into_view()
                } else { view!{<span></span>}.into_view() }
            }}
        </div>
    }
}
