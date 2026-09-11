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
  const rank = String(value === 14 ? "A" : value);
  const map = { 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9" };
  return takeRank(deck, map[value] || rank);
}

export function pokerDeal(playerCount, luckyIdx) {
  const deck = shuffle(makeDeck());
  const holes = Array.from({ length: playerCount }, () => []);
  let community = [];

  if (luckyIdx >= 0) {
    const styles = ["quads", "boat", "flush", "straight"];
    const style = styles[Math.floor(Math.random() * styles.length)];
    const hole = [];
    if (style === "quads" || style === "boat") {
      hole.push(takeRank(deck, "A"), takeRank(deck, "A"));
    } else if (style === "flush") {
      const s = ["s", "c", "d", "h"][Math.floor(Math.random() * 4)];
      hole.push(
        takeFromDeck(deck, (c) => c.s === s && c.r === "A"),
        takeFromDeck(deck, (c) => c.s === s && c.r === "K")
      );
    } else {
      hole.push(
        takeFromDeck(deck, (c) => c.r === "A"),
        takeFromDeck(deck, (c) => c.r === "K")
      );
    }
    holes[luckyIdx] = hole.filter(Boolean);

    if (style === "quads") {
      community = [
        takeRank(deck, "A"),
        takeRank(deck, "A"),
        takeRank(deck, "7"),
        takeRank(deck, "3"),
        takeRank(deck, "9"),
      ];
    } else if (style === "boat") {
      community = [
        takeRank(deck, "A"),
        takeRank(deck, "9"),
        takeRank(deck, "9"),
        takeRank(deck, "4"),
        takeRank(deck, "2"),
      ];
    } else if (style === "flush") {
      const s = holes[luckyIdx][0]?.s || "h";
      community = [
        takeFromDeck(deck, (c) => c.s === s && c.r === "Q"),
        takeFromDeck(deck, (c) => c.s === s && c.r === "J"),
        takeFromDeck(deck, (c) => c.s === s && c.r === "9"),
        takeFromDeck(deck, (c) => c.s !== s && c.r === "3"),
        takeFromDeck(deck, (c) => c.s !== s && c.r === "6"),
      ];
    } else {
      community = [
        takeRank(deck, "Q"),
        takeRank(deck, "J"),
        takeRank(deck, "T"),
        takeRank(deck, "4"),
        takeRank(deck, "8"),
      ];
    }
    community = community.filter(Boolean);
    while (community.length < 5) community.push(deck.pop());

    for (let i = 0; i < playerCount; i++) {
      if (i === luckyIdx) continue;
      holes[i].push(deck.pop(), deck.pop());
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
  if (lucky && Math.random() < 0.12) {
    const a = takeRank(deck, "A");
    const b = takeRank(deck, "A");
    if (a && b) return [a, b];
    if (a) deck.push(a);
    if (b) deck.push(b);
  }
  if (lucky && Math.random() < 0.38) {
    const ace = takeRank(deck, "A");
    const ten = takeTen(deck);
    if (ace && ten) return [ace, ten];
    if (ace) deck.push(ace);
    if (ten) deck.push(ten);
  }
  if (lucky && Math.random() < 0.55) {
    const a = takeFromDeck(deck, (c) => BJ_VAL[c.r] >= 8);
    const b = takeFromDeck(deck, (c) => BJ_VAL[c.r] >= 7);
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
    let best = total;
    let aceLeft = aces;
    while (best > 21 && aceLeft > 0) {
      best -= 10;
      aceLeft -= 1;
    }
    if (best >= 11 && best < 21) {
      const need = 21 - best;
      const card = takeValue(deck, need);
      if (card) return card;
    }
  }
  return deck.pop();
}

export function tienlenDeal(playerCount, luckyIdx) {
  const deck = shuffle(makeDeck());
  const hands = Array.from({ length: playerCount }, () => []);

  if (luckyIdx >= 0) {
    const want = [
      "2h",
      "2d",
      "2c",
      "Kh",
      "Kd",
      "Kc",
      "Ks",
      "Ah",
      "Ad",
      "Qh",
      "Jh",
      "Th",
      "9s",
    ];
    for (const id of want) {
      const card = takeId(deck, id);
      if (card) hands[luckyIdx].push(card);
    }
    while (hands[luckyIdx].length < 13) hands[luckyIdx].push(deck.pop());
  }

  for (let i = 0; i < playerCount; i++) {
    if (i === luckyIdx) continue;
    while (hands[i].length < 13) hands[i].push(deck.pop());
  }

  for (const hand of hands) hand.sort((a, b) => a.id.localeCompare(b.id));
  return hands;
}
