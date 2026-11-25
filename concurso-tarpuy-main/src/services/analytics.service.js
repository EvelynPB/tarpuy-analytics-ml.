'use strict';

const ExcelJS = require('exceljs');
const repo = require('../repositories/analytics.repository');
const { HttpError, bad } = require('../utils/http-error');

/** RN-03: el panel nunca muestra un grupo de menos de 5 participantes. */
const MINIMO_AGREGADO = 5;
const MAX_ASIGNACIONES = 100000;
const ORIGENES = ['Real', 'Sintético'];

const num = Number;
const esNumero = v => typeof v === 'number' && Number.isFinite(v);
const esTexto = (v, max = 300) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const esObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

const sinModelo = () => new HttpError(404, 'Todavía no se ha cargado ningún modelo. Sube el archivo segmentos.json.');

/** Revisa el archivo generado por ml/entrenar.py antes de guardarlo. Devuelve el primer error encontrado. */
function validarImportacion(d) {
  if (!esObjeto(d) || d.version !== 1) return 'El archivo no es un segmentos.json válido (versión 1).';
  const e = d.ejecucion;
  if (!esObjeto(e)) return 'Falta la sección «ejecucion».';
  if (Number.isNaN(Date.parse(e.fecha))) return 'La fecha de la ejecución no es válida.';
  if (!['excel', 'postgresql'].includes(e.fuente)) return 'La fuente debe ser «excel» o «postgresql».';
  if (!Number.isInteger(e.k) || e.k < 2 || e.k > 20) return 'k debe ser un entero entre 2 y 20.';
  if (!esNumero(e.silueta) || e.silueta < -1 || e.silueta > 1) return 'La silueta debe estar entre −1 y 1.';
  if (!esNumero(e.davies_bouldin) || e.davies_bouldin < 0) return 'El índice de Davies-Bouldin no es válido.';
  if (!esNumero(e.inercia) || e.inercia < 0) return 'La inercia no es válida.';
  if (!Number.isInteger(e.n_registros) || e.n_registros < 1) return 'El número de registros no es válido.';
  if (typeof e.incluye_sinteticos !== 'boolean') return 'Falta indicar si incluye datos sintéticos.';

  const segs = d.segmentos;
  if (!Array.isArray(segs) || segs.length !== e.k) return `Se esperaban ${e.k} segmentos.`;
  const codigos = new Set();
  for (const s of segs) {
    if (!esObjeto(s) || !/^S\d{1,2}$/.test(s.codigo) || codigos.has(s.codigo)) return 'Hay un segmento sin código válido (S1, S2…) o repetido.';
    codigos.add(s.codigo);
    if (!esTexto(s.nombre, 120) || !esTexto(s.descripcion, 600)) return `El segmento ${s.codigo} no tiene nombre o descripción válidos.`;
    if (!Number.isInteger(s.participantes) || s.participantes < 1) return `El segmento ${s.codigo} no tiene participantes.`;
    if (!Number.isInteger(s.reales) || s.reales < 0 || s.reales > s.participantes) return `El segmento ${s.codigo} tiene un número de reales no válido.`;
    if (typeof s.confirmado_con_reales !== 'boolean' || !esObjeto(s.perfil) || !esObjeto(s.centroide)) return `Al segmento ${s.codigo} le faltan datos del perfil.`;
    if (!Array.isArray(s.por_origen_nivel)) return `Al segmento ${s.codigo} le falta el desglose por origen y nivel.`;
  }

  const asig = d.asignaciones;
  if (!Array.isArray(asig) || asig.length !== e.n_registros) return 'El número de asignaciones no coincide con el de registros.';
  if (asig.length > MAX_ASIGNACIONES) return `El archivo supera el máximo de ${MAX_ASIGNACIONES} registros.`;
  const vistos = new Set();
  for (const a of asig) {
    if (!esObjeto(a) || !esTexto(a.registro, 40) || !codigos.has(a.segmento) || !ORIGENES.includes(a.origen)) {
      return 'Hay asignaciones con registro, segmento u origen no válidos.';
    }
    if (vistos.has(a.registro)) return `El registro ${a.registro} aparece dos veces.`;
    vistos.add(a.registro);
  }
  const suma = segs.reduce((t, s) => t + s.participantes, 0);
  if (suma !== asig.length) return 'La suma de participantes por segmento no coincide con las asignaciones.';
  return null;
}

async function importar(d) {
  const error = validarImportacion(d);
  if (error) throw bad(error);
  const id = await repo.guardarEjecucion(
    { ...d.ejecucion, metricas: d.metricas || [], resumen: d.resumen || {}, calidad_datos: d.calidad_datos || {},
      validacion: { ward: d.ejecucion.ward || null, solo_reales: d.ejecucion.solo_reales || null } },
    d.segmentos, d.asignaciones
  );
  return { ok: true, ejecucion: id, segmentos: d.segmentos.length, registros: d.asignaciones.length };
}

function formatoEjecucion(e) {
  return {
    id: e.id, fecha: e.fecha, cargado_en: e.cargado_en, fuente: e.fuente, k: e.k,
    inercia: num(e.inercia), silueta: num(e.silueta), davies_bouldin: num(e.davies_bouldin),
    n_registros: e.n_registros, incluye_sinteticos: e.incluye_sinteticos, validacion: e.validacion,
  };
}

/** Oculta los conteos entre 1 y 4 (RN-03); el panel los muestra como «<5». */
const proteger = n => (n > 0 && n < MINIMO_AGREGADO ? null : n);

function formatoSegmento(s) {
  return {
    codigo: s.numero, nombre: s.nombre, descripcion: s.descripcion,
    participantes: s.n_participantes, reales: proteger(s.reales),
    confirmado_con_reales: s.confirmado_con_reales, instituciones: s.instituciones,
    perfil: s.perfil, centroide: s.centroide, enlazados_a_la_base: s.enlazados,
    por_origen_nivel: s.por_origen_nivel.map(x => ({ ...x, participantes: proteger(x.participantes) })),
  };
}

async function ultima() {
  const e = await repo.ultimaEjecucion();
  if (!e) throw sinModelo();
  return e;
}

async function resumen() {
  const e = await ultima();
  return { ejecucion: formatoEjecucion(e), resumen: e.resumen, calidad_datos: e.calidad_datos };
}

async function metricas() {
  const e = await ultima();
  return { k_elegido: e.k, metricas: e.metricas };
}

async function segmentos() {
  const e = await ultima();
  return { ejecucion: e.id, k: e.k, silueta: num(e.silueta), segmentos: (await repo.segmentos(e.id)).map(formatoSegmento) };
}

async function segmento(codigo) {
  if (!/^S\d{1,2}$/.test(codigo || '')) throw bad('Código de segmento no válido.');
  const e = await ultima();
  const crudo = (await repo.segmentos(e.id)).find(x => x.numero === codigo);
  if (!crudo) throw new HttpError(404, 'Segmento no encontrado.');

  // Desglose agregado (nunca la lista de participantes). Se suma con los conteos originales
  // y luego se ocultan los totales menores a 5, para no mostrar un total falso.
  const total = clave => {
    const t = {};
    for (const x of crudo.por_origen_nivel) t[x[clave]] = (t[x[clave]] || 0) + x.participantes;
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, proteger(v)]));
  };
  return { ...formatoSegmento(crudo), por_nivel: total('nivel'), por_origen: total('origen') };
}

async function generarExcel() {
  const e = await ultima();
  const segs = (await repo.segmentos(e.id)).map(formatoSegmento);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tarpuy Analytics ML';

  const hoja = (nombre, cols, filas) => {
    const ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map(([header, key, width]) => ({ header, key, width }));
    filas.forEach(f => ws.addRow(f));
    const h = ws.getRow(1);
    h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3B70' } };
  };

  hoja('Segmentos', [
    ['Código', 'codigo', 9], ['Nombre', 'nombre', 44], ['Participantes', 'participantes', 14],
    ['Registros reales', 'reales', 16], ['Confirmado con reales', 'confirmado', 20],
    ['Tamaño medio de la delegación', 'tam', 18], ['% con asesor', 'ase', 12],
    ['Días antes del cierre (mediana)', 'dias', 18], ['Instituciones', 'ie', 13], ['Descripción', 'descripcion', 90],
  ], segs.map(s => ({
    codigo: s.codigo, nombre: s.nombre, participantes: s.participantes, reales: s.reales ?? '<5',
    confirmado: s.confirmado_con_reales ? 'Sí' : 'No', tam: s.perfil.tam_delegacion, ase: s.perfil.con_asesor_pct,
    dias: s.perfil.dias_antes_cierre_mediana, ie: s.instituciones, descripcion: s.descripcion,
  })));

  hoja('Métricas por k', [['k', 'k', 6], ['Inercia', 'inercia', 12], ['Silueta', 'silueta', 10],
    ['Davies-Bouldin', 'davies_bouldin', 15]], e.metricas);

  const v = e.validacion || {};
  hoja('Ejecución', [['Dato', 'dato', 34], ['Valor', 'valor', 30]], [
    ['Fecha de entrenamiento', new Date(e.fecha).toISOString()], ['Fuente', e.fuente], ['k elegido', e.k],
    ['Registros', e.n_registros], ['Incluye datos sintéticos', e.incluye_sinteticos ? 'Sí' : 'No'],
    ['Silueta', num(e.silueta)], ['Davies-Bouldin', num(e.davies_bouldin)], ['Inercia', num(e.inercia)],
    ['Silueta solo reales', v.solo_reales?.silueta ?? '—'], ['ARI solo reales vs. completo', v.solo_reales?.ari_vs_modelo_completo ?? '—'],
    ['Silueta Ward', v.ward?.silueta ?? '—'], ['ARI Ward vs. K-Means', v.ward?.ari_vs_kmeans ?? '—'],
  ].map(([dato, valor]) => ({ dato, valor })));

  return wb;
}

module.exports = { validarImportacion, importar, resumen, metricas, segmentos, segmento, generarExcel, MINIMO_AGREGADO };
