import React, { useState } from 'react';
import axios from 'axios';
import { 
  BarChart3, 
  Download, 
  FileSpreadsheet, 
  FileCheck,
  AlertCircle
} from 'lucide-react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Card from 'react-bootstrap/Card';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';

export const Reports = () => {
  // Report mode selection: 'daily' or 'monthly'
  const [reportMode, setReportMode] = useState('monthly');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');

  // Generated Report Data
  const [generatedReports, setGeneratedReports] = useState([]);
  const [summaryStats, setSummaryStats] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Download loading states
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Helper: Get range for query
  const getSelectedRange = () => {
    let start = '';
    let end = '';

    if (reportMode === 'daily') {
      if (!selectedDate) return null;
      start = selectedDate;
      end = selectedDate;
    } else {
      if (!selectedMonth) return null;
      start = `${selectedMonth}-01`;
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr);
      // Last day of target month: Date(year, month, 0)
      const lastDay = new Date(year, month, 0).getDate();
      end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    }

    return { start, end };
  };

  const handleGenerateReport = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setHasSearched(false);
    setSummaryStats(null);
    setGeneratedReports([]);

    const range = getSelectedRange();
    if (!range) {
      setErrorMsg('Please select a valid date/month.');
      return;
    }

    setLoading(true);
    try {
      // Fetch up to 100 records for the report preview
      let url = `/api/reports?startDate=${range.start}&endDate=${range.end}&limit=100`;
      if (selectedBranch !== 'all') {
        url += `&branch=${selectedBranch}`;
      }

      const response = await axios.get(url);
      const list = response.data.data;
      
      let processedList = list;
      if (selectedBranch === 'all') {
        // Group by report_date and sum
        const grouped = {};
        list.forEach(row => {
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
        processedList = Object.values(grouped);
      }

      // Sort chronologically ASC for preview rendering
      const sorted = [...processedList].sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime());
      setGeneratedReports(sorted);

      if (sorted.length > 0) {
        // Compile summary statistics
        const opSum = sorted.reduce((acc, r) => acc + r.number_of_op, 0);
        const reqSum = sorted.reduce((acc, r) => acc + r.new_dg_requests, 0);
        const takenSum = sorted.reduce((acc, r) => acc + r.total_dg_completed_today, 0);
        const todaySum = sorted.reduce((acc, r) => acc + r.new_dg_completed_today_itself, 0);
        const followAvg = sorted.length > 0 
          ? Math.round(sorted.reduce((acc, r) => acc + r.new_dg_moved_to_follow_up, 0) / sorted.length)
          : 0;

        setSummaryStats({
          totalOp: opSum,
          totalRequested: reqSum,
          totalTaken: takenSum,
          totalTodayCount: todaySum,
          avgFollowUp: followAvg,
          startingOpen: sorted[0].opening_dg,
          endingClose: sorted[sorted.length - 1].closing_dg
        });
      }
      setHasSearched(true);
    } catch (err) {
      console.error('Generate report error:', err);
      setErrorMsg('Failed to compile reports. Ensure server connectivity.');
    } finally {
      setLoading(false);
    }
  };

  // Export Excel Document
  const handleExportExcel = () => {
    const range = getSelectedRange();
    if (!range) return;

    const token = localStorage.getItem('dg_token');
    window.location.href = `/api/reports/export/excel?startDate=${range.start}&endDate=${range.end}&branch=${selectedBranch}&token=${token}`;
  };

  // Export CSV Document
  const handleExportCsv = () => {
    const range = getSelectedRange();
    if (!range) return;

    const token = localStorage.getItem('dg_token');
    window.location.href = `/api/reports/export/csv?startDate=${range.start}&endDate=${range.end}&branch=${selectedBranch}&token=${token}`;
  };

  const hasData = generatedReports.length > 0;

  return (
    <div>
      <div className="page-header">
        <div className="page-title-group">
          <h1 className="page-title">Reporting Hub</h1>
          <span className="page-subtitle">Compile stats and download spreadsheets</span>
        </div>
      </div>

      {errorMsg && (
        <Alert variant="danger" className="d-flex align-items-center gap-2 mb-4">
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </Alert>
      )}

      {/* Query setup card */}
      <div className="content-card">
        <div className="card-title-border">
          <BarChart3 size={18} className="text-primary" />
          <span>Report Compiler Parameters</span>
        </div>

        <Form onSubmit={handleGenerateReport}>
          <div className="row align-items-end g-3">
            <div className="col-md-2">
              <Form.Group controlId="reportBranchSelect">
                <Form.Label className="form-label">Branch Select</Form.Label>
                <Form.Select
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setHasSearched(false);
                  }}
                >
                  <option value="all">All Branches (Consolidated)</option>
                  <option value="Tambaram">Tambaram</option>
                  <option value="OMR">OMR</option>
                  <option value="ECR">ECR</option>
                </Form.Select>
              </Form.Group>
            </div>

            <div className="col-md-2">
              <Form.Group controlId="reportMode">
                <Form.Label className="form-label">Report Duration</Form.Label>
                <Form.Select 
                  value={reportMode} 
                  onChange={(e) => {
                    setReportMode(e.target.value);
                    setHasSearched(false);
                    setSelectedDate('');
                    setSelectedMonth('');
                  }}
                >
                  <option value="monthly">Monthly Audit</option>
                  <option value="daily">Daily Snapshot</option>
                </Form.Select>
              </Form.Group>
            </div>

            <div className="col-md-5">
              {reportMode === 'daily' ? (
                <Form.Group controlId="reportDateSelect">
                  <Form.Label className="form-label">Select Report Date</Form.Label>
                  <Form.Control 
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    required
                  />
                </Form.Group>
              ) : (
                <Form.Group controlId="reportMonthSelect">
                  <Form.Label className="form-label">Select Target Month</Form.Label>
                  <Form.Control 
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    required
                  />
                </Form.Group>
              )}
            </div>

            <div className="col-md-3 d-flex gap-2">
              <Button type="submit" variant="primary" className="flex-grow-1" disabled={loading}>
                {loading ? 'Compiling...' : 'Compile Report'}
              </Button>
            </div>
          </div>
        </Form>
      </div>

      {loading && (
        <div className="d-flex justify-content-center align-items-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      )}

      {hasSearched && (
        <div>
          {hasData ? (
            <div>
              {/* Aggregation Summary Cards */}
              {summaryStats && (
                <div className="row g-3 mb-4">
                  <div className="col-md-3 col-sm-6">
                    <Card className="border-0 shadow-sm h-100 text-center p-3">
                      <span className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                        Total Number of OP
                      </span>
                      <span className="font-monospace text-primary fw-bold mt-1" style={{ fontSize: '1.75rem' }}>
                        {summaryStats.totalOp}
                      </span>
                    </Card>
                  </div>
                  
                  <div className="col-md-3 col-sm-6">
                    <Card className="border-0 shadow-sm h-100 text-center p-3">
                      <span className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                        Total New DG Requests
                      </span>
                      <span className="font-monospace text-warning fw-bold mt-1" style={{ fontSize: '1.75rem' }}>
                        {summaryStats.totalRequested}
                      </span>
                    </Card>
                  </div>

                  <div className="col-md-3 col-sm-6">
                    <Card className="border-0 shadow-sm h-100 text-center p-3">
                      <span className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                        Total DG Completed Today
                      </span>
                      <span className="font-monospace text-success fw-bold mt-1" style={{ fontSize: '1.75rem' }}>
                        {summaryStats.totalTaken}
                      </span>
                    </Card>
                  </div>

                  <div className="col-md-3 col-sm-6">
                    <Card className="border-0 shadow-sm h-100 text-center p-3">
                      <span className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
                        Avg New DG Moved To Follow-Up
                      </span>
                      <span className="font-monospace text-info fw-bold mt-1" style={{ fontSize: '1.75rem' }}>
                        {summaryStats.avgFollowUp}
                      </span>
                    </Card>
                  </div>
                </div>
              )}

              {/* Data Preview Table */}
              <div className="content-card">
                <div className="d-flex align-items-center justify-content-between card-title-border mb-3">
                  <div className="d-flex align-items-center gap-2">
                    <FileCheck size={18} className="text-success" />
                    <span>Report Preview Ledger ({selectedBranch === 'all' ? 'Consolidated' : selectedBranch})</span>
                  </div>

                  {/* Exports Group */}
                  <div className="d-flex gap-2">
                    <Button 
                      variant="outline-primary"
                      size="sm"
                      onClick={handleExportExcel}
                      disabled={downloadingExcel}
                      className="d-flex align-items-center gap-1 font-monospace"
                      style={{ fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      {downloadingExcel ? (
                        <Spinner size="sm" animation="border" style={{ width: '12px', height: '12px' }} />
                      ) : (
                        <FileSpreadsheet size={14} />
                      )}
                      Export XLSX
                    </Button>

                    <Button 
                      variant="outline-secondary"
                      size="sm"
                      onClick={handleExportCsv}
                      disabled={downloadingCsv}
                      className="d-flex align-items-center gap-1 font-monospace"
                      style={{ fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      {downloadingCsv ? (
                        <Spinner size="sm" animation="border" style={{ width: '12px', height: '12px' }} />
                      ) : (
                        <Download size={14} />
                      )}
                      Export CSV
                    </Button>
                  </div>
                </div>

                <div className="table-responsive">
                  <Table className="table-custom" hover size="sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="text-end">Opening DG</th>
                        <th className="text-end">Number of OP</th>
                        <th className="text-end">New DG Requests</th>
                        <th className="text-end">Total DG Completed Today</th>
                        <th className="text-end">New DG Completed Today Itself</th>
                        <th className="text-end">New DG Moved To Follow-Up</th>
                        <th className="text-end">Closing DG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {generatedReports.map((row) => (
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
                          <td className="text-end">{row.new_dg_completed_today_itself}</td>
                          <td className="text-end">{row.new_dg_moved_to_follow_up}</td>
                          <td className="text-end font-monospace fw-bold text-success">{row.closing_dg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <div className="content-card text-center py-5 text-muted">
              No daily reports found in the selected date range.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
