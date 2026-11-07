import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { MongoServerError, ObjectId } from 'mongodb';
import type { ZodTypeAny, z } from 'zod';

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_USER_INPUT'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR';

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_USER_INPUT: 400,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

export const apiError = (code: ErrorCode, message: string, extra: Record<string, unknown> = {}): GraphQLError =>
  new GraphQLError(message, { extensions: { code, http: { status: HTTP_STATUS[code] }, ...extra } });

export interface FieldIssue {
  field: string;
  message: string;
}

/** Validates untrusted input with a zod schema; throws BAD_USER_INPUT listing every failing field. */
export const parseInput = <S extends ZodTypeAny>(schema: S, input: unknown): z.output<S> => {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors: FieldIssue[] = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'input',
      message: issue.message
    }));
    throw apiError('BAD_USER_INPUT', 'Validation failed', { errors });
  }
  return result.data;
};

export const parseObjectId = (id: string, label = 'id'): ObjectId => {
  if (!/^[0-9a-fA-F]{24}$/.test(id) || !ObjectId.isValid(id)) {
    throw apiError('BAD_USER_INPUT', `Invalid ${label}: must be a 24-character MongoDB id`, {
      errors: [{ field: label, message: 'must be a 24-character MongoDB id' }]
    });
  }
  return new ObjectId(id);
};

/**
 * Central error formatter. Known API errors pass through, duplicate-key errors from MongoDB
 * become CONFLICT, and anything unexpected is logged and masked so internals never leak.
 */
export const formatError = (formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError => {
  const original = unwrapResolverError(error);
  if (original instanceof MongoServerError && original.code === 11000) {
    return {
      message: 'username or email already in use',
      extensions: { code: 'CONFLICT' satisfies ErrorCode }
    };
  }
  const code = formatted.extensions?.code;
  if (code === 'INTERNAL_SERVER_ERROR') {
    console.error(original);
    return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' satisfies ErrorCode } };
  }
  const { http: _http, ...extensions } = (formatted.extensions ?? {}) as Record<string, unknown>;
  return { ...formatted, extensions };
};
