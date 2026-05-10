/* ============================================================
   library.js
   Carga, validación y consulta de los archivos JSON de preguntas.

   Hay dos orígenes:
     - "official": archivos servidos desde /preguntas que aparecen en
       /preguntas/manifest.json. Se cargan por fetch al iniciar.
     - "custom":   archivos que el usuario ha subido a través de la
       interfaz; viven en localStorage y los gestiona storage.js.

   Este módulo NO toca localStorage directamente: para los archivos
   custom delega en storage.js, y para el color efectivo de cada
   asignatura combina el del JSON con el override del usuario.
   ============================================================ */

import * as storage from "./storage.js";

const MANIFEST_PATH = "preguntas/manifest.json";
const QUESTIONS_DIR = "preguntas/";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

let _files = [];          // Array<FileObject> normalizado: incluye _source
let _initialized = false;
let _initPromise = null;

/* ============================================================
   VALIDACIÓN DEL ESQUEMA JSON
   Devuelve { ok: boolean, errors: string[] } sin lanzar excepciones.
   ============================================================ */
export function validateSchema(json) {
  const errors = [];

  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, errors: ["El contenido no es un objeto JSON válido"] };
  }

  if (typeof json.id !== "string" || !json.id.trim()) {
    errors.push("Falta el campo 'id' (string no vacío)");
  }
  if (typeof json.asignatura !== "string" || !json.asignatura.trim()) {
    errors.push("Falta el campo 'asignatura' (string no vacío)");
  }
  if (typeof json.tema !== "string" || !json.tema.trim()) {
    errors.push("Falta el campo 'tema' (string no vacío)");
  }
  if (typeof json.asignatura_color !== "string" || !HEX_RE.test(json.asignatura_color)) {
    errors.push("Falta o es inválido 'asignatura_color' (debe ser hex #RRGGBB)");
  }

  if (!Array.isArray(json.preguntas) || json.preguntas.length === 0) {
    errors.push("'preguntas' debe ser un array con al menos una pregunta");
  } else {
    const seenIds = new Set();
    json.preguntas.forEach((q, i) => {
      const tag = `Pregunta ${i + 1}`;
      if (!q || typeof q !== "object") {
        errors.push(`${tag}: no es un objeto`);
        return;
      }
      if (typeof q.id !== "string" || !q.id.trim()) {
        errors.push(`${tag}: falta 'id'`);
      } else if (seenIds.has(q.id)) {
        errors.push(`${tag}: id duplicado '${q.id}'`);
      } else {
        seenIds.add(q.id);
      }
      if (typeof q.enunciado !== "string" || !q.enunciado.trim()) {
        errors.push(`${tag}: falta 'enunciado'`);
      }
      if (!Array.isArray(q.opciones) || q.opciones.length !== 4) {
        errors.push(`${tag}: 'opciones' debe tener exactamente 4 elementos`);
      } else if (q.opciones.some((o) => typeof o !== "string" || !o.trim())) {
        errors.push(`${tag}: alguna opción está vacía o no es texto`);
      }
      if (typeof q.correcta !== "number" || !Number.isInteger(q.correcta) ||
          q.correcta < 0 || q.correcta > 3) {
        errors.push(`${tag}: 'correcta' debe ser un entero entre 0 y 3`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/* ============================================================
   INICIALIZACIÓN
   - Lee manifest.json
   - Descarga cada archivo oficial y lo valida
   - Lee los archivos custom de localStorage
   Idempotente: llamar varias veces es seguro.
   ============================================================ */
export function init() {
  if (_initialized) return Promise.resolve();
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _files = [];
    await loadOfficialFiles();
    loadCustomFiles();
    detectColorConflicts();
    _initialized = true;
  })();
  return _initPromise;
}

async function loadOfficialFiles() {
  let manifest;
  try {
    const res = await fetch(MANIFEST_PATH, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    manifest = await res.json();
  } catch (e) {
    console.warn("[library] no se pudo leer manifest.json:", e);
    return;
  }

  const filenames = Array.isArray(manifest?.files) ? manifest.files : [];
  for (const filename of filenames) {
    try {
      const res = await fetch(QUESTIONS_DIR + filename, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const v = validateSchema(json);
      if (!v.ok) {
        console.warn(`[library] ${filename} no pasó validación:`, v.errors);
        continue;
      }
      _files.push({ ...json, _source: "official", _filename: filename });
    } catch (e) {
      console.warn(`[library] no se pudo cargar ${filename}:`, e);
    }
  }
}

function loadCustomFiles() {
  const custom = storage.getCustomFiles();
  for (const fileId in custom) {
    const json = custom[fileId];
    const v = validateSchema(json);
    if (!v.ok) {
      console.warn(`[library] custom ${fileId} no pasa validación:`, v.errors);
      continue;
    }
    _files.push({ ...json, _source: "custom" });
  }
}

/* Si dos archivos de la misma asignatura traen colores distintos,
   avisamos por consola. Se respeta el primero que se haya cargado. */
function detectColorConflicts() {
  const seen = {};
  for (const f of _files) {
    if (seen[f.asignatura] && seen[f.asignatura] !== f.asignatura_color) {
      console.warn(
        `[library] conflicto de color en '${f.asignatura}': ` +
        `${seen[f.asignatura]} vs ${f.asignatura_color}. ` +
        `Se usará el primero encontrado.`
      );
    } else if (!seen[f.asignatura]) {
      seen[f.asignatura] = f.asignatura_color;
    }
  }
}

/* ============================================================
   CONSULTAS
   ============================================================ */

/* Devuelve la lista de asignaturas con sus contadores agregados.
   Cada elemento:
     {
       name, color, defaultColor,
       temaCount, questionCount, masteredCount,
       hasPending: boolean   // hay algún tema "Pendiente de validación"
     }
*/
export function getAsignaturas() {
  const grouped = groupByAsignatura();
  return Object.values(grouped).map((g) => {
    const allIds = g.temas.flatMap((t) => t.preguntas.map((q) => q.id));
    const override = storage.getAsignaturaColor(g.name);
    return {
      name: g.name,
      color: override || g.defaultColor,
      defaultColor: g.defaultColor,
      temaCount: g.temas.length,
      questionCount: allIds.length,
      masteredCount: storage.countMastered(allIds),
      hasPending: g.temas.some((t) => !storage.isFileValidated(t.id)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/* Devuelve una asignatura concreta con la lista de sus temas y los
   contadores de cada uno. null si no existe. */
export function getAsignatura(name) {
  if (!name) return null;
  const temas = _files.filter((f) => f.asignatura === name);
  if (temas.length === 0) return null;
  const override = storage.getAsignaturaColor(name);
  const defaultColor = temas[0].asignatura_color;
  return {
    name,
    color: override || defaultColor,
    defaultColor,
    temas: temas.map((t) => {
      const ids = t.preguntas.map((q) => q.id);
      return {
        id: t.id,
        tema: t.tema,
        source: t._source,
        questionCount: ids.length,
        masteredCount: storage.countMastered(ids),
        isValidated: storage.isFileValidated(t.id),
      };
    }).sort((a, b) => a.tema.localeCompare(b.tema, "es")),
  };
}

/* Devuelve el archivo completo (con todas sus preguntas) por su id.
   null si no existe. */
export function getTema(fileId) {
  if (!fileId) return null;
  return _files.find((f) => f.id === fileId) || null;
}

/* Lista plana de todos los archivos cargados (uso interno y para stats). */
export function getAllFiles() {
  return _files.slice();
}

/* Color efectivo de una asignatura (override del usuario o el del JSON). */
export function resolveAsignaturaColor(name) {
  const override = storage.getAsignaturaColor(name);
  if (override) return override;
  const file = _files.find((f) => f.asignatura === name);
  return file ? file.asignatura_color : null;
}

/* ============================================================
   AÑADIR / QUITAR ARCHIVOS CUSTOM
   ============================================================ */

/* Acepta el texto de un JSON o un objeto ya parseado.
   Devuelve { ok, fileObject?, errors? }. */
export function addCustomFile(input) {
  let json;
  if (typeof input === "string") {
    try {
      json = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: ["JSON mal formado: " + e.message] };
    }
  } else if (input && typeof input === "object") {
    json = input;
  } else {
    return { ok: false, errors: ["Entrada no válida"] };
  }

  const v = validateSchema(json);
  if (!v.ok) return { ok: false, errors: v.errors };

  if (_files.some((f) => f.id === json.id)) {
    return { ok: false, errors: [`Ya existe un archivo con id '${json.id}'`] };
  }

  storage.saveCustomFile(json);
  _files.push({ ...json, _source: "custom" });
  detectColorConflicts();
  return { ok: true, fileObject: json };
}

export function removeCustomFile(fileId) {
  const idx = _files.findIndex((f) => f.id === fileId && f._source === "custom");
  if (idx === -1) return false;
  _files.splice(idx, 1);
  storage.deleteCustomFile(fileId);
  return true;
}

/* ============================================================
   HELPERS INTERNOS
   ============================================================ */

function groupByAsignatura() {
  const grouped = {};
  for (const f of _files) {
    if (!grouped[f.asignatura]) {
      grouped[f.asignatura] = {
        name: f.asignatura,
        defaultColor: f.asignatura_color,
        temas: [],
      };
    }
    grouped[f.asignatura].temas.push(f);
  }
  return grouped;
}
