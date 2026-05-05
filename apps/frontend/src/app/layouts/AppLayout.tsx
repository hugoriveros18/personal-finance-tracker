import { useState } from 'react';
import { AppShell, Burger, Group, ScrollArea, Text, NavLink, ActionIcon, Menu, Avatar } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconLayoutDashboard,
  IconWallet,
  IconCategory,
  IconReceipt2,
  IconTransfer,
  IconCreditCardPay,
  IconUser,
  IconCloudDownload,
  IconLogout,
  IconLanguage,
  IconSun,
  IconMoon,
} from '@tabler/icons-react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/shared/stores/authStore';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { logout } from '@/features/auth/api/auth';

export function AppLayout() {
  const [opened, { toggle }] = useDisclosure();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const language = usePreferencesStore((s) => s.language);
  const theme = usePreferencesStore((s) => s.theme);
  const setLanguage = usePreferencesStore((s) => s.setLanguage);
  const setTheme = usePreferencesStore((s) => s.setTheme);

  const items = [
    { to: '/app', icon: IconLayoutDashboard, label: t('nav.dashboard') },
    { to: '/app/accounts', icon: IconWallet, label: t('nav.accounts') },
    { to: '/app/categories', icon: IconCategory, label: t('nav.categories') },
    { to: '/app/transactions', icon: IconReceipt2, label: t('nav.transactions') },
    { to: '/app/movements', icon: IconTransfer, label: t('nav.movements') },
    { to: '/app/liability-payments', icon: IconCreditCardPay, label: t('nav.liabilityPayments') },
    { to: '/app/backup', icon: IconCloudDownload, label: t('nav.backup') },
  ];

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user ? (user.nombre[0] ?? '') + (user.apellidos[0] ?? '') : '';

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text size="lg" fw={700} c="teal.7">
              PFT
            </Text>
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {t('app.tagline')}
            </Text>
          </Group>
          <Group>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="Theme toggle"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
            </ActionIcon>
            <Menu width={140} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" color="gray" aria-label="Language">
                  <IconLanguage size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  onClick={() => {
                    setLanguage('es');
                    void i18n.changeLanguage('es');
                  }}
                  fw={language === 'es' ? 700 : 400}
                >
                  Español
                </Menu.Item>
                <Menu.Item
                  onClick={() => {
                    setLanguage('en');
                    void i18n.changeLanguage('en');
                  }}
                  fw={language === 'en' ? 700 : 400}
                >
                  English
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Menu width={200} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="subtle" radius="xl" size={36} aria-label="Account">
                  <Avatar
                    src={user?.avatarPath ?? undefined}
                    radius="xl"
                    size={32}
                    color="teal"
                  >
                    {initials}
                  </Avatar>
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user?.email}</Menu.Label>
                <Menu.Item leftSection={<IconUser size={14} />} component={Link} to="/app/profile">
                  {t('nav.profile')}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item leftSection={<IconLogout size={14} />} onClick={onLogout} color="red">
                  {t('auth.logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          {items.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              active={
                item.to === '/app'
                  ? location.pathname === '/app'
                  : location.pathname.startsWith(item.to)
              }
              label={item.label}
              leftSection={<item.icon size={18} />}
            />
          ))}
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
