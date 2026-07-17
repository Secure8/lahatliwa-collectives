import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';

export default function ThemeModeIcon({ mode, size = 18, className = '' }) {
  return (
    <span className={clsx('theme-mode-icon', className)} aria-hidden="true">
      <Sun className={clsx('theme-mode-icon__layer theme-mode-icon__sun', mode === 'light' && 'theme-mode-icon__layer--active')} size={size} />
      <Moon className={clsx('theme-mode-icon__layer theme-mode-icon__moon', mode === 'dark' && 'theme-mode-icon__layer--active')} size={size} />
    </span>
  );
}
