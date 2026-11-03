use damas_common::{Color, Coord, GameState, SerializedMoveTarget};
use leptos::*;
use crate::{ws::WsCtx};

pub fn board_view() -> impl IntoView {
    let ws         = use_context::<WsCtx>().unwrap();
    let game_state = use_context::<ReadSignal<Option<GameState>>>().unwrap();
    let my_color   = use_context::<ReadSignal<Option<Color>>>().unwrap();

    let selected:    RwSignal<Option<Coord>> = create_rw_signal(None);
    let move_targets: RwSignal<Vec<SerializedMoveTarget>> = create_rw_signal(vec![]);

    view! {
        <div id="board">
            {move || {
                let Some(gs) = game_state.get() else { return vec![]; };
                let mc       = my_color.get();
                let is_my_turn = mc.map_or(false, |c| c == gs.turn);
                let sel      = selected.get();
                let targets  = move_targets.get();

                let blow_targets: Vec<Coord> = gs.pending_blow.as_ref()
                    .map(|pb| pb.blowable_pieces.clone())
                    .unwrap_or_default();
                let can_blow = is_my_turn
                    && mc.is_some()
                    && !blow_targets.is_empty()
                    && gs.pending_blow.as_ref()
                        .and_then(|pb| pb.offered_to)
                        .map_or(true, |c| Some(c) == mc);

                let mut cells = vec![];
                for r in 0..8usize {
                    for c in 0..8usize {
                        let piece     = gs.board[r][c];
                        let coord     = Coord { r, c };
                        let is_light  = (r + c) % 2 == 0;
                        let is_sel    = sel.map_or(false, |s| s == coord);
                        let is_target = targets.iter().any(|t| t.to == coord);
                        let is_cap_target = targets.iter().any(|t| t.to == coord && t.is_capture);
                        let is_blow_t = blow_targets.contains(&coord);
                        let key_str   = format!("{},{}", r, c);
                        let moves_here = gs.move_map.get(&key_str).cloned().unwrap_or_default();
                        let has_moves = !moves_here.is_empty() && is_my_turn && !can_blow;

                        // Build class string
                        let mut class = String::from("cell ");
                        class += if is_light { "light " } else { "dark " };
                        if is_sel       { class += "selected "; }
                        if is_cap_target { class += "capture-target "; }
                        else if is_target { class += "move-target "; }
                        if is_blow_t    { class += "blow-target "; }
                        if has_moves || (can_blow && is_blow_t) { class += "clickable "; }

                        let piece_view = if piece != 0 {
                            let is_red  = piece > 0;
                            let is_king = piece.abs() == 2;
                            let mut pc = String::from("piece ");
                            pc += if is_red { "red " } else { "black " };
                            if is_king { pc += "king "; }
                            Some(view! { <div class=pc></div> })
                        } else { None };

                        // Click handler
                        let ws2 = ws.clone();
                        let gs2 = game_state;
                        let on_click = move |_| {
                            let Some(st) = gs2.get() else { return; };
                            let mc2 = my_color.get();

                            if can_blow && blow_targets.contains(&coord) {
                                ws2.send(&damas_common::ClientMsg::BlowPiece {
                                    code: st.code.clone(), target: coord,
                                });
                                selected.set(None);
                                move_targets.set(vec![]);
                                return;
                            }

                            // If clicking a target square, submit move
                            if let Some(from) = sel {
                                if let Some(t) = targets.iter().find(|t| t.to == coord) {
                                    ws2.send(&damas_common::ClientMsg::MakeMove {
                                        code: st.code.clone(), from, to: coord,
                                    });
                                    selected.set(None);
                                    move_targets.set(vec![]);
                                    return;
                                }
                            }

                            // Select piece
                            let key = format!("{},{}", coord.r, coord.c);
                            if let Some(mv_list) = st.move_map.get(&key) {
                                if !mv_list.is_empty() {
                                    selected.set(Some(coord));
                                    move_targets.set(mv_list.clone());
                                    return;
                                }
                            }

                            // Deselect
                            selected.set(None);
                            move_targets.set(vec![]);
                        };

                        cells.push(view! {
                            <div class=class on:click=on_click>
                                { piece_view }
                            </div>
                        });
                    }
                }
                cells
            }}
        </div>
    }
}
