import { useState } from 'react'
import { VaultScreen } from './components/VaultScreen'
import { WorkspaceApp } from './components/WorkspaceApp'
import type { Workspace } from './lib/types'
import './App.css'

function App() {
  const [vault, setVault] = useState<{ workspace: Workspace; key: CryptoKey } | null>(null)

  if (!vault) {
    return <VaultScreen onUnlocked={(workspace, key) => setVault({ workspace, key })} />
  }

  return (
    <WorkspaceApp
      initialWorkspace={vault.workspace}
      cryptoKey={vault.key}
      onLock={() => setVault(null)}
    />
  )
}

export default App
