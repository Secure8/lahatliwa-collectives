import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/ThemeProvider';
import { nextThemePreference } from '../lib/theme';

export default function AppearanceMenuAction({ className = '' }) {
  const { resolvedTheme, setPreference } = useTheme();
  const nextTheme = nextThemePreference(resolvedTheme);
  const Icon = nextTheme === 'light' ? Sun : Moon;
  const label = nextTheme === 'light' ? 'Use Light Mode' : 'Use Dark Mode';

  return (
    <button type="button" className={className} onClick={(event) => setPreference(nextTheme, { event, element: event.currentTarget })} aria-label={label}>
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
