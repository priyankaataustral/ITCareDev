'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const TOKEN_KEY = 'authToken';
const AGENT_KEY = 'authAgent';

// Use ONE env var, make sure you set NEXT_PUBLIC_API_BASE in your SWA/Next.js env
const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5000')
    .replace(/\/+$/, '');

const AuthContext = createContext({
  token: null,
  agent: null,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState(null);
  const [agent, setAgent] = useState(null);

  const isAuthenticated = Boolean(token && agent);

  useEffect(() => {
    setMounted(true);
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const a = localStorage.getItem(AGENT_KEY);
      if (t) setToken(t);
      if (a) setAgent(JSON.parse(a));
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token, mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (agent) localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
    else localStorage.removeItem(AGENT_KEY);
  }, [agent, mounted]);

  async function login(email, password) {
    const resp = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      // credentials: 'include', // only if using cookies
    });

    let data = {};
    try {
      data = await resp.json();
    } catch {}

    if (!resp.ok) {
      throw new Error(data.error || data.message || `Login failed (HTTP ${resp.status})`);
    }

    const { token: newToken, agent: agentData } = data;
    if (!newToken || !agentData) throw new Error('Malformed response from server');

    setToken(newToken);
    setAgent(agentData);
    return { token: newToken, agent: agentData };
  }

  function logout() {
    setToken(null);
    setAgent(null);
  }

  if (!mounted) return null;

  return (
    <AuthContext.Provider value={{ token, agent, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
