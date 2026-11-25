'use strict';

const express = require('express');
const controller = require('../controllers/analytics.controller');
const wrap = require('../middlewares/async-handler');
const { needAdmin } = require('../middlewares/auth');

// Tarpuy Analytics ML. Todas las rutas exigen la sesión del organizador (HTTP 401 sin ella).
const router = express.Router();
router.use(needAdmin);

router.get('/resumen', wrap(controller.resumen));
router.get('/metricas', wrap(controller.metricas));
router.get('/segmentos', wrap(controller.segmentos));
router.get('/segmentos/:codigo', wrap(controller.segmento));
router.post('/importar', wrap(controller.importar));
router.get('/export.xlsx', wrap(controller.exportarExcel));

module.exports = router;
