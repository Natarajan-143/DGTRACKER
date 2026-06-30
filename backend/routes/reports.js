const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireRole } = require('./auth');
const ExcelJS = require('exceljs');

// Validation Helper
function validateReportData(data) {
  const fields = ['number_of_op', 'new_dg_requests', 'total_dg_completed_today', 'new_dg_completed_today_itself', 'new_dg_moved_to_follow_up'];
  const errors = [];

  if (!data.report_date || data.report_date.trim() === '') {
    errors.push('Date is required and cannot be empty.');
  }

  for (const field of fields) {
    const val = data[field];
    if (val === undefined || val === null || val === '') {
      errors.push(`Field "${field}" is required.`);
      continue;
    }
    
    const num = Number(val);
    if (!Number.isInteger(num) || num < 0) {
      errors.push(`Field "${field}" must be a positive integer (0 or greater).`);
    }
  }

  if (data.opening_dg !== undefined && data.opening_dg !== null && data.opening_dg !== '') {
    const num = Number(data.opening_dg);
    if (!Number.isInteger(num) || num < 0) {
      errors.push('Field "opening_dg" must be a positive integer (0 or greater).');
    }
  }

  // Business Logic Validation:
  if (errors.length === 0) {
    // 1. NEW DG REQUESTS = NEW DG COMPLETED TODAY ITSELF + NEW DG MOVED TO FOLLOW-UP
    const req = Number(data.new_dg_requests);
    const today = Number(data.new_dg_completed_today_itself);
    const follow = Number(data.new_dg_moved_to_follow_up);
    if (req !== today + follow) {
      errors.push(`Validation rule violated: New DG Requests (${req}) must be equal to New DG Completed Today Itself (${today}) + New DG Moved To Follow-Up (${follow}).`);
    }

    // 2. Closing DG = Opening DG - Total DG Completed Today
    if (data.opening_dg !== undefined && data.opening_dg !== null && data.opening_dg !== '') {
      const open = Number(data.opening_dg);
      const completed = Number(data.total_dg_completed_today);
      const closing = open - completed;
      if (closing < 0) {
        errors.push(`Validation rule violated: Closing DG cannot be negative. Opening DG (${open}) must be greater than or equal to Total DG Completed Today (${completed}).`);
      }

      if (data.closing_dg !== undefined && data.closing_dg !== null && data.closing_dg !== '') {
        const providedClosing = Number(data.closing_dg);
        if (providedClosing !== closing) {
          errors.push(`Validation rule violated: Closing DG (${providedClosing}) must be equal to Opening DG (${open}) - Total DG Completed Today (${completed}).`);
        }
      }
    }
  }

  return errors;
}

// GET /api/reports - Fetch all reports with search, filter, and pagination
router.get('/', authenticateToken, async (req, res) => {
  const { searchDate, startDate, endDate, page = 1, limit = 10, branch } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  try {
    let queryText = 'SELECT * FROM daily_reports';
    const queryParams = [];
    let countQueryText = 'SELECT COUNT(*) FROM daily_reports';
    const countParams = [];

    const conditions = [];

    // Inject branch filter based on user role and query
    if (req.user.role === 'Employee') {
      queryParams.push(req.user.branch);
      conditions.push(`branch = $${queryParams.length}`);
      
      countParams.push(req.user.branch);
      conditions.push(`branch = $${countParams.length}`);
    } else if (req.user.role === 'Manager' && branch && branch !== 'all') {
      queryParams.push(branch);
      conditions.push(`branch = $${queryParams.length}`);
      
      countParams.push(branch);
      conditions.push(`branch = $${countParams.length}`);
    }

    if (searchDate) {
      queryParams.push(searchDate);
      conditions.push(`report_date = $${queryParams.length}`);
      
      countParams.push(searchDate);
      conditions.push(`report_date = $${countParams.length}`);
    } else {
      if (startDate) {
        queryParams.push(startDate);
        conditions.push(`report_date >= $${queryParams.length}`);
        
        countParams.push(startDate);
        conditions.push(`report_date >= $${countParams.length}`);
      }
      if (endDate) {
        queryParams.push(endDate);
        conditions.push(`report_date <= $${queryParams.length}`);
        
        countParams.push(endDate);
        conditions.push(`report_date <= $${countParams.length}`);
      }
    }

    if (conditions.length > 0) {
      const conditionStr = ' WHERE ' + conditions.join(' AND ');
      queryText += conditionStr;
      countQueryText += conditionStr;
    }

    // Execute count
    const totalRes = await db.query(countQueryText, countParams);
    const totalRecords = parseInt(totalRes.rows[0].count);

    // Execute main query with pagination
    queryParams.push(limitNum, offset);
    queryText += ` ORDER BY report_date DESC LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
    
    const reportsRes = await db.query(queryText, queryParams);

    return res.json({
      data: reportsRes.rows,
      pagination: {
        total: totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum),
        currentPage: pageNum,
        limit: limitNum,
      }
    });
  } catch (err) {
    console.error('Fetch reports error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/:id - Fetch single report
router.get('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT * FROM daily_reports WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    const report = result.rows[0];
    // Authorization check
    if (req.user.role === 'Employee' && report.branch !== req.user.branch) {
      return res.status(403).json({ error: 'Forbidden. You do not have access to this branch data.' });
    }
    res.json(report);
  } catch (err) {
    console.error('Fetch single report error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reports - Enter daily data
router.post('/', authenticateToken, async (req, res) => {
  const validationErrors = validateReportData(req.body);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: validationErrors.join(' ') });
  }

  // Retrieve branch
  let branch = req.user.branch;
  if (req.user.role === 'Manager') {
    branch = req.body.branch;
    if (!branch) {
      return res.status(400).json({ error: 'Branch is required for Manager entries.' });
    }
  }

  const { report_date, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up, opening_dg: reqOpeningDg } = req.body;
  const opNum = parseInt(number_of_op);
  const requestedNum = parseInt(new_dg_requests);
  const takenNum = parseInt(total_dg_completed_today);
  const todayNum = parseInt(new_dg_completed_today_itself);
  const followNum = parseInt(new_dg_moved_to_follow_up);

  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');

    // Check if report already exists for this date and branch
    const checkDate = await client.query('SELECT id FROM daily_reports WHERE report_date = $1 AND branch = $2', [report_date, branch]);
    if (checkDate.rowCount > 0) {
      const existingId = checkDate.rows[0].id;

      // Update the existing report
      await client.query(
        `UPDATE daily_reports 
         SET report_date = $1, number_of_op = $2, new_dg_requests = $3, total_dg_completed_today = $4, new_dg_completed_today_itself = $5, new_dg_moved_to_follow_up = $6, branch = $7, updated_at = CURRENT_TIMESTAMP
         WHERE id = $8`,
        [report_date, opNum, requestedNum, takenNum, todayNum, followNum, branch, existingId]
      );

      // Cascade recalculate starting from this date forward
      await db.cascadeRecalculate(client, report_date, branch);

      await client.query('COMMIT');

      // Fetch and return the updated row
      const finalRes = await db.query('SELECT * FROM daily_reports WHERE id = $1', [existingId]);
      return res.status(200).json(finalRes.rows[0]);
    }

    // 1. Fetch previous day's closing_dg for this branch to set opening_dg, fallback to requested opening_dg from client if no record
    const prevRes = await client.query(
      'SELECT closing_dg FROM daily_reports WHERE branch = $1 AND report_date < $2 ORDER BY report_date DESC LIMIT 1',
      [branch, report_date]
    );
    const opening_dg = prevRes.rowCount > 0 ? prevRes.rows[0].closing_dg : (parseInt(reqOpeningDg) || 0);

    // 2. Calculate closing_dg for the new entry: opening_dg - total_dg_completed_today
    const closing_dg = opening_dg - takenNum;
    if (closing_dg < 0) {
      throw new Error(`Invalid calculation: Opening DG (${opening_dg}) - Total DG Completed Today (${takenNum}) resulted in a negative Closing DG (${closing_dg}).`);
    }

    // 3. Insert new report
    const insertRes = await client.query(
      `INSERT INTO daily_reports (report_date, opening_dg, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up, closing_dg, branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [report_date, opening_dg, opNum, requestedNum, takenNum, todayNum, followNum, closing_dg, branch]
    );

    // 4. Cascade recalculate starting from this new date forward
    await db.cascadeRecalculate(client, report_date, branch);

    await client.query('COMMIT');
    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Insert report transaction failed:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PUT /api/reports/:id - Edit record
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const validationErrors = validateReportData(req.body);
  if (validationErrors.length > 0) {
    return res.status(400).json({ error: validationErrors.join(' ') });
  }

  const { report_date, number_of_op, new_dg_requests, total_dg_completed_today, new_dg_completed_today_itself, new_dg_moved_to_follow_up } = req.body;
  const opNum = parseInt(number_of_op);
  const requestedNum = parseInt(new_dg_requests);
  const takenNum = parseInt(total_dg_completed_today);
  const todayNum = parseInt(new_dg_completed_today_itself);
  const followNum = parseInt(new_dg_moved_to_follow_up);

  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');

    // Fetch existing record details
    const existingRes = await client.query('SELECT * FROM daily_reports WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      throw new Error('Report not found');
    }
    const existingReport = existingRes.rows[0];

    // Authorization Check
    if (req.user.role === 'Employee' && existingReport.branch !== req.user.branch) {
      return res.status(403).json({ error: 'Forbidden. You do not have access to edit this branch data.' });
    }

    const branch = req.user.role === 'Manager' ? (req.body.branch || existingReport.branch) : req.user.branch;
    const oldDate = typeof existingReport.report_date === 'string' ? existingReport.report_date.split('T')[0] : new Date(existingReport.report_date).toISOString().split('T')[0];

    // If date or branch changed, check for conflict
    if (oldDate !== report_date || existingReport.branch !== branch) {
      const checkConflict = await client.query('SELECT id FROM daily_reports WHERE report_date = $1 AND branch = $2 AND id != $3', [report_date, branch, id]);
      if (checkConflict.rowCount > 0) {
        throw new Error(`A report already exists for the target date and branch: ${report_date} (${branch})`);
      }
    }

    // Update values
    await client.query(
      `UPDATE daily_reports 
       SET report_date = $1, number_of_op = $2, new_dg_requests = $3, total_dg_completed_today = $4, new_dg_completed_today_itself = $5, new_dg_moved_to_follow_up = $6, branch = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [report_date, opNum, requestedNum, takenNum, todayNum, followNum, branch, id]
    );

    // Recalculate cascade from the earlier of the two dates to keep continuity
    const startingDate = oldDate < report_date ? oldDate : report_date;
    await db.cascadeRecalculate(client, startingDate, branch);

    // If branch was changed by manager, we must also cascade recalculate the old branch from the old date!
    if (req.user.role === 'Manager' && existingReport.branch !== branch) {
      await db.cascadeRecalculate(client, oldDate, existingReport.branch);
    }

    await client.query('COMMIT');

    // Fetch and return the updated row
    const finalRes = await db.query('SELECT * FROM daily_reports WHERE id = $1', [id]);
    res.json(finalRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update report transaction failed:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/reports/:id - Delete record
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  const client = await db.getPool().connect();
  try {
    await client.query('BEGIN');

    // Fetch date and branch before deleting to know where to start cascade recalculation
    const recordRes = await client.query('SELECT * FROM daily_reports WHERE id = $1', [id]);
    if (recordRes.rowCount === 0) {
      throw new Error('Report not found');
    }
    const report = recordRes.rows[0];

    // Authorization Check
    if (req.user.role === 'Employee' && report.branch !== req.user.branch) {
      return res.status(403).json({ error: 'Forbidden. You do not have access to delete this branch data.' });
    }

    const reportDate = typeof report.report_date === 'string' ? report.report_date.split('T')[0] : new Date(report.report_date).toISOString().split('T')[0];
    const branch = report.branch;

    // Delete record
    await client.query('DELETE FROM daily_reports WHERE id = $1', [id]);

    // Recalculate starting from the deleted date for this branch
    await db.cascadeRecalculate(client, reportDate, branch);

    await client.query('COMMIT');
    res.json({ message: 'Report deleted successfully and forward records recalculated.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete report transaction failed:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/reports/export/excel - Excel export (Manager only)
router.get('/export/excel', authenticateToken, requireRole(['Manager']), async (req, res) => {
  const { startDate, endDate, branch } = req.query;

  try {
    let queryText = 'SELECT * FROM daily_reports';
    const queryParams = [];
    const conditions = [];

    if (startDate && endDate) {
      queryParams.push(startDate, endDate);
      conditions.push(`report_date >= $${queryParams.length - 1} AND report_date <= $${queryParams.length}`);
    }

    if (branch && branch !== 'all') {
      queryParams.push(branch);
      conditions.push(`branch = $${queryParams.length}`);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    queryText += ' ORDER BY report_date ASC';

    const result = await db.query(queryText, queryParams);

    let rowsToExport = result.rows;
    // Consolidate if manager exports consolidated ('all')
    if (!branch || branch === 'all') {
      const grouped = {};
      result.rows.forEach(row => {
        const dateStr = typeof row.report_date === 'string' ? row.report_date.split('T')[0] : new Date(row.report_date).toISOString().split('T')[0];
        if (!grouped[dateStr]) {
          grouped[dateStr] = {
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
      rowsToExport = Object.values(grouped).sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime());
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daily Reports');

    worksheet.columns = [
      { header: 'Date', key: 'report_date', width: 15 },
      { header: 'Opening DG', key: 'opening_dg', width: 15 },
      { header: 'Number of OP', key: 'number_of_op', width: 18 },
      { header: 'New DG Requests', key: 'new_dg_requests', width: 20 },
      { header: 'Total DG Completed Today', key: 'total_dg_completed_today', width: 26 },
      { header: 'New DG Completed Today Itself', key: 'new_dg_completed_today_itself', width: 30 },
      { header: 'New DG Moved To Follow-Up', key: 'new_dg_moved_to_follow_up', width: 28 },
      { header: 'Closing DG', key: 'closing_dg', width: 15 }
    ];

    // Apply premium header styles
    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Outfit', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    headerRow.height = 24;
    
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E3A8A' } // Deep Navy Blue
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: '3B82F6' } },
        bottom: { style: 'medium', color: { argb: '1D4ED8' } }
      };
    });

    // Add rows and format cells
    rowsToExport.forEach((row, index) => {
      const dateStr = typeof row.report_date === 'string' ? row.report_date.split('T')[0] : new Date(row.report_date).toISOString().split('T')[0];
      const addedRow = worksheet.addRow({
        report_date: dateStr,
        opening_dg: row.opening_dg,
        number_of_op: row.number_of_op,
        new_dg_requests: row.new_dg_requests,
        total_dg_completed_today: row.total_dg_completed_today,
        new_dg_completed_today_itself: row.new_dg_completed_today_itself,
        new_dg_moved_to_follow_up: row.new_dg_moved_to_follow_up,
        closing_dg: row.closing_dg
      });

      // Apply zebra striping
      const isEven = index % 2 === 0;
      const fillcolor = isEven ? 'F8FAFC' : 'FFFFFF'; // Very soft light slate
      
      addedRow.eachCell((cell, colNumber) => {
        cell.font = { name: 'Inter', size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'center' : 'right' };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillcolor }
        };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } }
        };
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=DG_Tracker_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel Export error:', err.message);
    res.status(500).json({ error: 'Internal server error during Excel export' });
  }
});

// GET /api/reports/export/csv - CSV export (Manager only)
router.get('/export/csv', authenticateToken, requireRole(['Manager']), async (req, res) => {
  const { startDate, endDate, branch } = req.query;

  try {
    let queryText = 'SELECT * FROM daily_reports';
    const queryParams = [];
    const conditions = [];

    if (startDate && endDate) {
      queryParams.push(startDate, endDate);
      conditions.push(`report_date >= $${queryParams.length - 1} AND report_date <= $${queryParams.length}`);
    }

    if (branch && branch !== 'all') {
      queryParams.push(branch);
      conditions.push(`branch = $${queryParams.length}`);
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    queryText += ' ORDER BY report_date ASC';

    const result = await db.query(queryText, queryParams);

    let rowsToExport = result.rows;
    if (!branch || branch === 'all') {
      const grouped = {};
      result.rows.forEach(row => {
        const dateStr = typeof row.report_date === 'string' ? row.report_date.split('T')[0] : new Date(row.report_date).toISOString().split('T')[0];
        if (!grouped[dateStr]) {
          grouped[dateStr] = {
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
      rowsToExport = Object.values(grouped).sort((a, b) => new Date(a.report_date).getTime() - new Date(b.report_date).getTime());
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=DG_Tracker_Export_${new Date().toISOString().split('T')[0]}.csv`);

    let csvContent = 'Date,Opening DG,Number of OP,New DG Requests,Total DG Completed Today,New DG Completed Today Itself,New DG Moved To Follow-Up,Closing DG\n';
    rowsToExport.forEach(row => {
      const dateStr = typeof row.report_date === 'string' ? row.report_date.split('T')[0] : new Date(row.report_date).toISOString().split('T')[0];
      csvContent += `${dateStr},${row.opening_dg},${row.number_of_op},${row.new_dg_requests},${row.total_dg_completed_today},${row.new_dg_completed_today_itself},${row.new_dg_moved_to_follow_up},${row.closing_dg}\n`;
    });
    
    res.send(csvContent);
  } catch (err) {
    console.error('CSV Export error:', err.message);
    res.status(500).json({ error: 'Internal server error during CSV export' });
  }
});

module.exports = router;
