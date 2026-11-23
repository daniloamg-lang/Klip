import Dexie, { type Table } from 'dexie'
import type { VaultRecord } from './types'

class KlipDatabase extends Dexie {
  vaults!: Table<VaultRecord, string>

  constructor() {
    super('klip-local')
    this.version(1).stores({
      vaults: 'id, updatedAt',
    })
  }
}

export const localDatabase = new KlipDatabase()
