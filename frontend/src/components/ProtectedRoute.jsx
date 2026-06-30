import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from 'react-bootstrap/Spinner';

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <Spinner animation="border" variant="primary" className="mb-2" />
          <div className="text-muted" style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}>
            Verifying Credentials...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login page, saving the original location for post-auth navigation
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Access forbidden: redirect to root dashboard
    return <Navigate to="/" replace />;
  }

  return children;
};
