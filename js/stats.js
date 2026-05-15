/* ============================================================
   stats.js
   Cálculos para la pantalla de estadísticas.

   No toca DOM. Devuelve estructuras de datos planas que app.js
   pintará. Todos los porcentajes se devuelven redondeados o como
   `null` si no hay todavía datos sobre los que calcular.
   ============================================================ */

import * as library from "./library.js";
import * as storage from "./storage.js";

function pct(correct, wrong) {
  const total = correct + wrong;
  if (total === 0) return null;
  return Math.round((correct / total) * 100);
}

/* Estadísticas globales sobre toda la biblioteca cargada. */
export function getOverall() {
  const files = library.getAllFiles();
  let totalQuestions = 0;
  let totalMastered = 0;
  let totalCorrect = 0;
  let totalWrong = 0;

  for (const file of files) {
    for (const q of file.preguntas) {
      totalQuestions++;
      const p = storage.getProgress(q.id);
      totalCorrect += p.totalCorrect;
      totalWrong += p.totalWrong;
      if (storage.isMastered(q.id)) totalMastered++;
    }
  }

  return {
    totalQuestions,
    totalMastered,
    totalCorrect,
    totalWrong,
    accuracy: pct(totalCorrect, totalWrong),
  };
}

/* Estadísticas agrupadas por asignatura, con detalle por tema dentro. */
export function getByAsignatura() {
  const files = library.getAllFiles();
  const grouped = {};

  for (const file of files) {
    let temaCorrect = 0;
    let temaWrong = 0;
    let temaMastered = 0;
    for (const q of file.preguntas) {
      const p = storage.getProgress(q.id);
      temaCorrect += p.totalCorrect;
      temaWrong += p.totalWrong;
      if (storage.isMastered(q.id)) temaMastered++;
    }

    if (!grouped[file.asignatura]) {
      grouped[file.asignatura] = {
        name: file.asignatura,
        color: library.resolveAsignaturaColor(file.asignatura),
        temas: [],
        totalQuestions: 0,
        masteredCount: 0,
        totalCorrect: 0,
        totalWrong: 0,
      };
    }
    const g = grouped[file.asignatura];
    g.temas.push({
      id: file.id,
      tema: file.tema,
      questionCount: file.preguntas.length,
      masteredCount: temaMastered,
      totalCorrect: temaCorrect,
      totalWrong: temaWrong,
      accuracy: pct(temaCorrect, temaWrong),
    });
    g.totalQuestions += file.preguntas.length;
    g.masteredCount += temaMastered;
    g.totalCorrect += temaCorrect;
    g.totalWrong += temaWrong;
  }

  return Object.values(grouped).map((g) => ({
    ...g,
    temas: g.temas.sort((a, b) => a.tema.localeCompare(b.tema, "es")),
    accuracy: pct(g.totalCorrect, g.totalWrong),
  })).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/* Top de preguntas más falladas, enriquecido con su enunciado y
   contexto (asignatura + tema). Ignora preguntas que ya no existen
   en la biblioteca (pueden haberse eliminado o renombrado). */
export function getTopFailed(limit = 10) {
  const baseList = storage.getTopFailed(limit * 3); // margen para descartes
  const files = library.getAllFiles();

  // Indexar todas las preguntas por id (con la pregunta completa, para
  // poder mostrarla en el modal de vista previa al hacer clic)
  const idx = new Map();
  for (const file of files) {
    for (const q of file.preguntas) {
      idx.set(q.id, {
        enunciado: q.enunciado,
        opciones: q.opciones,
        correcta: q.correcta,
        explicacion: q.explicacion || "",
        asignatura: file.asignatura,
        tema: file.tema,
        color: library.resolveAsignaturaColor(file.asignatura),
      });
    }
  }

  return baseList
    .map((item) => {
      const meta = idx.get(item.id);
      if (!meta) return null;
      return {
        id: item.id,
        enunciado: meta.enunciado,
        opciones: meta.opciones,
        correcta: meta.correcta,
        explicacion: meta.explicacion,
        asignatura: meta.asignatura,
        tema: meta.tema,
        color: meta.color,
        totalWrong: item.totalWrong,
        totalCorrect: item.totalCorrect,
        accuracy: pct(item.totalCorrect, item.totalWrong),
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}
