import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export default function PasswordField({ label, value, onChange, autoComplete, minLength, disabled = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <span className="relative block">
        <input
          className="w-full rounded-md border border-white/[0.14] bg-white/[0.035] px-3 py-3 pr-12 text-white outline-none transition placeholder:text-zinc-600 hover:border-amber-200/25 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
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
    </label>
  );
}
