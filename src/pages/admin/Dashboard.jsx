import Metric from '../../components/ui/Metric.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { formatoARS } from '../../lib/constants.js';
import './Dashboard.css';

/* --------------------------------------------------------------
   Datos mock — reemplazar por queries a Firestore en el próximo sprint
   -------------------------------------------------------------- */
const METRICAS_MOCK = [
  { label: 'Por cobrar', value: 485200, trend: '12%', trendDirection: 'up', sub: 'vs marzo' },
  { label: 'Cobrado este mes', value: 1237800, trend: '8%', trendDirection: 'up', sub: 'vs marzo' },
  { label: 'Profesionales activos', value: 12, sub: '2 pendientes de aprobación' },
  { label: 'Sesiones del mes', value: 347, trend: '5%', trendDirection: 'up', sub: 'vs marzo' },
];

const PROFESIONALES_DEUDA = [
  {
    id: 1,
    nombre: 'María Rodríguez',
    iniciales: 'MR',
    especialidad: 'Fonoaudiología',
    porcentaje: 30,
    sesiones: 42,
    facturado: 378000,
    debe: 113400,
    estado: 'pendiente',
    estadoLabel: 'Pendiente',
  },
  {
    id: 2,
    nombre: 'Lucía Fernández',
    iniciales: 'LF',
    especialidad: 'Psicología',
    porcentaje: 35,
    sesiones: 38,
    facturado: 456000,
    debe: 159600,
    estado: 'pendiente',
    estadoLabel: 'Pendiente',
  },
  {
    id: 3,
    nombre: 'Carlos Gómez',
    iniciales: 'CG',
    especialidad: 'Kinesiología',
    porcentaje: 25,
    sesiones: 29,
    facturado: 203000,
    debe: 50750,
    estado: 'vencido',
    estadoLabel: 'Vencido · 8 días',
  },
  {
    id: 4,
    nombre: 'Sofía Álvarez',
    iniciales: 'SA',
    especialidad: 'Nutrición',
    porcentaje: 30,
    sesiones: 18,
    facturado: 144000,
    debe: 43200,
    estado: 'pagado',
    estadoLabel: 'Pagado',
  },
];

const REGISTROS_PENDIENTES = [
  { id: 1, nombre: 'Valentina Paz', iniciales: 'VP', especialidad: 'Psicopedagogía', hace: 'hace 2 h' },
  { id: 2, nombre: 'Diego Ramírez', iniciales: 'DR', especialidad: 'Terapia Ocupacional', hace: 'ayer' },
];

const INGRESOS_6M = [
  { mes: 'Nov', valor: 45 },
  { mes: 'Dic', valor: 58 },
  { mes: 'Ene', valor: 52 },
  { mes: 'Feb', valor: 67 },
  { mes: 'Mar', valor: 73 },
  { mes: 'Abr', valor: 82 },
];

const TONO_BADGE = {
  pendiente: 'warning',
  vencido: 'danger',
  pagado: 'success',
};

/* --------------------------------------------------------------
   Íconos inline usados en esta página
   -------------------------------------------------------------- */
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/* --------------------------------------------------------------
   Componente principal
   -------------------------------------------------------------- */
export default function Dashboard() {
  const mesActual = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date());
  const mesCapitalizado = mesActual.charAt(0).toUpperCase() + mesActual.slice(1);

  return (
    <div className="cp-dashboard">
      {/* ---------- Header ---------- */}
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Resumen de {mesActual}</h1>
          <p className="cp-page-sub">Vista general del consultorio · actualizado hace unos segundos</p>
        </div>
        <Button variant="primary" icon={<PlusIcon />}>
          Registrar sesión
        </Button>
      </header>

      {/* ---------- Métricas ---------- */}
      <section className="cp-metrics-grid">
        {METRICAS_MOCK.map((m) => (
          <Metric
            key={m.label}
            label={m.label}
            value={typeof m.value === 'number' && m.label.toLowerCase().includes('cobr')
              ? formatoARS.format(m.value)
              : typeof m.value === 'number' && m.value > 1000
                ? formatoARS.format(m.value)
                : m.value}
            trend={m.trend}
            trendDirection={m.trendDirection}
            sub={m.sub}
          />
        ))}
      </section>

      {/* ---------- Profesionales con deuda ---------- */}
      <section className="cp-section">
        <div className="cp-section-head">
          <h2 className="cp-section-title">Profesionales con deuda abierta</h2>
          <a className="cp-section-link" href="/admin/profesionales">Ver todos →</a>
        </div>

        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Profesional</th>
                <th className="cp-num-col">Sesiones</th>
                <th className="cp-num-col">Facturado</th>
                <th className="cp-num-col">Debe</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {PROFESIONALES_DEUDA.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="cp-prof-cell">
                      <Avatar initials={p.iniciales} size={32} />
                      <div>
                        <div className="cp-prof-name">{p.nombre}</div>
                        <div className="cp-prof-meta">{p.especialidad} · {p.porcentaje}%</div>
                      </div>
                    </div>
                  </td>
                  <td className="cp-num">{p.sesiones}</td>
                  <td className="cp-num">{formatoARS.format(p.facturado)}</td>
                  <td className="cp-num">{formatoARS.format(p.debe)}</td>
                  <td><Badge tone={TONO_BADGE[p.estado]}>{p.estadoLabel}</Badge></td>
                  <td style={{ textAlign: 'right' }}>
                    <a className="cp-section-link" href={`/admin/profesionales/${p.id}`}>Ver detalle →</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Dos columnas ---------- */}
      <section className="cp-two-col">
        {/* Chart */}
        <div className="cp-panel">
          <h3 className="cp-panel-title">Ingresos últimos 6 meses</h3>
          <div className="cp-chart-bars">
            {INGRESOS_6M.map((m, i) => (
              <div
                key={m.mes}
                className={`cp-bar ${i === INGRESOS_6M.length - 1 ? 'cp-bar--current' : ''}`}
                style={{ height: `${m.valor}%` }}
              />
            ))}
          </div>
          <div className="cp-bar-labels">
            {INGRESOS_6M.map((m) => (
              <span key={m.mes}>{m.mes}</span>
            ))}
          </div>
        </div>

        {/* Pendientes */}
        <div className="cp-panel">
          <h3 className="cp-panel-title">Registros pendientes</h3>
          {REGISTROS_PENDIENTES.length === 0 ? (
            <p className="cp-empty">No hay solicitudes pendientes.</p>
          ) : (
            REGISTROS_PENDIENTES.map((r) => (
              <div key={r.id} className="cp-pending-item">
                <Avatar initials={r.iniciales} size={36} />
                <div className="cp-pending-info">
                  <div className="cp-pending-name">{r.nombre}</div>
                  <div className="cp-pending-meta">{r.especialidad} · solicitó acceso {r.hace}</div>
                </div>
                <div className="cp-pending-actions">
                  <button className="cp-icon-btn cp-icon-btn--approve" title="Aprobar" aria-label="Aprobar">
                    <CheckIcon />
                  </button>
                  <button className="cp-icon-btn cp-icon-btn--reject" title="Rechazar" aria-label="Rechazar">
                    <XIcon />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Marcador no usado pero guardado por si hace falta mostrar mes */}
      <span hidden>{mesCapitalizado}</span>
    </div>
  );
}
