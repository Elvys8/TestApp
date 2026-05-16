/* ============================================================
   validation.js
   Sesión de validación dedicada de un archivo de preguntas.

   Se accede pulsando la pastilla "Pendiente" del tema. Es una
   pantalla aparte (no es un test):
     - Las preguntas y opciones aparecen en el orden del JSON.
     - Las opciones NO son clicables: solo lees el enunciado y la
       respuesta marcada como correcta (resaltada en verde).
     - Para cada pregunta decides "Sí, está bien" o "Necesita
       correcciones".
     - Si necesita correcciones, se abre un formulario de edición.
       Las ediciones se guardan en localStorage como WIP para que
       sobrevivan a recargas.
     - Al finalizar la sesión (todas las preguntas revisadas):
         * Se commitea la marca de "validada" para cada pregunta.
         * Si hay ediciones, se descarga un JSON corregido con
           todas las preguntas (originales + ediciones aplicadas)
           para que el usuario reemplace el archivo original.
         * El WIP se limpia.
     - No se registra progreso (aciertos/fallos): es una pasada
       de revisión, no de estudio.

   API pública:
     start(fileId, mountEl, onExit)
   ============================================================ */

import * as library from "./library.js";
import * as storage from "./storage.js";
import * as ui from "./ui.js";

let _state = null;

/* ============================================================
   ARRANQUE
   ============================================================ */
export function start(fileId, mountEl, onExit) {
  const file = library.getTema(fileId);
  if (!file) {
    onExit();
    return;
  }

  // Recuperar ediciones en curso si las hay (sesión interrumpida)
  const wip = storage.getValidationWip(fileId);

  _state = {
    file,
    mountEl,
    onExit,
    currentIdx: 0,
    edits: { ...(wip.edits || {}) }, // { [questionId]: editedQ }
    validationMode: storage.getValidationMode(), // "reveal" | "test"
    answered: false,  // en modo test: ¿ya respondió la pregunta actual?
  };

  // Botón "Salir de la validación" en la cabecera de la app
  ui.setHeaderLeftButton("Salir de la validación", () => {
    const editsCount = Object.keys(_state.edits).length;
    const msg = editsCount > 0
      ? `¿Salir de la validación? Tienes ${editsCount} ${editsCount === 1 ? "corrección" : "correcciones"} ` +
        "pendientes; se conservan en este navegador hasta que finalices la sesión."
      : "¿Salir de la validación? Las preguntas que ya hayas confirmado siguen marcadas como validadas.";
    if (!window.confirm(msg)) return;
    onExit();
  });

  // Saltar las que ya estén marcadas como validadas en sesiones previas
  advanceToNext();
  render();
}

/* Avanza el índice hasta la primera pregunta NO validada (true). */
function advanceToNext() {
  const { file } = _state;
  const v = storage.getValidationState(file.id);
  while (_state.currentIdx < file.preguntas.length) {
    const q = file.preguntas[_state.currentIdx];
    if (v.validatedQuestions[q.id] === true) {
      _state.currentIdx++;
    } else {
      break;
    }
  }
}

/* ============================================================
   RENDER DE LA PREGUNTA ACTUAL
   ============================================================ */
function render() {
  const { file, currentIdx } = _state;

  if (currentIdx >= file.preguntas.length) {
    renderEnd();
    return;
  }

  // Resetea el estado de "respondida" al avanzar a nueva pregunta
  _state.answered = false;

  if (_state.validationMode === "test") {
    renderTestMode();
  } else {
    renderRevealMode();
  }
}

/* Modo "reveal": opciones no clicables, correcta marcada en verde desde el inicio. */
function renderRevealMode() {
  const { file, currentIdx, mountEl, edits } = _state;
  const original = file.preguntas[currentIdx];
  const edited = edits[original.id];
  const display = edited || original;

  mountEl.innerHTML = `
    ${renderValidationHeader(file, currentIdx)}
    <p class="test-question">${ui.escapeHtml(display.enunciado)}</p>

    <div class="options validation-options">
      ${display.opciones.map((opt, i) => `
        <div class="option option--readonly ${i === display.correcta ? "is-correct" : ""}">
          ${ui.escapeHtml(opt)}
        </div>
      `).join("")}
    </div>

    ${renderExplicacion(display)}
    ${renderEditedBadge(edited)}
    ${renderValidationActions()}
  `;

  attachHandlers();
}

/* Modo "test": opciones clicables, feedback verde/rojo al seleccionar. */
function renderTestMode() {
  const { file, currentIdx, mountEl, edits } = _state;
  const original = file.preguntas[currentIdx];
  const edited = edits[original.id];
  const display = edited || original;

  mountEl.innerHTML = `
    ${renderValidationHeader(file, currentIdx)}
    <p class="test-question">${ui.escapeHtml(display.enunciado)}</p>

    <div class="options" id="validation-options">
      ${display.opciones.map((opt, i) => `
        <button class="option" type="button" data-opt-idx="${i}">
          ${ui.escapeHtml(opt)}
        </button>
      `).join("")}
    </div>

    <p class="explanation" id="validation-expl" style="display:none;">
      ${display.explicacion ? ui.escapeHtml(display.explicacion) : ""}
    </p>

    ${renderEditedBadge(edited)}
    ${renderValidationActions()}
  `;

  // Cablear clics en las opciones
  mountEl.querySelectorAll("#validation-options .option").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (_state.answered) return;
      _state.answered = true;

      const chosen = parseInt(btn.getAttribute("data-opt-idx"), 10);
      const correcta = display.correcta;

      mountEl.querySelectorAll("#validation-options .option").forEach((b) => {
        b.disabled = true;
        const idx = parseInt(b.getAttribute("data-opt-idx"), 10);
        if (idx === correcta) b.classList.add("is-correct");
        if (idx === chosen && chosen !== correcta) b.classList.add("is-wrong");
      });

      // Mostrar explicación si existe
      if (display.explicacion && display.explicacion.trim()) {
        const explEl = mountEl.querySelector("#validation-expl");
        if (explEl) explEl.style.display = "block";
      }
    });
  });

  attachHandlers();
}

/* ── helpers de render ── */

function renderValidationHeader(file, currentIdx) {
  const jumpOptions = file.preguntas
    .map((_, i) => `<option value="${i}"${i === currentIdx ? " selected" : ""}>${i + 1}</option>`)
    .join("");
  return `
    <p class="muted tiny" style="margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.4px;">Validación</p>
    <h2 class="asignatura-name" style="font-size: 22px;">${ui.escapeHtml(file.tema)}</h2>
    <div class="test-header">
      <span>Pregunta ${currentIdx + 1} / ${file.preguntas.length}</span>
      <select class="question-jump" id="question-jump" aria-label="Ir a pregunta">
        ${jumpOptions}
      </select>
    </div>
  `;
}

function renderExplicacion(display) {
  if (!display.explicacion || !display.explicacion.trim()) return "";
  return `<p class="explanation">${ui.escapeHtml(display.explicacion)}</p>`;
}

function renderEditedBadge(edited) {
  if (!edited) return "";
  return `
    <p class="muted tiny" style="margin: 12px 0 0;">
      ✎ Esta pregunta ya tiene correcciones. Se descargarán al finalizar la sesión.
    </p>
  `;
}

function renderValidationActions() {
  return `
    <div class="validation-actions">
      <button class="btn btn--ghost"   id="btn-fix" type="button">Necesita correcciones</button>
      <button class="btn btn--primary" id="btn-ok"  type="button">Sí, está bien →</button>
    </div>
  `;
}

function attachHandlers() {
  const { mountEl } = _state;
  mountEl.querySelector("#btn-ok").addEventListener("click", handleConfirmOk);
  mountEl.querySelector("#btn-fix").addEventListener("click", handleNeedsFix);

  // Salto directo a una pregunta concreta desde el desplegable
  const jump = mountEl.querySelector("#question-jump");
  if (jump) {
    jump.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      if (Number.isInteger(idx) && idx >= 0 && idx < _state.file.preguntas.length) {
        _state.currentIdx = idx;
        render();
      }
    });
  }
}

/* "Sí, está bien" → marca como validada y avanza. */
function handleConfirmOk() {
  const q = _state.file.preguntas[_state.currentIdx];
  storage.markQuestionValidated(_state.file.id, q.id);
  _state.currentIdx++;
  render();
}

/* "Necesita correcciones" → abre el formulario de edición. */
async function handleNeedsFix() {
  const original = _state.file.preguntas[_state.currentIdx];
  const current = _state.edits[original.id] || original;
  const result = await openEditForm(current);
  if (result === null) return; // cancelado, sigue en la misma pregunta

  _state.edits[original.id] = result;
  persistWip();
  // La edición confirma que la versión guardada es correcta
  storage.markQuestionValidated(_state.file.id, original.id);
  _state.currentIdx++;
  render();
}

function persistWip() {
  storage.setValidationWip(_state.file.id, { edits: _state.edits });
}

/* ============================================================
   FORMULARIO DE EDICIÓN
   Modal con campos para enunciado, 4 opciones, radio para la
   correcta y una explicación opcional.
   Resuelve con el objeto editado o null si se cancela.
   ============================================================ */
function openEditForm(q) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const optionsHtml = q.opciones.map((opt, i) => `
      <div class="edit-option-row">
        <input type="radio" name="correcta" id="correcta-${i}" value="${i}" ${i === q.correcta ? "checked" : ""}>
        <input type="text" class="edit-option-input" data-opt="${i}" value="${ui.escapeHtml(opt)}" placeholder="Opción ${String.fromCharCode(65 + i)}">
      </div>
    `).join("");

    overlay.innerHTML = `
      <div class="modal-card modal-card--wide">
        <h3 class="modal-title">Editar pregunta</h3>
        <div class="modal-body">

          <label class="edit-label" for="edit-enunciado">Enunciado</label>
          <textarea class="edit-textarea" id="edit-enunciado" rows="3">${ui.escapeHtml(q.enunciado)}</textarea>

          <label class="edit-label">Opciones · marca la correcta</label>
          ${optionsHtml}

          <label class="edit-label" for="edit-explicacion">Explicación (opcional)</label>
          <textarea class="edit-textarea" id="edit-explicacion" rows="2">${ui.escapeHtml(q.explicacion || "")}</textarea>

          <p class="edit-error" id="edit-error" style="display:none;"></p>
        </div>
        <div class="modal-actions">
          <button class="btn btn--ghost"   id="edit-cancel" type="button">Cancelar</button>
          <button class="btn btn--primary" id="edit-save"   type="button">Guardar correcciones →</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    void overlay.offsetWidth;
    overlay.classList.add("is-visible");

    const errorEl = overlay.querySelector("#edit-error");
    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    };

    overlay.querySelector("#edit-cancel").addEventListener("click", () => {
      overlay.classList.remove("is-visible");
      setTimeout(() => overlay.remove(), 150);
      resolve(null);
    });

    overlay.querySelector("#edit-save").addEventListener("click", () => {
      const enunciado = overlay.querySelector("#edit-enunciado").value.trim();
      const explicacion = overlay.querySelector("#edit-explicacion").value.trim();
      const correctaInput = overlay.querySelector('input[name="correcta"]:checked');
      const correcta = correctaInput ? parseInt(correctaInput.value, 10) : -1;
      const opciones = Array.from(overlay.querySelectorAll(".edit-option-input"))
        .sort((a, b) => parseInt(a.dataset.opt, 10) - parseInt(b.dataset.opt, 10))
        .map((input) => input.value.trim());

      if (!enunciado) { showError("El enunciado no puede estar vacío."); return; }
      if (opciones.some((o) => !o)) { showError("Todas las opciones deben tener texto."); return; }
      if (!Number.isInteger(correcta) || correcta < 0 || correcta > 3) {
        showError("Marca cuál de las opciones es la correcta.");
        return;
      }

      const edited = { id: q.id, enunciado, opciones, correcta, explicacion };
      overlay.classList.remove("is-visible");
      setTimeout(() => overlay.remove(), 150);
      resolve(edited);
    });
  });
}

/* ============================================================
   FIN DE LA SESIÓN
   - Comprueba si el archivo entero queda validado.
   - Si hay ediciones, genera y descarga el JSON corregido.
   - Limpia el WIP.
   ============================================================ */
function renderEnd() {
  const { file, mountEl, onExit, edits } = _state;
  // Cambiamos el botón de la cabecera a "Volver" (sin confirm) ahora
  // que la sesión está completada.
  ui.setHeaderLeftButton("Volver", () => onExit());

  // Comprobar y, si procede, marcar el archivo como validado
  const stateNow = storage.getValidationState(file.id);
  const allValidated = file.preguntas.every(
    (q) => stateNow.validatedQuestions[q.id] === true
  );
  if (allValidated && stateNow.status !== "validated") {
    storage.setFileValidationStatus(file.id, "validated");
  }

  const editsCount = Object.keys(edits).length;
  let download = null;
  if (editsCount > 0) {
    download = buildCorrectedJson(file, edits);
  }

  mountEl.innerHTML = `
    <h2 class="page-title">Validación completada</h2>

    <div class="panel">
      <p style="margin: 0 0 6px;">
        Se han revisado las <strong>${file.preguntas.length}</strong> preguntas de
        "${ui.escapeHtml(file.tema)}".
      </p>
      <p class="muted tiny" style="margin: 0;">
        ${editsCount === 0
          ? "No has editado ninguna pregunta."
          : `${editsCount} ${editsCount === 1 ? "pregunta editada" : "preguntas editadas"} · ` +
            `${file.preguntas.length - editsCount} confirmadas tal cual.`}
      </p>
      ${allValidated ? `
        <p style="margin: 8px 0 0; color: var(--success);">
          El tema queda marcado como Validado.
        </p>
      ` : ""}
    </div>

    ${download ? `
      <div class="panel">
        <p class="panel__title">Descarga el JSON corregido</p>
        <p class="muted tiny" style="margin: 0 0 12px;">
          Sustituye manualmente el archivo
          <code>${ui.escapeHtml(download.filename)}</code>
          en tu carpeta <code>preguntas/</code> por este nuevo. Las correcciones se
          aplicarán en cuanto recargues la app.
        </p>
        <button class="btn btn--primary" id="download-btn" type="button">
          ⤓ Descargar JSON corregido
        </button>
        <p class="muted tiny" style="margin: 10px 0 0;">
          Mientras no reemplaces el archivo, las correcciones se conservan en este
          navegador y puedes volver a descargarlas. Una vez sustituido, puedes
          limpiarlas con el botón "Limpiar correcciones pendientes".
        </p>
        <div style="margin-top: 8px;">
          <button class="btn btn--ghost" id="clear-wip-btn" type="button">
            Limpiar correcciones pendientes
          </button>
        </div>
      </div>
    ` : ""}

    <div style="display:flex; justify-content:flex-end; gap:8px;">
      <button class="btn btn--primary" id="end-btn" type="button">Volver</button>
    </div>
  `;

  if (download) {
    mountEl.querySelector("#download-btn").addEventListener("click", () => {
      triggerDownload(download.filename, download.json);
    });
    mountEl.querySelector("#clear-wip-btn").addEventListener("click", () => {
      const yes = window.confirm(
        "¿Eliminar las correcciones pendientes? Hazlo solo después de haber sustituido " +
        "el archivo en disco con el JSON descargado."
      );
      if (!yes) return;
      storage.clearValidationWip(file.id);
      _state.edits = {};
      ui.toast("Correcciones pendientes eliminadas", "info");
      // Re-render para quitar el bloque de descarga
      renderEnd();
    });
  }

  mountEl.querySelector("#end-btn").addEventListener("click", () => onExit());
}

function buildCorrectedJson(file, edits) {
  const corrected = {
    schema_version: file.schema_version || 1,
    id: file.id,
    asignatura: file.asignatura,
    asignatura_color: file.asignatura_color,
    tema: file.tema,
    preguntas: file.preguntas.map((q) => {
      const e = edits[q.id];
      if (!e) return cleanQuestion(q);
      return {
        id: q.id,
        enunciado: e.enunciado,
        opciones: e.opciones,
        correcta: e.correcta,
        explicacion: e.explicacion || "",
      };
    }),
  };
  const filename = file._filename || `${file.id}.json`;
  return { filename, json: JSON.stringify(corrected, null, 2) };
}

/* Devuelve la pregunta sin las claves internas (_fileId, _source, etc.) */
function cleanQuestion(q) {
  return {
    id: q.id,
    enunciado: q.enunciado,
    opciones: q.opciones,
    correcta: q.correcta,
    explicacion: q.explicacion || "",
  };
}

function triggerDownload(filename, json) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  ui.toast("JSON corregido descargado", "success");
}
