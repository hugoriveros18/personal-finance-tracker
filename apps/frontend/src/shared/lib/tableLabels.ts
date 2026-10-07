export function getTableLabels(t: (key: string) => string) {
  return {
    recordsPerPageLabel: t('common.recordsPerPage'),
    loadingText: t('common.loading'),
    getPaginationControlProps: (control: 'first' | 'last' | 'previous' | 'next') => ({
      'aria-label': t(`common.pagination.${control}`),
    }),
  };
}
