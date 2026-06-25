// ===================================================
// admin.js — ลาวอ้องท้อง | Admin logic
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