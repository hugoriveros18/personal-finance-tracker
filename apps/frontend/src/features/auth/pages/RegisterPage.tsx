import {
  Anchor,
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { register as registerApi } from '../api/auth';
import { getApiErrorCode } from '@/shared/api/client';

const buildSchema = (t: (k: string) => string) =>
  z
    .object({
      nombre: z.string().min(1).max(80),
      apellidos: z.string().min(1).max(120),
      email: z.string().email().max(254),
      password: z.string().min(8).max(128),
      confirmPassword: z.string().min(1),
    })
    .refine((v) => v.password === v.confirmPassword, {
      message: t('auth.passwordsDontMatch'),
      path: ['confirmPassword'],
    });

type FormValues = {
  nombre: string;
  apellidos: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(t)),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerApi({
        nombre: values.nombre,
        apellidos: values.apellidos,
        email: values.email,
        password: values.password,
      });
      navigate('/app');
    } catch (err) {
      const code = getApiErrorCode(err);
      notifications.show({
        color: 'red',
        title: t('auth.register'),
        message:
          code === 'FORBIDDEN'
            ? t('auth.registrationDisabled')
            : (t(`errors.${code ?? 'VALIDATION_ERROR'}`) ?? 'Error'),
      });
    }
  });

  return (
    <Card withBorder p="xl" radius="md">
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={2}>{t('auth.signUpTitle')}</Title>
          <Text c="dimmed" size="sm">
            {t('app.tagline')}
          </Text>
        </Stack>
        <form onSubmit={onSubmit}>
          <Stack>
            <Group grow>
              <TextInput label={t('auth.nombre')} {...register('nombre')} error={errors.nombre?.message} />
              <TextInput label={t('auth.apellidos')} {...register('apellidos')} error={errors.apellidos?.message} />
            </Group>
            <TextInput
              label={t('auth.email')}
              type="email"
              autoComplete="email"
              {...register('email')}
              error={errors.email?.message}
            />
            <PasswordInput
              label={t('auth.password')}
              autoComplete="new-password"
              {...register('password')}
              error={errors.password?.message}
            />
            <PasswordInput
              label={t('auth.confirmPassword')}
              autoComplete="new-password"
              {...register('confirmPassword')}
              error={errors.confirmPassword?.message}
            />
            <Button type="submit" loading={isSubmitting} fullWidth>
              {t('auth.register')}
            </Button>
          </Stack>
        </form>
        <Text size="sm" ta="center">
          {t('auth.haveAccount')}{' '}
          <Anchor component={Link} to="/login">
            {t('auth.login')}
          </Anchor>
        </Text>
      </Stack>
    </Card>
  );
}
