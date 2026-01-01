'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { configAPI } from '@/lib/api'
import { authService } from '@/lib/auth'
import { toast } from 'react-hot-toast'
import { 
  Settings, Save, RefreshCw, AlertCircle, CheckCircle, 
  DollarSign, Gift, Clock, Users, Key, Crown, TrendingUp,
  ToggleLeft, ToggleRight, Calendar, Percent
} from 'lucide-react'
import { useWebSocket } from '@/lib/hooks/useWebSocket'

export default function AdminConfigPage() {
  const user = authService.getCurrentUser()
  const queryClient = useQueryClient()
  
  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <AlertCircle className="w-6 h-6 text-red-600 mr-2" />
          <h2 className="text-xl font-semibold text-red-900">Access Denied</h2>
        </div>
        <p className="text-red-700 mt-2">You must be an admin to access this page.</p>
      </div>
    )
  }

  // Maintain WebSocket listeners
  useWebSocket({})

  // Fetch config
  const { data: config, isLoading, error } = useQuery(
    'globalConfig',
    () => configAPI.getConfig().then(res => res.data.data),
    {
      retry: 2,
    }
  )

  // Update section mutation
  const updateSectionMutation = useMutation(
    ({ section, data }: { section: string; data: any }) => 
      configAPI.updateConfigSection(section, data),
    {
      onSuccess: (response) => {
        // Invalidate and refetch to get latest data
        queryClient.invalidateQueries('globalConfig')
        queryClient.invalidateQueries('addOnPricing') // Also invalidate add-on pricing for subscription page
        // Update the cache with the full config returned from backend
        if (response?.data?.data) {
          queryClient.setQueryData('globalConfig', response.data.data)
        }
        toast.success('Configuration updated successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to update configuration')
      },
    }
  )

  // Apply global offer mutation
  const applyOfferMutation = useMutation(
    (userIds?: string[]) => configAPI.applyGlobalOffer(userIds),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('globalConfig')
        toast.success('Global offer applied successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to apply global offer')
      },
    }
  )

  // Update trial mutation
  const updateTrialMutation = useMutation(
    ({ enabled, userIds }: { enabled: boolean; userIds?: string[] }) => 
      configAPI.updateTrialForUsers(enabled, userIds),
    {
      onSuccess: (response, variables) => {
        queryClient.invalidateQueries('globalConfig')
        const action = variables.enabled ? 'allowed' : 'blocked'
        toast.success(`Trial ${action} for all users successfully!`)
      },
      onError: (error: any) => {
        const errorMsg = error.response?.data?.message || 'Failed to update trial'
        toast.error(errorMsg)
      },
    }
  )

  const [activeSection, setActiveSection] = useState<string>('subscriptionPricing')

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Global Configuration</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (error || !config) {
    return (
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Global Configuration</h1>
        </div>
        <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg">
          Error loading configuration. Please try refreshing the page.
        </div>
      </div>
    )
  }

  const handleUpdateSection = (section: string, data: any) => {
    updateSectionMutation.mutate({ section, data })
  }

  const sections = [
    { id: 'subscriptionPricing', name: 'Subscription Pricing', icon: DollarSign },
    { id: 'trial', name: 'Trial System', icon: Gift },
    { id: 'gracePeriod', name: 'Grace Period', icon: Clock },
    { id: 'baseTierLimits', name: 'Base Tier Limits', icon: Key },
    { id: 'defaultRenewalPeriod', name: 'Default Renewal Period', icon: Calendar },
    { id: 'clientDiscount', name: 'Client Discount', icon: Percent },
    { id: 'globalOffers', name: 'Global Offers', icon: TrendingUp },
    { id: 'addOnPricing', name: 'Add-On Pricing', icon: Crown },
    { id: 'eaDefaults', name: 'EA Defaults', icon: Users },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center">
            <Settings className="w-8 h-8 mr-3 text-primary-600" />
            <h1 className="section-title">Global Configuration</h1>
          </div>
          <div className="text-sm text-gray-500">
            Last updated: {config.lastUpdated ? new Date(config.lastUpdated).toLocaleString() : 'Never'}
            {config.version && ` (v${config.version})`}
          </div>
        </div>
        <p className="section-subtitle">Manage global system settings and pricing</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sections</h2>
            <nav className="space-y-2">
              {sections.map((section) => {
                const Icon = section.icon
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeSection === section.id
                        ? 'bg-primary-100 text-primary-900'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {section.name}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
            {/* Subscription Pricing */}
            {activeSection === 'subscriptionPricing' && (
              <SubscriptionPricingSection
                config={config.subscriptionPricing}
                onUpdate={(data: any) => handleUpdateSection('subscriptionPricing', data)}
                isLoading={updateSectionMutation.isLoading}
              />
            )}

            {/* Trial System */}
            {activeSection === 'trial' && (
              <TrialSystemSection
                config={config.trial}
                onUpdate={(data: any) => handleUpdateSection('trial', data)}
                onBulkUpdate={(enabled: boolean, userIds: string[]) => updateTrialMutation.mutate({ enabled, userIds })}
                isLoading={updateSectionMutation.isLoading || updateTrialMutation.isLoading}
              />
            )}

            {/* Grace Period */}
            {activeSection === 'gracePeriod' && (
              <GracePeriodSection
                config={config.gracePeriod}
                onUpdate={(data: any) => handleUpdateSection('gracePeriod', data)}
                isLoading={updateSectionMutation.isLoading}
              />
            )}

            {/* Base Tier Limits */}
            {activeSection === 'baseTierLimits' && (
              <BaseTierLimitsSection
                config={config.baseTierLimits}
                onUpdate={(data: any) => handleUpdateSection('baseTierLimits', data)}
                isLoading={updateSectionMutation.isLoading}
              />
            )}

            {/* Default Renewal Period */}
            {activeSection === 'defaultRenewalPeriod' && (
              <DefaultRenewalPeriodSection
                config={config.defaultRenewalPeriod}
                onUpdate={(data: any) => handleUpdateSection('defaultRenewalPeriod', data)}
                isLoading={updateSectionMutation.isLoading}
              />
            )}

            {/* Client Discount */}
            {activeSection === 'clientDiscount' && (
              <ClientDiscountSection
                config={config.clientDiscount}
                onUpdate={(data: any) => handleUpdateSection('clientDiscount', data)}
                isLoading={updateSectionMutation.isLoading}
              />
            )}

            {/* Global Offers */}
            {activeSection === 'globalOffers' && (
              <GlobalOffersSection
                config={config.globalOffers}
                onUpdate={(data: any) => handleUpdateSection('globalOffers', data)}
                onApplyOffer={(userIds) => applyOfferMutation.mutate(userIds)}
                isLoading={updateSectionMutation.isLoading || applyOfferMutation.isLoading}
              />
            )}

            {/* Add-On Pricing */}
            {activeSection === 'addOnPricing' && (
              <AddOnPricingSection
                config={config.addOnPricing}
                onUpdate={(data: any) => handleUpdateSection('addOnPricing', data)}
                isLoading={updateSectionMutation.isLoading}
              />
            )}

            {/* EA Defaults */}
            {activeSection === 'eaDefaults' && (
              <EADefaultsSection
                config={config.eaDefaults}
                onUpdate={(data: any) => handleUpdateSection('eaDefaults', data)}
                isLoading={updateSectionMutation.isLoading}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Section Components
function SubscriptionPricingSection({ config, onUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    // Deep clone to avoid reference issues
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleChange = (tier: string, field: string, value: any) => {
    setLocal((prev: any) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value,
      },
    }))
  }

  const handleFeatureChange = (tier: string, feature: string, value: boolean) => {
    setLocal((prev: any) => ({
      ...prev,
      features: {
        ...prev.features,
        [tier]: {
          ...prev.features[tier],
          [feature]: value,
        },
      },
    }))
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <DollarSign className="w-6 h-6 mr-2" />
          Subscription Pricing
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="space-y-6">
        {/* Basic Plan */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Plan</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={local.basic.monthly}
                onChange={(e) => handleChange('basic', 'monthly', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Yearly Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={local.basic.yearly}
                onChange={(e) => handleChange('basic', 'yearly', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Accounts</label>
              <input
                type="number"
                value={local.basic.maxAccounts}
                onChange={(e) => handleChange('basic', 'maxAccounts', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(local.features.basic).map(([feature, enabled]: [string, any]) => (
              <label key={feature} className="flex items-center">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => handleFeatureChange('basic', feature, e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 capitalize">{feature}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Pro Plan */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Pro Plan</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={local.pro.monthly}
                onChange={(e) => handleChange('pro', 'monthly', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Yearly Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={local.pro.yearly}
                onChange={(e) => handleChange('pro', 'yearly', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Accounts</label>
              <input
                type="number"
                value={local.pro.maxAccounts}
                onChange={(e) => handleChange('pro', 'maxAccounts', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(local.features.pro).map(([feature, enabled]: [string, any]) => (
              <label key={feature} className="flex items-center">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => handleFeatureChange('pro', feature, e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 capitalize">{feature}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Enterprise Plan */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Enterprise Plan</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={local.enterprise.monthly}
                onChange={(e) => handleChange('enterprise', 'monthly', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Yearly Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={local.enterprise.yearly}
                onChange={(e) => handleChange('enterprise', 'yearly', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Accounts</label>
              <input
                type="number"
                value={local.enterprise.maxAccounts}
                onChange={(e) => handleChange('enterprise', 'maxAccounts', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(local.features.enterprise).map(([feature, enabled]: [string, any]) => (
              <label key={feature} className="flex items-center">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => handleFeatureChange('enterprise', feature, e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 capitalize">{feature}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TrialSystemSection({ config, onUpdate, onBulkUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleChange = (field: string, value: any) => {
    setLocal((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  const handleBulkToggle = (enabled: boolean) => {
    const action = enabled ? 'allow' : 'block'
    const message = enabled 
      ? 'This will allow ALL users to claim trials (if global trial is enabled). Continue?'
      : 'This will block ALL users from claiming trials. Continue?'
    
    if (window.confirm(message)) {
      onBulkUpdate(enabled, undefined)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Gift className="w-6 h-6 mr-2" />
          Trial System
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-1">Global Trial System</label>
              <p className="text-xs text-blue-700">Master switch: When OFF, no users can claim trials regardless of individual settings</p>
            </div>
            <button
              onClick={() => handleChange('enabled', !local.enabled)}
              className={`flex items-center ${local.enabled ? 'bg-green-500' : 'bg-gray-300'} rounded-full p-1 transition-colors`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${local.enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Days)</label>
            <input
              type="number"
              value={local.durationDays}
              onChange={(e) => handleChange('durationDays', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Master Accounts</label>
            <input
              type="number"
              value={local.masters}
              onChange={(e) => handleChange('masters', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slave Accounts</label>
            <input
              type="number"
              value={local.slaves}
              onChange={(e) => handleChange('slaves', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Individual User Trial Access</h3>
          <p className="text-sm text-gray-600 mb-4">
            These buttons update individual user records. Even if Global Trial System is enabled above, 
            users with trial disabled individually cannot claim trials.
          </p>
          <div className="flex space-x-2">
            <button
              onClick={() => handleBulkToggle(true)}
              disabled={isLoading || !local.enabled}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[180px]"
              title={!local.enabled ? 'Enable Global Trial System first' : ''}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Allow Trial for All Users'
              )}
            </button>
            <button
              onClick={() => handleBulkToggle(false)}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[180px]"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Block Trial for All Users'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GracePeriodSection({ config, onUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Clock className="w-6 h-6 mr-2" />
          Grace Period
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-1">Grace Period Days</label>
        <p className="text-xs text-gray-500 mb-2">Number of days after subscription expiry before moving to BASIC tier</p>
        <input
          type="number"
          value={local.days}
          onChange={(e) => setLocal((prev: any) => ({ ...prev, days: parseInt(e.target.value) || 0 }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>
    </div>
  )
}

function BaseTierLimitsSection({ config, onUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleChange = (tier: string, field: string, value: number) => {
    setLocal((prev: any) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value,
      },
    }))
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Key className="w-6 h-6 mr-2" />
          Base Tier Limits
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="space-y-4">
        {['BASIC', 'EA_LICENSE', 'FULL_ACCESS'].map((tier) => (
          <div key={tier} className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{tier}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Master Accounts</label>
                <input
                  type="number"
                  value={local[tier].masters}
                  onChange={(e) => handleChange(tier, 'masters', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slave Accounts</label>
                <input
                  type="number"
                  value={local[tier].slaves}
                  onChange={(e) => handleChange(tier, 'slaves', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DefaultRenewalPeriodSection({ config, onUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Calendar className="w-6 h-6 mr-2" />
          Default Renewal Period
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-1">Default Renewal Period (Days)</label>
        <p className="text-xs text-gray-500 mb-2">Default number of days for subscription renewal</p>
        <input
          type="number"
          value={local.days}
          onChange={(e) => setLocal((prev: any) => ({ ...prev, days: parseInt(e.target.value) || 0 }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
      </div>
    </div>
  )
}

function ClientDiscountSection({ config, onUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Percent className="w-6 h-6 mr-2" />
          Client Discount
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enable Client Discount</label>
            <p className="text-xs text-gray-500">Allow client discount system</p>
          </div>
          <button
            onClick={() => setLocal((prev: any) => ({ ...prev, enabled: !prev.enabled }))}
            className={`flex items-center ${local.enabled ? 'bg-green-500' : 'bg-gray-300'} rounded-full p-1 transition-colors`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${local.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Discount Percentage</label>
          <p className="text-xs text-gray-500 mb-2">Default discount percentage applied to new clients</p>
          <input
            type="number"
            min="0"
            max="100"
            value={local.defaultPercentage}
            onChange={(e) => setLocal((prev: any) => ({ ...prev, defaultPercentage: parseFloat(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>
    </div>
  )
}

function GlobalOffersSection({ config, onUpdate, onApplyOffer, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  const handleApplyOffer = () => {
    if (confirm('Apply this global offer to all eligible users?')) {
      onApplyOffer(undefined)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <TrendingUp className="w-6 h-6 mr-2" />
          Global Offers
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enable Global Offers</label>
            <p className="text-xs text-gray-500">Enable global promotional offers</p>
          </div>
          <button
            onClick={() => setLocal((prev: any) => ({ ...prev, enabled: !prev.enabled }))}
            className={`flex items-center ${local.enabled ? 'bg-green-500' : 'bg-gray-300'} rounded-full p-1 transition-colors`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${local.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Current Offer</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Percentage</label>
            <input
              type="number"
              min="0"
              max="100"
              value={local.currentOffer.percentage}
              onChange={(e) => setLocal((prev: any) => ({
                ...prev,
                currentOffer: { ...prev.currentOffer, percentage: parseFloat(e.target.value) || 0 }
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
            <input
              type="datetime-local"
              value={local.currentOffer.expiryDate ? new Date(local.currentOffer.expiryDate).toISOString().slice(0, 16) : ''}
              onChange={(e) => setLocal((prev: any) => ({
                ...prev,
                currentOffer: { ...prev.currentOffer, expiryDate: e.target.value ? new Date(e.target.value).toISOString() : null }
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={local.currentOffer.description || ''}
              onChange={(e) => setLocal((prev: any) => ({
                ...prev,
                currentOffer: { ...prev.currentOffer, description: e.target.value }
              }))}
              placeholder="e.g., Festival Offer 2025"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <button
            onClick={handleApplyOffer}
            disabled={isLoading || !local.enabled}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Apply Offer to All Users
          </button>
        </div>
      </div>
    </div>
  )
}

function AddOnPricingSection({ config, onUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Crown className="w-6 h-6 mr-2" />
          Add-On Pricing
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Master Account Price ($)</label>
          <input
            type="number"
            step="0.01"
            value={local.masterPrice}
            onChange={(e) => setLocal((prev: any) => ({ ...prev, masterPrice: parseFloat(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slave Account Price ($)</label>
          <input
            type="number"
            step="0.01"
            value={local.slavePrice}
            onChange={(e) => setLocal((prev: any) => ({ ...prev, slavePrice: parseFloat(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
          <select
            value={local.billingCycle}
            onChange={(e) => setLocal((prev: any) => ({ ...prev, billingCycle: e.target.value as 'monthly' | 'yearly' }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function EADefaultsSection({ config, onUpdate, isLoading }: any) {
  const [local, setLocal] = useState(() => {
    return config ? JSON.parse(JSON.stringify(config)) : null
  })

  useEffect(() => {
    if (config) {
      setLocal(JSON.parse(JSON.stringify(config)))
    }
  }, [config])

  if (!local) {
    return <div>Loading...</div>
  }

  const handleSave = () => {
    if (local) {
      onUpdate(local)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
          <Users className="w-6 h-6 mr-2" />
          EA Defaults
        </h2>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Master Accounts</label>
          <p className="text-xs text-gray-500 mb-2">Default number of master accounts for new users</p>
          <input
            type="number"
            value={local.defaultMasters}
            onChange={(e) => setLocal((prev: any) => ({ ...prev, defaultMasters: parseInt(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Default Slave Accounts</label>
          <p className="text-xs text-gray-500 mb-2">Default number of slave accounts for new users</p>
          <input
            type="number"
            value={local.defaultSlaves}
            onChange={(e) => setLocal((prev: any) => ({ ...prev, defaultSlaves: parseInt(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>
    </div>
  )
}
