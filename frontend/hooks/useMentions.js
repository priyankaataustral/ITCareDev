import { useState, useEffect } from 'react';

export function useMentions(agentId) {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
  fetch(`${process.env.NEXT_PUBLIC_API_BASE}/inbox/mentions/${agentId}`)
      .then(res => res.json())
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
