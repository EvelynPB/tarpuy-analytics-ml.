'use strict';

const service = require('../services/analytics.service');

const json = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await fn(req));
};

const resumen = json(() => service.resumen());
const metricas = json(() => service.metricas());
const segmentos = json(() => service.segmentos());
const segmento = json(req => service.segmento(req.params.codigo));

async function importar(req, res) {
  res.status(201).json(await service.importar(req.body));
}

async function exportarExcel(req, res) {
  const wb = await service.generarExcel();
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="segmentos-tarpuy-analytics.xlsx"',
    'Cache-Control': 'no-store',
  });
  await wb.xlsx.write(res);
  res.end();
}

module.exports = { resumen, metricas, segmentos, segmento, importar, exportarExcel };
