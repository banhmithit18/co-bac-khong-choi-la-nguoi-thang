import { addHistory, combinations, tlValue, TL_RANK } from "./cards.js";
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
  for (const cards of Object.values(g)) cards.sort(byTl);
  return g;
}

const TL_FROM_VAL = Object.fromEntries(Object.entries(TL_RANK).map(([r, v]) => [v, r]));

function rankSlice(g, r, n, high) {
  const cards = g[r] || [];
  if (cards.length < n) return [];
  return high ? cards.slice(-n) : cards.slice(0, n);
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
    if (cards.length >= 2) {
      add(cards.slice(0, 2));
      add(cards.slice(-2));
    }
    if (cards.length >= 3) {
      add(cards.slice(0, 3));
      add(cards.slice(-3));
    }
    if (cards.length >= 4) add(cards.slice(0, 4));
  }

  const straightRanks = Object.keys(g)
    .filter((r) => r !== "2")
    .sort((a, b) => TL_RANK[a] - TL_RANK[b]);
  for (let len = 3; len <= straightRanks.length; len++) {
    for (let i = 0; i + len <= straightRanks.length; i++) {
      const slice = straightRanks.slice(i, i + len);
      if (!ranksSeq(slice.map((r) => ({ r, s: "s", id: r + "s" })))) continue;
      add(slice.map((r) => rankSlice(g, r, 1, false)[0]).filter(Boolean));
      add(slice.map((r) => rankSlice(g, r, 1, true)[0]).filter(Boolean));
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
      add(slice.flatMap((r) => rankSlice(g, r, 2, false)));
      add(slice.flatMap((r) => rankSlice(g, r, 2, true)));
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

export function createTienlen(players, bookmakerId, leadId) {
  const luckyIdx = luckyIndex(players);
  const hands = tienlenDeal(players.length, luckyIdx);
  const seats = players.map((p, i) => ({
    id: p.id,
    name: p.name,
    isBot: !!p.isBot,
    isCai: p.id === bookmakerId,
    hand: hands[i].sort(byTl),
    passed: false,
    done: false,
  }));

  let start = seats.findIndex((p) => p.hand.some((c) => c.id === "3s"));
  if (leadId) {
    const idx = seats.findIndex((p) => p.id === leadId);
    if (idx >= 0) start = idx;
  }
  if (start < 0) start = Math.max(0, seats.findIndex((p) => p.isCai));
  if (start < 0) start = 0;

  return {
    kind: "tienlen",
    bookmakerId: bookmakerId || seats[0]?.id,
    phase: "play",
    players: seats,
    turn: start,
    current: null,
    lastBy: null,
    must3s: !leadId,
    ranking: [],
    message: leadId
      ? `${seats[start].name} (nhất ván trước) ra bài.`
      : `${seats[start].name} ra bài trước (có 3♠).`,
    log: [],
    history: [],
    roundNo: 0,
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

function nextNotDone(game, from) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (!game.players[idx].done) return idx;
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

function giveLead(game, preferIdx) {
  let lead = preferIdx;
  if (lead == null || lead < 0 || game.players[lead]?.done) {
    lead = nextNotDone(game, preferIdx >= 0 ? preferIdx : 0);
  }
  const left = aliveNotDone(game);
  if (left.length <= 1) {
    if (left[0] && !game.ranking.some((r) => r.id === left[0].id)) {
      game.ranking.push({ id: left[0].id, name: left[0].name });
    }
    finishGame(game);
    return;
  }
  if (lead < 0) {
    finishGame(game);
    return;
  }
  clearTrick(game, lead);
}

function finishGame(game) {
  game.phase = "over";
  game.turn = -1;
  const order = game.ranking.map((r, i) => `${i + 1}. ${r.name}`).join(" · ");
  game.message = `Hết ván. ${order}`;
  addHistory(game, "Tiến lên · kết ván", game.ranking.map((r, i) => ({
    text: `Hạng ${i + 1}: ${r.name}`,
    win: i === 0,
    lose: i === game.ranking.length - 1,
  })));
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
    const place = game.ranking.length;
    game.message = `${p.name} về hạng ${place}.`;
    addHistory(game, `Tiến lên · hạng ${place}`, [
      { text: `${p.name} hết bài · hạng ${place}`, win: place === 1 },
    ]);
    const left = aliveNotDone(game);
    if (left.length <= 1) {
      if (left[0] && !game.ranking.some((r) => r.id === left[0].id)) {
        game.ranking.push({ id: left[0].id, name: left[0].name });
      }
      finishGame(game);
      return { ok: true };
    }
  }

  for (const o of game.players) {
    if (o !== p && !o.done) o.passed = false;
  }
  if (p.done) p.passed = true;

  const nxt = nextAlive(game, idx);
  if (nxt < 0 || nxt === idx) {
    const winIdx = game.players.findIndex((x) => x.id === game.lastBy);
    giveLead(game, winIdx);
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
    giveLead(game, winIdx);
  } else {
    game.turn = nxt;
    game.message = `${game.players[nxt].name} tới lượt.`;
  }
  return { ok: true };
}

function withoutCards(hand, cards) {
  const set = new Set(cards.map((c) => c.id));
  return hand.filter((c) => !set.has(c.id));
}

function isBomb(play) {
  return play.type === "quad" || play.type === "seqpairs";
}

function heoCount(play) {
  return play.cards.filter((c) => c.r === "2").length;
}

function currentIsHeo(current) {
  if (!current?.cards?.length) return false;
  return current.cards[0].r === "2" && (current.type === "single" || current.type === "pair");
}

function currentRank(current) {
  if (!current?.cards?.length) return 0;
  return Math.max(...current.cards.map((c) => TL_RANK[c.r] || 0));
}

function copyCounts(hand) {
  const counts = {};
  for (const c of hand) counts[c.r] = (counts[c.r] || 0) + 1;
  return counts;
}

function extractSeqPairs(counts, want) {
  let found = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let start = 1; start + want - 1 <= 12; start++) {
      let ok = true;
      for (let k = 0; k < want; k++) {
        const r = TL_FROM_VAL[start + k];
        if ((counts[r] || 0) < 2) ok = false;
      }
      if (!ok) continue;
      for (let k = 0; k < want; k++) counts[TL_FROM_VAL[start + k]] -= 2;
      found += 1;
      changed = true;
      break;
    }
  }
  return found;
}

function extractStraights(counts) {
  let piles = 0;
  while (true) {
    let best = null;
    for (let start = 1; start <= 12; start++) {
      let len = 0;
      let breaks = 0;
      for (let v = start; v <= 12; v++) {
        const n = counts[TL_FROM_VAL[v]] || 0;
        if (n <= 0) break;
        len += 1;
        if (n >= 2) breaks += 1;
      }
      if (len >= 3 && (!best || len > best.len || (len === best.len && breaks < best.breaks))) {
        best = { start, len, breaks };
      }
    }
    if (!best) break;
    for (let k = 0; k < best.len; k++) counts[TL_FROM_VAL[best.start + k]] -= 1;
    piles += 1;
  }
  return piles;
}

function leftoverCounts(hand) {
  const counts = copyCounts(hand);
  const twos = counts["2"] || 0;
  delete counts["2"];
  for (const r of Object.keys(counts)) {
    if (counts[r] >= 4) counts[r] -= 4;
  }
  extractSeqPairs(counts, 4);
  extractSeqPairs(counts, 3);
  for (const r of Object.keys(counts)) {
    if (counts[r] >= 3) counts[r] -= 3;
  }
  extractStraights(counts);
  return { counts, twos };
}

function remainingPiles(hand) {
  const counts = copyCounts(hand);
  const twos = counts["2"] || 0;
  delete counts["2"];
  let piles = twos > 0 ? 1 : 0;
  for (const r of Object.keys(counts)) {
    if (counts[r] >= 4) {
      piles += 1;
      counts[r] -= 4;
    }
  }
  piles += extractSeqPairs(counts, 4);
  piles += extractSeqPairs(counts, 3);
  for (const r of Object.keys(counts)) {
    if (counts[r] >= 3) {
      piles += 1;
      counts[r] -= 3;
    }
  }
  piles += extractStraights(counts);
  for (const r of Object.keys(counts)) {
    if (counts[r] >= 2) {
      piles += 1;
      counts[r] -= 2;
    }
    if (counts[r] > 0) piles += counts[r];
  }
  return piles;
}

function leftoverSingleCount(hand) {
  const { counts } = leftoverCounts(hand);
  return Object.values(counts).filter((n) => n === 1).length;
}

function isLeftoverSingle(hand, card) {
  if (!card || card.r === "2") return false;
  const { counts } = leftoverCounts(hand);
  return (counts[card.r] || 0) === 1;
}

function isLeftoverPair(hand, play) {
  if (play.type !== "pair" || play.cards[0].r === "2") return false;
  const { counts } = leftoverCounts(hand);
  return (counts[play.cards[0].r] || 0) >= 2;
}

function smallestThreat(game, me) {
  let n = 13;
  for (const o of game.players) {
    if (o.id === me.id || o.done) continue;
    n = Math.min(n, o.hand.length);
  }
  return n;
}

function lastByLeft(game) {
  const p = game.players.find((x) => x.id === game.lastBy);
  if (!p || p.done) return 13;
  return p.hand.length;
}

function cheapCurrent(current) {
  const r = currentRank(current);
  return r > 0 && r <= 8;
}

function scorePlay(hand, play, current, threat, lastLeft) {
  const rest = withoutCards(hand, play.cards);
  if (!rest.length) return -100000 + play.key * 0.01;

  const orphans = leftoverSingleCount(hand);
  const leftoverSingle = play.type === "single" && isLeftoverSingle(hand, play.cards[0]);
  let s = remainingPiles(rest) * 36;
  s += play.key * 0.08;

  if (!current) {
    if (threat <= 1) {
      if (play.type === "single") s += 160;
      else s -= play.cards.length * 8;
      if (play.type === "pair" || play.type === "triple" || play.type === "straight") s -= 40;
    } else {
      if (leftoverSingle) s -= 95 - TL_RANK[play.cards[0].r] * 4;
      else if (play.type === "single" && play.cards[0].r !== "2") s += 55;
      if (play.type === "pair") s += orphans > 0 ? 70 : -8;
      if (play.type === "triple") s += orphans > 0 ? 25 : -14;
      if (play.type === "straight") s -= orphans ? play.n : play.n * 5;
    }
    if (isBomb(play) && rest.length > 1) s += 420;
    if (heoCount(play) && rest.length > 0) s += 300 + play.key * 0.15;
  } else {
    s += play.key * 0.22;
    if (leftoverSingle) s -= 75;
    if (play.type === current.type && play.n === current.n && !isBomb(play)) {
      if (cheapCurrent(current)) s -= 45;
      if (orphans > 0 && leftoverSingle) s -= 30;
    }
    if (lastLeft <= 1) {
      s -= 180;
      if (play.type === "single") s -= play.key * 0.9;
    } else if (lastLeft === 2 || threat <= 2) {
      s -= 70;
      if (current.type === "single" && leftoverSingle) s -= 35;
    }
    if (isBomb(play) && !currentIsHeo(current)) {
      if (threat > 2 && lastLeft > 2) s += 620;
      else if (threat === 2) s += 140;
    }
    if (isBomb(play) && currentIsHeo(current)) s -= 50;
    if (heoCount(play) && !currentIsHeo(current)) {
      const r = currentRank(current);
      if (lastLeft <= 1) s -= 20;
      else if (threat > 2 && r < 11) s += 340;
      else if (threat > 1 && r < 9) s += 180;
    }
  }
  return s;
}

function passLimit(current, threat, lastLeft, bestPlay, hand) {
  if (lastLeft <= 1) return 5000;
  if (lastLeft === 2 && current.type === "single") return 700;
  if (threat <= 1) return 1200;
  if (threat === 2) return 480;
  if (currentIsHeo(current) && threat > 2) return 95;
  if (
    cheapCurrent(current) &&
    bestPlay &&
    bestPlay.type === current.type &&
    !isBomb(bestPlay) &&
    (bestPlay.type !== "single" || isLeftoverSingle(hand, bestPlay.cards[0]) || isLeftoverPair(hand, bestPlay))
  ) {
    return 420;
  }
  return 200;
}

function pickBotPlay(p, plays, game) {
  if (!plays.length) return null;
  const current = game.current;
  const threat = smallestThreat(game, p);
  const lastLeft = current ? lastByLeft(game) : 13;
  let best = null;
  for (const play of plays) {
    const score = scorePlay(p.hand, play, current, threat, lastLeft);
    if (!best || score < best.score || (score === best.score && play.key < best.play.key)) {
      best = { play, score };
    }
  }
  if (!best) return null;
  if (current && lastLeft <= 1) return best.play;
  if (current && best.score > passLimit(current, threat, lastLeft, best.play, p.hand)) return null;
  return best.play;
}

export function tlBotAction(game) {
  if (game.phase !== "play") return null;
  const p = game.players[game.turn];
  if (!p || !p.isBot || p.done) return null;
  if (!p.hand.length) return tlPass(game, p.id);
  const plays = generatePlays(p.hand, game.current, game.must3s && p.hand.some((c) => c.id === "3s"));
  const choice = pickBotPlay(p, plays, game);
  if (!choice) {
    if (!game.current) {
      const lowest = p.hand.slice().sort(byTl)[0];
      if (!lowest) return null;
      return tlPlay(game, p.id, [lowest.id]);
    }
    return tlPass(game, p.id);
  }
  return tlPlay(
    game,
    p.id,
    choice.cards.map((c) => c.id)
  );
}

export function nextTienlen(game) {
  const leadId = game.ranking[0]?.id;
  const seats = game.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
  }));
  const next = createTienlen(seats, game.bookmakerId, leadId);
  next.history = game.history || [];
  next.roundNo = game.roundNo || 0;
  return next;
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
    bookmakerId: game.bookmakerId,
    history: game.history || [],
    turn: game.turn >= 0 ? game.players[game.turn].id : null,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      isCai: p.isCai,
      count: p.hand.length,
      passed: p.passed,
      done: p.done,
      hand: p.id === viewerId ? p.hand : [],
      you: p.id === viewerId,
    })),
  };
}
