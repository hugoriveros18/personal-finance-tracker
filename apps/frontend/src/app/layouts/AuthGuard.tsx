import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useAuthStore } from '@/shared/stores/authStore';
import { tryRefreshSession } from '@/features/auth/api/auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [bootstrapping, setBootstrapping] = useState(!accessToken);

  useEffect(() => {
    if (accessToken && user) {
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const ok = await tryRefreshSession();
      if (!cancelled) setBootstrapping(false);
      if (!ok) {
        // No session — let render fall through to redirect
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, user]);

  if (bootstrapping) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!accessToken || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
