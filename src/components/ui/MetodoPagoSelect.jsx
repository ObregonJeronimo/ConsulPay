/**
 * MetodoPagoSelect — <select> que agrupa los metodos de pago en
 * optgroups por tipo: primero "Pago inmediato", despues "Pago diferido
 * (obras sociales)". Dentro de cada grupo se ordenan alfabeticamente.
 *
 * Reemplaza al patron `metodos.map(m => <option>)` que mostraba todo
 * mezclado por orden de creacion, confundiendo a quien elige.
 *
 * Props:
 *   - metodos: array de metodos del consultorio
 *   - value: id del metodo actualmente seleccionado
 *   - onChange: handler (e) => void, recibe el evento del select
 *   - id, name, required, disabled: pasados al <select>
 *   - className: clase adicional para el <select>
 *
 * Uso:
 *   <MetodoPagoSelect
 *     metodos={metodos}
 *     value={form.metodoPagoId}
 *     onChange={(e) => setField('metodoPagoId', e.target.value)}
 *   />
 */
import { TIPOS_METODO_PAGO } from '../../lib/constants.js';

export default function MetodoPagoSelect({
  metodos = [],
  value,
  onChange,
  id,
  name,
  required,
  disabled,
  className,
  children,           // opciones extras al inicio (ej: "Todos los metodos" en filtros)
}) {
  // Separamos por tipo. Los metodos sin tipo (legacy de antes del modelo
  // diferido/inmediato) los tratamos como inmediatos por compatibilidad.
  const inmediatos = [];
  const diferidos = [];

  for (const m of metodos) {
    if (m.tipo === TIPOS_METODO_PAGO.DIFERIDO) {
      diferidos.push(m);
    } else {
      inmediatos.push(m);
    }
  }

  // Orden alfabetico dentro de cada grupo. Usamos localeCompare con
  // sensitivity:'base' para que 'particular' y 'Particular' queden juntos.
  const cmp = (a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  inmediatos.sort(cmp);
  diferidos.sort(cmp);

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      disabled={disabled}
      className={className}
    >
      {children}
      {inmediatos.length > 0 && (
        <optgroup label="Pago inmediato">
          {inmediatos.map((m) => (
            <option key={m.id} value={m.id} disabled={m.activo === false}>
              {m.nombre}{m.activo === false ? ' (inactivo)' : ''}
            </option>
          ))}
        </optgroup>
      )}
      {diferidos.length > 0 && (
        <optgroup label="Obras sociales (pago diferido)">
          {diferidos.map((m) => (
            <option key={m.id} value={m.id} disabled={m.activo === false}>
              {m.nombre}{m.activo === false ? ' (inactivo)' : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
