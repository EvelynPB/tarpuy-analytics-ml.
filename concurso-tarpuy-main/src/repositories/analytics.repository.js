'use strict';

const pool = require('../config/db');

/** Última ejecución cargada (la más reciente por fecha de carga), o null si no hay ninguna. */
async function ultimaEjecucion() {
  const { rows } = await pool.query('SELECT * FROM ml_ejecucion ORDER BY cargado_en DESC, id DESC LIMIT 1');
  return rows[0] || null;
}

async function segmentos(ejecucionId) {
  const { rows } = await pool.query(
    `SELECT s.*, (SELECT count(*) FROM ml_asignacion a
                   WHERE a.segmento_id = s.id AND (a.alumno_id IS NOT NULL OR a.libre_id IS NOT NULL))::int AS enlazados
       FROM ml_segmento s WHERE s.ejecucion_id = $1 ORDER BY s.numero`,
    [ejecucionId]
  );
  return rows;
}

/**
 * Guarda una ejecución completa en una sola transacción: si algo falla, no queda nada a medias.
 * Las asignaciones cuyo registro es «A-<id>» o «L-<id>» se enlazan con alumnos o libres si ese id existe.
 */
async function guardarEjecucion(e, segs, asignaciones) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [ej] } = await client.query(
      `INSERT INTO ml_ejecucion (fecha, fuente, k, inercia, silueta, davies_bouldin, n_registros,
                                 incluye_sinteticos, validacion, metricas, resumen, calidad_datos)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [e.fecha, e.fuente, e.k, e.inercia, e.silueta, e.davies_bouldin, e.n_registros, e.incluye_sinteticos,
        JSON.stringify(e.validacion), JSON.stringify(e.metricas), JSON.stringify(e.resumen),
        JSON.stringify(e.calidad_datos)]
    );

    const idPorCodigo = {};
    for (const s of segs) {
      const { rows: [r] } = await client.query(
        `INSERT INTO ml_segmento (ejecucion_id, numero, nombre, descripcion, n_participantes, reales,
                                  confirmado_con_reales, instituciones, perfil, centroide, por_origen_nivel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [ej.id, s.codigo, s.nombre, s.descripcion, s.participantes, s.reales, s.confirmado_con_reales,
          s.instituciones, JSON.stringify(s.perfil), JSON.stringify(s.centroide),
          JSON.stringify(s.por_origen_nivel)]
      );
      idPorCodigo[s.codigo] = r.id;
    }

    await client.query(
      `INSERT INTO ml_asignacion (ejecucion_id, registro, segmento_id, origen, alumno_id, libre_id)
       SELECT $1, t.registro, t.segmento_id, t.origen, al.id, li.id
         FROM unnest($2::text[], $3::int[], $4::text[]) AS t(registro, segmento_id, origen)
         LEFT JOIN alumnos al ON al.id = CASE WHEN t.registro ~ '^A-[0-9]{1,9}$' THEN substring(t.registro FROM 3)::int END
         LEFT JOIN libres  li ON li.id = CASE WHEN t.registro ~ '^L-[0-9]{1,9}$' THEN substring(t.registro FROM 3)::int END`,
      [ej.id, asignaciones.map(a => a.registro), asignaciones.map(a => idPorCodigo[a.segmento]),
        asignaciones.map(a => a.origen)]
    );

    await client.query('COMMIT');
    return ej.id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { ultimaEjecucion, segmentos, guardarEjecucion };
