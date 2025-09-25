import React, { useState, useEffect } from 'react';
import { apiGet, apiPut, apiPost } from '../lib/apiClient';

export default function AdminPage() {
  const [settings, setSettings] = useState(null);
  const [completedActions, setCompletedActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null); // Track which tooltip is active
  const [warningConfig, setWarningConfig] = useState({
    type: '',
    value: 0,
    onConfirm: null
  });

  useEffect(() => {
    loadSettings();
    loadCompletedActions();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await apiGet('/admin/ai-automation/settings');
      setSettings(response);
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  };

  const loadCompletedActions = async () => {
    try {
      const response = await apiGet('/admin/ai-automation/actions?status=completed&limit=20');
      setCompletedActions(response.actions);
    } catch (error) {
      console.error('Failed to load completed actions:', error);
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

  const dismissAction = async (actionId) => {
    try {
      // Remove the action from the local state to dismiss it from view
      setCompletedActions(prev => prev.filter(action => action.id !== actionId));
    } catch (error) {
      console.error('Failed to dismiss action:', error);
    }
  };

  // Handle confidence threshold changes with warning for values below 80%
  const handleTriageConfidenceChange = (value) => {
    const floatValue = parseFloat(value);
    if (floatValue < 0.8 && settings.triage_confidence_threshold >= 0.8) {
      // Show warning when going below 80% from above 80%
      setWarningConfig({
        type: 'triage',
        value: floatValue,
        onConfirm: () => {
          setSettings({...settings, triage_confidence_threshold: floatValue});
          setShowWarningModal(false);
        }
      });
      setShowWarningModal(true);
    } else {
      // Direct update if already below 80% or going above 80%
      setSettings({...settings, triage_confidence_threshold: floatValue});
    }
  };

  const handleSolutionConfidenceChange = (value) => {
    const floatValue = parseFloat(value);
    if (floatValue < 0.8 && settings.solution_confidence_threshold >= 0.8) {
      // Show warning when going below 80% from above 80%
      setWarningConfig({
        type: 'solution',
        value: floatValue,
        onConfirm: () => {
          setSettings({...settings, solution_confidence_threshold: floatValue});
          setShowWarningModal(false);
        }
      });
      setShowWarningModal(true);
    } else {
      // Direct update if already below 80% or going above 80%
      setSettings({...settings, solution_confidence_threshold: floatValue});
    }
  };

  // Tooltip component with precise hover detection
  const TooltipIcon = ({ id, text, size = "w-5 h-5" }) => {
    return (
      <div className="relative inline-block">
        <svg 
          className={`${size} text-gray-400 hover:text-gray-600 cursor-help`} 
          aria-hidden="true" 
          xmlns="http://www.w3.org/2000/svg" 
          width="24" 
          height="24" 
          fill="none" 
          viewBox="0 0 24 24"
          onMouseEnter={() => setActiveTooltip(id)}
          onMouseLeave={() => setActiveTooltip(null)}
        >
          <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 11h2v5m-2 0h4m-2.592-8.5h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>
        </svg>
        {activeTooltip === id && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap z-10 pointer-events-none">
            {text}
          </div>
        )}
      </div>
    );
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
                <h1 className="text-3xl font-bold text-gray-900">AI Automation Control Panel</h1>
                <p className="text-gray-600 mt-2">Manage AI-powered ticket triage and solution generation</p>
              </div>
            </div>          
          </div>
        </div>

        <div className="space-y-8">
          {/* Settings Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">AI Automation Settings</h2>
            
            {/* Auto-Triage Settings */}
            <div className="mb-8">
              <div className="flex items-center space-x-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Auto-Triage</h3>
                <TooltipIcon 
                  id="auto-triage" 
                  text="Automatically assigns tickets to appropriate departments using AI" 
                />
              </div>
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
                    onChange={(e) => handleTriageConfidenceChange(e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Auto-Solution Settings */}
            <div className="mb-8">
              <div className="flex items-center space-x-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Auto-Solution</h3>
                <TooltipIcon 
                  id="auto-solution" 
                  text="Automatically generates and sends AI-powered solutions to users" 
                />
              </div>
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
                    onChange={(e) => handleSolutionConfidenceChange(e.target.value)}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <label className="block text-sm font-medium text-gray-700">Cooldown (hours)</label>
                      <TooltipIcon 
                        id="cooldown" 
                        text="Time interval between auto-solution attempts for the same user" 
                        size="w-4 h-4"
                      />
                    </div>
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
                    <div className="flex items-center space-x-2 mb-1">
                      <label className="block text-sm font-medium text-gray-700">Daily Limit</label>
                      <TooltipIcon 
                        id="daily-limit" 
                        text="Maximum number of auto-solutions sent per day across all tickets" 
                        size="w-4 h-4"
                      />
                    </div>
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

          {/* Recent AI Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Recent AI Activity</h2>
              <button
                onClick={loadCompletedActions}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                🔄 Refresh
              </button>
            </div>
            
            {completedActions.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📊</span>
                </div>
                <p className="text-gray-600">No recent AI activity</p>
                <p className="text-sm text-gray-500 mt-1">AI actions will appear here once automation is active</p>
              </div>
            ) : (
              <div className="space-y-4">
                {completedActions.map((action) => (
                  <div key={action.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                          {action.status === 'skipped' ? (
                            action.action_type === 'auto_triage' ? '🎯 Auto-Triage Skipped' : '💡 Auto-Solution Skipped'
                          ) : (
                            action.action_type === 'auto_triage' ? '🎯 Auto-Triage Completed' : '💡 Auto-Solution Sent'
                          )}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            action.status === 'skipped' 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {action.status === 'skipped' ? '⚠️ Skipped' : '✅ Applied'}
                          </span>
                        </h4>
                        <p className="text-sm text-gray-600">
                          Ticket #{action.ticket_id}: {action.ticket_subject}
                        </p>
                        <p className="text-sm text-gray-500">
                          Confidence: {(action.confidence_score * 100).toFixed(1)}% | 
                          {action.status === 'skipped' ? 'Skipped:' : 'Applied:'} {new Date(action.applied_at || action.created_at).toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => dismissAction(action.id)}
                          className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-colors"
                          title="Dismiss this notification"
                        >
                          ✕ Close
                        </button>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-700">
                      <p><strong>{action.status === 'skipped' ? 'Skip Reason:' : 'AI Decision:'}</strong> {action.reasoning}</p>
                      {action.generated_content && action.status !== 'skipped' && (
                        <div className="mt-3">
                          <strong>Solution Sent to User:</strong>
                          <div className="bg-gray-50 p-3 rounded mt-1 text-xs font-mono border-l-4 border-blue-500">
                            {action.generated_content}
                          </div>
                        </div>
                      )}
                      {action.generated_content && action.status === 'skipped' && (
                        <div className="mt-3">
                          <strong>Details:</strong>
                          <div className="bg-yellow-50 p-3 rounded mt-1 text-xs border-l-4 border-yellow-500">
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

      {/* Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Low Confidence Warning
                </h3>
              </div>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                You're setting the confidence threshold for{' '}
                <strong>{warningConfig.type === 'triage' ? 'Auto-Triage' : 'Auto-Solution'}</strong>{' '}
                to <strong>{(warningConfig.value * 100).toFixed(0)}%</strong>, which is below the recommended 80%.
              </p>
              <p className="text-sm text-gray-600 mt-2">
                This may result in less accurate automated {warningConfig.type === 'triage' ? 'department assignments' : 'solution suggestions'} and could impact the quality of results.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowWarningModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={warningConfig.onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 border border-transparent rounded-md hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}