use axum::extract::ws::{Message, WebSocket};
use damas_common::*;
use futures::{SinkExt, StreamExt};
use nanoid::nanoid;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tower_sessions::Session;

use crate::room::{AppState, Room, Tx};

pub async fn handle_socket(socket: WebSocket, state: Arc<AppState>, session: Session) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Identify user from session
    let user_id:   Option<String> = session.get("user_id").await.ok().flatten();
    let username:  Option<String> = session.get("username").await.ok().flatten();

    let tx_clone = tx.clone();
    // Outbound pump
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(Message::Text(msg)).await.is_err() { break; }
        }
    });

    // Send lobby on connect
    send_msg(&tx, &ServerMsg::LobbyRooms(state.lobby_list()));
    if let Ok(history) = {
        let gc = state.global_chat.lock().unwrap();
        Ok::<Vec<ChatMessage>, ()>(gc.clone())
    } {
        send_msg(&tx, &ServerMsg::GlobalChatHistory(history));
    }

    let mut current_room: Option<String>  = None;
    let mut my_color:     Option<Color>   = None;
    let mut my_user_id    = user_id;
    let mut my_username   = username;

    while let Some(Ok(raw)) = ws_rx.next().await {
        let text = match raw {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let msg: ClientMsg = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(_) => { send_err(&tx, "bad_message"); continue; }
        };

        match msg {
            ClientMsg::Auth { user_id, username } => {
                my_user_id  = Some(user_id);
                my_username = Some(username);
                send_msg(&tx, &ServerMsg::UserOk);
            }

            ClientMsg::CreateRoom { name, mode, difficulty } => {
                let Some(uid) = &my_user_id else { send_err(&tx, "no_auth"); continue; };
                let Some(uname) = &my_username else { send_err(&tx, "no_auth"); continue; };

                let code = nanoid!(5, &nanoid::alphabet::SAFE).to_uppercase();
                let diff = difficulty.as_deref().unwrap_or("easy");
                let mut room = Room::new(code.clone(), name, &mode, diff);

                // Creator joins as red
                room.players.insert("red".to_string(), crate::room::PlayerSlot {
                    id: uid.clone(), username: uname.clone(), tx: Some(tx.clone()),
                });
                current_room = Some(code.clone());
                my_color     = Some(Color::Red);

                // If AI mode, start AI as black immediately
                let state_msg = ServerMsg::State(room.public_state());
                send_msg(&tx, &state_msg);

                state.rooms.insert(code, Arc::new(Mutex::new(room)));
                broadcast_lobby(&state, &tx);
            }

            ClientMsg::JoinRoom { code } => {
                let Some(uid) = &my_user_id else { send_err(&tx, "no_auth"); continue; };
                let Some(uname) = &my_username else { send_err(&tx, "no_auth"); continue; };

                let Some(room_arc) = state.rooms.get(&code) else {
                    send_err(&tx, "room_not_found"); continue;
                };

                let color = {
                    let mut room = room_arc.lock().unwrap();
                    if room.over { send_err(&tx, "game_over"); continue; }
                    if room.players.len() >= 2 { send_err(&tx, "room_full"); continue; }
                    if room.players.contains_key("red") { Color::Black } else { Color::Red }
                };

                {
                    let mut room = room_arc.lock().unwrap();
                    let key = match color { Color::Red => "red", Color::Black => "black" };
                    room.players.insert(key.to_string(), crate::room::PlayerSlot {
                        id: uid.clone(), username: uname.clone(), tx: Some(tx.clone()),
                    });
                    current_room = Some(code.clone());
                    my_color     = Some(color);
                    room.broadcast(&ServerMsg::State(room.public_state()));
                }

                broadcast_lobby(&state, &tx);

                // If AI game & it's AI's turn, kick it off
                let room_arc2 = room_arc.clone();
                let state2    = state.clone();
                let code2     = code.clone();
                tokio::spawn(async move {
                    maybe_play_ai(&state2, &code2, room_arc2).await;
                });
            }

            ClientMsg::ObserveRoom { code } => {
                let Some(room_arc) = state.rooms.get(&code) else {
                    send_err(&tx, "room_not_found"); continue;
                };
                let mut room = room_arc.lock().unwrap();
                room.observers.push(tx.clone());
                send_msg(&tx, &ServerMsg::State(room.public_state()));
            }

            ClientMsg::MakeMove { code, from, to } => {
                let Some(uid) = &my_user_id else { send_err(&tx, "no_auth"); continue; };
                let Some(user_color) = my_color else { send_err(&tx, "not_player"); continue; };

                let Some(room_arc) = state.rooms.get(&code) else {
                    send_err(&tx, "room_not_found"); continue;
                };

                let (result, pending_blow_info) = {
                    let mut room = room_arc.lock().unwrap();

                    // Clear pending blow if it was ours
                    if room.pending_blow.is_some() && room.turn == user_color {
                        room.pending_blow  = None;
                        room.missed_capture = None;
                    }

                    match room.apply_human_move(from, to, user_color) {
                        Err(e) => { send_err(&tx, e); continue; }
                        Ok(result) => {
                            let blow_info = room.pending_blow.as_ref().map(|pb| (
                                pb.blowable_pieces.clone(),
                                pb.offered_to,
                                room.players.get(match pb.offered_to.unwrap_or(Color::Red) {
                                    Color::Red => "red", Color::Black => "black",
                                }).and_then(|s| s.tx.clone()),
                            ));
                            room.broadcast(&ServerMsg::State(room.public_state()));
                            (result, blow_info)
                        }
                    }
                };

                // Send blow offer
                if let Some((pieces, _, Some(offer_tx))) = pending_blow_info {
                    send_to(&offer_tx, &ServerMsg::BlowOffered {
                        code: code.clone(), blowable_pieces: pieces,
                    });
                }

                if let Some(res) = result {
                    let room_arc2 = room_arc.clone();
                    let state2    = state.clone();
                    let code2     = code.clone();
                    handle_game_over(&state2, &code2, room_arc2.clone(), res).await;
                } else {
                    // Try AI move
                    let room_arc2 = room_arc.clone();
                    let state2    = state.clone();
                    let code2     = code.clone();
                    tokio::spawn(async move {
                        maybe_play_ai(&state2, &code2, room_arc2).await;
                    });
                }
            }

            ClientMsg::BlowPiece { code, target } => {
                let Some(user_color) = my_color else { send_err(&tx, "not_player"); continue; };

                let Some(room_arc) = state.rooms.get(&code) else {
                    send_err(&tx, "room_not_found"); continue;
                };

                let result = {
                    let mut room = room_arc.lock().unwrap();
                    let Some(pb) = room.pending_blow.clone() else {
                        send_err(&tx, "no_pending_blow"); continue;
                    };
                    if pb.offered_to.map_or(false, |c| c != user_color) {
                        send_err(&tx, "not_allowed"); continue;
                    }
                    if room.turn != user_color {
                        send_err(&tx, "not_your_turn"); continue;
                    }
                    let allowed = pb.blowable_pieces.iter().any(|p| *p == target);
                    if !allowed { send_err(&tx, "invalid_target"); continue; }

                    let piece = room.board[target.r][target.c];
                    if damas_game::color_of(piece).map_or(false, |c| c == pb.piece_color) {
                        room.board[target.r][target.c] = 0;
                    }
                    room.pending_blow  = None;
                    room.missed_capture = None;
                    let res = room.recompute();
                    room.broadcast(&ServerMsg::State(room.public_state()));
                    res
                };

                if let Some(res) = result {
                    handle_game_over(&state, &code, room_arc.clone(), res).await;
                } else {
                    let room_arc2 = room_arc.clone();
                    let state2    = state.clone();
                    let code2     = code.clone();
                    tokio::spawn(async move {
                        maybe_play_ai(&state2, &code2, room_arc2).await;
                    });
                }
            }

            ClientMsg::RequestDraw { code } => {
                let Some(user_color) = my_color else { continue; };
                let Some(room_arc) = state.rooms.get(&code) else { continue; };
                {
                    let mut room = room_arc.lock().unwrap();
                    if room.over { continue; }
                    room.pending_draw = Some(PendingDraw { by: user_color, ts: now_ms() });
                    room.broadcast(&ServerMsg::DrawOffer { code: code.clone() });
                }
            }

            ClientMsg::RespondDraw { code, accept } => {
                let Some(room_arc) = state.rooms.get(&code) else { continue; };
                let result = {
                    let mut room = room_arc.lock().unwrap();
                    if room.pending_draw.is_none() { continue; }
                    room.pending_draw = None;
                    if accept {
                        room.over = true;
                        Some(crate::room::GameOverResult { winner: None, reason: "draw_agreed".into() })
                    } else {
                        room.broadcast(&ServerMsg::State(room.public_state()));
                        None
                    }
                };
                if let Some(res) = result {
                    handle_game_over(&state, &code, room_arc.clone(), res).await;
                }
            }

            ClientMsg::Resign { code } => {
                let Some(user_color) = my_color else { continue; };
                let Some(room_arc) = state.rooms.get(&code) else { continue; };
                let winner = match user_color { Color::Red => Color::Black, Color::Black => Color::Red };
                let res = crate::room::GameOverResult { winner: Some(winner), reason: "resign".into() };
                handle_game_over(&state, &code, room_arc.clone(), res).await;
            }

            ClientMsg::Chat { code, text } => {
                let Some(uname) = &my_username else { continue; };
                let Some(user_color) = my_color else { continue; };
                let Some(room_arc) = state.rooms.get(&code) else { continue; };
                let msg_obj = ChatMessage {
                    author: uname.clone(), text: text.clone(),
                    color: Some(user_color), ts: now_ms(),
                };
                let mut room = room_arc.lock().unwrap();
                room.messages.push(msg_obj.clone());
                room.broadcast(&ServerMsg::ChatMsg(msg_obj));
            }

            ClientMsg::GlobalChat { text } => {
                let Some(uname) = &my_username else { continue; };
                let msg_obj = ChatMessage {
                    author: uname.clone(), text,
                    color: None, ts: now_ms(),
                };
                let mut gc = state.global_chat.lock().unwrap();
                if gc.len() > 200 { gc.drain(0..50); }
                gc.push(msg_obj.clone());
                // broadcast to all rooms
                drop(gc);
                for entry in state.rooms.iter() {
                    let room = entry.value().lock().unwrap();
                    room.broadcast(&ServerMsg::GlobalChatMsg(msg_obj.clone()));
                }
            }

            ClientMsg::RequestHint { code } => {
                let Some(user_color) = my_color else { continue; };
                let Some(room_arc) = state.rooms.get(&code) else { continue; };
                let board = {
                    let room = room_arc.lock().unwrap();
                    if room.over || room.turn != user_color { continue; }
                    room.board
                };
                let tx2 = tx.clone();
                tokio::spawn(async move {
                    if let Some(m) = damas_game::pick_ai_move(&board, user_color, "medium") {
                        send_to(&tx2, &ServerMsg::Hint {
                            from: m.piece_from, to: m.piece_to, path: m.path,
                        });
                    }
                });
            }

            ClientMsg::Buzz { code } => {
                let Some(user_color) = my_color else { continue; };
                let Some(room_arc) = state.rooms.get(&code) else { continue; };
                let opponent = match user_color { Color::Red => Color::Black, Color::Black => Color::Red };
                let room = room_arc.lock().unwrap();
                room.send_to_color(opponent, &ServerMsg::Err { error: "buzz".into() });
            }

            ClientMsg::LeaveRoom { code } | ClientMsg::FinishRoom { code } => {
                if let Some(room_arc) = state.rooms.get(&code) {
                    let mut room = room_arc.lock().unwrap();
                    let key = match my_color {
                        Some(Color::Red) => "red", Some(Color::Black) => "black", None => "",
                    };
                    if !key.is_empty() { room.players.remove(key); }
                    my_color = None;
                    current_room = None;
                }
                broadcast_lobby(&state, &tx);
            }
        }
    }

    // Disconnect cleanup
    if let Some(code) = current_room {
        if let Some(room_arc) = state.rooms.get(&code) {
            let mut room = room_arc.lock().unwrap();
            let key = match my_color {
                Some(Color::Red) => "red", Some(Color::Black) => "black", None => "",
            };
            if !key.is_empty() {
                if let Some(slot) = room.players.get_mut(key) {
                    slot.tx = None; // disconnected but keep slot for resume
                }
            }
            room.observers.retain(|obs_tx| !obs_tx.same_channel(&tx));
        }
    }
}

// ──────────────────────────────────────── helpers ────────────────────────────

fn send_msg(tx: &Tx, msg: &ServerMsg) {
    let json = serde_json::to_string(msg).unwrap_or_default();
    let _ = tx.send(json);
}

fn send_to(tx: &Tx, msg: &ServerMsg) {
    send_msg(tx, msg);
}

fn send_err(tx: &Tx, error: &str) {
    send_msg(tx, &ServerMsg::Err { error: error.to_string() });
}

fn broadcast_lobby(state: &Arc<AppState>, _tx: &Tx) {
    let list = state.lobby_list();
    let json = serde_json::to_string(&ServerMsg::LobbyRooms(list)).unwrap_or_default();
    for entry in state.rooms.iter() {
        let room = entry.value().lock().unwrap();
        for slot in room.players.values() {
            if let Some(tx) = &slot.tx { let _ = tx.send(json.clone()); }
        }
        for obs in &room.observers {
            let _ = obs.send(json.clone());
        }
    }
}

async fn handle_game_over(
    state: &Arc<AppState>,
    code:  &str,
    room_arc: Arc<Mutex<Room>>,
    res:  crate::room::GameOverResult,
) {
    {
        let mut room = room_arc.lock().unwrap();
        room.over = true;
        room.winner = res.winner;
        room.broadcast(&ServerMsg::GameOver { winner: res.winner, reason: res.reason.clone() });
        room.broadcast(&ServerMsg::State(room.public_state()));
    }

    // Update ratings
    let (red_id, black_id) = {
        let room = room_arc.lock().unwrap();
        (
            room.players.get("red").map(|s| s.id.clone()),
            room.players.get("black").map(|s| s.id.clone()),
        )
    };

    if res.reason.starts_with("draw") {
        let _ = crate::db::update_rating_after_game(
            &state.pool, red_id.as_deref(), black_id.as_deref(), true,
        ).await;
    } else if let Some(winner) = res.winner {
        let (winner_id, loser_id) = match winner {
            Color::Red   => (red_id.as_deref(), black_id.as_deref()),
            Color::Black => (black_id.as_deref(), red_id.as_deref()),
        };
        let _ = crate::db::update_rating_after_game(
            &state.pool, winner_id, loser_id, false,
        ).await;
    }
}

async fn maybe_play_ai(state: &Arc<AppState>, code: &str, room_arc: Arc<Mutex<Room>>) {
    // Small delay so client receives state before AI moves
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    loop {
        let (should_play, pending_blow_for_human) = {
            let room = room_arc.lock().unwrap();
            let ai_turn = room.ai && room.ai_color == Some(room.turn) && !room.over;
            let blow_for_human = room.pending_blow.as_ref().map(|pb| {
                room.ai_color.map_or(false, |ac| pb.offered_to.map_or(false, |c| c != ac))
            }).unwrap_or(false);
            (ai_turn, blow_for_human)
        };

        if pending_blow_for_human { break; }
        if !should_play { break; }

        let (result, blow_info) = {
            let mut room = room_arc.lock().unwrap();
            let result = room.apply_ai_move();
            let blow_info = room.pending_blow.as_ref().map(|pb| (
                pb.blowable_pieces.clone(),
                room.players.get(match pb.offered_to.unwrap_or(Color::Red) {
                    Color::Red => "red", Color::Black => "black",
                }).and_then(|s| s.tx.clone()),
            ));
            room.broadcast(&ServerMsg::State(room.public_state()));
            (result, blow_info)
        };

        // Notify human of blow opportunity
        if let Some((pieces, Some(human_tx))) = blow_info {
            send_to(&human_tx, &ServerMsg::BlowOffered {
                code: code.to_string(), blowable_pieces: pieces,
            });
            break;
        }

        if let Some(res) = result {
            handle_game_over(state, code, room_arc.clone(), res).await;
            break;
        }

        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}
