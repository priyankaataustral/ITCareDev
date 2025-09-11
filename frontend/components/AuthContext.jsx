'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiGet, apiPost } from '../lib/apiClient';


const TOKEN_KEY = 'authToken';
const AGENT_KEY = 'authAgent';

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

  // hydrate from localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const t = localStorage.getItem(TOKEN_KEY);
      const a = localStorage.getItem(AGENT_KEY);
      if (t) setToken(t);
      if (a) setAgent(JSON.parse(a));
    } catch {}
  }, []);

  // persist token
  useEffect(() => {
    if (!mounted) return;
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token, mounted]);

  // persist agent
  useEffect(() => {
    if (!mounted) return;
    if (agent) localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
    else localStorage.removeItem(AGENT_KEY);
  }, [agent, mounted]);

  // login now uses apiPost's parsed JSON + built-in error handling
  async function login(email, password) {
    const data = await apiPost('/login', { email, password });
    const { token: newToken, agent: agentData } = data || {};
    if (!newToken || !agentData) throw new Error('Malformed response from server');
    setToken(newToken);
    setAgent(agentData);
    return { token: newToken, agent: agentData };
  }

  // optional: hit backend logout if your API exposes it; otherwise just clear
  async function logout() {
    try { await apiPost('/logout', {}); } catch {/* ignore if not present */}
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
