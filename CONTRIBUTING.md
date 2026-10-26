# Cómo colaborar en Whole Platport Lite

Guía para quien se suma al proyecto. Si algo de aquí no funciona, abre un issue o avisa en el PR.

## 1. Requisitos

| Herramienta | Para qué | Comprobar |
| --- | --- | --- |
| [Git](https://git-scm.com/) | clonar y subir cambios | `git --version` |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS) o Docker Engine (Linux) | correr la app y la base | `docker compose version` |
| Node.js 22 y pnpm 12.3.4 *(opcional)* | correr pruebas o `pnpm dev` fuera de Docker | `node -v` · `npm install -g pnpm@12.3.4` |

En Windows, abre Docker Desktop antes de usar `docker`.

## 2. Primer arranque (5 minutos)

```powershell
git clone https://github.com/BOWadapter/wholeplatport.git
cd wholeplatport
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1   # Windows
# ./scripts/setup.sh                                         # Linux / macOS / WSL
docker compose up -d --build
```

- El script crea tu `.env`: te pide un usuario y una contraseña para entrar a la app, y genera solo los secretos (`AUTH_SECRET`, `POSTGRES_PASSWORD`).
- Abre http://localhost:3000 y entra con ese usuario y contraseña.

**Tu `.env` es tuyo.** Cada persona tiene el suyo, nunca se sube al repo (está en `.gitignore`) y no hace falta compartirlo. Si necesitas cambiar algo, edítalo o vuelve a correr el script con `-Force` / `--force`.

Comandos útiles:

```bash
docker compose logs -f app                 # ver el servidor
docker compose exec db psql -U wpl -d wpl  # consola SQL de la base
docker compose down                        # detener (conserva los datos)
docker compose down -v                     # detener y BORRAR la base
docker compose up -d --build               # reconstruir después de un git pull
```

## 3. Flujo de trabajo

`main` está protegida: solo cambia por pull request con el CI en verde.

```bash
git checkout main && git pull                 # parte siempre de main actualizado
git checkout -b feature/nombre-corto          # o fix/..., docs/..., chore/...
# ... cambios ...
pnpm test                                     # o deja que lo corra el CI
git add -A && git commit -m "feat(riesgo): describe el cambio"
git push -u origin feature/nombre-corto
```

Luego abre el PR en GitHub. El CI corre tipos, pruebas (con PostgreSQL), build e imagen Docker. Cuando esté en verde y alguien lo revise, se fusiona.

**Commits** con [Conventional Commits](https://www.conventionalcommits.org/es/) y alcance por capa: `feat(db): ...`, `fix(auth): ...`, `docs: ...`, `test(riesgo): ...`, `chore(deps): ...`.

**Ramas:** una rama por cambio, de vida corta. Si `main` avanzó mientras trabajabas: `git pull --rebase origin main`.

## 4. Reglas del proyecto

1. **Regla → código → prueba.** Toda regla de negocio nueva lleva un ID (`RN-12`, …), una prueba de aceptación (`PA-11`, …) y su fila en la tabla de trazabilidad del README.
2. **Nada de secretos en el repo**: ni claves, ni contraseñas, ni `.env`. Si alguno se sube por error, avisa y se rota de inmediato.
3. **Todo es simulado (RN-1).** No se conecta a exchanges reales ni se agregan campos para API keys.
4. **El motor (`lib/`) es puro**: la UI y las pruebas usan las mismas funciones. No pongas reglas de negocio dentro de los componentes.
5. **Esquema de datos:** para cambiarlo, agrega una migración nueva al final de `lib/db/migrations.ts`. Nunca edites una que ya está en `main`.
6. **Dependencias:** usa `pnpm add` (actualiza `pnpm-lock.yaml`) y sube el lockfile en el mismo commit.

## 5. Pruebas fuera de Docker

```bash
npm install -g pnpm@12.3.4
pnpm install
pnpm test                      # PA-01…PA-09; las de base (PA-10) se omiten sin DATABASE_URL
```

Para incluir PA-10, levanta solo la base y apunta a ella (usa tu `POSTGRES_PASSWORD` del `.env`):

```bash
docker compose up -d db
DATABASE_URL=postgres://wpl:<POSTGRES_PASSWORD>@127.0.0.1:5432/wpl pnpm test
```

En PowerShell: `$env:DATABASE_URL="postgres://wpl:<POSTGRES_PASSWORD>@127.0.0.1:5432/wpl"; pnpm test`

## 6. Problemas comunes

| Síntoma | Causa y solución |
| --- | --- |
| `no configuration file provided: not found` | No estás en la carpeta del repo. `cd wholeplatport`. |
| `required variable ... is missing a value` | Falta tu `.env` o una variable. Corre el script de setup. |
| `port is already allocated` (3000 o 5432) | Otro programa usa el puerto. Para la base, pon `DB_PORT=5433` en `.env`; para la app, cierra lo que use el 3000. |
| `error during connect` / `pipe/docker_engine` | Docker Desktop no está abierto. |
| La app pide login y no acepta tu contraseña | Usa la de **tu** `.env`. Si la cambiaste, recrea el contenedor: `docker compose up -d --force-recreate app`. |
| `running scripts is disabled on this system` | Corre el script con `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1`. |
| Aparece un `middleware.ts` o paquetes que nadie agregó | Probablemente lo generó un asistente del editor. Next 16 usa `proxy.ts`; borra el archivo y revisa `git status` antes de hacer commit. |
| Corridas dice "La base de datos no está configurada" | Estás corriendo sin Compose o sin `DATABASE_URL`. Con `docker compose up` se configura sola. |
| `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` | Cambiaste `package.json` sin actualizar el lockfile: corre `pnpm install` y sube `pnpm-lock.yaml`. |
