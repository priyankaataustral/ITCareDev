// Temporary debug component to diagnose authentication issues
import React from 'react';
import { useAuth } from './AuthContext';

export default function AuthDebug() {
  const { agent, token, isAuthenticated } = useAuth();
  
  // Only show in development or when needed for debugging
  if (process.env.NODE_ENV === 'production') return null;
  
  return (
    <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white text-xs p-3 rounded-lg max-w-sm z-50">
      <div className="font-bold mb-2">🔍 Auth Debug</div>
      <div>Authenticated: {isAuthenticated ? '✅' : '❌'}</div>
      <div>Token: {token ? '✅ Present' : '❌ Missing'}</div>
      <div>Agent: {agent ? '✅ Present' : '❌ Missing'}</div>
      {agent && (
        <div className="mt-2 space-y-1">
          <div>👤 Name: {agent.name}</div>
          <div>📧 Email: {agent.email}</div>
          <div>🎭 Role: {agent.role}</div>
          <div>🏢 Dept ID: {agent.department_id || '❌ Missing'}</div>
          <div>🆔 ID: {agent.id}</div>
        </div>
      )}
      {!agent?.department_id && (
        <div className="mt-2 p-2 bg-red-900 rounded text-yellow-200">
          ⚠️ Missing department_id - please log out and log back in
        </div>
      )}
    </div>
  );
}
