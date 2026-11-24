import { localDatabase } from './database'
import {
  emptyWorkspace,
  type EncryptedWorkspaceEnvelope,
  type RecoveryBundle,
  type VaultRecord,
  type Workspace,
} from './types'

const iterations = 250_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array): string {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

async function encrypt(workspace: Workspace, key: CryptoKey, iv: Uint8Array<ArrayBuffer>) {
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(workspace)),
  )
  return bytesToBase64(new Uint8Array(encrypted))
}

export async function vaultExists(): Promise<boolean> {
  return Boolean(await localDatabase.vaults.get('local'))
}

export async function vaultSalt(): Promise<string> {
  const record = await localDatabase.vaults.get('local')
  if (!record) throw new Error('No local vault was found.')
  return record.salt
}

export async function vaultRecovery(): Promise<RecoveryBundle | undefined> {
  const record = await localDatabase.vaults.get('local')
  if (!record) throw new Error('No local vault was found.')
  return record.recovery
}

export async function createVault(passphrase: string): Promise<{
  key: CryptoKey
  workspace: Workspace
  recoveryKey?: string
  recovery?: RecoveryBundle
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const workspace = emptyWorkspace()
  const generatedRecovery = await createRecovery(key)
  await localDatabase.vaults.put({
    id: 'local',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: await encrypt(workspace, key, iv),
    updatedAt: new Date().toISOString(),
    recovery: generatedRecovery.recovery,
  })
  return {
    key,
    workspace,
    recoveryKey: generatedRecovery.recoveryKey,
    recovery: generatedRecovery.recovery,
  }
}

export async function unlockVault(passphrase: string): Promise<{
  key: CryptoKey
  workspace: Workspace
  recovery?: RecoveryBundle
}> {
  const record = await localDatabase.vaults.get('local')
  if (!record) throw new Error('No local vault was found.')
  const salt = base64ToBytes(record.salt)
  const key = await deriveKey(passphrase, salt)
  return { ...(await openVaultWithKey(key)), recovery: record.recovery }
}

export async function openVaultWithKey(key: CryptoKey): Promise<{ key: CryptoKey; workspace: Workspace }> {
  const record = await localDatabase.vaults.get('local')
  if (!record) throw new Error('No local vault was found.')
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.ciphertext),
    )
    const workspace = JSON.parse(decoder.decode(plaintext)) as Workspace
    if (workspace.formatVersion !== 1 || !Array.isArray(workspace.notes) || !Array.isArray(workspace.folders)) {
      throw new Error('Unsupported vault data.')
    }
    return { key, workspace }
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === 'Unsupported vault data.')) {
      throw error
    }
    throw new Error('That passphrase did not unlock your vault.')
  }
}

export async function saveVault(workspace: Workspace, key: CryptoKey): Promise<void> {
  const record = await localDatabase.vaults.get('local')
  if (!record) throw new Error('No local vault was found.')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const nextRecord: VaultRecord = {
    ...record,
    iv: bytesToBase64(iv),
    ciphertext: await encrypt(workspace, key, iv),
    updatedAt: new Date().toISOString(),
  }
  await localDatabase.vaults.put(nextRecord)
}

async function deriveRecoveryKey(recoveryKey: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(recoveryKey),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function createRecovery(
  key: CryptoKey,
): Promise<{ recoveryKey: string; recovery: RecoveryBundle }> {
    const random = crypto.getRandomValues(new Uint8Array(32))
    const recoveryKey = bytesToBase64(random)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const wrappingKey = await deriveRecoveryKey(recoveryKey, salt)
    const rawKey = await crypto.subtle.exportKey('raw', key)
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      rawKey,
    )
    return {
      recoveryKey,
      recovery: {
        formatVersion: 1,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      },
    }
}

export async function recoverKey(
  recoveryKey: string,
  bundle: RecoveryBundle,
): Promise<CryptoKey> {
    try {
      const wrappingKey = await deriveRecoveryKey(recoveryKey.trim(), base64ToBytes(bundle.salt))
      const rawKey = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(bundle.iv) },
        wrappingKey,
        base64ToBytes(bundle.ciphertext),
      )
      return crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
      )
    } catch {
      throw new Error('That recovery key did not unlock your vault.')
    }
}

export async function attachRecoveryToVault(recovery: RecoveryBundle): Promise<void> {
  const record = await localDatabase.vaults.get('local')
  if (!record) throw new Error('No local vault was found.')
  await localDatabase.vaults.put({ ...record, recovery })
}

export async function sealWorkspace(
  workspace: Workspace,
  key: CryptoKey,
  userId: string,
  recovery?: RecoveryBundle,
): Promise<EncryptedWorkspaceEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`klip:${userId}:workspace:v1`) },
    key,
    encoder.encode(JSON.stringify(workspace)),
  )
  return {
    formatVersion: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    ...(recovery ? { recovery } : {}),
  }
}

function cloudRecovery(envelope: unknown): RecoveryBundle | undefined {
  if (
    typeof envelope === 'object' &&
    envelope !== null &&
    'recovery' in envelope &&
    typeof envelope.recovery === 'object' &&
    envelope.recovery !== null
  ) {
    const recovery = envelope.recovery as RecoveryBundle
    if (
      recovery.formatVersion === 1 &&
      typeof recovery.salt === 'string' &&
      typeof recovery.iv === 'string' &&
      typeof recovery.ciphertext === 'string'
    ) return recovery
  }
  return undefined
}

export async function openCloudWorkspace(
  userId: string,
  passphrase: string,
  salt: string,
  envelope: unknown,
): Promise<{ key: CryptoKey; workspace: Workspace; recovery?: RecoveryBundle }> {
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    !('formatVersion' in envelope) ||
    envelope.formatVersion !== 1 ||
    !('iv' in envelope) ||
    typeof envelope.iv !== 'string' ||
    !('ciphertext' in envelope) ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('The encrypted cloud workspace is invalid.')
  }
  try {
    const key = await deriveKey(passphrase, base64ToBytes(salt))
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(envelope.iv),
        additionalData: encoder.encode(`klip:${userId}:workspace:v1`),
      },
      key,
      base64ToBytes(envelope.ciphertext),
    )
    const workspace = JSON.parse(decoder.decode(plaintext)) as Workspace
    if (
      workspace.formatVersion !== 1 ||
      !Array.isArray(workspace.notes) ||
      !Array.isArray(workspace.folders)
    ) {
      throw new Error('Unsupported workspace.')
    }
    return { key, workspace, recovery: cloudRecovery(envelope) }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsupported workspace.') throw error
    throw new Error('The passphrase did not decrypt the cloud workspace.')
  }
}

export async function openCloudWorkspaceWithRecovery(
  userId: string,
  recoveryKey: string,
  envelope: unknown,
): Promise<{ key: CryptoKey; workspace: Workspace; recovery: RecoveryBundle }> {
  const recovery = cloudRecovery(envelope)
  if (!recovery) {
    throw new Error('This vault does not have a recovery key.')
  }
  const key = await recoverKey(recoveryKey, recovery)
  const workspace = await decryptCloudWorkspace(userId, key, envelope)
  return { key, workspace, recovery }
}

export async function decryptCloudWorkspace(
  userId: string,
  key: CryptoKey,
  envelope: unknown,
): Promise<Workspace> {
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    !('formatVersion' in envelope) ||
    envelope.formatVersion !== 1 ||
    !('iv' in envelope) ||
    typeof envelope.iv !== 'string' ||
    !('ciphertext' in envelope) ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('The encrypted cloud workspace is invalid.')
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(envelope.iv),
      additionalData: encoder.encode(`klip:${userId}:workspace:v1`),
    },
    key,
    base64ToBytes(envelope.ciphertext),
  )
  const workspace = JSON.parse(decoder.decode(plaintext)) as Workspace
  if (
    workspace.formatVersion !== 1 ||
    !Array.isArray(workspace.notes) ||
    !Array.isArray(workspace.folders)
  ) {
    throw new Error('Unsupported workspace.')
  }
  return workspace
}

export async function replaceVault(
  workspace: Workspace,
  key: CryptoKey,
  salt: string,
  recovery?: RecoveryBundle,
): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  await localDatabase.vaults.put({
    id: 'local',
    salt,
    iv: bytesToBase64(iv),
    ciphertext: await encrypt(workspace, key, iv),
    updatedAt: new Date().toISOString(),
    ...(recovery ? { recovery } : {}),
  })
}
