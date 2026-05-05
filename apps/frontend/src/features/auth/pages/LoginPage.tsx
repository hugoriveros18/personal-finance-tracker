import { Anchor, Button, Card, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { login } from '../api/auth';
import { getApiErrorCode } from '@/shared/api/client';

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/app';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (err) {
      const code = getApiErrorCode(err);
      notifications.show({
        color: 'red',
        title: t('auth.login'),
        message:
          code === 'INVALID_CREDENTIALS'
            ? t('auth.invalidCredentials')
            : (t(`errors.${code ?? 'VALIDATION_ERROR'}`) ?? 'Error'),
      });
    }
  });

  return (
    <Card withBorder p="xl" radius="md">
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>{t('auth.signInTitle')}</Title>
          <Text c="dimmed" size="sm">
            {t('app.tagline')}
          </Text>
        </Stack>
        <form onSubmit={onSubmit}>
          <Stack>
            <TextInput
              label={t('auth.email')}
              type="email"
              autoComplete="email"
              {...register('email')}
              error={errors.email?.message}
            />
            <PasswordInput
              label={t('auth.password')}
              autoComplete="current-password"
              {...register('password')}
              error={errors.password?.message}
            />
            <Button type="submit" loading={isSubmitting} fullWidth>
              {t('auth.login')}
            </Button>
          </Stack>
        </form>
        <Text size="sm" ta="center">
          {t('auth.noAccount')}{' '}
          <Anchor component={Link} to="/register">
            {t('auth.register')}
          </Anchor>
        </Text>
      </Stack>
    </Card>
  );
}
