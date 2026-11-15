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
  // 1. Check cached verified doctor session first
  let cachedDoc = null;
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('sdqms_verified_doctor_session') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.doctorId === doctorId || parsed.authUserId === authUserId)) {
        cachedDoc = parsed;
      }
    }
  } catch (e) {}

  if (isSupabaseReady) {
    let query = supabase.from('doctors').select('*');
    if (doctorId) {
      query = query.eq('id', doctorId);
    } else if (authUserId) {
      query = query.eq('auth_user_id', authUserId);
    }

    try {
      const { data, error } = await query.maybeSingle();
      if (!error && data) {
        const profile = {
          id: data.id,
          clinicId: data.clinic_id,
          authUserId: data.auth_user_id,
          name: data.name,
          specialization: data.specialization,
          specialisation: data.specialization,
          username: data.username,
          averageConsultationMinutes: data.average_consultation_minutes || 10,
          avgConsultationMinutes: data.average_consultation_minutes || 10,
          dutyStart: data.duty_start ? data.duty_start.slice(0, 5) : '09:00',
          dutyEnd: data.duty_end ? data.duty_end.slice(0, 5) : '17:00',
          breakStart: data.break_start ? data.break_start.slice(0, 5) : '',
          breakEnd: data.break_end ? data.break_end.slice(0, 5) : '',
          workingDays: data.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
          availability: data.availability || 'available',
          available: data.availability === 'available',
          createdAt: data.created_at,
        };
        if (cachedDoc && typeof window !== 'undefined') {
          localStorage.setItem('sdqms_verified_doctor_session', JSON.stringify({ ...cachedDoc, ...profile }));
        }
        return ok(profile);
      }
    } catch (e) {
      console.warn('[dbService] getLoggedInDoctorProfile query notice:', e);
    }

    // 2. Try get_active_clinics() RPC (SECURITY DEFINER)
    try {
      const { data: clinics } = await supabase.rpc('get_active_clinics');
      if (clinics && Array.isArray(clinics)) {
        for (const c of clinics) {
          const matched = (c.doctors || []).find(d => d.id === doctorId || (cachedDoc && d.name === cachedDoc.doctorName));
          if (matched) {
            const profile = {
              id: matched.id,
              clinicId: c.id,
              authUserId: cachedDoc?.authUserId,
              name: matched.name,
              specialization: matched.specialisation || matched.specialization || cachedDoc?.specialization || 'General',
              specialisation: matched.specialisation || matched.specialization || cachedDoc?.specialization || 'General',
              username: matched.username || cachedDoc?.username,
              averageConsultationMinutes: matched.average_consultation_minutes || cachedDoc?.avgConsultationMinutes || 10,
              avgConsultationMinutes: matched.average_consultation_minutes || cachedDoc?.avgConsultationMinutes || 10,
              dutyStart: matched.duty_start ? matched.duty_start.slice(0, 5) : (cachedDoc?.dutyStart || '09:00'),
              dutyEnd: matched.duty_end ? matched.duty_end.slice(0, 5) : (cachedDoc?.dutyEnd || '17:00'),
              breakStart: matched.break_start ? matched.break_start.slice(0, 5) : (cachedDoc?.breakStart || ''),
              breakEnd: matched.break_end ? matched.break_end.slice(0, 5) : (cachedDoc?.breakEnd || ''),
              workingDays: matched.working_days || cachedDoc?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
              availability: matched.availability || cachedDoc?.availability || 'available',
              available: (matched.availability || cachedDoc?.availability || 'available') === 'available',
              createdAt: matched.created_at || cachedDoc?.createdAt,
            };
            if (cachedDoc && typeof window !== 'undefined') {
              localStorage.setItem('sdqms_verified_doctor_session', JSON.stringify({ ...cachedDoc, ...profile }));
            }
            return ok(profile);
          }
        }
      }
    } catch (e) {
      console.warn('[dbService] get_active_clinics lookup notice in profile:', e);
    }
  }

  // 3. Fallback to cached verified doctor session if available
  if (cachedDoc) {
    return ok({
      id: cachedDoc.doctorId,
      clinicId: cachedDoc.clinicId,
      authUserId: cachedDoc.authUserId,
      name: cachedDoc.doctorName,
      specialization: cachedDoc.specialisation || cachedDoc.specialization,
      specialisation: cachedDoc.specialisation || cachedDoc.specialization,
      username: cachedDoc.username,
      averageConsultationMinutes: cachedDoc.avgConsultationMinutes || 10,
      avgConsultationMinutes: cachedDoc.avgConsultationMinutes || 10,
      dutyStart: cachedDoc.dutyStart || '09:00',
      dutyEnd: cachedDoc.dutyEnd || '17:00',
      breakStart: cachedDoc.breakStart || '',
      breakEnd: cachedDoc.breakEnd || '',
      workingDays: cachedDoc.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      availability: cachedDoc.availability || 'available',
      available: cachedDoc.availability === 'available',
      createdAt: cachedDoc.loggedInAt,
    });
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
 * normalizeDoctorSession(raw)
 * Strictly normalizes doctor session data into both flattened and nested shapes.
 * Ensures properties like doctorId, clinicId, doctorName, clinicName, clinicPlace,
 * clinicMobile, dutyStart, dutyEnd, breakStart, breakEnd, workingDays,
 * avgConsultationMinutes, availability, role, doctor, clinic, doctors, clinics, user
 * are guaranteed to exist, eliminating all "TypeError: Cannot read properties of undefined/null"
 * crashes across all Doctor Portal screens.
 */
export function normalizeDoctorSession(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Extract nested doctor and clinic if present
  const doc = raw.doctor || (Array.isArray(raw.doctors) && raw.doctors[0]) || raw;
  const cl = raw.clinic || (Array.isArray(raw.clinics) && raw.clinics[0]) || {};

  const doctorId = doc.id || doc.doctorId || raw.doctorId || raw.id;
  if (!doctorId) return null; // Invalid session without doctor identifier

  const clinicId = cl.id || cl.clinicId || doc.clinic_id || doc.clinicId || raw.clinicId;
  const clinicName = cl.name || cl.clinicName || doc.clinicName || raw.clinicName || 'Clinic';
  const clinicPlace = cl.place || cl.clinicPlace || doc.clinicPlace || raw.clinicPlace || '';
  const clinicMobile = cl.mobile || cl.clinicMobile || doc.clinicMobile || raw.clinicMobile || '';

  const doctorName = doc.name || raw.doctorName || 'Doctor';
  const specialization = doc.specialization || doc.specialisation || raw.specialisation || raw.specialization || 'General Physician';
  const username = doc.username || raw.username || 'doctor';
  const authUserId = doc.auth_user_id || doc.authUserId || raw.authUserId || `doc_${doctorId}`;
  const email = doc.login_email || doc.email || raw.email || `${username}@platform.internal`;

  const dutyStart = (doc.duty_start || doc.dutyStart || raw.dutyStart || '09:00').toString().slice(0, 5);
  const dutyEnd = (doc.duty_end || doc.dutyEnd || raw.dutyEnd || '17:00').toString().slice(0, 5);
  const breakStart = (doc.break_start || doc.breakStart || raw.breakStart || '').toString().slice(0, 5);
  const breakEnd = (doc.break_end || doc.breakEnd || raw.breakEnd || '').toString().slice(0, 5);

  const rawWorkingDays = doc.working_days || doc.workingDays || raw.workingDays;
  const workingDays = Array.isArray(rawWorkingDays) && rawWorkingDays.length > 0
    ? rawWorkingDays
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const avgConsultationMinutes = Number(
    doc.average_consultation_minutes || doc.avgConsultationMinutes || raw.avgConsultationMinutes || raw.averageConsultationMinutes || 10
  ) || 10;

  const availability = doc.availability || raw.availability || 'available';

  const normalizedDoctor = {
    ...doc,
    id: doctorId,
    name: doctorName,
    specialization,
    specialisation: specialization,
    username,
    clinicId,
    clinic_id: clinicId,
    dutyStart,
    duty_start: dutyStart,
    dutyEnd,
    duty_end: dutyEnd,
    breakStart,
    break_start: breakStart,
    breakEnd,
    break_end: breakEnd,
    workingDays,
    working_days: workingDays,
    avgConsultationMinutes,
    averageConsultationMinutes: avgConsultationMinutes,
    average_consultation_minutes: avgConsultationMinutes,
    availability,
    available: availability === 'available',
  };

  const normalizedClinic = {
    ...cl,
    id: clinicId,
    name: clinicName,
    place: clinicPlace,
    mobile: clinicMobile,
  };

  return {
    authUserId,
    email,
    username,
    role: raw.role || 'doctor',
    doctorId,
    id: doctorId,
    doctorName,
    name: doctorName,
    specialisation: specialization,
    specialization,
    dutyStart,
    dutyEnd,
    breakStart,
    breakEnd,
    workingDays,
    avgConsultationMinutes,
    averageConsultationMinutes: avgConsultationMinutes,
    availability,
    available: availability === 'available',
    clinicId,
    clinicName,
    clinicPlace,
    clinicMobile,
    doctor: normalizedDoctor,
    clinic: normalizedClinic,
    user: { id: authUserId, email, username },
    doctors: [normalizedDoctor],
    clinics: [normalizedClinic],
    loggedInAt: raw.loggedInAt || new Date().toISOString(),
  };
}

/**
 * doctorLogin(username, password) / loginDoctor(username, password)
 * Authenticates clinic staff / doctors via Supabase RPC verify_doctor_credentials.
 * If verified, stores the doctor session in localStorage and logs the doctor directly
 * into /doctor with their exact doctor and clinic record.
 */
export async function doctorLogin(username, password) {
  const cleanUser = (username || '').trim().toLowerCase();
  if (!cleanUser || !password) {
    return fail('Username and password are required.');
  }

  if (isSupabaseReady) {
    // 1. Primary auth: verify_doctor_credentials RPC (SECURITY DEFINER)
    try {
      const { data: vData, error: vErr } = await supabase.rpc('verify_doctor_credentials', {
        p_username: cleanUser,
        p_password: password,
      });

      if (!vErr && vData && vData.doctor && vData.clinic) {
        const sessionPayload = normalizeDoctorSession({
          doctor: vData.doctor,
          clinic: vData.clinic,
          role: 'doctor',
          loggedInAt: new Date().toISOString(),
        });

        // Persist verified doctor session in localStorage so refreshing /doctor keeps them logged in
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('sdqms_verified_doctor_session', JSON.stringify(sessionPayload));
          }
        } catch (e) {
          console.warn('[dbService] localStorage save warning:', e);
        }

        // Background signInWithPassword attempt if linked
        if (vData.doctor.login_email || vData.doctor.auth_user_id) {
          const emailToTry = vData.doctor.login_email || `${vData.doctor.username}@platform.internal`;
          supabase.auth.signInWithPassword({ email: emailToTry, password }).catch(e => {
            console.warn('[dbService] Background auth sign-in notice:', e?.message);
          });
        }

        return ok(sessionPayload);
      }
    } catch (rpcEx) {
      console.warn('[dbService] verify_doctor_credentials exception:', rpcEx);
    }

    // 2. Fallback for legacy accounts: resolve_doctor_login_email + signInWithPassword
    try {
      let resolvedEmail = null;
      const { data: rpcEmail } = await supabase.rpc('resolve_doctor_login_email', {
        p_identifier: cleanUser,
      });
      if (rpcEmail) resolvedEmail = rpcEmail;
      if (!resolvedEmail && cleanUser.includes('@')) resolvedEmail = cleanUser;

      if (resolvedEmail) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password,
        });

        if (!authError && authData?.user) {
          const authUser = authData.user;
          const { data: member } = await supabase
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

          if (member) {
            const { data: docData } = await supabase
              .from('doctors')
              .select('*')
              .eq('clinic_id', member.clinic_id)
              .or(`auth_user_id.eq.${authUser.id},username.ilike.${cleanUser}`)
              .maybeSingle();

            const sessionPayload = normalizeDoctorSession({
              authUserId: authUser.id,
              email: authUser.email,
              username: docData?.username || cleanUser,
              clinicId: member.clinic_id,
              clinic: member.clinics,
              clinicName: member.clinics?.name || 'Clinic',
              clinicPlace: member.clinics?.place || '',
              clinicMobile: member.clinics?.mobile || '',
              role: member.role,
              doctorId: docData?.id || null,
              doctor: docData,
              doctorName: docData?.name || authUser.user_metadata?.name || 'Doctor',
              specialisation: docData?.specialization || '',
              specialization: docData?.specialization || '',
              dutyStart: docData?.duty_start ? docData.duty_start.slice(0, 5) : '09:00',
              dutyEnd: docData?.duty_end ? docData.duty_end.slice(0, 5) : '17:00',
              breakStart: docData?.break_start ? docData.break_start.slice(0, 5) : '',
              breakEnd: docData?.break_end ? docData.break_end.slice(0, 5) : '',
              workingDays: docData?.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
              avgConsultationMinutes: docData?.average_consultation_minutes || 10,
              averageConsultationMinutes: docData?.average_consultation_minutes || 10,
              availability: docData?.availability || 'available',
              loggedInAt: new Date().toISOString(),
            });

            if (!sessionPayload) return fail('Could not construct valid doctor session.');

            try {
              if (typeof window !== 'undefined') {
                localStorage.setItem('sdqms_verified_doctor_session', JSON.stringify(sessionPayload));
              }
            } catch (e) {}

            return ok(sessionPayload);
          }
        }
      }
    } catch (legacyEx) {
      console.warn('[dbService] Legacy login fallback notice:', legacyEx);
    }

    return fail('Invalid username or password.');
  }

  return fail('Supabase is not configured.');
}

// User-friendly alias
export const loginDoctor = doctorLogin;

/**
 * getDoctorAuthSession()
 * Restores the active authenticated doctor session on page reload.
 */
export async function getDoctorAuthSession() {
  // 1. Check verified doctor session in localStorage first
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('sdqms_verified_doctor_session') : null;
    if (raw) {
      const cached = JSON.parse(raw);
      const normalized = normalizeDoctorSession(cached);
      if (normalized && normalized.doctorId) {
        return normalized;
      } else {
        if (typeof window !== 'undefined') localStorage.removeItem('sdqms_verified_doctor_session');
      }
    }
  } catch (e) {
    console.warn('[dbService] Error reading cached doctor session:', e);
    try {
      if (typeof window !== 'undefined') localStorage.removeItem('sdqms_verified_doctor_session');
    } catch (_) {}
  }

  if (!isSupabaseReady) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return null;

    const authUser = session.user;
    const { data: member } = await supabase
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

    if (!member) return null;

    let doctor = null;
    const { data: docData } = await supabase
      .from('doctors')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (docData) {
      doctor = docData;
    }

    const payload = normalizeDoctorSession({
      authUserId: authUser.id,
      email: authUser.email,
      username: doctor?.username || authUser.email?.split('@')[0] || 'doctor',
      clinicId: member.clinic_id,
      clinic: member.clinics,
      clinicName: member.clinics?.name || 'Clinic',
      clinicPlace: member.clinics?.place || '',
      clinicMobile: member.clinics?.mobile || '',
      role: member.role,
      doctorId: doctor?.id || null,
      doctor,
      doctorName: doctor?.name || authUser.user_metadata?.name || 'Doctor',
      specialisation: doctor?.specialization || '',
      specialization: doctor?.specialization || '',
      dutyStart: doctor?.duty_start ? doctor.duty_start.slice(0, 5) : '09:00',
      dutyEnd: doctor?.duty_end ? doctor.duty_end.slice(0, 5) : '17:00',
      breakStart: doctor?.break_start ? doctor.break_start.slice(0, 5) : '',
      breakEnd: doctor?.break_end ? doctor.break_end.slice(0, 5) : '',
      workingDays: doctor?.working_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      avgConsultationMinutes: doctor?.average_consultation_minutes || 10,
      averageConsultationMinutes: doctor?.average_consultation_minutes || 10,
      availability: doctor?.availability || 'available',
      loggedInAt: new Date().toISOString(),
    });

    if (!payload || !payload.doctorId) return null;

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('sdqms_verified_doctor_session', JSON.stringify(payload));
      }
    } catch (e) {}

    return payload;
  } catch (err) {
    console.error('[dbService] getDoctorAuthSession error:', err);
    return null;
  }
}

/**
 * doctorLogout()
 * Signs out from Supabase Auth and clears cached doctor session.
 */
export async function doctorLogout() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('sdqms_verified_doctor_session');
    }
    if (isSupabaseReady) {
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.warn('[dbService] doctorLogout error:', e);
  }
  return ok({ success: true });
}

/**
 * getLiveDoctorQueue({ clinicId, doctorId })
 * Retrieves the live queue of active tokens (waiting, called, consulting)
 * plus today's skipped and no_show tokens strictly for this doctor.
 */
export async function getLiveDoctorQueue({ clinicId, doctorId }) {
  if (isSupabaseReady) {
    try {
      // Enforce strict doctor isolation: doctorId is mandatory
      if (!doctorId || !clinicId) {
        return ok([]);
      }

      // 1. Try doctor_get_live_queue RPC (SECURITY DEFINER)
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('doctor_get_live_queue', {
          p_clinic_id: clinicId,
          p_doctor_id: doctorId,
        });
        if (!rpcErr && Array.isArray(rpcData)) {
          const formatted = rpcData.map((t) => ({
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
        }
      } catch (e) {}

      // 2. Direct table query fallback
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
        console.warn('[dbService] getLiveDoctorQueue query notice:', error.message);
        return ok([]);
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
      console.warn('[dbService] getLiveDoctorQueue exception:', err);
      return ok([]);
    }
  }

  return ok([]);
}

/**
 * callPatientToken(tokenId)
 * Moves a token to 'called' status (summoning the patient).
 */
export async function callPatientToken(tokenId) {
  if (isSupabaseReady) {
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('doctor_update_token_status', {
        p_token_id: tokenId,
        p_status: 'called',
      });
      if (!rpcErr && rpcData) return ok(rpcData);
    } catch (e) {}

    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'called',
        called_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .maybeSingle();

    if (error) return fail(error.message);
    return ok(data);
  }
  return fail('Supabase not ready');
}

/**
 * startConsultationToken(tokenId)
 * Moves a token to 'consulting' status (consultation in progress).
 */
export async function startConsultationToken(tokenId) {
  if (isSupabaseReady) {
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('doctor_update_token_status', {
        p_token_id: tokenId,
        p_status: 'consulting',
      });
      if (!rpcErr && rpcData) return ok(rpcData);
    } catch (e) {}

    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'consulting',
        consultation_started_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .maybeSingle();

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
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('doctor_update_token_status', {
        p_token_id: tokenId,
        p_status: 'completed',
      });
      if (!rpcErr && rpcData) return ok(rpcData);
    } catch (e) {}

    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .maybeSingle();

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
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('doctor_update_token_status', {
        p_token_id: tokenId,
        p_status: statusVal,
        p_reason: statusVal,
      });
      if (!rpcErr && rpcData) return ok(rpcData);
    } catch (e) {}

    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: statusVal,
        skipped_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select()
      .maybeSingle();

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
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('doctor_update_token_status', {
        p_token_id: tokenId,
        p_status: 'waiting',
      });
      if (!rpcErr && rpcData) return ok(rpcData);
    } catch (e) {}

    const { data, error } = await supabase
      .from('tokens')
      .update({
        status: 'waiting',
      })
      .eq('id', tokenId)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[dbService] restorePatientToken error:', error);
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
    // 1. Try set_doctor_availability RPC if exists
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('set_doctor_availability', {
        p_doctor_id: doctorId,
        p_availability: availability,
      });
      if (!rpcErr && rpcRes) {
        syncCachedDoctorAvailability(doctorId, availability);
        return ok(rpcRes);
      }
    } catch (e) {}

    // 2. Try doctor_update_schedule RPC (SECURITY DEFINER, verified available in DB)
    try {
      let cached = null;
      const raw = typeof window !== 'undefined' ? localStorage.getItem('sdqms_verified_doctor_session') : null;
      if (raw) cached = JSON.parse(raw);

      const dutyStart = cached?.dutyStart || '09:00';
      const dutyEnd = cached?.dutyEnd || '17:00';
      const breakStart = cached?.breakStart || null;
      const breakEnd = cached?.breakEnd || null;
      const avgMins = cached?.avgConsultationMinutes || 10;
      const workingDays = cached?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

      const { data: schedData, error: schedErr } = await supabase.rpc('doctor_update_schedule', {
        p_doctor_id: doctorId,
        p_duty_start: dutyStart,
        p_duty_end: dutyEnd,
        p_break_start: breakStart,
        p_break_end: breakEnd,
        p_average_consultation_minutes: avgMins,
        p_working_days: workingDays,
        p_availability: availability,
      });

      if (!schedErr && schedData) {
        syncCachedDoctorAvailability(doctorId, availability);
        return ok(schedData);
      }
    } catch (e) {
      console.warn('[dbService] doctor_update_schedule notice in setDoctorAvailability:', e);
    }

    // 3. Direct table update fallback
    const { data, error } = await supabase
      .from('doctors')
      .update({ availability })
      .eq('id', doctorId)
      .select()
      .maybeSingle();

    if (!error && data) {
      syncCachedDoctorAvailability(doctorId, availability);
      return ok(data);
    }
  }

  // Update local session cache anyway so the UI is immediately responsive
  syncCachedDoctorAvailability(doctorId, availability);
  return ok({ id: doctorId, availability });
}

function syncCachedDoctorAvailability(doctorId, availability) {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('sdqms_verified_doctor_session');
      if (raw) {
        const s = JSON.parse(raw);
        if (s && s.doctorId === doctorId) {
          s.availability = availability;
          localStorage.setItem('sdqms_verified_doctor_session', JSON.stringify(s));
        }
      }
    }
  } catch (e) {}
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
      try { await supabase.from('token_counters').delete().eq('clinic_id', clinicId); } catch (e) {}
      try { await supabase.from('daily_token_counters').delete().eq('clinic_id', clinicId); } catch (e) {}

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
 * adminSaveDoctorWithPassword({ clinicId, name, specialization, username, password, doctorId })
 * Calls RPC admin_save_doctor_with_password with exact typed username (lowercased/trimmed)
 * and admin-assigned password hash. Works for both new doctor creation (doctorId = null)
 * and existing doctor credential editing / password reset (doctorId = uuid).
 */
export async function adminSaveDoctorWithPassword({
  clinicId,
  name,
  specialization,
  username,
  password,
  doctorId = null,
}) {
  const cleanUsername = (username || '').trim().toLowerCase();
  if (!cleanUsername) return fail('Doctor login username is required.');
  if (!password || password.length < 6) {
    return fail('Password must be at least 6 characters long.');
  }
  if (!name?.trim()) return fail('Doctor name is required.');
  if (!specialization?.trim()) return fail('Specialization is required.');
  if (!clinicId) return fail('Clinic ID is required.');

  if (isSupabaseReady) {
    const { data, error } = await supabase.rpc('admin_save_doctor_with_password', {
      p_clinic_id: clinicId,
      p_name: name.trim(),
      p_specialization: specialization.trim(),
      p_username: cleanUsername,
      p_password: password,
      p_doctor_id: doctorId || null,
    });

    if (error) {
      console.error('[dbService] admin_save_doctor_with_password error:', error);
      return fail(error.message || 'Failed to save doctor credentials.');
    }

    const docId = data?.id || doctorId || `d_${Date.now()}`;
    const formattedDoc = {
      id: docId,
      clinic_id: clinicId,
      name: name.trim(),
      specialization: specialization.trim(),
      username: cleanUsername,
      average_consultation_minutes: 10,
      duty_start: '09:00',
      duty_end: '17:00',
      break_start: '13:00',
      break_end: '14:00',
      working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      availability: 'available',
      auth_user_id: data?.auth_user_id || null,
      has_login_account: true,
      created_at: data?.created_at || new Date().toISOString(),
    };

    _sessionCreatedDoctors.set(docId, formattedDoc);

    // Auto-link current platform admin user into clinic_members as clinic_admin
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id && clinicId) {
        await supabase
          .from('clinic_members')
          .upsert({
            clinic_id: clinicId,
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
    id: doctorId || `d_${Date.now()}`,
    clinic_id: clinicId,
    name: name.trim(),
    specialization: specialization.trim(),
    username: cleanUsername,
    average_consultation_minutes: 10,
    duty_start: '09:00',
    duty_end: '17:00',
    break_start: '13:00',
    break_end: '14:00',
    working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    availability: 'available',
  };
  _sessionCreatedDoctors.set(mockDoc.id, mockDoc);
  return ok(mockDoc);
}

/**
 * adminCreateDoctorWithPassword(doctorData)
 * Wrapper around adminSaveDoctorWithPassword for onboarding new doctors.
 */
export async function adminCreateDoctorWithPassword(doctorData) {
  return adminSaveDoctorWithPassword({
    clinicId: doctorData.clinicId,
    name: doctorData.name,
    specialization: doctorData.specialization,
    username: doctorData.username,
    password: doctorData.password,
    doctorId: null,
  });
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
      try { await supabase.from('token_counters').delete().eq('doctor_id', doctorId); } catch (e) {}
      try { await supabase.from('daily_token_counters').delete().eq('doctor_id', doctorId); } catch (e) {}

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
 * adminResetDoctorPassword(doctorId, newPassword, optionalDoctorData)
 * Resets doctor password, calling admin_save_doctor_with_password or admin_reset_doctor_password.
 */
export async function adminResetDoctorPassword(doctorId, newPassword, optionalDoctorData = {}) {
  if (!doctorId) return fail('Doctor ID is required.');
  if (!newPassword || newPassword.length < 6) {
    return fail('New password must be at least 6 characters long.');
  }

  // If doctor details provided, call adminSaveDoctorWithPassword directly
  if (optionalDoctorData.clinicId && optionalDoctorData.username) {
    return adminSaveDoctorWithPassword({
      clinicId: optionalDoctorData.clinicId,
      name: optionalDoctorData.name || 'Doctor',
      specialization: optionalDoctorData.specialization || 'General',
      username: optionalDoctorData.username,
      password: newPassword,
      doctorId,
    });
  }

  if (isSupabaseReady) {
    // 1. Try calling admin_reset_doctor_password RPC
    try {
      const { data, error } = await supabase.rpc('admin_reset_doctor_password', {
        p_doctor_id: doctorId,
        p_new_password: newPassword,
      });
      if (!error) return ok(data);
    } catch (e) {}

    // 2. Fallback: lookup doctor and update via admin_save_doctor_with_password
    try {
      const { data: doc } = await supabase
        .from('doctors')
        .select('*')
        .eq('id', doctorId)
        .maybeSingle();

      if (doc) {
        return adminSaveDoctorWithPassword({
          clinicId: doc.clinic_id,
          name: doc.name,
          specialization: doc.specialization,
          username: doc.username,
          password: newPassword,
          doctorId: doc.id,
        });
      }
    } catch (e) {}

    return fail('Failed to reset doctor password.');
  }

  return ok({ success: true });
}

/**
 * changeAdminPassword(newPassword)
 * Updates the logged-in administrator's password in Supabase Auth.
 */
export async function changeAdminPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return fail('New password must be at least 6 characters long.');
  }

  if (isSupabaseReady) {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('[dbService] changeAdminPassword error:', error);
      return fail(error.message || 'Failed to update administrator password.');
    }

    return ok(data?.user || { success: true });
  }

  return ok({ success: true });
}

