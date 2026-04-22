import { forwardRef } from 'react';
import './Input.css';

const Input = forwardRef(function Input(
  { label, error, hint, type = 'text', className = '', ...rest },
  ref,
) {
  const id = rest.id ?? rest.name;
  return (
    <div className={`cp-field ${className}`}>
      {label && (
        <label htmlFor={id} className="cp-field__label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        type={type}
        className={`cp-input ${error ? 'cp-input--error' : ''}`}
        {...rest}
      />
      {error && <div className="cp-field__error">{error}</div>}
      {!error && hint && <div className="cp-field__hint">{hint}</div>}
    </div>
  );
});

export default Input;
