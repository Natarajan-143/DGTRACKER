import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  FileText, 
  History, 
  BarChart3, 
  LogOut, 
  HeartPulse 
} from 'lucide-react';

export const Sidebar = () => {
  const { user, logout } = useAuth();

  if (!user) return null;

  const isManager = user.role === 'Manager';

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <HeartPulse size={24} className="sidebar-brand-icon" />
        <span className="sidebar-brand-text">DG Tracker</span>
      </div>
      
      <ul className="sidebar-menu">
        {isManager && (
          <li className="sidebar-item">
            <NavLink 
              to="/" 
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              end
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>
          </li>
        )}
        
        <li className="sidebar-item">
          <NavLink 
            to="/data-entry" 
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <FileText size={18} />
            <span>Data Entry</span>
          </NavLink>
        </li>
        
        {isManager && (
          <li className="sidebar-item">
            <NavLink 
              to="/history" 
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <History size={18} />
              <span>History</span>
            </NavLink>
          </li>
        )}
        
        {isManager && (
          <li className="sidebar-item">
            <NavLink 
              to="/reports" 
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <BarChart3 size={18} />
              <span>Reports</span>
            </NavLink>
          </li>
        )}
      </ul>
      
      <div className="sidebar-footer">
        <div className="user-badge mb-3">
          <div className="user-badge-avatar">
            {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="user-badge-info">
            <span className="user-badge-name">{user.email}</span>
            <span className="user-badge-role">
              {user.role}{user.branch ? ` (${user.branch})` : ''}
            </span>
          </div>
        </div>
        <button 
          onClick={logout} 
          className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center gap-2"
          style={{ borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600 }}
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  );
};
