'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from 'react-query'
import { historyAPI } from '@/lib/api'
import { Search, Filter, Calendar, User, Clock, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { authService } from '@/lib/auth'

interface HistoryEntry {
  _id: string
  userId: {
    _id: string
    email: string
    name: string
  }
  actionType: string
  description: string
  oldValue?: any
  newValue?: any
  performedBy?: {
    _id: string
    email: string
    name: string
  }
  performedByEmail?: string
  metadata?: Record<string, any>
  createdAt: string
}

export default function AdminHistoryPage() {
  // Hooks must be called before any conditional returns
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [actionTypeFilter, setActionTypeFilter] = useState('')
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const user = authService.getCurrentUser()
  
  // Check if user is admin (after hooks)
  if (user?.role !== 'admin') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <div className="w-6 h-6 text-red-600 mr-2">⚠️</div>
          <h2 className="text-xl font-semibold text-red-900">Access Denied</h2>
        </div>
        <p className="text-red-700 mt-2">You must be an admin to access this page.</p>
      </div>
    )
  }

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
        searchTimeoutRef.current = null
      }
    }
  }, [searchInput])

  // Fetch history
  const { data, isLoading, error } = useQuery(
    ['adminHistory', page, search, actionTypeFilter],
    () =>
      historyAPI.getAllHistoryAdmin({
        skip: (page - 1) * 50,
        limit: 50,
        search: search || undefined,
        actionType: actionTypeFilter || undefined,
      }).then(res => res.data.data),
    {
      retry: 2,
    }
  )

  const toggleExpand = (entryId: string) => {
    const newExpanded = new Set(expandedEntries)
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId)
    } else {
      newExpanded.add(entryId)
    }
    setExpandedEntries(newExpanded)
  }

  const getActionTypeColor = (actionType: string) => {
    if (actionType.includes('subscription') || actionType.includes('tier')) {
      return 'bg-blue-100 text-blue-800'
    }
    if (actionType.includes('trial')) {
      return 'bg-purple-100 text-purple-800'
    }
    if (actionType.includes('account')) {
      return 'bg-green-100 text-green-800'
    }
    if (actionType.includes('copy_link')) {
      return 'bg-yellow-100 text-yellow-800'
    }
    if (actionType.includes('addon')) {
      return 'bg-indigo-100 text-indigo-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  const formatActionType = (actionType: string) => {
    return actionType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  if (isLoading) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">User History & Audit Trail</h1>
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">User History & Audit Trail</h1>
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
          Error loading history. Please try refreshing the page.
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">User History & Audit Trail</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value)
                }}
                placeholder="Search by email, name, or user ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Action</label>
            <select
              value={actionTypeFilter}
              onChange={(e) => {
                setActionTypeFilter(e.target.value)
                setPage(1)
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">All Actions</option>
              <option value="subscription_tier_changed">Subscription Tier Changed</option>
              <option value="trial_claimed">Trial Claimed</option>
              <option value="trial_reset">Trial Reset</option>
              <option value="account_added">Account Added</option>
              <option value="account_updated">Account Updated</option>
              <option value="account_deleted">Account Deleted</option>
              <option value="copy_link_created">Copy Link Created</option>
              <option value="copy_link_updated">Copy Link Updated</option>
              <option value="copy_link_deleted">Copy Link Deleted</option>
              <option value="addon_added">Add-on Added</option>
              <option value="addon_removed">Add-on Removed</option>
            </select>
          </div>
          <div className="flex items-end">
            <div className="text-sm text-gray-600">
              Total: {data?.total || 0} entries
            </div>
          </div>
        </div>
      </div>

      {/* History List */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performed By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.history?.map((entry: HistoryEntry) => (
                <tr key={entry._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 text-gray-400 mr-2" />
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <User className="w-4 h-4 text-gray-400 mr-2" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {entry.userId?.name || 'Unknown'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {entry.userId?.email || entry.userId?._id || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionTypeColor(entry.actionType)}`}>
                      {formatActionType(entry.actionType)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{entry.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {entry.performedBy ? (
                      <div className="text-sm text-gray-900">
                        {entry.performedBy.name || entry.performedByEmail || 'Admin'}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">System/User</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleExpand(entry._id)}
                      className="text-primary-600 hover:text-primary-800"
                    >
                      {expandedEntries.has(entry._id) ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded Details */}
        {data?.history?.map((entry: HistoryEntry) => (
          expandedEntries.has(entry._id) && (
            <div key={`details-${entry._id}`} className="bg-gray-50 border-t border-gray-200 px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {entry.oldValue && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Old Value:</h4>
                    <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-auto max-h-40">
                      {JSON.stringify(entry.oldValue, null, 2)}
                    </pre>
                  </div>
                )}
                {entry.newValue && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">New Value:</h4>
                    <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-auto max-h-40">
                      {JSON.stringify(entry.newValue, null, 2)}
                    </pre>
                  </div>
                )}
                {entry.metadata && (
                  <div className="md:col-span-2">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Metadata:</h4>
                    <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-auto max-h-40">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )
        ))}

        {/* Pagination */}
        {data?.total && data.total > 50 && (
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, data.total)} of {data.total} entries
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
                Page {page} of {Math.ceil(data.total / 50)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(data.total / 50)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {data?.history?.length === 0 && (
          <div className="text-center py-8 text-gray-500">No history entries found</div>
        )}
      </div>
    </div>
  )
}

