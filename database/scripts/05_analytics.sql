-- =====================================================================
-- 05 · Tarpuy Analytics ML: resultados del modelo de segmentación
-- Requiere: 01_inscripciones.sql (tablas alumnos y libres).
-- Se puede ejecutar varias veces: no borra datos.
-- El servidor de inscripciones crea las mismas tablas al arrancar
-- (concurso-tarpuy-main/src/repositories/schema.repository.js).
-- =====================================================================

-- ---------- Cada entrenamiento del modelo (una fila por archivo segmentos.json cargado) ----------
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
