import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../shared/errors.js';

function hasFastifyValidation(err: unknown): err is { validation: unknown } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'validation' in err &&
    Array.isArray((err as { validation: unknown }).validation)
  );
}

export const errorHandlerPlugin = fp(async (app) => {
  app.setErrorHandler((err, req, reply) => {
    // Zod validation (request schema)
    if (hasFastifyValidation(err)) {
      return reply.code(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: err.validation,
        },
      });
    }
    if (err instanceof ZodError) {
      return reply.code(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: err.flatten(),
        },
      });
    }

    // App-level errors
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
    }

    // Prisma errors
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      switch (err.code) {
        case 'P2002': // unique constraint
          return reply.code(409).send({
            error: { code: 'CONFLICT', message: 'Resource already exists', details: err.meta },
          });
        case 'P2003': // FK violation on insert
          return reply.code(422).send({
            error: { code: 'INVALID_REFERENCE', message: 'Referenced resource does not exist' },
          });
        case 'P2014': // FK relation, restrict
          return reply.code(409).send({
            error: { code: 'IN_USE', message: 'Resource is referenced and cannot be deleted' },
          });
        case 'P2025': // not found
          return reply.code(404).send({
            error: { code: 'NOT_FOUND', message: 'Resource not found' },
          });
      }
    }

    // Postgres CHECK / raised exception bubbling through Prisma
    const pgErr = err as { code?: string; meta?: { code?: string; message?: string } };
    const pgCode = pgErr?.meta?.code ?? pgErr?.code;
    if (pgCode === '23514') {
      return reply.code(422).send({
        error: { code: 'WOULD_VIOLATE_INVARIANT', message: 'Operation violates a balance invariant' },
      });
    }
    if (pgCode === 'P0001' || pgErr?.meta?.message) {
      const message = pgErr?.meta?.message ?? 'Operation rejected by database guard';
      return reply.code(422).send({
        error: { code: 'GUARD_REJECTED', message },
      });
    }

    req.log.error({ err }, 'Unhandled error');
    const status = err.statusCode ?? 500;
    return reply.code(status).send({
      error: {
        code: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: status >= 500 ? 'Internal server error' : err.message,
      },
    });
  });
});
