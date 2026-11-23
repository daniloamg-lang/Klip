import { useState } from 'react'
import { VaultScreen } from './components/VaultScreen'
import { WorkspaceApp } from './components/WorkspaceApp'
import type { Workspace } from './lib/types'
import './App.css'

function App() {
  const [vault, setVault] = useState<{
    workspace: Workspace
    key: CryptoKey
    generation: number
  } | null>(null)

  if (!vault) {
    return <VaultScreen onUnlocked={(workspace, key) => setVault({ workspace, key, generation: 0 })} />
  }

  return (
    <WorkspaceApp
      initialWorkspace={vault.workspace}
      cryptoKey={vault.key}
      onLock={() => setVault(null)}
      key={vault.generation}
      onCloudDownloaded={(workspace, key) => setVault((current) => ({
        workspace,
        key,
        generation: (current?.generation ?? 0) + 1,
      }))}
    />
  )
}

export default App
