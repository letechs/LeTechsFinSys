/**
 * Unified Subscription Hook
 * Single source of truth for subscription data across the entire app
 * Uses React Query for caching and automatic updates
 */

import { useQuery, useQueryClient } from 'react-query'
import { hybridSubscriptionAPI, authAPI } from '@/lib/api'
import { authService } from '@/lib/auth'

/**
 * Unified subscription hook
 * All pages should use this instead of useSubscriptionTier or direct authService calls
 */
export function useSubscription() {
  const queryClient = useQueryClient()

  // Fetch hybrid subscription - this is the single source of truth
  const { data: subscription, isLoading, error, refetch } = useQuery(
    'hybridSubscription',
    () => hybridSubscriptionAPI.getHybridSubscription().then(res => res.data.data),
    {
      retry: 2,
      staleTime: 1 * 60 * 1000, // 1 minute - allow refetching after payment
      cacheTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: true, // Refetch when user returns to tab
      onSuccess: (data) => {
        // Update localStorage user data when subscription changes
        // This keeps authService.getCurrentUser() in sync
        if (data && typeof window !== 'undefined') {
          authService.updateUser({
            subscriptionTier: data.subscriptionTier,
            subscriptionExpiry: data.renewalDate || undefined,
          })
        }
      },
    }
  )

  // Get current user from localStorage (fallback)
  const user = authService.getCurrentUser()

  // Calculate tier and expiry
  const tier = subscription?.subscriptionTier || user?.subscriptionTier || 'BASIC'
  const expiryDate = subscription?.renewalDate 
    ? new Date(subscription.renewalDate) 
    : (user?.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null)
  
  // Check if expired
  const now = new Date()
  const isExpired = subscription?.isExpired || (expiryDate ? expiryDate < now : false)

  // Get limits
  const limits = subscription?.limits || {
    totalMasters: 0,
    totalSlaves: 0,
  }

  return {
    // Subscription data
    subscription,
    tier: tier as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS',
    isExpired,
    expiryDate,
    
    // Limits
    limits,
    totalMasters: limits.totalMasters,
    totalSlaves: limits.totalSlaves,
    
    // Additional subscription info
    baseTier: subscription?.baseTier,
    additionalMasters: subscription?.additionalMasters || 0,
    additionalSlaves: subscription?.additionalSlaves || 0,
    renewalDate: subscription?.renewalDate,
    
    // Status
    isLoading,
    error,
    
    // Actions
    refetch,
    invalidate: () => {
      queryClient.invalidateQueries('hybridSubscription')
      // Also refresh user data to update localStorage
      authService.refreshUser().catch(() => {
        // Ignore errors - localStorage update is best effort
      })
    },
  }
}

/**
 * Hook to get subscription tier (backward compatibility)
 * Now uses unified subscription hook
 */
export function useSubscriptionTier(): {
  tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'
  isExpired: boolean
  expiryDate: Date | null
} {
  const { tier, isExpired, expiryDate } = useSubscription()
  return { tier, isExpired, expiryDate }
}

