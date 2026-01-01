'use client'

import { DashboardLayout } from '@/components/Layout/DashboardLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useWebSocketConnection } from '@/lib/hooks/useWebSocketConnection'

export default function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  // Establish global WebSocket connection for real-time updates
  useWebSocketConnection()

  return (
    <ProtectedRoute>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
  )
}

