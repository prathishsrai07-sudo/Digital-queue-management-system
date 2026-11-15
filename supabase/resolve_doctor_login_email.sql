-- ============================================================================
-- FUNCTION: resolve_doctor_login_email
-- ============================================================================
-- Resolves a doctor's username (e.g. 'arun.kumar') to their corresponding
-- Supabase Auth email from auth.users via public.doctors.auth_user_id.
--
-- Security:
--   SECURITY DEFINER with restricted search_path allows the anon role to
--   resolve the email during login without exposing auth.users directly.
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
