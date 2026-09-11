import {
  BJ_VAL,
  makeDeck,
  shuffle,
  takeFromDeck,
  takeId,
  takeRank,
} from "./cards.js";

const LUCKY = "ThoSanConBac";

export function isLucky(name) {
  return String(name || "") === LUCKY;
}

export function luckyIndex(players) {
  return players.findIndex((p) => isLucky(p.name));
}

function takeTen(deck) {
  return takeFromDeck(deck, (c) => BJ_VAL[c.r] === 10);
}

function takeValue(deck, value) {
  if (value === 1 || value === 11) return takeRank(deck, "A");
  if (value === 10) return takeTen(deck);
  const map = { 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9" };
  return takeRank(deck, map[value] || String(value));
}

function chance(p) {
  return Math.random() < p;
}

export function pokerDeal(playerCount, luckyIdx) {
  const deck = shuffle(makeDeck());
  const holes = Array.from({ length: playerCount }, () => []);
  let community = [];

  if (luckyIdx >= 0 && chance(0.52)) {
    const modest = [
      ["Ks", "Kd"],
      ["Qh", "Qc"],
      ["Js", "Jh"],
      ["Td", "Ts"],
      ["9c", "9h"],
      ["8s", "8d"],
      ["As", "Qd"],
      ["Ah", "Js"],
      ["Ks", "Qs"],
      ["Jh", "Th"],
      ["Ac", "Td"],
      ["Kh", "Jd"],
      ["As", "Ts"],
      ["Qd", "Jd"],
    ];
    const pick = modest[Math.floor(Math.random() * modest.length)];
    const hole = pick.map((id) => takeId(deck, id)).filter(Boolean);
    while (hole.length < 2) hole.push(deck.pop());
    holes[luckyIdx] = hole;
    for (let i = 0; i < playerCount; i++) {
      if (i === luckyIdx) continue;
      holes[i].push(deck.pop(), deck.pop());
    }
    community = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
    if (chance(0.28) && holes[luckyIdx][0]) {
      const rank = holes[luckyIdx][0].r;
      const extra = takeRank(deck, rank);
      if (extra) community[Math.floor(Math.random() * 3)] = extra;
    }
  } else {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < playerCount; i++) holes[i].push(deck.pop());
    }
    community = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  }

  return { holes, community, deck };
}

export function bjDealTwo(deck, lucky) {
  if (lucky && chance(0.025)) {
    const a = takeRank(deck, "A");
    const b = takeRank(deck, "A");
    if (a && b) return [a, b];
    if (a) deck.push(a);
    if (b) deck.push(b);
  }
  if (lucky && chance(0.1)) {
    const ace = takeRank(deck, "A");
    const ten = takeTen(deck);
    if (ace && ten) return [ace, ten];
    if (ace) deck.push(ace);
    if (ten) deck.push(ten);
  }
  if (lucky && chance(0.22)) {
    const a = takeFromDeck(deck, (c) => BJ_VAL[c.r] >= 7 && BJ_VAL[c.r] <= 10);
    const b = takeFromDeck(deck, (c) => BJ_VAL[c.r] >= 6 && BJ_VAL[c.r] <= 10);
    if (a && b) return [a, b];
    if (a) deck.push(a);
    if (b) deck.push(b);
  }
  return [deck.pop(), deck.pop()];
}

export function bjDraw(deck, hand, lucky) {
  if (lucky && hand.length === 2) {
    let total = 0;
    let aces = 0;
    for (const c of hand) {
      total += BJ_VAL[c.r];
      if (c.r === "A") aces += 1;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    if (total >= 12 && total <= 16 && chance(0.32)) {
      const soft = Math.min(20, total + 4 + Math.floor(Math.random() * 3));
      const need = Math.max(1, soft - total);
      const card = takeValue(deck, need);
      if (card) return card;
    }
    if (total >= 17 && total < 21 && chance(0.18)) {
      const card = takeValue(deck, 21 - total);
      if (card) return card;
    }
  }
  if (lucky && hand.length >= 2 && hand.length < 5 && chance(0.2)) {
    let total = 0;
    let aces = 0;
    for (const c of hand) {
      total += BJ_VAL[c.r];
      if (c.r === "A") aces += 1;
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    if (total >= 12 && total <= 16) {
      const card = takeValue(deck, Math.min(4, 21 - total));
      if (card) return card;
    }
  }
  return deck.pop();
}

export function tienlenDeal(playerCount, luckyIdx) {
  const deck = shuffle(makeDeck());
  const hands = Array.from({ length: playerCount }, () => []);

  if (luckyIdx >= 0 && chance(0.55)) {
    if (chance(0.55)) {
      const two = takeRank(deck, "2");
      if (two) hands[luckyIdx].push(two);
    }
    const pairRank = ["9", "T", "J", "Q", "K", "A"][Math.floor(Math.random() * 6)];
    const a = takeRank(deck, pairRank);
    const b = takeRank(deck, pairRank);
    if (a) hands[luckyIdx].push(a);
    if (b) hands[luckyIdx].push(b);
    if (chance(0.4)) {
      const seq = ["7", "8", "9", "T", "J"];
      const start = Math.floor(Math.random() * 3);
      for (let i = 0; i < 3; i++) {
        const c = takeRank(deck, seq[start + i]);
        if (c) hands[luckyIdx].push(c);
      }
    }
    while (hands[luckyIdx].length < 13) hands[luckyIdx].push(deck.pop());
  }

  for (let i = 0; i < playerCount; i++) {
    if (i === luckyIdx) continue;
    while (hands[i].length < 13) hands[i].push(deck.pop());
  }
  if (luckyIdx >= 0 && hands[luckyIdx].length < 13) {
    while (hands[luckyIdx].length < 13) hands[luckyIdx].push(deck.pop());
  }

  for (const hand of hands) hand.sort((a, b) => a.id.localeCompare(b.id));
  return hands;
}
