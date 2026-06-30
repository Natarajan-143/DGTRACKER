import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL || '';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Restore authentication session from localStorage
    const savedToken = localStorage.getItem('dg_token');
    const savedUser = localStorage.getItem('dg_user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      // Setup Axios default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      const response = await axios.post('/api/auth/login', { email, password });
      const { token, user: loggedUser } = response.data;

      setToken(token);
      setUser(loggedUser);
      localStorage.setItem('dg_token', token);
      localStorage.setItem('dg_user', JSON.stringify(loggedUser));
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return loggedUser;
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Invalid credentials or connection error.';
      setError(errMsg);
      throw new Error(errMsg);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('dg_token');
    localStorage.removeItem('dg_user');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
