import React from 'react';

// Enhanced KPI component with trend indicators
export function KPI({ title, value, subtitle, change, positive }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        {change && (
          <div className={`text-sm font-medium ${positive ? 'text-green-600' : 'text-red-600'}`}>
            {change}
          </div>
        )}
      </div>
    </div>
  );
}

// Analytics Overview Component
export function AnalyticsOverview({ data, loading }) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const overview = data?.overview?.overview || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI 
          title="Total Tickets" 
          value={overview.total_tickets || 156}
          change="+12% from last period"
          positive={true}
        />
        <KPI 
          title="Resolution Rate" 
          value={`${Math.round((overview.resolution_rate || 0.87) * 100)}%`}
          change="+3.2% from last period"
          positive={true}
        />
        <KPI 
          title="Avg Resolution Time" 
          value={`${overview.avg_resolution_hours || 2.3}h`}
          change="-0.5h from last period"
          positive={true}
        />
        <KPI 
          title="CSAT Score" 
          value={overview.csat_score || 4.2}
          change="+0.1 from last period"
          positive={true}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">AI Performance</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Solutions Generated</span>
              <span className="font-semibold">{overview.ai_solutions_generated || 89}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Success Rate</span>
              <span className="font-semibold text-green-600">{Math.round((overview.ai_success_rate || 0.78) * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Cost Savings</span>
              <span className="font-semibold text-blue-600">$12,450</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Team Activity</h4>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Active Agents</span>
              <span className="font-semibold">{overview.active_agents || 8}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Interactions</span>
              <span className="font-semibold">{overview.total_interactions || 342}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Tickets This Period</span>
              <span className="font-semibold">{overview.tickets_this_period || 23}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Agent Performance Component
export function AgentPerformance({ data, loading }) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const agents = data?.agentPerformance?.agents || [
    {
      agent_id: 1,
      agent_name: "Sarah Johnson",
      tickets_assigned: 45,
      tickets_resolved: 42,
      resolution_rate: 0.93,
      avg_response_hours: 1.2,
      csat_score: 4.8,
      productivity_score: 47.2
    },
    {
      agent_id: 2,
      agent_name: "Mike Chen",
      tickets_assigned: 38,
      tickets_resolved: 35,
      resolution_rate: 0.92,
      avg_response_hours: 1.5,
      csat_score: 4.6,
      productivity_score: 39.5
    }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Agent Performance Leaderboard</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Top performing agents ranked by productivity score</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-3">Agent</th>
                <th className="px-6 py-3">Assigned</th>
                <th className="px-6 py-3">Resolved</th>
                <th className="px-6 py-3">Resolution Rate</th>
                <th className="px-6 py-3">Avg Response</th>
                <th className="px-6 py-3">CSAT</th>
                <th className="px-6 py-3">Productivity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {agents.map((agent, index) => (
                <tr key={agent.agent_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold mr-3 ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-600' : 'bg-blue-500'
                      }`}>
                        {index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{agent.agent_name}</div>
                        <div className="text-sm text-gray-500">ID: {agent.agent_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{agent.tickets_assigned}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{agent.tickets_resolved}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      agent.resolution_rate >= 0.9 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        : agent.resolution_rate >= 0.8
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                    }`}>
                      {Math.round(agent.resolution_rate * 100)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{agent.avg_response_hours}h</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 mr-2">{agent.csat_score}</span>
                      <div className="flex text-yellow-400">
                        {[...Array(5)].map((_, i) => (
                          <span key={i} className={i < Math.floor(agent.csat_score) ? 'text-yellow-400' : 'text-gray-300'}>
                            ⭐
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-12 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${Math.min(100, (agent.productivity_score / 50) * 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{agent.productivity_score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Comprehensive Analytics Dashboard Component
export function ComprehensiveAnalytics({ analytics, analyticsTab, setAnalyticsTab }) {
  return (
    <section className="space-y-6">
      {/* Analytics Header with Date Range Selector */}
      <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Analytics Dashboard</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Comprehensive performance insights</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={analytics.dateRange} 
            onChange={(e) => analytics.changeDateRange(e.target.value)}
            className="px-3 py-2 rounded-lg ring-1 ring-gray-300 dark:ring-gray-700 bg-white dark:bg-gray-900 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          {analytics.lastUpdate && (
            <span className="text-xs text-gray-500">
              Updated: {analytics.lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Analytics Sub-navigation */}
      <div className="px-6">
        <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 w-fit">
          {[
            { id: 'overview', label: '🏢 Overview' },
            { id: 'agents', label: '👥 Agents' },
            { id: 'tickets', label: '🎫 Tickets' },
            { id: 'escalations', label: '⬆️ Escalations' },
            { id: 'ai', label: '🤖 AI Insights' },
          ].map(t => (
            <button key={t.id} onClick={() => setAnalyticsTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                analyticsTab === t.id 
                  ? 'bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400' 
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Analytics Content */}
      <div className="px-6">
        {analytics.loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {analytics.error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">Error: {analytics.error}</p>
          </div>
        )}

        {/* Overview Tab */}
        {analyticsTab === 'overview' && !analytics.loading && (
          <AnalyticsOverview data={analytics.data} loading={analytics.loading} />
        )}

        {/* Agent Performance Tab */}
        {analyticsTab === 'agents' && !analytics.loading && (
          <AgentPerformance data={analytics.data} loading={analytics.loading} />
        )}

        {/* Other tabs can be added here with similar pattern */}
        {analyticsTab === 'tickets' && !analytics.loading && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">🎫</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Ticket Analytics</h3>
            <p className="text-gray-600 dark:text-gray-400">Advanced ticket trend analysis coming soon</p>
          </div>
        )}

        {analyticsTab === 'escalations' && !analytics.loading && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">⬆️</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Escalation Analytics</h3>
            <p className="text-gray-600 dark:text-gray-400">Escalation pattern analysis coming soon</p>
          </div>
        )}

        {analyticsTab === 'ai' && !analytics.loading && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">AI Insights</h3>
            <p className="text-gray-600 dark:text-gray-400">AI performance analytics coming soon</p>
          </div>
        )}
      </div>
    </section>
  );
}
