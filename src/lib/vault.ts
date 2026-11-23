import { localDatabase } from './database'
import { emptyWorkspace, type VaultRecord, type Workspace } from './types'

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
    false,
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

export async function createVault(passphrase: string): Promise<{
  key: CryptoKey
  workspace: Workspace
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const workspace = emptyWorkspace()
  await localDatabase.vaults.put({
    id: 'local',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: await encrypt(workspace, key, iv),
    updatedAt: new Date().toISOString(),
  })
  return { key, workspace }
}

export async function unlockVault(passphrase: string): Promise<{
  key: CryptoKey
  workspace: Workspace
}> {
  const record = await localDatabase.vaults.get('local')
  if (!record) throw new Error('No local vault was found.')
  const salt = base64ToBytes(record.salt)
  const key = await deriveKey(passphrase, salt)
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
