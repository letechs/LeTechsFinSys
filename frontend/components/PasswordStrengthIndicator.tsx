'use client'

import { getPasswordStrength, validatePasswordStrength } from '@/lib/passwordValidation'
import { Check, X } from 'lucide-react'

interface PasswordStrengthIndicatorProps {
  password: string
  showErrors?: boolean
}

export default function PasswordStrengthIndicator({ password, showErrors = true }: PasswordStrengthIndicatorProps) {
  if (!password) return null

  const validation = validatePasswordStrength(password)
  const strength = getPasswordStrength(password)
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong']
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500']

  const requirements = [
    { test: password.length >= 8, label: 'At least 8 characters' },
    { test: /[A-Z]/.test(password), label: 'One uppercase letter' },
    { test: /[a-z]/.test(password), label: 'One lowercase letter' },
    { test: /[0-9]/.test(password), label: 'One number' },
    { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), label: 'One special character' },
  ]

  return (
    <div className="space-y-3 mt-2">
      {/* Strength Bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-gray-600">Password Strength:</span>
          <span className={`text-xs font-semibold ${strengthColors[strength]?.replace('bg-', 'text-') || 'text-gray-500'}`}>
            {strengthLabels[strength]}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${strengthColors[strength] || 'bg-gray-400'}`}
            style={{ width: `${((strength + 1) / 5) * 100}%` }}
          />
        </div>
      </div>

      {/* Requirements List */}
      {showErrors && (
        <div className="space-y-1.5">
          {requirements.map((req, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              {req.test ? (
                <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
              ) : (
                <X className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
              <span className={req.test ? 'text-green-700' : 'text-gray-500'}>
                {req.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

