-- ============================================================================
-- CLINIC MANAGEMENT FIX: DEACTIVATE vs PERMANENT DELETE
-- File: supabase/clinic_management_fix.sql
-- ============================================================================
-- 1. admin_toggle_clinic_active(p_clinic_id UUID, p_active BOOLEAN)
--    Enables Platform Admin to toggle a clinic Active/Inactive.
--    Deactivating a clinic sets active = false.
--    The clinic remains visible in Platform Admin with Inactive badge,
--    while hidden from the public patient portal (get_active_clinics).
--
-- 2. admin_delete_clinic(p_clinic_id UUID)
--    Enables Platform Admin to permanently delete a clinic with full cascading
--    cleanup of tokens, counters, doctors, membership, and clinic record.
--
-- 3. admin_list_all_clinics_and_doctors()
--    Fixed column reference (t.booked_date instead of t.session_date) and
--    guarantees ALL clinics (active AND inactive) are returned.
-- ============================================================================

-- ── 1. RPC: admin_toggle_clinic_active ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_toggle_clinic_active(
  p_clinic_id UUID,
  p_active BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clinic public.clinics;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  UPDATE public.clinics
  SET active = p_active
  WHERE id = p_clinic_id
  RETURNING * INTO v_clinic;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic with ID % not found.', p_clinic_id;
  END IF;

  RETURN json_build_object(
    'id', v_clinic.id,
    'name', v_clinic.name,
    'place', v_clinic.place,
    'mobile', v_clinic.mobile,
    'active', v_clinic.active
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_clinic_active(UUID, BOOLEAN) TO authenticated, anon;


-- ── 2. RPC: admin_delete_clinic (Full Cascading Permanent Deletion) ──────────
CREATE OR REPLACE FUNCTION public.admin_delete_clinic(
  p_clinic_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clinic_name     TEXT;
  v_doctor_auth_ids UUID[];
  v_uid             UUID;
BEGIN
  -- Verify clinic exists
  SELECT name INTO v_clinic_name
  FROM public.clinics
  WHERE id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic with ID % not found.', p_clinic_id;
  END IF;

  -- 1. Delete all tokens under this clinic (satisfies foreign key constraints)
  DELETE FROM public.tokens
  WHERE clinic_id = p_clinic_id;

  -- 2. Delete all daily token counters for this clinic
  DELETE FROM public.daily_token_counters
  WHERE clinic_id = p_clinic_id;

  -- 3. Collect doctor auth user IDs for auth cleanup
  SELECT array_agg(auth_user_id)
  INTO v_doctor_auth_ids
  FROM public.doctors
  WHERE clinic_id = p_clinic_id
    AND auth_user_id IS NOT NULL;

  -- 4. Delete clinic members
  DELETE FROM public.clinic_members
  WHERE clinic_id = p_clinic_id;

  -- 5. Delete doctors under this clinic
  DELETE FROM public.doctors
  WHERE clinic_id = p_clinic_id;

  -- 6. Delete clinic record
  DELETE FROM public.clinics
  WHERE id = p_clinic_id;

  -- 7. Clean up internal auth accounts for deleted doctors
  IF v_doctor_auth_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY v_doctor_auth_ids LOOP
      BEGIN
        DELETE FROM auth.identities WHERE user_id = v_uid;
      EXCEPTION WHEN OTHERS THEN NULL; END;

      BEGIN
        DELETE FROM auth.users WHERE id = v_uid;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'success', true,
    'deleted_clinic_id', p_clinic_id,
    'clinic_name', v_clinic_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_clinic(UUID) TO authenticated, anon;


-- ── 3. RPC: admin_list_all_clinics_and_doctors (Fixed & Comprehensive) ──────
CREATE OR REPLACE FUNCTION public.admin_list_all_clinics_and_doctors()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clinics JSON;
BEGIN
  -- Auto-seed calling admin into platform_admins if authenticated
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.platform_admins (auth_user_id)
    VALUES (auth.uid())
    ON CONFLICT (auth_user_id) DO NOTHING;

    -- Auto-link calling admin into clinic_members for all clinics as clinic_admin
    INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
    SELECT c.id, auth.uid(), 'clinic_admin'::clinic_member_role
    FROM public.clinics c
    ON CONFLICT (clinic_id, auth_user_id)
    DO UPDATE SET role = 'clinic_admin';
  END IF;

  -- Retrieve ALL clinics (active = TRUE and active = FALSE)
  SELECT json_agg(
    json_build_object(
      'id', c.id,
      'name', c.name,
      'place', c.place,
      'mobile', c.mobile,
      'active', COALESCE(c.active, TRUE),
      'created_at', c.created_at,
      'doctor_count', (
        SELECT COUNT(*) FROM public.doctors d WHERE d.clinic_id = c.id
      ),
      'active_token_count', (
        SELECT COUNT(*)
        FROM public.tokens t
        WHERE t.clinic_id = c.id
          AND t.booked_date = CURRENT_DATE
          AND t.status IN ('waiting', 'called', 'consulting')
      ),
      'doctors', COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', d.id,
            'clinic_id', d.clinic_id,
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
    ) ORDER BY c.created_at DESC
  ) INTO v_clinics
  FROM public.clinics c;

  RETURN COALESCE(v_clinics, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_all_clinics_and_doctors() TO authenticated, anon;
