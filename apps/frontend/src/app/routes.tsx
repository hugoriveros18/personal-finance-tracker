import { Navigate, type RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Center, Loader } from '@mantine/core';
import { AppLayout } from './layouts/AppLayout';
import { AuthGuard } from './layouts/AuthGuard';
import { PublicLayout } from './layouts/PublicLayout';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const AccountsPage = lazy(() => import('@/features/accounts/pages/AccountsPage'));
const AccountDetailPage = lazy(() => import('@/features/accounts/pages/AccountDetailPage'));
const CategoriesPage = lazy(() => import('@/features/categories/pages/CategoriesPage'));
const TransactionsPage = lazy(() => import('@/features/transactions/pages/TransactionsPage'));
const MovementsPage = lazy(() => import('@/features/movements/pages/MovementsPage'));
const LiabilityPaymentsPage = lazy(
  () => import('@/features/liability-payments/pages/LiabilityPaymentsPage'),
);
const ProfilePage = lazy(() => import('@/features/profile/pages/ProfilePage'));
const BackupPage = lazy(() => import('@/features/backup/pages/BackupPage'));
const NotFoundPage = lazy(() => import('@/features/misc/pages/NotFoundPage'));

const Suspended = ({ children }: { children: React.ReactNode }) => (
  <Suspense
    fallback={
      <Center h="60vh">
        <Loader />
      </Center>
    }
  >
    {children}
  </Suspense>
);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <Navigate to="/app" replace /> },
      { path: 'login', element: <Suspended><LoginPage /></Suspended> },
      { path: 'register', element: <Suspended><RegisterPage /></Suspended> },
    ],
  },
  {
    path: '/app',
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Suspended><DashboardPage /></Suspended> },
      { path: 'accounts', element: <Suspended><AccountsPage /></Suspended> },
      { path: 'accounts/:id', element: <Suspended><AccountDetailPage /></Suspended> },
      { path: 'categories', element: <Suspended><CategoriesPage /></Suspended> },
      { path: 'transactions', element: <Suspended><TransactionsPage /></Suspended> },
      { path: 'movements', element: <Suspended><MovementsPage /></Suspended> },
      { path: 'liability-payments', element: <Suspended><LiabilityPaymentsPage /></Suspended> },
      { path: 'profile', element: <Suspended><ProfilePage /></Suspended> },
      { path: 'backup', element: <Suspended><BackupPage /></Suspended> },
    ],
  },
  { path: '*', element: <Suspended><NotFoundPage /></Suspended> },
];
