const ENDPOINT = 'https://api.ftcscout.org/graphql';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach api.ftcscout.org. Check your connection.');
  }

  if (!response.ok) {
    throw new ApiError(`FTC Scout API responded with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as GraphQLResponse<T>;
  if (payload.errors?.length) {
    throw new ApiError(payload.errors.map((e) => e.message).join('; '));
  }
  if (!payload.data) {
    throw new ApiError('FTC Scout API returned an empty response.');
  }
  return payload.data;
}
