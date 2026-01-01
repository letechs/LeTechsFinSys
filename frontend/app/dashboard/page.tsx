'use client'

import { useQuery } from 'react-query'
import { userAPI } from '@/lib/api'
import { TrendingUp, CreditCard, Activity, DollarSign } from 'lucide-react'
import { useAccounts } from '@/lib/hooks/useAccounts'

export default function DashboardPage() {
  // Use shared accounts hook - ensures consistent data across all pages
  const {
    accounts,
    masterAccounts,
    slaveAccounts,
    limits,
    isBasicTier,
  } = useAccounts()
  
  const { data: subscription } = useQuery('subscription', () => userAPI.getMySubscription().then(res => res.data.data))

  const stats = [
    {
      name: 'Total Accounts',
      value: accounts?.length || 0,
      icon: CreditCard,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
    },
    {
      name: 'Active Subscription',
      value: subscription ? 'Active' : 'None',
      icon: TrendingUp,
      color: 'text-success-600',
      bgColor: 'bg-success-50',
    },
    {
      name: 'Online Accounts',
      value: accounts?.filter((acc: any) => acc.connectionStatus === 'online').length || 0,
      icon: Activity,
      color: 'text-info-600',
      bgColor: 'bg-info-50',
    },
    {
      name: 'Total Equity',
      value: `$${accounts?.reduce((sum: number, acc: any) => sum + (acc.equity || 0), 0).toFixed(2) || '0.00'}`,
      icon: DollarSign,
      color: 'text-warning-600',
      bgColor: 'bg-warning-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <h1 className="section-title">Dashboard</h1>
        <p className="section-subtitle">Overview of your trading accounts and activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="card card-hover p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600 mb-1">{stat.name}</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`${stat.bgColor} p-3 rounded-xl`}>
                <stat.icon className={`w-6 h-6 sm:w-7 sm:h-7 ${stat.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Accounts */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Recent Accounts</h2>
          <p className="text-sm text-gray-600 mt-1">Your most recently added MT5 accounts</p>
        </div>
        <div className="p-6">
          {accounts && accounts.length > 0 ? (
            <div className="space-y-3">
              {accounts.slice(0, 5).map((account: any) => (
                <div
                  key={account._id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-primary-50/50 transition-colors"
                >
                  <div className="flex-1 mb-3 sm:mb-0">
                    <p className="font-semibold text-gray-900 mb-1">{account.accountName}</p>
                    <p className="text-sm text-gray-600">
                      {account.broker} - {account.loginId}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span
                      className={`badge ${
                        account.connectionStatus === 'online'
                          ? 'badge-success'
                          : 'badge-gray'
                      }`}
                    >
                      {account.connectionStatus}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                      ${account.equity?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium mb-1">No accounts yet</p>
              <p className="text-sm text-gray-500">
                Create your first MT5 account to get started with copy trading
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
