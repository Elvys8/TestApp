/* ============================================================
   app.js
   Punto de entrada y orquestación.
   - Inicializa tema, biblioteca y listeners globales.
   - Hash router minimalista:
       #/                       → pantalla de inicio (asignaturas)
       #/asignatura/<nombre>    → detalle de asignatura
   - Renderiza Home y Detalle de asignatura, y cablea sus eventos.
   La pantalla del test la añadiremos en la siguiente tarea.
   ============================================================ */

import * as library from "./library.js";
import * as storage from "./storage.js";
import * as theme from "./theme.js";
import * as ui from "./ui.js";
import * as test from "./test.js";
import * as stats from "./stats.js";
import * as validation from "./validation.js";

const ROOT = document.getElementById("app");

const PALETTE = [
  { name: "Burdeos",         hex: "#8D211E" },
  { name: "Verde bosque",    hex: "#356A3A" },
  { name: "Azul marino",     hex: "#1C3C6F" },
  { name: "Dorado",          hex: "#AA8114" },
  { name: "Púrpura ciruela", hex: "#66266D" },
  { name: "Terracota",       hex: "#B34618" },
  { name: "Antracita",       hex: "#333333" },
];

/* ============================================================
   Bootstrap
   ============================================================ */
async function start() {
  theme.init();
  applyFontSizes();
  ui.registerOutsideClickToCloseMenus();
  setupDataMenu();
  await library.init();
  renderRoute();
  window.addEventListener("hashchange", renderRoute);
}

/* Cablea el menú de importar/exportar de la cabecera.
   Se llama una sola vez al arrancar; el menú vive en el HTML estático. */
function setupDataMenu() {
  const host = document.getElementById("data-menu-host");
  if (!host) return;
  ui.bindMenu(host);

  // Input de fichero oculto, creado dinámicamente y añadido al body
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".json,application/json";
  importInput.style.display = "none";
  document.body.appendChild(importInput);

  host.querySelector("#header-export-btn").addEventListener("click", () => {
    host.classList.remove("is-open");
    exportProgress();
  });

  host.querySelector("#header-import-btn").addEventListener("click", () => {
    host.classList.remove("is-open");
    importInput.click();
  });

  importInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) await importProgress(file);
  });
}

/* Aplica los tamaños de fuente guardados como variables CSS en :root. */
function applyFontSizes() {
  const base = storage.getFontSize();
  const wide = storage.getFontSizeWide();
  document.documentElement.style.setProperty("--font-size-base", `${base}px`);
  document.documentElement.style.setProperty("--font-size-wide", `${wide}px`);
}

function renderRoute() {
  const hash = window.location.hash || "#/";
  if (hash === "#/stats") {
    renderStats();
    return;
  }
  if (hash === "#/settings") {
    renderSettings();
    return;
  }
  const m = hash.match(/^#\/asignatura\/(.+)$/);
  if (m) {
    renderAsignatura(decodeURIComponent(m[1]));
    return;
  }
  renderHome();
}

/* ============================================================
   Color de acento dinámico
   Establece --asignatura-color y --asignatura-rgb en :root para
   que themes.css recalcule el resto de variables.
   ============================================================ */
function applyAccent(hex) {
  if (!hex) return;
  document.documentElement.style.setProperty("--asignatura-color", hex);
  const rgb = hexToRgb(hex);
  if (rgb) {
    document.documentElement.style.setProperty(
      "--asignatura-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`
    );
  }
}

function clearAccent() {
  document.documentElement.style.removeProperty("--asignatura-color");
  document.documentElement.style.removeProperty("--asignatura-rgb");
}

function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

/* ============================================================
   HOME — listado de asignaturas
   ============================================================ */
function renderHome() {
  ui.clearHeaderLeft();
  document.body.removeAttribute("data-tinted");
  clearAccent();

  const asignaturas = library.getAsignaturas();
  ROOT.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Asignaturas</h2>
      <div class="page-actions">
        <input type="file" id="upload-input" accept=".json,application/json" style="display:none">
        <button class="btn btn--ghost" id="upload-btn" type="button">+ Cargar JSON</button>
      </div>
    </div>
    ${asignaturas.length === 0 ? renderEmptyHome() : renderAsignaturaList(asignaturas)}
  `;
  attachHomeHandlers();
}

function renderEmptyHome() {
  return `
    <div class="empty-state">
      <p>Todavía no hay asignaturas cargadas.</p>
      <p class="tiny">Coloca tus JSON en la carpeta <code>preguntas/</code> y añádelos a <code>manifest.json</code>, o usa el botón <strong>Cargar JSON</strong> para subir uno desde aquí.</p>
    </div>
  `;
}

function renderAsignaturaList(asignaturas) {
  const items = asignaturas.map((a) => `
    <li class="subject-row" style="--subject-color: ${ui.escapeHtml(a.color)};">
      <button class="subject-row__info" type="button" data-go-asignatura="${ui.escapeHtml(a.name)}">
        <p class="subject-row__name">
          ${ui.escapeHtml(a.name)}
        </p>
        <p class="subject-row__meta">
          ${a.temaCount} ${a.temaCount === 1 ? "tema" : "temas"} ·
          ${a.questionCount} preguntas · ${a.masteredCount} dominadas
        </p>
      </button>
      <div class="menu-host" data-menu-for="${ui.escapeHtml(a.name)}">
        <button class="icon-btn" type="button" data-menu-trigger aria-label="Opciones de asignatura">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18">
            <circle cx="5" cy="12" r="1.6"/>
            <circle cx="12" cy="12" r="1.6"/>
            <circle cx="19" cy="12" r="1.6"/>
          </svg>
        </button>
        <div class="menu-popover">
          ${renderColorPalette(a.color)}
          <div class="menu-popover__divider"></div>
          <button class="menu-popover__action menu-popover__action--danger"
                  type="button" data-action="reset-mastery">
            ↺ Reiniciar preguntas dominadas
          </button>
        </div>
      </div>
    </li>
  `).join("");
  return `<ul class="subject-list">${items}</ul>`;
}

function renderColorPalette(currentHex) {
  const cur = (currentHex || "").toLowerCase();
  const swatches = PALETTE.map((p) => {
    const active = p.hex.toLowerCase() === cur ? "is-active" : "";
    return `
      <button class="color-swatch ${active}" type="button"
              style="background:${p.hex}; color:${p.hex};"
              data-color="${p.hex}" aria-label="${p.name}" title="${p.name}"></button>
    `;
  }).join("");
  return `
    <p class="menu-popover__label">Color de acento</p>
    <div class="color-palette">
      ${swatches}
      <button class="color-swatch color-swatch--custom" type="button"
              data-action="custom-color" aria-label="Color personalizado" title="Color personalizado">+</button>
    </div>
  `;
}

function attachHomeHandlers() {
  // Click en la asignatura → navegar al detalle
  ROOT.querySelectorAll("[data-go-asignatura]").forEach((el) => {
    el.addEventListener("click", () => {
      const name = el.getAttribute("data-go-asignatura");
      window.location.hash = "#/asignatura/" + encodeURIComponent(name);
    });
  });

  // Menús "..."
  ROOT.querySelectorAll(".menu-host").forEach((host) => {
    ui.bindMenu(host);
    const name = host.getAttribute("data-menu-for");

    // Cambio de color desde la paleta
    host.querySelectorAll(".color-swatch[data-color]").forEach((sw) => {
      sw.addEventListener("click", () => {
        const hex = sw.getAttribute("data-color");
        storage.setAsignaturaColor(name, hex);
        ui.toast(`Color de "${name}" actualizado`, "success");
        renderRoute();
      });
    });

    // Color personalizado
    const customBtn = host.querySelector('[data-action="custom-color"]');
    if (customBtn) {
      customBtn.addEventListener("click", () => {
        const cur = library.resolveAsignaturaColor(name) || "#000000";
        const input = window.prompt("Color en formato hex (#RRGGBB):", cur);
        if (input === null) return;
        if (/^#[0-9a-fA-F]{6}$/.test(input)) {
          storage.setAsignaturaColor(name, input);
          ui.toast(`Color de "${name}" actualizado`, "success");
          renderRoute();
        } else {
          ui.toast("Color inválido. Debe ser #RRGGBB.", "danger");
        }
      });
    }

    // Reiniciar dominadas (asignatura completa)
    const resetBtn = host.querySelector('[data-action="reset-mastery"]');
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const a = library.getAsignatura(name);
        if (!a) return;
        const ids = a.temas.flatMap((t) => library.getTema(t.id).preguntas.map((q) => q.id));
        const mastered = storage.countMastered(ids);
        if (mastered === 0) {
          ui.toast("No hay preguntas dominadas para reiniciar.", "info");
          return;
        }
        const yes = window.confirm(
          `¿Reiniciar las ${mastered} preguntas dominadas de "${name}"?\n` +
          `Volverán a aparecer en las próximas sesiones. El histórico de aciertos/fallos se mantiene.`
        );
        if (!yes) return;
        storage.resetMasteryFor(ids);
        ui.toast(`Preguntas reiniciadas en "${name}"`, "success");
        renderRoute();
      });
    }
  });

  // Subir JSON
  const uploadBtn = ROOT.querySelector("#upload-btn");
  const uploadInput = ROOT.querySelector("#upload-input");
  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener("click", () => uploadInput.click());
    uploadInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await ui.readFileAsText(file);
        const result = library.addCustomFile(text);
        if (result.ok) {
          ui.toast(`Cargado: ${result.fileObject.tema}`, "success");
          renderRoute();
        } else {
          ui.toast("Error: " + result.errors.join(" · "), "danger");
        }
      } catch (err) {
        ui.toast("No se pudo leer el archivo.", "danger");
      } finally {
        e.target.value = ""; // permite re-subir el mismo archivo
      }
    });
  }
}

/* ============================================================
   DETALLE DE ASIGNATURA — temas y configuración del test
   ============================================================ */
function renderAsignatura(name) {
  ui.clearHeaderLeft();
  const a = library.getAsignatura(name);
  if (!a) {
    document.body.removeAttribute("data-tinted");
    clearAccent();
    ROOT.innerHTML = `
      <div class="empty-state">
        <p>No se encontró la asignatura "${ui.escapeHtml(name)}".</p>
      </div>
    `;
    return;
  }

  applyAccent(a.color);
  document.body.setAttribute("data-tinted", "true");

  const totalQuestions = a.temas.reduce((s, t) => s + t.questionCount, 0);
  const totalMastered  = a.temas.reduce((s, t) => s + t.masteredCount, 0);

  ROOT.innerHTML = `
    <h2 class="asignatura-name">${ui.escapeHtml(a.name)}</h2>
    <p class="asignatura-sub">
      ${a.temas.length} ${a.temas.length === 1 ? "tema" : "temas"} ·
      ${totalQuestions} preguntas · ${totalMastered} dominadas
    </p>

    <div class="panel">
      <p class="panel__title">Iniciar nuevo test</p>

      <div class="panel__field">
        <label class="panel__label">Tamaño de la sesión</label>
        <div class="choice-group" id="size-group">
          <button class="choice-chip" type="button" data-size="10">10</button>
          <button class="choice-chip" type="button" data-size="20">20</button>
          <button class="choice-chip" type="button" data-size="50">50</button>
          <button class="choice-chip is-active" type="button" data-size="all">Todas</button>
        </div>
      </div>

      <div class="panel__field">
        <label class="panel__label">Filtros</label>
        <label class="checkbox-row">
          <input type="checkbox" id="only-failed"> Solo las que llevo falladas
        </label>
        <label class="checkbox-row">
          <input type="checkbox" id="only-starred"> Solo las marcadas para revisar
        </label>
      </div>

      <div class="panel__field">
        <label class="panel__label">Temas a incluir</label>
        ${a.temas.map((t) => `
          <label class="checkbox-row">
            <input type="checkbox" class="tema-include" value="${ui.escapeHtml(t.id)}" checked>
            ${ui.escapeHtml(t.tema)}
          </label>
        `).join("")}
      </div>

      <div style="display:flex; justify-content:flex-end;">
        <button class="btn btn--primary" id="start-test" type="button">Empezar test →</button>
      </div>
    </div>

    <p class="panel__title" style="margin: 24px 0 10px;">Temas</p>
    <ul class="tema-list">
      ${a.temas.map((t) => `
        <li class="tema-row">
          <div class="tema-row__info">
            <p class="tema-row__name">${ui.escapeHtml(t.tema)}</p>
            <p class="tema-row__meta">
              ${t.questionCount} preguntas · ${t.masteredCount} dominadas
            </p>
          </div>
          <div class="menu-host" data-menu-for-tema="${ui.escapeHtml(t.id)}">
            <button class="icon-btn" type="button" data-menu-trigger aria-label="Opciones del tema">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="18" height="18">
                <circle cx="5" cy="12" r="1.6"/>
                <circle cx="12" cy="12" r="1.6"/>
                <circle cx="19" cy="12" r="1.6"/>
              </svg>
            </button>
            <div class="menu-popover">
              <button class="menu-popover__action" type="button" data-action="validate-manual">
                ✓ Validar manualmente
              </button>
              <div class="menu-popover__divider"></div>
              <button class="menu-popover__action menu-popover__action--danger" type="button" data-action="reset-mastery">
                ↺ Reiniciar preguntas dominadas
              </button>
            </div>
          </div>
        </li>
      `).join("")}
    </ul>
  `;

  attachAsignaturaHandlers();
}

function attachAsignaturaHandlers() {
  // Chips de tamaño
  const sizeGroup = ROOT.querySelector("#size-group");
  if (sizeGroup) {
    sizeGroup.querySelectorAll(".choice-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        sizeGroup.querySelectorAll(".choice-chip").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
      });
    });
  }

  // Botón empezar test
  const startBtn = ROOT.querySelector("#start-test");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const asigName = ROOT.querySelector(".asignatura-name")?.textContent?.trim();
      if (!asigName) return;
      const config = collectTestConfig(asigName);
      if (!config) return; // hubo error, ya se notificó
      startTest(config);
    });
  }

  // Menús "..." de cada tema
  ROOT.querySelectorAll(".menu-host[data-menu-for-tema]").forEach((host) => {
    ui.bindMenu(host);
    const fileId = host.getAttribute("data-menu-for-tema");

    // Validar manualmente (sesión completa pregunta a pregunta).
    // Si hay marcas o ediciones previas, pide confirmación antes de
    // resetear el estado para empezar desde la primera pregunta.
    const validateManualBtn = host.querySelector('[data-action="validate-manual"]');
    if (validateManualBtn) {
      validateManualBtn.addEventListener("click", () => {
        const file = library.getTema(fileId);
        if (!file) return;
        const v = storage.getValidationState(fileId);
        const wip = storage.getValidationWip(fileId);
        const hasData =
          Object.keys(v.validatedQuestions || {}).length > 0 ||
          Object.keys(wip.edits || {}).length > 0;
        if (hasData) {
          const yes = window.confirm(
            `¿Validar de nuevo "${file.tema}"?\n` +
            `Se borran las marcas y ediciones previas y empiezas desde la primera pregunta.`
          );
          if (!yes) return;
          storage.resetValidationFor(fileId);
          storage.clearValidationWip(fileId);
        }
        startValidation(fileId, file.asignatura);
      });
    }

    // Reiniciar preguntas dominadas (por tema)
    const resetBtn = host.querySelector('[data-action="reset-mastery"]');
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        const file = library.getTema(fileId);
        if (!file) return;
        const ids = file.preguntas.map((q) => q.id);
        const mastered = storage.countMastered(ids);
        if (mastered === 0) {
          ui.toast("No hay preguntas dominadas en este tema.", "info");
          return;
        }
        const yes = window.confirm(
          `¿Reiniciar las ${mastered} preguntas dominadas de "${file.tema}"?`
        );
        if (!yes) return;
        storage.resetMasteryFor(ids);
        ui.toast("Tema reiniciado", "success");
        renderRoute();
      });
    }
  });
}

/* ============================================================
   ESTADÍSTICAS
   ============================================================ */
function renderStats() {
  ui.clearHeaderLeft();
  document.body.removeAttribute("data-tinted");
  clearAccent();

  const overall = stats.getOverall();
  const byAsig = stats.getByAsignatura();
  const topFailed = stats.getTopFailed(8);

  if (overall.totalQuestions === 0) {
    ROOT.innerHTML = `
      <h2 class="page-title">Estadísticas</h2>
      <div class="empty-state">
        <p>Todavía no hay nada que mostrar. Carga preguntas y haz un test para que aparezcan datos aquí.</p>
      </div>
    `;
    return;
  }

  const overallPct = overall.accuracy === null ? "—" : overall.accuracy + "%";
  const answeredTotal = overall.totalCorrect + overall.totalWrong;

  const overallHtml = `
    <div class="panel stat-overall">
      <p class="stat-overall__pct">${overallPct}</p>
      <div>
        <p class="stat-overall__meta" style="margin: 0 0 2px; color: var(--text-primary); font-size: 14px;">
          Acierto global
        </p>
        <p class="stat-overall__meta">
          ${overall.totalCorrect} aciertos · ${overall.totalWrong} fallos · ${answeredTotal} respuestas registradas
        </p>
        <p class="stat-overall__meta">
          ${overall.totalMastered} de ${overall.totalQuestions} preguntas dominadas
        </p>
      </div>
    </div>
  `;

  const byAsigHtml = byAsig.map((a) => `
    <div class="stat-asignatura" style="--asignatura-accent: ${ui.escapeHtml(a.color)};">
      <div class="stat-asignatura__head">
        <p class="stat-asignatura__name">${ui.escapeHtml(a.name)}</p>
        <span class="stat-asignatura__pct">${a.accuracy === null ? "—" : a.accuracy + "%"}</span>
      </div>
      <p class="stat-asignatura__meta">
        ${a.temas.length} ${a.temas.length === 1 ? "tema" : "temas"} ·
        ${a.totalQuestions} preguntas ·
        ${a.masteredCount} dominadas ·
        ${a.totalCorrect + a.totalWrong} respuestas
      </p>
      <div class="stat-tema-list">
        ${a.temas.map((t) => `
          <div class="stat-tema-row">
            <div class="stat-tema-row__info">
              <span class="stat-tema-row__name">${ui.escapeHtml(t.tema)}</span>
              <span class="stat-tema-row__pct">${t.accuracy === null ? "—" : t.accuracy + "%"}</span>
              <span class="stat-tema-row__meta">${t.masteredCount}/${t.questionCount} dominadas</span>
            </div>
            <button class="icon-btn icon-btn--tiny" type="button"
                    data-reset-tema-stats="${ui.escapeHtml(t.id)}"
                    aria-label="Reiniciar estadísticas del tema"
                    title="Reiniciar estadísticas (acierto, fallos, dominadas) de este tema">↺</button>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  const topFailedHtml = topFailed.length === 0
    ? `<div class="empty-state"><p>No hay preguntas con fallos registrados todavía.</p></div>`
    : `
      <div class="top-failed-list">
        ${topFailed.map((q, i) => `
          <button class="top-failed-row" type="button" data-failed-idx="${i}"
                  style="border-left: 3px solid ${ui.escapeHtml(q.color)};">
            <div class="top-failed-row__text">
              <p class="top-failed-row__q">${ui.escapeHtml(q.enunciado)}</p>
              <p class="top-failed-row__ctx">${ui.escapeHtml(q.asignatura)} · ${ui.escapeHtml(q.tema)}</p>
            </div>
            <div class="top-failed-row__count">
              ${q.totalWrong}<small>fallos</small>
            </div>
          </button>
        `).join("")}
      </div>
    `;

  ROOT.innerHTML = `
    <h2 class="page-title">Estadísticas</h2>

    ${overallHtml}

    <p class="stats-section-title">Por asignatura</p>
    ${byAsigHtml}

    <div class="stats-section-header">
      <p class="stats-section-title" style="margin: 0;">Preguntas más falladas</p>
      ${topFailed.length > 0
        ? '<button class="btn btn--ghost btn--small" id="reset-failed-btn" type="button">Reiniciar</button>'
        : ""}
    </div>
    ${topFailedHtml}

  `;

  attachStatsHandlers(topFailed);
}

function attachStatsHandlers(topFailed) {
  // Reiniciar estadísticas por tema (% acierto + dominadas)
  ROOT.querySelectorAll("[data-reset-tema-stats]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fileId = btn.getAttribute("data-reset-tema-stats");
      const file = library.getTema(fileId);
      if (!file) return;
      const ids = file.preguntas.map((q) => q.id);
      const yes = window.confirm(
        `¿Reiniciar las estadísticas de "${file.tema}"?\n` +
        `Se borran aciertos, fallos y rachas de las ${ids.length} preguntas. ` +
        `La validación y las marcas para revisar se mantienen.`
      );
      if (!yes) return;
      storage.clearProgressFor(ids);
      ui.toast("Estadísticas reiniciadas", "success");
      renderRoute();
    });
  });

  // Clic en una pregunta más fallada → vista previa en modal
  ROOT.querySelectorAll("[data-failed-idx]").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = parseInt(row.getAttribute("data-failed-idx"), 10);
      const q = topFailed && topFailed[idx];
      if (q) showQuestionPreview(q);
    });
  });

  // Reiniciar contadores de fallos (no toca aciertos ni rachas)
  const resetFailedBtn = ROOT.querySelector("#reset-failed-btn");
  if (resetFailedBtn) {
    resetFailedBtn.addEventListener("click", () => {
      const yes = window.confirm(
        "¿Poner a cero los contadores de fallos de todas las preguntas?\n" +
        "Solo se borran los fallos; los aciertos, las rachas y las preguntas dominadas se mantienen."
      );
      if (!yes) return;
      storage.resetAllWrongCounts();
      ui.toast("Contadores de fallos reiniciados", "success");
      renderRoute();
    });
  }
}

/* ============================================================
   VISTA PREVIA DE UNA PREGUNTA (modal)
   Permite responder una pregunta como en un test, pero sin
   registrar nada en el progreso. Se usa desde "Preguntas más
   falladas" en la pantalla de estadísticas.
   ============================================================ */
function showQuestionPreview(q) {
  // Orden aleatorio de las opciones, como en un test real.
  const order = q.opciones.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const hasExpl = q.explicacion && q.explicacion.trim();

  const optionsHtml = order
    .map((origIdx) => `
      <button class="option" type="button" data-opt-idx="${origIdx}">
        ${ui.escapeHtml(q.opciones[origIdx])}
      </button>
    `)
    .join("");

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card modal-card--wide">
      <p class="muted tiny" style="text-transform: uppercase; letter-spacing: 0.4px; margin: 0 0 8px;">
        Vista previa · no cuenta para tus estadísticas
      </p>
      <p class="test-question" style="font-size: 16px; margin: 0 0 14px;">${ui.escapeHtml(q.enunciado)}</p>
      <div class="options" id="preview-options">${optionsHtml}</div>
      ${hasExpl ? `<p class="explanation" id="preview-expl" style="display:none;">${ui.escapeHtml(q.explicacion)}</p>` : ""}
      <div class="modal-actions" style="margin-top: 16px;">
        <button class="btn btn--ghost" id="preview-close" type="button">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  void overlay.offsetWidth;
  overlay.classList.add("is-visible");

  const close = () => {
    overlay.classList.remove("is-visible");
    setTimeout(() => overlay.remove(), 150);
  };

  overlay.querySelectorAll("#preview-options .option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosen = parseInt(btn.getAttribute("data-opt-idx"), 10);
      overlay.querySelectorAll("#preview-options .option").forEach((b) => {
        b.disabled = true;
        const origIdx = parseInt(b.getAttribute("data-opt-idx"), 10);
        if (origIdx === q.correcta) b.classList.add("is-correct");
        if (origIdx === chosen && chosen !== q.correcta) b.classList.add("is-wrong");
      });
      if (hasExpl) {
        overlay.querySelector("#preview-expl").style.display = "block";
      }
    });
  });

  overlay.querySelector("#preview-close").addEventListener("click", close);
}

function exportProgress() {
  const data = storage.exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const a = document.createElement("a");
  a.href = url;
  a.download = `progreso-estudio-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  ui.toast("Progreso exportado", "success");
}

async function importProgress(file) {
  let text;
  try {
    text = await ui.readFileAsText(file);
  } catch (e) {
    ui.toast("No se pudo leer el archivo", "danger");
    return;
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    ui.toast("El archivo no es un JSON válido", "danger");
    return;
  }
  if (!data || typeof data !== "object") {
    ui.toast("El archivo no contiene datos válidos", "danger");
    return;
  }

  const summary = summarizeImport(data);
  const choice = await ui.modal({
    title: "Importar progreso",
    body: `
      <p style="margin: 0 0 10px;">${summary}</p>
      <p style="margin: 0;"><strong>Esto sobrescribirá tu progreso actual.</strong> ¿Continuar?</p>
    `,
    actions: [
      { id: "cancel", label: "Cancelar",     kind: "btn--ghost"   },
      { id: "ok",     label: "Sobrescribir", kind: "btn--primary" },
    ],
  });
  if (choice !== "ok") return;

  try {
    storage.importAll(data);
  } catch (e) {
    ui.toast("Error al importar: " + e.message, "danger");
    return;
  }
  // Recarga la página para que la biblioteca relea custom files y todo
  // se renderice desde cero con el nuevo estado.
  ui.toast("Importado. Recargando…", "success");
  setTimeout(() => location.reload(), 600);
}

function summarizeImport(data) {
  const parts = [];
  const safeCount = (obj) => obj && typeof obj === "object" ? Object.keys(obj).length : 0;
  const p = safeCount(data.progress);
  const s = safeCount(data.starred);
  const v = safeCount(data.validation);
  const f = safeCount(data.files);
  const c = safeCount(data.colors);
  if (p) parts.push(`${p} ${p === 1 ? "pregunta con progreso" : "preguntas con progreso"}`);
  if (s) parts.push(`${s} ${s === 1 ? "marcada" : "marcadas"}`);
  if (v) parts.push(`${v} ${v === 1 ? "archivo validado" : "archivos validados"}`);
  if (f) parts.push(`${f} JSON personalizado${f === 1 ? "" : "s"}`);
  if (c) parts.push(`${c} ${c === 1 ? "color personalizado" : "colores personalizados"}`);
  if (data.theme) parts.push(`tema "${data.theme}"`);
  if (typeof data.mastery_threshold === "number" || safeCount(data.mastery_thresholds)) {
    parts.push("umbrales de dominio");
  }
  if (typeof data.font_size === "number" || typeof data.font_size_wide === "number") {
    parts.push("tamaños de texto");
  }
  if (parts.length === 0) {
    return "El archivo no contiene datos reconocibles, pero se intentará importar igualmente.";
  }
  const exported = data.exported_at ? ` (exportado el ${data.exported_at.slice(0, 10)})` : "";
  return `Contiene: ${parts.join(", ")}${exported}.`;
}

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
function renderSettings() {
  ui.clearHeaderLeft();
  document.body.removeAttribute("data-tinted");
  clearAccent();

  const asignaturas = library.getAsignaturas();
  const globalThreshold = storage.getGlobalMasteryThreshold();
  const allThresholds = storage.getAllMasteryThresholds();
  const fontSize = storage.getFontSize();
  const fontSizeWide = storage.getFontSizeWide();
  const validationMode = storage.getValidationMode();
  const wrongPenalty = storage.getWrongPenalty();

  /* Opciones del <select> de umbral */
  function thresholdOptions(selected) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .map((n) => `<option value="${n}" ${n === selected ? "selected" : ""}>${n} ${n === 1 ? "acierto" : "aciertos"}</option>`)
      .join("");
  }

  /* Filas de override por asignatura */
  const asigRows = asignaturas.length === 0
    ? `<p class="muted tiny">No hay asignaturas cargadas todavía.</p>`
    : asignaturas.map((a) => {
        const override = allThresholds[a.name];
        const hasOverride = typeof override === "number";
        /* Select: primera opción = "igual que el general (N)", luego 1-10 */
        const opts = `
          <option value="global" ${!hasOverride ? "selected" : ""}>
            General (${globalThreshold})
          </option>
          ${thresholdOptions(hasOverride ? override : -1)}
        `;
        return `
          <div class="settings-row" data-asig-name="${ui.escapeHtml(a.name)}">
            <label class="settings-row__label"
                   style="--subject-color: ${ui.escapeHtml(a.color)};">
              <span class="settings-row__dot"></span>
              ${ui.escapeHtml(a.name)}
            </label>
            <select class="settings-select asig-threshold-select">
              ${opts}
            </select>
          </div>
        `;
      }).join("");

  ROOT.innerHTML = `
    <h2 class="page-title">Configuración</h2>

    <p class="stats-section-title">Aprendizaje</p>

    <div class="panel">
      <div class="panel__field">
        <label class="panel__label">
          Modo de validación manual
          <span class="panel__hint">Cómo aparecen las preguntas al validar un tema</span>
        </label>
        <div class="settings-radio-group">
          <label class="settings-radio-row">
            <input type="radio" name="validation-mode" value="reveal"
                   ${validationMode === "reveal" ? "checked" : ""}>
            <span>
              Mostrar la respuesta correcta
              <span class="settings-radio-hint">La opción correcta aparece marcada en verde desde el inicio</span>
            </span>
          </label>
          <label class="settings-radio-row">
            <input type="radio" name="validation-mode" value="test"
                   ${validationMode === "test" ? "checked" : ""}>
            <span>
              Seleccionar la respuesta (modo test)
              <span class="settings-radio-hint">Las opciones son clicables; se iluminan en verde o rojo al responder</span>
            </span>
          </label>
        </div>
      </div>

      <div class="panel__field">
        <label class="panel__label" for="wrong-penalty">
          Penalización por fallo en el test
          <span class="panel__hint">Puntos descontados de la nota (sobre 10) por cada respuesta incorrecta</span>
        </label>
        <select class="settings-select" id="wrong-penalty">
          ${[
            { value: "0",    label: "0 — sin penalización" },
            { value: "0.25", label: "0,25 puntos" },
            { value: "0.33", label: "0,33 puntos (1/3)" },
            { value: "0.5",  label: "0,5 puntos (por defecto)" },
            { value: "1",    label: "1 punto" },
          ].map(({ value, label }) =>
            `<option value="${value}" ${parseFloat(value) === wrongPenalty ? "selected" : ""}>${label}</option>`
          ).join("")}
        </select>
      </div>

      <div class="panel__field">
        <label class="panel__label" for="global-threshold">
          Aciertos seguidos para dominar una pregunta
          <span class="panel__hint">(valor por defecto para todas las asignaturas)</span>
        </label>
        <select class="settings-select" id="global-threshold">
          ${thresholdOptions(globalThreshold)}
        </select>
      </div>

      <div class="panel__field">
        <label class="panel__label">Por asignatura</label>
        <div class="settings-asig-list">
          ${asigRows}
        </div>
      </div>
    </div>

    <p class="stats-section-title">Apariencia</p>

    <div class="panel">
      <div class="panel__field">
        <label class="panel__label" for="font-size-base">
          Tamaño de texto
          <span class="panel__hint">(pantallas normales)</span>
        </label>
        <div class="settings-px-row">
          <input class="settings-input-px" type="number" id="font-size-base"
                 min="8" max="48" step="1" value="${fontSize}">
          <span class="muted">px</span>
        </div>
      </div>

      <div class="panel__field">
        <label class="panel__label" for="font-size-wide">
          Tamaño de texto en pantallas anchas
          <span class="panel__hint">(más de 1000 px de ancho)</span>
        </label>
        <div class="settings-px-row">
          <input class="settings-input-px" type="number" id="font-size-wide"
                 min="8" max="48" step="1" value="${fontSizeWide}">
          <span class="muted">px</span>
        </div>
      </div>
    </div>
  `;

  attachSettingsHandlers(asignaturas);
}

function attachSettingsHandlers(asignaturas) {
  /* Modo de validación */
  ROOT.querySelectorAll('input[name="validation-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      storage.setValidationMode(radio.value);
      const label = radio.value === "test" ? "Modo test" : "Mostrar respuesta";
      ui.toast(`Validación: ${label}`, "success");
    });
  });

  /* Penalización por fallo */
  const penaltySelect = ROOT.querySelector("#wrong-penalty");
  if (penaltySelect) {
    penaltySelect.addEventListener("change", () => {
      const v = parseFloat(penaltySelect.value);
      storage.setWrongPenalty(v);
      const label = penaltySelect.options[penaltySelect.selectedIndex].text;
      ui.toast(`Penalización: ${label}`, "success");
    });
  }

  /* Umbral global */
  const globalSelect = ROOT.querySelector("#global-threshold");
  if (globalSelect) {
    globalSelect.addEventListener("change", () => {
      const n = parseInt(globalSelect.value, 10);
      storage.setGlobalMasteryThreshold(n);
      /* Refresca las opciones "General (N)" de cada asignatura */
      ROOT.querySelectorAll(".asig-threshold-select").forEach((sel) => {
        const opt = sel.querySelector('option[value="global"]');
        if (opt) opt.textContent = `General (${n})`;
      });
      ui.toast("Umbral global actualizado", "success");
    });
  }

  /* Umbral por asignatura */
  ROOT.querySelectorAll(".settings-row[data-asig-name]").forEach((row) => {
    const name = row.getAttribute("data-asig-name");
    const sel = row.querySelector(".asig-threshold-select");
    if (!sel) return;
    sel.addEventListener("change", () => {
      if (sel.value === "global") {
        storage.clearAsignaturaMasteryThreshold(name);
        ui.toast(`"${name}" usará el umbral general`, "success");
      } else {
        const n = parseInt(sel.value, 10);
        storage.setAsignaturaMasteryThreshold(name, n);
        ui.toast(`Umbral de "${name}" → ${n}`, "success");
      }
    });
  });

  /* Tamaño de fuente base */
  const fontBaseInput = ROOT.querySelector("#font-size-base");
  if (fontBaseInput) {
    fontBaseInput.addEventListener("change", () => {
      const v = parseInt(fontBaseInput.value, 10);
      if (!Number.isFinite(v) || v < 8 || v > 48) {
        ui.toast("Valor fuera de rango (8–48 px)", "danger");
        fontBaseInput.value = storage.getFontSize();
        return;
      }
      storage.setFontSize(v);
      document.documentElement.style.setProperty("--font-size-base", `${v}px`);
      ui.toast(`Tamaño de texto → ${v} px`, "success");
    });
  }

  /* Tamaño de fuente ancho */
  const fontWideInput = ROOT.querySelector("#font-size-wide");
  if (fontWideInput) {
    fontWideInput.addEventListener("change", () => {
      const v = parseInt(fontWideInput.value, 10);
      if (!Number.isFinite(v) || v < 8 || v > 48) {
        ui.toast("Valor fuera de rango (8–48 px)", "danger");
        fontWideInput.value = storage.getFontSizeWide();
        return;
      }
      storage.setFontSizeWide(v);
      document.documentElement.style.setProperty("--font-size-wide", `${v}px`);
      ui.toast(`Tamaño en pantalla ancha → ${v} px`, "success");
    });
  }
}

/* ============================================================
   ARRANQUE DEL TEST (lee la configuración del panel del detalle)
   ============================================================ */
function collectTestConfig(asignaturaName) {
  const sizeChip = ROOT.querySelector("#size-group .choice-chip.is-active");
  const size = sizeChip ? sizeChip.getAttribute("data-size") : "all";
  const onlyFailed = ROOT.querySelector("#only-failed")?.checked || false;
  const onlyStarred = ROOT.querySelector("#only-starred")?.checked || false;
  const temaIds = Array.from(ROOT.querySelectorAll(".tema-include:checked"))
    .map((cb) => cb.value);

  if (temaIds.length === 0) {
    ui.toast("Selecciona al menos un tema.", "danger");
    return null;
  }
  return { asignaturaName, temaIds, size, onlyFailed, onlyStarred };
}

function startTest(config) {
  // Mantenemos el tinte y el acento de la asignatura durante el test.
  const onExit = (action) => {
    if (action === "restart") {
      test.start(config, ROOT, onExit);
    } else {
      renderAsignatura(config.asignaturaName);
    }
  };
  test.start(config, ROOT, onExit);
}

/* Lanza la sesión de validación de un tema concreto. Mantiene el
   acento y el tinte de la asignatura durante la sesión. */
function startValidation(fileId, asignaturaName) {
  const onExit = () => renderAsignatura(asignaturaName);
  validation.start(fileId, ROOT, onExit);
}

/* ============================================================
   Lanzamos la app
   ============================================================ */
start().catch((e) => {
  console.error("[app] error al arrancar:", e);
  ROOT.innerHTML = `
    <div class="empty-state">
      <p>No se pudo arrancar la app. Mira la consola para más detalle.</p>
    </div>
  `;
});
