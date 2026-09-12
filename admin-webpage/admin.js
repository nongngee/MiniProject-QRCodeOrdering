// ===================================================
// admin.js — ลาวอ้อยต้อย | Admin Logic & Persistent Storage
// ===================================================

// ===== ส่วนที่ 1 — ข้อมูลการเข้าสู่ระบบ (Authentication) =====
const ADMIN_USER = "admin";
const ADMIN_PASS = "123";

function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    sessionStorage.setItem("isAdminLoggedIn", "true");
    localStorage.setItem("isAdminLoggedIn", "true");
    setStoredData("isAdminLoggedIn", true);
    window.location.href = "admin-home.html";
  } else {
    showError("username หรือ password ไม่ถูกต้อง");
  }
}

function showError(message) {
  let errorEl = document.getElementById("error-msg");
  if (!errorEl) {
    errorEl = document.createElement("p");
    errorEl.id = "error-msg";
    errorEl.style.cssText = `
      color: #A32D2D;
      font-size: 13px;
      text-align: center;
      margin-top: -4px;
    `;
    const form = document.querySelector(".form");
    if (form) form.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

async function checkLoginStatus() {
  if (sessionStorage.getItem("isAdminLoggedIn") === "true" || localStorage.getItem("isAdminLoggedIn") === "true") {
    return true;
  }
  const idbAuth = await getStoredData("isAdminLoggedIn", false);
  if (idbAuth === true) {
    sessionStorage.setItem("isAdminLoggedIn", "true");
    localStorage.setItem("isAdminLoggedIn", "true");
    return true;
  }
  return false;
}

function requireLogin() {
  const isLogged = sessionStorage.getItem("isAdminLoggedIn") === "true" || localStorage.getItem("isAdminLoggedIn") === "true";
  if (!isLogged) {
    checkLoginStatus().then((logged) => {
      if (!logged) {
        window.location.href = "index.html";
      }
    });
  }
}

function logout() {
  sessionStorage.removeItem("isAdminLoggedIn");
  localStorage.removeItem("isAdminLoggedIn");
  setStoredData("isAdminLoggedIn", false);
  window.location.href = "index.html";
}

function handleBack() {
  window.location.href = "admin-home.html";
}


// ===================================================
// ส่วนที่ 2 — ระบบจัดเก็บข้อมูลถาวร (Persistent Storage: IDB + LocalStorage)
// ===================================================

const DB_NAME = "LaoOiToiDB";
const DB_VERSION = 1;
const STORE_NAME = "app_store";
const STORAGE_KEY = "lao_oi_toi_menu";

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
  // 1. บันทึกลง IndexedDB
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

  // 2. บันทึกลง localStorage ร่วมด้วย
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("localStorage quota reached (stored in IDB)");
  }
}


// ===================================================
// ส่วนที่ 3 — จัดการเมนูอาหาร (Menu Management)
// ===================================================

const DEFAULT_CATEGORIES = [
  "ส้มตำ",
  "ลาบ / ก้อย / น้ำตก",
  "ต้ม / แกง",
  "ทอด / ย่าง",
  "อาหารจานเดียว",
  "เครื่องดื่ม / ของหวาน"
];

// State ตัวแปรปัจจุบัน
let cachedMenuItems = [];
let currentFilterCategory = "all";
let currentSearchQuery = "";
let currentImageData = null;
let editingMenuId = null;

async function loadMenuItems() {
  // 1. ตรวจสอบข้อมูลเก่าจาก localStorage ก่อนเพื่อป้องกันข้อมูลค้าง
  let localData = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) localData = JSON.parse(raw);
  } catch (e) {}

  // 2. อ่านจาก IndexedDB
  let idbData = await getStoredData(STORAGE_KEY, null);

  if (idbData && Array.isArray(idbData) && idbData.length > 0) {
    cachedMenuItems = idbData;
  } else if (localData && Array.isArray(localData) && localData.length > 0) {
    // โอนย้ายข้อมูลจาก localStorage เดิมเข้าสู่ IndexedDB ทันที
    cachedMenuItems = localData;
    await setStoredData(STORAGE_KEY, cachedMenuItems);
  } else {
    cachedMenuItems = [];
  }

  renderCategoryFilters();
  renderMenuList();
}

function getMenuItems() {
  return cachedMenuItems;
}

async function saveMenuItems(items) {
  cachedMenuItems = items;
  await setStoredData(STORAGE_KEY, items);
  broadcastMenuUpdate();
}

function broadcastMenuUpdate() {
  try {
    const bc = new BroadcastChannel("lao_oi_toi_sync");
    bc.postMessage({ type: "MENU_UPDATED", timestamp: Date.now() });
  } catch (e) {}
}

async function resetAllMenus() {
  if (!confirm("คุณต้องการล้างรายการเมนูอาหารทั้งหมดออกจากระบบใช่หรือไม่?\n(เมนูอาหารทั้งหมดจะถูกลบทันที)")) {
    return;
  }
  await saveMenuItems([]);
  renderCategoryFilters();
  renderMenuList();
  alert("ล้างรายการเมนูทั้งหมดเรียบร้อยแล้ว");
}


/* ----- 3a. แถบตัวกรองหมวดหมู่ ----- */
function renderCategoryFilters() {
  const bar = document.getElementById("category-filter-bar");
  if (!bar) return;

  const items = getMenuItems();
  const allCount = items.length;

  const counts = {};
  DEFAULT_CATEGORIES.forEach((cat) => { counts[cat] = 0; });
  items.forEach((item) => {
    const c = item.category || DEFAULT_CATEGORIES[0];
    counts[c] = (counts[c] || 0) + 1;
  });

  let html = `
    <button class="category-pill ${currentFilterCategory === 'all' ? 'active' : ''}" onclick="setCategoryFilter('all')">
      ทั้งหมด <span class="count-badge">${allCount}</span>
    </button>
  `;

  DEFAULT_CATEGORIES.forEach((cat) => {
    const isActive = currentFilterCategory === cat ? "active" : "";
    const count = counts[cat] || 0;
    html += `
      <button class="category-pill ${isActive}" onclick="setCategoryFilter('${cat}')">
        ${cat} <span class="count-badge">${count}</span>
      </button>
    `;
  });

  bar.innerHTML = html;
}

function setCategoryFilter(category) {
  currentFilterCategory = category;
  renderCategoryFilters();
  renderMenuList();
}

function handleSearch(query) {
  currentSearchQuery = query.trim().toLowerCase();
  renderMenuList();
}


/* ----- 3b. แสดงรายการเมนู (Render Menu Cards) ----- */
function renderMenuList() {
  const container = document.getElementById("menu-grid-items");
  const emptyState = document.getElementById("menu-empty-state");
  const displayedCountEl = document.getElementById("displayed-count");
  if (!container) return;

  const allItems = getMenuItems();

  const filtered = allItems.filter((item) => {
    const matchCategory = currentFilterCategory === "all" || item.category === currentFilterCategory;
    const matchSearch = !currentSearchQuery || (item.name && item.name.toLowerCase().includes(currentSearchQuery));
    return matchCategory && matchSearch;
  });

  if (displayedCountEl) {
    displayedCountEl.textContent = filtered.length;
  }

  if (filtered.length === 0) {
    container.innerHTML = "";
    if (emptyState) {
      emptyState.style.display = "flex";
      const emptyText = document.getElementById("empty-state-text");
      if (emptyText) {
        if (currentSearchQuery) {
          emptyText.textContent = `ไม่พบเมนูที่ตรงกับ "${currentSearchQuery}"`;
        } else if (currentFilterCategory !== "all") {
          emptyText.textContent = `ยังไม่มีเมนูในหมวด "${currentFilterCategory}"`;
        } else {
          emptyText.textContent = "ยังไม่มีรายการเมนูอาหาร";
        }
      }
    }
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let html = "";
  filtered.forEach((item) => {
    const isAvail = item.isAvailable !== false;
    const statusClass = isAvail ? "available" : "out-of-stock";
    const statusText = isAvail ? "พร้อมขาย" : "สินค้าหมด";

    let mediaHtml = "";
    if (item.image) {
      mediaHtml = `<img src="${item.image}" alt="${item.name}" loading="lazy">`;
    } else {
      mediaHtml = `
        <div class="card-media-placeholder">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
            <line x1="6" y1="1" x2="6" y2="4"></line>
            <line x1="10" y1="1" x2="10" y2="4"></line>
            <line x1="14" y1="1" x2="14" y2="4"></line>
          </svg>
        </div>
      `;
    }

    let optionsSummaryHtml = "";
    if (item.optionGroups && item.optionGroups.length > 0) {
      optionsSummaryHtml = `<div class="card-options-summary">`;
      item.optionGroups.forEach((og) => {
        const typeLabel = og.type === "single" ? "เลือกได้ 1" : "เลือกได้หลายอย่าง";
        optionsSummaryHtml += `
          <div class="card-option-group-item">
            <div class="card-option-group-name">
              <span>${og.title}</span>
              <span class="card-option-group-badge">${typeLabel}</span>
            </div>
            <div class="card-choice-chips">
        `;
        if (og.choices && og.choices.length > 0) {
          og.choices.forEach((c) => {
            const priceTag = c.price > 0 ? `<span class="extra-price">+฿${c.price}</span>` : "";
            optionsSummaryHtml += `<span class="choice-chip">${c.name} ${priceTag}</span>`;
          });
        }
        optionsSummaryHtml += `</div></div>`;
      });
      optionsSummaryHtml += `</div>`;
    }

    html += `
      <article class="menu-item-card ${isAvail ? '' : 'is-disabled'}" id="card-${item.id}">
        <div class="card-media">
          ${mediaHtml}
          <span class="card-category-badge">${item.category || 'ทั่วไป'}</span>
          <span class="card-status-badge ${statusClass}">
            ● ${statusText}
          </span>
        </div>

        <div class="card-body">
          <div class="card-title-row">
            <h3 class="card-menu-name">${item.name}</h3>
            <span class="card-menu-price">฿${item.price}</span>
          </div>

          ${optionsSummaryHtml}
        </div>

        <div class="card-actions">
          <div class="quick-toggle-group" title="สลับสถานะสินค้า">
            <label class="switch">
              <input type="checkbox" ${isAvail ? 'checked' : ''} onchange="toggleMenuStatus(${item.id}, this.checked)">
              <span class="slider round"></span>
            </label>
            <span class="status-label-text">${isAvail ? 'เปิดขาย' : 'ปิดชั่วคราว'}</span>
          </div>

          <div style="display:flex; gap:6px;">
            <button class="btn-card-edit" onclick="openMenuModal(${item.id})">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              แก้ไข
            </button>
            <button class="btn-card-delete" onclick="deleteMenu(${item.id})" title="ลบเมนู">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </article>
    `;
  });

  container.innerHTML = html;
}

/* ----- 3c. สลับสถานะ พร้อมขาย / หมด ทันที ----- */
async function toggleMenuStatus(menuId, isAvailable) {
  let items = getMenuItems();
  const index = items.findIndex((i) => i.id === menuId);
  if (index !== -1) {
    items[index].isAvailable = isAvailable;
    await saveMenuItems(items);
    renderCategoryFilters();
    renderMenuList();
  }
}

/* ----- 3d. ลบเมนูอาหาร ----- */
async function deleteMenu(menuId) {
  const items = getMenuItems();
  const target = items.find((i) => i.id === menuId);
  const name = target ? target.name : "เมนูนี้";

  if (!confirm(`คุณต้องการลบเมนู "${name}" ออกจากระบบใช่หรือไม่?`)) {
    return;
  }

  const updated = items.filter((i) => i.id !== menuId);
  await saveMenuItems(updated);
  renderCategoryFilters();
  renderMenuList();
  alert(`ลบเมนู "${name}" เรียบร้อยแล้ว`);
}


// ===================================================
// ส่วนที่ 4 — Modal Popup (เพิ่ม / แก้ไข เมนู)
// ===================================================

function initCategoryDropdown(selectedCategory = null) {
  const select = document.getElementById("menu-category");
  if (!select) return;

  select.innerHTML = "";
  DEFAULT_CATEGORIES.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    if (selectedCategory && selectedCategory === cat) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function updateModalStatusText(isChecked) {
  const text = document.getElementById("menu-status-text");
  if (text) {
    text.textContent = isChecked ? "พร้อมขาย" : "สินค้าหมด";
  }
}

function openMenuModal(menuId = null) {
  const modal = document.getElementById("menu-modal");
  const modalTitle = document.getElementById("modal-title");
  const form = document.getElementById("menu-form");
  const optContainer = document.getElementById("option-groups-container");
  if (!modal || !form) return;

  optContainer.innerHTML = "";
  editingMenuId = menuId;

  if (menuId) {
    // โหมดแก้ไข (EDIT)
    const items = getMenuItems();
    const item = items.find((i) => i.id === menuId);
    if (!item) return;

    modalTitle.textContent = `แก้ไขเมนู: ${item.name}`;
    document.getElementById("modal-menu-id").value = item.id;
    document.getElementById("menu-name").value = item.name;
    document.getElementById("menu-price").value = item.price;
    initCategoryDropdown(item.category);

    const isAvail = item.isAvailable !== false;
    document.getElementById("menu-status").checked = isAvail;
    updateModalStatusText(isAvail);

    // จัดการรูปภาพ
    currentImageData = item.image || null;
    if (currentImageData) {
      showImagePreview(currentImageData);
    } else {
      removeImage();
    }

    // โหลด Option Groups
    if (item.optionGroups && item.optionGroups.length > 0) {
      item.optionGroups.forEach((og) => addOptionGroupUI(og));
    }
  } else {
    // โหมดเพิ่มใหม่ (ADD)
    modalTitle.textContent = "เพิ่มเมนูใหม่";
    document.getElementById("modal-menu-id").value = "";
    form.reset();
    initCategoryDropdown(currentFilterCategory !== "all" ? currentFilterCategory : DEFAULT_CATEGORIES[0]);
    document.getElementById("menu-status").checked = true;
    updateModalStatusText(true);
    removeImage();
  }

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeMenuModal() {
  const modal = document.getElementById("menu-modal");
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "";
  editingMenuId = null;
  currentImageData = null;
}

function handleOverlayClick(e) {
  if (e.target.id === "menu-modal") {
    closeMenuModal();
  }
}


/* ----- 4a. อัปโหลดรูปภาพและบีบอัดอัตโนมัติ (Canvas Compression) ----- */
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      const maxDim = 600;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      currentImageData = canvas.toDataURL("image/jpeg", 0.75);
      showImagePreview(currentImageData);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function showImagePreview(src) {
  const placeholder = document.getElementById("image-placeholder");
  const img = document.getElementById("image-preview-img");
  const removeBtn = document.getElementById("image-remove-btn");

  if (placeholder) placeholder.style.display = "none";
  if (img) {
    img.src = src;
    img.style.display = "block";
  }
  if (removeBtn) removeBtn.style.display = "flex";
}

function removeImage(e) {
  if (e) e.stopPropagation();
  currentImageData = null;
  const placeholder = document.getElementById("image-placeholder");
  const img = document.getElementById("image-preview-img");
  const removeBtn = document.getElementById("image-remove-btn");
  const fileInput = document.getElementById("file-input");

  if (placeholder) placeholder.style.display = "flex";
  if (img) {
    img.src = "";
    img.style.display = "none";
  }
  if (removeBtn) removeBtn.style.display = "none";
  if (fileInput) fileInput.value = "";
}


/* ----- 4b. จัดการกลุ่มตัวเลือก (Option Groups) ----- */
function addOptionGroupUI(groupData = null) {
  const container = document.getElementById("option-groups-container");
  if (!container) return;

  const groupId = "og_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const title = groupData ? groupData.title : "";
  const type = groupData ? groupData.type : "single";

  const groupCard = document.createElement("div");
  groupCard.className = "opt-group-card";
  groupCard.dataset.groupId = groupId;

  groupCard.innerHTML = `
    <div class="opt-group-header">
      <input type="text" class="opt-group-title-input" placeholder="ชื่อกลุ่มตัวเลือก (เช่น ระดับความเผ็ด)" value="${title}">
      <select class="opt-group-type-select">
        <option value="single" ${type === "single" ? "selected" : ""}>เลือกได้ 1 อย่าง (Single Choice)</option>
        <option value="multiple" ${type === "multiple" ? "selected" : ""}>เลือกได้หลายอย่าง (Multiple Choice)</option>
      </select>
      <button type="button" class="btn-remove-group" onclick="this.closest('.opt-group-card').remove()">ลบกลุ่มนี้</button>
    </div>

    <div class="opt-choices-list">
      <!-- Choice rows dynamically appended -->
    </div>

    <button type="button" class="btn-add-choice" onclick="addChoiceRowUI(this.previousElementSibling)">+ เพิ่มตัวเลือกย่อย</button>
  `;

  const choicesList = groupCard.querySelector(".opt-choices-list");

  if (groupData && groupData.choices && groupData.choices.length > 0) {
    groupData.choices.forEach((c) => addChoiceRowUI(choicesList, c));
  } else {
    addChoiceRowUI(choicesList, { name: "", price: 0 });
  }

  container.appendChild(groupCard);
}

function addChoiceRowUI(choicesContainer, choiceData = null) {
  const name = choiceData ? choiceData.name : "";
  const price = choiceData ? choiceData.price : 0;

  const row = document.createElement("div");
  row.className = "opt-choice-row";
  row.innerHTML = `
    <input type="text" class="choice-name-input" placeholder="ชื่อตัวเลือก" value="${name}">
    <div class="choice-price-wrap">
      <span class="choice-price-prefix">+฿</span>
      <input type="number" class="choice-price-input" placeholder="0" min="0" value="${price}">
    </div>
    <button type="button" class="btn-remove-choice" onclick="this.closest('.opt-choice-row').remove()" title="ลบตัวเลือกนี้">✕</button>
  `;
  choicesContainer.appendChild(row);
}

function collectOptionGroupsFromUI() {
  const groupCards = document.querySelectorAll("#option-groups-container .opt-group-card");
  const optionGroups = [];

  groupCards.forEach((card) => {
    const titleInput = card.querySelector(".opt-group-title-input");
    const typeSelect = card.querySelector(".opt-group-type-select");
    const title = titleInput.value.trim();
    const type = typeSelect.value;

    if (!title) return;

    const choices = [];
    const choiceRows = card.querySelectorAll(".opt-choice-row");
    choiceRows.forEach((row) => {
      const name = row.querySelector(".choice-name-input").value.trim();
      const price = parseFloat(row.querySelector(".choice-price-input").value) || 0;
      if (name) {
        choices.push({ name, price });
      }
    });

    if (choices.length > 0) {
      optionGroups.push({
        id: card.dataset.groupId || ("og_" + Date.now()),
        title: title,
        type: type,
        choices: choices
      });
    }
  });

  return optionGroups;
}


/* ----- 4c. บันทึกข้อมูลเมนู (Save Menu: INSERT / UPDATE) ----- */
async function saveMenu() {
  const name = document.getElementById("menu-name").value.trim();
  const category = document.getElementById("menu-category").value;
  const priceStr = document.getElementById("menu-price").value.trim();
  const isAvailable = document.getElementById("menu-status").checked;

  if (!name) {
    alert("กรุณาระบุชื่อเมนูอาหาร");
    document.getElementById("menu-name").focus();
    return;
  }

  const price = parseFloat(priceStr);
  if (isNaN(price) || price < 0) {
    alert("กรุณากรอกราคาที่ถูกต้อง (ตั้งแต่ 0 ขึ้นไป)");
    document.getElementById("menu-price").focus();
    return;
  }

  const optionGroups = collectOptionGroupsFromUI();
  let items = [...cachedMenuItems];

  if (editingMenuId) {
    const index = items.findIndex((i) => i.id === editingMenuId);
    if (index !== -1) {
      items[index] = {
        ...items[index],
        name: name,
        category: category,
        price: price,
        isAvailable: isAvailable,
        image: currentImageData,
        optionGroups: optionGroups,
        updatedAt: Date.now()
      };
      await saveMenuItems(items);
    }
  } else {
    const newItem = {
      id: Date.now(),
      name: name,
      category: category,
      price: price,
      isAvailable: isAvailable,
      image: currentImageData,
      optionGroups: optionGroups,
      createdAt: Date.now()
    };
    items.push(newItem);
    await saveMenuItems(items);
  }

  closeMenuModal();
  renderCategoryFilters();
  renderMenuList();

  alert(`บันทึกเมนู "${name}" สำเร็จแล้ว! (ระบบเชื่อมโยงข้อมูลไปยังหน้าลูกค้าเรียบร้อย)`);
}


// ===================================================
// ส่วนที่ 5 — Initial Loader เมื่อเปิดหน้า
// ===================================================
document.addEventListener("DOMContentLoaded", function () {
  if (document.querySelector(".edit-menu-container")) {
    loadMenuItems();

    if (window.location.protocol === "file:") {
      const banner = document.getElementById("protocol-hint-banner");
      if (banner) banner.style.display = "block";
    }
  }
});