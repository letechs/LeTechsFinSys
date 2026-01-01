'use client'

import { useEffect } from 'react'

export function ServiceWorkerUnregister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Use setTimeout to avoid blocking initial render
      setTimeout(() => {
        navigator.serviceWorker.getRegistrations().then(function(registrations) {
          for(let registration of registrations) {
            registration.unregister().catch(() => {
              // Silently fail
            })
          }
        }).catch(() => {
          // Silently fail
        })
      }, 100)
    }
  }, [])

  return null
}

