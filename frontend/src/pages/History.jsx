import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle
} from 'lucide-react';
import Table from 'react-bootstrap/Table';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';

export const History = () => {
  const { user } = useAuth();
  const isManager = user?.role === 'Manager';

  // Data state
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const limit = 10;

  // Search & Filter state
  const [searchDate, setSearchDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [activeFilters, setActiveFilters] = useState({ searchDate: '', startDate: '', endDate: '', branch: 'all' });

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editForm, setEditForm] = useState({
    id: '',
    report_date: '',
    number_of_op: 0,
    new_dg_requests: 0,
    total_dg_completed_today: 0,
    new_dg_completed_today_itself: 0,
    new_dg_moved_to_follow_up: 0,
    opening_dg: 0,
    branch: 'Tambaram'
  });
  const [editError, setEditError] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [page, activeFilters]);

  // Clear edit modal error dynamically when inputs become valid
  useEffect(() => {
    if (!editError) return;
    if (!editForm.report_date) return;

    const fields = ['number_of_op', 'new_dg_requests', 'total_dg_completed_today', 'new_dg_completed_today_itself', 'new_dg_moved_to_follow_up'];
    for (const field of fields) {
      const val = Number(editForm[field]);
      if (isNaN(val) || val < 0 || !Number.isInteger(val)) return;
    }

    const req = Number(editForm.new_dg_requests);
    const today = Number(editForm.new_dg_completed_today_itself);
    const follow = Number(editForm.new_dg_moved_to_follow_up);

    if (req !== today + follow) return;

    const closingDg = Number(editForm.opening_dg) - Number(editForm.total_dg_completed_today);
    if (closingDg < 0) return;

    setEditError('');
  }, [editForm, editError]);

  // Fetch opening DG dynamically for edit modal if date or branch changes
  useEffect(() => {
    if (!showEditModal || !editForm.report_date || !editForm.branch) return;
    
    // We only want to fetch if the date or branch has changed from the original values
    const originalDate = editingReport ? new Date(editingReport.report_date).toISOString().split('T')[0] : '';
    const originalBranch = editingReport ? editingReport.branch : '';
    
    if (editForm.report_date === originalDate && editForm.branch === originalBranch) {
      // Restore original opening DG
      setEditForm(prev => ({ ...prev, opening_dg: editingReport.opening_dg }));
      return;
    }
    
    const fetchPrevClosing = async () => {
      try {
        const response = await axios.get(`/api/reports?page=1&limit=100&branch=${editForm.branch}`);
        const list = response.data.data;
        const targetTime = new Date(editForm.report_date).getTime();
        
        const pastRecords = list
          .filter(r => new Date(r.report_date).getTime() < targetTime && r.id !== editForm.id)
          .sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime());
          
        if (pastRecords.length > 0) {
          setEditForm(prev => ({ ...prev, opening_dg: pastRecords[0].closing_dg }));
        } else {
          setEditForm(prev => ({ ...prev, opening_dg: 0 }));
        }
      } catch (err) {
        console.error('Error fetching opening dg for edit:', err);
      }
    };
    
    fetchPrevClosing();
  }, [editForm.report_date, editForm.branch, showEditModal]);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/reports?page=${page}&limit=${limit}`;
      if (activeFilters.branch && activeFilters.branch !== 'all') {
        url += `&branch=${activeFilters.branch}`;
      }
      if (activeFilters.searchDate) {
        url += `&searchDate=${activeFilters.searchDate}`;
      } else {
        if (activeFilters.startDate) url += `&startDate=${activeFilters.startDate}`;
        if (activeFilters.endDate) url += `&endDate=${activeFilters.endDate}`;
      }

      const response = await axios.get(url);
      setReports(response.data.data);
      setTotalPages(response.data.pagination.totalPages);
      setTotalRecords(response.data.pagination.total);
    } catch (err) {
      console.error('Fetch history error:', err);
      setError('Failed to retrieve history logs. Please check server connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    setActiveFilters({ searchDate, startDate, endDate, branch: selectedBranch });
  };

  const handleClearFilters = () => {
    setSearchDate('');
    setStartDate('');
    setEndDate('');
    setSelectedBranch('all');
    setPage(1);
    setActiveFilters({ searchDate: '', startDate: '', endDate: '', branch: 'all' });
  };

  const handleDelete = async (id, dateStr) => {
    if (!window.confirm(`Are you absolutely sure you want to delete the report for "${dateStr}"?\nAll subsequent days for this branch will be automatically recalculated.`)) {
      return;
    }

    try {
      await axios.delete(`/api/reports/${id}`);
      fetchHistory();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete record.');
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (report) => {
    const dateFormatted = new Date(report.report_date).toISOString().split('T')[0];
    setEditingReport(report);
    setEditForm({
      id: report.id,
      report_date: dateFormatted,
      number_of_op: report.number_of_op,
      new_dg_requests: report.new_dg_requests,
      total_dg_completed_today: report.total_dg_completed_today,
      new_dg_completed_today_itself: report.new_dg_completed_today_itself,
      new_dg_moved_to_follow_up: report.new_dg_moved_to_follow_up,
      opening_dg: report.opening_dg,
      branch: report.branch || 'Tambaram'
    });
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditError('');

    // Validations
    if (!editForm.report_date) {
      setEditError('Date cannot be empty.');
      return;
    }

    const fields = ['number_of_op', 'new_dg_requests', 'total_dg_completed_today', 'new_dg_completed_today_itself', 'new_dg_moved_to_follow_up'];
    for (const field of fields) {
      const val = Number(editForm[field]);
      if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
        setEditError(`Field "${field}" must be a non-negative integer.`);
        return;
      }
    }

    const req = Number(editForm.new_dg_requests);
    const today = Number(editForm.new_dg_completed_today_itself);
    const follow = Number(editForm.new_dg_moved_to_follow_up);
    
    // Core validation: NEW DG REQUESTS must equal NEW DG COMPLETED TODAY ITSELF + NEW DG MOVED TO FOLLOW-UP
    if (req !== today + follow) {
      setEditError(`Validation error: New DG Requests (${req}) must be equal to New DG Completed Today Itself (${today}) + New DG Moved To Follow-Up (${follow}).`);
      return;
    }

    // Evaluate closing DG
    const closingDg = Number(editForm.opening_dg) - Number(editForm.total_dg_completed_today);
    if (closingDg < 0) {
      setEditError(`Invalid calculation: Closing DG (${closingDg}) would be negative. Adjust Total DG Completed Today.`);
      return;
    }

    setIsSavingEdit(true);
    try {
      await axios.put(`/api/reports/${editForm.id}`, {
        report_date: editForm.report_date,
        number_of_op: parseInt(editForm.number_of_op),
        new_dg_requests: req,
        total_dg_completed_today: parseInt(editForm.total_dg_completed_today),
        new_dg_completed_today_itself: today,
        new_dg_moved_to_follow_up: follow,
        opening_dg: parseInt(editForm.opening_dg) || 0,
        branch: editForm.branch
      });
      setShowEditModal(false);
      fetchHistory();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update record.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Calculate live Closing DG inside Modal
  const modalClosingDg = Number(editForm.opening_dg) - (Number(editForm.total_dg_completed_today) || 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Diagnosis Logs</h1>
          <span className="page-subtitle">Track historical records and cascading adjustments</span>
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="d-flex align-items-center gap-2 mb-4">
          <AlertCircle size={18} />
          <span>{error}</span>
        </Alert>
      )}

      {/* Filter and Search Panel */}
      <div className="content-card">
        <Form onSubmit={handleApplyFilters}>
          <div className="row align-items-end g-3">
            <div className="col-lg-2 col-md-4 col-sm-6">
              <Form.Group controlId="filterBranch">
                <Form.Label className="form-label">Branch</Form.Label>
                <Form.Select 
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                >
                  <option value="all">All Branches</option>
                  <option value="Tambaram">Tambaram</option>
                  <option value="OMR">OMR</option>
                  <option value="ECR">ECR</option>
                </Form.Select>
              </Form.Group>
            </div>

            <div className="col-lg-3 col-md-4 col-sm-6">
              <Form.Group controlId="searchDate">
                <Form.Label className="form-label d-flex align-items-center gap-1">
                  <Search size={14} /> Search Exact Date
                </Form.Label>
                <Form.Control 
                  type="date"
                  value={searchDate}
                  onChange={(e) => {
                    setSearchDate(e.target.value);
                    setStartDate(''); // Clear range if searching specific date
                    setEndDate('');
                  }}
                />
              </Form.Group>
            </div>

            <div className="col-lg-4 col-md-6 col-sm-12">
              <Form.Label className="form-label d-flex align-items-center gap-1">
                <Filter size={14} /> Filter Date Range
              </Form.Label>
              <div className="d-flex align-items-center gap-2">
                <Form.Control 
                  type="date"
                  value={startDate}
                  disabled={!!searchDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span className="text-muted">to</span>
                <Form.Control 
                  type="date"
                  value={endDate}
                  disabled={!!searchDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="col-lg-3 col-md-12 d-flex gap-2">
              <Button type="submit" variant="primary" className="flex-grow-1">
                Apply Filters
              </Button>
              <Button type="button" variant="outline-secondary" onClick={handleClearFilters}>
                Reset
              </Button>
            </div>
          </div>
        </Form>
      </div>

      {/* History Table Card */}
      <div className="content-card">
        {loading ? (
          <div className="d-flex justify-content-center align-items-center py-5">
            <Spinner animation="border" variant="primary" />
          </div>
        ) : reports.length > 0 ? (
          <div>
            <div className="table-responsive">
              <Table className="table-custom" hover>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Branch</th>
                    <th className="text-end">Opening DG</th>
                    <th className="text-end">Number of OP</th>
                    <th className="text-end">New DG Requests</th>
                    <th className="text-end">Total DG Completed Today</th>
                    <th className="text-end">New DG Completed Today Itself</th>
                    <th className="text-end">New DG Moved To Follow-Up</th>
                    <th className="text-end">Closing DG</th>
                    {isManager && <th className="text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>
                        {new Date(row.report_date).toLocaleDateString('en-US', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'UTC'
                        })}
                      </td>
                      <td style={{ fontWeight: 500 }}>{row.branch || 'Tambaram'}</td>
                      <td className="text-end font-monospace">{row.opening_dg}</td>
                      <td className="text-end">{row.number_of_op}</td>
                      <td className="text-end">{row.new_dg_requests}</td>
                      <td className="text-end">{row.total_dg_completed_today}</td>
                      <td className="text-end">{row.new_dg_completed_today_itself}</td>
                      <td className="text-end">{row.new_dg_moved_to_follow_up}</td>
                      <td className="text-end font-monospace fw-bold text-success">{row.closing_dg}</td>
                      {isManager && (
                        <td>
                          <div className="d-flex justify-content-center gap-2">
                            <Button 
                              variant="outline-primary" 
                              size="sm"
                              onClick={() => handleOpenEdit(row)}
                              title="Edit record"
                              style={{ padding: '4px 8px', borderRadius: '6px' }}
                            >
                              <Edit2 size={13} />
                            </Button>
                            <Button 
                              variant="outline-danger" 
                              size="sm"
                              onClick={() => handleDelete(row.id, row.report_date.split('T')[0])}
                              title="Delete record"
                              style={{ padding: '4px 8px', borderRadius: '6px' }}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {/* Pagination Controls */}
            <div className="d-flex align-items-center justify-content-between mt-4">
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                Showing page <strong>{page}</strong> of {totalPages} ({totalRecords} total records)
              </span>
              
              <div className="d-flex gap-2">
                <Button 
                  variant="outline-primary" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  className="d-flex align-items-center gap-1"
                >
                  <ChevronLeft size={16} /> Prev
                </Button>
                <Button 
                  variant="outline-primary" 
                  size="sm" 
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  className="d-flex align-items-center gap-1"
                >
                  Next <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-5 text-muted">
            No report logs match the current criteria.
          </div>
        )}
      </div>

      {/* Edit Record Modal (Manager Only) */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Modify Diagnosis Entry
          </Modal.Title>
        </Modal.Header>
        
        <Form onSubmit={handleSaveEdit}>
          <Modal.Body>
            {editError && (
              <Alert variant="danger" className="d-flex align-items-center gap-2 mb-3">
                <AlertCircle size={16} />
                <span>{editError}</span>
              </Alert>
            )}

            <div className="row g-3">
              <div className="col-sm-6">
                <Form.Group controlId="editBranch">
                  <Form.Label className="form-label">Branch</Form.Label>
                  <Form.Select 
                    name="branch"
                    value={editForm.branch}
                    onChange={handleEditChange}
                    required
                  >
                    <option value="Tambaram">Tambaram</option>
                    <option value="OMR">OMR</option>
                    <option value="ECR">ECR</option>
                  </Form.Select>
                </Form.Group>
              </div>

              <div className="col-sm-6">
                <Form.Group controlId="editReportDate">
                  <Form.Label className="form-label">Report Date</Form.Label>
                  <Form.Control 
                    type="date"
                    name="report_date"
                    value={editForm.report_date}
                    onChange={handleEditChange}
                    required
                  />
                </Form.Group>
              </div>

              <div className="col-sm-6">
                <Form.Group controlId="editOp">
                  <Form.Label className="form-label">Number of OP</Form.Label>
                  <Form.Control 
                    type="number"
                    min="0"
                    name="number_of_op"
                    value={editForm.number_of_op}
                    onChange={handleEditChange}
                    required
                  />
                </Form.Group>
              </div>

              <div className="col-sm-6">
                <Form.Group controlId="editRequested">
                  <Form.Label className="form-label">New DG Requests</Form.Label>
                  <Form.Control 
                    type="number"
                    min="0"
                    name="new_dg_requests"
                    value={editForm.new_dg_requests}
                    onChange={handleEditChange}
                    required
                  />
                </Form.Group>
              </div>

              <div className="col-sm-4">
                <Form.Group controlId="editTaken">
                  <Form.Label className="form-label">Total DG Completed Today</Form.Label>
                  <Form.Control 
                    type="number"
                    min="0"
                    name="total_dg_completed_today"
                    value={editForm.total_dg_completed_today}
                    onChange={handleEditChange}
                    required
                  />
                </Form.Group>
              </div>

              <div className="col-sm-4">
                <Form.Group controlId="editTodayCount">
                  <Form.Label className="form-label">New DG Completed Today Itself</Form.Label>
                  <Form.Control 
                    type="number"
                    min="0"
                    name="new_dg_completed_today_itself"
                    value={editForm.new_dg_completed_today_itself}
                    onChange={handleEditChange}
                    required
                  />
                </Form.Group>
              </div>

              <div className="col-sm-4">
                <Form.Group controlId="editFollowUp">
                  <Form.Label className="form-label">New DG Moved To Follow-Up</Form.Label>
                  <Form.Control 
                    type="number"
                    min="0"
                    name="new_dg_moved_to_follow_up"
                    value={editForm.new_dg_moved_to_follow_up}
                    onChange={handleEditChange}
                    required
                  />
                </Form.Group>
              </div>

              <div className="col-sm-12">
                <div className="p-3 bg-light rounded" style={{ borderLeft: '3px solid var(--accent)' }}>
                  <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.85rem' }}>
                    <span className="text-muted">Carryover Opening DG:</span>
                    <span className="font-monospace fw-semibold">{editForm.opening_dg}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-semibold" style={{ fontSize: '0.9rem' }}>Recalculated Closing DG:</span>
                    <span className={`font-monospace fw-bold ${modalClosingDg < 0 ? 'text-danger' : 'text-success'}`} style={{ fontSize: '1.1rem' }}>
                      {modalClosingDg}
                    </span>
                  </div>
                  {modalClosingDg < 0 && (
                    <div className="text-danger mt-1" style={{ fontSize: '0.75rem' }}>
                      * Triggers negative Closing DG restriction.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 text-muted" style={{ fontSize: '0.75rem' }}>
              ⚠️ **Important**: Changing fields cascades forward, which automatically updates subsequent records for the selected branch.
            </div>
          </Modal.Body>
          
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="primary" 
              disabled={isSavingEdit || modalClosingDg < 0}
            >
              {isSavingEdit ? 'Saving Changes...' : 'Confirm Adjustments'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};
