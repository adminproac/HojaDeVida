# Usuarios con contraseña

El inicio de sesión ya no usa GitHub. El usuario y la contraseña viven en la base D1. No vuelva a crear la base ni a cargar `seed.sql`.

Haga esto en PowerShell, en este orden.

1. Abra PowerShell.

2. Entre al proyecto y guarde los cambios locales (el `database_id` de su `wrangler.toml`):

```powershell
cd C:\Personal\Boss\HojaDeVida
git stash
git fetch origin
git checkout cursor/d1-auth-6deb
git pull origin cursor/d1-auth-6deb
git stash pop
```

3. Si `git stash pop` dice que hay un conflicto en `worker\wrangler.toml`, deje esta línea y guarde:

```toml
database_id = "e2af3db8-e3bc-4041-b000-ab837c4e0fce"
```

Ese id ya viene en esta rama. No es un secreto.

4. Entre a la carpeta del Worker y cree la tabla de usuarios:

```powershell
cd worker
wrangler d1 migrations apply hojadevida --remote
```

Confirme con `y` si se lo pide.

5. Cree su usuario administrador. La forma que funciona en PowerShell es pasar la contraseña en la misma línea (se ve en la pantalla; no la guarde en un archivo):

```powershell
node scripts/create-user.mjs edgar "su contraseña"
```

Si prefiere que el script la pregunte, use `node scripts/create-user.mjs edgar` y escríbala cuando aparezca el texto. Si wrangler no arranca solo, el script deja `create-admin.sql` y muestra este comando para copiarlo:

```powershell
wrangler d1 execute hojadevida --remote --file .\create-admin.sql
```

6. Publique el Worker:

```powershell
wrangler deploy
```

7. Abra el pull request en GitHub y fusiónelo usted. El sitio https://adminproac.github.io/HojaDeVida/ pedirá **Usuario** y **Contraseña** después de que Pages termine de publicar.

Los secretos `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` ya no se usan. Puede borrarlos después en Cloudflare. No hace falta borrarlos para que esto funcione.
