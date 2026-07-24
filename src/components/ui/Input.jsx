import { forwardRef, useState } from 'react';
import './Input.css';

/* Ojo abierto / tachado, para mostrar u ocultar la contraseña. */
const IconoOjo = ({ visible }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
    {!visible && <line x1="3" y1="21" x2="21" y2="3" />}
  </svg>
);

const Input = forwardRef(function Input(
  { label, error, hint, type = 'text', className = '', ...rest },
  ref,
) {
  const id = rest.id ?? rest.name;

  /*
    Los campos de contraseña traen su propio boton para verla. Escribir una
    clave a ciegas y que rebote sin saber si fue un typo es de las cosas mas
    frustrantes de un login; mostrarla es un alivio y hoy es lo esperable.
    Va en el Input y no en cada pantalla para que valga en todos los
    formularios de la app.
  */
  const esPassword = type === 'password';
  const [verClave, setVerClave] = useState(false);
  const tipoFinal = esPassword && verClave ? 'text' : type;

  return (
    <div className={`cp-field ${className}`}>
      {label && (
        <label htmlFor={id} className="cp-field__label">
          {label}
        </label>
      )}

      <div className={esPassword ? 'cp-field__control cp-field__control--pass' : 'cp-field__control'}>
        <input
          ref={ref}
          id={id}
          type={tipoFinal}
          className={`cp-input ${error ? 'cp-input--error' : ''}`}
          {...rest}
        />
        {esPassword && (
          <button
            type="button"
            className="cp-field__ojo"
            onClick={() => setVerClave((v) => !v)}
            /* tabIndex -1: al tabular desde la contraseña se espera llegar al
               boton de ingresar, no a este control auxiliar. */
            tabIndex={-1}
            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            title={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            disabled={rest.disabled}
          >
            <IconoOjo visible={verClave} />
          </button>
        )}
      </div>

      {error && <div className="cp-field__error">{error}</div>}
      {!error && hint && <div className="cp-field__hint">{hint}</div>}
    </div>
  );
});

export default Input;
