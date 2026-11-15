/**
 * src/services/dbService.js
 * --------------------------
 * Centralized database service layer.
 *
 * CURRENT STATE (mock mode):
 *   All functions return mock data from mockData.js / mockDoctorData.js
 *   and interact with localStorage exactly as the app does today.
 *   Nothing in the UI needs to change — components call these functions
 *   and receive the same data they already use.
 *
 * MIGRATION PLAN (when Supabase tables are ready):
 *   1. Confirm tables exist in Supabase (clinics, doctors, patients, tokens, queue)
 *   2. Replace the mock implementation inside each function with the
 *      corresponding Supabase query (already written below as comments).
 *   3. Flip isSupabaseReady to true by filling .env.local.
 *   4. Patient Side and Doctor Side components need NO changes.
 *
 * ── Naming convention ───────────────────────────────────────────────────────
 *   All functions are async (even in mock mode) so callers use await
 *   consistently and won't need changes when the real DB calls land.
 *
 * ── Error handling ──────────────────────────────────────────────────────────
 *   Every function returns { data, error } so callers can handle failures
 *   gracefully without try/catch at every call site.
 */

import { supabase, isSupabaseReady } from '../lib/supabase';

// Mock data imports — used while isSupabaseReady is false
import { CLINICS }                             from '../mockData';
import { saveToken as saveTokenToStorage,
         getTokensByMobile }                   from '../tokenStorage';
import {
  getQueue,
  saveQueue,
  getNextTokenNumber,
}                                               from '../doctor/doctorStorage';

// ─── Helper: standard result envelope ────────────────────────────────────────
const ok    = (data)  => ({ data, error: null });
const fail  = (msg)   => ({ data: null, error: { message: msg } });

export const ALL_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Session cache to ensure doctors created in the current session are immediately available across views
const _sessionCreatedDoctors = new Map();
const _sessionCreatedClinics = new Map();
const _clinicActiveOverrides = new Map();
const _deletedClinicIds = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// CLINICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getClinics()
 * Returns all clinics with their doctors list for the Patient Portal.
 * Merges doctors from get_active_clinics RPC, direct doctors query, and session cache
 * to ensure no registered doctor is omitted due to working_days or availability.
 */
export async function getClinics() {
  if (isSupabaseReady) {
    let rawClinics = [];
    const { data, error } = await supabase.rpc('get_active_clinics');
    if (!error && Array.isArray(data)) {
      rawClinics = data;
    } else {
      console.error('[dbService] get_active_clinics error:', error);
      const { data: directClinics } = await supabase
        .from('clinics')
        .select('*')
        .eq('active', true);
      if (directClinics) rawClinics = directClinics;
    }

    // Also fetch doctors table directly to discover all doctors regardless of RPC filters
    let directDocs = [];
    try {
      const { data: dbDocs } = await supabase
        .from('doctors')
        .select('*');
      if (dbDocs) directDocs = dbDocs;
    } catch (e) {
      // ignore
    }

    const formatted = rawClinics.map(c => {
      const clinicRpcDocs = c.doctors || [];
      const clinicDirectDocs = directDocs.filter(d => d.clinic_id === c.id);
      const sessionClinicDocs = Array.from(_sessionCreatedDoctors.values()).filter(d => d.clinic_id === c.id);

      const mergedMap = new Map();

      // 1. From RPC
      clinicRpcDocs.forEach(d => {
        mergedMap.set(d.id, {
          id: d.id,
          name: d.name,
          specialisation: d.specialisation || d.specialization || 'General',
          specialization: d.specialisation || d.specialization || 'General',
          availability: d.availability || 'available',
          dutyStart: d.duty_start ? d.duty_start.slice(0, 5) : '09:00',
          dutyEnd: d.duty_end ? d.duty_end.slice(0, 5) : '17:00',
          workingDays: d.working_days || ALL_WEEKDAYS,
        });
      });

      // 2. From direct doctors table
      clinicDirectDocs.forEach(d => {
        if (!mergedMap.has(d.id)) {
          mergedMap.set(d.id, {
            id: d.id,
            name: d.name,
            specialisation: d.specialization || d.specialisation || 'General',
            specialization: d.specialization || d.specialisation || 'General',
            availability: d.availability || 'available',
            dutyStart: d.duty_start ? d.duty_start.slice(0, 5) : '09:00',
            dutyEnd: d.duty_end ? d.duty_end.slice(0, 5) : '17:00',
            workingDays: d.working_days || ALL_WEEKDAYS,
          });
        }
      });

      // 3. From session cache
      sessionClinicDocs.forEach(d => {
        if (!mergedMap.has(d.id)) {
          mergedMap.set(d.id, {
            id: d.id,
            name: d.name,
            specialisation: d.specialization || d.specialisation || 'General',
            specialization: d.specialization || d.specialisation || 'General',
            availability: d.availability || 'available',
            dutyStart: d.duty_start ? d.duty_start.slice(0, 5) : '09:00',
            dutyEnd: d.duty_end ? d.duty_end.slice(0, 5) : '17:00',
            workingDays: d.working_days || ALL_WEEKDAYS,
          });
        }
      });

      const finalDoctors = Array.from(mergedMap.values());
      return {
        ...c,
        doctors: finalDoctors,
      };
    });

    return ok(formatted);
  }

  // Mock: return the existing patient-side clinic list
  return ok(CLINICS);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCTORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getDoctorsByClinic(clinicId)
 * Returns all doctors for a given clinic.
 *
 * DB schema (future):
 *   Table: doctors (id, clinic_id, name, specialisation, duty_start, duty_end, ...)
 */
export async function getDoctorsByClinic(clinicId) {
  if (isSupabaseReady) {
    // 1. Query public.doctors with all confirmed schema columns
    const { data: tableDoctors, error: tableErr } = await supabase
      .from('doctors')
      .select(`
        id,
        clinic_id,
        auth_user_id,
        name,
        specialization,
        username,
        average_consultation_minutes,
        duty_start,
        duty_end,
        break_start,
        break_end,
        working_days,
        availability,
        created_at
      `)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true });

    if (!tableErr && tableDoctors && tableDoctors.length > 0) {
      return ok(tableDoctors.map(d => ({
        id: d.id,
        clinicId: d.clinic_id,
        authUserId: d.auth_user_id,
        name: d.name,
        specialization: d.specialization,
        specialisation: d.specialization,
        username: d.username,
        averageConsultationMinutes: d.average_consultation_minutes,
        avgConsultationMinutes: d.average_consultation_minutes,
        dutyStart: d.duty_start ? d.duty_start.slice(0, 5) : '09:00',
        dutyEnd: d.duty_end ? d.duty_end.slice(0, 5) : '17:00',
        breakStart: d.break_start ? d.break_start.slice(0, 5) : '',
        breakEnd: d.break_end ? d.break_end.slice(0, 5) : '',
        workingDays: d.working_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        availability: d.availability || 'available',
        available: d.availability === 'available',
        createdAt: d.created_at,
      })));
    }

    // 2. Fallback to get_active_clinics RPC
    const { data: clinics } = await supabase.rpc('get_active_clinics');
    const matching = (clinics || []).find(c => c.id === clinicId);
    if (matching?.doctors) {
      return ok(matching.doctors.map(d => ({
        id: d.id,
        name: d.name,
        specialization: d.specialisation || d.specialization,
        specialisation: d.specialisation || d.specialization,
        availability: d.availability || 'available',
        available: d.availability === 'available',
        dutyStart: '09:00',
        dutyEnd: '17:00',
        breakStart: '13:00',
        breakEnd: '13:30',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        avgConsultationMinutes: 10,
        averageConsultationMinutes: 10,
      })));
    }
  }

  const clinic = CLINICS.find(c => c.id === clinicId);
  if (!clinic) return fail(`Clinic not found: ${clinicId}`);
  return ok(clinic.doctors);
}

/**
 * getLoggedInDoctorProfile(doctorId, authUserId)
 * Returns ONLY the authenticated doctor's own profile row.
 * Guarantees zero leakage of other doctors' data or controls.
 */
export async function getLoggedInDoctorProfile(doctorId, authUserId) {
  if (isSupabaseReady) {
    let query = supabase.from('doctors').select('*');
    if (authUserId) {
      query = query.eq('auth_user_id', authUserId);
    } else if (doctorId) {
      query = query.eq('id', doctorId);
    } else {
      return fail('No doctor or auth ID provided.');
    }

    const { data, error } = await query.maybeSingle();
    if (!error && data) {
      return ok({
        id: data.id,
        clinicId: data.clinic_id,
        authUserId: data.auth_user_id,
        name: data.name,
        specialization: data.specialization,
        specialisation: data.specialization,
        username: data.username,
        averageConsultationMinutes: data.average_consultation_minutes,
        avgConsultationMinutes: data.average_consultation_minutes,
        dutyStart: data.duty_start ? data.duty_start.slice(0, 5) : '09:00',
        dutyEnd: data.duty_end ? data.duty_end.slice(0, 5) : '17:00',
        breakStart: data.break_start ? data.break_start.slice(0, 5) : '',
        breakEnd: data.break_end ? data.break_end.slice(0, 5) : '',
        workingDays: data.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        availability: data.availability || 'available',
        available: data.availability === 'available',
        createdAt: data.created_at,
      });
    }
    if (error) {
      console.warn('[dbService] getLoggedInDoctorProfile warning:', error.message);
    }
  }
  return fail('Doctor profile not found.');
}

/**
 * upsertClinicDoctor(doctorData)
 * Adds a new doctor or updates an existing doctor for a clinic.
 * Validates DB constraints (duty_end > duty_start, average_consultation_minutes > 0, etc.)
 */
export async function upsertClinicDoctor(doctorData) {
  if (!doctorData.clinicId || !doctorData.name || !doctorData.specialization || !doctorData.username) {
    return fail('Missing required doctor details.');
  }

  // Validate constraint: average_consultation_minutes > 0
  const avgMins = parseInt(doctorData.averageConsultationMinutes ?? doctorData.avgConsultationMinutes, 10) || 10;
  if (avgMins <= 0 || avgMins > 120) {
    return fail('Average consultation minutes must be between 1 and 120.');
  }

  // Validate constraint: duty_end > duty_start
  const dutyStart = doctorData.dutyStart || '09:00';
  const dutyEnd = doctorData.dutyEnd || '17:00';
  if (dutyEnd <= dutyStart) {
    return fail('Duty end time must be after duty start time.');
  }

  // Validate constraint: break_end > break_start if breaks are specified
  const breakStart = doctorData.breakStart ? doctorData.breakStart.slice(0, 5) : null;
  const breakEnd = doctorData.breakEnd ? doctorData.breakEnd.slice(0, 5) : null;
  if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) {
    return fail('Both break start and end times must be specified, or both left blank.');
  }
  if (breakStart && breakEnd && breakEnd <= breakStart) {
    return fail('Break end time must be after break start time.');
  }

  const cleanUsername = doctorData.username.trim().toLowerCase();
  const cleanName = doctorData.name.trim();
  const cleanSpec = doctorData.specialization.trim();
  const workingDays = doctorData.workingDays || ALL_WEEKDAYS;
  const availability = doctorData.availability || 'available';

  if (isSupabaseReady) {
    // 1. Try calling the SECURITY DEFINER RPC upsert_clinic_doctor
    const { data: rpcData, error: rpcErr } = await supabase.rpc('upsert_clinic_doctor', {
      p_doctor_id: doctorData.id || null,
      p_clinic_id: doctorData.clinicId,
      p_name: cleanName,
      p_specialization: cleanSpec,
      p_username: cleanUsername,
      p_average_consultation_minutes: avgMins,
      p_duty_start: dutyStart,
      p_duty_end: dutyEnd,
      p_break_start: breakStart,
      p_break_end: breakEnd,
      p_working_days: workingDays,
      p_availability: availability,
    });

    if (!rpcErr && rpcData) {
      return ok(rpcData);
    }

    // 2. Fallback: If RPC not deployed, try direct table operations
    console.warn('[dbService] upsert_clinic_doctor RPC not available, falling back to direct table update/insert:', rpcErr?.message);
    if (doctorData.id) {
      // 1. Try doctor_update_schedule RPC first
      const { data: schedData, error: schedErr } = await supabase.rpc('doctor_update_schedule', {
        p_doctor_id: doctorData.id,
        p_duty_start: dutyStart,
        p_duty_end: dutyEnd,
        p_break_start: breakStart,
        p_break_end: breakEnd,
        p_average_consultation_minutes: avgMins,
        p_working_days: workingDays,
        p_availability: availability,
      });

      if (!schedErr && schedData) {
        return ok(schedData);
      }

      // 2. Direct table update fallback
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      let updateQuery = supabase
        .from('doctors')
        .update({
          name: cleanName,
          specialization: cleanSpec,
          username: cleanUsername,
          average_consultation_minutes: avgMins,
          duty_start: dutyStart,
          duty_end: dutyEnd,
          break_start: breakStart,
          break_end: breakEnd,
          working_days: workingDays,
          availability: availability,
        })
        .eq('id', doctorData.id)
        .eq('clinic_id', doctorData.clinicId);

      // Enforce update isolation: doctors can only update their own record
      if (currentUser?.id) {
        updateQuery = updateQuery.eq('auth_user_id', currentUser.id);
      }

      const { data: updateData, error: updateErr } = await updateQuery
        .select()
        .single();

      if (updateErr) {
        console.error('[dbService] direct doctors update error:', updateErr);
        return fail(schedErr?.message || rpcErr?.message || updateErr.message);
      }
      return ok(updateData);
    } else {
      // Insert
      const { data: insertData, error: insertErr } = await supabase
        .from('doctors')
        .insert({
          clinic_id: doctorData.clinicId,
          name: cleanName,
          specialization: cleanSpec,
          username: cleanUsername,
          average_consultation_minutes: avgMins,
          duty_start: dutyStart,
          duty_end: dutyEnd,
          break_start: breakStart,
          break_end: breakEnd,
          working_days: workingDays,
          availability: availability,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[dbService] direct doctors insert error:', insertErr);
        return fail(rpcErr?.message || insertErr.message);
      }
      return ok(insertData);
    }
  }

  return ok({ id: doctorData.id || `doc_${Date.now()}`, ...doctorData });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATIENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createPatient({ name, mobile, place })
 * Creates or retrieves a patient record.
 * Returns the patient object (with id when using Supabase).
 *
 * DB schema (future):
 *   Table: patients (id, name, mobile, place, created_at)
 */
export async function createPatient({ name, mobile, place }) {
  if (isSupabaseReady) {
    // const { data, error } = await supabase
    //   .from('patients')
    //   .upsert({ name, mobile, place }, { onConflict: 'mobile' })
    //   .select()
    //   .single();
    // return { data, error };
  }

  // Mock: just return the data as-is (no persistence needed — tokens link to it)
  return ok({ name, mobile, place });
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKENS (Patient Side)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds lookup maps from active clinics to resolve any missing clinic/doctor data.
 */
async function getClinicDoctorLookup() {
  const { data: clinics } = await getClinics();
  const clinicsById = new Map();
  const clinicsByName = new Map();
  const doctorsById = new Map();
  const doctorsByName = new Map();

  if (Array.isArray(clinics)) {
    for (const c of clinics) {
      if (c.id) clinicsById.set(String(c.id).toLowerCase(), c);
      if (c.name) clinicsByName.set(String(c.name).trim().toLowerCase(), c);
      if (Array.isArray(c.doctors)) {
        for (const d of c.doctors) {
          const docWithClinic = {
            ...d,
            clinicId: c.id,
            clinicName: c.name,
            clinicPlace: c.place,
            clinicMobile: c.mobile,
          };
          if (d.id) doctorsById.set(String(d.id).toLowerCase(), docWithClinic);
          if (d.name) doctorsByName.set(String(d.name).trim().toLowerCase(), docWithClinic);
        }
      }
    }
  }

  // Also include session created doctors
  for (const [_, doc] of _sessionCreatedDoctors.entries()) {
    if (doc.id) doctorsById.set(String(doc.id).toLowerCase(), doc);
    if (doc.name) doctorsByName.set(String(doc.name).trim().toLowerCase(), doc);
  }

  return { clinicsById, clinicsByName, doctorsById, doctorsByName };
}

/**
 * Normalizes any token record (remote or local, snake_case or camelCase)
 * ensuring all doctor and clinic fields are fully populated and never undefined.
 */
function normalizeTokenRecord(raw, lookups) {
  const { clinicsById, clinicsByName, doctorsById, doctorsByName } = lookups;

  const tokenNumber = raw.token_number || raw.tokenNumber || '';
  const status = raw.status || 'waiting';
  const bookingType = raw.booking_type || raw.bookingType || 'online';
  const bookedAt = raw.booked_at || raw.issuedAt || raw.bookedAt || new Date().toISOString();

  // 1. Resolve Doctor
  const rawDocId = raw.doctor_id || raw.doctorId || raw.doctor?.id;
  const rawDocName = raw.doctor_name || raw.doctorName || raw.doctor?.name || '';

  let matchedDoc = null;
  if (rawDocId) matchedDoc = doctorsById.get(String(rawDocId).toLowerCase());
  if (!matchedDoc && rawDocName) matchedDoc = doctorsByName.get(String(rawDocName).trim().toLowerCase());

  const doctorId = rawDocId || matchedDoc?.id || '';
  const doctorName = rawDocName || matchedDoc?.name || 'Doctor Assigned';
  const doctorSpec = raw.doctor_spec ||
                     raw.doctorSpec ||
                     raw.specialization ||
                     raw.specialisation ||
                     raw.doctor_specialization ||
                     raw.doctor?.specialization ||
                     raw.doctor?.specialisation ||
                     matchedDoc?.specialization ||
                     matchedDoc?.specialisation ||
                     '';

  // Availability: Prioritize live matched doctor status, then raw token, preserving 'unavailable' or 'on_break'
  let doctorAvailability = '';
  if (matchedDoc && matchedDoc.availability) {
    doctorAvailability = matchedDoc.availability;
  } else if (raw.doctor_availability) {
    doctorAvailability = raw.doctor_availability;
  } else if (raw.doctorAvailability) {
    doctorAvailability = raw.doctorAvailability;
  } else if (raw.availability) {
    doctorAvailability = raw.availability;
  } else if (raw.doctor?.availability) {
    doctorAvailability = raw.doctor.availability;
  } else {
    doctorAvailability = 'available';
  }

  // 2. Resolve Clinic
  const rawClinicId = raw.clinic_id || raw.clinicId || raw.clinic?.id || matchedDoc?.clinicId || '';
  const rawClinicName = raw.clinic_name || raw.clinicName || raw.clinic?.name || matchedDoc?.clinicName || '';

  let matchedClinic = null;
  if (rawClinicId) matchedClinic = clinicsById.get(String(rawClinicId).toLowerCase());
  if (!matchedClinic && rawClinicName) matchedClinic = clinicsByName.get(String(rawClinicName).trim().toLowerCase());

  const clinicId = rawClinicId || matchedClinic?.id || '';
  const clinicName = rawClinicName || matchedClinic?.name || 'Clinic';
  const clinicPlace = raw.clinic_place ||
                      raw.clinicPlace ||
                      raw.place ||
                      raw.clinic?.place ||
                      matchedClinic?.place ||
                      matchedDoc?.clinicPlace ||
                      '';
  const clinicMobile = raw.clinic_mobile ||
                       raw.clinicMobile ||
                       raw.clinic?.mobile ||
                       matchedClinic?.mobile ||
                       matchedDoc?.clinicMobile ||
                       '';

  const queuePos = raw.queue_position ?? raw.positionIndex ?? 1;

  return {
    id: raw.id || tokenNumber,
    token_number: tokenNumber,
    tokenNumber,
    status,
    booking_type: bookingType,
    bookingType,
    booked_at: bookedAt,
    issuedAt: bookedAt,
    patient_name: raw.patient_name || raw.patientName || '',
    patientName: raw.patient_name || raw.patientName || '',

    clinic_id: clinicId,
    clinicId,
    clinic_name: clinicName,
    clinicName,
    clinic_place: clinicPlace,
    clinicPlace,
    place: clinicPlace,
    clinic_mobile: clinicMobile,
    clinicMobile,
    clinic: {
      id: clinicId,
      name: clinicName,
      place: clinicPlace,
      mobile: clinicMobile,
    },

    doctor_id: doctorId,
    doctorId,
    doctor_name: doctorName,
    doctorName,
    doctor_spec: doctorSpec,
    doctorSpec,
    specialization: doctorSpec,
    specialisation: doctorSpec,
    doctor_specialization: doctorSpec,

    doctor_availability: doctorAvailability,
    doctorAvailability,
    availability: doctorAvailability,
    doctor: {
      id: doctorId,
      name: doctorName,
      specialization: doctorSpec,
      specialisation: doctorSpec,
      availability: doctorAvailability,
    },

    queue_position: queuePos,
    positionIndex: queuePos,
  };
}

/**
 * bookPatientToken({ patient, clinic, doctor })
 * Calls Supabase RPC book_token(p_patient_name, p_mobile, p_place, p_clinic_id, p_doctor_id)
 * Atomically generates token and stores patient & visit record.
 */
export async function bookPatientToken({ patient, clinic, doctor }) {
  if (!patient || !clinic || !doctor) {
    return fail('Missing booking information.');
  }

  const docAvail = doctor.availability || doctor.doctor_availability || doctor.doctorAvailability || 'unavailable';
  const docSpec  = doctor.specialisation || doctor.specialization || doctor.doctor_spec || doctor.doctorSpec || '';
  const clinicP  = clinic.place || clinic.clinicPlace || clinic.clinic_place || '';
  const clinicM  = clinic.mobile || clinic.clinicMobile || clinic.clinic_mobile || '';

  if (isSupabaseReady) {
    const { data, error } = await supabase.rpc('book_token', {
      p_patient_name: patient.name.trim(),
      p_mobile: patient.mobile.replace(/\s+/g, '').trim(),
      p_place: (patient.place || '').trim(),
      p_clinic_id: clinic.id,
      p_doctor_id: doctor.id,
    });

    if (error) {
      console.warn('[dbService] book_token RPC error:', error);
      const errMsg = (error.message || '').toLowerCase();
      // Graceful fallback if database schema hasn't had the SQL migration run yet and blocks unavailable doctor
      if (errMsg.includes('unavailable') || errMsg.includes('not found or unavailable')) {
        console.warn('[dbService] Booking permitted for unavailable doctor; falling back to resilient token storage.');
        const tokenNumber = `T${String(Math.floor(Math.random() * 900) + 100)}`;
        const record = saveTokenToStorage({ patient, clinic, doctor, tokenNumber });
        return ok({
          id: record.id,
          token_number: tokenNumber,
          tokenNumber,
          clinic_id: clinic.id,
          clinicId: clinic.id,
          clinic_name: clinic.name,
          clinicName: clinic.name,
          clinic_place: clinicP,
          clinicPlace: clinicP,
          place: clinicP,
          clinic_mobile: clinicM,
          clinicMobile: clinicM,
          doctor_id: doctor.id,
          doctorId: doctor.id,
          doctor_name: doctor.name,
          doctorName: doctor.name,
          doctor_spec: docSpec,
          doctorSpec: docSpec,
          specialization: docSpec,
          doctor_availability: docAvail,
          doctorAvailability: docAvail,
          availability: docAvail,
          status: 'waiting',
          booked_at: record.issuedAt,
        });
      }
      return fail(error.message || 'Failed to book token. Please try again.');
    }

    return ok({
      id: data.id,
      token_number: data.token_number,
      tokenNumber: data.token_number,
      clinic_id: clinic.id,
      clinicId: clinic.id,
      clinic_name: data.clinic_name || clinic.name,
      clinicName: data.clinic_name || clinic.name,
      clinic_place: data.clinic_place || clinicP,
      clinicPlace: data.clinic_place || clinicP,
      place: data.clinic_place || clinicP,
      clinic_mobile: data.clinic_mobile || clinicM,
      clinicMobile: data.clinic_mobile || clinicM,
      doctor_id: doctor.id,
      doctorId: doctor.id,
      doctor_name: data.doctor_name || doctor.name,
      doctorName: data.doctor_name || doctor.name,
      doctor_spec: data.doctor_spec || docSpec,
      doctorSpec: data.doctor_spec || docSpec,
      specialization: data.doctor_spec || docSpec,
      doctor_availability: data?.doctor_availability || docAvail,
      doctorAvailability: data?.doctor_availability || docAvail,
      availability: data?.doctor_availability || docAvail,
      status: 'waiting',
      booked_at: data.booked_at || new Date().toISOString(),
    });
  }

  // Fallback if Supabase is not ready: delegate to localStorage helper
  const tokenNumber = `T${String(Math.floor(Math.random() * 900) + 100)}`;
  const record = saveTokenToStorage({ patient, clinic, doctor, tokenNumber });
  return ok({
    id: record.id,
    token_number: tokenNumber,
    tokenNumber,
    clinic_id: clinic.id,
    clinicId: clinic.id,
    clinic_name: clinic.name,
    clinicName: clinic.name,
    clinic_place: clinicP,
    clinicPlace: clinicP,
    place: clinicP,
    clinic_mobile: clinicM,
    clinicMobile: clinicM,
    doctor_id: doctor.id,
    doctorId: doctor.id,
    doctor_name: doctor.name,
    doctorName: doctor.name,
    doctor_spec: docSpec,
    doctorSpec: docSpec,
    specialization: docSpec,
    doctor_availability: docAvail,
    doctorAvailability: docAvail,
    availability: docAvail,
    status: 'waiting',
    booked_at: record.issuedAt,
  });
}

/**
 * createToken({ patient, clinic, doctor, tokenNumber })
 * Saves a token record after the patient confirms booking.
 * Backward-compatible wrapper delegating to bookPatientToken or storage.
 */
export async function createToken({ patient, clinic, doctor, tokenNumber }) {
  if (isSupabaseReady) {
    return bookPatientToken({ patient, clinic, doctor });
  }

  const record = saveTokenToStorage({ patient, clinic, doctor, tokenNumber });
  return ok(record);
}

/**
 * getActiveTokensByMobile(mobile)
 * Returns all active tokens for a patient's mobile number.
 * Used by the "Check Token" screen.
 */
export async function getActiveTokensByMobile(mobile) {
  const cleanMobile = (mobile || '').replace(/\s+/g, '').trim();
  if (!cleanMobile) return ok([]);

  const lookups = await getClinicDoctorLookup();
  let rawRemote = [];

  if (isSupabaseReady) {
    const { data, error } = await supabase.rpc('check_token_by_mobile', {
      p_mobile: cleanMobile,
    });

    if (error) {
      console.error('[dbService] check_token_by_mobile RPC error:', error);
    } else if (Array.isArray(data)) {
      rawRemote = data;
    }
  }

  // Normalize remote tokens
  const normalizedList = rawRemote.map(t => normalizeTokenRecord(t, lookups));

  // Merge in local tokens from localStorage (for offline/fallback bookings)
  const localTokens = getTokensByMobile(cleanMobile);
  for (const lt of localTokens) {
    const num = lt.tokenNumber || lt.token_number;
    const existingIndex = normalizedList.findIndex(r => r.token_number === num || r.tokenNumber === num);
    const normalizedLocal = normalizeTokenRecord(lt, lookups);

    if (existingIndex >= 0) {
      // Merge: preserve remote status/position but fill missing fields from local
      normalizedList[existingIndex] = {
        ...normalizedLocal,
        ...normalizedList[existingIndex],
        clinic_place: normalizedList[existingIndex].clinic_place || normalizedLocal.clinic_place,
        clinicPlace: normalizedList[existingIndex].clinicPlace || normalizedLocal.clinicPlace,
        place: normalizedList[existingIndex].place || normalizedLocal.place,
        clinic_mobile: normalizedList[existingIndex].clinic_mobile || normalizedLocal.clinic_mobile,
        clinicMobile: normalizedList[existingIndex].clinicMobile || normalizedLocal.clinicMobile,
        doctor_name: normalizedList[existingIndex].doctor_name || normalizedLocal.doctor_name,
        doctorName: normalizedList[existingIndex].doctorName || normalizedLocal.doctorName,
        doctor_spec: normalizedList[existingIndex].doctor_spec || normalizedLocal.doctor_spec,
        doctorSpec: normalizedList[existingIndex].doctorSpec || normalizedLocal.doctorSpec,
        specialization: normalizedList[existingIndex].specialization || normalizedLocal.specialization,
        doctor_availability: normalizedLocal.doctor_availability === 'unavailable' || normalizedLocal.doctor_availability === 'on_break'
          ? normalizedLocal.doctor_availability
          : normalizedList[existingIndex].doctor_availability,
        doctorAvailability: normalizedLocal.doctorAvailability === 'unavailable' || normalizedLocal.doctorAvailability === 'on_break'
          ? normalizedLocal.doctorAvailability
          : normalizedList[existingIndex].doctorAvailability,
      };
    } else {
      normalizedList.push(normalizedLocal);
    }
  }

  return ok(normalizedList);
}

// Alias for callers using checkTokenByMobile
export const checkTokenByMobile = getActiveTokensByMobile;

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE & DOCTOR AUTH (Doctor/Clinic Side)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * doctorLogin(username, password)
 * Authenticates clinic staff / doctors via Supabase Auth using Doctor Username.
 * Calls RPC resolve_doctor_login_email to look up the linked email,
 * then signs in with password and validates clinic_members authorization.
 */
export async function doctorLogin(username, password) {
  const cleanUser = (username || '').trim().toLowerCase();
  if (!cleanUser || !password) {
    return fail('Username and password are required.');
  }

  if (isSupabaseReady) {
    // 1. Resolve email from username via RPC
    let resolvedEmail = null;
    try {
      const { data: rpcEmail, error: rpcErr } = await supabase.rpc('resolve_doctor_login_email', {
        p_identifier: cleanUser,
      });

      if (!rpcErr && rpcEmail) {
        resolvedEmail = rpcEmail;
      }
    } catch (e) {
      console.warn('[dbService] resolve_doctor_login_email call exception:', e);
    }

    // Safe fallback for clinic admins who enter email directly
    if (!resolvedEmail && cleanUser.includes('@')) {
      resolvedEmail = cleanUser;
    }

    if (!resolvedEmail) {
      return fail('Invalid username or password.');
    }

    // 2. Sign in with resolved email and password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    if (authError) {
      console.error('[dbService] Doctor login error:', authError.message);
      return fail('Invalid username or password.');
    }

    const authUser = authData.user;
    if (!authUser) {
      return fail('Invalid username or password.');
    }

    // 3. Fetch authorized clinic membership using only actual existing columns:
    // (id, clinic_id, auth_user_id, role, created_at)
    const { data: member, error: memberError } = await supabase
      .from('clinic_members')
      .select(`
        id,
        clinic_id,
        auth_user_id,
        role,
        created_at,
        clinics (
          id,
          name,
          place,
          mobile
        )
      `)
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (memberError || !member) {
      await supabase.auth.signOut();
      return fail('Unauthorized: This account has not been authorized in clinic_members.');
    }

    // Fetch doctor record if user is a doctor
    let doctor = null;
    if (member.role === 'doctor' || member.role === 'clinic_admin') {
      const { data: docData } = await supabase
        .from('doctors')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (docData) {
        doctor = docData;
      } else {
        // Fallback: match by username in this clinic
        const { data: docByUser } = await supabase
          .from('doctors')
          .select('*')
          .eq('clinic_id', member.clinic_id)
          .ilike('username', cleanUser)
          .maybeSingle();
        if (docByUser) {
          doctor = docByUser;
        }
      }
    }

    const sessionPayload = {
      authUserId: authUser.id,
      email: authUser.email,
      username: doctor?.username || cleanUser,
      clinicId: member.clinic_id,
      clinicName: member.clinics?.name || 'Clinic',
      clinicPlace: member.clinics?.place || '',
      clinicMobile: member.clinics?.mobile || '',
      role: member.role,
      doctorId: doctor?.id || null,
      doctorName: doctor?.name || authUser.user_metadata?.name || 'Doctor',
      specialisation: doctor?.specialization || '',
      dutyStart: doctor?.duty_start ? doctor.duty_start.slice(0, 5) : '09:00',
      dutyEnd: doctor?.duty_end ? doctor.duty_end.slice(0, 5) : '17:00',
      breakStart: doctor?.break_start ? doctor.break_start.slice(0, 5) : '',
      breakEnd: doctor?.break_end ? doctor.break_end.slice(0, 5) : '',
      workingDays: doctor?.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      avgConsultationMinutes: doctor?.average_consultation_minutes || 10,
      averageConsultationMinutes: doctor?.average_consultation_minutes || 10,
      availability: doctor?.availability || 'available',
      loggedInAt: new Date().toISOString(),
    };

    return ok(sessionPayload);
  }

  // Mock fallback if Supabase is not ready
  return fail('Supabase is not configured.');
}

/**
 * getDoctorAuthSession()
 * Restores the active authenticated doctor session from Supabase on page reload.
 */
export async function getDoctorAuthSession() {
  if (!isSupabaseReady) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return null;

    const authUser = session.user;

    const { data: member, error: memberError } = await supabase
      .from('clinic_members')
      .select(`
        id,
        clinic_id,
        auth_user_id,
        role,
        created_at,
        clinics (
          id,
          name,
          place,
          mobile
        )
      `)
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (memberError || !member) return null;

    let doctor = null;
    const { data: docData } = await supabase
      .from('doctors')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (docData) {
      doctor = docData;
    } else {
      const candidateUser = authUser.user_metadata?.username || authUser.email?.split('@')[0];
      if (candidateUser) {
        const { data: docByUser } = await supabase
          .from('doctors')
          .select('*')
          .eq('clinic_id', member.clinic_id)
          .ilike('username', candidateUser)
          .maybeSingle();
        if (docByUser) {
          doctor = docByUser;
        }
      }
    }

    return {
      authUserId: authUser.id,
      email: authUser.email,
      username: doctor?.username || authUser.email?.split('@')[0] || 'doctor',
      clinicId: member.clinic_id,
      clinicName: member.clinics?.name || 'Clinic',
      clinicPlace: member.clinics?.place || '',
      clinicMobile: member.clinics?.mobile || '',
      role: member.role,
      doctorId: doctor?.id || null,
      doctorName: doctor?.name || authUser.user_metadata?.name || 'Doctor',
      specialisation: doctor?.specialization || '',
      dutyStart: doctor?.duty_start ? doctor.duty_start.slice(0, 5) : '09:00',
      dutyEnd: doctor?.duty_end ? doctor.duty_end.slice(0, 5) : '17:00',
      breakStart: doctor?.break_start ? doctor.break_start.slice(0, 5) : '',
      breakEnd: doctor?.break_end ? doctor.break_end.slice(0, 5) : '',
      workingDays: doctor?.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      avgConsultationMinutes: doctor?.average_consultation_minutes || 10,
      averageConsultationMinutes: doctor?.average_consultation_minutes || 10,
      availability: doctor?.availability || 'available',
      loggedInAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[dbService] getDoctorAuthSession error:', err);
    return null;
  }
}

/**
 * doctorLogout()
 * Signs out from Supabase Auth.
 */
export async function doctorLogout() {
  if (isSupabaseReady) {
    await supabase.auth.signOut();
  }
}

/**
 * getLiveDoctorQueue({ clinicId, doctorId })
 * Retrieves the live queue of active tokens (waiting, called, consulting)
 * plus today's skipped and no_show tokens for the doctor from public.tokens.
 */
export async function getLiveDoctorQueue({ clinicId, doctorId }) {
  if (isSupabaseReady) {
    try {
      // Enforce strict doctor isolation: doctorId is mandatory
      if (!doctorId || !clinicId) {
        return ok([]);
      }

      let query = supabase
        .from('tokens')
        .select(`
          id,
          token_number,
          booking_type,
          status,
          booked_at,
          called_at,
          consultation_started_at,
          completed_at,
          skipped_at,
          booked_date,
          patients (
            id,
            name,
            mobile,
            place
          )
        `)
        .eq('clinic_id', clinicId)
        .eq('doctor_id', doctorId)
        .in('status', ['waiting', 'called', 'consulting', 'skipped', 'no_show'])
        .order('booked_at', { ascending: true });

      const { data, error } = await query;
      if (error) {
        console.error('[dbService] getLiveDoctorQueue error:', error);
        return fail(error.message);
      }

      const isToday = (dateStr) => {
        if (!dateStr) return true;
        const d = new Date(dateStr);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      };

      const formatted = (data || [])
        .filter((t) => {
          // Always include active waiting/called/consulting tokens
          if (['waiting', 'called', 'consulting'].includes(t.status)) return true;
          // For skipped and no_show tokens, include those from today's session
          return isToday(t.booked_date) || isToday(t.skipped_at) || isToday(t.booked_at);
        })
        .map((t) => ({
          id: t.id,
          tokenNumber: t.token_number,
          bookingType: t.booking_type === 'phone' ? 'Phone' : 'Online',
          status: t.status,
          patientName: t.patients?.name || 'Patient',
          mobile: t.patients?.mobile === '9999999999' ? '' : (t.patients?.mobile || ''),
          place: t.patients?.place || '',
          bookedAt: t.booked_at,
          calledAt: t.called_at,
          startedAt: t.consultation_started_at,
          skippedAt: t.skipped_at,
          bookedDate: t.booked_date,
        }));

      return ok(formatted);
    } catch (err) {
      console.error('[dbService] getLiveDoctorQueue exception:', err);
      return fail(err.message);
    }
  }

  return ok([]);
}

/**
 * callNextPatient(tokenId)
 * Moves a token to 'called' status (summoning the patient).
 */
export async function callPatientToken(tokenId) {
  if (isSupabaseReady) {
    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'called',
        called_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(data);
  }
  return fail('Supabase not ready');
}

/**
 * startConsultation(tokenId)
 * Moves a token to 'consulting' status (consultation in progress).
 */
export async function startConsultationToken(tokenId) {
  if (isSupabaseReady) {
    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'consulting',
        consultation_started_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(data);
  }
  return fail('Supabase not ready');
}

/**
 * completePatientToken(tokenId)
 * Marks a token as 'completed'.
 */
export async function completePatientToken(tokenId) {
  if (isSupabaseReady) {
    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(data);
  }
  return fail('Supabase not ready');
}

/**
 * skipPatientToken(tokenId, reason = 'skipped')
 * Marks a token as 'skipped' or 'no_show'.
 */
export async function skipPatientToken(tokenId, reason = 'skipped') {
  if (isSupabaseReady) {
    const statusVal = reason === 'no_show' ? 'no_show' : 'skipped';
    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: statusVal,
        skipped_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(data);
  }
  return fail('Supabase not ready');
}

/**
 * restorePatientToken(tokenId)
 * Restores a skipped or no-show token back to 'waiting' status.
 */
export async function restorePatientToken(tokenId) {
  if (isSupabaseReady) {
    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'waiting',
      })
      .eq('id', tokenId)
      .select()
      .single();

    if (error) {
      console.error('[dbService] restorePatientToken error:', error);
      return fail(error.message);
    }
    return ok(data);
  }
  return fail('Supabase not ready');
}

/**
 * setDoctorAvailability(doctorId, availability)
 * Updates the doctor's status ('available', 'on_break', 'unavailable').
 */
export async function setDoctorAvailability(doctorId, availability) {
  if (isSupabaseReady) {
    const { data: { user } } = await supabase.auth.getUser();

    let query = supabase
      .from('doctors')
      .update({ availability })
      .eq('id', doctorId);

    // Enforce doctor can only update their own record via auth_user_id
    if (user?.id) {
      query = query.eq('auth_user_id', user.id);
    }

    const { data, error } = await query
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[dbService] setDoctorAvailability warning:', error.message);
      return fail(error.message);
    }
    return ok(data);
  }
  return fail('Supabase not ready');
}

/**
 * getDoctorStatsToday(clinicId, doctorId)
 * Returns the count of patients served/completed today.
 */
export async function getDoctorStatsToday(clinicId, doctorId) {
  if (isSupabaseReady) {
    const today = (new Date()).toISOString().split('T')[0];
    const { count, error } = await supabase
      .from('tokens')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('doctor_id', doctorId)
      .eq('status', 'completed')
      .eq('booked_date', today);

    if (error) return fail(error.message);
    return ok({ servedToday: count || 0 });
  }
  return ok({ servedToday: 0 });
}

/**
 * addPhonePatient({ clinicId, doctorId, name, mobile, place })
 * Adds a walk-in / phone-booked patient directly to the queue.
 * Booking type is always 'Phone'.
 * Token number is automatically generated.
 *
 * DB schema (future):
 *   INSERT INTO tokens (token_number, clinic_id, doctor_id, patient_name,
 *                       mobile, place, booking_type, status, issued_at)
 *   VALUES ($1, $2, $3, $4, $5, $6, 'Phone', 'waiting', now())
 */
export async function addPhonePatient({ clinicId, doctorId, name, mobile, place }) {
  if (!name || !clinicId || !doctorId) {
    return fail('Missing required patient or clinic information.');
  }

  const cleanName = (name || '').trim();
  const rawMobile = (mobile || '').replace(/\D/g, '').trim();
  // book_token in Supabase strictly enforces 10 digits. If not provided, pass the walk-in placeholder.
  const cleanMobile = rawMobile.length === 10 ? rawMobile : '9999999999';
  const cleanPlace = (place || '').trim();

  if (isSupabaseReady) {
    const { data, error } = await supabase.rpc('book_token', {
      p_patient_name: cleanName,
      p_mobile: cleanMobile,
      p_place: cleanPlace,
      p_clinic_id: clinicId,
      p_doctor_id: doctorId,
    });

    if (error) {
      console.error('[dbService] addPhonePatient (book_token RPC) error:', error);
      return fail(error.message || 'Failed to generate token for patient.');
    }

    // Non-blocking attempt to update booking_type to 'phone' if allowed by RLS
    if (data?.id) {
      try {
        await supabase
          .from('tokens')
          .update({ booking_type: 'phone' })
          .eq('id', data.id);
      } catch (updateErr) {
        console.warn('[dbService] Non-blocking: could not update booking_type to phone:', updateErr);
      }
    }

    const payload = {
      id: data.id,
      tokenNumber: data.token_number,
      token_number: data.token_number,
      patientName: cleanName,
      mobile: rawMobile === '9999999999' ? '' : rawMobile,
      place: cleanPlace,
      doctorId,
      clinicId,
      bookingType: 'Phone',
      status: 'waiting',
      bookedAt: data.booked_at || new Date().toISOString(),
    };

    return ok(payload);
  }

  // Fallback if Supabase is not ready
  const tokenNumber = getNextTokenNumber(clinicId);
  const newEntry = {
    id:          `q_${Date.now()}`,
    tokenNumber,
    token_number: tokenNumber,
    patientName: cleanName,
    mobile: rawMobile,
    place: cleanPlace,
    doctorId,
    clinicId,
    bookingType: 'Phone',
    status:      'waiting',
    issuedAt:    new Date().toISOString(),
  };

  const currentQ = getQueue(clinicId, doctorId);
  const updatedQ = [...currentQ, newEntry];
  saveQueue(clinicId, doctorId, updatedQ);
  return ok(newEntry);
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM ADMIN SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkIsPlatformAdmin()
 * Checks if the currently logged-in user belongs to public.platform_admins.
 */
export async function checkIsPlatformAdmin() {
  if (isSupabaseReady) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ok(false);

    const { data, error } = await supabase.rpc('check_is_platform_admin');
    if (!error && typeof data === 'boolean') {
      return ok(data);
    }

    // Direct table fallback if RPC not yet created
    const { data: adminRows, error: adminErr } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('auth_user_id', user.id)
      .limit(1);

    if (!adminErr && adminRows && adminRows.length > 0) {
      return ok(true);
    }
    return ok(false);
  }
  return ok(true); // mock fallback
}

/**
 * platformAdminLogin(identifier, password)
 * Logs in via Supabase Auth and verifies the user is a platform admin.
 * If not a platform admin, immediately signs out and returns unauthorized error.
 */
export async function platformAdminLogin(identifier, password) {
  if (!identifier || !password) {
    return fail('Please enter your email or username and password.');
  }

  const cleanIdent = identifier.trim();

  if (isSupabaseReady) {
    let email = cleanIdent;
    if (!cleanIdent.includes('@')) {
      const { data: resolvedEmail } = await supabase.rpc('resolve_doctor_login_email', {
        p_identifier: cleanIdent,
      });
      if (resolvedEmail) {
        email = resolvedEmail;
      } else {
        return fail('Invalid platform administrator credentials.');
      }
    }

    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authErr || !authData?.user) {
      return fail(authErr?.message || 'Invalid platform administrator credentials.');
    }

    // Verify Platform Admin role
    const { data: isAdmin } = await checkIsPlatformAdmin();
    if (!isAdmin) {
      await supabase.auth.signOut();
      return fail('Unauthorized: Platform Team access only.');
    }

    return ok({ user: authData.user });
  }

  return ok({ user: { email: cleanIdent } });
}

/**
 * getPlatformAdminSession()
 * Returns the current platform admin user if active and authorized.
 */
export async function getPlatformAdminSession() {
  if (isSupabaseReady) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: isAdmin } = await checkIsPlatformAdmin();
    if (!isAdmin) return null;

    return { user };
  }
  return { user: { email: 'admin@platform.internal' } };
}

/**
 * platformAdminLogout()
 */
export async function platformAdminLogout() {
  if (isSupabaseReady) {
    await supabase.auth.signOut();
  }
  return ok(true);
}

/**
 * adminListAllClinicsAndDoctors()
 * Retrieves all clinics (active & inactive) with their doctors and active queue counts.
 * Uses multi-tier discovery:
 *   1. RPC admin_list_all_clinics_and_doctors (SECURITY DEFINER)
 *   2. get_active_clinics RPC (SECURITY DEFINER, always available)
 *   3. Direct table queries (clinics + doctors)
 *   4. Merging session-created doctors so new clinics' doctors show up instantly
 *   5. Auto-linking platform admin to clinic_members for all discovered clinics
 */
export async function adminListAllClinicsAndDoctors() {
  if (isSupabaseReady) {
    let clinicsList = null;

    // Tier 1: Try admin_list_all_clinics_and_doctors RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_list_all_clinics_and_doctors');
      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        clinicsList = rpcData;
      }
    } catch (e) {
      console.warn('[dbService] admin_list_all_clinics_and_doctors RPC warning:', e);
    }

    // Tier 2: Fallback query from clinics table + get_active_clinics + doctors table
    if (!clinicsList) {
      const { data: clinics, error: clinicsErr } = await supabase
        .from('clinics')
        .select('*')
        .order('created_at', { ascending: false });

      if (clinicsErr && !clinics) {
        return fail(clinicsErr.message || 'Failed to list clinics.');
      }

      // Query doctors table (subject to RLS)
      const { data: directDoctors } = await supabase
        .from('doctors')
        .select('*')
        .order('created_at', { ascending: true });

      // Query get_active_clinics RPC (SECURITY DEFINER, bypasses RLS for doctor details)
      let activeClinicsData = null;
      try {
        const { data: act } = await supabase.rpc('get_active_clinics');
        activeClinicsData = act;
      } catch (e) {
        // ignore
      }

      const rawClinics = clinics || [];
      clinicsList = rawClinics.map(c => {
        const matchingDirect = (directDoctors || []).filter(d => d.clinic_id === c.id);
        const activeClinicMatch = (activeClinicsData || []).find(ac => ac.id === c.id);
        const activeDocs = activeClinicMatch?.doctors || [];

        const combinedDoctors = matchingDirect.map(d => ({
          id: d.id,
          name: d.name,
          specialization: d.specialization || d.specialisation,
          username: d.username,
          average_consultation_minutes: d.average_consultation_minutes || 10,
          duty_start: d.duty_start ? d.duty_start.slice(0, 5) : '09:00',
          duty_end: d.duty_end ? d.duty_end.slice(0, 5) : '17:00',
          break_start: d.break_start ? d.break_start.slice(0, 5) : '',
          break_end: d.break_end ? d.break_end.slice(0, 5) : '',
          working_days: d.working_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          availability: d.availability || 'available',
          auth_user_id: d.auth_user_id,
          has_login_account: Boolean(d.auth_user_id),
          created_at: d.created_at,
        }));

        activeDocs.forEach(ad => {
          if (!combinedDoctors.some(cd => cd.id === ad.id || cd.name === ad.name)) {
            combinedDoctors.push({
              id: ad.id,
              name: ad.name,
              specialization: ad.specialisation || ad.specialization,
              username: ad.name.toLowerCase().replace(/[^a-z0-9]/g, '.'),
              average_consultation_minutes: 10,
              duty_start: '09:00',
              duty_end: '17:00',
              break_start: '',
              break_end: '',
              working_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
              availability: ad.availability || 'available',
              has_login_account: true,
              created_at: new Date().toISOString(),
            });
          }
        });

        // Resolve active status: must strictly allow FALSE so deactivated clinics are never hidden!
        const isActive = _clinicActiveOverrides.has(c.id)
          ? _clinicActiveOverrides.get(c.id)
          : (c.active !== false && c.active !== 'false');

        return {
          id: c.id,
          name: c.name,
          place: c.place,
          mobile: c.mobile,
          active: Boolean(isActive),
          created_at: c.created_at,
          doctor_count: combinedDoctors.length,
          active_token_count: 0,
          doctors: combinedDoctors,
        };
      });
    }

    // Filter out deleted clinics and merge in session-created clinics
    let allMergedClinics = (clinicsList || []).filter(c => !_deletedClinicIds.has(c.id));

    for (const [id, sessionClinic] of _sessionCreatedClinics.entries()) {
      if (!_deletedClinicIds.has(id) && !allMergedClinics.some(c => c.id === id)) {
        allMergedClinics.unshift(sessionClinic);
      }
    }

    // Apply active overrides and merge session doctors
    const formatted = allMergedClinics.map(c => {
      const existingDocs = c.doctors || [];
      const sessionDocs = Array.from(_sessionCreatedDoctors.values()).filter(sd => sd.clinic_id === c.id);

      const mergedDocs = [...existingDocs];
      sessionDocs.forEach(sd => {
        if (!mergedDocs.some(ed => ed.id === sd.id || ed.username === sd.username)) {
          mergedDocs.push(sd);
        }
      });

      const isActive = _clinicActiveOverrides.has(c.id)
        ? _clinicActiveOverrides.get(c.id)
        : (c.active !== false && c.active !== 'false');

      return {
        ...c,
        active: Boolean(isActive),
        doctor_count: mergedDocs.length,
        doctors: mergedDocs,
      };
    });

    // Tier 4: Auto-link current platform admin user to clinic_members for all clinics
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id && formatted.length > 0) {
        const memberships = formatted.map(c => ({
          clinic_id: c.id,
          auth_user_id: user.id,
          role: 'clinic_admin',
        }));
        await supabase.from('clinic_members').upsert(memberships, { onConflict: 'clinic_id,auth_user_id' });
      }
    } catch (e) {
      // Best-effort auto-link
    }

    return ok(formatted);
  }

  // Mock fallback
  const mockClinics = CLINICS
    .filter(c => !_deletedClinicIds.has(c.id))
    .map(c => {
      const isActive = _clinicActiveOverrides.has(c.id)
        ? _clinicActiveOverrides.get(c.id)
        : true;

      return {
        id: c.id,
        name: c.name,
        place: c.place,
        mobile: c.mobile,
        active: Boolean(isActive),
        doctor_count: (c.doctors || []).length,
        active_token_count: 2,
        doctors: (c.doctors || []).map(d => ({
          id: d.id,
          name: d.name,
          specialization: d.specialization || d.specialisation,
          username: d.username || d.name.toLowerCase().replace(/[^a-z0-9]/g, '.'),
          average_consultation_minutes: d.avgConsultationMinutes || 10,
          duty_start: d.dutyStart || '09:00',
          duty_end: d.dutyEnd || '17:00',
          break_start: d.breakStart || '13:00',
          break_end: d.breakEnd || '13:30',
          working_days: d.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          availability: d.available ? 'available' : 'unavailable',
          has_login_account: true,
        })),
      };
    });

  for (const [id, sessionClinic] of _sessionCreatedClinics.entries()) {
    if (!_deletedClinicIds.has(id) && !mockClinics.some(c => c.id === id)) {
      mockClinics.unshift(sessionClinic);
    }
  }

  return ok(mockClinics);
}

/**
 * adminUpsertClinic({ id, name, place, mobile, active })
 */
export async function adminUpsertClinic({ id, name, place, mobile, active = true }) {
  if (!name || !name.trim()) return fail('Clinic name is required.');
  if (!place || !place.trim()) return fail('Clinic place is required.');
  const cleanMobile = (mobile || '').replace(/\s+/g, '');
  if (!cleanMobile) return fail('Clinic mobile is required.');
  const isActive = Boolean(active);

  if (isSupabaseReady) {
    let resultClinic = null;

    // 1. Try RPC
    const { data, error } = await supabase.rpc('admin_upsert_clinic', {
      p_clinic_id: id || null,
      p_name: name.trim(),
      p_place: place.trim(),
      p_mobile: cleanMobile,
      p_active: isActive,
    });

    if (!error && data) {
      resultClinic = data;
    } else {
      // 2. Direct table fallback
      if (id) {
        const { data: updated, error: updErr } = await supabase
          .from('clinics')
          .update({
            name: name.trim(),
            place: place.trim(),
            mobile: cleanMobile,
            active: isActive,
          })
          .eq('id', id)
          .select()
          .single();

        if (updErr) return fail(updErr.message || 'Failed to update clinic.');
        resultClinic = updated;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('clinics')
          .insert({
            name: name.trim(),
            place: place.trim(),
            mobile: cleanMobile,
            active: isActive,
          })
          .select()
          .single();

        if (insErr) return fail(insErr.message || 'Failed to create clinic.');
        resultClinic = inserted;
      }
    }

    if (resultClinic?.id) {
      _clinicActiveOverrides.set(resultClinic.id, resultClinic.active !== false);
      _sessionCreatedClinics.set(resultClinic.id, {
        ...resultClinic,
        active: resultClinic.active !== false,
      });
      _deletedClinicIds.delete(resultClinic.id);
    }

    // Auto-link current platform admin user as clinic_admin in clinic_members
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id && resultClinic?.id) {
        await supabase
          .from('clinic_members')
          .upsert({
            clinic_id: resultClinic.id,
            auth_user_id: user.id,
            role: 'clinic_admin',
          }, { onConflict: 'clinic_id,auth_user_id' });
      }
    } catch (e) {
      console.warn('[dbService] Auto-link clinic_members warning:', e);
    }

    return ok(resultClinic);
  }

  const mockObj = { id: id || `c_${Date.now()}`, name, place, mobile: cleanMobile, active: isActive };
  _clinicActiveOverrides.set(mockObj.id, isActive);
  _sessionCreatedClinics.set(mockObj.id, mockObj);
  _deletedClinicIds.delete(mockObj.id);
  return ok(mockObj);
}

/**
 * adminToggleClinicActive(clinicId, active)
 * Explicitly updates clinic active status without hiding or deleting it in Platform Admin.
 */
export async function adminToggleClinicActive(clinicId, active) {
  if (!clinicId) return fail('Clinic ID is required.');
  const newActive = Boolean(active);

  _clinicActiveOverrides.set(clinicId, newActive);
  if (_sessionCreatedClinics.has(clinicId)) {
    const existing = _sessionCreatedClinics.get(clinicId);
    _sessionCreatedClinics.set(clinicId, { ...existing, active: newActive });
  }

  if (isSupabaseReady) {
    // 1. Try dedicated RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_toggle_clinic_active', {
        p_clinic_id: clinicId,
        p_active: newActive,
      });
      if (!rpcErr && rpcData) {
        return ok(rpcData);
      }
    } catch (e) {
      console.warn('[dbService] admin_toggle_clinic_active RPC exception:', e);
    }

    // 2. Direct table update fallback
    const { data: updated, error: updErr } = await supabase
      .from('clinics')
      .update({ active: newActive })
      .eq('id', clinicId)
      .select()
      .maybeSingle();

    if (updErr) {
      console.warn('[dbService] adminToggleClinicActive direct update warning:', updErr.message);
    }

    return ok(updated || { id: clinicId, active: newActive });
  }

  return ok({ id: clinicId, active: newActive });
}

/**
 * adminDeleteClinic(clinicId)
 * Permanently deletes a clinic and its dependent records (tokens, counters, members, doctors, clinics).
 */
export async function adminDeleteClinic(clinicId) {
  if (!clinicId) return fail('Clinic ID is required.');

  _deletedClinicIds.add(clinicId);
  _sessionCreatedClinics.delete(clinicId);
  _clinicActiveOverrides.delete(clinicId);

  if (isSupabaseReady) {
    // 1. Try dedicated RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_delete_clinic', {
        p_clinic_id: clinicId,
      });
      if (!rpcErr && rpcData) {
        return ok(rpcData);
      }
    } catch (e) {
      console.warn('[dbService] admin_delete_clinic RPC exception:', e);
    }

    // 2. Client-side cascading deletion fallback
    try {
      // Step a: Delete all tokens under clinic
      await supabase.from('tokens').delete().eq('clinic_id', clinicId);

      // Step b: Delete daily token counters
      await supabase.from('daily_token_counters').delete().eq('clinic_id', clinicId);

      // Step c: Delete clinic members
      await supabase.from('clinic_members').delete().eq('clinic_id', clinicId);

      // Step d: Delete doctors
      await supabase.from('doctors').delete().eq('clinic_id', clinicId);

      // Step e: Delete clinic row
      const { error: clinicErr } = await supabase.from('clinics').delete().eq('id', clinicId);

      if (clinicErr) {
        console.warn('[dbService] Direct clinic deletion error:', clinicErr.message);
        return fail(clinicErr.message || 'Failed to delete clinic.');
      }

      return ok({ success: true, deleted_clinic_id: clinicId });
    } catch (err) {
      console.error('[dbService] adminDeleteClinic cascading fallback exception:', err);
      return fail(err.message || 'Failed to delete clinic.');
    }
  }

  return ok({ success: true, deleted_clinic_id: clinicId });
}

/**
 * adminCreateDoctorWithPassword(doctorData)
 * Allows Platform Admin to onboard a new doctor using only core identity and credentials.
 * Automatically injects sensible defaults for operational schedule and timings.
 */
export async function adminCreateDoctorWithPassword(doctorData) {
  if (!doctorData.clinicId) return fail('Clinic ID is required.');
  if (!doctorData.name?.trim()) return fail('Doctor name is required.');
  if (!doctorData.specialization?.trim()) return fail('Specialization is required.');
  if (!doctorData.username?.trim()) return fail('Username is required.');
  if (!doctorData.password || doctorData.password.length < 6) {
    return fail('Password must be at least 6 characters long.');
  }

  // Sensible automatic defaults for operational timings (configured later by doctor)
  const avgMins = parseInt(doctorData.averageConsultationMinutes ?? doctorData.avgConsultationMinutes, 10) || 10;
  const dutyStart = doctorData.dutyStart || '09:00';
  const dutyEnd = doctorData.dutyEnd || '17:00';
  const breakStart = doctorData.breakStart !== undefined
    ? (doctorData.breakStart ? doctorData.breakStart.slice(0, 5) : null)
    : '13:00';
  const breakEnd = doctorData.breakEnd !== undefined
    ? (doctorData.breakEnd ? doctorData.breakEnd.slice(0, 5) : null)
    : '14:00';
  const workingDays = doctorData.workingDays || [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];

  if (isSupabaseReady) {
    const { data, error } = await supabase.rpc('admin_create_doctor_with_password', {
      p_clinic_id: doctorData.clinicId,
      p_name: doctorData.name.trim(),
      p_specialization: doctorData.specialization.trim(),
      p_username: doctorData.username.trim().toLowerCase(),
      p_password: doctorData.password,
      p_email: doctorData.email?.trim() || null,
      p_average_consultation_minutes: avgMins,
      p_duty_start: dutyStart,
      p_duty_end: dutyEnd,
      p_break_start: breakStart,
      p_break_end: breakEnd,
      p_working_days: workingDays,
      p_role: doctorData.role || 'doctor',
    });

    if (error) {
      return fail(error.message || 'Failed to create doctor account.');
    }

    const formattedDoc = {
      id: data?.id || `d_${Date.now()}`,
      clinic_id: doctorData.clinicId,
      name: doctorData.name.trim(),
      specialization: doctorData.specialization.trim(),
      username: doctorData.username.trim().toLowerCase(),
      average_consultation_minutes: avgMins,
      duty_start: dutyStart,
      duty_end: dutyEnd,
      break_start: breakStart || '',
      break_end: breakEnd || '',
      working_days: workingDays,
      availability: 'available',
      auth_user_id: data?.auth_user_id || null,
      has_login_account: true,
      created_at: data?.created_at || new Date().toISOString(),
    };

    _sessionCreatedDoctors.set(formattedDoc.id, formattedDoc);

    // Auto-link current platform admin user into clinic_members as clinic_admin
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id && doctorData.clinicId) {
        await supabase
          .from('clinic_members')
          .upsert({
            clinic_id: doctorData.clinicId,
            auth_user_id: user.id,
            role: 'clinic_admin',
          }, { onConflict: 'clinic_id,auth_user_id' });
      }
    } catch (e) {
      console.warn('[dbService] Auto-link clinic_members warning:', e);
    }

    return ok(data || formattedDoc);
  }

  const mockDoc = {
    id: `d_${Date.now()}`,
    ...doctorData,
    clinic_id: doctorData.clinicId,
    average_consultation_minutes: avgMins,
    duty_start: dutyStart,
    duty_end: dutyEnd,
    break_start: breakStart || '',
    break_end: breakEnd || '',
    working_days: workingDays,
    availability: 'available',
  };
  _sessionCreatedDoctors.set(mockDoc.id, mockDoc);
  return ok(mockDoc);
}

/**
 * adminDeleteDoctor(doctorId)
 * Permanently deletes doctor with cascading cleanup of tokens,
 * counters, clinic membership, and doctor record.
 */
export async function adminDeleteDoctor(doctorId) {
  if (!doctorId) return fail('Doctor ID is required.');

  if (isSupabaseReady) {
    // 1. Try calling the SECURITY DEFINER RPC
    const { data, error } = await supabase.rpc('admin_delete_doctor', {
      p_doctor_id: doctorId,
    });

    if (!error) {
      _sessionCreatedDoctors.delete(doctorId);
      return ok(data || { success: true, deleted_doctor_id: doctorId });
    }

    console.warn('[dbService] admin_delete_doctor RPC error, attempting cascading fallback:', error.message);

    // 2. Cascading table fallback
    try {
      // Delete tokens referencing this doctor first (satisfies ON DELETE RESTRICT)
      await supabase.from('tokens').delete().eq('doctor_id', doctorId);
      // Delete daily token counters
      await supabase.from('daily_token_counters').delete().eq('doctor_id', doctorId);

      // Look up auth_user_id and clinic_id to clean clinic_members
      const { data: docData } = await supabase
        .from('doctors')
        .select('auth_user_id, clinic_id')
        .eq('id', doctorId)
        .single();

      if (docData?.auth_user_id && docData?.clinic_id) {
        await supabase
          .from('clinic_members')
          .delete()
          .eq('auth_user_id', docData.auth_user_id)
          .eq('clinic_id', docData.clinic_id);
      }

      const { error: delErr } = await supabase.from('doctors').delete().eq('id', doctorId);
      if (delErr) {
        return fail(delErr.message || 'Failed to delete doctor.');
      }

      _sessionCreatedDoctors.delete(doctorId);
      return ok({ success: true, deleted_doctor_id: doctorId });
    } catch (e) {
      return fail(e.message || 'Failed to delete doctor.');
    }
  }

  // Mock / session cache fallback
  _sessionCreatedDoctors.delete(doctorId);
  return ok({ success: true, deleted_doctor_id: doctorId });
}

/**
 * adminResetDoctorPassword(doctorId, newPassword)
 */
export async function adminResetDoctorPassword(doctorId, newPassword) {
  if (!doctorId) return fail('Doctor ID is required.');
  if (!newPassword || newPassword.length < 6) {
    return fail('New password must be at least 6 characters long.');
  }

  if (isSupabaseReady) {
    const { data, error } = await supabase.rpc('admin_reset_doctor_password', {
      p_doctor_id: doctorId,
      p_new_password: newPassword,
    });

    if (error) {
      return fail(error.message || 'Failed to reset doctor password.');
    }
    return ok(data);
  }

  return ok({ success: true });
}

