import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => authService.getCurrentUser());
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Check active Cognito session on initial mount
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        const currentUser = await authService.checkSession();
        if (isMounted) {
          setUser(currentUser);
        }
      } catch (err) {
        console.warn('Initial session check failed:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const loggedIn = await authService.login(email, password);
      setUser(loggedIn);
      return loggedIn;
    } catch (err) {
      const msg = err.message || 'Login failed. Please check your credentials.';
      setAuthError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await authService.register(userData);
      return result;
    } catch (err) {
      const msg = err.message || 'Registration failed.';
      setAuthError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const confirmRegistration = async (email, code) => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await authService.confirmRegistration(email, code);
      return result;
    } catch (err) {
      const msg = err.message || 'Verification failed. Please check the code.';
      setAuthError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async (email) => {
    try {
      return await authService.resendCode(email);
    } catch (err) {
      setAuthError(err.message || 'Failed to resend verification code.');
      throw err;
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        register,
        confirmRegistration,
        resendCode,
        logout,
        loading,
        authError,
        setAuthError,
        testAccounts: authService.getTestAccounts(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
