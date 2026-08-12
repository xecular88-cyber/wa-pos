/* ---------- Data layer (localStorage) ---------- */

const STORAGE_KEY = "pos_data_v1";

const DEMO_DATA = {
  settings: { restaurantName: "我的餐厅", taxRate: 0, currency: "$", tableCount: 12 },
  menu: [
    { id: "m1", name: "招牌炒饭", category: "主食", price: 12.5, addOns: [
      { id: "a1", name: "加蛋", price: 1 },
      { id: "a2", name: "加辣", price: 0 },
      { id: "a3", name: "加大份", price: 2 },
    ], requiredGroups: [
      { id: "r1", name: "份量", choices: [
        { id: "c1", name: "小份", priceDelta: 0 },
        { id: "c2", name: "中份", priceDelta: 2 },
        { id: "c3", name: "大份", priceDelta: 4 },
      ] },
    ] },
    { id: "m2", name: "牛肉面", category: "主食", price: 14.0, addOns: [
      { id: "a4", name: "加牛肉", price: 3 },
      { id: "a5", name: "加辣", price: 0 },
    ] },
    { id: "m3", name: "扬州炒饭", category: "主食", price: 11.0, addOns: [] },
    { id: "m4", name: "宫保鸡丁", category: "热菜", price: 15.5, addOns: [
      { id: "a6", name: "加辣", price: 0 },
      { id: "a7", name: "加饭", price: 1.5 },
    ] },
    { id: "m5", name: "麻婆豆腐", category: "热菜", price: 10.5, addOns: [] },
    { id: "m6", name: "糖醋里脊", category: "热菜", price: 16.0, addOns: [] },
    { id: "m7", name: "凉拌黄瓜", category: "凉菜", price: 6.5, addOns: [] },
    { id: "m8", name: "皮蛋豆腐", category: "凉菜", price: 7.0, addOns: [] },
    { id: "m9", name: "酸辣汤", category: "汤品", price: 5.5, addOns: [] },
    { id: "m10", name: "紫菜蛋花汤", category: "汤品", price: 5.0, addOns: [] },
    { id: "m11", name: "可乐", category: "饮品", price: 3.0, addOns: [
      { id: "a8", name: "加冰", price: 0 },
    ] },
    { id: "m12", name: "鲜榨橙汁", category: "饮品", price: 5.0, addOns: [] },
    { id: "m13", name: "珍珠奶茶", category: "饮品", price: 6.0, addOns: [
      { id: "a9", name: "少糖", price: 0 },
      { id: "a10", name: "加珍珠", price: 1 },
    ] },
  ],
  orders: [],
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore corrupt data */ }
  const fresh = structuredClone(DEMO_DATA);
  saveData(fresh);
  return fresh;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let DB = loadData();

/* ---------- State ---------- */

let cart = []; // { menuId, name, price (unit price incl. add-ons/required choices), basePrice, addOns, requiredChoices, qty, note }
let activeCategory = "全部";
let editingItemId = null;
let editingAddOns = []; // working copy of add-ons while item modal is open
let editingRequiredGroups = []; // working copy of required option groups while item modal is open
let editingPhoto = null; // working copy of photo dataURL while item modal is open
let noteTargetItem = null;
let noteQty = 1;
let noteSelectedAddOns = []; // add-ons selected while note modal is open
let noteSelectedRequired = {}; // { groupId: choiceObj } while note modal is open

let selectedOrdersDate = todayDateStr(); // yyyy-mm-dd, drives the Orders tab filter
let editingOrderId = null;
let editingOrderItems = []; // working copy of an order's line items while the edit modal is open

let orderMode = "takeout"; // 'dinein' | 'takeout', for the Order tab
let orderTableNum = 1;
let editingOrderMode = "takeout"; // same, for the order-edit modal
let editingOrderTableNum = 1;

let noteModalContext = "cart"; // 'cart' | 'orderEdit' — where "加入订单" should push the line

/* ---------- Helpers ---------- */

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => document.querySelectorAll(sel);
const fmt = (n) => `${DB.settings.currency}${n.toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 10);

function dateStrOf(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayDateStr() {
  return dateStrOf(new Date());
}

function cartSubtotal() {
  return cart.reduce((sum, l) => sum + l.price * l.qty, 0);
}

/* ---------- Generic touch-friendly drag reorder ---------- */
/* Uses Pointer Events (not the HTML5 Drag & Drop API, which iPad Safari
   doesn't support for touch) so this works with mouse AND touch. */

function enableDragReorder(containerId, rowSelector, onReorder) {
  const container = $(`#${containerId}`);
  let dragEl = null;
  let startClientY = 0;
  let dy = 0;

  function naturalTopOf(el) {
    const t = el.style.transform;
    el.style.transform = "translateY(0px)";
    const top = el.getBoundingClientRect().top;
    el.style.transform = t;
    return top;
  }

  function getRows() {
    return Array.from(container.querySelectorAll(rowSelector));
  }

  container.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".drag-handle");
    if (!handle) return;
    const row = handle.closest(rowSelector);
    if (!row || !container.contains(row)) return;
    e.preventDefault();
    dragEl = row;
    startClientY = e.clientY;
    dy = 0;
    dragEl.classList.add("dragging");
    try { dragEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });

  container.addEventListener("pointermove", (e) => {
    if (!dragEl) return;
    dy = e.clientY - startClientY;
    dragEl.style.transform = `translateY(${dy}px)`;

    const dragRect = dragEl.getBoundingClientRect();
    const dragMid = dragRect.top + dragRect.height / 2;

    for (const row of getRows()) {
      if (row === dragEl) continue;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const dragIsBefore = !!(dragEl.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);

      if (dragMid < mid && !dragIsBefore) {
        const before = dragEl.getBoundingClientRect().top;
        container.insertBefore(dragEl, row);
        const naturalTop = naturalTopOf(dragEl);
        dy = before - naturalTop;
        dragEl.style.transform = `translateY(${dy}px)`;
        startClientY = e.clientY - dy;
        break;
      }
      if (dragMid > mid && dragIsBefore) {
        const before = dragEl.getBoundingClientRect().top;
        container.insertBefore(dragEl, row.nextSibling);
        const naturalTop = naturalTopOf(dragEl);
        dy = before - naturalTop;
        dragEl.style.transform = `translateY(${dy}px)`;
        startClientY = e.clientY - dy;
        break;
      }
    }
  });

  function endDrag() {
    if (!dragEl) return;
    dragEl.classList.remove("dragging");
    dragEl.style.transform = "";
    const orderIds = getRows().map((r) => r.dataset.dragId);
    dragEl = null;
    onReorder(orderIds);
  }

  container.addEventListener("pointerup", endDrag);
  container.addEventListener("pointercancel", endDrag);
}

/* ---------- Tabs ---------- */

$all(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  $all(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $all(".view").forEach((v) => v.classList.toggle("hidden", v.id !== `view-${tab}`));
  if (tab === "orders") renderOrders();
  if (tab === "menu") renderMenuTable();
  if (tab === "settings") fillSettingsForm();
}

/* ---------- Clock ---------- */

function tickClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
setInterval(tickClock, 1000 * 30);
tickClock();

/* ---------- Menu rendering (Order tab) ---------- */

function categories() {
  const set = new Set(DB.menu.map((m) => m.category));
  return ["全部", ...set];
}

function renderCategoryTabs() {
  const wrap = $("#categoryTabs");
  wrap.innerHTML = "";
  categories().forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "cat-btn" + (cat === activeCategory ? " active" : "");
    btn.textContent = cat;
    btn.addEventListener("click", () => {
      activeCategory = cat;
      renderCategoryTabs();
      renderMenuGrid();
    });
    wrap.appendChild(btn);
  });
}

function renderMenuGrid() {
  const grid = $("#menuGrid");
  grid.innerHTML = "";
  const items = DB.menu.filter((m) => activeCategory === "全部" || m.category === activeCategory);
  if (items.length === 0) {
    grid.innerHTML = `<p class="empty-hint">该分类下暂无菜品</p>`;
    return;
  }
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "menu-item";
    const hasAddOns = item.addOns && item.addOns.length > 0;
    const hasRequired = item.requiredGroups && item.requiredGroups.length > 0;
    const photoHtml = item.photo ? `<img class="menu-item-photo" src="${item.photo}" alt="">` : "";
    btn.innerHTML = `
      ${photoHtml}
      <span class="name">${escapeHtml(item.name)}${hasAddOns ? ' <span class="addon-badge">+加料</span>' : ""}${hasRequired ? ' <span class="addon-badge">必选</span>' : ""}</span>
      <span class="price">${fmt(item.price)}</span>
    `;
    btn.addEventListener("click", () => openNoteModal(item));
    grid.appendChild(btn);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Table mode (dine-in / takeout) selector ---------- */

function wireTableModeToggle(toggleId, gridId, getMode, setMode, getTableNum, setTableNum, onChange) {
  const toggle = $(`#${toggleId}`);
  const grid = $(`#${gridId}`);

  function render() {
    toggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === getMode()));
    grid.classList.toggle("hidden", getMode() !== "dinein");
    if (getMode() !== "dinein") return;

    const count = DB.settings.tableCount || 12;
    if (getTableNum() > count) setTableNum(count);
    grid.innerHTML = "";
    for (let i = 1; i <= count; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "table-grid-btn" + (i === getTableNum() ? " active" : "");
      btn.textContent = i;
      btn.addEventListener("click", () => {
        setTableNum(i);
        render();
        if (onChange) onChange();
      });
      grid.appendChild(btn);
    }
  }

  toggle.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => {
      setMode(b.dataset.mode);
      render();
      if (onChange) onChange();
    });
  });

  render();
  return render;
}

function currentTableLabel(mode, tableNum) {
  return mode === "dinein" ? `桌 ${tableNum}` : "外带";
}

function parseTableLabel(label) {
  const m = /^桌\s*(\d+)$/.exec(label || "");
  return m ? { mode: "dinein", tableNum: Number(m[1]) } : { mode: "takeout", tableNum: 1 };
}

const renderOrderTableMode = wireTableModeToggle(
  "orderModeToggle", "tableGrid",
  () => orderMode, (m) => { orderMode = m; },
  () => orderTableNum, (n) => { orderTableNum = n; }
);

const renderOrderEditTableMode = wireTableModeToggle(
  "orderEditModeToggle", "orderEditTableGrid",
  () => editingOrderMode, (m) => { editingOrderMode = m; },
  () => editingOrderTableNum, (n) => { editingOrderTableNum = n; }
);

/* ---------- Note / quantity modal ---------- */

function openNoteModal(item, context) {
  noteModalContext = context || "cart";
  noteTargetItem = item;
  noteQty = 1;
  noteSelectedAddOns = [];
  noteSelectedRequired = {};
  $("#noteModalTitle").textContent = item.name;
  $("#noteQtyValue").textContent = noteQty;
  $("#noteInput").value = "";
  renderNoteRequiredGroups(item);
  renderNoteAddOns(item);
  updateNoteAddBtnState();
  $("#noteModal").classList.remove("hidden");
}

function renderNoteRequiredGroups(item) {
  const groups = item.requiredGroups || [];
  const wrap = $("#noteRequiredGroupsWrap");
  wrap.innerHTML = "";
  groups.forEach((group) => {
    const block = document.createElement("div");
    block.className = "required-group-block";
    block.innerHTML = `<span class="group-title">${escapeHtml(group.name)} <span class="required-star">*必选</span></span>`;
    (group.choices || []).forEach((choice) => {
      const row = document.createElement("label");
      row.className = "required-choice-row";
      row.innerHTML = `
        <span class="required-choice-left">
          <input type="radio" name="required-${group.id}">
          ${escapeHtml(choice.name)}
        </span>
        <span class="required-choice-price">${choice.priceDelta > 0 ? "+" + fmt(choice.priceDelta) : choice.priceDelta < 0 ? "-" + fmt(Math.abs(choice.priceDelta)) : "免费"}</span>
      `;
      const radio = row.querySelector("input");
      radio.addEventListener("change", () => {
        block.querySelectorAll(".required-choice-row").forEach((r) => r.classList.remove("selected"));
        row.classList.add("selected");
        noteSelectedRequired[group.id] = choice;
        updateNoteAddBtnState();
      });
      block.appendChild(row);
    });
    wrap.appendChild(block);
  });
}

function updateNoteAddBtnState() {
  const groups = (noteTargetItem && noteTargetItem.requiredGroups) || [];
  const allSelected = groups.every((g) => noteSelectedRequired[g.id]);
  $("#noteAddBtn").disabled = !allSelected;
}

function renderNoteAddOns(item) {
  const addOns = item.addOns || [];
  const section = $("#noteAddOnsSection");
  const list = $("#noteAddOnsList");
  list.innerHTML = "";
  if (addOns.length === 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  addOns.forEach((addOn) => {
    const row = document.createElement("label");
    row.className = "addon-check-row";
    row.innerHTML = `
      <span class="addon-check-left">
        <input type="checkbox" data-addon-id="${addOn.id}">
        ${escapeHtml(addOn.name)}
      </span>
      <span class="addon-check-price">${addOn.price > 0 ? "+" + fmt(addOn.price) : "免费"}</span>
    `;
    const checkbox = row.querySelector("input");
    checkbox.addEventListener("change", () => {
      row.classList.toggle("selected", checkbox.checked);
      if (checkbox.checked) {
        noteSelectedAddOns.push(addOn);
      } else {
        noteSelectedAddOns = noteSelectedAddOns.filter((a) => a.id !== addOn.id);
      }
    });
    list.appendChild(row);
  });
}

$("#noteQtyMinus").addEventListener("click", () => {
  noteQty = Math.max(1, noteQty - 1);
  $("#noteQtyValue").textContent = noteQty;
});
$("#noteQtyPlus").addEventListener("click", () => {
  noteQty += 1;
  $("#noteQtyValue").textContent = noteQty;
});
$("#noteCancelBtn").addEventListener("click", () => $("#noteModal").classList.add("hidden"));

$("#noteAddBtn").addEventListener("click", () => {
  const groups = (noteTargetItem.requiredGroups || []);
  if (!groups.every((g) => noteSelectedRequired[g.id])) return;

  const note = $("#noteInput").value.trim();
  const addOnsTotal = noteSelectedAddOns.reduce((s, a) => s + a.price, 0);
  const requiredChoices = groups.map((g) => ({
    groupId: g.id,
    groupName: g.name,
    choiceId: noteSelectedRequired[g.id].id,
    choiceName: noteSelectedRequired[g.id].name,
    priceDelta: noteSelectedRequired[g.id].priceDelta,
  }));
  const requiredTotal = requiredChoices.reduce((s, c) => s + c.priceDelta, 0);

  const line = {
    lineId: uid(),
    menuId: noteTargetItem.id,
    name: noteTargetItem.name,
    basePrice: noteTargetItem.price,
    addOns: noteSelectedAddOns.slice(),
    requiredChoices,
    price: noteTargetItem.price + addOnsTotal + requiredTotal,
    qty: noteQty,
    note,
  };

  if (noteModalContext === "orderEdit") {
    editingOrderItems.push(line);
    renderOrderEditItems();
  } else {
    cart.push(line);
    renderCart();
  }
  $("#noteModal").classList.add("hidden");
});

/* ---------- Cart rendering ---------- */

function renderCart() {
  const wrap = $("#cartItems");
  wrap.innerHTML = "";
  if (cart.length === 0) {
    wrap.innerHTML = `<p class="empty-hint">还没有点任何菜品</p>`;
  } else {
    cart.forEach((line) => {
      const div = document.createElement("div");
      div.className = "cart-line";
      const addOnsStr = (line.addOns || []).map((a) => a.name).join("、");
      const requiredStr = (line.requiredChoices || []).map((c) => `${c.groupName}：${c.choiceName}`).join("、");
      div.innerHTML = `
        <div class="cart-line-top">
          <div>
            <div class="cart-line-name">${escapeHtml(line.name)}</div>
            ${requiredStr ? `<div class="cart-line-note">${escapeHtml(requiredStr)}</div>` : ""}
            ${addOnsStr ? `<div class="cart-line-note">加料：${escapeHtml(addOnsStr)}</div>` : ""}
            ${line.note ? `<div class="cart-line-note">备注：${escapeHtml(line.note)}</div>` : ""}
          </div>
          <div class="cart-line-price">${fmt(line.price * line.qty)}</div>
        </div>
        <div class="cart-line-controls">
          <button class="qty-btn" data-act="minus">−</button>
          <span>${line.qty}</span>
          <button class="qty-btn" data-act="plus">+</button>
          <button class="cart-line-remove" data-act="remove">删除</button>
        </div>
      `;
      div.querySelector('[data-act="minus"]').addEventListener("click", () => changeQty(line.lineId, -1));
      div.querySelector('[data-act="plus"]').addEventListener("click", () => changeQty(line.lineId, 1));
      div.querySelector('[data-act="remove"]').addEventListener("click", () => removeLine(line.lineId));
      wrap.appendChild(div);
    });
  }
  renderSummary();
}

function changeQty(lineId, delta) {
  const line = cart.find((l) => l.lineId === lineId);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) cart = cart.filter((l) => l.lineId !== lineId);
  renderCart();
}

function removeLine(lineId) {
  cart = cart.filter((l) => l.lineId !== lineId);
  renderCart();
}

$("#clearCartBtn").addEventListener("click", () => {
  cart = [];
  renderCart();
});

function renderSummary() {
  const subtotal = cartSubtotal();
  const discountPct = Math.min(100, Math.max(0, Number($("#discountInput").value) || 0));
  const discounted = subtotal * (1 - discountPct / 100);
  const taxRate = DB.settings.taxRate || 0;
  const tax = discounted * (taxRate / 100);
  const total = discounted + tax;

  $("#sumSubtotal").textContent = fmt(subtotal);
  $("#taxLabel").textContent = `税 (${taxRate}%)`;
  $("#sumTax").textContent = fmt(tax);
  $("#sumTotal").textContent = fmt(total);
  $("#checkoutBtn").disabled = cart.length === 0;
}

$("#discountInput").addEventListener("input", renderSummary);

/* ---------- Checkout / Receipt ---------- */

$("#checkoutBtn").addEventListener("click", () => {
  if (cart.length === 0) return;
  openReceiptPreview();
});

function computeTotals() {
  const subtotal = cartSubtotal();
  const discountPct = Math.min(100, Math.max(0, Number($("#discountInput").value) || 0));
  const discountAmt = subtotal * (discountPct / 100);
  const discounted = subtotal - discountAmt;
  const taxRate = DB.settings.taxRate || 0;
  const tax = discounted * (taxRate / 100);
  const total = discounted + tax;
  return { subtotal, discountPct, discountAmt, taxRate, tax, total };
}

function openReceiptPreview() {
  const t = computeTotals();
  const table = currentTableLabel(orderMode, orderTableNum);
  const now = new Date();

  let html = `
    <h3>${escapeHtml(DB.settings.restaurantName)}</h3>
    <div class="receipt-sub">桌号：${escapeHtml(table)} ・ ${now.toLocaleString()}</div>
    <div class="receipt-divider"></div>
  `;
  cart.forEach((l) => {
    const requiredStr = (l.requiredChoices || []).map((c) => c.choiceName).join("、");
    const addOnsStr = (l.addOns || []).map((a) => a.name).join("、");
    const extra = [requiredStr, addOnsStr, l.note].filter(Boolean).join(" / ");
    html += `<div class="receipt-line"><span>${escapeHtml(l.name)} x${l.qty}${extra ? " (" + escapeHtml(extra) + ")" : ""}</span><span>${fmt(l.price * l.qty)}</span></div>`;
  });
  html += `<div class="receipt-divider"></div>`;
  html += `<div class="receipt-line"><span>小计</span><span>${fmt(t.subtotal)}</span></div>`;
  if (t.discountPct > 0) html += `<div class="receipt-line"><span>折扣 (${t.discountPct}%)</span><span>-${fmt(t.discountAmt)}</span></div>`;
  html += `<div class="receipt-line"><span>税 (${t.taxRate}%)</span><span>${fmt(t.tax)}</span></div>`;
  html += `<div class="receipt-divider"></div>`;
  html += `<div class="receipt-line receipt-total"><span>总计</span><span>${fmt(t.total)}</span></div>`;

  $("#receiptView").innerHTML = html;
  $("#checkoutModal").classList.remove("hidden");
}

$("#checkoutCancelBtn").addEventListener("click", () => $("#checkoutModal").classList.add("hidden"));

$("#confirmPayBtn").addEventListener("click", () => {
  const t = computeTotals();
  const table = currentTableLabel(orderMode, orderTableNum);
  const order = {
    id: uid(),
    createdAt: new Date().toISOString(),
    table,
    items: cart.map((l) => ({
      name: l.name, price: l.price, qty: l.qty, note: l.note,
      addOns: l.addOns || [], requiredChoices: l.requiredChoices || [],
    })),
    subtotal: t.subtotal,
    discountPct: t.discountPct,
    taxRate: t.taxRate,
    tax: t.tax,
    total: t.total,
  };
  DB.orders.unshift(order);
  saveData(DB);

  cart = [];
  $("#discountInput").value = 0;
  renderCart();
  $("#checkoutModal").classList.add("hidden");
});

/* ---------- Orders history tab ---------- */

function ordersOnDate(dateStr) {
  return DB.orders.filter((o) => dateStrOf(new Date(o.createdAt)) === dateStr);
}

function orderItemsSummary(o) {
  return o.items.map((i) => {
    const requiredStr = (i.requiredChoices || []).map((c) => c.choiceName).join("+");
    const addOnsStr = (i.addOns || []).map((a) => a.name).join("+");
    const extra = [requiredStr, addOnsStr].filter(Boolean).join("+");
    return `${i.name}${extra ? "(" + extra + ")" : ""} x${i.qty}`;
  }).join("、");
}

function initOrdersDateInput() {
  const input = $("#ordersDateInput");
  const today = todayDateStr();
  const min = dateStrOf(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  input.max = today;
  input.min = min;
  input.value = selectedOrdersDate;
  if (input.dataset.wired) return;
  input.dataset.wired = "1";
  input.addEventListener("change", () => {
    selectedOrdersDate = input.value || today;
    renderOrders();
  });
}

function renderOrders() {
  const list = $("#ordersList");
  list.innerHTML = "";

  const dayOrders = ordersOnDate(selectedOrdersDate);
  const dayTotal = dayOrders.reduce((s, o) => s + o.total, 0);
  $("#dayStats").innerHTML = `<span>当日订单：<b>${dayOrders.length}</b></span><span>当日营业额：<b>${fmt(dayTotal)}</b></span>`;

  if (dayOrders.length === 0) {
    list.innerHTML = `<p class="empty-hint">这一天没有订单记录</p>`;
    return;
  }

  dayOrders.forEach((o) => {
    const div = document.createElement("div");
    div.className = "order-card";
    div.innerHTML = `
      <div class="order-card-top"><span>桌号 ${escapeHtml(o.table)}</span><span>${fmt(o.total)}</span></div>
      <div class="order-card-meta">${new Date(o.createdAt).toLocaleString()}</div>
      <div class="order-card-items">${escapeHtml(orderItemsSummary(o))}</div>
      <div class="order-card-actions"><button data-act="edit">编辑订单</button></div>
    `;
    div.querySelector('[data-act="edit"]').addEventListener("click", () => openOrderEditModal(o));
    list.appendChild(div);
  });
}

$("#printSettlementBtn").addEventListener("click", () => {
  const dayOrders = ordersOnDate(selectedOrdersDate);
  const dayTotal = dayOrders.reduce((s, o) => s + o.total, 0);
  const daySubtotal = dayOrders.reduce((s, o) => s + o.subtotal, 0);
  const dayTax = dayOrders.reduce((s, o) => s + o.tax, 0);

  let html = `
    <h2>${escapeHtml(DB.settings.restaurantName)}</h2>
    <div class="print-sub">每日结算报告 ・ ${escapeHtml(selectedOrdersDate)}</div>
    <div class="print-divider"></div>
  `;
  if (dayOrders.length === 0) {
    html += `<div class="print-line"><span>这一天没有订单记录</span></div>`;
  } else {
    dayOrders.forEach((o, i) => {
      html += `<div class="print-line" style="font-weight:700;"><span>订单 ${i + 1} ・ 桌号 ${escapeHtml(o.table)} ・ ${new Date(o.createdAt).toLocaleTimeString()}</span><span>${fmt(o.total)}</span></div>`;
      o.items.forEach((it) => {
        const requiredStr = (it.requiredChoices || []).map((c) => c.choiceName).join("+");
        const addOnsStr = (it.addOns || []).map((a) => a.name).join("+");
        const extra = [requiredStr, addOnsStr].filter(Boolean).join("+");
        html += `<div class="print-line"><span>　${escapeHtml(it.name)}${extra ? "(" + escapeHtml(extra) + ")" : ""} x${it.qty}</span><span>${fmt(it.price * it.qty)}</span></div>`;
      });
      if (o.discountPct > 0) {
        html += `<div class="print-line"><span>　折扣 (${o.discountPct}%)</span><span>-${fmt(o.subtotal * (o.discountPct / 100))}</span></div>`;
      }
      html += `<div class="print-line"><span>　税 (${o.taxRate || 0}%)</span><span>${fmt(o.tax)}</span></div>`;
    });
    html += `<div class="print-divider"></div>`;
    html += `<div class="print-line"><span>订单数</span><span>${dayOrders.length}</span></div>`;
    html += `<div class="print-line"><span>小计合计</span><span>${fmt(daySubtotal)}</span></div>`;
    html += `<div class="print-line"><span>税额合计</span><span>${fmt(dayTax)}</span></div>`;
    html += `<div class="print-divider"></div>`;
    html += `<div class="print-line print-total"><span>营业额合计</span><span>${fmt(dayTotal)}</span></div>`;
  }
  $("#printSettlementView").innerHTML = html;
  window.print();
});

/* ---------- Order editing ---------- */

function openOrderEditModal(order) {
  editingOrderId = order.id;
  editingOrderItems = order.items.map((i) => ({ ...i, lineId: uid() }));
  const parsed = parseTableLabel(order.table);
  editingOrderMode = parsed.mode;
  editingOrderTableNum = parsed.tableNum;
  renderOrderEditTableMode();
  $("#orderEditDiscount").value = order.discountPct || 0;
  $("#orderEditItemPicker").classList.add("hidden");
  renderOrderEditItems();
  $("#orderEditModal").classList.remove("hidden");
}

$("#orderEditAddItemBtn").addEventListener("click", () => {
  const picker = $("#orderEditItemPicker");
  picker.innerHTML = `<option value="">选择要添加的菜品…</option>`;
  categories().filter((c) => c !== "全部").forEach((cat) => {
    const group = document.createElement("optgroup");
    group.label = cat;
    DB.menu.filter((m) => m.category === cat).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name}（${fmt(m.price)}）`;
      group.appendChild(opt);
    });
    picker.appendChild(group);
  });
  picker.classList.remove("hidden");
  picker.value = "";
});

$("#orderEditItemPicker").addEventListener("change", (e) => {
  const item = DB.menu.find((m) => m.id === e.target.value);
  if (!item) return;
  e.target.classList.add("hidden");
  openNoteModal(item, "orderEdit");
});

function renderOrderEditItems() {
  const wrap = $("#orderEditItems");
  wrap.innerHTML = "";
  if (editingOrderItems.length === 0) {
    wrap.innerHTML = `<p class="empty-hint">订单里没有商品了</p>`;
  } else {
    editingOrderItems.forEach((line) => {
      const div = document.createElement("div");
      div.className = "cart-line";
      const requiredStr = (line.requiredChoices || []).map((c) => c.choiceName).join("、");
      const addOnsStr = (line.addOns || []).map((a) => a.name).join("、");
      div.innerHTML = `
        <div class="cart-line-top">
          <div>
            <div class="cart-line-name">${escapeHtml(line.name)}</div>
            ${requiredStr ? `<div class="cart-line-note">${escapeHtml(requiredStr)}</div>` : ""}
            ${addOnsStr ? `<div class="cart-line-note">加料：${escapeHtml(addOnsStr)}</div>` : ""}
          </div>
          <div class="cart-line-price">${fmt(line.price * line.qty)}</div>
        </div>
        <div class="cart-line-controls">
          <button class="qty-btn" data-act="minus">−</button>
          <span>${line.qty}</span>
          <button class="qty-btn" data-act="plus">+</button>
          <button class="cart-line-remove" data-act="remove">删除</button>
        </div>
      `;
      div.querySelector('[data-act="minus"]').addEventListener("click", () => changeOrderEditQty(line.lineId, -1));
      div.querySelector('[data-act="plus"]').addEventListener("click", () => changeOrderEditQty(line.lineId, 1));
      div.querySelector('[data-act="remove"]').addEventListener("click", () => {
        editingOrderItems = editingOrderItems.filter((l) => l.lineId !== line.lineId);
        renderOrderEditItems();
      });
      wrap.appendChild(div);
    });
  }
  renderOrderEditSummary();
}

function changeOrderEditQty(lineId, delta) {
  const line = editingOrderItems.find((l) => l.lineId === lineId);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) editingOrderItems = editingOrderItems.filter((l) => l.lineId !== lineId);
  renderOrderEditItems();
}

function orderEditTotals() {
  const subtotal = editingOrderItems.reduce((s, l) => s + l.price * l.qty, 0);
  const discountPct = Math.min(100, Math.max(0, Number($("#orderEditDiscount").value) || 0));
  const discountAmt = subtotal * (discountPct / 100);
  const discounted = subtotal - discountAmt;
  const order = DB.orders.find((o) => o.id === editingOrderId);
  const taxRate = (order && order.taxRate != null ? order.taxRate : DB.settings.taxRate) || 0;
  const tax = discounted * (taxRate / 100);
  const total = discounted + tax;
  return { subtotal, discountPct, taxRate, tax, total };
}

function renderOrderEditSummary() {
  const t = orderEditTotals();
  $("#orderEditSubtotal").textContent = fmt(t.subtotal);
  $("#orderEditTaxLabel").textContent = `税 (${t.taxRate}%)`;
  $("#orderEditTax").textContent = fmt(t.tax);
  $("#orderEditTotal").textContent = fmt(t.total);
}

$("#orderEditDiscount").addEventListener("input", renderOrderEditSummary);
$("#orderEditCancelBtn").addEventListener("click", () => $("#orderEditModal").classList.add("hidden"));

$("#orderEditSaveBtn").addEventListener("click", () => {
  if (editingOrderItems.length === 0) {
    alert("订单不能清空，如果要整单取消，请直接删除对应商品后仍保留至少一项，或联系管理员手动处理。");
    return;
  }
  const order = DB.orders.find((o) => o.id === editingOrderId);
  if (!order) return;
  const t = orderEditTotals();
  order.table = currentTableLabel(editingOrderMode, editingOrderTableNum);
  order.items = editingOrderItems.map((l) => ({
    name: l.name, price: l.price, qty: l.qty, note: l.note,
    addOns: l.addOns || [], requiredChoices: l.requiredChoices || [],
  }));
  order.subtotal = t.subtotal;
  order.discountPct = t.discountPct;
  order.taxRate = t.taxRate;
  order.tax = t.tax;
  order.total = t.total;
  saveData(DB);
  $("#orderEditModal").classList.add("hidden");
  renderOrders();
});

/* ---------- Menu management tab ---------- */

function renderMenuTable() {
  const tbody = $("#menuTableBody");
  tbody.innerHTML = "";
  DB.menu.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.dragId = item.id;
    const thumb = item.photo ? `<img class="menu-table-thumb" src="${item.photo}" alt="">` : "";
    tr.innerHTML = `
      <td><span class="drag-handle">⠿</span></td>
      <td>${thumb}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${fmt(item.price)}</td>
      <td class="row-actions"><button data-act="edit">编辑</button><button data-act="dup">复制</button></td>
    `;
    tr.querySelector('[data-act="edit"]').addEventListener("click", () => openItemModal(item));
    tr.querySelector('[data-act="dup"]').addEventListener("click", () => duplicateMenuItem(item.id));
    tbody.appendChild(tr);
  });
  const dl = $("#categoryList");
  dl.innerHTML = "";
  categories().filter((c) => c !== "全部").forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    dl.appendChild(opt);
  });
}

function duplicateMenuItem(id) {
  const item = DB.menu.find((m) => m.id === id);
  if (!item) return;
  const copy = {
    ...item,
    id: uid(),
    name: `${item.name} 副本`,
    addOns: (item.addOns || []).map((a) => ({ ...a, id: uid() })),
    requiredGroups: (item.requiredGroups || []).map((g) => ({
      ...g, id: uid(), choices: g.choices.map((c) => ({ ...c, id: uid() })),
    })),
  };
  const idx = DB.menu.findIndex((m) => m.id === id);
  DB.menu.splice(idx + 1, 0, copy);
  saveData(DB);
  renderMenuTable();
  renderCategoryTabs();
  renderMenuGrid();
  openItemModal(copy);
}

$("#addItemBtn").addEventListener("click", () => openItemModal(null));

function openItemModal(item) {
  editingItemId = item ? item.id : null;
  editingAddOns = item && item.addOns ? item.addOns.map((a) => ({ ...a })) : [];
  editingRequiredGroups = item && item.requiredGroups
    ? item.requiredGroups.map((g) => ({ ...g, choices: g.choices.map((c) => ({ ...c })) }))
    : [];
  editingPhoto = item && item.photo ? item.photo : null;
  $("#itemModalTitle").textContent = item ? "编辑菜品" : "添加菜品";
  $("#itemNameInput").value = item ? item.name : "";
  $("#itemCategoryInput").value = item ? item.category : "";
  $("#itemPriceInput").value = item ? item.price : "";
  $("#itemPhotoInput").value = "";
  $("#itemDeleteBtn").classList.toggle("hidden", !item);
  renderPhotoPreview();
  renderRequiredGroupsEditList();
  renderAddOnEditList();
  $("#itemModal").classList.remove("hidden");
}

/* ---- Photo upload ---- */

function renderPhotoPreview() {
  const wrap = $("#itemPhotoPreviewWrap");
  if (editingPhoto) {
    wrap.classList.remove("hidden");
    $("#itemPhotoPreview").src = editingPhoto;
  } else {
    wrap.classList.add("hidden");
  }
}

function resizeImageFile(file, size, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        // Center-crop to a square, then scale to `size` — keeps every photo
        // a consistent square across the grid, table thumb, and preview.
        const srcSize = Math.min(img.width, img.height);
        const sx = (img.width - srcSize) / 2;
        const sy = (img.height - srcSize) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        canvas.getContext("2d").drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

$("#itemPhotoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    editingPhoto = await resizeImageFile(file, 320, 0.72);
    renderPhotoPreview();
  } catch (err) {
    alert("照片处理失败，请换一张试试");
  }
});

$("#itemPhotoRemoveBtn").addEventListener("click", () => {
  editingPhoto = null;
  $("#itemPhotoInput").value = "";
  renderPhotoPreview();
});

/* ---- Required option groups editing ---- */

function renderRequiredGroupsEditList() {
  const wrap = $("#itemRequiredGroupsList");
  wrap.innerHTML = "";
  editingRequiredGroups.forEach((group, gIdx) => {
    const card = document.createElement("div");
    card.className = "required-group-card";
    card.innerHTML = `
      <div class="required-group-card-head">
        <input type="text" class="group-name-input" placeholder="选项组名称，例如份量" value="${escapeHtml(group.name)}">
        <button type="button" class="required-group-remove-btn">×</button>
      </div>
      <div class="required-choice-edit-list"></div>
      <button type="button" class="ghost-btn small add-choice-btn">+ 添加选项</button>
    `;
    card.querySelector(".group-name-input").addEventListener("input", (e) => {
      group.name = e.target.value;
    });
    card.querySelector(".required-group-remove-btn").addEventListener("click", () => {
      editingRequiredGroups.splice(gIdx, 1);
      renderRequiredGroupsEditList();
    });
    const choiceList = card.querySelector(".required-choice-edit-list");
    group.choices.forEach((choice, cIdx) => {
      const row = document.createElement("div");
      row.className = "addon-edit-row";
      row.innerHTML = `
        <input type="text" class="addon-name-input" placeholder="选项名称，例如中份" value="${escapeHtml(choice.name)}">
        <input type="number" class="addon-price-input" step="0.01" placeholder="加价" value="${choice.priceDelta}">
        <button type="button" class="addon-remove-btn">×</button>
      `;
      row.querySelector(".addon-name-input").addEventListener("input", (e) => {
        choice.name = e.target.value;
      });
      row.querySelector(".addon-price-input").addEventListener("input", (e) => {
        choice.priceDelta = Number(e.target.value) || 0;
      });
      row.querySelector(".addon-remove-btn").addEventListener("click", () => {
        group.choices.splice(cIdx, 1);
        renderRequiredGroupsEditList();
      });
      choiceList.appendChild(row);
    });
    card.querySelector(".add-choice-btn").addEventListener("click", () => {
      group.choices.push({ id: uid(), name: "", priceDelta: 0 });
      renderRequiredGroupsEditList();
    });
    wrap.appendChild(card);
  });
}

$("#addRequiredGroupBtn").addEventListener("click", () => {
  editingRequiredGroups.push({ id: uid(), name: "", choices: [{ id: uid(), name: "", priceDelta: 0 }] });
  renderRequiredGroupsEditList();
});

/* ---- Add-ons editing ---- */

function renderAddOnEditList() {
  const wrap = $("#itemAddOnsList");
  wrap.innerHTML = "";
  editingAddOns.forEach((addOn, idx) => {
    const row = document.createElement("div");
    row.className = "addon-edit-row";
    row.dataset.dragId = addOn.id;
    row.innerHTML = `
      <span class="drag-handle">⠿</span>
      <input type="text" class="addon-name-input" placeholder="名称，例如加蛋" value="${escapeHtml(addOn.name)}">
      <input type="number" class="addon-price-input" min="0" step="0.01" placeholder="价格" value="${addOn.price}">
      <button type="button" class="addon-remove-btn">×</button>
    `;
    row.querySelector(".addon-name-input").addEventListener("input", (e) => {
      editingAddOns[idx].name = e.target.value;
    });
    row.querySelector(".addon-price-input").addEventListener("input", (e) => {
      editingAddOns[idx].price = Number(e.target.value) || 0;
    });
    row.querySelector(".addon-remove-btn").addEventListener("click", () => {
      editingAddOns.splice(idx, 1);
      renderAddOnEditList();
    });
    wrap.appendChild(row);
  });
}

$("#addAddOnBtn").addEventListener("click", () => {
  editingAddOns.push({ id: uid(), name: "", price: 0 });
  renderAddOnEditList();
});

$("#itemCancelBtn").addEventListener("click", () => $("#itemModal").classList.add("hidden"));

$("#itemSaveBtn").addEventListener("click", () => {
  const name = $("#itemNameInput").value.trim();
  const category = $("#itemCategoryInput").value.trim() || "其他";
  const price = Number($("#itemPriceInput").value);
  if (!name || isNaN(price) || price < 0) {
    alert("请填写有效的菜品名称和价格");
    return;
  }
  const addOns = editingAddOns
    .map((a) => ({ id: a.id, name: a.name.trim(), price: Number(a.price) || 0 }))
    .filter((a) => a.name);
  const requiredGroups = editingRequiredGroups
    .map((g) => ({
      id: g.id,
      name: g.name.trim(),
      choices: g.choices
        .map((c) => ({ id: c.id, name: c.name.trim(), priceDelta: Number(c.priceDelta) || 0 }))
        .filter((c) => c.name),
    }))
    .filter((g) => g.name && g.choices.length > 0);
  const photo = editingPhoto;
  if (editingItemId) {
    const item = DB.menu.find((m) => m.id === editingItemId);
    Object.assign(item, { name, category, price, addOns, requiredGroups, photo });
  } else {
    DB.menu.push({ id: uid(), name, category, price, addOns, requiredGroups, photo });
  }
  saveData(DB);
  $("#itemModal").classList.add("hidden");
  renderMenuTable();
  renderCategoryTabs();
  renderMenuGrid();
});

$("#itemDeleteBtn").addEventListener("click", () => {
  if (!editingItemId) return;
  if (!confirm("确定删除该菜品？")) return;
  DB.menu = DB.menu.filter((m) => m.id !== editingItemId);
  saveData(DB);
  $("#itemModal").classList.add("hidden");
  renderMenuTable();
  renderCategoryTabs();
  renderMenuGrid();
});

/* ---------- Settings tab ---------- */

function fillSettingsForm() {
  $("#settingRestaurantName").value = DB.settings.restaurantName;
  $("#settingTaxRate").value = DB.settings.taxRate;
  $("#settingCurrency").value = DB.settings.currency;
  $("#settingTableCount").value = DB.settings.tableCount || 12;
}

$("#saveSettingsBtn").addEventListener("click", () => {
  DB.settings.restaurantName = $("#settingRestaurantName").value.trim() || "我的餐厅";
  DB.settings.taxRate = Number($("#settingTaxRate").value) || 0;
  DB.settings.currency = $("#settingCurrency").value.trim() || "$";
  DB.settings.tableCount = Math.max(1, Number($("#settingTableCount").value) || 12);
  saveData(DB);
  $("#restaurantName").textContent = DB.settings.restaurantName;
  renderSummary();
  renderOrderTableMode();
  alert("设置已保存");
});

$("#resetDataBtn").addEventListener("click", () => {
  if (!confirm("将清空所有菜单、订单，恢复为演示数据。确定继续？")) return;
  DB = structuredClone(DEMO_DATA);
  saveData(DB);
  cart = [];
  activeCategory = "全部";
  initApp();
});

/* ---------- Init ---------- */

function initApp() {
  $("#restaurantName").textContent = DB.settings.restaurantName;
  renderCategoryTabs();
  renderMenuGrid();
  renderCart();
  fillSettingsForm();
  initOrdersDateInput();
}

initApp();

enableDragReorder("menuTableBody", "tr", (orderIds) => {
  DB.menu = orderIds.map((id) => DB.menu.find((m) => m.id === id));
  saveData(DB);
  renderMenuTable();
  renderCategoryTabs();
  renderMenuGrid();
});

enableDragReorder("itemAddOnsList", ".addon-edit-row", (orderIds) => {
  editingAddOns = orderIds.map((id) => editingAddOns.find((a) => a.id === id));
  renderAddOnEditList();
});

/* Register service worker for "Add to Home Screen" offline support (best effort) */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
