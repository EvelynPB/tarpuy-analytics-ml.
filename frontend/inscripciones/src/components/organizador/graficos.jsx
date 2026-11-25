/** Gráficos simples en SVG para el panel de analítica (sin librerías externas). */

export const COLORES_SEGMENTO = ['#5fd0ff', '#2ec4a6', '#f0a04b', '#9db4e6', '#c792ea', '#ff8a80', '#ffd166', '#8bd3dd'];
export const COLOR_ORIGEN = { Real: '#5fd0ff', 'Sintético': '#f0a04b' };

/** Inscripciones por día, una línea por origen (reales / sintéticos). */
export function GraficoDiario({ diarias, origenes }) {
  const W = 640, H = 220, M = { t: 12, r: 12, b: 34, l: 36 };
  if (!diarias?.length) return <p className="text-sm text-suave">Sin datos de fechas.</p>;
  const max = Math.max(1, ...diarias.flatMap(d => origenes.map(o => d[o] || 0)));
  const x = i => M.l + (i * (W - M.l - M.r)) / Math.max(1, diarias.length - 1);
  const y = v => H - M.b - (v * (H - M.t - M.b)) / max;
  const marcas = [0, Math.round(max / 2), max];
  const cada = Math.ceil(diarias.length / 8);
  const fecha = f => f.slice(8, 10) + '/' + f.slice(5, 7);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label="Inscripciones por día según el origen del dato">
      {marcas.map(m => (
        <g key={m}>
          <line x1={M.l} x2={W - M.r} y1={y(m)} y2={y(m)} stroke="#2b4486" strokeWidth="1" />
          <text x={M.l - 6} y={y(m) + 4} textAnchor="end" fontSize="11" fill="#9db4e6">{m}</text>
        </g>
      ))}
      {diarias.map((d, i) => (i % cada === 0 || i === diarias.length - 1) && (
        <text key={d.fecha} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="#9db4e6">{fecha(d.fecha)}</text>
      ))}
      {origenes.map(o => (
        <polyline key={o} fill="none" stroke={COLOR_ORIGEN[o]} strokeWidth="2.5" strokeLinejoin="round"
          points={diarias.map((d, i) => `${x(i)},${y(d[o] || 0)}`).join(' ')}>
          <title>{o}</title>
        </polyline>
      ))}
    </svg>
  );
}

/** Barras pequeñas: un panel por indicador, una barra por segmento. */
export function PerfilSegmentos({ segmentos, indicadores }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {indicadores.map(({ titulo, valor }) => {
        const valores = segmentos.map(valor);
        const max = Math.max(1, ...valores);
        return (
          <figure key={titulo} className="m-0 rounded-xl bg-fondo p-3">
            <figcaption className="mb-2 text-xs font-bold text-suave">{titulo}</figcaption>
            <svg viewBox="0 0 120 90" className="h-auto w-full" role="img" aria-label={titulo}>
              {valores.map((v, i) => {
                const ancho = 100 / valores.length;
                const alto = (v / max) * 62;
                return (
                  <g key={segmentos[i].codigo}>
                    <rect x={10 + i * ancho + 3} y={72 - alto} width={ancho - 6} height={alto} rx="2"
                      fill={COLORES_SEGMENTO[i % COLORES_SEGMENTO.length]}>
                      <title>{`${segmentos[i].codigo}: ${String(v).replace('.', ',')}`}</title>
                    </rect>
                    <text x={10 + i * ancho + ancho / 2} y={70 - alto} textAnchor="middle" fontSize="8" fill="#eef3ff">{String(v).replace('.', ',')}</text>
                    <text x={10 + i * ancho + ancho / 2} y={84} textAnchor="middle" fontSize="8" fill="#9db4e6">{segmentos[i].codigo}</text>
                  </g>
                );
              })}
            </svg>
          </figure>
        );
      })}
    </div>
  );
}
