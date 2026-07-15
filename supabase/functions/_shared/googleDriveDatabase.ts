import { Pool } from 'jsr:@db/postgres@0.19.5';

let pool: Pool | null = null;

function databasePool() {
  const connectionString = Deno.env.get('SUPABASE_DB_URL') || '';
  if (!connectionString) throw Object.assign(new Error('Database connection is unavailable.'), { code: 'DATABASE_CONFIGURATION' });
  if (!pool) pool = new Pool(connectionString, 1);
  return pool;
}

async function queryOne(text: string, args: unknown[] = []) {
  const connection = await databasePool().connect();
  try {
    const result = await connection.queryObject({ text, args });
    return result.rows[0] || null;
  } finally {
    connection.release();
  }
}

export function createOAuthState(input: {
  ownerUserId: string;
  stateHash: string;
  pkceVerifier: string;
  returnPath: string;
  reconnectConnectionId: string | null;
}) {
  return queryOne(
    `select private.server_create_external_storage_oauth_state($1::uuid, $2::text, $3::text, $4::text, $5::uuid) as state_id`,
    [input.ownerUserId, input.stateHash, input.pkceVerifier, input.returnPath, input.reconnectConnectionId],
  );
}

export function consumeOAuthState(stateHash: string) {
  return queryOne(
    `select owner_user_id, reconnect_connection_id, return_path, pkce_verifier, expires_at
     from private.server_consume_external_storage_oauth_state($1::text)`,
    [stateHash],
  );
}

export async function readConnectionSecret(ownerUserId: string, connectionId: string) {
  const row: any = await queryOne(
    `select private.server_read_storage_connection_secret($1::uuid, $2::uuid) as provider_secret`,
    [ownerUserId, connectionId],
  );
  return row?.provider_secret || null;
}

export async function upsertGoogleDriveConnection(input: {
  ownerUserId: string;
  connectionId: string | null;
  providerAccountId: string;
  providerAccountEmail: string;
  displayName: string;
  rootFolderId: string;
  folderIds: Record<string, string>;
  grantedScopes: string[];
  refreshToken: string | null;
}) {
  const row: any = await queryOne(
    `select private.server_upsert_google_drive_connection(
       $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text,
       $7::jsonb, $8::text[], $9::text
     ) as connection_id`,
    [input.ownerUserId, input.connectionId, input.providerAccountId, input.providerAccountEmail,
      input.displayName, input.rootFolderId, JSON.stringify(input.folderIds), input.grantedScopes, input.refreshToken],
  );
  return row?.connection_id || null;
}

export function disconnectGoogleDriveConnection(input: {
  ownerUserId: string;
  connectionId: string;
  revokedAtProvider: boolean;
}) {
  return queryOne(
    `select private.server_disconnect_google_drive_connection($1::uuid, $2::uuid, $3::boolean) as disconnected`,
    [input.ownerUserId, input.connectionId, input.revokedAtProvider],
  );
}
