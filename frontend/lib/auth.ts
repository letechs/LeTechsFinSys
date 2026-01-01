import { authAPI } from './api'

export interface User {
  _id: string
  email: string
  name: string
  role: string
  isActive: boolean
  subscriptionTier?: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'
  subscriptionExpiry?: string
  emailVerified?: boolean
  emailVerifiedAt?: string
}

export interface AuthResponse {
  user: User
  token: string
}

export const authService = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await authAPI.login({ email, password })
    const { user, token } = response.data.data
    
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    
    return { user, token }
  },

  register: async (email: string, password: string, name: string): Promise<AuthResponse> => {
    const response = await authAPI.register({ email, password, name })
    const { user, token } = response.data.data
    
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    
    return { user, token }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  },

  getCurrentUser: (): User | null => {
    if (typeof window === 'undefined') return null
    const userStr = localStorage.getItem('user')
    return userStr ? JSON.parse(userStr) : null
  },

  getToken: (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('token')
  },

  isAuthenticated: (): boolean => {
    return !!authService.getToken()
  },

  /**
   * Update user data in localStorage
   * Used to sync subscription changes without re-login
   */
  updateUser: (userData: Partial<User>): void => {
    if (typeof window === 'undefined') return
    const currentUser = authService.getCurrentUser()
    if (currentUser) {
      const updatedUser = { ...currentUser, ...userData }
      localStorage.setItem('user', JSON.stringify(updatedUser))
    }
  },

  /**
   * Refresh user data from server
   * Fetches latest user data and updates localStorage
   */
  refreshUser: async (): Promise<User | null> => {
    try {
      const response = await authAPI.getMe()
      const userData = response.data.data
      if (userData && typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(userData))
      }
      return userData
    } catch (error) {
      console.error('Failed to refresh user data:', error)
      return null
    }
  },
}

