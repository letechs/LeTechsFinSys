import axios from 'axios'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/+$/, '') // Remove trailing slashes

// Create axios instance - simple, no interceptors at module level
export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Set up interceptors lazily - only when first used on client
let interceptorsSetup = false

function setupInterceptorsOnce() {
  if (interceptorsSetup || typeof window === 'undefined') return
  interceptorsSetup = true
  
  api.interceptors.request.use((config) => {
    try {
      const token = localStorage.getItem('token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (e) {
      // Ignore
    }
    return config
  })

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        // Don't redirect on login/register/forgot-password/reset-password endpoints
        // These endpoints return 401 for invalid credentials, which is expected
        const url = error.config?.url || ''
        const isAuthEndpoint = 
          url.includes('/auth/login') || 
          url.includes('/auth/register') ||
          url.includes('/auth/forgot-password') ||
          url.includes('/auth/reset-password') ||
          url.includes('/auth/verify-email')
        
        // Only redirect if it's NOT an auth endpoint (meaning token expired on protected route)
        if (!isAuthEndpoint) {
          try {
            localStorage.removeItem('token')
            window.location.href = '/login'
          } catch (e) {
            // Ignore
          }
        }
      }
      return Promise.reject(error)
    }
  )
}

// Setup interceptors on first API call
const wrapMethod = (method: Function) => {
  return function(this: any, ...args: any[]) {
    setupInterceptorsOnce()
    return method.apply(this, args)
  }
}

api.get = wrapMethod(api.get) as any
api.post = wrapMethod(api.post) as any
api.put = wrapMethod(api.put) as any
api.delete = wrapMethod(api.delete) as any
api.patch = wrapMethod(api.patch) as any

// Auth API
export const authAPI = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  forgotPassword: (data: { email: string }) =>
    api.post('/auth/forgot-password', data),
  resetPassword: (data: { token: string; newPassword: string }) =>
    api.post('/auth/reset-password', data),
  verifyResetToken: (token: string) =>
    api.get('/auth/verify-reset-token', { params: { token } }),
  verifyEmail: (data: { token: string }) =>
    api.post('/auth/verify-email', data),
  resendVerification: () =>
    api.post('/auth/resend-verification'),
}

// User API
export const userAPI = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data: { name?: string }) => api.put('/users/me', data),
  getMyAccounts: () => api.get('/users/me/accounts'),
  getMySubscription: () => api.get('/users/me/subscription'),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post('/users/me/change-password', data),
  // Admin endpoints
  updateUser: (userId: string, data: { name?: string; email?: string; role?: 'admin' | 'client' | 'viewer' }) =>
    api.put(`/users/admin/${userId}`, data),
  deleteUser: (userId: string) => api.delete(`/users/admin/${userId}`),
  blockUser: (userId: string) => api.post(`/users/admin/${userId}/block`),
  unblockUser: (userId: string) => api.post(`/users/admin/${userId}/unblock`),
  // Bulk operations
  bulkBlockUsers: (userIds: string[]) => api.post('/users/admin/bulk/block', { userIds }),
  bulkUnblockUsers: (userIds: string[]) => api.post('/users/admin/bulk/unblock', { userIds }),
  bulkDeleteUsers: (userIds: string[]) => api.post('/users/admin/bulk/delete', { userIds }),
}

// Subscription API
export const subscriptionAPI = {
  getPlans: () => api.get('/subscriptions/plans'),
  getCurrent: () => api.get('/subscriptions/current'),
  createCheckout: (data: { planId: string }) =>
    api.post('/subscriptions/create-checkout', data),
  cancel: () => api.post('/subscriptions/cancel'),
  // Admin endpoints
  listUsers: (params?: { 
    page?: number
    limit?: number
    search?: string
    tier?: string
    status?: string
    userId?: string
    dateFrom?: string
    dateTo?: string
  }) =>
    api.get('/subscriptions/admin/users', { params }),
  getUserTier: (userId: string) => api.get(`/subscriptions/admin/${userId}/tier`),
  updateUserTier: (userId: string, data: { tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'; expiryDate?: string }) =>
    api.put(`/subscriptions/admin/${userId}/tier`, data),
  // Admin hybrid subscription endpoints
  getHybridSubscriptionAdmin: (userId: string) => api.get(`/subscriptions/admin/${userId}/hybrid`),
  addAddOnAdmin: (userId: string, data: { type: 'master' | 'slave'; quantity: number }) =>
    api.post(`/subscriptions/admin/${userId}/add-ons`, data),
  removeAddOnAdmin: (userId: string, data: { type: 'master' | 'slave'; quantity: number }) =>
    api.delete(`/subscriptions/admin/${userId}/add-ons`, { data }),
  // Bulk operations
  bulkUpdateUserTiers: (data: { userIds: string[]; tier: 'BASIC' | 'EA_LICENSE' | 'FULL_ACCESS'; expiryDate?: string }) =>
    api.post('/subscriptions/admin/bulk/update-tier', data),
}

// MT5 Account API
export const mt5API = {
  createAccount: (data: {
    accountName: string
    loginId: string
    broker: string
    server: string
    accountType?: 'master' | 'slave' | 'standalone'
  }) => api.post('/mt5/accounts', data),
  getAccounts: () => api.get('/mt5/accounts'),
  getAccount: (id: string) => api.get(`/mt5/accounts/${id}`),
  updateAccount: (id: string, data: any) => api.put(`/mt5/accounts/${id}`, data),
  deleteAccount: (id: string) => api.delete(`/mt5/accounts/${id}`),
  regenerateToken: (id: string) => api.post(`/mt5/accounts/${id}/regenerate-token`),
  updateRules: (id: string, data: any) => api.put(`/mt5/accounts/${id}/rules`, data),
}

// Command API
export const commandAPI = {
  create: (data: {
    accountId: string
    commandType: string
    symbol?: string
    volume?: number
    slPips?: number
    tpPips?: number
  }) => api.post('/commands', data),
  getCommands: (params?: { accountId?: string; status?: string; limit?: number }) =>
    api.get('/commands', { params }),
  getCommand: (id: string) => api.get(`/commands/${id}`),
  cancel: (id: string) => api.delete(`/commands/${id}`),
}

// Copy Links API
export const copyLinksAPI = {
  create: (data: {
    masterAccountId: string
    slaveAccountId: string
    lotMultiplier?: number
    riskMode?: 'fixed' | 'percentage' | 'balance_ratio'
    riskPercent?: number
    copySymbols?: string[]
    excludeSymbols?: string[]
    copyPendingOrders?: boolean
    copyModifications?: boolean
    priority?: number
  }) => api.post('/copy-links', data),
  getCopyLinks: () => api.get('/copy-links'),
  getCopyLink: (id: string) => api.get(`/copy-links/${id}`),
  updateCopyLink: (id: string, data: any) => api.put(`/copy-links/${id}`, data),
  pauseCopyLink: (id: string) => api.post(`/copy-links/${id}/pause`),
  resumeCopyLink: (id: string) => api.post(`/copy-links/${id}/resume`),
  deleteCopyLink: (id: string) => api.delete(`/copy-links/${id}`),
}

// License API
export const licenseAPI = {
  validate: (data: { userId: string; mt5Accounts: string[] }) =>
    api.post('/license/validate', data),
  getConfig: (params: { userId: string; mt5Login: string }) =>
    api.get('/license/config', { params }),
}

// Hybrid Subscription API
export const hybridSubscriptionAPI = {
  getHybridSubscription: () => api.get('/subscriptions/hybrid'),
  getAddOnPricing: () => api.get('/subscriptions/addon-pricing'),
  addAddOn: (data: { type: 'master' | 'slave'; quantity: number }) =>
    api.post('/subscriptions/add-ons', data),
  removeAddOn: (data: { type: 'master' | 'slave'; quantity: number }) =>
    api.delete('/subscriptions/add-ons', { data }),
  claimTrial: () => api.post('/subscriptions/claim-trial'),
  // Admin endpoints
  getAdminHybridSubscription: (userId: string) => api.get(`/subscriptions/admin/${userId}/hybrid`),
  adminAddAddOn: (userId: string, data: { type: 'master' | 'slave'; quantity: number }) => api.post(`/subscriptions/admin/${userId}/add-ons`, data),
  adminRemoveAddOn: (userId: string, data: { type: 'master' | 'slave'; quantity: number }) => api.delete(`/subscriptions/admin/${userId}/add-ons`, { data }),
  adminSetBaseTier: (userId: string, data: { baseTier: 'EA_LICENSE' | 'FULL_ACCESS' | 'BASIC' }) => api.put(`/subscriptions/admin/${userId}/base-tier`, data),
  adminUpdateRenewalDate: (userId: string, data: { renewalDate: string }) => api.put(`/subscriptions/admin/${userId}/renewal-date`, data),
  adminSetClientStatus: (userId: string, data: { isClient: boolean; clientDiscountPercentage?: number }) => api.put(`/subscriptions/admin/${userId}/client-status`, data),
  adminResetTrial: (userId: string) => api.post(`/subscriptions/admin/${userId}/reset-trial`),
  adminDisableTrial: (userId: string) => api.post(`/subscriptions/admin/${userId}/disable-trial`),
  adminSetSpecialDiscount: (userId: string, data: { discountPercentage: number; expiryDate: string; description?: string }) => api.put(`/subscriptions/admin/${userId}/special-discount`, data),
  adminRemoveSpecialDiscount: (userId: string) => api.delete(`/subscriptions/admin/${userId}/special-discount`),
}

// Admin API
export const adminAPI = {
  getDashboardStats: () => api.get('/admin/dashboard/stats'),
}

// Config API
export const configAPI = {
  getConfig: () => api.get('/admin/config'),
  getConfigSection: (section: string) => api.get(`/admin/config/${section}`),
  updateConfig: (data: any) => api.put('/admin/config', data),
  updateConfigSection: (section: string, data: any) => api.put(`/admin/config/${section}`, data),
  applyGlobalOffer: (userIds?: string[]) => api.post('/admin/config/apply-offer', { userIds }),
  updateTrialForUsers: (enabled: boolean, userIds?: string[]) => api.post('/admin/config/update-trial', { enabled, userIds }),
}

// Payment API (Stripe)
export const paymentAPI = {
  createCheckoutSession: (data: {
    tier?: 'EA_LICENSE' | 'FULL_ACCESS'
    addOns?: { masters?: number; slaves?: number }
    billingCycle?: 'monthly' | 'yearly'
    isRenewal?: boolean
  }) => api.post('/payment/create-checkout', data),
  verifySession: (sessionId: string) => api.post('/payment/verify-session', { sessionId }),
  getCustomerPortal: () => api.get('/payment/customer-portal'),
  cancelSubscription: () => api.post('/payment/cancel-subscription'),
  // Payment history and invoices
  getPaymentHistory: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/payment/history', { params }),
  getPaymentAttempts: (params?: { paymentId?: string }) =>
    api.get('/payment/attempts', { params }),
  getInvoices: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/payment/invoices', { params }),
  getInvoiceById: (invoiceId: string) => api.get(`/payment/invoices/${invoiceId}`),
  getPaymentMethods: () => api.get('/payment/methods'),
  // Admin endpoints
  getAdminUserPaymentHistory: (userId: string, params?: { status?: string; page?: number; limit?: number }) =>
    api.get(`/payment/admin/${userId}/history`, { params }),
  getAdminUserInvoices: (userId: string, params?: { status?: string; page?: number; limit?: number }) =>
    api.get(`/payment/admin/${userId}/invoices`, { params }),
}

// History API
export const historyAPI = {
  getMyHistory: (params?: { limit?: number; skip?: number; actionType?: string; startDate?: string; endDate?: string }) =>
    api.get('/history/me', { params }),
  // Admin endpoints
  getUserHistoryAdmin: (userId: string, params?: { limit?: number; skip?: number; actionType?: string; startDate?: string; endDate?: string }) =>
    api.get(`/history/admin/${userId}`, { params }),
  getAllHistoryAdmin: (params?: { limit?: number; skip?: number; userId?: string; search?: string; actionType?: string; startDate?: string; endDate?: string }) =>
    api.get('/history/admin', { params }),
}

