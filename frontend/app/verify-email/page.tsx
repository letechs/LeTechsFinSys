'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authAPI } from '@/lib/api'
import { Mail, AlertCircle, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react'

export default function VerifyEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const registered = searchParams.get('registered') === 'true'

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  const verifyEmail = useCallback(async () => {
    if (!token) return

    setLoading(true)
    setError('')

    try {
      await authAPI.verifyEmail({ token })
      setSuccess(true)
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login?verified=true')
      }, 3000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to verify email. The link may be invalid or expired.')
    } finally {
      setLoading(false)
    }
  }, [token, router])

  useEffect(() => {
    // Auto-verify if token is present
    if (token) {
      verifyEmail()
    }
  }, [token, verifyEmail])

  const handleResendVerification = async () => {
    setResending(true)
    setError('')
    setResendSuccess(false)

    try {
      await authAPI.resendVerification()
      setResendSuccess(true)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend verification email. Please try again.')
    } finally {
      setResending(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="card p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Email Verified Successfully</h2>
            <p className="text-gray-600 mb-6">
              Your email has been verified. Redirecting to login...
            </p>
            <Link
              href="/login"
              className="btn btn-primary"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4 shadow-lg">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Verify Your Email</h1>
          <p className="text-gray-600">
            {registered ? 'Check your inbox for verification instructions' : 'Please verify your email address'}
          </p>
        </div>

        {/* Card */}
        <div className="card p-8">
          {loading && token ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
              <p className="text-gray-600">Verifying your email...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div className="bg-error-50 border border-error-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-error-700">{error}</p>
                </div>
              )}

              {resendSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-700">Verification email sent! Please check your inbox.</p>
                </div>
              )}

              {registered ? (
                <>
                  <div className="text-center space-y-4">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                      <Mail className="w-8 h-8 text-blue-600" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">Account Created Successfully</h2>
                    <p className="text-gray-600">
                      We've sent a verification email to your inbox. Please click the link in the email to verify your account.
                    </p>
                    <p className="text-sm text-gray-500">
                      The verification link will expire in 24 hours.
                    </p>
                  </div>

                  <div className="pt-4 space-y-3">
                    <button
                      onClick={handleResendVerification}
                      disabled={resending}
                      className="btn btn-secondary w-full"
                    >
                      {resending ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2" />
                          Resend Verification Email
                        </>
                      )}
                    </button>
                    <Link
                      href="/login"
                      className="btn btn-primary w-full"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back to Login
                    </Link>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-gray-600">
                    Please check your email and click the verification link, or use the button below to resend the verification email.
                  </p>
                  <button
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="btn btn-primary w-full"
                  >
                    {resending ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-5 h-5 mr-2" />
                        Resend Verification Email
                      </>
                    )}
                  </button>
                  <Link
                    href="/login"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors inline-flex items-center"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to Login
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-500">
          MT5 Copy Trading Platform
        </p>
      </div>
    </div>
  )
}

