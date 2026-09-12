// ===================================================
// customer.js — ลาวอ้อยต้อย | Customer Ordering Logic & Persistent Storage
// ===================================================

const DB_NAME = "LaoOiToiDB";
const DB_VERSION = 1;
const STORE_NAME = "app_store";
const MENU_STORAGE_KEY = "lao_oi_toi_menu";
const ORDERS_STORAGE_KEY = "lao_oi_toi_orders";

// ===== 1. Persistent Storage Service (IndexedDB + LocalStorage) =====
function openDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getStoredData(key, fallback = []) {
  try {
    const db = await openDB();
    if (db) {
      const val = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (val !== undefined && val !== null) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
        return val;
      }
    }
  } catch (err) {
    console.warn("IDB read error:", err);
  }

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

async function setStoredData(key, value) {
  try {
    const db = await openDB();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    }
  } catch (err) {
    console.warn("IDB write error:", err);
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage quota reached (stored in IDB)");
  }
}


// ===== 2. App State & Constants =====
const DEFAULT_CATEGORIES = [
  "ส้มตำ",
  "ลาบ / ก้อย / น้ำตก",
  "ต้ม / แกง",
  "ทอด / ย่าง",
  "อาหารจานเดียว",
  "เครื่องดื่ม / ของหวาน"
];

let menuItems = [];
let cart = [];
let currentCategory = "all";
let searchQuery = "";

// Customization Modal State
let activeCustomizingItem = null;
let customizeQty = 1;


/* ===================================================
   3. Initial Loader & Real-time Menu Sync
   =================================================== */
let syncChannel = null;
try {
  syncChannel = new BroadcastChannel("lao_oi_toi_sync");
  syncChannel.onmessage = async function (e) {
    if (e.data && e.data.type === "MENU_UPDATED") {
      await loadMenuData();
      renderCategoryTabs();
      renderMenuGrid();
    }
  };
} catch (err) {}

document.addEventListener("DOMContentLoaded", async function () {
  await loadMenuData();
  renderCategoryTabs();
  renderMenuGrid();
  updateCartUI();

  if (window.location.protocol === "file:") {
    const banner = document.getElementById("protocol-hint-banner-cust");
    if (banner) banner.style.display = "block";
  }

  // 1. ดักจับการเปลี่ยนแปลงเมื่อแอดมินอัปเดตเมนูในอีกหน้าจอ (localStorage storage event)
  window.addEventListener("storage", async function (e) {
    if (e.key === MENU_STORAGE_KEY) {
      await loadMenuData();
      renderCategoryTabs();
      renderMenuGrid();
    }
  });

  // 2. เมื่อสลับแท็บกลับมาที่หน้านี้ ให้รีเฟรชข้อมูลเมนูใหม่ล่าสุดเสมอ
  window.addEventListener("focus", async function () {
    await loadMenuData();
    renderCategoryTabs();
    renderMenuGrid();
  });

  document.addEventListener("visibilitychange", async function () {
    if (!document.hidden) {
      await loadMenuData();
      renderCategoryTabs();
      renderMenuGrid();
    }
  });

  // 3. Periodic Background Sync (ทุก 1.5 วินาที เช็คอัตโนมัติ)
  setInterval(async function () {
    const latest = await getStoredData(MENU_STORAGE_KEY, []);
    if (JSON.stringify(latest) !== JSON.stringify(menuItems)) {
      menuItems = latest;
      renderCategoryTabs();
      renderMenuGrid();
    }
  }, 1500);
});

async function loadMenuData() {
  menuItems = await getStoredData(MENU_STORAGE_KEY, []);
}

async function manualSyncMenu() {
  const btn = document.getElementById("btn-customer-refresh");
  if (btn) btn.classList.add("spinning");
  await loadMenuData();
  renderCategoryTabs();
  renderMenuGrid();
  setTimeout(() => {
    if (btn) btn.classList.remove("spinning");
  }, 500);
}



/* ===================================================
   4. Category Filter & Search
   =================================================== */
function renderCategoryTabs() {
  const container = document.getElementById("category-tabs-bar");
  if (!container) return;

  const totalCount = menuItems.length;

  const counts = {};
  DEFAULT_CATEGORIES.forEach((cat) => { counts[cat] = 0; });
  menuItems.forEach((item) => {
    const c = item.category || DEFAULT_CATEGORIES[0];
    counts[c] = (counts[c] || 0) + 1;
  });

  let html = `
    <button class="category-tab-pill ${currentCategory === 'all' ? 'active' : ''}" onclick="setCategory('all')">
      ทั้งหมด <span class="tab-count">${totalCount}</span>
    </button>
  `;

  DEFAULT_CATEGORIES.forEach((cat) => {
    const isActive = currentCategory === cat ? "active" : "";
    const count = counts[cat] || 0;
    html += `
      <button class="category-tab-pill ${isActive}" onclick="setCategory('${cat}')">
        ${cat} <span class="tab-count">${count}</span>
      </button>
    `;
  });

  container.innerHTML = html;
}

function setCategory(category) {
  currentCategory = category;
  renderCategoryTabs();
  renderMenuGrid();

  const titleEl = document.getElementById("current-cat-title");
  if (titleEl) {
    titleEl.textContent = category === "all" ? "เมนูทั้งหมด" : category;
  }
}

function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  renderMenuGrid();
}


/* ===================================================
   5. Render Food Menu Grid
   =================================================== */
function renderMenuGrid() {
  const grid = document.getElementById("customer-menu-grid");
  const emptyState = document.getElementById("customer-empty-state");
  const countLabel = document.getElementById("menu-count-label");
  if (!grid) return;

  const filtered = menuItems.filter((item) => {
    const matchCategory = currentCategory === "all" || item.category === currentCategory;
    const matchSearch = !searchQuery || (item.name && item.name.toLowerCase().includes(searchQuery));
    return matchCategory && matchSearch;
  });

  if (countLabel) {
    countLabel.textContent = `${filtered.length} รายการ`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = "";
    if (emptyState) {
      emptyState.style.display = "flex";
      const emptyTitle = document.getElementById("empty-title");
      if (emptyTitle) {
        if (searchQuery) {
          emptyTitle.textContent = `ไม่พบเมนูที่ตรงกับ "${searchQuery}"`;
        } else if (currentCategory !== "all") {
          emptyTitle.textContent = `ยังไม่มีเมนูในหมวด "${currentCategory}"`;
        } else {
          emptyTitle.textContent = "ยังไม่มีรายการเมนูอาหารในระบบ";
        }
      }
    }
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let html = "";
  filtered.forEach((item) => {
    const isAvail = item.isAvailable !== false;

    let mediaHtml = "";
    if (item.image) {
      mediaHtml = `<img src="${item.image}" alt="${item.name}" class="food-card-img" loading="lazy">`;
    } else {
      mediaHtml = `
        <div class="food-card-placeholder">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
            <line x1="6" y1="1" x2="6" y2="4"></line>
            <line x1="10" y1="1" x2="10" y2="4"></line>
            <line x1="14" y1="1" x2="14" y2="4"></line>
          </svg>
        </div>
      `;
    }

    let optionHint = "";
    if (item.optionGroups && item.optionGroups.length > 0) {
      optionHint = `<span class="food-card-hint">มีตัวเลือกปรับแต่ง</span>`;
    }

    const clickAction = isAvail ? `onclick="openCustomizeModal(${item.id})"` : "";

    html += `
      <div class="food-card ${isAvail ? '' : 'is-sold-out'}" ${clickAction}>
        <div class="food-card-media">
          ${mediaHtml}
          ${!isAvail ? `<div class="sold-out-badge">สินค้าหมด</div>` : ""}
        </div>

        <div class="food-card-content">
          <div class="food-card-top">
            <h3 class="food-card-name">${item.name}</h3>
            ${optionHint}
          </div>

          <div class="food-card-bottom">
            <span class="food-card-price">฿${item.price}</span>
            <button type="button" class="btn-order-trigger" ${!isAvail ? 'disabled' : ''}>
              ${isAvail ? '+ สั่ง' : 'หมด'}
            </button>
          </div>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}


/* ===================================================
   6. Customization Modal (เลือกตัวเลือกอาหาร)
   ================================================== */
function openCustomizeModal(itemId) {
  const item = menuItems.find((i) => i.id === itemId);
  if (!item || item.isAvailable === false) return;

  activeCustomizingItem = item;
  customizeQty = 1;

  document.getElementById("modal-food-name").textContent = item.name;
  document.getElementById("modal-food-price").textContent = `฿${item.price}`;
  document.getElementById("customize-qty-display").textContent = "1";
  document.getElementById("item-note").value = "";

  const imgWrap = document.getElementById("modal-food-img-wrap");
  const imgEl = document.getElementById("modal-food-img");
  if (item.image) {
    imgEl.src = item.image;
    imgWrap.style.display = "block";
  } else {
    imgWrap.style.display = "none";
  }

  const optContainer = document.getElementById("modal-option-groups-container");
  optContainer.innerHTML = "";

  if (item.optionGroups && item.optionGroups.length > 0) {
    item.optionGroups.forEach((og, gIndex) => {
      const isSingle = og.type === "single";
      const groupBox = document.createElement("div");
      groupBox.className = "opt-group-box";
      groupBox.dataset.groupId = og.id || `group_${gIndex}`;

      groupBox.innerHTML = `
        <div class="opt-group-box-header">
          <span class="opt-group-box-title">${og.title}</span>
          <span class="opt-group-box-badge ${isSingle ? 'required' : 'optional'}">
            ${isSingle ? 'เลือกได้ 1 อย่าง' : 'เลือกได้หลายอย่าง'}
          </span>
        </div>
        <div class="opt-choices-wrap">
          <!-- Choices injected below -->
        </div>
      `;

      const choicesWrap = groupBox.querySelector(".opt-choices-wrap");

      if (og.choices && og.choices.length > 0) {
        og.choices.forEach((c, cIndex) => {
          const inputName = `opt_group_${gIndex}`;
          const inputId = `opt_${gIndex}_${cIndex}`;
          const isChecked = isSingle && cIndex === 0;

          const label = document.createElement("label");
          label.className = `choice-item-label ${isChecked ? 'selected' : ''}`;
          label.htmlFor = inputId;

          const priceText = c.price > 0 ? `+฿${c.price}` : "ฟรี";

          label.innerHTML = `
            <div class="choice-item-left">
              <input type="${isSingle ? 'radio' : 'checkbox'}" 
                     name="${inputName}" 
                     id="${inputId}" 
                     value="${c.name}" 
                     data-price="${c.price}"
                     ${isChecked ? 'checked' : ''}
                     onchange="handleChoiceChange(this, ${isSingle})">
              <span>${c.name}</span>
            </div>
            <span class="choice-item-price">${priceText}</span>
          `;
          choicesWrap.appendChild(label);
        });
      }

      optContainer.appendChild(groupBox);
    });
  }

  updateCustomizeModalPrice();

  document.getElementById("customize-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeCustomizeModal() {
  document.getElementById("customize-modal").style.display = "none";
  document.body.style.overflow = "";
  activeCustomizingItem = null;
}

function handleChoiceChange(input, isSingle) {
  if (isSingle) {
    const parentGroup = input.closest(".opt-choices-wrap");
    parentGroup.querySelectorAll(".choice-item-label").forEach((lbl) => lbl.classList.remove("selected"));
    input.closest(".choice-item-label").classList.add("selected");
  } else {
    if (input.checked) {
      input.closest(".choice-item-label").classList.add("selected");
    } else {
      input.closest(".choice-item-label").classList.remove("selected");
    }
  }

  updateCustomizeModalPrice();
}

function changeCustomizeQty(delta) {
  const newQty = customizeQty + delta;
  if (newQty >= 1) {
    customizeQty = newQty;
    document.getElementById("customize-qty-display").textContent = customizeQty;
    updateCustomizeModalPrice();
  }
}

function calculateCurrentItemUnitPrice() {
  if (!activeCustomizingItem) return 0;
  let unitPrice = activeCustomizingItem.price;

  const selectedInputs = document.querySelectorAll("#modal-option-groups-container input:checked");
  selectedInputs.forEach((input) => {
    const extra = parseFloat(input.dataset.price) || 0;
    unitPrice += extra;
  });

  return unitPrice;
}

function updateCustomizeModalPrice() {
  const unitPrice = calculateCurrentItemUnitPrice();
  const totalPrice = unitPrice * customizeQty;
  document.getElementById("customize-total-price").textContent = `฿${totalPrice}`;
}

function confirmAddToCart() {
  if (!activeCustomizingItem) return;

  const unitPrice = calculateCurrentItemUnitPrice();
  const note = document.getElementById("item-note").value.trim();

  const selectedOptions = [];
  const groupBoxes = document.querySelectorAll("#modal-option-groups-container .opt-group-box");

  groupBoxes.forEach((box) => {
    const groupTitle = box.querySelector(".opt-group-box-title").textContent.trim();
    const checkedInputs = box.querySelectorAll("input:checked");
    checkedInputs.forEach((inp) => {
      selectedOptions.push({
        groupTitle: groupTitle,
        name: inp.value,
        price: parseFloat(inp.dataset.price) || 0
      });
    });
  });

  const optionSignature = selectedOptions.map((o) => `${o.groupTitle}:${o.name}`).sort().join("|");

  const existingIndex = cart.findIndex((ci) => {
    const ciSignature = (ci.selectedOptions || []).map((o) => `${o.groupTitle}:${o.name}`).sort().join("|");
    return ci.menuId === activeCustomizingItem.id && ciSignature === optionSignature && ci.note === note;
  });

  if (existingIndex !== -1) {
    cart[existingIndex].quantity += customizeQty;
  } else {
    const cartItem = {
      cartId: "ci_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      menuId: activeCustomizingItem.id,
      name: activeCustomizingItem.name,
      image: activeCustomizingItem.image,
      basePrice: activeCustomizingItem.price,
      unitPrice: unitPrice,
      quantity: customizeQty,
      selectedOptions: selectedOptions,
      note: note
    };
    cart.push(cartItem);
  }

  closeCustomizeModal();
  updateCartUI();

  const bar = document.getElementById("floating-cart-bar");
  if (bar) {
    bar.style.transform = "scale(1.05)";
    setTimeout(() => { bar.style.transform = ""; }, 150);
  }
}


/* ===================================================
   7. Cart Management & Drawer
   =================================================== */
function getCartTotalCount() {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

function getCartTotalPrice() {
  return cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
}

function updateCartUI() {
  const count = getCartTotalCount();
  const totalPrice = getCartTotalPrice();

  const floatingBar = document.getElementById("floating-cart-bar");
  const cartCountEl = document.getElementById("cart-item-count");
  const cartPriceEl = document.getElementById("cart-bar-total-price");
  const headerBadge = document.getElementById("header-cart-badge");

  if (count > 0) {
    if (floatingBar) floatingBar.style.display = "flex";
    if (cartCountEl) cartCountEl.textContent = count;
    if (cartPriceEl) cartPriceEl.textContent = `฿${totalPrice}`;

    if (headerBadge) {
      headerBadge.style.display = "flex";
      headerBadge.textContent = count;
    }
  } else {
    if (floatingBar) floatingBar.style.display = "none";
    if (headerBadge) headerBadge.style.display = "none";
  }
}

function openCartModal() {
  renderCartList();
  document.getElementById("cart-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeCartModal() {
  document.getElementById("cart-modal").style.display = "none";
  document.body.style.overflow = "";
}

function renderCartList() {
  const container = document.getElementById("cart-items-list");
  const emptyView = document.getElementById("cart-empty-view");
  const summaryBox = document.getElementById("cart-summary-box");
  const btnPlaceOrder = document.getElementById("btn-place-order");
  const countLabel = document.getElementById("cart-items-total-label");
  if (!container) return;

  const count = getCartTotalCount();
  const totalPrice = getCartTotalPrice();

  if (countLabel) {
    countLabel.textContent = `${count} รายการ`;
  }

  if (cart.length === 0) {
    container.innerHTML = "";
    if (emptyView) emptyView.style.display = "flex";
    if (summaryBox) summaryBox.style.display = "none";
    if (btnPlaceOrder) btnPlaceOrder.disabled = true;
    return;
  }

  if (emptyView) emptyView.style.display = "none";
  if (summaryBox) summaryBox.style.display = "flex";
  if (btnPlaceOrder) btnPlaceOrder.disabled = false;

  let html = "";
  cart.forEach((item) => {
    let optionsText = "";
    if (item.selectedOptions && item.selectedOptions.length > 0) {
      const opts = item.selectedOptions.map((o) => {
        const extra = o.price > 0 ? ` (+฿${o.price})` : "";
        return `${o.name}${extra}`;
      }).join(", ");
      optionsText = `<div class="cart-item-options-desc">${opts}</div>`;
    }

    let noteHtml = "";
    if (item.note) {
      noteHtml = `<span class="cart-item-note-badge">หมายเหตุ: ${item.note}</span>`;
    }

    const itemTotal = item.unitPrice * item.quantity;

    html += `
      <div class="cart-item-row" id="cart-item-${item.cartId}">
        <div class="cart-item-main">
          <div class="cart-item-info">
            <span class="cart-item-title">${item.name}</span>
            ${optionsText}
            ${noteHtml}
          </div>
          <span class="cart-item-price">฿${itemTotal}</span>
        </div>

        <div class="cart-item-actions">
          <button type="button" class="btn-cart-delete-item" onclick="removeCartItem('${item.cartId}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            ลบ
          </button>

          <div class="quantity-stepper">
            <button type="button" class="btn-qty" onclick="changeCartItemQty('${item.cartId}', -1)">-</button>
            <span class="qty-display">${item.quantity}</span>
            <button type="button" class="btn-qty" onclick="changeCartItemQty('${item.cartId}', 1)">+</button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  const subtotalEl = document.getElementById("summary-subtotal");
  const grandTotalEl = document.getElementById("summary-grand-total");
  const btnPriceEl = document.getElementById("btn-place-order-price");

  if (subtotalEl) subtotalEl.textContent = `฿${totalPrice}`;
  if (grandTotalEl) grandTotalEl.textContent = `฿${totalPrice}`;
  if (btnPriceEl) btnPriceEl.textContent = `฿${totalPrice}`;
}

function changeCartItemQty(cartId, delta) {
  const index = cart.findIndex((i) => i.cartId === cartId);
  if (index === -1) return;

  const newQty = cart[index].quantity + delta;
  if (newQty <= 0) {
    cart.splice(index, 1);
  } else {
    cart[index].quantity = newQty;
  }

  updateCartUI();
  renderCartList();
}

function removeCartItem(cartId) {
  cart = cart.filter((i) => i.cartId !== cartId);
  updateCartUI();
  renderCartList();
}

function clearCart() {
  if (cart.length === 0) return;
  if (confirm("ต้องการล้างรายการทั้งหมดในตะกร้าใช่หรือไม่?")) {
    cart = [];
    updateCartUI();
    renderCartList();
  }
}


/* ===================================================
   8. Place Order & Confirmation
   =================================================== */
async function placeOrder() {
  if (cart.length === 0) {
    alert("ไม่มีรายการอาหารในตะกร้า");
    return;
  }

  const orderId = "ORD-" + Date.now().toString().slice(-6);
  const now = new Date();
  const timeFormatted = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

  const totalQty = getCartTotalCount();
  const totalPrice = getCartTotalPrice();

  const newOrder = {
    id: orderId,
    timestamp: now.toISOString(),
    displayTime: timeFormatted,
    items: JSON.parse(JSON.stringify(cart)),
    totalQuantity: totalQty,
    totalPrice: totalPrice,
    status: "pending"
  };

  try {
    const orders = await getStoredData(ORDERS_STORAGE_KEY, []);
    orders.push(newOrder);
    await setStoredData(ORDERS_STORAGE_KEY, orders);
  } catch (err) {
    console.error("Error saving order:", err);
  }

  closeCartModal();
  showOrderSuccess(newOrder);

  cart = [];
  updateCartUI();
}

function showOrderSuccess(order) {
  const modal = document.getElementById("order-success-modal");
  const orderIdEl = document.getElementById("success-order-id");
  const summaryBox = document.getElementById("success-summary-box");

  if (orderIdEl) orderIdEl.textContent = `รหัสออเดอร์: ${order.id}`;

  if (summaryBox) {
    let itemsText = order.items.map((i) => `• ${i.name} x${i.quantity} (฿${i.unitPrice * i.quantity})`).join("<br>");
    summaryBox.innerHTML = `
      <div><strong>รายการที่สั่ง (${order.totalQuantity} ชิ้น):</strong></div>
      <div style="color:#555; margin-top:4px;">${itemsText}</div>
      <div style="margin-top:8px; border-top:1px dashed #ccc; padding-top:6px; font-weight:700;">
        ยอดรวมทั้งสิ้น: <span style="color:#7A1A1A;">฿${order.totalPrice}</span>
      </div>
    `;
  }

  if (modal) modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeSuccessModal() {
  const modal = document.getElementById("order-success-modal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
}

function handleModalBackdropClick(event, modalId) {
  if (event.target.id === modalId) {
    if (modalId === "customize-modal") closeCustomizeModal();
    if (modalId === "cart-modal") closeCartModal();
  }
}
