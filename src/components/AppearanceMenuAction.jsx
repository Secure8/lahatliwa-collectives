import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/ThemeProvider';
import { nextThemePreference } from '../lib/theme';

export default function AppearanceMenuAction({ className = '', iconOnly = false, ...props }) {
  const { resolvedTheme, setPreference } = useTheme();
  const nextTheme = nextThemePreference(resolvedTheme);
  const Icon = nextTheme === 'light' ? Sun : Moon;
  const label = nextTheme === 'light' ? 'Use Light Mode' : 'Use Dark Mode';

  function changeTheme(event) {
    const element = event.currentTarget;
    const focusVisible = element.matches(':focus-visible');
    setPreference(nextTheme, { event, element });
    if (!focusVisible) element.blur();
  }

  return (
    <button {...props} type="button" className={className} onClick={changeTheme} aria-label={label} title={iconOnly ? label : undefined}>
      <Icon className="theme-switch-icon" size={18} aria-hidden="true" />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
