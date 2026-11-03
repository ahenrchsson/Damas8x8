use damas_common::*;
use damas_game::{
    apply_move, board_to_key, compute_moves, get_pieces_that_can_capture, has_any_pieces,
    pick_ai_move, serialize_move_map,
};
use dashmap::DashMap;
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::sync::mpsc;

/// Per-socket sender handle
pub type Tx = mpsc::UnboundedSender<String>;

#[derive(Debug, Clone)]
pub struct PlayerSlot {
    pub id:       String,
    pub username: String,
    pub tx:       Option<Tx>,
}

#[derive(Debug)]
pub struct Room {
    pub code:         String,
    pub name:         String,
    pub board:        Board,
    pub turn:         Color,
    pub turn_count:   u32,
    pub over:         bool,
    pub winner:       Option<Color>,

    pub players:      HashMap<String, PlayerSlot>, // "red" | "black" => slot
    pub observers:    Vec<Tx>,

    pub move_map:     HashMap<String, Vec<SerializedMoveTarget>>,
    pub forced:       bool,

    pub pending_blow: Option<PendingBlow>,
    pub pending_draw: Option<PendingDraw>,
    pub missed_capture: Option<MissedCapture>,
    pub last_move:    Option<LastMove>,
    pub last_moved_by_color: HashMap<String, Option<LastMove>>,

    pub half_move_clock: u32,
    pub board_history:   HashMap<String, u32>,
    pub move_history:    Vec<MoveHistoryEntry>,

    pub messages:     Vec<ChatMessage>,

    pub ai:           bool,
    pub ai_color:     Option<Color>,
    pub difficulty:   String,
    pub mode:         String,
}

impl Room {
    pub fn new(code: String, name: String, mode: &str, difficulty: &str) -> Self {
        let board = damas_game::initial_board();
        let turn  = Color::Red;
        let init_key = board_to_key(&board, turn);
        let mut board_history = HashMap::new();
        board_history.insert(init_key, 1u32);

        let ai       = mode == "ai";
        let ai_color = if ai { Some(Color::Black) } else { None };

        let moves    = compute_moves(&board, turn);
        let forced   = moves.iter().any(|m| m.is_capture);
        let move_map = serialize_move_map(&moves);

        Room {
            code,
            name,
            board,
            turn,
            turn_count: 1,
            over: false,
            winner: None,
            players: HashMap::new(),
            observers: Vec::new(),
            move_map,
            forced,
            pending_blow: None,
            pending_draw: None,
            missed_capture: None,
            last_move: None,
            last_moved_by_color: {
                let mut m = HashMap::new();
                m.insert("red".to_string(), None);
                m.insert("black".to_string(), None);
                m
            },
            half_move_clock: 0,
            board_history,
            move_history: Vec::new(),
            messages: Vec::new(),
            ai,
            ai_color,
            difficulty: difficulty.to_string(),
            mode: mode.to_string(),
        }
    }

    pub fn color_of_player(&self, user_id: &str) -> Option<Color> {
        for (color, slot) in &self.players {
            if slot.id == user_id {
                return match color.as_str() {
                    "red"   => Some(Color::Red),
                    "black" => Some(Color::Black),
                    _       => None,
                };
            }
        }
        None
    }

    pub fn public_state(&self) -> GameState {
        let players = Players {
            red: self.players.get("red").map(|s| PlayerInfo {
                id: s.id.clone(), username: s.username.clone(), sid: None,
            }),
            black: self.players.get("black").map(|s| PlayerInfo {
                id: s.id.clone(), username: s.username.clone(), sid: None,
            }),
        };

        GameState {
            code:         self.code.clone(),
            name:         self.name.clone(),
            board:        self.board,
            turn:         self.turn,
            move_map:     self.move_map.clone(),
            forced:       self.forced,
            over:         self.over,
            players,
            pending_blow: self.pending_blow.clone(),
            pending_draw: self.pending_draw.clone(),
            missed_capture: self.missed_capture.clone(),
            last_move:    self.last_move.clone(),
            last_moved_by_color: self.last_moved_by_color.clone(),
            half_move_clock: self.half_move_clock,
            turn_count:   self.turn_count,
            mode:         self.mode.clone(),
            difficulty:   if self.ai { Some(self.difficulty.clone()) } else { None },
            ai_color:     self.ai_color,
            messages:     self.messages.iter().rev().take(50).rev().cloned().collect(),
            move_history: self.move_history.iter().rev().take(200).rev().cloned().collect(),
            observers:    self.observers.len() as u32,
        }
    }

    /// Recompute move_map + check win/draw conditions.
    /// Returns GameOverResult if game ended, None if still ongoing.
    pub fn recompute(&mut self) -> Option<GameOverResult> {
        let moves    = compute_moves(&self.board, self.turn);
        self.forced  = moves.iter().any(|m| m.is_capture);
        self.move_map = serialize_move_map(&moves);

        if !has_any_pieces(&self.board, Color::Red) {
            self.over = true;
            return Some(GameOverResult { winner: Some(Color::Black), reason: "no_pieces".into() });
        }
        if !has_any_pieces(&self.board, Color::Black) {
            self.over = true;
            return Some(GameOverResult { winner: Some(Color::Red), reason: "no_pieces".into() });
        }
        if moves.is_empty() {
            self.over = true;
            let winner = match self.turn { Color::Red => Color::Black, Color::Black => Color::Red };
            return Some(GameOverResult { winner: Some(winner), reason: "no_moves".into() });
        }

        // Draw checks only on stable positions (no pending blow)
        if self.pending_blow.is_none() {
            if self.half_move_clock >= 40 {
                self.over = true;
                return Some(GameOverResult { winner: None, reason: "draw_40_moves".into() });
            }
            let key   = board_to_key(&self.board, self.turn);
            let count = self.board_history.entry(key).or_insert(0);
            *count += 1;
            if *count >= 3 {
                self.over = true;
                return Some(GameOverResult { winner: None, reason: "draw_repetition".into() });
            }
        }
        None
    }

    pub fn broadcast(&self, msg: &ServerMsg) {
        let json = serde_json::to_string(msg).unwrap_or_default();
        for slot in self.players.values() {
            if let Some(tx) = &slot.tx {
                let _ = tx.send(json.clone());
            }
        }
        for tx in &self.observers {
            let _ = tx.send(json.clone());
        }
    }

    pub fn send_to_color(&self, color: Color, msg: &ServerMsg) {
        let key = match color { Color::Red => "red", Color::Black => "black" };
        if let Some(slot) = self.players.get(key) {
            if let Some(tx) = &slot.tx {
                let json = serde_json::to_string(msg).unwrap_or_default();
                let _ = tx.send(json);
            }
        }
    }

    pub fn apply_human_move(
        &mut self,
        from: Coord,
        to: Coord,
        user_color: Color,
    ) -> Result<Option<GameOverResult>, &'static str> {
        if self.over { return Err("game_over"); }
        if self.turn != user_color { return Err("not_your_turn"); }

        let moves = compute_moves(&self.board, self.turn);
        let m = moves.iter().find(|mv| mv.piece_from == from && mv.piece_to == to)
            .cloned()
            .ok_or("invalid_move")?;

        // Detect skipped capture
        let capture_pieces = get_pieces_that_can_capture(&self.board, self.turn);
        let skipped        = !capture_pieces.is_empty() && !m.is_capture;

        let prev_turn = self.turn;
        self.board    = apply_move(&self.board, &m);

        // Record last move
        let lm = LastMove {
            color: prev_turn, from, to, path: m.path.clone(),
        };
        self.last_move = Some(lm.clone());
        self.last_moved_by_color.insert(
            match prev_turn { Color::Red => "red", Color::Black => "black" }.to_string(),
            Some(lm),
        );

        // Half-move clock
        if m.is_capture || m.promotes {
            self.half_move_clock = 0;
        } else {
            self.half_move_clock += 1;
        }

        self.move_history.push(MoveHistoryEntry {
            color: prev_turn, from, to,
            capture: m.is_capture, promoted: m.promotes, turn_count: self.turn_count,
        });

        self.turn = prev_turn.flip();
        self.turn_count += 1;

        // Compute blowable pieces
        let blowable: Vec<Coord> = if skipped {
            capture_pieces.into_iter().filter(|p| {
                let piece = self.board[p.r][p.c];
                damas_game::color_of(piece).map_or(false, |c| c == prev_turn)
            }).collect()
        } else { vec![] };

        if skipped && !blowable.is_empty() {
            self.pending_blow = Some(PendingBlow {
                blowable_pieces: blowable.clone(),
                piece_color:     prev_turn,
                offered_to:      Some(self.turn),
                ts:              now_ms(),
            });
        } else {
            self.pending_blow = None;
        }

        let result = self.recompute();
        Ok(result)
    }

    /// AI plays its move and returns game-over info if applicable.
    pub fn apply_ai_move(&mut self) -> Option<GameOverResult> {
        if self.over || !self.ai { return None; }
        let Some(ai_color) = self.ai_color else { return None; };
        if self.turn != ai_color { return None; }

        // If there's a pending blow offered to AI, auto-blow
        if let Some(pb) = self.pending_blow.clone() {
            if pb.offered_to.map_or(true, |c| c == self.turn) {
                if let Some(target) = pb.blowable_pieces.first().copied() {
                    let piece = self.board[target.r][target.c];
                    if damas_game::color_of(piece).map_or(false, |c| c == pb.piece_color) {
                        self.board[target.r][target.c] = 0;
                    }
                }
                self.pending_blow  = None;
                self.missed_capture = None;
                return self.recompute();
            }
        }

        self.pending_draw  = None;
        self.missed_capture = None;

        let Some(m) = pick_ai_move(&self.board, ai_color, &self.difficulty) else { return None; };

        let moves      = compute_moves(&self.board, ai_color);
        let has_cap    = moves.iter().any(|mv| mv.is_capture);
        let skipped    = has_cap && !m.is_capture;
        let cap_pieces = get_pieces_that_can_capture(&self.board, ai_color);
        let prev_turn  = ai_color;

        self.board = apply_move(&self.board, &m);

        let lm = LastMove { color: prev_turn, from: m.piece_from, to: m.piece_to, path: m.path.clone() };
        self.last_move = Some(lm.clone());
        self.last_moved_by_color.insert(
            match prev_turn { Color::Red => "red", Color::Black => "black" }.to_string(),
            Some(lm),
        );

        if m.is_capture || m.promotes { self.half_move_clock = 0; } else { self.half_move_clock += 1; }
        self.move_history.push(MoveHistoryEntry {
            color: prev_turn, from: m.piece_from, to: m.piece_to,
            capture: m.is_capture, promoted: m.promotes, turn_count: self.turn_count,
        });

        self.turn = prev_turn.flip();
        self.turn_count += 1;

        let blowable: Vec<Coord> = if skipped {
            cap_pieces.into_iter().filter(|p| {
                damas_game::color_of(self.board[p.r][p.c]).map_or(false, |c| c == prev_turn)
            }).collect()
        } else { vec![] };

        self.pending_blow = if skipped && !blowable.is_empty() {
            Some(PendingBlow {
                blowable_pieces: blowable, piece_color: prev_turn,
                offered_to: Some(self.turn), ts: now_ms(),
            })
        } else { None };

        self.recompute()
    }
}

#[derive(Debug, Clone)]
pub struct GameOverResult {
    pub winner: Option<Color>,
    pub reason: String,
}

// ─────────────────────────────────────────────────────────── AppState ───────

pub struct AppState {
    pub pool:         PgPool,
    pub rooms:        DashMap<String, Arc<Mutex<Room>>>,
    pub global_chat:  Mutex<Vec<ChatMessage>>,
}

impl AppState {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            rooms:       DashMap::new(),
            global_chat: Mutex::new(Vec::new()),
        }
    }

    pub fn lobby_list(&self) -> Vec<LobbyRoom> {
        self.rooms.iter().map(|entry| {
            let r = entry.value().lock().unwrap();
            let players: Vec<String> = r.players.values().map(|s| s.username.clone()).collect();
            let status = if r.over { "finished" }
                else if r.players.len() < 2 { "waiting" }
                else { "in_game" };
            LobbyRoom {
                code: r.code.clone(),
                name: r.name.clone(),
                status: status.to_string(),
                players,
                observers: r.observers.len() as u32,
            }
        }).collect()
    }
}
