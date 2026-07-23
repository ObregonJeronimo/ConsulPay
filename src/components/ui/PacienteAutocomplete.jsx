/**
 * PacienteAutocomplete
 * ----------------------------------------------------------------
 * Reemplaza el <select> de paciente en formularios de sesion.
 * Permite buscar por DNI o por Nombre/Apellido en un mismo input.
 *
 * Caracteristicas:
 * - Busqueda case-insensitive y sin tildes ("perez" matchea "Pérez")
 * - DNI funciona con o sin puntos (12345678 == 12.345.678)
 * - Match exacto de DNI: aparece primero con badge "Coincidencia exacta"
 * - Pacientes asignados al profesional aparecen primero
 * - Muestra hasta 5 resultados
 * - Hasta 2 caracteres no muestra nada (evita listas con cualquier letra)
 * - Navegacion con teclado: ↑↓ para mover seleccion, Enter para elegir,
 *   Esc para cerrar
 * - Click fuera cierra el dropdown
 * - DNI se muestra siempre formateado con puntos en los resultados
 *
 * Props:
 *   pacientes:        array completo de pacientes (con id, nombre, apellido, dni, profesionalesUids, ...)
 *   value:            id del paciente seleccionado (o '')
 *   onChange:         (pacienteId) => void
 *   profesionalUid:   uid del profesional actual, para priorizar sus asignados
 *   placeholder:      texto del input (default: 'Ingrese DNI o nombre')
 *   required:         si el campo es obligatorio (visual / a11y)
 *   autoFocus:        si recibe focus al montar
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { getProfesionalesUids } from '../../lib/pacientes.js';

import './PacienteAutocomplete.css';

/* ============================================================
   Helpers
   ============================================================ */

/**
 * Normaliza un texto para comparar: lowercase + sin tildes + trim.
 * Asi "Pérez" matchea con "perez", "PEREZ", "  Pérez ", etc.
 */
function normalizar(texto) {
  if (!texto) return '';
  return texto
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Limpia un string de DNI a solo digitos.
 *   "12.345.678" -> "12345678"
 *   "12 345 678" -> "12345678"
 */
function dniSoloDigitos(dni) {
  if (!dni) return '';
  return dni.toString().replace(/\D/g, '');
}

/**
 * Formatea un DNI agregandole puntos como separadores de miles.
 *   "12345678"  -> "12.345.678"
 *   "9876543"   -> "9.876.543"
 *   ""          -> ""
 *   null        -> ""
 *
 * Si el DNI no es numerico (algun caso raro de carga manual), lo
 * devuelve tal cual sin tocar.
 */
function formatearDNI(dni) {
  if (!dni) return '';
  const digitos = dniSoloDigitos(dni);
  if (!digitos) return dni;  // no son digitos, devuelvo lo que vino
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Detecta si el query parece un DNI: tiene >= 2 digitos despues de
 * limpiar puntos/espacios.
 *
 * NOTA HISTORICA: el umbral inicial era >= 3 digitos pero un usuario
 * reporto que escribir "45" no encontraba un DNI que empezaba con 45.
 * Bajamos a >= 2 para que sea consistente con el umbral general de
 * busqueda (que tambien es 2 caracteres). Ver buscarPacientes().
 */
function pareceDNI(query) {
  const limpio = dniSoloDigitos(query);
  return limpio.length >= 2;
}

/**
 * Formatea el nombre del paciente como "Apellido, Nombre".
 * Si falta apellido o nombre, hace lo mejor posible.
 */
function nombreCompleto(p) {
  const ap = p.apellido?.trim() || '';
  const no = p.nombre?.trim() || '';
  if (ap && no) return `${ap}, ${no}`;
  return ap || no || '(sin nombre)';
}

/**
 * Devuelve true si el profesional con `uid` esta asignado al paciente.
 * Compatible con ambos formatos:
 *  - profesionalesUids: string[] (formato actual N:N)
 *  - profesionalUid:    string  (formato legacy 1:N, por si quedo algun
 *                                doc sin migrar)
 */
function pacienteEsAsignadoA(paciente, profesionalUid) {
  if (!profesionalUid || !paciente) return false;
  const uids = getProfesionalesUids(paciente);
  return uids.includes(profesionalUid);
}

/* ============================================================
   Algoritmo de busqueda
   ============================================================ */

/**
 * Filtra y rankea pacientes para el query dado.
 * Devuelve un array de hasta `limite` pacientes, ordenados por relevancia.
 *
 * Logica:
 * 1. Si el query parece DNI, busca match exacto y luego prefijos en dni.
 * 2. Si parece nombre, hace startsWith de apellido y de nombre.
 * 3. Pacientes asignados al profesional actual reciben +1 a su score
 *    (asi quedan arriba con igualdad).
 * 4. El match exacto de DNI siempre va primero (flag matchExacto).
 */
function buscarPacientes(query, pacientes, profesionalUid, limite = 5) {
  const q = normalizar(query);
  if (q.length < 2) return [];

  const esDNI = pareceDNI(query);
  const qDigitos = dniSoloDigitos(query);

  const resultados = [];

  for (const p of pacientes) {
    const dniDigitos = dniSoloDigitos(p.dni);
    const apellidoNorm = normalizar(p.apellido);
    const nombreNorm = normalizar(p.nombre);
    const nombreCompletoNorm = `${apellidoNorm} ${nombreNorm}`;

    let score = 0;
    let matchExacto = false;

    if (esDNI) {
      if (dniDigitos && dniDigitos === qDigitos) {
        // Match exacto del DNI completo
        score = 100;
        matchExacto = true;
      } else if (dniDigitos && dniDigitos.startsWith(qDigitos)) {
        // Prefijo de DNI: 12345 matchea 12345678
        score = 50;
      }
    }

    // Tambien intentamos por nombre aunque parezca DNI: alguien podria
    // tener un alias numerico, o un usuario tipear "12 perez" (caso raro
    // pero el costo de revisar es bajo).
    if (apellidoNorm.startsWith(q) || nombreCompletoNorm.startsWith(q)) {
      score = Math.max(score, 40);
    } else if (apellidoNorm.includes(q) || nombreNorm.includes(q)) {
      score = Math.max(score, 20);
    }

    if (score > 0) {
      // Bonus si esta asignado al profesional actual.
      // Modelo N:N: el paciente puede tener varios profesionales, asi
      // que chequeamos si profesionalUid esta en el array.
      if (pacienteEsAsignadoA(p, profesionalUid)) {
        score += 5;
      }
      resultados.push({ paciente: p, score, matchExacto });
    }
  }

  // Ordenar por score descendente, con desempate alfabetico por apellido
  resultados.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ap1 = (a.paciente.apellido || '').toLowerCase();
    const ap2 = (b.paciente.apellido || '').toLowerCase();
    return ap1.localeCompare(ap2, 'es');
  });

  // Si hay un match exacto de DNI, garantizamos que vaya primero
  // aunque el sort lo deje primero igual (por score 100+5 vs lo que sea)
  return resultados.slice(0, limite);
}

/* ============================================================
   Componente
   ============================================================ */

export default function PacienteAutocomplete({
  pacientes,
  value,
  onChange,
  profesionalUid,
  placeholder = 'Ingrese DNI o nombre',
  required = false,
  autoFocus = false,
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Si llega un value (paciente preseleccionado), pintamos su nombre en el input.
  // Solo se ejecuta cuando cambia value desde afuera, no cuando el user escribe.
  const pacienteSeleccionado = useMemo(() => {
    if (!value) return null;
    return pacientes.find((p) => p.id === value) || null;
  }, [value, pacientes]);

  useEffect(() => {
    if (pacienteSeleccionado) {
      // Mostramos "Apellido, Nombre — DNI: XX.XXX.XXX" en el input
      const txt = pacienteSeleccionado.dni
        ? `${nombreCompleto(pacienteSeleccionado)} — DNI: ${formatearDNI(pacienteSeleccionado.dni)}`
        : nombreCompleto(pacienteSeleccionado);
      setQuery(txt);
      setOpen(false);
    } else {
      setQuery('');
    }
    // Solo nos importa cuando cambia value/paciente desde fuera, no la query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteSeleccionado?.id]);

  // Resultados filtrados en vivo segun query
  const resultados = useMemo(() => {
    return buscarPacientes(query, pacientes, profesionalUid, 5);
  }, [query, pacientes, profesionalUid]);

  // Mantener el highlight dentro del rango cuando cambian los resultados
  useEffect(() => {
    if (highlightIdx >= resultados.length) {
      setHighlightIdx(0);
    }
  }, [resultados, highlightIdx]);

  // Click fuera cierra el dropdown
  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function elegir(paciente) {
    onChange(paciente.id);
    // El useEffect del value se va a encargar de pintar el txt
    setOpen(false);
    inputRef.current?.blur();
  }

  function limpiar() {
    onChange('');
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  }

  function onChangeInput(e) {
    const newQuery = e.target.value;
    setQuery(newQuery);
    setOpen(true);
    setHighlightIdx(0);

    // Si el user borra todo, limpiamos la seleccion tambien
    if (!newQuery && value) {
      onChange('');
    }
  }

  function onFocus() {
    // Si hay paciente seleccionado, al hacer focus seleccionamos el texto
    // entero para que el user pueda reemplazar facilmente. Si no, abrimos
    // el dropdown (que igual va a estar vacio hasta que escriba 2+ chars).
    if (value && inputRef.current) {
      inputRef.current.select();
    }
    setOpen(true);
  }

  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((idx) => Math.min(idx + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((idx) => Math.max(idx - 1, 0));
    } else if (e.key === 'Enter') {
      if (resultados[highlightIdx]) {
        e.preventDefault();
        elegir(resultados[highlightIdx].paciente);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const queryNormalizada = normalizar(query);
  const muestraHint = open && query && queryNormalizada.length < 2;
  const muestraVacio = open && queryNormalizada.length >= 2 && resultados.length === 0;
  const muestraLista = open && resultados.length > 0;

  return (
    <div className="cp-pac-ac" ref={containerRef}>
      <div className="cp-pac-ac__input-wrap">
        <svg
          className="cp-pac-ac__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          className="cp-pac-ac__input"
          value={query}
          onChange={onChangeInput}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
        />

        {value && !disabled && (
          <button
            type="button"
            className="cp-pac-ac__clear"
            onClick={limpiar}
            aria-label="Limpiar selección"
            tabIndex={-1}
          >
            ×
          </button>
        )}
      </div>

      {muestraHint && (
        <div className="cp-pac-ac__panel">
          <div className="cp-pac-ac__hint">
            Escribí al menos 2 caracteres para buscar
          </div>
        </div>
      )}

      {muestraVacio && (
        <div className="cp-pac-ac__panel">
          <div className="cp-pac-ac__hint">
            Sin resultados para <strong>{query}</strong>
          </div>
        </div>
      )}

      {muestraLista && (
        <ul className="cp-pac-ac__panel cp-pac-ac__list" role="listbox">
          {resultados.map((r, idx) => {
            const p = r.paciente;
            // Modelo N:N: el paciente puede tener varios profesionales,
            // chequeamos array-contains via helper.
            const esAsignado = pacienteEsAsignadoA(p, profesionalUid);
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={idx === highlightIdx}
                className={`cp-pac-ac__item ${idx === highlightIdx ? 'cp-pac-ac__item--active' : ''}`}
                onMouseDown={(e) => {
                  // mousedown en vez de click: si usamos click, el blur del
                  // input dispara antes y cierra el panel
                  e.preventDefault();
                  elegir(p);
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                <div className="cp-pac-ac__item-main">
                  <span className="cp-pac-ac__item-nombre">
                    {nombreCompleto(p)}
                  </span>
                  {p.dni && (
                    <span className="cp-pac-ac__item-dni">
                      DNI: {formatearDNI(p.dni)}
                    </span>
                  )}
                </div>
                <div className="cp-pac-ac__item-tags">
                  {r.matchExacto && (
                    <span className="cp-pac-ac__tag cp-pac-ac__tag--exact">
                      Coincidencia exacta
                    </span>
                  )}
                  {esAsignado && !r.matchExacto && (
                    <span className="cp-pac-ac__tag cp-pac-ac__tag--asignado">
                      Tu paciente
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
