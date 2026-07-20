// ===================================================
// admin.js — ลาวอ้อยต้อย | Admin logic
// ===================================================


// ===== ส่วนที่ 1 — กำหนด credentials =====
const ADMIN_USER = "admin";
const ADMIN_PASS = "123";


// ===== ส่วนที่ 2 — จัดการ login =====
function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    sessionStorage.setItem("isAdminLoggedIn", "true");
    window.location.href = "admin-home.html";
  } else {
    showError("username หรือ password ไม่ถูกต้อง");
  }
}


// ===== ส่วนที่ 3 — แสดง error ใต้ฟอร์ม =====
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
    form.appendChild(errorEl);
  }

  errorEl.textContent = message;
}


// ===== ส่วนที่ 4 — guard ป้องกันเข้าหน้า admin โดยไม่ login =====
// เรียกที่หน้า admin ทุกหน้า ยกเว้นหน้า login
function requireLogin() {
  if (sessionStorage.getItem("isAdminLoggedIn") !== "true") {
    window.location.href = "index.html";
  }
}


// ===== ส่วนที่ 5 — logout =====
function logout() {
  sessionStorage.removeItem("isAdminLoggedIn");
  window.location.href = "index.html";
}


// ===== ส่วนที่ 6 — ย้อนกลับไปหน้า home =====
function handleBack() {
  window.location.href = "admin-home.html";
}


// ===================================================
// ส่วนที่ 7 — Edit Menu (แก้ไขเมนู)
// ===================================================

const STORAGE_KEY = "lao_oi_toi_menu";

/* ----- 7a. เปิด/ปิดฟอร์มเพิ่มเมนู ----- */
function openAddForm() {
  const emptyState = document.querySelector(".empty-state");
  const addForm = document.querySelector(".add-form-wrap");
  const menuList = document.getElementById("menu-list");

  if (!addForm) return;
  addForm.style.display = "flex";
  if (emptyState) emptyState.style.display = "none";
  if (menuList) menuList.style.display = "none";
}

function closeAddForm() {
  const emptyState = document.querySelector(".empty-state");
  const addForm = document.querySelector(".add-form-wrap");

  if (!addForm) return;
  addForm.style.display = "none";
  resetForm();

  // กลับไปแสดง list หรือ empty state ตามจำนวนเมนู
  const items = getMenuItems();
  if (items.length === 0) {
    if (emptyState) emptyState.style.display = "flex";
  } else {
    updateMenuUI();
  }
}


/* ----- 7b. Reset ฟอร์ม ----- */
function resetForm() {
  document.getElementById("menu-name").value = "";
  document.getElementById("menu-price").value = "";
  document.getElementById("options-heading").value = "ตัวเลือกเพิ่มเติม";
  // Reset image
  removeImage();
  // ลบ option ทั้งหมดยกเว้น 2 แถวแรก
  const container = document.getElementById("options-container");
  while (container.children.length > 2) {
    container.removeChild(container.lastChild);
  }
  // Reset ค่าใน 2 แถวแรก
  const rows = container.querySelectorAll(".option-row");
  if (rows[0]) {
    rows[0].querySelector(".option-name").value = "เพิ่มไข่";
    rows[0].querySelector(".option-price").value = "10";
  }
  if (rows[1]) {
    rows[1].querySelector(".option-name").value = "เพิ่มชีส";
    rows[1].querySelector(".option-price").value = "20";
  }
}


/* ----- 7c. จัดการรูปภาพ ----- */
let currentImageData = null; // base64 string หรือ null

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    currentImageData = e.target.result;
    showImagePreview(currentImageData);
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


/* ----- 7d. เพิ่มตัวเลือก (option) ----- */
function addOptionRow() {
  const container = document.getElementById("options-container");
  const row = document.createElement("div");
  row.className = "option-row";
  row.innerHTML = `
    <input class="option-name" type="text" placeholder="เช่น เพิ่มเบคอน">
    <div class="option-price-wrap">
      <span class="currency">฿</span>
      <input class="option-price" type="number" placeholder="0" min="0">
    </div>
    <button class="option-remove" onclick="removeOptionRow(this)" type="button">✕</button>
  `;
  container.appendChild(row);
}


/* ----- 7e. ลบตัวเลือก (option) ----- */
function removeOptionRow(btn) {
  const row = btn.closest(".option-row");
  if (row) row.remove();
}


/* ----- 7f. แสดง/ซ่อน empty state / form / list ตามสถานะ ----- */
function updateMenuUI() {
  const menuList = document.getElementById("menu-list");
  const emptyState = document.querySelector(".empty-state");
  const addForm = document.querySelector(".add-form-wrap");
  const items = getMenuItems();

  // ถ้าเปิดฟอร์มอยู่ ไม่ต้องยุ่ง
  if (addForm && addForm.style.display === "flex") return;

  if (!menuList) return;

  renderMenuList();

  const listItems = menuList.querySelectorAll(".menu-card");

  if (emptyState) emptyState.style.display = listItems.length === 0 ? "flex" : "none";
  menuList.style.display = listItems.length > 0 ? "flex" : "none";
}


/* ----- 7g. อ่านเมนูทั้งหมดจาก localStorage ----- */
function getMenuItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}


/* ----- 7h. บันทึกเมนู ----- */
function saveMenu() {
  const name = document.getElementById("menu-name").value.trim();
  const price = document.getElementById("menu-price").value.trim();

  if (!name) {
    alert("กรุณากรอกชื่อเมนู");
    return;
  }
  if (!price || parseFloat(price) <= 0) {
    alert("กรุณากรอกราคา");
    return;
  }

  // เก็บ options heading
  const optionsHeading = document.getElementById("options-heading").value.trim() || "ตัวเลือกเพิ่มเติม";

  // เก็บ options
  const optionRows = document.querySelectorAll("#options-container .option-row");
  const options = [];
  optionRows.forEach((row) => {
    const optName = row.querySelector(".option-name").value.trim();
    const optPrice = row.querySelector(".option-price").value.trim();
    if (optName && optPrice) {
      options.push({ name: optName, price: parseFloat(optPrice) });
    }
  });

  const items = getMenuItems();
  items.push({
    id: Date.now(),
    name: name,
    price: parseFloat(price),
    image: currentImageData,
    optionsHeading: optionsHeading,
    options: options,
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));

  alert("บันทึกเมนูเรียบร้อย!");
  resetForm();
  closeAddForm();
}


/* ----- 7i. ลบเมนู ----- */
function deleteMenu(id) {
  if (!confirm("ลบเมนูนี้ใช่ไหม?")) return;
  let items = getMenuItems();
  items = items.filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  updateMenuUI();
}


/* ----- 7j. แสดงรายการเมนู ----- */
function renderMenuList() {
  const container = document.getElementById("menu-list-items");
  if (!container) return;

  const items = getMenuItems();
  container.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-card";

    let imageHtml = "";
    if (item.image) {
      imageHtml = `<img class="menu-card-img" src="${item.image}" alt="${item.name}">`;
    }

    let optionsHtml = "";
    if (item.options && item.options.length > 0) {
      if (item.optionsHeading) {
        optionsHtml += `<div class="menu-opt-heading">${item.optionsHeading}</div>`;
      }
      optionsHtml += `<div class="menu-opt-badges">`;
      item.options.forEach((o) => {
        optionsHtml += `<span class="menu-opt-badge">${o.name} +฿${o.price}</span>`;
      });
      optionsHtml += `</div>`;
    }

    card.innerHTML = `
      <div class="menu-card-inner">
        ${imageHtml ? `<div class="menu-card-img-wrap">${imageHtml}</div>` : ""}
        <div class="menu-card-content">
          <div class="menu-card-info">
            <span class="menu-card-name">${item.name}</span>
            <span class="menu-card-price">฿${item.price}</span>
          </div>
          <div class="menu-card-options">${optionsHtml}</div>
        </div>
      </div>
      <div class="menu-card-actions">
        <button class="menu-btn-dlt" onclick="deleteMenu(${item.id})">ลบ</button>
      </div>
    `;
    container.appendChild(card);
  });
}


/* ===== Init เมื่อโหลดหน้า edit menu ===== */
document.addEventListener("DOMContentLoaded", function () {
  // เฉพาะหน้า edit-menu
  if (!document.querySelector(".edit-menu-wrap")) return;

  // เปิดฟอร์มตอนกด empty state หรือกดปุ่ม "เพิ่มเมนู" ใน list
  const emptyState = document.querySelector(".empty-state");
  if (emptyState) {
    emptyState.onclick = openAddForm;
  }
  const addBtnList = document.getElementById("btn-add-menu-list");
  if (addBtnList) {
    addBtnList.onclick = openAddForm;
  }

  // ปุ่มยกเลิก
  const btnCancel = document.querySelector(".btn-cancel");
  if (btnCancel) {
    btnCancel.onclick = closeAddForm;
  }

  // ปุ่มบันทึก
  const btnSave = document.querySelector(".btn-save");
  if (btnSave) {
    btnSave.onclick = saveMenu;
  }

  // ปุ่ม + เพิ่มตัวเลือก
  const btnAddOption = document.querySelector(".btn-add-option");
  if (btnAddOption) {
    btnAddOption.onclick = addOptionRow;
  }

  // เริ่มต้น: form ซ่อน, list แสดง ถ้ามีเมนู
  const addForm = document.querySelector(".add-form-wrap");
  if (addForm) addForm.style.display = "none";

  updateMenuUI();
});