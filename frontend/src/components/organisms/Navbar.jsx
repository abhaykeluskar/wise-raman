import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useFinance } from '../../context/FinanceContext';
import { TopBar } from './TopBar';

// Backwards compatibility wrapper for Navbar
export const Navbar = (props) => {
  return <TopBar {...props} />;
};
