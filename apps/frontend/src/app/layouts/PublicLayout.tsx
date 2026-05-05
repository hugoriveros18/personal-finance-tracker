import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/stores/authStore';
import { Box, Center } from '@mantine/core';

export function PublicLayout() {
  const isAuthenticated = useAuthStore((s) => !!s.accessToken && !!s.user);
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return (
    <Center mih="100vh" p="md">
      <Box w="100%" maw={420}>
        <Outlet />
      </Box>
    </Center>
  );
}
