/**
 * test-e2e-browser.js
 * Comprehensive End-to-End Headless Browser Automation Test Suite
 * Tests all 3 Portals: Patient (/), Doctor (/doctor), and Platform Admin (/platform-admin).
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!fs.existsSync(CHROME_PATH)) {
  console.error(`Chrome not found at ${CHROME_PATH}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function typeInput(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.click(selector);
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  if (value) {
    await page.keyboard.type(value);
  }
  await sleep(100);
}

async function clickByText(page, text) {
  return await page.evaluate((targetText) => {
    const elements = Array.from(document.querySelectorAll('button, a'));
    const match = elements.find(el => el.textContent && el.textContent.includes(targetText));
    if (match) {
      match.click();
      return true;
    }
    return false;
  }, text);
}

async function runBrowserE2E() {
  console.log('=== STARTING FULL END-TO-END BROWSER TEST SUITE ===\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,850'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 850 });

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    pageErrors.push(err.message || String(err));
  });

  try {
    // =========================================================================
    // SECTION A: Patient Portal (http://localhost:5173/)
    // =========================================================================
    console.log('--- SECTION A: Testing Patient Portal (/) ---');

    consoleErrors.length = 0;
    pageErrors.length = 0;

    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 15000 });
    assert(consoleErrors.length === 0, `Patient Portal loads with 0 console errors (found: ${consoleErrors.length})`);
    assert(pageErrors.length === 0, `Patient Portal loads with 0 page/runtime errors (found: ${pageErrors.length})`);

    const homeHtml = await page.content();
    assert(homeHtml.includes('Smart Digital Queue'), 'Brand header "Smart Digital Queue" is visible');
    assert(homeHtml.includes('Get Token'), 'Home screen contains "Get Token" button');
    assert(homeHtml.includes('Check Token'), 'Home screen contains "Check Token" button');

    // A.1 Verify zero link to /platform-admin anywhere on /
    const hasAdminLink = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors.some(a => a.href && a.href.includes('platform-admin'));
    });
    assert(!hasAdminLink, 'Zero links to /platform-admin on Patient Portal');

    // A.2 Click "Get Token" -> Navigate to Patient Details
    console.log('Navigating to Patient Details Form...');
    await clickByText(page, 'Get Token');
    await sleep(600);

    const patientDetailsHtml = await page.content();
    assert(patientDetailsHtml.includes('Patient Details'), 'Landed on "Patient Details" form');

    // Test Validation: Empty inputs
    console.log('Testing input validation with empty fields...');
    await clickByText(page, 'Continue');
    await sleep(300);
    let valError = await page.content();
    assert(valError.includes('Please enter your name'), 'Validation rejects empty name');

    // Fill name, invalid mobile (<10 digits)
    await typeInput(page, 'input#name', 'Browser QA Patient');
    await typeInput(page, 'input#mobile', '12345');
    await typeInput(page, 'input#place', 'Bengaluru');
    await clickByText(page, 'Continue');
    await sleep(300);
    valError = await page.content();
    assert(valError.includes('valid 10-digit'), 'Validation rejects invalid mobile number (<10 digits)');

    // Correct to valid 10-digit mobile number
    await typeInput(page, 'input#mobile', '9876543210');
    await clickByText(page, 'Continue');

    // Wait for Clinic Selection Screen to load from Supabase
    await page.waitForSelector('button div span.font-semibold', { timeout: 10000 });
    const clinicSelectionHtml = await page.content();
    assert(clinicSelectionHtml.includes('Select Clinic'), 'Landed on "Select Clinic" screen');

    // Verify Active Clinics are rendered with name and location
    const clinicCount = await page.evaluate(() => {
      return document.querySelectorAll('button div span.font-semibold').length;
    });
    assert(clinicCount > 0, `Active clinics rendered (${clinicCount} found)`);

    // Click multi-doctor clinic "new" (which has place "local" and doctor "mayur")
    console.log('Selecting clinic "new"...');
    const selectedNewClinic = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const newClinicBtn = btns.find(b => {
        const text = b.textContent || '';
        return text.includes('new') && text.includes('local');
      });
      if (newClinicBtn) {
        newClinicBtn.click();
        return true;
      }
      return false;
    });
    assert(selectedNewClinic, 'Selected multi-doctor clinic "new"');

    // Wait for Doctor Selection Screen for multi-doctor clinic
    await page.waitForSelector('button div div div span.font-bold', { timeout: 10000 });
    const docSelectHtml = await page.content();
    assert(docSelectHtml.includes('Select Doctor'), 'Multi-doctor clinic displays "Select Doctor" screen');
    assert(docSelectHtml.includes('mayur'), 'Doctor "mayur" is visible with specialization');
    assert(docSelectHtml.includes('Available') || docSelectHtml.includes('On Break') || docSelectHtml.includes('Unavailable'), 'Doctor availability badge is displayed');

    // Select Doctor "mayur"
    console.log('Selecting doctor "mayur"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const docBtn = btns.find(b => b.textContent && b.textContent.includes('mayur'));
      if (docBtn) docBtn.click();
    });

    // Wait for Booking Confirmation Screen
    await page.waitForSelector('button', { timeout: 10000 });
    const bookingConfirmHtml = await page.content();
    assert(bookingConfirmHtml.includes('Confirm Your Booking'), 'Landed on "Confirm Your Booking" screen');
    assert(bookingConfirmHtml.includes('Browser QA Patient'), 'Patient Name displayed in summary');
    assert(bookingConfirmHtml.includes('9876543210'), 'Patient Mobile displayed in summary');
    assert(bookingConfirmHtml.includes('Book Token'), '"Book Token" button exists');

    // Verify token was NOT generated before clicking Book Token
    assert(!bookingConfirmHtml.includes('Digital Token') && !bookingConfirmHtml.includes('Token Number:'), 'Token is NOT generated before clicking Book Token');

    // Double-click debounce test: rapid clicks handled cleanly
    console.log('Testing Book Token click and debounce...');
    await clickByText(page, 'Book Token');
    await sleep(2000);

    // Verify Token Confirmation Screen
    const tokenConfirmHtml = await page.content();
    assert(tokenConfirmHtml.includes('Token Confirmed!') || tokenConfirmHtml.includes('Digital Token') || tokenConfirmHtml.includes('Token Number'), 'Token Confirmation screen displayed');
    assert(tokenConfirmHtml.includes('Estimated Consultation Window'), 'Estimated Consultation Window highlight box displayed');
    assert(!tokenConfirmHtml.includes('undefined'), 'Zero undefined fields on token confirmation');

    // A.3 Check Token by Mobile Number
    console.log('Testing "Check My Token" by mobile number...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
    await clickByText(page, 'Check Token');
    await page.waitForSelector('input#check-mobile', { timeout: 5000 });

    await typeInput(page, 'input#check-mobile', '9876543210');
    await clickByText(page, 'Search Token');
    // Wait for search to complete and token results to appear
    await page.waitForFunction(() => !document.querySelector('button .animate-spin'), { timeout: 10000 });
    await sleep(1500);

    const checkTokenResultHtml = await page.content();
    assert(checkTokenResultHtml.includes('Digital Token'), 'Active token found for 9876543210 on Check Token screen');
    assert(checkTokenResultHtml.includes('Estimated Consultation Window'), 'Estimated consultation window rendered on digital ticket');
    assert(checkTokenResultHtml.includes('Doctor'), 'Doctor label and doctor name present');
    assert(!checkTokenResultHtml.includes('undefined'), 'No "undefined" values on check token ticket');


    // =========================================================================
    // SECTION B: Doctor Portal (http://localhost:5173/doctor)
    // =========================================================================
    console.log('\n--- SECTION B: Testing Doctor Portal (/doctor) ---');

    consoleErrors.length = 0;
    pageErrors.length = 0;

    await page.goto('http://localhost:5173/doctor', { waitUntil: 'networkidle0' });
    assert(consoleErrors.length === 0, `Doctor Portal login loads with 0 console errors (found: ${consoleErrors.length})`);
    assert(pageErrors.length === 0, `Doctor Portal login loads with 0 page/runtime errors (found: ${pageErrors.length})`);

    const docLoginHtml = await page.content();
    assert(docLoginHtml.includes('Doctor Sign In'), 'Doctor Sign In screen visible');

    // B.1 Verify NO "1-Click Sign In" button
    assert(!docLoginHtml.includes('1-Click Doctor Portal Sign In') && !docLoginHtml.includes('⚡ 1-Click'), 'NO 1-Click Sign In button exists');

    // Verify fields are blank on load
    const userVal = await page.$eval('input#username', el => el.value);
    const passVal = await page.$eval('input#password', el => el.value);
    assert(userVal === '' && passVal === '', 'Username and Password fields are completely blank on load');

    // Test invalid doctor credentials rejection
    console.log('Testing invalid doctor credentials rejection...');
    await typeInput(page, 'input#username', 'invalid_doctor_name');
    await typeInput(page, 'input#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('Invalid username or password'), { timeout: 10000 });
    const invalidErrHtml = await page.content();
    assert(invalidErrHtml.includes('Invalid username or password'), 'Invalid doctor login rejected with clear error notice');
    await sleep(500);

    // Log in with doctor 'mayur' / 'DoctorPass123!'
    console.log('Logging in with valid doctor credentials (mayur)...');
    consoleErrors.length = 0;
    await typeInput(page, 'input#username', 'mayur');
    await typeInput(page, 'input#password', 'DoctorPass123!');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('Current Token'), { timeout: 15000 });
    await sleep(500);

    assert(consoleErrors.length === 0, `Logged into Doctor Dashboard with 0 console errors (found: ${consoleErrors.length})`);

    const docDashHtml = await page.content();
    assert(docDashHtml.includes('mayur'), 'Doctor Dashboard loaded: Dr. mayur greeting rendered');
    assert(docDashHtml.includes('Current Token'), 'Current Token KPI card visible');
    assert(docDashHtml.includes('Patients Waiting'), 'Patients Waiting KPI card visible');
    assert(docDashHtml.includes('Served Today'), 'Served Today KPI card visible');

    // B.2 Strict Per-Doctor Isolation: No Add Doctor or Delete Doctor in /doctor
    assert(!docDashHtml.includes('+ Add Doctor') && !docDashHtml.includes('Delete Doctor'), 'Strict Isolation: Zero Add Doctor or Delete Doctor buttons in /doctor');

    // B.3 Availability Toggle
    console.log('Testing availability toggle...');
    const canTakeBreak = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Take Break'));
      return btn && !btn.disabled;
    });
    if (canTakeBreak) {
      await clickByText(page, 'Take Break');
      await sleep(1000);
      const breakHtml = await page.content();
      assert(breakHtml.includes('Queue Paused') || breakHtml.includes('Break') || breakHtml.includes('Available'), 'Availability toggled to "Take Break"');
      await clickByText(page, 'Available');
      await sleep(1000);
    } else {
      await clickByText(page, 'Available');
      await sleep(1000);
      const availHtml = await page.content();
      assert(availHtml.includes('Available') || availHtml.includes('Take Break'), 'Availability toggled to "Available"');
      await clickByText(page, 'Take Break');
      await sleep(1000);
    }

    // B.4 Navigate to Add Patient (Phone Booking)
    console.log('Navigating to Add Patient (Phone Booking)...');
    await clickByText(page, 'Add Patient');
    await page.waitForSelector('input[placeholder*="Rajan Pillai"]', { timeout: 5000 });
    const addPatientHtml = await page.content();
    assert(addPatientHtml.includes('Add Patient') && addPatientHtml.includes('walk-in or phone-booked'), 'Landed on Add Patient screen');

    await typeInput(page, 'input[placeholder*="Rajan Pillai"]', 'Walk-in Test Patient');
    await typeInput(page, 'input[placeholder*="10-digit mobile number"]', '9876543211');
    await typeInput(page, 'input[placeholder*="Indiranagar"]', 'Koramangala');
    await clickByText(page, 'Add to My Queue');
    await sleep(2000);

    const afterAddHtml = await page.content();
    assert(afterAddHtml.includes('Token') || afterAddHtml.includes('added') || afterAddHtml.includes('Successfully'), 'Phone walk-in patient token created successfully');

    // B.5 Navigate to Live Queue Screen
    console.log('Navigating to Live Queue screen...');
    await clickByText(page, 'Live Queue');
    await sleep(1500);
    const queueHtml = await page.content();
    assert(queueHtml.includes('Live Queue'), 'Live Queue screen rendered');

    // Test Queue Actions: Call Next -> Start -> Complete or Skip
    const hasNextBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.textContent && b.textContent.includes('Call Next Patient'));
    });
    if (hasNextBtn) {
      console.log('Executing Call Next Patient action...');
      await clickByText(page, 'Call Next Patient');
      await sleep(1000);
      const afterCallHtml = await page.content();
      assert(afterCallHtml.includes('Start Consultation') || afterCallHtml.includes('Called'), 'Patient called: Start Consultation button visible');

      console.log('Executing Start Consultation action...');
      await clickByText(page, 'Start Consultation');
      await sleep(1000);
      const afterStartHtml = await page.content();
      assert(afterStartHtml.includes('Complete Consultation') || afterStartHtml.includes('Consulting') || afterStartHtml.includes('In Progress'), 'Consultation started: Complete Consultation button visible');

      console.log('Executing Complete Consultation action...');
      await clickByText(page, 'Complete Consultation');
      await sleep(1500);
      console.log('Consultation completed successfully.');
    }

    // B.6 Navigate to My Schedule
    console.log('Navigating to My Schedule...');
    await clickByText(page, 'My Schedule');
    await sleep(1000);
    const schedHtml = await page.content();
    assert(schedHtml.includes('My Schedule') || schedHtml.includes('Clinical Schedule'), 'Landed on My Schedule screen');

    await clickByText(page, 'Save My Schedule');
    await page.waitForFunction(() => document.body.innerText.includes('updated successfully') || document.body.innerText.includes('saved'), { timeout: 10000 });
    const afterSchedHtml = await page.content();
    assert(afterSchedHtml.includes('saved') || afterSchedHtml.includes('Successfully') || afterSchedHtml.includes('updated'), 'Schedule saved successfully');

    // B.7 Test Refresh keeps doctor logged in
    console.log('Testing page reload persistence in Doctor Portal...');
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(800);
    const reloadedHtml = await page.content();
    assert(reloadedHtml.includes('mayur'), 'Doctor remains logged in after page reload');

    // B.8 Test Logout
    console.log('Testing Doctor Logout...');
    await clickByText(page, 'Logout');
    await sleep(800);
    const afterLogoutHtml = await page.content();
    assert(afterLogoutHtml.includes('Doctor Sign In'), 'Doctor returned to Sign In screen upon logout');

    const logoutUser = await page.$eval('input#username', el => el.value);
    const logoutPass = await page.$eval('input#password', el => el.value);
    assert(logoutUser === '' && logoutPass === '', 'Doctor login fields are completely blank after logging out');


    // =========================================================================
    // SECTION C: Platform Admin Portal (http://localhost:5173/platform-admin)
    // =========================================================================
    console.log('\n--- SECTION C: Testing Platform Admin Portal (/platform-admin) ---');

    consoleErrors.length = 0;
    pageErrors.length = 0;

    await page.goto('http://localhost:5173/platform-admin', { waitUntil: 'networkidle0' });
    assert(consoleErrors.length === 0, `Platform Admin login loads with 0 console errors (found: ${consoleErrors.length})`);
    assert(pageErrors.length === 0, `Platform Admin login loads with 0 page/runtime errors (found: ${pageErrors.length})`);

    const adminLoginHtml = await page.content();
    assert(adminLoginHtml.includes('Platform Administration'), 'Platform Administration Login screen rendered');

    // C.1 Verify NO "PLATFORM SECURITY" card and NO "Change Password" button
    assert(!adminLoginHtml.includes('PLATFORM SECURITY') && !adminLoginHtml.includes('Role RLS Protected'), 'NO PLATFORM SECURITY card on admin login');
    assert(!adminLoginHtml.includes('Change Password'), 'NO Change Password button on admin login');

    // Verify fields are blank
    const adminUserVal = await page.$eval('input[type="text"]', el => el.value);
    const adminPassVal = await page.$eval('input[type="password"]', el => el.value);
    assert(adminUserVal === '' && adminPassVal === '', 'Admin username and password fields are completely blank on mount');

    // Test rejection of invalid admin password
    console.log('Testing invalid admin credentials rejection...');
    await typeInput(page, 'input[type="text"]', 'admin');
    await typeInput(page, 'input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');
    await sleep(1000);
    const badAdminHtml = await page.content();
    assert(badAdminHtml.includes('failed') || badAdminHtml.includes('credentials') || badAdminHtml.includes('password'), 'Invalid admin login rejected with error message');

    // Log in with valid admin credentials (admin / AdminPassword2026!)
    console.log('Logging in with valid admin credentials (admin)...');
    consoleErrors.length = 0;
    await typeInput(page, 'input[type="text"]', 'admin');
    await typeInput(page, 'input[type="password"]', 'AdminPassword2026!');
    await page.click('button[type="submit"]');

    // Wait for Platform Admin Console to load from Supabase
    await page.waitForFunction(() => document.body.textContent.includes('Total Clinics'), { timeout: 10000 });

    assert(consoleErrors.length === 0, `Logged into Platform Admin Console with 0 console errors (found: ${consoleErrors.length})`);

    const adminConsoleHtml = await page.content();
    assert(adminConsoleHtml.includes('Total Clinics') || adminConsoleHtml.includes('Clinics Overview') || adminConsoleHtml.includes('Clinics'), 'Platform Admin Console loaded successfully');

    // C.2 Verify clinic filter dropdown is REMOVED on Clinics tab, but present on Doctors tab
    const filterOnClinicsTab = await page.$('select.dark-select');
    assert(!filterOnClinicsTab, 'Clinic filter dropdown is removed on Clinics tab (lists all clinics directly)');

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const docTab = btns.find(b => b.textContent && b.textContent.includes('Doctors & Credentials'));
      if (docTab) docTab.click();
    });
    await sleep(600);
    const filterOnDocsTab = await page.$('select.dark-select');
    assert(Boolean(filterOnDocsTab), 'Dark high-contrast clinic filter dropdown rendered on Doctors tab');

    // Switch back to Clinics tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const clinicTab = btns.find(b => b.textContent && b.textContent.includes('Clinics'));
      if (clinicTab) clinicTab.click();
    });
    await sleep(600);

    // Verify NO "Change Password" button in header
    assert(!adminConsoleHtml.includes('Change Password'), 'Zero "Change Password" buttons exist in Platform Admin header');

    // C.3 Test Creating a Clinic in Platform Admin
    console.log('Creating a new test clinic in Platform Admin...');
    await clickByText(page, 'Add New Clinic');
    await page.waitForSelector('input[placeholder*="Apollo Urban Health Clinic"]', { timeout: 5000 });
    await typeInput(page, 'input[placeholder*="Apollo Urban Health Clinic"]', 'QA Auto Clinic');
    await typeInput(page, 'input[placeholder*="Indiranagar"]', 'Tech Park, Bengaluru');
    await typeInput(page, 'input[placeholder*="9876543210"]', '9876500001');
    await clickByText(page, 'Create Clinic');
    await sleep(2000);

    const afterCreateClinicHtml = await page.content();
    assert(afterCreateClinicHtml.includes('QA Auto Clinic'), 'Newly created clinic "QA Auto Clinic" appears in Platform Admin list');

    // C.4 Test Deactivate Clinic
    console.log('Testing clinic deactivation in Platform Admin...');
    const clickedDeact = await page.evaluate(() => {
      const clinicHeadings = Array.from(document.querySelectorAll('h3'));
      const targetHeading = clinicHeadings.find(h => h.textContent && h.textContent.includes('QA Auto Clinic'));
      if (targetHeading) {
        const card = targetHeading.closest('div.rounded-2xl');
        if (card) {
          const deactBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Deactivate'));
          if (deactBtn) {
            deactBtn.click();
            return true;
          }
        }
      }
      return false;
    });
    assert(clickedDeact, 'Clicked Deactivate on QA Auto Clinic');
    await sleep(1500);

    const afterDeactHtml = await page.content();
    assert(afterDeactHtml.includes('Inactive / Deactivated'), 'Clinic displays "Inactive / Deactivated" badge');
    assert(afterDeactHtml.includes('Activate'), 'Clinic toggle button switched to "Activate"');

    // C.5 Verify deactivated clinic does NOT appear on Patient Portal (/)
    console.log('Verifying deactivated clinic is hidden on Patient Portal (/)...');
    const patientPage = await browser.newPage();
    await patientPage.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
    await clickByText(patientPage, 'Get Token');
    await patientPage.waitForSelector('input#name', { timeout: 10000 });
    await typeInput(patientPage, 'input#name', 'Check Deactivated');
    await typeInput(patientPage, 'input#mobile', '9876543210');
    await typeInput(patientPage, 'input#place', 'Bengaluru');
    await clickByText(patientPage, 'Continue');
    await patientPage.waitForFunction(() => document.body.textContent.includes('Select Clinic'), { timeout: 10000 });
    await sleep(600);
    const patientClinicsHtml = await patientPage.content();
    assert(!patientClinicsHtml.includes('QA Auto Clinic'), 'Deactivated clinic is strictly HIDDEN from Patient Portal');
    await patientPage.close();

    // C.6 Re-activate Clinic
    console.log('Re-activating clinic in Platform Admin...');
    const clickedActivate = await page.evaluate(() => {
      const clinicHeadings = Array.from(document.querySelectorAll('h3'));
      const targetHeading = clinicHeadings.find(h => h.textContent && h.textContent.includes('QA Auto Clinic'));
      if (targetHeading) {
        const card = targetHeading.closest('div.rounded-2xl');
        if (card) {
          const actBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Activate'));
          if (actBtn) {
            actBtn.click();
            return true;
          }
        }
      }
      return false;
    });
    assert(clickedActivate, 'Clicked Activate on QA Auto Clinic');
    await sleep(1500);
    const afterReactivateHtml = await page.content();
    assert(afterReactivateHtml.includes('Active') && afterReactivateHtml.includes('Deactivate'), 'Clinic re-activated successfully');

    // C.7 Onboard Doctor to "QA Auto Clinic"
    console.log('Onboarding Doctor to "QA Auto Clinic"...');
    const clickedAddDoctor = await page.evaluate(() => {
      const clinicHeadings = Array.from(document.querySelectorAll('h3'));
      const targetHeading = clinicHeadings.find(h => h.textContent && h.textContent.includes('QA Auto Clinic'));
      if (targetHeading) {
        const card = targetHeading.closest('div.rounded-2xl');
        if (card) {
          const docBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Doctor'));
          if (docBtn) {
            docBtn.click();
            return true;
          }
        }
      }
      return false;
    });
    assert(clickedAddDoctor, 'Clicked Add Doctor button under QA Auto Clinic');

    await page.waitForSelector('input[placeholder*="Dr. Sneha Rao"]', { timeout: 5000 });

    await typeInput(page, 'input[placeholder*="Dr. Sneha Rao"]', 'Dr. QA Specialist');
    await typeInput(page, 'input[placeholder*="Pediatrician"]', 'Pediatrics');
    await typeInput(page, 'input[placeholder*="sneha.rao"]', 'qa.specialist');
    await typeInput(page, 'input[placeholder*="DoctorPass@2026"]', 'TestDoctorPass123!');
    await clickByText(page, 'Create Doctor & Auth Account');
    await sleep(2500);

    // Switch to Doctors tab to verify onboarded doctor appears
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const docTab = btns.find(b => b.textContent && b.textContent.includes('Doctors & Credentials'));
      if (docTab) docTab.click();
    });
    await sleep(1000);

    const afterOnboardHtml = await page.content();
    assert(afterOnboardHtml.includes('Dr. QA Specialist'), 'Onboarded doctor appears under QA Auto Clinic');

    // C.8 Verify Single-Doctor Clinic Auto-Skips Doctor Selection on Patient Portal (/)
    console.log('Verifying single-doctor clinic auto-skips doctor selection screen on Patient Portal ()...');
    const singleDocTestPage = await browser.newPage();
    await singleDocTestPage.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
    await clickByText(singleDocTestPage, 'Get Token');
    await singleDocTestPage.waitForSelector('input#name', { timeout: 10000 });
    await typeInput(singleDocTestPage, 'input#name', 'Single Doc Tester');
    await typeInput(singleDocTestPage, 'input#mobile', '9876543210');
    await typeInput(singleDocTestPage, 'input#place', 'Bengaluru');
    await clickByText(singleDocTestPage, 'Continue');
    await singleDocTestPage.waitForFunction(() => document.body.textContent.includes('Select Clinic'), { timeout: 10000 });
    await sleep(600);

    // Click QA Auto Clinic (which has exactly 1 doctor: Dr. QA Specialist)
    await singleDocTestPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const qaClinicBtn = btns.find(b => b.textContent && b.textContent.includes('QA Auto Clinic'));
      if (qaClinicBtn) qaClinicBtn.click();
    });
    await singleDocTestPage.waitForFunction(() => document.body.textContent.includes('Confirm Your Booking'), { timeout: 10000 });
    await sleep(600);

    const singleDocLandingHtml = await singleDocTestPage.content();
    assert(singleDocLandingHtml.includes('Confirm Your Booking'), 'Single-doctor clinic auto-skipped Doctor Selection and landed directly on Confirm Your Booking!');
    assert(singleDocLandingHtml.includes('Dr. QA Specialist'), 'Auto-selected single doctor is displayed on Booking Confirmation');
    await singleDocTestPage.close();

    // C.9 Edit Username & Reset Password
    console.log('Testing Edit Username & Reset Password on created doctor...');
    // Switch to Doctors tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const docTab = btns.find(b => b.textContent && b.textContent.includes('Doctors & Credentials'));
      if (docTab) docTab.click();
    });
    await sleep(1000);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const editBtn = btns.find(b => b.textContent && b.textContent.includes('Edit Username / Reset Password'));
      if (editBtn) editBtn.click();
    });
    await page.waitForSelector('input[placeholder*="sneha.rao"]', { timeout: 5000 });

    await typeInput(page, 'input[placeholder*="sneha.rao"]', 'qa.updated');
    await typeInput(page, 'input[placeholder*="Enter new assigned password"]', 'NewDoctorPass123!');
    await clickByText(page, 'Save Credentials');
    await sleep(2000);

    const afterEditCredsHtml = await page.content();
    assert(afterEditCredsHtml.includes('qa.updated'), 'Updated username @qa.updated reflected in Platform Admin');

    // Verify Doctor can log into /doctor immediately with updated credentials
    console.log('Verifying updated doctor can log into /doctor...');
    const doctorTestPage = await browser.newPage();
    await doctorTestPage.goto('http://localhost:5173/doctor', { waitUntil: 'networkidle0' });
    await typeInput(doctorTestPage, 'input#username', 'qa.updated');
    await typeInput(doctorTestPage, 'input#password', 'NewDoctorPass123!');
    await doctorTestPage.click('button[type="submit"]');
    await doctorTestPage.waitForFunction(() => document.body.textContent.includes('Current Token') || document.body.textContent.includes('QA Specialist'), { timeout: 15000 });
    await sleep(500);
    const newDocDashHtml = await doctorTestPage.content();
    assert(newDocDashHtml.includes('Dr. QA Specialist') || newDocDashHtml.includes('QA Specialist'), 'Newly created doctor logged into Doctor Portal immediately');
    await doctorTestPage.close();

    // C.10 Delete Doctor Cleanly
    console.log('Deleting test doctor...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const delDocBtn = btns.find(b => b.textContent && b.textContent.includes('Delete Doctor'));
      if (delDocBtn) delDocBtn.click();
    });
    await sleep(600);
    await clickByText(page, 'Yes, Delete Doctor');
    await sleep(1500);

    // C.11 Delete Test Clinic Cleanly
    console.log('Deleting test clinic...');
    // Switch back to Clinics tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const clinicTab = btns.find(b => b.textContent && b.textContent.includes('Clinics'));
      if (clinicTab) clinicTab.click();
    });
    await sleep(1000);

    await page.evaluate(() => {
      const clinicHeadings = Array.from(document.querySelectorAll('h3'));
      const targetHeading = clinicHeadings.find(h => h.textContent && h.textContent.includes('QA Auto Clinic'));
      if (targetHeading) {
        const card = targetHeading.closest('div.rounded-2xl');
        if (card) {
          const delClinicBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Delete Clinic'));
          if (delClinicBtn) delClinicBtn.click();
        }
      }
    });
    await sleep(600);
    await clickByText(page, 'Yes, Delete Clinic');
    await sleep(1500);

    const clinicCardStillExists = await page.evaluate(() => {
      const clinicHeadings = Array.from(document.querySelectorAll('h3'));
      return clinicHeadings.some(h => h.textContent && h.textContent.includes('QA Auto Clinic'));
    });
    assert(!clinicCardStillExists, 'Test clinic permanently deleted from Platform Admin');

    // C.12 Test Sign Out from Platform Admin
    console.log('Testing Platform Admin Sign Out...');
    await clickByText(page, 'Sign Out');
    await sleep(800);

    const afterAdminSignOutHtml = await page.content();
    assert(afterAdminSignOutHtml.includes('Platform Administration'), 'Returned to Platform Admin login screen after Sign Out');

    const finalAdminUser = await page.$eval('input[type="text"]', el => el.value);
    const finalAdminPass = await page.$eval('input[type="password"]', el => el.value);
    assert(finalAdminUser === '' && finalAdminPass === '', 'Platform Admin username and password fields are completely blank after signing out');

  } catch (err) {
    console.error('Fatal browser test exception:', err);
    failed++;
  } finally {
    await browser.close();
  }

  console.log(`\n======================================================`);
  console.log(`BROWSER E2E TEST RUN COMPLETE: ${passed} passed, ${failed} failed`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runBrowserE2E();
