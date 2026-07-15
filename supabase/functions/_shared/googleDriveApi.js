import { GOOGLE_DRIVE_SCOPE, parseGrantedScopes } from './googleDriveOAuth.js';

export const GOOGLE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
export const GOOGLE_DRIVE_ROOT_NAME = 'Lahat Liwa';
export const GOOGLE_DRIVE_SUBFOLDERS = Object.freeze(['Originals', 'Project Files', 'Profile Media', 'Archive']);

export class GoogleDriveError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'GoogleDriveError';
    this.code = code;
    this.status = status;
  }
}

async function googleJson(fetcher, url, options = {}) {
  const response = await fetcher(url, options);
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const providerCode = data?.error?.status || data?.error || '';
    const code = response.status === 401 || providerCode === 'invalid_grant' ? 'TOKEN_REVOKED'
      : response.status === 404 ? 'FOLDER_MISSING'
        : response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_ERROR';
    throw new GoogleDriveError(code, 'Google Drive could not complete the request.', response.status);
  }
  return data || {};
}

export function exchangeAuthorizationCode(fetcher, config, code, codeVerifier) {
  return googleJson(fetcher, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
    }),
  });
}

export function refreshGoogleAccessToken(fetcher, config, refreshToken) {
  return googleJson(fetcher, 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
}

export function fetchGoogleIdentity(fetcher, accessToken) {
  return googleJson(fetcher, 'https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function driveHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function getDriveFolder(fetcher, accessToken, folderId) {
  const fields = 'id,name,mimeType,trashed,appProperties,parents';
  return googleJson(fetcher, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=${encodeURIComponent(fields)}`, {
    headers: driveHeaders(accessToken),
  });
}

export async function findDriveFolders(fetcher, accessToken, role, parentId = '') {
  const clauses = [
    `mimeType = '${GOOGLE_FOLDER_MIME_TYPE}'`,
    'trashed = false',
    `appProperties has { key='lahatLiwaRole' and value='${escapeDriveQuery(role)}' }`,
    `appProperties has { key='lahatLiwaSchema' and value='v1' }`,
  ];
  if (parentId) clauses.push(`'${escapeDriveQuery(parentId)}' in parents`);
  const params = new URLSearchParams({ q: clauses.join(' and '), spaces: 'drive', fields: 'files(id,name,mimeType,trashed,appProperties,parents)', pageSize: '10' });
  const data = await googleJson(fetcher, `https://www.googleapis.com/drive/v3/files?${params}`, { headers: driveHeaders(accessToken) });
  return Array.isArray(data.files) ? data.files : [];
}

export function createDriveFolder(fetcher, accessToken, name, role, parentId = '') {
  return googleJson(fetcher, 'https://www.googleapis.com/drive/v3/files?fields=id,name,appProperties,parents', {
    method: 'POST',
    headers: driveHeaders(accessToken),
    body: JSON.stringify({
      name,
      mimeType: GOOGLE_FOLDER_MIME_TYPE,
      ...(parentId ? { parents: [parentId] } : {}),
      appProperties: { lahatLiwaRole: role, lahatLiwaSchema: 'v1' },
    }),
  });
}

export async function uploadSmallDriveFile(fetcher, accessToken, input) {
  const boundary = `lahat_liwa_${crypto.randomUUID().replace(/-/g, '')}`;
  const metadata = {
    name: input.name,
    parents: [input.parentId],
    appProperties: {
      lahatLiwaSchema: 'v1',
      lahatLiwaMediaObjectId: input.mediaObjectId,
      lahatLiwaPurpose: input.purpose,
    },
  };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`,
    input.bytes,
    `\r\n--${boundary}--\r\n`,
  ], { type: `multipart/related; boundary=${boundary}` });
  const fields = 'id,name,mimeType,size,md5Checksum,parents,createdTime,modifiedTime';
  return googleJson(fetcher, `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent(fields)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': body.type },
    body,
  });
}

export async function deleteDriveFile(fetcher, accessToken, fileId) {
  try {
    await googleJson(fetcher, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { deleted: true, alreadyMissing: false };
  } catch (error) {
    if (error?.status === 404) return { deleted: true, alreadyMissing: true };
    throw error;
  }
}

function assertManagedRoot(folder) {
  if (!folder || folder.mimeType !== GOOGLE_FOLDER_MIME_TYPE || folder.trashed === true
    || folder.appProperties?.lahatLiwaRole !== 'root' || folder.appProperties?.lahatLiwaSchema !== 'v1') {
    throw new GoogleDriveError('FOLDER_MISSING', 'The managed Lahat Liwa folder is unavailable.', 404);
  }
  return folder;
}

export async function ensureManagedFolderTree(fetcher, accessToken, storedRootFolderId = '') {
  let root;
  if (storedRootFolderId) {
    root = assertManagedRoot(await getDriveFolder(fetcher, accessToken, storedRootFolderId));
  } else {
    const roots = await findDriveFolders(fetcher, accessToken, 'root');
    if (roots.length > 1) throw new GoogleDriveError('FOLDER_AMBIGUOUS', 'More than one managed Lahat Liwa folder was found.', 409);
    root = roots[0] ? assertManagedRoot(roots[0]) : await createDriveFolder(fetcher, accessToken, GOOGLE_DRIVE_ROOT_NAME, 'root');
  }

  const folders = {};
  for (const name of GOOGLE_DRIVE_SUBFOLDERS) {
    const role = name.toLowerCase().replace(/\s+/g, '_');
    const matches = await findDriveFolders(fetcher, accessToken, role, root.id);
    if (matches.length > 1) throw new GoogleDriveError('FOLDER_AMBIGUOUS', `More than one managed ${name} folder was found.`, 409);
    const folder = matches[0] || await createDriveFolder(fetcher, accessToken, name, role, root.id);
    folders[role] = folder.id;
  }
  return { rootFolderId: root.id, folderIds: folders, health: 'healthy' };
}

export async function verifyManagedRoot(fetcher, accessToken, rootFolderId) {
  return assertManagedRoot(await getDriveFolder(fetcher, accessToken, rootFolderId));
}

export async function verifyManagedFolder(fetcher, accessToken, folderId, expectedRole, rootFolderId) {
  let folder;
  try {
    folder = await getDriveFolder(fetcher, accessToken, folderId);
  } catch (error) {
    if (error?.code === 'FOLDER_MISSING') throw new GoogleDriveError('UPLOAD_FOLDER_MISSING', 'The managed upload folder is unavailable.', 404);
    throw error;
  }
  if (!folder || folder.mimeType !== GOOGLE_FOLDER_MIME_TYPE || folder.trashed === true
    || folder.appProperties?.lahatLiwaRole !== expectedRole
    || folder.appProperties?.lahatLiwaSchema !== 'v1'
    || !Array.isArray(folder.parents) || !folder.parents.includes(rootFolderId)) {
    throw new GoogleDriveError('UPLOAD_FOLDER_MISSING', 'The managed upload folder is unavailable.', 404);
  }
  return folder;
}

export async function revokeGoogleToken(fetcher, token) {
  const response = await fetcher('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
  return response.ok;
}

export function tokenGrantedScopes(tokenResponse, fallback = []) {
  const scopes = parseGrantedScopes(tokenResponse?.scope);
  return scopes.length ? scopes : [...fallback];
}

export function hasDriveFileScope(scopes) {
  return new Set(scopes).has(GOOGLE_DRIVE_SCOPE);
}
