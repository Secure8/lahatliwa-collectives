import { Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../lib/ThemeProvider';
import { nextThemePreference } from '../lib/theme';
import { createThemeToggleVisibilityController } from '../lib/themeToggleVisibility';

export default function ThemeToggle() {
  const { resolvedTheme, setPreference } = useTheme();
  const location = useLocation();
  const controllerRef = useRef(null);
  const [scrollHidden, setScrollHidden] = useState(false);
  const nextTheme = nextThemePreference(resolvedTheme);
  const label = nextTheme === 'light' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  const Icon = nextTheme === 'light' ? Sun : Moon;

  useEffect(() => {
    const controller = createThemeToggleVisibilityController({ onHiddenChange: setScrollHidden });
    controllerRef.current = controller;
    controller.suppress();
    window.addEventListener('scroll', controller.onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', controller.onScroll);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.suppress();
  }, [location.key, location.pathname, location.search]);

  return (
    <button
      type="button"
      className={clsx('theme-toggle theme-toggle--global', scrollHidden && 'theme-toggle--scroll-hidden')}
      aria-label={label}
      title={label}
      data-scroll-hidden={scrollHidden ? 'true' : 'false'}
      onFocus={() => controllerRef.current?.onFocus()}
      onBlur={() => controllerRef.current?.onBlur()}
      onPointerEnter={() => controllerRef.current?.onPointerEnter()}
      onPointerLeave={() => controllerRef.current?.onPointerLeave()}
      onClick={(event) => setPreference(nextTheme, { event, element: event.currentTarget })}
    >
      <Icon className="theme-toggle__icon" size={19} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
