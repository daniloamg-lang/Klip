import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Brand } from './Brand'
import type { Workspace } from '../lib/types'
import { createVault, unlockVault, vaultExists } from '../lib/vault'

interface VaultScreenProps {
  onUnlocked: (workspace: Workspace, key: CryptoKey) => void
}

export function VaultScreen({ onUnlocked }: VaultScreenProps) {
  const [exists, setExists] = useState<boolean | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void vaultExists().then(setExists).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not open local storage.')
    })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!exists && passphrase !== confirmation) {
      setError('The passphrases do not match.')
      return
    }
    if (passphrase.length < 8) {
      setError('Use at least 8 characters. A longer memorable phrase is better.')
      return
    }
    setBusy(true)
    try {
      const unlocked = exists
        ? await unlockVault(passphrase)
        : await createVault(passphrase)
      onUnlocked(unlocked.workspace, unlocked.key)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the vault.')
    } finally {
      setBusy(false)
    }
  }

  if (exists === null) {
    return (
      <main className="vault-page">
        <Brand />
        <div className="loading-ring" aria-label="Opening local storage" />
      </main>
    )
  }

  return (
    <main className="vault-page">
      <div className="vault-orbit" aria-hidden="true" />
      <section className="vault-card">
        <Brand />
        <div className="vault-icon">
          {exists ? <LockKeyhole size={28} /> : <ShieldCheck size={28} />}
        </div>
        <p className="eyebrow">{exists ? 'Private local workspace' : 'Your notes, your key'}</p>
        <h1>{exists ? 'Welcome back' : 'Create your vault'}</h1>
        <p className="vault-copy">
          {exists
            ? 'Enter your passphrase to decrypt this device’s notes.'
            : 'Everything stays encrypted on this device. Choose a phrase you can remember; it cannot be recovered.'}
        </p>

        <form onSubmit={submit}>
          <label>
            Passphrase
            <span className="password-field">
              <input
                autoFocus
                type={visible ? 'text' : 'password'}
                autoComplete={exists ? 'current-password' : 'new-password'}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="A memorable private phrase"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setVisible((value) => !value)}
                aria-label={visible ? 'Hide passphrase' : 'Show passphrase'}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {!exists && (
            <label>
              Confirm passphrase
              <input
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Type it once more"
              />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button vault-submit" disabled={busy}>
            {busy ? 'Opening…' : exists ? 'Unlock Klip' : 'Create vault'}
          </button>
        </form>
        <p className="privacy-note">
          <ShieldCheck size={14} />
          AES-256-GCM encryption · No note leaves this device yet
        </p>
      </section>
    </main>
  )
}
