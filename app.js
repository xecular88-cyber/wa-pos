/* ---------- Data layer (localStorage) ---------- */

const STORAGE_KEY = "pos_data_v1";

const DEMO_DATA = {
  settings: {
    restaurantName: "我的餐厅", taxRate: 0, currency: "$", tableCount: 12,
    deliveryMarkupPct: 15, deliveryDefaultCommissionPct: 30,
  },
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
  openTabs: {}, // { [tabKey]: { cart: [...], discountPct: 0 } } — one in-progress order per table/takeout
};

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.openTabs) parsed.openTabs = {};
      // The photo feature was removed after causing storage-quota issues;
      // clear out any photo data left behind by earlier versions so users
      // upgrading actually reclaim that space instead of just not adding more.
      let hadPhotoData = false;
      (parsed.menu || []).forEach((m) => {
        if (m.photo || m.photoOriginal || m.photoCrop) {
          delete m.photo;
          delete m.photoOriginal;
          delete m.photoCrop;
          hadPhotoData = true;
        }
      });
      if (hadPhotoData) saveData(parsed);
      return parsed;
    }
  } catch (e) { /* ignore corrupt data */ }
  const fresh = structuredClone(DEMO_DATA);
  saveData(fresh);
  return fresh;
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}

let DB = loadData();

/* ---------- State ---------- */

let cart = []; // { menuId, name, price (unit price incl. add-ons/required choices), basePrice, addOns, requiredChoices, qty, note }
let activeCategory = "全部";
let editingItemId = null;
let editingAddOns = []; // working copy of add-ons while item modal is open
let editingRequiredGroups = []; // working copy of required option groups while item modal is open
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

let checkoutPaymentMethod = "cash"; // 'cash' | 'tng', for the checkout modal
let editingOrderPaymentMethod = "cash"; // same, for the order-edit modal

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
    btn.innerHTML = `
      <span class="name">${escapeHtml(item.name)}${hasAddOns ? ' <span class="addon-badge">+加料</span>' : ""}${hasRequired ? ' <span class="addon-badge">必选</span>' : ""}</span>
      <span class="price">${fmt(effectivePrice(item, orderMode))}</span>
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
    grid.classList.remove("hidden");

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
  if (mode === "dinein") return `桌 ${tableNum}`;
  if (mode === "delivery") return `外卖 #${tableNum}`;
  return `外带 #${tableNum}`;
}

function parseTableLabel(label) {
  let m = /^桌\s*(\d+)$/.exec(label || "");
  if (m) return { mode: "dinein", tableNum: Number(m[1]) };
  m = /^外卖\s*#?(\d+)$/.exec(label || "");
  if (m) return { mode: "delivery", tableNum: Number(m[1]) };
  m = /^外带\s*#?(\d+)$/.exec(label || "");
  if (m) return { mode: "takeout", tableNum: Number(m[1]) };
  return { mode: "takeout", tableNum: 1 }; // legacy orders just labeled "外带"
}

// Effective selling price for an item under a given order mode — delivery
// uses a per-item override if set, otherwise the global markup percentage.
function effectivePrice(item, mode) {
  if (mode !== "delivery") return item.price;
  if (item.deliveryPriceOverride != null) return item.deliveryPriceOverride;
  const pct = DB.settings.deliveryMarkupPct || 0;
  return item.price * (1 + pct / 100);
}

// Add-ons and required-option price deltas don't have their own delivery
// override field, so they always scale by the global delivery markup %
// (even when the item itself uses a flat per-item override price).
function effectiveExtraPrice(rawPrice, mode) {
  if (mode !== "delivery") return rawPrice;
  const pct = DB.settings.deliveryMarkupPct || 0;
  return rawPrice * (1 + pct / 100);
}

/* ---------- Per-table open orders ---------- */
/* Each dine-in table (and takeout) keeps its own in-progress cart, so
   switching tables never loses or mixes up what's already been ordered. */

function currentTabKey() {
  return `${orderMode}-${orderTableNum}`;
}

function loadCartForCurrentTable() {
  const tab = DB.openTabs[currentTabKey()] || { cart: [], discountPct: 0 };
  cart = tab.cart;
  $("#discountInput").value = tab.discountPct || 0;
  renderCart();
}

function syncCurrentOpenTab() {
  const discountPct = Math.min(100, Math.max(0, Number($("#discountInput").value) || 0));
  DB.openTabs[currentTabKey()] = { cart, discountPct };
  saveData(DB);
}

const renderOrderTableMode = wireTableModeToggle(
  "orderModeToggle", "tableGrid",
  () => orderMode, (m) => { orderMode = m; },
  () => orderTableNum, (n) => { orderTableNum = n; },
  () => { loadCartForCurrentTable(); renderMenuGrid(); }
);

const renderOrderEditTableMode = wireTableModeToggle(
  "orderEditModeToggle", "orderEditTableGrid",
  () => editingOrderMode, (m) => { editingOrderMode = m; },
  () => editingOrderTableNum, (n) => { editingOrderTableNum = n; },
  updateOrderEditModeFields
);

function updateOrderEditModeFields() {
  const isDelivery = editingOrderMode === "delivery";
  $("#orderEditDeliveryFieldsWrap").classList.toggle("hidden", !isDelivery);
  $("#orderEditPaymentWrap").classList.toggle("hidden", isDelivery);
  if (isDelivery) {
    if (!$("#orderEditDeliveryPlatformInput").value) $("#orderEditDeliveryPlatformInput").value = "Grab";
    if (!$("#orderEditDeliveryCommissionInput").value) $("#orderEditDeliveryCommissionInput").value = DB.settings.deliveryDefaultCommissionPct || 0;
    updateOrderEditDeliveryNet();
  }
}

const renderOrderEditPayment = wirePaymentToggle(
  "orderEditPaymentToggle",
  () => editingOrderPaymentMethod, (m) => { editingOrderPaymentMethod = m; }
);

/* ---------- Payment method toggle (Cash / Touch 'n Go) ---------- */

function wirePaymentToggle(toggleId, getMethod, setMethod, onChange) {
  const toggle = $(`#${toggleId}`);
  function render() {
    toggle.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.method === getMethod()));
  }
  toggle.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => {
      setMethod(b.dataset.method);
      render();
      if (onChange) onChange();
    });
  });
  render();
  return render;
}

function paymentMethodLabel(method) {
  return method === "tng" ? "Touch 'n Go" : "Cash";
}

function orderPaymentLabel(o) {
  if (o.paymentMethod === "platform") return o.deliveryPlatform || "外卖";
  return o.paymentMethod ? paymentMethodLabel(o.paymentMethod) : "未记录";
}

// Actual money received for an order — for delivery orders this is the
// commission-deducted net amount, not the customer-facing order total.
function orderRevenue(o) {
  return o.paymentMethod === "platform" && o.deliveryNetAmount != null ? o.deliveryNetAmount : o.total;
}

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
  const mode = noteModalContext === "orderEdit" ? editingOrderMode : orderMode;
  renderNoteRequiredGroups(item, mode);
  renderNoteAddOns(item, mode);
  updateNoteAddBtnState();
  $("#noteModal").classList.remove("hidden");
}

function renderNoteRequiredGroups(item, mode) {
  const groups = item.requiredGroups || [];
  const wrap = $("#noteRequiredGroupsWrap");
  wrap.innerHTML = "";
  groups.forEach((group) => {
    const block = document.createElement("div");
    block.className = "required-group-block";
    block.innerHTML = `<span class="group-title">${escapeHtml(group.name)} <span class="required-star">*必选</span></span>`;
    (group.choices || []).forEach((choice) => {
      const delta = effectiveExtraPrice(choice.priceDelta, mode);
      const row = document.createElement("label");
      row.className = "required-choice-row";
      row.innerHTML = `
        <span class="required-choice-left">
          <input type="radio" name="required-${group.id}">
          ${escapeHtml(choice.name)}
        </span>
        <span class="required-choice-price">${delta > 0 ? "+" + fmt(delta) : delta < 0 ? "-" + fmt(Math.abs(delta)) : "免费"}</span>
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

function renderNoteAddOns(item, mode) {
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
    const price = effectiveExtraPrice(addOn.price, mode);
    const row = document.createElement("label");
    row.className = "addon-check-row";
    row.innerHTML = `
      <span class="addon-check-left">
        <input type="checkbox" data-addon-id="${addOn.id}">
        ${escapeHtml(addOn.name)}
      </span>
      <span class="addon-check-price">${price > 0 ? "+" + fmt(price) : "免费"}</span>
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
  const modeForPricing = noteModalContext === "orderEdit" ? editingOrderMode : orderMode;
  const addOnsTotal = noteSelectedAddOns.reduce((s, a) => s + effectiveExtraPrice(a.price, modeForPricing), 0);
  const requiredChoices = groups.map((g) => ({
    groupId: g.id,
    groupName: g.name,
    choiceId: noteSelectedRequired[g.id].id,
    choiceName: noteSelectedRequired[g.id].name,
    priceDelta: effectiveExtraPrice(noteSelectedRequired[g.id].priceDelta, modeForPricing),
  }));
  const requiredTotal = requiredChoices.reduce((s, c) => s + c.priceDelta, 0);
  const base = effectivePrice(noteTargetItem, modeForPricing);

  const line = {
    lineId: uid(),
    menuId: noteTargetItem.id,
    name: noteTargetItem.name,
    basePrice: base,
    addOns: noteSelectedAddOns.slice(),
    requiredChoices,
    price: base + addOnsTotal + requiredTotal,
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
  syncCurrentOpenTab();
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

  if (orderMode === "delivery") {
    $("#paymentMethodToggle").classList.add("hidden");
    $("#cashGivenWrap").classList.add("hidden");
    $("#deliveryFieldsWrap").classList.remove("hidden");
    $("#deliveryPlatformInput").value = "Grab";
    $("#deliveryOrderIdInput").value = "";
    $("#deliveryCommissionInput").value = DB.settings.deliveryDefaultCommissionPct || 0;
    updateDeliveryNet();
  } else {
    $("#deliveryFieldsWrap").classList.add("hidden");
    $("#paymentMethodToggle").classList.remove("hidden");
    checkoutPaymentMethod = "cash";
    renderPaymentToggle();
    $("#cashGivenWrap").classList.remove("hidden");
    $("#cashGivenInput").value = "";
    updateChangeDue();
  }
  $("#checkoutModal").classList.remove("hidden");
}

const renderPaymentToggle = wirePaymentToggle(
  "paymentMethodToggle",
  () => checkoutPaymentMethod, (m) => { checkoutPaymentMethod = m; },
  () => {
    $("#cashGivenWrap").classList.toggle("hidden", checkoutPaymentMethod !== "cash");
    updateChangeDue();
  }
);

function updateChangeDue() {
  const t = computeTotals();
  const given = Number($("#cashGivenInput").value) || 0;
  const change = given - t.total;
  const el = $("#changeDueDisplay");
  if (!$("#cashGivenInput").value) {
    el.textContent = "";
    el.className = "change-due";
    return;
  }
  el.className = "change-due " + (change < 0 ? "negative" : "positive");
  el.textContent = change < 0 ? `还差 ${fmt(-change)}` : `找零 ${fmt(change)}`;
}

$("#cashGivenInput").addEventListener("input", updateChangeDue);

function updateDeliveryNet() {
  const t = computeTotals();
  const pct = Math.min(100, Math.max(0, Number($("#deliveryCommissionInput").value) || 0));
  const net = t.total * (1 - pct / 100);
  $("#deliveryNetDisplay").className = "change-due positive";
  $("#deliveryNetDisplay").textContent = `平台佣金后实收 ${fmt(net)}（订单额 ${fmt(t.total)}）`;
}

$("#deliveryCommissionInput").addEventListener("input", updateDeliveryNet);

$("#checkoutCancelBtn").addEventListener("click", () => $("#checkoutModal").classList.add("hidden"));

$("#confirmPayBtn").addEventListener("click", () => {
  const t = computeTotals();
  const table = currentTableLabel(orderMode, orderTableNum);
  const isDelivery = orderMode === "delivery";
  const cashGiven = !isDelivery && checkoutPaymentMethod === "cash" ? Number($("#cashGivenInput").value) || 0 : null;

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
    paymentMethod: isDelivery ? "platform" : checkoutPaymentMethod,
    cashGiven,
    changeDue: cashGiven != null ? cashGiven - t.total : null,
    deliveryPlatform: isDelivery ? ($("#deliveryPlatformInput").value.trim() || "Grab") : null,
    deliveryOrderId: isDelivery ? $("#deliveryOrderIdInput").value.trim() : null,
    deliveryCommissionPct: isDelivery ? (Math.min(100, Math.max(0, Number($("#deliveryCommissionInput").value) || 0))) : null,
    deliveryNetAmount: isDelivery ? t.total * (1 - (Math.min(100, Math.max(0, Number($("#deliveryCommissionInput").value) || 0)) / 100)) : null,
  };
  DB.orders.unshift(order);
  saveData(DB);

  cart = [];
  $("#discountInput").value = 0;
  renderCart(); // also clears this table's open tab via syncCurrentOpenTab()
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
  const dayTotal = dayOrders.reduce((s, o) => s + orderRevenue(o), 0);
  $("#dayStats").innerHTML = `<span>当日订单：<b>${dayOrders.length}</b></span><span>当日营业额（外卖已扣佣金）：<b>${fmt(dayTotal)}</b></span>`;

  if (dayOrders.length === 0) {
    list.innerHTML = `<p class="empty-hint">这一天没有订单记录</p>`;
    return;
  }

  dayOrders.forEach((o) => {
    const div = document.createElement("div");
    div.className = "order-card";
    const paymentLabel = orderPaymentLabel(o);
    const isDelivery = o.paymentMethod === "platform" && o.deliveryNetAmount != null;
    const netNote = isDelivery ? `<div class="order-card-meta">订单额 ${fmt(o.total)} ・ 佣金 ${o.deliveryCommissionPct || 0}% ・ 实收 ${fmt(o.deliveryNetAmount)}</div>` : "";
    div.innerHTML = `
      <div class="order-card-top"><span>桌号 ${escapeHtml(o.table)}</span><span>${fmt(orderRevenue(o))}</span></div>
      <div class="order-card-meta">${new Date(o.createdAt).toLocaleString()} ・ ${escapeHtml(paymentLabel)}</div>
      ${netNote}
      <div class="order-card-items">${escapeHtml(orderItemsSummary(o))}</div>
      <div class="order-card-actions"><button data-act="edit">编辑订单</button></div>
    `;
    div.querySelector('[data-act="edit"]').addEventListener("click", () => openOrderEditModal(o));
    list.appendChild(div);
  });
}

function renderSettlementSection(sectionTitle, orders, pageBreakAfter) {
  const grossTotal = orders.reduce((s, o) => s + o.total, 0);
  const subtotal = orders.reduce((s, o) => s + o.subtotal, 0);
  const tax = orders.reduce((s, o) => s + o.tax, 0);
  const revenueTotal = orders.reduce((s, o) => s + orderRevenue(o), 0);
  const isDeliverySection = orders.some((o) => o.paymentMethod === "platform");

  let html = `
    <h2>${escapeHtml(DB.settings.restaurantName)}</h2>
    <div class="print-sub">每日结算报告 ・ ${escapeHtml(selectedOrdersDate)} ・ ${escapeHtml(sectionTitle)}</div>
    <div class="print-divider"></div>
  `;
  if (orders.length === 0) {
    html += `<div class="print-line"><span>这一天没有此类记录</span></div>`;
  } else {
    orders.forEach((o, i) => {
      const orderIdStr = o.deliveryOrderId ? ` ・ ${escapeHtml(o.deliveryOrderId)}` : "";
      html += `<div class="print-line" style="font-weight:700;"><span>订单 ${i + 1} ・ 桌号 ${escapeHtml(o.table)} ・ ${new Date(o.createdAt).toLocaleTimeString()}${orderIdStr}</span><span>${fmt(orderRevenue(o))}</span></div>`;
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
      if (o.paymentMethod === "cash" && o.cashGiven != null) {
        html += `<div class="print-line"><span>　客户给款 / 找零</span><span>${fmt(o.cashGiven)} / ${fmt(o.changeDue)}</span></div>`;
      }
      if (o.paymentMethod === "platform" && o.deliveryNetAmount != null) {
        html += `<div class="print-line"><span>　订单额 ${fmt(o.total)} － ${escapeHtml(o.deliveryPlatform || "")} 佣金 (${o.deliveryCommissionPct || 0}%)</span><span>已扣除</span></div>`;
      }
    });
    html += `<div class="print-divider"></div>`;
    html += `<div class="print-line"><span>订单数</span><span>${orders.length}</span></div>`;
    html += `<div class="print-line"><span>小计合计</span><span>${fmt(subtotal)}</span></div>`;
    html += `<div class="print-line"><span>税额合计</span><span>${fmt(tax)}</span></div>`;
    if (isDeliverySection) {
      html += `<div class="print-line"><span>订单原价合计（扣佣金前）</span><span>${fmt(grossTotal)}</span></div>`;
    }
    html += `<div class="print-divider"></div>`;
    html += `<div class="print-line print-total"><span>${escapeHtml(sectionTitle)}实收合计${isDeliverySection ? "（已扣佣金）" : ""}</span><span>${fmt(revenueTotal)}</span></div>`;
  }
  if (pageBreakAfter) html += `<div class="print-page-break"></div>`;
  return html;
}

$("#printSettlementBtn").addEventListener("click", () => {
  const dayOrders = ordersOnDate(selectedOrdersDate);
  // Orders from before payment-method tracking existed default to Cash.
  const cashOrders = dayOrders.filter((o) => (o.paymentMethod || "cash") === "cash");
  const tngOrders = dayOrders.filter((o) => o.paymentMethod === "tng");
  const deliveryOrders = dayOrders.filter((o) => o.paymentMethod === "platform");

  let html = renderSettlementSection("Cash", cashOrders, true);
  html += renderSettlementSection("Touch 'n Go", tngOrders, true);
  html += renderSettlementSection("外卖 / Delivery", deliveryOrders, false);

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
  editingOrderPaymentMethod = order.paymentMethod === "platform" ? "cash" : (order.paymentMethod || "cash");
  renderOrderEditPayment();
  $("#orderEditDeliveryPlatformInput").value = order.deliveryPlatform || "";
  $("#orderEditDeliveryOrderIdInput").value = order.deliveryOrderId || "";
  $("#orderEditDeliveryCommissionInput").value = order.deliveryCommissionPct != null ? order.deliveryCommissionPct : "";
  updateOrderEditModeFields();
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
  if (editingOrderMode === "delivery") updateOrderEditDeliveryNet();
}

function updateOrderEditDeliveryNet() {
  const t = orderEditTotals();
  const pct = Math.min(100, Math.max(0, Number($("#orderEditDeliveryCommissionInput").value) || 0));
  const net = t.total * (1 - pct / 100);
  $("#orderEditDeliveryNetDisplay").className = "change-due positive";
  $("#orderEditDeliveryNetDisplay").textContent = `平台佣金后实收 ${fmt(net)}（订单额 ${fmt(t.total)}）`;
}

$("#orderEditDeliveryCommissionInput").addEventListener("input", updateOrderEditDeliveryNet);

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
  const isDelivery = editingOrderMode === "delivery";
  order.table = currentTableLabel(editingOrderMode, editingOrderTableNum);
  order.paymentMethod = isDelivery ? "platform" : editingOrderPaymentMethod;
  order.items = editingOrderItems.map((l) => ({
    name: l.name, price: l.price, qty: l.qty, note: l.note,
    addOns: l.addOns || [], requiredChoices: l.requiredChoices || [],
  }));
  order.subtotal = t.subtotal;
  order.discountPct = t.discountPct;
  order.taxRate = t.taxRate;
  order.tax = t.tax;
  order.total = t.total;
  const commissionPct = Math.min(100, Math.max(0, Number($("#orderEditDeliveryCommissionInput").value) || 0));
  order.deliveryPlatform = isDelivery ? ($("#orderEditDeliveryPlatformInput").value.trim() || "Grab") : null;
  order.deliveryOrderId = isDelivery ? $("#orderEditDeliveryOrderIdInput").value.trim() : null;
  order.deliveryCommissionPct = isDelivery ? commissionPct : null;
  order.deliveryNetAmount = isDelivery ? t.total * (1 - commissionPct / 100) : null;
  if (!isDelivery) {
    order.cashGiven = order.paymentMethod === "cash" ? order.cashGiven : null;
  }
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
    tr.innerHTML = `
      <td><span class="drag-handle">⠿</span></td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${fmt(item.price)}</td>
      <td><div class="row-actions"><button data-act="edit">编辑</button><button data-act="dup">复制</button></div></td>
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
  $("#itemModalTitle").textContent = item ? "编辑菜品" : "添加菜品";
  $("#itemNameInput").value = item ? item.name : "";
  $("#itemCategoryInput").value = item ? item.category : "";
  $("#itemPriceInput").value = item ? item.price : "";
  $("#itemDeliveryPriceInput").value = item && item.deliveryPriceOverride != null ? item.deliveryPriceOverride : "";
  $("#itemDeliveryPriceLabel").textContent = item
    ? `外卖价格（留空 = 自动按全局加价计算，当前约 ${fmt(effectivePrice({ ...item, deliveryPriceOverride: null }, "delivery"))}）`
    : "外卖价格（留空 = 自动按全局加价计算）";
  $("#itemDeleteBtn").classList.toggle("hidden", !item);
  renderRequiredGroupsEditList();
  renderAddOnEditList();
  $("#itemModal").classList.remove("hidden");
}

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
  const deliveryPriceRaw = $("#itemDeliveryPriceInput").value;
  const deliveryPriceOverride = deliveryPriceRaw === "" ? null : Math.max(0, Number(deliveryPriceRaw) || 0);
  if (editingItemId) {
    const item = DB.menu.find((m) => m.id === editingItemId);
    Object.assign(item, { name, category, price, addOns, requiredGroups, deliveryPriceOverride });
  } else {
    DB.menu.push({ id: uid(), name, category, price, addOns, requiredGroups, deliveryPriceOverride });
  }
  const result = saveData(DB);
  if (!result.ok) {
    alert("保存失败：设备本地存储空间不够了。建议：设置里导出一份备份，然后用\"清空订单记录\"腾出空间。");
    return;
  }
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
  $("#settingDeliveryMarkup").value = DB.settings.deliveryMarkupPct != null ? DB.settings.deliveryMarkupPct : 15;
  $("#settingDeliveryCommission").value = DB.settings.deliveryDefaultCommissionPct != null ? DB.settings.deliveryDefaultCommissionPct : 30;
}

$("#saveSettingsBtn").addEventListener("click", () => {
  DB.settings.restaurantName = $("#settingRestaurantName").value.trim() || "我的餐厅";
  DB.settings.taxRate = Number($("#settingTaxRate").value) || 0;
  DB.settings.currency = $("#settingCurrency").value.trim() || "$";
  DB.settings.tableCount = Math.max(1, Number($("#settingTableCount").value) || 12);
  DB.settings.deliveryMarkupPct = Math.max(0, Number($("#settingDeliveryMarkup").value) || 0);
  DB.settings.deliveryDefaultCommissionPct = Math.min(100, Math.max(0, Number($("#settingDeliveryCommission").value) || 0));
  saveData(DB);
  $("#restaurantName").textContent = DB.settings.restaurantName;
  renderSummary();
  renderOrderTableMode();
  renderMenuGrid();
  alert("设置已保存");
});

$("#exportDataBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `pos-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

$("#importDataBtn").addEventListener("click", () => $("#importDataInput").click());

$("#importDataInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      alert("这个文件不是有效的备份文件（JSON 格式错误）");
      e.target.value = "";
      return;
    }
    if (!parsed || !Array.isArray(parsed.menu) || !Array.isArray(parsed.orders) || !parsed.settings) {
      alert("这个文件看起来不是本系统的备份文件");
      e.target.value = "";
      return;
    }
    if (!confirm(`将用备份文件覆盖当前所有数据（菜单 ${parsed.menu.length} 项，订单 ${parsed.orders.length} 条）。确定继续？`)) {
      e.target.value = "";
      return;
    }
    if (!parsed.openTabs) parsed.openTabs = {};
    DB = parsed;
    saveData(DB);
    cart = [];
    activeCategory = "全部";
    initApp();
    e.target.value = "";
    alert("恢复完成");
  };
  reader.readAsText(file);
});

$("#clearOrdersBtn").addEventListener("click", () => {
  if (!confirm("将清空所有订单记录（菜单、加料、必选选项、照片都会保留）。确定继续？")) return;
  DB.orders = [];
  DB.openTabs = {};
  saveData(DB);
  cart = [];
  selectedOrdersDate = todayDateStr();
  loadCartForCurrentTable();
  renderOrders();
  alert("订单记录已清空");
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
  loadCartForCurrentTable();
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
