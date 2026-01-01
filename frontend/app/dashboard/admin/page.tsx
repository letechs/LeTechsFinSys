'use client'

import { useQuery } from 'react-query'
import { adminAPI } from '@/lib/api'
import { authService } from '@/lib/auth'
import { 
  Users, DollarSign, TrendingUp, Calendar, CreditCard, 
  AlertCircle, UserPlus, Clock, Activity, Shield
} from 'lucide-react'
import Link from 'next/link'
import { useWebSocket } from '@/lib/hooks/useWebSocket'

export default function AdminDashboardPage() {
  const user = authService.getCurrentUser()
  
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

  // Fetch dashboard statistics
  const { data, isLoading, error } = useQuery(
    'adminDashboardStats',
    () => adminAPI.getDashboardStats().then(res => res.data.data),
    {
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  )

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
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Admin Dashboard</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-gray-600 font-medium">Loading dashboard statistics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="section-header">
          <h1 className="section-title">Admin Dashboard</h1>
        </div>
        <div className="bg-error-50 border border-error-200 text-error-700 px-4 py-3 rounded-lg">
          Error loading dashboard statistics. Please try refreshing the page.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="section-title">Admin Dashboard</h1>
            <p className="section-subtitle">Overview of system statistics and activities</p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-primary-600" />
            <span className="text-sm text-gray-600 font-medium">Administrator Panel</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Users */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{data?.users?.total || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                {data?.users?.active || 0} active, {data?.users?.blocked || 0} blocked
              </p>
            </div>
            <Users className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Subscriptions</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{data?.subscriptions?.active || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                {data?.subscriptions?.expiring?.length || 0} expiring soon
              </p>
            </div>
            <Activity className="w-12 h-12 text-green-500" />
          </div>
        </div>

        {/* Total Revenue */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatCurrency(data?.revenue?.total || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {formatCurrency(data?.revenue?.yearly || 0)} this year
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-yellow-500" />
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatCurrency(data?.revenue?.monthly || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">This month</p>
            </div>
            <TrendingUp className="w-12 h-12 text-purple-500" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Registrations */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <UserPlus className="w-5 h-5 mr-2" />
              Recent Registrations
            </h2>
            <span className="text-sm text-gray-500">
              {data?.users?.recent || 0} in last 7 days
            </span>
          </div>
          <div className="p-6">
            {data?.recentRegistrations && data.recentRegistrations.length > 0 ? (
              <div className="space-y-3">
                {data.recentRegistrations.slice(0, 5).map((user: any) => (
                  <div
                    key={user._id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{user.name || 'N/A'}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{formatDate(user.createdAt)}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        user.tier === 'FULL_ACCESS' ? 'bg-yellow-100 text-yellow-800' :
                        user.tier === 'EA_LICENSE' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.tier || 'BASIC'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No recent registrations</p>
            )}
          </div>
        </div>

        {/* Expiring Subscriptions */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Expiring Subscriptions
            </h2>
            <span className="text-sm text-orange-600 font-medium">
              Next 7 days
            </span>
          </div>
          <div className="p-6">
            {data?.subscriptions?.expiring && data.subscriptions.expiring.length > 0 ? (
              <div className="space-y-3">
                {data.subscriptions.expiring.map((sub: any) => (
                  <div
                    key={sub._id}
                    className="flex items-center justify-between p-3 border border-orange-200 bg-orange-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{sub.name || 'N/A'}</p>
                      <p className="text-sm text-gray-500">{sub.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-orange-600 font-medium">
                        {formatDate(sub.renewalDate)}
                      </p>
                      <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-800">
                        {sub.tier}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No subscriptions expiring soon</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="bg-white rounded-lg shadow border border-gray-200 mb-8">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <CreditCard className="w-5 h-5 mr-2" />
            Recent Payments
          </h2>
          <Link
            href="/dashboard/admin/subscriptions"
            className="text-sm text-primary-600 hover:text-primary-800"
          >
            View All →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.recentPayments && data.recentPayments.length > 0 ? (
                data.recentPayments.map((payment: any) => (
                  <tr key={payment._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {payment.user?.name || 'N/A'}
                        </p>
                        <p className="text-sm text-gray-500">{payment.user?.email || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {formatCurrency(payment.amount, payment.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                    No recent payments
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription Tier Distribution */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Subscription Tier Distribution</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Basic</p>
              <p className="text-3xl font-bold text-gray-900">{data?.tierDistribution?.BASIC || 0}</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-gray-600 mb-2">EA License</p>
              <p className="text-3xl font-bold text-gray-900">{data?.tierDistribution?.EA_LICENSE || 0}</p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm font-medium text-gray-600 mb-2">Full Access</p>
              <p className="text-3xl font-bold text-gray-900">{data?.tierDistribution?.FULL_ACCESS || 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

