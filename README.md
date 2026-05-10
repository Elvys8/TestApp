# Estudio · App de tests

App web personal para estudiar exámenes tipo test. Carga preguntas desde archivos JSON,
los baraja, lleva el progreso (3 aciertos seguidos = pregunta dominada), permite validar
preguntas, marcar para revisar y consultar estadísticas.

Funciona sin backend: todo el progreso se guarda en `localStorage` del navegador.
Se puede exportar e importar como archivo JSON.

---

## Cómo abrirlo en local

Los navegadores modernos no permiten cargar **ES modules** directamente con `file://`,
así que necesitas un mini servidor (no se abre con doble clic en `index.html`).

Tres maneras fáciles, elige la que tengas a mano:

**Con Python** (preinstalado en macOS y Linux):

```
cd estudio-app
python3 -m http.server 8000
```

Luego abre `http://localhost:8000` en el navegador.

**Con Node.js**:

```
cd estudio-app
npx serve
```

(la primera vez te pedirá instalar `serve`, dile que sí). Te dará una URL.

**Con VS Code**: instala la extensión "Live Server", abre la carpeta `estudio-app`,
clic derecho en `index.html` → "Open with Live Server".

---

## Estructura del proyecto

```
estudio-app/
├── index.html
├── css/
│   ├── styles.css       (estilos base y componentes)
│   └── themes.css       (variables y modo claro/oscuro)
├── js/
│   ├── app.js           (entrada y orquestación)
│   ├── storage.js       (persistencia en localStorage)
│   ├── library.js       (carga y validación de JSONs)
│   ├── test.js          (sesión de test)
│   ├── validation.js    (lógica del modo validación)
│   ├── stats.js         (cálculos de estadísticas)
│   ├── ui.js            (utilidades: modal, toast, escape)
│   └── theme.js         (claro/oscuro)
├── preguntas/
│   ├── manifest.json    (lista de archivos oficiales a cargar)
│   └── *.json           (un archivo por tema)
└── README.md
```

---

## Añadir un tema nuevo

1. Genera el JSON del tema siguiendo el esquema (puedes copiar uno de los existentes
   como plantilla).
2. Guárdalo en `preguntas/`.
3. Añade el nombre del archivo a `preguntas/manifest.json`:

   ```json
   {
     "files": [
       "fol-ipei03-autoevaluacion-a.json",
       "el-archivo-nuevo.json"
     ]
   }
   ```

4. Recarga la app. El nuevo tema aparecerá en su asignatura, marcado como
   "Pendiente de validación".

Alternativamente, sin tocar archivos: abre la app, pulsa **+ Cargar JSON** en
la pantalla de inicio y sube el archivo. Quedará guardado en localStorage del
navegador.

### Esquema del JSON

```json
{
  "schema_version": 1,
  "id": "identificador-unico-del-archivo",
  "asignatura": "Nombre completo de la asignatura",
  "asignatura_color": "#2c4a6b",
  "tema": "Nombre del tema",
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

- `correcta` es el índice (0–3) de la opción buena en el array `opciones`.
- `opciones` debe tener **exactamente 4** elementos.
- `asignatura_color` debe ser un hex `#RRGGBB`. Todos los temas de la misma
  asignatura deberían usar el mismo color (la app avisa por consola si no).
- `explicacion` puede quedar vacío. Si tiene contenido, se muestra cuando
  fallas la pregunta.
- Los `id` (del archivo y de cada pregunta) deben ser únicos.

---

## Subir a GitHub Pages

GitHub Pages sirve archivos estáticos gratis. Ideal para esta app.

### 1. Crear un repositorio

En github.com, "New repository". Ponle nombre (por ejemplo `estudio`). Puede ser
público o privado (Pages funciona en ambos en cuentas Free desde 2024).

### 2. Subir los archivos

Desde una terminal, dentro de la carpeta `estudio-app`:

```
git init
git add .
git commit -m "Versión inicial"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

(O si prefieres GitHub Desktop / la interfaz web, sube los archivos como te
sea más cómodo).

### 3. Activar Pages

En el repositorio, pestaña **Settings → Pages**:

- **Source**: "Deploy from a branch".
- **Branch**: `main`, carpeta `/ (root)`.
- Guarda.

GitHub te dará una URL del tipo `https://<tu-usuario>.github.io/<tu-repo>/`.
Tarda 1–2 minutos la primera vez.

### 4. Probar

Abre la URL. Debería cargar igual que en local.

### 5. Actualizar

Cada vez que añadas o cambies algo:

```
git add .
git commit -m "Lo que sea"
git push
```

GitHub Pages republica solo en pocos segundos.

---

## Notas y limitaciones conocidas

- El progreso vive en el navegador. Si cambias de navegador o dispositivo, usa
  Exportar/Importar progreso desde la pantalla de estadísticas.
- Si subes un JSON con un `id` que ya existe, la app lo rechaza. Cambia el `id`
  o borra el anterior antes.
- El modal de validación obliga a elegir explícitamente entre "Sí, está bien" y
  "No, hay que corregir". Si dudas, marca "No": la pregunta seguirá apareciendo
  como pendiente en futuras sesiones y podrás revalidarla más tarde.
# TestApp
