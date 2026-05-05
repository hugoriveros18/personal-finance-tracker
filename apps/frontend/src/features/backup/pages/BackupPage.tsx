import { useRef, useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  FileButton,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconCloudDownload, IconUpload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { Page } from '@/shared/components/Page';
import { api } from '@/shared/api/client';
import { getApiErrorMessage } from '@/shared/api/client';

export default function BackupPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'replace' | 'merge-fail-on-conflict'>('replace');
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileResetRef = useRef<() => void>(null);

  const onExport = async () => {
    try {
      setBusy(true);
      const res = await api.get('/export', { responseType: 'blob' });
      const blob = new Blob([res.data as Blob], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `pft-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File | null) => {
    if (!file) return;
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append('file', file);
      const params = { mode, dryRun: dryRun ? 1 : undefined } as Record<string, string | number | undefined>;
      const { data } = await api.post('/import', fd, {
        params,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const summary = (data as { summary?: { counts?: Record<string, number> } }).summary;
      const counts = summary?.counts;
      notifications.show({
        color: dryRun ? 'blue' : 'teal',
        title: dryRun ? t('backup.importDryRun') : t('backup.importDone'),
        message: counts
          ? Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' · ')
          : t('common.saved'),
      });
      if (!dryRun) await qc.invalidateQueries();
    } catch (err) {
      notifications.show({ color: 'red', message: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
      fileResetRef.current?.();
    }
  };

  return (
    <Page title={t('backup.title')} description={t('backup.subtitle')}>
      <Card withBorder p="lg">
        <Stack>
          <Title order={4}>{t('backup.export')}</Title>
          <Text size="sm" c="dimmed">{t('backup.exportHint')}</Text>
          <Group>
            <Button
              leftSection={<IconCloudDownload size={16} />}
              onClick={onExport}
              loading={busy}
            >
              {t('backup.export')}
            </Button>
          </Group>
        </Stack>
      </Card>
      <Card withBorder p="lg">
        <Stack>
          <Title order={4}>{t('backup.import')}</Title>
          <Text size="sm" c="dimmed">{t('backup.importHint')}</Text>
          <SegmentedControl
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            data={[
              { value: 'replace', label: t('backup.importReplace') },
              { value: 'merge-fail-on-conflict', label: 'Merge' },
            ]}
          />
          <Checkbox
            label={t('backup.importDryRun')}
            checked={dryRun}
            onChange={(e) => setDryRun(e.currentTarget.checked)}
          />
          <Group>
            <FileButton
              resetRef={fileResetRef}
              onChange={onImport}
              accept="application/json"
            >
              {(props) => (
                <Button {...props} leftSection={<IconUpload size={16} />} loading={busy}>
                  {t('backup.import')}
                </Button>
              )}
            </FileButton>
          </Group>
        </Stack>
      </Card>
    </Page>
  );
}
