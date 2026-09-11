import { bjTotals, isBlackjack, makeDeck, shuffle } from "./cards.js";
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

export function createBlackjack(players) {
  const chips = players[0]?.chips ?? 1_000_000;
  return {
    kind: "blackjack",
    phase: "betting",
    shoe: freshShoe(),
    dealer: { cards: [] },
    minBet: Math.min(minBetFor(chips), chips),
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      chips: p.chips ?? 1_000_000,
      bet: 0,
      cards: [],
      stood: false,
      settled: false,
      result: null,
      payout: 0,
    })),
    acting: -1,
    message: "Đặt cược để bắt đầu ván.",
  };
}

function maybeReshoe(game) {
  if (game.shoe.length < 20) game.shoe = freshShoe();
}

export function bjBet(game, playerId, amount) {
  if (game.phase !== "betting") return { ok: false, error: "Đã hết giờ đặt cược." };
  const p = game.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: "Không ngồi bàn này." };
  const want = Math.floor(Number(amount) || 0);
  const bet = Math.min(p.chips, Math.max(game.minBet, want));
  if (bet < game.minBet) return { ok: false, error: `Cược tối thiểu ${game.minBet.toLocaleString("vi-VN")} ₫.` };
  p.bet = bet;
  if (game.players.filter((x) => !x.isBot).every((x) => x.bet > 0)) dealRound(game);
  return { ok: true };
}

function dealRound(game) {
  maybeReshoe(game);
  game.dealer.cards = [];
  for (const p of game.players) {
    p.cards = [];
    p.stood = false;
    p.settled = false;
    p.result = null;
    p.payout = 0;
    p.chips -= p.bet;
  }
  for (const p of game.players) {
    p.cards = bjDealTwo(game.shoe, isLucky(p.name));
  }
  game.dealer.cards.push(game.shoe.pop(), game.shoe.pop());

  const dealerRank = rankHand(game.dealer.cards);
  if (dealerRank.tier >= 4) {
    settle(game);
    return;
  }

  for (const p of game.players) {
    const r = rankHand(p.cards);
    if (r.tier >= 4) {
      p.stood = true;
      applyPayout(p, "win", r);
      p.settled = true;
    }
  }

  if (game.players.every((p) => p.settled)) {
    game.phase = "result";
    game.acting = -1;
    game.message = "Ván kết thúc.";
    return;
  }

  game.phase = "playing";
  game.acting = 0;
  skipDone(game);
  if (game.acting < 0) dealerPlay(game);
  else game.message = `${game.players[game.acting].name} — rút hay dằn?`;
}

function autoStand(p) {
  const r = rankHand(p.cards);
  return p.settled || p.stood || r.tier >= 3 || r.tier === 0 || (r.tier === 2 && r.total >= 21);
}

function skipDone(game) {
  while (game.acting >= 0 && game.acting < game.players.length) {
    const p = game.players[game.acting];
    if (autoStand(p)) {
      p.stood = true;
      game.acting += 1;
      continue;
    }
    break;
  }
  if (game.acting >= game.players.length) game.acting = -1;
}

export function bjAction(game, playerId, action) {
  if (game.phase !== "playing") return { ok: false, error: "Chưa tới lúc rút bài." };
  const idx = game.players.findIndex((p) => p.id === playerId);
  if (idx !== game.acting) return { ok: false, error: "Chưa tới lượt." };
  const p = game.players[idx];
  const total = bjTotals(p.cards).total;

  if (action === "hit") {
    if (p.cards.length >= 5) return { ok: false, error: "Tối đa 5 lá." };
    p.cards.push(bjDraw(game.shoe, p.cards, isLucky(p.name)));
    const r = rankHand(p.cards);
    if (r.tier === 0 || r.tier === 3 || r.total >= 21 || p.cards.length >= 5) p.stood = true;
  } else if (action === "stand") {
    if (total < 16 && p.cards.length < 5) {
      return { ok: false, error: "Dưới 16 điểm phải rút." };
    }
    p.stood = true;
  } else {
    return { ok: false, error: "Nước đi không hợp lệ." };
  }

  if (p.stood) {
    game.acting += 1;
    skipDone(game);
    if (game.acting < 0) dealerPlay(game);
    else game.message = `${game.players[game.acting].name} — rút hay dằn?`;
  }
  return { ok: true };
}

function dealerPlay(game) {
  game.phase = "dealer";
  while (game.dealer.cards.length < 5 && bjTotals(game.dealer.cards).total < 16) {
    game.dealer.cards.push(game.shoe.pop());
  }
  settle(game);
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

function applyPayout(p, result, rank) {
  if (result === "lose") {
    p.result = rank.tier === 0 ? "Quắc" : "Thua";
    p.payout = 0;
  } else if (result === "push") {
    p.result = "Hòa";
    p.payout = p.bet;
  } else {
    p.result = rank.tier >= 3 ? rank.label : "Thắng";
    if (rank.tier === 5) p.payout = p.bet * 4;
    else if (rank.tier === 4 || rank.tier === 3) p.payout = p.bet * 3;
    else p.payout = p.bet * 2;
  }
  p.chips += p.payout;
  p.settled = true;
}

function settle(game) {
  const dealer = rankHand(game.dealer.cards);
  for (const p of game.players) {
    if (p.settled) continue;
    const rank = rankHand(p.cards);
    applyPayout(p, compare(rank, dealer), rank);
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
    p.result = null;
    p.payout = 0;
  }
  game.dealer.cards = [];
  game.phase = "betting";
  game.acting = -1;
  game.message = "Đặt cược để bắt đầu ván.";
}

export function publicBlackjack(game, viewerId) {
  const hideDealer = game.phase === "playing";
  const dealerRank = hideDealer ? null : rankHand(game.dealer.cards);
  return {
    kind: "blackjack",
    phase: game.phase,
    message: game.message,
    minBet: game.minBet,
    acting: game.acting >= 0 ? game.players[game.acting].id : null,
    dealer: {
      cards: hideDealer
        ? [game.dealer.cards[0], { r: "?", s: "?", id: "back" }]
        : game.dealer.cards,
      total: hideDealer ? null : bjTotals(game.dealer.cards).total,
      label: dealerRank?.label || "Nhà cái",
    },
    players: game.players.map((p) => {
      const rank = p.cards.length ? rankHand(p.cards) : null;
      return {
        id: p.id,
        name: p.name,
        isBot: p.isBot,
        chips: p.chips,
        bet: p.bet,
        cards: p.cards,
        total: p.cards.length ? bjTotals(p.cards).total : 0,
        label: rank?.label || "",
        canStand: p.cards.length >= 5 || bjTotals(p.cards).total >= 16,
        result: p.result,
        payout: p.payout,
        you: p.id === viewerId,
      };
    }),
  };
}
