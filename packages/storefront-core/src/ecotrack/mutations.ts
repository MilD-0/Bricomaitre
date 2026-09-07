import { type EcotrackTokenValidationResult } from './contract';
import { assertEcotrackMutationSuccess, readEcotrackMessage, readEcotrackSuccess } from './errors';
import { requestEcotrack, requestEcotrackBinary } from './transport';

export async function validateEcotrackToken(
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
): Promise<EcotrackTokenValidationResult> {
  const result = await requestEcotrack({
    path: '/validate/token',
    method: 'GET',
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return {
    success: readEcotrackSuccess(result.payload),
    message: readEcotrackMessage(result.payload),
    raw: result.payload,
    rateLimit: result.rateLimit,
  };
}

export async function fetchEcotrackOrderLabel(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  return requestEcotrackBinary({
    path: '/get/order/label',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });
}

export async function updateEcotrackOrder(
  payload: Record<string, string | number | null | undefined>,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/update/order',
    method: 'POST',
    query: payload,
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the order update.');
}

export async function deleteEcotrackOrder(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/delete/order',
    method: 'DELETE',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the order deletion.');
}

export async function dispatchEcotrackOrder(
  tracking: string,
  askCollection = false,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/valid/order',
    method: 'POST',
    query: { tracking, ask_collection: askCollection ? 1 : 0 },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the dispatch request.');
}

export async function addEcotrackMaj(
  tracking: string,
  content: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/add/maj',
    method: 'POST',
    query: { tracking, content },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the follow-up update.');
}

export async function requestEcotrackReturn(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/ask/for/order/return',
    method: 'POST',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the return request.');
}
