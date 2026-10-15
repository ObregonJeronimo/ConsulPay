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

/** '2026-10-03' -> '2/10': el dia ANTERIOR, que es al cierre del cual se cargo el saldo. */
function diaDelCorte(desde) {
  const [y, m, d] = desde.split('-').map(Number);
  const f = new Date(y, m - 1, d - 1);
  return `${f.getDate()}/${f.getMonth() + 1}`;
}

/** '2026-10-03' -> '3/10' */
function diaCorto(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

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
  const { desde, billeteras, sinReceptor } = resultado;
  const corte = diaDelCorte(desde);

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
              {/* De donde sale el numero: sin esto la billetera es un acto de fe. */}
              <div className="cp-bill__cuenta">
                <span>Tenía {pesos(b.inicial)} al {corte}</span>
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

      <p className="cp-bill__nota">
        Plata del consultorio que tiene cada admin hoy: lo que tenía al cierre del {corte}, más lo
        cobrado y menos lo gastado desde el {diaCorto(desde)}.
      </p>
      {sinReceptor > 0 && (
        <p className="cp-bill__aviso" role="note">
          Desde el {diaCorto(desde)} se cobraron {pesos(sinReceptor)} sin marcar quién los recibió:
          no están en ninguna billetera.
        </p>
      )}
    </section>
  );
}
