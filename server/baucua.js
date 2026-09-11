import { addHistory } from "./cards.js";
import { isLucky, rollBauCua } from "./luck.js";

export const BC_ANIMALS = [
  { id: "nai", name: "Nai", emoji: "🦌" },
  { id: "bau", name: "Bầu", emoji: "🎃" },
  { id: "ga", name: "Gà", emoji: "🐓" },
  { id: "ca", name: "Cá", emoji: "🐟" },
  { id: "cua", name: "Cua", emoji: "🦀" },
  { id: "tom", name: "Tôm", emoji: "🦐" },
];

const FACE_SET = new Set(BC_ANIMALS.map((a) => a.id));

function emptyBets() {
  const b = {};
  for (const a of BC_ANIMALS) b[a.id] = 0;
  return b;
}

function caiOf(game) {
  return game.players.find((p) => p.isCai) || game.players[0];
}

function consOf(game) {
  return game.players.filter((p) => !p.isCai);
}

function minBetFor(chips) {
  return Math.max(1000, Math.round(chips / 100 / 1000) * 1000) || 10000;
}

function countFace(dice, face) {
  return dice.filter((d) => d === face).length;
}

function animalName(id) {
  return BC_ANIMALS.find((a) => a.id === id)?.name || id;
}

export function createBauCua(players, bookmakerId) {
  const caiId = bookmakerId || players[0]?.id;
  const cai = players.find((p) => p.id === caiId) || players[0];
  const chips = cai?.chips ?? 1_000_000;
  return {
    kind: "baucua",
    bookmakerId: cai.id,
    phase: "betting",
    dice: [],
    minBet: Math.min(minBetFor(chips), chips),
    history: [],
    roundNo: 0,
    message: "Nhà con đặt cửa. Nhà cái lắc đĩa khi đã có cược.",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      isCai: p.id === cai.id,
      chips: p.chips ?? 1_000_000,
      bets: emptyBets(),
      locked: false,
      lastDelta: 0,
    })),
  };
}

export function bcBet(game, playerId, face, amount) {
  if (game.phase !== "betting") return { ok: false, error: "Đã hết giờ đặt cược." };
  if (!FACE_SET.has(face)) return { ok: false, error: "Không có cửa này." };
  const p = game.players.find((x) => x.id === playerId);
  if (!p) return { ok: false, error: "Không ngồi bàn này." };
  if (p.isCai) return { ok: false, error: "Nhà cái không đặt cược." };
  const want = Math.floor(Number(amount) || 0);
  const bet = Math.min(p.chips, Math.max(game.minBet, want));
  if (bet < game.minBet) {
    return { ok: false, error: `Cược tối thiểu ${game.minBet.toLocaleString("vi-VN")} ₫.` };
  }
  p.chips -= bet;
  p.bets[face] += bet;
  caiOf(game).chips += bet;
  game.message = `${p.name} đặt ${bet.toLocaleString("vi-VN")} ₫ cửa ${animalName(face)}.`;
  return { ok: true };
}

export function bcShake(game, playerId) {
  if (game.phase !== "betting") return { ok: false, error: "Chưa tới lúc lắc." };
  const p = game.players.find((x) => x.id === playerId);
  if (!p?.isCai) return { ok: false, error: "Chỉ nhà cái được lắc đĩa." };
  const totalBets = consOf(game).reduce(
    (s, c) => s + Object.values(c.bets).reduce((a, b) => a + b, 0),
    0
  );
  if (!totalBets) return { ok: false, error: "Chưa có ai đặt cược." };

  const tableTotals = emptyBets();
  for (const c of consOf(game)) {
    for (const a of BC_ANIMALS) tableTotals[a.id] += c.bets[a.id];
  }
  const lucky = game.players.find((x) => isLucky(x.name));
  const luckyBets = lucky && !lucky.isCai
    ? BC_ANIMALS.map((a) => a.id).filter((id) => lucky.bets[id] > 0)
    : [];
  game.dice = rollBauCua({
    luckyIsCai: !!(lucky && lucky.isCai),
    luckyBets,
    tableTotals,
  });
  settle(game);
  return { ok: true };
}

function settle(game) {
  const cai = caiOf(game);
  const collected = consOf(game).reduce(
    (s, c) => s + Object.values(c.bets).reduce((a, b) => a + b, 0),
    0
  );
  let paid = 0;
  for (const c of consOf(game)) {
    let win = 0;
    for (const a of BC_ANIMALS) {
      const k = countFace(game.dice, a.id);
      if (k && c.bets[a.id]) win += c.bets[a.id] * (k + 1);
    }
    const give = Math.min(win, Math.max(0, cai.chips));
    cai.chips -= give;
    c.chips += give;
    c.lastDelta = give - Object.values(c.bets).reduce((a, b) => a + b, 0);
    paid += give;
  }
  cai.lastDelta = collected - paid;
  addHistory(game, `Bầu cua · ${game.dice.map(animalName).join(" · ")}`, [
    {
      text: `Nhà cái ${cai.name}: ${cai.lastDelta >= 0 ? "+" : ""}${cai.lastDelta.toLocaleString("vi-VN")} ₫`,
      win: cai.lastDelta > 0,
      lose: cai.lastDelta < 0,
    },
    ...consOf(game)
      .filter((c) => Object.values(c.bets).some((n) => n > 0))
      .map((c) => ({
        text: `${c.name}: ${c.lastDelta >= 0 ? "+" : ""}${c.lastDelta.toLocaleString("vi-VN")} ₫`,
        win: c.lastDelta > 0,
        lose: c.lastDelta < 0,
      })),
  ]);
  game.phase = "result";
  game.message = `Mở đĩa: ${game.dice.map(animalName).join(" · ")}`;
}

export function bcNext(game) {
  for (const p of game.players) {
    p.bets = emptyBets();
    p.lastDelta = 0;
  }
  game.dice = [];
  game.phase = "betting";
  game.message = "Nhà con đặt cửa.";
}

export function bcBotTick(game) {
  if (game.phase !== "betting") return false;
  let moved = false;
  for (const p of consOf(game)) {
    if (!p.isBot) continue;
    const already = Object.values(p.bets).reduce((a, b) => a + b, 0);
    if (already > 0 || p.chips < game.minBet) continue;
    const n = Math.random() < 0.55 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const face = BC_ANIMALS[Math.floor(Math.random() * BC_ANIMALS.length)].id;
      const amt = Math.min(p.chips, game.minBet * (Math.random() < 0.7 ? 1 : 2));
      if (amt >= game.minBet) {
        bcBet(game, p.id, face, amt);
        moved = true;
      }
    }
  }
  const cai = caiOf(game);
  const waitingBot = consOf(game).some(
    (p) => p.isBot && Object.values(p.bets).every((n) => n <= 0) && p.chips >= game.minBet
  );
  const totalBets = consOf(game).reduce(
    (s, c) => s + Object.values(c.bets).reduce((a, b) => a + b, 0),
    0
  );
  if (cai?.isBot && totalBets && !waitingBot) {
    bcShake(game, cai.id);
    moved = true;
  }
  return moved;
}

export function publicBauCua(game, viewerId) {
  const cai = caiOf(game);
  return {
    kind: "baucua",
    phase: game.phase,
    message: game.message,
    minBet: game.minBet,
    bookmakerId: game.bookmakerId,
    youAreCai: viewerId === cai.id,
    dice: game.dice,
    animals: BC_ANIMALS,
    history: game.history || [],
    tableBets: BC_ANIMALS.reduce((acc, a) => {
      acc[a.id] = consOf(game).reduce((s, p) => s + p.bets[a.id], 0);
      return acc;
    }, {}),
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      isCai: p.isCai,
      chips: p.chips,
      bets: p.bets,
      lastDelta: p.lastDelta,
      you: p.id === viewerId,
    })),
  };
}
