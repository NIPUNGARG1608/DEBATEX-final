import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("debatex_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("debatex_token");
    if (token && !user) {
      api.get("/auth/me")
        .then((r) => {
          setUser(r.data);
          localStorage.setItem("debatex_user", JSON.stringify(r.data));
        })
        .catch(() => {});
    }
  }, []);

  const persist = (data) => {
    localStorage.setItem("debatex_token", data.token);
    localStorage.setItem("debatex_user", JSON.stringify(data.user));
    setUser(data.user);
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      persist(data);
      return data.user;
    } finally { setLoading(false); }
  };

  const signup = async (email, password, name) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", { email, password, name });
      persist(data);
      return data.user;
    } finally { setLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem("debatex_token");
    localStorage.removeItem("debatex_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
