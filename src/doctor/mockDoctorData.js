/**
 * mockDoctorData.js
 * -----------------
 * All mock data for the Doctor / Clinic Side.
 * When Supabase is added later, replace these with API calls.
 *
 * Structure:
 *   CLINIC_USERS  — login credentials (username + password) mapped to a doctor + clinic
 *   MOCK_CLINICS  — clinic details with embedded doctor profiles
 *   MOCK_QUEUE    — initial waiting queue (stored/updated in localStorage at runtime)
 */

// ─── Login Credentials ────────────────────────────────────────────────────────
// username → { password, clinicId, doctorId }
// In production: replace with a Supabase auth call.
export const CLINIC_USERS = {
  'arun.kumar':   { password: 'clinic123', clinicId: 'c1', doctorId: 'd1' },
  'priya.sharma': { password: 'clinic123', clinicId: 'c1', doctorId: 'd2' },
  'kavitha.nair': { password: 'clinic123', clinicId: 'c2', doctorId: 'd3' },
  'suresh.babu':  { password: 'clinic123', clinicId: 'c3', doctorId: 'd4' },
  'meena.pillai': { password: 'clinic123', clinicId: 'c3', doctorId: 'd5' },
  'admin.c1':     { password: 'admin123',  clinicId: 'c1', doctorId: null },  // clinic staff (no doctor)
};

// ─── Clinic Profiles ──────────────────────────────────────────────────────────
// Mirrors the patient-side CLINICS but with richer doctor detail for the doctor UI.
export const MOCK_CLINICS = [
  {
    id: 'c1',
    name: 'Sunrise Health Clinic',
    place: 'Koramangala, Bengaluru',
    mobile: '9800010001',
    doctors: [
      {
        id: 'd1',
        name: 'Dr. Arun Kumar',
        specialisation: 'General Medicine',
        username: 'arun.kumar',
        dutyStart: '09:00',
        dutyEnd: '13:00',
        avgConsultationMinutes: 10,
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        breakStart: '11:00',
        breakEnd: '11:15',
        available: true,
      },
      {
        id: 'd2',
        name: 'Dr. Priya Sharma',
        specialisation: 'General Medicine',
        username: 'priya.sharma',
        dutyStart: '14:00',
        dutyEnd: '18:00',
        avgConsultationMinutes: 12,
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        breakStart: '16:00',
        breakEnd: '16:15',
        available: true,
      },
    ],
  },
  {
    id: 'c2',
    name: 'City Care Medical Centre',
    place: 'Indiranagar, Bengaluru',
    mobile: '9800020002',
    doctors: [
      {
        id: 'd3',
        name: 'Dr. Kavitha Nair',
        specialisation: 'General Physician',
        username: 'kavitha.nair',
        dutyStart: '09:00',
        dutyEnd: '17:00',
        avgConsultationMinutes: 15,
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        breakStart: '13:00',
        breakEnd: '14:00',
        available: true,
      },
    ],
  },
  {
    id: 'c3',
    name: 'Green Valley Clinic',
    place: 'HSR Layout, Bengaluru',
    mobile: '9800030003',
    doctors: [
      {
        id: 'd4',
        name: 'Dr. Suresh Babu',
        specialisation: 'General Physician',
        username: 'suresh.babu',
        dutyStart: '08:00',
        dutyEnd: '12:00',
        avgConsultationMinutes: 10,
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        breakStart: '10:30',
        breakEnd: '10:45',
        available: true,
      },
      {
        id: 'd5',
        name: 'Dr. Meena Pillai',
        specialisation: 'Gynaecologist',
        username: 'meena.pillai',
        dutyStart: '10:00',
        dutyEnd: '14:00',
        avgConsultationMinutes: 20,
        workingDays: ['Mon', 'Wed', 'Fri', 'Sat'],
        breakStart: '12:30',
        breakEnd: '12:45',
        available: true,
      },
    ],
  },
];

// ─── Doctor status constants ──────────────────────────────────────────────────
export const DOCTOR_STATUS = {
  AVAILABLE:   'available',
  ON_BREAK:    'on_break',
  UNAVAILABLE: 'unavailable',
};

// ─── Token status constants ───────────────────────────────────────────────────
export const TOKEN_STATUS = {
  WAITING:     'waiting',
  IN_PROGRESS: 'in_progress',
  SERVED:      'served',
  SKIPPED:     'skipped',
};

// ─── Booking type constants ───────────────────────────────────────────────────
export const BOOKING_TYPE = {
  ONLINE: 'Online',
  PHONE:  'Phone',
};

// ─── Initial mock queue for Clinic c1 / Doctor d1 ────────────────────────────
// (Loaded into localStorage on first login if no queue exists)
export const INITIAL_MOCK_QUEUE = {
  c1_d1: [
    {
      id: 'q1',
      tokenNumber: 'T041',
      patientName: 'Rajesh Kumar',
      mobile: '9876543210',
      place: 'Koramangala',
      doctorId: 'd1',
      clinicId: 'c1',
      bookingType: 'Online',
      status: 'waiting',
      issuedAt: new Date(Date.now() - 55 * 60000).toISOString(),
    },
    {
      id: 'q2',
      tokenNumber: 'T042',
      patientName: 'Sunita Reddy',
      mobile: '9812345678',
      place: 'BTM Layout',
      doctorId: 'd1',
      clinicId: 'c1',
      bookingType: 'Online',
      status: 'waiting',
      issuedAt: new Date(Date.now() - 40 * 60000).toISOString(),
    },
    {
      id: 'q3',
      tokenNumber: 'T043',
      patientName: 'Mohan Das',
      mobile: '',
      place: 'Jayanagar',
      doctorId: 'd1',
      clinicId: 'c1',
      bookingType: 'Phone',
      status: 'waiting',
      issuedAt: new Date(Date.now() - 25 * 60000).toISOString(),
    },
    {
      id: 'q4',
      tokenNumber: 'T044',
      patientName: 'Lakshmi Patel',
      mobile: '9944332211',
      place: 'Indiranagar',
      doctorId: 'd1',
      clinicId: 'c1',
      bookingType: 'Online',
      status: 'waiting',
      issuedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    },
    {
      id: 'q5',
      tokenNumber: 'T045',
      patientName: 'Arjun Nair',
      mobile: '9600112233',
      place: 'HSR Layout',
      doctorId: 'd1',
      clinicId: 'c1',
      bookingType: 'Phone',
      status: 'waiting',
      issuedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    },
  ],
  c1_d2: [
    {
      id: 'q6',
      tokenNumber: 'T021',
      patientName: 'Deepa Menon',
      mobile: '9700001111',
      place: 'Koramangala',
      doctorId: 'd2',
      clinicId: 'c1',
      bookingType: 'Online',
      status: 'waiting',
      issuedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    },
    {
      id: 'q7',
      tokenNumber: 'T022',
      patientName: 'Anand Krishnan',
      mobile: '',
      place: 'Whitefield',
      doctorId: 'd2',
      clinicId: 'c1',
      bookingType: 'Phone',
      status: 'waiting',
      issuedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    },
  ],
};

// ─── Helper: get doctor by id within a clinic ────────────────────────────────
export function getMockDoctorById(clinicId, doctorId) {
  const clinic = MOCK_CLINICS.find(c => c.id === clinicId);
  return clinic?.doctors.find(d => d.id === doctorId) ?? null;
}

export function getMockClinicById(clinicId) {
  return MOCK_CLINICS.find(c => c.id === clinicId) ?? null;
}
