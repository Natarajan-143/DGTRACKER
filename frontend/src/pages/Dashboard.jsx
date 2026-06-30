import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { 
  FolderSync, 
  Users, 
  ClipboardCopy, 
  Activity, 
  CalendarRange, 
  ChevronRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import Table from 'react-bootstrap/Table';
import Form from 'react-bootstrap/Form';
import { Link } from 'react-router-dom';

export const Dashboard = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const [selectedBranch, setSelectedBranch] = useState('all');

  useEffect(() => {
    fetchDashboardData();
  }, [selectedBranch]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch up to 100 records to have enough historical data for consolidation and charts
      let url = '/api/reports?page=1&limit=100';
      if (selectedBranch && selectedBranch !== 'all') {
        url += `&branch=${selectedBranch}`;
      }
      
      const response = await axios.get(url);
      const rawData = response.data.data;
      
      if (!selectedBranch || selectedBranch === 'all') {
        // Group by report_date and sum
        const grouped = {};
        rawData.forEach(row => {
          const dateStr = typeof row.report_date === 'string' ? row.report_date.split('T')[0] : new Date(row.report_date).toISOString().split('T')[0];
          if (!grouped[dateStr]) {
            grouped[dateStr] = {
              id: 'consolidated-' + dateStr,
              report_date: dateStr,
              opening_dg: 0,
              number_of_op: 0,
              new_dg_requests: 0,
              total_dg_completed_today: 0,
              new_dg_completed_today_itself: 0,
              new_dg_moved_to_follow_up: 0,
              closing_dg: 0
            };
          }
          grouped[dateStr].opening_dg += row.opening_dg;
          grouped[dateStr].number_of_op += row.number_of_op;
          grouped[dateStr].new_dg_requests += row.new_dg_requests;
          grouped[dateStr].total_dg_completed_today += row.total_dg_completed_today;
          grouped[dateStr].new_dg_completed_today_itself += row.new_dg_completed_today_itself;
          grouped[dateStr].new_dg_moved_to_follow_up += row.new_dg_moved_to_follow_up;
          grouped[dateStr].closing_dg += row.closing_dg;
        });
        
        // Convert to array and sort date descending
        const consolidated = Object.values(grouped).sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime());
        setReports(consolidated.slice(0, 8)); // Take latest 8 for dashboard view
      } else {
        setReports(rawData.slice(0, 8));
      }
    } catch (err) {
      console.error('Error fetching dashboard reports:', err);
      setError('Failed to fetch dashboard metrics. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '70vh' }}>
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="page-header">
          <div className="page-title-group">
            <h1 className="page-title">Dashboard</h1>
            <span className="page-subtitle">Welcome back, {user.email}</span>
          </div>
        </div>
        <Alert variant="danger" className="d-flex align-items-center gap-2">
          <AlertCircle size={18} />
          <span>{error}</span>
        </Alert>
      </div>
    );
  }

  // Retrieve the latest report for Today/Latest values
  const latestReport = reports[0] || {
    report_date: 'No records yet',
    opening_dg: 0,
    number_of_op: 0,
    new_dg_requests: 0,
    total_dg_completed_today: 0,
    new_dg_completed_today_itself: 0,
    new_dg_moved_to_follow_up: 0,
    closing_dg: 0
  };

  const formattedDate = latestReport.report_date !== 'No records yet'
    ? new Date(latestReport.report_date).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC'
      })
    : 'No records entered';

  // Prepare chart coordinates based on reports (oldest to newest)
  const chartData = [...reports].reverse();
  const maxOP = Math.max(...chartData.map(d => d.number_of_op), 10);
  const padding = 30;
  const width = 500;
  const height = 180;
  
  return (
    <div>
      <div className="page-header d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div className="page-title-group">
          <h1 className="page-title">Diagnosis Metrics</h1>
          <span className="page-subtitle">Welcome to DG Tracker, {user.email}</span>
        </div>
        
        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-2">
            <span className="text-muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Branch:</span>
            <Form.Select 
              value={selectedBranch} 
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{ width: '220px', borderRadius: '8px' }}
            >
              <option value="all">All Branches (Consolidated)</option>
              <option value="Tambaram">Tambaram</option>
              <option value="OMR">OMR</option>
              <option value="ECR">ECR</option>
            </Form.Select>
          </div>
          
          {latestReport.report_date !== 'No records yet' && (
            <div className="badge bg-white text-dark border p-2 rounded shadow-sm d-flex align-items-center gap-2">
              <CalendarRange size={16} className="text-primary" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Latest Update: {formattedDate}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-title">Opening DG</span>
            <span className="kpi-value">{latestReport.opening_dg}</span>
          </div>
          <div className="kpi-icon-wrapper kpi-blue">
            <FolderSync size={22} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-title">Number of OP</span>
            <span className="kpi-value">{latestReport.number_of_op}</span>
          </div>
          <div className="kpi-icon-wrapper kpi-cyan">
            <Users size={22} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-title">New DG Requests</span>
            <span className="kpi-value">{latestReport.new_dg_requests}</span>
          </div>
          <div className="kpi-icon-wrapper kpi-amber">
            <ClipboardCopy size={22} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-title">Total DG Completed Today</span>
            <span className="kpi-value">{latestReport.total_dg_completed_today}</span>
          </div>
          <div className="kpi-icon-wrapper kpi-green">
            <Activity size={22} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-title">New DG Completed Today Itself</span>
            <span className="kpi-value">{latestReport.new_dg_completed_today_itself}</span>
          </div>
          <div className="kpi-icon-wrapper kpi-green">
            <Activity size={22} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-title">New DG Moved To Follow-Up</span>
            <span className="kpi-value">{latestReport.new_dg_moved_to_follow_up}</span>
          </div>
          <div className="kpi-icon-wrapper kpi-amber">
            <Users size={22} />
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-info">
            <span className="kpi-title">Closing DG</span>
            <span className="kpi-value">{latestReport.closing_dg}</span>
          </div>
          <div className="kpi-icon-wrapper kpi-green">
            <FolderSync size={22} />
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* OP Trend Chart */}
        <div className="content-card">
          <div className="card-title-border">
            <TrendingUp size={18} className="text-primary" />
            <span>Outpatient (OP) Volume Trend ({selectedBranch === 'all' ? 'Consolidated' : selectedBranch})</span>
          </div>
          
          {chartData.length > 1 ? (
            <div className="p-2 bg-light rounded text-center">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-100" style={{ maxHeight: '250px' }}>
                <defs>
                  <linearGradient id="opGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.8"/>
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.2"/>
                  </linearGradient>
                </defs>
                
                {/* Horizontal grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = padding + (1 - ratio) * (height - 2 * padding);
                  const val = Math.round(ratio * maxOP);
                  return (
                    <g key={i}>
                      <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="3,3" />
                      <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{val}</text>
                    </g>
                  );
                })}

                {/* Draw trend path */}
                {chartData.map((d, index) => {
                  const x = padding + (index / (chartData.length - 1)) * (width - 2 * padding);
                  const y = height - padding - (d.number_of_op / maxOP) * (height - 2 * padding);
                  const dateStr = new Date(d.report_date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
                  return (
                    <g key={d.id}>
                      <circle cx={x} cy={y} r="5" fill="#0ea5e9" stroke="#fff" strokeWidth="2" style={{ cursor: 'pointer' }} />
                      <line x1={x} y1={y} x2={x} y2={height - padding} stroke="#0ea5e9" strokeOpacity="0.3" strokeWidth="1" />
                      <text x={x} y={height - 10} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="500">{dateStr}</text>
                    </g>
                  );
                })}

                {/* SVG Polyline */}
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  points={chartData.map((d, index) => {
                    const x = padding + (index / (chartData.length - 1)) * (width - 2 * padding);
                    const y = height - padding - (d.number_of_op / maxOP) * (height - 2 * padding);
                    return `${x},${y}`;
                  }).join(' ')}
                />
              </svg>
              <div className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
                * Displaying reports sorted chronologically (left to right)
              </div>
            </div>
          ) : (
            <div className="d-flex align-items-center justify-content-center bg-light rounded text-muted" style={{ height: '180px', fontSize: '0.9rem' }}>
              Add more data entries to visualize clinical volume trends.
            </div>
          )}
        </div>

        {/* Recent reports list */}
        <div className="content-card">
          <div className="card-title-border justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <Activity size={18} className="text-success" />
              <span>Recent Logs</span>
            </div>
            {/* Managers have access to History */}
            <Link to="/history" className="text-primary text-decoration-none d-flex align-items-center gap-1" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              History <ChevronRight size={14} />
            </Link>
          </div>

          {reports.length > 0 ? (
            <div className="table-responsive">
              <Table className="table-custom" hover size="sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-end">Number of OP</th>
                    <th className="text-end">Closing DG</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.slice(0, 5).map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 500 }}>
                        {new Date(row.report_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', timeZone: 'UTC' })}
                      </td>
                      <td className="text-end">{row.number_of_op}</td>
                      <td className="text-end text-success font-monospace" style={{ fontWeight: 600 }}>{row.closing_dg}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-4 text-muted" style={{ fontSize: '0.9rem' }}>
              No data entered yet. Go to <Link to="/data-entry">Data Entry</Link> to start.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
