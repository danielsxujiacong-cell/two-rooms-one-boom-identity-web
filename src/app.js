(function () {
  "use strict";

  var config = window.IDENTITY_SUPABASE || {};
  var catalog = (window.module && window.module.exports) || {};
  var roles = catalog.roles || [];
  var roleColors = catalog.ROLE_COLORS || {};
  var roleById = catalog.ROLE_BY_ID || {};
  var STORAGE_PREFIX = "two_rooms_identity_v1:";
  var POLL_MS = 2600;
  var selected = Object.create(null);
  var capacity = 4;
  var currentRoom = null;
  var busy = false;
  var pollTimer = null;
  var toastTimer = null;
  var revealTimer = null;
  var revealPressActive = false;

  var elements = {
    views: Array.prototype.slice.call(document.querySelectorAll(".view")),
    home: document.getElementById("homeView"),
    create: document.getElementById("createView"),
    join: document.getElementById("joinView"),
    room: document.getElementById("roomView"),
    rolePicker: document.getElementById("rolePicker"),
    capacity: document.getElementById("playerCapacity"),
    deckCount: document.getElementById("deckCount"),
    deckHint: document.getElementById("deckHint"),
    meterFill: document.getElementById("meterFill"),
    createButton: document.getElementById("createRoomButton"),
    roomCodeInput: document.getElementById("roomCodeInput"),
    toast: document.getElementById("toast")
  };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character];
    });
  }

  function token() {
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error("请使用 HTTPS 或 localhost 打开页面");
    var bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
  }

  function storageKey(code, purpose) {
    return STORAGE_PREFIX + String(code) + ":" + purpose;
  }

  function getStored(code, purpose) {
    try { return window.localStorage.getItem(storageKey(code, purpose)); } catch (error) { return ""; }
  }

  function setStored(code, purpose, value) {
    try { window.localStorage.setItem(storageKey(code, purpose), value); } catch (error) {}
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { elements.toast.classList.remove("show"); }, 2600);
  }

  function showView(id) {
    window.clearInterval(pollTimer);
    pollTimer = null;
    hideIdentity();
    elements.views.forEach(function (view) { view.classList.toggle("active", view.id === id); });
    if (id === "homeView") {
      currentRoom = null;
      history.replaceState(null, "", window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function roleCount(id) { return selected[id] || 0; }
  function chosenTotal() {
    return roles.reduce(function (sum, role) { return sum + roleCount(role.id); }, 0);
  }

  function renderRole(role) {
    var count = roleCount(role.id);
    var isStackable = role.id === "blue_team" || role.id === "red_team";
    return '<div class="role-row">'
      + '<div><div class="role-title"><strong>' + esc(role.nameZh) + '</strong><span>' + esc(role.nameEn) + '</span></div>'
      + '<p class="role-ability">' + esc(role.ability) + '</p></div>'
      + '<div class="counter"><button type="button" data-role="' + esc(role.id) + '" data-delta="-1" aria-label="减少' + esc(role.nameZh) + '" ' + (count <= 0 ? "disabled" : "") + '>−</button>'
      + '<output aria-label="已选数量">' + count + '</output>'
      + '<button type="button" data-role="' + esc(role.id) + '" data-delta="1" aria-label="增加' + esc(role.nameZh) + '" ' + (count >= role.maxCount ? "disabled" : "") + '>+</button></div>'
      + (isStackable ? "" : '<span class="role-tag">最多 ' + role.maxCount + ' 张</span>')
      + '</div>';
  }

  function section(title, key, items, open) {
    var count = items.reduce(function (sum, role) { return sum + roleCount(role.id); }, 0);
    return '<details class="role-section" ' + (open ? "open" : "") + '><summary>'
      + '<span class="team-chip ' + esc(key) + '"></span><span class="section-label">' + esc(title) + '</span>'
      + '<span class="section-count">' + count + ' 张</span></summary><div class="role-list">'
      + items.map(renderRole).join("") + '</div></details>';
  }

  function renderPicker() {
    if (!roles.length) {
      elements.rolePicker.innerHTML = '<div class="panel" style="padding:16px">角色数据无法加载，请刷新页面。</div>';
      return;
    }
    var baseRoles = roles.filter(function (role) { return !role.isAdvanced; });
    var advancedRoles = roles.filter(function (role) { return role.isAdvanced; });
    var groups = ["red", "blue", "gray", "green", "purple"].map(function (team) {
      var color = roleColors[team] || { label: team };
      return section(color.label, team, advancedRoles.filter(function (role) { return role.allegiance === team; }), false);
    });
    elements.rolePicker.innerHTML = section("基础角色", "gray", baseRoles, true) + groups.join("");
    updateDeckMeter();
  }

  function updateDeckMeter() {
    var total = chosenTotal();
    elements.deckCount.textContent = "已选 " + total + " / " + capacity;
    elements.meterFill.style.width = Math.min(100, total / capacity * 100) + "%";
    elements.deckHint.textContent = total === capacity
      ? "牌数刚好，房主可以创建这场牌局。"
      : (total > capacity ? "多选了 " + (total - capacity) + " 张，请减少角色牌。" : "还需要选择 " + (capacity - total) + " 张角色牌。");
    elements.createButton.disabled = total !== capacity || busy;
    elements.createButton.textContent = busy ? "正在创建…" : (total === capacity ? "创建牌局" : "牌数不符，无法创建");
  }

  function fillCapacityOptions() {
    for (var count = 1; count <= 40; count += 1) {
      var option = document.createElement("option");
      option.value = String(count);
      option.textContent = String(count);
      elements.capacity.appendChild(option);
    }
  }

  function notifyApiError(error) {
    var messages = {
      invalid_room_code: "房间码需要是四位数字",
      invalid_capacity: "玩家人数需要在 1 到 40 人之间",
      invalid_deck: "角色牌数量或配置有误",
      invalid_nickname: "昵称不能为空，且最多 16 个字",
      nickname_taken: "这个昵称已经有人使用，请换一个",
      room_not_found: "没有找到这个房间码",
      room_full: "房间已经坐满了",
      room_locked: "这场牌局已经锁定",
      room_not_full: "玩家还没有到齐",
      not_owner: "只有房主可以开始发牌",
      not_a_player: "请先加入这场牌局",
      token_invalid: "当前设备没有这场牌局的访问凭据，请重新加入",
      backend_not_configured: "联机服务尚未部署，请稍后再试",
      failed_to_fetch: "暂时连不上服务，请检查网络后重试"
    };
    var message = messages[error.message] || error.message || "操作失败，请稍后重试";
    showToast(message.replace(/^Error:\s*/i, ""));
  }

  async function callApi(payload) {
    if (!config.url || !config.publishableKey || config.publishableKey === "YOUR_PUBLISHABLE_KEY") {
      var setupError = new Error("backend_not_configured");
      setupError.code = "backend_not_configured";
      throw setupError;
    }
    var response;
    try {
      response = await fetch(config.url.replace(/\/$/, "") + "/functions/v1/" + encodeURIComponent(config.functionName || "identity-game"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": config.publishableKey
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (error && error.name === "TypeError") error.message = "failed_to_fetch";
      throw error;
    }
    var result;
    try { result = await response.json(); } catch (error) { result = {}; }
    if (!response.ok || !result.success) {
      var apiError = new Error(result.error || result.message || "request_failed");
      apiError.status = response.status;
      throw apiError;
    }
    return result;
  }

  async function createRoom() {
    if (busy || chosenTotal() !== capacity) return;
    var playerToken;
    var ownerToken;
    try { playerToken = token(); ownerToken = token(); } catch (error) { notifyApiError(error); return; }
    var roleIds = [];
    roles.forEach(function (role) {
      for (var count = 0; count < roleCount(role.id); count += 1) roleIds.push(role.id);
    });
    busy = true;
    updateDeckMeter();
    try {
      var result = await callApi({
        action: "createRoom",
        capacity: capacity,
        roleIds: roleIds,
        playerToken: playerToken,
        ownerToken: ownerToken
      });
      setStored(result.roomCode, "player", playerToken);
      setStored(result.roomCode, "owner", ownerToken);
      await loadRoom(result.roomCode, false);
      showToast("房间创建好了，叫玩家扫码或输入房间码加入。");
    } catch (error) {
      notifyApiError(error);
    } finally {
      busy = false;
      updateDeckMeter();
    }
  }

  function openJoin(code) {
    showView("joinView");
    if (code) {
      elements.roomCodeInput.value = String(code).replace(/\D/g, "").slice(0, 4);
      var existingToken = getStored(elements.roomCodeInput.value, "player");
      if (existingToken && elements.roomCodeInput.value.length === 4) {
        loadRoom(elements.roomCodeInput.value, true).catch(function (error) {
          if (error.message === "not_a_player" || error.message === "room_not_found") return;
        });
      }
    }
  }

  async function joinRoom(event) {
    event.preventDefault();
    var code = elements.roomCodeInput.value.replace(/\D/g, "").slice(0, 4);
    var nickname = document.getElementById("nicknameInput").value.normalize("NFKC").trim();
    if (!/^\d{4}$/.test(code)) { showToast("请填写四位房间码。"); return; }
    if (!nickname || Array.from(nickname).length > 16) { showToast("昵称不能为空，最多 16 个字。"); return; }
    var playerToken = getStored(code, "player") || token();
    setStored(code, "player", playerToken);
    var button = document.getElementById("joinRoomButton");
    button.disabled = true;
    try {
      await callApi({ action: "joinRoom", roomCode: code, nickname: nickname, playerToken: playerToken });
      await loadRoom(code, true);
      showToast("已加入牌局。");
    } catch (error) {
      if (error.message === "nickname_taken") window.localStorage.removeItem(storageKey(code, "player"));
      notifyApiError(error);
    } finally {
      button.disabled = false;
    }
  }

  async function loadRoom(code, allowJoinFallback) {
    code = String(code || (currentRoom && currentRoom.roomCode) || "").replace(/\D/g, "").slice(0, 4);
    var playerToken = getStored(code, "player");
    if (!playerToken) {
      if (allowJoinFallback) {
        showView("joinView");
        elements.roomCodeInput.value = code;
      }
      return;
    }
    try {
      var result = await callApi({ action: "getRoom", roomCode: code, playerToken: playerToken, ownerToken: getStored(code, "owner") || "" });
      renderRoom(result.room);
    } catch (error) {
      if (error.message !== "assignment_unavailable") throw error;
      showIdentityLoading(code);
    }
  }

  function showIdentityLoading(code) {
    if (!elements.room.classList.contains("active")) showView("roomView");
    currentRoom = currentRoom && currentRoom.roomCode === code ? currentRoom : {
      roomCode: code, capacity: 0, playerCount: 0, players: [], isOwner: false, status: "dealt", ownRole: null
    };
    document.getElementById("roomCodeLabel").textContent = code;
    document.getElementById("roomStatus").textContent = "身份正在加载…";
    document.getElementById("waitingNote").hidden = true;
    document.getElementById("startDealButton").hidden = true;
    document.getElementById("identitySection").hidden = false;
    document.getElementById("identityLoading").hidden = false;
    document.getElementById("identityCover").classList.add("is-loading");
    hideIdentity();
    makeQr(code);
    if (!pollTimer) {
      pollTimer = window.setInterval(function () {
        if (currentRoom) loadRoom(currentRoom.roomCode, false).catch(function () {});
      }, POLL_MS);
    }
  }

  function renderRoom(room) {
    if (!room) return;
    if (!elements.room.classList.contains("active")) showView("roomView");
    currentRoom = room;
    var code = room.roomCode;
    if (window.location.search !== "?room=" + code) history.replaceState(null, "", window.location.pathname + "?room=" + code);
    document.getElementById("roomCodeLabel").textContent = code;
    var full = room.playerCount === room.capacity;
    var dealt = room.status === "dealt";
    var ownRoleReady = !!(room.ownRole && typeof room.ownRole.id === "string" && roleById[room.ownRole.id]);
    var status = document.getElementById("roomStatus");
    status.textContent = dealt ? "身份已锁定" : (full ? "玩家已到齐" : "等待玩家");
    status.classList.toggle("dealt", dealt);

    document.getElementById("rosterCount").textContent = "已加入 " + room.playerCount + " / " + room.capacity;
    document.getElementById("rosterFill").style.width = (room.playerCount / room.capacity * 100) + "%";
    document.getElementById("rosterList").innerHTML = (room.players || []).map(function (player, index) {
      return '<li class="' + (player.isOwner ? "owner" : "") + '"><span class="seat-number">' + (index + 1) + '</span><span>' + esc(player.nickname) + '</span>'
        + (player.isOwner ? '<span class="owner-label">房主</span>' : "") + '</li>';
    }).join("");

    var waitingNote = document.getElementById("waitingNote");
    var startButton = document.getElementById("startDealButton");
    waitingNote.hidden = dealt;
    startButton.hidden = !room.isOwner || dealt;
    startButton.disabled = !full || busy;
    startButton.textContent = busy ? "正在发牌…" : (full ? "开始发牌" : "等玩家到齐后发牌");
    document.getElementById("lockNote").textContent = dealt ? "身份已锁定，刷新页面会取回同一张牌。" : "发牌后名单和身份都会锁定。";
    document.getElementById("identitySection").hidden = !dealt;
    document.getElementById("identityLoading").hidden = !dealt || ownRoleReady;
    document.getElementById("identityCover").classList.toggle("is-loading", dealt && !ownRoleReady);
    if (ownRoleReady) prepareIdentity(room.ownRole);
    else hideIdentity();
    if (dealt && ownRoleReady) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    } else if (!pollTimer) {
      pollTimer = window.setInterval(function () {
        if (currentRoom) loadRoom(currentRoom.roomCode, false).catch(function () {});
      }, POLL_MS);
    }
    makeQr(code);
  }

  async function startDeal() {
    if (!currentRoom || busy || !currentRoom.isOwner || currentRoom.playerCount !== currentRoom.capacity) return;
    var ownerToken = getStored(currentRoom.roomCode, "owner");
    if (!ownerToken) { showToast("房主凭据不在此设备上，请回到创建房间的设备。"); return; }
    busy = true;
    renderRoom(currentRoom);
    try {
      await callApi({ action: "startDeal", roomCode: currentRoom.roomCode, ownerToken: ownerToken });
      await loadRoom(currentRoom.roomCode, false);
      showToast("发牌完成，身份已经锁定。");
    } catch (error) {
      notifyApiError(error);
      await loadRoom(currentRoom.roomCode, false).catch(function () {});
    } finally {
      busy = false;
    }
  }

  function makeQr(code) {
    var canvas = document.getElementById("roomQr");
    var invite = window.location.origin + window.location.pathname + "?room=" + encodeURIComponent(code);
    if (window.QRCode && typeof window.QRCode.toCanvas === "function") {
      window.QRCode.toCanvas(canvas, invite, { width: 196, margin: 1, errorCorrectionLevel: "M", color: { dark: "#26231f", light: "#fffdf8" } }, function (error) {
        if (error) showToast("二维码生成失败，请分享房间码。");
      });
    }
  }

  function prepareIdentity(ownRole) {
    var roleId = typeof ownRole === "string" ? ownRole : (ownRole && ownRole.id);
    var role = roleById[roleId];
    if (!role) return;
    var colors = {
      blue: ["#587797", "#e2e9ed"],
      red: ["#c75449", "#f4e0d9"],
      gray: ["#817d74", "#ece9e1"],
      green: ["#607c61", "#e3ebe0"],
      purple: ["#81708f", "#ede7f0"]
    };
    var color = colors[role.allegiance] || colors.gray;
    var card = document.getElementById("identityCard");
    card.style.setProperty("--role-accent", color[0]);
    card.style.setProperty("--role-tint", color[1]);
    var faction = roleColors[role.allegiance] || { label: "特殊阵营", emoji: "⚪" };
    document.getElementById("factionBadge").textContent = faction.emoji + " " + faction.label;
    document.getElementById("roleNameZh").textContent = role.nameZh;
    document.getElementById("roleNameEn").textContent = role.nameEn;
    document.getElementById("roleAbility").textContent = role.ability;
    hideIdentity();
  }

  function revealIdentity() {
    if (!revealPressActive || !currentRoom || currentRoom.status !== "dealt" || !currentRoom.ownRole || !roleById[currentRoom.ownRole.id]) return;
    var card = document.getElementById("identityCard");
    card.hidden = false;
    document.getElementById("identityCover").classList.add("is-revealed");
  }

  function hideIdentity() {
    revealPressActive = false;
    window.clearTimeout(revealTimer);
    revealTimer = null;
    document.getElementById("identityCard").hidden = true;
    document.getElementById("identityCover").classList.remove("is-revealed");
  }

  function beginReveal(event) {
    if (event && event.cancelable) event.preventDefault();
    if (revealPressActive || !currentRoom || currentRoom.status !== "dealt" || !currentRoom.ownRole || !roleById[currentRoom.ownRole.id]) return;
    revealPressActive = true;
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(function () {
      revealTimer = null;
      revealIdentity();
    }, 420);
  }

  function endReveal() {
    hideIdentity();
  }

  function copyInvite() {
    if (!currentRoom) return;
    var invite = window.location.origin + window.location.pathname + "?room=" + encodeURIComponent(currentRoom.roomCode);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(invite).then(function () { showToast("邀请链接已复制。"); }).catch(function () { showToast("房间码：" + currentRoom.roomCode); });
    } else {
      showToast("房间码：" + currentRoom.roomCode);
    }
  }

  document.getElementById("createEntry").addEventListener("click", function () {
    selected = Object.create(null);
    capacity = Number(elements.capacity.value || 4);
    renderPicker();
    showView("createView");
  });
  document.getElementById("joinEntry").addEventListener("click", function () { openJoin(""); });
  document.getElementById("goHome").addEventListener("click", function () { showView("homeView"); });
  document.querySelectorAll("[data-go]").forEach(function (button) {
    button.addEventListener("click", function () { showView(button.getAttribute("data-go")); });
  });
  elements.capacity.addEventListener("change", function () {
    capacity = Number(elements.capacity.value);
    updateDeckMeter();
  });
  elements.rolePicker.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-role]");
    if (!button || busy) return;
    var role = roleById[button.getAttribute("data-role")];
    if (!role) return;
    var next = roleCount(role.id) + Number(button.getAttribute("data-delta"));
    if (next < 0 || next > role.maxCount) return;
    selected[role.id] = next;
    renderPicker();
  });
  elements.createButton.addEventListener("click", createRoom);
  document.getElementById("joinForm").addEventListener("submit", joinRoom);
  elements.roomCodeInput.addEventListener("input", function () {
    elements.roomCodeInput.value = elements.roomCodeInput.value.replace(/\D/g, "").slice(0, 4);
  });
  document.getElementById("copyInvite").addEventListener("click", copyInvite);
  document.getElementById("startDealButton").addEventListener("click", startDeal);

  var revealButton = document.getElementById("revealButton");
  revealButton.addEventListener("mousedown", function (event) {
    if (event.button === 0) beginReveal(event);
  });
  window.addEventListener("mouseup", endReveal);
  revealButton.addEventListener("touchstart", beginReveal, { passive: false });
  window.addEventListener("touchend", endReveal);
  window.addEventListener("touchcancel", endReveal);
  document.getElementById("identityFrame").addEventListener("mouseleave", function () {
    if (revealPressActive) endReveal();
  });
  revealButton.addEventListener("click", function (event) { event.preventDefault(); });
  revealButton.addEventListener("keydown", function (event) {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) beginReveal(event);
  });
  window.addEventListener("keyup", function (event) {
    if (event.key === " " || event.key === "Enter") endReveal();
  });
  revealButton.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  window.addEventListener("blur", hideIdentity);
  document.addEventListener("visibilitychange", function () { if (document.hidden) hideIdentity(); });
  window.addEventListener("pagehide", hideIdentity);

  fillCapacityOptions();
  renderPicker();
  document.getElementById("nicknameInput").value = "";
  var initialCode = new URLSearchParams(window.location.search).get("room");
  if (initialCode && /^\d{4}$/.test(initialCode)) {
    var savedToken = getStored(initialCode, "player");
    if (savedToken) {
      loadRoom(initialCode, true).catch(function (error) {
        showView("joinView");
        elements.roomCodeInput.value = initialCode;
        if (error.message !== "not_a_player") notifyApiError(error);
      });
    } else {
      openJoin(initialCode);
    }
  }
})();
