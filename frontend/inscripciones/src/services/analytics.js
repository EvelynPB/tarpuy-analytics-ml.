/** Llamadas a Tarpuy Analytics ML (/api/admin/analytics/*). Todas requieren la sesión del organizador. */
async function pedir(url, opciones = {}) {
  const r = await fetch(url, { credentials: 'same-origin', ...opciones });
  let j = {};
  try { j = await r.json(); } catch { /* respuesta sin JSON */ }
  if (!r.ok) {
    const error = new Error(j.error || 'Error ' + r.status);
    error.status = r.status;
    throw error;
  }
  return j;
}

export const leerResumen = () => pedir('/api/admin/analytics/resumen');
export const leerMetricas = () => pedir('/api/admin/analytics/metricas');
export const leerSegmentos = () => pedir('/api/admin/analytics/segmentos');
export const leerSegmento = codigo => pedir('/api/admin/analytics/segmentos/' + encodeURIComponent(codigo));
export const importarModelo = texto => pedir('/api/admin/analytics/importar', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: texto,
});
export const URL_EXCEL_ANALYTICS = '/api/admin/analytics/export.xlsx';
