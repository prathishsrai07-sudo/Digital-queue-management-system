-- ============================================================================
-- SEPARATION OF RESPONSIBILITIES: ADMIN (CREATE/DELETE) vs DOCTOR (TIMINGS)
-- File: supabase/doctor_management_separation.sql
-- ============================================================================
-- 1. admin_delete_doctor(p_doctor_id UUID)
--    Enables Platform Admin to cleanly delete a doctor, safely cascading deletion
--    of tokens, daily token counters, clinic membership, and doctor record so
--    foreign-key constraints never block deletion.
--
-- 2. admin_create_doctor_with_password(...)
--    Admin adds doctor with only core identity & credentials (name, spec, username,
--    password). Automatically sets sensible database defaults for duty timings,
--    breaks, and 7-day schedule behind the scenes.
--
-- 3. doctor_update_schedule(...)
--    Enables logged-in doctors to update their own duty timings, breaks, working days,
--    average consultation time, and availability status.
-- ============================================================================

-- ── 1. RPC: admin_delete_doctor ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_doctor(
  p_doctor_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_user_id UUID;
  v_clinic_id    UUID;
  v_doctor_name  TEXT;
BEGIN
  -- Verify doctor exists
  SELECT auth_user_id, clinic_id, name
  INTO v_auth_user_id, v_clinic_id, v_doctor_name
  FROM public.doctors
  WHERE id = p_doctor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor with ID % not found.', p_doctor_id;
  END IF;

  -- 1. Delete all tokens associated with this doctor (satisfies ON DELETE RESTRICT on tokens)
  DELETE FROM public.tokens
  WHERE doctor_id = p_doctor_id;

  -- 2. Delete daily token counters for this doctor
  DELETE FROM public.daily_token_counters
  WHERE doctor_id = p_doctor_id;

  -- 3. Delete doctor from public.doctors
  DELETE FROM public.doctors
  WHERE id = p_doctor_id;

  -- 4. Clean up clinic_members and auth user if linked
  IF v_auth_user_id IS NOT NULL THEN
    DELETE FROM public.clinic_members
    WHERE auth_user_id = v_auth_user_id
      AND clinic_id = v_clinic_id;

    -- Delete from auth.identities
    BEGIN
      DELETE FROM auth.identities WHERE user_id = v_auth_user_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- Delete internal auth user
    BEGIN
      DELETE FROM auth.users WHERE id = v_auth_user_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN json_build_object(
    'success', true,
    'deleted_doctor_id', p_doctor_id,
    'doctor_name', v_doctor_name
  );
END;
$$;

COMMENT ON FUNCTION public.admin_delete_doctor(UUID) IS
  'Platform Admin: Permanently deletes doctor with full cascading cleanup of tokens and membership.';

GRANT EXECUTE ON FUNCTION public.admin_delete_doctor(UUID) TO authenticated, anon;


-- ── 2. RPC: admin_create_doctor_with_password (Sensible Defaults) ───────────
CREATE OR REPLACE FUNCTION public.admin_create_doctor_with_password(
  p_clinic_id UUID,
  p_name TEXT,
  p_specialization TEXT,
  p_username TEXT,
  p_password TEXT,
  p_email TEXT DEFAULT NULL,
  p_average_consultation_minutes INT DEFAULT 10,
  p_duty_start TIME DEFAULT '09:00',
  p_duty_end TIME DEFAULT '17:00',
  p_break_start TIME DEFAULT '13:00',
  p_break_end TIME DEFAULT '14:00',
  p_working_days TEXT[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
  p_role clinic_member_role DEFAULT 'doctor'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_auth_user_id   UUID;
  v_email          TEXT;
  v_clean_username TEXT;
  v_encrypted_pw   TEXT;
  v_doctor         public.doctors;
BEGIN
  -- 1. Input validations
  IF TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Doctor name cannot be empty.';
  END IF;
  IF TRIM(p_specialization) = '' THEN
    RAISE EXCEPTION 'Specialization cannot be empty.';
  END IF;
  v_clean_username := LOWER(TRIM(p_username));
  IF v_clean_username = '' THEN
    RAISE EXCEPTION 'Username cannot be empty.';
  END IF;
  IF LENGTH(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;
  IF p_average_consultation_minutes <= 0 OR p_average_consultation_minutes > 120 THEN
    RAISE EXCEPTION 'Average consultation minutes must be between 1 and 120.';
  END IF;
  IF p_duty_end <= p_duty_start THEN
    RAISE EXCEPTION 'Duty end time must be after duty start time.';
  END IF;
  IF (p_break_start IS NOT NULL AND p_break_end IS NULL) OR (p_break_start IS NULL AND p_break_end IS NOT NULL) THEN
    RAISE EXCEPTION 'Both break start and break end must be specified, or both left blank.';
  END IF;
  IF p_break_start IS NOT NULL AND p_break_end IS NOT NULL AND p_break_end <= p_break_start THEN
    RAISE EXCEPTION 'Break end time must be after break start time.';
  END IF;

  -- 2. Resolve email address for Supabase Auth
  IF p_email IS NOT NULL AND TRIM(p_email) <> '' THEN
    v_email := LOWER(TRIM(p_email));
  ELSE
    v_email := v_clean_username || '@platform.internal';
  END IF;

  -- 3. Create or update auth.users with pgcrypto
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE LOWER(email) = v_email
  LIMIT 1;

  IF v_auth_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW(),
      raw_user_meta_data = jsonb_build_object('name', TRIM(p_name), 'username', v_clean_username)
    WHERE id = v_auth_user_id;
  ELSE
    v_auth_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      v_auth_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', v_email,
      v_encrypted_pw, NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', TRIM(p_name), 'username', v_clean_username),
      NOW(), NOW()
    );
  END IF;

  -- 4. Link identity
  BEGIN
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      v_auth_user_id::text, v_auth_user_id,
      jsonb_build_object('sub', v_auth_user_id::text, 'email', v_email),
      'email', v_auth_user_id::text, NOW(), NOW(), NOW()
    )
    ON CONFLICT (provider, id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 5. Insert or update public.doctors
  SELECT * INTO v_doctor
  FROM public.doctors
  WHERE LOWER(username) = v_clean_username
  LIMIT 1;

  IF v_doctor.id IS NOT NULL THEN
    UPDATE public.doctors
    SET
      clinic_id = p_clinic_id,
      name = TRIM(p_name),
      specialization = TRIM(p_specialization),
      auth_user_id = v_auth_user_id,
      average_consultation_minutes = p_average_consultation_minutes,
      duty_start = p_duty_start,
      duty_end = p_duty_end,
      break_start = p_break_start,
      break_end = p_break_end,
      working_days = p_working_days,
      availability = 'available'
    WHERE id = v_doctor.id
    RETURNING * INTO v_doctor;
  ELSE
    INSERT INTO public.doctors (
      clinic_id, auth_user_id, name, specialization, username,
      average_consultation_minutes, duty_start, duty_end,
      break_start, break_end, working_days, availability
    ) VALUES (
      p_clinic_id, v_auth_user_id, TRIM(p_name), TRIM(p_specialization), v_clean_username,
      p_average_consultation_minutes, p_duty_start, p_duty_end,
      p_break_start, p_break_end, p_working_days, 'available'
    )
    RETURNING * INTO v_doctor;
  END IF;

  -- 6. Link in clinic_members
  INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
  VALUES (p_clinic_id, v_auth_user_id, p_role)
  ON CONFLICT (clinic_id, auth_user_id)
  DO UPDATE SET role = p_role;

  RETURN json_build_object(
    'id', v_doctor.id,
    'clinic_id', v_doctor.clinic_id,
    'name', v_doctor.name,
    'specialization', v_doctor.specialization,
    'username', v_doctor.username,
    'auth_user_id', v_auth_user_id,
    'login_email', v_email,
    'average_consultation_minutes', v_doctor.average_consultation_minutes,
    'duty_start', v_doctor.duty_start,
    'duty_end', v_doctor.duty_end,
    'break_start', v_doctor.break_start,
    'break_end', v_doctor.break_end,
    'working_days', v_doctor.working_days,
    'availability', v_doctor.availability,
    'created_at', v_doctor.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_doctor_with_password(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TIME, TIME, TIME, TIME, TEXT[], clinic_member_role) TO authenticated, anon;


-- ── 3. RPC: doctor_update_schedule ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doctor_update_schedule(
  p_doctor_id UUID,
  p_duty_start TIME,
  p_duty_end TIME,
  p_break_start TIME DEFAULT NULL,
  p_break_end TIME DEFAULT NULL,
  p_average_consultation_minutes INT DEFAULT 10,
  p_working_days TEXT[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
  p_availability doctor_availability DEFAULT 'available'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated public.doctors;
BEGIN
  -- Validations
  IF p_average_consultation_minutes <= 0 OR p_average_consultation_minutes > 120 THEN
    RAISE EXCEPTION 'Average consultation minutes must be between 1 and 120.';
  END IF;

  IF p_duty_end <= p_duty_start THEN
    RAISE EXCEPTION 'Duty end time must be after duty start time.';
  END IF;

  IF (p_break_start IS NOT NULL AND p_break_end IS NULL) OR (p_break_start IS NULL AND p_break_end IS NOT NULL) THEN
    RAISE EXCEPTION 'Both break start and break end must be specified, or both left empty.';
  END IF;

  IF p_break_start IS NOT NULL AND p_break_end IS NOT NULL AND p_break_end <= p_break_start THEN
    RAISE EXCEPTION 'Break end time must be after break start time.';
  END IF;

  UPDATE public.doctors
  SET
    duty_start = p_duty_start,
    duty_end = p_duty_end,
    break_start = p_break_start,
    break_end = p_break_end,
    average_consultation_minutes = p_average_consultation_minutes,
    working_days = p_working_days,
    availability = p_availability
  WHERE id = p_doctor_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor with ID % not found.', p_doctor_id;
  END IF;

  RETURN row_to_json(v_updated);
END;
$$;

COMMENT ON FUNCTION public.doctor_update_schedule(UUID, TIME, TIME, TIME, TIME, INT, TEXT[], doctor_availability) IS
  'Doctor Portal: Allows doctors to configure their duty timings, breaks, working days, consultation duration, and availability.';

GRANT EXECUTE ON FUNCTION public.doctor_update_schedule(UUID, TIME, TIME, TIME, TIME, INT, TEXT[], doctor_availability) TO authenticated, anon;
