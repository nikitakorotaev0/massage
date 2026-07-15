// =====================================
// UI-уведомления сайта: тосты и модальное подтверждение
// вместо системных alert() / confirm()
// =====================================


function ensureToastContainer(){

  let container = document.getElementById("toastContainer");

  if(!container){
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  return container;
}


// type: "success" | "error" | "info"
function showToast(message, type){

  const finalType = type || "info";

  const container = ensureToastContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${finalType}`;
  toast.textContent = message;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast-visible");
  });

  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}


function showConfirm(message){

  return new Promise((resolve) => {

    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    overlay.innerHTML = `
      <div class="confirm-box">
        <p class="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="btn confirm-cancel">Отмена</button>
          <button type="button" class="btn btn-danger confirm-ok">Подтвердить</button>
        </div>
      </div>
    `;

    overlay.querySelector(".confirm-message").textContent = message;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add("confirm-visible");
    });

    function close(result){
      overlay.classList.remove("confirm-visible");
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }

    overlay.querySelector(".confirm-ok").addEventListener("click", () => close(true));
    overlay.querySelector(".confirm-cancel").addEventListener("click", () => close(false));
    overlay.addEventListener("click", (e) => {
      if(e.target === overlay){
        close(false);
      }
    });
  });
}
