/* ============================================================
   storage.js
   Persistencia en localStorage para toda la app.

   Claves utilizadas (todas con prefijo "estudio:"):
     - estudio:theme               → "light" | "dark"
     - estudio:progress            → { [questionId]: { streak, totalCorrect, totalWrong } }
     - estudio:starred             → { [questionId]: true }
     - estudio:validation          → { [fileId]: { status, validatedQuestions: { [qId]: true|false } } }
     - estudio:colors              → { [asignaturaName]: "#hex" }   (override del color del JSON)
     - estudio:files               → { [fileId]: fileObject }       (JSONs subidos manualmente)

   La regla "3 aciertos y desaparece" se evalúa con el campo `streak`
   del objeto de progreso. Cada acierto incrementa streak en 1; cada
   fallo lo resetea a 0. Una pregunta está "dominada" cuando streak >= 3.
   ============================================================ */

const NS = "estudio:";
const MASTERY_THRESHOLD = 3;

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

export function isMastered(questionId) {
  return getProgress(questionId).streak >= MASTERY_THRESHOLD;
}

export function countMastered(questionIds) {
  if (!Array.isArray(questionIds)) return 0;
  const all = getAllProgress();
  let n = 0;
  for (const id of questionIds) {
    if ((all[id]?.streak || 0) >= MASTERY_THRESHOLD) n++;
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
}

/* ============================================================
   Constante exportada por si algún módulo necesita conocer
   el umbral de dominio.
   ============================================================ */
export { MASTERY_THRESHOLD };
