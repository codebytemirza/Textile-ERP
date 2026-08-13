import { useCallback, useEffect, useRef, useState } from "react";

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch a list via a promise-returning loader; auto re-runs when `deps` change
 * and exposes a `refresh` method for CRUD invalidation.
 */
export function useCollection<T>(
  loader: () => Promise<T[]>,
  deps: unknown[] = []
) {
  const [state, setState] = useState<State<T[]>>({ data: null, loading: true, error: null });
  const [version, setVersion] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e) => {
        if (!cancelled) setState({ data: null, loading: false, error: e?.message ?? "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return { ...state, refresh };
}
