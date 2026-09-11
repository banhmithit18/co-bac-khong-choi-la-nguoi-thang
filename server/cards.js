export const SUITS = ["s", "c", "d", "h"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
export const SUIT_SYM = { s: "♠", c: "♣", d: "♦", h: "♥" };

export function cardId(card) {
  return card.r + card.s;
}

export function parseId(id) {
  return { r: id[0], s: id[1], id };
}

export function makeCard(r, s) {
  return { r, s, id: r + s };
}

export function makeDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push(makeCard(r, s));
  }
  return deck;
}

export function shuffle(deck) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function takeFromDeck(deck, pred) {
  const i = deck.findIndex(pred);
  if (i < 0) return null;
  const [card] = deck.splice(i, 1);
  return card;
}

export function takeId(deck, id) {
  return takeFromDeck(deck, (c) => c.id === id);
}

export function takeRank(deck, rank) {
  return takeFromDeck(deck, (c) => c.r === rank);
}

export function takeSuitRank(deck, r, s) {
  return takeFromDeck(deck, (c) => c.r === r && c.s === s);
}

export function pop(deck) {
  return deck.pop();
}

export function cloneCards(cards) {
  return cards.map((c) => ({ ...c }));
}

export const POKER_RANK = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

export const BJ_VAL = {
  A: 11,
  K: 10,
  Q: 10,
  J: 10,
  T: 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

export function bjTotals(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += BJ_VAL[c.r];
    if (c.r === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  const soft = aces > 0 && total <= 21;
  return { total, soft };
}

export function isBlackjack(cards) {
  return cards.length === 2 && bjTotals(cards).total === 21;
}

export const TL_RANK = {
  "3": 1,
  "4": 2,
  "5": 3,
  "6": 4,
  "7": 5,
  "8": 6,
  "9": 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
  "2": 13,
};

export const TL_SUIT = { s: 1, c: 2, d: 3, h: 4 };

export function tlValue(card) {
  return TL_RANK[card.r] * 4 + TL_SUIT[card.s];
}

export function combinations(arr, k) {
  const out = [];
  const n = arr.length;
  const rec = (start, path) => {
    if (path.length === k) {
      out.push(path.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      path.push(arr[i]);
      rec(i + 1, path);
      path.pop();
    }
  };
  rec(0, []);
  return out;
}

export function addHistory(game, title, lines) {
  game.history = game.history || [];
  game.roundNo = (game.roundNo || 0) + 1;
  game.history.unshift({ round: game.roundNo, title, lines });
  if (game.history.length > 40) game.history.pop();
}
