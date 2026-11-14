import { useEffect, useState } from 'react';
import { getObservations } from '../api/observations';

export function useObservations(query, revision) {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ rows: [], loading: true, error: '' });
    getObservations(query, { signal: controller.signal })
      .then(rows => {
        if (!controller.signal.aborted) setState({ rows, loading: false, error: '' });
      })
      .catch(error => {
        if (!controller.signal.aborted)
          setState({ rows: [], loading: false, error: error.message });
      });
    return () => controller.abort();
  }, [query, revision]);

  return state;
}
