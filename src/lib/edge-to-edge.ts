export function initEdgeToEdge() {
  const isAndroidChrome =
    /Android/.test(navigator.userAgent) &&
    /Chrome\//.test(navigator.userAgent) &&
    !/EdgA\/|SamsungBrowser\/|OPR\//.test(navigator.userAgent)

  if (!isAndroidChrome || !window.matchMedia('(display-mode: standalone)').matches) return

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!viewport) throw new Error('Missing viewport meta tag')

  if (/(?:^|,)\s*viewport-fit\s*=/i.test(viewport.content)) {
    viewport.content = viewport.content.replace(
      /((?:^|,)\s*viewport-fit\s*=\s*)[^,]*/i,
      '$1cover',
    )
  } else {
    viewport.content += ', viewport-fit=cover'
  }
  document.documentElement.dataset.edgeToEdge = 'true'
}
