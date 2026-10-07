import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { Page } from '@/shared/components/Page';
import { EmptyState } from '@/shared/components/EmptyState';
import {
  categoryKeys,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '../api/categories';
import type { Category, CategoryType } from '@/shared/types/domain';
import { getApiErrorMessage } from '@/shared/api/client';
import { CategoryDistributionChart } from '../components/CategoryDistributionChart';
import { CategoryTrendChart } from '../components/CategoryTrendChart';

const createSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['income', 'expense']),
});

type FormValues = z.infer<typeof createSchema>;

function CategoryFormModal({ initial, onClose }: { initial?: Category; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const isEdit = !!initial;
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: initial?.name ?? '', type: initial?.type ?? 'expense' },
  });
  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateCategory(initial!.id, { name: values.name });
      } else {
        await createCategory(values);
      }
      await qc.invalidateQueries({ queryKey: categoryKeys.all });
      notifications.show({ color: 'teal', message: t(isEdit ? 'common.saved' : 'common.created') });
      onClose();
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    }
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <TextInput
          label={t('common.name')}
          {...register('name')}
          error={errors.name?.message}
          autoFocus
        />
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <SegmentedControl
              fullWidth
              value={field.value}
              onChange={(v) => field.onChange(v)}
              disabled={isEdit}
              data={[
                { value: 'income', label: t('categories.income') },
                { value: 'expense', label: t('categories.expense') },
              ]}
            />
          )}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function openCategoryModal(t: (k: string) => string, initial?: Category) {
  const id = `cat-${Math.random()}`;
  modals.open({
    modalId: id,
    title: initial ? t('common.edit') : t('categories.newCategory'),
    children: <CategoryFormModal initial={initial} onClose={() => modals.close(id)} />,
  });
}

export default function CategoriesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [type, setType] = useState<'all' | CategoryType>('all');
  const { data: categories = [], isLoading } = useQuery({
    queryKey: categoryKeys.all,
    queryFn: () => listCategories(),
  });

  const removeMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: categoryKeys.all });
      notifications.show({ color: 'teal', message: t('common.deleted') });
    },
    onError: (err) => notifications.show({ color: 'red', message: getApiErrorMessage(err) }),
  });

  const filtered = type === 'all' ? categories : categories.filter((c) => c.type === type);

  return (
    <Page
      title={t('categories.title')}
      description={t('categories.subtitle')}
      actions={
        <Button leftSection={<IconPlus size={16} />} onClick={() => openCategoryModal(t)}>
          {t('categories.newCategory')}
        </Button>
      }
    >
      <Group>
        <SegmentedControl
          value={type}
          onChange={(v) => setType(v as 'all' | CategoryType)}
          data={[
            { value: 'all', label: t('common.all') },
            { value: 'income', label: t('categories.income') },
            { value: 'expense', label: t('categories.expense') },
          ]}
        />
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <CategoryDistributionChart />
        <CategoryTrendChart categories={categories} />
      </SimpleGrid>

      {!isLoading && filtered.length === 0 ? (
        <EmptyState title={t('common.noData')} />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {filtered.map((c) => (
            <Card withBorder key={c.id} p="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Title order={5}>{c.name}</Title>
                  <Badge color={c.type === 'income' ? 'teal' : 'orange'} variant="light">
                    {c.type === 'income' ? t('categories.income') : t('categories.expense')}
                  </Badge>
                </Stack>
                <Menu width={150} withinPortal position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray">
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconEdit size={14} />}
                      onClick={() => openCategoryModal(t, c)}
                    >
                      {t('common.edit')}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={() =>
                        modals.openConfirmModal({
                          title: t('common.delete'),
                          children: <Text size="sm">{t('common.confirmDelete')}</Text>,
                          labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                          confirmProps: { color: 'red' },
                          onConfirm: () => removeMut.mutate(c.id),
                        })
                      }
                    >
                      {t('common.delete')}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Page>
  );
}
