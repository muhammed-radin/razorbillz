import { UserSessionContext } from "@/contexts/user-session-context";
import { api } from "@/utils/api";
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

export function UserSessionProvider({ children }) {
  const location = useLocation();
  // Structure the state to mimic better-auth's hook return structure
  const [sessionState, setSessionState] = useState({
    data: null,
    isPending: true,
    error: null,
    updated: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function fetchSession() {
      // Mark loading explicitly: consumers (e.g. the admin gate) must wait
      // for in-flight refetches instead of judging stale null data.
      setSessionState((s) => ({ ...s, isPending: true, error: null }));
      try {
        const sessionData = await api.getSession(); // Your custom async API call
        if (!cancelled) setSessionState({ ...sessionData, isPending: false });
      } catch (err) {
        console.error("Failed to fetch session:", err);
        if (!cancelled) {
          setSessionState({
            data: null,
            isPending: false,
            error: err,
            updated: null,
          });
        }
      }
    }

    fetchSession();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]); // Re-fetch session when the location changes

  // Pass down the entire object so it mirrors better-auth's useSession hook structure
  return (
    <UserSessionContext.Provider value={sessionState}>
      {children}
    </UserSessionContext.Provider>
  );
}
