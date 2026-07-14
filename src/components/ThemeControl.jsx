import { Monitor, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '../lib/ThemeProvider';

const options = [
  ['light', 'Light', Sun],
  ['dark', 'Dark', Moon],
  ['system', 'System', Monitor],
];

export default function ThemeControl({ className = '', onSelect }) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <fieldset className={clsx('theme-control', className)} aria-label="Appearance">
      <legend className="theme-control__label">Appearance <span className="sr-only">Current resolved appearance: {resolvedTheme}</span></legend>
      <div className="theme-control__options">
        {options.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-label={`Use ${label} appearance`}
            aria-pressed={preference === value}
            className="theme-control__option"
            onClick={(event) => {
              setPreference(value, { event, element: event.currentTarget });
              onSelect?.(value);
            }}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
