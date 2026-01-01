'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { copyLinksAPI } from '@/lib/api'
import { Link2, Plus, Pause, Play, Trash2, Copy, Crown, ArrowRight, Settings } from 'lucide-react'
import { useAccounts } from '@/lib/hooks/useAccounts'
import { authService } from '@/lib/auth'
import toast from 'react-hot-toast'

export default function CopyTradingPage() {
  const [showModal, setShowModal] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState('')
  const [selectedSlave, setSelectedSlave] = useState('')
  const [lotMultiplier, setLotMultiplier] = useState('1.0')
  const queryClient = useQueryClient()
  const user = authService.getCurrentUser()

  // Use shared accounts hook - ensures consistent data across all pages
  const {
    accounts,
    masterAccounts,
    slaveAccounts,
    standaloneAccounts,
    isBasicTier,
    canAddMaster,
    canAddSlave,
    limits,
    currentTier,
  } = useAccounts()
  
  // Check if user has EA_LICENSE tier (hide balance, equity, connection status)
  const isEALicense = currentTier === 'EA_LICENSE'
  // Show balance, equity, and connection status only for FULL_ACCESS tier
  const showFinancialInfo = currentTier === 'FULL_ACCESS'
  
  // Check if user has at least 1 master (or standalone that can be master) and 1 slave
  const hasMasterOrStandalone = masterAccounts.length > 0 || standaloneAccounts.length > 0
  const hasSlave = slaveAccounts.length > 0
  const canCreateLink = hasMasterOrStandalone && hasSlave

  const { data: copyLinks, isLoading: linksLoading } = useQuery('copyLinks', () =>
    copyLinksAPI.getCopyLinks().then(res => res.data.data),
    {
      retry: 2,
      onError: (error) => {
        console.error('Error fetching copy links:', error)
      }
    }
  )

  const createLinkMutation = useMutation(
    (data: any) => copyLinksAPI.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('copyLinks')
        setShowModal(false)
        setSelectedMaster('')
        setSelectedSlave('')
        setLotMultiplier('1.0')
      },
    }
  )

  const pauseMutation = useMutation(
    (id: string) => copyLinksAPI.pauseCopyLink(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('copyLinks')
      },
    }
  )

  const resumeMutation = useMutation(
    (id: string) => copyLinksAPI.resumeCopyLink(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('copyLinks')
      },
    }
  )

  const deleteMutation = useMutation(
    (id: string) => copyLinksAPI.deleteCopyLink(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('copyLinks')
      },
    }
  )

  const handleCreateLink = () => {
    if (!selectedMaster || !selectedSlave) {
      toast.error('Please select both master and slave accounts')
      return
    }
    
    // Additional validation
    if (!hasMasterOrStandalone || !hasSlave) {
      if (!hasMasterOrStandalone && !hasSlave) {
        toast.error('Please add at least 1 master account and 1 slave account to create a copy trading link', {
          duration: 5000,
        })
      } else if (!hasMasterOrStandalone) {
        toast.error('Please add at least 1 master account to create a copy trading link', {
          duration: 5000,
        })
      } else if (!hasSlave) {
        toast.error('Please add at least 1 slave account to create a copy trading link', {
          duration: 5000,
        })
      }
      setShowModal(false)
      return
    }

    createLinkMutation.mutate({
      masterAccountId: selectedMaster,
      slaveAccountId: selectedSlave,
      lotMultiplier: parseFloat(lotMultiplier) || 1.0,
    })
  }

  // Accounts are already filtered by useAccounts hook

  // Filter out copy links that reference deleted accounts
  const validCopyLinks = copyLinks?.filter((link: any) => {
    const masterId = link.masterAccountId?._id || link.masterAccountId
    const slaveId = link.slaveAccountId?._id || link.slaveAccountId
    
    // Check if both master and slave accounts still exist
    const masterExists = accounts?.some((acc: any) => 
      String(acc._id) === String(masterId)
    )
    const slaveExists = accounts?.some((acc: any) => 
      String(acc._id) === String(slaveId)
    )
    
    return masterExists && slaveExists
  }) || []
  
  // Check if selected master-slave pair already has a link
  const linkAlreadyExists = selectedMaster && selectedSlave && validCopyLinks?.some((link: any) => {
    const linkMasterId = link.masterAccountId?._id || link.masterAccountId
    const linkSlaveId = link.slaveAccountId?._id || link.slaveAccountId
    return String(linkMasterId) === String(selectedMaster) && 
           String(linkSlaveId) === String(selectedSlave)
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="section-title">Copy Trading</h1>
            <p className="section-subtitle">Link master and slave accounts for automated trading</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                // Check if user has required accounts
                if (!hasMasterOrStandalone || !hasSlave) {
                  if (!hasMasterOrStandalone && !hasSlave) {
                    toast.error('Please add at least 1 master account and 1 slave account to create a copy trading link', {
                      duration: 5000,
                    })
                  } else if (!hasMasterOrStandalone) {
                    toast.error('Please add at least 1 master account to create a copy trading link', {
                      duration: 5000,
                    })
                  } else if (!hasSlave) {
                    toast.error('Please add at least 1 slave account to create a copy trading link', {
                      duration: 5000,
                    })
                  }
                  return
                }
                setShowModal(true)
              }}
              disabled={isBasicTier || !canCreateLink}
              className={`btn ${isBasicTier || !canCreateLink ? 'btn-secondary' : 'btn-primary'}`}
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Link
            </button>
            {limits && (
              <div className="text-sm text-gray-600">
                Masters: {limits.currentMasters}/{limits.maxMasters} | Slaves: {limits.currentSlaves}/{limits.maxSlaves}
              </div>
            )}
          </div>
        </div>
        {isBasicTier && (
          <p className="text-sm text-gray-500 mt-2">
            BASIC tier - Copy trading links disabled. Please upgrade your subscription or claim a free trial.
          </p>
        )}
        {!isBasicTier && masterAccounts.length === 0 && slaveAccounts.length === 0 && (
          <p className="text-sm text-orange-600 mt-2">
            ⚠️ No master or slave accounts available. Please add accounts from the MT5 Accounts page.
          </p>
        )}
      </div>

      {/* User ID Section for EA Configuration */}
      {user && (
        <div className="card bg-gradient-to-r from-primary-50 to-primary-100 border-primary-200">
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Settings className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">User ID (for EA configuration)</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Use this User ID in your EA settings to connect your trading accounts
                </p>
                <div className="flex items-center gap-3 bg-white rounded-lg border border-primary-200 p-3">
                  <code className="flex-1 text-sm font-mono text-gray-900 break-all">
                    {user._id}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(user._id)
                      toast.success('User ID copied to clipboard!')
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors"
                    title="Copy User ID"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Master Accounts */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200 bg-primary-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary-600" />
                <h2 className="text-xl font-semibold text-gray-900">Master Accounts</h2>
              </div>
              <span className="badge badge-primary">{masterAccounts.length}</span>
            </div>
          </div>
          <div className="p-6">
            {masterAccounts.length > 0 ? (
              <div className="space-y-3">
                {masterAccounts.map((account: any) => {
                  // Find if this master has any copy links
                  const masterLinks = validCopyLinks?.filter((link: any) => {
                    const linkMasterId = link.masterAccountId?._id || link.masterAccountId
                    return String(linkMasterId) === String(account._id)
                  }) || []
                  
                  return (
                    <div
                      key={account._id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-900">{account.accountName}</span>
                            <span className="badge badge-primary text-xs">
                              <Crown className="w-3 h-3 mr-1" />
                              master
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm mb-2">
                            <span className="text-gray-600">Login:</span>
                            <span className="font-medium text-gray-900">{account.loginId || 'N/A'}</span>
                          </div>
                          {masterLinks.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <span className="text-xs text-gray-500">Linked to {masterLinks.length} slave account(s)</span>
                            </div>
                          )}
                        </div>
                        {showFinancialInfo && (
                          <div className="text-right">
                            {account.connectionStatus === 'online' ? (
                              <span className="badge badge-success">Online</span>
                            ) : account.connectionStatus === 'offline' ? (
                              <span className="badge badge-secondary">Offline</span>
                            ) : (
                              <span className="badge badge-secondary">Unknown</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Crown className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No master accounts</p>
                <p className="text-sm text-gray-400 mt-1">Set an account type to "Master" to enable copy trading</p>
              </div>
            )}
          </div>
        </div>

        {/* Slave Accounts */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200 bg-success-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-success-600" />
                <h2 className="text-xl font-semibold text-gray-900">Slave Accounts</h2>
              </div>
              <span className="badge badge-success">{slaveAccounts.length}</span>
            </div>
          </div>
          <div className="p-6">
            {slaveAccounts.length > 0 ? (
              <div className="space-y-3">
                {slaveAccounts.map((account: any) => {
                  // Find the master this slave is linked to
                  const slaveLink = validCopyLinks?.find((link: any) => {
                    const linkSlaveId = link.slaveAccountId?._id || link.slaveAccountId
                    return String(linkSlaveId) === String(account._id)
                  })
                  const masterAccount = slaveLink ? accounts?.find((acc: any) => {
                    const linkMasterId = slaveLink.masterAccountId?._id || slaveLink.masterAccountId
                    return String(acc._id) === String(linkMasterId)
                  }) : null
                  
                  return (
                    <div
                      key={account._id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-success-300 hover:bg-success-50/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-gray-900">{account.accountName}</span>
                            <span className="badge badge-success text-xs">
                              <ArrowRight className="w-3 h-3 mr-1" />
                              slave
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm mb-2">
                            <span className="text-gray-600">Login:</span>
                            <span className="font-medium text-gray-900">{account.loginId || 'N/A'}</span>
                          </div>
                          {masterAccount && (
                            <div className="flex items-center gap-1 mb-2 text-sm">
                              <ArrowRight className="w-4 h-4 text-primary-600" />
                              <span className="font-medium text-primary-700">{masterAccount.accountName}</span>
                            </div>
                          )}
                          {slaveLink && (
                            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Lot Multiplier:</span>
                                <span className="font-medium text-gray-900">{slaveLink.lotMultiplier}x</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Status:</span>
                                <span className={`font-medium ${
                                  slaveLink.status === 'active' ? 'text-success-600' : 
                                  slaveLink.status === 'paused' ? 'text-warning-600' : 
                                  'text-gray-600'
                                }`}>
                                  {slaveLink.status}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        {showFinancialInfo && (
                          <div className="text-right">
                            {account.connectionStatus === 'online' ? (
                              <span className="badge badge-success">Online</span>
                            ) : account.connectionStatus === 'offline' ? (
                              <span className="badge badge-secondary">Offline</span>
                            ) : (
                              <span className="badge badge-secondary">Unknown</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <ArrowRight className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No slave accounts</p>
                <p className="text-sm text-gray-400 mt-1">Set an account type to "Slave" to enable copy trading</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Copy Links */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary-600" />
              <h2 className="text-xl font-semibold text-gray-900">Copy Trading Links</h2>
            </div>
            {validCopyLinks && validCopyLinks.length > 0 && (
              <span className="badge badge-primary">{validCopyLinks.length} Link{validCopyLinks.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <div className="p-6">
        {linksLoading ? (
          <p className="text-gray-500 text-center py-4">Loading copy links...</p>
        ) : validCopyLinks && validCopyLinks.length > 0 ? (
          <div className="space-y-3">
            {validCopyLinks.map((link: any) => (
              <div
                key={link._id}
                className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Crown className="w-4 h-4 text-primary-600" />
                        <div>
                          <span className="font-semibold text-gray-900">
                            {link.masterAccountId?.accountName || 'Master'}
                          </span>
                          <span className="text-sm text-gray-500 ml-2">
                            Login: {link.masterAccountId?.loginId || 'N/A'}
                          </span>
                        </div>
                      </div>
                      <Link2 className="w-5 h-5 text-primary-500 flex-shrink-0" />
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-success-600" />
                        <div>
                          <span className="font-semibold text-gray-900">
                            {link.slaveAccountId?.accountName || 'Slave'}
                          </span>
                          <span className="text-sm text-gray-500 ml-2">
                            Login: {link.slaveAccountId?.loginId || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Lot Multiplier:</span>
                        <span className="font-medium text-gray-900">{link.lotMultiplier}x</span>
                      </div>
                      <div className="text-gray-400">|</div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">Risk Mode:</span>
                        <span className="font-medium text-gray-900">{link.riskMode || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`badge ${
                      link.status === 'active' 
                        ? 'badge-success' 
                        : link.status === 'paused'
                        ? 'badge-warning'
                        : 'badge-secondary'
                    }`}>
                      {link.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                  {link.status === 'active' ? (
                    <button
                      onClick={() => pauseMutation.mutate(link._id)}
                      disabled={pauseMutation.isLoading}
                      className="btn btn-secondary text-sm px-3 py-1.5"
                      title="Pause"
                    >
                      <Pause className="w-4 h-4 mr-1" />
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => resumeMutation.mutate(link._id)}
                      disabled={resumeMutation.isLoading}
                      className="btn btn-success text-sm px-3 py-1.5"
                      title="Resume"
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Resume
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this copy link?')) {
                        deleteMutation.mutate(link._id)
                      }
                    }}
                    disabled={deleteMutation.isLoading}
                    className="btn btn-error text-sm px-3 py-1.5"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            No copy links created yet. Create a link to connect a master account to a slave account.
          </p>
        )}
        </div>
      </div>

      {/* Create Link Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create Copy Link</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Master Account
                </label>
                <select
                  value={selectedMaster}
                  onChange={(e) => setSelectedMaster(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select master account</option>
                  {accounts && accounts.length > 0 ? (
                    accounts
                      .filter((acc: any) => acc.accountType === 'master' || acc.accountType === 'standalone')
                      .map((acc: any) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.accountName} ({acc.broker}) - {acc.accountType === 'standalone' ? 'Standalone (will be set to Master)' : 'Master'}
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>No master or standalone accounts available</option>
                  )}
                </select>
                {masterAccounts.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No master accounts found. You can select a standalone account and it will be set to Master.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slave Account
                </label>
                <select
                  value={selectedSlave}
                  onChange={(e) => setSelectedSlave(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select slave account</option>
                  {accounts && accounts.length > 0 ? (
                    accounts
                      .filter((acc: any) => acc.accountType === 'slave')
                      .map((acc: any) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.accountName} ({acc.broker})
                        </option>
                      ))
                  ) : (
                    <option value="" disabled>No slave accounts available</option>
                  )}
                </select>
                {slaveAccounts.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No slave accounts found. You can select a standalone account and it will be set to Slave.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Lot Multiplier
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10"
                  value={lotMultiplier}
                  onChange={(e) => setLotMultiplier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="1.0"
                />
              </div>
            </div>

            {linkAlreadyExists && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ A copy trading link already exists for this master-slave pair.
                </p>
              </div>
            )}
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateLink}
                disabled={createLinkMutation.isLoading || !selectedMaster || !selectedSlave || linkAlreadyExists}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createLinkMutation.isLoading ? 'Creating...' : 'Create Link'}
              </button>
              <button
                onClick={() => {
                  setShowModal(false)
                  setSelectedMaster('')
                  setSelectedSlave('')
                  setLotMultiplier('1.0')
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
