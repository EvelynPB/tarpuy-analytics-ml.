'use strict';

const pool = require('../config/db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fichas (
  id SERIAL PRIMARY KEY,
  ie TEXT NOT NULL,
  director TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('Estatal','Privado')),
  direccion TEXT NOT NULL,
  telefono TEXT NOT NULL,
  correo TEXT NOT NULL,
  monto INTEGER NOT NULL,
  operacion TEXT NOT NULL,
  medio TEXT NOT NULL CHECK (medio IN ('Yape','Transferencia')),
  pagador TEXT,
  verificado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asesores (
  id SERIAL PRIMARY KEY,
  ficha_id INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alumnos (
  id SERIAL PRIMARY KEY,
  ficha_id INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL,
  grado TEXT NOT NULL,
  nro INTEGER NOT NULL,
  dni TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS libres (
  id SERIAL PRIMARY KEY,
  dni TEXT NOT NULL UNIQUE,
  grado TEXT NOT NULL,
  nivel TEXT NOT NULL,
  nombre TEXT NOT NULL,
  monto INTEGER NOT NULL,
  operacion TEXT NOT NULL,
  medio TEXT NOT NULL CHECK (medio IN ('Yape','Transferencia')),
  pagador TEXT,
  verificado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alumnos_ficha ON alumnos(ficha_id);
CREATE INDEX IF NOT EXISTS idx_asesores_ficha ON asesores(ficha_id);

ALTER TABLE libres ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Tarpuy Analytics ML (misma definición que database/scripts/05_analytics.sql)
CREATE TABLE IF NOT EXISTS ml_ejecucion (
  id                 SERIAL PRIMARY KEY,
  fecha              TIMESTAMPTZ NOT NULL,            -- cuándo se entrenó (en Colab o con ml/entrenar.py)
  cargado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  fuente             TEXT NOT NULL CHECK (fuente IN ('excel', 'postgresql')),
  k                  INTEGER NOT NULL CHECK (k BETWEEN 2 AND 20),
  inercia            NUMERIC(12,1) NOT NULL,
  silueta            NUMERIC(5,3) NOT NULL CHECK (silueta BETWEEN -1 AND 1),
  davies_bouldin     NUMERIC(8,3) NOT NULL CHECK (davies_bouldin >= 0),
  n_registros        INTEGER NOT NULL CHECK (n_registros > 0),
  incluye_sinteticos BOOLEAN NOT NULL,
  validacion         JSONB NOT NULL DEFAULT '{}',     -- Ward y modelo con solo datos reales
  metricas           JSONB NOT NULL DEFAULT '[]',     -- inercia, silueta y Davies-Bouldin para cada k
  resumen            JSONB NOT NULL DEFAULT '{}',     -- indicadores agregados (sin datos personales)
  calidad_datos      JSONB NOT NULL DEFAULT '{}'
);

-- ---------- Segmentos de cada ejecución ----------
CREATE TABLE IF NOT EXISTS ml_segmento (
  id                    SERIAL PRIMARY KEY,
  ejecucion_id          INTEGER NOT NULL REFERENCES ml_ejecucion(id) ON DELETE CASCADE,
  numero                TEXT NOT NULL,                -- S1, S2, …
  nombre                TEXT NOT NULL,
  descripcion           TEXT NOT NULL,
  n_participantes       INTEGER NOT NULL CHECK (n_participantes > 0),
  reales                INTEGER NOT NULL CHECK (reales >= 0),
  confirmado_con_reales BOOLEAN NOT NULL,
  instituciones         INTEGER NOT NULL DEFAULT 0,
  perfil                JSONB NOT NULL,
  centroide             JSONB NOT NULL,
  por_origen_nivel      JSONB NOT NULL DEFAULT '[]',
  UNIQUE (ejecucion_id, numero)
);

-- ---------- Segmento asignado a cada participante ----------
-- «registro» es el ID del dataset (TARP-0001 si viene del Excel; A-15 o L-3 si viene de PostgreSQL).
-- Cuando el registro corresponde a un alumno de la base, se enlaza con alumnos o libres.
CREATE TABLE IF NOT EXISTS ml_asignacion (
  ejecucion_id  INTEGER NOT NULL REFERENCES ml_ejecucion(id) ON DELETE CASCADE,
  registro      TEXT NOT NULL,
  segmento_id   INTEGER NOT NULL REFERENCES ml_segmento(id) ON DELETE CASCADE,
  origen        TEXT NOT NULL CHECK (origen IN ('Real', 'Sintético')),
  alumno_id     INTEGER REFERENCES alumnos(id) ON DELETE SET NULL,
  libre_id      INTEGER REFERENCES libres(id) ON DELETE SET NULL,
  PRIMARY KEY (ejecucion_id, registro)
);
CREATE INDEX IF NOT EXISTS idx_ml_segmento_ejecucion ON ml_segmento(ejecucion_id);
CREATE INDEX IF NOT EXISTS idx_ml_asignacion_segmento ON ml_asignacion(segmento_id);
`;

async function initSchema() {
  await pool.query(SCHEMA);
}

module.exports = { initSchema };
