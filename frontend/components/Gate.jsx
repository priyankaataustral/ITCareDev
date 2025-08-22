import React from 'react';
import { useAuth } from './AuthContext';

// Usage: <Gate roles={["admin"]} fallback={<div>Not authorized</div>}>Secret</Gate>
export function hasRole(agent, roles = []) {
  if (!agent || !agent.role) return false;
  return roles.includes(agent.role);
}

export default function Gate({ roles = [], children, fallback = null }) {
  const { agent } = useAuth();
  const role = agent?.role;
  console.log('GATE_RENDERED');
  console.log('GATE_AGENT', agent);
  console.log('GATE_PROPS', { role, roles, agent });
  if (hasRole(agent, roles)) {
    return <>{children}</>;
  }
  return fallback;
}
