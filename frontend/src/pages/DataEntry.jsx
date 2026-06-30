import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  FilePlus2, 
  HelpCircle, 
  ArrowRightLeft, 
  AlertCircle, 
  CheckCircle2,
  Trash2,
  Edit2
} from 'lucide-react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Card from 'react-bootstrap/Card';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';

export const DataEntry = () => {
  const { user } = useAuth();
  
  const [reportDate, setReportDate] = useState('');
  const [numberOfOp, setNumberOfOp] = useState('');
  const [newDgRequests, setNewDgRequests] = useState('');
  const [totalDgCompletedToday, setTotalDgCompletedToday] = useState('');
  const [newDgCompletedTodayItself, setNewDgCompletedTodayItself] = useState('');
  const [newDgMovedToFollowUp, setNewDgMovedToFollowUp] = useState('');
  const [branch, setBranch] = useState(user?.branch || 'Tambaram');
  
  // Auto-calculated fields
  const [openingDg, setOpeningDg] = useState(0);
  const [closingDg, setClosingDg] = useState(0);

  // Status indicators
  const [isLoadingPrevClose, setIsLoadingPrevClose] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Recent reports for the branch
  const [recentReports, setRecentReports] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const fetchRecentReports = async () => {
    if (!branch) return;
    setLoadingRecent(true);
    try {
      const response = await axios.get(`/api/reports?page=1&limit=10&branch=${branch}`);
      setRecentReports(response.data.data);
    } catch (err) {
      console.error('Error fetching recent reports:', err);
    } finally {
      setLoadingRecent(false);
    }
  };

  useEffect(() => {
    fetchRecentReports();
  }, [branch]);

  // Keep branch in sync with logged-in user if they are an Employee
  useEffect(() => {
    if (user && user.role === 'Employee' && user.branch) {
      setBranch(user.branch);
    }
  }, [user]);

  // 1. Fetch previous day's closing DG when date/branch changes
  useEffect(() => {
    if (!reportDate || !branch) {
      setOpeningDg(0);
      return;
    }
    
    const resolveOpeningDg = async () => {
      setIsLoadingPrevClose(true);
      setErrorMsg('');
      try {
        // Fetch recent reports to find the closest preceding date for this branch
        const response = await axios.get(`/api/reports?page=1&limit=100&branch=${branch}`);
        const list = response.data.data;
        
        const targetTime = new Date(reportDate).getTime();
        
        // Check if there is an exact match for the selected date
        const existingRecord = list.find(r => {
          if (!r.report_date) return false;
          const recDate = typeof r.report_date === 'string' ? r.report_date.split('T')[0] : new Date(r.report_date).toISOString().split('T')[0];
          return recDate === reportDate;
        });

        if (existingRecord) {
          // Pre-populate fields for inline editing
          setNumberOfOp(existingRecord.number_of_op);
          setNewDgRequests(existingRecord.new_dg_requests);
          setTotalDgCompletedToday(existingRecord.total_dg_completed_today);
          setNewDgCompletedTodayItself(existingRecord.new_dg_completed_today_itself);
          setNewDgMovedToFollowUp(existingRecord.new_dg_moved_to_follow_up);
          setOpeningDg(existingRecord.opening_dg);
          setSuccessMsg(`Loaded existing record for ${reportDate}. Saving will update this record.`);
        } else {
          setSuccessMsg('');
          setNumberOfOp('');
          setNewDgRequests('');
          setTotalDgCompletedToday('');
          setNewDgCompletedTodayItself('');
          setNewDgMovedToFollowUp('');

          // Filter out reports on or after selected date, sort descending to get the closest past date
          const pastRecords = list
            .filter(r => new Date(r.report_date).getTime() < targetTime)
            .sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime());
            
          if (pastRecords.length > 0) {
            setOpeningDg(pastRecords[0].closing_dg);
          } else {
            setOpeningDg(0); // If no older record exists
          }
        }
      } catch (err) {
        console.error('Error fetching preceding day closing_dg:', err);
        setOpeningDg(0);
      } finally {
        setIsLoadingPrevClose(false);
      }
    };

    resolveOpeningDg();
  }, [reportDate, branch]);

  // 2. Perform live calculation of Closing DG
  useEffect(() => {
    const taken = parseInt(totalDgCompletedToday) || 0;
    setClosingDg(openingDg - taken);
  }, [openingDg, totalDgCompletedToday]);

  // 3. Dynamically clear validation error message when inputs become valid
  useEffect(() => {
    if (!errorMsg) return;
    if (!reportDate) return;

    const numericFields = [
      openingDg,
      numberOfOp,
      newDgRequests,
      totalDgCompletedToday,
      newDgCompletedTodayItself,
      newDgMovedToFollowUp
    ];

    for (const val of numericFields) {
      if (val === '') return;
      const num = Number(val);
      if (!Number.isInteger(num) || num < 0) return;
    }

    const req = parseInt(newDgRequests) || 0;
    const today = parseInt(newDgCompletedTodayItself) || 0;
    const follow = parseInt(newDgMovedToFollowUp) || 0;

    if (req !== today + follow) return;
    if (closingDg < 0) return;

    setErrorMsg('');
  }, [
    reportDate,
    openingDg,
    numberOfOp,
    newDgRequests,
    totalDgCompletedToday,
    newDgCompletedTodayItself,
    newDgMovedToFollowUp,
    closingDg,
    errorMsg
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Validations
    if (!reportDate) {
      setErrorMsg('Date cannot be empty.');
      return;
    }
    if (!branch) {
      setErrorMsg('Branch must be selected.');
      return;
    }

    const numericFields = { 
      'Opening DG': openingDg,
      'Number of OP': numberOfOp, 
      'New DG Requests': newDgRequests, 
      'Total DG Completed Today': totalDgCompletedToday, 
      'New DG Completed Today Itself': newDgCompletedTodayItself, 
      'New DG Moved To Follow-Up': newDgMovedToFollowUp 
    };

    for (const [key, value] of Object.entries(numericFields)) {
      if (value === '') {
        setErrorMsg(`Field "${key}" must be filled.`);
        return;
      }
      const num = Number(value);
      if (!Number.isInteger(num) || num < 0) {
        setErrorMsg(`Field "${key}" must be a positive integer.`);
        return;
      }
    }

    const req = parseInt(newDgRequests) || 0;
    const today = parseInt(newDgCompletedTodayItself) || 0;
    const follow = parseInt(newDgMovedToFollowUp) || 0;
    
    // Core validation: NEW DG REQUESTS must equal NEW DG COMPLETED TODAY ITSELF + NEW DG MOVED TO FOLLOW-UP
    if (req !== today + follow) {
      setErrorMsg(`Validation error: New DG Requests (${req}) must be equal to New DG Completed Today Itself (${today}) + New DG Moved To Follow-Up (${follow}).`);
      return;
    }

    if (closingDg < 0) {
      setErrorMsg(`Invalid metrics: Closing DG (${closingDg}) cannot be negative. Adjust Total DG Completed Today.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post('/api/reports', {
        report_date: reportDate,
        number_of_op: parseInt(numberOfOp),
        new_dg_requests: req,
        total_dg_completed_today: parseInt(totalDgCompletedToday),
        new_dg_completed_today_itself: today,
        new_dg_moved_to_follow_up: follow,
        opening_dg: parseInt(openingDg) || 0,
        branch: branch
      });

      setSuccessMsg(`Daily report for ${reportDate} logged successfully! Forward sequence recalculated.`);
      
      // Clear form and refresh recent table
      handleClearForm();
      fetchRecentReports();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to submit report. Ensure the date is unique.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecent = async (id, dateStr) => {
    if (!window.confirm(`Are you absolutely sure you want to delete the report for "${dateStr}"?\nAll subsequent days for this branch will be automatically recalculated.`)) {
      return;
    }
    try {
      await axios.delete(`/api/reports/${id}`);
      setSuccessMsg(`Report for ${dateStr} deleted successfully and forward records recalculated.`);
      fetchRecentReports();
      handleClearForm();
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to delete record.');
    }
  };

  const handleClearForm = () => {
    setReportDate('');
    setNumberOfOp('');
    setNewDgRequests('');
    setTotalDgCompletedToday('');
    setNewDgCompletedTodayItself('');
    setNewDgMovedToFollowUp('');
    setOpeningDg(0);
    setClosingDg(0);
  };

  const handleClearClick = () => {
    handleClearForm();
    setErrorMsg('');
    setSuccessMsg('');
  };

  const isClosingDgInvalid = closingDg < 0;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Daily Data Entry</h1>
          <span className="page-subtitle">Log statistics for branch: <strong>{branch}</strong></span>
        </div>
      </div>

      {successMsg && (
        <Alert variant="success" className="d-flex align-items-center gap-2 mb-4">
          <CheckCircle2 size={18} className="text-success" />
          <span>{successMsg}</span>
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" className="d-flex align-items-center gap-2 mb-4">
          <AlertCircle size={18} className="text-danger" />
          <span>{errorMsg}</span>
        </Alert>
      )}

      <div className="content-card">
        <div className="card-title-border">
          <FilePlus2 size={18} className="text-primary" />
          <span>Daily Diagnosis Records</span>
        </div>

        <Form onSubmit={handleSubmit}>
          <div className="row">
            {/* Form Fields */}
            <div className="col-md-7">
              <div className="row g-3">
                <div className="col-sm-6">
                  <Form.Group controlId="formBranch">
                    <Form.Label className="form-label">Selected Branch</Form.Label>
                    {user?.role === 'Manager' ? (
                      <Form.Select 
                        value={branch} 
                        onChange={(e) => {
                          setBranch(e.target.value);
                          handleClearForm();
                        }}
                        required
                      >
                        <option value="Tambaram">Tambaram</option>
                        <option value="OMR">OMR</option>
                        <option value="ECR">ECR</option>
                      </Form.Select>
                    ) : (
                      <Form.Control 
                        type="text" 
                        value={branch} 
                        disabled 
                        readOnly 
                      />
                    )}
                  </Form.Group>
                </div>

                <div className="col-sm-6">
                  <Form.Group controlId="formDate">
                    <Form.Label className="form-label">Report Date</Form.Label>
                    <div className="position-relative">
                      <Form.Control 
                        type="date"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                        required
                      />
                    </div>
                  </Form.Group>
                </div>

                <div className="col-sm-6">
                  <Form.Group controlId="formOpening">
                    <Form.Label className="form-label">Opening DG</Form.Label>
                    <Form.Control 
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={openingDg}
                      onChange={(e) => setOpeningDg(e.target.value)}
                      disabled={isLoadingPrevClose}
                      required
                    />
                  </Form.Group>
                </div>
                
                <div className="col-sm-6">
                  <Form.Group controlId="formOp">
                    <Form.Label className="form-label">Number of OP</Form.Label>
                    <Form.Control 
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={numberOfOp}
                      onChange={(e) => setNumberOfOp(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>

                <div className="col-sm-6">
                  <Form.Group controlId="formRequested">
                    <Form.Label className="form-label">New DG Requests</Form.Label>
                    <Form.Control 
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={newDgRequests}
                      onChange={(e) => setNewDgRequests(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>

                <div className="col-sm-6">
                  <Form.Group controlId="formTaken">
                    <Form.Label className="form-label">Total DG Completed Today</Form.Label>
                    <Form.Control 
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={totalDgCompletedToday}
                      onChange={(e) => setTotalDgCompletedToday(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>

                <div className="col-sm-6">
                  <Form.Group controlId="formTodayCount">
                    <Form.Label className="form-label">New DG Completed Today Itself</Form.Label>
                    <Form.Control 
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={newDgCompletedTodayItself}
                      onChange={(e) => setNewDgCompletedTodayItself(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>

                <div className="col-sm-6">
                  <Form.Group controlId="formFollowUp">
                    <Form.Label className="form-label">New DG Moved To Follow-Up</Form.Label>
                    <Form.Control 
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={newDgMovedToFollowUp}
                      onChange={(e) => setNewDgMovedToFollowUp(e.target.value)}
                      required
                    />
                  </Form.Group>
                </div>
              </div>
            </div>

            {/* Live Auto-Calculations Sidebar */}
            <div className="col-md-5 mt-4 mt-md-0">
              <div className="h-100 d-flex flex-column justify-content-between">
                <div className="calc-panel">
                  <div className="calc-title d-flex align-items-center gap-1">
                    <ArrowRightLeft size={14} />
                    <span>Real-time Equations</span>
                  </div>

                  <div className="calc-row">
                    <span className="text-muted">Opening DG:</span>
                    <span className="font-monospace fw-bold text-dark">
                      {isLoadingPrevClose ? (
                        <Spinner size="sm" animation="border" style={{ width: '12px', height: '12px' }} />
                      ) : (
                        openingDg
                      )}
                    </span>
                  </div>

                  <div className="calc-row">
                    <span className="text-muted">Total DG Completed Today:</span>
                    <span className="font-monospace text-dark">-{totalDgCompletedToday || 0}</span>
                  </div>

                  <hr className="my-2" />

                  <div className="calc-row">
                    <span className="fw-semibold text-dark">Closing DG:</span>
                    <span className={`font-monospace fw-bold ${isClosingDgInvalid ? 'text-danger' : 'text-success'}`} style={{ fontSize: '1.1rem' }}>
                      {closingDg}
                    </span>
                  </div>

                  {isClosingDgInvalid && (
                    <div className="text-danger mt-2" style={{ fontSize: '0.75rem', lineHeight: '1.3' }}>
                      <AlertCircle size={12} className="me-1 inline" />
                      Closing DG cannot be negative. Please check parameters.
                    </div>
                  )}
                </div>

                <div className="mt-4 d-flex gap-2">
                  <Button 
                    type="submit" 
                    variant="primary" 
                    className="flex-grow-1 py-2"
                    disabled={isSubmitting || isClosingDgInvalid}
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner size="sm" animation="border" className="me-2" />
                        Saving...
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline-secondary" 
                    className="py-2"
                    onClick={handleClearClick}
                    disabled={isSubmitting}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Form>
      </div>

      {/* Recent Records Table for current Branch */}
      <div className="content-card mt-4">
        <div className="card-title-border d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <FilePlus2 size={18} className="text-success" />
            <span>Recent Data Entries ({branch})</span>
          </div>
        </div>

        {loadingRecent ? (
          <div className="text-center py-4">
            <Spinner animation="border" variant="success" size="sm" />
          </div>
        ) : recentReports.length > 0 ? (
          <div className="table-responsive">
            <Table className="table-custom mt-2" hover size="sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-end">Opening</th>
                  <th className="text-end">OP Volume</th>
                  <th className="text-end">Requests</th>
                  <th className="text-end">Completed</th>
                  <th className="text-end">Closing</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentReports.map((row) => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 500 }}>
                      {new Date(row.report_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'UTC'
                      })}
                    </td>
                    <td className="text-end font-monospace">{row.opening_dg}</td>
                    <td className="text-end">{row.number_of_op}</td>
                    <td className="text-end">{row.new_dg_requests}</td>
                    <td className="text-end">{row.total_dg_completed_today}</td>
                    <td className="text-end font-monospace fw-bold text-success">{row.closing_dg}</td>
                    <td>
                      <div className="d-flex justify-content-center gap-2">
                        <Button 
                          variant="outline-primary" 
                          size="sm"
                          onClick={() => setReportDate(row.report_date.split('T')[0])}
                          title="Load/Edit this record"
                          style={{ padding: '2px 6px', borderRadius: '4px' }}
                        >
                          <Edit2 size={12} />
                        </Button>
                        <Button 
                          variant="outline-danger" 
                          size="sm"
                          onClick={() => handleDeleteRecent(row.id, row.report_date.split('T')[0])}
                          title="Delete this record"
                          style={{ padding: '2px 6px', borderRadius: '4px' }}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-4 text-muted" style={{ fontSize: '0.85rem' }}>
            No recent reports found for branch "{branch}".
          </div>
        )}
      </div>

      {/* Rules Information Box */}
      <Card className="border-0 shadow-sm mt-4" style={{ backgroundColor: 'rgba(37,99,235,0.03)', borderLeft: '4px solid var(--primary)' }}>
        <Card.Body className="p-3">
          <div className="d-flex gap-2 text-primary mb-1 align-items-center" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
            <HelpCircle size={16} />
            <span>BUSINESS RULES MATRIX</span>
          </div>
          <div className="text-muted m-0" style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
            1. **Opening DG** matches the preceding chronological day's final **Closing DG** value.<br />
            2. **Closing DG** is evaluated as: `Opening DG - Total DG Completed Today`. <br />
            3. **Data validation rule**: `New DG Requests` must be exactly equal to `New DG Completed Today Itself` + `New DG Moved To Follow-Up`.
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};
