-- ============================================================================
-- ALLOW BOOKING TOKENS FOR UNAVAILABLE / ON-BREAK DOCTORS & COMPLETE DETAILS
-- File: supabase/allow_booking_unavailable_doctor.sql
-- ============================================================================
-- 1. Updates public.book_token(...) RPC to remove the restriction
--    "AND availability <> 'unavailable'". Patients can now book tokens for any
--    registered doctor in an active clinic even if the doctor is currently
--    'unavailable' or 'on_break'.
-- 2. Returns complete clinic and doctor details (clinic_place, clinic_mobile,
--    doctor_spec, doctor_availability) in the token booking response object.
-- 3. Updates public.check_token_by_mobile(...) to return clinic_place,
--    clinic_mobile, doctor_spec, and doctor_availability.
-- ============================================================================

-- 1. Update book_token RPC (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.book_token(
  p_patient_name TEXT,
  p_mobile       TEXT,
  p_place        TEXT,
  p_clinic_id    UUID,
  p_doctor_id    UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_name         TEXT;
  v_clinic_place        TEXT;
  v_clinic_mobile       TEXT;
  v_doctor_name         TEXT;
  v_doctor_spec         TEXT;
  v_doctor_availability TEXT;
  v_patient_id          UUID;
  v_token_number        TEXT;
  v_token_id            UUID;
BEGIN
  -- ── Validate inputs ─────────────────────────────────────────────────────────
  IF TRIM(p_patient_name) = '' THEN
    RAISE EXCEPTION 'Patient name is required.';
  END IF;

  IF p_mobile !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'Mobile number must be exactly 10 digits.';
  END IF;

  -- ── Validate clinic + doctor ─────────────────────────────────────────────────
  SELECT name, place, mobile INTO v_clinic_name, v_clinic_place, v_clinic_mobile
  FROM public.clinics
  WHERE id = p_clinic_id AND active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found or inactive.';
  END IF;

  -- NOTE: Any registered doctor in this clinic is bookable regardless of current availability
  SELECT name, specialization, availability INTO v_doctor_name, v_doctor_spec, v_doctor_availability
  FROM public.doctors
  WHERE id = p_doctor_id
    AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found in this clinic.';
  END IF;

  -- ── Create patient record (upsert on mobile) ─────────────────────────────────
  INSERT INTO public.patients (name, mobile, place)
  VALUES (TRIM(p_patient_name), p_mobile, COALESCE(TRIM(p_place), ''))
  RETURNING id INTO v_patient_id;

  -- ── Generate race-safe token number ─────────────────────────────────────────
  v_token_number := public.generate_token_number(p_clinic_id, p_doctor_id);

  -- ── Insert the token into waiting queue ─────────────────────────────────────
  INSERT INTO public.tokens (
    token_number, patient_id, clinic_id, doctor_id,
    booking_type, status, booked_at, booked_date
  )
  VALUES (
    v_token_number, v_patient_id, p_clinic_id, p_doctor_id,
    'online', 'waiting', NOW(),
    (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
  )
  RETURNING id INTO v_token_id;

  -- ── Return summary to the patient UI ────────────────────────────────────────
  RETURN JSON_BUILD_OBJECT(
    'id',                  v_token_id,
    'token_number',        v_token_number,
    'clinic_id',           p_clinic_id,
    'clinic_name',         v_clinic_name,
    'clinic_place',        v_clinic_place,
    'clinic_mobile',       v_clinic_mobile,
    'doctor_id',           p_doctor_id,
    'doctor_name',         v_doctor_name,
    'doctor_spec',         v_doctor_spec,
    'doctor_availability', COALESCE(v_doctor_availability, 'available'),
    'booked_at',           NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.book_token(TEXT, TEXT, TEXT, UUID, UUID) IS
  'Anon-callable. Atomically generates queue token for any doctor in active clinic regardless of availability.';

GRANT EXECUTE ON FUNCTION public.book_token(TEXT, TEXT, TEXT, UUID, UUID) TO anon, authenticated;


-- 2. Update check_token_by_mobile RPC to include clinic_place, clinic_mobile, doctor_spec, doctor_availability
CREATE OR REPLACE FUNCTION public.check_token_by_mobile(
  p_mobile TEXT
)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'token_number',        t.token_number,
        'status',              t.status,
        'booking_type',        t.booking_type,
        'booked_at',           t.booked_at,
        'clinic_id',           c.id,
        'clinic_name',         c.name,
        'clinic_place',        c.place,
        'clinic_mobile',       c.mobile,
        'doctor_id',           d.id,
        'doctor_name',         d.name,
        'doctor_spec',         d.specialization,
        'doctor_availability', COALESCE(d.availability, 'available'),
        -- queue_position: how many 'waiting' tokens are ahead of this one
        'queue_position', (
          SELECT COUNT(*)
          FROM public.tokens t2
          WHERE t2.clinic_id = t.clinic_id
            AND t2.doctor_id = t.doctor_id
            AND t2.status = 'waiting'
            AND t2.booked_at < t.booked_at
        )
      )
      ORDER BY t.booked_at ASC
    ),
    '[]'::JSON
  )
  FROM public.tokens t
  JOIN public.patients  p ON p.id = t.patient_id
  JOIN public.clinics   c ON c.id = t.clinic_id
  JOIN public.doctors   d ON d.id = t.doctor_id
  WHERE p.mobile = p_mobile
    AND (
      t.status IN ('waiting', 'called', 'consulting')
      OR (t.status IN ('skipped', 'no_show') AND t.booked_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE)
    );
$$;

COMMENT ON FUNCTION public.check_token_by_mobile(TEXT) IS
  'Returns active tokens for a given mobile number, including clinic place, contact, and current doctor availability.';

GRANT EXECUTE ON FUNCTION public.check_token_by_mobile(TEXT) TO anon, authenticated;
