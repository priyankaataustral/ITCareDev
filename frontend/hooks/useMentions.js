import { useState, useEffect } from 'react';

export function useMentions(agentId) {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    const token = localStorage.getItem('authToken');
    fetch(`http://localhost:5000/inbox/mentions/${agentId}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(data => {
        setMentions(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, [agentId]);

  return { mentions, loading, error };
}
