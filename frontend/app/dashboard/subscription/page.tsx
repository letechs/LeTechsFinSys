'use client'

import { useQuery, useMutation, useQueryClient } from 'react-query'
import { hybridSubscriptionAPI, paymentAPI, configAPI } from '@/lib/api'
import { Check, X, Download, Crown, Key, Plus, Minus, Calendar, AlertCircle, Gift, RefreshCw } from 'lucide-react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'

export default function SubscriptionPage() {
  const queryClient = useQueryClient()
  const { tier, isExpired, expiryDate, subscription: hybridSubscription, isLoading: hybridLoading, invalidate: invalidateSubscription, isOnTrial, trialExpiryDate } = useSubscription()
  const searchParams = useSearchParams()

  // Fetch add-on pricing (public endpoint for authenticated users)
  const { data: pricingData } = useQuery(
    'addOnPricing',
    () => hybridSubscriptionAPI.getAddOnPricing().then(res => res.data.data),
    {
      retry: 2,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    }
  )

  // Handle Stripe checkout success/cancel with polling for subscription update
  useEffect(() => {
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')
    const sessionId = searchParams.get('session_id')

    if (success === 'true' && sessionId) {
      toast.success('Payment successful! Updating your subscription...')
      
      // Remove query params from URL immediately
      window.history.replaceState({}, '', '/dashboard/subscription')
      
      // Immediately verify session and update subscription (fallback when webhooks don't work)
      const verifyAndUpdate = async () => {
        try {
          await paymentAPI.verifySession(sessionId)
          
          // Wait a moment for backend to process
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Invalidate all queries to force refetch
      invalidateSubscription()
          queryClient.invalidateQueries('hybridSubscription')
      queryClient.invalidateQueries('licenseConfig')
          queryClient.invalidateQueries('accounts')
          
          // Fetch fresh data
          const updatedData = await hybridSubscriptionAPI.getHybridSubscription().then(res => res.data.data)
          
          toast.success('Subscription updated successfully!', {
            duration: 4000,
            icon: '✅',
          })
        } catch (error: any) {
          // Error already handled by toast notification
          
          // Fallback to polling if verification fails
          toast.loading('Verifying payment... This may take a moment.', { id: 'verifying' })
          
          // Store current subscription state to detect changes
          const initialTier = hybridSubscription?.subscriptionTier
          const initialRenewalDate = hybridSubscription?.renewalDate
          const initialMasters = hybridSubscription?.additionalMasters || 0
          const initialSlaves = hybridSubscription?.additionalSlaves || 0
          
          // Poll for subscription updates (webhook may take a few seconds)
          let pollCount = 0
          const maxPolls = 30 // Poll for up to 30 times (30 seconds)
          const pollInterval = 1000 // Poll every 1 second
          
          const pollForUpdate = setInterval(async () => {
            pollCount++
            
            try {
              // Invalidate queries to force refetch
              queryClient.invalidateQueries('hybridSubscription')
              queryClient.invalidateQueries('licenseConfig')
              queryClient.invalidateQueries('accounts')
              
              // Fetch fresh subscription data
              const updatedData = await hybridSubscriptionAPI.getHybridSubscription().then(res => res.data.data)
              
              // Check if subscription has been updated
              const tierUpdated = updatedData?.subscriptionTier && updatedData.subscriptionTier !== initialTier
              const renewalUpdated = updatedData?.renewalDate && 
                new Date(updatedData.renewalDate).getTime() !== new Date(initialRenewalDate || 0).getTime()
              const mastersUpdated = (updatedData?.additionalMasters || 0) !== initialMasters
              const slavesUpdated = (updatedData?.additionalSlaves || 0) !== initialSlaves
              
              // Also check if tier changed from BASIC to EA_LICENSE or FULL_ACCESS
              const tierUpgraded = initialTier === 'BASIC' && 
                (updatedData?.subscriptionTier === 'EA_LICENSE' || updatedData?.subscriptionTier === 'FULL_ACCESS')
              
              if (tierUpdated || tierUpgraded || renewalUpdated || mastersUpdated || slavesUpdated) {
                clearInterval(pollForUpdate)
                toast.dismiss('verifying')
                toast.success('Subscription updated successfully!', {
                  duration: 4000,
                  icon: '✅',
                })
                
                // Final refresh to ensure UI is up to date
                invalidateSubscription()
                queryClient.invalidateQueries('licenseConfig')
                queryClient.invalidateQueries('accounts')
              } else if (pollCount >= maxPolls) {
                clearInterval(pollForUpdate)
                toast.dismiss('verifying')
                toast.success('Payment processed! If your subscription hasn\'t updated yet, please refresh the page.', {
                  duration: 5000,
                })
              }
            } catch (error) {
              // Continue polling on error (errors are handled silently)
            }
          }, pollInterval)
        }
      }
      
      // Call verification immediately
      verifyAndUpdate()
    } else if (canceled === 'true') {
      toast.error('Payment canceled. You can try again anytime.')
      // Remove query params from URL
      window.history.replaceState({}, '', '/dashboard/subscription')
    }
  }, [searchParams, queryClient, invalidateSubscription, hybridSubscription])




  // Checkout cart state (for new add-ons)
  const [checkoutCart, setCheckoutCart] = useState<{ master: number; slave: number }>({ master: 0, slave: 0 })
  const [showCheckout, setShowCheckout] = useState(false)

  // Upgrade configuration state (for tier + add-ons purchase)
  const [selectedTier, setSelectedTier] = useState<'EA_LICENSE' | 'FULL_ACCESS' | null>(null)
  const [upgradeAddOns, setUpgradeAddOns] = useState<{ master: number; slave: number }>({ master: 0, slave: 0 })
  const [showUpgradeConfig, setShowUpgradeConfig] = useState(false)

  // Renewal configuration state
  const [renewalAddOns, setRenewalAddOns] = useState<{ master: number; slave: number }>({ master: 0, slave: 0 })
  const [showRenewalConfig, setShowRenewalConfig] = useState(false)

  // Pricing constants - use from pricing data if available, otherwise fallback to defaults
  const MASTER_PRICE = pricingData?.addOnPricing?.masterPrice || 10 // Default: $10/month per master
  const SLAVE_PRICE = pricingData?.addOnPricing?.slavePrice || 5 // Default: $5/month per slave
  const EA_LICENSE_PRICE = 29 // $29/month
  const FULL_ACCESS_PRICE = 99 // $99/month
  
  // Currency conversion rate - use from pricing data if available, otherwise fallback to default
  const USD_TO_AED = pricingData?.currencyConversion?.usdToAed || 3.67 // Default: 3.67
  
  // Helper function to convert USD to AED (rounded to 2 decimals)
  const convertUsdToAed = (usdAmount: number): number => {
    return Math.round(usdAmount * USD_TO_AED * 100) / 100
  }
  
  // Helper component to display price in both USD and AED
  const PriceDisplay = ({ usdPrice, className = '', showAED = true, suffix = '' }: { usdPrice: number; className?: string; showAED?: boolean; suffix?: string }) => {
    const aedPrice = convertUsdToAed(usdPrice)
    return (
      <span className={className}>
        ${usdPrice.toFixed(2)} USD
        {showAED && <span className="text-gray-500 text-sm ml-2">≈ {aedPrice.toFixed(2)} AED</span>}
        {suffix && <span>{suffix}</span>}
      </span>
    )
  }
  
  // Trial config - use from pricing data if available, otherwise fallback to defaults
  const TRIAL_DURATION_DAYS = pricingData?.trial?.durationDays || 3 // Default: 3 days
  const TRIAL_MASTERS = pricingData?.trial?.masters || 1 // Default: 1 master
  const TRIAL_SLAVES = pricingData?.trial?.slaves || 1 // Default: 1 slave

  // Calculate effective discount percentage
  const getEffectiveDiscount = () => {
    if (!hybridSubscription) return 0
    
    let discount = 0
    
    // Client discount (only applies if enabled globally and user is client)
    // Check both clientDiscountEnabled flag and ensure percentage > 0
    if (hybridSubscription.clientDiscountEnabled && hybridSubscription.isClient && hybridSubscription.clientDiscountPercentage > 0) {
      discount += hybridSubscription.clientDiscountPercentage
    }
    
    // Special discount (only if global offers enabled and not expired)
    if (hybridSubscription.globalOffersEnabled && hybridSubscription.specialDiscountPercentage && hybridSubscription.specialDiscountPercentage > 0) {
      if (hybridSubscription.specialDiscountExpiryDate) {
        const expiryDate = new Date(hybridSubscription.specialDiscountExpiryDate)
        if (expiryDate > new Date()) {
          discount += hybridSubscription.specialDiscountPercentage
        }
      } else {
        // No expiry date means it's active
        discount += hybridSubscription.specialDiscountPercentage
      }
    }
    
    // Cap at 100%
    return Math.min(discount, 100)
  }

  const effectiveDiscount = getEffectiveDiscount()

  // Calculate discounted price
  const applyDiscount = (price: number) => {
    if (effectiveDiscount === 0) return price
    return price * (1 - effectiveDiscount / 100)
  }

  // Calculate total price (with discount) - for add-ons only
  const calculateTotal = () => {
    const masterTotal = checkoutCart.master * applyDiscount(MASTER_PRICE)
    const slaveTotal = checkoutCart.slave * applyDiscount(SLAVE_PRICE)
    return masterTotal + slaveTotal
  }

  // Calculate original total (without discount) - for add-ons only
  const calculateOriginalTotal = () => {
    return (checkoutCart.master * MASTER_PRICE) + (checkoutCart.slave * SLAVE_PRICE)
  }

  // Calculate tier price
  const getTierPrice = (tier: 'EA_LICENSE' | 'FULL_ACCESS') => {
    return tier === 'EA_LICENSE' ? EA_LICENSE_PRICE : FULL_ACCESS_PRICE
  }

  // Calculate combined total for upgrade (tier + add-ons)
  const calculateUpgradeTotal = () => {
    if (!selectedTier) return 0
    const tierPrice = applyDiscount(getTierPrice(selectedTier))
    const masterTotal = upgradeAddOns.master * applyDiscount(MASTER_PRICE)
    const slaveTotal = upgradeAddOns.slave * applyDiscount(SLAVE_PRICE)
    return tierPrice + masterTotal + slaveTotal
  }

  // Calculate original combined total (without discount) - for upgrade
  const calculateUpgradeOriginalTotal = () => {
    if (!selectedTier) return 0
    const tierPrice = getTierPrice(selectedTier)
    return tierPrice + (upgradeAddOns.master * MASTER_PRICE) + (upgradeAddOns.slave * SLAVE_PRICE)
  }

  // Handle checkout for add-ons
  const handleCheckout = () => {
    if (checkoutCart.master === 0 && checkoutCart.slave === 0) {
      toast.error('Please select at least one add-on to purchase')
      return
    }
    createCheckoutMutation.mutate({
      addOns: {
        masters: checkoutCart.master > 0 ? checkoutCart.master : undefined,
        slaves: checkoutCart.slave > 0 ? checkoutCart.slave : undefined,
      },
      billingCycle: 'monthly',
    })
  }

  // Handle upgrade to different tier - show configuration UI
  const handleUpgrade = (targetTier: 'EA_LICENSE' | 'FULL_ACCESS') => {
    setSelectedTier(targetTier)
    setUpgradeAddOns({ master: 0, slave: 0 })
    setShowUpgradeConfig(true)
  }

  // Close upgrade configuration
  const handleCloseUpgradeConfig = () => {
    setShowUpgradeConfig(false)
    setSelectedTier(null)
    setUpgradeAddOns({ master: 0, slave: 0 })
  }

  // Handle unified checkout (tier + add-ons)
  const handleUnifiedCheckout = () => {
    if (!selectedTier) {
      toast.error('Please select a tier to upgrade')
      return
    }

    // Prepare add-ons data (only include if > 0)
    const addOnsData = {
      masters: upgradeAddOns.master > 0 ? upgradeAddOns.master : undefined,
      slaves: upgradeAddOns.slave > 0 ? upgradeAddOns.slave : undefined,
    }

    // If no add-ons, just pass tier
    if (upgradeAddOns.master === 0 && upgradeAddOns.slave === 0) {
    createCheckoutMutation.mutate({
        tier: selectedTier,
        billingCycle: 'monthly',
      })
    } else {
      // Include both tier and add-ons
      createCheckoutMutation.mutate({
        tier: selectedTier,
        addOns: addOnsData,
      billingCycle: 'monthly',
    })
    }

    // Close configuration UI
    handleCloseUpgradeConfig()
  }

  // Handle renewal
  const handleRenewal = () => {
    if (!hybridSubscription || !hybridSubscription.renewalDate) {
      toast.error('No active subscription to renew')
      return
    }

    if (hybridSubscription.subscriptionTier === 'BASIC') {
      toast.error('Cannot renew basic tier subscription')
      return
    }

    // Initialize with current add-ons
    setRenewalAddOns({
      master: hybridSubscription.additionalMasters || 0,
      slave: hybridSubscription.additionalSlaves || 0,
    })
    setShowRenewalConfig(true)
  }

  // Close renewal configuration
  const handleCloseRenewalConfig = () => {
    setShowRenewalConfig(false)
    setRenewalAddOns({ master: 0, slave: 0 })
  }

  // Calculate renewal total (tier + add-ons)
  const calculateRenewalTotal = () => {
    if (!hybridSubscription || hybridSubscription.subscriptionTier === 'BASIC') return 0
    const tierPrice = applyDiscount(getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS'))
    const masterTotal = renewalAddOns.master * applyDiscount(MASTER_PRICE)
    const slaveTotal = renewalAddOns.slave * applyDiscount(SLAVE_PRICE)
    return tierPrice + masterTotal + slaveTotal
  }

  // Calculate original renewal total (without discount)
  const calculateRenewalOriginalTotal = () => {
    if (!hybridSubscription || hybridSubscription.subscriptionTier === 'BASIC') return 0
    const tierPrice = getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')
    return tierPrice + (renewalAddOns.master * MASTER_PRICE) + (renewalAddOns.slave * SLAVE_PRICE)
  }

  // Handle renewal checkout
  const handleRenewalCheckout = () => {
    if (!hybridSubscription || !hybridSubscription.subscriptionTier || hybridSubscription.subscriptionTier === 'BASIC') {
      toast.error('Cannot renew basic tier subscription')
      return
    }

    // For renewal, pass the total desired add-ons
    // Backend will calculate the difference and add/remove accordingly
    const addOnsData: { masters?: number; slaves?: number } = {}
    if (renewalAddOns.master > 0) addOnsData.masters = renewalAddOns.master
    if (renewalAddOns.slave > 0) addOnsData.slaves = renewalAddOns.slave

    // For renewal, we pass the current tier and total desired add-ons
    // Backend will handle extending from existing expiry date and adjusting add-ons
    createCheckoutMutation.mutate({
      tier: hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS',
      addOns: Object.keys(addOnsData).length > 0 ? addOnsData : undefined,
      billingCycle: 'monthly',
      isRenewal: true, // Flag to indicate this is a renewal
    })

    // Close configuration UI
    handleCloseRenewalConfig()
  }

  // Claim trial mutation
  const claimTrialMutation = useMutation(
    () => hybridSubscriptionAPI.claimTrial(),
    {
      onSuccess: () => {
        invalidateSubscription()
        queryClient.invalidateQueries('licenseConfig')
        queryClient.invalidateQueries('accounts')
        toast.success(`Free trial activated! You now have ${TRIAL_DURATION_DAYS} days to try the service with ${TRIAL_MASTERS} master${TRIAL_MASTERS !== 1 ? 's' : ''} and ${TRIAL_SLAVES} slave${TRIAL_SLAVES !== 1 ? 's' : ''} account${TRIAL_SLAVES !== 1 ? 's' : ''}.`)
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to claim trial')
      },
    }
  )

  // Create checkout session mutation
  const createCheckoutMutation = useMutation(
    (data: { tier?: 'EA_LICENSE' | 'FULL_ACCESS'; addOns?: { masters?: number; slaves?: number }; billingCycle?: 'monthly' | 'yearly'; isRenewal?: boolean }) => 
      paymentAPI.createCheckoutSession(data),
    {
      onSuccess: (response) => {
        // Redirect to Stripe checkout
        if (response.data?.data?.url) {
          window.location.href = response.data.data.url
        } else {
          toast.error('Failed to get checkout URL')
        }
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to create checkout session')
      },
    }
  )

  // Get customer portal mutation
  const getCustomerPortalMutation = useMutation(
    () => paymentAPI.getCustomerPortal(),
    {
      onSuccess: (response) => {
        if (response.data?.data?.url) {
          window.location.href = response.data.data.url
        } else {
          toast.error('Failed to get customer portal URL')
        }
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to get customer portal')
      },
    }
  )

  // Handle manage subscription
  const handleManageSubscription = () => {
    getCustomerPortalMutation.mutate()
  }

  if (hybridLoading) {
    return (
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Subscription</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading subscription...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Upgrade Configuration Modal */}
      {showUpgradeConfig && selectedTier && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseUpgradeConfig}
        >
          <div 
            className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">
                Configure Your Upgrade
              </h2>
              <button
                onClick={handleCloseUpgradeConfig}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Selected Tier Info */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {selectedTier === 'EA_LICENSE' ? 'EA License' : 'Full Access'}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedTier === 'EA_LICENSE' 
                        ? '1 Master + 2 Slaves included' 
                        : '3 Masters + 10 Slaves included'}
                    </p>
                  </div>
                  <div className="text-right">
                    {effectiveDiscount > 0 ? (
                      <>
                        <div className="text-sm text-gray-400 line-through">
                          <PriceDisplay usdPrice={getTierPrice(selectedTier)} />/month
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                          <PriceDisplay usdPrice={applyDiscount(getTierPrice(selectedTier))} />/month
                        </div>
                      </>
                    ) : (
                      <div className="text-2xl font-bold text-gray-900">
                        <PriceDisplay usdPrice={getTierPrice(selectedTier)} />/month
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Discount Badge */}
              {effectiveDiscount > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-semibold text-green-800">
                    🎉 You have {effectiveDiscount}% discount applied!
                    {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage && (
                      <> (Client: {hybridSubscription.clientDiscountPercentage}%</>
                    )}
                    {hybridSubscription?.globalOffersEnabled && hybridSubscription?.specialDiscountPercentage && hybridSubscription?.specialDiscountPercentage > 0 && (
                      <>
                        {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage ? ' + ' : ''}
                        {hybridSubscription?.specialDiscountDescription || 'Special'}: {hybridSubscription.specialDiscountPercentage}%
                      </>
                    )}
                    {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage && <>)</>}
                  </p>
                </div>
              )}

              {/* Add-ons Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Add Additional Accounts (Optional)
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  You can add more master and slave accounts to your subscription.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Master Add-ons */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Additional Masters</p>
                        {effectiveDiscount > 0 ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400 line-through">${MASTER_PRICE}/month</span>
                            <span className="text-sm font-semibold text-green-600">${applyDiscount(MASTER_PRICE).toFixed(2)}/month</span>
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{effectiveDiscount}% off</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 mt-1">${MASTER_PRICE}/month each</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setUpgradeAddOns({ ...upgradeAddOns, master: Math.max(0, upgradeAddOns.master - 1) })}
                        disabled={upgradeAddOns.master === 0}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={upgradeAddOns.master}
                        onChange={(e) => setUpgradeAddOns({ ...upgradeAddOns, master: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      />
                      <button
                        onClick={() => setUpgradeAddOns({ ...upgradeAddOns, master: upgradeAddOns.master + 1 })}
                        className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {upgradeAddOns.master > 0 && (
                      <p className="text-xs text-gray-600 mt-2">
                        {effectiveDiscount > 0 ? (
                          <>
                            Subtotal: <span className="line-through text-gray-400">${(upgradeAddOns.master * MASTER_PRICE).toFixed(2)}</span>{' '}
                            <span className="font-semibold text-green-600">${(upgradeAddOns.master * applyDiscount(MASTER_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>Subtotal: ${(upgradeAddOns.master * MASTER_PRICE).toFixed(2)}/month</>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Slave Add-ons */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Additional Slaves</p>
                        {effectiveDiscount > 0 ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400 line-through">${SLAVE_PRICE}/month</span>
                            <span className="text-sm font-semibold text-green-600">${applyDiscount(SLAVE_PRICE).toFixed(2)}/month</span>
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{effectiveDiscount}% off</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 mt-1">${SLAVE_PRICE}/month each</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setUpgradeAddOns({ ...upgradeAddOns, slave: Math.max(0, upgradeAddOns.slave - 1) })}
                        disabled={upgradeAddOns.slave === 0}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={upgradeAddOns.slave}
                        onChange={(e) => setUpgradeAddOns({ ...upgradeAddOns, slave: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      />
                      <button
                        onClick={() => setUpgradeAddOns({ ...upgradeAddOns, slave: upgradeAddOns.slave + 1 })}
                        className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {upgradeAddOns.slave > 0 && (
                      <p className="text-xs text-gray-600 mt-2">
                        {effectiveDiscount > 0 ? (
                          <>
                            Subtotal: <span className="line-through text-gray-400">${(upgradeAddOns.slave * SLAVE_PRICE).toFixed(2)}</span>{' '}
                            <span className="font-semibold text-green-600">${(upgradeAddOns.slave * applyDiscount(SLAVE_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>Subtotal: ${(upgradeAddOns.slave * SLAVE_PRICE).toFixed(2)}/month</>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="p-6 bg-white rounded-xl border-2 border-gray-300 shadow-lg">
                <h4 className="text-xl font-bold text-gray-900 mb-5 flex items-center">
                  <div className="w-1 h-6 bg-primary-600 rounded-full mr-3"></div>
                  Order Summary
                </h4>
                
                <div className="space-y-2 mb-4">
                  {/* Tier */}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {selectedTier === 'EA_LICENSE' ? 'EA License' : 'Full Access'}
                      {effectiveDiscount > 0 ? (
                        <> (<span className="line-through text-gray-400">${getTierPrice(selectedTier)}</span> <span className="text-green-600">${applyDiscount(getTierPrice(selectedTier)).toFixed(2)}</span>/month)</>
                      ) : (
                        <> (${getTierPrice(selectedTier)}/month)</>
                      )}
                    </span>
                    <span className="font-medium text-gray-900">
                      {effectiveDiscount > 0 ? (
                        <>
                          <span className="line-through text-gray-400 text-xs mr-1">${getTierPrice(selectedTier).toFixed(2)}</span>
                          <span className="text-green-600">${applyDiscount(getTierPrice(selectedTier)).toFixed(2)}</span>/month
                        </>
                      ) : (
                        <>${getTierPrice(selectedTier).toFixed(2)}/month</>
                      )}
                    </span>
                  </div>

                  {/* Add-ons */}
                  {upgradeAddOns.master > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {upgradeAddOns.master} × Additional Master{upgradeAddOns.master > 1 ? 's' : ''}
                        {effectiveDiscount > 0 ? (
                          <> (<span className="line-through text-gray-400">${MASTER_PRICE}</span> <span className="text-green-600">${applyDiscount(MASTER_PRICE).toFixed(2)}</span>/month each)</>
                        ) : (
                          <> (${MASTER_PRICE}/month each)</>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {effectiveDiscount > 0 ? (
                          <>
                            <span className="line-through text-gray-400 text-xs mr-1">${(upgradeAddOns.master * MASTER_PRICE).toFixed(2)}</span>
                            <span className="text-green-600">${(upgradeAddOns.master * applyDiscount(MASTER_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>${(upgradeAddOns.master * MASTER_PRICE).toFixed(2)}/month</>
                        )}
                      </span>
                    </div>
                  )}

                  {upgradeAddOns.slave > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {upgradeAddOns.slave} × Additional Slave{upgradeAddOns.slave > 1 ? 's' : ''}
                        {effectiveDiscount > 0 ? (
                          <> (<span className="line-through text-gray-400">${SLAVE_PRICE}</span> <span className="text-green-600">${applyDiscount(SLAVE_PRICE).toFixed(2)}</span>/month each)</>
                        ) : (
                          <> (${SLAVE_PRICE}/month each)</>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {effectiveDiscount > 0 ? (
                          <>
                            <span className="line-through text-gray-400 text-xs mr-1">${(upgradeAddOns.slave * SLAVE_PRICE).toFixed(2)}</span>
                            <span className="text-green-600">${(upgradeAddOns.slave * applyDiscount(SLAVE_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>${(upgradeAddOns.slave * SLAVE_PRICE).toFixed(2)}/month</>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Discount */}
                {effectiveDiscount > 0 && (
                  <>
                    <div className="mb-3 pt-2 border-t border-gray-200 flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="line-through text-gray-400">${calculateUpgradeOriginalTotal().toFixed(2)}/month</span>
                    </div>
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="text-gray-600">Discount ({effectiveDiscount}%):</span>
                      <span className="font-semibold text-green-600">
                        -${(calculateUpgradeOriginalTotal() - calculateUpgradeTotal()).toFixed(2)}/month
                      </span>
                    </div>
                  </>
                )}

                {/* Total */}
                <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">Total Monthly:</span>
                  <div className="text-right">
                    {effectiveDiscount > 0 && (
                      <div className="text-xs text-gray-400 line-through mb-1">
                        ${calculateUpgradeOriginalTotal().toFixed(2)}/month
                      </div>
                    )}
                    <span className="text-2xl font-bold text-primary-600">
                      ${calculateUpgradeTotal().toFixed(2)}/month
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCloseUpgradeConfig}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnifiedCheckout}
                  disabled={createCheckoutMutation.isLoading}
                  className="flex-1 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createCheckoutMutation.isLoading ? 'Processing...' : 'Proceed to Checkout'}
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Your subscription and add-ons will be activated after payment confirmation
              </p>
              <p className="text-xs text-blue-600 text-center font-medium mt-1">
                *Final payment will be processed in AED
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Configuration Modal */}
      {showRenewalConfig && hybridSubscription && hybridSubscription.subscriptionTier !== 'BASIC' && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleCloseRenewalConfig}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-900">
                Renew Your Subscription
              </h2>
              <button
                onClick={handleCloseRenewalConfig}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Current Subscription Info */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {hybridSubscription.subscriptionTier === 'EA_LICENSE' ? 'EA License' : 'Full Access'}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Current renewal date: {hybridSubscription.renewalDate ? new Date(hybridSubscription.renewalDate).toLocaleDateString() : 'N/A'}
                    </p>
                    <p className="text-xs text-blue-700 mt-2 font-medium">
                      ✓ Subscription will be extended from current expiry date
                    </p>
                  </div>
                  <div className="text-right">
                    {effectiveDiscount > 0 ? (
                      <>
                        <div className="text-sm text-gray-400 line-through">
                          ${getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')}/month
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                          ${applyDiscount(getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')).toFixed(2)}/month
                        </div>
                      </>
                    ) : (
                      <div className="text-2xl font-bold text-gray-900">
                        ${getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')}/month
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Discount Badge */}
              {effectiveDiscount > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-semibold text-green-800">
                    🎉 You have {effectiveDiscount}% discount applied!
                  </p>
                </div>
              )}

              {/* Add-ons Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Update Additional Accounts (Optional)
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Adjust your add-on quantities. Changes will be applied after payment.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Master Add-ons */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Additional Masters</p>
                        <p className="text-xs text-gray-500 mt-1">Current: {hybridSubscription.additionalMasters || 0}</p>
                        {effectiveDiscount > 0 ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400 line-through">${MASTER_PRICE}/month</span>
                            <span className="text-sm font-semibold text-green-600">${applyDiscount(MASTER_PRICE).toFixed(2)}/month</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 mt-1">${MASTER_PRICE}/month each</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRenewalAddOns({ ...renewalAddOns, master: Math.max(0, renewalAddOns.master - 1) })}
                        disabled={renewalAddOns.master === 0}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={renewalAddOns.master}
                        onChange={(e) => setRenewalAddOns({ ...renewalAddOns, master: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      />
                      <button
                        onClick={() => setRenewalAddOns({ ...renewalAddOns, master: renewalAddOns.master + 1 })}
                        className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {renewalAddOns.master !== (hybridSubscription.additionalMasters || 0) && (
                      <p className="text-xs text-gray-600 mt-2">
                        {renewalAddOns.master > (hybridSubscription.additionalMasters || 0) ? (
                          <>Adding {renewalAddOns.master - (hybridSubscription.additionalMasters || 0)} master(s)</>
                        ) : (
                          <>Removing {(hybridSubscription.additionalMasters || 0) - renewalAddOns.master} master(s)</>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Slave Add-ons */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Additional Slaves</p>
                        <p className="text-xs text-gray-500 mt-1">Current: {hybridSubscription.additionalSlaves || 0}</p>
                        {effectiveDiscount > 0 ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400 line-through">${SLAVE_PRICE}/month</span>
                            <span className="text-sm font-semibold text-green-600">${applyDiscount(SLAVE_PRICE).toFixed(2)}/month</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 mt-1">${SLAVE_PRICE}/month each</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setRenewalAddOns({ ...renewalAddOns, slave: Math.max(0, renewalAddOns.slave - 1) })}
                        disabled={renewalAddOns.slave === 0}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={renewalAddOns.slave}
                        onChange={(e) => setRenewalAddOns({ ...renewalAddOns, slave: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                      />
                      <button
                        onClick={() => setRenewalAddOns({ ...renewalAddOns, slave: renewalAddOns.slave + 1 })}
                        className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {renewalAddOns.slave !== (hybridSubscription.additionalSlaves || 0) && (
                      <p className="text-xs text-gray-600 mt-2">
                        {renewalAddOns.slave > (hybridSubscription.additionalSlaves || 0) ? (
                          <>Adding {renewalAddOns.slave - (hybridSubscription.additionalSlaves || 0)} slave(s)</>
                        ) : (
                          <>Removing {(hybridSubscription.additionalSlaves || 0) - renewalAddOns.slave} slave(s)</>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="p-6 bg-white rounded-xl border-2 border-gray-300 shadow-lg">
                <h4 className="text-xl font-bold text-gray-900 mb-5 flex items-center">
                  <div className="w-1 h-6 bg-primary-600 rounded-full mr-3"></div>
                  Renewal Summary
                </h4>
                
                <div className="space-y-2 mb-4">
                  {/* Tier */}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {hybridSubscription.subscriptionTier === 'EA_LICENSE' ? 'EA License' : 'Full Access'} Renewal
                      {effectiveDiscount > 0 ? (
                        <> (<span className="line-through text-gray-400">${getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')}</span> <span className="text-green-600">${applyDiscount(getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')).toFixed(2)}</span>/month)</>
                      ) : (
                        <> (${getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')}/month)</>
                      )}
                    </span>
                    <span className="font-medium text-gray-900">
                      {effectiveDiscount > 0 ? (
                        <>
                          <span className="line-through text-gray-400 text-xs mr-1">${getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS').toFixed(2)}</span>
                          <span className="text-green-600">${applyDiscount(getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS')).toFixed(2)}</span>/month
                        </>
                      ) : (
                        <>${getTierPrice(hybridSubscription.subscriptionTier as 'EA_LICENSE' | 'FULL_ACCESS').toFixed(2)}/month</>
                      )}
                    </span>
                  </div>

                  {/* Add-ons */}
                  {renewalAddOns.master > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {renewalAddOns.master} × Additional Master{renewalAddOns.master > 1 ? 's' : ''}
                        {effectiveDiscount > 0 ? (
                          <> (<span className="line-through text-gray-400">${MASTER_PRICE}</span> <span className="text-green-600">${applyDiscount(MASTER_PRICE).toFixed(2)}</span>/month each)</>
                        ) : (
                          <> (${MASTER_PRICE}/month each)</>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {effectiveDiscount > 0 ? (
                          <>
                            <span className="line-through text-gray-400 text-xs mr-1">${(renewalAddOns.master * MASTER_PRICE).toFixed(2)}</span>
                            <span className="text-green-600">${(renewalAddOns.master * applyDiscount(MASTER_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>${(renewalAddOns.master * MASTER_PRICE).toFixed(2)}/month</>
                        )}
                      </span>
                    </div>
                  )}

                  {renewalAddOns.slave > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {renewalAddOns.slave} × Additional Slave{renewalAddOns.slave > 1 ? 's' : ''}
                        {effectiveDiscount > 0 ? (
                          <> (<span className="line-through text-gray-400">${SLAVE_PRICE}</span> <span className="text-green-600">${applyDiscount(SLAVE_PRICE).toFixed(2)}</span>/month each)</>
                        ) : (
                          <> (${SLAVE_PRICE}/month each)</>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {effectiveDiscount > 0 ? (
                          <>
                            <span className="line-through text-gray-400 text-xs mr-1">${(renewalAddOns.slave * SLAVE_PRICE).toFixed(2)}</span>
                            <span className="text-green-600">${(renewalAddOns.slave * applyDiscount(SLAVE_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>${(renewalAddOns.slave * SLAVE_PRICE).toFixed(2)}/month</>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Discount */}
                {effectiveDiscount > 0 && (
                  <>
                    <div className="mb-3 pt-2 border-t border-gray-200 flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="line-through text-gray-400">${calculateRenewalOriginalTotal().toFixed(2)}/month</span>
                    </div>
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="text-gray-600">Discount ({effectiveDiscount}%):</span>
                      <span className="font-semibold text-green-600">
                        -${(calculateRenewalOriginalTotal() - calculateRenewalTotal()).toFixed(2)}/month
                      </span>
                    </div>
                  </>
                )}

                {/* Total */}
                <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">Total Monthly:</span>
                  <div className="text-right">
                    {effectiveDiscount > 0 && (
                      <div className="text-xs text-gray-400 line-through mb-1">
                        ${calculateRenewalOriginalTotal().toFixed(2)}/month
                      </div>
                    )}
                    <span className="text-2xl font-bold text-primary-600">
                      ${calculateRenewalTotal().toFixed(2)}/month
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleCloseRenewalConfig}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenewalCheckout}
                  disabled={createCheckoutMutation.isLoading}
                  className="flex-1 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createCheckoutMutation.isLoading ? 'Processing...' : 'Proceed to Renewal'}
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Your subscription will be extended from the current expiry date after payment confirmation
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="section-header">
        <h1 className="section-title">Subscription</h1>
        <p className="section-subtitle">Manage your subscription, upgrade plans, and add additional accounts</p>
      </div>

      {/* Hybrid Subscription Model */}
      {hybridSubscription && (
        <div className="card p-6 sm:p-8">
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
            <div className="flex items-center">
              {hybridSubscription.subscriptionTier === 'FULL_ACCESS' ? (
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
                  <Crown className="w-6 h-6 text-yellow-600" />
                </div>
              ) : hybridSubscription.subscriptionTier === 'EA_LICENSE' ? (
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <Key className="w-6 h-6 text-blue-600" />
                </div>
              ) : (
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                  <AlertCircle className="w-6 h-6 text-gray-500" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Hybrid Subscription</h2>
                <p className="text-sm text-gray-500 mt-1">Manage your subscription and add-ons</p>
            </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  toast.loading('Refreshing subscription...', { id: 'refresh-subscription' })
                  invalidateSubscription()
                  queryClient.invalidateQueries('licenseConfig')
                  queryClient.invalidateQueries('accounts')
                  setTimeout(() => {
                    toast.success('Subscription refreshed!', { id: 'refresh-subscription' })
                  }, 1000)
                }}
                disabled={hybridLoading}
                className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh subscription data"
              >
                <RefreshCw className={`w-5 h-5 ${hybridLoading ? 'animate-spin' : ''}`} />
              </button>
            {hybridSubscription.isExpired && (
                <span className="px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold border border-orange-200">
                Expired (Grace Period)
              </span>
            )}
            {!hybridSubscription.isExpired && hybridSubscription.subscriptionTier === 'BASIC' && hybridSubscription.baseTier && (
                <span className="px-4 py-2 bg-red-100 text-red-700 rounded-full text-sm font-semibold border border-red-200">
                Expired (Moved to Basic)
              </span>
            )}
            {!hybridSubscription.isExpired && hybridSubscription.subscriptionTier === 'BASIC' && !hybridSubscription.baseTier && (
                <span className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold border border-gray-200">
                Basic Tier
              </span>
            )}
              {!hybridSubscription.isExpired && hybridSubscription.subscriptionTier !== 'BASIC' && (
                <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-semibold border border-green-200">
                  Active
              </span>
            )}
            </div>
          </div>

          {/* Subscription Tier */}
          <div className="mb-6 p-6 bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl border border-gray-200">
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center">
              <div className="w-1 h-5 bg-primary-600 rounded-full mr-2"></div>
              Subscription Tier
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Tier</p>
                <p className="text-xl font-bold text-gray-900">
                  {hybridSubscription.subscriptionTier === 'FULL_ACCESS' ? 'Full Access' : 
                   hybridSubscription.subscriptionTier === 'EA_LICENSE' ? 'EA License' : 'Basic'}
                </p>
                {/* Show previous subscription if expired and moved to Basic */}
                {hybridSubscription.subscriptionTier === 'BASIC' && hybridSubscription.baseTier && (
                  <p className="text-xs text-gray-500 mt-2 italic">
                    Previously: {hybridSubscription.baseTier === 'FULL_ACCESS' ? 'Full Access' : 'EA License'}
                  </p>
                )}
              </div>
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Base Masters</p>
                <p className="text-xl font-bold text-gray-900">
                  {hybridSubscription.limits.totalMasters - (hybridSubscription.additionalMasters || 0)}
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Base Slaves</p>
                <p className="text-xl font-bold text-gray-900">
                  {hybridSubscription.limits.totalSlaves - (hybridSubscription.additionalSlaves || 0)}
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status</p>
                <p className={`text-xl font-bold ${
                  hybridSubscription.isExpired || (hybridSubscription.subscriptionTier === 'BASIC' && hybridSubscription.baseTier) ? 'text-red-600' :
                  hybridSubscription.subscriptionTier === 'BASIC' && !hybridSubscription.baseTier ? 'text-gray-600' : 
                  'text-green-600'
                }`}>
                  {hybridSubscription.isExpired || (hybridSubscription.subscriptionTier === 'BASIC' && hybridSubscription.baseTier) ? 
                     'Disabled' : 
                   hybridSubscription.subscriptionTier === 'BASIC' && !hybridSubscription.baseTier ? 'Disabled' : 
                   'Active'}
                </p>
              </div>
            </div>
          </div>

          {/* Current Add-ons (Existing) */}
          {(hybridSubscription.additionalMasters > 0 || hybridSubscription.additionalSlaves > 0) && (
            <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
              <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center">
                <div className="w-1 h-5 bg-blue-600 rounded-full mr-2"></div>
                Current Add-ons
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {hybridSubscription.additionalMasters > 0 && (
                  <div className="p-4 bg-white rounded-lg border-2 border-blue-200 shadow-sm">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Additional Masters</p>
                      <p className="text-lg font-medium text-gray-900">
                        {hybridSubscription.additionalMasters}
                      </p>
                    </div>
                  </div>
                )}
                {hybridSubscription.additionalSlaves > 0 && (
                  <div className="p-4 bg-white rounded-lg border-2 border-blue-200 shadow-sm">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Additional Slaves</p>
                      <p className="text-lg font-medium text-gray-900">
                        {hybridSubscription.additionalSlaves}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Purchase New Add-ons */}
          <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center">
                <div className="w-1 h-5 bg-purple-600 rounded-full mr-2"></div>
                Purchase Add-ons
              </h3>
              {effectiveDiscount > 0 && (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                  {effectiveDiscount}% Discount Applied
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 mb-4">Select quantities and proceed to checkout. Add-ons will be added after payment confirmation.</p>
            {effectiveDiscount > 0 && (
              <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                <strong>Active Discounts:</strong>
                {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage && (
                  <> Client Discount: {hybridSubscription.clientDiscountPercentage}%</>
                )}
                {hybridSubscription?.globalOffersEnabled && hybridSubscription?.specialDiscountPercentage && hybridSubscription?.specialDiscountPercentage > 0 && (
                  <>
                    {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage ? ' + ' : ''}
                    {hybridSubscription?.specialDiscountDescription || 'Special Discount'}: {hybridSubscription.specialDiscountPercentage}%
                  </>
                )}
                {hybridSubscription?.globalOffersEnabled && hybridSubscription?.specialDiscountExpiryDate && (
                  <> (expires {new Date(hybridSubscription.specialDiscountExpiryDate).toLocaleDateString()})</>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="p-4 bg-white rounded-lg border-2 border-purple-200 shadow-sm hover:shadow-md transition-all hover:border-purple-300">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Additional Masters</p>
                    {effectiveDiscount > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 line-through">${MASTER_PRICE}/month</span>
                        <span className="text-xs font-semibold text-green-600">${applyDiscount(MASTER_PRICE).toFixed(2)}/month</span>
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{effectiveDiscount}% off</span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">${MASTER_PRICE}/month each</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCheckoutCart({ ...checkoutCart, master: Math.max(0, checkoutCart.master - 1) })}
                    disabled={checkoutCart.master === 0}
                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Decrease"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={checkoutCart.master}
                    onChange={(e) => setCheckoutCart({ ...checkoutCart, master: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                  />
                  <button
                    onClick={() => setCheckoutCart({ ...checkoutCart, master: checkoutCart.master + 1 })}
                    className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                    title="Increase"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {checkoutCart.master > 0 && (
                  <p className="text-xs text-gray-600 mt-2">
                    {effectiveDiscount > 0 ? (
                      <>
                        Subtotal: <span className="line-through text-gray-400">${(checkoutCart.master * MASTER_PRICE).toFixed(2)}</span>{' '}
                        <span className="font-semibold text-green-600">${(checkoutCart.master * applyDiscount(MASTER_PRICE)).toFixed(2)}</span>/month
                      </>
                    ) : (
                      <>Subtotal: ${(checkoutCart.master * MASTER_PRICE).toFixed(2)}/month</>
                    )}
                  </p>
                )}
              </div>
              <div className="p-4 bg-white rounded-lg border-2 border-purple-200 shadow-sm hover:shadow-md transition-all hover:border-purple-300">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-1">Additional Slaves</p>
                    {effectiveDiscount > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 line-through">${SLAVE_PRICE}/month</span>
                        <span className="text-xs font-semibold text-green-600">${applyDiscount(SLAVE_PRICE).toFixed(2)}/month</span>
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{effectiveDiscount}% off</span>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">${SLAVE_PRICE}/month each</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCheckoutCart({ ...checkoutCart, slave: Math.max(0, checkoutCart.slave - 1) })}
                    disabled={checkoutCart.slave === 0}
                    className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Decrease"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={checkoutCart.slave}
                    onChange={(e) => setCheckoutCart({ ...checkoutCart, slave: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm text-center"
                  />
                  <button
                    onClick={() => setCheckoutCart({ ...checkoutCart, slave: checkoutCart.slave + 1 })}
                    className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                    title="Increase"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {checkoutCart.slave > 0 && (
                  <p className="text-xs text-gray-600 mt-2">
                    {effectiveDiscount > 0 ? (
                      <>
                        Subtotal: <span className="line-through text-gray-400">${(checkoutCart.slave * SLAVE_PRICE).toFixed(2)}</span>{' '}
                        <span className="font-semibold text-green-600">${(checkoutCart.slave * applyDiscount(SLAVE_PRICE)).toFixed(2)}</span>/month
                      </>
                    ) : (
                      <>Subtotal: ${(checkoutCart.slave * SLAVE_PRICE).toFixed(2)}/month</>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Checkout Summary */}
            {(checkoutCart.master > 0 || checkoutCart.slave > 0) && (
              <div className="mt-4 p-5 bg-white rounded-xl border-2 border-purple-300 shadow-lg">
                <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center">
                  <div className="w-1 h-5 bg-purple-600 rounded-full mr-2"></div>
                  Order Summary
                </h4>
                
                {/* Discount Badge */}
                {effectiveDiscount > 0 && (
                  <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-green-700">
                          {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage ? (
                            <>Client Discount: {hybridSubscription.clientDiscountPercentage}%</>
                          ) : null}
                          {hybridSubscription?.globalOffersEnabled && hybridSubscription?.specialDiscountPercentage && hybridSubscription?.specialDiscountPercentage > 0 && (
                            <>
                              {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage ? ' + ' : ''}
                              {hybridSubscription?.specialDiscountDescription || 'Special Discount'}: {hybridSubscription.specialDiscountPercentage}%
                            </>
                          )}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-green-700">
                        {effectiveDiscount}% OFF
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2 mb-4">
                  {checkoutCart.master > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {checkoutCart.master} × Additional Master{checkoutCart.master > 1 ? 's' : ''} 
                        {effectiveDiscount > 0 ? (
                          <> (<span className="line-through text-gray-400">${MASTER_PRICE}</span> <span className="text-green-600">${applyDiscount(MASTER_PRICE).toFixed(2)}</span>/month each)</>
                        ) : (
                          <> (${MASTER_PRICE}/month each)</>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {effectiveDiscount > 0 ? (
                          <>
                            <span className="line-through text-gray-400 text-xs mr-1">${(checkoutCart.master * MASTER_PRICE).toFixed(2)}</span>
                            <span className="text-green-600">${(checkoutCart.master * applyDiscount(MASTER_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>${(checkoutCart.master * MASTER_PRICE).toFixed(2)}/month</>
                        )}
                      </span>
                    </div>
                  )}
                  {checkoutCart.slave > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {checkoutCart.slave} × Additional Slave{checkoutCart.slave > 1 ? 's' : ''} 
                        {effectiveDiscount > 0 ? (
                          <> (<span className="line-through text-gray-400">${SLAVE_PRICE}</span> <span className="text-green-600">${applyDiscount(SLAVE_PRICE).toFixed(2)}</span>/month each)</>
                        ) : (
                          <> (${SLAVE_PRICE}/month each)</>
                        )}
                      </span>
                      <span className="font-medium text-gray-900">
                        {effectiveDiscount > 0 ? (
                          <>
                            <span className="line-through text-gray-400 text-xs mr-1">${(checkoutCart.slave * SLAVE_PRICE).toFixed(2)}</span>
                            <span className="text-green-600">${(checkoutCart.slave * applyDiscount(SLAVE_PRICE)).toFixed(2)}</span>/month
                          </>
                        ) : (
                          <>${(checkoutCart.slave * SLAVE_PRICE).toFixed(2)}/month</>
                        )}
                      </span>
                    </div>
                  )}
                </div>
                
                {effectiveDiscount > 0 && (
                  <div className="mb-3 pt-2 border-t border-gray-200 flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="line-through text-gray-400">${calculateOriginalTotal().toFixed(2)}/month</span>
                  </div>
                )}
                
                {effectiveDiscount > 0 && (
                  <div className="mb-3 flex justify-between text-sm">
                    <span className="text-gray-600">Discount ({effectiveDiscount}%):</span>
                    <span className="font-semibold text-green-600">
                      -${(calculateOriginalTotal() - calculateTotal()).toFixed(2)}/month
                    </span>
                  </div>
                )}
                
                <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-900">Total Monthly:</span>
                  <div className="text-right">
                    {effectiveDiscount > 0 && (
                      <div className="text-xs text-gray-400 line-through mb-1">
                        ${calculateOriginalTotal().toFixed(2)}/month
                      </div>
                    )}
                    <span className="text-2xl font-bold text-primary-600">
                      ${calculateTotal().toFixed(2)}/month
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleCheckout}
                  disabled={createCheckoutMutation.isLoading}
                  className="w-full mt-4 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createCheckoutMutation.isLoading ? 'Processing...' : 'Proceed to Checkout'}
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Add-ons will be added to your subscription after payment confirmation
                </p>
                <p className="text-xs text-blue-600 mt-1 text-center font-medium">
                  *Final payment will be processed in AED
                </p>
              </div>
            )}
          </div>

          {/* Total Limits */}
          <div className="mb-6 p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center">
              <div className="w-1 h-5 bg-green-600 rounded-full mr-2"></div>
              Total Account Limits
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 bg-white rounded-lg border-2 border-green-200 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Masters Allowed</p>
                <p className="text-3xl font-bold text-green-600">
                  {hybridSubscription.limits.totalMasters}
                </p>
              </div>
              <div className="p-5 bg-white rounded-lg border-2 border-green-200 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Slaves Allowed</p>
                <p className="text-3xl font-bold text-green-600">
                  {hybridSubscription.limits.totalSlaves}
                </p>
              </div>
            </div>
          </div>

          {/* Trial Section - Show for new users without subscription, trial not disabled, and global trial enabled */}
          {hybridSubscription.trialEnabled && !hybridSubscription.baseTier && !hybridSubscription.trialClaimed && !hybridSubscription.trialDisabled && (
            <div className="mb-6 p-6 bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 border-2 border-purple-200 rounded-xl shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center mr-4 shadow-lg">
                    <Gift className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Free {TRIAL_DURATION_DAYS}-Day Trial Available</h3>
                    <p className="text-sm text-gray-700 mt-1">
                      Get {TRIAL_MASTERS} master{TRIAL_MASTERS !== 1 ? 's' : ''} and {TRIAL_SLAVES} slave{TRIAL_SLAVES !== 1 ? 's' : ''} account{TRIAL_SLAVES !== 1 ? 's' : ''} for {TRIAL_DURATION_DAYS} days. No credit card required.
                    </p>
                    <p className="text-xs text-purple-700 mt-2 font-semibold flex items-center">
                      <span className="w-4 h-4 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs mr-2">✓</span>
                      Available for new users without any paid subscription
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm(`Claim your free ${TRIAL_DURATION_DAYS}-day trial? You'll get ${TRIAL_MASTERS} master${TRIAL_MASTERS !== 1 ? 's' : ''} and ${TRIAL_SLAVES} slave${TRIAL_SLAVES !== 1 ? 's' : ''} account${TRIAL_SLAVES !== 1 ? 's' : ''}.`)) {
                      claimTrialMutation.mutate()
                    }
                  }}
                  disabled={claimTrialMutation.isLoading}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 font-semibold shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                >
                  {claimTrialMutation.isLoading ? 'Claiming...' : 'Claim Free Trial'}
                </button>
              </div>
            </div>
          )}

          {/* Trial Not Available Message - Show why trial is not available */}
          {!hybridSubscription.trialClaimed && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center">
                <Gift className="w-5 h-5 text-gray-400 mr-3" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">Free Trial Not Available</h3>
                  <p className="text-xs text-gray-600 mt-1">
                    {!hybridSubscription.trialEnabled
                      ? 'Trial system is currently disabled by admin. Please contact support for more information.'
                      : hybridSubscription.trialDisabled
                        ? 'Trial has been disabled for your account. Please contact admin to enable trial access.'
                        : hybridSubscription.baseTier 
                          ? `You have a ${hybridSubscription.baseTier === 'FULL_ACCESS' ? 'Full Access' : 'EA License'} subscription. Free trial is only available for new users without any paid subscription.`
                          : 'Free trial eligibility information is not available at this time.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Trial Status - Show if trial claimed */}
          {hybridSubscription.trialClaimed && (
            <div className={`mb-6 p-4 rounded-lg border ${
              hybridSubscription.trialExpiryDate && new Date(hybridSubscription.trialExpiryDate) > new Date()
                ? 'bg-purple-50 border-purple-200'
                : 'bg-red-50 border-red-200'
            }`}>
          <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Gift className={`w-5 h-5 mr-2 ${
                    hybridSubscription.trialExpiryDate && new Date(hybridSubscription.trialExpiryDate) > new Date()
                      ? 'text-purple-600'
                      : 'text-red-600'
                  }`} />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {hybridSubscription.trialExpiryDate && new Date(hybridSubscription.trialExpiryDate) > new Date()
                        ? 'Free Trial Active'
                        : 'Trial Expired'}
                    </h3>
                    {hybridSubscription.trialExpiryDate && (
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(hybridSubscription.trialExpiryDate) > new Date()
                          ? `Expires: ${new Date(hybridSubscription.trialExpiryDate).toLocaleDateString()}`
                          : `Expired: ${new Date(hybridSubscription.trialExpiryDate).toLocaleDateString()}`}
                      </p>
                    )}
                  </div>
                </div>
                {hybridSubscription.trialExpiryDate && new Date(hybridSubscription.trialExpiryDate) > new Date() && (
                  <div className="text-sm font-medium text-purple-600">
                    {Math.ceil((new Date(hybridSubscription.trialExpiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days left
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Renewal Date */}
          {/* Show expiry date: trial expiry if on trial, renewal date if paid subscription, or "No expiry" for BASIC */}
          {(isOnTrial && trialExpiryDate) || (hybridSubscription.renewalDate && !isOnTrial) || (tier === 'BASIC' && !isOnTrial) ? (
            <div className="p-5 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl border border-gray-200 shadow-sm">
              {/* Row 1: Expiry Date and Remaining Days (always same row) */}
              <div className="flex items-center justify-between gap-4 mb-4 lg:mb-0">
                {/* Expiry Date Info */}
                <div className="flex items-center flex-1 min-w-0">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
                    <Calendar className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {isOnTrial ? 'Trial Expiry Date' : tier === 'BASIC' ? 'Expiry Date' : 'Renewal Date'}
                    </p>
                    <p className="text-lg font-bold text-gray-900">
                      {isOnTrial && trialExpiryDate
                        ? trialExpiryDate.toLocaleDateString()
                        : tier === 'BASIC' && !isOnTrial
                        ? 'No expiry'
                        : hybridSubscription.renewalDate
                        ? new Date(hybridSubscription.renewalDate).toLocaleDateString()
                        : 'No expiry set'}
                    </p>
                  </div>
                </div>
                
                {/* Remaining Days - only show if there's an expiry date */}
                {((isOnTrial && trialExpiryDate) || (hybridSubscription.renewalDate && !isOnTrial)) && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Remaining</p>
                    <p className="text-lg font-bold text-primary-600">
                      {isOnTrial && trialExpiryDate
                        ? `${Math.ceil((trialExpiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days`
                        : hybridSubscription.renewalDate
                        ? `${Math.ceil((new Date(hybridSubscription.renewalDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days`
                        : ''}
                    </p>
                  </div>
                )}
                
                {/* Desktop: Button in same row - only for paid subscriptions */}
                {hybridSubscription.subscriptionTier !== 'BASIC' && !isOnTrial && (
                  <div className="hidden lg:block flex-shrink-0">
                    <button
                      onClick={handleRenewal}
                      className="btn btn-primary"
                    >
                      Renew Subscription
                    </button>
                  </div>
                )}
              </div>
              
              {/* Row 2: Button (mobile/tablet - separate row) - only for paid subscriptions */}
              {hybridSubscription.subscriptionTier !== 'BASIC' && !isOnTrial && (
                <div className="lg:hidden">
                  <button
                    onClick={handleRenewal}
                    className="btn btn-primary w-full"
                  >
                    Renew Subscription
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* Manage Subscription Button (if has Stripe subscription) */}
          {hybridSubscription?.stripeSubscriptionId && (
            <div className="mt-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl shadow-sm">
              <div className="flex items-start mb-4">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Manage Your Subscription</h3>
                  <p className="text-sm text-gray-600">
                    Update payment method, view invoices, manage billing, and more.
                  </p>
                </div>
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={getCustomerPortalMutation.isLoading}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
              >
                {getCustomerPortalMutation.isLoading ? 'Loading...' : 'Open Subscription Portal'}
              </button>
            </div>
          )}

          {(tier === 'EA_LICENSE' || tier === 'FULL_ACCESS') && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Link
                href="/dashboard/ea-download"
                className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Download className="w-5 h-5 mr-2" />
                Download EA License
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Legacy Subscription Tier Status (fallback if hybrid not available) */}
      {!hybridSubscription && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              {tier === 'FULL_ACCESS' ? (
                <Crown className="w-6 h-6 text-yellow-500 mr-2" />
              ) : tier === 'EA_LICENSE' ? (
                <Key className="w-6 h-6 text-blue-500 mr-2" />
              ) : (
                <AlertCircle className="w-6 h-6 text-gray-400 mr-2" />
              )}
              <h2 className="text-xl font-semibold">Subscription Tier</h2>
            </div>
            {isExpired && (
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                Expired
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 mb-1">Current Tier</p>
              <p className="text-lg font-medium text-gray-900">
                {tier === 'FULL_ACCESS' ? 'Full Access' : tier === 'EA_LICENSE' ? 'EA License' : 'Basic'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Expiry Date</p>
              <p className="text-lg font-medium text-gray-900">
                {isOnTrial && trialExpiryDate
                  ? trialExpiryDate.toLocaleDateString() + ' (Trial)'
                  : tier === 'BASIC' && !isOnTrial
                  ? 'No expiry'
                  : expiryDate 
                  ? expiryDate.toLocaleDateString()
                  : 'No expiry set'}
              </p>
            </div>
          </div>

          {(tier === 'EA_LICENSE' || tier === 'FULL_ACCESS') && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Link
                href="/dashboard/ea-download"
                className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Download className="w-5 h-5 mr-2" />
                Download EA License
              </Link>
            </div>
          )}

          {(tier === 'EA_LICENSE' || tier === 'FULL_ACCESS') && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 mb-2">
                <strong>EA License Tier:</strong> You have access to local copy trading with minimal backend usage.
              </p>
              <Link
                href="/dashboard/subscription#upgrade"
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Upgrade to Full Access for web terminal and advanced features →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tier Comparison Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 mb-8">
        <div className="mb-6 pb-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription Tiers Comparison</h2>
          <p className="text-gray-600 text-sm">Compare features and choose the right plan</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-4 px-6 font-bold text-gray-900 text-sm uppercase tracking-wide">Feature</th>
                <th className="text-center py-4 px-6 font-bold text-gray-900 text-sm uppercase tracking-wide bg-blue-50">EA License</th>
                <th className="text-center py-4 px-6 font-bold text-gray-900 text-sm uppercase tracking-wide bg-yellow-50">Full Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6 font-medium text-gray-900">Local Copy Trading</td>
                <td className="py-4 px-6 text-center bg-blue-50/50">
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                </td>
                <td className="py-4 px-6 text-center bg-yellow-50/50">
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                </td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6 font-medium text-gray-900">Web Terminal</td>
                <td className="py-4 px-6 text-center bg-blue-50/50">
                  <X className="w-5 h-5 text-gray-400 mx-auto" />
                </td>
                <td className="py-4 px-6 text-center bg-yellow-50/50">
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                </td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6 font-medium text-gray-900">Dashboard & Analytics</td>
                <td className="py-4 px-6 text-center bg-blue-50/50">
                  <X className="w-5 h-5 text-gray-400 mx-auto" />
                </td>
                <td className="py-4 px-6 text-center bg-yellow-50/50">
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                </td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6 font-medium text-gray-900">Real-time Market Data</td>
                <td className="py-4 px-6 text-center bg-blue-50/50">
                  <X className="w-5 h-5 text-gray-400 mx-auto" />
                </td>
                <td className="py-4 px-6 text-center bg-yellow-50/50">
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                </td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6 font-medium text-gray-900">Advanced Features</td>
                <td className="py-4 px-6 text-center bg-blue-50/50">
                  <X className="w-5 h-5 text-gray-400 mx-auto" />
                </td>
                <td className="py-4 px-6 text-center bg-yellow-50/50">
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                </td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="py-4 px-6 font-medium text-gray-900">Backend Usage</td>
                <td className="py-4 px-6 text-center text-sm text-gray-600 bg-blue-50/50">Minimal (1 req/day)</td>
                <td className="py-4 px-6 text-center text-sm text-gray-600 bg-yellow-50/50">Normal</td>
              </tr>
            </tbody>
          </table>
        </div>
        {tier === 'EA_LICENSE' && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Current Tier:</strong> EA License
            </p>
            <button
              onClick={() => handleUpgrade('FULL_ACCESS')}
              disabled={createCheckoutMutation.isLoading}
              className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createCheckoutMutation.isLoading ? 'Processing...' : 'Upgrade to Full Access →'}
            </button>
          </div>
        )}
        {tier === 'BASIC' && (
          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-800">
              <strong>Current Tier:</strong> Basic
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => handleUpgrade('EA_LICENSE')}
                disabled={createCheckoutMutation.isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createCheckoutMutation.isLoading ? 'Processing...' : 'Upgrade to EA License'}
              </button>
              <button
                onClick={() => handleUpgrade('FULL_ACCESS')}
                disabled={createCheckoutMutation.isLoading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createCheckoutMutation.isLoading ? 'Processing...' : 'Upgrade to Full Access'}
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Upgrade & Pricing Section */}
      {hybridSubscription && (
        <div className="card p-6 sm:p-8" id="upgrade">
          <div className="mb-6 pb-6 border-b border-gray-200">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Upgrade Your Subscription</h2>
            <p className="text-gray-600">Choose the perfect plan for your trading needs</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* EA License Plan */}
            <div className={`border-2 rounded-xl p-8 transition-all ${
              hybridSubscription.subscriptionTier === 'EA_LICENSE' 
                ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100/50 shadow-lg scale-105' 
                : 'border-gray-200 hover:border-blue-300 hover:shadow-lg'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Key className="w-6 h-6 text-blue-600 mr-2" />
                  <h3 className="text-xl font-semibold text-gray-900">EA License</h3>
                </div>
                {hybridSubscription.subscriptionTier === 'EA_LICENSE' && (
                  <span className="badge badge-primary">
                    Current Plan
                  </span>
                )}
              </div>
              
              <div className="mb-4">
                {effectiveDiscount > 0 ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl text-gray-400 line-through">$29</span>
                      <span className="text-3xl font-bold text-green-600">${applyDiscount(EA_LICENSE_PRICE).toFixed(2)}</span>
                      <span className="text-lg text-gray-600">/month</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                        {effectiveDiscount}% OFF
                  </span>
                </div>
                    <p className="text-sm text-gray-600 mt-1">
                      or ${(applyDiscount(EA_LICENSE_PRICE) * 12).toFixed(2)}/year 
                      {effectiveDiscount > 0 && (
                        <span className="text-green-600"> (save ${(299 - applyDiscount(EA_LICENSE_PRICE) * 12).toFixed(2)})</span>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-gray-900">$29<span className="text-lg text-gray-600">/month</span></p>
                    <p className="text-sm text-gray-600 mt-1">or $299/year (save 14%)</p>
                  </>
                )}
              </div>

              <ul className="space-y-2 mb-6">
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  1 Master Account
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  2 Slave Accounts
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  Local Copy Trading
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  Minimal Backend Usage
                </li>
              </ul>
              
              {hybridSubscription.subscriptionTier === 'BASIC' ? (
                <button
                  onClick={() => handleUpgrade('EA_LICENSE')}
                  disabled={createCheckoutMutation.isLoading}
                  className="btn btn-primary w-full"
                >
                  {createCheckoutMutation.isLoading ? 'Processing...' : 'Upgrade to EA License'}
                </button>
              ) : hybridSubscription.subscriptionTier === 'EA_LICENSE' ? (
                <button
                  disabled
                  className="btn btn-secondary w-full"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade('EA_LICENSE')}
                  disabled={createCheckoutMutation.isLoading}
                  className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createCheckoutMutation.isLoading ? 'Processing...' : 'Downgrade to EA License'}
                </button>
              )}
            </div>

            {/* Full Access Plan */}
            <div className={`border-2 rounded-xl p-8 transition-all relative ${
              hybridSubscription.subscriptionTier === 'FULL_ACCESS' 
                ? 'border-yellow-500 bg-gradient-to-br from-yellow-50 to-amber-100/50 shadow-lg scale-105' 
                : 'border-gray-200 hover:border-yellow-300 hover:shadow-lg'
            }`}>
              {hybridSubscription.subscriptionTier !== 'FULL_ACCESS' && (
                <div className="absolute -top-3 right-6 bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                  POPULAR
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Crown className="w-6 h-6 text-yellow-600 mr-2" />
                  <h3 className="text-xl font-semibold text-gray-900">Full Access</h3>
                </div>
                {hybridSubscription.subscriptionTier === 'FULL_ACCESS' && (
                  <span className="badge badge-warning">
                    Current Plan
                  </span>
                )}
              </div>
              
              <div className="mb-4">
                {effectiveDiscount > 0 ? (
                  <>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl text-gray-400 line-through">$99</span>
                      <span className="text-3xl font-bold text-green-600">${applyDiscount(FULL_ACCESS_PRICE).toFixed(2)}</span>
                      <span className="text-lg text-gray-600">/month</span>
                      <span className="badge badge-success">
                        {effectiveDiscount}% OFF
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      or ${(applyDiscount(FULL_ACCESS_PRICE) * 12).toFixed(2)}/year 
                      {effectiveDiscount > 0 && (
                        <span className="text-green-600"> (save ${(999 - applyDiscount(FULL_ACCESS_PRICE) * 12).toFixed(2)})</span>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-gray-900">$99<span className="text-lg text-gray-600">/month</span></p>
                    <p className="text-sm text-gray-600 mt-1">or $999/year (save 16%)</p>
                  </>
                )}
                </div>
              
              <ul className="space-y-2 mb-6">
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  3 Master Accounts
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  10 Slave Accounts
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  Web Terminal
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  Dashboard & Analytics
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  Real-time Market Data
                </li>
                <li className="flex items-center text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 mr-2" />
                  All Advanced Features
                </li>
              </ul>
              
              {hybridSubscription.subscriptionTier === 'FULL_ACCESS' ? (
                <button
                  disabled
                  className="btn btn-secondary w-full"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade('FULL_ACCESS')}
                  disabled={createCheckoutMutation.isLoading}
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {createCheckoutMutation.isLoading ? 'Processing...' : 'Upgrade to Full Access'}
                </button>
              )}
            </div>
          </div>

          {/* Add-ons Pricing */}
          <div className="mt-8 pt-8 border-t-2 border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Add-ons</h3>
            <p className="text-gray-600 text-sm mb-6">Extend your subscription with additional accounts</p>
            {effectiveDiscount > 0 && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-semibold text-green-800">
                  🎉 You have {effectiveDiscount}% discount applied to all add-ons!
                  {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage && (
                    <> (Client: {hybridSubscription.clientDiscountPercentage}%</>
                  )}
                  {hybridSubscription?.globalOffersEnabled && hybridSubscription?.specialDiscountPercentage && hybridSubscription?.specialDiscountPercentage > 0 && (
                    <>
                      {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage ? ' + ' : ''}
                      {hybridSubscription?.specialDiscountDescription || 'Special'}: {hybridSubscription.specialDiscountPercentage}%
                    </>
                  )}
                  {hybridSubscription?.clientDiscountEnabled && hybridSubscription?.isClient && hybridSubscription?.clientDiscountPercentage && <>)</>}
                </p>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border-2 border-gray-200 hover:border-gray-300 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-gray-900">Additional Master Account</span>
                  <div className="text-right">
                    {effectiveDiscount > 0 ? (
                      <>
                        <span className="text-sm text-gray-400 line-through mr-2">${MASTER_PRICE}</span>
                        <span className="text-lg font-bold text-green-600">${applyDiscount(MASTER_PRICE).toFixed(2)}</span>
                        <span className="text-sm text-gray-600">/month</span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-gray-900">${MASTER_PRICE}/month</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600">Add more master accounts to your subscription</p>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-5 border-2 border-gray-200 hover:border-gray-300 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold text-gray-900">Additional Slave Account</span>
                  <div className="text-right">
                    {effectiveDiscount > 0 ? (
                      <>
                        <span className="text-sm text-gray-400 line-through mr-2">${SLAVE_PRICE}</span>
                        <span className="text-lg font-bold text-green-600">${applyDiscount(SLAVE_PRICE).toFixed(2)}</span>
                        <span className="text-sm text-gray-600">/month</span>
                      </>
                    ) : (
                      <span className="text-lg font-bold text-gray-900">${SLAVE_PRICE}/month</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600">Add more slave accounts to your subscription</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Base Tier Selection Info (if no hybrid subscription) */}
      {!hybridSubscription && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div className="flex items-start">
            <Key className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                Subscription Setup Required
              </h3>
              <p className="text-sm text-blue-700 mb-2">
                Please contact an administrator to set up your base tier subscription. Once configured, you can add additional master or slave accounts as needed.
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-blue-800">Base Tier Options:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-xs font-medium text-gray-900 mb-1">EA License</p>
                    <p className="text-xs text-gray-600">1 Master + 2 Slaves</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-xs font-medium text-gray-900 mb-1">Full Access</p>
                    <p className="text-xs text-gray-600">3 Masters + 10 Slaves</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>
      )}
    </div>
  )
}

