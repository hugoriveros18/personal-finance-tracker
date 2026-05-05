import type { ZodErrorMap } from 'zod';
import { ZodIssueCode } from 'zod';
import type { i18n } from 'i18next';

/**
 * Translates Zod default issue messages through i18next so validation errors
 * shown to the user respect the active locale. Custom messages on individual
 * schemas (e.g. `.refine(..., 'Excede el disponible')`) still win — we only
 * fill in `ctx.defaultError` when Zod hasn't been given a custom one.
 */
export function buildZodErrorMap(i18nInstance: i18n): ZodErrorMap {
  const t = i18nInstance.t.bind(i18nInstance);

  return (issue, ctx) => {
    switch (issue.code) {
      case ZodIssueCode.invalid_type: {
        if (issue.received === 'undefined' || issue.received === 'null') {
          return { message: t('validation.required') };
        }
        return { message: t('validation.invalid') };
      }
      case ZodIssueCode.too_small: {
        const min = issue.minimum;
        if (issue.type === 'string') {
          if (min === 1) return { message: t('validation.required') };
          return { message: t('validation.stringMin', { min }) };
        }
        if (issue.type === 'number') return { message: t('validation.numberMin', { min }) };
        if (issue.type === 'array') return { message: t('validation.arrayMin', { min }) };
        return { message: ctx.defaultError };
      }
      case ZodIssueCode.too_big: {
        const max = issue.maximum;
        if (issue.type === 'string') return { message: t('validation.stringMax', { max }) };
        if (issue.type === 'number') return { message: t('validation.numberMax', { max }) };
        if (issue.type === 'array') return { message: t('validation.arrayMax', { max }) };
        return { message: ctx.defaultError };
      }
      case ZodIssueCode.invalid_string: {
        if (issue.validation === 'email') return { message: t('validation.email') };
        if (issue.validation === 'uuid') return { message: t('validation.invalid') };
        if (issue.validation === 'regex') return { message: t('validation.invalid') };
        return { message: ctx.defaultError };
      }
      case ZodIssueCode.invalid_enum_value:
      case ZodIssueCode.invalid_literal:
        return { message: t('validation.invalid') };
      default:
        return { message: ctx.defaultError };
    }
  };
}
