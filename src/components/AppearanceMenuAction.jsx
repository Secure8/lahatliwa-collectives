import { useTheme } from '../lib/ThemeProvider';
import { nextThemePreference } from '../lib/theme';
import ThemeModeIcon from './ThemeModeIcon';

export default function AppearanceMenuAction({ className = '', iconOnly = false, ...props }) {
  const { resolvedTheme, setPreference } = useTheme();
  const nextTheme = nextThemePreference(resolvedTheme);
  const label = nextTheme === 'light' ? 'Switch to light mode' : 'Switch to dark mode';

  function changeTheme(event) {
    const element = event.currentTarget;
    const focusVisible = element.matches(':focus-visible');
    setPreference(nextTheme, { event, element });
    if (!focusVisible) element.blur();
  }

  return (
    <button {...props} type="button" className={className} onClick={changeTheme} aria-label={label} title={iconOnly ? label : undefined}>
      <ThemeModeIcon mode={nextTheme} size={18} />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
