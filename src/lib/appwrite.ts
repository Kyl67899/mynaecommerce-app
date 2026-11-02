import 'react-native-url-polyfill/auto';
import { Account, Channel, Client, ExecutionMethod, Functions, Storage, TablesDB, Teams } from 'react-native-appwrite';
import { config, TABLES } from './config';

export const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId).setPlatform(config.platform);

export const account = new Account(client);
export const tables = new TablesDB(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
export const teams = new Teams(client);

/** Realtime channel strings for the rows the app listens to. */
export const channels = {
  table: (tableId: string) => Channel.tablesdb(config.dbId).table(tableId).row().toString(),
  row: (tableId: string, rowId: string) => Channel.tablesdb(config.dbId).table(tableId).row(rowId).toString(),
  products: () => channels.table(TABLES.products),
};

/**
 * Calls a route on the myna-api Appwrite Function as the signed-in user.
 * `background: true` returns immediately; use it for long jobs and watch Realtime instead.
 */
/**
 * Turns Appwrite "not set up yet" errors into a message that says what to run.
 * These only happen when the backend is missing pieces, never from a shopper's input.
 */
export function backendSetupMessage(e: unknown): string | null {
  const type = (e as { type?: string })?.type ?? '';
  const msg = String((e as Error)?.message ?? '');
  if (type === 'function_not_found' || /Function with the requested ID could not be found/i.test(msg))
    return `The "${config.functionId}" backend function isn't deployed in this Appwrite project yet. Run "npm run doctor", then "npm run deploy:function".`;
  if (type === 'deployment_not_found' || type === 'build_not_ready' || /deployment.*(not found|not ready)/i.test(msg))
    return `The "${config.functionId}" function has no finished deployment. Run "npm run deploy:function".`;
  if (type === 'database_not_found' || /Database not found/i.test(msg))
    return `Database "${config.dbId}" doesn't exist in this Appwrite project. Run "npm run doctor", then "npm run setup:appwrite".`;
  if (type === 'storage_bucket_not_found' || /Storage bucket with the requested ID could not be found/i.test(msg))
    return `Storage bucket "${config.bucketId}" doesn't exist in this Appwrite project. Run "npm run setup:appwrite".`;
  if (type === 'user_unauthorized' && /execute/i.test(msg))
    return `Signed-in users aren't allowed to run "${config.functionId}". Run "npm run deploy:function" to reset its permissions.`;
  return null;
}

export async function callApi<T = unknown>(path: string, body: unknown, { background = false } = {}): Promise<T> {
  let exec;
  try {
    exec = await functions.createExecution({
      functionId: config.functionId,
      body: JSON.stringify(body ?? {}),
      async: background,
      xpath: path,
      method: ExecutionMethod.POST,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    throw new Error(backendSetupMessage(e) ?? (e as Error)?.message ?? 'Request failed. Please try again.');
  }
  if (background) return exec as unknown as T;

  let data: any = {};
  try {
    data = exec.responseBody ? JSON.parse(exec.responseBody) : {};
  } catch {
    /* non-JSON response */
  }
  if (exec.responseStatusCode >= 400 || exec.status === 'failed') {
    throw new Error(data?.error ?? 'Request failed. Please try again.');
  }
  return data as T;
}
