/* ---------- Data layer (localStorage) ---------- */

const STORAGE_KEY = "pos_data_v1";

const DEMO_DATA = {
  settings: { restaurantName: "我的餐厅", taxRate: 0, currency: "$" },
  menu: [
    { id: "m1", name: "招牌炒饭", category: "主食", price: 12.5 },
    { id: "m2", name: "牛肉面", category: "主食", price: 14.0 },
    { id: "m3", name: "扬州炒饭", category: "主食", price: 11.0 },
    { id: "m4", name: "宫保鸡丁", category: "热菜", price: 15.5 },
    { id: "m5", name: "麻婆豆腐", category: "热菜", price: 10.5 },
    { id: "m6", name: "糖醋里脊", category: "热菜", price: 16.0 },
    { id: "m7", name: "凉拌黄瓜", category: "凉菜", price: 6.5 },
    { id: "m8", name: "皮蛋豆腐", category: "凉菜", price: 7.0 },
    { id: "m9", name: "酸辣汤", category: "汤品", price: 5.5 },
    { id: "m10", name: "紫菜蛋花汤", category: "汤品", price: 5.0 },
    { id: "m11", name: "可乐", category: "饮品", price: 3.0 },
    { id: "m12", name: "鲜榨橙汁", category: "饮品", price: 5.0 },
    { id: "m13", name: "珍珠奶茶", category: "饮品", price: 6.0 },
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

let cart = []; // { menuId, name, price, qty, note }
let activeCategory = "全部";
let editingItemId = null;
let noteTargetItem = null;
let noteQty = 1;

/* ---------- Helpers ---------- */

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => document.querySelectorAll(sel);
const fmt = (n) => `${DB.settings.currency}${n.toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 10);

function cartSubtotal() {
  return cart.reduce((sum, l) => sum + l.price * l.qty, 0);
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
    btn.innerHTML = `<span class="name">${escapeHtml(item.name)}</span><span class="price">${fmt(item.price)}</span>`;
    btn.addEventListener("click", () => openNoteModal(item));
    grid.appendChild(btn);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Note / quantity modal ---------- */

function openNoteModal(item) {
  noteTargetItem = item;
  noteQty = 1;
  $("#noteQtyValue").textContent = noteQty;
  $("#noteInput").value = "";
  $("#noteModal").classList.remove("hidden");
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
  const note = $("#noteInput").value.trim();
  cart.push({
    lineId: uid(),
    menuId: noteTargetItem.id,
    name: noteTargetItem.name,
    price: noteTargetItem.price,
    qty: noteQty,
    note,
  });
  $("#noteModal").classList.add("hidden");
  renderCart();
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
      div.innerHTML = `
        <div class="cart-line-top">
          <div>
            <div class="cart-line-name">${escapeHtml(line.name)}</div>
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
  const table = $("#tableNumber").value.trim() || "外带";
  const now = new Date();

  let html = `
    <h3>${escapeHtml(DB.settings.restaurantName)}</h3>
    <div class="receipt-sub">桌号：${escapeHtml(table)} ・ ${now.toLocaleString()}</div>
    <div class="receipt-divider"></div>
  `;
  cart.forEach((l) => {
    html += `<div class="receipt-line"><span>${escapeHtml(l.name)} x${l.qty}${l.note ? " (" + escapeHtml(l.note) + ")" : ""}</span><span>${fmt(l.price * l.qty)}</span></div>`;
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
  const table = $("#tableNumber").value.trim() || "外带";
  const order = {
    id: uid(),
    createdAt: new Date().toISOString(),
    table,
    items: cart.map((l) => ({ name: l.name, price: l.price, qty: l.qty, note: l.note })),
    subtotal: t.subtotal,
    discountPct: t.discountPct,
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

function renderOrders() {
  const list = $("#ordersList");
  list.innerHTML = "";

  const today = new Date().toDateString();
  const todayOrders = DB.orders.filter((o) => new Date(o.createdAt).toDateString() === today);
  const todayTotal = todayOrders.reduce((s, o) => s + o.total, 0);
  $("#dayStats").innerHTML = `<span>今日订单：<b>${todayOrders.length}</b></span><span>今日营业额：<b>${fmt(todayTotal)}</b></span>`;

  if (DB.orders.length === 0) {
    list.innerHTML = `<p class="empty-hint">暂无订单记录</p>`;
    return;
  }

  DB.orders.forEach((o) => {
    const div = document.createElement("div");
    div.className = "order-card";
    const itemsStr = o.items.map((i) => `${i.name} x${i.qty}`).join("、");
    div.innerHTML = `
      <div class="order-card-top"><span>桌号 ${escapeHtml(o.table)}</span><span>${fmt(o.total)}</span></div>
      <div class="order-card-meta">${new Date(o.createdAt).toLocaleString()}</div>
      <div class="order-card-items">${escapeHtml(itemsStr)}</div>
    `;
    list.appendChild(div);
  });
}

/* ---------- Menu management tab ---------- */

function renderMenuTable() {
  const tbody = $("#menuTableBody");
  tbody.innerHTML = "";
  DB.menu.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${fmt(item.price)}</td>
      <td class="row-actions"><button data-act="edit">编辑</button></td>
    `;
    tr.querySelector('[data-act="edit"]').addEventListener("click", () => openItemModal(item));
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

$("#addItemBtn").addEventListener("click", () => openItemModal(null));

function openItemModal(item) {
  editingItemId = item ? item.id : null;
  $("#itemModalTitle").textContent = item ? "编辑菜品" : "添加菜品";
  $("#itemNameInput").value = item ? item.name : "";
  $("#itemCategoryInput").value = item ? item.category : "";
  $("#itemPriceInput").value = item ? item.price : "";
  $("#itemDeleteBtn").classList.toggle("hidden", !item);
  $("#itemModal").classList.remove("hidden");
}

$("#itemCancelBtn").addEventListener("click", () => $("#itemModal").classList.add("hidden"));

$("#itemSaveBtn").addEventListener("click", () => {
  const name = $("#itemNameInput").value.trim();
  const category = $("#itemCategoryInput").value.trim() || "其他";
  const price = Number($("#itemPriceInput").value);
  if (!name || isNaN(price) || price < 0) {
    alert("请填写有效的菜品名称和价格");
    return;
  }
  if (editingItemId) {
    const item = DB.menu.find((m) => m.id === editingItemId);
    Object.assign(item, { name, category, price });
  } else {
    DB.menu.push({ id: uid(), name, category, price });
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
}

$("#saveSettingsBtn").addEventListener("click", () => {
  DB.settings.restaurantName = $("#settingRestaurantName").value.trim() || "我的餐厅";
  DB.settings.taxRate = Number($("#settingTaxRate").value) || 0;
  DB.settings.currency = $("#settingCurrency").value.trim() || "$";
  saveData(DB);
  $("#restaurantName").textContent = DB.settings.restaurantName;
  renderSummary();
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
}

initApp();

/* Register service worker for "Add to Home Screen" offline support (best effort) */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
