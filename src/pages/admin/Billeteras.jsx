/*
  Billeteras — cuanta plata del consultorio tiene cada admin hoy.

  Va arriba de todo en el Resumen y en Movimientos porque es la primera
  pregunta de cada admin: "cuanto tengo". El numero grande es eso; la
  linea de abajo dice de donde sale, para que nadie tenga que confiar a
  ciegas: lo que tenia al corte, mas lo cobrado, menos lo gastado.

  El calculo vive en saldosDeBilletera (lib/gastos.js); aca solo se pinta.
*/

import { formatoARS } from '../../lib/constants.js';

import './Billeteras.css';

const pesos = (v) => formatoARS.format(Math.round(v));
/** Como en el libro: un cero va sin signo, "−$ 0" se lee como un monto. */
const conSigno = (signo, v) => (Math.round(v) ? `${signo}${pesos(v)}` : pesos(0));

/**
 * @param {Object} resultado - salida de saldosDeBilletera
 * @param {Function} [delMes] - (id) => { ingresos, egresos } del mes que se mira (solo Movimientos)
 * @param {string} [nombreMes] - 'octubre', para la linea del mes
 */
export default function Billeteras({ resultado, delMes, nombreMes }) {
  if (!resultado || resultado.billeteras.length === 0) return null;
  const { billeteras, sinReceptor } = resultado;

  return (
    <section className="cp-bill" aria-label="Billeteras">
      <div className="cp-bill__grid">
        {billeteras.map((b) => {
          const mes = delMes?.(b.id);
          return (
            <div key={b.id} className="cp-bill__card">
              <div className="cp-bill__titulo" title={b.completo}>
                Billetera de {b.nombre}
              </div>
              <div className={`cp-bill__saldo ${b.saldo < 0 ? 'cp-bill__saldo--neg' : ''}`}>
                {b.saldo < 0 ? '−' : ''}{pesos(Math.abs(b.saldo))}
              </div>
              {/* De donde sale el numero: sin esto la billetera es un acto de fe.
                  Sin fechas de corte a la vista: a quien la mira le importa
                  cuanto tiene y como se llego, no desde que dia se cuenta
                  (eso queda en la nota del consultorio, para quien la cargue). */}
              <div className="cp-bill__cuenta">
                <span>Saldo inicial {pesos(b.inicial)}</span>
                <span className={b.ingresos ? 'cp-bill__in' : ''}>{conSigno('+', b.ingresos)} cobrado</span>
                <span className={b.egresos ? 'cp-bill__out' : ''}>{conSigno('−', b.egresos)} gastado</span>
              </div>
              {mes && (
                <div className="cp-bill__mes">
                  En {nombreMes}: <span className={mes.ingresos ? 'cp-bill__in' : ''}>{conSigno('+', mes.ingresos)}</span>
                  {' · '}
                  <span className={mes.egresos ? 'cp-bill__out' : ''}>{conSigno('−', mes.egresos)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sinReceptor > 0 && (
        <p className="cp-bill__aviso" role="note">
          Hay {pesos(sinReceptor)} cobrados sin marcar quién los recibió: no están en ninguna billetera.
        </p>
      )}
    </section>
  );
}
