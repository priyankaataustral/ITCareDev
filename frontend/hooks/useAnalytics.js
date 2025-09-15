import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../lib/apiClient';

/**
 * Custom hook for analytics data management
 * Provides data fetching, caching, and state management for analytics
 */

export function useAnalyticsOverview(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet(`/analytics/overview?days=${days}`);
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to fetch overview analytics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useAgentPerformance(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet(`/analytics/agent-performance?days=${days}`);
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to fetch agent performance');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useTicketTrends(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet(`/analytics/ticket-trends?days=${days}`);
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to fetch ticket trends');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useEscalationAnalytics(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet(`/analytics/escalations?days=${days}`);
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to fetch escalation analytics');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export function useAIInsights(days = 30) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet(`/analytics/ai-insights?days=${days}`);
      setData(response);
    } catch (err) {
      setError(err.message || 'Failed to fetch AI insights');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * Unified analytics hook that fetches all analytics data
 * Useful for comprehensive dashboards
 */
export function useAllAnalytics(days = 30) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, agentPerf, trends, escalations, aiInsights] = await Promise.all([
        apiGet(`/analytics/overview?days=${days}`),
        apiGet(`/analytics/agent-performance?days=${days}`),
        apiGet(`/analytics/ticket-trends?days=${days}`),
        apiGet(`/analytics/escalations?days=${days}`),
        apiGet(`/analytics/ai-insights?days=${days}`)
      ]);

      setData({
        overview,
        agentPerformance: agentPerf,
        ticketTrends: trends,
        escalations,
        aiInsights
      });
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  return { data, loading, error, refetch: fetchAllData };
}

/**
 * Hook for real-time analytics updates
 * Refreshes data at specified intervals
 */
export function useRealTimeAnalytics(days = 30, refreshInterval = 60000) {
  const { data, loading, error, refetch } = useAllAnalytics(days);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    if (!refreshInterval) return;

    const interval = setInterval(() => {
      refetch();
      setLastUpdate(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refetch, refreshInterval]);

  return { data, loading, error, refetch, lastUpdate };
}

/**
 * Hook for analytics with date range filtering
 */
export function useDateRangeAnalytics(initialDays = 30) {
  const [days, setDays] = useState(initialDays);
  const [dateRange, setDateRange] = useState('30d');
  
  const analytics = useAllAnalytics(days);

  const changeDateRange = useCallback((range) => {
    setDateRange(range);
    switch (range) {
      case '7d':
        setDays(7);
        break;
      case '30d':
        setDays(30);
        break;
      case '90d':
        setDays(90);
        break;
      case '1y':
        setDays(365);
        break;
      default:
        setDays(30);
    }
  }, []);

  return {
    ...analytics,
    days,
    dateRange,
    changeDateRange
  };
}
