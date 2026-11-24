import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Cloud, Eye, EyeOff, Fingerprint, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Brand } from './Brand'
import { fetchCloudWorkspace, saveCloudWorkspace } from '../lib/cloud-sync'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { CloudSnapshot, Workspace } from '../lib/types'
import {
  createVault,
  openCloudWorkspace,
  replaceVault,
  sealWorkspace,
  unlockVault,
  vaultExists,
  vaultSalt,
} from '../lib/vault'

export interface CloudVault {
  userId: string
  revision: number
  salt: string
}

interface VaultScreenProps {
  onUnlocked: (workspace: Workspace, key: CryptoKey, cloud?: CloudVault) => void
}

type Stage =
  | 'loading'
  | 'sign-in'
  | 'mfa-enroll'
  | 'mfa-challenge'
  | 'passphrase'

export function VaultScreen({ onUnlocked }: VaultScreenProps) {
  const [stage, setStage] = useState<Stage>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [pendingFactor, setPendingFactor] = useState<{ id: string; qrCode: string; secret: string } | null>(null)
  const [remote, setRemote] = useState<CloudSnapshot | null>(null)
  const [localExists, setLocalExists] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function start() {
      try {
        const exists = await vaultExists()
        setLocalExists(exists)
        if (!isSupabaseConfigured || !supabase) {
          setStage('passphrase')
          return
        }
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        if (data.session) {
          setSession(data.session)
          await inspectSession()
        } else {
          setStage('sign-in')
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not open local storage.')
        setStage(isSupabaseConfigured ? 'sign-in' : 'passphrase')
      }
    }
    void start()
  }, [])

  async function inspectSession() {
    if (!supabase) return
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError) throw assuranceError
    if (assurance.currentLevel === 'aal2') {
      setRemote(await fetchCloudWorkspace(supabase))
      setStage('passphrase')
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
      if (!data.session) throw new Error('No authenticated session was created.')
      setSession(data.session)
      await inspectSession()
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
      await inspectSession()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not verify the authentication code.')
    } finally {
      setBusy(false)
    }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault()
    setError('')
    const creatingLocalVault = !remote && !localExists
    if (creatingLocalVault && passphrase !== confirmation) {
      setError('The passphrases do not match.')
      return
    }
    if (passphrase.length < 8) {
      setError('Use at least 8 characters. A longer memorable phrase is better.')
      return
    }
    setBusy(true)
    try {
      if (supabase && session && remote) {
        const opened = await openCloudWorkspace(
          session.user.id,
          passphrase,
          remote.key_salt,
          remote.payload,
        )
        await replaceVault(opened.workspace, opened.key, remote.key_salt)
        onUnlocked(opened.workspace, opened.key, {
          userId: session.user.id,
          revision: remote.revision,
          salt: remote.key_salt,
        })
        return
      }

      const opened = localExists
        ? await unlockVault(passphrase)
        : await createVault(passphrase)
      if (supabase && session) {
        const salt = await vaultSalt()
        const envelope = await sealWorkspace(opened.workspace, opened.key, session.user.id)
        const revision = await saveCloudWorkspace(supabase, envelope, 0, salt)
        onUnlocked(opened.workspace, opened.key, {
          userId: session.user.id,
          revision,
          salt,
        })
      } else {
        onUnlocked(opened.workspace, opened.key)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the vault.')
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'loading') {
    return (
      <main className="vault-page">
        <Brand />
        <div className="loading-ring" aria-label="Opening Klip" />
      </main>
    )
  }

  const passphraseTitle = remote || localExists ? 'Welcome back' : 'Create your vault'

  return (
    <main className="vault-page">
      <div className="vault-orbit" aria-hidden="true" />
      <section className="vault-card">
        <Brand />
        <div className="vault-icon">
          {stage === 'passphrase'
            ? remote || localExists ? <LockKeyhole size={28} /> : <ShieldCheck size={28} />
            : stage.startsWith('mfa') ? <Fingerprint size={28} /> : <Cloud size={28} />}
        </div>
        <p className="eyebrow">
          {stage === 'passphrase' ? 'Private encrypted workspace' : 'Secure account access'}
        </p>
        <h1>
          {stage === 'passphrase'
            ? passphraseTitle
            : stage.startsWith('mfa') ? 'Verify your identity' : 'Sign in to Klip'}
        </h1>
        <p className="vault-copy">
          {stage === 'passphrase'
            ? remote
              ? 'Authenticate with your vault passphrase to open your synchronized notes.'
              : 'Enter your passphrase to decrypt this device’s vault and enable cloud sync.'
            : stage.startsWith('mfa')
              ? stage === 'mfa-enroll'
                ? 'Scan this code with your authenticator, then enter the temporary code.'
                : 'Enter the six-digit code from your authenticator.'
              : 'Sign in with the email and password of the same account you use in Escriva—not your Supabase dashboard credentials.'}
        </p>

        {stage === 'sign-in' && (
          <form onSubmit={signIn}>
            <label>Email<input autoFocus type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <button className="primary-button vault-submit" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
          </form>
        )}

        {(stage === 'mfa-enroll' || stage === 'mfa-challenge') && (
          <>
            {pendingFactor?.qrCode && <img className="sync-qr" src={pendingFactor.qrCode} alt="Authenticator QR code" />}
            {pendingFactor?.secret && <details className="manual-secret"><summary>Cannot scan the code?</summary><code>{pendingFactor.secret}</code></details>}
            <form onSubmit={verifyTotp}>
              <label>Authentication code<input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required value={code} onChange={(event) => setCode(event.target.value)} /></label>
              <button className="primary-button vault-submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and unlock'}</button>
            </form>
          </>
        )}

        {stage === 'passphrase' && (
          <form onSubmit={unlock}>
            <label>
              Vault passphrase
              <span className="password-field">
                <input
                  autoFocus
                  type={visible ? 'text' : 'password'}
                  autoComplete={remote || localExists ? 'current-password' : 'new-password'}
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
            {!remote && !localExists && (
              <label>
                Confirm passphrase
                <input type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type it once more" />
              </label>
            )}
            <button className="primary-button vault-submit" disabled={busy}>
              {busy ? 'Opening…' : remote || localExists ? 'Unlock Klip' : 'Create vault'}
            </button>
          </form>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="privacy-note">
          <ShieldCheck size={14} />
          AES-256-GCM encryption · {isSupabaseConfigured ? 'Authenticated cloud sync' : 'Local-only vault'}
        </p>
      </section>
    </main>
  )
}
