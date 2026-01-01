'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { subscriptionAPI, hybridSubscriptionAPI, userAPI } from '@/lib/api'
import { Search, Edit, Save, X, Crown, Key, AlertCircle, CheckCircle, Plus, Minus, Calendar, Settings, Gift, Percent, RotateCcw, Star, Ban, Eye, User as UserIcon, Mail, Shield, Filter, Download, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useWebSocket } from '@/lib/hooks/useWebSocket'
import { authService } from '@/lib/auth'
import toast from 'react-hot-toast'

interface User {
  _id: string
  email: string
  name: string
  tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'
  expiryDate: string | null
  isExpired: boolean
  baseTier?: 'EA_LICENSE' | 'FULL_ACCESS' | null
  isActive: boolean
  createdAt: string
}

export default function AdminSubscriptionsPage() {
  // Hooks must be called before any conditional returns
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [userIdFilter, setUserIdFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editTier, setEditTier] = useState<'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'>('FULL_ACCESS')
  const [editExpiry, setEditExpiry] = useState('')
  const [viewingHybrid, setViewingHybrid] = useState<string | null>(null)
  const [hybridData, setHybridData] = useState<any>(null)
  const [addOnQuantity, setAddOnQuantity] = useState<{ master: number; slave: number }>({ master: 1, slave: 1 })
  
  // Trial reset state
  const [resettingTrial, setResettingTrial] = useState<string | null>(null)
  const [disablingTrial, setDisablingTrial] = useState<string | null>(null)
  
  // Client discount state
  const [editingClientDiscount, setEditingClientDiscount] = useState<string | null>(null)
  const [clientDiscount, setClientDiscount] = useState({ isClient: false, discountPercentage: 5 })
  
  // Special discount state
  const [editingSpecialDiscount, setEditingSpecialDiscount] = useState<string | null>(null)
  const [specialDiscount, setSpecialDiscount] = useState({ percentage: 0, expiryDate: '', description: '' })
  
  // User edit state
  const [editingUserInfo, setEditingUserInfo] = useState<string | null>(null)
  const [userEditData, setUserEditData] = useState({ name: '', email: '', role: 'client' as 'admin' | 'client' | 'viewer' })

  // Maintain WebSocket listeners
  useWebSocket({})
  
  // Cache user to prevent recreation on re-renders
  const user = useMemo(() => authService.getCurrentUser(), [])

  // Fetch users (must be before conditional return)
  const { data, isLoading, error, refetch } = useQuery(
    ['adminUsers', page, search, tierFilter, statusFilter, userIdFilter, dateFrom, dateTo],
    () =>
      subscriptionAPI.listUsers({
        page,
        limit: 20,
        search: search || undefined,
        tier: tierFilter || undefined,
        status: statusFilter || undefined,
        userId: userIdFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }).then(res => res.data.data),
    {
      retry: 2,
    }
  )

  // Update tier mutation
  const updateTierMutation = useMutation(
    ({ userId, tier, expiryDate }: { userId: string; tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'; expiryDate?: string }) =>
      subscriptionAPI.updateUserTier(userId, { tier, expiryDate }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminUsers')
        setEditingUser(null)
        setEditTier('FULL_ACCESS')
        setEditExpiry('')
        toast.success('Tier updated successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to update tier')
      },
    }
  )

  // Reset trial mutation (also enables trial if disabled)
  const resetTrialMutation = useMutation(
    (userId: string) => hybridSubscriptionAPI.adminResetTrial(userId),
    {
      onSuccess: (data, userId) => {
        queryClient.invalidateQueries('adminUsers')
        fetchHybridSubscription(userId) // Refresh hybrid data
        setResettingTrial(null)
        toast.success('Trial reset and enabled successfully! User can now claim a free trial.')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to reset trial')
        setResettingTrial(null)
      },
    }
  )

  // Disable trial mutation
  const disableTrialMutation = useMutation(
    (userId: string) => hybridSubscriptionAPI.adminDisableTrial(userId),
    {
      onSuccess: (data, userId) => {
        queryClient.invalidateQueries('adminUsers')
        fetchHybridSubscription(userId) // Refresh hybrid data
        setDisablingTrial(null)
        toast.success('Trial disabled successfully! User moved to BASIC tier.')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to disable trial')
        setDisablingTrial(null)
      },
    }
  )

  // Set client status mutation
  const setClientStatusMutation = useMutation(
    ({ userId, isClient, discountPercentage }: { userId: string; isClient: boolean; discountPercentage?: number }) =>
      hybridSubscriptionAPI.adminSetClientStatus(userId, { isClient, clientDiscountPercentage: discountPercentage }),
    {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries('adminUsers')
        fetchHybridSubscription(variables.userId) // Refresh hybrid data
        setEditingClientDiscount(null)
        toast.success('Client status updated successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to update client status')
        setEditingClientDiscount(null)
      },
    }
  )

  // Set special discount mutation
  const setSpecialDiscountMutation = useMutation(
    ({ userId, percentage, expiryDate, description }: { userId: string; percentage: number; expiryDate: string; description?: string }) =>
      hybridSubscriptionAPI.adminSetSpecialDiscount(userId, { discountPercentage: percentage, expiryDate, description }),
    {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries('adminUsers')
        fetchHybridSubscription(variables.userId) // Refresh hybrid data
        setEditingSpecialDiscount(null)
        setSpecialDiscount({ percentage: 0, expiryDate: '', description: '' })
        toast.success('Special discount set successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to set special discount')
        setEditingSpecialDiscount(null)
      },
    }
  )

  // Remove special discount mutation
  const removeSpecialDiscountMutation = useMutation(
    (userId: string) => hybridSubscriptionAPI.adminRemoveSpecialDiscount(userId),
    {
      onSuccess: (data, userId) => {
        queryClient.invalidateQueries('adminUsers')
        fetchHybridSubscription(userId) // Refresh hybrid data
        toast.success('Special discount removed successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to remove special discount')
      },
    }
  )

  // Update user mutation
  const updateUserMutation = useMutation(
    ({ userId, data }: { userId: string; data: { name?: string; email?: string; role?: 'admin' | 'client' | 'viewer' } }) =>
      userAPI.updateUser(userId, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminUsers')
        setEditingUserInfo(null)
        toast.success('User updated successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to update user')
      },
    }
  )

  // Block user mutation
  const blockUserMutation = useMutation(
    (userId: string) => userAPI.blockUser(userId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminUsers')
        toast.success('User blocked successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to block user')
      },
    }
  )

  // Unblock user mutation
  const unblockUserMutation = useMutation(
    (userId: string) => userAPI.unblockUser(userId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminUsers')
        toast.success('User unblocked successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to unblock user')
      },
    }
  )

  // Bulk operations mutations
  const bulkBlockMutation = useMutation(
    (userIds: string[]) => userAPI.bulkBlockUsers(userIds),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('adminUsers')
        setSelectedUsers(new Set())
        setSelectAll(false)
        toast.success(data.data.message || 'Users blocked successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to block users')
      },
    }
  )

  const bulkUnblockMutation = useMutation(
    (userIds: string[]) => userAPI.bulkUnblockUsers(userIds),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('adminUsers')
        setSelectedUsers(new Set())
        setSelectAll(false)
        toast.success(data.data.message || 'Users unblocked successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to unblock users')
      },
    }
  )

  const bulkDeleteMutation = useMutation(
    (userIds: string[]) => userAPI.bulkDeleteUsers(userIds),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('adminUsers')
        setSelectedUsers(new Set())
        setSelectAll(false)
        toast.success(data.data.message || 'Users deleted successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to delete users')
      },
    }
  )

  const bulkUpdateTierMutation = useMutation(
    (data: { userIds: string[]; tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'; expiryDate?: string }) =>
      subscriptionAPI.bulkUpdateUserTiers(data),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('adminUsers')
        setSelectedUsers(new Set())
        setSelectAll(false)
        toast.success(data.data.message || 'User tiers updated successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to update user tiers')
      },
    }
  )

  // Fetch hybrid subscription for a user
  const fetchHybridSubscription = async (userId: string) => {
    try {
      const response = await subscriptionAPI.getHybridSubscriptionAdmin(userId)
      if (response.data.success) {
        setHybridData(response.data.data)
        setViewingHybrid(userId)
      }
    } catch (error: any) {
      console.error('Error fetching hybrid subscription:', error)
      toast.error(error.response?.data?.message || 'Failed to load hybrid subscription details')
    }
  }

  // Admin add-on mutations
  const adminAddAddOnMutation = useMutation(
    ({ userId, type, quantity }: { userId: string; type: 'master' | 'slave'; quantity: number }) =>
      subscriptionAPI.addAddOnAdmin(userId, { type, quantity }),
    {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries('adminUsers')
        fetchHybridSubscription(variables.userId) // Refresh hybrid data
        toast.success('Add-on added successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to add add-on')
      },
    }
  )

  const adminRemoveAddOnMutation = useMutation(
    ({ userId, type, quantity }: { userId: string; type: 'master' | 'slave'; quantity: number }) =>
      subscriptionAPI.removeAddOnAdmin(userId, { type, quantity }),
    {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries('adminUsers')
        fetchHybridSubscription(variables.userId) // Refresh hybrid data
        toast.success('Add-on removed successfully!')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to remove add-on')
      },
    }
  )

  const adminAddAddOn = (userId: string, type: 'master' | 'slave', quantity: number) => {
    adminAddAddOnMutation.mutate({ userId, type, quantity })
  }

  const adminRemoveAddOn = (userId: string, type: 'master' | 'slave', quantity: number) => {
    adminRemoveAddOnMutation.mutate({ userId, type, quantity })
  }

  const handleEdit = (user: User) => {
    setEditingUser(user._id)
    setEditTier(user.tier)
    setEditExpiry(user.expiryDate ? new Date(user.expiryDate).toISOString().split('T')[0] : '')
  }

  const handleEditUserInfo = (user: User) => {
    setEditingUserInfo(user._id)
    setUserEditData({
      name: user.name || '',
      email: user.email || '',
      role: (user as any).role || 'client',
    })
  }

  const handleSaveUserInfo = (userId: string) => {
    updateUserMutation.mutate({
      userId,
      data: {
        name: userEditData.name,
        email: userEditData.email,
        role: userEditData.role,
      },
    })
  }

  const handleBlockUser = (userId: string, isActive: boolean) => {
    if (isActive) {
      if (confirm('Are you sure you want to block this user? They will not be able to login.')) {
        blockUserMutation.mutate(userId)
      }
    } else {
      if (confirm('Are you sure you want to unblock this user?')) {
        unblockUserMutation.mutate(userId)
      }
    }
  }

  // Selection handlers
  const handleSelectUser = (userId: string) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
    setSelectAll(newSelected.size === data?.users?.length)
  }

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers(new Set())
      setSelectAll(false)
    } else {
      const allUserIds = new Set<string>(data?.users?.map((u: User) => u._id) || [])
      setSelectedUsers(allUserIds)
      setSelectAll(true)
    }
  }

  // Bulk operations handlers
  const handleBulkBlock = () => {
    if (selectedUsers.size === 0) {
      toast.error('Please select at least one user')
      return
    }
    if (confirm(`Are you sure you want to block ${selectedUsers.size} user(s)?`)) {
      bulkBlockMutation.mutate(Array.from(selectedUsers))
    }
  }

  const handleBulkUnblock = () => {
    if (selectedUsers.size === 0) {
      toast.error('Please select at least one user')
      return
    }
    if (confirm(`Are you sure you want to unblock ${selectedUsers.size} user(s)?`)) {
      bulkUnblockMutation.mutate(Array.from(selectedUsers))
    }
  }

  const handleBulkDelete = () => {
    if (selectedUsers.size === 0) {
      toast.error('Please select at least one user')
      return
    }
    if (confirm(`Are you sure you want to DELETE ${selectedUsers.size} user(s)? This action cannot be undone and will delete all their accounts and data.`)) {
      bulkDeleteMutation.mutate(Array.from(selectedUsers))
    }
  }

  const handleBulkUpdateTier = () => {
    if (selectedUsers.size === 0) {
      toast.error('Please select at least one user')
      return
    }
    const tier = prompt('Enter tier (BASIC, EA_LICENSE, FULL_ACCESS):')
    if (!tier || !['BASIC', 'EA_LICENSE', 'FULL_ACCESS'].includes(tier)) {
      toast.error('Invalid tier')
      return
    }
    const expiryDate = prompt('Enter expiry date (YYYY-MM-DD) or leave empty:')
    if (confirm(`Update ${selectedUsers.size} user(s) to ${tier} tier?`)) {
      bulkUpdateTierMutation.mutate({
        userIds: Array.from(selectedUsers),
        tier: tier as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS',
        expiryDate: expiryDate || undefined,
      })
    }
  }

  // Export functionality
  const handleExportCSV = () => {
    if (!data?.users || data.users.length === 0) {
      toast.error('No users to export')
      return
    }

    const headers = ['ID', 'Email', 'Name', 'Tier', 'Status', 'Expiry Date', 'Created At']
    const rows = data.users.map((user: User) => [
      user._id,
      user.email,
      user.name || '',
      user.tier,
      user.isActive ? (user.isExpired ? 'Expired' : 'Active') : 'Blocked',
      user.expiryDate ? new Date(user.expiryDate).toLocaleDateString() : 'N/A',
      new Date(user.createdAt).toLocaleDateString(),
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Users exported to CSV successfully!')
  }

  const handleClearFilters = () => {
    setSearch('')
    setTierFilter('')
    setStatusFilter('')
    setUserIdFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const handleSave = (userId: string) => {
    if (!editTier) {
      toast.error('Please select a tier')
      return
    }
    updateTierMutation.mutate({
      userId,
      tier: editTier,
      expiryDate: editExpiry || undefined,
    })
  }

  const handleCancel = () => {
    setEditingUser(null)
    setEditTier('FULL_ACCESS')
    setEditExpiry('')
  }

  if (isLoading) {
    return (
      <div>
        <div className="section-header">
          <h1 className="section-title">Admin - Subscription Management</h1>
          <p className="section-subtitle">Manage user subscriptions, tiers, and discounts</p>
        </div>
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="section-header">
          <h1 className="section-title">Admin - Subscription Management</h1>
          <p className="section-subtitle">Manage user subscriptions, tiers, and discounts</p>
        </div>
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
          Error loading users. Please try refreshing the page.
        </div>
      </div>
    )
  }

  // Check if user is admin (after all hooks and loading/error checks)
  if (!user || user.role !== 'admin') {
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

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin - Subscription Management</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Search & Filters</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleClearFilters}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
            >
              Clear All
            </button>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="flex items-center px-3 py-1 text-sm text-primary-600 hover:text-primary-800"
            >
              <Filter className="w-4 h-4 mr-1" />
              {showAdvancedFilters ? 'Hide' : 'Show'} Advanced
              {showAdvancedFilters ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search by email, name, or user ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Tier</label>
            <select
              value={tierFilter}
              onChange={(e) => {
                setTierFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Tiers</option>
              <option value="BASIC">Basic</option>
              <option value="EA_LICENSE">EA License</option>
              <option value="FULL_ACCESS">Full Access</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters */}
        {showAdvancedFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">User ID</label>
              <input
                type="text"
                value={userIdFilter}
                onChange={(e) => {
                  setUserIdFilter(e.target.value)
                  setPage(1)
                }}
                placeholder="Search by specific user ID..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Registration Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Registration Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Total: {data?.pagination?.total || 0} users
            {selectedUsers.size > 0 && (
              <span className="ml-2 text-primary-600 font-medium">
                ({selectedUsers.size} selected)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Operations Toolbar */}
      {selectedUsers.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-blue-900">
                {selectedUsers.size} user(s) selected
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkBlock}
                disabled={bulkBlockMutation.isLoading}
                className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
              >
                <Ban className="w-4 h-4 inline mr-1" />
                Block
              </button>
              <button
                onClick={handleBulkUnblock}
                disabled={bulkUnblockMutation.isLoading}
                className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                <CheckCircle className="w-4 h-4 inline mr-1" />
                Unblock
              </button>
              <button
                onClick={handleBulkUpdateTier}
                disabled={bulkUpdateTierMutation.isLoading}
                className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
              >
                <Edit className="w-4 h-4 inline mr-1" />
                Update Tier
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isLoading}
                className="px-3 py-1 bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50 text-sm"
              >
                <Trash2 className="w-4 h-4 inline mr-1" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={handleExportCSV}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Download className="w-4 h-4 mr-2" />
          Export to CSV
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expiry Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hybrid
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.users?.map((user: User) => (
                <tr key={user._id} className={`hover:bg-gray-50 ${selectedUsers.has(user._id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user._id)}
                      onChange={() => handleSelectUser(user._id)}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <select
                        value={editTier}
                        onChange={(e) => setEditTier(e.target.value as 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS')}
                        className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="BASIC">Basic</option>
                        <option value="EA_LICENSE">EA License</option>
                        <option value="FULL_ACCESS">Full Access</option>
                      </select>
                    ) : (
                      <div className="flex items-center">
                        {user.tier === 'FULL_ACCESS' ? (
                          <Crown className="w-4 h-4 text-yellow-500 mr-2" />
                        ) : user.tier === 'EA_LICENSE' ? (
                          <Key className="w-4 h-4 text-blue-500 mr-2" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-gray-400 mr-2" />
                        )}
                        <span className="text-sm text-gray-900">
                          {user.tier === 'FULL_ACCESS' ? 'Full Access' : user.tier === 'EA_LICENSE' ? 'EA License' : 'Basic'}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingUser === user._id ? (
                      <input
                        type="date"
                        value={editExpiry}
                        onChange={(e) => setEditExpiry(e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    ) : (
                      <div className="text-sm text-gray-900">
                        {user.expiryDate
                          ? new Date(user.expiryDate).toLocaleDateString()
                          : 'No expiry'}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {user.isExpired ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                          {user.tier === 'BASIC' && user.baseTier ? 'Expired (Moved to Basic)' : 'Expired'}
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          Active
                        </span>
                      )}
                      {!user.isActive ? (
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                          Blocked
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {editingUser === user._id ? (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleSave(user._id)}
                          disabled={updateTierMutation.isLoading}
                          className="inline-flex items-center px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Save className="w-4 h-4 mr-1" />
                          {updateTierMutation.isLoading ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={updateTierMutation.isLoading}
                          className="inline-flex items-center px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/dashboard/admin/users/${user._id}`}
                          className="inline-flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View Details
                        </Link>
                        <button
                          onClick={() => handleEdit(user)}
                          className="inline-flex items-center px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit Tier
                        </button>
                        <button
                          onClick={() => handleEditUserInfo(user)}
                          className="inline-flex items-center px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                        >
                          <UserIcon className="w-4 h-4 mr-1" />
                          Edit User
                        </button>
                        <button
                          onClick={() => handleBlockUser(user._id, user.isActive)}
                          className={`inline-flex items-center px-3 py-1 rounded-lg ${
                            user.isActive
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          <Ban className="w-4 h-4 mr-1" />
                          {user.isActive ? 'Block' : 'Unblock'}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => fetchHybridSubscription(user._id)}
                      className="inline-flex items-center px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                      title="View Hybrid Subscription"
                    >
                      <Settings className="w-4 h-4 mr-1" />
                      Hybrid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.pagination.total)} of{' '}
              {data.pagination.total} users
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Page {page} of {data.pagination.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
                disabled={page === data.pagination.pages}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {data?.users?.length === 0 && (
          <div className="text-center py-8 text-gray-500">No users found</div>
        )}
      </div>

      {/* Hybrid Subscription Modal */}
      {viewingHybrid && hybridData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Hybrid Subscription Details</h2>
                <button
                  onClick={() => {
                    setViewingHybrid(null)
                    setHybridData(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Base Tier */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Base Tier</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Tier</p>
                    <p className="text-lg font-medium text-gray-900">
                      {hybridData.baseTier === 'FULL_ACCESS' ? 'Full Access' : 
                       hybridData.baseTier === 'EA_LICENSE' ? 'EA License' : 'None (Basic)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Base Masters</p>
                    <p className="text-lg font-medium text-gray-900">
                      {hybridData.limits.totalMasters - (hybridData.additionalMasters || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Base Slaves</p>
                    <p className="text-lg font-medium text-gray-900">
                      {hybridData.limits.totalSlaves - (hybridData.additionalSlaves || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Add-ons */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Add-ons</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Additional Masters</span>
                      <span className="text-lg font-medium text-gray-900">
                        {hybridData.additionalMasters || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={addOnQuantity.master}
                        onChange={(e) => setAddOnQuantity({ ...addOnQuantity, master: parseInt(e.target.value) || 1 })}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <button
                        onClick={() => adminAddAddOn(viewingHybrid, 'master', addOnQuantity.master)}
                        disabled={adminAddAddOnMutation.isLoading}
                        className="px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-700 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4 inline mr-1" />
                        Add
                      </button>
                      {(hybridData.additionalMasters || 0) > 0 && (
                        <button
                          onClick={() => adminRemoveAddOn(viewingHybrid, 'master', 1)}
                          disabled={adminRemoveAddOnMutation.isLoading}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          <Minus className="w-4 h-4 inline mr-1" />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-white rounded border border-blue-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Additional Slaves</span>
                      <span className="text-lg font-medium text-gray-900">
                        {hybridData.additionalSlaves || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={addOnQuantity.slave}
                        onChange={(e) => setAddOnQuantity({ ...addOnQuantity, slave: parseInt(e.target.value) || 1 })}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <button
                        onClick={() => adminAddAddOn(viewingHybrid, 'slave', addOnQuantity.slave)}
                        disabled={adminAddAddOnMutation.isLoading}
                        className="px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-700 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4 inline mr-1" />
                        Add
                      </button>
                      {(hybridData.additionalSlaves || 0) > 0 && (
                        <button
                          onClick={() => adminRemoveAddOn(viewingHybrid, 'slave', 1)}
                          disabled={adminRemoveAddOnMutation.isLoading}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          <Minus className="w-4 h-4 inline mr-1" />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Limits */}
              <div className="mb-6 p-4 bg-green-50 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Total Account Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Masters</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {hybridData.limits.totalMasters}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Slaves</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {hybridData.limits.totalSlaves}
                    </p>
                  </div>
                </div>
              </div>

              {/* Subscription Tier & Status */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Subscription Status</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Current Tier</p>
                    <p className="text-lg font-medium text-gray-900">
                      {hybridData.subscriptionTier === 'FULL_ACCESS' ? 'Full Access' : 
                       hybridData.subscriptionTier === 'EA_LICENSE' ? 'EA License' : 'Basic'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Status</p>
                    <p className={`text-lg font-medium ${
                      hybridData.isExpired ? 'text-orange-600' : 
                      hybridData.subscriptionTier === 'BASIC' && hybridData.baseTier ? 'text-red-600' :
                      hybridData.subscriptionTier === 'BASIC' && !hybridData.baseTier ? 'text-gray-600' : 
                      'text-green-600'
                    }`}>
                      {hybridData.isExpired ? 'Expired (Grace Period)' : 
                       hybridData.subscriptionTier === 'BASIC' && hybridData.baseTier ? 'Expired (Moved to Basic)' :
                       hybridData.subscriptionTier === 'BASIC' && !hybridData.baseTier ? 'Basic Tier' : 
                       'Active'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Trial Information */}
              {(hybridData.trialClaimed || hybridData.trialDisabled) && (
                <div className={`mb-6 p-4 rounded-lg border ${
                  hybridData.trialDisabled 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-purple-50 border-purple-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center">
                      <Gift className={`w-4 h-4 mr-2 ${hybridData.trialDisabled ? 'text-red-600' : 'text-purple-600'}`} />
                      Trial Information
                      {hybridData.trialDisabled && (
                        <span className="ml-2 px-2 py-0.5 bg-red-200 text-red-800 rounded text-xs font-medium">
                          Disabled
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      {hybridData.trialDisabled ? (
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to enable trial for this user? This will allow them to claim a free trial.')) {
                              setResettingTrial(viewingHybrid!)
                              resetTrialMutation.mutate(viewingHybrid!)
                            }
                          }}
                          disabled={resettingTrial === viewingHybrid}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4 inline mr-1" />
                          Enable Trial
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to reset the trial?')) {
                                resetTrialMutation.mutate(viewingHybrid!)
                              }
                            }}
                            disabled={resettingTrial === viewingHybrid}
                            className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50"
                          >
                            <RotateCcw className="w-4 h-4 inline mr-1" />
                            Reset Trial
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to disable/revoke the trial? This will immediately remove the trial, move the user to BASIC tier, and prevent them from claiming trial again.')) {
                                setDisablingTrial(viewingHybrid!)
                                disableTrialMutation.mutate(viewingHybrid!)
                              }
                            }}
                            disabled={disablingTrial === viewingHybrid}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                          >
                            <Ban className="w-4 h-4 inline mr-1" />
                            Disable Trial
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {hybridData.trialClaimed && hybridData.trialExpiryDate && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Trial Expiry</p>
                        <p className="text-lg font-medium text-gray-900">
                          {new Date(hybridData.trialExpiryDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Days Remaining</p>
                        <p className="text-lg font-medium text-gray-900">
                          {Math.max(0, Math.ceil((new Date(hybridData.trialExpiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))}
                        </p>
                      </div>
                    </div>
                  )}
                  {hybridData.trialDisabled && !hybridData.trialClaimed && (
                    <p className="text-sm text-red-700">
                      Trial has been disabled. User cannot claim a free trial until it is re-enabled.
                    </p>
                  )}
                </div>
              )}

              {/* Grace Period */}
              {hybridData.isExpired && hybridData.gracePeriodEndDate && (
                <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Grace Period</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Grace Period Ends</p>
                      <p className="text-lg font-medium text-gray-900">
                        {new Date(hybridData.gracePeriodEndDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Days Remaining</p>
                      <p className="text-lg font-medium text-orange-600">
                        {Math.max(0, Math.ceil((new Date(hybridData.gracePeriodEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Renewal Date */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 text-gray-600 mr-2" />
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Renewal Date</p>
                      <p className="text-lg font-medium text-gray-900">
                        {hybridData.renewalDate
                          ? new Date(hybridData.renewalDate).toLocaleDateString()
                          : 'Not set'}
                      </p>
                    </div>
                  </div>
                  {hybridData.renewalDate && (
                    <div className="text-sm text-gray-600">
                      {Math.ceil((new Date(hybridData.renewalDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days remaining
                    </div>
                  )}
                </div>
              </div>

              {/* Client Discount */}
              <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center">
                    <Star className="w-4 h-4 mr-2 text-green-600" />
                    Client Discount
                  </h3>
                  {editingClientDiscount === viewingHybrid ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setClientStatusMutation.mutate({
                            userId: viewingHybrid!,
                            isClient: clientDiscount.isClient,
                            discountPercentage: clientDiscount.discountPercentage,
                          })
                        }}
                        disabled={setClientStatusMutation.isLoading}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingClientDiscount(null)
                          setClientDiscount({ isClient: hybridData.isClient || false, discountPercentage: hybridData.clientDiscountPercentage || 5 })
                        }}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingClientDiscount(viewingHybrid)
                        setClientDiscount({ isClient: hybridData.isClient || false, discountPercentage: hybridData.clientDiscountPercentage || 5 })
                      }}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                    >
                      <Edit className="w-4 h-4 inline mr-1" />
                      Edit
                    </button>
                  )}
                </div>
                {editingClientDiscount === viewingHybrid ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={clientDiscount.isClient}
                        onChange={(e) => setClientDiscount({ ...clientDiscount, isClient: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label className="text-sm text-gray-700">Mark as Client</label>
                    </div>
                    {clientDiscount.isClient && (
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Discount Percentage</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={clientDiscount.discountPercentage}
                          onChange={(e) => setClientDiscount({ ...clientDiscount, discountPercentage: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Client Status</p>
                      <p className="text-lg font-medium text-gray-900">
                        {hybridData.isClient ? 'Yes' : 'No'}
                      </p>
                    </div>
                    {hybridData.isClient && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Discount</p>
                        <p className="text-lg font-medium text-gray-900">
                          {hybridData.clientDiscountPercentage || 5}%
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Special Discount */}
              <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center">
                    <Gift className="w-4 h-4 mr-2 text-yellow-600" />
                    Special Discount (Promotional)
                  </h3>
                  {editingSpecialDiscount === viewingHybrid ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (specialDiscount.percentage > 0 && specialDiscount.expiryDate) {
                            setSpecialDiscountMutation.mutate({
                              userId: viewingHybrid!,
                              percentage: specialDiscount.percentage,
                              expiryDate: specialDiscount.expiryDate,
                              description: specialDiscount.description || undefined,
                            })
                          } else {
                            toast.error('Please enter discount percentage and expiry date')
                          }
                        }}
                        disabled={setSpecialDiscountMutation.isLoading}
                        className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingSpecialDiscount(null)
                          setSpecialDiscount({ percentage: 0, expiryDate: '', description: '' })
                        }}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingSpecialDiscount(viewingHybrid)
                          setSpecialDiscount({
                            percentage: hybridData.specialDiscountPercentage || 0,
                            expiryDate: hybridData.specialDiscountExpiryDate ? new Date(hybridData.specialDiscountExpiryDate).toISOString().split('T')[0] : '',
                            description: hybridData.specialDiscountDescription || '',
                          })
                        }}
                        className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                      >
                        <Edit className="w-4 h-4 inline mr-1" />
                        {hybridData.specialDiscountPercentage > 0 ? 'Edit' : 'Add'}
                      </button>
                      {hybridData.specialDiscountPercentage > 0 && (
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to remove the special discount?')) {
                              removeSpecialDiscountMutation.mutate(viewingHybrid!)
                            }
                          }}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          <X className="w-4 h-4 inline mr-1" />
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {editingSpecialDiscount === viewingHybrid ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Discount Percentage</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={specialDiscount.percentage}
                        onChange={(e) => setSpecialDiscount({ ...specialDiscount, percentage: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Expiry Date</label>
                      <input
                        type="date"
                        value={specialDiscount.expiryDate}
                        onChange={(e) => setSpecialDiscount({ ...specialDiscount, expiryDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Description (e.g., "Festival Offer 2025")</label>
                      <input
                        type="text"
                        value={specialDiscount.description}
                        onChange={(e) => setSpecialDiscount({ ...specialDiscount, description: e.target.value })}
                        placeholder="Promotional description"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    {hybridData.specialDiscountPercentage > 0 ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Discount</p>
                          <p className="text-lg font-medium text-gray-900">
                            {hybridData.specialDiscountPercentage}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Expires</p>
                          <p className="text-lg font-medium text-gray-900">
                            {hybridData.specialDiscountExpiryDate
                              ? new Date(hybridData.specialDiscountExpiryDate).toLocaleDateString()
                              : 'Not set'}
                          </p>
                        </div>
                        {hybridData.specialDiscountDescription && (
                          <div className="col-span-2">
                            <p className="text-sm text-gray-600 mb-1">Description</p>
                            <p className="text-sm font-medium text-gray-900">
                              {hybridData.specialDiscountDescription}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No special discount set</p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => {
                    setViewingHybrid(null)
                    setHybridData(null)
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Edit Modal */}
      {editingUserInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Edit User Information</h2>
                <button
                  onClick={() => {
                    setEditingUserInfo(null)
                    setUserEditData({ name: '', email: '', role: 'client' })
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <UserIcon className="w-4 h-4 inline mr-1" />
                    Name
                  </label>
                  <input
                    type="text"
                    value={userEditData.name}
                    onChange={(e) => setUserEditData({ ...userEditData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="User name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={userEditData.email}
                    onChange={(e) => setUserEditData({ ...userEditData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Shield className="w-4 h-4 inline mr-1" />
                    Role
                  </label>
                  <select
                    value={userEditData.role}
                    onChange={(e) => setUserEditData({ ...userEditData, role: e.target.value as 'admin' | 'client' | 'viewer' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="client">Client</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setEditingUserInfo(null)
                    setUserEditData({ name: '', email: '', role: 'client' })
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveUserInfo(editingUserInfo)}
                  disabled={updateUserMutation.isLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {updateUserMutation.isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

