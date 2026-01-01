'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { authService, User } from '@/lib/auth'
import { 
  LayoutDashboard, 
  CreditCard, 
  Settings, 
  LogOut, 
  TrendingUp,
  Terminal,
  Copy,
  Activity,
  Download,
  Shield,
  FileText,
  Users,
  Cog,
  Menu,
  X,
  ChevronDown
} from 'lucide-react'

const getNavigation = (userRole?: string) => {
  const baseNav = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'MT5 Accounts', href: '/dashboard/accounts', icon: CreditCard },
    { name: 'Trading', href: '/dashboard/trading', icon: Activity },
    { name: 'Copy Trading', href: '/dashboard/copy-trading', icon: Copy },
    { name: 'Web Terminal', href: '/dashboard/terminal', icon: Terminal },
    { name: 'EA Download', href: '/dashboard/ea-download', icon: Download },
    { name: 'Subscription', href: '/dashboard/subscription', icon: TrendingUp },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ]

  if (userRole === 'admin') {
    baseNav.push({ name: 'Admin Dashboard', href: '/dashboard/admin', icon: Shield })
    baseNav.push({ name: 'User Management', href: '/dashboard/admin/subscriptions', icon: Users })
    baseNav.push({ name: 'Configuration', href: '/dashboard/admin/config', icon: Cog })
    baseNav.push({ name: 'User History', href: '/dashboard/admin/history', icon: FileText })
  }

  return baseNav
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Only get user on client side
    setUser(authService.getCurrentUser())
  }, [])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false)
      }
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const navigation = getNavigation(user?.role)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
          <h1 className="text-xl font-bold text-primary-600">LeTechs</h1>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo - Desktop */}
          <div className="hidden lg:flex items-center justify-center h-16 px-4 border-b border-gray-200 bg-gradient-to-r from-primary-600 to-primary-700">
            <h1 className="text-xl font-bold text-white">LeTechs</h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => isMobile && setSidebarOpen(false)}
                  className={`
                    flex items-center px-4 py-3 rounded-xl transition-all duration-200 group
                    ${isActive
                      ? 'bg-primary-50 text-primary-700 font-semibold shadow-sm'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-primary-600'
                    }
                  `}
                >
                  <item.icon className={`
                    w-5 h-5 mr-3 transition-colors
                    ${isActive ? 'text-primary-600' : 'text-gray-500 group-hover:text-primary-600'}
                  `} />
                  <span className="text-sm">{item.name}</span>
                </Link>
              )
            })}
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {user?.name || 'Loading...'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email || ''}
              </p>
              {user?.role === 'admin' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 mt-1">
                  <Shield className="w-3 h-3 mr-1" />
                  Admin
                </span>
              )}
            </div>
            <button
              onClick={() => {
                authService.logout()
                if (isMobile) setSidebarOpen(false)
              }}
              className="flex items-center justify-center w-full px-4 py-2.5 text-sm font-medium text-error-600 bg-white border border-error-200 rounded-lg hover:bg-error-50 hover:border-error-300 transition-colors"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 min-h-screen">
        <div className="pt-16 lg:pt-0">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
