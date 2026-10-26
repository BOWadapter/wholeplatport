# Whole Platport Lite · Versión de taller

Versión pequeña de **Whole Platport** (plataforma de inteligencia de portafolio inspirada en BlackRock Aladdin) para el taller *De los requisitos al software con agentes de IA*. Sigue el mismo método que el ejemplo Don Lole: **regla de negocio → código → prueba de aceptación**.

> Proyecto académico. **Todo es simulado**: no hay conexión a exchanges, no hay API keys y no hay dinero real. Los precios salen de una caminata aleatoria con semilla fija, así que todos ven los mismos resultados. Nada de lo que muestra es recomendación de inversión.

## Empieza aquí

```powershell
git clone https://github.com/BOWadapter/wholeplatport.git
cd wholeplatport
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1   # Windows  (Linux/macOS: ./scripts/setup.sh)
docker compose up -d --build                                  # http://localhost:3000
```

El script crea tu `.env` con tu usuario, tu contraseña y secretos aleatorios. Requisitos, flujo de ramas y PRs, reglas del proyecto y solución de problemas: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Qué incluye

| Capa (Whole Platport) | En esta versión |
| --- | --- |
| 1 · Mercados | BTC, ETH y XRP simulados y correlacionados (factor de mercado común). 1 tick = 1 hora. Escenarios: normal, lateral y caída tipo 2022 (−30% en ~48 ticks con volatilidad ×2.2) |
| 2 · Ejecución | Dos estrategias detrás de una interfaz común: **Smart DCA** (compra programada + RSI + Bollinger) y **Grid dinámico** (niveles con reset al salir de rango) |
| 3 · Riesgo | Exposición agregada, límite de 60% por activo, **circuit breaker global** sobre el drawdown del portafolio y **kill switch** |
| 4 · Datos | PostgreSQL 17: corridas guardadas con sus `orders`, `decisions` y `risk_events` normalizadas (RN-11) |
| 5 · Inteligencia | Copiloto por plantillas deterministas: explica y resume, **no predice** |
| 6 · Presentación | Dashboard Next.js con 6 pantallas |
| Gobernanza | Inicio de sesión con usuario y contraseña definidos en `.env` (RN-10) |

Capital inicial: 10,000 USDT, 50/50 entre estrategias. Comisión simulada: 0.1%. Línea base: buy-and-hold repartido en partes iguales en el tick 0.

## Reglas de negocio

| ID | Regla |
| --- | --- |
| RN-1 | Solo existe modo **dry-run**. No hay modo live ni campos para credenciales. |
| RN-2 | Toda orden genera un registro en `decisions` (indicadores, régimen de volatilidad, regla disparada, resultado). Las órdenes rechazadas también. |
| RN-3 | Si el drawdown del portafolio **agregado** llega al umbral (10% por defecto, configurable 5–25%), se pausan **todas** las estrategias y se registra un `risk_event`. |
| RN-4 | Reanudar exige un motivo escrito (≥ 10 caracteres) **y** que el drawdown actual esté bajo el umbral. Aprobada o rechazada, queda registro. |
| RN-5 | Kill switch: pausa todo en el mismo tick, sin importar el drawdown. |
| RN-6 | Exposición máxima por activo: 60% del portafolio. Una compra que lo rebasaría se rechaza como "rechazada por límite". |
| RN-7 | Indicadores robustos: sin datos suficientes devuelven valor neutral (RSI = 50); la señal de Bollinger se suprime cuando la volatilidad supera 1.5× su promedio. |
| RN-8 | El copiloto nunca predice precios ni recomienda comprar o vender. |
| RN-9 | Cuando el precio sale del rango del grid, el grid se re-centra (reset dinámico) y el reset queda en `decisions`. |
| RN-10 | Solo usuarios autenticados acceden a la plataforma. Las credenciales viven en variables de entorno y, si faltan, nadie entra. |
| RN-11 | Una corrida guardada se restaura idéntica (y la simulación continúa igual); cada usuario solo ve, carga y elimina sus corridas; guardar es todo o nada. |

## Trazabilidad: regla → código → prueba

| Regla | Dónde se impone | Prueba |
| --- | --- | --- |
| RN-1 | `lib/engine.ts` (`mode: 'dry-run'`, sin campos de clave) | PA-01 |
| RN-2 | `lib/engine.ts` → `execute()` escribe la decisión antes de la orden | PA-02 |
| RN-3 | `lib/risk/circuit-breaker.ts` → `shouldTrip()`; `lib/engine.ts` → `step()` | PA-03 |
| RN-4 | `lib/risk/circuit-breaker.ts` → `canResume()`; `lib/engine.ts` → `requestResume()` | PA-04 |
| RN-5 | `lib/engine.ts` → `killSwitch()` | PA-05 |
| RN-6 | `lib/risk/exposure.ts` → `exposureAfterBuy()`; `lib/engine.ts` → `execute()` | PA-06 |
| RN-7 | `lib/indicators.ts` (`rsi`, `volRegime`); `lib/strategies/smart-dca.ts` | `tests/acceptance.test.ts` (RN-7) |
| RN-8 | `lib/copilot.ts` → `classify()` / `answer()` | PA-07 |
| RN-9 | `lib/strategies/dynamic-grid.ts` | PA-08 |
| RN-10 | `proxy.ts`; `lib/auth/*`; `app/api/auth/*` | PA-09 (`tests/auth.test.ts` y CI) |
| RN-11 | `lib/db/*`; `app/api/runs/*` | PA-10 (`tests/db.test.ts` contra PostgreSQL y CI) |

| PA | Qué verifica |
| --- | --- |
| PA-01 | El estado inicial está en dry-run y no tiene ningún campo con nombre de credencial |
| PA-02 | En 300 ticks, cada orden tiene exactamente una decisión enlazada |
| PA-03 | En "Caída tipo 2022" el breaker se dispara y las 2 estrategias quedan pausadas |
| PA-04 | Reanudar sin motivo se rechaza; con motivo pero drawdown sobre el umbral también; el caso válido se aprueba |
| PA-05 | El kill switch pausa todo en el mismo tick y no hay órdenes nuevas en los 48 ticks siguientes |
| PA-06 | Ninguna compra ejecutada deja un activo arriba de 60%; las compras forzadas se rechazan por límite |
| PA-07 | "¿BTC va a subir?", "¿Debería comprar ETH?" y "¿Cuánto va a valer XRP mañana?" no reciben predicción |
| PA-08 | Al salir de rango, cada reset del grid aparece en `decisions` |
| PA-09 | Sin sesión toda ruta redirige a `/login`; credenciales incorrectas no crean sesión; token alterado, vencido o de otro secreto se rechaza; `next` solo acepta rutas internas; 5 fallos bloquean 15 min; sin variables el login queda deshabilitado |
| PA-10 | Migraciones idempotentes; guardar crea la corrida con sus filas y ninguna orden sin decisión; restaurar da el mismo estado y el mismo futuro; otro usuario no puede leer ni borrar; mismo nombre reemplaza; borrar es en cascada; una falla a medio guardar no deja filas |

Las pruebas corren sobre una simulación **aislada y nueva**, no sobre la que estás usando. Se ejecutan en la pantalla **/pruebas** y también en terminal:

```bash
npm install -g pnpm@12.3.4   # versión fijada en package.json
pnpm install
./scripts/setup.sh           # crea .env (Windows: scripts\setup.ps1)
pnpm test                    # PA-01…PA-09; PA-10 también si defines DATABASE_URL
pnpm dev                     # http://localhost:3000
```

## Inicio de sesión (RN-10)

Un solo usuario, definido en variables de entorno. No hay base de datos de usuarios.

| Variable | Requisito |
| --- | --- |
| `AUTH_USERNAME` | usuario para entrar |
| `AUTH_PASSWORD` | mínimo 8 caracteres |
| `AUTH_SECRET` | mínimo 32 caracteres aleatorios; firma la cookie de sesión |

Genera el secreto con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Cómo funciona: `proxy.ts` revisa cada petición; sin una cookie de sesión válida redirige a `/login`. El formulario envía a `POST /api/auth/login`, que compara las credenciales en tiempo constante y crea una cookie `httpOnly` firmada con HMAC-SHA256 que dura 8 horas. El botón de salida del encabezado llama a `POST /api/auth/logout`.

Protecciones: falla cerrado (sin variables, nadie entra), rechazo de formularios de otro origen, redirección posterior solo a rutas internas, cookie `Secure` cuando se sirve por HTTPS y bloqueo de 15 minutos tras 5 intentos fallidos por IP.

Límites conocidos: es un solo usuario sin roles; el bloqueo vive en memoria (se reinicia con el servidor y no se comparte entre réplicas) y toma la IP de `X-Forwarded-For`, que solo es confiable detrás de un proxy que la fije. Cambiar `AUTH_SECRET` cierra todas las sesiones abiertas.

En la vista previa de v0 o en Vercel, define las tres variables en la configuración del proyecto (Environment Variables).

## Base de datos (RN-11)

PostgreSQL 17 corre como servicio `db` en `compose.yaml`, con un volumen (`pgdata`) para que los datos sobrevivan a `docker compose down`. La pantalla **Corridas** guarda la simulación actual con un nombre y permite cargarla después, desde cualquier navegador, o eliminarla.

| Tabla | Contenido |
| --- | --- |
| `simulations` | una fila por corrida: dueño, nombre, resumen (tick, valor, drawdown, breaker) y el estado completo en `state` (JSONB) |
| `orders` | las órdenes de la corrida |
| `decisions` | por qué se abrió o rechazó cada orden, resets del grid y señales suprimidas (RN-2) |
| `risk_events` | disparos del breaker, kill switch, reanudaciones y cambios de umbral |
| `schema_migrations` | migraciones aplicadas |

- `state` permite restaurar la corrida exacta; las tablas normalizadas permiten consultarla con SQL.
- Las migraciones están en `lib/db/migrations.ts` y se aplican solas al primer uso. Para cambiar el esquema, agrega una migración nueva al final; nunca edites una publicada.
- Guardar es una sola transacción: o queda la corrida con todas sus filas, o nada. Si el nombre ya existe para ese usuario, se reemplaza.
- Sin `DATABASE_URL` la app funciona igual; solo la pantalla Corridas avisa que no hay base.
- Límites: 50 corridas por usuario y 5 MB por corrida.

Consultar la base desde la terminal:

```bash
docker compose exec db psql -U wpl -d wpl
```

```sql
-- ¿Qué reglas generaron más decisiones en cada corrida?
SELECT s.name, d.rule, d.result, count(*)
FROM decisions d JOIN simulations s ON s.id = d.simulation_id
GROUP BY 1, 2, 3 ORDER BY 1, 4 DESC;
```

Para correr la app o las pruebas fuera de Docker contra el Postgres de Compose: `docker compose up -d db` y define en `.env` `DATABASE_URL=postgres://wpl:<POSTGRES_PASSWORD>@127.0.0.1:5432/wpl`. Si el puerto 5432 ya está ocupado en tu máquina, define `DB_PORT=5433` y ajusta la URL.

## Contenedor

Requisito: Docker (Docker Desktop en Windows/macOS). El build ejecuta `tsc` y todas las pruebas; si alguna PA falla, la imagen no se construye.

```bash
./scripts/setup.sh             # Windows: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
docker compose up -d --build   # http://localhost:3000
docker compose logs -f         # ver el servidor
docker compose down            # detener
```

Sin Compose:

```bash
docker build -t whole-platport-lite .
docker run --rm -p 3000:3000 --env-file .env whole-platport-lite   # sin base: Corridas queda deshabilitada
```

Compose se niega a arrancar si falta alguna variable `AUTH_*` o `POSTGRES_PASSWORD` en `.env`. La app espera a que la base esté sana antes de arrancar. `docker compose down` conserva los datos; `docker compose down -v` los borra. El `.env` no entra a la imagen (`.dockerignore`) ni al repositorio (`.gitignore`).

La imagen final usa Next.js en modo `standalone` sobre `node:22-alpine`, corre con un usuario sin privilegios e incluye un healthcheck. Necesita las variables `AUTH_*` y la base de datos del servicio `db`. La simulación en curso vive en el navegador; las corridas guardadas, en PostgreSQL.

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cada PR: instala con el lockfile, `tsc`, pruebas (con un servicio PostgreSQL para PA-10), build, y luego construye la imagen Docker, la arranca y comprueba el login de punta a punta: sin sesión las 6 rutas redirigen a `/login`, una contraseña incorrecta no crea sesión y con la correcta las 7 rutas responden 200. Luego guarda una corrida por la API y comprueba que sobrevive a reiniciar la app y a `docker compose down` / `up`.

## Pantallas

| Ruta | Uso |
| --- | --- |
| `/` Portafolio | KPIs, valor vs. buy-and-hold, exposición por activo, estado del breaker y botón **Demo del gate** |
| `/estrategias` | Estado, capital, PnL y operaciones por estrategia; pausar/reanudar y editar parámetros |
| `/riesgo` | Umbral, drawdown, kill switch, historial de eventos y reanudación con motivo |
| `/decisiones` | Registro de decisiones filtrable por estrategia, activo y resultado |
| `/copiloto` | Preguntas sobre el estado (resumen, pausas, estrategias, exposición, decisiones) |
| `/corridas` | Guardar la simulación en PostgreSQL, cargarla después y eliminarla |
| `/pruebas` | PA-01…PA-08 ejecutables con resultado y detalle |

## Gate de la demo

Equivale al gate F2 del proyecto completo: *un drawdown simulado detiene ambos bots*.

1. En **Portafolio**, pulsa **Demo del gate**. La app reinicia, calienta 72 ticks en mercado normal, cambia a "Caída tipo 2022" y avanza tick por tick.
2. Observa el drawdown subir hasta el umbral: el breaker pasa a **disparado** y las dos estrategias a **pausada**.
3. En **Riesgo**, intenta reanudar: se rechaza mientras el drawdown siga sobre el umbral (RN-4).
4. En **Copiloto**, pregunta "¿Por qué se pausaron las estrategias?".
5. En **Pruebas**, pulsa **Ejecutar todas**: 8/8.

## Estructura

```txt
lib/
  sim/market.ts            Capa 1 · precios simulados y escenarios
  indicators.ts            RSI, Bollinger, régimen de volatilidad (RN-7)
  strategies/base.ts       interfaz común de estrategia
  strategies/smart-dca.ts  Smart DCA
  strategies/dynamic-grid.ts  Grid dinámico (RN-9)
  risk/exposure.ts         exposición agregada (RN-6)
  risk/circuit-breaker.ts  breaker y reanudación (RN-3, RN-4)
  engine.ts                motor: une todo, registra órdenes y decisiones (RN-1, RN-2, RN-5)
  copilot.ts               copiloto sin predicciones (RN-8)
  acceptance.ts            PA-01…PA-08
  format.ts                formato de moneda y porcentajes
  auth/                    configuración, sesión firmada, credenciales y utilidades HTTP (RN-10)
  db/                      cliente, migraciones, repositorio de corridas y validación (RN-11)
proxy.ts                   protege todas las rutas (RN-10)
components/
  platport-context.tsx     estado global de la UI sobre el motor (+ localStorage opcional)
  app-shell.tsx            header con controles de simulación y menú lateral
  screens/                 una pantalla por archivo (portafolio, estrategias, riesgo, decisiones, copiloto, corridas, pruebas)
app/                       rutas de Next.js; cada page.tsx solo monta su pantalla
  login/, api/auth/        pantalla de acceso y endpoints de entrada y salida
  corridas/, api/runs/     pantalla y API de corridas guardadas
tests/                     PA con varias semillas, login (PA-09) y base de datos (PA-10)
scripts/setup.ps1|.sh      crea el .env con secretos aleatorios
Dockerfile, compose.yaml   contenedor de producción
.github/workflows/ci.yml   CI: pruebas, build e imagen Docker
```

## Ideas para ejercicios del taller

- Agregar una regla RN-10 (por ejemplo, máximo de órdenes por hora) con su prueba PA-09.
- Cambiar el umbral por defecto y ver en qué tick se dispara el breaker.
- Agregar una tercera estrategia que implemente `StrategyImpl`.
- Hacer que el copiloto responda una pregunta nueva sin romper PA-07.
