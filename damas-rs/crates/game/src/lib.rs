use std::collections::HashMap;
use std::time::{Instant, Duration};

use damas_common::{Board, Color, Coord, Move, Piece, SerializedMoveTarget};

// ── Constants ─────────────────────────────────────────────────────────────────
const DIAGONALS: [(i32, i32); 4] = [(-1, -1), (-1, 1), (1, -1), (1, 1)];
const WIN_SCORE: i32 = 50_000;
const QUIESCENCE_MAX_DEPTH: i32 = 6;

// ── Piece-Square Tables ───────────────────────────────────────────────────────
const MAN_PST_RED: [[i32; 8]; 8] = [
    [ 0,  5,  0,  5,  0,  5,  0,  5],
    [ 4,  0,  6,  0,  6,  0,  4,  0],
    [ 0,  4,  0,  8,  0,  8,  0,  4],
    [ 3,  0,  8,  0, 10,  0,  3,  0],
    [ 0,  3,  0, 10,  0,  8,  0,  3],
    [ 4,  0,  8,  0,  8,  0,  4,  0],
    [ 0,  6,  0,  6,  0,  6,  0,  6],
    [ 8,  0,  8,  0,  8,  0,  8,  0],
];

const MAN_PST_BLACK: [[i32; 8]; 8] = [
    [ 8,  0,  8,  0,  8,  0,  8,  0],
    [ 0,  6,  0,  6,  0,  6,  0,  6],
    [ 4,  0,  8,  0,  8,  0,  4,  0],
    [ 0,  3,  0, 10,  0,  8,  0,  3],
    [ 3,  0,  8,  0, 10,  0,  3,  0],
    [ 0,  4,  0,  8,  0,  8,  0,  4],
    [ 4,  0,  6,  0,  6,  0,  4,  0],
    [ 0,  5,  0,  5,  0,  5,  0,  5],
];

const KING_PST: [[i32; 8]; 8] = [
    [ 0,  4,  0,  4,  0,  4,  0,  4],
    [ 4,  0,  6,  0,  6,  0,  4,  0],
    [ 0,  6,  0, 10,  0, 10,  0,  6],
    [ 4,  0, 10,  0, 12,  0,  4,  0],
    [ 0,  4,  0, 12,  0, 10,  0,  4],
    [ 6,  0, 10,  0, 10,  0,  6,  0],
    [ 0,  4,  0,  6,  0,  6,  0,  4],
    [ 4,  0,  4,  0,  4,  0,  4,  0],
];

// Evaluation weights
const W_MAN: i32 = 100;
const W_KING: i32 = 360;
const W_ADVANCE: i32 = 6;
const W_BACK_RANK: i32 = 8;
const W_MOBILITY: i32 = 4;
const W_CONNECTED: i32 = 6;
const W_BLOCKED: i32 = -10;
const W_CAPTURE_THREAT: i32 = -15;
const W_PROMOTION_THREAT: i32 = 22;
const W_KING_ADVANTAGE: i32 = 30;
const W_PST: i32 = 1;

// ── Board helpers ─────────────────────────────────────────────────────────────
pub fn color_of(p: Piece) -> Option<Color> {
    if p > 0 { Some(Color::Red) }
    else if p < 0 { Some(Color::Black) }
    else { None }
}

#[inline]
fn is_king(p: Piece) -> bool { p.abs() == 2 }

#[inline]
fn in_bounds(r: i32, c: i32) -> bool { r >= 0 && r < 8 && c >= 0 && c < 8 }

fn would_promote(p: Piece, r: usize) -> bool {
    match color_of(p) {
        Some(Color::Red)   => r == 0 && p.abs() == 1,
        Some(Color::Black) => r == 7 && p.abs() == 1,
        None => false,
    }
}

fn promote_if_needed(p: Piece) -> Piece {
    if p.abs() == 1 { if p > 0 { 2 } else { -2 } } else { p }
}

fn dirs_for_piece(p: Piece) -> &'static [(i32, i32)] {
    if is_king(p) {
        return &DIAGONALS;
    }
    match color_of(p) {
        Some(Color::Red)   => &[(-1, -1), (-1, 1)],
        Some(Color::Black) => &[(1, -1), (1, 1)],
        None => &[],
    }
}

pub fn coord_key(coord: Coord) -> String {
    format!("{},{}", coord.r, coord.c)
}

pub fn board_to_key(board: &Board, turn: Color) -> String {
    let mut cells = Vec::new();
    for r in 0..8 {
        for c in 0..8 {
            let v = board[r][c];
            if v != 0 {
                if v > 0 {
                    cells.push(format!("{}{}+{}", r, c, v));
                } else {
                    cells.push(format!("{}{}{}", r, c, v));
                }
            }
        }
    }
    format!("{}:{}", turn.as_str().chars().next().unwrap(), cells.join(","))
}

pub fn clone_board(board: &Board) -> Board {
    *board
}

pub fn initial_board() -> Board {
    let mut b = [[0i8; 8]; 8];
    for r in 0..3usize {
        for c in 0..8usize {
            if (r + c) % 2 == 1 { b[r][c] = -1; }
        }
    }
    for r in 5..8usize {
        for c in 0..8usize {
            if (r + c) % 2 == 1 { b[r][c] = 1; }
        }
    }
    b
}

pub fn has_any_pieces(board: &Board, color: Color) -> bool {
    for r in 0..8 {
        for c in 0..8 {
            if color_of(board[r][c]) == Some(color) { return true; }
        }
    }
    false
}

pub fn apply_move(board: &Board, m: &Move) -> Board {
    let mut b = clone_board(board);
    let mut piece = b[m.piece_from.r][m.piece_from.c];
    b[m.piece_from.r][m.piece_from.c] = 0;
    for cap in &m.captured {
        b[cap.r][cap.c] = 0;
    }
    if m.promotes || would_promote(piece, m.piece_to.r) {
        piece = promote_if_needed(piece);
    }
    b[m.piece_to.r][m.piece_to.c] = piece;
    b
}

// ── Move generation ───────────────────────────────────────────────────────────

fn build_move(piece: Piece, path: Vec<Coord>, captures: Vec<Coord>) -> Move {
    let last = *path.last().unwrap();
    Move {
        piece_from: path[0],
        piece_to: last,
        promotes: !is_king(piece) && would_promote(piece, last.r),
        is_capture: !captures.is_empty(),
        captured: captures,
        path,
    }
}

struct DfsNode {
    r: usize,
    c: usize,
    board: Board,
    caps: Vec<Coord>,
    path: Vec<Coord>,
}

fn generate_man_captures(board: &Board, from: Coord) -> Vec<Move> {
    let v = board[from.r][from.c];
    if color_of(v).is_none() { return vec![]; }
    let mut results = Vec::new();

    let start = DfsNode {
        r: from.r, c: from.c,
        board: clone_board(board),
        caps: vec![],
        path: vec![from],
    };

    fn dfs(node: DfsNode, v: Piece, results: &mut Vec<Move>) {
        let col = color_of(v).unwrap();
        let opp = col.flip();
        let mut extended = false;

        for &(dr, dc) in dirs_for_piece(v) {
            let mid_r = node.r as i32 + dr;
            let mid_c = node.c as i32 + dc;
            let land_r = mid_r + dr;
            let land_c = mid_c + dc;
            if !in_bounds(mid_r, mid_c) || !in_bounds(land_r, land_c) { continue; }
            let (mr, mc) = (mid_r as usize, mid_c as usize);
            let (lr, lc) = (land_r as usize, land_c as usize);
            let mid_piece = node.board[mr][mc];
            if color_of(mid_piece) != Some(opp) { continue; }
            if node.board[lr][lc] != 0 { continue; }

            let promotes_here = would_promote(v, lr);
            let mut nb = clone_board(&node.board);
            nb[node.r][node.c] = 0;
            nb[mr][mc] = 0;
            nb[lr][lc] = v;

            let mut new_caps = node.caps.clone();
            new_caps.push(Coord::new(mr, mc));
            let mut new_path = node.path.clone();
            new_path.push(Coord::new(lr, lc));

            if promotes_here {
                results.push(build_move(v, new_path, new_caps));
                extended = true;
                continue;
            }

            let next = DfsNode { r: lr, c: lc, board: nb, caps: new_caps, path: new_path };
            dfs(next, v, results);
            extended = true;
        }

        if !extended && !node.caps.is_empty() {
            results.push(build_move(v, node.path, node.caps));
        }
    }

    dfs(start, v, &mut results);
    results
}

fn generate_king_captures(board: &Board, from: Coord) -> Vec<Move> {
    let v = board[from.r][from.c];
    if color_of(v).is_none() || !is_king(v) { return vec![]; }
    let mut results = Vec::new();

    let start = DfsNode {
        r: from.r, c: from.c,
        board: clone_board(board),
        caps: vec![],
        path: vec![from],
    };

    fn dfs(node: DfsNode, v: Piece, results: &mut Vec<Move>) {
        let col = color_of(v).unwrap();
        let opp = col.flip();
        let mut extended = false;

        for &(dr, dc) in &DIAGONALS {
            let mut enemy: Option<Coord> = None;
            let mut step = 1i32;
            let mut landing_squares: Vec<Coord> = Vec::new();

            loop {
                let nr = node.r as i32 + dr * step;
                let nc = node.c as i32 + dc * step;
                if !in_bounds(nr, nc) { break; }
                let (nru, ncu) = (nr as usize, nc as usize);
                let cell = node.board[nru][ncu];
                if cell == 0 {
                    if enemy.is_some() {
                        landing_squares.push(Coord::new(nru, ncu));
                    }
                    step += 1;
                    continue;
                }
                let cell_color = color_of(cell);
                if cell_color == Some(col) { break; }
                if cell_color == Some(opp) {
                    if enemy.is_some() { break; }
                    enemy = Some(Coord::new(nru, ncu));
                    step += 1;
                    continue;
                }
                break;
            }

            let enemy_coord = match enemy { Some(e) => e, None => continue };
            for landing in landing_squares {
                let mut nb = clone_board(&node.board);
                nb[node.r][node.c] = 0;
                nb[enemy_coord.r][enemy_coord.c] = 0;
                nb[landing.r][landing.c] = v;

                let mut new_caps = node.caps.clone();
                new_caps.push(enemy_coord);
                let mut new_path = node.path.clone();
                new_path.push(landing);

                let next = DfsNode { r: landing.r, c: landing.c, board: nb, caps: new_caps, path: new_path };
                dfs(next, v, results);
                extended = true;
            }
        }

        if !extended && !node.caps.is_empty() {
            results.push(build_move(v, node.path, node.caps));
        }
    }

    dfs(start, v, &mut results);
    results
}

fn generate_all_captures(board: &Board, color: Color) -> Vec<Move> {
    let mut caps = Vec::new();
    for r in 0..8 {
        for c in 0..8 {
            let v = board[r][c];
            if color_of(v) != Some(color) { continue; }
            let from = Coord::new(r, c);
            if is_king(v) {
                caps.extend(generate_king_captures(board, from));
            } else {
                caps.extend(generate_man_captures(board, from));
            }
        }
    }
    caps
}

fn generate_normal_moves(board: &Board, color: Color) -> Vec<Move> {
    let mut moves = Vec::new();
    for r in 0..8 {
        for c in 0..8 {
            let v = board[r][c];
            if color_of(v) != Some(color) { continue; }
            let from = Coord::new(r, c);
            if is_king(v) {
                for &(dr, dc) in &DIAGONALS {
                    for step in 1..8i32 {
                        let tr = r as i32 + dr * step;
                        let tc = c as i32 + dc * step;
                        if !in_bounds(tr, tc) { break; }
                        let (tru, tcu) = (tr as usize, tc as usize);
                        if board[tru][tcu] != 0 { break; }
                        moves.push(build_move(v, vec![from, Coord::new(tru, tcu)], vec![]));
                    }
                }
            } else {
                for &(dr, dc) in dirs_for_piece(v) {
                    let tr = r as i32 + dr;
                    let tc = c as i32 + dc;
                    if !in_bounds(tr, tc) { continue; }
                    let (tru, tcu) = (tr as usize, tc as usize);
                    if board[tru][tcu] != 0 { continue; }
                    moves.push(build_move(v, vec![from, Coord::new(tru, tcu)], vec![]));
                }
            }
        }
    }
    moves
}

fn filter_by_quantity_and_quality(captures: Vec<Move>) -> Vec<Move> {
    if captures.is_empty() { return vec![]; }
    let max_caps = captures.iter().map(|m| m.captured.len()).max().unwrap_or(0);
    let with_max: Vec<Move> = captures.into_iter().filter(|m| m.captured.len() == max_caps).collect();
    // (king quality not tracked in this simplified version — kings are just Coords, not typed)
    with_max
}

pub struct ComputedMoves {
    pub forced: bool,
    pub moves: Vec<Move>,
    pub all_captures: Vec<Move>,
    pub pieces_with_capture: Vec<Coord>,
}

pub fn compute_moves(board: &Board, color: Color) -> ComputedMoves {
    let all_captures = generate_all_captures(board, color);
    let pieces_with_capture: Vec<Coord> = {
        let mut seen = std::collections::HashSet::new();
        all_captures.iter()
            .filter(|m| seen.insert(coord_key(m.piece_from)))
            .map(|m| m.piece_from)
            .collect()
    };
    let forced = !all_captures.is_empty();
    let filtered = filter_by_quantity_and_quality(all_captures.clone());
    let normals = generate_normal_moves(board, color);
    let mut moves = filtered.clone();
    if !forced { moves.extend(normals); }
    // When forced, return only the best captures; otherwise all normals
    // Actually follow JS: all_captures + normals for moves list
    let all_moves = {
        let mut v = all_captures.clone();
        v.extend(normals);
        v
    };
    ComputedMoves {
        forced,
        moves: if forced { filtered } else { all_moves },
        all_captures,
        pieces_with_capture,
    }
}

pub fn get_pieces_that_can_capture(board: &Board, color: Color) -> Vec<Coord> {
    compute_moves(board, color).pieces_with_capture
}

pub fn serialize_move_map(moves: &[Move]) -> HashMap<String, Vec<SerializedMoveTarget>> {
    let mut map: HashMap<String, Vec<SerializedMoveTarget>> = HashMap::new();
    for m in moves {
        let key = coord_key(m.piece_from);
        map.entry(key).or_default().push(SerializedMoveTarget {
            to: m.piece_to,
            path: m.path.clone(),
            is_capture: m.is_capture,
            promotes: m.promotes,
        });
    }
    map
}

// ── Evaluation ────────────────────────────────────────────────────────────────

pub fn evaluate_board(board: &Board, perspective: Color) -> i32 {
    let mut score = 0i32;
    let (mut my_men, mut opp_men, mut my_kings, mut opp_kings) = (0i32, 0i32, 0i32, 0i32);
    let (mut my_advance, mut opp_advance) = (0i32, 0i32);
    let (mut my_back, mut opp_back) = (0i32, 0i32);
    let (mut my_conn, mut opp_conn) = (0i32, 0i32);
    let (mut my_blocked, mut opp_blocked) = (0i32, 0i32);
    let (mut my_promo, mut opp_promo) = (0i32, 0i32);
    let (mut my_pst, mut opp_pst) = (0i32, 0i32);

    for r in 0..8usize {
        for c in 0..8usize {
            let v = board[r][c];
            if v == 0 { continue; }
            let col = color_of(v).unwrap();
            let mine = col == perspective;
            let king = is_king(v);
            let material = if king { W_KING } else { W_MAN };
            score += if mine { material } else { -material };
            if mine { if king { my_kings += 1 } else { my_men += 1 } }
            else    { if king { opp_kings += 1 } else { opp_men += 1 } }

            let pst = if king { KING_PST[r][c] } else if col == Color::Red { MAN_PST_RED[r][c] } else { MAN_PST_BLACK[r][c] };
            if mine { my_pst += pst } else { opp_pst += pst }

            if !king {
                let adv = if col == Color::Red { 7 - r as i32 } else { r as i32 };
                if mine { my_advance += adv } else { opp_advance += adv }
                let is_back = (col == Color::Red && r == 7) || (col == Color::Black && r == 0);
                if is_back { if mine { my_back += 1 } else { opp_back += 1 } }
                let near_promo = (col == Color::Red && r <= 2) || (col == Color::Black && r >= 5);
                if near_promo { if mine { my_promo += 1 } else { opp_promo += 1 } }

                let forward: i32 = if col == Color::Red { -1 } else { 1 };
                let mut has_move = false;
                'outer: for &dc in &[-1i32, 1] {
                    let tr = r as i32 + forward;
                    let tc = c as i32 + dc;
                    if in_bounds(tr, tc) && board[tr as usize][tc as usize] == 0 { has_move = true; break; }
                    let jr = r as i32 + forward * 2;
                    let jc = c as i32 + dc * 2;
                    if in_bounds(jr, jc) && in_bounds(tr, tc) {
                        let mid = board[tr as usize][tc as usize];
                        if color_of(mid) == Some(col.flip()) && board[jr as usize][jc as usize] == 0 {
                            has_move = true; break 'outer;
                        }
                    }
                }
                if !has_move { if mine { my_blocked += 1 } else { opp_blocked += 1 } }
            }

            for &(dr, dc) in &DIAGONALS {
                let nr = r as i32 + dr;
                let nc = c as i32 + dc;
                if !in_bounds(nr, nc) { continue; }
                if color_of(board[nr as usize][nc as usize]) == Some(col) {
                    if mine { my_conn += 1 } else { opp_conn += 1 }
                }
            }
        }
    }

    score += (my_kings - opp_kings) * W_KING_ADVANTAGE;
    score += (my_advance - opp_advance) * W_ADVANCE;
    score += (my_back - opp_back) * W_BACK_RANK;
    score += (my_conn - opp_conn) * W_CONNECTED;
    score += (my_blocked - opp_blocked) * W_BLOCKED;
    score += (my_promo - opp_promo) * W_PROMOTION_THREAT;
    score += (my_pst - opp_pst) * W_PST;

    let my_moves = compute_moves(board, perspective);
    let opp_moves = compute_moves(board, perspective.flip());
    score += (my_moves.moves.len() as i32 - opp_moves.moves.len() as i32) * W_MOBILITY;
    if my_moves.moves.is_empty()  { score -= WIN_SCORE / 2; }
    if opp_moves.moves.is_empty() { score += WIN_SCORE / 2; }
    score += W_CAPTURE_THREAT * opp_moves.all_captures.len() as i32;

    let total = my_men + my_kings + opp_men + opp_kings;
    if total <= 8 {
        score += (my_kings - opp_kings) * 40;
        score += (my_promo - opp_promo) * 18;
    }

    score
}

// ── AI / Search ───────────────────────────────────────────────────────────────

fn move_signature(m: &Move) -> String {
    let path_sig: String = m.path.iter().map(|p| format!("{},{}", p.r, p.c)).collect::<Vec<_>>().join("|");
    format!("{}#{}", path_sig, m.captured.iter().map(|c| format!("{},{}", c.r, c.c)).collect::<Vec<_>>().join("|"))
}

#[derive(Clone)]
struct TtEntry {
    depth: i32,
    score: i32,
    flag: TtFlag,
    best_move_sig: Option<String>,
}

#[derive(Clone, PartialEq)]
enum TtFlag { Exact, Lower, Upper }

struct SearchState {
    tt: HashMap<String, TtEntry>,
    killers: HashMap<i32, [Option<String>; 2]>,
    history: HashMap<String, i32>,
    deadline: Option<Instant>,
    aborted: bool,
    use_tt: bool,
    use_quiescence: bool,
}

impl SearchState {
    fn new(use_tt: bool, use_quiescence: bool, time_limit_ms: Option<u64>) -> Self {
        Self {
            tt: HashMap::new(),
            killers: HashMap::new(),
            history: HashMap::new(),
            deadline: time_limit_ms.map(|ms| Instant::now() + Duration::from_millis(ms)),
            aborted: false,
            use_tt,
            use_quiescence,
        }
    }

    fn check_time(&mut self) {
        if let Some(dl) = self.deadline {
            if Instant::now() >= dl { self.aborted = true; }
        }
    }
}

fn order_score(m: &Move, state: &SearchState, depth: i32, best_sig: Option<&str>) -> i32 {
    let sig = move_signature(m);
    let mut s = 0i32;
    if let Some(bs) = best_sig { if sig == bs { s += 10_000; } }
    if m.is_capture { s += 4_000 + m.captured.len() as i32 * 300; }
    if m.promotes { s += 1_800; }
    if let Some(arr) = state.killers.get(&depth) {
        if arr.iter().any(|k| k.as_deref() == Some(&sig)) { s += 900; }
    }
    s += state.history.get(&sig).copied().unwrap_or(0);
    s
}

fn order_moves(moves: Vec<Move>, state: &SearchState, depth: i32, best_sig: Option<&str>) -> Vec<Move> {
    let mut scored: Vec<(Move, i32)> = moves.into_iter().map(|m| {
        let s = order_score(&m, state, depth, best_sig);
        (m, s)
    }).collect();
    scored.sort_by(|a, b| b.1.cmp(&a.1));
    scored.into_iter().map(|(m, _)| m).collect()
}

fn quiescence(board: &Board, color: Color, mut alpha: i32, beta: i32, state: &mut SearchState, depth: i32) -> i32 {
    state.check_time();
    if state.aborted { return 0; }
    let stand = evaluate_board(board, color);
    if stand >= beta { return beta; }
    if stand > alpha { alpha = stand; }
    if depth <= 0 { return stand; }
    let caps = generate_all_captures(board, color);
    if caps.is_empty() { return stand; }
    let ordered = order_moves(caps, state, depth, None);
    for m in ordered {
        let nb = apply_move(board, &m);
        let score = -quiescence(&nb, color.flip(), -beta, -alpha, state, depth - 1);
        if score >= beta { return beta; }
        if score > alpha { alpha = score; }
    }
    alpha
}

fn negamax(board: &Board, color: Color, depth: i32, mut alpha: i32, mut beta: i32, state: &mut SearchState) -> i32 {
    state.check_time();
    if state.aborted { return 0; }

    let key = board_to_key(board, color);
    let cached_best = if state.use_tt {
        if let Some(entry) = state.tt.get(&key).cloned() {
            if entry.depth >= depth {
                match entry.flag {
                    TtFlag::Exact => return entry.score,
                    TtFlag::Lower => { if entry.score > alpha { alpha = entry.score; } }
                    TtFlag::Upper => { if entry.score < beta { beta = entry.score; } }
                }
                if alpha >= beta { return entry.score; }
            }
            entry.best_move_sig.clone()
        } else { None }
    } else { None };

    let cm = compute_moves(board, color);
    if cm.moves.is_empty() { return -WIN_SCORE + depth; }

    if depth == 0 {
        if state.use_quiescence && !cm.all_captures.is_empty() {
            return quiescence(board, color, alpha, beta, state, QUIESCENCE_MAX_DEPTH);
        }
        return evaluate_board(board, color);
    }

    let ordered = order_moves(cm.moves, state, depth, cached_best.as_deref());
    let orig_alpha = alpha;
    let mut best_score = i32::MIN;
    let mut best_move_sig: Option<String> = None;

    for m in &ordered {
        let nb = apply_move(board, m);
        let score = -negamax(&nb, color.flip(), depth - 1, -beta, -alpha, state);
        if state.aborted { break; }
        if score > best_score {
            best_score = score;
            best_move_sig = Some(move_signature(m));
        }
        if score > alpha { alpha = score; }
        if alpha >= beta {
            let sig = move_signature(m);
            let entry = state.killers.entry(depth).or_insert([None, None]);
            if entry[0].as_deref() != Some(&sig) {
                entry[1] = entry[0].take();
                entry[0] = Some(sig.clone());
            }
            *state.history.entry(sig).or_insert(0) += depth * depth;
            break;
        }
    }

    if !state.aborted && state.use_tt {
        let flag = if best_score <= orig_alpha { TtFlag::Upper }
                   else if best_score >= beta  { TtFlag::Lower }
                   else                        { TtFlag::Exact };
        state.tt.insert(key, TtEntry { depth, score: best_score, flag, best_move_sig });
    }
    best_score
}

struct AiConfig {
    max_depth: i32,
    time_limit_ms: Option<u64>,
    iterative_deepening: bool,
    use_tt: bool,
    use_quiescence: bool,
    randomness: f64,
    blunder_chance: f64,
}

fn ai_config(difficulty: &str) -> AiConfig {
    match difficulty {
        "medium" => AiConfig { max_depth: 5, time_limit_ms: Some(250), iterative_deepening: false, use_tt: false,  use_quiescence: true,  randomness: 0.2,  blunder_chance: 0.1  },
        "hard"   => AiConfig { max_depth: 8, time_limit_ms: Some(700), iterative_deepening: true,  use_tt: true,   use_quiescence: true,  randomness: 0.0,  blunder_chance: 0.0  },
        "extreme"=> AiConfig { max_depth:11, time_limit_ms: Some(1200),iterative_deepening: true,  use_tt: true,   use_quiescence: true,  randomness: 0.0,  blunder_chance: 0.0  },
        _ =>        AiConfig { max_depth: 3, time_limit_ms: Some(120), iterative_deepening: false, use_tt: false,  use_quiescence: false, randomness: 0.6,  blunder_chance: 0.25 },
    }
}

pub fn pick_ai_move(board: &Board, color: Color, difficulty: &str) -> Option<Move> {
    let cfg = ai_config(difficulty);
    let cm = compute_moves(board, color);
    let legal = cm.moves;
    if legal.is_empty() { return None; }

    let mut state = SearchState::new(cfg.use_tt, cfg.use_quiescence, cfg.time_limit_ms);

    let chosen = if cfg.iterative_deepening {
        let mut best = legal[0].clone();
        'id: for depth in 1..=cfg.max_depth {
            if state.aborted { break; }
            let ordered = order_moves(legal.clone(), &state, depth, None);
            let mut local_best = ordered[0].clone();
            let mut local_score = i32::MIN;
            for m in &ordered {
                state.check_time();
                if state.aborted { break 'id; }
                let nb = apply_move(board, m);
                let score = -negamax(&nb, color.flip(), depth - 1, i32::MIN / 2, i32::MAX / 2, &mut state);
                if score > local_score { local_score = score; local_best = m.clone(); }
            }
            if !state.aborted { best = local_best; }
        }
        best
    } else {
        let depth = cfg.max_depth.max(1);
        let mut scored: Vec<(Move, i32)> = Vec::new();
        let ordered = order_moves(legal.clone(), &state, depth, None);
        for m in ordered {
            state.check_time();
            if state.aborted { break; }
            let nb = apply_move(board, &m);
            let score = -negamax(&nb, color.flip(), depth - 1, i32::MIN / 2, i32::MAX / 2, &mut state);
            scored.push((m, score));
        }
        if scored.is_empty() { return Some(legal[0].clone()); }
        scored.sort_by(|a, b| b.1.cmp(&a.1));

        // blunder / randomness
        use rand::Rng;
        let mut rng = rand::thread_rng();
        if cfg.blunder_chance > 0.0 && scored.len() > 1 && rng.gen::<f64>() < cfg.blunder_chance {
            scored[1].0.clone()
        } else if cfg.randomness > 0.0 && scored.len() > 1 {
            let top = ((scored.len() as f64 * cfg.randomness).ceil() as usize).max(2).min(scored.len());
            let idx = rng.gen_range(0..top);
            scored[idx].0.clone()
        } else {
            scored[0].0.clone()
        }
    };

    Some(chosen)
}
