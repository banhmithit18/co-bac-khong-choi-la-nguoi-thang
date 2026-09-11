import { combinations, tlValue, TL_RANK } from "./cards.js";
import { luckyIndex, tienlenDeal } from "./luck.js";

function byTl(a, b) {
  return tlValue(a) - tlValue(b);
}

function ranksSeq(cards) {
  const rs = cards.map((c) => TL_RANK[c.r]);
  const uniq = [...new Set(rs)];
  if (uniq.length !== cards.length) return false;
  if (uniq.some((r) => r === 13)) return false;
  uniq.sort((a, b) => a - b);
  for (let i = 1; i < uniq.length; i++) if (uniq[i] !== uniq[i - 1] + 1) return false;
  return true;
}

export function classify(cards) {
  if (!cards?.length) return null;
  const sorted = cards.slice().sort(byTl);
  const n = sorted.length;
  const same = sorted.every((c) => c.r === sorted[0].r);

  if (n === 1) return { type: "single", n, key: tlValue(sorted[0]), cards: sorted };
  if (n === 2 && same) return { type: "pair", n, key: tlValue(sorted[1]), cards: sorted };
  if (n === 3 && same) return { type: "triple", n, key: tlValue(sorted[2]), cards: sorted };
  if (n === 4 && same) return { type: "quad", n, key: tlValue(sorted[3]), cards: sorted };

  if (n >= 6 && n % 2 === 0) {
    const groups = {};
    for (const c of sorted) {
      groups[c.r] = groups[c.r] || [];
      groups[c.r].push(c);
    }
    const keys = Object.keys(groups);
    if (keys.every((k) => groups[k].length === 2) && keys.every((k) => k !== "2")) {
      const rv = keys.map((k) => TL_RANK[k]).sort((a, b) => a - b);
      let seq = true;
      for (let i = 1; i < rv.length; i++) if (rv[i] !== rv[i - 1] + 1) seq = false;
      if (seq) {
        return {
          type: "seqpairs",
          n,
          pairCount: n / 2,
          key: tlValue(sorted[sorted.length - 1]),
          cards: sorted,
        };
      }
    }
  }

  if (n >= 3 && ranksSeq(sorted)) {
    return { type: "straight", n, key: tlValue(sorted[n - 1]), cards: sorted };
  }
  return null;
}

export function beats(next, current) {
  if (!next) return false;
  if (!current) return true;

  const chop2 = current.type === "single" && current.cards[0].r === "2";
  const chopPair2 = current.type === "pair" && current.cards[0].r === "2";

  if (chop2 && next.type === "seqpairs" && next.pairCount >= 3) return true;
  if (chop2 && next.type === "quad") return true;
  if (chopPair2 && next.type === "seqpairs" && next.pairCount >= 4) return true;
  if (chopPair2 && next.type === "quad") return true;
  if (current.type === "seqpairs" && current.pairCount === 3 && next.type === "quad") return true;
  if (current.type === "seqpairs" && current.pairCount === 3 && next.type === "seqpairs" && next.pairCount >= 4) {
    return true;
  }
  if (current.type === "quad" && next.type === "seqpairs" && next.pairCount >= 4) return true;

  if (next.type !== current.type || next.n !== current.n) return false;
  if (next.type === "seqpairs" && next.pairCount !== current.pairCount) return false;
  return next.key > current.key;
}

function contains3s(cards) {
  return cards.some((c) => c.id === "3s");
}

function groupByRank(hand) {
  const g = {};
  for (const c of hand) {
    g[c.r] = g[c.r] || [];
    g[c.r].push(c);
  }
  return g;
}

function generatePlays(hand, current, must3s) {
  const plays = [];
  const add = (cards) => {
    const cls = classify(cards);
    if (!cls) return;
    if (must3s && !contains3s(cards)) return;
    if (!beats(cls, current)) return;
    plays.push(cls);
  };

  for (const c of hand) add([c]);

  const g = groupByRank(hand);
  for (const cards of Object.values(g)) {
    if (cards.length >= 2) add(cards.slice(0, 2));
    if (cards.length >= 3) add(cards.slice(0, 3));
    if (cards.length >= 4) add(cards.slice(0, 4));
  }

  const no2 = hand.filter((c) => c.r !== "2").sort(byTl);
  const rankSeen = {};
  const uniq = [];
  for (const c of no2) {
    if (rankSeen[c.r]) continue;
    rankSeen[c.r] = true;
    uniq.push(c);
  }
  uniq.sort((a, b) => TL_RANK[a.r] - TL_RANK[b.r]);
  for (let len = 3; len <= uniq.length; len++) {
    for (let i = 0; i + len <= uniq.length; i++) {
      const slice = uniq.slice(i, i + len);
      if (ranksSeq(slice)) add(slice);
    }
  }

  const pairRanks = Object.keys(g)
    .filter((r) => r !== "2" && g[r].length >= 2)
    .sort((a, b) => TL_RANK[a] - TL_RANK[b]);
  for (let count = 3; count <= pairRanks.length; count++) {
    for (let i = 0; i + count <= pairRanks.length; i++) {
      const slice = pairRanks.slice(i, i + count);
      let seq = true;
      for (let k = 1; k < slice.length; k++) {
        if (TL_RANK[slice[k]] !== TL_RANK[slice[k - 1]] + 1) seq = false;
      }
      if (!seq) continue;
      const cards = slice.flatMap((r) => g[r].slice(0, 2));
      add(cards);
    }
  }

  if (hand.length <= 8) {
    for (const combo of combinations(hand, Math.min(hand.length, 5))) add(combo);
  }

  const seen = new Set();
  return plays.filter((p) => {
    const id = p.cards.map((c) => c.id).sort().join(",");
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function takeCards(hand, ids) {
  const set = new Set(ids);
  const taken = [];
  const rest = [];
  for (const c of hand) {
    if (set.has(c.id)) taken.push(c);
    else rest.push(c);
  }
  if (taken.length !== ids.length) return null;
  return { taken, rest };
}

export function createTienlen(players) {
  const luckyIdx = luckyIndex(players);
  const hands = tienlenDeal(players.length, luckyIdx);
  const seats = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    isBot: !!p.isBot,
    hand: hands[i].sort(byTl),
    passed: false,
    done: false,
  }));

  let start = seats.findIndex((p) => p.hand.some((c) => c.id === "3s"));
  if (start < 0) start = 0;

  return {
    kind: "tienlen",
    phase: "play",
    players: seats,
    turn: start,
    current: null,
    lastBy: null,
    must3s: true,
    ranking: [],
    message: `${seats[start].name} ra bài trước (có 3♠).`,
    log: [],
  };
}

function nextAlive(game, from) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = game.players[idx];
    if (!p.done && !p.passed) return idx;
  }
  return -1;
}

function aliveNotDone(game) {
  return game.players.filter((p) => !p.done);
}

function clearTrick(game, winnerIdx) {
  game.current = null;
  game.lastBy = null;
  for (const p of game.players) p.passed = p.done;
  game.turn = winnerIdx;
  game.message = `${game.players[winnerIdx].name} được quyền ra bài.`;
}

export function tlPlay(game, playerId, cardIds) {
  if (game.phase !== "play") return { ok: false, error: "Ván đã kết thúc." };
  const idx = game.players.findIndex((p) => p.id === playerId);
  if (idx !== game.turn) return { ok: false, error: "Chưa tới lượt." };
  const p = game.players[idx];
  const pulled = takeCards(p.hand, cardIds);
  if (!pulled) return { ok: false, error: "Bạn không cầm những lá này." };
  const cls = classify(pulled.taken);
  if (!cls) return { ok: false, error: "Không phải bộ bài hợp lệ." };
  if (game.must3s && !contains3s(pulled.taken)) {
    return { ok: false, error: "Lá đầu phải có 3♠." };
  }
  if (!beats(cls, game.current)) return { ok: false, error: "Không chặt được nước vừa rồi." };

  p.hand = pulled.rest;
  game.current = cls;
  game.lastBy = p.id;
  game.must3s = false;
  game.log.push({ name: p.name, cards: cls.cards, type: cls.type });
  if (game.log.length > 8) game.log.shift();

  if (p.hand.length === 0) {
    p.done = true;
    p.passed = true;
    game.ranking.push({ id: p.id, name: p.name });
    game.message = `${p.name} đã hết bài.`;
    const left = aliveNotDone(game);
    if (left.length <= 1) {
      if (left[0]) game.ranking.push({ id: left[0].id, name: left[0].name });
      game.phase = "over";
      game.turn = -1;
      return { ok: true };
    }
  }

  for (const o of game.players) {
    if (o !== p && !o.done) o.passed = false;
  }

  const nxt = nextAlive(game, idx);
  if (nxt < 0 || nxt === idx) {
    const winIdx = game.players.findIndex((x) => x.id === game.lastBy);
    clearTrick(game, winIdx);
  } else {
    game.turn = nxt;
    game.message = `${game.players[nxt].name} tới lượt.`;
  }
  return { ok: true };
}

export function tlPass(game, playerId) {
  if (game.phase !== "play") return { ok: false, error: "Ván đã kết thúc." };
  const idx = game.players.findIndex((p) => p.id === playerId);
  if (idx !== game.turn) return { ok: false, error: "Chưa tới lượt." };
  if (!game.current) return { ok: false, error: "Người mở bài không được bỏ." };
  if (game.must3s) return { ok: false, error: "Phải đánh 3♠." };

  const p = game.players[idx];
  p.passed = true;
  game.log.push({ name: p.name, pass: true });
  if (game.log.length > 8) game.log.shift();

  const nxt = nextAlive(game, idx);
  if (nxt < 0 || nxt === idx || game.players[nxt].id === game.lastBy) {
    const winIdx = game.players.findIndex((x) => x.id === game.lastBy);
    if (winIdx >= 0 && !game.players[winIdx].done) clearTrick(game, winIdx);
    else {
      const lead = nextAlive(game, idx);
      if (lead >= 0) clearTrick(game, lead);
    }
  } else {
    game.turn = nxt;
    game.message = `${game.players[nxt].name} tới lượt.`;
  }
  return { ok: true };
}

export function tlBotAction(game) {
  const p = game.players[game.turn];
  if (!p || !p.isBot) return null;
  const plays = generatePlays(p.hand, game.current, game.must3s && p.hand.some((c) => c.id === "3s"));
  if (!plays.length) {
    if (!game.current) {
      const lowest = p.hand.slice().sort(byTl)[0];
      return tlPlay(game, p.id, [lowest.id]);
    }
    return tlPass(game, p.id);
  }
  plays.sort((a, b) => a.cards.length - b.cards.length || a.key - b.key);
  return tlPlay(
    game,
    p.id,
    plays[0].cards.map((c) => c.id)
  );
}

export function publicTienlen(game, viewerId) {
  return {
    kind: "tienlen",
    phase: game.phase,
    message: game.message,
    current: game.current,
    lastBy: game.lastBy,
    must3s: game.must3s,
    ranking: game.ranking,
    log: game.log,
    turn: game.turn >= 0 ? game.players[game.turn].id : null,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      count: p.hand.length,
      passed: p.passed,
      done: p.done,
      hand: p.id === viewerId ? p.hand : [],
      you: p.id === viewerId,
    })),
  };
}
