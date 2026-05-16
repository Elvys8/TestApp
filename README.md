# Estudio · App de tests

App web personal para estudiar exámenes tipo test. Carga preguntas desde archivos JSON
organizados por asignatura y tema, las baraja, lleva el progreso (aciertos seguidos =
pregunta dominada), permite revisar/validar preguntas, marcarlas para revisar y consultar
estadísticas.

Funciona sin backend: todo el progreso se guarda en `localStorage` del navegador, y se
puede exportar e importar como archivo JSON.

Especificación técnica completa: ver `ESPECIFICACION.md` (en la carpeta padre del repo).

---

## Cómo abrirlo en local

Los navegadores no permiten cargar **ES modules** con `file://`, así que necesitas un mini
servidor (no vale doble clic en `index.html`):

**Con Python** (preinstalado en macOS):
```
cd estudio-app
python3 -m http.server 8000
```
Abre `http://localhost:8000`.

**Con Node.js**:
```
cd estudio-app
npx serve
```

**Con VS Code**: extensión "Live Server", clic derecho en `index.html` → "Open with Live Server".

---

## Estructura del proyecto

```
estudio-app/
├── index.html
├── README.md
├── .github/workflows/update-manifest.yml   (regenera manifest.json en cada push)
├── css/
│   ├── styles.css       (reset, layout y componentes)
│   └── themes.css       (variables, modo claro/oscuro, acento por asignatura)
├── js/
│   ├── app.js           (entrada, router, render de pantallas)
│   ├── storage.js       (persistencia en localStorage)
│   ├── library.js       (carga y validación de JSONs)
│   ├── test.js          (sesión de test)
│   ├── validation.js    (sesión de validación + edición de preguntas)
│   ├── stats.js         (cálculos de estadísticas)
│   ├── ui.js            (modal, toast, escape, menús, cabecera)
│   └── theme.js         (claro/oscuro)
└── preguntas/
    ├── manifest.json    (lista de archivos JSON a cargar)
    └── *.json           (un archivo por tema)
```

---

## Añadir un tema nuevo

1. Genera el JSON del tema siguiendo el esquema (copia uno existente como plantilla).
   El workflow recomendado para crear preguntas a partir de material está en
   `GENERACION-PREGUNTAS.md`.
2. Guárdalo en `preguntas/`.
3. Añádelo a `preguntas/manifest.json`:
   ```json
   { "files": ["si-6.1.1-arquitectura-cliente-servidor.json", "el-archivo-nuevo.json"] }
   ```
   (Si el repo está en GitHub, la Action `update-manifest.yml` regenera este archivo
   sola en cada push; en local lo editas a mano.)
4. Recarga la app. El tema nuevo aparece en su asignatura.

Alternativa sin tocar archivos: en la pantalla de inicio, botón **+ Cargar JSON** sube un
archivo que queda guardado en `localStorage` (solo en ese navegador).

### Esquema del JSON

```json
{
  "schema_version": 1,
  "id": "identificador-unico-del-archivo",
  "asignatura": "Nombre completo de la asignatura",
  "asignatura_color": "#1C3C6F",
  "tema": "6.1.1 Nombre del tema",
  "preguntas": [
    {
      "id": "prefijo-001",
      "enunciado": "...",
      "opciones": ["a", "b", "c", "d"],
      "correcta": 0,
      "explicacion": ""
    }
  ]
}
```

- `opciones`: **2 o 4** elementos (2 = Verdadero/Falso, 4 = opción múltiple). En el test,
  las de 4 se barajan; las de 2 se muestran en orden.
- `correcta`: índice (0-based) de la opción correcta dentro de `opciones`.
- `asignatura_color`: hex `#RRGGBB`. Todos los temas de una misma asignatura deben usar
  el mismo color (la app avisa por consola si detecta discrepancia).
- `explicacion`: opcional. Si tiene contenido, se muestra al fallar la pregunta en el
  test, al pulsar el icono "i" del test, y en la sesión de validación.
- Los `id` (del archivo y de cada pregunta) deben ser únicos.

---

## Subir a GitHub Pages

Guía detallada con todos los comandos y resolución de problemas: ver `DESPLIEGUE.md`.
Resumen:

1. Crear repo en github.com (público o privado, ambos sirven con Pages).
2. Desde `estudio-app/`:
   ```
   git init && git branch -M main
   git add . && git commit -m "Versión inicial"
   git remote add origin https://github.com/<usuario>/<repo>.git
   git push -u origin main
   ```
3. Settings → Pages → Source "Deploy from a branch" → Branch `main`, carpeta `/ (root)`.
4. La URL será `https://<usuario>.github.io/<repo>/`.
5. Para actualizar: `git add . && git commit -m "..." && git push`.

---

## Notas y limitaciones conocidas

- El progreso vive en el navegador. Para llevarlo a otro navegador o dispositivo, usa
  Exportar / Importar progreso desde la pantalla de Estadísticas.
- Si subes un JSON con un `id` que ya existe, la app lo rechaza. Cambia el `id` o borra
  el anterior antes.
- La validación de temas es opcional (opt-in): por defecto los temas se consideran
  válidos. Se entra a revisar desde el menú "..." de cada tema → "Validar manualmente".
- GitHub Pages distingue mayúsculas/minúsculas en las rutas; macOS no. Si algo carga en
  local pero no en Pages, revisa que los nombres de archivo coincidan exactamente.
