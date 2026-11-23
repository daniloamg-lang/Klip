import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Cloud, Download, Fingerprint, LogOut, ShieldCheck, Upload, X } from 'lucide-react'
import { fetchCloudWorkspace, saveCloudWorkspace } from '../lib/cloud-sync'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  openCloudWorkspace,
  replaceVault,
  sealWorkspace,
  vaultSalt,
} from '../lib/vault'
import type { CloudSnapshot, Workspace } from '../lib/types'

interface SyncDialogProps {
  workspace: Workspace
  cryptoKey: CryptoKey
  onCloudDownloaded: (workspace: Workspace, key: CryptoKey) => void
  onClose: () => void
}

type SyncStage = 'sign-in' | 'mfa-enroll' | 'mfa-challenge' | 'ready'

export function SyncDialog({
  workspace,
  cryptoKey,
  onCloudDownloaded,
  onClose,
}: SyncDialogProps) {
  const [stage, setStage] = useState<SyncStage>('sign-in')
  const [session, setSession] = useState<Session | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [pendingFactor, setPendingFactor] = useState<{ id: string; qrCode: string; secret: string } | null>(null)
  const [remote, setRemote] = useState<CloudSnapshot | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) setStage('sign-in')
    })
    void supabase.auth.getSession().then(({ data: current, error: sessionError }) => {
      if (sessionError) throw sessionError
      setSession(current.session)
      if (current.session) void inspectSession(current.session)
    }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not restore the session.')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function inspectSession(_current: Session) {
    if (!supabase) return
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError) throw assuranceError
    if (assurance.currentLevel === 'aal2') {
      setStage('ready')
      setRemote(await fetchCloudWorkspace(supabase))
      setMessage('')
      return
    }

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
    if (factorsError) throw factorsError
    const verified = factors.totp.find((factor) => factor.status === 'verified')
    if (verified) {
      setFactorId(verified.id)
      setStage('mfa-challenge')
      return
    }

    for (const factor of factors.totp) {
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (removeError) throw removeError
    }
    const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Klip',
    })
    if (enrollmentError) throw enrollmentError
    setPendingFactor({
      id: enrollment.id,
      qrCode: enrollment.totp.qr_code,
      secret: enrollment.totp.secret,
    })
    setStage('mfa-enroll')
  }

  async function signIn(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) throw signInError
      if (!data.session) throw new Error('No session was created.')
      setSession(data.session)
      await inspectSession(data.session)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in.')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  async function verifyTotp(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const id = stage === 'mfa-enroll' ? pendingFactor?.id : factorId
      if (!id) throw new Error('No authentication factor is available.')
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: id })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: id,
        challengeId: challenge.id,
        code: code.replace(/\s/g, ''),
      })
      if (verifyError) throw verifyError
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!data.session) throw new Error('The authenticated session expired.')
      setSession(data.session)
      await inspectSession(data.session)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not verify the code.')
    } finally {
      setBusy(false)
    }
  }

  async function upload() {
    if (!supabase || !session?.user.id) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      let key = cryptoKey
      let salt = await vaultSalt()
      if (remote) {
        const opened = await openCloudWorkspace(
          session.user.id,
          passphrase,
          remote.key_salt,
          remote.payload,
        )
        key = opened.key
        salt = remote.key_salt
      }
      const envelope = await sealWorkspace(workspace, key, session.user.id)
      const revision = await saveCloudWorkspace(
        supabase,
        envelope,
        remote?.revision ?? 0,
        salt,
      )
      const refreshed = await fetchCloudWorkspace(supabase)
      setRemote(refreshed ?? remote)
      setMessage(`Encrypted workspace uploaded · revision ${revision}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upload the workspace.')
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    if (!supabase || !session?.user.id || !remote) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const opened = await openCloudWorkspace(
        session.user.id,
        passphrase,
        remote.key_salt,
        remote.payload,
      )
      await replaceVault(opened.workspace, opened.key, remote.key_salt)
      onCloudDownloaded(opened.workspace, opened.key)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not download the workspace.')
      setBusy(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    setBusy(true)
    const { error: signOutError } = await supabase.auth.signOut()
    setBusy(false)
    if (signOutError) setError(signOutError.message)
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="sync-backdrop">
        <section className="sync-dialog">
          <button className="icon-button sync-close" onClick={onClose} aria-label="Close sync"><X size={18} /></button>
          <div className="sync-icon"><Cloud size={25} /></div>
          <h2>Cloud sync is not configured</h2>
          <p>Add Klip's Supabase URL and publishable key to the environment before enabling synchronization.</p>
          <button className="primary-button" onClick={onClose}>Continue locally</button>
        </section>
      </div>
    )
  }

  return (
    <div className="sync-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="sync-dialog" role="dialog" aria-modal="true" aria-label="Cloud sync">
        <button className="icon-button sync-close" onClick={onClose} disabled={busy} aria-label="Close sync"><X size={18} /></button>
        <div className="sync-icon"><Cloud size={25} /></div>
        <p className="eyebrow">Encrypted cloud sync</p>
        <h2>{stage === 'ready' ? 'Sync your notebook' : stage.startsWith('mfa') ? 'Verify your identity' : 'Sign in to sync'}</h2>

        {stage === 'sign-in' && (
          <>
            <p>Use the private Supabase account configured for your personal apps.</p>
            <form onSubmit={signIn} className="sync-form">
              <label>Email<input autoFocus type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
            </form>
          </>
        )}

        {(stage === 'mfa-enroll' || stage === 'mfa-challenge') && (
          <>
            <Fingerprint size={32} className="mfa-symbol" />
            <p>{stage === 'mfa-enroll' ? 'Scan this code with your authenticator, then enter the temporary code.' : 'Enter the six-digit code from your authenticator.'}</p>
            {pendingFactor?.qrCode && <img className="sync-qr" src={pendingFactor.qrCode} alt="Authenticator QR code" />}
            {pendingFactor?.secret && <details className="manual-secret"><summary>Cannot scan the code?</summary><code>{pendingFactor.secret}</code></details>}
            <form onSubmit={verifyTotp} className="sync-form">
              <label>Authentication code<input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required value={code} onChange={(event) => setCode(event.target.value)} /></label>
              <button className="primary-button" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
            </form>
          </>
        )}

        {stage === 'ready' && (
          <>
            <p className="sync-account">{session?.user.email}</p>
            <div className="sync-status">
              <ShieldCheck size={16} />
              <span>{remote ? `Cloud copy · revision ${remote.revision}` : 'No cloud copy yet'}</span>
            </div>
            <form className="sync-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Vault passphrase
                <input type="password" autoComplete="current-password" required minLength={8} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="Same phrase on every device" />
              </label>
              <div className="sync-actions">
                <button type="button" className="sync-action" disabled={busy || !remote || !passphrase} onClick={() => void download()}>
                  <Download size={17} />
                  <span><strong>Download cloud copy</strong><small>Replace this device's notes</small></span>
                </button>
                <button type="button" className="sync-action upload" disabled={busy || !passphrase} onClick={() => void upload()}>
                  <Upload size={17} />
                  <span><strong>Upload this device</strong><small>{remote ? 'Replace the cloud copy' : 'Create the cloud copy'}</small></span>
                </button>
              </div>
            </form>
            <button className="sync-signout" onClick={() => void signOut()} disabled={busy}><LogOut size={14} /> Sign out</button>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="sync-success" role="status">{message}</p>}
        <p className="sync-note"><ShieldCheck size={13} /> Supabase receives ciphertext only. Your passphrase stays here.</p>
      </section>
    </div>
  )
}
