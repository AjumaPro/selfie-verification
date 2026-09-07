import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import './PasswordInput.css';

/**
 * Password field with show/hide toggle for typing visibility.
 * Forwards standard input props; forces type text|password from toggle.
 */
const PasswordInput = ({
  className = '',
  id,
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoComplete,
  disabled,
  name,
  autoFocus,
  'aria-label': ariaLabel,
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrap">
      <input
        id={id}
        name={name}
        className={`form-input password-input-field ${className}`.trim()}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? <FaEyeSlash aria-hidden /> : <FaEye aria-hidden />}
      </button>
    </div>
  );
};

export default PasswordInput;
