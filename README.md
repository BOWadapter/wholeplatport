# Whole Platport Lite · Versión de taller

Versión pequeña de **Whole Platport** (plataforma de inteligencia de portafolio inspirada en BlackRock Aladdin) para el taller *De los requisitos al software con agentes de IA*. Sigue el mismo método que el ejemplo Don Lole: **regla de negocio → código → prueba de aceptación**.

> Proyecto académico. **Todo es simulado**: no hay conexión a exchanges, no hay API keys y no hay dinero real. Los precios salen de una caminata aleatoria con semilla fija, así que todos ven los mismos resultados. Nada de lo que muestra es recomendación de inversión.

## Qué incluye

| Capa (Whole Platport) | En esta versión |
| --- | --- |
| 1 · Mercados | BTC, ETH y XRP simulados y correlacionados (factor de mercado común). 1 tick = 1 hora. Escenarios: normal, lateral y caída tipo 2022 (−30% en ~48 ticks con volatilidad ×2.2) |
| 2 · Ejecución | Dos estrategias detrás de una interfaz común: **Smart DCA** (compra programada + RSI + Bollinger) y **Grid dinámico** (niveles con reset al salir de rango) |
| 3 · Riesgo | Exposición agregada, límite de 60% por activo, **circuit breaker global** sobre el drawdown del portafolio y **kill switch** |
| 4 · Datos | Tablas mínimas en memoria: `orders`, `decisions`, `riskEvents`, `equity` |
| 5 · Inteligencia | Copiloto por plantillas deterministas: explica y resume, **no predice** |
| 6 · Presentación | Dashboard Next.js con 6 pantallas |

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

Las pruebas corren sobre una simulación **aislada y nueva**, no sobre la que estás usando. Se ejecutan en la pantalla **/pruebas** y también en terminal:

```bash
npm install -g pnpm@12.3.4   # versión fijada en package.json
pnpm install
pnpm test                    # 8 PA × 5 semillas + pruebas de reglas puras
pnpm dev                     # http://localhost:3000
```

## Contenedor

Requisito: Docker (Docker Desktop en Windows/macOS). El build ejecuta `tsc` y las 45 pruebas; si alguna PA falla, la imagen no se construye.

```bash
docker compose up -d --build   # http://localhost:3000
docker compose logs -f         # ver el servidor
docker compose down            # detener
```

Sin Compose:

```bash
docker build -t whole-platport-lite .
docker run --rm -p 3000:3000 whole-platport-lite
```

La imagen final usa Next.js en modo `standalone` sobre `node:22-alpine`, corre con un usuario sin privilegios e incluye un healthcheck. No necesita variables de entorno ni secretos: el estado de la simulación vive en el navegador de cada usuario.

## Integración continua

`.github/workflows/ci.yml` corre en cada push a `main` y en cada PR: instala con el lockfile, `tsc`, pruebas, build, y luego construye la imagen Docker, la arranca y comprueba que las 6 rutas respondan.

## Pantallas

| Ruta | Uso |
| --- | --- |
| `/` Portafolio | KPIs, valor vs. buy-and-hold, exposición por activo, estado del breaker y botón **Demo del gate** |
| `/estrategias` | Estado, capital, PnL y operaciones por estrategia; pausar/reanudar y editar parámetros |
| `/riesgo` | Umbral, drawdown, kill switch, historial de eventos y reanudación con motivo |
| `/decisiones` | Registro de decisiones filtrable por estrategia, activo y resultado |
| `/copiloto` | Preguntas sobre el estado (resumen, pausas, estrategias, exposición, decisiones) |
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
components/
  platport-context.tsx     estado global de la UI sobre el motor (+ localStorage opcional)
  app-shell.tsx            header con controles de simulación y menú lateral
  screens/                 una pantalla por archivo (portafolio, estrategias, riesgo, decisiones, copiloto, pruebas)
app/                       rutas de Next.js; cada page.tsx solo monta su pantalla
tests/acceptance.test.ts   las mismas PA con varias semillas (vitest)
Dockerfile, compose.yaml   contenedor de producción
.github/workflows/ci.yml   CI: pruebas, build e imagen Docker
```

## Ideas para ejercicios del taller

- Agregar una regla RN-10 (por ejemplo, máximo de órdenes por hora) con su prueba PA-09.
- Cambiar el umbral por defecto y ver en qué tick se dispara el breaker.
- Agregar una tercera estrategia que implemente `StrategyImpl`.
- Hacer que el copiloto responda una pregunta nueva sin romper PA-07.
