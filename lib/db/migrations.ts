// Migraciones del esquema (capa 4 · Datos). Se aplican en orden, una sola vez, al primer uso de la base.
// Regla: NUNCA editar una migración ya publicada; para cambiar el esquema se agrega una nueva al final.
//
// El esquema es la versión mínima del esquema unificado de Whole Platport: una corrida de simulación
// (simulations) con sus órdenes, decisiones y eventos de riesgo. `state` guarda el SimState completo
// para restaurar la corrida idéntica; las tablas normalizadas sirven para consultar y auditar con SQL.

export interface Migration {
  id: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_corridas',
    sql: `
      CREATE TABLE simulations (
        id              BIGSERIAL PRIMARY KEY,
        owner           TEXT        NOT NULL,
        name            TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
        seed            BIGINT      NOT NULL,
        scenario        TEXT        NOT NULL CHECK (scenario IN ('normal', 'lateral', 'crash')),
        tick            INTEGER     NOT NULL CHECK (tick >= 0),
        equity          NUMERIC     NOT NULL,
        max_drawdown    NUMERIC     NOT NULL CHECK (max_drawdown >= 0),
        breaker_status  TEXT        NOT NULL CHECK (breaker_status IN ('armado', 'disparado', 'kill_switch')),
        state           JSONB       NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (owner, name)
      );
      CREATE INDEX simulations_owner_updated ON simulations (owner, updated_at DESC);

      CREATE TABLE orders (
        simulation_id  BIGINT  NOT NULL REFERENCES simulations (id) ON DELETE CASCADE,
        id             TEXT    NOT NULL,
        tick           INTEGER NOT NULL,
        strategy_id    TEXT    NOT NULL,
        asset          TEXT    NOT NULL,
        side           TEXT    NOT NULL CHECK (side IN ('compra', 'venta')),
        price          NUMERIC NOT NULL,
        qty            NUMERIC NOT NULL,
        quote          NUMERIC NOT NULL,
        fee            NUMERIC NOT NULL,
        decision_id    TEXT    NOT NULL,
        PRIMARY KEY (simulation_id, id)
      );

      CREATE TABLE decisions (
        simulation_id  BIGINT  NOT NULL REFERENCES simulations (id) ON DELETE CASCADE,
        id             TEXT    NOT NULL,
        tick           INTEGER NOT NULL,
        strategy_id    TEXT    NOT NULL,
        asset          TEXT    NOT NULL,
        side           TEXT    CHECK (side IN ('compra', 'venta')),
        price          NUMERIC NOT NULL,
        qty            NUMERIC NOT NULL,
        rsi            NUMERIC NOT NULL,
        regime         TEXT    NOT NULL CHECK (regime IN ('normal', 'alta')),
        vol_ratio      NUMERIC NOT NULL,
        rule           TEXT    NOT NULL,
        result         TEXT    NOT NULL,
        detail         TEXT    NOT NULL,
        order_id       TEXT,
        PRIMARY KEY (simulation_id, id)
      );
      CREATE INDEX decisions_result ON decisions (simulation_id, result);

      CREATE TABLE risk_events (
        simulation_id  BIGINT  NOT NULL REFERENCES simulations (id) ON DELETE CASCADE,
        id             TEXT    NOT NULL,
        tick           INTEGER NOT NULL,
        type           TEXT    NOT NULL,
        threshold      NUMERIC NOT NULL,
        value          NUMERIC NOT NULL,
        action         TEXT    NOT NULL,
        PRIMARY KEY (simulation_id, id)
      );
    `,
  },
]
