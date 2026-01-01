'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from 'react-query'
import { useParams, useRouter } from 'next/navigation'
import { subscriptionAPI, hybridSubscriptionAPI, paymentAPI, historyAPI, userAPI } from '@/lib/api'
import { 
  User, Mail, Calendar, CreditCard, FileText, Activity, 
  CheckCircle, XCircle, Clock, DollarSign, Receipt, 
  AlertCircle, Crown, Key, ArrowLeft, Download, Eye, Trash2, Ban, Shield, X
} from 'lucide-react'
import { authService } from '@/lib/auth'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function AdminUserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const currentUser = authService.getCurrentUser()
  const userId = params.userId as string

  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'invoices' | 'activity'>('overview')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Check if user is admin - do this after all hooks
  const isAdmin = currentUser?.role === 'admin'

  // Fetch user subscription data - get all users and find the one matching userId
  const { data: userListData, isLoading: userLoading } = useQuery(
    ['adminUsers'],
    () => subscriptionAPI.listUsers({ page: 1, limit: 1000 }).then(res => res.data.data)
  )
  
  const userData = userListData?.users?.find((u: any) => u._id === userId)

  // Fetch hybrid subscription
  const { data: hybridSubscription } = useQuery(
    ['hybridSubscription', userId],
    () => hybridSubscriptionAPI.getAdminHybridSubscription(userId).then(res => res.data.data),
    { enabled: !!userId }
  )

  // Fetch payment history (admin view)
  const { data: paymentHistory } = useQuery(
    ['adminPaymentHistory', userId],
    () => paymentAPI.getAdminUserPaymentHistory(userId, { limit: 50 }).then(res => res.data.data),
    { enabled: !!userId }
  )

  // Fetch invoices (admin view)
  const { data: invoices } = useQuery(
    ['adminInvoices', userId],
    () => paymentAPI.getAdminUserInvoices(userId, { limit: 50 }).then(res => res.data.data),
    { enabled: !!userId }
  )

  // Fetch user activity/history
  const { data: userHistory } = useQuery(
    ['userHistory', userId],
    () => historyAPI.getUserHistoryAdmin(userId, { limit: 50 }).then(res => res.data.data),
    { enabled: !!userId }
  )

  // Delete user mutation
  const deleteUserMutation = useMutation(
    (userId: string) => userAPI.deleteUser(userId),
    {
      onSuccess: () => {
        toast.success('User deleted successfully')
        router.push('/dashboard/admin/subscriptions')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to delete user')
        setDeleting(false)
      },
    }
  )

  // Block user mutation
  const blockUserMutation = useMutation(
    (userId: string) => userAPI.blockUser(userId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('adminUsers')
        queryClient.invalidateQueries(['adminUsers'])
        toast.success('User blocked successfully')
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
        queryClient.invalidateQueries(['adminUsers'])
        toast.success('User unblocked successfully')
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.message || 'Failed to unblock user')
      },
    }
  )

  const handleDeleteUser = async () => {
    setDeleting(true)
    deleteUserMutation.mutate(userId)
  }

  const handleBlockUser = () => {
    if (userData?.isActive) {
      if (confirm('Are you sure you want to block this user? They will not be able to login.')) {
        blockUserMutation.mutate(userId)
      }
    } else {
      if (confirm('Are you sure you want to unblock this user?')) {
        unblockUserMutation.mutate(userId)
      }
    }
  }

  if (userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading user data...</p>
        </div>
      </div>
    )
  }

  if (!userData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-700">User not found</p>
        <Link href="/dashboard/admin/subscriptions" className="text-blue-600 hover:underline mt-2 inline-block">
          ← Back to Users
        </Link>
      </div>
    )
  }

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100) // Convert cents to dollars
  }

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, { bg: string; text: string }> = {
      succeeded: { bg: 'bg-green-100', text: 'text-green-800' },
      failed: { bg: 'bg-red-100', text: 'text-red-800' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      processing: { bg: 'bg-blue-100', text: 'text-blue-800' },
      paid: { bg: 'bg-green-100', text: 'text-green-800' },
      overdue: { bg: 'bg-red-100', text: 'text-red-800' },
      sent: { bg: 'bg-blue-100', text: 'text-blue-800' },
      draft: { bg: 'bg-gray-100', text: 'text-gray-800' },
    }

    const colors = statusColors[status.toLowerCase()] || { bg: 'bg-gray-100', text: 'text-gray-800' }

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/admin/subscriptions"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="section-title">{userData.name || 'User'}</h1>
            <p className="section-subtitle">{userData.email}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {userData.isExpired ? (
            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
              Expired
            </span>
          ) : userData.isActive ? (
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              Active
            </span>
          ) : (
            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
              Blocked
            </span>
          )}
          <button
            onClick={handleBlockUser}
            disabled={blockUserMutation.isLoading || unblockUserMutation.isLoading}
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              userData.isActive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            } disabled:opacity-50`}
          >
            <Ban className="w-4 h-4 inline mr-1" />
            {userData.isActive ? 'Block User' : 'Unblock User'}
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-3 py-1 bg-red-600 text-white rounded-full text-sm font-medium hover:bg-red-700"
          >
            <Trash2 className="w-4 h-4 inline mr-1" />
            Delete User
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: User },
            { id: 'payments', label: 'Payments', icon: CreditCard },
            { id: 'invoices', label: 'Invoices', icon: FileText },
            { id: 'activity', label: 'Activity', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* User Profile */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" />
                User Profile
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium">{userData.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Name</p>
                  <p className="font-medium">{userData.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Account Status</p>
                  <p className="font-medium">{userData.isActive ? 'Active' : 'Inactive'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Member Since</p>
                  <p className="font-medium">{formatDate(userData.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Subscription Details */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                {userData.tier === 'FULL_ACCESS' ? (
                  <Crown className="w-5 h-5 mr-2 text-yellow-500" />
                ) : userData.tier === 'EA_LICENSE' ? (
                  <Key className="w-5 h-5 mr-2 text-blue-500" />
                ) : (
                  <AlertCircle className="w-5 h-5 mr-2 text-gray-400" />
                )}
                Subscription Details
              </h2>
              {hybridSubscription && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Current Tier</p>
                      <p className="font-medium text-lg">
                        {hybridSubscription.subscriptionTier === 'FULL_ACCESS' ? 'Full Access' :
                         hybridSubscription.subscriptionTier === 'EA_LICENSE' ? 'EA License' : 'Basic'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Base Tier</p>
                      <p className="font-medium">
                        {hybridSubscription.baseTier === 'FULL_ACCESS' ? 'Full Access' :
                         hybridSubscription.baseTier === 'EA_LICENSE' ? 'EA License' : 'None'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <p className={`font-medium ${hybridSubscription.isExpired ? 'text-red-600' : 'text-green-600'}`}>
                        {hybridSubscription.isExpired ? 'Expired' : 'Active'}
                      </p>
                    </div>
                  </div>
                  {hybridSubscription.renewalDate && (
                    <div>
                      <p className="text-sm text-gray-600">Renewal Date</p>
                      <p className="font-medium">{formatDate(hybridSubscription.renewalDate)}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-sm text-gray-600">Total Masters</p>
                      <p className="font-medium text-2xl">{hybridSubscription.limits.totalMasters}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Slaves</p>
                      <p className="font-medium text-2xl">{hybridSubscription.limits.totalSlaves}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Payments</p>
                    <p className="text-2xl font-bold mt-1">
                      {paymentHistory?.payments?.filter((p: any) => p.status === 'succeeded').length || 0}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Invoices</p>
                    <p className="text-2xl font-bold mt-1">{invoices?.invoices?.length || 0}</p>
                  </div>
                  <Receipt className="w-8 h-8 text-blue-500" />
                </div>
              </div>
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Spent</p>
                    <p className="text-2xl font-bold mt-1">
                      {paymentHistory?.payments
                        ?.filter((p: any) => p.status === 'succeeded')
                        .reduce((sum: number, p: any) => sum + (p.amount || 0), 0) / 100 || 0}
                      {' '}USD
                    </p>
                  </div>
                  <CreditCard className="w-8 h-8 text-purple-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Payment History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gateway
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transaction ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paymentHistory?.payments?.length > 0 ? (
                    paymentHistory.payments.map((payment: any) => (
                      <tr key={payment._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(payment.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {formatCurrency(payment.amount, payment.currency)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {payment.paymentMethod?.replace('_', ' ').toUpperCase() || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {payment.gateway?.toUpperCase() || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(payment.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                          {payment.gatewayTransactionId?.substring(0, 20) || 'N/A'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                        No payment history found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Invoice History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issue Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices?.invoices?.length > 0 ? (
                    invoices.invoices.map((invoice: any) => (
                      <tr key={invoice._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(invoice.issueDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(invoice.dueDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {formatCurrency(invoice.total, invoice.currency)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(invoice.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => {
                              // TODO: Implement invoice view/download
                              toast('Invoice view coming soon')
                            }}
                            className="text-primary-600 hover:text-primary-800 flex items-center space-x-1"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                        No invoices found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Account Activity</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {userHistory?.history?.length > 0 ? (
                userHistory.history.map((activity: any) => (
                  <div key={activity._id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {activity.actionType?.replace(/_/g, ' ').toLowerCase()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{formatDate(activity.createdAt)}</p>
                        {activity.performedByEmail && (
                          <p className="text-xs text-gray-400 mt-1">by {activity.performedByEmail}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-center text-sm text-gray-500">
                  No activity found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete User Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-red-900">Delete User</h2>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  disabled={deleting}
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-6">
                <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <p className="text-gray-700 text-center mb-4">
                  Are you sure you want to delete this user? This action cannot be undone.
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-red-900 mb-2">This will permanently delete:</p>
                  <ul className="text-sm text-red-800 list-disc list-inside space-y-1">
                    <li>User account: {userData?.email}</li>
                    <li>All MT5 accounts ({userData?.tier === 'FULL_ACCESS' ? 'All' : userData?.tier === 'EA_LICENSE' ? 'EA accounts' : 'None'})</li>
                    <li>All copy trading links</li>
                    <li>Stripe subscription (if exists)</li>
                    <li>Payment history (marked as deleted)</li>
                  </ul>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

