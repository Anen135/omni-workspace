import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type ColorTheme = 'light' | 'dark';
const storageKey = 'omni-color-theme';
const systemQuery = '(prefers-color-scheme: dark)';
const ThemeContext = createContext<{ theme: ColorTheme; toggle: () => void } | null>(null);

function savedTheme(): ColorTheme | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch { return null; }
}

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [preference, setPreference] = useState<ColorTheme | null>(savedTheme);
  const [systemDark, setSystemDark] = useState(() => matchMedia(systemQuery).matches);
  const theme = preference ?? (systemDark ? 'dark' : 'light');

  useLayoutEffect(() => {
    const media = matchMedia(systemQuery);
    const updateSystem = () => setSystemDark(media.matches);
    const updateStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setPreference(savedTheme());
    };
    updateSystem();
    media.addEventListener('change', updateSystem);
    window.addEventListener('storage', updateStorage);
    return () => {
      media.removeEventListener('change', updateSystem);
      window.removeEventListener('storage', updateStorage);
    };
  }, []);

  useLayoutEffect(() => {
    // Scope extension styling to its host, including tooltips portalled into the shadow root.
    const tree = marker.current?.getRootNode();
    const target = tree instanceof ShadowRoot ? tree.host : document.documentElement;
    const previous = target.getAttribute('data-omni-theme');
    target.setAttribute('data-omni-theme', theme);
    return () => {
      if (previous === null) target.removeAttribute('data-omni-theme');
      else target.setAttribute('data-omni-theme', previous);
    };
  }, [theme]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setPreference(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the switch usable when storage is unavailable. */ }
  };

  return <ThemeContext.Provider value={{ theme, toggle }}><span hidden ref={marker}/>{children}</ThemeContext.Provider>;
}

export function ColorThemeToggle() {
  const context = useContext(ThemeContext);
  if (!context) return null;
  const dark = context.theme === 'dark';
  const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  return <button className="button secondary compact header-icon color-theme-toggle" type="button"
    aria-label={label} title={label} aria-pressed={dark} onClick={context.toggle}>
    {dark ? <Sun size={16} aria-hidden="true"/> : <Moon size={16} aria-hidden="true"/>}
  </button>;
}
