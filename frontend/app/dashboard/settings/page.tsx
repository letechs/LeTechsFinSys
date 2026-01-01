'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { userAPI } from '@/lib/api'
import { authService } from '@/lib/auth'
import { useWebSocket } from '@/lib/hooks/useWebSocket'
import PasswordStrengthIndicator from '@/components/PasswordStrengthIndicator'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')

  const { data: user } = useQuery('profile', () =>
    userAPI.getProfile().then(res => {
      const userData = res.data.data
      setName(userData.name)
      return userData
    })
  )

  // Maintain WebSocket listeners (even though this page doesn't use account updates)
  useWebSocket({})

  const updateProfileMutation = useMutation(
    (data: { name: string }) => userAPI.updateProfile(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('profile')
        alert('Profile updated successfully!')
      },
    }
  )

  const changePasswordMutation = useMutation(
    (data: { currentPassword: string; newPassword: string }) =>
      userAPI.changePassword(data),
    {
      onSuccess: () => {
        setCurrentPassword('')
        setNewPassword('')
        alert('Password changed successfully!')
      },
      onError: (err: any) => {
        alert(err.response?.data?.message || 'Failed to change password')
      },
    }
  )

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault()
    updateProfileMutation.mutate({ name })
  }

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault()
    changePasswordMutation.mutate({ currentPassword, newPassword })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="section-header">
        <h1 className="section-title">Settings</h1>
        <p className="section-subtitle">Manage your profile and security settings</p>
      </div>

      <div className="card">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-6 py-3 font-medium ${
                activeTab === 'profile'
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-6 py-3 font-medium ${
                activeTab === 'password'
                  ? 'border-b-2 border-primary-600 text-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Password
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleUpdateProfile} className="max-w-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                  value={user?.email || ''}
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={updateProfileMutation.isLoading}
                className="btn btn-primary"
              >
                {updateProfileMutation.isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <PasswordStrengthIndicator password={newPassword} showErrors={true} />
              </div>
              <button
                type="submit"
                disabled={changePasswordMutation.isLoading}
                className="btn btn-primary"
              >
                {changePasswordMutation.isLoading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

