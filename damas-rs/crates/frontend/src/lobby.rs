use damas_common::ClientMsg;
use leptos::*;
use crate::ws::WsCtx;

pub fn lobby_panel() -> impl IntoView {
    let ws      = use_context::<WsCtx>().unwrap();
    let lobbies = ws.lobbies;

    let room_name   = create_rw_signal(String::new());
    let mode        = create_rw_signal("pvp".to_string());
    let difficulty  = create_rw_signal("easy".to_string());
    let join_code   = create_rw_signal(String::new());

    let create_room = {
        let ws = ws.clone();
        move |_| {
            let name = room_name.get();
            let m    = mode.get();
            let diff = difficulty.get();
            ws.send(&ClientMsg::CreateRoom {
                name: if name.is_empty() { "Sala".into() } else { name },
                mode: m.clone(),
                difficulty: if m == "ai" { Some(diff) } else { None },
            });
        }
    };

    let join_room = {
        let ws = ws.clone();
        move |_| {
            let code = join_code.get().trim().to_uppercase();
            if !code.is_empty() {
                ws.send(&ClientMsg::JoinRoom { code });
            }
        }
    };

    view! {
        <div class="col">
            <div class="card">
                <h2>"Nueva partida"</h2>
                <div class="col">
                    <input placeholder="Nombre de sala (opcional)"
                        on:input=move |e| room_name.set(event_target_value(&e)) />
                    <select on:change=move |e| mode.set(event_target_value(&e))>
                        <option value="pvp">"PvP (dos jugadores)"</option>
                        <option value="ai">"vs IA"</option>
                    </select>
                    {move || if mode.get() == "ai" { view! {
                        <select on:change=move |e| difficulty.set(event_target_value(&e))>
                            <option value="easy">"Fácil"</option>
                            <option value="medium">"Medio"</option>
                            <option value="hard">"Difícil"</option>
                            <option value="extreme">"Extremo"</option>
                        </select>
                    }.into_view()} else { view!{<span></span>}.into_view() }}
                    <button on:click=create_room>"Crear sala"</button>
                </div>
            </div>

            <div class="card">
                <h2>"Unirse a sala"</h2>
                <div class="row">
                    <input placeholder="Código de sala"
                        on:input=move |e| join_code.set(event_target_value(&e))
                        on:keydown=move |e| { if e.key() == "Enter" { join_room(()); } } />
                    <button on:click=join_room>"Unirse"</button>
                </div>
            </div>

            <div class="card">
                <h3>"Salas disponibles"</h3>
                <table>
                    <thead>
                        <tr>
                            <th>"Sala"</th>
                            <th>"Estado"</th>
                            <th>"Acción"</th>
                        </tr>
                    </thead>
                    <tbody>
                        {move || lobbies.get().into_iter().map(|room| {
                            let code1 = room.code.clone();
                            let code2 = room.code.clone();
                            let ws1 = ws.clone();
                            let ws2 = ws.clone();
                            let can_join = room.status == "waiting";
                            view! {
                                <tr>
                                    <td>{ format!("{} ({})", room.name, room.code) }</td>
                                    <td>{ room.status.clone() }</td>
                                    <td class="row">
                                        <button
                                            disabled=move || !can_join
                                            on:click=move |_| ws1.send(&ClientMsg::JoinRoom { code: code1.clone() })>
                                            "Unirse"
                                        </button>
                                        <button class="ghost"
                                            on:click=move |_| ws2.send(&ClientMsg::ObserveRoom { code: code2.clone() })>
                                            "Ver"
                                        </button>
                                    </td>
                                </tr>
                            }
                        }).collect_view()}
                    </tbody>
                </table>
            </div>
        </div>
    }
}
