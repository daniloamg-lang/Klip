import { useEffect, useState } from 'react'
import { Cloud, LogOut, ShieldCheck, X } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

interface SyncDialogProps {
  onSignedOut: () => void
  onClose: () => void
}

export function SyncDialog({ onSignedOut, onClose }: SyncDialogProps) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getUser().then(({ data, error: userError }) => {
      if (userError) {
        setError(userError.message)
        return
      }
      setEmail(data.user?.email ?? '')
    })
  }, [])

  async function signOut() {
    if (!supabase) return
    setBusy(true)
    const { error: signOutError } = await supabase.auth.signOut()
    setBusy(false)
    if (signOutError) {
      setError(signOutError.message)
      return
    }
    onSignedOut()
  }

  return (
    <div className="sync-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="sync-dialog" role="dialog" aria-modal="true" aria-label="Cloud sync">
        <button className="icon-button sync-close" onClick={onClose} disabled={busy} aria-label="Close sync"><X size={18} /></button>
        <div className="sync-icon"><Cloud size={25} /></div>
        <p className="eyebrow">Encrypted cloud sync</p>
        <h2>{isSupabaseConfigured ? 'Your vault is synchronized' : 'Cloud sync is not configured'}</h2>
        {isSupabaseConfigured ? (
          <>
            <p>Changes are encrypted on this device, saved locally, and uploaded automatically.</p>
            <p className="sync-account">{email}</p>
            <div className="sync-status">
              <ShieldCheck size={16} />
              <span>Cloud updates checked every 20 seconds</span>
            </div>
            <button className="sync-signout" onClick={() => void signOut()} disabled={busy}>
              <LogOut size={14} /> {busy ? 'Signing out…' : 'Sign out and lock'}
            </button>
          </>
        ) : (
          <>
            <p>Add Klip's Supabase URL and publishable key to enable automatic synchronization.</p>
            <button className="primary-button" onClick={onClose}>Continue locally</button>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="sync-note"><ShieldCheck size={13} /> Supabase receives ciphertext only. Your passphrase stays here.</p>
      </section>
    </div>
  )
}
