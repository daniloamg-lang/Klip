import { useEffect, useRef } from 'react'

type BackAction = () => boolean

interface BackNavigationOptions {
  onBack: BackAction
  exitMessage?: string
}

const guardKey = 'klipBackGuard'

function pushGuard() {
  window.history.pushState(
    { ...(window.history.state ?? {}), [guardKey]: true },
    '',
  )
}

export function useAppBackNavigation({
  onBack,
  exitMessage = 'Exit Klip?',
}: BackNavigationOptions) {
  const onBackRef = useRef(onBack)

  useEffect(() => {
    onBackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!window.history.state?.[guardKey]) pushGuard()

    const handlePopState = () => {
      if (onBackRef.current()) {
        pushGuard()
        return
      }

      if (window.confirm(exitMessage)) {
        window.history.back()
      } else {
        pushGuard()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [exitMessage])
}
