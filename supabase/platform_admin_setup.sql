-- ============================================================================
-- PLATFORM ADMINISTRATION SYSTEM SETUP (supabase/platform_admin_setup.sql)
-- ============================================================================
-- Private administration system for creating and managing clinics and doctors.
--
-- Features:
--   1. public.platform_admins table with RLS enabled
--   2. Auto-seed current Auth user from public.doctors (arun.kumar)
--   3. SECURITY DEFINER RPCs restricted strictly to Platform Admins:
--      - check_is_platform_admin()
--      - admin_list_all_clinics_and_doctors()
--      - admin_upsert_clinic(...)
--      - admin_create_doctor_with_password(...)
--      - admin_reset_doctor_password(...)
-- ============================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create platform_admins table
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to check if they are platform admin
DROP POLICY IF EXISTS "platform_admins_select_own" ON public.platform_admins;
CREATE POLICY "platform_admins_select_own" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- 3. Automatically seed existing Auth user from public.doctors where username = 'arun.kumar'
INSERT INTO public.platform_admins (auth_user_id)
SELECT auth_user_id
FROM public.doctors
WHERE username = 'arun.kumar' AND auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO NOTHING;


-- ============================================================================
-- RPC 1: check_is_platform_admin()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_is_platform_admin() TO authenticated, anon;


-- ============================================================================
-- RPC 2: admin_list_all_clinics_and_doctors()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_list_all_clinics_and_doctors()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clinics JSON;
BEGIN
  -- Strict Platform Admin check (accept platform_admins, arun.kumar, or clinic_admin)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.doctors WHERE auth_user_id = auth.uid() AND username = 'arun.kumar')
     AND NOT EXISTS (SELECT 1 FROM public.clinic_members WHERE auth_user_id = auth.uid() AND role = 'clinic_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Platform Team access only.';
  END IF;

  -- Ensure calling admin is seeded into platform_admins
  INSERT INTO public.platform_admins (auth_user_id)
  VALUES (auth.uid())
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Ensure calling admin is in clinic_members for all clinics as clinic_admin
  INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
  SELECT c.id, auth.uid(), 'clinic_admin'::clinic_member_role
  FROM public.clinics c
  ON CONFLICT (clinic_id, auth_user_id)
  DO UPDATE SET role = 'clinic_admin';

  SELECT json_agg(
    json_build_object(
      'id', c.id,
      'name', c.name,
      'place', c.place,
      'mobile', c.mobile,
      'active', c.active,
      'created_at', c.created_at,
      'doctor_count', (
        SELECT COUNT(*) FROM public.doctors d WHERE d.clinic_id = c.id
      ),
      'active_token_count', (
        SELECT COUNT(*)
        FROM public.tokens t
        WHERE t.clinic_id = c.id
          AND t.session_date = CURRENT_DATE
          AND t.status IN ('waiting', 'called', 'consulting')
      ),
      'doctors', COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', d.id,
            'name', d.name,
            'specialization', d.specialization,
            'username', d.username,
            'average_consultation_minutes', d.average_consultation_minutes,
            'duty_start', d.duty_start,
            'duty_end', d.duty_end,
            'break_start', d.break_start,
            'break_end', d.break_end,
            'working_days', d.working_days,
            'availability', d.availability,
            'auth_user_id', d.auth_user_id,
            'has_login_account', (d.auth_user_id IS NOT NULL),
            'login_email', (SELECT u.email FROM auth.users u WHERE u.id = d.auth_user_id),
            'created_at', d.created_at
          ) ORDER BY d.created_at ASC
        )
        FROM public.doctors d
        WHERE d.clinic_id = c.id
      ), '[]'::json)
    ) ORDER BY c.created_at ASC
  ) INTO v_clinics
  FROM public.clinics c;

  RETURN COALESCE(v_clinics, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_clinics_and_doctors() TO authenticated;


-- ============================================================================
-- RPC 3: admin_upsert_clinic(...)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_upsert_clinic(
  p_clinic_id UUID,
  p_name TEXT,
  p_place TEXT,
  p_mobile TEXT,
  p_active BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result public.clinics;
  v_clean_mobile TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform Team access only.';
  END IF;

  IF TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Clinic name cannot be empty.';
  END IF;

  IF TRIM(p_place) = '' THEN
    RAISE EXCEPTION 'Clinic place cannot be empty.';
  END IF;

  v_clean_mobile := REGEXP_REPLACE(p_mobile, '\s+', '', 'g');
  IF v_clean_mobile = '' THEN
    RAISE EXCEPTION 'Clinic mobile cannot be empty.';
  END IF;

  IF p_clinic_id IS NULL THEN
    INSERT INTO public.clinics (name, place, mobile, active)
    VALUES (TRIM(p_name), TRIM(p_place), v_clean_mobile, COALESCE(p_active, TRUE))
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.clinics
    SET
      name = TRIM(p_name),
      place = TRIM(p_place),
      mobile = v_clean_mobile,
      active = COALESCE(p_active, active)
    WHERE id = p_clinic_id
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Clinic with ID % not found.', p_clinic_id;
    END IF;
  END IF;

  -- Ensure calling platform admin is linked in clinic_members as clinic_admin
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
    VALUES (v_result.id, auth.uid(), 'clinic_admin')
    ON CONFLICT (clinic_id, auth_user_id)
    DO UPDATE SET role = 'clinic_admin';
  END IF;

  RETURN row_to_json(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_clinic(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;


-- ============================================================================
-- RPC 4: admin_create_doctor_with_password(...)
-- ============================================================================
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
  p_break_start TIME DEFAULT NULL,
  p_break_end TIME DEFAULT NULL,
  p_working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  p_role clinic_member_role DEFAULT 'doctor'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_auth_user_id UUID;
  v_email TEXT;
  v_clean_username TEXT;
  v_encrypted_pw TEXT;
  v_doctor public.doctors;
BEGIN
  -- 1. Security check
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform Team access only.';
  END IF;

  -- 2. Input validations
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

  -- 3. Resolve email address for Supabase Auth
  IF p_email IS NOT NULL AND TRIM(p_email) <> '' THEN
    v_email := LOWER(TRIM(p_email));
  ELSE
    -- Default internal domain for doctor username login
    v_email := v_clean_username || '@platform.internal';
  END IF;

  -- 4. Create or update auth.users with pgcrypto
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE LOWER(email) = v_email
  LIMIT 1;

  IF v_auth_user_id IS NOT NULL THEN
    -- Update existing auth user password
    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW(),
      raw_user_meta_data = jsonb_build_object('name', TRIM(p_name), 'username', v_clean_username)
    WHERE id = v_auth_user_id;
  ELSE
    -- Generate UUID and insert new auth user
    v_auth_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      v_auth_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      v_encrypted_pw,
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', TRIM(p_name), 'username', v_clean_username),
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );
  END IF;

  -- 5. Link identity in auth.identities
  BEGIN
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_auth_user_id::text,
      v_auth_user_id,
      jsonb_build_object('sub', v_auth_user_id::text, 'email', v_email),
      'email',
      v_auth_user_id::text,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (provider, id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if auth.identities columns differ in this Supabase version
    NULL;
  END;

  -- 6. Insert or update public.doctors
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
      working_days = p_working_days
    WHERE id = v_doctor.id
    RETURNING * INTO v_doctor;
  ELSE
    INSERT INTO public.doctors (
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
      availability
    ) VALUES (
      p_clinic_id,
      v_auth_user_id,
      TRIM(p_name),
      TRIM(p_specialization),
      v_clean_username,
      p_average_consultation_minutes,
      p_duty_start,
      p_duty_end,
      p_break_start,
      p_break_end,
      p_working_days,
      'available'
    )
    RETURNING * INTO v_doctor;
  END IF;

  -- 7. Add or update membership in public.clinic_members
  INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
  VALUES (p_clinic_id, v_auth_user_id, COALESCE(p_role, 'doctor'))
  ON CONFLICT (clinic_id, auth_user_id)
  DO UPDATE SET role = EXCLUDED.role;

  -- 8. Ensure calling platform admin is linked in clinic_members as clinic_admin
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
    VALUES (p_clinic_id, auth.uid(), 'clinic_admin')
    ON CONFLICT (clinic_id, auth_user_id)
    DO UPDATE SET role = 'clinic_admin';
  END IF;

  RETURN row_to_json(v_doctor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_doctor_with_password(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TIME, TIME, TIME, TIME, TEXT[], clinic_member_role) TO authenticated;


-- ============================================================================
-- RPC 5: admin_reset_doctor_password(...)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_reset_doctor_password(
  p_doctor_id UUID,
  p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_doctor public.doctors;
  v_auth_user_id UUID;
  v_email TEXT;
  v_encrypted_pw TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Platform Team access only.';
  END IF;

  IF LENGTH(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  SELECT * INTO v_doctor FROM public.doctors WHERE id = p_doctor_id;
  IF v_doctor.id IS NULL THEN
    RAISE EXCEPTION 'Doctor with ID % not found.', p_doctor_id;
  END IF;

  v_auth_user_id := v_doctor.auth_user_id;
  v_encrypted_pw := crypt(p_new_password, gen_salt('bf'));

  IF v_auth_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET
      encrypted_password = v_encrypted_pw,
      updated_at = NOW()
    WHERE id = v_auth_user_id;
  ELSE
    -- If doctor had no auth account linked yet, create one
    v_email := LOWER(TRIM(v_doctor.username)) || '@platform.internal';
    v_auth_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_auth_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, v_encrypted_pw, NOW(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', v_doctor.name, 'username', v_doctor.username), NOW(), NOW(),
      '', '', '', ''
    );

    BEGIN
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (v_auth_user_id::text, v_auth_user_id, jsonb_build_object('sub', v_auth_user_id::text, 'email', v_email), 'email', v_auth_user_id::text, NOW(), NOW(), NOW())
      ON CONFLICT (provider, id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    UPDATE public.doctors SET auth_user_id = v_auth_user_id WHERE id = p_doctor_id;

    INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
    VALUES (v_doctor.clinic_id, v_auth_user_id, 'doctor')
    ON CONFLICT (clinic_id, auth_user_id) DO NOTHING;
  END IF;

  RETURN json_build_object('success', true, 'doctor_id', p_doctor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_doctor_password(UUID, TEXT) TO authenticated;


-- ============================================================================
-- RLS POLICIES & CLINIC MEMBERSHIP FIX FOR PLATFORM ADMINS
-- ============================================================================
-- 1. Update doctors RLS SELECT policy so Platform Admins can see ALL doctors
DROP POLICY IF EXISTS doctors_select_own_clinic ON public.doctors;
CREATE POLICY doctors_select_own_clinic ON public.doctors
  FOR SELECT TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
  );

-- 2. Update clinics RLS SELECT policy so Platform Admins can see ALL clinics
DROP POLICY IF EXISTS clinics_select_own ON public.clinics;
CREATE POLICY clinics_select_own ON public.clinics
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT clinic_id FROM public.clinic_members WHERE auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
  );

-- 3. Link existing platform admins to all clinics in public.clinic_members
INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
SELECT c.id, pa.auth_user_id, 'clinic_admin'::clinic_member_role
FROM public.clinics c
CROSS JOIN public.platform_admins pa
ON CONFLICT (clinic_id, auth_user_id)
DO UPDATE SET role = 'clinic_admin';

