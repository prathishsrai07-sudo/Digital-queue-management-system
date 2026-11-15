/**
 * doctorStorage.js
 * ----------------
 * All localStorage helpers for the Doctor/Clinic Side.
 *
 * Keys used:
 *   sdqms_doctor_session  — currently logged-in doctor session
 *   sdqms_queue_{cId}_{dId} — live queue for a specific clinic+doctor
 *   sdqms_doctor_status_{cId}_{dId} — doctor's current status
 *   sdqms_token_counter_{cId} — per-clinic token counter
 *   sdqms_doctors_{cId} — doctor list overrides for a clinic
 */

import { INITIAL_MOCK_QUEUE, DOCTOR_STATUS } from './mockDoctorData';

// ─── Session ──────────────────────────────────────────────────────────────────
const SESSION_KEY = 'sdqms_doctor_session';

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ─── Queue ────────────────────────────────────────────────────────────────────
function queueKey(clinicId, doctorId) {
  return `sdqms_queue_${clinicId}_${doctorId}`;
}

export function getQueue(clinicId, doctorId) {
  try {
    const raw = localStorage.getItem(queueKey(clinicId, doctorId));
    if (raw) return JSON.parse(raw);
    // Seed with mock data on first load
    const mockKey = `${clinicId}_${doctorId}`;
    const seed = INITIAL_MOCK_QUEUE[mockKey] ?? [];
    saveQueue(clinicId, doctorId, seed);
    return seed;
  } catch { return []; }
}

export function saveQueue(clinicId, doctorId, queue) {
  localStorage.setItem(queueKey(clinicId, doctorId), JSON.stringify(queue));
}

// ─── Doctor Status ────────────────────────────────────────────────────────────
function statusKey(clinicId, doctorId) {
  return `sdqms_doctor_status_${clinicId}_${doctorId}`;
}

export function getDoctorStatus(clinicId, doctorId) {
  return localStorage.getItem(statusKey(clinicId, doctorId)) ?? DOCTOR_STATUS.AVAILABLE;
}

export function saveDoctorStatus(clinicId, doctorId, status) {
  localStorage.setItem(statusKey(clinicId, doctorId), status);
}

// ─── Token Counter (per clinic) ───────────────────────────────────────────────
function counterKey(clinicId) {
  return `sdqms_token_counter_${clinicId}`;
}

export function getNextTokenNumber(clinicId) {
  const current = parseInt(localStorage.getItem(counterKey(clinicId)) ?? '60', 10);
  const next = current + 1;
  localStorage.setItem(counterKey(clinicId), String(next));
  return `T${String(next).padStart(3, '0')}`;
}

// ─── Doctor List (per clinic, allows adding new doctors) ─────────────────────
function doctorsKey(clinicId) {
  return `sdqms_doctors_${clinicId}`;
}

export function getDoctors(clinicId, defaultDoctors) {
  try {
    const raw = localStorage.getItem(doctorsKey(clinicId));
    return raw ? JSON.parse(raw) : defaultDoctors;
  } catch { return defaultDoctors; }
}

export function saveDoctors(clinicId, doctors) {
  localStorage.setItem(doctorsKey(clinicId), JSON.stringify(doctors));
}
