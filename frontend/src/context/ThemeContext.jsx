import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

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
    if (meta) meta.setAttribute('content', isDark ? '#0E1117' : '#F4F7F9');
  }, [theme]);

  // Neumorphic style resolver based on active theme
  const style = (neuDark, minDark, neuLight, minLight) => {
    if (theme === 'dark') {
      return neuDark;
    } else {
      if (minLight === undefined && neuLight === undefined && minDark !== undefined) {
        return minDark;
      }
      return neuLight || neuDark;
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
