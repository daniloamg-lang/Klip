import { useState } from 'react'
import { VaultScreen, type CloudVault } from './components/VaultScreen'
import { WorkspaceApp } from './components/WorkspaceApp'
import type { Workspace } from './lib/types'
import './App.css'

function App() {
  const [vault, setVault] = useState<{
    workspace: Workspace
    key: CryptoKey
    generation: number
    cloud?: CloudVault
  } | null>(null)

  if (!vault) {
    return <VaultScreen onUnlocked={(workspace, key, cloud) => setVault({ workspace, key, cloud, generation: 0 })} />
  }

  return (
    <WorkspaceApp
      initialWorkspace={vault.workspace}
      cryptoKey={vault.key}
      cloudVault={vault.cloud}
      onLock={() => setVault(null)}
      key={vault.generation}
    />
  )
}

export default App
