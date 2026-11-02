const env = (key: string, value: string | undefined, fallback?: string) => {
  const v = value?.trim() || fallback; // a blank line in .env falls back to the default
  if (!v) throw new Error(`Missing ${key}. Copy .env.example to .env and fill it in.`);
  return v;
};

// EXPO_PUBLIC_* values must be referenced literally so Metro can inline them.
export const config = {
  endpoint: env('EXPO_PUBLIC_APPWRITE_ENDPOINT', process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT),
  projectId: env('EXPO_PUBLIC_APPWRITE_PROJECT_ID', process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID),
  platform: env('EXPO_PUBLIC_APPWRITE_PLATFORM', process.env.EXPO_PUBLIC_APPWRITE_PLATFORM, 'com.myna.skin'),
  dbId: env('EXPO_PUBLIC_APPWRITE_DB_ID', process.env.EXPO_PUBLIC_APPWRITE_DB_ID, 'myna'),
  bucketId: env('EXPO_PUBLIC_APPWRITE_BUCKET_ID', process.env.EXPO_PUBLIC_APPWRITE_BUCKET_ID, 'scans'),
  functionId: env('EXPO_PUBLIC_APPWRITE_FUNCTION_ID', process.env.EXPO_PUBLIC_APPWRITE_FUNCTION_ID, 'myna-api'),
  productImagesBucketId: 'product-images',
  adminTeamId: 'admins',
} as const;

export const TABLES = {
  products: 'products',
  carts: 'carts',
  scans: 'scans',
  orders: 'orders',
  events: 'events',
  tickets: 'tickets',
  supportMessages: 'support_messages',
} as const;
