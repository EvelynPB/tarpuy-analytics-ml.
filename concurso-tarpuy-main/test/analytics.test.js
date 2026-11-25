'use strict';

// Pruebas de Tarpuy Analytics ML que no necesitan base de datos (ejecutar con: npm test).
process.env.DATABASE_URL ||= 'postgresql://prueba@localhost/prueba';
process.env.ADMIN_PASSWORD ||= 'prueba';
process.env.SESSION_SECRET ||= 'prueba';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { validarImportacion } = require('../src/services/analytics.service');
const app = require('../src/app');

function archivoValido() {
  return {
    version: 1,
    ejecucion: { fecha: '2026-11-25T10:00:00Z', fuente: 'excel', k: 2, inercia: 10, silueta: 0.4,
      davies_bouldin: 0.9, n_registros: 3, incluye_sinteticos: true },
    segmentos: ['S1', 'S2'].map((codigo, i) => ({
      codigo, nombre: 'Grupo ' + codigo, descripcion: 'Descripción', participantes: i + 1, reales: 1,
      confirmado_con_reales: true, instituciones: 1, perfil: {}, centroide: {}, por_origen_nivel: [],
    })),
    asignaciones: [
      { registro: 'TARP-1', segmento: 'S1', origen: 'Real' },
      { registro: 'TARP-2', segmento: 'S2', origen: 'Real' },
      { registro: 'TARP-3', segmento: 'S2', origen: 'Sintético' },
    ],
  };
}

test('acepta un segmentos.json correcto', () => {
  assert.equal(validarImportacion(archivoValido()), null);
});

test('rechaza archivos con datos inconsistentes', () => {
  const casos = [
    [d => { d.version = 2; }, /versión 1/],
    [d => { d.ejecucion.silueta = 1.5; }, /silueta/],
    [d => { d.segmentos.pop(); }, /Se esperaban 2 segmentos/],
    [d => { d.asignaciones[0].segmento = 'S9'; }, /asignaciones/],
    [d => { d.asignaciones[1].registro = 'TARP-1'; }, /dos veces/],
    [d => { d.segmentos[0].participantes = 5; }, /suma de participantes/],
    [d => { d.asignaciones[0].origen = 'Otro'; }, /asignaciones/],
  ];
  for (const [cambiar, error] of casos) {
    const d = archivoValido();
    cambiar(d);
    assert.match(validarImportacion(d) || '', error);
  }
});

test('CP-09: las rutas de analítica responden 401 sin sesión', async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const pedir = (method, ruta) => new Promise((ok, mal) => {
    const req = http.request({ port, method, path: ruta, headers: { 'Content-Type': 'application/json' } },
      res => { res.resume(); ok(res.statusCode); });
    req.on('error', mal);
    req.end(method === 'POST' ? '{}' : undefined);
  });
  try {
    for (const ruta of ['resumen', 'metricas', 'segmentos', 'segmentos/S1', 'export.xlsx']) {
      assert.equal(await pedir('GET', '/api/admin/analytics/' + ruta), 401, ruta);
    }
    assert.equal(await pedir('POST', '/api/admin/analytics/importar'), 401);
  } finally {
    server.close();
  }
});
