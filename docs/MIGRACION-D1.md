# Pasar las hojas de vida a Cloudflare D1

Si el seed remoto falló con `BEGIN TRANSACTION`, no vuelva a crear la base ni a aplicar las migraciones. Solo esto:

```powershell
cd C:\Personal\Boss\HojaDeVida
git checkout cursor/cloudflare-d1-6deb
git pull origin cursor/cloudflare-d1-6deb
cd worker
wrangler d1 execute hojadevida --remote --file=.\seed.sql
```

El resto de esta página es la primera vez, en orden. No hace falta un secreto nuevo: los de GitHub que ya puso en el Worker siguen igual.

La rama es `cursor/cloudflare-d1-6deb`. El sitio en vivo no cambia hasta que esa rama se fusione.

1. Abra PowerShell.

2. Entre a la carpeta del proyecto:

```powershell
cd C:\Personal\Boss\HojaDeVida
```

3. Traiga la rama y ábrala:

```powershell
git fetch origin
git checkout cursor/cloudflare-d1-6deb
```

4. Entre a la carpeta del Worker:

```powershell
cd worker
```

5. Cree la base (una sola vez):

```powershell
wrangler d1 create hojadevida
```

6. En la respuesta, copie el valor `database_id`. Abra `worker\wrangler.toml`. Busque esta línea:

```toml
database_id = "00000000-0000-0000-0000-000000000000"
```

Sustituya los ceros por ese id. Guarde el archivo. No lo suba a Git si no quiere; `wrangler deploy` usa el archivo de su disco.

7. Cree las tablas en Cloudflare:

```powershell
wrangler d1 migrations apply hojadevida --remote
```

Confirme con `y` si se lo pide.

8. Cargue las personas que ya están en el JSON:

```powershell
wrangler d1 execute hojadevida --remote --file=.\seed.sql
```

9. Publique el Worker (el mismo nombre `hojadevida-oauth`):

```powershell
wrangler deploy
```

Listo. Cuando la rama se fusione con `main`, la página https://adminproac.github.io/HojaDeVida/ leerá y guardará en esta base. Hasta entonces el sitio publicado sigue como está.

Si el paso 5 dice que la base ya existe, no la cree otra vez. Siga en el paso 6 con el `database_id` que ya tiene.
