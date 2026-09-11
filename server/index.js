import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { createPoker, startPokerHand, pokerAction, pokerBotAction, publicPoker } from "./poker.js";
import { createBlackjack, bjBet, bjAction, bjNext, publicBlackjack } from "./blackjack.js";
import { createTienlen, tlPlay, tlPass, tlBotAction, publicTienlen } from "./tienlen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "..", "public")));

const rooms = new Map();
const BOT_NAMES = ["Minh", "Lan", "Huy", "Trang", "Phúc", "Quân", "Mai", "Tuấn"];
const DEFAULT_CHIPS = 1_000_000;
const MIN_CHIPS = 50_000;
const MAX_CHIPS = 100_000_000;

function parseMoney(raw, fallback = DEFAULT_CHIPS) {
  let s = String(raw ?? "").trim().replace(/[₫đ\s]/gi, "").replace(/vnd/gi, "");
  if (!s) return fallback;
  let n = 0;
  if (/^\d{1,3}([.]\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ""));
  else if (/^\d{1,3}([,]\d{3})+$/.test(s)) n = Number(s.replace(/,/g, ""));
  else n = Math.floor(Number(s.replace(/,/g, ".").replace(/[^\d.]/g, "")) || 0);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_CHIPS, Math.max(MIN_CHIPS, Math.round(n)));
}

const CAP = { poker: 6, blackjack: 3, tienlen: 4 };
const FILL = { poker: 4, blackjack: 1, tienlen: 4 };

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  if (rooms.has(s)) return code();
  return s;
}

function publicRoom(room) {
  return {
    code: room.code,
    game: room.game,
    host: room.host,
    started: room.started,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      chips: p.chips,
    })),
  };
}

function emitRoom(room) {
  for (const p of room.players) {
    if (p.isBot) continue;
    const sock = io.sockets.sockets.get(p.id);
    if (!sock) continue;
    sock.emit("room", publicRoom(room));
    if (room.state) sock.emit("state", viewFor(room, p.id));
  }
}

function viewFor(room, viewerId) {
  if (!room.state) return null;
  if (room.game === "poker") return publicPoker(room.state, viewerId);
  if (room.game === "blackjack") return publicBlackjack(room.state, viewerId);
  if (room.game === "tienlen") return publicTienlen(room.state, viewerId);
  return null;
}

function fillBots(room, target) {
  let i = 0;
  while (room.players.length < target) {
    const name = BOT_NAMES[(room.players.length + i) % BOT_NAMES.length] + " · máy";
    room.players.push({
      id: `bot-${room.code}-${room.players.length}`,
      name,
      isBot: true,
      chips: room.players[0]?.chips || DEFAULT_CHIPS,
    });
    i += 1;
  }
}

function leaveSocket(socket) {
  const room = rooms.get(socket.data.room);
  if (!room) return;
  room.players = room.players.filter((p) => p.id !== socket.id);
  socket.leave(room.code);
  socket.data.room = null;
  if (!room.players.some((p) => !p.isBot)) {
    rooms.delete(room.code);
    return;
  }
  if (room.host === socket.id) {
    const next = room.players.find((p) => !p.isBot);
    if (next) room.host = next.id;
  }
  emitRoom(room);
}

function queueBots(room) {
  if (room.botTimer) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    runBots(room);
  }, 700 + Math.floor(Math.random() * 500));
}

function runBots(room) {
  if (!room.state || !room.started) return;
  if (room.game === "poker") {
    const g = room.state;
    if (g.acting < 0 || g.phase === "showdown" || g.phase === "over") {
      emitRoom(room);
      return;
    }
    const actor = g.players[g.acting];
    if (!actor?.isBot) {
      emitRoom(room);
      return;
    }
    pokerBotAction(g);
    emitRoom(room);
    const next = g.players[g.acting];
    if (next?.isBot) queueBots(room);
    return;
  }
  if (room.game === "tienlen") {
    const g = room.state;
    if (g.turn < 0 || g.phase === "over") {
      emitRoom(room);
      return;
    }
    const actor = g.players[g.turn];
    if (!actor?.isBot) {
      emitRoom(room);
      return;
    }
    tlBotAction(g);
    emitRoom(room);
    const next = g.turn >= 0 ? g.players[g.turn] : null;
    if (next?.isBot) queueBots(room);
  }
}

io.on("connection", (socket) => {
  socket.data.username = null;
  socket.data.room = null;

  socket.on("hello", ({ username, money }) => {
    const name = String(username || "").trim().slice(0, 24);
    if (!name) return socket.emit("errorMsg", "Hãy nhập tên.");
    socket.data.username = name;
    socket.data.chips = parseMoney(money);
    socket.emit("helloOk", { name, chips: socket.data.chips });
  });

  socket.on("create", ({ game, quick }) => {
    if (!socket.data.username) return socket.emit("errorMsg", "Hãy nhập tên trước.");
    if (!CAP[game]) return socket.emit("errorMsg", "Không có trò này.");
    leaveSocket(socket);
    const room = {
      code: code(),
      game,
      host: socket.id,
      started: false,
      players: [
        { id: socket.id, name: socket.data.username, isBot: false, chips: socket.data.chips || DEFAULT_CHIPS },
      ],
      state: null,
      botTimer: null,
    };
    rooms.set(room.code, room);
    socket.join(room.code);
    socket.data.room = room.code;
    if (quick) {
      fillBots(room, FILL[game]);
      startRoom(room);
    } else {
      emitRoom(room);
    }
  });

  socket.on("join", ({ code: raw }) => {
    if (!socket.data.username) return socket.emit("errorMsg", "Hãy nhập tên trước.");
    const c = String(raw || "").trim().toUpperCase();
    const room = rooms.get(c);
    if (!room) return socket.emit("errorMsg", "Không tìm thấy phòng.");
    if (room.started) return socket.emit("errorMsg", "Ván đã bắt đầu.");
    if (room.players.length >= CAP[room.game]) return socket.emit("errorMsg", "Phòng đã đủ người.");
    if (room.players.some((p) => p.name === socket.data.username && !p.isBot)) {
      return socket.emit("errorMsg", "Tên này đã ngồi bàn.");
    }
    leaveSocket(socket);
    room.players.push({
      id: socket.id,
      name: socket.data.username,
      isBot: false,
      chips: socket.data.chips || DEFAULT_CHIPS,
    });
    socket.join(room.code);
    socket.data.room = room.code;
    emitRoom(room);
  });

  socket.on("start", () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    if (room.host !== socket.id) return socket.emit("errorMsg", "Chỉ chủ phòng mới bắt đầu được.");
    if (room.started) return;
    fillBots(room, Math.max(FILL[room.game], room.players.length));
    if (room.game === "poker" && room.players.length < 2) {
      return socket.emit("errorMsg", "Cần ít nhất 2 người.");
    }
    if (room.game === "tienlen" && room.players.length < 2) {
      return socket.emit("errorMsg", "Cần ít nhất 2 người.");
    }
    startRoom(room);
  });

  socket.on("fillBots", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.started || room.host !== socket.id) return;
    fillBots(room, FILL[room.game]);
    emitRoom(room);
  });

  socket.on("poker", ({ action, amount }) => {
    const room = rooms.get(socket.data.room);
    if (!room?.state || room.game !== "poker") return;
    const res = pokerAction(room.state, socket.id, action, amount);
    if (!res.ok) return socket.emit("errorMsg", res.error);
    emitRoom(room);
    const actor = room.state.players[room.state.acting];
    if (actor?.isBot) queueBots(room);
  });

  socket.on("pokerNext", () => {
    const room = rooms.get(socket.data.room);
    if (!room?.state || room.game !== "poker") return;
    if (room.state.phase !== "showdown") return;
    for (const p of room.players) {
      const g = room.state.players.find((x) => x.id === p.id);
      if (g) p.chips = g.chips;
    }
    startPokerHand(room.state);
    emitRoom(room);
    const actor = room.state.players[room.state.acting];
    if (actor?.isBot) queueBots(room);
  });

  socket.on("bjBet", ({ amount }) => {
    const room = rooms.get(socket.data.room);
    if (!room?.state || room.game !== "blackjack") return;
    const res = bjBet(room.state, socket.id, amount);
    if (!res.ok) return socket.emit("errorMsg", res.error);
    emitRoom(room);
  });

  socket.on("bj", ({ action }) => {
    const room = rooms.get(socket.data.room);
    if (!room?.state || room.game !== "blackjack") return;
    const res = bjAction(room.state, socket.id, action);
    if (!res.ok) return socket.emit("errorMsg", res.error);
    emitRoom(room);
  });

  socket.on("bjNext", () => {
    const room = rooms.get(socket.data.room);
    if (!room?.state || room.game !== "blackjack") return;
    if (room.state.phase !== "result") return;
    bjNext(room.state);
    emitRoom(room);
  });

  socket.on("tlPlay", ({ cards }) => {
    const room = rooms.get(socket.data.room);
    if (!room?.state || room.game !== "tienlen") return;
    const res = tlPlay(room.state, socket.id, cards);
    if (!res.ok) return socket.emit("errorMsg", res.error);
    emitRoom(room);
    const actor = room.state.turn >= 0 ? room.state.players[room.state.turn] : null;
    if (actor?.isBot) queueBots(room);
  });

  socket.on("tlPass", () => {
    const room = rooms.get(socket.data.room);
    if (!room?.state || room.game !== "tienlen") return;
    const res = tlPass(room.state, socket.id);
    if (!res.ok) return socket.emit("errorMsg", res.error);
    emitRoom(room);
    const actor = room.state.turn >= 0 ? room.state.players[room.state.turn] : null;
    if (actor?.isBot) queueBots(room);
  });

  socket.on("leave", () => {
    leaveSocket(socket);
    socket.emit("left");
  });

  socket.on("disconnect", () => leaveSocket(socket));
});

function startRoom(room) {
  room.started = true;
  if (room.game === "poker") {
    room.state = createPoker(room.players);
    startPokerHand(room.state);
  } else if (room.game === "blackjack") {
    room.state = createBlackjack(room.players.filter((p) => !p.isBot).length
      ? room.players.filter((p) => !p.isBot)
      : room.players);
  } else {
    room.state = createTienlen(room.players);
  }
  emitRoom(room);
  queueBots(room);
}

app.get("/health", (_req, res) => res.type("text").send("ok"));

const PORT = process.env.PORT || 3055;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Bài running at http://localhost:${PORT}`);
});
