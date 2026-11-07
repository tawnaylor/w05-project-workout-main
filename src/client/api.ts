export interface FieldIssue {
  field: string;
  message: string;
}

interface GraphQLErrorBody {
  message: string;
  extensions?: { code?: string; errors?: FieldIssue[] };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorBody[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly fields: FieldIssue[]
  ) {
    super(message);
  }
}

/** Sends one GraphQL operation to this server, with the session cookie. */
export const gql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const response = await fetch('/graphql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const body = (await response.json()) as GraphQLResponse<T>;
  const first = body.errors?.[0];
  if (first) {
    throw new ApiError(first.message, first.extensions?.code ?? 'UNKNOWN', first.extensions?.errors ?? []);
  }
  if (!body.data) throw new ApiError('Empty response from the server', 'UNKNOWN', []);
  return body.data;
};
