const http = require('http');

const BASE_URL = 'http://localhost:5000';

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method: method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING AUTHTENTICATION AND RBAC VERIFICATION ---');

  // Test 1: Login as Employee (tambaram)
  console.log('\n[Test 1] Logging in as Employee: tambaram...');
  const tLogin = await makeRequest('POST', '/api/auth/login', {}, { email: 'tambaram', password: 'tambaram123' });
  if (tLogin.statusCode !== 200) {
    console.error('FAIL: Employee login failed with code', tLogin.statusCode);
    process.exit(1);
  }
  const tToken = tLogin.data.token;
  const tUser = tLogin.data.user;
  console.log('SUCCESS: Logged in! User branch:', tUser.branch, 'Role:', tUser.role);

  // Test 2: Login as Manager
  console.log('\n[Test 2] Logging in as Manager: manager...');
  const mLogin = await makeRequest('POST', '/api/auth/login', {}, { email: 'manager', password: 'manager123' });
  if (mLogin.statusCode !== 200) {
    console.error('FAIL: Manager login failed with code', mLogin.statusCode);
    process.exit(1);
  }
  const mToken = mLogin.data.token;
  const mUser = mLogin.data.user;
  console.log('SUCCESS: Logged in! User branch:', mUser.branch, 'Role:', mUser.role);

  // Test 3: Fetch reports as Employee (tambaram)
  console.log('\n[Test 3] Fetching reports as Employee (should only return Tambaram branch)...');
  const tReports = await makeRequest('GET', '/api/reports', { 'Authorization': `Bearer ${tToken}` });
  if (tReports.statusCode !== 200) {
    console.error('FAIL: Fetching reports as Employee failed with code', tReports.statusCode);
    process.exit(1);
  }
  const tData = tReports.data.data;
  console.log('Reports count returned:', tData.length);
  const nonTambaram = tData.filter(r => r.branch !== 'Tambaram');
  if (nonTambaram.length > 0) {
    console.error('FAIL: Found records from other branches for employee! Violates isolation.', nonTambaram);
    process.exit(1);
  }
  console.log('SUCCESS: All returned records belong to Tambaram branch!');

  // Test 4: Post a new report as Employee (tambaram)
  console.log('\n[Test 4] Adding a new report for Tambaram branch as employee...');
  const testReportDate = '2026-06-25';
  const newReportBody = {
    report_date: testReportDate,
    number_of_op: 50,
    new_dg_requests: 10,
    total_dg_completed_today: 5,
    new_dg_completed_today_itself: 4,
    new_dg_moved_to_follow_up: 6,
    opening_dg: 17 // matches 2026-06-15's closing
  };
  const postRes = await makeRequest('POST', '/api/reports', { 'Authorization': `Bearer ${tToken}` }, newReportBody);
  if (postRes.statusCode !== 201 && postRes.statusCode !== 200) {
    console.error('FAIL: Posting report as Employee failed with status:', postRes.statusCode, postRes.data);
    process.exit(1);
  }
  console.log('SUCCESS: Report logged!', postRes.data);
  const createdReportId = postRes.data.id;

  // Test 5: Verify the report contains the correct branch
  if (postRes.data.branch !== 'Tambaram') {
    console.error('FAIL: Saved report branch is not Tambaram!', postRes.data);
    process.exit(1);
  }
  console.log('SUCCESS: Branch "Tambaram" was automatically saved with the record!');

  // Test 6: Verify Manager can view the newly created record and filter by branch
  console.log('\n[Test 6] Fetching Tambaram reports as Manager...');
  const mReportsTambaram = await makeRequest('GET', `/api/reports?branch=Tambaram`, { 'Authorization': `Bearer ${mToken}` });
  if (mReportsTambaram.statusCode !== 200) {
    console.error('FAIL: Fetching Tambaram reports as Manager failed with code', mReportsTambaram.statusCode);
    process.exit(1);
  }
  const foundInManager = mReportsTambaram.data.data.find(r => r.id === createdReportId);
  if (!foundInManager) {
    console.error('FAIL: Manager could not find the newly created Tambaram record.');
    process.exit(1);
  }
  console.log('SUCCESS: Manager successfully retrieved the Tambaram record!');

  // Test 7: Employee cannot view/delete/edit OMR data (or create data for OMR)
  console.log('\n[Test 7] Verify Employee cannot save data under OMR branch...');
  const invalidBody = {
    report_date: '2026-06-26',
    number_of_op: 50,
    new_dg_requests: 10,
    total_dg_completed_today: 5,
    new_dg_completed_today_itself: 4,
    new_dg_moved_to_follow_up: 6,
    opening_dg: 10,
    branch: 'OMR' // Employee tries to insert for OMR
  };
  const invalidPost = await makeRequest('POST', '/api/reports', { 'Authorization': `Bearer ${tToken}` }, invalidBody);
  // It should save, but automatically enforce Tambaram as branch!
  if (invalidPost.data.branch !== 'Tambaram') {
    console.error('FAIL: Employee bypassed branch restriction and wrote to OMR!', invalidPost.data);
    process.exit(1);
  }
  console.log('SUCCESS: Employee branch was correctly forced to Tambaram, ignoring the payload branch!');

  // Test 8: Clean up by deleting the test reports (Manager only)
  console.log('\n[Test 8] Deleting the test records (Clean up)...');
  const deleteRes1 = await makeRequest('DELETE', `/api/reports/${createdReportId}`, { 'Authorization': `Bearer ${mToken}` });
  if (deleteRes1.statusCode !== 200) {
    console.error('FAIL: Manager failed to delete the created report:', deleteRes1.data);
    process.exit(1);
  }
  const deleteRes2 = await makeRequest('DELETE', `/api/reports/${invalidPost.data.id}`, { 'Authorization': `Bearer ${mToken}` });
  if (deleteRes2.statusCode !== 200) {
    console.error('FAIL: Manager failed to delete the second report:', deleteRes2.data);
    process.exit(1);
  }
  console.log('SUCCESS: All test records cleaned up successfully!');

  console.log('\n======================================================');
  console.log('VERIFICATION PASSED: ALL RBAC AND ISOLATION TESTS OK!');
  console.log('======================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
