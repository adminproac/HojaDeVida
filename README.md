# Resume Admin — Administrador de hojas de vida

Aplicación web para **consultar, crear, editar y eliminar** hojas de vida guardadas en un archivo JSON bilingüe (inglés / español).
Permite registrar **varias personas**, cada una con su hoja de vida completa.

- **Front-end:** Angular 22 (componentes *standalone*, *signals*, formularios reactivos) con la plantilla gratuita **SB Admin 2** de Start Bootstrap (Bootstrap 4.6, licencia MIT).
- **API:** Node.js + Express 5 (carpeta `server/`), que lee y escribe el archivo `Data/resume-data.json` con escrituras atómicas.
- **Datos:** `Data/resume-data.json` guarda solo los datos (`meta` y `people`). Los tipos, tamaños y etiquetas están en la aplicación (`src/app/core/resume-schema.json`).

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

La versión publicada está en https://adminproac.github.io/HojaDeVida/. Para guardar desde esa página hay que **iniciar sesión con GitHub**. No se pega ningún token. Los pasos están en la sección siguiente.

---

## Sitio en vivo e inicio de sesión con GitHub

La aplicación publicada está en **https://adminproac.github.io/HojaDeVida/**.

En el repositorio, **Settings → Pages → Build and deployment → Source** debe ser **GitHub Actions**. Cada push a `main` compila Angular con `--base-href /HojaDeVida/` y publica el sitio.

El sitio elige el modo solo:

- Si la API local responde (por ejemplo con `npm start` en su equipo), cada cambio se guarda como hasta ahora: la API de Node escribe `Data/resume-data.json`.
- Si no hay API (GitHub Pages), la página entra en **modo GitHub**. Lee `Data/resume-data.json` del repositorio. Al iniciar sesión, GitHub entrega un token que **solo vive en la memoria de esa pestaña**. Con ese token, cada alta, edición o eliminación hace un commit del JSON en `main`.

Ese commit vuelve a publicar el sitio. No hace falta esperar la publicación: la página muestra los datos nuevos en cuanto el commit termina.

Quién puede editar: una cuenta de GitHub con **permiso push** en `adminproac/HojaDeVida`. Las demás ven «No tienes permiso para editar». El alcance pedido es `public_repo` porque el repositorio es público. Si el repositorio pasa a ser **privado**, hay que cambiar `oauthScope` a `repo` en `src/environments/environment.ts` (y el build de Pages usa el mismo valor).

Hasta que configure la OAuth App y el Worker, la página muestra: **Falta configurar el inicio de sesión con GitHub (ver README)**. No se rompe.

### a) Crear la OAuth App de GitHub (sitio en vivo)

1. Abra https://github.com/settings/applications/new (iniciado como el dueño del repositorio).
2. Rellene **exactamente** estos valores:
   - **Application name:** `Hoja de vida`
   - **Homepage URL:** `https://adminproac.github.io/HojaDeVida/`
   - **Authorization callback URL:** `https://adminproac.github.io/HojaDeVida/auth/callback`
3. Pulse **Register application**.
4. Copie el **Client ID**. Lo va a pegar en dos sitios: la variable `OAUTH_CLIENT_ID` del repositorio y el secreto `GITHUB_CLIENT_ID` de Cloudflare.
5. Pulse **Generate a new client secret** y copie el **Client Secret** en ese momento. Solo va al secreto `GITHUB_CLIENT_SECRET` de Cloudflare (y, si prueba en su PC, al archivo `.env`). **No** lo pegue en el código, en el JSON, ni en una variable de GitHub Actions.

GitHub solo guarda **un** callback por aplicación. La de arriba es la del sitio publicado. Para probar en su computadora hace falta **otra** OAuth App, con:

- **Homepage URL:** `http://localhost:4200/`
- **Authorization callback URL:** `http://localhost:4200/auth/callback`

Ese segundo Client ID y su secreto van solo en `.env`.

### b) Publicar el proxy en Cloudflare (gratis)

El navegador no puede canjear el código de GitHub: el secreto no puede estar en la página. Un Worker hace solo ese canje (`POST /api/oauth/exchange`) y devuelve el token. No lo guarda ni lo escribe en registros.

1. Cree una cuenta gratis en https://dash.cloudflare.com/sign-up
2. En su computadora, con Node.js instalado:

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler deploy
```

3. Cuando pida cada secreto, pegue el valor de la OAuth App del **sitio en vivo** y pulse Enter. No quedan en el repositorio.
4. Al terminar, `wrangler deploy` muestra una dirección como `https://hojadevida-oauth.<su-subdominio>.workers.dev`. Cópiela **sin** barra al final y **sin** `/api/...`. Esa dirección es `OAUTH_PROXY_URL`.

### c) Variables del repositorio (no hace falta editar código)

En GitHub: repositorio **adminproac/HojaDeVida** → **Settings** → **Secrets and variables** → **Actions** → pestaña **Variables** → **New repository variable**.

| Nombre | Valor |
|---|---|
| `OAUTH_CLIENT_ID` | El Client ID de la OAuth App del sitio en vivo |
| `OAUTH_PROXY_URL` | La dirección `https://hojadevida-oauth.<su-subdominio>.workers.dev` |
| `OAUTH_ALLOWED_LOGINS` | Opcional. Logins de GitHub separados por coma. Si la deja vacía o no la crea, entra cualquiera con permiso push |

El **Client Secret no es una variable**. Si faltan `OAUTH_CLIENT_ID` o `OAUTH_PROXY_URL`, el workflow avisa y el sitio se publica con el mensaje «Falta configurar el inicio de sesión con GitHub (ver README)». Cuando las cree, haga un push a `main` (o vuelva a ejecutar el workflow **Deploy to GitHub Pages**) para que el botón **Iniciar sesión con GitHub** aparezca.

### d) Modo local (`.env`)

```bash
cp .env.example .env
```

Edite `.env` con el Client ID y el Client Secret de la OAuth App de **localhost** (la segunda). Opcional: `GITHUB_ALLOWED_LOGINS=su-usuario`. Luego `npm start`. La API lee `.env` y la página, en http://localhost:4200/, ofrece el mismo botón. El archivo `.env` está en `.gitignore`.

El botón **Iniciar sesión con GitHub** es lo único que abre la pantalla de GitHub. Recargar la página no pide autorización otra vez: el token queda en `sessionStorage` de esa pestaña (no en `localStorage`). **Cerrar sesión** lo borra y deja la dirección sin `?code` ni `?state`. Si no usa la página durante **5 minutos**, pasa lo mismo; un aviso aparece 30 segundos antes. Mover el mouse, escribir, hacer clic o cambiar de página renueva el plazo. Una pestaña nueva sí pide iniciar sesión. Si un intento falla porque el código ya se usó, la página lo reintenta una vez sola y, si sigue fallando, muestra **Reintentar**.

---

## Cargar una hoja de vida (PDF)

En el menú está **Cargar hoja de vida (PDF)**. Elija un archivo PDF. La lectura ocurre en el navegador (también en GitHub Pages; no hace falta un servidor):

1. Se extrae el texto del PDF.
2. Se reconocen el nombre, el correo, el teléfono y LinkedIn, y secciones en español o inglés (Resumen, Experiencia, Educación, Habilidades, Idiomas, Certificaciones, y sus equivalentes en inglés).
3. Aparece una **revisión editable** con los mismos formularios de la aplicación. Corrija lo que haya quedado mal.
4. Guarde como **persona nueva**, o elija una persona existente y confirme para reemplazarla. El guardado usa la API local (`npm start`) o, en GitHub Pages, un commit del JSON con la sesión de GitHub.

Límites:

- Un PDF escaneado o hecho solo de imágenes **no tiene texto** y no se puede importar.
- El resultado es una aproximación. Hay que revisarlo antes de guardar.
- El idioma del PDF llena los campos bilingües. Si el campo es obligatorio, el otro idioma recibe la misma copia para poder guardar; si es opcional, el otro idioma queda vacío.
- Los textos se recortan al tamaño máximo del esquema. Diseños muy distintos (varias columnas, tablas) pueden mezclar secciones.

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
- El archivo **no** incluye tipos ni tamaños. Solo `meta` (versión, idioma) y `people` (los datos, incluidos `id`, `createdAt`, `updatedAt` y `order`).
- Las reglas de cada campo (`type`, `required`, `maxLength`, `format`, etiquetas EN/ES) están en `src/app/core/resume-schema.json`. La página **Esquema de datos** las muestra. Los formularios y la API validan con esas reglas.
- Si abre un archivo antiguo que todavía trae `schema` o `users`, la aplicación los ignora y los quita en el siguiente guardado. Las personas no se modifican.

## Inicio de sesión

Antes de las demás pantallas la aplicación muestra **Iniciar sesión con GitHub**. El repositorio y el JSON son **públicos**: el inicio de sesión controla quién usa la aplicación para editar; no oculta los datos. Cualquiera puede leer `Data/resume-data.json`.

No hay usuarios ni contraseñas dentro del JSON. La cuenta es la de GitHub, y solo entra quien tenga permiso push en `adminproac/HojaDeVida`. El botón **Cerrar sesión** está en la barra superior (con el nombre de GitHub) y al final de la barra lateral.

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
├─ Data/resume-data.json      ← solo datos: meta + people (y Data/backups/ para copias)
├─ worker/                    ← proxy de Cloudflare que canjea el código OAuth
├─ server/                    ← API Node/Express (index.js, store.js, validate.js)
├─ scripts/backup.js          ← npm run backup
├─ src/vendor/sb-admin-2/      ← CSS de SB Admin 2 + LICENSE (MIT)
├─ src/app/
│  ├─ core/                   ← modelos, resume-schema.json, servicios (API, store, idioma)
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
- **Data:** `Data/resume-data.json` stores only `meta` and `people`. Field types, sizes and labels live in `src/app/core/resume-schema.json`.

### Requirements
- **Node.js 24.15+ LTS** (22.22.3+ or 26.x also work — Angular 22 requires `^22.22.3 || ^24.15.0 || >=26.0.0`): https://nodejs.org/en/download
- Visual Studio Code, Edge or Chrome.

### Install & run
```powershell
cd C:\Personal\Boss\Resume
npm install
npm start          # API on :3000 + Angular on :4200 (opens the browser)
```

Live site: https://adminproac.github.io/HojaDeVida/. Sign in with GitHub (no pasted token). The access token stays in memory for the session. See the Spanish section for the OAuth App, the Cloudflare Worker, and the repository variables `OAUTH_CLIENT_ID` and `OAUTH_PROXY_URL`. Scope is `public_repo` while the repository is public; a private repository would need `repo`.
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
| GET | `/oauth/config` | Public Client ID for local sign-in (never the secret) |
| POST | `/oauth/exchange` | Exchange `{ code, state }` for a GitHub token. Writes otherwise require that token and `permissions.push` |
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
