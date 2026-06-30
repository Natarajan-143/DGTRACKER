import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Sidebar } from './components/Sidebar';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { DataEntry } from './pages/DataEntry';
import { History } from './pages/History';
import { Reports } from './pages/Reports';

const RootRedirect = () => {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect Employees / Team Leads to Data Entry, Managers to Dashboard
  if (user.role === 'Employee' || user.role === 'Team Lead') {
    return <Navigate to="/data-entry" replace />;
  }
  
  return <Navigate to="/dashboard" replace />;
};

const Layout = ({ children }) => {
  const { user } = useAuth();

  return (
    <div className="app-container">
      {user && <Sidebar />}
      <div className={user ? "main-content" : "w-100"}>
        {children}
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route 
              path="/" 
              element={<RootRedirect />} 
            />
            
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute allowedRoles={['Manager']}>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/data-entry" 
              element={
                <ProtectedRoute allowedRoles={['Employee', 'Manager', 'Team Lead']}>
                  <DataEntry />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/history" 
              element={
                <ProtectedRoute allowedRoles={['Manager']}>
                  <History />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/reports" 
              element={
                <ProtectedRoute allowedRoles={['Manager']}>
                  <Reports />
                </ProtectedRoute>
              } 
            />
            
            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
