import React, { useState, useEffect } from 'react';
import { apiGet, apiPut, apiPost } from '../lib/apiClient';

export default function AdminPage() {
  const [settings, setSettings] = useState(null);
  const [pendingActions, setPendingActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadPendingActions();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await apiGet('/admin/ai-automation/settings');
      setSettings(response);
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  };

  const loadPendingActions = async () => {
    try {
      const response = await apiGet('/admin/ai-automation/actions?status=pending');
      setPendingActions(response.actions);
    } catch (error) {
      console.error('Failed to load pending actions:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiPut('/admin/ai-automation/settings', settings);
      alert('Settings saved successfully!');
    } catch (error) {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const applyAction = async (actionId) => {
    try {
      await apiPost(`/admin/ai-automation/actions/${actionId}/apply`);
      loadPendingActions(); // Refresh list
      alert('Action applied successfully!');
    } catch (error) {
      alert('Failed to apply action');
    }
  };

  const rejectAction = async (actionId) => {
    try {
      await apiPost(`/admin/ai-automation/actions/${actionId}/reject`);
      loadPendingActions(); // Refresh list
    } catch (error) {
      alert('Failed to reject action');
    }
  };

  if (loading || !settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading AI Automation Panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🚀 AI Automation Control Panel</h1>
          <p className="text-gray-600 mt-2">Manage AI-powered ticket triage and solution generation</p>
        </div> */}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Back Button */}
              <button
                onClick={() => window.history.back()}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                aria-label="Go back"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              
              {/* Title Section */}
              <div>
                <h1 className="text-3xl font-bold text-gray-900">🚀 AI Automation Control Panel</h1>
                <p className="text-gray-600 mt-2">Manage AI-powered ticket triage and solution generation</p>
              </div>
            </div>
            
            {/* Optional: Add a home button as alternative */}
            <button
              onClick={() => window.location.href = '/'}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              aria-label="Go to home"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Settings Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">🤖 AI Automation Settings</h2>
            
            {/* Auto-Triage Settings */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Auto-Triage</h3>
              <div className="space-y-4">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.auto_triage_enabled}
                    onChange={(e) => setSettings({...settings, auto_triage_enabled: e.target.checked})}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable AI Auto-Triage</span>
                </label>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confidence Threshold: {(settings.triage_confidence_threshold * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.05"
                    value={settings.triage_confidence_threshold}
                    onChange={(e) => setSettings({...settings, triage_confidence_threshold: parseFloat(e.target.value)})}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Auto-Solution Settings */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Auto-Solution</h3>
              <div className="space-y-4">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.auto_solution_enabled}
                    onChange={(e) => setSettings({...settings, auto_solution_enabled: e.target.checked})}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable AI Auto-Solution</span>
                </label>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confidence Threshold: {(settings.solution_confidence_threshold * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.05"
                    value={settings.solution_confidence_threshold}
                    onChange={(e) => setSettings({...settings, solution_confidence_threshold: parseFloat(e.target.value)})}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cooldown (hours)</label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={settings.solution_cooldown_hours}
                      onChange={(e) => setSettings({...settings, solution_cooldown_hours: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Daily Limit</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={settings.max_daily_auto_solutions}
                      onChange={(e) => setSettings({...settings, max_daily_auto_solutions: parseInt(e.target.value)})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Exclusion Rules */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Safety Exclusions</h3>
              <div className="space-y-3">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.exclude_high_priority}
                    onChange={(e) => setSettings({...settings, exclude_high_priority: e.target.checked})}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">Exclude High Priority tickets</span>
                </label>
                
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.exclude_l3_tickets}
                    onChange={(e) => setSettings({...settings, exclude_l3_tickets: e.target.checked})}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">Exclude L3+ tickets</span>
                </label>
                
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.exclude_escalated}
                    onChange={(e) => setSettings({...settings, exclude_escalated: e.target.checked})}
                    className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700">Exclude Escalated tickets</span>
                </label>
                
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.require_manager_approval}
                    onChange={(e) => setSettings({...settings, require_manager_approval: e.target.checked})}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Require Manager Approval</span>
                </label>
              </div>
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Pending Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">⏳ Pending AI Actions</h2>
              <button
                onClick={loadPendingActions}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
            
            {pendingActions.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">✅</span>
                </div>
                <p className="text-gray-600">No pending actions</p>
                <p className="text-sm text-gray-500 mt-1">All AI suggestions have been processed</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingActions.map((action) => (
                  <div key={action.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                          {action.action_type === 'auto_triage' ? '🎯 Auto-Triage' : '💡 Auto-Solution'}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            action.risk_level === 'high' ? 'bg-red-100 text-red-800' :
                            action.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {action.risk_level} risk
                          </span>
                        </h4>
                        <p className="text-sm text-gray-600">
                          Ticket #{action.ticket_id}: {action.ticket_subject}
                        </p>
                        <p className="text-sm text-gray-500">
                          Confidence: {(action.confidence_score * 100).toFixed(1)}% | 
                          Created: {new Date(action.created_at).toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => applyAction(action.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                        >
                          ✅ Apply
                        </button>
                        <button
                          onClick={() => rejectAction(action.id)}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 transition-colors"
                        >
                          ❌ Reject
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-700">
                      <p><strong>Reasoning:</strong> {action.reasoning}</p>
                      {action.generated_content && (
                        <div className="mt-3">
                          <strong>Generated Solution:</strong>
                          <div className="bg-gray-50 p-3 rounded mt-1 text-xs font-mono border-l-4 border-blue-500">
                            {action.generated_content}
                          </div>
                        </div>
                      )}
                      {action.kb_references && action.kb_references.length > 0 && (
                        <div className="mt-2">
                          <strong>Knowledge Base References:</strong>
                          <div className="text-xs text-gray-600">
                            {action.kb_references.map((ref, idx) => (
                              <span key={idx} className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2 mt-1">
                                📖 {ref.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}