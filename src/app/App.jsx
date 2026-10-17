import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { ObservatoryProvider } from '../context/ObservatoryContext';
import { router } from './router';

export default function App() {
  return (
    <ThemeProvider>
      <ObservatoryProvider>
        <RouterProvider router={router} />
      </ObservatoryProvider>
    </ThemeProvider>
  );
}
