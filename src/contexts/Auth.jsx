import React, { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signInAnonymously } from "firebase/auth";
import { auth } from "../firebase/client";
const Context = createContext(null);
export const useAuth = () => useContext(Context);
export function AuthProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    claims: {},
    loading: true,
    error: "",
  });
  useEffect(() => {
    let live = true,
      version = 0;
    const off = onIdTokenChanged(auth, async (user) => {
      const mine = ++version;
      try {
        const claims = user ? (await user.getIdTokenResult()).claims : {};
        if (live && mine === version)
          setState({ user, claims, loading: false, error: "" });
      } catch (e) {
        if (live)
          setState({
            user: null,
            claims: {},
            loading: false,
            error: e.message,
          });
      }
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return (
    <Context.Provider
      value={{
        ...state,
        guest: async () =>
          auth.currentUser || (await signInAnonymously(auth)).user,
      }}
    >
      {children}
    </Context.Provider>
  );
}
