export enum StatusCode {
  OK = 200,
  ServerError = 500,
  BadRequest = 400,
  NotFound = 404,
}

export interface HttpResponse<T> {
  statusCode: StatusCode;
  payload: T;
  error: unknown;
}

export function status<T>(
  statusCode: StatusCode,
  payload: T,
  error?: unknown
): HttpResponse<T> {
  return {
    statusCode,
    payload,
    error,
  };
}

export function ok<T>(payload: T): HttpResponse<T> {
  return status(StatusCode.OK, payload);
}

export function serverError<T>(err: unknown): HttpResponse<T> {
  return status(StatusCode.ServerError, undefined as unknown as T, err);
}

export function badRequest<T>(err: unknown): HttpResponse<T> {
  return status(StatusCode.BadRequest, undefined as unknown as T, err);
}

export function notFound<T>(): HttpResponse<T> {
  return status(StatusCode.BadRequest, undefined as unknown as T);
}
