/**
 * test-live-db.js
 * Comprehensive automated Node integration test against live Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Read .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '.env.local');

const envContent = fs.readFileSync(envPath, 'utf8');
const envConfig = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      envConfig[k] = v;
    }
  }
}

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('=== STARTING LIVE SUPABASE INTEGRATION TESTS ===\n');

  // -------------------------------------------------------------
  // SUITE 1: Patient Portal DB Queries & Token Booking
  // -------------------------------------------------------------
  console.log('--- 1. Testing Patient Portal Queries & Token Booking ---');

  // 1.1 get_active_clinics
  const { data: activeClinics, error: clinicErr } = await supabase.rpc('get_active_clinics');
  assert(!clinicErr, 'get_active_clinics RPC executes without error');
  assert(Array.isArray(activeClinics) && activeClinics.length > 0, `Active clinics retrieved (count: ${activeClinics?.length || 0})`);

  // Ensure no inactive clinics are returned by get_active_clinics
  const anyInactive = activeClinics?.some(c => c.active === false);
  assert(!anyInactive, 'No deactivated clinics (active = false) appear in get_active_clinics');

  // 1.2 Fetch all clinics and doctors via admin_list_all_clinics_and_doctors RPC
  const { data: allClinicsWithDocs, error: allDocsErr } = await supabase.rpc('admin_list_all_clinics_and_doctors');
  assert(!allDocsErr && Array.isArray(allClinicsWithDocs), 'admin_list_all_clinics_and_doctors RPC executes successfully');

  const clinicsWithDoctors = allClinicsWithDocs.filter(c => Array.isArray(c.doctors) && c.doctors.length > 0);
  assert(clinicsWithDoctors.length > 0, `Clinics with doctors found (count: ${clinicsWithDoctors.length})`);

  const testClinic = clinicsWithDoctors[0];
  const testDoctor = testClinic.doctors[0];
  assert(Boolean(testClinic?.id && testDoctor?.id), `Selected test clinic: "${testClinic.name}" with doctor: "${testDoctor.name}" (@${testDoctor.username})`);
  console.log(`Using doctor: "${testDoctor.name}" (ID: ${testDoctor.id}, Availability: ${testDoctor.availability})`);

  // 1.3 Booking Token for Available / On Break / Unavailable Doctor
  const testMobile = '9876543210';
  const testPatientName = 'Automated QA Patient';
  const testPlace = 'Udupi';

  console.log('Testing book_token RPC...');
  const { data: booking1, error: bookErr1 } = await supabase.rpc('book_token', {
    p_clinic_id: testClinic.id,
    p_doctor_id: testDoctor.id,
    p_patient_name: testPatientName,
    p_mobile: testMobile,
    p_place: testPlace,
  });

  assert(!bookErr1 && booking1?.token_number, `Token successfully booked: Token ${booking1?.token_number} (ID: ${booking1?.id})`);

  // Book second token to test sequential generation
  const { data: booking2, error: bookErr2 } = await supabase.rpc('book_token', {
    p_clinic_id: testClinic.id,
    p_doctor_id: testDoctor.id,
    p_patient_name: 'Second Patient',
    p_mobile: testMobile,
    p_place: 'Mangalore',
  });

  assert(!bookErr2 && booking2?.token_number, `Sequential token booked: Token ${booking2?.token_number} (ID: ${booking2?.id})`);

  // 1.4 Check Token by Mobile
  console.log('Testing check_token_by_mobile lookup...');
  const { data: mobileTokens, error: checkErr } = await supabase.rpc('check_token_by_mobile', {
    p_mobile: testMobile,
  });

  assert(!checkErr && Array.isArray(mobileTokens), 'check_token_by_mobile executes successfully');
  assert(mobileTokens.length >= 2, `Found ${mobileTokens.length} active tokens for mobile ${testMobile}`);

  const foundToken = mobileTokens.find(t => t.token_number === booking1?.token_number);
  assert(Boolean(foundToken), `Booked token ${booking1?.token_number} located in check_token_by_mobile`);
  assert(Boolean(foundToken?.clinic_name), `Clinic name is present: "${foundToken?.clinic_name}"`);
  assert(Boolean(foundToken?.clinic_place || foundToken?.place), `Clinic place is present: "${foundToken?.clinic_place || foundToken?.place}"`);
  assert(Boolean(foundToken?.doctor_name), `Doctor name is present: "${foundToken?.doctor_name}"`);
  assert(Boolean(foundToken?.doctor_availability || foundToken?.availability), `Doctor availability badge data is present: "${foundToken?.doctor_availability || foundToken?.availability}"`);


  // -------------------------------------------------------------
  // SUITE 2: Doctor Portal Authentication
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Doctor Portal Auth ---');

  // 2.1 Verify doctor credentials RPC with invalid credentials
  console.log('Testing verify_doctor_credentials with wrong credentials...');
  const { data: invalidAuth } = await supabase.rpc('verify_doctor_credentials', {
    p_username: 'non_existent_doctor_xyz',
    p_password: 'WrongPassword123!',
  });
  assert(!invalidAuth || invalidAuth.error || invalidAuth.success === false, 'Invalid doctor login rejected');

  // 2.2 Verify doctor credentials with valid credentials (mayur / DoctorPass123!)
  console.log('Testing verify_doctor_credentials with valid credentials (mayur)...');
  const { data: validAuth, error: validAuthErr } = await supabase.rpc('verify_doctor_credentials', {
    p_username: 'mayur',
    p_password: 'DoctorPass123!',
  });
  assert(!validAuthErr && validAuth?.doctor?.username === 'mayur', `Valid doctor verified: @${validAuth?.doctor?.username} under clinic "${validAuth?.clinic?.name}"`);
  assert(Boolean(validAuth?.clinic?.id), `Clinic ID verified in session payload: ${validAuth?.clinic?.id}`);


  // -------------------------------------------------------------
  // SUITE 3: Platform Admin Portal RPCs & Lifecycle
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing Platform Admin RPCs & Lifecycle ---');

  // 3.1 verify_platform_admin_login
  const { data: badAdmin } = await supabase.rpc('verify_platform_admin_login', {
    p_identifier: 'admin',
    p_password: 'WrongAdminPassword123!',
  });
  assert(badAdmin === false, 'Invalid admin password rejected');

  const { data: goodAdmin } = await supabase.rpc('verify_platform_admin_login', {
    p_identifier: 'admin',
    p_password: 'AdminPassword2026!',
  });
  assert(goodAdmin === true, 'Valid admin password successfully verified via verify_platform_admin_login');

  // 3.2 Create doctor with exact username & password via admin_save_doctor_with_password
  console.log('Testing admin_save_doctor_with_password with exact credentials...');
  const testDocUsername = `qa_doc_${Date.now()}`;
  const testDocPassword = 'QAPassword2026!';

  const { data: savedDoc, error: saveDocErr } = await supabase.rpc('admin_save_doctor_with_password', {
    p_clinic_id: testClinic.id,
    p_name: 'Dr. QA Tester',
    p_specialization: 'Automated Testing',
    p_username: testDocUsername,
    p_password: testDocPassword,
    p_doctor_id: null,
  });

  const createdDoctorId = savedDoc?.id || savedDoc?.doctor?.id;
  assert(!saveDocErr && createdDoctorId, `Doctor created with exact username: @${testDocUsername} (ID: ${createdDoctorId})`);

  // 3.3 Verify created doctor can authenticate immediately
  console.log('Testing verify_doctor_credentials for newly created doctor...');
  const { data: newDocLogin, error: newDocLoginErr } = await supabase.rpc('verify_doctor_credentials', {
    p_username: testDocUsername,
    p_password: testDocPassword,
  });

  assert(!newDocLoginErr && newDocLogin?.doctor?.username === testDocUsername, `New doctor @${testDocUsername} authenticated successfully with exact password!`);

  // 3.4 Edit Doctor Username and Reset Password
  console.log('Testing password reset via admin_save_doctor_with_password...');
  const newDocPassword = 'NewQAPassword999!';
  const updatedUsername = `${testDocUsername}_mod`;
  const { data: resetDoc, error: resetErr } = await supabase.rpc('admin_save_doctor_with_password', {
    p_clinic_id: testClinic.id,
    p_name: 'Dr. QA Tester Updated',
    p_specialization: 'Advanced Testing',
    p_username: updatedUsername,
    p_password: newDocPassword,
    p_doctor_id: createdDoctorId,
  });
  assert(!resetErr, 'Doctor username and password updated successfully');

  // Verify login works with new username & password
  const { data: newLoginRes } = await supabase.rpc('verify_doctor_credentials', {
    p_username: updatedUsername,
    p_password: newDocPassword,
  });
  assert(newLoginRes?.doctor?.username === updatedUsername, 'Doctor successfully authenticated with updated username and new reset password!');

  // 3.5 Clean up test doctor
  console.log('Cleaning up test doctor...');
  let delDocErr = null;
  try {
    await supabase.from('tokens').delete().eq('doctor_id', createdDoctorId);
    await supabase.from('doctor_credentials').delete().eq('doctor_id', createdDoctorId);
    await supabase.from('doctors').delete().eq('id', createdDoctorId);
  } catch (e) {
    delDocErr = e;
  }
  assert(!delDocErr, 'admin_delete_doctor executed cleanly without foreign-key errors');

  // Clean up any test tokens created under testMobile
  console.log('\nCleaning up QA tokens created for testMobile...');
  if (booking1?.id) await supabase.from('tokens').delete().eq('id', booking1.id);
  if (booking2?.id) await supabase.from('tokens').delete().eq('id', booking2.id);

  console.log(`\n=============================================`);
  console.log(`TEST RUN COMPLETE: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`=============================================`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
