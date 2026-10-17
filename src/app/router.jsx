import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import OverviewPage from '../pages/OverviewPage';
import MonitorsPage from '../pages/MonitorsPage';
import HistoryPage from '../pages/HistoryPage';
import VisualComparePage from '../pages/VisualComparePage';
import InsightsPage from '../pages/InsightsPage';
import NotFoundPage from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'monitors', element: <MonitorsPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'compare/:id', element: <VisualComparePage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
