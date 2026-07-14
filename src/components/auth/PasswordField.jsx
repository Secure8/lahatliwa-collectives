import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { FieldError } from '../FieldFeedback';

export default function PasswordField({ label, value, onChange, autoComplete, minLength, disabled = false, error = '', inputRef }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = `password-${generatedId}`;
  const errorId = `${inputId}-error`;
  return (
    <label className="grid gap-2 text-sm text-zinc-300" htmlFor={inputId}>
      <span>{label}</span>
      <span className="relative block">
        <input
          ref={inputRef}
          id={inputId}
          className="w-full rounded-md border border-white/[0.14] bg-white/[0.035] px-3 py-3 pr-12 text-white outline-none transition placeholder:text-zinc-600 hover:border-amber-200/25 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 aria-[invalid=true]:border-red-300/60 aria-[invalid=true]:focus:ring-red-300/20"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-zinc-500 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200/60"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
      <FieldError id={errorId}>{error}</FieldError>
    </label>
  );
}
