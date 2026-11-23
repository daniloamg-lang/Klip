import { afterEach, describe, expect, it, vi } from 'vitest'
import { initEdgeToEdge } from './edge-to-edge'

describe('edge-to-edge mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opts installed Android Chrome into covered viewport mode', () => {
    const viewport = { content: 'width=device-width, initial-scale=1.0' }
    const root = { dataset: {} as Record<string, string> }
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36',
    })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    vi.stubGlobal('document', {
      documentElement: root,
      querySelector: () => viewport,
    })

    initEdgeToEdge()
    expect(viewport.content).toContain('viewport-fit=cover')
    expect(root.dataset.edgeToEdge).toBe('true')
  })

  it('does not change regular browser viewports', () => {
    const viewport = { content: 'width=device-width' }
    vi.stubGlobal('navigator', { userAgent: 'Desktop Chrome' })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('document', { querySelector: () => viewport })

    initEdgeToEdge()
    expect(viewport.content).toBe('width=device-width')
  })
})
