import { addHistory, bjTotals, isBlackjack, makeDeck, shuffle } from "./cards.js";
import { bjDealTwo, bjDraw, isLucky } from "./luck.js";

function freshShoe() {
  return shuffle([...makeDeck(), ...makeDeck()]);
}

export function rankHand(cards) {
  if (!cards?.length) return { tier: -1, total: 0, label: "—" };
  const { total } = bjTotals(cards);
  const xiBang = cards.length === 2 && cards.every((c) => c.r === "A");
  const xiDach = cards.length === 2 && isBlackjack(cards) && !xiBang;
  if (xiBang) return { tier: 5, total, label: "Xì Bàng" };
  if (xiDach) return { tier: 4, total, label: "Xì Dách" };
  if (total > 21) return { tier: 0, total, label: "Quắc" };
  if (cards.length === 5) return { tier: 3, total, label: "Ngũ Linh" };
  return { tier: 2, total, label: `${total} điểm` };
}

function minBetFor(chips) {
  return Math.max(1000, Math.round(chips / 100 / 1000) * 1000) || 10000;
}

function caiOf(game) {
  return game.players.find((p) => p.isCai) || game.players[0];
}

function consOf(game) {
  return game.players.filter((p) => !p.isCai);
}

function pendingCons(game) {
  return consOf(game).filter((p) => p.bet > 0 && !p.settled);
}

function backs(n) {
  return Array.from({ length: n }, () => ({ r: "?", s: "?", id: "back" }));
}

export function createBlackjack(players, bookmakerId) {
  const caiId = bookmakerId || players[0]?.id;
  const cai = players.find((p) => p.id === caiId) || players[0];
  const chips = cai?.chips ?? 1_000_000;
  return {
    kind: "blackjack",
    bookmakerId: cai.id,
    phase: "betting",
    shoe: freshShoe(),
    dealer: { cards: [] },
    caiPublic: false,
    minBet: Math.min(minBetFor(chips), chips),
    history: [],
    roundNo: 0,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      isCai: p.id === cai.id,
      chips: p.chips ?? 1_000_000,
      bet: 0,
      cards: [],
      stood: false,
      settled: false,
      revealed: false,
      sawCai: false,
      result: null,
      payout: 0,
    })),
    acting: -1,
    message: "Nhà con đặt cược. Người tạo phòng là nhà cái.",
  };
}

function maybeReshoe(game) {
  if (game.shoe.length < 20) game.shoe = freshShoe();
}

export function bjBet(game, playerId, amount) {
  if (game.phase !== "betting") return { ok: false, error: "Đã hết giờ đặt cược." };
  const p = game.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: "Không ngồi bàn này." };
  if (p.isCai) return { ok: false, error: "Nhà cái không đặt cược." };
  const want = Math.floor(Number(amount) || 0);
  const bet = Math.min(p.chips, Math.max(game.minBet, want));
  if (bet < game.minBet) {
    return { ok: false, error: `Cược tối thiểu ${game.minBet.toLocaleString("vi-VN")} ₫.` };
  }
  p.bet = bet;
  maybeDeal(game);
  return { ok: true };
}

function maybeDeal(game) {
  const cons = consOf(game);
  const active = cons.filter((p) => p.chips >= game.minBet);
  if (!active.length) return;
  if (active.every((p) => p.bet > 0)) dealRound(game);
}

function dealRound(game) {
  maybeReshoe(game);
  const cai = caiOf(game);
  game.dealer.cards = [];
  game.caiPublic = false;
  for (const p of game.players) {
    p.cards = [];
    p.stood = false;
    p.settled = false;
    p.revealed = false;
    p.sawCai = false;
    p.result = null;
    p.payout = 0;
  }
  for (const p of consOf(game)) {
    if (p.bet > 0) {
      p.chips -= p.bet;
      cai.chips += p.bet;
    }
  }
  for (const p of consOf(game)) {
    if (p.bet > 0) p.cards = bjDealTwo(game.shoe, isLucky(p.name));
  }
  game.dealer.cards = bjDealTwo(game.shoe, isLucky(cai.name));

  const dealerRank = rankHand(game.dealer.cards);
  if (dealerRank.tier >= 4) {
    game.caiPublic = true;
    for (const p of pendingCons(game)) {
      p.revealed = true;
      p.sawCai = true;
      applyPayout(game, p, compare(rankHand(p.cards), dealerRank), rankHand(p.cards));
    }
    finishRound(game);
    return;
  }

  for (const p of consOf(game)) {
    if (!p.bet) continue;
    const r = rankHand(p.cards);
    if (r.tier >= 4) {
      p.stood = true;
      p.revealed = true;
      p.sawCai = true;
      applyPayout(game, p, "win", r);
    }
  }

  if (!pendingCons(game).length) {
    finishRound(game);
    return;
  }

  game.phase = "playing";
  game.acting = nextConActor(game, 0);
  if (game.acting < 0) startXet(game);
  else game.message = `${game.players[game.acting].name} — rút hay dằn? Bài úp, nhà cái chưa được xem.`;
}

function autoStand(p) {
  if (!p.bet || p.settled || p.stood || p.isCai) return true;
  const r = rankHand(p.cards);
  return r.tier >= 3 || r.tier === 0 || (r.tier === 2 && r.total >= 21);
}

function nextConActor(game, from) {
  for (let i = from; i < game.players.length; i++) {
    const p = game.players[i];
    if (!p.isCai && p.bet > 0 && !autoStand(p)) return i;
  }
  return -1;
}

export function bjAction(game, playerId, action, targetId) {
  const p = game.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: "Không ngồi bàn này." };

  if (game.phase === "xet" && p.isCai) {
    return caiAction(game, action, targetId);
  }

  if (game.phase !== "playing") return { ok: false, error: "Chưa tới lúc rút bài." };
  const idx = game.players.findIndex((x) => x.id === playerId);
  if (idx !== game.acting) return { ok: false, error: "Chưa tới lượt." };
  const total = bjTotals(p.cards).total;

  if (action === "hit") {
    if (p.cards.length >= 5) return { ok: false, error: "Tối đa 5 lá." };
    p.cards.push(bjDraw(game.shoe, p.cards, isLucky(p.name)));
    const r = rankHand(p.cards);
    if (r.tier === 0) {
      p.stood = true;
      p.revealed = true;
      applyPayout(game, p, "lose", r);
    } else if (r.tier === 3 || r.total >= 21 || p.cards.length >= 5) {
      p.stood = true;
    }
  } else if (action === "stand") {
    if (total < 16 && p.cards.length < 5) {
      return { ok: false, error: "Dưới 16 điểm phải rút." };
    }
    p.stood = true;
  } else {
    return { ok: false, error: "Nước đi không hợp lệ." };
  }

  if (p.stood) {
    game.acting = nextConActor(game, idx + 1);
    if (game.acting < 0) startXet(game);
    else game.message = `${game.players[game.acting].name} — rút hay dằn?`;
  }
  return { ok: true };
}

function caiCanXet(game) {
  const r = rankHand(game.dealer.cards);
  return r.tier !== 0 && (r.total >= 16 || game.dealer.cards.length >= 5 || r.tier >= 3);
}

function caiAction(game, action, targetId) {
  const cai = caiOf(game);
  if (action === "hit") {
    if (game.dealer.cards.length >= 5) return { ok: false, error: "Tối đa 5 lá." };
    game.dealer.cards.push(bjDraw(game.shoe, game.dealer.cards, isLucky(cai.name)));
    const r = rankHand(game.dealer.cards);
    if (r.tier === 0) {
      game.caiPublic = true;
      for (const c of pendingCons(game)) {
        c.revealed = true;
        c.sawCai = true;
        applyPayout(game, c, compare(rankHand(c.cards), r), rankHand(c.cards));
      }
      finishRound(game);
      return { ok: true };
    }
    if (r.tier === 3 || r.total >= 21) {
      game.message = `Nhà cái ${r.label}. Có thể xét từng cửa hoặc xét hết.`;
    } else {
      game.message = caiCanXet(game)
        ? "Nhà cái có thể xét một cửa, xét hết, hoặc rút thêm."
        : "Nhà cái dưới 16 — phải rút.";
    }
    return { ok: true };
  }

  if (action === "xet") {
    if (!caiCanXet(game)) return { ok: false, error: "Dưới 16 điểm phải rút trước khi xét." };
    const con = game.players.find((x) => x.id === targetId && !x.isCai);
    if (!con || !con.bet) return { ok: false, error: "Không có cửa này." };
    if (con.settled) return { ok: false, error: "Cửa này đã xét." };
    xetOne(game, con);
    return { ok: true };
  }

  if (action === "xetAll") {
    if (!caiCanXet(game)) return { ok: false, error: "Dưới 16 điểm phải rút trước khi xét." };
    game.caiPublic = true;
    for (const c of pendingCons(game)) xetOne(game, c);
    if (game.phase !== "result") finishRound(game);
    return { ok: true };
  }

  return { ok: false, error: "Chọn xét một cửa, xét hết, hoặc rút." };
}

function xetOne(game, con) {
  con.revealed = true;
  con.sawCai = true;
  const dealer = rankHand(game.dealer.cards);
  applyPayout(game, con, compare(rankHand(con.cards), dealer), rankHand(con.cards));
  game.message = `Xét ${con.name}: ${con.result}. Nhà cái có thể rút thêm hoặc xét cửa khác.`;
  if (!pendingCons(game).length) finishRound(game);
}

function startXet(game) {
  if (!pendingCons(game).length) {
    finishRound(game);
    return;
  }
  const cai = caiOf(game);
  game.phase = "xet";
  game.acting = game.players.findIndex((p) => p.isCai);
  game.message = caiCanXet(game)
    ? `${cai.name} (nhà cái): xét từng cửa — lật bài đôi bên — rồi rút thêm hoặc xét hết.`
    : `${cai.name} (nhà cái) dưới 16 — phải rút trước khi xét.`;
}

function compare(player, dealer) {
  if (player.tier === 0) return "lose";
  if (player.tier > dealer.tier) return "win";
  if (player.tier < dealer.tier) return "lose";
  if (player.tier === 5 || player.tier === 4) return "lose";
  if (player.tier === 3) {
    if (player.total < dealer.total) return "win";
    if (player.total > dealer.total) return "lose";
    return "push";
  }
  if (player.total > dealer.total) return "win";
  if (player.total < dealer.total) return "lose";
  return "push";
}

function payAmount(bet, result, rank) {
  if (result === "lose") return 0;
  if (result === "push") return bet;
  if (rank.tier === 5) return bet * 4;
  if (rank.tier === 4 || rank.tier === 3) return bet * 3;
  return bet * 2;
}

function applyPayout(game, p, result, rank) {
  const cai = caiOf(game);
  const due = payAmount(p.bet, result, rank);
  const paid = Math.min(due, Math.max(0, cai.chips));
  cai.chips -= paid;
  p.chips += paid;
  p.payout = paid;
  if (result === "lose") p.result = rank.tier === 0 ? "Quắc" : "Thua";
  else if (result === "push") p.result = "Hòa";
  else p.result = rank.tier >= 3 ? rank.label : "Thắng";
  p.settled = true;
}

function finishRound(game) {
  const dealer = rankHand(game.dealer.cards);
  const cai = caiOf(game);
  const collected = consOf(game).reduce((s, p) => s + (p.bet || 0), 0);
  const paid = consOf(game).reduce((s, p) => s + (p.payout || 0), 0);
  const caiNet = collected - paid;
  addHistory(game, `Xì dách · nhà cái ${cai.name}`, [
    {
      text: `Nhà cái ${cai.name}: ${dealer.label} · ${caiNet >= 0 ? "+" : ""}${caiNet.toLocaleString("vi-VN")} ₫`,
      win: caiNet > 0,
      lose: caiNet < 0,
    },
    ...consOf(game)
      .filter((p) => p.bet)
      .map((p) => ({
        text: `${p.name}: ${p.result || rankHand(p.cards).label} · cược ${p.bet.toLocaleString("vi-VN")} ₫`,
        win: p.result === "Thắng" || p.result === "Xì Dách" || p.result === "Xì Bàng" || p.result === "Ngũ Linh",
        lose: p.result === "Thua" || p.result === "Quắc",
      })),
  ]);
  game.caiPublic = true;
  for (const p of consOf(game)) {
    if (p.bet) {
      p.revealed = true;
      p.sawCai = true;
    }
  }
  game.phase = "result";
  game.acting = -1;
  game.message = "Ván kết thúc.";
}

export function bjNext(game) {
  for (const p of game.players) {
    p.bet = 0;
    p.cards = [];
    p.stood = false;
    p.settled = false;
    p.revealed = false;
    p.sawCai = false;
    p.result = null;
    p.payout = 0;
  }
  game.dealer.cards = [];
  game.caiPublic = false;
  game.phase = "betting";
  game.acting = -1;
  game.message = "Nhà con đặt cược.";
}

export function bjBotTick(game) {
  if (game.phase === "betting") {
    let moved = false;
    for (const p of consOf(game)) {
      if (p.isBot && p.bet <= 0 && p.chips >= game.minBet) {
        const mult = Math.random() < 0.65 ? 1 : 2;
        p.bet = Math.min(p.chips, game.minBet * mult);
        moved = true;
      }
    }
    maybeDeal(game);
    return moved || game.phase !== "betting";
  }
  if (game.phase === "playing") {
    const p = game.players[game.acting];
    if (!p?.isBot) return false;
    const total = bjTotals(p.cards).total;
    bjAction(game, p.id, total < 16 ? "hit" : "stand");
    return true;
  }
  if (game.phase === "xet") {
    const cai = caiOf(game);
    if (!cai.isBot) return false;
    if (!caiCanXet(game) && game.dealer.cards.length < 5) {
      bjAction(game, cai.id, "hit");
      return true;
    }
    bjAction(game, cai.id, "xetAll");
    return true;
  }
  return false;
}

export function publicBlackjack(game, viewerId) {
  const cai = caiOf(game);
  const youAreCai = viewerId === cai.id;
  const viewer = game.players.find((p) => p.id === viewerId);
  const showCai =
    youAreCai || game.phase === "result" || game.caiPublic || viewer?.sawCai;
  const dealerRank = showCai ? rankHand(game.dealer.cards) : null;
  return {
    kind: "blackjack",
    phase: game.phase,
    message: game.message,
    minBet: game.minBet,
    bookmakerId: game.bookmakerId,
    youAreCai,
    canXet: youAreCai && game.phase === "xet" && caiCanXet(game),
    canHitCai: youAreCai && game.phase === "xet" && game.dealer.cards.length < 5,
    history: game.history || [],
    acting: game.acting >= 0 ? game.players[game.acting].id : null,
    dealer: {
      name: cai.name,
      chips: cai.chips,
      cards: showCai ? game.dealer.cards : backs(game.dealer.cards.length),
      total: showCai ? bjTotals(game.dealer.cards).total : null,
      label: showCai ? dealerRank.label : "Úp bài",
      canStand: caiCanXet(game),
    },
    players: game.players.map((p) => {
      const show = p.you || p.id === viewerId || p.revealed || game.phase === "result";
      const rank = p.cards.length ? rankHand(p.cards) : null;
      return {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        isCai: p.isCai,
        chips: p.chips,
        bet: p.bet,
        cards: show ? p.cards : backs(p.cards.length),
        total: show && p.cards.length ? bjTotals(p.cards).total : 0,
        label: show ? rank?.label || "" : p.cards.length ? `${p.cards.length} lá úp` : "",
        canStand: p.cards.length >= 5 || bjTotals(p.cards).total >= 16,
        result: p.settled ? p.result : null,
        payout: p.payout,
        settled: p.settled,
        revealed: p.revealed,
        you: p.id === viewerId,
      };
    }),
  };
}
