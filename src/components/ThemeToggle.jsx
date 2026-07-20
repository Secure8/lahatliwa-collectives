import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../lib/ThemeProvider';
import { nextThemePreference } from '../lib/theme';
import { createThemeToggleVisibilityController } from '../lib/themeToggleVisibility';
import ThemeModeIcon from './ThemeModeIcon';

export default function ThemeToggle() {
  const { resolvedTheme, setPreference } = useTheme();
  const location = useLocation();
  const controllerRef = useRef(null);
  const buttonRef = useRef(null);
  const [scrollHidden, setScrollHidden] = useState(false);
  const nextTheme = nextThemePreference(resolvedTheme);
  const label = nextTheme === 'light' ? 'Switch to light mode' : 'Switch to dark mode';
  const adminWorkspaceHasIntegratedToggle = location.pathname.startsWith('/admin')
    && location.pathname !== '/admin/login';
  const editorialWorkspaceHasIntegratedToggle = location.pathname.startsWith('/editorial');

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

  useEffect(() => {
    const button = buttonRef.current;
    const focusVisible = button === document.activeElement && button.matches(':focus-visible');
    controllerRef.current?.onThemeChange({ focusVisible });
  }, [resolvedTheme]);

  if (adminWorkspaceHasIntegratedToggle || editorialWorkspaceHasIntegratedToggle) return null;

  function changeTheme(event) {
    const element = event.currentTarget;
    const focusVisible = element.matches(':focus-visible');
    setPreference(nextTheme, { event, element });
    if (!focusVisible) element.blur();
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={clsx('theme-toggle theme-toggle--global', scrollHidden && 'theme-toggle--scroll-hidden')}
      aria-label={label}
      title={label}
      data-scroll-hidden={scrollHidden ? 'true' : 'false'}
      onFocus={(event) => controllerRef.current?.onFocus(event.currentTarget.matches(':focus-visible'))}
      onBlur={() => controllerRef.current?.onBlur()}
      onPointerEnter={() => controllerRef.current?.onPointerEnter()}
      onPointerLeave={() => controllerRef.current?.onPointerLeave()}
      onClick={changeTheme}
    >
      <ThemeModeIcon mode={nextTheme} size={19} className="theme-toggle__icon" />
    </button>
  );
}
