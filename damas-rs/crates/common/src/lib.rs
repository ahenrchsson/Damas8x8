use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ── Piece / Board ─────────────────────────────────────────────────────────────
pub type Piece = i8;
pub type Board = [[Piece; 8]; 8];

// ── Color ─────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Red,
    Black,
}

impl Color {
    pub fn flip(self) -> Color {
        match self {
            Color::Red => Color::Black,
            Color::Black => Color::Red,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Color::Red => "red",
            Color::Black => "black",
        }
    }
}

impl std::fmt::Display for Color {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ── Coord ─────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Coord {
    pub r: usize,
    pub c: usize,
}

impl Coord {
    pub fn new(r: usize, c: usize) -> Self {
        Self { r, c }
    }
}

impl std::fmt::Display for Coord {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{},{}", self.r, self.c)
    }
}

// ── Move ─────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Move {
    pub piece_from: Coord,
    pub piece_to: Coord,
    pub path: Vec<Coord>,
    pub is_capture: bool,
    pub promotes: bool,
    pub captured: Vec<Coord>,
}

// ── Player / Room participants ────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Players {
    pub red: Option<PlayerInfo>,
    pub black: Option<PlayerInfo>,
}

// ── Blow state ────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PendingBlow {
    pub blowable_pieces: Vec<Coord>,
    pub piece_color: Color,
    pub offered_to: Option<Color>,
    pub ts: u64,
}

// ── Draw state ────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PendingDraw {
    pub by: Color,
    pub ts: u64,
}

// ── Missed capture ────────────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MissedCapture {
    pub by_color: Color,
    pub blowable_pieces: Vec<Coord>,
}

// ── Last move ─────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LastMove {
    pub color: Color,
    pub from: Coord,
    pub to: Coord,
    pub path: Vec<Coord>,
}

// ── Move history entry ────────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MoveHistoryEntry {
    pub color: Color,
    pub from: Coord,
    pub to: Coord,
    pub capture: bool,
    pub promoted: bool,
    pub turn_count: u32,
}

// ── Chat ──────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub author: String,
    pub text: String,
    pub color: Option<Color>,
    pub ts: u64,
}

// ── Serialized move map entry ─────────────────────────────────────────────────
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SerializedMoveTarget {
    pub to: Coord,
    pub path: Vec<Coord>,
    pub is_capture: bool,
    pub promotes: bool,
}

// ── Full game state (server → client) ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub code: String,
    pub name: String,
    pub board: Board,
    pub turn: Color,
    /// Key: "r,c", value: list of legal targets from that square
    pub move_map: HashMap<String, Vec<SerializedMoveTarget>>,
    pub forced: bool,
    pub over: bool,
    pub players: Players,
    pub pending_blow: Option<PendingBlow>,
    pub pending_draw: Option<PendingDraw>,
    pub missed_capture: Option<MissedCapture>,
    pub last_move: Option<LastMove>,
    /// Key: "red" or "black"
    pub last_moved_by_color: HashMap<String, Option<LastMove>>,
    pub half_move_clock: u32,
    pub turn_count: u32,
    pub mode: String,
    pub difficulty: Option<String>,
    pub ai_color: Option<Color>,
    pub messages: Vec<ChatMessage>,
    pub move_history: Vec<MoveHistoryEntry>,
    pub observers: u32,
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LobbyRoom {
    pub code: String,
    pub name: String,
    pub status: String,
    pub players: Vec<String>,
    pub observers: u32,
}

// ── Client → Server messages ──────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMsg {
    Auth {
        user_id: String,
        username: String,
    },
    CreateRoom {
        name: String,
        mode: String,
        difficulty: Option<String>,
    },
    JoinRoom {
        code: String,
    },
    ObserveRoom {
        code: String,
    },
    MakeMove {
        code: String,
        from: Coord,
        to: Coord,
    },
    BlowPiece {
        code: String,
        target: Coord,
    },
    RequestDraw {
        code: String,
    },
    RespondDraw {
        code: String,
        accept: bool,
    },
    Resign {
        code: String,
    },
    Chat {
        code: String,
        text: String,
    },
    GlobalChat {
        text: String,
    },
    RequestHint {
        code: String,
    },
    Buzz {
        code: String,
    },
    LeaveRoom {
        code: String,
    },
    FinishRoom {
        code: String,
    },
}

// ── Server → Client messages ──────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ServerMsg {
    State(GameState),
    LobbyRooms(Vec<LobbyRoom>),
    GameOver {
        winner: Option<Color>,
        reason: String,
    },
    BlowOffered {
        code: String,
        blowable_pieces: Vec<Coord>,
    },
    DrawOffer {
        code: String,
    },
    Hint {
        from: Coord,
        to: Coord,
        path: Vec<Coord>,
    },
    ChatMsg(ChatMessage),
    GlobalChatMsg(ChatMessage),
    Err {
        error: String,
    },
    UserOk,
    ResumePrompt {
        code: String,
        name: String,
    },
    GlobalChatHistory(Vec<ChatMessage>),
}

// ── Timestamp helper ──────────────────────────────────────────────────────────
pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
