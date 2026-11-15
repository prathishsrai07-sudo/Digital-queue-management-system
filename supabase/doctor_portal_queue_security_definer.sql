-- ============================================================================
-- DOCTOR PORTAL RPCs & SECURITY DEFINER FUNCTIONS
-- File: supabase/doctor_portal_queue_security_definer.sql
-- ============================================================================
-- Enables seamless Doctor Portal operations (queue management, tokens, stats,
-- availability, and schedule) whether or not an individual Supabase Auth session
-- is attached to an email.
-- ============================================================================

-- ── 1. RPC: doctor_update_token_status ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doctor_update_token_status(
  p_token_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.tokens;
  v_status_val TEXT := p_status;
BEGIN
  IF p_status = 'skip' OR p_status = 'skipped' THEN
    v_status_val := COALESCE(p_reason, 'skipped');
    UPDATE public.tokens
    SET status = v_status_val,
        skipped_at = NOW()
    WHERE id = p_token_id
    RETURNING * INTO v_token;
  ELSIF p_status = 'called' THEN
    UPDATE public.tokens
    SET status = 'called',
        called_at = NOW()
    WHERE id = p_token_id
    RETURNING * INTO v_token;
  ELSIF p_status = 'consulting' THEN
    UPDATE public.tokens
    SET status = 'consulting',
        consultation_started_at = NOW()
    WHERE id = p_token_id
    RETURNING * INTO v_token;
  ELSIF p_status = 'completed' THEN
    UPDATE public.tokens
    SET status = 'completed',
        completed_at = NOW()
    WHERE id = p_token_id
    RETURNING * INTO v_token;
  ELSIF p_status = 'waiting' THEN
    UPDATE public.tokens
    SET status = 'waiting'
    WHERE id = p_token_id
    RETURNING * INTO v_token;
  ELSE
    UPDATE public.tokens
    SET status = p_status
    WHERE id = p_token_id
    RETURNING * INTO v_token;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token with ID % not found.', p_token_id;
  END IF;

  RETURN row_to_json(v_token);
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_update_token_status(UUID, TEXT, TEXT) TO authenticated, anon;


-- ── 2. RPC: doctor_get_live_queue ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doctor_get_live_queue(
  p_clinic_id UUID,
  p_doctor_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', t.id,
          'token_number', t.token_number,
          'booking_type', t.booking_type,
          'status', t.status,
          'booked_at', t.booked_at,
          'called_at', t.called_at,
          'consultation_started_at', t.consultation_started_at,
          'completed_at', t.completed_at,
          'skipped_at', t.skipped_at,
          'booked_date', t.booked_date,
          'patients', json_build_object(
            'id', p.id,
            'name', p.name,
            'mobile', p.mobile,
            'place', p.place
          )
        )
        ORDER BY t.booked_at ASC
      )
      FROM public.tokens t
      LEFT JOIN public.patients p ON p.id = t.patient_id
      WHERE t.clinic_id = p_clinic_id
        AND t.doctor_id = p_doctor_id
        AND (
          t.status IN ('waiting', 'called', 'consulting')
          OR (t.status IN ('skipped', 'no_show') AND t.booked_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE)
        )
    ),
    '[]'::JSON
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_get_live_queue(UUID, UUID) TO authenticated, anon;


-- ── 3. RPC: doctor_get_stats_today ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.doctor_get_stats_today(
  p_clinic_id UUID,
  p_doctor_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_served INT := 0;
BEGIN
  SELECT COUNT(*)
  INTO v_served
  FROM public.tokens
  WHERE clinic_id = p_clinic_id
    AND doctor_id = p_doctor_id
    AND status = 'completed'
    AND booked_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE;

  RETURN json_build_object(
    'servedToday', v_served
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_get_stats_today(UUID, UUID) TO authenticated, anon;


-- ── 4. Permissive Policies for Doctor Portal Token Management ─────────────────
DO $$
BEGIN
  -- Permissive SELECT policy on tokens for queue display
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tokens' AND policyname = 'tokens_allow_read_doctor_queue'
  ) THEN
    CREATE POLICY tokens_allow_read_doctor_queue ON public.tokens
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  -- Permissive UPDATE policy on tokens for status transitions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tokens' AND policyname = 'tokens_allow_update_status'
  ) THEN
    CREATE POLICY tokens_allow_update_status ON public.tokens
      FOR UPDATE TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  -- Permissive SELECT policy on patients for queue patient details
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patients' AND policyname = 'patients_allow_read_for_queue'
  ) THEN
    CREATE POLICY patients_allow_read_for_queue ON public.patients
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END;
$$;
