/**
 * tokenStorage.js
 * ---------------
 * Single source of truth for saving and retrieving tokens from localStorage.
 *
 * WHY localStorage?
 *   - React state is reset every time the user navigates back to Home.
 *   - localStorage persists across navigation AND browser refreshes.
 *   - When Supabase is added later, replace saveToken/getTokensByMobile
 *     with database calls. Nothing else needs to change.
 *
 * Data format stored under STORAGE_KEY:
 *   Array of token records:
 *   [
 *     {
 *       mobile:      string,   // normalized (trimmed, digits only)
 *       tokenNumber: string,   // e.g. "T048"
 *       patientName: string,
 *       clinicId:    string,
 *       clinicName:  string,
 *       clinicPlace: string,
 *       doctorId:    string,
 *       doctorName:  string,
 *       doctorSpec:  string,
 *       issuedAt:    string,   // ISO timestamp
 *       positionIndex: number, // used for time-range estimation
 *     },
 *     ...
 *   ]
 */

const STORAGE_KEY = 'sdqms_tokens'; // sdqms = Smart Digital Queue Management System

// ── Normalize mobile: remove all spaces, keep only digits ─────────────────────
export function normalizeMobile(mobile) {
  return String(mobile).replace(/\s+/g, '').trim();
}

// ── Read all saved tokens from localStorage ───────────────────────────────────
export function getAllTokens() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    // If JSON is corrupted, start fresh
    return [];
  }
}

// ── Save a new token record to localStorage ───────────────────────────────────
export function saveToken({ patient, clinic, doctor, tokenNumber }) {
  const existing = getAllTokens();

  // positionIndex: mock value of 4 (a few patients ahead) for new tokens
  // When Supabase is added, this comes from the real queue position.
  const MOCK_POSITION_FOR_NEW_TOKEN = 4;

  const docAvail = doctor.availability || doctor.doctor_availability || doctor.doctorAvailability || 'unavailable';
  const docSpec  = doctor.specialisation || doctor.specialization || doctor.doctor_spec || doctor.doctorSpec || '';
  const clinicP  = clinic.place || clinic.clinicPlace || clinic.clinic_place || '';
  const clinicM  = clinic.mobile || clinic.clinicMobile || clinic.clinic_mobile || '';

  const newRecord = {
    // Mobile & Token numbers
    mobile:                normalizeMobile(patient.mobile),
    tokenNumber,
    token_number:          tokenNumber,
    patientName:           patient.name,
    patient_name:          patient.name,

    // Clinic details (both camelCase & snake_case)
    clinicId:              clinic.id,
    clinic_id:             clinic.id,
    clinicName:            clinic.name,
    clinic_name:           clinic.name,
    clinicPlace:           clinicP,
    clinic_place:          clinicP,
    place:                 clinicP,
    clinicMobile:          clinicM,
    clinic_mobile:         clinicM,
    clinic: {
      id:     clinic.id,
      name:   clinic.name,
      place:  clinicP,
      mobile: clinicM,
    },

    // Doctor details (both camelCase & snake_case)
    doctorId:              doctor.id,
    doctor_id:             doctor.id,
    doctorName:            doctor.name,
    doctor_name:           doctor.name,
    doctorSpec:            docSpec,
    doctor_spec:           docSpec,
    specialization:        docSpec,
    specialisation:        docSpec,
    doctor_specialization: docSpec,
    doctorAvailability:    docAvail,
    doctor_availability:   docAvail,
    availability:          docAvail,
    doctor: {
      id:             doctor.id,
      name:           doctor.name,
      specialization: docSpec,
      specialisation: docSpec,
      availability:   docAvail,
    },

    status:        'waiting',
    booking_type:  'online',
    issuedAt:      new Date().toISOString(),
    booked_at:     new Date().toISOString(),
    positionIndex: MOCK_POSITION_FOR_NEW_TOKEN,
    queue_position: MOCK_POSITION_FOR_NEW_TOKEN,
  };

  const updated = [...existing, newRecord];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newRecord;
}

// ── Find all tokens for a given mobile number ─────────────────────────────────
export function getTokensByMobile(rawMobile) {
  const mobile = normalizeMobile(rawMobile);
  return getAllTokens().filter((t) => t.mobile === mobile);
}
