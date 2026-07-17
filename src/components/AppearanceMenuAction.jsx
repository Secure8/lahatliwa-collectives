import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/ThemeProvider';
import { nextThemePreference } from '../lib/theme';

export default function AppearanceMenuAction({ className = '', iconOnly = false, ...props }) {
  const { resolvedTheme, setPreference } = useTheme();
  const nextTheme = nextThemePreference(resolvedTheme);
  const Icon = nextTheme === 'light' ? Sun : Moon;
  const label = nextTheme === 'light' ? 'Use Light Mode' : 'Use Dark Mode';

  return (
    <button {...props} type="button" className={className} onClick={(event) => setPreference(nextTheme, { event, element: event.currentTarget })} aria-label={label} title={iconOnly ? label : undefined}>
      <Icon className="theme-switch-icon" size={18} aria-hidden="true" />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
