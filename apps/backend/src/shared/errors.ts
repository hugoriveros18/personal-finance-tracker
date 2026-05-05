export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const NotFound = (resource: string) =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const BadRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const Unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);

export const Conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

export const Forbidden = (message: string) => new AppError(403, 'FORBIDDEN', message);
