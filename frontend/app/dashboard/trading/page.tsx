'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { mt5API, commandAPI } from '@/lib/api'
import { TrendingUp, TrendingDown, X } from 'lucide-react'
import { useWebSocket } from '@/lib/hooks/useWebSocket'
import { AccountUpdate } from '@/lib/websocket'

export default function TradingPage() {
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY')
  const [symbol, setSymbol] = useState('EURUSD')
  const [volume, setVolume] = useState('0.01')
  const [slPips, setSlPips] = useState('')
  const [tpPips, setTpPips] = useState('')
  const queryClient = useQueryClient()

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

  const { data: commands, isLoading: commandsLoading } = useQuery(
    ['commands', selectedAccount],
    () => commandAPI.getCommands({ accountId: selectedAccount, limit: 20 }).then(res => res.data.data),
    {
      enabled: !!selectedAccount,
      refetchInterval: 5000, // Refresh every 5 seconds
    }
  )

  const createOrderMutation = useMutation(
    (data: any) => commandAPI.create(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['commands', selectedAccount])
        setShowOrderModal(false)
        setSymbol('EURUSD')
        setVolume('0.01')
        setSlPips('')
        setTpPips('')
      },
    }
  )

  const handlePlaceOrder = () => {
    if (!selectedAccount) {
      alert('Please select an account')
      return
    }

    if (!symbol || !volume) {
      alert('Please enter symbol and volume')
      return
    }

    createOrderMutation.mutate({
      accountId: selectedAccount,
      commandType: orderType,
      symbol: symbol.toUpperCase(),
      volume: parseFloat(volume),
      slPips: slPips ? parseInt(slPips) : undefined,
      tpPips: tpPips ? parseInt(tpPips) : undefined,
    })
  }

  const cancelOrderMutation = useMutation(
    (id: string) => commandAPI.cancel(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['commands', selectedAccount])
      },
    }
  )

  const onlineAccounts = accounts?.filter((acc: any) => acc.connectionStatus === 'online') || []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Trading Terminal</h1>
        <button
          onClick={() => setShowOrderModal(true)}
          disabled={!selectedAccount}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Place Order
        </button>
      </div>

      {/* Account Selection */}
      <div className="mb-6 bg-white rounded-lg shadow border border-gray-200 p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Account
        </label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">Select an account</option>
          {onlineAccounts.map((account: any) => (
            <option key={account._id} value={account._id}>
              {account.accountName} ({account.broker}) - 
              {account.connectionStatus === 'online' ? ' 🟢 Online' : ' 🔴 Offline'}
            </option>
          ))}
        </select>
        {selectedAccount && (
          <div className="mt-2 text-sm text-gray-600">
            {(() => {
              const account = accounts?.find((acc: any) => acc._id === selectedAccount)
              return account ? (
                <>
                  <p>Balance: ${account.balance?.toFixed(2) || '0.00'}</p>
                  <p>Equity: ${account.equity?.toFixed(2) || '0.00'}</p>
                </>
              ) : null
            })()}
          </div>
        )}
      </div>

      {/* Commands List */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Commands</h2>
        {!selectedAccount ? (
          <p className="text-gray-500 text-center py-8">Select an account to view commands</p>
        ) : commandsLoading ? (
          <p className="text-gray-500 text-center py-4">Loading commands...</p>
        ) : commands && commands.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-4">Type</th>
                  <th className="text-left py-2 px-4">Symbol</th>
                  <th className="text-left py-2 px-4">Volume</th>
                  <th className="text-left py-2 px-4">SL/TP</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-left py-2 px-4">Created</th>
                  <th className="text-left py-2 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd: any) => (
                  <tr key={cmd._id} className="border-b border-gray-100">
                    <td className="py-2 px-4">
                      <span className={`flex items-center gap-1 ${
                        cmd.commandType === 'BUY' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {cmd.commandType === 'BUY' ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {cmd.commandType}
                      </span>
                    </td>
                    <td className="py-2 px-4">{cmd.symbol || '-'}</td>
                    <td className="py-2 px-4">{cmd.volume || '-'}</td>
                    <td className="py-2 px-4">
                      {cmd.slPips || cmd.tpPips ? (
                        <>
                          {cmd.slPips && `SL: ${cmd.slPips}p`}
                          {cmd.slPips && cmd.tpPips && ' | '}
                          {cmd.tpPips && `TP: ${cmd.tpPips}p`}
                        </>
                      ) : '-'}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-1 text-xs rounded ${
                        cmd.status === 'executed' 
                          ? 'bg-green-100 text-green-800'
                          : cmd.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : cmd.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {cmd.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-sm text-gray-600">
                      {new Date(cmd.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 px-4">
                      {cmd.status === 'pending' && (
                        <button
                          onClick={() => {
                            if (confirm('Cancel this order?')) {
                              cancelOrderMutation.mutate(cmd._id)
                            }
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No commands found</p>
        )}
      </div>

      {/* Place Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Place Order</h2>
            
            <div className="space-y-4">
              {/* Order Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Order Type
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOrderType('BUY')}
                    className={`flex-1 px-4 py-2 rounded-lg ${
                      orderType === 'BUY'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    <TrendingUp className="w-5 h-5 inline mr-2" />
                    BUY
                  </button>
                  <button
                    onClick={() => setOrderType('SELL')}
                    className={`flex-1 px-4 py-2 rounded-lg ${
                      orderType === 'SELL'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    <TrendingDown className="w-5 h-5 inline mr-2" />
                    SELL
                  </button>
                </div>
              </div>

              {/* Symbol */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Symbol
                </label>
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="EURUSD"
                />
              </div>

              {/* Volume */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Volume (Lots)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="0.01"
                />
              </div>

              {/* SL/TP Pips */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Stop Loss (Pips)
                  </label>
                  <input
                    type="number"
                    value={slPips}
                    onChange={(e) => setSlPips(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Take Profit (Pips)
                  </label>
                  <input
                    type="number"
                    value={tpPips}
                    onChange={(e) => setTpPips(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handlePlaceOrder}
                disabled={createOrderMutation.isLoading || !selectedAccount}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {createOrderMutation.isLoading ? 'Placing...' : 'Place Order'}
              </button>
              <button
                onClick={() => {
                  setShowOrderModal(false)
                  setSymbol('EURUSD')
                  setVolume('0.01')
                  setSlPips('')
                  setTpPips('')
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

