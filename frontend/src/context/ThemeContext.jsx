import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('theme', theme);
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
