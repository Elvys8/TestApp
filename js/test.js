/* ============================================================
   test.js
   Lógica y renderizado de una sesión de test.

   API pública:
     start(config, mountEl, onExit)
       config:
         asignaturaName : string
         temaIds        : string[]   // qué archivos incluir
         size           : number | "all"
         onlyFailed     : boolean    // solo preguntas con totalWrong > 0
         onlyStarred    : boolean    // solo preguntas marcadas para revisar
       mountEl: el contenedor (#app) donde se renderiza el test
       onExit:  callback que llama el test cuando termina o el usuario sale

   Reglas del flujo:
     - Las preguntas y sus 4 opciones se barajan en cada sesión.
     - Las preguntas "dominadas" (streak >= 3) NO entran en la rotación
       a menos que el usuario las haya reseteado.
     - Acertar incrementa la racha y avanza solo tras 700ms.
     - Fallar resetea la racha, ilumina la elegida en rojo y la correcta
       en verde, muestra explicación si existe y espera al botón "Siguiente".
     - Botón estrella para marcar/desmarcar la pregunta para revisar.
   ============================================================ */

import * as library from "./library.js";
import * as storage from "./storage.js";
import * as ui from "./ui.js";

let _state = null;

/* ============================================================
   ARRANQUE DE LA SESIÓN
   ============================================================ */
export function start(config, mountEl, onExit) {
  const pool = buildPool(config);

  if (pool.length === 0) {
    renderEmptyPool(mountEl, onExit);
    return;
  }

  const threshold = storage.getMasteryThreshold(config.asignaturaName);
  _state = {
    config,
    mountEl,
    onExit,
    items: pool,        // [{ q, optionsOrder: [3,1,0,2] }]
    currentIdx: 0,
    answers: [],        // [{ questionId, correct }]
    masteredBefore: pool.map((it) => storage.isMastered(it.q.id, threshold)),
    threshold,
  };

  renderQuestion();
}

/* ============================================================
   CONSTRUCCIÓN DEL POOL DE PREGUNTAS
   ============================================================ */
function buildPool(config) {
  let questions = [];

  for (const fileId of config.temaIds || []) {
    const file = library.getTema(fileId);
    if (!file) continue;
    for (const q of file.preguntas) {
      questions.push({ ...q, _fileId: fileId });
    }
  }

  // Excluir las dominadas según el umbral configurado para la asignatura
  const threshold = storage.getMasteryThreshold(config.asignaturaName);
  questions = questions.filter((q) => !storage.isMastered(q.id, threshold));

  if (config.onlyFailed) {
    questions = questions.filter((q) => storage.getProgress(q.id).totalWrong > 0);
  }
  if (config.onlyStarred) {
    questions = questions.filter((q) => storage.isStarred(q.id));
  }

  shuffleInPlace(questions);

  if (config.size && config.size !== "all") {
    const n = parseInt(config.size, 10);
    if (Number.isFinite(n) && n > 0) questions = questions.slice(0, n);
  }

  return questions.map((q) => {
    const indices = q.opciones.map((_, i) => i);
    // Las preguntas Verdadero/Falso (2 opciones) se muestran siempre en el
    // orden del JSON; el resto se barajan en cada sesión.
    const optionsOrder = q.opciones.length === 2 ? indices : shuffleArray(indices);
    return { q, optionsOrder };
  });
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function shuffleArray(arr) {
  const copy = arr.slice();
  shuffleInPlace(copy);
  return copy;
}

/* ============================================================
   RENDER — PREGUNTA ACTUAL
   ============================================================ */
function renderQuestion() {
  const { items, currentIdx, mountEl } = _state;

  if (currentIdx >= items.length) {
    renderSummary();
    return;
  }

  const item = items[currentIdx];
  const q = item.q;
  const isStarred = storage.isStarred(q.id);
  const hasInfo = q.explicacion && q.explicacion.trim();

  // Nombre del tema: solo si el test mezcla más de un tema
  const multiTema = (_state.config.temaIds || []).length > 1;
  const temaLabel = multiTema && q._fileId
    ? (library.getTema(q._fileId)?.tema || "")
    : "";

  mountEl.innerHTML = `
    <div class="test-header">
      <span>Pregunta ${currentIdx + 1} / ${items.length}</span>
      <div class="test-header__controls">
        ${hasInfo ? `
        <button class="test-header__info" id="info-btn" type="button"
                aria-label="Ver explicación" title="Ver explicación">
          ${infoIcon()}
        </button>` : ""}
        <button class="test-header__star ${isStarred ? "is-starred" : ""}"
                id="star-btn" type="button"
                aria-label="${isStarred ? "Quitar marca" : "Marcar para revisar"}"
                title="${isStarred ? "Quitar marca" : "Marcar para revisar"}">
          ${starIcon(isStarred)}
        </button>
        <button class="test-header__close" id="close-btn" type="button"
                aria-label="Salir del test" title="Salir del test">
          ${closeIcon()}
        </button>
      </div>
    </div>

    ${temaLabel ? `<p class="test-tema-label">${ui.escapeHtml(temaLabel)}</p>` : ""}
    <p class="test-question">${ui.escapeHtml(q.enunciado)}</p>

    <div class="options" id="options-list">
      ${item.optionsOrder.map((origIdx) => `
        <button class="option" type="button" data-option-orig="${origIdx}">
          ${ui.escapeHtml(q.opciones[origIdx])}
        </button>
      `).join("")}
    </div>

    <div class="test-footer" id="test-footer"></div>
  `;

  attachQuestionHandlers();
}

function attachQuestionHandlers() {
  const { items, currentIdx, mountEl, onExit } = _state;
  const item = items[currentIdx];
  const q = item.q;

  mountEl.querySelector("#close-btn").addEventListener("click", () => {
    const yes = window.confirm("¿Salir del test? El progreso de la sesión actual se descarta.");
    if (yes) onExit();
  });

  mountEl.querySelector("#star-btn").addEventListener("click", () => {
    const newState = storage.toggleStarred(q.id);
    const btn = mountEl.querySelector("#star-btn");
    btn.classList.toggle("is-starred", newState);
    btn.innerHTML = starIcon(newState);
    btn.setAttribute("aria-label", newState ? "Quitar marca" : "Marcar para revisar");
    btn.setAttribute("title", newState ? "Quitar marca" : "Marcar para revisar");
    ui.toast(newState ? "Marcada para revisar" : "Marca quitada", "info");
  });

  // Icono "i": muestra la explicación de la pregunta en un modal
  const infoBtn = mountEl.querySelector("#info-btn");
  if (infoBtn) {
    infoBtn.addEventListener("click", () => {
      ui.modal({
        title: "Explicación",
        body: `<p style="margin: 0;">${ui.escapeHtml(q.explicacion)}</p>`,
        actions: [{ id: "ok", label: "Cerrar", kind: "btn--ghost" }],
      });
    });
  }

  mountEl.querySelectorAll("#options-list .option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chosenOrig = parseInt(btn.getAttribute("data-option-orig"), 10);
      handleAnswer(chosenOrig);
    });
  });
}

/* ============================================================
   GESTIÓN DE LA RESPUESTA
   ============================================================ */
async function handleAnswer(chosenOrig) {
  const { items, currentIdx, mountEl } = _state;
  const item = items[currentIdx];
  const q = item.q;
  const isCorrect = chosenOrig === q.correcta;

  // Marcar visualmente todas las opciones
  mountEl.querySelectorAll("#options-list .option").forEach((b) => {
    b.disabled = true;
    const orig = parseInt(b.getAttribute("data-option-orig"), 10);
    if (orig === q.correcta) b.classList.add("is-correct");
    if (orig === chosenOrig && !isCorrect) b.classList.add("is-wrong");
  });

  // Registrar progreso
  if (isCorrect) storage.recordCorrect(q.id);
  else storage.recordWrong(q.id);

  _state.answers.push({ questionId: q.id, correct: isCorrect });

  if (isCorrect) {
    // Auto-avance breve para que dé tiempo a ver el verde.
    // Quitamos el foco del botón antes de re-renderizar para evitar
    // que iOS Safari "transfiera" el estado táctil a la nueva opción
    // que caiga en la misma posición.
    setTimeout(() => {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      _state.currentIdx++;
      renderQuestion();
    }, 700);
  } else {
    // Mostrar explicación (si existe) y botón "Siguiente"
    const footer = mountEl.querySelector("#test-footer");
    let explanationHtml = "";
    if (q.explicacion && q.explicacion.trim()) {
      explanationHtml = `<p class="explanation">${ui.escapeHtml(q.explicacion)}</p>`;
    }
    footer.innerHTML = `
      ${explanationHtml}
      <div style="display:flex; justify-content:flex-end;">
        <button class="btn btn--primary" id="next-btn" type="button">Siguiente →</button>
      </div>
    `;
    mountEl.querySelector("#next-btn").addEventListener("click", () => {
      _state.currentIdx++;
      renderQuestion();
    });
  }
}


/* ============================================================
   RESUMEN FINAL
   ============================================================ */
function renderSummary() {
  const { items, answers, mountEl, onExit, masteredBefore, threshold } = _state;

  const total   = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  const wrong   = total - correct;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;

  // Nota sobre 10: cada acierto suma 1, cada fallo resta `penalty`
  const penalty = storage.getWrongPenalty();
  const rawGrade = total > 0 ? (correct - wrong * penalty) / total * 10 : 0;
  const grade = Math.max(0, Math.min(10, rawGrade));
  const gradeStr = grade % 1 === 0 ? grade.toFixed(0) : grade.toFixed(1);

  // Penalización descrita en texto para el pie de la nota
  const penaltyDesc = penalty === 0
    ? "sin penalización por fallos"
    : `restando ${penalty.toString().replace(".", ",")} por fallo`;

  // Cuántas preguntas pasan a estar dominadas en esta sesión
  let newlyMastered = 0;
  items.forEach((it, i) => {
    const wasMastered = masteredBefore[i];
    const isMasteredNow = storage.isMastered(it.q.id, threshold);
    if (!wasMastered && isMasteredNow) newlyMastered++;
  });

  mountEl.innerHTML = `
    <h2 class="page-title">Resumen del test</h2>

    <div class="panel test-summary">
      <div class="test-summary__scores">
        <div class="test-summary__score-block">
          <p class="test-summary__metric">${pct}%</p>
          <p class="muted test-summary__label">${correct} de ${total} acertadas</p>
        </div>
        <div class="test-summary__divider" aria-hidden="true"></div>
        <div class="test-summary__score-block">
          <p class="test-summary__metric test-summary__metric--grade">${gradeStr}<span class="test-summary__grade-denom">/10</span></p>
          <p class="muted test-summary__label">${penaltyDesc}</p>
        </div>
      </div>
    </div>

    <div class="panel">
      <p style="margin: 0 0 6px;"><strong>${correct}</strong> acertadas · <strong>${wrong}</strong> falladas</p>
      <p class="muted tiny" style="margin: 0;">
        ${newlyMastered === 0
          ? "No has dominado ninguna pregunta nueva en esta sesión."
          : `Has dominado <strong>${newlyMastered}</strong> ${newlyMastered === 1 ? "pregunta nueva" : "preguntas nuevas"} (${threshold} ${threshold === 1 ? "acierto seguido" : "aciertos seguidos"}).`}
      </p>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn--ghost" id="back-asig" type="button">Volver a la asignatura</button>
      <button class="btn btn--primary" id="restart" type="button">Otro test igual</button>
    </div>
  `;

  mountEl.querySelector("#back-asig").addEventListener("click", () => onExit());
  mountEl.querySelector("#restart").addEventListener("click", () => onExit("restart"));
}

/* ============================================================
   POOL VACÍO
   ============================================================ */
function renderEmptyPool(mountEl, onExit) {
  mountEl.innerHTML = `
    <button class="back-link" type="button" id="exit-empty">← Volver</button>
    <div class="empty-state">
      <p>No hay preguntas que cumplan los filtros seleccionados.</p>
      <p class="tiny">Prueba a quitar filtros, incluir más temas o reiniciar las preguntas dominadas.</p>
    </div>
  `;
  mountEl.querySelector("#exit-empty").addEventListener("click", () => onExit());
}

/* ============================================================
   ICONOS
   ============================================================ */
function closeIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
    <line x1="6" y1="6" x2="18" y2="18"/>
    <line x1="18" y1="6" x2="6" y2="18"/>
  </svg>`;
}

function infoIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="11" x2="12" y2="16"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>`;
}

function starIcon(filled) {
  if (filled) {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.7 6.4 6.9.6-5.2 4.5 1.6 6.8L12 17.3l-6 3.5 1.6-6.8L2.4 9.5l6.9-.6L12 2.5z"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2.5l2.7 6.4 6.9.6-5.2 4.5 1.6 6.8L12 17.3l-6 3.5 1.6-6.8L2.4 9.5l6.9-.6L12 2.5z"/>
  </svg>`;
}
