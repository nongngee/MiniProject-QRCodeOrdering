// ===================================================
// script.js — สคริปต์หน้าหลักเลือกบทบาท (Portal)
// ===================================================

const ADMIN_USER = "admin";
const ADMIN_PASS = "123";

// เปิด Modal เข้าสู่ระบบแอดมิน
function openAdminLoginModal() {
  const modal = document.getElementById("admin-login-modal");
  const errEl = document.getElementById("login-error-alert");
  if (errEl) errEl.style.display = "none";
  if (modal) {
    modal.classList.add("active");
    setTimeout(() => {
      const userField = document.getElementById("admin-user");
      if (userField) userField.focus();
    }, 150);
  }
}

// ปิด Modal เข้าสู่ระบบแอดมิน
function closeAdminLoginModal() {
  const modal = document.getElementById("admin-login-modal");
  if (modal) modal.classList.remove("active");
}

// คลิกพื้นที่ด้านนอกเพื่อปิด Modal
function handleBackdropClick(e) {
  if (e.target.id === "admin-login-modal") {
    closeAdminLoginModal();
  }
}

// ตรวจสอบชื่อผู้ใช้และรหัสผ่านแอดมิน
function verifyAdminLogin(e) {
  e.preventDefault();
  const user = document.getElementById("admin-user").value.trim();
  const pass = document.getElementById("admin-pass").value;
  const errEl = document.getElementById("login-error-alert");
  const errText = document.getElementById("login-error-text");

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    // บันทึกสถานะการล็อกอิน
    sessionStorage.setItem("isAdminLoggedIn", "true");
    localStorage.setItem("isAdminLoggedIn", "true");

    try {
      const req = indexedDB.open("LaoOiToiDB", 1);
      req.onsuccess = (ev) => {
        const db = ev.target.result;
        if (db.objectStoreNames.contains("app_store")) {
          const tx = db.transaction("app_store", "readwrite");
          tx.objectStore("app_store").put(true, "isAdminLoggedIn");
        }
      };
    } catch (err) {}

    // ไปยังหน้าหลักของแอดมิน (admin-webpage/index.html)
    window.location.href = "admin-webpage/index.html";
  } else {
    if (errEl) {
      errText.textContent = "ชื่อผู้ใช้ หรือ รหัสผ่านไม่ถูกต้อง";
      errEl.style.display = "flex";
    }
  }
}

// กดปุ่ม Esc เพื่อปิด Modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAdminLoginModal();
  }
});
