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
document.addEventListener("DOMContentLoaded", async function () {
  // One-time auto cleanup of old/mock test orders and table data across user browsers
  const CLEANUP_KEY = "lao_oi_toi_cleanup_v4";
  if (localStorage.getItem(CLEANUP_KEY) !== "true") {
    await setStoredData(ORDERS_STORAGE_KEY, []);
    const freshTables = getDefaultTables();
    await setStoredData(TABLES_STORAGE_KEY, freshTables);
    localStorage.removeItem("lao_oi_toi_cart");
    localStorage.removeItem("lao_oi_toi_table_id");
    localStorage.removeItem("lao_oi_toi_customer_name");
    sessionStorage.removeItem("lao_oi_toi_table_id");
    sessionStorage.removeItem("lao_oi_toi_customer_name");
    localStorage.setItem(CLEANUP_KEY, "true");
  }

  if (document.querySelector(".edit-menu-container")) {
    loadMenuItems();

    if (window.location.protocol === "file:") {
      const banner = document.getElementById("protocol-hint-banner");
      if (banner) banner.style.display = "block";
    }
  }

  
  if (document.querySelector(".checkbill-container")) {
    loadCheckbillOrders();

    if (window.location.protocol === "file:") {
      const banner = document.getElementById("protocol-hint-banner");
      if (banner) banner.style.display = "block";
    }

    // Real-time BroadcastChannel Sync for orders
    try {
      const bc = new BroadcastChannel("lao_oi_toi_sync");
      bc.onmessage = async function (e) {
        if (e.data && (e.data.type === "ORDERS_UPDATED" || e.data.type === "TABLES_UPDATED")) {
          await loadCheckbillOrders();
        }
      };
    } catch (err) {}

    // Storage Event Sync
    window.addEventListener("storage", async function (e) {
      if (e.key === ORDERS_STORAGE_KEY || e.key === TABLES_STORAGE_KEY) {
        await loadCheckbillOrders();
      }
    });

    // Polling Sync
    setInterval(async function () {
      const latestOrders = await getStoredData(ORDERS_STORAGE_KEY, []);
      if (latestOrders && JSON.stringify(latestOrders) !== JSON.stringify(cachedCheckbillOrders)) {
        cachedCheckbillOrders = latestOrders;
        updateCheckbillStats(latestOrders);
        renderReceiptSlips(latestOrders);
      }
    }, 1500);
  }

  if (document.querySelector(".tables-container")) {
    loadAdminTables();

    if (window.location.protocol === "file:") {
      const banner = document.getElementById("protocol-hint-banner");
      if (banner) banner.style.display = "block";
    }

    // Real-time BroadcastChannel Sync for tables & orders
    try {
      const bc = new BroadcastChannel("lao_oi_toi_sync");
      bc.onmessage = async function (e) {
        if (e.data && (e.data.type === "TABLES_UPDATED" || e.data.type === "ORDERS_UPDATED")) {
          await loadAdminTables();
        }
      };
    } catch (err) {}

    // Storage Event Sync
    window.addEventListener("storage", async function (e) {
      if (e.key === TABLES_STORAGE_KEY || e.key === ORDERS_STORAGE_KEY) {
        await loadAdminTables();
      }
    });

    // Polling Sync
    setInterval(async function () {
      const latest = await getStoredData(TABLES_STORAGE_KEY, []);
      if (latest && JSON.stringify(latest) !== JSON.stringify(cachedTables)) {
        cachedTables = latest;
        renderAdminFloorPlan();
        updateAdminTableStats();
      }
    }, 1500);
  }
});


// ===================================================
// ส่วนที่ 6 — จัดการสถานะโต๊ะอาหาร (Admin Table Management)
// ===================================================
const TABLES_STORAGE_KEY = "lao_oi_toi_tables";
const ORDERS_STORAGE_KEY = "lao_oi_toi_orders";

let cachedTables = [];
let currentAdminModalTableId = null;

function getDefaultTables() {
  const list = [];
  for (let i = 1; i <= 15; i++) {
    list.push({
      id: i,
      name: `โต๊ะ ${i}`,
      status: "available", // "available" | "occupied"
      customerName: null,
      occupiedAt: null,
      currentOrderId: null
    });
  }
  return list;
}

async function loadAdminTables() {
  let tables = await getStoredData(TABLES_STORAGE_KEY, null);
  if (!tables || !Array.isArray(tables) || tables.length === 0) {
    tables = getDefaultTables();
    await setStoredData(TABLES_STORAGE_KEY, tables);
  } else if (tables.length < 15) {
    for (let i = tables.length + 1; i <= 15; i++) {
      tables.push({
        id: i,
        name: `โต๊ะ ${i}`,
        status: "available",
        customerName: null,
        occupiedAt: null,
        currentOrderId: null
      });
    }
    await setStoredData(TABLES_STORAGE_KEY, tables);
  }
  cachedTables = tables;
  renderAdminFloorPlan();
  updateAdminTableStats();
}

async function saveAdminTables(tables) {
  cachedTables = tables;
  await setStoredData(TABLES_STORAGE_KEY, tables);
  try {
    const bc = new BroadcastChannel("lao_oi_toi_sync");
    bc.postMessage({ type: "TABLES_UPDATED", timestamp: Date.now() });
  } catch (e) {}
}

async function updateAdminTableStats() {
  const totalEl = document.getElementById("stat-total-tables");
  const availEl = document.getElementById("stat-avail-tables");
  const occEl = document.getElementById("stat-occupied-tables");
  if (!totalEl) return;

  const total = cachedTables.length;
  const occupiedCount = cachedTables.filter((t) => t.status === "occupied").length;
  const availCount = total - occupiedCount;

  totalEl.textContent = total;
  if (availEl) availEl.textContent = availCount;
  if (occEl) occEl.textContent = occupiedCount;
}

async function renderAdminFloorPlan() {
  const grid = document.getElementById("admin-floor-grid");
  if (!grid) return;

  const orders = await getStoredData(ORDERS_STORAGE_KEY, []);

  let html = "";
  for (let i = 1; i <= 15; i++) {
    const t = cachedTables.find((item) => item.id === i) || { id: i, status: "available" };
    const isOccupied = t.status === "occupied";
    const statusClass = isOccupied ? "occupied" : "available";
    const statusText = isOccupied ? "กำลังใช้งาน" : "ว่าง";

    let guestHtml = "";

    if (isOccupied && t.customerName) {
      guestHtml = `<span class="table-guest-name" title="${t.customerName}">👤 ${t.customerName}</span>`;
    }

    html += `
      <div class="admin-table-node ${statusClass}" data-table-id="${i}" onclick="openAdminTableModal(${i})">
        <span class="table-num-badge">โต๊ะ ${i}</span>
        <span class="table-status-pill">${statusText}</span>
        ${guestHtml}
      </div>
    `;
  }

  grid.innerHTML = html;
}

async function openAdminTableModal(tableId) {
  currentAdminModalTableId = tableId;
  const modal = document.getElementById("admin-table-modal");
  const titleEl = document.getElementById("modal-table-title");
  const statusEl = document.getElementById("modal-table-status-text");
  const guestEl = document.getElementById("modal-table-guest-text");
  const timeEl = document.getElementById("modal-table-time-text");
  const clearBtn = document.getElementById("btn-admin-clear-table");
  const toggleBtn = document.getElementById("btn-admin-toggle-table");

  if (!modal) return;

  const t = cachedTables.find((item) => item.id === tableId) || { id: tableId, status: "available" };
  const isOccupied = t.status === "occupied";

  if (titleEl) titleEl.textContent = `รายละเอียด โต๊ะ ${tableId}`;
  if (statusEl) {
    statusEl.textContent = isOccupied ? "🔴 กำลังใช้งาน (ไม่ว่าง)" : "🟢 โต๊ะว่าง";
    statusEl.style.color = isOccupied ? "#C62828" : "#2E7D32";
  }
  if (guestEl) {
    guestEl.textContent = isOccupied && t.customerName ? t.customerName : "-";
  }
  if (timeEl) {
    if (isOccupied && t.occupiedAt) {
      const mins = Math.floor((Date.now() - t.occupiedAt) / 60000);
      timeEl.textContent = mins <= 1 ? "เมื่อสักครู่" : `${mins} นาทีที่แล้ว`;
    } else {
      timeEl.textContent = "-";
    }
  }

  if (clearBtn) {
    clearBtn.style.display = isOccupied ? "flex" : "none";
  }
  if (toggleBtn) {
    toggleBtn.textContent = isOccupied ? "เปลี่ยนเป็นโต๊ะว่าง" : "เปลี่ยนเป็นไม่ว่าง";
  }

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeAdminTableModal() {
  const modal = document.getElementById("admin-table-modal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
  currentAdminModalTableId = null;
}

function handleAdminTableModalOverlay(e) {
  if (e.target.id === "admin-table-modal") {
    closeAdminTableModal();
  }
}

async function handleClearCurrentTable() {
  if (!currentAdminModalTableId) return;
  const tableId = currentAdminModalTableId;

  if (!confirm(`คุณต้องการเคลียร์ โต๊ะ ${tableId} ให้กลับเป็นโต๊ะว่างใช่หรือไม่?`)) {
    return;
  }

  const idx = cachedTables.findIndex((t) => t.id === tableId);
  if (idx !== -1) {
    cachedTables[idx].status = "available";
    cachedTables[idx].customerName = null;
    cachedTables[idx].occupiedAt = null;
    await saveAdminTables(cachedTables);
  }

  closeAdminTableModal();
  renderAdminFloorPlan();
  updateAdminTableStats();
  alert(`เคลียร์ โต๊ะ ${tableId} เป็นโต๊ะว่างเรียบร้อยแล้ว (หน้าลูกค้าอัปเดตแบบเรียลไทม์)`);
}

async function handleToggleCurrentTable() {
  if (!currentAdminModalTableId) return;
  const tableId = currentAdminModalTableId;
  const idx = cachedTables.findIndex((t) => t.id === tableId);
  if (idx === -1) return;

  const wasOccupied = cachedTables[idx].status === "occupied";
  if (wasOccupied) {
    cachedTables[idx].status = "available";
    cachedTables[idx].customerName = null;
    cachedTables[idx].occupiedAt = null;
  } else {
    cachedTables[idx].status = "occupied";
    cachedTables[idx].customerName = "แอดมินกำหนด";
    cachedTables[idx].occupiedAt = Date.now();
  }

  await saveAdminTables(cachedTables);
  closeAdminTableModal();
  renderAdminFloorPlan();
  updateAdminTableStats();
}

async function clearAllTablesConfirm() {
  if (!confirm("คุณต้องการเคลียร์ทุกโต๊ะ (15 โต๊ะ) ให้กลับเป็นโต๊ะว่างทั้งหมดใช่หรือไม่?")) {
    return;
  }
  const defaultList = getDefaultTables();
  await saveAdminTables(defaultList);
  renderAdminFloorPlan();
  updateAdminTableStats();
  alert("เคลียร์ทุกโต๊ะเป็นโต๊ะว่างเรียบร้อยแล้ว");
}

async function manualSyncAdminTables() {
  await loadAdminTables();
  alert("ซิงค์ข้อมูลสถานะโต๊ะล่าสุดเรียบร้อยแล้ว");
}

// ===================================================
// ส่วนที่ 7 — ระบบเช็คบิลลูกค้า (Admin Bill Checkout Management)
// ===================================================

let checkbillFilter = "pending"; // "pending" | "paid" | "all"
let checkbillSearchQuery = "";
let currentCheckoutOrderId = null;
let currentSelectedPaymentMethod = "promptpay";
let cachedCheckbillOrders = [];

async function loadCheckbillOrders() {
  const orders = await getStoredData(ORDERS_STORAGE_KEY, []);
  cachedCheckbillOrders = orders;
  updateCheckbillStats(orders);
  renderReceiptSlips(orders);
}

function updateCheckbillStats(orders) {
  const revEl = document.getElementById("stat-total-revenue");
  const pendingEl = document.getElementById("stat-pending-bills");
  const paidEl = document.getElementById("stat-paid-bills");
  const badgePending = document.getElementById("badge-pending-count");
  const badgePaid = document.getElementById("badge-paid-count");
  const badgeAll = document.getElementById("badge-all-count");

  const paidOrders = orders.filter((o) => o.status === "paid");
  const pendingOrders = orders.filter((o) => o.status !== "paid");

  const totalRev = paidOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);

  if (revEl) revEl.textContent = `฿${totalRev.toLocaleString()}`;
  if (pendingEl) pendingEl.textContent = `${pendingOrders.length}`;
  if (paidEl) paidEl.textContent = `${paidOrders.length}`;

  if (badgePending) badgePending.textContent = `${pendingOrders.length}`;
  if (badgePaid) badgePaid.textContent = `${paidOrders.length}`;
  if (badgeAll) badgeAll.textContent = `${orders.length}`;
}

function setCheckbillFilter(filter) {
  checkbillFilter = filter;
  document.querySelectorAll(".checkbill-tab-btn").forEach((btn) => btn.classList.remove("active"));
  const activeBtn = document.getElementById(`tab-${filter}`);
  if (activeBtn) activeBtn.classList.add("active");

  const titleEl = document.getElementById("receipts-current-title");
  if (titleEl) {
    if (filter === "pending") titleEl.textContent = "🧾 รายการบิลรอชำระเงิน";
    else if (filter === "paid") titleEl.textContent = "✔️ รายการบิลที่เช็คแล้ว";
    else titleEl.textContent = "📋 รายการบิลทั้งหมด";
  }

  loadCheckbillOrders();
}

function handleCheckbillSearch(query) {
  checkbillSearchQuery = query.trim().toLowerCase();
  loadCheckbillOrders();
}

function renderReceiptSlips(orders) {
  const grid = document.getElementById("receipt-slips-grid");
  const emptyState = document.getElementById("checkbill-empty-state");
  if (!grid) return;

  // Filter orders
  let filtered = orders.filter((o) => {
    const isPaid = o.status === "paid";
    if (checkbillFilter === "pending" && isPaid) return false;
    if (checkbillFilter === "paid" && !isPaid) return false;

    if (checkbillSearchQuery) {
      const matchTable = `โต๊ะ ${o.tableNumber}`.toLowerCase().includes(checkbillSearchQuery) || String(o.tableNumber).includes(checkbillSearchQuery);
      const matchGuest = (o.customerName || "").toLowerCase().includes(checkbillSearchQuery);
      const matchId = (o.id || "").toLowerCase().includes(checkbillSearchQuery);
      return matchTable || matchGuest || matchId;
    }
    return true;
  });

  // Sort: pending first, then by timestamp descending
  filtered.sort((a, b) => {
    if (a.status !== "paid" && b.status === "paid") return -1;
    if (a.status === "paid" && b.status !== "paid") return 1;
    return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
  });

  if (filtered.length === 0) {
    grid.innerHTML = "";
    if (emptyState) {
      emptyState.style.display = "flex";
      const emptyTitle = document.getElementById("checkbill-empty-title");
      if (emptyTitle) {
        if (checkbillFilter === "pending") emptyTitle.textContent = "ไม่มีบิลรอชำระในขณะนี้";
        else if (checkbillFilter === "paid") emptyTitle.textContent = "ยังไม่มีประวัติการเช็คบิล";
        else emptyTitle.textContent = "ไม่พบบิลที่ตรงกับคำค้นหา";
      }
    }
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let html = "";
  filtered.forEach((order, index) => {
    const isPaid = order.status === "paid";
    const billNumberText = `บิล ${index + 1}`;
    const guestName = order.customerName || "คุณลูกค้า";
    const tableNumber = order.tableNumber || "-";
    const displayTime = order.displayTime || "";
    const totalPrice = order.totalPrice || 0;

    // Items list (max 4 items)
    const items = order.items || [];
    let itemsHtml = "";
    const showItems = items.slice(0, 4);
    showItems.forEach((it) => {
      const itPrice = (it.unitPrice || 0) * (it.quantity || 1);
      itemsHtml += `
        <div class="slip-item-row">
          <span class="slip-item-name"><span class="slip-item-qty">${it.quantity}x</span>${it.name}</span>
          <span class="slip-item-price">฿${itPrice}</span>
        </div>
      `;
    });

    if (items.length > 4) {
      itemsHtml += `<div class="slip-more-items">+ และอีก ${items.length - 4} รายการ...</div>`;
    }

    // Paid Stamp or Checkmark
    let paidStampHtml = "";
    let paidTimeHtml = "";
    if (isPaid) {
      paidStampHtml = `
        <div class="paid-stamp-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>ชำระแล้ว</span>
        </div>
      `;
      if (order.paidAt) {
        const paidDate = new Date(order.paidAt);
        const pTime = paidDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        paidTimeHtml = `<div class="paid-time-subtext">✔️ ชำระเมื่อ ${pTime} น.</div>`;
      }
    }

    // Slip Card HTML
    // Note user's explicit rule: Table & Customer Name first (Line 1), Order ID second (Line 2)
    html += `
      <div class="receipt-slip ${isPaid ? 'paid' : ''}" onclick="openCheckbillModal('${order.id}')" title="คลิกเพื่อดูรายละเอียดและเช็คบิล">
        <div class="receipt-teeth-top"></div>
        <div class="receipt-badge">${billNumberText}</div>
        
        <!-- Line 1: โต๊ะ และ ชื่อลูกค้า (ขึ้นก่อนตามคำสั่งผู้ใช้) -->
        <div class="slip-line-table">
          📍 โต๊ะ ${tableNumber} • ${guestName}
        </div>

        <!-- Line 2: รหัสออเดอร์ และ เวลา -->
        <div class="slip-line-order">
          รหัสบิล: ${order.id} • ${displayTime} น.
        </div>

        <div class="slip-dashed-line"></div>

        <!-- รายการอาหาร -->
        <div class="slip-items-container">
          ${itemsHtml}
        </div>

        <div class="slip-dashed-line"></div>

        <!-- ยอดรวมสุทธิ -->
        <div class="slip-total-row">
          <span class="slip-total-label">ยอดรวมสุทธิ:</span>
          <span class="slip-total-amount">฿${totalPrice}</span>
        </div>

        ${paidTimeHtml}
        ${paidStampHtml}

        <div class="receipt-teeth-bottom"></div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

async function openCheckbillModal(orderId) {
  currentCheckoutOrderId = orderId;
  const orders = await getStoredData(ORDERS_STORAGE_KEY, []);
  const order = orders.find((o) => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById("checkbill-modal");
  if (!modal) return;

  const isPaid = order.status === "paid";

  // Modal Header Info
  const tableGuestEl = document.getElementById("modal-bill-table-guest");
  const orderIdEl = document.getElementById("modal-bill-order-id");
  const timeEl = document.getElementById("modal-bill-time");
  const statusBadgeEl = document.getElementById("modal-bill-status-badge");
  const billNumEl = document.getElementById("modal-bill-number");

  if (tableGuestEl) tableGuestEl.textContent = `📍 โต๊ะ ${order.tableNumber} • ${order.customerName || "คุณลูกค้า"}`;
  if (orderIdEl) orderIdEl.textContent = `รหัส: ${order.id}`;
  if (timeEl) timeEl.textContent = `${order.displayTime || ""} น.`;

  if (statusBadgeEl) {
    if (isPaid) {
      statusBadgeEl.textContent = "✔️ ชำระเงินเรียบร้อยแล้ว";
      statusBadgeEl.className = "modal-status-badge paid";
    } else {
      statusBadgeEl.textContent = "⏳ รอชำระเงิน";
      statusBadgeEl.className = "modal-status-badge";
    }
  }

  // Items table
  const itemsContainer = document.getElementById("modal-items-container");
  const totalQtyEl = document.getElementById("modal-items-total-qty");
  const items = order.items || [];

  if (totalQtyEl) totalQtyEl.textContent = `(${order.totalQuantity || items.length} รายการ)`;

  if (itemsContainer) {
    let itemsHtml = "";
    items.forEach((it) => {
      let optsText = "";
      if (it.selectedOptions && it.selectedOptions.length > 0) {
        optsText = `<div class="modal-item-opts">${it.selectedOptions.map((o) => o.name).join(", ")}</div>`;
      }
      let noteText = "";
      if (it.note) {
        noteText = `<span class="modal-item-note">หมายเหตุ: ${it.note}</span>`;
      }
      const itemTotal = (it.unitPrice || 0) * (it.quantity || 1);

      itemsHtml += `
        <div class="modal-item-row">
          <div class="modal-item-info">
            <span class="modal-item-name">${it.name}</span>
            ${optsText}
            ${noteText}
          </div>
          <div class="modal-item-right">
            <span class="modal-item-qty">x${it.quantity}</span>
            <span class="modal-item-total">฿${itemTotal}</span>
          </div>
        </div>
      `;
    });
    itemsContainer.innerHTML = itemsHtml;
  }

  // Subtotal & Grand Total
  const subtotalEl = document.getElementById("modal-subtotal-val");
  const grandTotalEl = document.getElementById("modal-grand-total-val");
  const ppAmountEl = document.getElementById("pp-display-amount");
  const btnPayText = document.getElementById("btn-confirm-payment-text");

  const total = order.totalPrice || 0;
  if (subtotalEl) subtotalEl.textContent = `฿${total}`;
  if (grandTotalEl) grandTotalEl.textContent = `฿${total}`;
  if (ppAmountEl) ppAmountEl.textContent = `฿${total}`;
  if (btnPayText) btnPayText.textContent = `ชำระเงินเรียบร้อย (฿${total})`;

  // PromptPay QR Image with accurate total amount
  const qrImg = document.getElementById("promptpay-qr-img");
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=LAO_OI_TOI_TABLE_${order.tableNumber}_AMOUNT_${total}`;
  }

  // Cash Calculation Reset
  const cashInput = document.getElementById("cash-received-input");
  const changeVal = document.getElementById("cash-change-val");
  if (cashInput) cashInput.value = "";
  if (changeVal) changeVal.textContent = "฿0";

  // Payment Panel vs Paid Banner
  const payPanel = document.getElementById("modal-payment-panel");
  const paidBanner = document.getElementById("modal-paid-banner");
  const btnConfirm = document.getElementById("btn-confirm-payment");

  if (isPaid) {
    if (payPanel) payPanel.style.display = "none";
    if (paidBanner) {
      paidBanner.style.display = "flex";
      const timeStampEl = document.getElementById("modal-paid-timestamp");
      if (timeStampEl && order.paidAt) {
        const pDate = new Date(order.paidAt);
        timeStampEl.textContent = `เมื่อ ${pDate.toLocaleDateString("th-TH")} ${pDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`;
      }
    }
    if (btnConfirm) btnConfirm.style.display = "none";
  } else {
    if (payPanel) payPanel.style.display = "block";
    if (paidBanner) paidBanner.style.display = "none";
    if (btnConfirm) btnConfirm.style.display = "flex";
    setPaymentMethod("promptpay");
  }

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeCheckbillModal() {
  const modal = document.getElementById("checkbill-modal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "";
  currentCheckoutOrderId = null;
}

function handleCheckbillModalOverlay(e) {
  if (e.target.id === "checkbill-modal") {
    closeCheckbillModal();
  }
}

function setPaymentMethod(method) {
  currentSelectedPaymentMethod = method;
  const tabPp = document.getElementById("tab-pay-promptpay");
  const tabCash = document.getElementById("tab-pay-cash");
  const viewPp = document.getElementById("payment-view-promptpay");
  const viewCash = document.getElementById("payment-view-cash");

  if (method === "promptpay") {
    if (tabPp) tabPp.classList.add("active");
    if (tabCash) tabCash.classList.remove("active");
    if (viewPp) viewPp.style.display = "block";
    if (viewCash) viewCash.style.display = "none";
  } else {
    if (tabPp) tabPp.classList.remove("active");
    if (tabCash) tabCash.classList.add("active");
    if (viewPp) viewPp.style.display = "none";
    if (viewCash) viewCash.style.display = "block";
  }
}

async function calculateCashChange() {
  if (!currentCheckoutOrderId) return;
  const orders = await getStoredData(ORDERS_STORAGE_KEY, []);
  const order = orders.find((o) => o.id === currentCheckoutOrderId);
  if (!order) return;

  const total = order.totalPrice || 0;
  const cashInput = document.getElementById("cash-received-input");
  const changeVal = document.getElementById("cash-change-val");
  if (!cashInput || !changeVal) return;

  const received = parseFloat(cashInput.value) || 0;
  const change = received - total;

  if (change >= 0) {
    changeVal.textContent = `฿${change.toLocaleString()}`;
    changeVal.style.color = "#2E7D32";
  } else {
    changeVal.textContent = `ยังขาดอีก ฿${Math.abs(change).toLocaleString()}`;
    changeVal.style.color = "#C62828";
  }
}

async function setQuickCash(amount) {
  const cashInput = document.getElementById("cash-received-input");
  if (cashInput) {
    cashInput.value = amount;
    calculateCashChange();
  }
}

async function setQuickCashExact() {
  if (!currentCheckoutOrderId) return;
  const orders = await getStoredData(ORDERS_STORAGE_KEY, []);
  const order = orders.find((o) => o.id === currentCheckoutOrderId);
  if (!order) return;

  const cashInput = document.getElementById("cash-received-input");
  if (cashInput) {
    cashInput.value = order.totalPrice || 0;
    calculateCashChange();
  }
}

// CONFIRM PAYMENT
async function confirmPaymentCurrentOrder() {
  if (!currentCheckoutOrderId) return;
  const orderId = currentCheckoutOrderId;

  const orders = await getStoredData(ORDERS_STORAGE_KEY, []);
  const orderIndex = orders.findIndex((o) => o.id === orderId);
  if (orderIndex === -1) return;

  const order = orders[orderIndex];

  // Update order status to paid (DO NOT DELETE)
  order.status = "paid";
  order.paidAt = new Date().toISOString();
  order.paymentMethod = currentSelectedPaymentMethod;

  await setStoredData(ORDERS_STORAGE_KEY, orders);

  // Check if clear table option is checked
  const cbClear = document.getElementById("cb-clear-table-after-pay");
  const shouldClearTable = cbClear ? cbClear.checked : true;

  if (shouldClearTable && order.tableNumber) {
    const tableId = parseInt(order.tableNumber);
    let tables = await getStoredData(TABLES_STORAGE_KEY, []);
    const tIndex = tables.findIndex((t) => t.id === tableId);
    if (tIndex !== -1) {
      tables[tIndex].status = "available";
      tables[tIndex].customerName = null;
      tables[tIndex].occupiedAt = null;
      tables[tIndex].currentOrderId = null;
      await setStoredData(TABLES_STORAGE_KEY, tables);

      try {
        const bc = new BroadcastChannel("lao_oi_toi_sync");
        bc.postMessage({ type: "TABLES_UPDATED", timestamp: Date.now() });
      } catch (e) {}
    }
  }

  // Broadcast Orders Updated
  try {
    const bc = new BroadcastChannel("lao_oi_toi_sync");
    bc.postMessage({ type: "ORDERS_UPDATED", timestamp: Date.now() });
  } catch (e) {}

  closeCheckbillModal();
  await loadCheckbillOrders();

  alert(`ชำระเงินเรียบร้อยแล้ว!\nบิลเปลี่ยนเป็นสีเทาและบันทึกประวัติไว้เรียบร้อยแล้ว ✔️`);
}

// Print Receipt Helper
async function printCurrentOrderReceipt() {
  if (!currentCheckoutOrderId) return;
  const orders = await getStoredData(ORDERS_STORAGE_KEY, []);
  const order = orders.find((o) => o.id === currentCheckoutOrderId);
  if (!order) return;

  const area = document.getElementById("printable-receipt-area");
  if (!area) {
    window.print();
    return;
  }

  let itemsRows = (order.items || []).map((it) => {
    return `<tr><td>${it.name} x${it.quantity}</td><td style="text-align:right;">฿${it.unitPrice * it.quantity}</td></tr>`;
  }).join("");

  area.innerHTML = `
    <div style="text-align:center; margin-bottom:10px;">
      <h3 style="margin:0;">ลาวอ้อยต้อย</h3>
      <p style="margin:2px 0;">อาหารอีสานรสแซ่บ</p>
      <p style="margin:2px 0; font-size:11px;">ใบเสร็จรับเงิน / Tax Invoice</p>
    </div>
    <hr style="border:0; border-top:1px dashed #000; margin:6px 0;">
    <div>โต๊ะ: <strong>${order.tableNumber}</strong> (${order.customerName || "-"})</div>
    <div>รหัสบิล: ${order.id}</div>
    <div>เวลา: ${order.displayTime || ""} น.</div>
    <hr style="border:0; border-top:1px dashed #000; margin:6px 0;">
    <table style="width:100%; font-size:12px;">
      ${itemsRows}
    </table>
    <hr style="border:0; border-top:1px dashed #000; margin:6px 0;">
    <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:14px;">
      <span>ยอดรวมสุทธิ:</span>
      <span>฿${order.totalPrice}</span>
    </div>
    <div style="text-align:center; margin-top:12px; font-size:11px;">
      ขอบคุณที่ใช้บริการลาวอ้อยต้อยครับ 🙏
    </div>
  `;

  window.print();
}

// Function: Clear All Bills (ล้างประวัติบิลและยอดขายทั้งหมดออกจากระบบ)
async function clearAllBillsConfirm() {
  if (!confirm("คุณต้องการล้างรายการบิลและยอดขายทั้งหมดออกจากระบบใช่หรือไม่?\\n(ข้อมูลบิลเก่าทั้งหมดจะถูกลบทันที)")) {
    return;
  }
  await setStoredData(ORDERS_STORAGE_KEY, []);
  try {
    const bc = new BroadcastChannel("lao_oi_toi_sync");
    bc.postMessage({ type: "ORDERS_UPDATED", timestamp: Date.now() });
  } catch (e) {}
  await loadCheckbillOrders();
  alert("ล้างรายการบิลทั้งหมดเรียบร้อยแล้ว");
}

async function manualSyncCheckbill() {
  await loadCheckbillOrders();
  alert("ซิงค์ข้อมูลบิลล่าสุดเรียบร้อยแล้ว");
}
