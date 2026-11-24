# Resume Admin — Administrador de hojas de vida

Aplicación web para **consultar, crear, editar y eliminar** hojas de vida guardadas en un archivo JSON bilingüe (inglés / español).
Permite registrar **varias personas**, cada una con su hoja de vida completa.

- **Front-end:** Angular 22 (componentes *standalone*, *signals*, formularios reactivos) con la plantilla gratuita **SB Admin 2** de Start Bootstrap (Bootstrap 4.6, licencia MIT).
- **API:** Node.js + Express 5 (carpeta `server/`), que lee y escribe el archivo `Data/resume-data.json` con escrituras atómicas.
- **Datos:** `Data/resume-data.json` (incluye el bloque `schema` con nombres de campos, tipos, tamaños máximos, formatos y etiquetas EN/ES).

> English version below ⬇

---

## Clonar y ejecutar

Se requiere **Node.js 24.15 o superior**.

```bash
git clone https://github.com/adminproac/HojaDeVida.git
cd HojaDeVida
npm install
npm start
```

GitHub Pages no puede alojar la función de guardar: esa función necesita la API de Node (`server/`), y GitHub Pages solo sirve archivos estáticos.

---

## 1. Requisitos

| Programa | Versión | Descarga |
|---|---|---|
| **Node.js** | **24.15 o superior** (LTS) — también sirve 22.22.3+ o 26.x. Angular 22 exige `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` | https://nodejs.org/es/download (elija la versión **LTS** para Windows, instalador `.msi`) |
| npm | Se instala con Node.js | — |
| Visual Studio Code | Cualquiera reciente | https://code.visualstudio.com/ |
| Navegador | Microsoft Edge o Google Chrome | — |

Compruebe la versión en una terminal (PowerShell o la terminal de VS Code):

```powershell
node -v
npm -v
```

## 2. Instalación (una sola vez)

1. Descomprima el proyecto en `C:\Personal\Boss\Resume` (debe quedar `C:\Personal\Boss\Resume\package.json` y `C:\Personal\Boss\Resume\Data\resume-data.json`).
2. Abra una terminal en esa carpeta e instale las dependencias:

```powershell
cd C:\Personal\Boss\Resume
npm install
```

> No necesita instalar Angular CLI de forma global: el proyecto usa la copia local (`npx ng …`).

## 3. Ejecutar

```powershell
npm start
```

Este comando inicia **dos procesos a la vez** (con `concurrently`):

- **API** en http://localhost:3000/api (lee/escribe el JSON).
- **Angular** en http://localhost:4200 (se abre el navegador automáticamente). Angular reenvía las llamadas `/api` a la API mediante `proxy.conf.json`.

Para detener: `Ctrl + C` en la terminal.

Otros comandos útiles:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Igual que `npm start`, pero reinicia la API automáticamente si cambia su código. |
| `npm run serve` | API + Angular sin abrir el navegador (lo usa VS Code). |
| `npm run api` | Solo la API. |
| `npm run build` | Compila Angular en `dist/`. |
| `npm run start:prod` | Compila y sirve todo desde la API en http://localhost:3000 (sin `ng serve`). |
| `npm run backup` | Crea una copia de seguridad del JSON en `Data\backups\`. |

## 4. Ejecutar y depurar desde Visual Studio Code

1. `Archivo > Abrir carpeta…` → `C:\Personal\Boss\Resume`.
2. Acepte instalar las **extensiones recomendadas** (Angular Language Service, ESLint, Prettier, EditorConfig).
3. Ejecute `npm install` en la terminal de VS Code (`Ctrl + ñ` o `Ver > Terminal`) si no lo ha hecho.
4. Vaya a **Ejecutar y depurar** (`Ctrl + Shift + D`) y elija:
   - **1. Todo: API + Angular (Edge)** o **2. … (Chrome)** → inicia API + Angular y abre el navegador con depuración (puntos de interrupción en los `.ts`).
   - **3. Depurar API (Node)** → depura `server/index.js`.
   - **5. Depurar API + Angular** → depura ambos a la vez.
5. Presione **F5**.

También puede usar `Terminal > Ejecutar tarea…` → **npm: serve (API + Angular)**, **npm: build** o **npm: backup**.

## 5. ¿Dónde está la información?

- Archivo: **`C:\Personal\Boss\Resume\Data\resume-data.json`**.
- Cada cambio hecho en la página se guarda **inmediatamente** en ese archivo (la API escribe un archivo temporal y luego lo renombra, así el JSON nunca queda a medio escribir).
- Si edita el JSON a mano mientras la app está abierta, use el menú **Recargar desde el archivo**.
- Para usar otro archivo, defina la variable `DATA_FILE` antes de iniciar, p. ej. en PowerShell: `$env:DATA_FILE="D:\otra\ruta\datos.json"; npm start`.
- Puerto de la API distinto: `$env:PORT=3001` (y cambie `target` en `proxy.conf.json`).

### Estructura del JSON

```text
{
  "meta":   { schemaVersion, defaultLanguage, supportedLanguages, lastUpdated, … },
  "schema": { conventions, person, profile, sections: { summary, experience, … } },
  "people": [
    {
      "id", "createdAt", "updatedAt",
      "profile": { fullName, headline{en,es}, email, phone, location{en,es}, website, photoUrl },
      "summary":         [ { id, order, text{en,es} } ],
      "experience":      [ { id, order, company, title{en,es}, location{en,es}, startDate, endDate, isCurrent, dateLabel{en,es}, highlights[ {id, order, text{en,es}} ] } ],
      "otherExperience": [ … igual que experience … ],
      "education":       [ { id, order, institution{en,es}, credential{en,es}, location{en,es}, startDate, endDate, isCurrent, dateLabel{en,es} } ],
      "skills":          [ { id, order, category{en,es}, items[ {id, order, name{en,es}} ] } ],
      "languages":       [ { id, order, name{en,es}, level{en,es} } ],
      "certifications":  [ { id, order, name{en,es}, issuer, date, url } ],
      "additionalInfo":  [ { id, order, text{en,es} } ]
    }
  ]
}
```

- Los textos legibles se guardan como `{ "en": "...", "es": "..." }`.
- Fechas: `AAAA-MM` (p. ej. `2022-08`). Marcas de tiempo: ISO 8601.
- El bloque `schema` documenta cada campo: `key`, `type`, `required`, `maxLength` (tamaño), `format`, `pattern`, `localized` y `label {en, es}`. La página **Esquema de datos** lo muestra en tablas. Los formularios y la API validan con estas mismas reglas.

## 6. Copias de seguridad

- Desde la app: menú **Respaldar JSON** (crea `Data\backups\resume-data-AAAAMMDD-HHMMSS.json`).
- Desde la terminal: `npm run backup`.
- Manual: copie `Data\resume-data.json` a otra carpeta, a OneDrive o a una memoria USB.
- Para restaurar: detenga la app, reemplace `Data\resume-data.json` por la copia y vuelva a ejecutar `npm start`.

## 7. Uso rápido

- **Tablero:** totales (personas, experiencias, habilidades, estudios) y habilidades por categoría.
- **Personas:** buscar, ver, editar perfil, eliminar (con confirmación) y **Nueva persona**.
- **Hoja de vida:** cada sección tiene **Agregar**, y cada registro tiene **Subir / Bajar / Editar / Eliminar**.
- **Idioma:** botones **ES / EN** en la barra superior; cambian los textos de la interfaz y el contenido mostrado.
- Los formularios muestran los campos en español e inglés lado a lado, con contador de caracteres y enlaces "Copiar ES → EN".

## 8. Plantilla: SB Admin 2 (gratuita, MIT)

El diseño usa **[SB Admin 2](https://startbootstrap.com/theme/sb-admin-2) v4.1.4** de **Start Bootstrap**, una plantilla gratuita para Bootstrap 4 publicada con **licencia MIT** (Copyright © 2013-2021 Start Bootstrap LLC).

- Su hoja de estilos compilada está en `src/vendor/sb-admin-2/sb-admin-2.min.css` (ya incluye Bootstrap 4.6) junto con su archivo de licencia `src/vendor/sb-admin-2/LICENSE`.
- Se reproduce su estructura: barra lateral con degradado y logo, menú desplegable (*collapse*), botón para contraer la barra, barra superior, tarjetas con borde izquierdo de color, tablas, formularios, pie de página y botón "volver arriba".
- **No usa jQuery:** el comportamiento del script original (`sb-admin-2.js`: contraer la barra lateral, abrir/cerrar menús, ajuste en pantallas pequeñas) se reimplementó en Angular (`src/app/app.ts`).
- Íconos: Font Awesome Free 5 (como la plantilla original) y Bootstrap Icons. Fuente: Nunito (paquete `@fontsource/nunito`, funciona sin internet).
- Estilos propios de la aplicación: `src/styles.scss` (usa la misma paleta de SB Admin 2).

## 9. Estructura del proyecto

```text
Resume/
├─ Data/resume-data.json      ← datos (y Data/backups/ para copias)
├─ server/                    ← API Node/Express (index.js, store.js, validate.js)
├─ scripts/backup.js          ← npm run backup
├─ src/vendor/sb-admin-2/      ← CSS de SB Admin 2 + LICENSE (MIT)
├─ src/app/
│  ├─ core/                   ← modelos, servicios (API, store, idioma), validación de formularios
│  ├─ shared/                 ← formulario dinámico, campos, diálogo de confirmación, notificaciones
│  └─ pages/                  ← tablero, personas, hoja de vida, formularios, esquema
├─ proxy.conf.json            ← /api → http://localhost:3000
├─ angular.json, package.json, tsconfig*.json
└─ .vscode/                   ← launch.json, tasks.json, extensions.json
```

## 10. Problemas comunes

- **"No se puede conectar con la API"**: ejecute `npm start` (no solo `ng serve`), o verifique que nada más use el puerto 3000.
- **El puerto 4200 está ocupado**: cierre la otra instancia o ejecute `npx ng serve --port 4300` junto con `npm run api`.
- **Error de versión de Node**: instale la versión LTS indicada arriba y vuelva a ejecutar `npm install`.
- **`npm install` advierte sobre "install-scripts"**: es informativo; si `ng build` falla por *esbuild*, ejecute `npm rebuild esbuild`.

---

# English

**Résumé Admin** is a web app to **view, create, edit and delete** résumés stored in a bilingual (English/Spanish) JSON file, supporting **multiple people**.

- **Front-end:** Angular 22 (standalone components, signals, reactive forms) with the free **SB Admin 2** template by Start Bootstrap (Bootstrap 4.6, MIT).
- **API:** Node.js + Express 5 in `server/`, reading/writing `Data/resume-data.json` with atomic writes (temp file + rename).
- **Data:** `Data/resume-data.json`, including a `schema` block that documents every field (type, required, maxLength, format, bilingual labels).

### Requirements
- **Node.js 24.15+ LTS** (22.22.3+ or 26.x also work — Angular 22 requires `^22.22.3 || ^24.15.0 || >=26.0.0`): https://nodejs.org/en/download
- Visual Studio Code, Edge or Chrome.

### Install & run
```powershell
cd C:\Personal\Boss\Resume
npm install
npm start          # API on :3000 + Angular on :4200 (opens the browser)
```
Other scripts: `npm run dev` (API auto-restart), `npm run serve` (no browser), `npm run build`, `npm run start:prod` (serve the built app from the API on :3000), `npm run backup`.

### VS Code
Open the folder, accept the recommended extensions, run `npm install`, then **Run and Debug** (`Ctrl+Shift+D`) → *1. Todo: API + Angular (Edge)* / *2. (Chrome)* / *3. Depurar API (Node)* / *5. compound*, and press **F5**.

### Data file & backups
- Every change is written immediately to `Data\resume-data.json`. Use **Reload from file** after editing it by hand.
- Back up with the **Back up JSON** menu item or `npm run backup` (→ `Data\backups\`), or copy the file manually. Restore by stopping the app and replacing the file.
- Override the file with `DATA_FILE` and the API port with `PORT` (update `proxy.conf.json` accordingly).

### REST API (http://localhost:3000/api)
| Method | Route | Description |
|---|---|---|
| GET | `/health` | Status and data-file path |
| GET | `/data` · `/schema` | Whole document · schema only |
| GET | `/people?q=` | List / search people |
| POST | `/people` | Create a person `{ profile }` |
| GET | `/people/:id` | One person |
| PUT | `/people/:id/profile` | Update profile `{ profile }` |
| DELETE | `/people/:id` | Delete a person |
| GET / POST | `/people/:id/:section` | List / add items (`summary`, `experience`, `otherExperience`, `education`, `skills`, `languages`, `certifications`, `additionalInfo`) |
| GET / PUT / DELETE | `/people/:id/:section/:itemId` | Read / update / delete an item |
| POST | `/people/:id/:section/:itemId/move` | `{ "direction": "up" \| "down" }` |
| POST | `/backup` | Create a backup copy |

Validation errors return `400` with `{ message, errors: [{ path, code, message }] }`.

### Theme credit
UI theme: **[SB Admin 2](https://startbootstrap.com/theme/sb-admin-2) v4.1.4** by **Start Bootstrap** — MIT License, Copyright (c) 2013-2021 Start Bootstrap LLC. The compiled CSS (which bundles Bootstrap 4.6) and its `LICENSE` live in `src/vendor/sb-admin-2/`. Its jQuery script is not used; the sidebar toggle and collapsible menu are reimplemented in Angular (`src/app/app.ts`). Icons: Font Awesome Free 5 and Bootstrap Icons; font: Nunito via `@fontsource/nunito`.
