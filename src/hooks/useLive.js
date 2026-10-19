import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
// Caller supplies a stable key; clear protected data when identity changes.
export function useLive(factory, key) {
  const [state, setState] = useState({
    key,
    data: null,
    error: "",
    loading: true,
  });
  useEffect(() => {
    setState({ key, data: null, error: "", loading: true });
    const ref = factory();
    if (!ref) {
      setState({ key, data: null, error: "", loading: false });
      return;
    }
    return onSnapshot(
      ref,
      (s) =>
        setState({
          key,
          data: s.docs
            ? s.docs.map((d) => ({ id: d.id, ...d.data() }))
            : s.exists()
              ? { id: s.id, ...s.data() }
              : null,
          error: "",
          loading: false,
        }),
      (e) => setState({ key, data: null, error: e.message, loading: false }),
    );
  }, [key]);
  return state.key === key ? state : { data: null, error: "", loading: true };
}
