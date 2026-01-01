'use client'

import { ReactNode } from 'react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { Lock, ArrowUp } from 'lucide-react'
import Link from 'next/link'

interface FeatureGateProps {
  children: ReactNode
  requiredTier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'
  featureName?: string
  showUpgrade?: boolean
}

/**
 * FeatureGate Component
 * 
 * Restricts access to features based on subscription tier
 * 
 * Usage:
 * <FeatureGate requiredTier="FULL_ACCESS" featureName="Web Terminal">
 *   <WebTerminalComponent />
 * </FeatureGate>
 */
export function FeatureGate({ 
  children, 
  requiredTier, 
  featureName = 'This feature',
  showUpgrade = true 
}: FeatureGateProps) {
  // Use unified subscription hook instead of localStorage
  const { tier: userTier, isExpired } = useSubscription()
  
  // Check if user has required tier
  const hasAccess = 
    requiredTier === 'BASIC'
      ? true // BASIC tier has access to BASIC features
      : requiredTier === 'EA_LICENSE' 
        ? (userTier === 'EA_LICENSE' || userTier === 'FULL_ACCESS')
        : userTier === 'FULL_ACCESS'
  
  if (hasAccess && !isExpired) {
    return <>{children}</>
  }
  
  // Show upgrade prompt
  return (
    <div className="card p-8 sm:p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-6">
        <Lock className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-3">
        {featureName} Requires {requiredTier === 'FULL_ACCESS' ? 'Full Access' : requiredTier === 'EA_LICENSE' ? 'EA License' : 'Basic'}
      </h3>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        {isExpired 
          ? 'Your subscription has expired. Please renew to continue using this feature.'
          : `Upgrade to ${requiredTier === 'FULL_ACCESS' ? 'Full Access' : requiredTier === 'EA_LICENSE' ? 'EA License' : 'Basic'} tier to access ${featureName.toLowerCase()}.`
        }
      </p>
      {showUpgrade && (
        <Link
          href="/dashboard/subscription"
          className="btn btn-primary btn-lg"
        >
          <ArrowUp className="w-5 h-5 mr-2" />
          {isExpired ? 'Renew Subscription' : 'Upgrade Now'}
        </Link>
      )}
    </div>
  )
}

/**
 * Hook to check if user has access to a feature
 */
export function useFeatureAccess(requiredTier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'): boolean {
  const { tier: userTier, isExpired } = useSubscription()
  
  if (isExpired) return false
  
  return requiredTier === 'BASIC'
    ? true
    : requiredTier === 'EA_LICENSE'
      ? (userTier === 'EA_LICENSE' || userTier === 'FULL_ACCESS')
      : userTier === 'FULL_ACCESS'
}

/**
 * Hook to get user's subscription tier
 * Re-exported from useSubscription for backward compatibility
 */
export { useSubscriptionTier } from '@/lib/hooks/useSubscription'

