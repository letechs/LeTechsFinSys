'use client'

import { useQuery } from 'react-query'
import { userAPI } from '@/lib/api'
import { Download, FileCode, CheckCircle, AlertCircle } from 'lucide-react'
import { authService } from '@/lib/auth'
import { useSubscriptionTier } from '@/components/FeatureGate'
import { useWebSocket } from '@/lib/hooks/useWebSocket'
import Link from 'next/link'

// Get backend API URL (without /api suffix) for EA configuration
const getBackendUrl = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
  // Remove trailing slashes and /api if present
  return apiUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

export default function EADownloadPage() {
  const { tier, isExpired } = useSubscriptionTier()
  const user = authService.getCurrentUser()

  // Fetch user's MT5 accounts
  const { data: accounts } = useQuery('myAccounts', () =>
    userAPI.getMyAccounts().then(res => res.data.data),
    {
      retry: 2,
    }
  )

  // Maintain WebSocket listeners
  useWebSocket({})

  const handleDownloadEA = (eaType: 'license' | 'full') => {
    if (eaType === 'full') {
      // Full Access EA is not yet completed
      alert('Full Access EA version is still under development. Please use the EA License version for now.')
      return
    }
    
    // EA License version (only completed version)
    // EA files are served from public/ea/ directory
    const fileName = 'CopyTradingEA_License.ex5'
    const fileUrl = `/ea/${fileName}`
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <h1 className="section-title">EA Download</h1>
        <p className="section-subtitle">Download the Expert Advisor for your subscription tier</p>
      </div>

      {/* Tier Status */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Your Subscription Tier</h2>
            <p className="text-sm text-gray-600 mt-1">
              Download the appropriate EA based on your subscription tier
            </p>
          </div>
          {isExpired && (
            <span className="badge badge-error">
              Subscription Expired
            </span>
          )}
        </div>

        <div className="mt-4">
          <p className="text-lg font-medium text-gray-900 mb-2">
            Current Tier: <span className="text-primary-600">{tier === 'FULL_ACCESS' ? 'Full Access' : tier === 'EA_LICENSE' ? 'EA License' : 'Basic'}</span>
          </p>
          {isExpired && (
            <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                <p className="text-sm text-red-800">
                  Your subscription has expired. Please renew to download EA.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* EA License Tier Download */}
      {tier === 'EA_LICENSE' && !isExpired && (
        <div className="card border-2 border-primary-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">EA License Version</h3>
              <p className="text-gray-600 mb-4">
                Local copy trading with minimal backend usage. Perfect for users who only need copy trading functionality.
              </p>
            </div>
            <span className="badge badge-primary">
              Recommended
            </span>
          </div>

          <div className="space-y-2 mb-6">
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Local copy trading (master → slave)
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              License validation via API (once per day)
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Minimal backend usage
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Works offline with cached license
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="font-medium text-gray-900 mb-3">Configuration Required:</h4>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Backend API URL:</strong> <code className="bg-gray-200 px-2 py-1 rounded">{getBackendUrl()}</code>
              </p>
              <p className="text-sm text-gray-700 mb-2">
                <strong>User ID:</strong> <code className="bg-gray-200 px-2 py-1 rounded">{user?._id || 'Your User ID'}</code>
              </p>
              <p className="text-sm text-gray-700">
                <strong>MT5 Account Numbers:</strong>{' '}
                {accounts && accounts.length > 0 ? (
                  <code className="bg-gray-200 px-2 py-1 rounded">
                    {accounts.map((acc: any) => acc.loginId).join(', ')}
                  </code>
                ) : (
                  <span className="text-gray-500">Add MT5 accounts first</span>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={() => handleDownloadEA('license')}
            className="w-full md:w-auto inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-5 h-5 mr-2" />
            Download EA License Version
          </button>
        </div>
      )}

      {/* Full Access Tier Download */}
      {tier === 'FULL_ACCESS' && !isExpired && (
        <div className="bg-white rounded-lg shadow border-2 border-green-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Full Access Version</h3>
              <p className="text-gray-600 mb-4">
                Complete platform access with web terminal, real-time sync, and all features.
              </p>
            </div>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
              Coming Soon
            </span>
          </div>

          <div className="space-y-2 mb-6">
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Everything from EA License
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Web terminal integration
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Real-time backend sync
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Dashboard & analytics
            </div>
            <div className="flex items-center text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              Advanced features
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">Full Access EA Under Development</p>
                <p className="text-sm text-blue-700">
                  The Full Access EA version is currently under development. For now, please use the EA License version which includes all core copy trading features.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => handleDownloadEA('full')}
            className="w-full md:w-auto inline-flex items-center px-6 py-3 bg-gray-400 text-white rounded-lg cursor-not-allowed opacity-60"
            disabled
          >
            <Download className="w-5 h-5 mr-2" />
            Download Full Access Version (Coming Soon)
          </button>
        </div>
      )}

      {/* Basic Tier Message */}
      {tier === 'BASIC' && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center mb-4">
            <AlertCircle className="w-6 h-6 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Basic Tier - EA Download Not Available</h3>
          </div>
          <p className="text-gray-700 mb-4">
            EA download is only available for EA License and Full Access tiers. Please upgrade your subscription to access the EA.
          </p>
          <Link
            href="/dashboard/subscription"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            View Subscription Options
          </Link>
        </div>
      )}

      {/* Upgrade Prompt for EA License Users */}
      {tier === 'EA_LICENSE' && !isExpired && (
        <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg border border-primary-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Want More Features?</h3>
          <p className="text-gray-700 mb-4">
            Upgrade to Full Access to get web terminal, real-time analytics, and advanced features.
          </p>
          <Link
            href="/dashboard/subscription"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Upgrade to Full Access
          </Link>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6 mt-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FileCode className="w-5 h-5 mr-2" />
          Setup Instructions
        </h3>
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <p className="font-medium mb-2">1. Download EA File</p>
            <p className="text-gray-600">Click the download button above to get your EA file.</p>
          </div>
          <div>
            <p className="font-medium mb-2">2. Add API URL to MT5</p>
            <p className="text-gray-600">
              In MT5, go to <strong>Tools → Options → Expert Advisors</strong>, check "Allow WebRequest for listed URL", and add your backend API URL.
            </p>
          </div>
          <div>
            <p className="font-medium mb-2">3. Configure EA</p>
            <p className="text-gray-600 mb-2">
              Open EA inputs and configure:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600 ml-4">
              <li>LicenseApiUrl: <code className="bg-gray-100 px-1 rounded">{getBackendUrl()}</code></li>
              <li>UserId: Your user ID (shown above)</li>
              <li>MT5AccountNumbers: Your account numbers (comma-separated)</li>
              <li>Other copy trading settings</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-2">4. Attach to Chart</p>
            <p className="text-gray-600">Attach EA to your MT5 chart and it will validate license on startup.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

