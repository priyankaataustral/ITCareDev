'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

// Use environment variable for API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:5000";
const TOKEN_KEY = 'authToken';
const AGENT_KEY = 'authAgent';

const AuthContext = createContext({
  token: null,
  agent: null,
  isAuthenticated: false,
  login: async (_email, _password) => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState(null);
  const [agent, setAgent] = useState(null);

  const isAuthenticated = Boolean(token && agent);
  if (agent) {
    // Log auth payload for debugging
    console.log('AUTH_PAYLOAD', agent, agent.role);
  }

  // On first mount, load from localStorage
  useEffect(() => {
    setMounted(true);
    const t = localStorage.getItem(TOKEN_KEY);
    const a = localStorage.getItem(AGENT_KEY);
    if (t) setToken(t);
    if (a) setAgent(JSON.parse(a));
  }, []);

  // Persist token
  useEffect(() => {
    if (!mounted) return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token, mounted]);

  // Persist agent
  useEffect(() => {
    if (!mounted) return;
    if (agent) localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
    else localStorage.removeItem(AGENT_KEY);
  }, [agent, mounted]);

  // Login function
  async function login(email, password) {
  const resp = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || 'Login failed');
    }
    const { token: newToken, agent: agentData } = await resp.json();
    setToken(newToken);
    setAgent(agentData);
    return { token: newToken, agent: agentData };
  }

  // Logout
  function logout() {
    setToken(null);
    setAgent(null);
  }

  // Before client hydration, render nothing to avoid SSR mismatch
  if (!mounted) return null;

  return (
    <AuthContext.Provider
      value={{ token, agent, isAuthenticated, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook
export function useAuth() {
  return useContext(AuthContext);
}
