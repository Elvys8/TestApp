/* ============================================================
   theme.js
   Gestión del modo claro/oscuro.
   El valor inicial lo aplica un script inline en index.html ANTES
   de que se ejecute este módulo, para evitar el "flash" visual al
   cargar. Aquí solo cableamos el botón y centralizamos el set/get.
   ============================================================ */

import * as storage from "./storage.js";

export function getCurrent() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

export function set(theme) {
  if (theme !== "light" && theme !== "dark") return;
  document.documentElement.setAttribute("data-theme", theme);
  storage.setTheme(theme);
}

export function toggle() {
  set(getCurrent() === "dark" ? "light" : "dark");
}

/* Conecta el botón de la cabecera con el toggle. */
export function init() {
  const btn = document.querySelector(".theme-toggle");
  if (btn) btn.addEventListener("click", toggle);
}
