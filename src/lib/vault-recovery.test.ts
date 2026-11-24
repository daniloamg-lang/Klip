import { describe, expect, it } from 'vitest'
import { createRecovery, recoverKey } from './vault'

describe('vault recovery key', () => {
  it('unwraps the original vault key only with the generated recovery key', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )
    const original = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    const generated = await createRecovery(key)
    const recovered = await recoverKey(generated.recoveryKey, generated.recovery)
    const recoveredBytes = new Uint8Array(await crypto.subtle.exportKey('raw', recovered))

    expect(recoveredBytes).toEqual(original)
  })

  it('rejects an incorrect recovery key', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )
    const generated = await createRecovery(key)

    await expect(recoverKey('wrong-recovery-key', generated.recovery))
      .rejects.toThrow('That recovery key did not unlock your vault.')
  })
})
