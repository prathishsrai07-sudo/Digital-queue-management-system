-- ============================================================================
-- CORRECTED DOCTOR AUTHENTICATION SETUP SCRIPT (supabase/doctor_auth_setup.sql)
-- Links your exact existing Supabase Auth user to:
--   Clinic: Sunrise Health Clinic
--   Doctor: Dr. Arun Kumar (username: arun.kumar)
-- ============================================================================

DO $$
DECLARE
    v_target_email TEXT := 'your-admin-email@example.com';
    v_auth_user_id UUID;
    v_auth_email   TEXT;
    v_clinic_id    UUID;
    v_doctor_id    UUID;
BEGIN
    -- 1. Find the exact existing Supabase Auth user by email
    SELECT id, email
    INTO v_auth_user_id, v_auth_email
    FROM auth.users
    WHERE lower(email) = lower(trim(v_target_email))
    LIMIT 1;

    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Auth user with email "%" was not found in auth.users. Check Supabase Dashboard -> Authentication -> Users.', v_target_email;
    END IF;

    -- 2. Find Sunrise Health Clinic using its actual "name" column
    SELECT id
    INTO v_clinic_id
    FROM public.clinics
    WHERE name = 'Sunrise Health Clinic'
    LIMIT 1;

    IF v_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Clinic "Sunrise Health Clinic" was not found in public.clinics.';
    END IF;

    -- 3. Find Dr. Arun Kumar in public.doctors for this clinic
    SELECT id
    INTO v_doctor_id
    FROM public.doctors
    WHERE clinic_id = v_clinic_id
      AND (username = 'arun.kumar' OR name = 'Dr. Arun Kumar')
    LIMIT 1;

    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'Doctor "Dr. Arun Kumar" (arun.kumar) was not found in public.doctors for Sunrise Health Clinic.';
    END IF;

    -- 4. Keep doctors_auth_user_id_key (UNIQUE auth_user_id) safe and idempotent:
    --    If this auth_user_id is linked to any other doctor row, unlink it first
    UPDATE public.doctors
    SET auth_user_id = NULL
    WHERE auth_user_id = v_auth_user_id
      AND id <> v_doctor_id;

    -- 5. Link Dr. Arun Kumar to the Auth user
    UPDATE public.doctors
    SET auth_user_id = v_auth_user_id
    WHERE id = v_doctor_id;

    -- 6. Insert or update clinic_members using the confirmed columns:
    --    (id, clinic_id, auth_user_id, role, created_at)
    --    and the confirmed constraint: UNIQUE (clinic_id, auth_user_id)
    INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
    VALUES (v_clinic_id, v_auth_user_id, 'doctor'::public.clinic_member_role)
    ON CONFLICT (clinic_id, auth_user_id)
    DO UPDATE SET role = EXCLUDED.role;

    RAISE NOTICE 'SUCCESS: Linked Auth user % (%) to Dr. Arun Kumar (%) at Sunrise Health Clinic (%).',
        v_auth_email, v_auth_user_id, v_doctor_id, v_clinic_id;
END $$;

-- 7. Verification query: confirm the doctor row and clinic_members row are linked
SELECT
    c.id AS clinic_id,
    c.name AS clinic_name,
    d.id AS doctor_id,
    d.name AS doctor_name,
    d.username AS doctor_username,
    d.auth_user_id AS doctor_auth_user_id,
    cm.id AS clinic_member_id,
    cm.role AS clinic_member_role,
    u.email AS linked_auth_email
FROM public.doctors d
JOIN public.clinics c
  ON c.id = d.clinic_id
LEFT JOIN public.clinic_members cm
  ON cm.clinic_id = c.id
 AND cm.auth_user_id = d.auth_user_id
LEFT JOIN auth.users u
  ON u.id = d.auth_user_id
WHERE c.name = 'Sunrise Health Clinic'
  AND d.username = 'arun.kumar';

-- ============================================================================
-- 8. FUNCTION: resolve_doctor_login_email
-- ============================================================================
-- Resolves a doctor's username (e.g. 'arun.kumar') to their corresponding
-- Supabase Auth email from auth.users via public.doctors.auth_user_id.
-- Allows doctors to log in with their assigned username + password.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_doctor_login_email(p_identifier TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_clean TEXT := lower(trim(p_identifier));
    v_email TEXT;
BEGIN
    IF v_clean IS NULL OR v_clean = '' THEN
        RETURN NULL;
    END IF;

    -- 1. Check if identifier matches a doctor's username in public.doctors
    SELECT u.email INTO v_email
    FROM public.doctors d
    JOIN auth.users u ON u.id = d.auth_user_id
    WHERE lower(d.username) = v_clean
    LIMIT 1;

    IF v_email IS NOT NULL THEN
        RETURN v_email;
    END IF;

    -- 2. Fallback: check if identifier matches an email directly in auth.users
    SELECT u.email INTO v_email
    FROM auth.users u
    WHERE lower(u.email) = v_clean
    LIMIT 1;

    RETURN v_email;
END;
$$;

-- Grant execution permissions to anon and authenticated callers
GRANT EXECUTE ON FUNCTION public.resolve_doctor_login_email(TEXT) TO anon, authenticated;

