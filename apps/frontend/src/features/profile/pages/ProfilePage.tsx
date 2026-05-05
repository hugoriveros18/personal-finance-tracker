import { useRef } from 'react';
import {
  Avatar,
  Button,
  Card,
  Group,
  PasswordInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Divider,
  FileButton,
} from '@mantine/core';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/shared/stores/authStore';
import { usePreferencesStore } from '@/shared/stores/preferencesStore';
import { Page } from '@/shared/components/Page';
import { changePassword, deleteAvatar, patchProfile, uploadAvatar } from '../api/profile';
import { getApiErrorCode, getApiErrorMessage } from '@/shared/api/client';
import { useNavigate } from 'react-router-dom';
import { logout } from '@/features/auth/api/auth';

const profileSchema = z.object({
  nombre: z.string().min(1).max(80),
  apellidos: z.string().min(1).max(120),
  email: z.string().email().max(254),
});

const buildPasswordSchema = (t: (k: string) => string) =>
  z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
      confirmPassword: z.string().min(1),
    })
    .refine((v) => v.newPassword === v.confirmPassword, {
      message: t('auth.passwordsDontMatch'),
      path: ['confirmPassword'],
    });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setLanguage = usePreferencesStore((s) => s.setLanguage);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const language = usePreferencesStore((s) => s.language);
  const theme = usePreferencesStore((s) => s.theme);
  const fileResetRef = useRef<() => void>(null);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nombre: user?.nombre ?? '',
      apellidos: user?.apellidos ?? '',
      email: user?.email ?? '',
    },
  });
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(buildPasswordSchema(t)),
  });

  const onSaveProfile = profileForm.handleSubmit(async (values) => {
    try {
      const updated = await patchProfile(values);
      setUser(updated);
      notifications.show({ color: 'teal', message: t('common.saved') });
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  });

  const onSavePreferences = async () => {
    try {
      const updated = await patchProfile({ preferredLanguage: language, preferredTheme: theme });
      setUser(updated);
      void i18n.changeLanguage(language);
      notifications.show({ color: 'teal', message: t('common.saved') });
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  };

  const onChangePassword = passwordForm.handleSubmit(async (values) => {
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      notifications.show({
        color: 'teal',
        title: t('profile.passwordChanged'),
        message: t('profile.logoutAfterChange'),
      });
      passwordForm.reset();
      await logout();
      navigate('/login');
    } catch (err) {
      const code = getApiErrorCode(err);
      notifications.show({
        color: 'red',
        message:
          code === 'INVALID_CURRENT_PASSWORD'
            ? t('auth.invalidCredentials')
            : getApiErrorMessage(err),
      });
    }
  });

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    try {
      const { user: updated } = await uploadAvatar(file);
      setUser(updated);
      notifications.show({ color: 'teal', message: t('common.saved') });
      fileResetRef.current?.();
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  };

  const onRemoveAvatar = async () => {
    try {
      await deleteAvatar();
      if (user) setUser({ ...user, avatarPath: null });
      notifications.show({ color: 'teal', message: t('common.saved') });
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  };

  if (!user) return null;
  const initials = (user.nombre[0] ?? '') + (user.apellidos[0] ?? '');

  return (
    <Page title={t('profile.title')} description={t('profile.subtitle')}>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder p="lg">
          <Stack>
            <Title order={4}>{t('profile.avatar')}</Title>
            <Group>
              <Avatar src={user.avatarPath ?? undefined} size={96} radius="xl" color="teal">
                {initials}
              </Avatar>
              <Stack gap="xs">
                <FileButton resetRef={fileResetRef} onChange={onPickAvatar} accept="image/png,image/jpeg,image/webp">
                  {(props) => <Button {...props}>{t('profile.uploadAvatar')}</Button>}
                </FileButton>
                {user.avatarPath && (
                  <Button variant="subtle" color="red" onClick={onRemoveAvatar}>
                    {t('profile.removeAvatar')}
                  </Button>
                )}
              </Stack>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="lg">
          <Stack>
            <Title order={4}>{t('profile.preferences')}</Title>
            <div>
              <Text size="sm" mb={4}>
                {t('profile.theme')}
              </Text>
              <SegmentedControl
                value={theme}
                onChange={(v) => setTheme(v as 'light' | 'dark')}
                data={[
                  { value: 'light', label: t('profile.themeLight') },
                  { value: 'dark', label: t('profile.themeDark') },
                ]}
              />
            </div>
            <div>
              <Text size="sm" mb={4}>
                {t('profile.language')}
              </Text>
              <SegmentedControl
                value={language}
                onChange={(v) => setLanguage(v as 'es' | 'en')}
                data={[
                  { value: 'es', label: 'Español' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </div>
            <Button variant="light" onClick={onSavePreferences}>
              {t('common.save')}
            </Button>
          </Stack>
        </Card>

        <Card withBorder p="lg">
          <Stack>
            <Title order={4}>{t('profile.personalInfo')}</Title>
            <form onSubmit={onSaveProfile}>
              <Stack>
                <Group grow>
                  <TextInput
                    label={t('auth.nombre')}
                    {...profileForm.register('nombre')}
                    error={profileForm.formState.errors.nombre?.message}
                  />
                  <TextInput
                    label={t('auth.apellidos')}
                    {...profileForm.register('apellidos')}
                    error={profileForm.formState.errors.apellidos?.message}
                  />
                </Group>
                <TextInput
                  label={t('auth.email')}
                  type="email"
                  {...profileForm.register('email')}
                  error={profileForm.formState.errors.email?.message}
                />
                <Button type="submit" loading={profileForm.formState.isSubmitting}>
                  {t('common.save')}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card>

        <Card withBorder p="lg">
          <Stack>
            <Title order={4}>{t('profile.changePassword')}</Title>
            <form onSubmit={onChangePassword}>
              <Stack>
                <PasswordInput
                  label={t('auth.currentPassword')}
                  {...passwordForm.register('currentPassword')}
                  error={passwordForm.formState.errors.currentPassword?.message}
                />
                <PasswordInput
                  label={t('auth.newPassword')}
                  {...passwordForm.register('newPassword')}
                  error={passwordForm.formState.errors.newPassword?.message}
                />
                <PasswordInput
                  label={t('auth.confirmPassword')}
                  {...passwordForm.register('confirmPassword')}
                  error={passwordForm.formState.errors.confirmPassword?.message}
                />
                <Divider />
                <Button type="submit" color="orange" loading={passwordForm.formState.isSubmitting}>
                  {t('profile.changePassword')}
                </Button>
              </Stack>
            </form>
          </Stack>
        </Card>
      </SimpleGrid>
    </Page>
  );
}
