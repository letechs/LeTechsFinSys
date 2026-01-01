'use client'

import { FeatureGate } from '@/components/FeatureGate'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { mt5API, commandAPI } from '@/lib/api'
import { Send, TrendingUp, TrendingDown, ChevronDown, Search } from 'lucide-react'
import { useWebSocket } from '@/lib/hooks/useWebSocket'
import { AccountUpdate } from '@/lib/websocket'

// Popular trading symbols (can be extended or fetched from backend later)
const POPULAR_SYMBOLS = [
  // Forex Majors
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  // Forex Minors
  'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURCHF', 'GBPCHF',
  // Commodities
  'XAUUSD', 'XAGUSD', 'XPDUSD', 'XPTUSD', // Gold, Silver, Palladium, Platinum
  'OIL', 'BRENT', 'WTI',
  // Indices
  'US30', 'US100', 'US500', 'UK100', 'GER30', 'FRA40', 'JPN225',
  // Crypto (if broker supports)
  'BTCUSD', 'ETHUSD', 'LTCUSD',
]

export default function TerminalPage() {
  const queryClient = useQueryClient()
  const [selectedAccount, setSelectedAccount] = useState('')
  const [symbol, setSymbol] = useState('XAUUSD')
  const [volume, setVolume] = useState('0.10')
  const [slPips, setSlPips] = useState('')
  const [tpPips, setTpPips] = useState('')
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY')
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false)
  const [symbolSearch, setSymbolSearch] = useState('')

  const { data: accounts } = useQuery('accounts', () =>
    mt5API.getAccounts().then(res => res.data.data),
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchInterval: false,
    }
  )

  // Real-time account updates via WebSocket
  useWebSocket({
    onAccountUpdate: (update: AccountUpdate) => {
      queryClient.setQueryData('accounts', (oldData: any) => {
        if (!oldData) return oldData;
        
        return oldData.map((account: any) => {
          const accountIdStr = String(account._id?.toString() || account._id || '').trim();
          const updateIdStr = String(update.accountId?.toString() || update.accountId || '').trim();
          
          if (accountIdStr === updateIdStr || 
              String(account._id) === String(update.accountId)) {
            return {
              ...account,
              balance: update.balance !== undefined && update.balance !== null ? update.balance : account.balance,
              equity: update.equity !== undefined && update.equity !== null ? update.equity : account.equity,
              margin: update.margin !== undefined && update.margin !== null ? update.margin : account.margin,
              freeMargin: update.freeMargin !== undefined && update.freeMargin !== null ? update.freeMargin : account.freeMargin,
              marginLevel: update.marginLevel !== undefined && update.marginLevel !== null ? update.marginLevel : account.marginLevel,
              connectionStatus: update.connectionStatus || account.connectionStatus,
            };
          }
          return account;
        });
      });
    },
  })

  const { data: commands } = useQuery(
    ['commands', selectedAccount],
    () => commandAPI.getCommands({ accountId: selectedAccount, limit: 20 }).then(res => res.data.data),
    { enabled: !!selectedAccount }
  )

  // Get recently used symbols from command history
  const recentSymbols = useMemo(() => {
    if (!commands) return []
    const symbols = new Set<string>()
    commands.forEach((cmd: any) => {
      if (cmd.symbol) symbols.add(cmd.symbol)
    })
    return Array.from(symbols).slice(0, 10) // Last 10 unique symbols
  }, [commands])

  // Filter symbols based on search
  const filteredSymbols = useMemo(() => {
    const search = symbolSearch.toUpperCase()
    if (!search) return POPULAR_SYMBOLS
    
    return POPULAR_SYMBOLS.filter(s => s.includes(search))
  }, [symbolSearch])

  // Combine recent and popular symbols (remove duplicates)
  const allSymbols = useMemo(() => {
    const combined = [...recentSymbols, ...POPULAR_SYMBOLS]
    return Array.from(new Set(combined))
  }, [recentSymbols])

  const createCommandMutation = useMutation(
    (data: any) => commandAPI.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['commands', selectedAccount])
        alert('Order placed successfully!')
        // Reset form
        setVolume('0.10')
        setSlPips('')
        setTpPips('')
      },
      onError: (err: any) => {
        alert(err.response?.data?.message || 'Failed to place order')
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAccount) {
      alert('Please select an account')
      return
    }

    createCommandMutation.mutate({
      accountId: selectedAccount,
      commandType: orderType,
      symbol,
      volume: parseFloat(volume),
      slPips: slPips ? parseInt(slPips) : undefined,
      tpPips: tpPips ? parseInt(tpPips) : undefined,
    })
  }

  const handleCloseAll = () => {
    if (!selectedAccount) {
      alert('Please select an account')
      return
    }
    if (confirm('Close all open positions?')) {
      createCommandMutation.mutate({
        accountId: selectedAccount,
        commandType: 'CLOSE_ALL',
      })
    }
  }

  return (
    <FeatureGate requiredTier="FULL_ACCESS" featureName="Web Terminal">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="section-header">
          <h1 className="section-title">Web Terminal</h1>
          <p className="section-subtitle">Advanced trading interface with real-time execution</p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Form */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="text-xl font-semibold mb-4">Place Order</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Account
              </label>
              <select
                required
                className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
              >
                <option value="" className="text-gray-500">Select an account</option>
                {accounts?.map((acc: any) => (
                  <option key={acc._id} value={acc._id} className="text-gray-900">
                    {acc.accountName} ({acc.broker})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Symbol
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 pr-10 text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder:text-gray-400"
                    value={symbol}
                    onChange={(e) => {
                      setSymbol(e.target.value.toUpperCase())
                      setSymbolDropdownOpen(true)
                    }}
                    onFocus={() => setSymbolDropdownOpen(true)}
                    placeholder="XAUUSD"
                  />
                  <button
                    type="button"
                    onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform ${symbolDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {/* Dropdown */}
                  {symbolDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {/* Search */}
                      <div className="sticky top-0 bg-white border-b border-gray-200 p-2">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            className="w-full pl-8 pr-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder:text-gray-400"
                            placeholder="Search symbol..."
                            value={symbolSearch}
                            onChange={(e) => setSymbolSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      
                      {/* Recent Symbols */}
                      {recentSymbols.length > 0 && !symbolSearch && (
                        <div className="p-2">
                          <div className="text-xs font-semibold text-gray-700 uppercase mb-1 px-2">Recent</div>
                          {recentSymbols.map((sym) => (
                            <button
                              key={sym}
                              type="button"
                              onClick={() => {
                                setSymbol(sym)
                                setSymbolDropdownOpen(false)
                                setSymbolSearch('')
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm text-gray-900 hover:bg-gray-100 rounded flex items-center justify-between"
                            >
                              <span className="font-medium">{sym}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {/* Popular Symbols */}
                      <div className="p-2">
                        <div className="text-xs font-semibold text-gray-700 uppercase mb-1 px-2">
                          {symbolSearch ? 'Search Results' : 'Popular Symbols'}
                        </div>
                        {filteredSymbols.length > 0 ? (
                          filteredSymbols.map((sym) => (
                            <button
                              key={sym}
                              type="button"
                              onClick={() => {
                                setSymbol(sym)
                                setSymbolDropdownOpen(false)
                                setSymbolSearch('')
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm text-gray-900 hover:bg-gray-100 rounded flex items-center justify-between"
                            >
                              <span className="font-medium">{sym}</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-gray-700">No symbols found</div>
                        )}
                      </div>
                      
                      {/* Custom Symbol Option */}
                      {symbol && !allSymbols.includes(symbol.toUpperCase()) && (
                        <div className="border-t border-gray-200 p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSymbolDropdownOpen(false)
                              setSymbolSearch('')
                            }}
                            className="w-full text-left px-2 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded"
                          >
                            Use "{symbol.toUpperCase()}"
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Close dropdown when clicking outside */}
                {symbolDropdownOpen && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setSymbolDropdownOpen(false)
                      setSymbolSearch('')
                    }}
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Volume (Lots)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Order Type
              </label>
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setOrderType('BUY')}
                  className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg border-2 transition-colors ${
                    orderType === 'BUY'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <TrendingUp className="w-5 h-5 mr-2" />
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('SELL')}
                  className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg border-2 transition-colors ${
                    orderType === 'SELL'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <TrendingDown className="w-5 h-5 mr-2" />
                  SELL
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stop Loss (Pips)
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder:text-gray-400"
                  value={slPips}
                  onChange={(e) => setSlPips(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Take Profit (Pips)
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 placeholder:text-gray-400"
                  value={tpPips}
                  onChange={(e) => setTpPips(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={createCommandMutation.isLoading || !selectedAccount}
                className="flex-1 flex items-center justify-center px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                <Send className="w-5 h-5 mr-2" />
                {createCommandMutation.isLoading ? 'Placing...' : 'Place Order'}
              </button>
              <button
                type="button"
                onClick={handleCloseAll}
                disabled={!selectedAccount}
                className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Close All
              </button>
            </div>
          </form>
        </div>

        {/* Recent Commands */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Recent Orders</h2>
          <div className="space-y-2">
            {commands && commands.length > 0 ? (
              commands.map((cmd: any) => (
                <div
                  key={cmd._id}
                  className="p-3 border border-gray-200 rounded-lg text-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`font-medium ${
                        cmd.commandType === 'BUY' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {cmd.commandType}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        cmd.status === 'executed'
                          ? 'bg-green-100 text-green-800'
                          : cmd.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {cmd.status}
                    </span>
                  </div>
                  <div className="text-gray-600">
                    {cmd.symbol} - {cmd.volume} lots
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(cmd.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No orders yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
    </FeatureGate>
  )
}

