import { POKER_RANK, combinations, makeDeck } from "./cards.js";
import { luckyIndex, pokerDeal } from "./luck.js";

const HAND_NAMES = [
  "Bài cao",
  "Một đôi",
  "Hai đôi",
  "Sám cô",
  "Sảnh",
  "Thùng",
  "Cù lũ",
  "Tứ quý",
  "Thùng phá sảnh",
  "Thùng phá sảnh chi",
];

function rank5(cards) {
  const vals = cards.map((c) => POKER_RANK[c.r]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const flush = suits.every((s) => s === suits[0]);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, n]) => ({ v: Number(v), n }))
    .sort((a, b) => b.n - a.n || b.v - a.v);

  const uniq = [...new Set(vals)].sort((a, b) => b - a);
  let straightHigh = 0;
  const wheel = uniq.includes(14) && uniq.includes(5) && uniq.includes(4) && uniq.includes(3) && uniq.includes(2);
  if (wheel && uniq.length === 5) straightHigh = 5;
  else if (uniq.length === 5 && uniq[0] - uniq[4] === 4) straightHigh = uniq[0];

  if (flush && straightHigh === 14) return { cat: 9, kick: [14], name: HAND_NAMES[9] };
  if (flush && straightHigh) return { cat: 8, kick: [straightHigh], name: HAND_NAMES[8] };
  if (groups[0].n === 4) return { cat: 7, kick: [groups[0].v, groups[1].v], name: HAND_NAMES[7] };
  if (groups[0].n === 3 && groups[1]?.n === 2) {
    return { cat: 6, kick: [groups[0].v, groups[1].v], name: HAND_NAMES[6] };
  }
  if (flush) return { cat: 5, kick: vals, name: HAND_NAMES[5] };
  if (straightHigh) return { cat: 4, kick: [straightHigh], name: HAND_NAMES[4] };
  if (groups[0].n === 3) {
    const kick = groups.filter((g) => g.n === 1).map((g) => g.v);
    return { cat: 3, kick: [groups[0].v, ...kick], name: HAND_NAMES[3] };
  }
  if (groups[0].n === 2 && groups[1]?.n === 2) {
    const pairA = Math.max(groups[0].v, groups[1].v);
    const pairB = Math.min(groups[0].v, groups[1].v);
    const kicker = groups.find((g) => g.n === 1)?.v || 0;
    return { cat: 2, kick: [pairA, pairB, kicker], name: HAND_NAMES[2] };
  }
  if (groups[0].n === 2) {
    const kick = groups.filter((g) => g.n === 1).map((g) => g.v);
    return { cat: 1, kick: [groups[0].v, ...kick], name: HAND_NAMES[1] };
  }
  return { cat: 0, kick: vals, name: HAND_NAMES[0] };
}

export function bestHand(cards) {
  let best = null;
  const fives = cards.length === 5 ? [cards] : combinations(cards, 5);
  for (const five of fives) {
    const e = rank5(five);
    if (!best || cmpHand(e, best) > 0) best = { ...e, cards: five };
  }
  return best;
}

export function cmpHand(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.kick.length, b.kick.length);
  for (let i = 0; i < n; i++) {
    const d = (a.kick[i] || 0) - (b.kick[i] || 0);
    if (d) return d;
  }
  return 0;
}

function nextActive(game, from) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = game.players[idx];
    if (!p.folded && !p.allIn && p.chips > 0) return idx;
  }
  return -1;
}

function activeCount(game) {
  return game.players.filter((p) => !p.folded).length;
}

function playersToAct(game) {
  return game.players.filter((p) => !p.folded && !p.allIn && p.chips > 0);
}

function bettingDone(game) {
  const live = game.players.filter((p) => !p.folded);
  if (live.length <= 1) return true;
  const need = game.players.filter((p) => !p.folded && !p.allIn);
  if (need.length === 0) return true;
  return need.every((p) => p.acted && p.bet === game.currentBet);
}

function resetStreet(game) {
  game.currentBet = 0;
  for (const p of game.players) {
    p.bet = 0;
    p.acted = false;
  }
}

function firstToActPostflop(game) {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (game.button + i) % n;
    const p = game.players[idx];
    if (!p.folded && !p.allIn) return idx;
  }
  return -1;
}

function awardPot(game) {
  const live = game.players.filter((p) => !p.folded);
  if (live.length === 1) {
    live[0].chips += game.pot;
    game.winners = [{ id: live[0].id, name: live[0].name, amount: game.pot, hand: null }];
    game.pot = 0;
    return;
  }
  const scored = live.map((p) => ({
    p,
    hand: bestHand([...p.hole, ...game.community]),
  }));
  scored.sort((a, b) => cmpHand(b.hand, a.hand));
  const top = scored.filter((s) => cmpHand(s.hand, scored[0].hand) === 0);
  const share = Math.floor(game.pot / top.length);
  let left = game.pot;
  game.winners = [];
  for (const s of top) {
    const amt = s === top[top.length - 1] ? left : share;
    s.p.chips += amt;
    left -= amt;
    game.winners.push({
      id: s.p.id,
      name: s.p.name,
      amount: amt,
      hand: s.hand.name,
    });
  }
  game.pot = 0;
}

function ensureLuckyWins(holes, community, luckyIdx) {
  const lucky = bestHand([...holes[luckyIdx], ...community]);
  for (let i = 0; i < holes.length; i++) {
    if (i === luckyIdx || holes[i].length < 2) continue;
    const opp = bestHand([...holes[i], ...community]);
    if (cmpHand(opp, lucky) < 0) continue;
    const used = new Set(
      [...holes.flat(), ...community].map((c) => c.id)
    );
    const junk = makeDeck()
      .filter((c) => !used.has(c.id))
      .sort((a, b) => POKER_RANK[a.r] - POKER_RANK[b.r]);
    if (junk.length >= 2) holes[i] = [junk[0], junk[1]];
  }
}

function postBlind(game, idx, amount) {
  const p = game.players[idx];
  const pay = Math.min(p.chips, amount);
  p.chips -= pay;
  p.bet += pay;
  p.streetPut += pay;
  game.pot += pay;
  if (p.chips === 0) p.allIn = true;
}

export function createPoker(players) {
  const stack = Math.max(...players.map((p) => p.chips || 1_000_000));
  const blinds = {
    sb: Math.max(1000, Math.round(stack / 200 / 1000) * 1000),
    bb: 0,
  };
  blinds.bb = blinds.sb * 2;
  const seats = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: !!p.isBot,
    chips: p.chips ?? 1_000_000,
    hole: [],
    bet: 0,
    streetPut: 0,
    folded: false,
    allIn: false,
    acted: false,
  }));
  return {
    kind: "poker",
    phase: "idle",
    players: seats,
    button: 0,
    sb: blinds.sb,
    bb: blinds.bb,
    community: [],
    pot: 0,
    currentBet: 0,
    minRaise: blinds.bb,
    acting: -1,
    winners: [],
    handNo: 0,
    revealed: false,
  };
}

export function startPokerHand(game) {
  const funded = game.players.filter((p) => p.chips > 0);
  if (funded.length < 2) {
    game.phase = "over";
    return game;
  }

  game.button = (game.button + 1) % game.players.length;
  while (game.players[game.button].chips <= 0) {
    game.button = (game.button + 1) % game.players.length;
  }

  const luckyIdx = luckyIndex(game.players);
  const { holes, community } = pokerDeal(game.players.length, luckyIdx);
  if (luckyIdx >= 0) ensureLuckyWins(holes, community, luckyIdx);
  game.communityAll = community;
  game.community = [];
  game.pot = 0;
  game.winners = [];
  game.revealed = false;
  game.handNo += 1;
  game.minRaise = game.bb;

  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    p.hole = p.chips > 0 ? holes[i] : [];
    p.bet = 0;
    p.streetPut = 0;
    p.folded = p.chips <= 0;
    p.allIn = false;
    p.acted = false;
  }

  const n = game.players.length;
  let sbIdx = nextActive(game, game.button);
  let bbIdx = nextActive(game, sbIdx);
  if (n === 2) {
    sbIdx = game.button;
    bbIdx = nextActive(game, game.button);
  }
  game.sbIdx = sbIdx;
  game.bbIdx = bbIdx;
  postBlind(game, sbIdx, game.sb);
  postBlind(game, bbIdx, game.bb);
  game.currentBet = Math.max(...game.players.map((p) => p.bet));
  game.phase = "preflop";
  game.acting = nextActive(game, bbIdx);
  if (game.acting < 0) dealRest(game);
  return game;
}

function revealBoard(game, n) {
  game.community = game.communityAll.slice(0, n);
}

function dealRest(game) {
  revealBoard(game, 5);
  game.phase = "showdown";
  game.revealed = true;
  game.acting = -1;
  awardPot(game);
}

function nextStreet(game) {
  if (activeCount(game) <= 1) {
    game.phase = "showdown";
    game.acting = -1;
    game.revealed = true;
    awardPot(game);
    return;
  }
  const still = playersToAct(game);
  if (still.length <= 1 && game.players.filter((p) => !p.folded && p.allIn).length) {
    dealRest(game);
    return;
  }

  resetStreet(game);
  game.minRaise = game.bb;
  if (game.phase === "preflop") {
    game.phase = "flop";
    revealBoard(game, 3);
  } else if (game.phase === "flop") {
    game.phase = "turn";
    revealBoard(game, 4);
  } else if (game.phase === "turn") {
    game.phase = "river";
    revealBoard(game, 5);
  } else if (game.phase === "river") {
    game.phase = "showdown";
    game.revealed = true;
    game.acting = -1;
    awardPot(game);
    return;
  }
  game.acting = firstToActPostflop(game);
  if (game.acting < 0) dealRest(game);
}

export function pokerAction(game, playerId, action, amount = 0) {
  if (game.phase === "showdown" || game.phase === "over" || game.phase === "idle") {
    return { ok: false, error: "Chưa tới lượt tố." };
  }
  const idx = game.players.findIndex((p) => p.id === playerId);
  if (idx !== game.acting) return { ok: false, error: "Chưa tới lượt." };
  const p = game.players[idx];
  const toCall = game.currentBet - p.bet;

  if (action === "fold") {
    p.folded = true;
    p.acted = true;
  } else if (action === "check") {
    if (toCall > 0) return { ok: false, error: "Không thể xem, phải theo hoặc úp." };
    p.acted = true;
  } else if (action === "call") {
    const pay = Math.min(p.chips, toCall);
    p.chips -= pay;
    p.bet += pay;
    game.pot += pay;
    p.acted = true;
    if (p.chips === 0) p.allIn = true;
  } else if (action === "raise") {
    const raiseTo = Math.max(Number(amount) || 0, game.currentBet + game.minRaise);
    const need = raiseTo - p.bet;
    if (need > p.chips) {
      game.currentBet = p.bet + p.chips;
      game.pot += p.chips;
      p.bet += p.chips;
      p.chips = 0;
      p.allIn = true;
      p.acted = true;
      for (const o of game.players) if (o !== p && !o.folded && !o.allIn) o.acted = false;
    } else {
      if (raiseTo < game.currentBet + game.minRaise && need < p.chips) {
        return { ok: false, error: "Tố quá thấp." };
      }
      const extra = raiseTo - game.currentBet;
      game.minRaise = Math.max(game.minRaise, extra);
      p.chips -= need;
      p.bet += need;
      game.pot += need;
      game.currentBet = p.bet;
      p.acted = true;
      if (p.chips === 0) p.allIn = true;
      for (const o of game.players) if (o !== p && !o.folded && !o.allIn) o.acted = false;
    }
  } else {
    return { ok: false, error: "Nước đi không hợp lệ." };
  }

  if (activeCount(game) <= 1) {
    nextStreet(game);
    return { ok: true };
  }
  if (bettingDone(game)) {
    nextStreet(game);
    return { ok: true };
  }
  game.acting = nextActive(game, idx);
  return { ok: true };
}

export function pokerBotAction(game) {
  const p = game.players[game.acting];
  if (!p || !p.isBot) return null;
  const toCall = game.currentBet - p.bet;
  const r = Math.random();
  if (toCall === 0) {
    if (r < 0.18 && p.chips > game.bb) {
      return pokerAction(game, p.id, "raise", game.currentBet + game.bb * 2);
    }
    return pokerAction(game, p.id, "check");
  }
  if (r < 0.22) return pokerAction(game, p.id, "fold");
  if (r < 0.9 || p.chips <= toCall) return pokerAction(game, p.id, "call");
  return pokerAction(game, p.id, "raise", game.currentBet + game.bb * 2);
}

export function publicPoker(game, viewerId) {
  const show = game.revealed || game.phase === "showdown";
  return {
    kind: "poker",
    phase: game.phase,
    community: game.community,
    pot: game.pot,
    currentBet: game.currentBet,
    minRaise: game.minRaise,
    bb: game.bb,
    acting: game.acting >= 0 ? game.players[game.acting].id : null,
    button: game.players[game.button]?.id,
    winners: game.winners,
    handNo: game.handNo,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      chips: p.chips,
      bet: p.bet,
      folded: p.folded,
      allIn: p.allIn,
      hole:
        p.id === viewerId || show
          ? p.hole
          : p.hole.map(() => ({ r: "?", s: "?", id: "back" })),
      you: p.id === viewerId,
    })),
  };
}
