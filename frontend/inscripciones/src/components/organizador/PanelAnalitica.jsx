import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importarModelo, leerMetricas, leerResumen, leerSegmento, leerSegmentos, URL_EXCEL_ANALYTICS } from '../../services/analytics.js';
import Tarjeta from '../comunes/Tarjeta.jsx';
import { botonPrimario, botonSecundario, claseCampo, claseEtiqueta, cx } from '../comunes/estilos.js';
import { COLOR_ORIGEN, COLORES_SEGMENTO, GraficoDiario, PerfilSegmentos } from './graficos.jsx';

const celda = 'border-b border-linea px-2.5 py-2 text-left align-top';
const cabecera = celda + ' bg-fondo text-xs tracking-[.5px] text-suave uppercase whitespace-nowrap';
const NIVELES = ['Inicial', 'Primaria', 'Secundaria'];
const ORIGENES = ['Real', 'Sintético'];
const decimal = v => (v ?? '—').toString().replace('.', ',');
/** RN-03: los conteos de 1 a 4 llegan como null y se muestran como «<5». */
const conteo = v => (v === null || v === undefined ? '<5' : v);

/** Participantes de un segmento según los filtros; «oculto» indica que hubo grupos menores a 5 sin mostrar. */
function contarFiltrado(segmento, origen, nivel) {
  if (origen === 'Todos' && nivel === 'Todos') return { total: segmento.participantes, oculto: false };
  let total = 0, oculto = false;
  for (const x of segmento.por_origen_nivel) {
    if ((origen !== 'Todos' && x.origen !== origen) || (nivel !== 'Todos' && x.nivel !== nivel)) continue;
    if (x.participantes === null) oculto = true; else total += x.participantes;
  }
  return { total, oculto };
}

function Indicador({ valor, texto }) {
  return (
    <div className="rounded-xl bg-fondo px-[18px] py-2.5">
      <b className="block font-serif text-[26px]/[normal] font-black">{valor}</b>{texto}
    </div>
  );
}

function CargarModelo({ onCargado }) {
  const entrada = useRef(null);
  const [estado, setEstado] = useState('');

  async function subir(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setEstado('Cargando…');
    try {
      const r = await importarModelo(await archivo.text());
      setEstado(`✓ Modelo cargado: ${r.segmentos} segmentos y ${r.registros} registros.`);
      onCargado();
    } catch (err) {
      setEstado('No se pudo cargar: ' + err.message);
    } finally {
      entrada.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <input ref={entrada} type="file" accept=".json,application/json" className="hidden" onChange={subir} />
      <button type="button" className={botonSecundario} onClick={() => entrada.current.click()}>⬆ Cargar segmentos.json</button>
      {estado && <span className="text-sm" role="status">{estado}</span>}
    </div>
  );
}

function DetalleSegmento({ codigo }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vigente = true;
    leerSegmento(codigo).then(r => vigente && setD(r)).catch(err => vigente && setError(err.message));
    return () => { vigente = false; };
  }, [codigo]);
  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!d) return <p className="text-sm text-suave">Cargando…</p>;
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-3">
      <div><b>Por nivel:</b> {NIVELES.map(n => `${n} ${n in d.por_nivel ? conteo(d.por_nivel[n]) : 0}`).join(' · ')}</div>
      <div><b>Por origen:</b> {ORIGENES.map(o => `${o === 'Real' ? 'Reales' : 'Sintéticos'} ${o in d.por_origen ? conteo(d.por_origen[o]) : 0}`).join(' · ')}</div>
      <div><b>Grado medio:</b> {decimal(d.perfil.grado_medio)} · <b>Enlazados a la base:</b> {d.enlazados_a_la_base}</div>
    </div>
  );
}

/** Tarpuy Analytics ML: resultados del modelo de segmentación para el organizador. */
export default function PanelAnalitica() {
  const [datos, setDatos] = useState(null);      // { resumen, metricas, segmentos }
  const [sinModelo, setSinModelo] = useState(false);
  const [error, setError] = useState('');
  const [origen, setOrigen] = useState('Todos');
  const [nivel, setNivel] = useState('Todos');
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const [resumen, metricas, segmentos] = await Promise.all([leerResumen(), leerMetricas(), leerSegmentos()]);
      setDatos({ resumen, metricas, segmentos });
      setSinModelo(false);
    } catch (err) {
      if (err.status === 404) { setSinModelo(true); setDatos(null); } else setError(err.message);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => (datos?.segmentos.segmentos || []).map((s, i) => ({
    ...s, color: COLORES_SEGMENTO[i % COLORES_SEGMENTO.length], filtrado: contarFiltrado(s, origen, nivel),
  })), [datos, origen, nivel]);

  const cabeceraPanel = (
    <Tarjeta titulo="🧠 Tarpuy Analytics ML"
      subtitulo="Segmentación de participantes con K-Means. Solo muestra datos agregados (sin DNI ni nombres).">
      {sinModelo && <p className="mt-0 text-sm">Todavía no hay un modelo cargado. Entrénalo con <code>ml/entrenar.py</code> o en Colab y sube el archivo <code>segmentos.json</code>.</p>}
      {error && <p className="mt-0 text-sm text-error">No se pudo leer la analítica: {error}</p>}
      {!datos && <CargarModelo onCargado={cargar} />}
    </Tarjeta>
  );
  if (!datos) return cabeceraPanel;

  const { ejecucion, resumen, calidad_datos: calidad } = datos.resumen;
  const origenes = origen === 'Todos' ? ORIGENES.filter(o => resumen.por_origen?.[o]) : [origen];
  const totalFiltrado = filas.reduce((t, s) => t + s.filtrado.total, 0);
  const hayOcultos = filas.some(s => s.filtrado.oculto);
  const v = ejecucion.validacion || {};
  const noConfirmados = filas.filter(s => !s.confirmado_con_reales);

  return (
    <Tarjeta titulo="🧠 Tarpuy Analytics ML"
      subtitulo={`Modelo K-Means con k = ${ejecucion.k}, entrenado el ${new Date(ejecucion.fecha).toLocaleDateString('es-PE')} con ${ejecucion.n_registros} registros (fuente: ${ejecucion.fuente}). Solo datos agregados, sin DNI ni nombres.`}>
      <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label><span className={claseEtiqueta}>Origen del dato</span>
          <select className={claseCampo(false)} value={origen} onChange={e => setOrigen(e.target.value)}>
            <option>Todos</option><option value="Real">Reales</option><option value="Sintético">Sintéticos</option>
          </select>
        </label>
        <label><span className={claseEtiqueta}>Nivel educativo</span>
          <select className={claseCampo(false)} value={nivel} onChange={e => setNivel(e.target.value)}>
            <option>Todos</option>{NIVELES.map(n => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="mb-3.5 flex flex-wrap gap-3">
        <Indicador valor={totalFiltrado + (hayOcultos ? '*' : '')} texto="participantes" />
        <Indicador valor={resumen.por_origen?.Real ?? 0} texto="registros reales" />
        <Indicador valor={resumen.instituciones} texto="instituciones" />
        <Indicador valor={ejecucion.k} texto="segmentos" />
        <Indicador valor={decimal(ejecucion.silueta)} texto="silueta" />
      </div>

      {ejecucion.incluye_sinteticos && (
        <p className="mb-3.5 rounded-xl border border-[#f0a04b] px-3 py-2 text-sm">
          ⚠ El modelo incluye datos sintéticos. {noConfirmados.length > 0
            ? `${noConfirmados.map(s => s.codigo).join(', ')} no se confirma${noConfirmados.length > 1 ? 'n' : ''} con datos reales: trátalo${noConfirmados.length > 1 ? 's' : ''} como hipótesis.`
            : 'Todos los segmentos tienen respaldo en datos reales.'}
        </p>
      )}

      <h3 className="mt-[18px] mb-2 font-bold">Inscripciones por día</h3>
      <div className="mb-1 flex gap-4 text-sm">
        {origenes.map(o => <span key={o}><span className="mr-1 inline-block size-3 rounded-sm align-middle" style={{ background: COLOR_ORIGEN[o] }} />{o === 'Real' ? 'Reales' : 'Sintéticos'}</span>)}
        {nivel !== 'Todos' && <span className="text-suave">(el gráfico diario no se filtra por nivel)</span>}
      </div>
      <GraficoDiario diarias={resumen.diarias} origenes={origenes} />

      <h3 className="mt-[18px] mb-2 font-bold">Perfil de cada segmento</h3>
      <PerfilSegmentos segmentos={filas} indicadores={[
        { titulo: 'Participantes (con filtros)', valor: s => s.filtrado.total },
        { titulo: 'Tamaño medio de la delegación', valor: s => s.perfil.tam_delegacion },
        { titulo: '% con asesor', valor: s => s.perfil.con_asesor_pct },
        { titulo: 'Días antes del cierre (mediana)', valor: s => s.perfil.dias_antes_cierre_mediana },
      ]} />

      <div className="mt-3.5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead><tr>
            {['Segmento', 'Participantes', 'Reales'].map(t => <th key={t} className={cabecera}>{t}</th>)}
            <th className={cabecera + ' hidden sm:table-cell'}>Descripción</th>
          </tr></thead>
          <tbody>
            {filas.map(s => (
              <FilaSegmento key={s.codigo} s={s} abierto={abierto === s.codigo}
                onAlternar={() => setAbierto(abierto === s.codigo ? null : s.codigo)} />
            ))}
          </tbody>
        </table>
      </div>
      {hayOcultos && <p className="text-xs text-suave">* No incluye grupos de menos de 5 participantes, que no se muestran por privacidad.</p>}

      <details className="mt-[18px]">
        <summary className="cursor-pointer font-bold">Calidad del modelo y de los datos</summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{['k', 'Inercia', 'Silueta', 'Davies-Bouldin'].map(t => <th key={t} className={cabecera}>{t}</th>)}</tr></thead>
            <tbody>
              {datos.metricas.metricas.map(m => (
                <tr key={m.k} className={cx(m.k === datos.metricas.k_elegido && 'font-bold text-acento')}>
                  <td className={celda}>{m.k}</td><td className={celda}>{decimal(m.inercia)}</td>
                  <td className={celda}>{decimal(m.silueta)}</td><td className={celda}>{decimal(m.davies_bouldin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="m-0 space-y-1.5 pl-5 text-sm">
            <li>Davies-Bouldin del modelo: <b>{decimal(ejecucion.davies_bouldin)}</b> (menor es mejor).</li>
            {v.solo_reales && <li>Solo datos reales: silueta <b>{decimal(v.solo_reales.silueta)}</b>; coincidencia con el modelo completo ARI <b>{decimal(v.solo_reales.ari_vs_modelo_completo)}</b>.</li>}
            {v.ward && <li>Clustering jerárquico (Ward): silueta <b>{decimal(v.ward.silueta)}</b>; coincidencia con K-Means ARI <b>{decimal(v.ward.ari_vs_kmeans)}</b>.</li>}
            {calidad?.pagos_efectivo > 0 && <li>{calidad.pagos_efectivo} registros con pago en efectivo: revisar con el organizador.</li>}
            {calidad?.inicial_4_anios > 0 && <li>{calidad.inicial_4_anios} registros de Inicial 4 años.</li>}
          </ul>
        </div>
      </details>

      <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
        <button type="button" className={botonPrimario} onClick={() => { window.location = URL_EXCEL_ANALYTICS; }}>⬇ Exportar segmentos (Excel)</button>
        <CargarModelo onCargado={cargar} />
      </div>
    </Tarjeta>
  );
}

function FilaSegmento({ s, abierto, onAlternar }) {
  return (
    <>
      <tr className="cursor-pointer" onClick={onAlternar} aria-expanded={abierto}>
        <td className={celda}>
          <span className="mr-1.5 inline-block size-3 rounded-sm align-middle" style={{ background: s.color }} />
          <b>{s.codigo}</b> {s.nombre}
          {!s.confirmado_con_reales && <span className="ml-1.5 rounded-full border border-[#f0a04b] px-2 text-xs text-[#f0a04b]">sin respaldo real</span>}
          <p className="mt-1 mb-0 text-xs text-suave sm:hidden">{s.descripcion}</p>
        </td>
        <td className={celda}>{s.filtrado.total}{s.filtrado.oculto ? '*' : ''}</td>
        <td className={celda}>{conteo(s.reales)}</td>
        <td className={celda + ' hidden sm:table-cell'}>{s.descripcion}</td>
      </tr>
      {abierto && <tr><td colSpan={4} className={celda + ' bg-fondo'}><DetalleSegmento codigo={s.codigo} /></td></tr>}
    </>
  );
}
