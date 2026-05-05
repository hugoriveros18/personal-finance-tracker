import { describe, expect, it } from 'vitest';
import { AppError, BadRequest, Conflict, Forbidden, NotFound, Unprocessable } from './errors.js';

describe('AppError', () => {
  it('preserves status, code, message, and details', () => {
    const err = new AppError(418, 'TEAPOT', 'I am a teapot', { foo: 'bar' });
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.message).toBe('I am a teapot');
    expect(err.details).toEqual({ foo: 'bar' });
    expect(err).toBeInstanceOf(Error);
  });
});

describe('error factories', () => {
  it('NotFound returns a 404 with NOT_FOUND code and resource name in message', () => {
    const err = NotFound('account');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('account');
  });

  it('BadRequest returns a 400', () => {
    expect(BadRequest('X', 'm').statusCode).toBe(400);
  });

  it('Unprocessable returns a 422', () => {
    expect(Unprocessable('X', 'm').statusCode).toBe(422);
  });

  it('Conflict returns a 409', () => {
    expect(Conflict('X', 'm').statusCode).toBe(409);
  });

  it('Forbidden returns a 403 with FORBIDDEN code', () => {
    const err = Forbidden('nope');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});
