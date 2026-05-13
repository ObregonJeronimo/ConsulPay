import { useEffect, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PACIENTE, TIPOS_METODO_PAGO, formatoARS } from '../../lib/constants.js';
import { suscribirPacientesProfesional } from '../../lib/pacientes.js';

import './../admin/Pacientes.css';

function iniciales(nombre, apellido) {
  const n = nombre?.[0] ?? '';
  const a = apellido?.[0] ?? '';
  return (a + n).toUpperCase() || '·';
}

function nombreCompleto(p) {
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}

export default function MisPacientes() {
  const { user } = useAuth();
  const { consultorio } = useConsultorio();
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Necesitamos AMBOS datos para que la query pase las Security Rules.
    // Si falta alguno (ej: consultorio todavía cargando), esperamos.
    if (!user?.uid || !user?.consultorioId) {
      setLoading(false);
      return;
    }

    const unsub = suscribirPacientesProfesional(
      user.uid,
      user.consultorioId,
      (data) => {
        setPacientes(data);
        setLoading(false);
      },
    );
    return unsub;
  }, [user?.uid, user?.consultorioId]);

  const metodos = consultorio?.metodosPagoPaciente ?? [];
  const mapaMetodos = {};
  for (const m of metodos) mapaMetodos[m.id] = m;

  const activos = pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO);

  if (loading) {
    return (
      <div className="cp-pacientes">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando…" />
        </div>
      </div>
    );
  }

  return (
    <div className="cp-pacientes">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Mis pacientes</h1>
          <p className="cp-page-sub">
            {activos.length === 0
              ? 'Todavía no te asignaron pacientes.'
              : `${activos.length} paciente${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}`
            }
          </p>
        </div>
      </header>

      {activos.length === 0 ? (
        <div className="cp-empty-pac">
          <div className="cp-empty-pac__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="32" cy="22" r="10" />
              <path d="M12 56c0-10 8-18 20-18s20 8 20 18" />
            </svg>
          </div>
          <h2 className="cp-empty-pac__title">Sin pacientes asignados</h2>
          <p className="cp-empty-pac__desc">
            Cuando el administrador del consultorio te asigne pacientes, los vas a ver acá
            junto con su método de pago y valor por sesión.
          </p>
        </div>
      ) : (
        <div className="cp-table-wrap">
          <table className="cp-table cp-pacientes-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Método</th>
                <th className="cp-num-col">Valor sesión</th>
                <th>Obra social Nº</th>
                <th>Contacto</th>
              </tr>
            </thead>
            <tbody>
              {activos.map((p) => {
                const metodo = mapaMetodos[p.metodoPagoId];
                const valor = metodo?.valorSesionDefault ?? 0;
                return (
                  <tr key={p.id}>
                    <td data-label="Paciente">
                      <div className="cp-prof-cell">
                        <Avatar initials={iniciales(p.nombre, p.apellido)} size={32} />
                        <div>
                          <div className="cp-prof-name">{nombreCompleto(p)}</div>
                          <div className="cp-prof-meta">
                            {p.dni ? `DNI ${p.dni}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Método" style={{ fontSize: 13.5 }}>
                      {metodo ? (
                        <>
                          {metodo.nombre}
                          {metodo.tipo === 'diferido' && (
                            <Badge tone="info" style={{ marginLeft: 6 }}>diferido</Badge>
                          )}
                        </>
                      ) : <span style={{ color: 'var(--cp-danger)' }}>—</span>}
                    </td>
                    <td data-label="Valor sesión" className="cp-num">
                      {metodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO ? (
                        <span style={{ color: 'var(--cp-text-faint)', fontStyle: 'italic', fontSize: 13 }}>
                          Según OS
                        </span>
                      ) : (
                        formatoARS.format(valor)
                      )}
                    </td>
                    <td data-label="Obra social Nº" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
                      {p.obraSocialNumero || '—'}
                    </td>
                    <td data-label="Contacto" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
                      {p.telefono || p.email || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
