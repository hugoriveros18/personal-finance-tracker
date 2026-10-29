import type { ReactNode } from 'react';
import { Box, Paper, Stack, Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import classes from './SourceMessage.module.css';

export function SourceText({ children }: { children: ReactNode }) {
  return (
    <Paper
      withBorder
      radius="md"
      p="sm"
      bg="var(--mantine-color-default-hover)"
      data-source-text
      style={{ minWidth: 0, borderInlineStart: '3px solid var(--mantine-primary-color-filled)' }}
    >
      <Text
        component="blockquote"
        m={0}
        size="sm"
        lh={1.65}
        style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      >
        {children}
      </Text>
    </Paper>
  );
}

export function SourceDetails({
  label,
  text,
  context = [],
  alignLabel = false,
}: {
  label: string;
  text: string;
  context?: (string | null)[];
  alignLabel?: boolean;
}) {
  const inherited = [
    ...new Set(
      context.filter((value): value is string => Boolean(value) && !text.includes(value!)),
    ),
  ];
  return (
    <Box component="details" className={`${classes.details} ${alignLabel ? classes.aligned : ''}`}>
      <summary className={classes.summary} data-source-toggle>
        <IconChevronRight size={16} className={classes.chevron} aria-hidden />
        <span>{label}</span>
      </summary>
      <Stack mt="xs" gap="xs">
        {inherited.length > 0 && <SourceText>{inherited.join('\n')}</SourceText>}
        <SourceText>{text}</SourceText>
      </Stack>
    </Box>
  );
}
