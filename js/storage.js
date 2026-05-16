/* ============================================================
   storage.js
   Persistencia en localStorage para toda la app.

   Claves utilizadas (todas con prefijo "estudio:"):
     - estudio:theme                  → "light" | "dark"
     - estudio:progress               → { [questionId]: { streak, totalCorrect, totalWrong } }
     - estudio:starred                → { [questionId]: true }
     - estudio:validation             → { [fileId]: { status, validatedQuestions: { [qId]: true|false } } }
     - estudio:colors                 → { [asignaturaName]: "#hex" }   (override del color del JSON)
     - estudio:files                  → { [fileId]: fileObject }       (JSONs subidos manualmente)
     - estudio:mastery_threshold      → número global de aciertos para dominar (default 3)
     - estudio:mastery_thresholds     → { [asignaturaName]: número }  (overrides por asignatura)
     - estudio:font_size              → número en px para el body (default 18)
     - estudio:font_size_wide         → número en px para pantallas ≥ 1000px (default 26)

   La regla "N aciertos seguidos y desaparece" se evalúa con el campo
   `streak` del objeto de progreso. El umbral N es configurable global-
   mente y puede sobreescribirse por asignatura.
   ============================================================ */

const NS = "estudio:";
const DEFAULT_MASTERY_THRESHOLD = 3;
const DEFAULT_FONT_SIZE       = 18;
const DEFAULT_FONT_SIZE_WIDE  = 26;

/* Kept for backward-compat (test.js importa este símbolo si lo
   necesita, pero ahora se recomienda usar getMasteryThreshold). */
const MASTERY_THRESHOLD = DEFAULT_MASTERY_THRESHOLD;

/* ---------- helpers internos ---------- */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[storage] no se pudo leer", key, e);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("[storage] no se pudo escribir", key, e);
    return false;
  }
}

function readString(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw === null ? fallback : raw;
  } catch (e) {
    return fallback;
  }
}

function writeString(key, value) {
  try {
    localStorage.setItem(NS + key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function removeKey(key) {
  try { localStorage.removeItem(NS + key); } catch (e) {}
}

/* ============================================================
   TEMA (claro / oscuro)
   ============================================================ */

export function getTheme() {
  return readString("theme", null); // null si nunca se ha elegido
}

export function setTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  writeString("theme", theme);
}

/* ============================================================
   PROGRESO POR PREGUNTA
   ============================================================ */

function defaultProgress() {
  return { streak: 0, totalCorrect: 0, totalWrong: 0 };
}

function getAllProgress() {
  return readJson("progress", {});
}

function saveAllProgress(obj) {
  writeJson("progress", obj);
}

export function getProgress(questionId) {
  const all = getAllProgress();
  return all[questionId] || defaultProgress();
}

export function recordCorrect(questionId) {
  const all = getAllProgress();
  const prev = all[questionId] || defaultProgress();
  all[questionId] = {
    streak: prev.streak + 1,
    totalCorrect: prev.totalCorrect + 1,
    totalWrong: prev.totalWrong,
  };
  saveAllProgress(all);
  return all[questionId];
}

export function recordWrong(questionId) {
  const all = getAllProgress();
  const prev = all[questionId] || defaultProgress();
  all[questionId] = {
    streak: 0,
    totalCorrect: prev.totalCorrect,
    totalWrong: prev.totalWrong + 1,
  };
  saveAllProgress(all);
  return all[questionId];
}

/* Resetea solo la racha (deja el histórico de aciertos/fallos intacto)
   para devolver a rotación las preguntas dominadas. */
export function resetMasteryFor(questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) return;
  const all = getAllProgress();
  let changed = false;
  for (const id of questionIds) {
    if (all[id] && all[id].streak > 0) {
      all[id] = { ...all[id], streak: 0 };
      changed = true;
    }
  }
  if (changed) saveAllProgress(all);
}

/* Borra TODO el progreso (rachas + histórico) de las preguntas indicadas. */
export function clearProgressFor(questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) return;
  const all = getAllProgress();
  let changed = false;
  for (const id of questionIds) {
    if (all[id]) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) saveAllProgress(all);
}

/* Pone a 0 SOLO el contador de fallos (totalWrong) de todas las
   preguntas. No toca aciertos ni rachas. Usado por el botón
   "Reiniciar" junto a "Preguntas más falladas". */
export function resetAllWrongCounts() {
  const all = getAllProgress();
  let changed = false;
  for (const id of Object.keys(all)) {
    if (all[id].totalWrong > 0) {
      all[id] = { ...all[id], totalWrong: 0 };
      changed = true;
    }
  }
  if (changed) saveAllProgress(all);
}

/* threshold es opcional; si se omite se usa el umbral global.
   Los llamadores que conocen la asignatura deben pasar
   getMasteryThreshold(asignaturaName) para respetar el override. */
export function isMastered(questionId, threshold = null) {
  const t = threshold !== null ? threshold : getMasteryThreshold();
  return getProgress(questionId).streak >= t;
}

export function countMastered(questionIds, threshold = null) {
  if (!Array.isArray(questionIds)) return 0;
  const t = threshold !== null ? threshold : getMasteryThreshold();
  const all = getAllProgress();
  let n = 0;
  for (const id of questionIds) {
    if ((all[id]?.streak || 0) >= t) n++;
  }
  return n;
}

export function countActive(questionIds) {
  if (!Array.isArray(questionIds)) return 0;
  return questionIds.length - countMastered(questionIds);
}

/* Para la pantalla de estadísticas: top de preguntas más falladas. */
export function getTopFailed(limit = 10) {
  const all = getAllProgress();
  return Object.entries(all)
    .map(([id, p]) => ({ id, totalWrong: p.totalWrong || 0, totalCorrect: p.totalCorrect || 0 }))
    .filter((x) => x.totalWrong > 0)
    .sort((a, b) => b.totalWrong - a.totalWrong)
    .slice(0, limit);
}

/* ============================================================
   PREGUNTAS MARCADAS PARA REVISAR (estrella)
   ============================================================ */

function getAllStarred() {
  return readJson("starred", {});
}

export function isStarred(questionId) {
  return getAllStarred()[questionId] === true;
}

export function toggleStarred(questionId) {
  const all = getAllStarred();
  if (all[questionId]) {
    delete all[questionId];
  } else {
    all[questionId] = true;
  }
  writeJson("starred", all);
  return all[questionId] === true;
}

export function getStarredIds() {
  return Object.keys(getAllStarred());
}

/* ============================================================
   VALIDACIÓN POR ARCHIVO JSON
   Cada archivo tiene un objeto:
     {
       status: "pending" | "validated",
       validatedQuestions: { [qId]: true } // las que el usuario ha confirmado correctas
     }
   El archivo pasa a "validated" cuando todas sus preguntas están en
   validatedQuestions (lo gestiona quien sepa el listado completo,
   normalmente library.js o validation.js).
   ============================================================ */

function getAllValidation() {
  return readJson("validation", {});
}

function saveAllValidation(obj) {
  writeJson("validation", obj);
}

export function getValidationState(fileId) {
  const all = getAllValidation();
  return all[fileId] || { status: "pending", validatedQuestions: {} };
}

export function markQuestionValidated(fileId, questionId) {
  const all = getAllValidation();
  const prev = all[fileId] || { status: "pending", validatedQuestions: {} };
  prev.validatedQuestions = { ...prev.validatedQuestions, [questionId]: true };
  all[fileId] = prev;
  saveAllValidation(all);
}

/* La pregunta queda registrada como "necesita corrección" (false). Mientras
   haya alguna pregunta marcada así o no marcada, el archivo sigue pendiente. */
export function markQuestionNeedsFix(fileId, questionId) {
  const all = getAllValidation();
  const prev = all[fileId] || { status: "pending", validatedQuestions: {} };
  prev.validatedQuestions = { ...prev.validatedQuestions, [questionId]: false };
  all[fileId] = prev;
  saveAllValidation(all);
}

/* ============================================================
   ESTADO TEMPORAL DE LA SESIÓN DE VALIDACIÓN (WIP)
   Guarda las ediciones en curso para que sobrevivan a recargas
   de página. Se mantiene aquí hasta que la sesión finaliza y se
   genera la descarga del JSON corregido (entonces se limpia).
   Estructura: { [fileId]: { edits: { [questionId]: editedQ } } }
   ============================================================ */
function getAllValidationWip() {
  return readJson("validation_wip", {});
}

export function getValidationWip(fileId) {
  return getAllValidationWip()[fileId] || { edits: {} };
}

export function setValidationWip(fileId, state) {
  const all = getAllValidationWip();
  all[fileId] = state;
  writeJson("validation_wip", all);
}

export function clearValidationWip(fileId) {
  const all = getAllValidationWip();
  if (all[fileId]) {
    delete all[fileId];
    writeJson("validation_wip", all);
  }
}

export function setFileValidationStatus(fileId, status) {
  if (status !== "pending" && status !== "validated") return;
  const all = getAllValidation();
  const prev = all[fileId] || { status: "pending", validatedQuestions: {} };
  prev.status = status;
  all[fileId] = prev;
  saveAllValidation(all);
}

/* Marca todas las preguntas indicadas como validadas (true) y deja
   el archivo en estado "validated" en una sola operación.
   Se usa para la "validación automática" desde el menú "..." del tema. */
export function markFileFullyValidated(fileId, questionIds) {
  if (!Array.isArray(questionIds)) return;
  const all = getAllValidation();
  const prev = all[fileId] || { status: "pending", validatedQuestions: {} };
  const validatedQuestions = { ...prev.validatedQuestions };
  for (const qId of questionIds) {
    validatedQuestions[qId] = true;
  }
  all[fileId] = { status: "validated", validatedQuestions };
  saveAllValidation(all);
}

/* Por defecto, un archivo sin entrada en localStorage se considera
   "validado". La validación es ahora opt-in (la abres manualmente
   desde el menú "..." cuando quieres revisar el contenido). */
export function isFileValidated(fileId) {
  const all = getAllValidation();
  if (!all[fileId]) return true;
  return all[fileId].status === "validated";
}

/* Borra la validación entera de un archivo (lo deja como pendiente
   sin marcas en ninguna pregunta). Para "Validar de nuevo el tema". */
export function resetValidationFor(fileId) {
  const all = getAllValidation();
  if (all[fileId]) {
    delete all[fileId];
    saveAllValidation(all);
  }
}

/* ============================================================
   COLOR DE ACENTO POR ASIGNATURA (override del valor del JSON)
   Indexamos por NOMBRE de la asignatura (string) porque varios
   archivos JSON pueden compartir asignatura.
   ============================================================ */

function getAllColors() {
  return readJson("colors", {});
}

export function getAsignaturaColor(asignaturaName) {
  if (!asignaturaName) return null;
  const all = getAllColors();
  return all[asignaturaName] || null;
}

export function setAsignaturaColor(asignaturaName, hex) {
  if (!asignaturaName || !hex) return;
  const all = getAllColors();
  all[asignaturaName] = hex;
  writeJson("colors", all);
}

export function clearAsignaturaColor(asignaturaName) {
  const all = getAllColors();
  if (all[asignaturaName]) {
    delete all[asignaturaName];
    writeJson("colors", all);
  }
}

/* ============================================================
   ARCHIVOS JSON SUBIDOS MANUALMENTE
   Los JSONs "oficiales" viven en /preguntas y los carga library.js
   directamente. Aquí solo guardamos los que el usuario suba desde
   la interfaz (botón "Cargar JSON").
   ============================================================ */

function getAllCustomFiles() {
  return readJson("files", {});
}

export function getCustomFiles() {
  return getAllCustomFiles();
}

export function saveCustomFile(fileObject) {
  if (!fileObject || !fileObject.id) {
    throw new Error("El JSON no tiene 'id'");
  }
  const all = getAllCustomFiles();
  all[fileObject.id] = fileObject;
  writeJson("files", all);
}

export function deleteCustomFile(fileId) {
  const all = getAllCustomFiles();
  if (all[fileId]) {
    delete all[fileId];
    writeJson("files", all);
  }
}

/* ============================================================
   UMBRAL DE DOMINIO (configurable global + por asignatura)
   ============================================================ */

/* Devuelve el umbral efectivo para una asignatura dada, o el
   umbral global si no hay override para esa asignatura.
   Si asignaturaName se omite o es null, devuelve el global. */
export function getMasteryThreshold(asignaturaName = null) {
  if (asignaturaName) {
    const overrides = readJson("mastery_thresholds", {});
    if (typeof overrides[asignaturaName] === "number") {
      return overrides[asignaturaName];
    }
  }
  const global = parseInt(readString("mastery_threshold", ""), 10);
  return Number.isFinite(global) && global >= 1 ? global : DEFAULT_MASTERY_THRESHOLD;
}

/* Umbral global (valor por defecto para las asignaturas sin override). */
export function getGlobalMasteryThreshold() {
  const v = parseInt(readString("mastery_threshold", ""), 10);
  return Number.isFinite(v) && v >= 1 ? v : DEFAULT_MASTERY_THRESHOLD;
}

export function setGlobalMasteryThreshold(n) {
  const v = Math.max(1, Math.min(20, Math.round(Number(n))));
  if (!Number.isFinite(v)) return;
  writeString("mastery_threshold", String(v));
}

/* Override por asignatura. Pasa null para borrar el override. */
export function setAsignaturaMasteryThreshold(asignaturaName, n) {
  if (!asignaturaName) return;
  const overrides = readJson("mastery_thresholds", {});
  if (n === null || n === undefined) {
    delete overrides[asignaturaName];
  } else {
    const v = Math.max(1, Math.min(20, Math.round(Number(n))));
    if (!Number.isFinite(v)) return;
    overrides[asignaturaName] = v;
  }
  writeJson("mastery_thresholds", overrides);
}

export function clearAsignaturaMasteryThreshold(asignaturaName) {
  setAsignaturaMasteryThreshold(asignaturaName, null);
}

export function getAllMasteryThresholds() {
  return readJson("mastery_thresholds", {});
}

/* ============================================================
   PENALIZACIÓN POR FALLO EN EL TEST
   Descuento aplicado por cada respuesta incorrecta al calcular la
   nota sobre 10. Valores habituales: 0 (sin penalización), 0.25,
   0.33, 0.5 (por defecto), 1.
   ============================================================ */

const DEFAULT_WRONG_PENALTY = 0.5;

export function getWrongPenalty() {
  const raw = readString("wrong_penalty", "");
  const v = parseFloat(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_WRONG_PENALTY;
}

export function setWrongPenalty(value) {
  const v = parseFloat(value);
  if (!Number.isFinite(v) || v < 0 || v > 1) return;
  writeString("wrong_penalty", String(v));
}

/* ============================================================
   MODO DE VALIDACIÓN
   "reveal" → la respuesta correcta aparece marcada en verde desde el inicio (comportamiento original).
   "test"   → las opciones son clicables; se iluminan en verde/rojo al seleccionar, igual que en un test.
   ============================================================ */

export function getValidationMode() {
  const v = readString("validation_mode", "");
  return v === "test" ? "test" : "reveal";
}

export function setValidationMode(mode) {
  if (mode !== "reveal" && mode !== "test") return;
  writeString("validation_mode", mode);
}

/* ============================================================
   TAMAÑO DE FUENTE (px)
   ============================================================ */

export function getFontSize() {
  const v = parseInt(readString("font_size", ""), 10);
  return Number.isFinite(v) && v >= 8 ? v : DEFAULT_FONT_SIZE;
}

export function setFontSize(px) {
  const v = Math.max(8, Math.min(48, Math.round(Number(px))));
  if (!Number.isFinite(v)) return;
  writeString("font_size", String(v));
}

export function getFontSizeWide() {
  const v = parseInt(readString("font_size_wide", ""), 10);
  return Number.isFinite(v) && v >= 8 ? v : DEFAULT_FONT_SIZE_WIDE;
}

export function setFontSizeWide(px) {
  const v = Math.max(8, Math.min(48, Math.round(Number(px))));
  if (!Number.isFinite(v)) return;
  writeString("font_size_wide", String(v));
}

/* ============================================================
   EXPORTAR / IMPORTAR PROGRESO COMPLETO
   Devuelve / acepta un objeto con todo el estado relevante.
   El propio fichero exportado lleva una versión por si en el futuro
   cambia el formato.
   ============================================================ */

const EXPORT_VERSION = 1;

export function exportAll() {
  return {
    export_version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    theme: getTheme(),
    progress: getAllProgress(),
    starred: getAllStarred(),
    validation: getAllValidation(),
    validation_wip: getAllValidationWip(),
    colors: getAllColors(),
    files: getAllCustomFiles(),
    mastery_threshold: getGlobalMasteryThreshold(),
    mastery_thresholds: getAllMasteryThresholds(),
    font_size: getFontSize(),
    font_size_wide: getFontSizeWide(),
    validation_mode: getValidationMode(),
    wrong_penalty: getWrongPenalty(),
  };
}

export function importAll(data) {
  if (!data || typeof data !== "object") {
    throw new Error("El archivo importado no es un objeto válido");
  }
  if (data.theme === "light" || data.theme === "dark") writeString("theme", data.theme);
  if (data.progress && typeof data.progress === "object") writeJson("progress", data.progress);
  if (data.starred && typeof data.starred === "object") writeJson("starred", data.starred);
  if (data.validation && typeof data.validation === "object") writeJson("validation", data.validation);
  if (data.validation_wip && typeof data.validation_wip === "object") writeJson("validation_wip", data.validation_wip);
  if (data.colors && typeof data.colors === "object") writeJson("colors", data.colors);
  if (data.files && typeof data.files === "object") writeJson("files", data.files);
  if (typeof data.mastery_threshold === "number") writeString("mastery_threshold", String(data.mastery_threshold));
  if (data.mastery_thresholds && typeof data.mastery_thresholds === "object") writeJson("mastery_thresholds", data.mastery_thresholds);
  if (typeof data.font_size === "number") writeString("font_size", String(data.font_size));
  if (typeof data.font_size_wide === "number") writeString("font_size_wide", String(data.font_size_wide));
  if (data.validation_mode === "reveal" || data.validation_mode === "test") writeString("validation_mode", data.validation_mode);
  if (typeof data.wrong_penalty === "number" && data.wrong_penalty >= 0 && data.wrong_penalty <= 1) writeString("wrong_penalty", String(data.wrong_penalty));
}

/* ============================================================
   RESET COMPLETO (botón de "borrar todo")
   No lo expongo en la UI por ahora, pero existe por si acaso.
   ============================================================ */
export function resetAll() {
  removeKey("theme");
  removeKey("progress");
  removeKey("starred");
  removeKey("validation");
  removeKey("validation_wip");
  removeKey("colors");
  removeKey("files");
  removeKey("mastery_threshold");
  removeKey("mastery_thresholds");
  removeKey("font_size");
  removeKey("font_size_wide");
  removeKey("validation_mode");
  removeKey("wrong_penalty");
}

/* ============================================================
   Constante exportada por si algún módulo necesita conocer
   el umbral de dominio.
   ============================================================ */
export { MASTERY_THRESHOLD };
