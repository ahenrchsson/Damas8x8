use damas_common::{ClientMsg, Color, GameState};
use leptos::*;
use crate::ws::WsCtx;

pub fn controls_panel() -> impl IntoView {
    let ws         = use_context::<WsCtx>().unwrap();
    let game_state = use_context::<ReadSignal<Option<GameState>>>().unwrap();
    let my_color   = use_context::<ReadSignal<Option<Color>>>().unwrap();
    let set_gs     = use_context::<WriteSignal<Option<GameState>>>().unwrap();
    let set_room   = use_context::<WriteSignal<Option<String>>>().unwrap();

    let toast = use_context::<WsCtx>().unwrap().toast_msg;

    view! {
        <div class="col">
            // Match info
            {move || game_state.get().map(|gs| {
                let mc = my_color.get();
                let is_my_turn = mc.map_or(false, |c| c == gs.turn);
                let turn_label = match gs.turn {
                    Color::Red   => "Rojas",
                    Color::Black => "Negras",
                };
                let role_label = match mc {
                    Some(Color::Red)   => "Rojas",
                    Some(Color::Black) => "Negras",
                    None               => "Observador",
                };

                view! {
                    <div class="card">
                        <div class="col">
                            <div class="info-row">{ format!("Sala: {}", gs.code) }</div>
                            <div class="info-row">{ format!("Turno: {} #{}", turn_label, gs.turn_count) }</div>
                            <div class="info-row">{ format!("Tu rol: {}", role_label) }</div>
                            <div class="info-row">{
                                format!("Rojo: {} | Negro: {}",
                                    gs.players.red.as_ref().map(|p| p.username.as_str()).unwrap_or("—"),
                                    gs.players.black.as_ref().map(|p| p.username.as_str()).unwrap_or("—"))
                            }</div>
                            {move || {
                                let blow_targets = game_state.get()
                                    .and_then(|gs| gs.pending_blow)
                                    .map(|pb| pb.blowable_pieces)
                                    .unwrap_or_default();
                                let can_blow_now = is_my_turn
                                    && mc.is_some()
                                    && !blow_targets.is_empty();
                                let pending = game_state.get().and_then(|gs| {
                                    if gs.pending_blow.is_some() {
                                        Some(if can_blow_now {
                                            "¡Puedes soplar ficha! Usa el botón o haz click en la ficha naranja.".to_string()
                                        } else {
                                            "Captura omitida detectada.".to_string()
                                        })
                                    } else if gs.pending_draw.is_some() {
                                        Some("Solicitud de tablas pendiente.".to_string())
                                    } else { None }
                                });
                                pending.map(|p| view! {
                                    <div class="pending-msg">{ p }</div>
                                })
                            }}
                        </div>
                    </div>
                }
            })}

            // Action buttons
            {move || {
                let Some(gs) = game_state.get() else { return view!{<span></span>}.into_view(); };
                let mc = my_color.get();
                let is_player = mc.is_some();
                let is_my_turn = mc.map_or(false, |c| c == gs.turn);
                let code = gs.code.clone();

                let blow_targets = gs.pending_blow.as_ref()
                    .map(|pb| pb.blowable_pieces.clone())
                    .unwrap_or_default();
                let can_blow = is_my_turn && is_player && !blow_targets.is_empty();
                let has_draw_offer = gs.pending_draw.is_some()
                    && gs.pending_draw.as_ref().and_then(|pd| mc.map(|c| pd.by != c)).unwrap_or(false);

                let ws1 = ws.clone();
                let ws2 = ws.clone();
                let ws3 = ws.clone();
                let ws4 = ws.clone();
                let ws5 = ws.clone();
                let code1 = code.clone();
                let code2 = code.clone();
                let code3 = code.clone();
                let code4 = code.clone();
                let code5 = code.clone();

                let blow_fn = move |_| {
                    if blow_targets.is_empty() { return; }
                    if blow_targets.len() == 1 {
                        ws1.send(&ClientMsg::BlowPiece { code: code1.clone(), target: blow_targets[0] });
                    } else {
                        ws1.show_toast("Haz click en una ficha resaltada en el tablero.");
                    }
                };

                view! {
                    <div class="controls">
                        {if can_blow { view! {
                            <button class="danger" on:click=blow_fn>"Soplar ficha"</button>
                        }.into_view()} else { view!{<span></span>}.into_view() }}

                        {if has_draw_offer { view! {
                            <button class="success"
                                on:click=move |_| ws2.send(&ClientMsg::RespondDraw { code: code2.clone(), accept: true })>
                                "Aceptar tablas"
                            </button>
                            <button class="ghost"
                                on:click=move |_| ws3.send(&ClientMsg::RespondDraw { code: code3.clone(), accept: false })>
                                "Rechazar"
                            </button>
                        }.into_view()} else if is_player && !gs.over { view! {
                            <button class="ghost"
                                on:click=move |_| ws4.send(&ClientMsg::RequestDraw { code: code4.clone() })>
                                "Tablas"
                            </button>
                            <button class="danger"
                                on:click=move |_| ws5.send(&ClientMsg::Resign { code: code5.clone() })>
                                "Rendirse"
                            </button>
                        }.into_view()} else { view!{<span></span>}.into_view() }}
                    </div>
                }.into_view()
            }}

            // Hint button
            {move || {
                let Some(gs) = game_state.get() else { return view!{<span></span>}.into_view(); };
                let mc = my_color.get();
                let is_my_turn = mc.map_or(false, |c| c == gs.turn);
                let code = gs.code.clone();
                let ws = ws.clone();
                if !gs.over && is_my_turn && mc.is_some() {
                    view! {
                        <button class="ghost"
                            on:click=move |_| ws.send(&ClientMsg::RequestHint { code: code.clone() })>
                            "Pedir pista"
                        </button>
                    }.into_view()
                } else { view!{<span></span>}.into_view() }
            }}

            // Leave button
            {move || {
                let Some(gs) = game_state.get() else { return view!{<span></span>}.into_view(); };
                let code = gs.code.clone();
                let ws = ws.clone();
                let set_gs2 = set_gs;
                let set_room2 = set_room;
                view! {
                    <button class="ghost"
                        on:click=move |_| {
                            ws.send(&ClientMsg::LeaveRoom { code: code.clone() });
                            set_gs2.set(None);
                            set_room2.set(None);
                        }>
                        "Salir de sala"
                    </button>
                }.into_view()
            }}

            // Move history
            {move || {
                let Some(gs) = game_state.get() else { return view!{<span></span>}.into_view(); };
                if gs.move_history.is_empty() { return view!{<span></span>}.into_view(); }
                let history = gs.move_history.clone();
                view! {
                    <div class="card">
                        <h3>{ format!("Historial ({} movimientos)", history.len()) }</h3>
                        <div style="max-height:200px;overflow-y:auto;font-size:12px">
                            {history.iter().rev().take(40).map(|m| {
                                let color_class = match m.color { Color::Red => "red", Color::Black => "black" };
                                let cap = if m.capture { "×" } else { "" };
                                let promo = if m.promoted { "♛" } else { "" };
                                let cols = "abcdefgh";
                                let from_s = format!("{}{}", cols.chars().nth(m.from.c).unwrap_or('?'), 8-m.from.r);
                                let to_s   = format!("{}{}", cols.chars().nth(m.to.c).unwrap_or('?'), 8-m.to.r);
                                view! {
                                    <div>
                                        <span class=format!("author {color_class}")>
                                            { format!("#{} ", m.turn_count) }
                                        </span>
                                        { format!("{from_s}→{to_s}{cap}{promo}") }
                                    </div>
                                }
                            }).collect_view()}
                        </div>
                    </div>
                }.into_view()
            }}
        </div>

        // Toast notification
        {move || toast.get().map(|msg| view! {
            <div id="toast" class="show">{ msg }</div>
        })}
    }
}
