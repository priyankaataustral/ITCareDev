import { useState, useEffect, useCallback } from 'react';

export function useMentions(agentId) {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchMentions = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/inbox/mentions/${agentId}`);
      const data = await res.json();
      setMentions(data);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const refreshMentions = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    fetchMentions();
  }, [fetchMentions, refreshKey]);

  // Listen for global refresh events
  useEffect(() => {
    const handleRefresh = () => refreshMentions();
    window.addEventListener('refreshMentions', handleRefresh);
    return () => window.removeEventListener('refreshMentions', handleRefresh);
  }, [refreshMentions]);

  return { mentions, loading, error, refreshMentions };
}
