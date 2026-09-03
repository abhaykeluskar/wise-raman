import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    const isDark = theme === 'dark';
    root.style.colorScheme = theme;
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    document.body.classList.toggle('dark', isDark);
    document.body.classList.toggle('light', !isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#111713' : '#F7F8F5');
  }, [theme]);

  // Style resolver: seamlessly handles both legacy calls and clean minimalist classes
  const style = (neuDark, minDark, neuLight, minLight) => {
    if (theme === 'dark') {
      return minDark || neuDark;
    } else {
      if (minLight !== undefined) return minLight;
      if (neuLight !== undefined) return neuLight;
      return minDark || neuDark;
    }
  };

  const c = (dark, light) => (theme === 'dark' ? dark : light);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, style, c }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
