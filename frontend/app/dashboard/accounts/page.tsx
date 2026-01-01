'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { mt5API, licenseAPI, copyLinksAPI } from '@/lib/api'
import { Plus, Copy, RefreshCw, Trash2, Edit, Key, Crown, CheckCircle, ArrowRight, Users, CreditCard } from 'lucide-react'
import { useAccounts } from '@/lib/hooks/useAccounts'
import { authService } from '@/lib/auth'
import toast from 'react-hot-toast'

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const user = authService.getCurrentUser()
  
  // Use shared accounts hook - ensures consistent data across all pages
  const {
    accounts,
    subscription,
    currentTier,
    isBasicTier,
    masterAccounts,
    slaveAccounts,
    standaloneAccounts,
    limits,
    canAddMaster,
    canAddSlave,
    canAddStandalone,
  } = useAccounts()
  
  const isEALicense = currentTier === 'EA_LICENSE'
  const [showModal, setShowModal] = useState(false)
  
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null) // Track which account is being edited
  const [formData, setFormData] = useState({
    accountName: '',
    loginId: '',
    broker: '',
    server: '',
    accountType: 'standalone' as 'master' | 'slave' | 'standalone',
  })
  const [editFormMasterAccountId, setEditFormMasterAccountId] = useState<string>('') // Master selection for edit form
  
  // For slave accounts, track master selection
  const [slaveMasterMap, setSlaveMasterMap] = useState<{ [slaveId: string]: string }>({})

  // WebSocket subscription is handled by useAccounts hook

  const createMutation = useMutation(
    async (data: any) => {
      const result = await mt5API.createAccount({
        accountName: data.accountName,
        loginId: data.loginId,
        broker: data.broker,
        server: data.server,
        accountType: data.accountType,
      })
      
      // If slave account and master is selected, create copy link
      if (data.accountType === 'slave' && editFormMasterAccountId) {
        const createdAccount = result.data.data
        await copyLinksAPI.create({
          masterAccountId: editFormMasterAccountId,
          slaveAccountId: createdAccount._id,
        })
      }
      
      return result
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('accounts')
        queryClient.invalidateQueries('copyLinks')
        queryClient.invalidateQueries('licenseConfig')
        queryClient.invalidateQueries('hybridSubscription')
        setShowModal(false)
        setFormData({
          accountName: '',
          loginId: '',
          broker: '',
          server: '',
          accountType: 'standalone',
        })
        setEditFormMasterAccountId('')
        toast.success('Account created successfully!')
      },
      onError: (error: any) => {
        const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to create account'
        toast.error(`Error: ${errorMessage}`)
      },
    }
  )

  const updateAccountFullMutation = useMutation(
    async ({ id, data }: { id: string; data: any }) => {
      const currentAccount = accounts?.find((acc: any) => acc._id === id)
      
      // If changing from master to non-master, delete all copy links where this account is master
      if (currentAccount?.accountType === 'master' && data.accountType !== 'master') {
        const linksAsMaster = copyLinks?.filter((link: any) => {
          const masterId = link.masterAccountId?._id || link.masterAccountId
          return String(masterId) === String(id)
        }) || []
        
        if (linksAsMaster.length > 0) {
          await Promise.allSettled(linksAsMaster.map((link: any) => 
            copyLinksAPI.deleteCopyLink(link._id).catch((error: any) => {
              if (error.response?.status !== 404) {
                console.error('Error deleting copy link:', error)
              }
            })
          ))
        }
      }
      
      // Update account with all fields
      await mt5API.updateAccount(id, {
        accountName: data.accountName,
        loginId: data.loginId,
        broker: data.broker,
        server: data.server,
        accountType: data.accountType,
      })
      
      // Handle copy link for slave accounts
      if (data.accountType === 'slave' && editFormMasterAccountId) {
        const existingLink = copyLinks?.find((link: any) => {
          const slaveId = link.slaveAccountId?._id || link.slaveAccountId
          return String(slaveId) === String(id)
        })
        
        if (existingLink) {
          await copyLinksAPI.updateCopyLink(existingLink._id, {
            masterAccountId: editFormMasterAccountId,
          })
        } else {
          await copyLinksAPI.create({
            masterAccountId: editFormMasterAccountId,
            slaveAccountId: id,
          })
        }
      } else if (data.accountType !== 'slave') {
        // If changing from slave, delete copy links
        const linksToDelete = copyLinks?.filter((link: any) => {
          const slaveId = link.slaveAccountId?._id || link.slaveAccountId
          return String(slaveId) === String(id)
        })
        if (linksToDelete && linksToDelete.length > 0) {
          await Promise.allSettled(linksToDelete.map((link: any) => 
            copyLinksAPI.deleteCopyLink(link._id).catch((error: any) => {
              if (error.response?.status !== 404) {
                console.error('Error deleting copy link:', error)
              }
            })
          ))
        }
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('accounts')
        queryClient.invalidateQueries('copyLinks')
        queryClient.invalidateQueries('licenseConfig')
        setEditingAccountId(null)
        setFormData({
          accountName: '',
          loginId: '',
          broker: '',
          server: '',
          accountType: 'standalone',
        })
        setEditFormMasterAccountId('')
        setShowModal(false) // Close the modal after successful update
        toast.success('Account updated successfully!')
      },
      onError: (error: any) => {
        console.error('Error updating account:', error)
        const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to update account'
        toast.error(`Error: ${errorMessage}`)
      },
    }
  )

  const deleteMutation = useMutation(
    (id: string) => mt5API.deleteAccount(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('accounts')
        queryClient.invalidateQueries('copyLinks') // Also refresh copy links when account is deleted
      },
    }
  )

  const regenerateTokenMutation = useMutation(
    (id: string) => mt5API.regenerateToken(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('accounts')
        toast.success('EA Token regenerated successfully!')
      },
    }
  )

  const [editingAccount, setEditingAccount] = useState<string | null>(null)
  const [editAccountType, setEditAccountType] = useState<'master' | 'slave' | 'standalone'>('standalone')
  const [editMasterAccountId, setEditMasterAccountId] = useState<string>('')

  // Get copy links to show master-slave relationships
  const { data: copyLinks } = useQuery(
    'copyLinks',
    () => copyLinksAPI.getCopyLinks().then(res => res.data.data),
    {
      enabled: true, // Fetch for all users to show copy links visualization
    }
  )

  // Get license config to show allowed accounts
  const { data: licenseConfig } = useQuery(
    ['licenseConfig', user?._id],
    () => {
      if (!user?._id || !accounts || accounts.length === 0) return null
      // Get config for first account (or current account if available)
      const firstAccount = accounts[0]
      return licenseAPI.getConfig({
        userId: user._id,
        mt5Login: firstAccount.loginId,
      }).then(res => res.data.data)
    },
    {
      enabled: isEALicense && !!user?._id && !!accounts && accounts.length > 0,
    }
  )

  const updateAccountMutation = useMutation(
    async ({ id, data }: { id: string; data: any }) => {
      const currentAccount = accounts?.find((acc: any) => acc._id === id)
      
      // If changing from master to non-master, delete all copy links where this account is master
      if (currentAccount?.accountType === 'master' && data.accountType !== 'master') {
        const linksAsMaster = copyLinks?.filter((link: any) => {
          const masterId = link.masterAccountId?._id || link.masterAccountId
          return String(masterId) === String(id)
        }) || []
        
        if (linksAsMaster.length > 0) {
          // Delete all copy links where this account is the master
          // Handle errors gracefully - if link already deleted, that's fine
          await Promise.allSettled(linksAsMaster.map((link: any) => 
            copyLinksAPI.deleteCopyLink(link._id).catch((error: any) => {
              // Ignore 404 errors (link already deleted) but log others
              if (error.response?.status !== 404) {
                console.error('Error deleting copy link:', error)
              }
            })
          ))
        }
      }
      
      // Update account type - only send accountType field
      await mt5API.updateAccount(id, { accountType: data.accountType })
      
      // If changing to slave and master is selected, create/update copy link
      if (data.accountType === 'slave' && editMasterAccountId) {
        const masterAccount = accounts?.find((acc: any) => acc._id === editMasterAccountId)
        if (masterAccount) {
          // Check if copy link already exists
          const existingLink = copyLinks?.find((link: any) => {
            const slaveId = link.slaveAccountId?._id || link.slaveAccountId
            return String(slaveId) === String(id)
          })
          
          if (existingLink) {
            // Update existing link
            await copyLinksAPI.updateCopyLink(existingLink._id, {
              masterAccountId: editMasterAccountId,
            })
          } else {
            // Create new link
            await copyLinksAPI.create({
              masterAccountId: editMasterAccountId,
              slaveAccountId: id,
            })
          }
        }
      } else if (data.accountType !== 'slave') {
        // If changing from slave, delete copy links (where this account is slave)
        const linksToDelete = copyLinks?.filter((link: any) => {
          const slaveId = link.slaveAccountId?._id || link.slaveAccountId
          return String(slaveId) === String(id)
        })
        if (linksToDelete && linksToDelete.length > 0) {
          // Handle errors gracefully - if link already deleted, that's fine
          await Promise.allSettled(linksToDelete.map((link: any) => 
            copyLinksAPI.deleteCopyLink(link._id).catch((error: any) => {
              // Ignore 404 errors (link already deleted) but log others
              if (error.response?.status !== 404) {
                console.error('Error deleting copy link:', error)
              }
            })
          ))
        }
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('accounts')
        queryClient.invalidateQueries('copyLinks')
        queryClient.invalidateQueries('licenseConfig')
        setEditingAccount(null)
        setEditMasterAccountId('')
        toast.success('Account type updated successfully!')
      },
      onError: (error: any) => {
        console.error('Error updating account:', error)
        const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to update account'
        toast.error(`Error: ${errorMessage}`)
      },
    }
  )

  const handleEditAccountType = (account: any) => {
    setEditingAccount(account._id)
    setEditAccountType(account.accountType || 'standalone')
    
    // Find master account if this is a slave
    if (account.accountType === 'slave' && copyLinks) {
      const link = copyLinks.find((l: any) => {
        const slaveId = l.slaveAccountId?._id || l.slaveAccountId
        return String(slaveId) === String(account._id)
      })
      if (link) {
        const masterId = link.masterAccountId?._id || link.masterAccountId
        setEditMasterAccountId(String(masterId))
      }
    } else {
      setEditMasterAccountId('')
    }
  }

  const handleSaveAccountType = (accountId: string) => {
    const currentAccount = accounts?.find((acc: any) => acc._id === accountId)
    
    // Check if changing from master to slave (or any other type)
    if (currentAccount?.accountType === 'master' && editAccountType !== 'master') {
      // Find all copy links where this account is the master
      const linksAsMaster = copyLinks?.filter((link: any) => {
        const masterId = link.masterAccountId?._id || link.masterAccountId
        return String(masterId) === String(accountId)
      }) || []
      
      if (linksAsMaster.length > 0) {
        // Show confirmation dialog
        const slaveNames = linksAsMaster.map((link: any) => {
          const slaveId = link.slaveAccountId?._id || link.slaveAccountId
          const slaveAccount = accounts?.find((acc: any) => String(acc._id) === String(slaveId))
          return slaveAccount?.accountName || 'Unknown'
        }).join(', ')
        
        const confirmMessage = `⚠️ WARNING: This account is currently a MASTER with ${linksAsMaster.length} linked slave account(s):\n\n${slaveNames}\n\nIf you change this account to "${editAccountType}", ALL copy trading links will be REMOVED.\n\nAre you sure you want to continue?`
        
        if (!confirm(confirmMessage)) {
          return // User cancelled
        }
      }
    }
    
    updateAccountMutation.mutate({
      id: accountId,
      data: { accountType: editAccountType },
    })
  }
  
  // Get master account for a slave account
  const getMasterAccount = (slaveAccountId: string) => {
    if (!copyLinks) return null
    const link = copyLinks.find((l: any) => {
      const slaveId = l.slaveAccountId?._id || l.slaveAccountId
      return String(slaveId) === String(slaveAccountId)
    })
    if (link) {
      const masterId = link.masterAccountId?._id || link.masterAccountId
      return accounts?.find((acc: any) => acc._id === masterId || String(acc._id) === String(masterId))
    }
    return null
  }
  
  // Check if account is allowed for EA License
  const isAccountAllowed = (loginId: string) => {
    if (!isEALicense || !licenseConfig) return true // Full access users can use all accounts
    return licenseConfig.allowedAccounts?.includes(loginId) || false
  }

  // Accounts are already grouped by useAccounts hook

  // Account limits are already calculated by useAccounts hook

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate limits before submitting
    if (!editingAccountId) {
      // Creating new account - check limits
      if (formData.accountType === 'master' && !canAddMaster) {
        toast.error(`You have reached your master account limit (${limits?.maxMasters || 0}). Please purchase additional master add-ons or upgrade your subscription.`)
        return
      }
      if (formData.accountType === 'slave' && !canAddSlave) {
        toast.error(`You have reached your slave account limit (${limits?.maxSlaves || 0}). Please purchase additional slave add-ons or upgrade your subscription.`)
        return
      }
      if (formData.accountType === 'standalone' && !canAddStandalone) {
        toast.error(`You have reached your account limit. Please purchase additional add-ons or upgrade your subscription.`)
        return
      }
    }
    
    if (editingAccountId) {
      // Update existing account
      updateAccountFullMutation.mutate({
        id: editingAccountId,
        data: formData,
      })
    } else {
      // Create new account
      createMutation.mutate(formData)
    }
  }

  const handleEditAccount = (account: any) => {
    setEditingAccountId(account._id)
    setFormData({
      accountName: account.accountName || '',
      loginId: account.loginId || '',
      broker: account.broker || '',
      server: account.server || '',
      accountType: account.accountType || 'standalone',
    })
    
    // Find master account if this is a slave
    if (account.accountType === 'slave' && copyLinks) {
      const link = copyLinks.find((l: any) => {
        const slaveId = l.slaveAccountId?._id || l.slaveAccountId
        return String(slaveId) === String(account._id)
      })
      if (link) {
        const masterId = link.masterAccountId?._id || link.masterAccountId
        setEditFormMasterAccountId(String(masterId))
      } else {
        setEditFormMasterAccountId('')
      }
    } else {
      setEditFormMasterAccountId('')
    }
    
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingAccountId(null)
    setFormData({
      accountName: '',
      loginId: '',
      broker: '',
      server: '',
      accountType: 'standalone',
    })
    setEditFormMasterAccountId('')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard!')
  }

  // Compact Account Row Component with Two-Row Layout
  const AccountRow = ({
    account,
    isEALicense,
    user,
    getMasterAccount,
    isAccountAllowed,
    handleEditAccount,
    regenerateTokenMutation,
    deleteMutation,
    copyToClipboard,
  }: any) => {
    const master = account.accountType === 'slave' ? getMasterAccount(account._id) : null

    return (
      <div className="px-6 py-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
        {/* Row 1: Account Information */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
          {/* Left Section: Account Name, Type, and Basic Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900 text-base">{account.accountName}</h3>
              <span
                className={`badge ${
                  account.accountType === 'master'
                    ? 'badge-primary'
                    : account.accountType === 'slave'
                    ? 'badge-success'
                    : 'badge-secondary'
                }`}
              >
                {account.accountType === 'master' && <Crown className="w-3 h-3 inline mr-1" />}
                {account.accountType === 'slave' && <ArrowRight className="w-3 h-3 inline mr-1" />}
                {account.accountType}
              </span>
              {account.accountType === 'slave' && master && (
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <ArrowRight className="w-3 h-3 text-primary-600" />
                  <span className="font-medium text-primary-700">{master.accountName}</span>
                </span>
              )}
            </div>
            
            {/* Account Details: Login, Broker, Server */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mb-2">
              <div>
                <span className="text-gray-500">Login:</span>{' '}
                <span className="font-medium text-gray-900">{account.loginId}</span>
              </div>
              <div className="text-gray-300">|</div>
              <div>
                <span className="text-gray-500">Broker:</span>{' '}
                <span className="font-medium text-gray-900">{account.broker || 'N/A'}</span>
              </div>
              {account.server && (
                <>
                  <div className="text-gray-300">|</div>
                  <div>
                    <span className="text-gray-500">Server:</span>{' '}
                    <span className="font-medium text-gray-900">{account.server}</span>
                  </div>
                </>
              )}
            </div>

            {/* Status, Balance, Equity, Token */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* EA License - Allowed Badge */}
              {isEALicense && (
                <span
                  className={`badge ${
                    isAccountAllowed(account.loginId)
                      ? 'badge-success'
                      : 'badge-error'
                  }`}
                >
                  {isAccountAllowed(account.loginId) ? (
                    <>
                      <CheckCircle className="w-3 h-3 inline mr-1" />
                      Allowed
                    </>
                  ) : (
                    'Not Allowed'
                  )}
                </span>
              )}

              {/* Connection Status - Full Access */}
              {!isEALicense && (
                <span
                  className={`badge ${
                    account.connectionStatus === 'online'
                      ? 'badge-success'
                      : 'badge-secondary'
                  }`}
                >
                  {account.connectionStatus || 'Unknown'}
                </span>
              )}

              {/* Balance & Equity - Full Access */}
              {!isEALicense && (
                <>
                  <div className="text-sm">
                    <span className="text-gray-500">Balance:</span>{' '}
                    <span className="font-semibold text-gray-900">
                      ${account.balance?.toFixed(2) || account.equity?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Equity:</span>{' '}
                    <span className="font-semibold text-gray-900">
                      ${account.equity?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </>
              )}

              {/* EA Token (Full Access only) */}
              {!isEALicense && account.eaToken && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Token:</span>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono text-gray-900">
                    {account.eaToken}
                  </code>
                  <button
                    onClick={() => copyToClipboard(account.eaToken)}
                    className="text-primary-600 hover:text-primary-700 transition-colors"
                    title="Copy EA Token"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
          <button
            onClick={() => handleEditAccount(account)}
            disabled={isBasicTier}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              isBasicTier
                ? 'text-gray-400 cursor-not-allowed bg-gray-50'
                : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:text-primary-600 hover:border-primary-300'
            }`}
            title={isBasicTier ? 'BASIC tier - Edit disabled' : 'Edit Account'}
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </button>
          {!isEALicense && (
            <button
              onClick={() => regenerateTokenMutation.mutate(account._id)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-primary-600 hover:border-primary-300 transition-colors"
              title="Regenerate EA Token"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Regenerate Token</span>
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this account?')) {
                deleteMutation.mutate(account._id)
              }
            }}
            disabled={isBasicTier}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              isBasicTier
                ? 'text-gray-400 cursor-not-allowed bg-gray-50'
                : 'text-error-600 bg-white border border-error-300 hover:bg-error-50 hover:text-error-700'
            }`}
            title={isBasicTier ? 'BASIC tier - Delete disabled' : 'Delete Account'}
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    )
  }

  // Check if accounts are loading (undefined means loading)
  if (accounts === undefined) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-600 font-medium mb-1">Loading accounts...</p>
        <p className="text-sm text-gray-500">Fetching data from server...</p>
      </div>
    )
  }

  // Show error if no accounts and not loading
  if (accounts !== undefined && (!accounts || accounts.length === 0)) {
    return (
      <>
        <div className="card p-12 text-center">
          <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold text-lg mb-2">No accounts found</p>
          <p className="text-sm text-gray-600 mb-6">
            {accounts === undefined 
              ? "Unable to load accounts. Please check your connection."
              : "Add your first MT5 account to get started with copy trading."
            }
          </p>
          <button
            onClick={() => {
              setShowModal(true)
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Your First Account
          </button>
        </div>
        
        {/* Modal must be here for empty state - otherwise it's never reached */}
        {showModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
            style={{ zIndex: 9999 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowModal(false)
              }
            }}
          >
            <div 
              className="card p-6 sm:p-8 w-full max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">{editingAccountId ? 'Edit Account' : 'Add MT5 Account'}</h2>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Name
                    </label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={formData.accountName}
                      onChange={(e) =>
                        setFormData({ ...formData, accountName: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Login ID
                    </label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={formData.loginId}
                      onChange={(e) =>
                        setFormData({ ...formData, loginId: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Broker
                    </label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={formData.broker}
                      onChange={(e) =>
                        setFormData({ ...formData, broker: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Server
                    </label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      value={formData.server}
                      onChange={(e) =>
                        setFormData({ ...formData, server: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Type
                    </label>
                    <select
                      required
                      className="form-input"
                      value={formData.accountType}
                      onChange={(e) =>
                        setFormData({ ...formData, accountType: e.target.value as 'master' | 'slave' | 'standalone' })
                      }
                    >
                      <option value="standalone">Standalone</option>
                      {!isBasicTier && <option value="master">Master</option>}
                      {!isBasicTier && <option value="slave">Slave</option>}
                    </select>
                    {formData.accountType === 'slave' && masterAccounts.length === 0 && standaloneAccounts.length === 0 && (
                      <div className="mt-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2 flex items-start">
                        <span className="mr-2 text-base">ℹ️</span>
                        <span>You must add at least 1 master account first before adding a slave account.</span>
                      </div>
                    )}
                  </div>
                  {formData.accountType === 'slave' && masterAccounts.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Master Account
                      </label>
                      <select
                        required
                        className="form-input"
                        value={editFormMasterAccountId}
                        onChange={(e) => setEditFormMasterAccountId(e.target.value)}
                      >
                        <option value="">Select Master Account</option>
                        {masterAccounts.map((master: any) => (
                          <option key={master._id} value={master._id}>
                            {master.accountName} ({master.loginId})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="btn btn-outline"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isLoading || updateAccountFullMutation.isLoading || (formData.accountType === 'slave' && !editFormMasterAccountId)}
                    className="btn btn-primary"
                  >
                    {createMutation.isLoading || updateAccountFullMutation.isLoading 
                      ? (editingAccountId ? 'Updating...' : 'Creating...') 
                      : (editingAccountId ? 'Update Account' : 'Create Account')
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="section-title">MT5 Accounts</h1>
            {limits ? (
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                <span>
                  Masters: <span className="font-semibold">{masterAccounts.length}/{limits.maxMasters || 0}</span>
                </span>
                <span>
                  Slaves: <span className="font-semibold">{slaveAccounts.length}/{limits.maxSlaves || 0}</span>
                </span>
              </div>
            ) : subscription?.limits ? (
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                <span>
                  Masters: <span className="font-semibold">{masterAccounts.length}/{subscription.limits.totalMasters || 0}</span>
                </span>
                <span>
                  Slaves: <span className="font-semibold">{slaveAccounts.length}/{subscription.limits.totalSlaves || 0}</span>
                </span>
              </div>
            ) : (
              <div className="mt-2 text-sm text-yellow-600">
                Loading subscription limits...
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setEditingAccountId(null)
              setFormData({
                accountName: '',
                loginId: '',
                broker: '',
                server: '',
                accountType: 'standalone',
              })
              setEditFormMasterAccountId('')
              setShowModal(true)
            }}
            disabled={isBasicTier || (!canAddMaster && !canAddSlave && !canAddStandalone)}
            className={`btn ${isBasicTier || (!canAddMaster && !canAddSlave && !canAddStandalone) ? 'btn-secondary' : 'btn-primary'}`}
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Account
          </button>
        </div>
        {isBasicTier && (
          <p className="text-sm text-gray-500 mt-2">
            BASIC tier - Account management disabled. Please upgrade your subscription or claim a free trial.
          </p>
        )}
        {!isBasicTier && limits && !canAddMaster && !canAddSlave && !canAddStandalone && (
          <p className="text-sm text-red-600 mt-2">
            ⚠️ All account limits reached. You have {limits.maxMasters} master(s) and {limits.maxSlaves} slave(s). Please purchase additional add-ons or upgrade your subscription.
          </p>
        )}
      </div>

      {/* User ID Display (EA License only) - Show once at top */}
      {isEALicense && user?._id && (
        <div className="card bg-gradient-to-r from-primary-50 to-primary-100 border-primary-200">
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Key className="w-5 h-5 text-primary-600" />
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
                    onClick={() => copyToClipboard(user._id)}
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

      {/* Show message if expired and moved to BASIC tier */}
      {isBasicTier && subscription?.subscriptionTier === 'BASIC' && subscription?.baseTier && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Subscription Expired - Accounts Disabled
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  Your subscription has expired and the grace period has ended. All MT5 accounts and copy trading links have been removed.
                  Please renew your subscription to regain access.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accounts List - Grouped by Type - Hide if expired and moved to BASIC */}
      {!(isBasicTier && subscription?.subscriptionTier === 'BASIC' && subscription?.baseTier) && (
      <div className="space-y-6">
        {/* Master Accounts Section */}
        {masterAccounts.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-primary-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-primary-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Master Accounts</h2>
                </div>
                <span className="badge badge-primary">
                  {masterAccounts.length}
                </span>
              </div>
            </div>
            <div>
              {masterAccounts.map((account: any) => (
                <AccountRow
                  key={account._id}
                  account={account}
                  isEALicense={isEALicense}
                  user={user}
                  getMasterAccount={getMasterAccount}
                  isAccountAllowed={isAccountAllowed}
                  handleEditAccount={handleEditAccount}
                  regenerateTokenMutation={regenerateTokenMutation}
                  deleteMutation={deleteMutation}
                  copyToClipboard={copyToClipboard}
                />
              ))}
            </div>
          </div>
        )}

        {/* Slave Accounts Section */}
        {slaveAccounts.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-success-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-5 h-5 text-success-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Slave Accounts</h2>
                </div>
                <span className="badge badge-success">
                  {slaveAccounts.length}
                </span>
              </div>
            </div>
            <div>
              {slaveAccounts.map((account: any) => (
                <AccountRow
                  key={account._id}
                  account={account}
                  isEALicense={isEALicense}
                  user={user}
                  getMasterAccount={getMasterAccount}
                  isAccountAllowed={isAccountAllowed}
                  handleEditAccount={handleEditAccount}
                  regenerateTokenMutation={regenerateTokenMutation}
                  deleteMutation={deleteMutation}
                  copyToClipboard={copyToClipboard}
                />
              ))}
            </div>
          </div>
        )}

        {/* Standalone Accounts Section */}
        {standaloneAccounts.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-gray-600" />
                  <h2 className="text-xl font-semibold text-gray-900">Standalone Accounts</h2>
                </div>
                <span className="badge badge-secondary">
                  {standaloneAccounts.length}
                </span>
              </div>
            </div>
            <div>
              {standaloneAccounts.map((account: any) => (
                <AccountRow
                  key={account._id}
                  account={account}
                  isEALicense={isEALicense}
                  user={user}
                  getMasterAccount={getMasterAccount}
                  isAccountAllowed={isAccountAllowed}
                  handleEditAccount={handleEditAccount}
                  regenerateTokenMutation={regenerateTokenMutation}
                  deleteMutation={deleteMutation}
                  copyToClipboard={copyToClipboard}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {accounts && accounts.length === 0 && (
          <div className="card p-12 text-center">
            <CreditCard className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-900 font-semibold text-lg mb-2">No accounts found</p>
            <p className="text-sm text-gray-600 mb-6">
              Add your first MT5 account to get started with copy trading.
            </p>
            <button
              onClick={() => {
                setEditingAccountId(null)
                setFormData({
                  accountName: '',
                  loginId: '',
                  broker: '',
                  server: '',
                  accountType: 'standalone',
                })
                setEditFormMasterAccountId('')
                setShowModal(true)
              }}
              className="btn btn-primary"
            >
              <Plus className="w-5 h-5 mr-2" />
              Add Your First Account
            </button>
          </div>
        )}
      </div>
      )}

      {/* Add/Edit Account Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowModal(false)
            }
          }}
        >
          <div 
            className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-6 text-gray-900">
              {editingAccountId ? 'Edit MT5 Account' : 'Add MT5 Account'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Name
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={formData.accountName}
                    onChange={(e) =>
                      setFormData({ ...formData, accountName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Login ID
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={formData.loginId}
                    onChange={(e) =>
                      setFormData({ ...formData, loginId: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Broker
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={formData.broker}
                    onChange={(e) =>
                      setFormData({ ...formData, broker: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Server
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={formData.server}
                    onChange={(e) =>
                      setFormData({ ...formData, server: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Type
                  </label>
                  <select
                    className="form-input"
                    value={formData.accountType}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        accountType: e.target.value as any,
                      })
                      // Clear master selection if not slave
                      if (e.target.value !== 'slave') {
                        setEditFormMasterAccountId('')
                      }
                    }}
                    disabled={editingAccountId ? false : (
                      !canAddMaster && !canAddSlave && !canAddStandalone
                    )}
                  >
                    <option value="standalone">
                      Standalone {!editingAccountId && !canAddStandalone && `(Limit: ${subscription?.limits.totalMasters + subscription?.limits.totalSlaves || 0})`}
                    </option>
                    <option value="master" disabled={!editingAccountId && !canAddMaster}>
                      Master {!editingAccountId && `(${limits?.currentMasters || 0}/${limits?.maxMasters || 0})`} {!editingAccountId && !canAddMaster && '- Limit Reached'}
                    </option>
                    <option value="slave" disabled={!editingAccountId && !canAddSlave}>
                      Slave {!editingAccountId && `(${limits?.currentSlaves || 0}/${limits?.maxSlaves || 0})`} {!editingAccountId && !canAddSlave && '- Limit Reached'}
                    </option>
                  </select>
                  {!editingAccountId && (
                    <div className="mt-2 space-y-1">
                      {formData.accountType === 'master' && !canAddMaster && (
                        <p className="text-xs text-red-600">
                          ⚠️ You have reached your master account limit. Please purchase additional master add-ons or upgrade your subscription.
                        </p>
                      )}
                      {formData.accountType === 'slave' && !canAddSlave && (
                        <p className="text-xs text-red-600">
                          ⚠️ You have reached your slave account limit. Please purchase additional slave add-ons or upgrade your subscription.
                        </p>
                      )}
                      {formData.accountType === 'slave' && canAddSlave && masterAccounts.length === 0 && standaloneAccounts.length === 0 && (
                        <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2 flex items-start">
                          <span className="mr-2 text-base">ℹ️</span>
                          <span>You must add at least 1 master account first before adding a slave account.</span>
                        </div>
                      )}
                      {formData.accountType === 'standalone' && !canAddStandalone && (
                        <p className="text-xs text-red-600">
                          ⚠️ You have reached your account limit. Please purchase additional add-ons or upgrade your subscription.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {formData.accountType === 'slave' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Master Account
                    </label>
                    <select
                      className="form-input"
                      value={editFormMasterAccountId}
                      onChange={(e) => setEditFormMasterAccountId(e.target.value)}
                      required
                    >
                      <option value="">Select Master Account</option>
                      {accounts?.filter((acc: any) => 
                        acc._id !== editingAccountId && 
                        (acc.accountType === 'master' || acc.accountType === 'standalone')
                      ).map((acc: any) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.accountName} ({acc.loginId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isLoading || updateAccountFullMutation.isLoading || (formData.accountType === 'slave' && !editFormMasterAccountId)}
                  className="btn btn-primary"
                >
                  {editingAccountId 
                    ? (updateAccountFullMutation.isLoading ? 'Updating...' : 'Update Account')
                    : (createMutation.isLoading ? 'Creating...' : 'Create Account')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

