import { useEffect } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { mt5API } from '@/lib/api'
import { useWebSocket } from './useWebSocket'
import { AccountUpdate } from '@/lib/websocket'
import { useSubscription } from './useSubscription'

/**
 * Shared hook for accounts data with subscription limits
 * Ensures all pages use the same account data source
 */
export function useAccounts() {
  const queryClient = useQueryClient()
  
  // Use unified subscription hook - single source of truth
  const { subscription, tier: currentTier, limits: subscriptionLimits, refetch: refetchSubscription } = useSubscription()
  

  // Fetch accounts - shared cache key 'accounts'
  const { data: accounts, isLoading, error } = useQuery(
    'accounts',
    () => mt5API.getAccounts().then(res => res.data.data),
    {
      staleTime: Infinity, // Never consider data stale - WebSocket is the source of truth
      cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnMount: false, // Don't refetch on mount if data exists
      refetchInterval: false, // Don't auto-refetch - WebSocket provides real-time updates
    }
  )

  // Real-time account updates via WebSocket
  useWebSocket({
    onAccountUpdate: (update: AccountUpdate) => {
      // Update React Query cache with real-time data
      queryClient.setQueryData('accounts', (oldData: any) => {
        if (!oldData) {
          return oldData;
        }
        
        return oldData.map((account: any) => {
          // Normalize account IDs to strings for comparison
          const accountIdStr = String(account._id?.toString() || account._id || '').trim();
          const updateIdStr = String(update.accountId?.toString() || update.accountId || '').trim();
          
          const isMatch = accountIdStr === updateIdStr || 
                         String(account._id) === String(update.accountId);
          
          if (isMatch) {
            // If account goes offline, set balance/equity to 0
            const isOffline = update.connectionStatus === 'offline' || 
                            (update.connectionStatus === undefined && account.connectionStatus === 'offline');
            
            return {
              ...account,
              // If offline, set financial values to 0, otherwise use update values or keep existing
              balance: isOffline ? 0 : (update.balance !== undefined && update.balance !== null ? update.balance : account.balance),
              equity: isOffline ? 0 : (update.equity !== undefined && update.equity !== null ? update.equity : account.equity),
              margin: isOffline ? 0 : (update.margin !== undefined && update.margin !== null ? update.margin : account.margin),
              freeMargin: isOffline ? 0 : (update.freeMargin !== undefined && update.freeMargin !== null ? update.freeMargin : account.freeMargin),
              marginLevel: isOffline ? 0 : (update.marginLevel !== undefined && update.marginLevel !== null ? update.marginLevel : account.marginLevel),
              connectionStatus: update.connectionStatus || account.connectionStatus,
              lastHeartbeat: update.lastHeartbeat || account.lastHeartbeat,
            };
          }
          return account;
        });
      });
    },
  })

  // Check if user is on trial (for informational purposes only)
  const isOnTrial = subscription?.trialClaimed && 
                    subscription?.trialExpiryDate && 
                    new Date(subscription.trialExpiryDate) > new Date()
  
  // Calculate account limits and usage
  // BASIC tier = no paid subscription and no active trial
  const isBasicTier = currentTier === 'BASIC' && !isOnTrial
  
  const masterAccounts = accounts?.filter((acc: any) => acc.accountType === 'master') || []
  const slaveAccounts = accounts?.filter((acc: any) => acc.accountType === 'slave') || []
  const standaloneAccounts = accounts?.filter((acc: any) => acc.accountType === 'standalone') || []

  // Get limits from subscription object or subscriptionLimits (backend already handles trial limits)
  const maxMasters = subscription?.limits?.totalMasters || subscriptionLimits?.totalMasters || 0
  const maxSlaves = subscription?.limits?.totalSlaves || subscriptionLimits?.totalSlaves || 0

  const canAddMaster = masterAccounts.length < maxMasters
  const canAddSlave = slaveAccounts.length < maxSlaves
  const canAddStandalone = (masterAccounts.length + slaveAccounts.length + standaloneAccounts.length) < (maxMasters + maxSlaves)

  return {
    // Account data
    accounts: accounts || [],
    isLoading,
    error,
    
    // Subscription data
    subscription,
    currentTier,
    isBasicTier,
    
    // Limits
    limits: {
      maxMasters,
      maxSlaves,
      currentMasters: masterAccounts.length,
      currentSlaves: slaveAccounts.length,
      currentStandalone: standaloneAccounts.length,
    },
    
    // Account groups
    masterAccounts,
    slaveAccounts,
    standaloneAccounts,
    
    // Can add checks
    canAddMaster,
    canAddSlave,
    canAddStandalone,
    canAddAny: canAddMaster || canAddSlave || canAddStandalone,
    
    // Trial status
    isOnTrial,
    
    // Helper functions
    getAccountById: (id: string) => accounts?.find((acc: any) => acc._id === id || String(acc._id) === id),
  }
}

