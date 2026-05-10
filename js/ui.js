/* ============================================================
   ui.js
   Utilidades de interfaz reutilizables: cierre de menús al clicar
   fuera, mensajes "toast" no bloqueantes y escape de HTML.
   ============================================================ */

let _outsideRegistered = false;

/* Registra una sola vez un listener global que cierra cualquier
   menú abierto (.menu-host.is-open) cuando se clica fuera de él. */
export function registerOutsideClickToCloseMenus() {
  if (_outsideRegistered) return;
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".menu-host.is-open").forEach((host) => {
      if (!host.contains(e.target)) host.classList.remove("is-open");
    });
  });
  _outsideRegistered = true;
}

/* Cableado de un menú "...":
   - btn dentro del host abre/cierra
   - se cierran los demás menús abiertos al abrir este
   - los clics dentro del popover NO cierran el menú */
export function bindMenu(hostEl) {
  const btn = hostEl.querySelector("[data-menu-trigger]");
  const popover = hostEl.querySelector(".menu-popover");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".menu-host.is-open").forEach((m) => {
      if (m !== hostEl) m.classList.remove("is-open");
    });
    hostEl.classList.toggle("is-open");
  });
  if (popover) {
    popover.addEventListener("click", (e) => e.stopPropagation());
  }
}

/* Toast efímero (3s). kind ∈ "info" | "success" | "danger". */
export function toast(text, kind = "info") {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = `toast toast--${kind}`;
  t.textContent = text;
  host.appendChild(t);
  // forzar reflow para que aplique la transición
  void t.offsetWidth;
  t.classList.add("is-visible");
  setTimeout(() => {
    t.classList.remove("is-visible");
    setTimeout(() => t.remove(), 220);
  }, 3000);
}

/* Escape básico de HTML para incrustar texto del usuario en plantillas
   tipo template-string que insertamos vía innerHTML. */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Modal genérico. Devuelve una Promise que resuelve con el id de la
   acción elegida.
     ui.modal({
       title: "...",
       body: "<p>html</p>",          // ya escapado por el llamante
       actions: [
         { id: "fix", label: "No",  kind: "btn--danger-text" },
         { id: "ok",  label: "Sí", kind: "btn--primary" },
       ],
     })
   No se puede cerrar haciendo clic en el fondo: obliga a elegir una acción. */
export function modal({ title, body, actions }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const card = document.createElement("div");
    card.className = "modal-card";

    const actionsHtml = (actions || []).map((a, i) =>
      `<button class="btn ${a.kind || "btn--ghost"}" data-modal-action="${i}" type="button">${escapeHtml(a.label)}</button>`
    ).join("");

    card.innerHTML = `
      ${title ? `<h3 class="modal-title">${escapeHtml(title)}</h3>` : ""}
      ${body ? `<div class="modal-body">${body}</div>` : ""}
      <div class="modal-actions">${actionsHtml}</div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    void overlay.offsetWidth; // forzar reflow para la transición
    overlay.classList.add("is-visible");

    card.querySelectorAll("[data-modal-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-modal-action"), 10);
        const a = actions[idx];
        const result = a && a.id !== undefined ? a.id : idx;
        overlay.classList.remove("is-visible");
        setTimeout(() => overlay.remove(), 150);
        resolve(result);
      });
    });
  });
}

/* ============================================================
   Slot izquierdo de la cabecera de la app (#header-left-slot).
   Lo usan test.js y validation.js para colocar el botón
   "Salir del test" / "Salir de la validación" en la barra de arriba.
   Las vistas regulares llaman a clearHeaderLeft.
   ============================================================ */
export function clearHeaderLeft() {
  const slot = document.getElementById("header-left-slot");
  if (slot) slot.innerHTML = "";
}

export function setHeaderLeftButton(label, onClick) {
  const slot = document.getElementById("header-left-slot");
  if (!slot) return;
  slot.innerHTML = `<button class="back-link back-link--header" type="button">← ${escapeHtml(label)}</button>`;
  const btn = slot.querySelector("button");
  if (btn && onClick) btn.addEventListener("click", onClick);
}

/* Lee un File del input como texto (Promise). */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Error de lectura"));
    reader.readAsText(file);
  });
}
