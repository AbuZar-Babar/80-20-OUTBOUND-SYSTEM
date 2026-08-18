const path = require('path');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000/api';

async function runFullVerificationSuite() {
  console.log('===========================================================');
  console.log(' STARTING COMPREHENSIVE END-TO-END FUNCTIONALITY SUITE ');
  console.log('===========================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Test User Registration
    const testEmail = `test_${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Verification User', email: testEmail, password: 'password123' })
    }).then(r => r.json());

    assert(regRes.success === true && regRes.data.email === testEmail, '1.1 Register New User Account');
    assert(!regRes.data.token, '1.2 Registration does NOT return auto-login session token');

    // 2. Test Registration Duplicate Email Block
    const dupRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Verification User', email: testEmail, password: 'password123' })
    }).then(r => r.json());

    assert(dupRes.success === false && dupRes.message.includes('already exists'), '2.1 Prevent Duplicate Email Registration');

    // 3. Test Login - Unregistered Email
    const unregRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@example.com', password: 'password123' })
    }).then(r => r.json());

    assert(unregRes.success === false && unregRes.message.includes('No account found'), '3.1 Block Login for Unregistered Email');

    // 4. Test Login - Incorrect Password
    const badPassRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'wrongpassword' })
    }).then(r => r.json());

    assert(badPassRes.success === false && badPassRes.message.includes('Incorrect password'), '4.1 Block Login for Incorrect Password');

    // 5. Test Login - Valid Credentials
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'password123' })
    }).then(r => r.json());

    assert(loginRes.success === true && !!loginRes.data.token, '5.1 Valid Credentials Login & JWT Issuance');
    const token = loginRes.data.token;

    // 6. Test Protected Route (/api/auth/me)
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());

    assert(meRes.success === true && meRes.data.email === testEmail, '6.1 Access Protected /api/auth/me');

    // 7. Test Phone Number Validation Helper
    const badPhoneRes = await fetch(`${BASE_URL}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Phone Contact', phone: '12345' })
    }).then(r => r.json());

    assert(badPhoneRes.success === false && badPhoneRes.message.includes('E.164 format'), '7.1 Reject Non-E.164 Phone Format');

    // 8. Test Contact Creation (Valid E.164)
    const contactRes = await fetch(`${BASE_URL}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali Ahmed', phone: '+923001234567' })
    }).then(r => r.json());

    assert(contactRes.success === true && contactRes.data.phone === '+923001234567', '8.1 Create Contact Record');
    const contactId = contactRes.data._id;

    // 9. Test Contact Listing
    const contactsListRes = await fetch(`${BASE_URL}/contacts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());

    assert(contactsListRes.success === true && contactsListRes.data.length >= 1, '9.1 Retrieve Contacts List');

    // 10. Test Contact Update
    const updateContactRes = await fetch(`${BASE_URL}/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali Ahmed Updated', phone: '+923009876543' })
    }).then(r => r.json());

    assert(updateContactRes.success === true && updateContactRes.data.name === 'Ali Ahmed Updated', '10.1 Update Contact Details');

    // 11. Test Contact Deletion
    const deleteContactRes = await fetch(`${BASE_URL}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());

    assert(deleteContactRes.success === true, '11.1 Delete Contact Record');

    // 12. Test Call Endpoint (Unconfigured Twilio Handling)
    const callRes = await fetch(`${BASE_URL}/calls`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '+923001234567' })
    }).then(r => r.json());

    assert(callRes.success === false && callRes.message.includes('Twilio'), '12.1 Call Endpoint Handles Unconfigured Credentials Gracefully');

    // 13. Test SMS Endpoint (Unconfigured Twilio Handling)
    const smsRes = await fetch(`${BASE_URL}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '+923001234567', body: 'Test SMS content' })
    }).then(r => r.json());

    assert(smsRes.success === false && smsRes.message.includes('Twilio'), '13.1 SMS Endpoint Handles Unconfigured Credentials Gracefully');

    // 14. Test Call Logs Retrieval
    const callLogsRes = await fetch(`${BASE_URL}/calls`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());

    assert(callLogsRes.success === true && Array.isArray(callLogsRes.data), '14.1 Retrieve Call Activity Logs');

    // 15. Test SMS Logs Retrieval
    const smsLogsRes = await fetch(`${BASE_URL}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());

    assert(smsLogsRes.success === true && Array.isArray(smsLogsRes.data), '15.1 Retrieve SMS Activity Logs');

    console.log('===========================================================');
    console.log(` VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED `);
    console.log('===========================================================');
  } catch (err) {
    console.error('Fatal Verification Error:', err);
  }
}

runFullVerificationSuite();
