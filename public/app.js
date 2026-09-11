const socket = io();

const state = {
  name: localStorage.getItem("bai-name") || "",
  money: localStorage.getItem("bai-money") || "1000000",
  chips: Number(localStorage.getItem("bai-chips") || 1000000),
  screen: "gate",
  room: null,
  game: null,
  selected: [],
  toast: "",
  bet: 50000,
  tab: "table",
};

const PRESETS = [100000, 500000, 1000000, 5000000, 10000000];
const $ = (sel, el = document) => el.querySelector(sel);
const app = document.getElementById("app");

function vnd(n) {
  return `${Number(n || 0).toLocaleString("vi-VN")} ₫`;
}

function parseMoneyInput(raw) {
  const s = String(raw || "").replace(/[₫đ\s]/gi, "");
  if (/^\d{1,3}([.]\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  if (/^\d{1,3}([,]\d{3})+$/.test(s)) return Number(s.replace(/,/g, ""));
  return Math.floor(Number(String(s).replace(/\./g, "")) || 0);
}

function toast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    if (state.toast === msg) {
      state.toast = "";
      render();
    }
  }, 2600);
}

socket.on("helloOk", ({ name, chips }) => {
  state.name = name;
  state.chips = chips;
  localStorage.setItem("bai-name", name);
  localStorage.setItem("bai-money", String(chips));
  localStorage.setItem("bai-chips", String(chips));
  state.screen = "home";
  render();
});

socket.on("room", (room) => {
  state.room = room;
  state.screen = room.started ? "play" : "room";
  render();
});

socket.on("state", (game) => {
  state.game = game;
  if (game?.kind === "tienlen") {
    const ids = new Set((game.players.find((p) => p.you)?.hand || []).map((c) => c.id));
    state.selected = state.selected.filter((id) => ids.has(id));
  }
  const you = game?.players?.find((p) => p.you);
  if (you?.chips != null) state.chips = you.chips;
  else if (game?.dealer?.chips != null && game.youAreCai) state.chips = game.dealer.chips;
  render();
});

socket.on("left", () => {
  state.room = null;
  state.game = null;
  state.selected = [];
  state.tab = "table";
  state.screen = "home";
  render();
});

socket.on("errorMsg", toast);

function suitClass(s) {
  return s === "d" || s === "h" ? "red" : "";
}

function suitSym(s) {
  return { s: "♠", c: "♣", d: "♦", h: "♥", "?": "·" }[s] || s;
}

function rankLabel(r) {
  return r === "T" ? "10" : r;
}

function cardEl(card, extra = "") {
  if (!card || card.id === "back" || card.r === "?") {
    return `<div class="card back ${extra}"></div>`;
  }
  const r = rankLabel(card.r);
  const s = suitSym(card.s);
  return `<div class="card ${suitClass(card.s)} ${extra}" data-id="${card.id}">
    <div>${r}${s}</div>
    <div class="suit">${s}</div>
    <div class="bot">${r}${s}</div>
  </div>`;
}

function topBar(right = "") {
  const room = state.room ? `Phòng <span class="code">${state.room.code}</span>` : "";
  return `<div class="top">
    <div class="brand">Sòng Bài</div>
    <div class="wallet"><span class="coin"></span>${vnd(state.chips)}</div>
    <div class="muted">${escapeHtml(state.name)} ${room}</div>
    <div>${right}</div>
  </div>`;
}

function gate() {
  return `<div class="gate"><div class="gate-box">
    <div class="brand">Sòng Bài</div>
    <h1>Vào sòng.</h1>
    <p>Poker, xì dách luật Việt và tiến lên miền Nam. Tạo phòng, gửi mã cho bạn, hoặc chơi ngay với máy.</p>
    <div class="field">
      <label>Tên người chơi</label>
      <input id="name" maxlength="24" placeholder="Nhập tên" value="${escapeHtml(state.name)}" />
    </div>
    <div class="field">
      <label>Số tiền vào bàn</label>
      <div class="money-field">
        <input id="money" inputmode="numeric" placeholder="1.000.000" value="${escapeHtml(formatInput(state.money))}" />
        <span>₫</span>
      </div>
      <div class="presets">
        ${PRESETS.map((n) => `<button type="button" data-preset="${n}">${vnd(n)}</button>`).join("")}
      </div>
    </div>
    <button class="primary" id="enter" style="width:100%">Vào sòng</button>
  </div></div>`;
}

function formatInput(n) {
  const v = parseMoneyInput(n);
  return v ? v.toLocaleString("vi-VN") : "";
}

function home() {
  return `<div class="wrap">
    ${topBar(`<button class="ghost" id="rename">Đổi tên / tiền</button>`)}
    <h1>Chọn bàn.</h1>
    <p class="muted">Chơi online cùng phòng, một bộ bài.</p>
    <div class="games">
      ${gameChoice("poker", "♠", "Poker", "Texas Hold’em. Mù nhỏ / mù lớn theo số tiền vào bàn.")}
      ${gameChoice("blackjack", "A♦", "Xì Dách", "Luật Việt: xì bàng, xì dách, ngũ linh. Dưới 16 phải rút.")}
      ${gameChoice("tienlen", "3♠", "Tiến Lên", "Luật miền Nam. 3♠ ra trước, chặt heo, đôi thông.")}
    </div>
    <div class="panel">
      <h2>Vào phòng</h2>
      <div class="row">
        <input id="code" maxlength="6" placeholder="Mã phòng" />
        <button id="join">Vào</button>
      </div>
    </div>
  </div>`;
}

function gameChoice(id, icon, title, blurb) {
  return `<div class="game-card">
    <div>
      <div class="icon">${icon}</div>
      <b>${title}</b>
      <small>${blurb}</small>
    </div>
    <div class="row">
      <button data-create="${id}">Tạo phòng</button>
      <button class="primary" data-quick="${id}">Chơi ngay</button>
    </div>
  </div>`;
}

function room() {
  const r = state.room;
  const host = r.host && r.players.find((p) => p.id === r.host);
  const youHost = host && host.name === state.name && !host.isBot;
  return `<div class="wrap">
    ${topBar(`<button class="ghost" id="leave">Rời bàn</button>`)}
    <h1>${label(r.game)}</h1>
    <p class="muted">Gửi mã <span class="code">${r.code}</span>. Người tạo phòng là <b>nhà cái</b> và bắt đầu ván.</p>
    <div class="panel">
      <h2>Ghế ngồi</h2>
      <div class="seats">
        ${r.players
          .map(
            (p) =>
              `<div class="seat ${p.name === state.name && !p.isBot ? "you" : ""} ${p.isCai ? "cai" : ""}">${escapeHtml(p.name)}${p.isCai ? " · nhà cái" : ""} · ${vnd(p.chips)}</div>`
          )
          .join("")}
      </div>
      ${
        youHost
          ? `<div class="actions" style="justify-content:flex-start">
              <button id="bots">Thêm máy</button>
              <button class="primary" id="start">Bắt đầu</button>
            </div>`
          : `<p class="muted">Đang chờ chủ phòng.</p>`
      }
    </div>
  </div>`;
}

function play() {
  const g = state.game;
  if (!g) {
    return `<div class="wrap">${topBar(`<button class="ghost" id="leave">Rời bàn</button>`)}<p class="muted">Đang chia bài…</p></div>`;
  }
  if (state.tab === "history") return historyView(g);
  if (g.kind === "poker") return pokerView(g);
  if (g.kind === "blackjack") return bjView(g);
  return tlView(g);
}

function tabs() {
  return `<div class="tabs">
    <button id="tabTable" class="${state.tab !== "history" ? "primary" : ""}">Bàn</button>
    <button id="tabHistory" class="${state.tab === "history" ? "primary" : ""}">Lịch sử</button>
  </div>`;
}

function historyView(g) {
  const items = g.history || [];
  return `<div class="wrap">
    ${topBar(`<button class="ghost" id="leave">Rời bàn</button>`)}
    ${tabs()}
    <div class="panel history-list">
      <h2>Lịch sử ván</h2>
      ${
        items.length
          ? items
              .map(
                (h) => `<div class="hist-item">
            <div class="hist-title">Ván ${h.round} · ${escapeHtml(h.title)}</div>
            ${(h.lines || [])
              .map(
                (l) =>
                  `<div class="hist-line ${l.win ? "win" : l.lose ? "lose" : ""}">${escapeHtml(l.text)}</div>`
              )
              .join("")}
          </div>`
              )
              .join("")
          : `<p class="muted">Chưa có ván nào xong.</p>`
      }
    </div>
  </div>`;
}

function label(game) {
  return { poker: "Poker", blackjack: "Xì Dách", tienlen: "Tiến Lên" }[game] || game;
}

function phaseName(phase) {
  return {
    preflop: "Tố trước",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    showdown: "Lật bài",
    betting: "Đặt cược",
    playing: "Rút bài",
    dealer: "Nhà cái",
    xet: "Xét bài",
    result: "Kết quả",
  }[phase] || phase;
}

function pokerView(g) {
  const you = g.players.find((p) => p.you);
  const others = g.players.filter((p) => !p.you);
  const yourTurn = g.acting && you && g.acting === you.id;
  const toCall = you ? Math.max(0, g.currentBet - you.bet) : 0;
  return `<div class="wrap">
    ${topBar(`<button class="ghost" id="leave">Rời bàn</button>`)}
    ${tabs()}
    <div class="status">${g.phase === "showdown" ? resultLine(g) : `${phaseName(g.phase)} · hũ ${vnd(g.pot)}`}</div>
    <div class="felt"><div class="felt-in">
      <div class="opponents">${others.map((p) => seatBlock(p, g.acting)).join("")}</div>
      <div class="center">
        <div class="pot">Hũ ${vnd(g.pot)} · cược ${vnd(g.currentBet)}</div>
        <div class="hand">${g.community.map((c) => cardEl(c)).join("")}</div>
      </div>
      ${
        you
          ? `<div class="you-row ${yourTurn ? "turn" : ""}">
              <div class="name muted">${p.isCai ? "Nhà cái · " : ""}${escapeHtml(you.name)} · ${vnd(you.chips)}${you.bet ? ` · đã tố ${vnd(you.bet)}` : ""}</div>
              <div class="hand">${you.hole.map((c) => cardEl(c)).join("")}</div>
            </div>`
          : ""
      }
    </div></div>
    ${
      yourTurn && g.phase !== "showdown"
        ? `<div class="actions">
            <button data-poker="fold">Úp</button>
            ${toCall ? `<button data-poker="call">Theo ${vnd(toCall)}</button>` : `<button data-poker="check">Xem</button>`}
            ${
              you.chips + you.bet > g.currentBet
                ? `<button data-poker="raise">Tố ${vnd(Math.min(you.chips + you.bet, Math.max(g.currentBet + g.minRaise, g.currentBet + g.bb)))}</button>
            <input id="raise" type="range" min="${Math.min(you.chips + you.bet, g.currentBet + g.minRaise)}" max="${you.chips + you.bet}" value="${Math.min(you.chips + you.bet, g.currentBet + g.minRaise * 2)}" style="width:180px" />`
                : ""
            }
          </div>`
        : ""
    }
    ${g.phase === "showdown" ? `<div class="actions"><button class="primary" id="pokerNext">Ván sau</button></div>` : ""}
  </div>`;
}

function resultLine(g) {
  if (!g.winners?.length) return "Lật bài";
  return g.winners
    .map((w) => `${escapeHtml(w.name)} thắng ${vnd(w.amount)}${w.hand ? ` · ${w.hand}` : ""}`)
    .join(" · ");
}

function seatBlock(p, acting) {
  return `<div class="opp ${p.folded ? "folded" : ""} ${acting === p.id ? "turn" : ""}">
    <div class="name">${p.isCai ? "Nhà cái · " : ""}${escapeHtml(p.name)}${p.chips != null ? ` · ${vnd(p.chips)}` : ""}</div>
    <div class="hand">${(p.hole || []).map((c) => cardEl(c, "tiny")).join("") || `<span class="muted">${p.count ?? ""} lá</span>`}</div>
    ${p.bet ? `<div class="muted">${vnd(p.bet)}</div>` : ""}
    ${p.passed ? `<div class="muted">bỏ</div>` : ""}
    ${p.done ? `<div class="muted">hết bài</div>` : ""}
  </div>`;
}

function bjView(g) {
  const you = g.players.find((p) => p.you);
  const youAreCai = g.youAreCai || you?.isCai;
  const cons = g.players.filter((p) => !p.isCai);
  const yourTurn = g.acting && you && g.acting === you.id;
  const minBet = g.minBet || 10000;
  const betVal = Math.min(Math.max(state.bet, minBet), you?.chips || minBet);
  return `<div class="wrap">
    ${topBar(`<button class="ghost" id="leave">Rời bàn</button>`)}
    ${tabs()}
    <div class="status">${escapeHtml(g.message || phaseName(g.phase))}</div>
    <div class="felt"><div class="felt-in">
      <div class="center">
        <div class="pot">Nhà cái · ${escapeHtml(g.dealer.name || "")}${g.dealer.chips != null ? ` · ${vnd(g.dealer.chips)}` : ""}${g.dealer.label ? ` · ${g.dealer.label}` : ""}</div>
        <div class="hand">${g.dealer.cards.map((c) => cardEl(c)).join("")}</div>
      </div>
      <div class="opponents">
        ${cons
          .map((p) => {
            const tag = p.result || p.label || "";
            return `<div class="opp ${g.acting === p.id ? "turn" : ""} ${p.settled ? "folded" : ""}">
              <div class="name">${escapeHtml(p.name)} · ${vnd(p.chips)}${p.bet ? ` · cược ${vnd(p.bet)}` : ""}</div>
              <div class="hand">${(p.cards.length ? p.cards : []).map((c) => cardEl(c, "tiny")).join("")}</div>
              <div class="muted">${tag}</div>
              ${
                youAreCai && g.phase === "xet" && !p.settled && p.bet && g.canXet
                  ? `<button class="xet-btn" data-xet="${p.id}">Xét cửa này</button>`
                  : ""
              }
            </div>`;
          })
          .join("")}
      </div>
    </div></div>
    ${
      g.phase === "betting" && you && !youAreCai
        ? `<div class="panel">
            <h2>Đặt cược</h2>
            <p class="muted">Tối thiểu ${vnd(minBet)}. Xì bàng ăn 3:1 · xì dách / ngũ linh ăn 2:1.</p>
            <div class="money-field">
              <input id="bet" inputmode="numeric" value="${betVal.toLocaleString("vi-VN")}" />
              <span>₫</span>
            </div>
            <div class="presets">
              ${[minBet, minBet * 5, minBet * 10, minBet * 50]
                .filter((n) => n <= you.chips)
                .map((n) => `<button type="button" data-bet="${n}">${vnd(n)}</button>`)
                .join("")}
            </div>
            <div class="actions" style="justify-content:flex-start"><button class="primary" id="bjBet">Cược</button></div>
          </div>`
        : ""
    }
    ${
      g.phase === "betting" && youAreCai
        ? `<p class="muted" style="text-align:center">Bạn là nhà cái. Đợi nhà con đặt cược. Bài các cửa sẽ úp cho đến khi bạn xét.</p>`
        : ""
    }
    ${
      g.phase === "playing" && yourTurn && !youAreCai
        ? `<div class="actions">
            <button data-bj="hit">Rút</button>
            <button data-bj="stand" ${you.canStand ? "" : "disabled"}>Dằn</button>
          </div>`
        : ""
    }
    ${
      g.phase === "xet" && youAreCai
        ? `<div class="actions">
            <button data-bj="hit" ${g.canHitCai ? "" : "disabled"}>Rút thêm</button>
            <button class="primary" id="xetAll" ${g.canXet ? "" : "disabled"}>Xét hết</button>
          </div>
          <p class="muted" style="text-align:center">Xét một cửa: hai bên lật bài và tính tiền ngay. Sau đó có thể rút thêm hoặc xét các cửa còn lại.</p>`
        : ""
    }
    ${g.phase === "result" ? `<div class="actions"><button class="primary" id="bjNext">Ván sau</button></div>` : ""}
  </div>`;
}

function tlType(type) {
  return { single: "Lẻ", pair: "Đôi", triple: "Sám", quad: "Tứ quý", straight: "Sảnh", seqpairs: "Đôi thông" }[type] || "Ra bài";
}

function tlView(g) {
  const you = g.players.find((p) => p.you);
  const others = g.players.filter((p) => !p.you);
  const yourTurn = g.turn && you && g.turn === you.id;
  return `<div class="wrap">
    ${topBar(`<button class="ghost" id="leave">Rời bàn</button>`)}
    ${tabs()}
    <div class="status">${escapeHtml(g.message || "")}${g.ranking?.length ? ` · ${g.ranking.map((r, i) => `${i + 1}. ${escapeHtml(r.name)}`).join("  ")}` : ""}</div>
    <div class="felt"><div class="felt-in">
      <div class="opponents">${others.map((p) => seatBlock({ ...p, hole: Array.from({ length: p.count }, () => ({ id: "back", r: "?", s: "?" })) }, g.turn)).join("")}</div>
      <div class="center">
        <div class="pot">${g.current ? tlType(g.current.type) : "Tới nước"}</div>
        <div class="hand">${(g.current?.cards || []).map((c) => cardEl(c)).join("") || `<span class="muted">—</span>`}</div>
      </div>
      ${
        you
          ? `<div class="you-row ${yourTurn ? "turn" : ""}">
              <div class="name muted">${you.isCai ? "Nhà cái · " : ""}${escapeHtml(you.name)} · ${you.count} lá</div>
              <div class="hand tl-hand">${you.hand.map((c) => cardEl(c, state.selected.includes(c.id) ? "selected" : "")).join("")}</div>
            </div>`
          : ""
      }
    </div></div>
    ${
      yourTurn && g.phase === "play"
        ? `<div class="actions">
            <button class="primary" id="tlPlay">Đánh</button>
            <button id="tlPass" ${g.current ? "" : "disabled"}>Bỏ</button>
          </div>`
        : ""
    }
    ${
      g.phase === "over"
        ? `<div class="actions"><button class="primary" id="tlNext">Ván sau</button><button class="ghost" id="leave">Rời bàn</button></div>`
        : ""
    }
  </div>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render() {
  if (state.screen === "gate") app.innerHTML = gate();
  else if (state.screen === "home") app.innerHTML = home();
  else if (state.screen === "room") app.innerHTML = room();
  else app.innerHTML = play();
  if (state.toast) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = state.toast;
    app.appendChild(t);
  }
  bind();
}

function bind() {
  $("#enter")?.addEventListener("click", enter);
  $("#name")?.addEventListener("keydown", (e) => e.key === "Enter" && enter());
  $("#money")?.addEventListener("keydown", (e) => e.key === "Enter" && enter());
  document.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.money = btn.dataset.preset;
      const input = $("#money");
      if (input) input.value = Number(btn.dataset.preset).toLocaleString("vi-VN");
    });
  });
  $("#rename")?.addEventListener("click", () => {
    state.screen = "gate";
    render();
  });
  $("#join")?.addEventListener("click", () => socket.emit("join", { code: $("#code").value }));
  $("#code")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") socket.emit("join", { code: e.target.value });
  });
  document.querySelectorAll("[data-create]").forEach((btn) => {
    btn.addEventListener("click", () => socket.emit("create", { game: btn.dataset.create, quick: false }));
  });
  document.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => socket.emit("create", { game: btn.dataset.quick, quick: true }));
  });
  $("#leave")?.addEventListener("click", () => socket.emit("leave"));
  $("#tabTable")?.addEventListener("click", () => {
    state.tab = "table";
    render();
  });
  $("#tabHistory")?.addEventListener("click", () => {
    state.tab = "history";
    render();
  });
  $("#tlNext")?.addEventListener("click", () => socket.emit("tlNext"));
  $("#start")?.addEventListener("click", () => socket.emit("start"));
  $("#bots")?.addEventListener("click", () => socket.emit("fillBots"));
  document.querySelectorAll("[data-poker]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.poker;
      const amount = action === "raise" ? Number($("#raise")?.value || 0) : 0;
      socket.emit("poker", { action, amount });
    });
  });
  $("#raise")?.addEventListener("input", (e) => {
    const btn = document.querySelector('[data-poker="raise"]');
    if (btn) btn.textContent = "Tố " + vnd(e.target.value);
  });
  $("#pokerNext")?.addEventListener("click", () => socket.emit("pokerNext"));
  document.querySelectorAll("[data-bet]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.bet = Number(btn.dataset.bet);
      const input = $("#bet");
      if (input) input.value = state.bet.toLocaleString("vi-VN");
    });
  });
  $("#bjBet")?.addEventListener("click", () => {
    const amount = parseMoneyInput($("#bet")?.value || state.bet);
    state.bet = amount;
    socket.emit("bjBet", { amount });
  });
  document.querySelectorAll("[data-bj]").forEach((btn) => {
    btn.addEventListener("click", () => socket.emit("bj", { action: btn.dataset.bj }));
  });
  document.querySelectorAll("[data-xet]").forEach((btn) => {
    btn.addEventListener("click", () => socket.emit("bj", { action: "xet", targetId: btn.dataset.xet }));
  });
  $("#xetAll")?.addEventListener("click", () => socket.emit("bj", { action: "xetAll" }));
  $("#bjNext")?.addEventListener("click", () => socket.emit("bjNext"));
  document.querySelectorAll(".tl-hand .card[data-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.id;
      if (state.selected.includes(id)) state.selected = state.selected.filter((x) => x !== id);
      else state.selected = [...state.selected, id];
      render();
    });
  });
  $("#tlPlay")?.addEventListener("click", () => {
    socket.emit("tlPlay", { cards: state.selected });
    state.selected = [];
  });
  $("#tlPass")?.addEventListener("click", () => socket.emit("tlPass"));
}

function enter() {
  const name = ($("#name")?.value || "").trim();
  const money = parseMoneyInput($("#money")?.value || state.money);
  state.money = String(money);
  socket.emit("hello", { username: name, money });
}

render();
