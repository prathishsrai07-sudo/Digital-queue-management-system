/**
 * mockData.js
 * -----------
 * All demonstration data lives here.
 * When Supabase is added later, replace these arrays with API calls.
 * Nothing else in the app needs to change.
 */

// ─── Clinics ────────────────────────────────────────────────────────────────
// Each clinic has an id, name, place, and an array of doctors.
export const CLINICS = [
  {
    id: 'c1',
    name: 'Sunrise Health Clinic',
    place: 'Koramangala, Bengaluru',
    mobile: '9800010001',   // Demo number — not a real contact
    doctors: [
      { id: 'd1', name: 'Dr. Priya Sharma', specialisation: 'General Physician' },
      { id: 'd2', name: 'Dr. Arun Mehta',   specialisation: 'Paediatrician' },
    ],
  },
  {
    id: 'c2',
    name: 'City Care Medical Centre',
    place: 'Indiranagar, Bengaluru',
    mobile: '9800020002',   // Demo number — not a real contact
    doctors: [
      { id: 'd3', name: 'Dr. Kavitha Nair', specialisation: 'General Physician' },
    ],
  },
  {
    id: 'c3',
    name: 'Green Valley Clinic',
    place: 'HSR Layout, Bengaluru',
    mobile: '9800030003',   // Demo number — not a real contact
    doctors: [
      { id: 'd4', name: 'Dr. Suresh Babu',    specialisation: 'General Physician' },
      { id: 'd5', name: 'Dr. Meena Pillai',   specialisation: 'Gynaecologist' },
      { id: 'd6', name: 'Dr. Ravi Chandran',  specialisation: 'Orthopaedic Surgeon' },
    ],
  },
  {
    id: 'c4',
    name: 'Wellness Point Clinic',
    place: 'Jayanagar, Bengaluru',
    mobile: '9800040004',   // Demo number — not a real contact
    doctors: [
      { id: 'd7', name: 'Dr. Anjali Reddy', specialisation: 'General Physician' },
    ],
  },
  {
    id: 'c5',
    name: 'Apollo Community Health Camp',
    place: 'Whitefield, Bengaluru',
    mobile: '9800050005',   // Demo number — not a real contact
    doctors: [
      { id: 'd8', name: 'Dr. Vikram Singh',   specialisation: 'General Physician' },
      { id: 'd9', name: 'Dr. Shalini Gupta',  specialisation: 'Dermatologist' },
    ],
  },
];

// ─── Token counter (simulates an auto-increment token number) ────────────────
// In reality this would come from the database.
let tokenCounter = 47; // Start mid-sequence to look realistic

export function generateTokenNumber() {
  tokenCounter += 1;
  return `T${String(tokenCounter).padStart(3, '0')}`; // e.g. T048
}

// ─── Time range helper ────────────────────────────────────────────────────────
/**
 * Returns a human-readable estimated time range string.
 * The range width shrinks as the position gets closer.
 *
 * positionIndex: 0 = next patient, higher = further away.
 *
 * NOTE: This uses fixed mock ranges. The real adaptive algorithm
 * (using actual consultation duration history) will be added later.
 */
export function getEstimatedTimeRange(positionIndex) {
  const now = new Date();

  // Each slot is ~15 minutes on average (mock assumption)
  const avgMinutes = 15;
  const centreMinutes = positionIndex * avgMinutes;

  // Range half-width: wider for farther slots, narrower for near slots
  let halfWidth;
  if (positionIndex <= 1)      halfWidth = 10;   // ±10 min  → 20-min window
  else if (positionIndex <= 3) halfWidth = 20;   // ±20 min  → 40-min window
  else                         halfWidth = 30;   // ±30 min  → 60-min window

  const fromMinutes = centreMinutes - halfWidth;
  const toMinutes   = centreMinutes + halfWidth;

  const formatTime = (base, offset) => {
    const d = new Date(base.getTime() + offset * 60000);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return `${formatTime(now, fromMinutes)} – ${formatTime(now, toMinutes)}`;
}

// ─── Mock active tokens (for "Check Token" screen) ───────────────────────────
// Simulates tokens already in the system that patients can look up by mobile.
export const MOCK_ACTIVE_TOKENS = [
  {
    mobile: '9876543210',
    tokenNumber: 'T042',
    clinicId: 'c1',
    doctorId: 'd1',
    positionIndex: 3,   // 3 patients away from consultation
  },
  {
    mobile: '9123456789',
    tokenNumber: 'T045',
    clinicId: 'c3',
    doctorId: 'd4',
    positionIndex: 1,
  },
  {
    mobile: '8001234567',
    tokenNumber: 'T046',
    clinicId: 'c5',
    doctorId: 'd8',
    positionIndex: 5,
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────
export function getClinicById(id)  { return CLINICS.find(c => c.id === id); }
export function getDoctorById(clinicId, doctorId) {
  const clinic = getClinicById(clinicId);
  return clinic?.doctors.find(d => d.id === doctorId);
}
