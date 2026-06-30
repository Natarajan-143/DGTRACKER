import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { HeartPulse, KeyRound, Mail, AlertCircle, Info } from 'lucide-react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const { login, user, setError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setError(null);

    if (!email.trim() || !password) {
      setLocalError('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
      // Success redirect happens in useEffect
    } catch (err) {
      setLocalError(err.message || 'Login failed. Please check your credentials.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <HeartPulse size={48} className="login-logo-icon" />
          <h1 className="login-title">DG Tracker</h1>
          <div className="login-subtitle">Hospital Diagnosis Tracking Desk</div>
        </div>

        {localError && (
          <Alert variant="danger" className="d-flex align-items-center gap-2 py-2" style={{ borderRadius: '8px', fontSize: '0.875rem' }}>
            <AlertCircle size={16} className="flex-shrink-0" />
            <div>{localError}</div>
          </Alert>
        )}

        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formEmail">
            <Form.Label className="text-light" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
              Username
            </Form.Label>
            <div className="position-relative">
              <Mail size={16} className="position-absolute text-muted" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <Form.Control 
                type="text" 
                placeholder="enter username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  paddingLeft: '38px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  borderRadius: '8px'
                }}
              />
            </div>
          </Form.Group>

          <Form.Group className="mb-4" controlId="formPassword">
            <Form.Label className="text-light" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
              Security Password
            </Form.Label>
            <div className="position-relative">
              <KeyRound size={16} className="position-absolute text-muted" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <Form.Control 
                type="password" 
                placeholder="enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  paddingLeft: '38px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  borderRadius: '8px'
                }}
              />
            </div>
          </Form.Group>

          <Button 
            variant="primary" 
            type="submit" 
            className="w-100 mb-3 d-flex align-items-center justify-content-center gap-2"
            disabled={isSubmitting}
            style={{ padding: '0.75rem', borderRadius: '8px', fontWeight: 600 }}
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" animation="border" />
                <span>Logging in...</span>
              </>
            ) : (
              'Access Account'
            )}
          </Button>
        </Form>


      </div>
    </div>
  );
};
