import type { SupabaseClient } from '@supabase/supabase-js'
import type { CloudSnapshot, EncryptedWorkspaceEnvelope } from './types'

export class WorkspaceConflictError extends Error {
  constructor() {
    super('The cloud workspace changed on another device. Fetch it again and retry.')
    this.name = 'WorkspaceConflictError'
  }
}

export async function fetchCloudWorkspace(client: SupabaseClient): Promise<CloudSnapshot | null> {
  const { data, error } = await client
    .from('klip_workspace_state')
    .select('user_id,revision,key_salt,payload,updated_at')
    .maybeSingle()
  if (error) throw error
  return data as CloudSnapshot | null
}

export async function saveCloudWorkspace(
  client: SupabaseClient,
  envelope: EncryptedWorkspaceEnvelope,
  expectedRevision: number,
  keySalt: string,
): Promise<number> {
  const { data, error } = await client.rpc('save_klip_workspace', {
    p_payload: envelope,
    p_expected_revision: expectedRevision,
    p_key_salt: keySalt,
  })
  if (error) {
    if (error.code === '40001' || error.message.includes('klip_workspace_conflict')) {
      throw new WorkspaceConflictError()
    }
    throw error
  }
  if (!Array.isArray(data) || typeof data[0]?.revision !== 'number') {
    throw new Error('The cloud returned an invalid synchronization result.')
  }
  return data[0].revision
}

export async function replaceCloudWorkspace(
  client: SupabaseClient,
  envelope: EncryptedWorkspaceEnvelope,
  expectedRevision: number,
  keySalt: string,
): Promise<number> {
  const { data, error } = await client.rpc('replace_klip_workspace', {
    p_payload: envelope,
    p_expected_revision: expectedRevision,
    p_key_salt: keySalt,
  })
  if (error) {
    if (error.code === '40001' || error.message.includes('klip_workspace_conflict')) {
      throw new WorkspaceConflictError()
    }
    throw error
  }
  if (!Array.isArray(data) || typeof data[0]?.revision !== 'number') {
    throw new Error('The cloud returned an invalid synchronization result.')
  }
  return data[0].revision
}
