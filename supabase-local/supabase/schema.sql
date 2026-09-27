


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."patient_status" AS ENUM (
    'SCHEDULED',
    'ARRIVED',
    'WAITING',
    'IN_CONSULTATION',
    'TO_BE_PAID',
    'DONE'
);


ALTER TYPE "public"."patient_status" OWNER TO "postgres";


CREATE TYPE "public"."whatsapp_inbox_status" AS ENUM (
    'pending',
    'resolved',
    'confirmed',
    'rejected'
);


ALTER TYPE "public"."whatsapp_inbox_status" OWNER TO "postgres";


CREATE TYPE "public"."whatsapp_request_type" AS ENUM (
    'booking',
    'reclamation',
    'general'
);


ALTER TYPE "public"."whatsapp_request_type" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "appointment_id" "uuid",
    "rdv_id" "uuid",
    "source" "text" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "queue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "queue_number" integer,
    "queue_sort_at" timestamp with time zone,
    "queued_at" timestamp with time zone,
    "arrived_at" timestamp with time zone,
    "waiting_at" timestamp with time zone,
    "called_at" timestamp with time zone,
    "consultation_start_at" timestamp with time zone,
    "consultation_end_at" timestamp with time zone,
    "billing_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "visits_source_check" CHECK (("source" = ANY (ARRAY['appointment'::"text", 'walk_in'::"text"]))),
    CONSTRAINT "visits_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'arrived'::"text", 'waiting'::"text", 'called'::"text", 'consultation'::"text", 'billing'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_to_waiting_room"("p_rdv_id" "uuid", "p_doctor_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return public.create_visit_from_rdv(p_rdv_id, p_doctor_id);
end;
$$;


ALTER FUNCTION "public"."add_to_waiting_room"("p_rdv_id" "uuid", "p_doctor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "montant" numeric(10,2) DEFAULT 0 NOT NULL,
    "statut" "text" NOT NULL,
    "date_consult" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rdv_id" "uuid",
    "montant_encaisse" numeric DEFAULT 0,
    "mode_paiement" character varying(50),
    "payment_status" character varying(20) DEFAULT 'pending'::character varying,
    "payment_id" "uuid",
    "total_fee" numeric(10,2),
    "clinic_id" "uuid",
    "visit_id" "uuid",
    "doctor_id" "uuid",
    "chief_complaint" "text",
    "diagnosis" "text",
    "treatment" "text",
    "billing_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "billing_type" "text" DEFAULT 'cash'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "locked_by" "uuid",
    "locked_at" timestamp with time zone,
    "lock_expires_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "date_echeance" "date",
    "numero" "text",
    "remise" numeric(5,2) DEFAULT 0,
    "relance" boolean DEFAULT false,
    "emitted_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" "text",
    CONSTRAINT "consultations_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['cash'::"text", 'insurance'::"text", 'package'::"text", 'free'::"text"]))),
    CONSTRAINT "consultations_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['pending'::character varying, 'partial'::character varying, 'paid'::character varying, 'cancelled'::character varying])::"text"[]))),
    CONSTRAINT "consultations_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text", 'amended'::"text", 'voided'::"text"]))),
    CONSTRAINT "consultations_statut_check" CHECK (("statut" = ANY (ARRAY['brouillon'::"text", 'en_attente'::"text", 'partielle'::"text", 'payee'::"text", 'en_retard'::"text", 'annulee'::"text"])))
);


ALTER TABLE "public"."consultations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_override_consultation_lock"("p_consultation_id" "uuid") RETURNS "public"."consultations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  consultation_before public.consultations%rowtype;
  consultation_after public.consultations%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into consultation_before
  from public.consultations
  where id = p_consultation_id
  for update;

  if not found then
    raise exception 'consultation not found';
  end if;

  perform public.mm_assert_same_clinic(coalesce(consultation_before.clinic_id, consultation_before.cabinet_id));

  update public.consultations
  set locked_by = auth.uid(),
      locked_at = now(),
      lock_expires_at = now() + interval '8 minutes',
      updated_at = now()
  where id = p_consultation_id
  returning * into consultation_after;

  perform public.write_audit_log(
    'LOCK_TAKEN_OVER',
    'consultation',
    p_consultation_id,
    to_jsonb(consultation_before),
    to_jsonb(consultation_after),
    jsonb_build_object('override_by', auth.uid())
  );

  return consultation_after;
end;
$$;


ALTER FUNCTION "public"."admin_override_consultation_lock"("p_consultation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."call_patient"("p_visit_id" "uuid") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  v_role text;
begin
  v_role := public.current_role();
  if v_role <> 'doctor' and not public.mm_has_permission('waiting_room.call_next') then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', null, null, null,
      jsonb_build_object('required_permission', 'waiting_room.call_next', 'actual_role', v_role)
    );
    raise exception 'not authorized';
  end if;

  select * into visit_before from public.visits where id = p_visit_id;
  if not found then
    raise exception 'visit not found';
  end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if v_role = 'doctor' and not public.is_admin() and visit_before.doctor_id is distinct from auth.uid() then
    raise exception 'doctor can only call patients assigned to them';
  end if;

  if visit_before.status <> 'waiting' then
    raise exception 'only waiting patients can be called';
  end if;

  update public.visits
  set status = 'called',
      called_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  perform public.write_audit_log('PATIENT_CALLED', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null);

  return visit_after;
end;
$$;


ALTER FUNCTION "public"."call_patient"("p_visit_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rdv" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "date_rdv" timestamp with time zone NOT NULL,
    "status" "text" NOT NULL,
    "notes" "text",
    "rappel_envoye" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_at" timestamp with time zone,
    "confirmed_by" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "arrival_status" "text" DEFAULT 'NOT_ARRIVED'::"text",
    "payment_status" "text" DEFAULT 'UNPAID'::"text",
    "confirmed_by_user_id" "uuid",
    "confirmation_method" "text",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancellation_reason" "text",
    "arrived_at" timestamp with time zone,
    "consultation_started_at" timestamp with time zone,
    "consultation_completed_at" timestamp with time zone,
    "appointment_day" "date" NOT NULL,
    "duree_minutes" integer DEFAULT 30 NOT NULL,
    "type_consultation_id" "uuid",
    CONSTRAINT "rdv_arrival_status_check" CHECK (("arrival_status" = ANY (ARRAY['NOT_ARRIVED'::"text", 'WAITING'::"text", 'IN_CONSULTATION'::"text", 'LEFT'::"text"]))),
    CONSTRAINT "rdv_duree_minutes_check" CHECK ((("duree_minutes" >= 5) AND ("duree_minutes" <= 480))),
    CONSTRAINT "rdv_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['NOT_REQUIRED'::"text", 'UNPAID'::"text", 'PAID'::"text"]))),
    CONSTRAINT "rdv_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirme'::"text", 'cancelled'::"text", 'no_show'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."rdv" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_appointment"("p_rdv_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
  active_visit_id uuid;
begin
  perform public.mm_assert_permission('appointments.cancel');

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  select v.id into active_visit_id
  from public.visits v
  where v.rdv_id = p_rdv_id
    and v.status not in ('completed', 'cancelled')
  limit 1;

  if active_visit_id is not null then
    raise exception 'cannot cancel appointment with an active visit';
  end if;

  update public.rdv
  set status = 'cancelled'
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log(
    'APPOINTMENT_CANCELLED', 'rdv', p_rdv_id,
    to_jsonb(rdv_before), to_jsonb(rdv_after),
    jsonb_build_object('reason', p_reason)
  );

  return rdv_after;
end;
$$;


ALTER FUNCTION "public"."cancel_appointment"("p_rdv_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_appointment_v2"("p_rdv_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('appointments.cancel');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.status = 'completed' then
    raise exception 'cannot cancel a completed appointment';
  end if;

  if rdv_before.arrival_status in ('WAITING', 'IN_CONSULTATION') then
    raise exception 'cannot cancel an appointment while patient is waiting or in consultation';
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'rdv' and column_name = 'status') then
    update public.rdv set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason where id = p_rdv_id returning * into rdv_after;
  else
    update public.rdv set statut = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = p_reason where id = p_rdv_id returning * into rdv_after;
  end if;

  perform public.write_audit_log('APPOINTMENT_CANCELLED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), jsonb_build_object('reason', p_reason));

  return rdv_after;
end;
$$;


ALTER FUNCTION "public"."cancel_appointment_v2"("p_rdv_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_facture"("p_id" "uuid", "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_facture public.consultations%rowtype;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  SELECT * INTO v_facture FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  PERFORM public.mm_assert_same_clinic(COALESCE(v_facture.clinic_id, v_facture.cabinet_id));
  IF v_facture.statut IN ('payee', 'annulee') THEN RAISE EXCEPTION 'Transition invalide'; END IF;

  UPDATE public.consultations SET statut = 'annulee', cancelled_at = now(), cancel_reason = p_reason WHERE id = p_id;
  PERFORM public.write_audit_log('FACTURE_CANCELLED', 'consultation', p_id, jsonb_build_object('statut', v_facture.statut), jsonb_build_object('statut', 'annulee', 'reason', p_reason), NULL);
END;
$$;


ALTER FUNCTION "public"."cancel_facture"("p_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_visit"("p_visit_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
begin
  perform public.mm_assert_permission('waiting_room.remove_patient');

  select * into visit_before
  from public.visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'visit not found';
  end if;

  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status = 'cancelled' then
    raise exception 'visit is already cancelled';
  end if;

  if visit_before.status not in ('scheduled', 'arrived', 'waiting', 'called') then
    raise exception 'cancellation is only allowed before consultation';
  end if;

  update public.visits
  set status = 'cancelled',
      cancelled_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  if visit_after.rdv_id is not null then
    update public.rdv
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        cancelled_by = coalesce(cancelled_by, auth.uid()),
        cancellation_reason = coalesce(p_reason, cancellation_reason)
    where id = visit_after.rdv_id;

    perform public.write_audit_log(
      'APPOINTMENT_CANCELLED',
      'rdv',
      visit_after.rdv_id,
      null,
      null,
      jsonb_build_object('reason', p_reason, 'via', 'cancel_visit', 'visit_id', p_visit_id)
    );
  end if;

  perform public.write_audit_log(
    'PATIENT_CANCELLED',
    'visit',
    p_visit_id,
    to_jsonb(visit_before),
    to_jsonb(visit_after),
    jsonb_build_object('reason', p_reason)
  );

  return visit_after;
end;
$$;


ALTER FUNCTION "public"."cancel_visit"("p_visit_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_consultation"("p_rdv_id" "uuid") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  IF rdv_before.arrival_status != 'IN_CONSULTATION' THEN
    RAISE EXCEPTION 'patient must be IN_CONSULTATION to complete';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rdv' AND column_name='status') THEN
    UPDATE public.rdv SET arrival_status = 'LEFT', status = 'completed', consultation_completed_at = NOW(), payment_status = 'UNPAID' WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  ELSE
    UPDATE public.rdv SET arrival_status = 'LEFT', statut = 'completed', consultation_completed_at = NOW(), payment_status = 'UNPAID' WHERE id = p_rdv_id RETURNING * INTO rdv_after;
  END IF;

  RETURN rdv_after;
END;
$$;


ALTER FUNCTION "public"."complete_consultation"("p_rdv_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_consultation"("p_consultation_id" "uuid", "p_chief_complaint" "text", "p_diagnosis" "text", "p_treatment" "text", "p_notes" "text", "p_billing_amount" numeric, "p_billing_type" "text") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  consultation_before public.consultations%rowtype;
  consultation_after public.consultations%rowtype;
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  next_status text;
  payment_status text;
  payment_method text;
begin
  perform public.mm_assert_role(array['doctor']);

  if p_billing_type not in ('cash', 'insurance', 'package', 'free') then
    raise exception 'invalid billing type';
  end if;

  select * into consultation_before from public.consultations where id = p_consultation_id for update;
  if not found then raise exception 'consultation not found'; end if;
  perform public.mm_assert_same_clinic(coalesce(consultation_before.clinic_id, consultation_before.cabinet_id));

  if consultation_before.locked_by is distinct from auth.uid() then
    raise exception 'only lock owner can complete consultation';
  end if;

  if consultation_before.lock_expires_at < now() then
    raise exception 'consultation lock expired';
  end if;

  select * into visit_before from public.visits where id = consultation_before.visit_id for update;
  if not found then raise exception 'visit not found'; end if;

  if visit_before.status <> 'consultation' then
    raise exception 'visit is not in consultation';
  end if;

  if p_billing_type = 'cash' and coalesce(p_billing_amount, 0) > 0 then
    next_status := 'billing';
    payment_status := 'pending';
    payment_method := null;
  elsif p_billing_type = 'insurance' and coalesce(p_billing_amount, 0) > 0 then
    next_status := 'billing';
    payment_status := 'pending';
    payment_method := 'insurance';
  else
    next_status := 'completed';
    payment_status := 'waived';
    payment_method := p_billing_type;
  end if;

  update public.consultations
  set chief_complaint = p_chief_complaint,
      diagnosis = p_diagnosis,
      treatment = p_treatment,
      notes = p_notes,
      billing_amount = coalesce(p_billing_amount, 0),
      billing_type = p_billing_type,
      montant = coalesce(p_billing_amount, 0),
      statut = case when next_status = 'billing' then 'credit' else 'paye' end,
      status = 'completed',
      completed_at = now(),
      locked_by = null,
      locked_at = null,
      lock_expires_at = null,
      version = version + 1,
      updated_at = now()
  where id = p_consultation_id
  returning * into consultation_after;

  update public.visits
  set status = next_status,
      consultation_end_at = now(),
      billing_at = case when next_status = 'billing' then now() else billing_at end,
      completed_at = case when next_status = 'completed' then now() else completed_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = visit_before.id
  returning * into visit_after;

  insert into public.payments (
    clinic_id, visit_id, consultation_id, patient_id,
    amount, method, status, received_by, paid_at
  )
  values (
    visit_after.clinic_id, visit_after.id, consultation_after.id, visit_after.patient_id,
    coalesce(p_billing_amount, 0), payment_method, payment_status,
    case when payment_status = 'waived' then auth.uid() else null end,
    case when payment_status = 'waived' then now() else null end
  )
  on conflict (visit_id) where status in ('pending', 'paid', 'waived')
  do update set
    consultation_id = excluded.consultation_id,
    amount = excluded.amount,
    method = excluded.method,
    status = excluded.status,
    updated_at = now();

  if visit_after.rdv_id is not null then
    update public.rdv
    set status = case when next_status = 'billing' then 'a_encaisser' else 'termine' end
    where id = visit_after.rdv_id;
  end if;

  perform public.write_audit_log('CONSULTATION_COMPLETED', 'consultation', p_consultation_id, to_jsonb(consultation_before), to_jsonb(consultation_after), null);
  perform public.write_audit_log(
    case when next_status = 'billing' then 'PATIENT_READY_FOR_PAYMENT' else 'VISIT_COMPLETED_NO_PAYMENT_REQUIRED' end,
    'visit',
    visit_after.id,
    to_jsonb(visit_before),
    to_jsonb(visit_after),
    jsonb_build_object('billing_type', p_billing_type, 'amount', p_billing_amount)
  );

  return visit_after;
end;
$$;


ALTER FUNCTION "public"."complete_consultation"("p_consultation_id" "uuid", "p_chief_complaint" "text", "p_diagnosis" "text", "p_treatment" "text", "p_notes" "text", "p_billing_amount" numeric, "p_billing_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_appointment"("p_rdv_id" "uuid") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  perform public.mm_assert_permission('appointments.confirm');

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.status in ('cancelled', 'completed') then
    raise exception 'cannot confirm a cancelled or completed appointment';
  end if;

  update public.rdv
  set status = 'confirme'
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log(
    'APPOINTMENT_CONFIRMED', 'rdv', p_rdv_id,
    to_jsonb(rdv_before), to_jsonb(rdv_after), null
  );

  return rdv_after;
end;
$$;


ALTER FUNCTION "public"."confirm_appointment"("p_rdv_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_appointment_v2"("p_rdv_id" "uuid", "p_method" "text" DEFAULT 'PHONE'::"text") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('appointments.confirm');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if exists (select 1 from information_schema.columns where table_name = 'rdv' and column_name = 'status') then
    if rdv_before.status in ('cancelled', 'completed') then
      raise exception 'cannot confirm a cancelled or completed appointment';
    end if;
    update public.rdv set status = 'confirme', confirmed_at = now(), confirmed_by_user_id = auth.uid(), confirmation_method = p_method where id = p_rdv_id returning * into rdv_after;
  else
    update public.rdv set statut = 'confirme', confirmed_at = now(), confirmed_by_user_id = auth.uid(), confirmation_method = p_method where id = p_rdv_id returning * into rdv_after;
  end if;

  perform public.write_audit_log('APPOINTMENT_CONFIRMED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), jsonb_build_object('method', p_method));

  return rdv_after;
end;
$$;


ALTER FUNCTION "public"."confirm_appointment_v2"("p_rdv_id" "uuid", "p_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_facture"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_remise" numeric, "p_lignes" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_consultation_id uuid;
  v_ligne record;
  v_clinic uuid;
  v_numero text;
  v_patient_clinic uuid;
begin
  if not (coalesce(public.is_admin(), false) or coalesce(public.current_role(), '') in ('doctor', 'secretary')) then raise exception 'Non autorise'; end if;

  v_clinic := public.current_clinic_id();

  select cabinet_id into v_patient_clinic from public.patients where id = p_patient_id;
  if v_patient_clinic is null then raise exception 'Patient introuvable'; end if;
  perform public.mm_assert_same_clinic(v_patient_clinic);

  v_numero := public.mm_next_facture_numero(v_clinic);

  insert into public.consultations (cabinet_id, patient_id, doctor_id, statut, remise, date_consult, numero)
  values (v_clinic, p_patient_id, p_doctor_id, 'brouillon', coalesce(p_remise, 0), current_date, v_numero)
  returning id into v_consultation_id;

  for v_ligne in select * from jsonb_to_recordset(p_lignes) as x(acte_id uuid, libelle_snapshot text, prix_unitaire_snapshot numeric, quantite integer) loop
    if v_ligne.libelle_snapshot is null or btrim(v_ligne.libelle_snapshot) = '' then
      raise exception 'Ligne invalide : libelle manquant';
    end if;
    if v_ligne.prix_unitaire_snapshot is null or v_ligne.prix_unitaire_snapshot < 0 then
      raise exception 'Ligne invalide : prix unitaire incorrect pour %', v_ligne.libelle_snapshot;
    end if;
    if v_ligne.quantite is null or v_ligne.quantite <= 0 then
      raise exception 'Ligne invalide : quantite incorrecte pour %', v_ligne.libelle_snapshot;
    end if;

    insert into public.facture_lignes (consultation_id, acte_id, libelle_snapshot, prix_unitaire_snapshot, quantite)
    values (v_consultation_id, v_ligne.acte_id, v_ligne.libelle_snapshot, v_ligne.prix_unitaire_snapshot, v_ligne.quantite);
  end loop;

  perform public.write_audit_log('FACTURE_CREATED', 'consultation', v_consultation_id, null, jsonb_build_object('statut', 'brouillon', 'numero', v_numero), null);

  return v_consultation_id;
end;
$$;


ALTER FUNCTION "public"."create_facture"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_remise" numeric, "p_lignes" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insurance_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "visit_id" "uuid",
    "patient_id" "uuid" NOT NULL,
    "insurer_id" "uuid" NOT NULL,
    "amount_total" numeric NOT NULL,
    "coverage_rate" numeric(5,2) NOT NULL,
    "amount_insurer" numeric NOT NULL,
    "amount_patient" numeric NOT NULL,
    "status" "text" DEFAULT 'a_deposer'::"text" NOT NULL,
    "reference" "text",
    "note" "text",
    "submitted_at" timestamp with time zone,
    "reimbursed_at" timestamp with time zone,
    "reimbursed_amount" numeric DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "insurance_claims_amount_insurer_check" CHECK (("amount_insurer" >= (0)::numeric)),
    CONSTRAINT "insurance_claims_amount_patient_check" CHECK (("amount_patient" >= (0)::numeric)),
    CONSTRAINT "insurance_claims_amount_total_check" CHECK (("amount_total" >= (0)::numeric)),
    CONSTRAINT "insurance_claims_check" CHECK ((("amount_insurer" + "amount_patient") = "amount_total")),
    CONSTRAINT "insurance_claims_check1" CHECK (("reimbursed_amount" <= "amount_insurer")),
    CONSTRAINT "insurance_claims_coverage_rate_check" CHECK ((("coverage_rate" >= (0)::numeric) AND ("coverage_rate" <= (100)::numeric))),
    CONSTRAINT "insurance_claims_reimbursed_amount_check" CHECK (("reimbursed_amount" >= (0)::numeric)),
    CONSTRAINT "insurance_claims_status_check" CHECK (("status" = ANY (ARRAY['a_deposer'::"text", 'depose'::"text", 'rembourse'::"text", 'rejete'::"text", 'annule'::"text"])))
);


ALTER TABLE "public"."insurance_claims" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_insurance_claim"("p_payment_id" "uuid", "p_insurer_id" "uuid" DEFAULT NULL::"uuid", "p_rate" numeric DEFAULT NULL::numeric) RETURNS "public"."insurance_claims"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_pay public.payments;
  v_patient public.patients;
  v_insurer public.insurers;
  v_rate numeric;
  v_insurer_share numeric;
  v_claim public.insurance_claims;
begin
  perform public.mm_assert_permission('billing.collect');

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found'; end if;
  perform public.mm_assert_same_clinic(v_pay.clinic_id);
  if v_pay.status <> 'pending' then raise exception 'invoice is already settled'; end if;
  if v_pay.visit_id is null then raise exception 'invoice is not linked to a visit'; end if;
  if exists (select 1 from public.insurance_claims where payment_id = p_payment_id) then
    raise exception 'a claim already exists for this invoice';
  end if;

  select * into v_patient from public.patients where id = v_pay.patient_id;
  select * into v_insurer from public.insurers where id = coalesce(p_insurer_id, v_patient.insurer_id);
  if not found then raise exception 'no insurer selected'; end if;
  perform public.mm_assert_same_clinic(v_insurer.clinic_id);

  v_rate := coalesce(p_rate, v_patient.coverage_rate, v_insurer.default_rate);
  if v_rate < 0 or v_rate > 100 then raise exception 'invalid coverage rate'; end if;
  -- the insurer can never owe more than what is still uncollected
  v_insurer_share := least(round(v_pay.amount * v_rate / 100, 2), v_pay.amount - v_pay.amount_paid);

  insert into public.insurance_claims (
    clinic_id, payment_id, visit_id, patient_id, insurer_id,
    amount_total, coverage_rate, amount_insurer, amount_patient, created_by
  ) values (
    v_pay.clinic_id, v_pay.id, v_pay.visit_id, v_pay.patient_id, v_insurer.id,
    v_pay.amount, v_rate, v_insurer_share, v_pay.amount - v_insurer_share, auth.uid()
  ) returning * into v_claim;

  perform public.write_audit_log('INSURANCE_CLAIM_CREATED', 'insurance_claim', v_claim.id, null, to_jsonb(v_claim), null);
  return v_claim;
end;
$$;


ALTER FUNCTION "public"."create_insurance_claim"("p_payment_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_visit_from_rdv"("p_rdv_id" "uuid", "p_doctor_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_row public.rdv%rowtype;
  doctor_clinic uuid;
  resolved_doctor_id uuid := p_doctor_id;
  visit_row public.visits%rowtype;
  qn integer;
begin
  perform public.mm_assert_permission('waiting_room.add_patient');

  select * into rdv_row
  from public.rdv
  where id = p_rdv_id
  for update;

  if not found then
    raise exception 'appointment not found';
  end if;

  perform public.mm_assert_same_clinic(rdv_row.cabinet_id);

  -- Explicit appointment status validation (BUG 2 FIX)
  -- Only scheduled / confirme appointments are allowed into the waiting room.
  if lower(coalesce(rdv_row.status, '')) = 'cancelled' then
    raise exception 'cannot add cancelled appointment to waiting room';
  elsif lower(coalesce(rdv_row.status, '')) not in ('scheduled', 'confirme') then
    raise exception 'cannot add % appointment to waiting room', rdv_row.status;
  end if;

  -- Resolve doctor if not explicitly supplied
  if resolved_doctor_id is null then
    select id into resolved_doctor_id
    from public.profiles
    where coalesce(clinic_id, cabinet_id) = rdv_row.cabinet_id
      and public.mm_role_key(role) = 'doctor'
      and status = 'active'
    order by created_at asc
    limit 1;

    if resolved_doctor_id is null then
      raise exception 'no active doctor found for this clinic';
    end if;
  else
    select coalesce(clinic_id, cabinet_id) into doctor_clinic
    from public.profiles
    where id = resolved_doctor_id
      and public.mm_role_key(role) = 'doctor'
      and status = 'active';

    if doctor_clinic is distinct from rdv_row.cabinet_id then
      raise exception 'doctor must belong to the same clinic';
    end if;
  end if;

  -- Check for existing active/waiting visit
  select * into visit_row
  from public.visits
  where rdv_id = p_rdv_id
    and status <> 'cancelled'
  order by created_at desc
  limit 1
  for update;

  if found then
    if visit_row.status in ('consultation', 'billing', 'completed') then
      raise exception 'visit already advanced';
    end if;

    if visit_row.doctor_id is distinct from resolved_doctor_id then
      qn := public.mm_next_queue_number(rdv_row.cabinet_id, resolved_doctor_id, current_date);
    else
      qn := visit_row.queue_number;
    end if;

    update public.visits
    set doctor_id = resolved_doctor_id,
        queue_number = qn,
        status = 'waiting',
        waiting_at = coalesce(waiting_at, now()),
        updated_by = auth.uid(),
        updated_at = now()
    where id = visit_row.id
    returning * into visit_row;
  else
    qn := public.mm_next_queue_number(rdv_row.cabinet_id, resolved_doctor_id, current_date);

    insert into public.visits (
      clinic_id,
      patient_id,
      rdv_id,
      source,
      doctor_id,
      status,
      queue_date,
      queue_number,
      queue_sort_at,
      queued_at,
      waiting_at,
      created_by,
      updated_by
    ) values (
      rdv_row.cabinet_id,
      rdv_row.patient_id,
      rdv_row.id,
      'appointment',
      resolved_doctor_id,
      'waiting',
      current_date,
      qn,
      now(),
      now(),
      now(),
      auth.uid(),
      auth.uid()
    )
    returning * into visit_row;
  end if;

  -- Synchronize rdv arrival_status
  update public.rdv
  set arrival_status = 'WAITING',
      arrived_at = coalesce(arrived_at, now())
  where id = p_rdv_id;

  perform public.write_audit_log(
    'VISIT_CREATED_FROM_RDV',
    'visit',
    visit_row.id,
    null,
    to_jsonb(visit_row),
    jsonb_build_object('rdv_id', p_rdv_id, 'queue_number', qn, 'doctor_id', resolved_doctor_id)
  );

  return visit_row;
end;
$$;


ALTER FUNCTION "public"."create_visit_from_rdv"("p_rdv_id" "uuid", "p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_walk_in_visit"("p_patient_id" "uuid", "p_doctor_id" "uuid") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  patient_clinic uuid;
  doctor_clinic uuid;
  qn integer;
  visit_row public.visits%rowtype;
begin
  if not (public.is_admin() or public.mm_has_permission('waiting_room.add_patient')) then
    raise exception 'not authorized';
  end if;

  select cabinet_id into patient_clinic from public.patients where id = p_patient_id;
  if patient_clinic is null then
    raise exception 'patient not found';
  end if;
  perform public.mm_assert_same_clinic(patient_clinic);

  select coalesce(clinic_id, cabinet_id) into doctor_clinic
  from public.profiles
  where id = p_doctor_id
    and public.mm_role_key(role) = 'doctor'
    and status = 'active';

  if doctor_clinic is distinct from patient_clinic then
    raise exception 'doctor must belong to the same clinic';
  end if;

  qn := public.mm_next_queue_number(patient_clinic, p_doctor_id, current_date);

  insert into public.visits (
    clinic_id, patient_id, source, doctor_id, status,
    queue_date, queue_number, queue_sort_at, queued_at, arrived_at, waiting_at,
    created_by, updated_by
  )
  values (
    patient_clinic, p_patient_id, 'walk_in', p_doctor_id, 'waiting',
    current_date, qn, now(), now(), now(), now(), auth.uid(), auth.uid()
  )
  returning * into visit_row;

  perform public.write_audit_log('VISIT_CREATED_WALK_IN', 'visit', visit_row.id, null, to_jsonb(visit_row), null);
  perform public.write_audit_log('PATIENT_WAITING', 'visit', visit_row.id, null, to_jsonb(visit_row), null);

  return visit_row;
end;
$$;


ALTER FUNCTION "public"."create_walk_in_visit"("p_patient_id" "uuid", "p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_clinic_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.clinic_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.clinic_id IS NOT NULL
  LIMIT 1
$$;


ALTER FUNCTION "public"."current_clinic_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (select public.mm_role_key(p.role) from public.profiles p where p.id = auth.uid() limit 1),
    ''
  )
$$;


ALTER FUNCTION "public"."current_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_payment_guarded"("p_payment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_payment public.payments%rowtype; v_facture public.consultations%rowtype;
  v_net numeric; v_paye numeric; v_new_statut text;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
  PERFORM public.mm_assert_same_clinic(v_payment.clinic_id);

  SELECT * INTO v_facture FROM public.consultations WHERE id = v_payment.consultation_id FOR UPDATE;
  DELETE FROM public.payments WHERE id = p_payment_id;

  v_net := public.get_facture_net(v_facture.id);
  SELECT COALESCE(SUM(amount), 0) INTO v_paye FROM public.payments WHERE consultation_id = v_facture.id AND status != 'cancelled';

  IF v_paye = 0 THEN
    IF v_facture.date_echeance < CURRENT_DATE THEN v_new_statut := 'en_retard';
    ELSE v_new_statut := 'en_attente'; END IF;
  ELSIF v_paye < (v_net - 0.05) THEN
    v_new_statut := 'partielle';
  ELSE
    v_new_statut := 'payee';
  END IF;

  UPDATE public.consultations SET statut = v_new_statut WHERE id = v_facture.id;

  PERFORM public.write_audit_log('PAYMENT_DELETED', 'payment', p_payment_id, jsonb_build_object('amount', v_payment.amount, 'method', v_payment.method, 'consultation_id', v_payment.consultation_id), NULL, NULL);
  PERFORM public.write_audit_log('FACTURE_STATUS_UPDATED', 'consultation', v_facture.id, jsonb_build_object('statut', v_facture.statut), jsonb_build_object('statut', v_new_statut), NULL);
END;
$$;


ALTER FUNCTION "public"."delete_payment_guarded"("p_payment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."emit_facture"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_facture public.consultations%rowtype;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  SELECT * INTO v_facture FROM public.consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  PERFORM public.mm_assert_same_clinic(COALESCE(v_facture.clinic_id, v_facture.cabinet_id));
  IF v_facture.statut != 'brouillon' THEN RAISE EXCEPTION 'Seul un brouillon peut etre emis'; END IF;

  UPDATE public.consultations
  SET statut = 'en_attente', numero = public.mm_next_facture_numero(COALESCE(clinic_id, cabinet_id)),
      emitted_at = now(), date_echeance = CURRENT_DATE + interval '30 days'
  WHERE id = p_id;

  PERFORM public.write_audit_log('FACTURE_EMITTED', 'consultation', p_id, jsonb_build_object('statut', 'brouillon'), jsonb_build_object('statut', 'en_attente'), NULL);
END;
$$;


ALTER FUNCTION "public"."emit_facture"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_clinic_secretary_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if exists (select 1 from public.clinics c where c.secretary_id = new.id)
     and lower(coalesce(new.role, '')) <> all(array['secretaire', 'secretary']) then
    raise exception
      'profile % is a clinic''s secretary (clinics.secretary_id) and cannot be set to role %',
      new.id, new.role;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_clinic_secretary_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_founding_doctor_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_is_founder boolean;
begin
  select exists(select 1 from public.cabinets k where k.tenant_id = new.id)
      or exists(select 1 from public.clinics c where c.owner_id = new.id)
    into v_is_founder;

  if v_is_founder and lower(coalesce(new.role, '')) <> all(array['docteur', 'doctor', 'medecin', 'médecin']) then
    raise exception
      'profile % is a clinic''s founding doctor (cabinets.tenant_id / clinics.owner_id) and cannot be set to role %',
      new.id, new.role;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_founding_doctor_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_single_consultation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN

  IF NEW.status = 'IN_CONSULTATION'::patient_status THEN
    IF EXISTS (
      SELECT 1 FROM public.rdv
      WHERE status = 'IN_CONSULTATION'::patient_status
      AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'Another consultation is already active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_single_consultation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_profile_clinic_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.clinic_id IS NULL
     AND NEW.cabinet_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = NEW.cabinet_id) THEN
    NEW.clinic_id := NEW.cabinet_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ensure_profile_clinic_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exam_orders_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."exam_orders_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."facturation_tva"() RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  RETURN 0.20;
END;
$$;


ALTER FUNCTION "public"."facturation_tva"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_debiteurs"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_clinic uuid := public.current_clinic_id();
  v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;

  WITH deb_factures AS (
    SELECT c.id, c.patient_id, p.nom, p.prenom, c.numero, c.date_echeance, c.relance,
           public.get_facture_net(c.id) AS net,
           COALESCE((SELECT SUM(amount) FROM public.payments WHERE consultation_id = c.id AND status != 'cancelled'), 0) AS paye
    FROM public.consultations c
    JOIN public.patients p ON p.id = c.patient_id
    WHERE COALESCE(c.clinic_id, c.cabinet_id) = v_clinic
      AND c.statut NOT IN ('payee', 'annulee', 'brouillon')
  ),
  deb_patients AS (
    SELECT patient_id, nom, prenom,
           SUM(net - paye) AS reste_du,
           COUNT(id) AS nb_factures,
           MAX(CURRENT_DATE - date_echeance) AS retard_max,
           jsonb_agg(jsonb_build_object(
             'id', id, 'numero', numero, 'echeance', date_echeance, 'reste', (net - paye), 'relance', relance
           )) AS factures
    FROM deb_factures
    WHERE (net - paye) > 0
    GROUP BY patient_id, nom, prenom
  )
  SELECT COALESCE(jsonb_agg(row_to_json(deb_patients)), '[]'::jsonb) INTO v_result FROM deb_patients;
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_debiteurs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_facturation_stats"("p_periode" integer, "p_praticien" "uuid", "p_assureur" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_clinic uuid := public.current_clinic_id();
  v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;

  WITH factures AS (
    SELECT c.id, c.statut, c.date_echeance, c.date_consult, c.emitted_at, c.doctor_id, p.mutuelle,
           public.get_facture_net(c.id) AS net,
           COALESCE((SELECT SUM(amount) FROM public.payments WHERE consultation_id = c.id AND status != 'cancelled'), 0) AS paye
    FROM public.consultations c
    LEFT JOIN public.patients p ON p.id = c.patient_id
    WHERE COALESCE(c.clinic_id, c.cabinet_id) = v_clinic
      AND c.statut != 'brouillon'
      AND (p_periode IS NULL OR c.emitted_at >= (now() - (p_periode || ' days')::interval))
      AND (p_praticien IS NULL OR c.doctor_id = p_praticien)
      AND (p_assureur IS NULL OR p.mutuelle::text = p_assureur)
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
       'caNet', COALESCE(SUM(net), 0),
       'encaisse', COALESCE(SUM(paye), 0),
       'reste', COALESCE(SUM(net - paye), 0),
       'panier', CASE WHEN COUNT(*) > 0 THEN SUM(net)/COUNT(*) ELSE 0 END,
       'count', COUNT(*)
    ),
    'ageing', jsonb_build_object(
       '0_30', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance BETWEEN 0 AND 30 AND statut NOT IN ('payee','annulee')), 0),
       '31_60', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance BETWEEN 31 AND 60 AND statut NOT IN ('payee','annulee')), 0),
       '61_90', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance BETWEEN 61 AND 90 AND statut NOT IN ('payee','annulee')), 0),
       '90_plus', COALESCE(SUM(net - paye) FILTER (WHERE CURRENT_DATE - date_echeance > 90 AND statut NOT IN ('payee','annulee')), 0)
    ),
    'statutDistribution', (
       SELECT COALESCE(jsonb_object_agg(st.statut, st.cnt), '{}'::jsonb) FROM (
         SELECT statut, COUNT(*) as cnt FROM factures GROUP BY statut
       ) st
    ),
    'dso', (
       SELECT COALESCE(AVG(EXTRACT(DAY FROM (p.paid_at - c.emitted_at))), 0)
       FROM public.payments p
       JOIN public.consultations c ON p.consultation_id = c.id
       WHERE c.id IN (SELECT id FROM factures) AND p.status != 'cancelled'
    )
  ) INTO v_result
  FROM factures;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_facturation_stats"("p_periode" integer, "p_praticien" "uuid", "p_assureur" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_facture_net"("p_consultation_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_ht numeric;
  v_remise numeric;
BEGIN
  SELECT COALESCE(SUM(prix_unitaire_snapshot * quantite), 0) INTO v_ht
  FROM public.facture_lignes WHERE consultation_id = p_consultation_id;
  SELECT COALESCE(remise, 0) INTO v_remise FROM public.consultations WHERE id = p_consultation_id;
  RETURN (v_ht * (1 - (v_remise / 100.0))) * (1 + public.facturation_tva());
END;
$$;


ALTER FUNCTION "public"."get_facture_net"("p_consultation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_cabinet_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
SELECT cabinet_id
FROM profiles
WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."get_user_cabinet_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  meta_cabinet_id uuid;
  new_cabinet_id uuid;
  user_role text;
  user_nom text;
  cabinet_nom text;
begin
  meta_cabinet_id := nullif(new.raw_user_meta_data->>'cabinet_id', '')::uuid;
  user_role := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'docteur');
  user_nom := coalesce(nullif(new.raw_user_meta_data->>'nom_complet', ''), new.email);
  cabinet_nom := nullif(new.raw_user_meta_data->>'nom_cabinet', '');

  if meta_cabinet_id is not null then
    -- Staff invite: link to the existing cabinet (its clinics row already exists)
    insert into public.profiles (id, cabinet_id, role, nom_complet)
    values (new.id, meta_cabinet_id, user_role, user_nom)
    on conflict (id) do update
      set cabinet_id = excluded.cabinet_id,
          role = excluded.role,
          nom_complet = excluded.nom_complet;

  elsif cabinet_nom is not null then
    -- Doctor signup: cabinet + clinic (same id) + profile
    insert into public.cabinets (tenant_id, nom, ville, telephone)
    values (
      new.id,
      cabinet_nom,
      nullif(new.raw_user_meta_data->>'ville', ''),
      nullif(new.raw_user_meta_data->>'telephone', '')
    )
    returning id into new_cabinet_id;

    insert into public.clinics (id, owner_id, name)
    values (new_cabinet_id, new.id, cabinet_nom)
    on conflict (id) do nothing;

    -- ensure_profile_clinic_id() now finds the clinics row and sets clinic_id
    insert into public.profiles (id, cabinet_id, role, nom_complet)
    values (new.id, new_cabinet_id, user_role, user_nom)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_any_role"("required_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select public.current_role() = 'admin'
    or public.current_role() = any(required_roles)
$$;


ALTER FUNCTION "public"."has_any_role"("required_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(public.current_role() = 'admin', false)
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm__clinical_text_listed"("p" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select btrim(coalesce(p, '')) <> ''
     and lower(btrim(p)) not in ('aucune', 'aucun', 'aucunes', 'aucuns', 'néant', 'neant', 'rien', 'ras', 'r.a.s', 'r.a.s.', 'non', '-', '--', '/', '0', 'nr', 'n/a')
$$;


ALTER FUNCTION "public"."mm__clinical_text_listed"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm__parse_num"("p" "text") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $_$
  select case
    when replace(btrim(coalesce(p, '')), ',', '.') ~ '^\d{1,5}(\.\d{1,2})?$'
      then replace(btrim(p), ',', '.')::numeric
    else null
  end
$_$;


ALTER FUNCTION "public"."mm__parse_num"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_accept_invitation"("p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_row
  from public.invitations
  where token_hash = public.mm_hash_invitation_token(p_token)
  for update;

  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_finalize_invitation_acceptance(v_row);
end;
$$;


ALTER FUNCTION "public"."mm_accept_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_accept_invitation_by_email"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.invitations%rowtype;
  v_auth_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select lower(trim(email)) into v_auth_email from auth.users where id = auth.uid();

  select * into v_row
  from public.invitations
  where lower(email) = v_auth_email and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_finalize_invitation_acceptance(v_row);
end;
$$;


ALTER FUNCTION "public"."mm_accept_invitation_by_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_assert_permission"("p_permission" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.mm_has_permission(p_permission) then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', null, null, null,
      jsonb_build_object('required_permission', p_permission, 'actual_role', public.current_role())
    );
    raise exception 'not authorized';
  end if;
end;
$$;


ALTER FUNCTION "public"."mm_assert_permission"("p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_assert_role"("required_roles" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.has_any_role(required_roles) then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      'security',
      null,
      null,
      null,
      jsonb_build_object('required_roles', required_roles, 'actual_role', public.current_role())
    );
    raise exception 'not authorized';
  end if;
end;
$$;


ALTER FUNCTION "public"."mm_assert_role"("required_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_assert_same_clinic"("p_clinic_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  if p_clinic_id is distinct from public.current_clinic_id() then
    perform public.write_audit_log(
      'CROSS_CLINIC_ACCESS_BLOCKED',
      'security',
      null,
      null,
      null,
      jsonb_build_object('target_clinic_id', p_clinic_id)
    );
    raise exception 'cross-clinic access denied';
  end if;
end;
$$;


ALTER FUNCTION "public"."mm_assert_same_clinic"("p_clinic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_cabinet_creates_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- owner_id is a foreign key to auth.users and nullable: never let a cabinet insert fail because of it
  insert into public.clinics (id, owner_id, name)
  values (
    new.id,
    (select u.id from auth.users u where u.id = new.tenant_id),
    coalesce(nullif(new.nom, ''), 'Cabinet')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."mm_cabinet_creates_clinic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_cancel_ordonnance"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance public.ordonnances%rowtype;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', p_id, null, null,
      jsonb_build_object('action', 'mm_cancel_ordonnance', 'actual_role', public.current_role())
    );
    raise exception 'not authorized';
  end if;

  select * into v_ordonnance from public.ordonnances where id = p_id;
  if not found or v_ordonnance.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;
  if v_ordonnance.statut = 'annulee' then
    raise exception 'ordonnance already cancelled';
  end if;

  update public.ordonnances
  set statut = 'annulee', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_id;

  perform public.write_audit_log(
    'ORDONNANCE_CANCELLED', 'ordonnance', p_id,
    jsonb_build_object('statut', v_ordonnance.statut), jsonb_build_object('statut', 'annulee'), null
  );
end;
$$;


ALTER FUNCTION "public"."mm_cancel_ordonnance"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_complete_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer, "p_billing_amount" numeric DEFAULT NULL::numeric, "p_billing_type" "text" DEFAULT 'cash'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.clinical_encounters%rowtype;
  v_vit jsonb;
  v_sys numeric; v_dia numeric; v_hr numeric; v_temp numeric; v_spo2 numeric; v_w numeric; v_h numeric;
  v_fr numeric; v_gly numeric; v_eva numeric;
  v_any boolean;
  v_raw text;
  v_amount numeric := coalesce(p_billing_amount, 0);
  v_visit public.visits%rowtype;
  v_have_visit boolean := false;
  v_next text;
  v_pay_status text;
  v_pay_method text;
  v_handoff text := 'none';
  v_visit_before jsonb;
  v_qn integer;
  v_rdv uuid;
begin
  perform public.mm_assert_role(array['doctor']);

  if p_note is null or jsonb_typeof(p_note) is distinct from 'object' then
    raise exception 'invalid note';
  end if;
  if pg_column_size(p_note) > 200000 then raise exception 'note too large'; end if;
  if p_billing_type is null or p_billing_type not in ('cash', 'insurance', 'package', 'free') then
    raise exception 'invalid billing type';
  end if;
  if v_amount < 0 or v_amount > 1000000 then raise exception 'invalid billing amount'; end if;

  select * into v_row from public.clinical_encounters where id = p_id for update;
  if not found then raise exception 'encounter not found'; end if;
  perform public.mm_assert_same_clinic(v_row.clinic_id);
  if v_row.doctor_id is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if v_row.status is distinct from 'draft' then raise exception 'encounter is not editable'; end if;
  if v_row.version is distinct from p_expected_version then raise exception 'version conflict'; end if;

  if btrim(coalesce(p_note->>'motif', '')) = '' then raise exception 'motif required'; end if;

  if btrim(coalesce(p_note->>'pregnancyStatus', '')) <> ''
     and p_note->>'pregnancyStatus' not in ('non', 'oui', 'allaitement', 'inconnu') then
    raise exception 'invalid note';
  end if;

  v_vit := case when jsonb_typeof(p_note->'vitals') = 'object' then p_note->'vitals' else '{}'::jsonb end;

  v_sys  := public.mm__parse_num(v_vit->>'bloodPressureSystolic');
  v_dia  := public.mm__parse_num(v_vit->>'bloodPressureDiastolic');
  v_hr   := public.mm__parse_num(v_vit->>'heartRate');
  v_temp := public.mm__parse_num(v_vit->>'temperature');
  v_spo2 := public.mm__parse_num(v_vit->>'oxygenSaturation');
  v_w    := public.mm__parse_num(v_vit->>'weight');
  v_h    := public.mm__parse_num(v_vit->>'height');
  v_fr   := public.mm__parse_num(v_vit->>'respiratoryRate');
  v_gly  := public.mm__parse_num(v_vit->>'bloodSugar');
  v_eva  := public.mm__parse_num(v_vit->>'painScore');

  -- A vital that was typed but is malformed or impossible is rejected rather
  -- than silently dropped from the medical record. Bounds = ABSOLUTE bounds of
  -- src/lib/vitals/validateVital.ts (TO VALIDATE WITH A PHYSICIAN).
  foreach v_raw in array array['bloodPressureSystolic','bloodPressureDiastolic','heartRate','temperature','oxygenSaturation','weight','height','respiratoryRate','bloodSugar','painScore'] loop
    if btrim(coalesce(v_vit->>v_raw, '')) <> ''
       and public.mm__parse_num(v_vit->>v_raw) is null then
      raise exception 'invalid vitals';
    end if;
  end loop;
  if (v_sys is not null and (v_sys < 50 or v_sys > 300))
     or (v_dia is not null and (v_dia < 20 or v_dia > 200))
     or (v_hr is not null and (v_hr < 20 or v_hr > 300))
     or (v_temp is not null and (v_temp < 25 or v_temp > 45))
     or (v_spo2 is not null and (v_spo2 < 50 or v_spo2 > 100))
     or (v_w is not null and (v_w < 0.3 or v_w > 350))
     or (v_h is not null and (v_h < 30 or v_h > 250))
     or (v_fr is not null and (v_fr < 4 or v_fr > 80))
     or (v_gly is not null and (v_gly < 0.1 or v_gly > 8))
     or (v_eva is not null and (v_eva < 0 or v_eva > 10 or v_eva <> trunc(v_eva))) then
    raise exception 'invalid vitals';
  end if;
  if (v_sys is null) is distinct from (v_dia is null) then
    raise exception 'invalid vitals';
  end if;
  if v_sys is not null and round(v_sys) <= round(v_dia) then
    raise exception 'invalid vitals';
  end if;

  update public.clinical_encounters
  set note = p_note, status = 'completed', completed_at = now(),
      version = version + 1, updated_at = now()
  where id = p_id
  returning * into v_row;

  v_any := v_sys is not null or v_hr is not null or v_temp is not null
           or v_spo2 is not null or v_w is not null or v_h is not null
           or v_fr is not null or v_gly is not null or v_eva is not null;
  if v_any then
    insert into public.patient_vitals (
      patient_id, cabinet_id, date_mesure, blood_pressure, heart_rate,
      temperature, spo2, weight, height, fr, blood_sugar, douleur_eva, created_by
    ) values (
      v_row.patient_id, v_row.clinic_id, now(),
      case when v_sys is not null then round(v_sys)::int || '/' || round(v_dia)::int end,
      round(v_hr)::int, round(v_temp, 1), round(v_spo2)::int, round(v_w, 1), round(v_h, 1),
      round(v_fr)::smallint, round(v_gly, 2), round(v_eva)::smallint,
      auth.uid()
    );
  end if;

  -- ---- workflow hand-off (IN_CONSULTATION -> TO_BE_PAID) — unchanged ----
  if v_row.visit_id is not null then
    select * into v_visit from public.visits where id = v_row.visit_id for update;
    v_have_visit := found;
  elsif v_row.rdv_id is not null then
    select * into v_visit from public.visits
     where rdv_id = v_row.rdv_id and status <> 'cancelled'
     order by created_at desc limit 1 for update;
    v_have_visit := found;
  end if;

  if not v_have_visit and v_row.rdv_id is not null then
    v_qn := public.mm_next_queue_number(v_row.clinic_id, auth.uid(), current_date);
    insert into public.visits (
      clinic_id, patient_id, rdv_id, source, doctor_id, status,
      queue_date, queue_number, queue_sort_at, queued_at, waiting_at,
      consultation_start_at, created_by, updated_by
    ) values (
      v_row.clinic_id, v_row.patient_id, v_row.rdv_id, 'appointment', auth.uid(), 'consultation',
      current_date, v_qn, v_row.started_at, v_row.started_at, v_row.started_at,
      v_row.started_at, auth.uid(), auth.uid()
    )
    returning * into v_visit;
    v_have_visit := true;
  end if;

  if v_have_visit
     and v_visit.status in ('waiting', 'called', 'consultation')
     and (v_visit.doctor_id is not distinct from auth.uid() or public.is_admin()) then

    v_visit_before := to_jsonb(v_visit);

    if p_billing_type in ('cash', 'insurance') and v_amount > 0 then
      v_next := 'billing';
      v_pay_status := 'pending';
      v_pay_method := case when p_billing_type = 'insurance' then 'insurance' else null end;
    else
      v_next := 'completed';
      v_pay_status := 'waived';
      v_pay_method := p_billing_type;
    end if;

    update public.visits
    set status = v_next,
        consultation_start_at = coalesce(consultation_start_at, v_row.started_at),
        consultation_end_at = now(),
        billing_at = case when v_next = 'billing' then now() else billing_at end,
        completed_at = case when v_next = 'completed' then now() else completed_at end,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_visit.id
    returning * into v_visit;

    insert into public.payments (
      clinic_id, visit_id, patient_id, amount, method, status, received_by, paid_at
    ) values (
      v_visit.clinic_id, v_visit.id, v_visit.patient_id, v_amount, v_pay_method, v_pay_status,
      case when v_pay_status = 'waived' then auth.uid() end,
      case when v_pay_status = 'waived' then now() end
    )
    on conflict (visit_id) where status in ('pending', 'paid', 'waived')
    do update set amount = excluded.amount, method = excluded.method,
                  status = excluded.status, updated_at = now()
    where public.payments.status = 'pending';

    v_rdv := coalesce(v_visit.rdv_id, v_row.rdv_id);
    if v_rdv is not null then
      update public.rdv
      set arrival_status = 'LEFT',
          status = 'completed',
          consultation_completed_at = now(),
          payment_status = case when v_next = 'billing' then 'UNPAID' else 'NOT_REQUIRED' end
      where id = v_rdv and cabinet_id = v_visit.clinic_id;
    end if;

    perform public.write_audit_log(
      case when v_next = 'billing' then 'PATIENT_READY_FOR_PAYMENT' else 'VISIT_COMPLETED_NO_PAYMENT_REQUIRED' end,
      'visit', v_visit.id, v_visit_before, to_jsonb(v_visit),
      jsonb_build_object('billing_type', p_billing_type, 'amount', v_amount, 'encounter_id', v_row.id)
    );
    v_handoff := v_next;
  end if;

  perform public.write_audit_log(
    'ENCOUNTER_COMPLETED', 'clinical_encounter', v_row.id, null,
    jsonb_build_object('status', v_row.status, 'version', v_row.version, 'patient_id', v_row.patient_id, 'handoff', v_handoff),
    null
  );

  return jsonb_build_object('encounter', to_jsonb(v_row), 'handoff', v_handoff, 'visit_id', case when v_have_visit then v_visit.id end);
end;
$$;


ALTER FUNCTION "public"."mm_complete_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer, "p_billing_amount" numeric, "p_billing_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_create_invitation"("p_email" "text", "p_role" "text" DEFAULT 'secretaire'::"text") RETURNS TABLE("id" "uuid", "raw_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_clinic_id uuid;
  v_email text;
  v_role text;
  v_raw_token text;
  v_existing_id uuid;
  v_other_clinic_id uuid;
  v_row public.invitations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'no clinic associated with this account';
  end if;

  v_email := lower(trim(p_email));
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid email';
  end if;

  v_role := public.mm_role_key(p_role);
  if v_role is distinct from 'secretary' then
    raise exception 'role not allowed for invitation';
  end if;
  v_role := 'secretaire';

  if exists (
    select 1 from public.profiles pr
    where pr.clinic_id = v_clinic_id and lower(pr.email) = v_email
  ) then
    raise exception 'email already belongs to a member of this clinic';
  end if;

  select pr.clinic_id into v_other_clinic_id
  from public.profiles pr
  where lower(pr.email) = v_email and pr.clinic_id is not null and pr.clinic_id is distinct from v_clinic_id
  limit 1;

  if v_other_clinic_id is not null then
    raise exception 'email already belongs to another clinic';
  end if;

  select inv.id into v_existing_id
  from public.invitations inv
  where inv.clinic_id = v_clinic_id and lower(inv.email) = v_email and inv.role = v_role and inv.status = 'pending';

  if v_existing_id is not null then
    raise exception 'duplicate pending invitation';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations (
    clinic_id, invited_by, first_name, last_name, email, role, token_hash, status, expires_at
  )
  values (
    v_clinic_id, auth.uid(), '', '', v_email, v_role,
    public.mm_hash_invitation_token(v_raw_token), 'pending', now() + interval '7 days'
  )
  returning * into v_row;

  perform public.write_audit_log(
    'INVITATION_CREATED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_email, 'role', v_role),
    null
  );

  return query select v_row.id, v_raw_token, v_row.expires_at;
end;
$_$;


ALTER FUNCTION "public"."mm_create_invitation"("p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_create_ordonnance"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid" DEFAULT NULL::"uuid", "p_date_prescription" "date" DEFAULT CURRENT_DATE, "p_entete" "jsonb" DEFAULT '{}'::"jsonb", "p_instructions" "text" DEFAULT NULL::"text", "p_lignes" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance_id uuid;
  v_ligne jsonb;
  v_ordre int := 0;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);

  if not exists (
    select 1 from public.patients where id = p_patient_id and cabinet_id = v_cabinet_id
  ) then
    raise exception 'patient not found in current clinic';
  end if;

  if p_encounter_id is not null and not exists (
    select 1 from public.clinical_encounters where id = p_encounter_id and patient_id = p_patient_id
  ) then
    raise exception 'encounter does not match patient';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_doctor_id and cabinet_id = v_cabinet_id and public.mm_role_key(role) = 'doctor'
  ) then
    raise exception 'doctor not found in current clinic';
  end if;

  insert into public.ordonnances (
    cabinet_id, patient_id, encounter_id, doctor_id, created_by,
    date_prescription, entete, instructions
  ) values (
    v_cabinet_id, p_patient_id, p_encounter_id, p_doctor_id, auth.uid(),
    coalesce(p_date_prescription, current_date), coalesce(p_entete, '{}'::jsonb), p_instructions
  )
  returning id into v_ordonnance_id;

  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
    values (
      v_ordonnance_id, v_ordre,
      v_ligne->>'medicament', v_ligne->>'posologie', v_ligne->>'duree'
    );
    v_ordre := v_ordre + 1;
  end loop;

  perform public.write_audit_log(
    'ORDONNANCE_CREATED', 'ordonnance', v_ordonnance_id, null,
    jsonb_build_object('patient_id', p_patient_id, 'statut', 'brouillon'), null
  );

  return v_ordonnance_id;
end;
$$;


ALTER FUNCTION "public"."mm_create_ordonnance"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_duplicate_ordonnance"("p_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_source public.ordonnances%rowtype;
  v_new_id uuid;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);

  select * into v_source from public.ordonnances where id = p_id;
  if not found or v_source.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;

  insert into public.ordonnances (
    cabinet_id, patient_id, encounter_id, doctor_id, created_by,
    date_prescription, entete, instructions
  ) values (
    v_source.cabinet_id, v_source.patient_id, v_source.encounter_id, v_source.doctor_id, auth.uid(),
    current_date, v_source.entete, v_source.instructions
  )
  returning id into v_new_id;

  insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
  select v_new_id, ordre, medicament, posologie, duree
  from public.ordonnance_lignes
  where ordonnance_id = p_id
  order by ordre;

  perform public.write_audit_log(
    'ORDONNANCE_DUPLICATED', 'ordonnance', v_new_id, null,
    jsonb_build_object('source_id', p_id), null
  );

  return v_new_id;
end;
$$;


ALTER FUNCTION "public"."mm_duplicate_ordonnance"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_emit_ordonnance"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance public.ordonnances%rowtype;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    perform public.write_audit_log(
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'security', p_id, null, null,
      jsonb_build_object('action', 'mm_emit_ordonnance', 'actual_role', public.current_role())
    );
    raise exception 'not authorized';
  end if;

  select * into v_ordonnance from public.ordonnances where id = p_id;
  if not found or v_ordonnance.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;
  if v_ordonnance.statut <> 'brouillon' then
    raise exception 'only draft ordonnances can be emitted';
  end if;

  update public.ordonnances
  set statut = 'emise', emitted_at = now(), emitted_by = auth.uid()
  where id = p_id;

  perform public.write_audit_log(
    'ORDONNANCE_EMITTED', 'ordonnance', p_id,
    jsonb_build_object('statut', 'brouillon'), jsonb_build_object('statut', 'emise'), null
  );
end;
$$;


ALTER FUNCTION "public"."mm_emit_ordonnance"("p_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exam_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "encounter_id" "uuid",
    "ordered_by" "uuid",
    "label" "text" NOT NULL,
    "category" "text" DEFAULT 'biologie'::"text" NOT NULL,
    "status" "text" DEFAULT 'demande'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "result_at" timestamp with time zone,
    "result_by" "uuid",
    "result_comment" "text",
    "result_file_path" "text",
    "result_file_name" "text",
    "result_file_mime" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "review_note" "text",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "exam_orders_category_check" CHECK (("category" = ANY (ARRAY['biologie'::"text", 'imagerie'::"text", 'autre'::"text"]))),
    CONSTRAINT "exam_orders_label_check" CHECK ((("char_length"("btrim"("label")) >= 1) AND ("char_length"("btrim"("label")) <= 300))),
    CONSTRAINT "exam_orders_result_comment_check" CHECK ((("result_comment" IS NULL) OR ("char_length"("result_comment") <= 2000))),
    CONSTRAINT "exam_orders_review_note_check" CHECK ((("review_note" IS NULL) OR ("char_length"("review_note") <= 2000))),
    CONSTRAINT "exam_orders_status_check" CHECK (("status" = ANY (ARRAY['demande'::"text", 'resultat'::"text", 'revu'::"text", 'annule'::"text"])))
);


ALTER TABLE "public"."exam_orders" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_exam_attach_result"("p_id" "uuid", "p_file_path" "text" DEFAULT NULL::"text", "p_file_name" "text" DEFAULT NULL::"text", "p_file_mime" "text" DEFAULT NULL::"text", "p_comment" "text" DEFAULT NULL::"text") RETURNS "public"."exam_orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.exam_orders%rowtype;
  v_before jsonb;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);
  v_row := public.mm_exam_lock(p_id);
  if v_row.status = 'annule' then raise exception 'exam cancelled'; end if;
  if nullif(btrim(coalesce(p_file_path, '')), '') is null and nullif(btrim(coalesce(p_comment, '')), '') is null then
    raise exception 'empty result';
  end if;
  if p_file_path is not null
     and p_file_path not like (v_row.cabinet_id::text || '/' || v_row.patient_id::text || '/' || v_row.id::text || '/%') then
    raise exception 'invalid file path';
  end if;
  if p_file_mime is not null and p_file_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception 'invalid file type';
  end if;

  v_before := to_jsonb(v_row);
  update public.exam_orders
  set status = 'resultat',
      result_at = now(),
      result_by = auth.uid(),
      result_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      result_file_path = coalesce(nullif(btrim(coalesce(p_file_path, '')), ''), result_file_path),
      result_file_name = case when nullif(btrim(coalesce(p_file_path, '')), '') is not null then left(p_file_name, 200) else result_file_name end,
      result_file_mime = case when nullif(btrim(coalesce(p_file_path, '')), '') is not null then p_file_mime else result_file_mime end,
      reviewed_at = null, reviewed_by = null, review_note = null
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log('EXAM_RESULT_ATTACHED', 'exam_order', v_row.id, v_before, to_jsonb(v_row), null);
  return v_row;
end;
$$;


ALTER FUNCTION "public"."mm_exam_attach_result"("p_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_mime" "text", "p_comment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_exam_cancel"("p_id" "uuid") RETURNS "public"."exam_orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.exam_orders%rowtype;
  v_before jsonb;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);
  v_row := public.mm_exam_lock(p_id);
  if v_row.status <> 'demande' then raise exception 'exam not pending'; end if;
  v_before := to_jsonb(v_row);
  update public.exam_orders
  set status = 'annule', cancelled_at = now(), cancelled_by = auth.uid()
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log('EXAM_CANCELLED', 'exam_order', v_row.id, v_before, to_jsonb(v_row), null);
  return v_row;
end;
$$;


ALTER FUNCTION "public"."mm_exam_cancel"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_exam_category"("p_label" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when p_label ~* '(radio|rx\M|[ée]cho|irm|scanner|tdm|mammo|doppler|imagerie|ost[ée]odensit|panoramique)' then 'imagerie'
    when p_label ~* '(ecg|[ée]lectrocardio|eeg|emg|holter|spirom|efr|fond d.?oeil|audiogram|endoscop|fibroscop|coloscop)' then 'autre'
    else 'biologie'
  end;
$$;


ALTER FUNCTION "public"."mm_exam_category"("p_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_exam_create"("p_patient_id" "uuid", "p_labels" "text"[]) RETURNS SETOF "public"."exam_orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cabinet uuid := public.get_user_cabinet_id();
  v_label text;
  v_row public.exam_orders%rowtype;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);
  if not exists (select 1 from public.patients where id = p_patient_id and cabinet_id = v_cabinet) then
    raise exception 'patient not found';
  end if;
  if p_labels is null or coalesce(array_length(p_labels, 1), 0) = 0 or array_length(p_labels, 1) > 30 then
    raise exception 'invalid labels';
  end if;
  foreach v_label in array p_labels loop
    if btrim(coalesce(v_label, '')) = '' then continue; end if;
    insert into public.exam_orders (cabinet_id, patient_id, ordered_by, label, category)
    values (v_cabinet, p_patient_id, auth.uid(), left(btrim(v_label), 300), public.mm_exam_category(v_label))
    returning * into v_row;
    perform public.write_audit_log('EXAM_REQUESTED', 'exam_order', v_row.id, null, to_jsonb(v_row), null);
    return next v_row;
  end loop;
end;
$$;


ALTER FUNCTION "public"."mm_exam_create"("p_patient_id" "uuid", "p_labels" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_exam_lock"("p_id" "uuid") RETURNS "public"."exam_orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.exam_orders%rowtype;
begin
  select * into v_row from public.exam_orders where id = p_id for update;
  if not found or v_row.cabinet_id is distinct from public.get_user_cabinet_id() then
    raise exception 'exam not found';
  end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."mm_exam_lock"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_exam_review"("p_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."exam_orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.exam_orders%rowtype;
  v_before jsonb;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);
  v_row := public.mm_exam_lock(p_id);
  if v_row.status <> 'resultat' then raise exception 'no result to review'; end if;
  v_before := to_jsonb(v_row);
  update public.exam_orders
  set status = 'revu', reviewed_at = now(), reviewed_by = auth.uid(),
      review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log('EXAM_RESULT_REVIEWED', 'exam_order', v_row.id, v_before, to_jsonb(v_row), null);
  return v_row;
end;
$$;


ALTER FUNCTION "public"."mm_exam_review"("p_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_exams_from_encounter"("p_encounter_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_enc public.clinical_encounters%rowtype;
  v_label text;
  v_count integer := 0;
begin
  select * into v_enc from public.clinical_encounters where id = p_encounter_id;
  if not found or v_enc.status is distinct from 'completed' then return 0; end if;
  if exists (select 1 from public.exam_orders where encounter_id = p_encounter_id) then return 0; end if;
  if jsonb_typeof(v_enc.note -> 'examens') is distinct from 'array' then return 0; end if;

  for v_label in
    select distinct on (lower(btrim(x))) btrim(x)
    from jsonb_array_elements_text(v_enc.note -> 'examens') as x
    where btrim(x) <> ''
    limit 30
  loop
    insert into public.exam_orders (cabinet_id, patient_id, encounter_id, ordered_by, label, category, requested_at)
    values (v_enc.clinic_id, v_enc.patient_id, v_enc.id, v_enc.doctor_id, left(v_label, 300),
            public.mm_exam_category(v_label), coalesce(v_enc.completed_at, now()));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."mm_exams_from_encounter"("p_encounter_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_execute_task_action"("p_task_id" "uuid", "p_action_key" "text", "p_action_role" "text", "p_note" "text" DEFAULT NULL::"text", "p_assign_to" "text" DEFAULT NULL::"text", "p_priority" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_task public.tasks%rowtype;
  v_before_task public.tasks%rowtype;
  v_patient public.patients%rowtype;
  v_patient_name text := '';
  v_doc_id uuid := null;
  v_new_doc_id uuid := null;
  v_new_assigned_to uuid := null;
  v_new_priority text;
  v_new_status text;
  v_actor_name text := '';
  v_actor_label text := '';
  v_timestamp_label text := '';
  v_log_line text := '';
  v_updated_description text := '';
begin
  -- 1. Must be authenticated
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- 2. Fetch the target task
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found';
  end if;
  v_before_task := v_task;

  -- 3. Assert clinic isolation boundary
  perform public.mm_assert_same_clinic(v_task.cabinet_id);

  -- 4. Server-side role assertions
  if p_action_role = 'doctor' then
    perform public.mm_assert_role(array['doctor', 'admin']);
  elsif p_action_role = 'secretary' then
    perform public.mm_assert_role(array['secretary', 'admin', 'doctor']);
    if public.current_role() = 'secretary' and not (
      public.mm_has_permission('tasks.update') or public.mm_has_permission('tasks.complete')
    ) then
      raise exception 'not authorized';
    end if;
  else
    raise exception 'invalid action role: %', p_action_role;
  end if;

  -- 5. Retrieve patient name if patient_id is present
  if v_task.patient_id is not null then
    select * into v_patient from public.patients where id = v_task.patient_id;
    v_patient_name := btrim(coalesce(v_patient.prenom, '') || ' ' || coalesce(v_patient.nom, ''));
  end if;

  -- 6. Option A: Clinical prescription renewal document creation
  if p_action_key = 'doctor_validate_prescription' then
    if v_task.patient_id is null then
      raise exception 'patient required for prescription renewal';
    end if;

    insert into public.documents (
      cabinet_id,
      patient_id,
      type_document,
      nom_fichier,
      storage_path,
      created_at
    ) values (
      v_task.cabinet_id,
      v_task.patient_id,
      'ordonnance',
      'Ordonnance_renouvellement_' || regexp_replace(coalesce(nullif(v_patient_name, ''), 'patient'), '\s+', '_', 'g') || '_' || to_char(now(), 'YYYYMMDD_HH24MI') || '.pdf',
      'renouvellements/' || v_task.id::text || '.pdf',
      now()
    ) returning id into v_doc_id;

    v_new_doc_id := v_doc_id;
  end if;

  -- 7. Build audit trail line
  select nom_complet into v_actor_name from public.profiles where id = auth.uid();
  v_actor_name := btrim(coalesce(v_actor_name, ''));
  if public.current_role() in ('doctor', 'admin') then
    -- One "Dr." in front, never two — shared rule, see mm_format_doctor_label().
    v_actor_label := public.mm_format_doctor_label(v_actor_name);
  else
    v_actor_label := 'Secrétariat';
  end if;

  v_timestamp_label := to_char(now() at time zone 'Africa/Casablanca', 'DD/MM à HH24:MI');
  v_log_line := '[' || v_actor_label || ' · ' || v_timestamp_label || '] ' || coalesce(p_note, 'Action validée');

  v_updated_description := case
    when v_task.description is null or length(btrim(v_task.description)) = 0 then v_log_line
    else v_task.description || E'\n' || v_log_line
  end;

  -- 8. Resolve assignee if supplied
  if p_assign_to is not null then
    if p_assign_to in ('secretary', 'secretaire') then
      v_new_assigned_to := null;
    elsif p_assign_to in ('me', 'currentUser') then
      v_new_assigned_to := auth.uid();
    else
      begin
        v_new_assigned_to := p_assign_to::uuid;
      exception when others then
        v_new_assigned_to := null;
      end;
    end if;
  else
    v_new_assigned_to := v_task.assigned_to;
  end if;

  -- 9. Resolve priority
  if p_priority is not null and p_priority in ('urgent', 'high', 'normal', 'low') then
    v_new_priority := p_priority;
  else
    v_new_priority := v_task.priority;
  end if;

  -- 10. Resolve status
  if p_status is not null and p_status in ('pending', 'in_progress', 'completed', 'cancelled') then
    v_new_status := p_status;
  elsif p_action_key = 'doctor_validate_prescription' then
    v_new_status := 'completed';
  else
    v_new_status := v_task.status;
  end if;

  -- 11. Update tasks record
  update public.tasks
  set
    description = v_updated_description,
    status = v_new_status,
    priority = v_new_priority,
    assigned_to = v_new_assigned_to,
    document_id = coalesce(v_new_doc_id, document_id),
    completed_at = case
      when v_new_status = 'completed' then coalesce(completed_at, now())
      else null
    end,
    completed_by = case
      when v_new_status = 'completed' then coalesce(completed_by, auth.uid())
      else null
    end,
    updated_at = now()
  where id = v_task.id
  returning * into v_task;

  -- 12. Log audit event
  perform public.write_audit_log(
    'TASK_ACTION_EXECUTED',
    'task',
    v_task.id,
    to_jsonb(v_before_task),
    to_jsonb(v_task),
    jsonb_build_object(
      'action_key', p_action_key,
      'action_role', p_action_role,
      'document_id', v_new_doc_id
    )
  );

  -- 13. Return jsonb with task row + patientName
  return jsonb_build_object(
    'id', v_task.id,
    'cabinet_id', v_task.cabinet_id,
    'patient_id', v_task.patient_id,
    'title', v_task.title,
    'description', v_task.description,
    'type', v_task.type,
    'priority', v_task.priority,
    'status', v_task.status,
    'due_date', v_task.due_date,
    'due_time', v_task.due_time,
    'assigned_to', v_task.assigned_to,
    'document_id', v_task.document_id,
    'created_by', v_task.created_by,
    'completed_by', v_task.completed_by,
    'completed_at', v_task.completed_at,
    'created_at', v_task.created_at,
    'updated_at', v_task.updated_at,
    'patientName', case when length(v_patient_name) > 0 then v_patient_name else null end
  );
end;
$$;


ALTER FUNCTION "public"."mm_execute_task_action"("p_task_id" "uuid", "p_action_key" "text", "p_action_role" "text", "p_note" "text", "p_assign_to" "text", "p_priority" "text", "p_status" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by" "uuid",
    "revoked_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['doctor'::"text", 'secretary'::"text", 'medecin'::"text", 'docteur'::"text", 'secretaire'::"text"]))),
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_finalize_invitation_acceptance"("v_row" "public"."invitations") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_email text;
  v_meta_first text;
  v_meta_last text;
  v_meta_nom text;
  v_meta_telephone text;
  v_existing_first text;
  v_existing_last text;
  v_existing_nom text;
  v_existing_telephone text;
  v_final_first text;
  v_final_last text;
  v_final_nom text;
  v_final_telephone text;
  v_clinic_secretary uuid;
  v_existing_clinic_id uuid;
  v_existing_onboarded timestamptz;
begin
  if v_row.status is distinct from 'pending' then
    raise exception 'invitation is % and cannot be accepted', v_row.status;
  end if;

  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    raise exception 'invitation has expired';
  end if;

  select lower(trim(u.email)),
         nullif(trim(u.raw_user_meta_data->>'first_name'), ''),
         nullif(trim(u.raw_user_meta_data->>'last_name'), ''),
         nullif(trim(u.raw_user_meta_data->>'nom_complet'), ''),
         nullif(trim(u.raw_user_meta_data->>'telephone'), '')
    into v_auth_email, v_meta_first, v_meta_last, v_meta_nom, v_meta_telephone
  from auth.users u where u.id = auth.uid();

  if v_auth_email is distinct from lower(trim(v_row.email)) then
    raise exception 'authenticated email does not match invitation';
  end if;

  -- Never silently move a genuine existing member from one clinic to another. A profile row that
  -- never finished onboarding (onboarding_completed_at null) is a leftover stub from an earlier,
  -- abandoned invite, not a membership, and does not block this one.
  select p.clinic_id, p.onboarding_completed_at into v_existing_clinic_id, v_existing_onboarded
  from public.profiles p where p.id = auth.uid();
  if v_existing_onboarded is not null and v_existing_clinic_id is distinct from v_row.clinic_id then
    raise exception 'account already belongs to another clinic';
  end if;

  select secretary_id into v_clinic_secretary
  from public.clinics where id = v_row.clinic_id for update;

  if v_clinic_secretary is not null then
    raise exception 'clinic already has an active secretary';
  end if;

  select p.first_name, p.last_name, p.nom_complet, p.telephone
    into v_existing_first, v_existing_last, v_existing_nom, v_existing_telephone
  from public.profiles p where p.id = auth.uid();

  v_final_first := coalesce(v_meta_first, v_existing_first);
  v_final_last := coalesce(v_meta_last, v_existing_last);
  v_final_telephone := coalesce(v_meta_telephone, v_existing_telephone);

  v_final_nom := case
    when v_meta_first is not null and v_meta_last is not null then trim(v_meta_first || ' ' || v_meta_last)
    when v_meta_first is not null then v_meta_first
    when v_meta_last is not null then v_meta_last
    when v_meta_nom is not null then v_meta_nom
    when v_existing_nom is not null and lower(v_existing_nom) is distinct from v_auth_email then v_existing_nom
    else split_part(v_auth_email, '@', 1)
  end;

  insert into public.profiles (
    id, email, cabinet_id, clinic_id, role, nom_complet, first_name, last_name, telephone, onboarding_completed_at
  )
  values (
    auth.uid(), v_auth_email, v_row.clinic_id, v_row.clinic_id, 'secretaire',
    v_final_nom, v_final_first, v_final_last, v_final_telephone, now()
  )
  on conflict (id) do update
    set cabinet_id = excluded.cabinet_id,
        clinic_id = excluded.clinic_id,
        role = 'secretaire',
        email = excluded.email,
        nom_complet = excluded.nom_complet,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        telephone = excluded.telephone,
        onboarding_completed_at = now();

  update public.clinics set secretary_id = auth.uid() where id = v_row.clinic_id;

  update public.invitations
  set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
  where id = v_row.id;

  perform public.write_audit_log(
    'INVITATION_ACCEPTED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email, 'role', v_row.role), null
  );
end;
$$;


ALTER FUNCTION "public"."mm_finalize_invitation_acceptance"("v_row" "public"."invitations") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_format_doctor_label"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select case when bare = '' then 'Médecin' else 'Dr. ' || bare end
  from (
    select btrim(regexp_replace(btrim(coalesce(p_name, '')), '^(docteur|dr)\y\.?\s*', '', 'i')) as bare
  ) s
$$;


ALTER FUNCTION "public"."mm_format_doctor_label"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_get_my_pending_invitation"() RETURNS TABLE("status" "text", "email" "text", "role" "text", "clinic_name" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_auth_email text;
  v_has_clinic boolean;
  v_row public.invitations%rowtype;
  v_clinic_name text;
  v_effective_status text;
begin
  if auth.uid() is null then
    return;
  end if;

  select lower(trim(u.email)) into v_auth_email
  from auth.users u where u.id = auth.uid();

  if v_auth_email is null then
    return;
  end if;

  -- If the caller already belongs to a clinic, they are an active member.
  -- Don't show them stale invitation states — return nothing so the
  -- welcome page redirects them to the dashboard instead of displaying
  -- a confusing "revoked" or "expired" screen.
  select exists(
    select 1 from public.profiles p
     where p.id = auth.uid()
       and (p.cabinet_id is not null or p.clinic_id is not null)
  ) into v_has_clinic;

  if v_has_clinic then
    return;
  end if;

  -- Prefer pending invitations over revoked/expired/accepted ones.
  -- The old query just did ORDER BY created_at DESC LIMIT 1, which meant
  -- a revoked invitation created AFTER a pending one would shadow it.
  select i.* into v_row
  from public.invitations i
  where lower(i.email) = v_auth_email
  order by
    case i.status
      when 'pending' then 0
      when 'accepted' then 1
      else 2
    end,
    i.created_at desc
  limit 1;

  if v_row is null then
    return;
  end if;

  v_effective_status := v_row.status;
  if v_effective_status = 'pending' and v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    v_effective_status := 'expired';
  end if;

  select c.nom into v_clinic_name
  from public.cabinets c where c.id = v_row.clinic_id;

  return query select
    v_effective_status,
    v_row.email,
    v_row.role,
    coalesce(v_clinic_name, 'votre cabinet'),
    v_row.expires_at;
end;
$$;


ALTER FUNCTION "public"."mm_get_my_pending_invitation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_get_my_permissions"() RETURNS TABLE("permission_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return;
  end if;

  v_role := public.current_role();

  if v_role = 'admin' then
    return query select p.key from public.permissions p;
    return;
  end if;

  return query
  select p.key
  from public.permissions p
  where coalesce(
    (select up.granted from public.user_permissions up where up.user_id = auth.uid() and up.permission_id = p.id),
    exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission_id = p.id)
  );
end;
$$;


ALTER FUNCTION "public"."mm_get_my_permissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_get_patient_clinical"("p_patient_id" "uuid") RETURNS TABLE("antecedents" "text", "allergies" "text", "groupe_sanguin" "text", "allergies_status" "text", "antecedents_status" "text", "medications_status" "text", "clinical_verified_at" timestamp with time zone, "clinical_verified_by" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clinic uuid;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    raise exception 'not authorized';
  end if;

  select p.cabinet_id into v_clinic from public.patients p where p.id = p_patient_id;
  if v_clinic is null then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_clinic);

  return query
  select p.antecedents, p.allergies, p.groupe_sanguin,
         p.allergies_status, p.antecedents_status, p.medications_status,
         p.clinical_verified_at, p.clinical_verified_by
  from public.patients p
  where p.id = p_patient_id
    and p.cabinet_id = public.current_clinic_id();
end;
$$;


ALTER FUNCTION "public"."mm_get_patient_clinical"("p_patient_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_get_user_permissions"("p_user_id" "uuid") RETURNS TABLE("permission_key" "text", "description" "text", "group" "text", "granted" boolean, "is_override" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_target_clinic uuid;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);

  select coalesce(pr.clinic_id, pr.cabinet_id) into v_target_clinic
  from public.profiles pr where pr.id = p_user_id;

  if v_target_clinic is distinct from public.current_clinic_id() then
    raise exception 'cross-clinic access denied';
  end if;

  return query
  select p.key,
         p.description,
         p."group",
         coalesce(up.granted, exists (
           select 1 from public.role_permissions rp where rp.role = 'secretary' and rp.permission_id = p.id
         )) as granted,
         (up.id is not null) as is_override
  from public.permissions p
  left join public.user_permissions up on up.permission_id = p.id and up.user_id = p_user_id
  order by p."group", p.key;
end;
$$;


ALTER FUNCTION "public"."mm_get_user_permissions"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_has_permission"("p_permission" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
  v_override boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_role := public.current_role();
  if v_role = 'admin' then
    return true;
  end if;

  select up.granted into v_override
  from public.user_permissions up
  join public.permissions p on p.id = up.permission_id
  where up.user_id = auth.uid() and p.key = p_permission;

  if v_override is not null then
    return v_override;
  end if;

  return exists (
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id = rp.permission_id
    where rp.role = v_role and p.key = p_permission
  );
end;
$$;


ALTER FUNCTION "public"."mm_has_permission"("p_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_hash_invitation_token"("p_token" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;


ALTER FUNCTION "public"."mm_hash_invitation_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_is_ordonnance_storage_path"("p_path" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.documents d
    where d.storage_path = p_path
      and d.type_document = 'ordonnance'
  );
$$;


ALTER FUNCTION "public"."mm_is_ordonnance_storage_path"("p_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_mark_appointment_arrived"("p_rdv_id" "uuid") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('appointments.mark_arrived');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.arrival_status != 'NOT_ARRIVED' then
    raise exception 'patient has already arrived or left';
  end if;

  update public.rdv
  set arrival_status = 'WAITING',
      arrived_at = now()
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log('APPOINTMENT_ARRIVED', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), null);

  return rdv_after;
end;
$$;


ALTER FUNCTION "public"."mm_mark_appointment_arrived"("p_rdv_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_next_facture_numero"("p_clinic_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_next_val integer;
BEGIN
  INSERT INTO public.clinic_sequences (clinic_id, sequence_type, last_value)
  VALUES (p_clinic_id, 'facture', 1)
  ON CONFLICT (clinic_id, sequence_type) DO UPDATE
    SET last_value = clinic_sequences.last_value + 1, updated_at = now()
  RETURNING last_value INTO v_next_val;
  RETURN 'FAC-' || LPAD(v_next_val::text, 4, '0');
END;
$$;


ALTER FUNCTION "public"."mm_next_facture_numero"("p_clinic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_next_queue_number"("p_clinic_id" "uuid", "p_doctor_id" "uuid", "p_queue_date" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  next_number integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text || ':' || p_doctor_id::text || ':' || p_queue_date::text));

  select coalesce(max(queue_number), 0) + 1
  into next_number
  from public.visits
  where clinic_id = p_clinic_id
    and doctor_id = p_doctor_id
    and queue_date = p_queue_date;

  return next_number;
end;
$$;


ALTER FUNCTION "public"."mm_next_queue_number"("p_clinic_id" "uuid", "p_doctor_id" "uuid", "p_queue_date" "date") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_encounters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "visit_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "note" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rdv_id" "uuid",
    CONSTRAINT "clinical_encounters_note_check" CHECK ((("jsonb_typeof"("note") = 'object'::"text") AND ("pg_column_size"("note") <= 200000))),
    CONSTRAINT "clinical_encounters_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'completed'::"text", 'voided'::"text"])))
);


ALTER TABLE "public"."clinical_encounters" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_open_encounter"("p_patient_id" "uuid", "p_visit_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."clinical_encounters"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_patient_clinic uuid;
  v_visit_id uuid;
  v_rdv_id uuid;
  v_row public.clinical_encounters%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select cabinet_id into v_patient_clinic from public.patients where id = p_patient_id;
  if not found then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_patient_clinic);

  if p_visit_id is not null then
    select id into v_visit_id from public.visits
     where id = p_visit_id and clinic_id = v_patient_clinic and patient_id = p_patient_id;
    if v_visit_id is null then
      select id into v_rdv_id from public.rdv
       where id = p_visit_id and cabinet_id = v_patient_clinic and patient_id = p_patient_id;
    end if;
  end if;

  insert into public.clinical_encounters (clinic_id, patient_id, doctor_id, visit_id, rdv_id)
  values (v_patient_clinic, p_patient_id, auth.uid(), v_visit_id, v_rdv_id)
  on conflict (doctor_id, patient_id) where status = 'draft'
  do update set
    visit_id = case
      when excluded.visit_id is not null or excluded.rdv_id is not null then excluded.visit_id
      when exists (select 1 from public.visits v
                    where v.id = public.clinical_encounters.visit_id
                      and v.status in ('waiting', 'called', 'consultation'))
        then public.clinical_encounters.visit_id
      else null
    end,
    rdv_id = case
      when excluded.visit_id is not null or excluded.rdv_id is not null then excluded.rdv_id
      when exists (select 1 from public.rdv r
                    where r.id = public.clinical_encounters.rdv_id
                      and r.status not in ('completed', 'cancelled'))
        then public.clinical_encounters.rdv_id
      else null
    end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."mm_open_encounter"("p_patient_id" "uuid", "p_visit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_ordonnance_from_encounter"("p_encounter_id" "uuid", "p_audit" boolean DEFAULT true) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_enc public.clinical_encounters%rowtype;
  v_doctor public.profiles%rowtype;
  v_cabinet public.cabinets%rowtype;
  v_lines jsonb;
  v_id uuid;
  v_at timestamptz;
begin
  select * into v_enc from public.clinical_encounters where id = p_encounter_id;
  if not found or v_enc.status <> 'completed' then return null; end if;
  if exists (select 1 from public.ordonnances where encounter_id = v_enc.id) then return null; end if;

  -- Non-blank medicament rows, in their written order.
  select coalesce(jsonb_agg(r order by ord), '[]'::jsonb) into v_lines
  from jsonb_array_elements(
         case when jsonb_typeof(v_enc.note -> 'traitements') = 'array' then v_enc.note -> 'traitements' else '[]'::jsonb end
       ) with ordinality as t(r, ord)
  where jsonb_typeof(r) = 'object' and length(btrim(coalesce(r ->> 'medicament', ''))) > 0;

  if jsonb_array_length(v_lines) = 0 then return null; end if;

  select * into v_doctor from public.profiles where id = v_enc.doctor_id;
  select * into v_cabinet from public.cabinets where id = v_enc.clinic_id;
  v_at := coalesce(v_enc.completed_at, now());

  insert into public.ordonnances (
    cabinet_id, patient_id, encounter_id, doctor_id, created_by,
    statut, date_prescription, entete, instructions, emitted_at, emitted_by
  ) values (
    v_enc.clinic_id, v_enc.patient_id, v_enc.id, v_enc.doctor_id, v_enc.doctor_id,
    'emise', (v_at at time zone 'Africa/Casablanca')::date,
    jsonb_build_object(
      'nomMedecin', coalesce(v_doctor.nom_complet, ''),
      'specialite', coalesce(to_jsonb(v_doctor) ->> 'specialite', 'Médecin généraliste'),
      'adresse', coalesce(v_cabinet.adresse, ''),
      'telephone', coalesce(v_cabinet.telephone, ''),
      'ville', coalesce(v_cabinet.ville, split_part(coalesce(v_cabinet.adresse, ''), ',', 1), ''),
      'signe', true,
      'source', 'consultation'
    ),
    null, v_at, v_enc.doctor_id
  )
  returning id into v_id;

  insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
  select v_id, (ord - 1)::int,
         left(btrim(r ->> 'medicament'), 500),
         nullif(left(btrim(coalesce(r ->> 'posologie', '')), 500), ''),
         nullif(left(btrim(coalesce(r ->> 'duree', '')), 500), '')
  from jsonb_array_elements(v_lines) with ordinality as t(r, ord);

  if p_audit then
    perform public.write_audit_log(
      'ORDONNANCE_FROM_ENCOUNTER', 'ordonnance', v_id, null,
      jsonb_build_object('encounter_id', v_enc.id, 'lignes', jsonb_array_length(v_lines)), null
    );
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."mm_ordonnance_from_encounter"("p_encounter_id" "uuid", "p_audit" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_payments_sync_amount_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'paid' and new.amount_paid < new.amount then
    new.amount_paid := new.amount;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."mm_payments_sync_amount_paid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_resend_invitation"("p_invitation_id" "uuid") RETURNS TABLE("id" "uuid", "raw_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.invitations%rowtype;
  v_raw_token text;
begin
  perform public.mm_assert_role(array['doctor']);

  select inv.* into v_row from public.invitations inv where inv.id = p_invitation_id for update;
  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_assert_same_clinic(v_row.clinic_id);

  if v_row.status is distinct from 'pending' then
    raise exception 'only a pending invitation can be resent';
  end if;

  if v_row.updated_at > now() - interval '60 seconds' then
    raise exception 'please wait before resending this invitation';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.invitations
  set token_hash = public.mm_hash_invitation_token(v_raw_token),
      expires_at = now() + interval '7 days'
  where public.invitations.id = v_row.id
  returning * into v_row;

  perform public.write_audit_log(
    'INVITATION_RESENT', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email), null
  );

  return query select v_row.id, v_raw_token, v_row.expires_at;
end;
$$;


ALTER FUNCTION "public"."mm_resend_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_resolve_owner_id"("p_candidate" "uuid", "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select coalesce(
    (select u.id from auth.users u where u.id = p_candidate limit 1),
    (select u.id from auth.users u where u.id = p_tenant_id limit 1),
    (
      select p.id
      from public.profiles p
      where (p.cabinet_id = p_candidate or p.clinic_id = p_candidate)
        and exists (select 1 from auth.users u where u.id = p.id)
      order by p.created_at nulls last
      limit 1
    )
  );
$$;


ALTER FUNCTION "public"."mm_resolve_owner_id"("p_candidate" "uuid", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_revoke_invitation"("p_invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.invitations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select * into v_row from public.invitations where id = p_invitation_id for update;
  if v_row is null then
    raise exception 'invitation not found';
  end if;

  perform public.mm_assert_same_clinic(v_row.clinic_id);

  if v_row.status is distinct from 'pending' then
    raise exception 'only a pending invitation can be revoked';
  end if;

  update public.invitations
  set status = 'revoked', revoked_at = now()
  where id = v_row.id;

  perform public.write_audit_log(
    'INVITATION_REVOKED', 'invitation', v_row.id, null,
    jsonb_build_object('email', v_row.email), null
  );
end;
$$;


ALTER FUNCTION "public"."mm_revoke_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_role_key"("raw_role" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case lower(coalesce(raw_role, ''))
    when 'admin' then 'admin'
    when 'doctor' then 'doctor'
    when 'docteur' then 'doctor'
    when 'medecin' then 'doctor'
    when 'médecin' then 'doctor'
    when 'secretary' then 'secretary'
    when 'secretaire' then 'secretary'
    when 'secrétaire' then 'secretary'
    else lower(coalesce(raw_role, ''))
  end
$$;


ALTER FUNCTION "public"."mm_role_key"("raw_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_save_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer) RETURNS "public"."clinical_encounters"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.clinical_encounters%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  if p_note is null or jsonb_typeof(p_note) is distinct from 'object' then
    raise exception 'invalid note';
  end if;
  if pg_column_size(p_note) > 200000 then raise exception 'note too large'; end if;

  select * into v_row from public.clinical_encounters where id = p_id for update;
  if not found then raise exception 'encounter not found'; end if;
  perform public.mm_assert_same_clinic(v_row.clinic_id);
  if v_row.doctor_id is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if v_row.status is distinct from 'draft' then raise exception 'encounter is not editable'; end if;
  if v_row.version is distinct from p_expected_version then raise exception 'version conflict'; end if;

  update public.clinical_encounters
  set note = p_note, version = version + 1, updated_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."mm_save_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_seed_cabinet_agenda_defaults"("p_cabinet_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.types_consultation (cabinet_id, libelle, description, duree_minutes, couleur, ordre)
  values
    (p_cabinet_id, 'Consultation',             'Consultation générale ou examen clinique',     30, '#3b82f6', 1),
    (p_cabinet_id, 'Suivi',                    'Contrôle d’évolution & renouvellement',        20, '#8b5cf6', 2),
    (p_cabinet_id, 'Première consultation',    'Nouveau patient, anamnèse & dossier initial', 45, '#10b981', 3),
    (p_cabinet_id, 'Urgence',                  'Symptômes aigus, prise en charge immédiate',  15, '#ef4444', 4),
    (p_cabinet_id, 'Contrôle post-opératoire', 'Suivi post-opératoire & pansements',          30, '#f59e0b', 5),
    (p_cabinet_id, 'Bilan annuel',             'Check-up préventif complet',                  45, '#0ea5e9', 6)
  on conflict do nothing;

  insert into public.cabinet_agenda_settings (cabinet_id)
  values (p_cabinet_id)
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."mm_seed_cabinet_agenda_defaults"("p_cabinet_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_set_patient_clinical"("p_patient_id" "uuid", "p_allergies_status" "text" DEFAULT NULL::"text", "p_allergies" "text" DEFAULT NULL::"text", "p_antecedents_status" "text" DEFAULT NULL::"text", "p_antecedents" "text" DEFAULT NULL::"text", "p_medications_status" "text" DEFAULT NULL::"text") RETURNS TABLE("antecedents" "text", "allergies" "text", "groupe_sanguin" "text", "allergies_status" "text", "antecedents_status" "text", "medications_status" "text", "clinical_verified_at" timestamp with time zone, "clinical_verified_by" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before public.patients%rowtype;
  v_after public.patients%rowtype;
begin
  if not (public.is_admin() or public.current_role() = 'doctor') then
    raise exception 'not authorized';
  end if;

  if p_allergies_status is not null and p_allergies_status not in ('unknown', 'none', 'listed') then
    raise exception 'invalid status';
  end if;
  if p_antecedents_status is not null and p_antecedents_status not in ('unknown', 'none', 'listed') then
    raise exception 'invalid status';
  end if;
  if p_medications_status is not null and p_medications_status not in ('unknown', 'none', 'listed') then
    raise exception 'invalid status';
  end if;
  if p_allergies_status = 'listed' and not public.mm__clinical_text_listed(p_allergies) then
    raise exception 'empty list';
  end if;
  if p_antecedents_status = 'listed' and not public.mm__clinical_text_listed(p_antecedents) then
    raise exception 'empty list';
  end if;
  if length(coalesce(p_allergies, '')) > 4000 or length(coalesce(p_antecedents, '')) > 8000 then
    raise exception 'text too long';
  end if;

  select * into v_before from public.patients where id = p_patient_id for update;
  if not found then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_before.cabinet_id);
  if v_before.cabinet_id is distinct from public.current_clinic_id() then
    raise exception 'not authorized';
  end if;

  update public.patients p
     set allergies = case
           when p_allergies_status = 'listed' then btrim(p_allergies)
           when p_allergies_status = 'none' then null
           else p.allergies end,
         allergies_status = coalesce(p_allergies_status, p.allergies_status),
         antecedents = case
           when p_antecedents_status = 'listed' then btrim(p_antecedents)
           when p_antecedents_status = 'none' then null
           else p.antecedents end,
         antecedents_status = coalesce(p_antecedents_status, p.antecedents_status),
         medications_status = coalesce(p_medications_status, p.medications_status),
         clinical_verified_at = case
           when coalesce(p_allergies_status, p_antecedents_status, p_medications_status) is not null then now()
           else p.clinical_verified_at end,
         clinical_verified_by = case
           when coalesce(p_allergies_status, p_antecedents_status, p_medications_status) is not null then auth.uid()
           else p.clinical_verified_by end
   where p.id = p_patient_id
  returning * into v_after;

  -- Audit without copying the clinical text itself into the log.
  perform public.write_audit_log(
    'PATIENT_CLINICAL_UPDATED', 'patient', p_patient_id,
    jsonb_build_object(
      'allergies_status', v_before.allergies_status,
      'antecedents_status', v_before.antecedents_status,
      'medications_status', v_before.medications_status
    ),
    jsonb_build_object(
      'allergies_status', v_after.allergies_status,
      'antecedents_status', v_after.antecedents_status,
      'medications_status', v_after.medications_status
    ),
    jsonb_build_object(
      'allergies_changed', v_after.allergies is distinct from v_before.allergies,
      'antecedents_changed', v_after.antecedents is distinct from v_before.antecedents
    )
  );

  return query
  select v_after.antecedents, v_after.allergies, v_after.groupe_sanguin,
         v_after.allergies_status, v_after.antecedents_status, v_after.medications_status,
         v_after.clinical_verified_at, v_after.clinical_verified_by;
end;
$$;


ALTER FUNCTION "public"."mm_set_patient_clinical"("p_patient_id" "uuid", "p_allergies_status" "text", "p_allergies" "text", "p_antecedents_status" "text", "p_antecedents" "text", "p_medications_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_set_user_permission"("p_user_id" "uuid", "p_permission_key" "text", "p_granted" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_permission_id uuid;
  v_target_clinic uuid;
  v_target_role text;
begin
  perform public.mm_assert_role(array['doctor', 'admin']);

  if p_user_id = auth.uid() then
    raise exception 'cannot modify your own permissions';
  end if;

  select id into v_permission_id from public.permissions where key = p_permission_key;
  if v_permission_id is null then
    raise exception 'unknown permission';
  end if;

  select coalesce(pr.clinic_id, pr.cabinet_id), public.mm_role_key(pr.role)
    into v_target_clinic, v_target_role
  from public.profiles pr where pr.id = p_user_id;

  if v_target_clinic is distinct from public.current_clinic_id() then
    raise exception 'cross-clinic access denied';
  end if;

  if v_target_role <> 'secretary' then
    raise exception 'permissions can only be configured for secretary accounts';
  end if;

  insert into public.user_permissions (user_id, permission_id, granted)
  values (p_user_id, v_permission_id, p_granted)
  on conflict (user_id, permission_id) do update set granted = excluded.granted, updated_at = now();

  perform public.write_audit_log(
    'SECRETARY_PERMISSION_CHANGED', 'user_permission', p_user_id, null,
    jsonb_build_object('permission', p_permission_key, 'granted', p_granted), null
  );
end;
$$;


ALTER FUNCTION "public"."mm_set_user_permission"("p_user_id" "uuid", "p_permission_key" "text", "p_granted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_sync_cabinets_clinics"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  has_clinics boolean;
  has_cabinets boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'clinics'
  ) into has_clinics;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'cabinets'
  ) into has_cabinets;

  if not has_clinics then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clinics' and column_name = 'owner_id'
  ) then
    begin
      insert into public.clinics (id, owner_id, name)
      select distinct on (p.cabinet_id)
        p.cabinet_id,
        public.mm_resolve_owner_id(p.id, p.cabinet_id),
        'MacroMedica'
      from public.profiles p
      where p.cabinet_id is not null
        and not exists (select 1 from public.clinics cl where cl.id = p.cabinet_id)
        and public.mm_resolve_owner_id(p.id, p.cabinet_id) is not null
      order by p.cabinet_id, p.created_at nulls last
      on conflict (id) do nothing;
    exception
      when undefined_column then
        begin
          insert into public.clinics (id, owner_id, nom)
          select distinct on (p.cabinet_id)
            p.cabinet_id,
            public.mm_resolve_owner_id(p.id, p.cabinet_id),
            'MacroMedica'
          from public.profiles p
          where p.cabinet_id is not null
            and not exists (select 1 from public.clinics cl where cl.id = p.cabinet_id)
            and public.mm_resolve_owner_id(p.id, p.cabinet_id) is not null
          order by p.cabinet_id, p.created_at nulls last
          on conflict (id) do nothing;
        exception
          when undefined_column then
            insert into public.clinics (id, owner_id)
            select distinct on (p.cabinet_id)
              p.cabinet_id,
              public.mm_resolve_owner_id(p.id, p.cabinet_id)
            from public.profiles p
            where p.cabinet_id is not null
              and not exists (select 1 from public.clinics cl where cl.id = p.cabinet_id)
              and public.mm_resolve_owner_id(p.id, p.cabinet_id) is not null
            order by p.cabinet_id, p.created_at nulls last
            on conflict (id) do nothing;
        end;
    end;
  end if;

  if has_cabinets then
    begin
      insert into public.clinics (id, owner_id, name)
      select
        c.id,
        public.mm_resolve_owner_id(c.id, c.tenant_id),
        coalesce(c.nom, 'MacroMedica')
      from public.cabinets c
      where not exists (select 1 from public.clinics cl where cl.id = c.id)
        and public.mm_resolve_owner_id(c.id, c.tenant_id) is not null
      on conflict (id) do nothing;
    exception
      when undefined_column then
        begin
          insert into public.clinics (id, owner_id, nom)
          select
            c.id,
            public.mm_resolve_owner_id(c.id, c.tenant_id),
            coalesce(c.nom, 'MacroMedica')
          from public.cabinets c
          where not exists (select 1 from public.clinics cl where cl.id = c.id)
            and public.mm_resolve_owner_id(c.id, c.tenant_id) is not null
          on conflict (id) do nothing;
        exception
          when undefined_column then
            insert into public.clinics (id, owner_id)
            select
              c.id,
              public.mm_resolve_owner_id(c.id, c.tenant_id)
            from public.cabinets c
            where not exists (select 1 from public.clinics cl where cl.id = c.id)
              and public.mm_resolve_owner_id(c.id, c.tenant_id) is not null
            on conflict (id) do nothing;
        end;
    end;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cabinets' and column_name = 'tenant_id'
    ) then
      begin
        insert into public.cabinets (id, tenant_id, nom)
        select cl.id, cl.owner_id, coalesce(cl.name, 'MacroMedica')
        from public.clinics cl
        where not exists (select 1 from public.cabinets ca where ca.id = cl.id)
          and exists (select 1 from auth.users u where u.id = cl.owner_id)
        on conflict (id) do nothing;
      exception
        when undefined_column then
          insert into public.cabinets (id, tenant_id, nom)
          select cl.id, cl.owner_id, coalesce(cl.nom, 'MacroMedica')
          from public.clinics cl
          where not exists (select 1 from public.cabinets ca where ca.id = cl.id)
            and exists (select 1 from auth.users u where u.id = cl.owner_id)
          on conflict (id) do nothing;
      end;

      insert into public.cabinets (id, tenant_id, nom)
      select distinct on (p.cabinet_id)
        p.cabinet_id,
        public.mm_resolve_owner_id(p.id, p.cabinet_id),
        'MacroMedica'
      from public.profiles p
      where p.cabinet_id is not null
        and not exists (select 1 from public.cabinets ca where ca.id = p.cabinet_id)
        and public.mm_resolve_owner_id(p.id, p.cabinet_id) is not null
      order by p.cabinet_id, p.created_at nulls last
      on conflict (id) do nothing;
    end if;
  end if;
end;
$$;


ALTER FUNCTION "public"."mm_sync_cabinets_clinics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."mm_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_update_ordonnance"("p_id" "uuid", "p_doctor_id" "uuid" DEFAULT NULL::"uuid", "p_encounter_id" "uuid" DEFAULT NULL::"uuid", "p_date_prescription" "date" DEFAULT NULL::"date", "p_entete" "jsonb" DEFAULT NULL::"jsonb", "p_instructions" "text" DEFAULT NULL::"text", "p_lignes" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cabinet_id uuid := public.get_user_cabinet_id();
  v_ordonnance public.ordonnances%rowtype;
  v_ligne jsonb;
  v_ordre int := 0;
begin
  perform public.mm_assert_role(array['doctor', 'secretary', 'admin']);

  select * into v_ordonnance from public.ordonnances where id = p_id;
  if not found or v_ordonnance.cabinet_id <> v_cabinet_id then
    raise exception 'ordonnance not found';
  end if;
  if v_ordonnance.statut <> 'brouillon' then
    raise exception 'only draft ordonnances can be edited';
  end if;

  if p_doctor_id is not null and not exists (
    select 1 from public.profiles
    where id = p_doctor_id and cabinet_id = v_cabinet_id and public.mm_role_key(role) = 'doctor'
  ) then
    raise exception 'doctor not found in current clinic';
  end if;

  if p_encounter_id is not null and not exists (
    select 1 from public.clinical_encounters where id = p_encounter_id and patient_id = v_ordonnance.patient_id
  ) then
    raise exception 'encounter does not match patient';
  end if;

  update public.ordonnances set
    doctor_id = coalesce(p_doctor_id, doctor_id),
    encounter_id = coalesce(p_encounter_id, encounter_id),
    date_prescription = coalesce(p_date_prescription, date_prescription),
    entete = coalesce(p_entete, entete),
    instructions = coalesce(p_instructions, instructions)
  where id = p_id;

  if p_lignes is not null then
    delete from public.ordonnance_lignes where ordonnance_id = p_id;
    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
      insert into public.ordonnance_lignes (ordonnance_id, ordre, medicament, posologie, duree)
      values (
        p_id, v_ordre,
        v_ligne->>'medicament', v_ligne->>'posologie', v_ligne->>'duree'
      );
      v_ordre := v_ordre + 1;
    end loop;
  end if;
end;
$$;


ALTER FUNCTION "public"."mm_update_ordonnance"("p_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_validate_invitation_token"("p_token" "text") RETURNS TABLE("valid" boolean, "status" "text", "email" "text", "role" "text", "clinic_name" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.invitations%rowtype;
  v_clinic_name text;
  v_effective_status text;
begin
  select * into v_row
  from public.invitations
  where token_hash = public.mm_hash_invitation_token(p_token);

  if v_row is null then
    return query select false, 'invalid'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_effective_status := v_row.status;
  if v_effective_status = 'pending' and v_row.expires_at <= now() then
    update public.invitations set status = 'expired' where id = v_row.id;
    v_effective_status := 'expired';
  end if;

  -- cabinets is always written with `nom` (see ensureTenantForProfile in
  -- supabase/functions/_shared/tenant.ts) — unlike `clinics`, it doesn't
  -- also have a `name` column, so referencing one here would error at
  -- query time rather than just returning null.
  select c.nom into v_clinic_name
  from public.cabinets c where c.id = v_row.clinic_id;

  return query select
    (v_effective_status = 'pending'),
    v_effective_status,
    v_row.email,
    v_row.role,
    coalesce(v_clinic_name, 'votre cabinet'),
    v_row.expires_at;
end;
$$;


ALTER FUNCTION "public"."mm_validate_invitation_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mm_void_encounter"("p_id" "uuid") RETURNS "public"."clinical_encounters"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.clinical_encounters%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select * into v_row from public.clinical_encounters where id = p_id for update;
  if not found then raise exception 'encounter not found'; end if;
  perform public.mm_assert_same_clinic(v_row.clinic_id);
  if v_row.doctor_id is distinct from auth.uid() then raise exception 'not authorized'; end if;
  if v_row.status is distinct from 'draft' then raise exception 'encounter is not editable'; end if;

  update public.clinical_encounters
  set status = 'voided', version = version + 1, updated_at = now()
  where id = p_id
  returning * into v_row;

  perform public.write_audit_log(
    'ENCOUNTER_VOIDED', 'clinical_encounter', v_row.id, null,
    jsonb_build_object('status', v_row.status, 'patient_id', v_row.patient_id), null
  );

  return v_row;
end;
$$;


ALTER FUNCTION "public"."mm_void_encounter"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_consultation"("p_visit_id" "uuid") RETURNS "public"."consultations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  consultation_row public.consultations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select * into visit_before from public.visits where id = p_visit_id for update;
  if not found then
    raise exception 'visit not found';
  end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if not public.is_admin() and visit_before.doctor_id is distinct from auth.uid() then
    raise exception 'doctor can only open assigned consultations';
  end if;

  if visit_before.status not in ('called', 'consultation') then
    raise exception 'patient must be called before consultation starts';
  end if;

  if visit_before.status = 'called' then
    update public.visits
    set status = 'consultation',
        consultation_start_at = now(),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_visit_id
    returning * into visit_after;
  else
    visit_after := visit_before;
  end if;

  insert into public.consultations (
    cabinet_id, clinic_id, visit_id, rdv_id, patient_id, doctor_id,
    statut, status, montant, billing_amount, billing_type,
    started_at, locked_by, locked_at, lock_expires_at
  )
  values (
    visit_after.clinic_id, visit_after.clinic_id, visit_after.id, visit_after.rdv_id,
    visit_after.patient_id, visit_after.doctor_id,
    'credit', 'draft', 0, 0, 'cash',
    coalesce(visit_after.consultation_start_at, now()), auth.uid(), now(), now() + interval '8 minutes'
  )
  on conflict (visit_id) where visit_id is not null
  do update set
    locked_by = case
      when consultations.locked_by is null
        or consultations.locked_by = auth.uid()
        or consultations.lock_expires_at < now()
      then auth.uid()
      else consultations.locked_by
    end,
    locked_at = case
      when consultations.locked_by is null
        or consultations.locked_by = auth.uid()
        or consultations.lock_expires_at < now()
      then now()
      else consultations.locked_at
    end,
    lock_expires_at = case
      when consultations.locked_by is null
        or consultations.locked_by = auth.uid()
        or consultations.lock_expires_at < now()
      then now() + interval '8 minutes'
      else consultations.lock_expires_at
    end,
    started_at = coalesce(consultations.started_at, excluded.started_at),
    updated_at = now()
  returning * into consultation_row;

  if consultation_row.locked_by is distinct from auth.uid() then
    perform public.write_audit_log('LOCK_CONFLICT', 'consultation', consultation_row.id, null, to_jsonb(consultation_row), null);
    raise exception 'consultation is locked by another user';
  end if;

  perform public.write_audit_log('PATIENT_IN_CONSULTATION', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null);
  perform public.write_audit_log('CONSULTATION_LOCK_ACQUIRED', 'consultation', consultation_row.id, null, to_jsonb(consultation_row), null);

  return consultation_row;
end;
$$;


ALTER FUNCTION "public"."open_consultation"("p_visit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ordonnances_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."ordonnances_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_visit_payment"("p_visit_id" "uuid", "p_method" "text", "p_amount" numeric DEFAULT NULL::numeric, "p_partial" boolean DEFAULT false) RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  payment_before public.payments%rowtype;
  payment_after public.payments%rowtype;
  v_remaining numeric;
  v_collect numeric;
  v_full boolean;
  v_debt_collection boolean;
begin
  perform public.mm_assert_permission('billing.collect');

  if p_method not in ('cash', 'card', 'transfer', 'insurance', 'package', 'free') then
    raise exception 'invalid payment method';
  end if;

  select * into visit_before from public.visits where id = p_visit_id for update;
  if not found then raise exception 'visit not found'; end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  -- 'billing': at the cashier now. 'completed': a closed visit whose balance is still owed
  -- (checked just below: it must have a pending payment with something left).
  if visit_before.status not in ('billing', 'completed') then
    raise exception 'visit is not in billing';
  end if;
  v_debt_collection := visit_before.status = 'completed';

  select * into payment_before
  from public.payments
  where visit_id = p_visit_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if not found then
    if v_debt_collection then raise exception 'visit is not in billing'; end if;
    raise exception 'pending payment not found';
  end if;

  v_remaining := payment_before.amount - payment_before.amount_paid;
  if v_remaining <= 0 then raise exception 'nothing left to collect'; end if;

  v_collect := coalesce(p_amount, v_remaining);
  if v_collect <= 0 or v_collect > v_remaining then
    raise exception 'invalid payment amount: % exceeds remaining balance %', v_collect, v_remaining;
  end if;

  v_full := v_collect = v_remaining;
  if not v_full and not coalesce(p_partial, false) then
    raise exception 'partial payment must be explicit: collecting % of remaining % (pass p_partial => true)', v_collect, v_remaining;
  end if;

  update public.payments
  set amount_paid = amount_paid + v_collect,
      status = case when v_full then 'paid' else 'pending' end,
      method = p_method,
      received_by = auth.uid(),
      paid_at = now(),
      updated_at = now()
  where id = payment_before.id
  returning * into payment_after;

  if v_debt_collection then
    -- Visit already closed: only the payment moves. Fully settled -> mark the consultation
    -- and rdv paid, as a same-day full payment would have.
    visit_after := visit_before;
    if v_full then
      update public.consultations set statut = 'paye', updated_at = now() where id = payment_after.consultation_id;
      if visit_after.rdv_id is not null then
        update public.rdv set payment_status = 'PAID'
        where id = visit_after.rdv_id and cabinet_id = visit_after.clinic_id;
      end if;
    end if;
  else
    -- At the cashier: full OR partial, the visit is over and leaves the queue.
    update public.visits
    set status = 'completed',
        completed_at = now(),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_visit_id
    returning * into visit_after;

    if v_full then
      update public.consultations set statut = 'paye', updated_at = now() where id = payment_after.consultation_id;
    end if;

    if visit_after.rdv_id is not null then
      update public.rdv
      set status = 'completed', payment_status = case when v_full then 'PAID' else 'UNPAID' end
      where id = visit_after.rdv_id and cabinet_id = visit_after.clinic_id;
    end if;
  end if;

  perform public.write_audit_log(
    'PAYMENT_PROCESSED', 'payment', payment_after.id, to_jsonb(payment_before), to_jsonb(payment_after),
    jsonb_build_object(
      'billed', payment_after.amount,
      'collected', v_collect,
      'total_collected', payment_after.amount_paid,
      'remaining', payment_after.amount - payment_after.amount_paid,
      'partial', not v_full,
      'debt_collection', v_debt_collection
    )
  );
  if not v_debt_collection then
    perform public.write_audit_log(
      case when v_full then 'PATIENT_PAID' else 'VISIT_CLOSED_WITH_BALANCE' end,
      'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null
    );
  end if;

  return visit_after;
end;
$$;


ALTER FUNCTION "public"."process_visit_payment"("p_visit_id" "uuid", "p_method" "text", "p_amount" numeric, "p_partial" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_onboarding_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if current_user <> 'postgres' then
    if TG_OP = 'INSERT' then
      NEW.onboarding_completed_at := null;
    elsif NEW.onboarding_completed_at is distinct from OLD.onboarding_completed_at then
      NEW.onboarding_completed_at := OLD.onboarding_completed_at;
    end if;
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."protect_onboarding_completed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_patient_clinical_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_clinician boolean;
begin
  if current_user = 'postgres' then
    return new;
  end if;

  v_clinician := public.is_admin() or public.current_role() = 'doctor';

  if tg_op = 'INSERT' then
    if not v_clinician then
      new.antecedents := null;
      new.allergies := null;
      new.groupe_sanguin := null;
    end if;
    new.allergies_status := case when v_clinician and public.mm__clinical_text_listed(new.allergies) then 'listed' else 'unknown' end;
    new.antecedents_status := case when v_clinician and public.mm__clinical_text_listed(new.antecedents) then 'listed' else 'unknown' end;
    new.medications_status := 'unknown';
    new.clinical_verified_at := null;
    new.clinical_verified_by := null;
    return new;
  end if;

  -- UPDATE
  if not v_clinician then
    new.antecedents := old.antecedents;
    new.allergies := old.allergies;
    new.groupe_sanguin := old.groupe_sanguin;
  end if;

  new.allergies_status := old.allergies_status;
  new.antecedents_status := old.antecedents_status;
  new.medications_status := old.medications_status;
  new.clinical_verified_at := old.clinical_verified_at;
  new.clinical_verified_by := old.clinical_verified_by;

  if v_clinician then
    if new.allergies is distinct from old.allergies then
      new.allergies_status := case when public.mm__clinical_text_listed(new.allergies) then 'listed' else 'unknown' end;
      new.clinical_verified_at := now();
      new.clinical_verified_by := auth.uid();
    end if;
    if new.antecedents is distinct from old.antecedents then
      new.antecedents_status := case when public.mm__clinical_text_listed(new.antecedents) then 'listed' else 'unknown' end;
      new.clinical_verified_at := now();
      new.clinical_verified_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_patient_clinical_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_role_and_clinic"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if current_user = 'postgres' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := null;
    new.clinic_id := null;
    new.cabinet_id := null;
    return new;
  end if;

  new.role := old.role;
  new.clinic_id := old.clinic_id;
  new.cabinet_id := old.cabinet_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_role_and_clinic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rdv_set_appointment_day"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.appointment_day := (new.date_rdv at time zone 'Africa/Casablanca')::date;
  return new;
end;
$$;


ALTER FUNCTION "public"."rdv_set_appointment_day"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rdv_sync_time_range"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.start_time := new.date_rdv;
  new.end_time := new.date_rdv + make_interval(mins => new.duree_minutes);
  return new;
end;
$$;


ALTER FUNCTION "public"."rdv_sync_time_range"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reassign_visit_doctor"("p_visit_id" "uuid", "p_doctor_id" "uuid") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
  doctor_clinic uuid;
  next_status text;
  qn integer;
begin
  if not (public.is_admin() or public.mm_has_permission('waiting_room.change_status')) then
    raise exception 'not authorized';
  end if;

  select * into visit_before from public.visits where id = p_visit_id;
  if not found then
    raise exception 'visit not found';
  end if;
  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status not in ('scheduled', 'arrived', 'waiting', 'called') then
    raise exception 'visit cannot be reassigned after consultation starts';
  end if;

  select coalesce(clinic_id, cabinet_id) into doctor_clinic
  from public.profiles
  where id = p_doctor_id
    and public.mm_role_key(role) = 'doctor'
    and status = 'active';

  if doctor_clinic is distinct from visit_before.clinic_id then
    raise exception 'doctor must belong to the same clinic';
  end if;

  next_status := case when visit_before.status = 'called' then 'waiting' else visit_before.status end;
  qn := public.mm_next_queue_number(visit_before.clinic_id, p_doctor_id, current_date);

  update public.visits
  set doctor_id = p_doctor_id,
      status = next_status,
      queue_date = current_date,
      queue_number = qn,
      queue_sort_at = now(),
      queued_at = coalesce(queued_at, now()),
      waiting_at = case when next_status = 'waiting' then coalesce(waiting_at, now()) else waiting_at end,
      called_at = case when visit_before.status = 'called' then null else called_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  perform public.write_audit_log('VISIT_DOCTOR_REASSIGNED', 'visit', p_visit_id, to_jsonb(visit_before), to_jsonb(visit_after), null);

  return visit_after;
end;
$$;


ALTER FUNCTION "public"."reassign_visit_doctor"("p_visit_id" "uuid", "p_doctor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_claim_reimbursement"("p_claim_id" "uuid", "p_amount" numeric, "p_reference" "text" DEFAULT NULL::"text") RETURNS "public"."insurance_claims"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
  v_pay public.payments;
  v_open numeric;
  v_remaining numeric;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);

  if v_before.status <> 'depose' then raise exception 'claim must be submitted before a reimbursement'; end if;
  v_open := v_before.amount_insurer - v_before.reimbursed_amount;
  if p_amount is null or p_amount <= 0 or p_amount > v_open then
    raise exception 'invalid reimbursement: % exceeds what the insurer still owes (%)', p_amount, v_open;
  end if;

  select * into v_pay from public.payments where id = v_before.payment_id for update;
  v_remaining := v_pay.amount - v_pay.amount_paid;
  if p_amount > v_remaining then
    raise exception 'reimbursement % exceeds the invoice balance %', p_amount, v_remaining;
  end if;

  perform public.process_visit_payment(v_before.visit_id, 'insurance', p_amount, p_amount < v_remaining);

  update public.insurance_claims
  set reimbursed_amount = reimbursed_amount + p_amount,
      status = case when reimbursed_amount + p_amount >= amount_insurer then 'rembourse' else status end,
      reimbursed_at = now(),
      reference = coalesce(nullif(btrim(p_reference), ''), reference),
      updated_at = now()
  where id = p_claim_id returning * into v_after;

  perform public.write_audit_log('INSURANCE_CLAIM_REIMBURSED', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('amount', p_amount));
  return v_after;
end;
$$;


ALTER FUNCTION "public"."record_claim_reimbursement"("p_claim_id" "uuid", "p_amount" numeric, "p_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment"("p_rdv_id" "uuid", "p_amount" numeric, "p_method" "text") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;

  perform public.mm_assert_permission('billing.mark_paid');
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.payment_status = 'PAID' then
    raise exception 'appointment is already paid';
  end if;

  update public.rdv
  set payment_status = 'PAID'
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log('PATIENT_PAID', 'rdv', p_rdv_id, to_jsonb(rdv_before), to_jsonb(rdv_after), jsonb_build_object('amount', p_amount, 'method', p_method));

  return rdv_after;
end;
$$;


ALTER FUNCTION "public"."record_payment"("p_rdv_id" "uuid", "p_amount" numeric, "p_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_payment_guarded"("p_consultation_id" "uuid", "p_amount" numeric, "p_method" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_facture public.consultations%rowtype;
  v_total_net numeric; v_total_paye numeric; v_reste numeric; v_new_id uuid; v_new_statut text;
BEGIN
  IF NOT (public.is_admin() OR public.current_role() IN ('doctor', 'secretary')) THEN RAISE EXCEPTION 'Non autorise'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;

  SELECT * INTO v_facture FROM public.consultations WHERE id = p_consultation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  PERFORM public.mm_assert_same_clinic(COALESCE(v_facture.clinic_id, v_facture.cabinet_id));
  IF v_facture.statut IN ('brouillon', 'annulee') THEN RAISE EXCEPTION 'Paiement impossible'; END IF;

  v_total_net := public.get_facture_net(p_consultation_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paye FROM public.payments WHERE consultation_id = p_consultation_id AND status != 'cancelled';
  v_reste := v_total_net - v_total_paye;

  IF p_amount > (v_reste + 0.05) THEN RAISE EXCEPTION 'Le montant depasse le reste a payer'; END IF;

  INSERT INTO public.payments (clinic_id, consultation_id, patient_id, amount, method, status, received_by, paid_at)
  VALUES (COALESCE(v_facture.clinic_id, v_facture.cabinet_id), p_consultation_id, v_facture.patient_id, p_amount, p_method, 'paid', auth.uid(), now())
  RETURNING id INTO v_new_id;

  v_total_paye := v_total_paye + p_amount;
  IF (v_total_net - v_total_paye) <= 0.05 THEN v_new_statut := 'payee'; ELSE v_new_statut := 'partielle'; END IF;
  UPDATE public.consultations SET statut = v_new_statut WHERE id = p_consultation_id;

  PERFORM public.write_audit_log('PAYMENT_RECORDED', 'payment', v_new_id, NULL, jsonb_build_object('amount', p_amount, 'method', p_method, 'consultation_id', p_consultation_id), NULL);
  PERFORM public.write_audit_log('FACTURE_STATUS_UPDATED', 'consultation', p_consultation_id, jsonb_build_object('statut', v_facture.statut), jsonb_build_object('statut', v_new_statut), NULL);

  RETURN v_new_id;
END;
$$;


ALTER FUNCTION "public"."record_payment_guarded"("p_consultation_id" "uuid", "p_amount" numeric, "p_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_consultation_lock"("p_consultation_id" "uuid") RETURNS "public"."consultations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  consultation_row public.consultations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select * into consultation_row from public.consultations where id = p_consultation_id;
  if not found then raise exception 'consultation not found'; end if;
  perform public.mm_assert_same_clinic(coalesce(consultation_row.clinic_id, consultation_row.cabinet_id));

  if consultation_row.locked_by is distinct from auth.uid() then
    raise exception 'only lock owner can refresh lock';
  end if;

  update public.consultations
  set locked_at = now(),
      lock_expires_at = now() + interval '8 minutes',
      updated_at = now()
  where id = p_consultation_id
  returning * into consultation_row;

  return consultation_row;
end;
$$;


ALTER FUNCTION "public"."refresh_consultation_lock"("p_consultation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_consultation_lock"("p_consultation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  consultation_row public.consultations%rowtype;
begin
  perform public.mm_assert_role(array['doctor']);

  select * into consultation_row from public.consultations where id = p_consultation_id;
  if not found then return; end if;
  perform public.mm_assert_same_clinic(coalesce(consultation_row.clinic_id, consultation_row.cabinet_id));

  if consultation_row.locked_by = auth.uid() or public.is_admin() then
    update public.consultations
    set locked_by = null,
        locked_at = null,
        lock_expires_at = null,
        updated_at = now()
    where id = p_consultation_id;

    perform public.write_audit_log('CONSULTATION_LOCK_RELEASED', 'consultation', p_consultation_id, to_jsonb(consultation_row), null, null);
  end if;
end;
$$;


ALTER FUNCTION "public"."release_consultation_lock"("p_consultation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reschedule_appointment"("p_rdv_id" "uuid", "p_scheduled_at" timestamp with time zone) RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
begin
  perform public.mm_assert_permission('appointments.update');

  if p_scheduled_at is null then
    raise exception 'scheduled_at is required';
  end if;

  select * into rdv_before from public.rdv where id = p_rdv_id for update;
  if not found then raise exception 'appointment not found'; end if;
  perform public.mm_assert_same_clinic(rdv_before.cabinet_id);

  if rdv_before.status in ('cancelled', 'completed') then
    raise exception 'cannot reschedule a cancelled or completed appointment';
  end if;

  update public.rdv
  set date_rdv = p_scheduled_at
  where id = p_rdv_id
  returning * into rdv_after;

  perform public.write_audit_log(
    'APPOINTMENT_RESCHEDULED', 'rdv', p_rdv_id,
    to_jsonb(rdv_before), to_jsonb(rdv_after),
    jsonb_build_object('scheduled_at', p_scheduled_at)
  );

  return rdv_after;
end;
$$;


ALTER FUNCTION "public"."reschedule_appointment"("p_rdv_id" "uuid", "p_scheduled_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_jsonb"("p_text" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  return p_text::jsonb;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."safe_jsonb"("p_text" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."actes_catalogue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "libelle" "text" NOT NULL,
    "categorie" "text",
    "prix" numeric(10,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "actes_catalogue_prix_check" CHECK (("prix" >= (0)::numeric))
);


ALTER TABLE "public"."actes_catalogue" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_acte_active"("p_id" "uuid", "p_active" boolean) RETURNS "public"."actes_catalogue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_before public.actes_catalogue;
  v_row public.actes_catalogue;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  select * into v_before from public.actes_catalogue where id = p_id and cabinet_id = v_clinic for update;
  if not found then raise exception 'acte not found'; end if;
  update public.actes_catalogue set active = coalesce(p_active, true), updated_at = now()
  where id = p_id returning * into v_row;
  perform public.write_audit_log(case when v_row.active then 'ACTE_RESTORED' else 'ACTE_ARCHIVED' end,
    'acte', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null);
  return v_row;
end;
$$;


ALTER FUNCTION "public"."set_acte_active"("p_id" "uuid", "p_active" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "prenom" "text" NOT NULL,
    "telephone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "date_naissance" "date",
    "cin" "text",
    "adresse" "text",
    "mutuelle" "text",
    "numero_cnss" "text",
    "antecedents" "text",
    "allergies" "text",
    "email" "text",
    "ville" "text",
    "groupe_sanguin" "text",
    "sexe" "text",
    "insurer_id" "uuid",
    "coverage_rate" numeric(5,2),
    "allergies_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "antecedents_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "medications_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "clinical_verified_at" timestamp with time zone,
    "clinical_verified_by" "uuid",
    "date_naissance_approx" boolean DEFAULT false NOT NULL,
    CONSTRAINT "patients_allergies_status_check" CHECK (("allergies_status" = ANY (ARRAY['unknown'::"text", 'none'::"text", 'listed'::"text"]))),
    CONSTRAINT "patients_antecedents_status_check" CHECK (("antecedents_status" = ANY (ARRAY['unknown'::"text", 'none'::"text", 'listed'::"text"]))),
    CONSTRAINT "patients_coverage_rate_check" CHECK ((("coverage_rate" IS NULL) OR (("coverage_rate" >= (0)::numeric) AND ("coverage_rate" <= (100)::numeric)))),
    CONSTRAINT "patients_medications_status_check" CHECK (("medications_status" = ANY (ARRAY['unknown'::"text", 'none'::"text", 'listed'::"text"]))),
    CONSTRAINT "patients_sexe_check" CHECK (("sexe" = ANY (ARRAY['homme'::"text", 'femme'::"text"])))
);


ALTER TABLE "public"."patients" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_patient_coverage"("p_patient_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric DEFAULT NULL::numeric) RETURNS "public"."patients"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_patient public.patients;
  v_insurer public.insurers;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_patient from public.patients where id = p_patient_id for update;
  if not found then raise exception 'patient not found'; end if;
  perform public.mm_assert_same_clinic(v_patient.cabinet_id);

  if p_insurer_id is null then
    update public.patients set insurer_id = null, coverage_rate = null, mutuelle = null
    where id = p_patient_id returning * into v_patient;
  else
    select * into v_insurer from public.insurers where id = p_insurer_id;
    if not found then raise exception 'insurer not found'; end if;
    perform public.mm_assert_same_clinic(v_insurer.clinic_id);
    update public.patients
    set insurer_id = v_insurer.id, coverage_rate = coalesce(p_rate, v_insurer.default_rate), mutuelle = v_insurer.name
    where id = p_patient_id returning * into v_patient;
  end if;
  return v_patient;
end;
$$;


ALTER FUNCTION "public"."set_patient_coverage"("p_patient_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."types_consultation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "libelle" "text" NOT NULL,
    "description" "text",
    "duree_minutes" integer DEFAULT 30 NOT NULL,
    "couleur" "text",
    "ordre" integer DEFAULT 0 NOT NULL,
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "types_consultation_couleur_check" CHECK ((("couleur" IS NULL) OR ("couleur" ~ '^#[0-9a-fA-F]{6}$'::"text"))),
    CONSTRAINT "types_consultation_duree_check" CHECK ((("duree_minutes" >= 5) AND ("duree_minutes" <= 480))),
    CONSTRAINT "types_consultation_libelle_check" CHECK ((("length"("btrim"("libelle")) >= 1) AND ("length"("btrim"("libelle")) <= 80)))
);


ALTER TABLE "public"."types_consultation" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_type_consultation_active"("p_id" "uuid", "p_actif" boolean) RETURNS "public"."types_consultation"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_before public.types_consultation;
  v_row public.types_consultation;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  select * into v_before from public.types_consultation where id = p_id and cabinet_id = v_clinic for update;
  if not found then raise exception 'type not found'; end if;
  update public.types_consultation
  set actif = coalesce(p_actif, true), updated_at = now()
  where id = p_id
  returning * into v_row;
  perform public.write_audit_log(
    case when v_row.actif then 'TYPE_CONSULTATION_REACTIVATED' else 'TYPE_CONSULTATION_ARCHIVED' end,
    'type_consultation', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null
  );
  return v_row;
end;
$$;


ALTER FUNCTION "public"."set_type_consultation_active"("p_id" "uuid", "p_actif" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_consultation"("p_rdv_id" "uuid") RETURNS "public"."rdv"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  rdv_before public.rdv%rowtype;
  rdv_after public.rdv%rowtype;
BEGIN
  SELECT * INTO rdv_before FROM public.rdv WHERE id = p_rdv_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found'; END IF;

  IF rdv_before.arrival_status != 'WAITING' THEN
    RAISE EXCEPTION 'patient must be in WAITING state to start consultation';
  END IF;

  UPDATE public.rdv
  SET arrival_status = 'IN_CONSULTATION',
      consultation_started_at = NOW()
  WHERE id = p_rdv_id
  RETURNING * INTO rdv_after;

  RETURN rdv_after;
END;
$$;


ALTER FUNCTION "public"."start_consultation"("p_rdv_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_consultation_safe"("p_rdv_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
UPDATE rdv
SET status = 'en_consultation'
WHERE id = p_rdv_id;

DELETE FROM salle_attente
WHERE rdv_id = p_rdv_id;

END;
$$;


ALTER FUNCTION "public"."start_consultation_safe"("p_rdv_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."start_consultation_safe"("p_rdv_id" "uuid") IS 'LEGACY/UNUSED/BROKEN: sets rdv.status to a value (''en_consultation'') the current rdv_status_check constraint rejects — cannot succeed against the live schema. Client EXECUTE revoked 2026-09-13 — confirmed zero callers anywhere.';



CREATE OR REPLACE FUNCTION "public"."trg_cabinet_seed_agenda_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.mm_seed_cabinet_agenda_defaults(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_cabinet_seed_agenda_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_encounter_completed_creates_exams"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.mm_exams_from_encounter(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_encounter_completed_creates_exams"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_encounter_completed_creates_ordonnance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.mm_ordonnance_from_encounter(new.id, true);
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_encounter_completed_creates_ordonnance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_add_to_waiting_room"("p_visit_id" "uuid") RETURNS "public"."visits"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  visit_before public.visits%rowtype;
  visit_after public.visits%rowtype;
begin
  perform public.mm_assert_permission('waiting_room.add_patient');

  select * into visit_before
  from public.visits
  where id = p_visit_id
  for update;

  if not found then
    raise exception 'visit not found';
  end if;

  perform public.mm_assert_same_clinic(visit_before.clinic_id);

  if visit_before.status <> 'waiting' then
    raise exception 'visit is no longer waiting';
  end if;

  if coalesce(visit_before.waiting_at, visit_before.queued_at, visit_before.created_at) < now() - interval '10 minutes' then
    raise exception 'undo window has expired';
  end if;

  update public.visits
  set status = 'cancelled',
      cancelled_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_visit_id
  returning * into visit_after;

  -- Appointment back to "not arrived" (it stays booked; create_visit_from_rdv set these).
  if visit_after.rdv_id is not null then
    update public.rdv
    set arrival_status = 'NOT_ARRIVED',
        arrived_at = null
    where id = visit_after.rdv_id
      and arrival_status = 'WAITING';
  end if;

  perform public.write_audit_log(
    'WAITING_ROOM_ADD_UNDONE',
    'visit',
    p_visit_id,
    to_jsonb(visit_before),
    to_jsonb(visit_after),
    jsonb_build_object('rdv_id', visit_after.rdv_id)
  );

  return visit_after;
end;
$$;


ALTER FUNCTION "public"."undo_add_to_waiting_room"("p_visit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_claim_status"("p_claim_id" "uuid", "p_status" "text", "p_reference" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."insurance_claims"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before public.insurance_claims;
  v_after public.insurance_claims;
begin
  perform public.mm_assert_permission('billing.collect');
  select * into v_before from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'claim not found'; end if;
  perform public.mm_assert_same_clinic(v_before.clinic_id);

  if p_status not in ('a_deposer', 'depose', 'rejete', 'annule') then
    raise exception 'use record_claim_reimbursement to mark a claim reimbursed';
  end if;
  if v_before.status in ('rembourse', 'annule') then raise exception 'claim is closed'; end if;
  if p_status in ('annule', 'a_deposer') and v_before.reimbursed_amount > 0 then
    raise exception 'claim already partly reimbursed';
  end if;

  update public.insurance_claims
  set status = p_status,
      reference = coalesce(nullif(btrim(p_reference), ''), reference),
      note = coalesce(p_note, note),
      submitted_at = case when p_status = 'depose' then coalesce(submitted_at, now()) else submitted_at end,
      updated_at = now()
  where id = p_claim_id returning * into v_after;

  perform public.write_audit_log('INSURANCE_CLAIM_STATUS', 'insurance_claim', p_claim_id, to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$$;


ALTER FUNCTION "public"."update_claim_status"("p_claim_id" "uuid", "p_status" "text", "p_reference" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_patient_statut"("p_id" "uuid", "p_statut" "text", "p_position" integer DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE salle_attente
  SET 
    statut = p_statut,
    position = p_position
  WHERE id = p_id
  AND cabinet_id = (
    SELECT cabinet_id FROM profiles
    WHERE profiles.id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."update_patient_statut"("p_id" "uuid", "p_statut" "text", "p_position" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_patient_statut"("p_id" "uuid", "p_statut" "text", "p_position" integer) IS 'LEGACY/UNUSED: operates on the superseded salle_attente table. The live product uses visits (add_to_waiting_room/call_patient/cancel_visit). Client EXECUTE revoked 2026-09-13 — confirmed zero callers in frontend, Edge Functions, or other RPCs.';



CREATE OR REPLACE FUNCTION "public"."update_tasks_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_tasks_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_acte"("p_id" "uuid", "p_libelle" "text", "p_prix" numeric, "p_categorie" "text" DEFAULT NULL::"text") RETURNS "public"."actes_catalogue"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_name text := btrim(coalesce(p_libelle, ''));
  v_cat text := nullif(btrim(coalesce(p_categorie, '')), '');
  v_before public.actes_catalogue;
  v_row public.actes_catalogue;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  if v_clinic is null then raise exception 'no clinic for current user'; end if;
  if length(v_name) = 0 or length(v_name) > 120 then raise exception 'invalid acte name'; end if;
  if p_prix is null or p_prix < 0 or p_prix > 9999999 then raise exception 'invalid acte price'; end if;
  if v_cat is not null and length(v_cat) > 60 then raise exception 'invalid acte category'; end if;

  if p_id is null then
    insert into public.actes_catalogue (cabinet_id, code, libelle, categorie, prix)
    values (v_clinic, 'ACT-' || upper(substr(md5(gen_random_uuid()::text), 1, 8)), v_name, v_cat, round(p_prix, 2))
    returning * into v_row;
    perform public.write_audit_log('ACTE_CREATED', 'acte', v_row.id, null, to_jsonb(v_row), null);
  else
    select * into v_before from public.actes_catalogue where id = p_id and cabinet_id = v_clinic for update;
    if not found then raise exception 'acte not found'; end if;
    update public.actes_catalogue
    set libelle = v_name, categorie = v_cat, prix = round(p_prix, 2), updated_at = now()
    where id = p_id
    returning * into v_row;
    perform public.write_audit_log('ACTE_UPDATED', 'acte', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null);
  end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."upsert_acte"("p_id" "uuid", "p_libelle" "text", "p_prix" numeric, "p_categorie" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cabinet_agenda_settings" (
    "cabinet_id" "uuid" NOT NULL,
    "heure_debut" time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    "heure_fin" time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    "pas_minutes" integer DEFAULT 15 NOT NULL,
    "duree_defaut_minutes" integer DEFAULT 30 NOT NULL,
    "pause_debut" time without time zone,
    "pause_fin" time without time zone,
    "jours_ouvres" smallint[] DEFAULT '{1,2,3,4,5,6}'::smallint[] NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cabinet_agenda_settings_duree_check" CHECK ((("duree_defaut_minutes" >= 5) AND ("duree_defaut_minutes" <= 480))),
    CONSTRAINT "cabinet_agenda_settings_heures_check" CHECK (("heure_fin" > "heure_debut")),
    CONSTRAINT "cabinet_agenda_settings_jours_check" CHECK (((("cardinality"("jours_ouvres") >= 1) AND ("cardinality"("jours_ouvres") <= 7)) AND ("jours_ouvres" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))),
    CONSTRAINT "cabinet_agenda_settings_pas_check" CHECK (("pas_minutes" = ANY (ARRAY[5, 10, 15, 20, 30, 60]))),
    CONSTRAINT "cabinet_agenda_settings_pause_check" CHECK (((("pause_debut" IS NULL) AND ("pause_fin" IS NULL)) OR (("pause_debut" IS NOT NULL) AND ("pause_fin" IS NOT NULL) AND ("pause_fin" > "pause_debut") AND ("pause_debut" >= "heure_debut") AND ("pause_fin" <= "heure_fin"))))
);


ALTER TABLE "public"."cabinet_agenda_settings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_cabinet_agenda_settings"("p_heure_debut" time without time zone, "p_heure_fin" time without time zone, "p_pas_minutes" integer, "p_duree_defaut_minutes" integer, "p_pause_debut" time without time zone DEFAULT NULL::time without time zone, "p_pause_fin" time without time zone DEFAULT NULL::time without time zone, "p_jours_ouvres" smallint[] DEFAULT '{1,2,3,4,5,6}'::smallint[]) RETURNS "public"."cabinet_agenda_settings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_before public.cabinet_agenda_settings;
  v_row public.cabinet_agenda_settings;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  if v_clinic is null then raise exception 'no clinic for current user'; end if;

  select * into v_before from public.cabinet_agenda_settings where cabinet_id = v_clinic for update;

  -- Value checks are the table constraints; a bad value raises check_violation.
  insert into public.cabinet_agenda_settings as s (
    cabinet_id, heure_debut, heure_fin, pas_minutes, duree_defaut_minutes, pause_debut, pause_fin, jours_ouvres, updated_at
  ) values (
    v_clinic, p_heure_debut, p_heure_fin, p_pas_minutes, p_duree_defaut_minutes, p_pause_debut, p_pause_fin, p_jours_ouvres, now()
  )
  on conflict (cabinet_id) do update set
    heure_debut = excluded.heure_debut,
    heure_fin = excluded.heure_fin,
    pas_minutes = excluded.pas_minutes,
    duree_defaut_minutes = excluded.duree_defaut_minutes,
    pause_debut = excluded.pause_debut,
    pause_fin = excluded.pause_fin,
    jours_ouvres = excluded.jours_ouvres,
    updated_at = now()
  returning * into v_row;

  perform public.write_audit_log('AGENDA_SETTINGS_UPDATED', 'cabinet_agenda_settings', v_clinic, to_jsonb(v_before), to_jsonb(v_row), null);
  return v_row;
end;
$$;


ALTER FUNCTION "public"."upsert_cabinet_agenda_settings"("p_heure_debut" time without time zone, "p_heure_fin" time without time zone, "p_pas_minutes" integer, "p_duree_defaut_minutes" integer, "p_pause_debut" time without time zone, "p_pause_fin" time without time zone, "p_jours_ouvres" smallint[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insurers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" DEFAULT 'mutuelle'::"text" NOT NULL,
    "default_rate" numeric(5,2) DEFAULT 80 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "insurers_default_rate_check" CHECK ((("default_rate" >= (0)::numeric) AND ("default_rate" <= (100)::numeric))),
    CONSTRAINT "insurers_kind_check" CHECK (("kind" = ANY (ARRAY['cnss'::"text", 'cnops'::"text", 'mutuelle'::"text", 'prive'::"text"]))),
    CONSTRAINT "insurers_name_check" CHECK (("length"("btrim"("name")) > 0))
);


ALTER TABLE "public"."insurers" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_insurer"("p_id" "uuid", "p_name" "text", "p_kind" "text", "p_default_rate" numeric) RETURNS "public"."insurers"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_row public.insurers;
begin
  perform public.mm_assert_permission('billing.collect');
  if v_clinic is null then raise exception 'no clinic for current user'; end if;

  if p_id is null then
    insert into public.insurers (clinic_id, name, kind, default_rate)
    values (v_clinic, btrim(p_name), p_kind, p_default_rate)
    returning * into v_row;
  else
    update public.insurers
    set name = btrim(p_name), kind = p_kind, default_rate = p_default_rate
    where id = p_id and clinic_id = v_clinic
    returning * into v_row;
    if not found then raise exception 'insurer not found'; end if;
    -- keep the label used by existing filters/exports in step with the insurer name
    update public.patients set mutuelle = v_row.name where insurer_id = v_row.id and cabinet_id = v_clinic;
  end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."upsert_insurer"("p_id" "uuid", "p_name" "text", "p_kind" "text", "p_default_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_type_consultation"("p_id" "uuid", "p_libelle" "text", "p_duree_minutes" integer, "p_couleur" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text") RETURNS "public"."types_consultation"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_name text := btrim(coalesce(p_libelle, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_color text := nullif(btrim(coalesce(p_couleur, '')), '');
  v_before public.types_consultation;
  v_row public.types_consultation;
begin
  perform public.mm_assert_role(array['admin', 'doctor']);
  if v_clinic is null then raise exception 'no clinic for current user'; end if;
  if length(v_name) = 0 or length(v_name) > 80 then raise exception 'invalid type name'; end if;
  if p_duree_minutes is null or p_duree_minutes < 5 or p_duree_minutes > 480 then raise exception 'invalid duration'; end if;
  if v_desc is not null and length(v_desc) > 200 then raise exception 'invalid description'; end if;

  if p_id is null then
    insert into public.types_consultation (cabinet_id, libelle, description, duree_minutes, couleur, ordre)
    values (
      v_clinic, v_name, v_desc, p_duree_minutes, v_color,
      coalesce((select max(ordre) + 1 from public.types_consultation where cabinet_id = v_clinic), 1)
    )
    returning * into v_row;
    perform public.write_audit_log('TYPE_CONSULTATION_CREATED', 'type_consultation', v_row.id, null, to_jsonb(v_row), null);
  else
    select * into v_before from public.types_consultation where id = p_id and cabinet_id = v_clinic for update;
    if not found then raise exception 'type not found'; end if;
    update public.types_consultation
    set libelle = v_name, description = v_desc, duree_minutes = p_duree_minutes, couleur = v_color, updated_at = now()
    where id = p_id
    returning * into v_row;
    perform public.write_audit_log('TYPE_CONSULTATION_UPDATED', 'type_consultation', v_row.id, to_jsonb(v_before), to_jsonb(v_row), null);
  end if;
  return v_row;
end;
$$;


ALTER FUNCTION "public"."upsert_type_consultation"("p_id" "uuid", "p_libelle" "text", "p_duree_minutes" integer, "p_couleur" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb" DEFAULT NULL::"jsonb", "p_after" "jsonb" DEFAULT NULL::"jsonb", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.audit_logs (
    clinic_id, actor_id, actor_role, action, entity_type, entity_id, before, after, metadata
  )
  values (
    public.current_clinic_id(), auth.uid(), public.current_role(),
    p_action, p_entity_type, p_entity_id, p_before, p_after, p_metadata
  );
end;
$$;


ALTER FUNCTION "public"."write_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "doctor_id" "uuid",
    "scheduled_at" timestamp with time zone NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_by" "uuid",
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'cancelled'::"text", 'completed'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."appointments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid",
    "actor_id" "uuid",
    "actor_role" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "before" "jsonb",
    "after" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cabinets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nom" "text" NOT NULL,
    "adresse" "text",
    "telephone" "text",
    "tenant_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ville" "text",
    "pin_hash" "text",
    "logo_data_url" "text",
    CONSTRAINT "cabinets_logo_data_url_check" CHECK ((("logo_data_url" IS NULL) OR (("logo_data_url" ~ '^data:image/(png|jpeg|webp);base64,'::"text") AND ("length"("logo_data_url") <= 300000))))
);


ALTER TABLE "public"."cabinets" OWNER TO "postgres";


COMMENT ON TABLE "public"."cabinets" IS 'Tenant principal du SaaS MacroMedica';



CREATE TABLE IF NOT EXISTS "public"."clinic_sequences" (
    "clinic_id" "uuid" NOT NULL,
    "sequence_type" "text" NOT NULL,
    "last_value" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clinic_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinical_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "note_type" "text" DEFAULT 'summary'::"text",
    "content" "text" NOT NULL,
    "date_note" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."clinical_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clinics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "pin_hash" "text",
    "secretary_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clinics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consultation_preparations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "text" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "created_by" "uuid",
    CONSTRAINT "consultation_preparations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."consultation_preparations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "consultation_id" "uuid",
    "type_document" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "nom_fichier" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "documents_type_document_check" CHECK (("type_document" = ANY (ARRAY['recu_consultation'::"text", 'fiche_cnss'::"text", 'ordonnance'::"text", 'recu_paiement'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drugs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "dosage" "text",
    "form" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."drugs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facture_lignes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "consultation_id" "uuid" NOT NULL,
    "acte_id" "uuid",
    "libelle_snapshot" "text" NOT NULL,
    "prix_unitaire_snapshot" numeric(10,2) NOT NULL,
    "quantite" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "facture_lignes_quantite_check" CHECK (("quantite" > 0))
);


ALTER TABLE "public"."facture_lignes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages_whatsapp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "telephone" "text" NOT NULL,
    "type_message" "text" NOT NULL,
    "contenu" "text" NOT NULL,
    "statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "whatsapp_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    CONSTRAINT "messages_whatsapp_statut_check" CHECK (("statut" = ANY (ARRAY['en_attente'::"text", 'envoye'::"text", 'echec'::"text"]))),
    CONSTRAINT "messages_whatsapp_type_message_check" CHECK (("type_message" = ANY (ARRAY['rappel_rdv'::"text", 'confirmation_paiement'::"text", 'envoi_recu'::"text"])))
);


ALTER TABLE "public"."messages_whatsapp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordonnance_lignes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ordonnance_id" "uuid" NOT NULL,
    "ordre" integer DEFAULT 0 NOT NULL,
    "medicament" "text" NOT NULL,
    "posologie" "text",
    "duree" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ordonnance_lignes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ordonnances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "encounter_id" "uuid",
    "doctor_id" "uuid" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "statut" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "date_prescription" "date" DEFAULT CURRENT_DATE NOT NULL,
    "entete" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "instructions" "text",
    "document_id" "uuid",
    "emitted_at" timestamp with time zone,
    "emitted_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ordonnances_statut_check" CHECK (("statut" = ANY (ARRAY['brouillon'::"text", 'emise'::"text", 'annulee'::"text"])))
);


ALTER TABLE "public"."ordonnances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_lab_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "exam_name" "text" NOT NULL,
    "result_value" numeric(10,2),
    "result_text" "text",
    "unit" "text",
    "norm_min" numeric(10,2),
    "norm_max" numeric(10,2),
    "status" "text" DEFAULT 'normal'::"text",
    "date_exam" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."patient_lab_results" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."patient_dossier_events" WITH ("security_invoker"='true') AS
 SELECT ('consult-'::"text" || ("c"."id")::"text") AS "id",
    'consultation'::"text" AS "kind",
    "c"."patient_id",
    COALESCE("c"."clinic_id", "c"."cabinet_id") AS "cabinet_id",
    COALESCE("c"."completed_at", ("c"."date_consult")::timestamp with time zone) AS "event_date",
    'Consultation'::"text" AS "titre",
    "c"."chief_complaint" AS "sous_titre",
    "c"."numero" AS "ref",
    "c"."statut" AS "statut_facturation",
    "jsonb_build_object"('diagnosis', "c"."diagnosis", 'treatment', "c"."treatment", 'chief_complaint', "c"."chief_complaint", 'doctor_id', "c"."doctor_id", 'montant', "c"."montant", 'total_fee', "c"."total_fee", 'lignes', ( SELECT COALESCE("jsonb_agg"("jsonb_build_object"('libelle', "fl"."libelle_snapshot", 'prix', "fl"."prix_unitaire_snapshot", 'quantite', "fl"."quantite") ORDER BY "fl"."created_at"), '[]'::"jsonb") AS "coalesce"
           FROM "public"."facture_lignes" "fl"
          WHERE ("fl"."consultation_id" = "c"."id"))) AS "payload"
   FROM "public"."consultations" "c"
UNION ALL
 SELECT ('lab-'::"text" || ("l"."id")::"text") AS "id",
    'analyse'::"text" AS "kind",
    "l"."patient_id",
    "l"."cabinet_id",
    ("l"."date_exam")::timestamp with time zone AS "event_date",
    "l"."exam_name" AS "titre",
    NULL::"text" AS "sous_titre",
    NULL::"text" AS "ref",
    NULL::"text" AS "statut_facturation",
    "jsonb_build_object"('result_value', "l"."result_value", 'result_text', "l"."result_text", 'unit', "l"."unit", 'status', "l"."status", 'norm_min', "l"."norm_min", 'norm_max', "l"."norm_max") AS "payload"
   FROM "public"."patient_lab_results" "l"
UNION ALL
 SELECT ('doc-'::"text" || ("doc"."id")::"text") AS "id",
    'ordonnance'::"text" AS "kind",
    "doc"."patient_id",
    "doc"."cabinet_id",
    "doc"."created_at" AS "event_date",
    COALESCE("doc"."nom_fichier", 'Ordonnance'::"text") AS "titre",
    NULL::"text" AS "sous_titre",
    NULL::"text" AS "ref",
    "cc"."statut" AS "statut_facturation",
    "jsonb_build_object"('storage_path', "doc"."storage_path", 'consultation_id', "doc"."consultation_id", 'medicaments', COALESCE(("public"."safe_jsonb"("cc"."notes") -> 'medicaments'::"text"), '[]'::"jsonb")) AS "payload"
   FROM ("public"."documents" "doc"
     LEFT JOIN "public"."consultations" "cc" ON (("cc"."id" = "doc"."consultation_id")))
  WHERE ("doc"."type_document" = 'ordonnance'::"text")
UNION ALL
 SELECT ('doc-'::"text" || ("doc"."id")::"text") AS "id",
    'document'::"text" AS "kind",
    "doc"."patient_id",
    "doc"."cabinet_id",
    "doc"."created_at" AS "event_date",
    COALESCE("doc"."nom_fichier", 'Document'::"text") AS "titre",
    "doc"."type_document" AS "sous_titre",
    NULL::"text" AS "ref",
    NULL::"text" AS "statut_facturation",
    "jsonb_build_object"('storage_path', "doc"."storage_path", 'type_document', "doc"."type_document") AS "payload"
   FROM "public"."documents" "doc"
  WHERE ("doc"."type_document" IS DISTINCT FROM 'ordonnance'::"text")
UNION ALL
 SELECT ('rdv-'::"text" || ("r"."id")::"text") AS "id",
    'urgence'::"text" AS "kind",
    "r"."patient_id",
    "r"."cabinet_id",
    "r"."date_rdv" AS "event_date",
    'Urgence'::"text" AS "titre",
    NULL::"text" AS "sous_titre",
    NULL::"text" AS "ref",
    NULL::"text" AS "statut_facturation",
    "jsonb_build_object"('status', "r"."status", 'arrival_status', "r"."arrival_status") AS "payload"
   FROM "public"."rdv" "r"
  WHERE (("r"."notes" ~~ '__AGENDA_META__%'::"text") AND (((SUBSTRING("r"."notes" FROM 16))::"jsonb" ->> 'type'::"text") = 'Urgence'::"text"));


ALTER VIEW "public"."patient_dossier_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_medications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "medication_name" "text" NOT NULL,
    "dosage" "text",
    "posology" "text",
    "status" "text" DEFAULT 'Actif'::"text",
    "observance" "text" DEFAULT 'Bonne'::"text",
    "start_date" "date",
    "end_date" "date",
    "prescribed_by" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."patient_medications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_problems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'Actif'::"text",
    "diagnosed_date" "date",
    "severity" "text" DEFAULT 'normal'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."patient_problems" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."patient_vitals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "consultation_id" "uuid",
    "date_mesure" timestamp with time zone DEFAULT "now"(),
    "blood_pressure" "text",
    "heart_rate" integer,
    "temperature" numeric(4,1),
    "spo2" integer,
    "weight" numeric(5,1),
    "height" numeric(5,1),
    "blood_sugar" numeric(5,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "fr" smallint,
    "douleur_eva" smallint
);


ALTER TABLE "public"."patient_vitals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "method_type" character varying(20) NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "insurance_name" character varying(100),
    "insurance_policy_number" character varying(50),
    "insurance_coverage_percent" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payment_methods_insurance_coverage_percent_check" CHECK ((("insurance_coverage_percent" >= 0) AND ("insurance_coverage_percent" <= 100))),
    CONSTRAINT "payment_methods_method_type_check" CHECK ((("method_type")::"text" = ANY ((ARRAY['cash'::character varying, 'insurance'::character varying])::"text"[])))
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clinic_id" "uuid" NOT NULL,
    "visit_id" "uuid",
    "consultation_id" "uuid",
    "patient_id" "uuid" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "method" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "received_by" "uuid",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount_paid" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "payments_amount_paid_check" CHECK ((("amount_paid" >= (0)::numeric) AND ("amount_paid" <= "amount"))),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['cash'::"text", 'card'::"text", 'transfer'::"text", 'insurance'::"text", 'package'::"text", 'free'::"text", 'cheque'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'waived'::"text", 'cancelled'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments_legacy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "consultation_id" "uuid",
    "amount" numeric NOT NULL,
    "mode" "text",
    "paid_at" timestamp with time zone DEFAULT "now"(),
    "receipt_id" character varying(10),
    "patient_id" "uuid",
    "total_amount" numeric(10,2) DEFAULT 0,
    "currency" character varying(3) DEFAULT 'MAD'::character varying,
    "status" character varying(20) DEFAULT 'completed'::character varying,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "print_requested" boolean DEFAULT false,
    "email_requested" boolean DEFAULT false,
    "email_sent_to" character varying(255),
    "sms_requested" boolean DEFAULT false,
    "sms_sent_to" character varying(20)
);


ALTER TABLE "public"."payments_legacy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "description" "text",
    "group" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescription_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prescription_id" "uuid" NOT NULL,
    "drug_id" "uuid" NOT NULL,
    "instructions" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prescription_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prescriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "doctor_id" "uuid" NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prescriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "cabinet_id" "uuid",
    "role" "text" NOT NULL,
    "nom_complet" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "clinic_id" "uuid",
    "email" "text",
    "first_name" "text",
    "last_name" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarding_completed_at" timestamp with time zone,
    "telephone" "text",
    "specialite" "text",
    CONSTRAINT "profiles_specialite_length" CHECK ((("specialite" IS NULL) OR ("char_length"("specialite") <= 120))),
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'Profil applicatif lié à auth.users';



COMMENT ON COLUMN "public"."profiles"."onboarding_completed_at" IS 'Server-set only (see protect_onboarding_completed_at trigger). NULL = onboarding not finished. Non-null = mm_finalize_invitation_acceptance successfully finalized secretary onboarding at this timestamp. Never an authorization signal — only an onboarding-state signal.';



CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "file_path" character varying(500) NOT NULL,
    "file_size" integer,
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "printed_at" timestamp with time zone,
    "emailed_at" timestamp with time zone
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role" "text" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."salle_attente" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid" NOT NULL,
    "statut" "text" DEFAULT 'en_attente'::"text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "heure_arrivee" timestamp with time zone DEFAULT "now"(),
    "date_rdv" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rdv_id" "uuid",
    CONSTRAINT "salle_attente_statut_check" CHECK (("statut" = ANY (ARRAY['en_attente'::"text", 'en_consultation'::"text", 'termine'::"text", 'annule'::"text"])))
);


ALTER TABLE "public"."salle_attente" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."secretary_visit_status_view" AS
 SELECT "v"."id",
    "v"."clinic_id",
    "v"."patient_id",
    "v"."rdv_id",
    "v"."source",
    "v"."doctor_id",
    "v"."status",
    "v"."queue_date",
    "v"."queue_number",
    "v"."queued_at",
    "v"."called_at",
    "v"."consultation_start_at",
    "v"."billing_at",
    "v"."completed_at",
    "v"."updated_at",
    "p"."prenom",
    "p"."nom",
    "p"."telephone",
    "d"."nom_complet" AS "doctor_name"
   FROM (("public"."visits" "v"
     JOIN "public"."patients" "p" ON ((("p"."id" = "v"."patient_id") AND ("p"."cabinet_id" = "v"."clinic_id"))))
     JOIN "public"."profiles" "d" ON (("d"."id" = "v"."doctor_id")));


ALTER VIEW "public"."secretary_visit_status_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cabinet_id" "uuid" NOT NULL,
    "patient_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "type" "text" NOT NULL,
    "priority" "text" DEFAULT 'normal'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "due_date" timestamp with time zone,
    "due_time" "text",
    "assigned_to" "uuid",
    "created_by" "uuid",
    "completed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "document_id" "uuid",
    CONSTRAINT "tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text", 'urgent'::"text"]))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tasks_title_check" CHECK (("char_length"(TRIM(BOTH FROM "title")) > 0)),
    CONSTRAINT "tasks_type_check" CHECK (("type" = ANY (ARRAY['patient_followup'::"text", 'clinical'::"text", 'prescription'::"text", 'results'::"text", 'administrative'::"text", 'appointment'::"text", 'other'::"text", 'billing'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "granted" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_permissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vue_ca_mensuel" AS
 SELECT "to_char"(("date_consult")::timestamp with time zone, 'YYYY-MM'::"text") AS "mois",
    "sum"(
        CASE
            WHEN ("statut" = 'paye'::"text") THEN "montant"
            ELSE (0)::numeric
        END) AS "ca_paye",
    "sum"(
        CASE
            WHEN ("statut" = 'credit'::"text") THEN "montant"
            ELSE (0)::numeric
        END) AS "ca_credit",
    "count"(*) AS "nb_consultations"
   FROM "public"."consultations"
  GROUP BY ("to_char"(("date_consult")::timestamp with time zone, 'YYYY-MM'::"text"))
  ORDER BY ("to_char"(("date_consult")::timestamp with time zone, 'YYYY-MM'::"text"));


ALTER VIEW "public"."vue_ca_mensuel" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vue_metriques_jour" AS
 SELECT "count"(*) AS "patients_aujourd_hui",
    "sum"(
        CASE
            WHEN ("statut" = 'paye'::"text") THEN "montant"
            ELSE (0)::numeric
        END) AS "ca_aujourd_hui",
    "sum"(
        CASE
            WHEN ("statut" = 'credit'::"text") THEN "montant"
            ELSE (0)::numeric
        END) AS "credits_aujourd_hui"
   FROM "public"."consultations"
  WHERE ("date_consult" = CURRENT_DATE);


ALTER VIEW "public"."vue_metriques_jour" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."vue_salle_attente" AS
 SELECT "sa"."id",
    "sa"."cabinet_id",
    "sa"."statut",
    "sa"."position",
    "sa"."heure_arrivee",
    "sa"."notes",
    "sa"."date_rdv",
    "p"."nom",
    "p"."prenom",
    "p"."telephone"
   FROM ("public"."salle_attente" "sa"
     JOIN "public"."patients" "p" ON (("p"."id" = "sa"."patient_id")))
  WHERE ("sa"."date_rdv" = CURRENT_DATE)
  ORDER BY "sa"."position", "sa"."heure_arrivee";


ALTER VIEW "public"."vue_salle_attente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_inbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "patient_phone" character varying(50) NOT NULL,
    "patient_name" character varying(255),
    "request_type" "public"."whatsapp_request_type" DEFAULT 'general'::"public"."whatsapp_request_type" NOT NULL,
    "raw_message" "text" NOT NULL,
    "status" "public"."whatsapp_inbox_status" DEFAULT 'pending'::"public"."whatsapp_inbox_status" NOT NULL,
    "extracted_details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid"
);


ALTER TABLE "public"."whatsapp_inbox" OWNER TO "postgres";


ALTER TABLE ONLY "public"."actes_catalogue"
    ADD CONSTRAINT "actes_catalogue_cabinet_id_code_key" UNIQUE ("cabinet_id", "code");



ALTER TABLE ONLY "public"."actes_catalogue"
    ADD CONSTRAINT "actes_catalogue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cabinet_agenda_settings"
    ADD CONSTRAINT "cabinet_agenda_settings_pkey" PRIMARY KEY ("cabinet_id");



ALTER TABLE ONLY "public"."cabinets"
    ADD CONSTRAINT "cabinets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinic_sequences"
    ADD CONSTRAINT "clinic_sequences_pkey" PRIMARY KEY ("clinic_id", "sequence_type");



ALTER TABLE ONLY "public"."clinical_encounters"
    ADD CONSTRAINT "clinical_encounters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinical_notes"
    ADD CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultation_preparations"
    ADD CONSTRAINT "consultation_preparations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drugs"
    ADD CONSTRAINT "drugs_name_dosage_form_unique" UNIQUE ("name", "dosage", "form");



ALTER TABLE ONLY "public"."drugs"
    ADD CONSTRAINT "drugs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facture_lignes"
    ADD CONSTRAINT "facture_lignes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insurance_claims"
    ADD CONSTRAINT "insurance_claims_payment_id_key" UNIQUE ("payment_id");



ALTER TABLE ONLY "public"."insurance_claims"
    ADD CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insurers"
    ADD CONSTRAINT "insurers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."messages_whatsapp"
    ADD CONSTRAINT "messages_whatsapp_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordonnance_lignes"
    ADD CONSTRAINT "ordonnance_lignes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_lab_results"
    ADD CONSTRAINT "patient_lab_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_medications"
    ADD CONSTRAINT "patient_medications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."patient_problems"
    ADD CONSTRAINT "patient_problems_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_blood_pressure_abs" CHECK ((("blood_pressure" IS NULL) OR
CASE
    WHEN ("blood_pressure" ~ '^\d{2,3}/\d{2,3}$'::"text") THEN (((("split_part"("blood_pressure", '/'::"text", 1))::integer >= 50) AND (("split_part"("blood_pressure", '/'::"text", 1))::integer <= 300)) AND ((("split_part"("blood_pressure", '/'::"text", 2))::integer >= 20) AND (("split_part"("blood_pressure", '/'::"text", 2))::integer <= 200)) AND (("split_part"("blood_pressure", '/'::"text", 1))::integer > ("split_part"("blood_pressure", '/'::"text", 2))::integer))
    ELSE false
END)) NOT VALID;



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_blood_sugar_abs" CHECK ((("blood_sugar" IS NULL) OR (("blood_sugar" >= 0.1) AND ("blood_sugar" <= (8)::numeric)))) NOT VALID;



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_douleur_eva_abs" CHECK ((("douleur_eva" IS NULL) OR (("douleur_eva" >= 0) AND ("douleur_eva" <= 10)))) NOT VALID;



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_fr_abs" CHECK ((("fr" IS NULL) OR (("fr" >= 4) AND ("fr" <= 80)))) NOT VALID;



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_heart_rate_abs" CHECK ((("heart_rate" IS NULL) OR (("heart_rate" >= 20) AND ("heart_rate" <= 300)))) NOT VALID;



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_height_abs" CHECK ((("height" IS NULL) OR (("height" >= (30)::numeric) AND ("height" <= (250)::numeric)))) NOT VALID;



ALTER TABLE ONLY "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_spo2_abs" CHECK ((("spo2" IS NULL) OR (("spo2" >= 50) AND ("spo2" <= 100)))) NOT VALID;



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_temperature_abs" CHECK ((("temperature" IS NULL) OR (("temperature" >= (25)::numeric) AND ("temperature" <= (45)::numeric)))) NOT VALID;



ALTER TABLE "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_weight_abs" CHECK ((("weight" IS NULL) OR (("weight" >= 0.3) AND ("weight" <= (350)::numeric)))) NOT VALID;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments_legacy"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments_legacy"
    ADD CONSTRAINT "payments_receipt_id_key" UNIQUE ("receipt_id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rdv"
    ADD CONSTRAINT "rdv_no_overlap_per_cabinet" EXCLUDE USING "gist" ("cabinet_id" WITH =, "tstzrange"("start_time", "end_time", '[)'::"text") WITH &&) WHERE ((("status" = ANY (ARRAY['scheduled'::"text", 'confirme'::"text"])) AND ("start_time" >= '2026-09-23 15:07:11.895253+00'::timestamp with time zone)));



ALTER TABLE ONLY "public"."rdv"
    ADD CONSTRAINT "rdv_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role", "permission_id");



ALTER TABLE ONLY "public"."salle_attente"
    ADD CONSTRAINT "salle_attente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."types_consultation"
    ADD CONSTRAINT "types_consultation_cabinet_id_id_key" UNIQUE ("cabinet_id", "id");



ALTER TABLE ONLY "public"."types_consultation"
    ADD CONSTRAINT "types_consultation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_permission_id_key" UNIQUE ("user_id", "permission_id");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_clinic_id_doctor_id_queue_date_queue_number_key" UNIQUE ("clinic_id", "doctor_id", "queue_date", "queue_number");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_inbox"
    ADD CONSTRAINT "whatsapp_inbox_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "actes_catalogue_cabinet_libelle_uniq" ON "public"."actes_catalogue" USING "btree" ("cabinet_id", "lower"("btrim"("libelle")));



CREATE UNIQUE INDEX "clinical_encounters_one_draft_per_doctor_patient" ON "public"."clinical_encounters" USING "btree" ("doctor_id", "patient_id") WHERE ("status" = 'draft'::"text");



CREATE INDEX "clinical_encounters_patient_idx" ON "public"."clinical_encounters" USING "btree" ("patient_id", "completed_at" DESC);



CREATE INDEX "exam_orders_cabinet_status_idx" ON "public"."exam_orders" USING "btree" ("cabinet_id", "status");



CREATE INDEX "exam_orders_encounter_idx" ON "public"."exam_orders" USING "btree" ("encounter_id");



CREATE INDEX "exam_orders_patient_idx" ON "public"."exam_orders" USING "btree" ("patient_id", "requested_at" DESC);



CREATE INDEX "idx_appointments_clinic_date" ON "public"."appointments" USING "btree" ("clinic_id", "scheduled_at");



CREATE INDEX "idx_appointments_clinic_doctor_date" ON "public"."appointments" USING "btree" ("clinic_id", "doctor_id", "scheduled_at");



CREATE INDEX "idx_appointments_clinic_status" ON "public"."appointments" USING "btree" ("clinic_id", "status");



CREATE INDEX "idx_audit_logs_clinic_created" ON "public"."audit_logs" USING "btree" ("clinic_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_consultation_preparations_visit_id" ON "public"."consultation_preparations" USING "btree" ("visit_id");



CREATE INDEX "idx_consultations_clinic_doctor" ON "public"."consultations" USING "btree" (COALESCE("clinic_id", "cabinet_id"), "doctor_id");



CREATE INDEX "idx_consultations_emitted_at" ON "public"."consultations" USING "btree" ("emitted_at");



CREATE UNIQUE INDEX "idx_consultations_numero_per_clinic" ON "public"."consultations" USING "btree" (COALESCE("clinic_id", "cabinet_id"), "numero") WHERE ("numero" IS NOT NULL);



CREATE INDEX "idx_consultations_patient" ON "public"."consultations" USING "btree" ("patient_id");



CREATE INDEX "idx_consultations_statut" ON "public"."consultations" USING "btree" ("statut");



CREATE UNIQUE INDEX "idx_consultations_visit_unique" ON "public"."consultations" USING "btree" ("visit_id") WHERE ("visit_id" IS NOT NULL);



CREATE INDEX "idx_facture_lignes_consultation_id" ON "public"."facture_lignes" USING "btree" ("consultation_id");



CREATE INDEX "idx_invitations_clinic_status" ON "public"."invitations" USING "btree" ("clinic_id", "status");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("lower"("email"));



CREATE INDEX "idx_invitations_expires_at" ON "public"."invitations" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "idx_invitations_one_active_per_target" ON "public"."invitations" USING "btree" ("clinic_id", "lower"("email"), "role") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_patients_cabinet" ON "public"."patients" USING "btree" ("cabinet_id");



CREATE INDEX "idx_payment_methods_payment" ON "public"."payment_methods" USING "btree" ("payment_id");



CREATE INDEX "idx_payments_clinic_status" ON "public"."payments" USING "btree" ("clinic_id", "status");



CREATE INDEX "idx_payments_patient" ON "public"."payments_legacy" USING "btree" ("patient_id");



CREATE INDEX "idx_payments_receipt" ON "public"."payments_legacy" USING "btree" ("receipt_id");



CREATE UNIQUE INDEX "idx_payments_visit_active" ON "public"."payments" USING "btree" ("visit_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'waived'::"text"]));



CREATE INDEX "idx_profiles_clinic_role" ON "public"."profiles" USING "btree" (COALESCE("clinic_id", "cabinet_id"), "role");



CREATE INDEX "idx_rdv_cabinet" ON "public"."rdv" USING "btree" ("cabinet_id");



CREATE INDEX "idx_tasks_cabinet_id" ON "public"."tasks" USING "btree" ("cabinet_id");



CREATE INDEX "idx_tasks_document_id" ON "public"."tasks" USING "btree" ("document_id");



CREATE INDEX "idx_tasks_due_date" ON "public"."tasks" USING "btree" ("due_date");



CREATE INDEX "idx_tasks_patient_id" ON "public"."tasks" USING "btree" ("patient_id");



CREATE INDEX "idx_tasks_priority" ON "public"."tasks" USING "btree" ("priority");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_visits_clinic_status" ON "public"."visits" USING "btree" ("clinic_id", "status");



CREATE INDEX "idx_visits_doctor_queue" ON "public"."visits" USING "btree" ("clinic_id", "doctor_id", "queue_date", "status", "queue_number");



CREATE INDEX "idx_visits_patient" ON "public"."visits" USING "btree" ("clinic_id", "patient_id", "created_at" DESC);



CREATE INDEX "idx_visits_rdv" ON "public"."visits" USING "btree" ("rdv_id");



CREATE INDEX "idx_whatsapp_inbox_patient_phone" ON "public"."whatsapp_inbox" USING "btree" ("patient_phone");



CREATE INDEX "idx_whatsapp_inbox_status_created" ON "public"."whatsapp_inbox" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "insurance_claims_clinic_status" ON "public"."insurance_claims" USING "btree" ("clinic_id", "status");



CREATE INDEX "insurance_claims_insurer" ON "public"."insurance_claims" USING "btree" ("insurer_id");



CREATE UNIQUE INDEX "insurers_clinic_name_uniq" ON "public"."insurers" USING "btree" ("clinic_id", "lower"("btrim"("name")));



CREATE INDEX "ordonnance_lignes_ordonnance_id_idx" ON "public"."ordonnance_lignes" USING "btree" ("ordonnance_id");



CREATE INDEX "ordonnances_cabinet_id_idx" ON "public"."ordonnances" USING "btree" ("cabinet_id");



CREATE INDEX "ordonnances_encounter_id_idx" ON "public"."ordonnances" USING "btree" ("encounter_id");



CREATE INDEX "ordonnances_patient_id_idx" ON "public"."ordonnances" USING "btree" ("patient_id");



CREATE INDEX "ordonnances_statut_idx" ON "public"."ordonnances" USING "btree" ("statut");



CREATE UNIQUE INDEX "rdv_one_active_per_patient_per_day" ON "public"."rdv" USING "btree" ("cabinet_id", "patient_id", "appointment_day") WHERE (("status" <> 'cancelled'::"text") AND ("created_at" >= '2026-09-13 10:40:00+00'::timestamp with time zone));



CREATE INDEX "rdv_type_consultation_id_idx" ON "public"."rdv" USING "btree" ("type_consultation_id");



CREATE UNIQUE INDEX "types_consultation_cabinet_libelle_uniq" ON "public"."types_consultation" USING "btree" ("cabinet_id", "lower"("btrim"("libelle")));



CREATE OR REPLACE TRIGGER "ensure_profile_clinic_id" BEFORE INSERT OR UPDATE OF "cabinet_id", "clinic_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_profile_clinic_id"();



CREATE OR REPLACE TRIGGER "exam_orders_touch_updated_at" BEFORE UPDATE ON "public"."exam_orders" FOR EACH ROW EXECUTE FUNCTION "public"."exam_orders_touch_updated_at"();



CREATE OR REPLACE TRIGGER "invitations_touch_updated_at" BEFORE UPDATE ON "public"."invitations" FOR EACH ROW EXECUTE FUNCTION "public"."mm_touch_updated_at"();



CREATE OR REPLACE TRIGGER "ordonnances_touch_updated_at" BEFORE UPDATE ON "public"."ordonnances" FOR EACH ROW EXECUTE FUNCTION "public"."ordonnances_set_updated_at"();



CREATE OR REPLACE TRIGGER "protect_onboarding_completed_at" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_onboarding_completed_at"();



CREATE OR REPLACE TRIGGER "protect_patient_clinical_fields" BEFORE INSERT OR UPDATE ON "public"."patients" FOR EACH ROW EXECUTE FUNCTION "public"."protect_patient_clinical_fields"();



CREATE OR REPLACE TRIGGER "protect_profile_role_and_clinic" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_role_and_clinic"();



CREATE OR REPLACE TRIGGER "rdv_set_appointment_day" BEFORE INSERT OR UPDATE OF "date_rdv" ON "public"."rdv" FOR EACH ROW EXECUTE FUNCTION "public"."rdv_set_appointment_day"();



CREATE OR REPLACE TRIGGER "rdv_sync_time_range" BEFORE INSERT OR UPDATE ON "public"."rdv" FOR EACH ROW EXECUTE FUNCTION "public"."rdv_sync_time_range"();



CREATE OR REPLACE TRIGGER "trg_cabinet_creates_clinic" AFTER INSERT ON "public"."cabinets" FOR EACH ROW EXECUTE FUNCTION "public"."mm_cabinet_creates_clinic"();



CREATE OR REPLACE TRIGGER "trg_cabinet_seed_agenda_defaults" AFTER INSERT ON "public"."cabinets" FOR EACH ROW EXECUTE FUNCTION "public"."trg_cabinet_seed_agenda_defaults"();



CREATE OR REPLACE TRIGGER "trg_encounter_completed_creates_exams" AFTER UPDATE OF "status" ON "public"."clinical_encounters" FOR EACH ROW WHEN ((("new"."status" = 'completed'::"text") AND ("old"."status" IS DISTINCT FROM 'completed'::"text"))) EXECUTE FUNCTION "public"."trg_encounter_completed_creates_exams"();



CREATE OR REPLACE TRIGGER "trg_encounter_completed_creates_ordonnance" AFTER UPDATE OF "status" ON "public"."clinical_encounters" FOR EACH ROW WHEN ((("new"."status" = 'completed'::"text") AND ("old"."status" IS DISTINCT FROM 'completed'::"text"))) EXECUTE FUNCTION "public"."trg_encounter_completed_creates_ordonnance"();



CREATE OR REPLACE TRIGGER "trg_payments_sync_amount_paid" BEFORE INSERT OR UPDATE OF "status", "amount", "amount_paid" ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."mm_payments_sync_amount_paid"();



CREATE OR REPLACE TRIGGER "update_tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_tasks_updated_at_column"();



CREATE OR REPLACE TRIGGER "zz_enforce_clinic_secretary_role" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_clinic_secretary_role"();



CREATE OR REPLACE TRIGGER "zz_enforce_founding_doctor_role" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_founding_doctor_role"();



ALTER TABLE ONLY "public"."actes_catalogue"
    ADD CONSTRAINT "actes_catalogue_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cabinet_agenda_settings"
    ADD CONSTRAINT "cabinet_agenda_settings_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinic_sequences"
    ADD CONSTRAINT "clinic_sequences_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_encounters"
    ADD CONSTRAINT "clinical_encounters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_encounters"
    ADD CONSTRAINT "clinical_encounters_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."clinical_encounters"
    ADD CONSTRAINT "clinical_encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_encounters"
    ADD CONSTRAINT "clinical_encounters_rdv_id_fkey" FOREIGN KEY ("rdv_id") REFERENCES "public"."rdv"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinical_encounters"
    ADD CONSTRAINT "clinical_encounters_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clinical_notes"
    ADD CONSTRAINT "clinical_notes_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinical_notes"
    ADD CONSTRAINT "clinical_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clinical_notes"
    ADD CONSTRAINT "clinical_notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clinics"
    ADD CONSTRAINT "clinics_secretary_id_fkey" FOREIGN KEY ("secretary_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultation_preparations"
    ADD CONSTRAINT "consultation_preparations_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultation_preparations"
    ADD CONSTRAINT "consultation_preparations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultation_preparations"
    ADD CONSTRAINT "consultation_preparations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments_legacy"("id");



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_rdv_id_fkey" FOREIGN KEY ("rdv_id") REFERENCES "public"."rdv"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."clinical_encounters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_ordered_by_fkey" FOREIGN KEY ("ordered_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_result_by_fkey" FOREIGN KEY ("result_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."exam_orders"
    ADD CONSTRAINT "exam_orders_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."facture_lignes"
    ADD CONSTRAINT "facture_lignes_acte_id_fkey" FOREIGN KEY ("acte_id") REFERENCES "public"."actes_catalogue"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."facture_lignes"
    ADD CONSTRAINT "facture_lignes_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insurance_claims"
    ADD CONSTRAINT "insurance_claims_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id");



ALTER TABLE ONLY "public"."insurance_claims"
    ADD CONSTRAINT "insurance_claims_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."insurance_claims"
    ADD CONSTRAINT "insurance_claims_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."messages_whatsapp"
    ADD CONSTRAINT "messages_whatsapp_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages_whatsapp"
    ADD CONSTRAINT "messages_whatsapp_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordonnance_lignes"
    ADD CONSTRAINT "ordonnance_lignes_ordonnance_id_fkey" FOREIGN KEY ("ordonnance_id") REFERENCES "public"."ordonnances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_emitted_by_fkey" FOREIGN KEY ("emitted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "public"."clinical_encounters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ordonnances"
    ADD CONSTRAINT "ordonnances_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_lab_results"
    ADD CONSTRAINT "patient_lab_results_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_lab_results"
    ADD CONSTRAINT "patient_lab_results_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_lab_results"
    ADD CONSTRAINT "patient_lab_results_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_medications"
    ADD CONSTRAINT "patient_medications_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_medications"
    ADD CONSTRAINT "patient_medications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_medications"
    ADD CONSTRAINT "patient_medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_problems"
    ADD CONSTRAINT "patient_problems_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_problems"
    ADD CONSTRAINT "patient_problems_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_problems"
    ADD CONSTRAINT "patient_problems_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."patient_vitals"
    ADD CONSTRAINT "patient_vitals_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."patients"
    ADD CONSTRAINT "patients_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "public"."insurers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments_legacy"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments_legacy"
    ADD CONSTRAINT "payments_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_consultation_id_fkey1" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments_legacy"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payments_legacy"
    ADD CONSTRAINT "payments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_patient_id_fkey1" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "public"."drugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescription_items"
    ADD CONSTRAINT "prescription_items_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prescriptions"
    ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rdv"
    ADD CONSTRAINT "rdv_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rdv"
    ADD CONSTRAINT "rdv_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rdv"
    ADD CONSTRAINT "rdv_type_consultation_fk" FOREIGN KEY ("cabinet_id", "type_consultation_id") REFERENCES "public"."types_consultation"("cabinet_id", "id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments_legacy"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salle_attente"
    ADD CONSTRAINT "salle_attente_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salle_attente"
    ADD CONSTRAINT "salle_attente_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."salle_attente"
    ADD CONSTRAINT "salle_attente_rdv_fkey" FOREIGN KEY ("rdv_id") REFERENCES "public"."rdv"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."types_consultation"
    ADD CONSTRAINT "types_consultation_cabinet_id_fkey" FOREIGN KEY ("cabinet_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_permissions"
    ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "public"."cabinets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_rdv_id_fkey" FOREIGN KEY ("rdv_id") REFERENCES "public"."rdv"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."whatsapp_inbox"
    ADD CONSTRAINT "whatsapp_inbox_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Allow insert on cabinets for new users" ON "public"."cabinets" FOR INSERT WITH CHECK (("auth"."uid"() = "tenant_id"));



CREATE POLICY "Allow insert on profiles for new users" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Clinic members can access their patients" ON "public"."patients" USING (("cabinet_id" IN ( SELECT "clinics"."id"
   FROM "public"."clinics"
  WHERE (("clinics"."owner_id" = "auth"."uid"()) OR ("clinics"."secretary_id" = "auth"."uid"())))));



CREATE POLICY "Clinic members can access their rdv" ON "public"."rdv" USING (("cabinet_id" IN ( SELECT "clinics"."id"
   FROM "public"."clinics"
  WHERE (("clinics"."owner_id" = "auth"."uid"()) OR ("clinics"."secretary_id" = "auth"."uid"())))));



CREATE POLICY "Docteur can read secretary profile" ON "public"."profiles" FOR SELECT USING (("clinic_id" IN ( SELECT "clinics"."id"
   FROM "public"."clinics"
  WHERE ("clinics"."owner_id" = "auth"."uid"()))));



CREATE POLICY "Docteur full access to own clinic" ON "public"."clinics" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Secretaire can read clinic without pin_hash" ON "public"."clinics" FOR SELECT USING (("secretary_id" = "auth"."uid"()));



CREATE POLICY "Users can do everything on their own cabinet" ON "public"."cabinets" USING (("auth"."uid"() = "tenant_id")) WITH CHECK (("auth"."uid"() = "tenant_id"));



CREATE POLICY "Users can do everything on their own profile" ON "public"."profiles" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."actes_catalogue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "actes_catalogue_no_direct_write" ON "public"."actes_catalogue" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "actes_catalogue_select" ON "public"."actes_catalogue" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "appointments_staff_select" ON "public"."appointments" FOR SELECT TO "authenticated" USING ((("clinic_id" = "public"."current_clinic_id"()) AND (("public"."current_role"() = ANY (ARRAY['admin'::"text", 'secretary'::"text"])) OR (("public"."current_role"() = 'doctor'::"text") AND ("doctor_id" = "auth"."uid"())))));



CREATE POLICY "appointments_staff_write" ON "public"."appointments" TO "authenticated" USING ((("clinic_id" = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['admin'::"text", 'secretary'::"text"])))) WITH CHECK ((("clinic_id" = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['admin'::"text", 'secretary'::"text"]))));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_logs_no_direct_write" ON "public"."audit_logs" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "audit_logs_select" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."is_admin"()));



CREATE POLICY "authenticated_users_insert_drugs" ON "public"."drugs" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_users_read_drugs" ON "public"."drugs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."cabinet_agenda_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cabinet_agenda_settings_no_direct_write" ON "public"."cabinet_agenda_settings" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "cabinet_agenda_settings_select" ON "public"."cabinet_agenda_settings" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



CREATE POLICY "cabinet_documents_isolation" ON "public"."documents" USING (("cabinet_id" = ( SELECT "profiles"."cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "cabinet_insert" ON "public"."cabinets" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "tenant_id"));



CREATE POLICY "cabinet_messages_isolation" ON "public"."messages_whatsapp" USING (("cabinet_id" = ( SELECT "profiles"."cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "cabinet_patients_isolation" ON "public"."patients" USING (("cabinet_id" = ( SELECT "profiles"."cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "cabinet_prescriptions_isolation" ON "public"."prescriptions" USING (("cabinet_id" = ( SELECT "profiles"."cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "cabinet_rdv_isolation" ON "public"."rdv" USING (("cabinet_id" = ( SELECT "profiles"."cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "cabinet_salle_attente_isolation" ON "public"."salle_attente" USING (("cabinet_id" = ( SELECT "profiles"."cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "cabinet_select" ON "public"."cabinets" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "tenant_id"));



CREATE POLICY "cabinet_self_access" ON "public"."cabinets" FOR SELECT USING (("id" = "public"."get_user_cabinet_id"()));



CREATE POLICY "cabinet_update" ON "public"."cabinets" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "tenant_id"));



ALTER TABLE "public"."cabinets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cabinets_owner_access" ON "public"."cabinets" TO "authenticated" USING (("auth"."uid"() = "tenant_id")) WITH CHECK (("auth"."uid"() = "tenant_id"));



ALTER TABLE "public"."clinic_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clinical_encounters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinical_encounters_select" ON "public"."clinical_encounters" FOR SELECT TO "authenticated" USING ((("clinic_id" = "public"."current_clinic_id"()) AND ("public"."is_admin"() OR (("public"."current_role"() = 'doctor'::"text") AND ("doctor_id" = "auth"."uid"())))));



ALTER TABLE "public"."clinical_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clinical_notes_doctor_admin_only" ON "public"."clinical_notes" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "clinical_notes_select" ON "public"."clinical_notes" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



CREATE POLICY "clinical_notes_write" ON "public"."clinical_notes" TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"())) WITH CHECK (("cabinet_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."clinics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consultation_preparations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consultation_preparations_doctor_admin_only" ON "public"."consultation_preparations" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



ALTER TABLE "public"."consultations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consultations_admin_select" ON "public"."consultations" FOR SELECT TO "authenticated" USING (((COALESCE("clinic_id", "cabinet_id") = "public"."current_clinic_id"()) AND "public"."is_admin"()));



CREATE POLICY "consultations_doctor_select" ON "public"."consultations" FOR SELECT TO "authenticated" USING (((COALESCE("clinic_id", "cabinet_id") = "public"."current_clinic_id"()) AND ("public"."current_role"() = 'doctor'::"text") AND ("doctor_id" = "auth"."uid"())));



CREATE POLICY "consultations_no_direct_write" ON "public"."consultations" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_clinical_boundary" ON "public"."documents" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR ("type_document" IS DISTINCT FROM 'ordonnance'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR ("type_document" IS DISTINCT FROM 'ordonnance'::"text")));



CREATE POLICY "documents_tenant_isolation" ON "public"."documents" USING (("cabinet_id" = "public"."get_user_cabinet_id"())) WITH CHECK (("cabinet_id" = "public"."get_user_cabinet_id"()));



ALTER TABLE "public"."drugs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exam_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "exam_orders_select" ON "public"."exam_orders" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."get_user_cabinet_id"()));



ALTER TABLE "public"."facture_lignes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "facture_lignes_no_direct_write" ON "public"."facture_lignes" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "facture_lignes_select" ON "public"."facture_lignes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."consultations" "c"
  WHERE (("c"."id" = "facture_lignes"."consultation_id") AND (COALESCE("c"."clinic_id", "c"."cabinet_id") = "public"."current_clinic_id"())))));



ALTER TABLE "public"."insurance_claims" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insurance_claims_no_direct_write" ON "public"."insurance_claims" USING (false) WITH CHECK (false);



CREATE POLICY "insurance_claims_select" ON "public"."insurance_claims" FOR SELECT USING ((("clinic_id" = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['admin'::"text", 'secretary'::"text", 'doctor'::"text"]))));



CREATE POLICY "insurance_claims_view_permission_gate" ON "public"."insurance_claims" AS RESTRICTIVE FOR SELECT USING (("public"."is_admin"() OR "public"."mm_has_permission"('billing.view'::"text")));



ALTER TABLE "public"."insurers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insurers_no_direct_write" ON "public"."insurers" USING (false) WITH CHECK (false);



CREATE POLICY "insurers_select" ON "public"."insurers" FOR SELECT USING ((("clinic_id" = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['admin'::"text", 'secretary'::"text", 'doctor'::"text"]))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitations_owner_insert" ON "public"."invitations" FOR INSERT TO "authenticated" WITH CHECK ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."has_any_role"(ARRAY['doctor'::"text"])));



CREATE POLICY "invitations_owner_select" ON "public"."invitations" FOR SELECT TO "authenticated" USING ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."has_any_role"(ARRAY['doctor'::"text"])));



CREATE POLICY "invitations_owner_update" ON "public"."invitations" FOR UPDATE TO "authenticated" USING ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."has_any_role"(ARRAY['doctor'::"text"]))) WITH CHECK ((("clinic_id" = "public"."current_clinic_id"()) AND "public"."has_any_role"(ARRAY['doctor'::"text"])));



ALTER TABLE "public"."messages_whatsapp" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_whatsapp_tenant_isolation" ON "public"."messages_whatsapp" USING (("cabinet_id" = "public"."get_user_cabinet_id"())) WITH CHECK (("cabinet_id" = "public"."get_user_cabinet_id"()));



ALTER TABLE "public"."ordonnance_lignes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ordonnance_lignes_emission_boundary" ON "public"."ordonnance_lignes" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."ordonnances" "o"
  WHERE (("o"."id" = "ordonnance_lignes"."ordonnance_id") AND ("o"."statut" IS DISTINCT FROM 'emise'::"text")))))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."ordonnances" "o"
  WHERE (("o"."id" = "ordonnance_lignes"."ordonnance_id") AND ("o"."statut" IS DISTINCT FROM 'emise'::"text"))))));



CREATE POLICY "ordonnance_lignes_tenant_isolation" ON "public"."ordonnance_lignes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ordonnances" "o"
  WHERE (("o"."id" = "ordonnance_lignes"."ordonnance_id") AND ("o"."cabinet_id" = "public"."get_user_cabinet_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ordonnances" "o"
  WHERE (("o"."id" = "ordonnance_lignes"."ordonnance_id") AND ("o"."cabinet_id" = "public"."get_user_cabinet_id"())))));



ALTER TABLE "public"."ordonnances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ordonnances_emission_boundary" ON "public"."ordonnances" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR ("statut" IS DISTINCT FROM 'emise'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR ("statut" IS DISTINCT FROM 'emise'::"text")));



CREATE POLICY "ordonnances_tenant_isolation" ON "public"."ordonnances" TO "authenticated" USING (("cabinet_id" = "public"."get_user_cabinet_id"())) WITH CHECK (("cabinet_id" = "public"."get_user_cabinet_id"()));



ALTER TABLE "public"."patient_lab_results" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_lab_results_doctor_admin_only" ON "public"."patient_lab_results" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "patient_lab_results_select" ON "public"."patient_lab_results" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



CREATE POLICY "patient_lab_results_write" ON "public"."patient_lab_results" TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"())) WITH CHECK (("cabinet_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."patient_medications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_medications_doctor_admin_only" ON "public"."patient_medications" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "patient_medications_select" ON "public"."patient_medications" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



CREATE POLICY "patient_medications_write" ON "public"."patient_medications" TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"())) WITH CHECK (("cabinet_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."patient_problems" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_problems_doctor_admin_only" ON "public"."patient_problems" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "patient_problems_select" ON "public"."patient_problems" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



CREATE POLICY "patient_problems_write" ON "public"."patient_problems" TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"())) WITH CHECK (("cabinet_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."patient_vitals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patient_vitals_doctor_admin_only" ON "public"."patient_vitals" AS RESTRICTIVE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text"))) WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "patient_vitals_select" ON "public"."patient_vitals" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



CREATE POLICY "patient_vitals_write" ON "public"."patient_vitals" TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"())) WITH CHECK (("cabinet_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."patients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "patients_delete_permission_gate" ON "public"."patients" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "patients_insert_permission_gate" ON "public"."patients" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR "public"."mm_has_permission"('patients.create'::"text")));



CREATE POLICY "patients_tenant_isolation" ON "public"."patients" USING (("cabinet_id" = "public"."get_user_cabinet_id"())) WITH CHECK (("cabinet_id" = "public"."get_user_cabinet_id"()));



CREATE POLICY "patients_update_permission_gate" ON "public"."patients" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR "public"."mm_has_permission"('patients.update'::"text")));



ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments_legacy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_no_direct_write" ON "public"."payments" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "payments_secure" ON "public"."payments_legacy" USING (("consultation_id" IN ( SELECT "consultations"."id"
   FROM "public"."consultations"
  WHERE ("consultations"."cabinet_id" = "public"."get_user_cabinet_id"()))));



CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT USING ((("clinic_id" = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['admin'::"text", 'secretary'::"text", 'doctor'::"text"]))));



CREATE POLICY "payments_view_permission_gate" ON "public"."payments" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."mm_has_permission"('billing.view'::"text")));



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_read" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "preparation_select" ON "public"."consultation_preparations" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



CREATE POLICY "preparation_write" ON "public"."consultation_preparations" TO "authenticated" USING ((("cabinet_id" = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['admin'::"text", 'doctor'::"text"])))) WITH CHECK ((("cabinet_id" = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['admin'::"text", 'doctor'::"text"]))));



ALTER TABLE "public"."prescription_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prescription_items_isolation" ON "public"."prescription_items" USING (("prescription_id" IN ( SELECT "prescriptions"."id"
   FROM "public"."prescriptions"
  WHERE ("prescriptions"."cabinet_id" = ( SELECT "profiles"."cabinet_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))))));



CREATE POLICY "prescription_items_secure" ON "public"."prescription_items" USING (("prescription_id" IN ( SELECT "prescriptions"."id"
   FROM "public"."prescriptions"
  WHERE ("prescriptions"."cabinet_id" = "public"."get_user_cabinet_id"()))));



ALTER TABLE "public"."prescriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "prescriptions_tenant_isolation" ON "public"."prescriptions" USING (("cabinet_id" = "public"."get_user_cabinet_id"())) WITH CHECK (("cabinet_id" = "public"."get_user_cabinet_id"()));



CREATE POLICY "profile_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profile_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "profile_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_read_own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_read_same_clinic" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("clinic_id" = "public"."current_clinic_id"()));



CREATE POLICY "profiles_self_access" ON "public"."profiles" TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."rdv" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rdv_delete_permission_gate" ON "public"."rdv" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "rdv_insert_permission_gate" ON "public"."rdv" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR "public"."mm_has_permission"('appointments.create'::"text")));



CREATE POLICY "rdv_tenant_isolation" ON "public"."rdv" USING (("cabinet_id" = "public"."get_user_cabinet_id"())) WITH CHECK (("cabinet_id" = "public"."get_user_cabinet_id"()));



CREATE POLICY "rdv_update_permission_gate" ON "public"."rdv" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR ("public"."mm_has_permission"('appointments.update'::"text") AND ("status" <> ALL (ARRAY['cancelled'::"text", 'completed'::"text"])))));



ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permissions_read" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."salle_attente" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salle_attente_tenant_isolation" ON "public"."salle_attente" USING (("cabinet_id" = "public"."get_user_cabinet_id"())) WITH CHECK (("cabinet_id" = "public"."get_user_cabinet_id"()));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_access" ON "public"."tasks" TO "authenticated" USING (("cabinet_id" IN ( SELECT "profiles"."cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "tasks_delete_permission_gate" ON "public"."tasks" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text")));



CREATE POLICY "tasks_insert_permission_gate" ON "public"."tasks" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR "public"."mm_has_permission"('tasks.create'::"text")));



CREATE POLICY "tasks_select_permission_gate" ON "public"."tasks" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR "public"."mm_has_permission"('tasks.view'::"text")));



CREATE POLICY "tasks_update_permission_gate" ON "public"."tasks" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR "public"."mm_has_permission"('tasks.update'::"text") OR "public"."mm_has_permission"('tasks.complete'::"text")));



ALTER TABLE "public"."types_consultation" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "types_consultation_no_direct_write" ON "public"."types_consultation" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "types_consultation_select" ON "public"."types_consultation" FOR SELECT TO "authenticated" USING (("cabinet_id" = "public"."current_clinic_id"()));



ALTER TABLE "public"."user_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_permissions_no_direct_write" ON "public"."user_permissions" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "user_permissions_read" ON "public"."user_permissions" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "user_permissions"."user_id") AND (COALESCE("p"."clinic_id", "p"."cabinet_id") = "public"."current_clinic_id"()) AND ("public"."current_role"() = ANY (ARRAY['doctor'::"text", 'admin'::"text"])))))));



ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visits_no_direct_write" ON "public"."visits" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "visits_select" ON "public"."visits" FOR SELECT TO "authenticated" USING ((("clinic_id" = "public"."current_clinic_id"()) AND (("public"."current_role"() = ANY (ARRAY['admin'::"text", 'secretary'::"text"])) OR (("public"."current_role"() = 'doctor'::"text") AND ("doctor_id" = "auth"."uid"())))));



CREATE POLICY "visits_view_permission_gate" ON "public"."visits" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (("public"."current_role"() = 'doctor'::"text") AND ("doctor_id" = "auth"."uid"())) OR "public"."mm_has_permission"('waiting_room.view'::"text") OR "public"."mm_has_permission"('billing.view'::"text")));



ALTER TABLE "public"."whatsapp_inbox" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whatsapp_inbox_insert" ON "public"."whatsapp_inbox" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "whatsapp_inbox_staff_select" ON "public"."whatsapp_inbox" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "whatsapp_inbox_staff_update" ON "public"."whatsapp_inbox" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."visits" TO "anon";
GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_to_waiting_room"("p_rdv_id" "uuid", "p_doctor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_to_waiting_room"("p_rdv_id" "uuid", "p_doctor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_to_waiting_room"("p_rdv_id" "uuid", "p_doctor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_to_waiting_room"("p_rdv_id" "uuid", "p_doctor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."consultations" TO "anon";
GRANT ALL ON TABLE "public"."consultations" TO "authenticated";
GRANT ALL ON TABLE "public"."consultations" TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_override_consultation_lock"("p_consultation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_override_consultation_lock"("p_consultation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_override_consultation_lock"("p_consultation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."call_patient"("p_visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."call_patient"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."call_patient"("p_visit_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."rdv" TO "anon";
GRANT ALL ON TABLE "public"."rdv" TO "authenticated";
GRANT ALL ON TABLE "public"."rdv" TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_appointment"("p_rdv_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_appointment"("p_rdv_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_appointment"("p_rdv_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_appointment_v2"("p_rdv_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_appointment_v2"("p_rdv_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_appointment_v2"("p_rdv_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_facture"("p_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_facture"("p_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_facture"("p_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_visit"("p_visit_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_visit"("p_visit_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_visit"("p_visit_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_visit"("p_visit_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_consultation"("p_rdv_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_consultation"("p_rdv_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_consultation"("p_consultation_id" "uuid", "p_chief_complaint" "text", "p_diagnosis" "text", "p_treatment" "text", "p_notes" "text", "p_billing_amount" numeric, "p_billing_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_consultation"("p_consultation_id" "uuid", "p_chief_complaint" "text", "p_diagnosis" "text", "p_treatment" "text", "p_notes" "text", "p_billing_amount" numeric, "p_billing_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_consultation"("p_consultation_id" "uuid", "p_chief_complaint" "text", "p_diagnosis" "text", "p_treatment" "text", "p_notes" "text", "p_billing_amount" numeric, "p_billing_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_appointment"("p_rdv_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_appointment"("p_rdv_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_appointment"("p_rdv_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_appointment_v2"("p_rdv_id" "uuid", "p_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_appointment_v2"("p_rdv_id" "uuid", "p_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_appointment_v2"("p_rdv_id" "uuid", "p_method" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_facture"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_remise" numeric, "p_lignes" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_facture"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_remise" numeric, "p_lignes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_facture"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_remise" numeric, "p_lignes" "jsonb") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."insurance_claims" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."insurance_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."insurance_claims" TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_insurance_claim"("p_payment_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_insurance_claim"("p_payment_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_insurance_claim"("p_payment_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_visit_from_rdv"("p_rdv_id" "uuid", "p_doctor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_visit_from_rdv"("p_rdv_id" "uuid", "p_doctor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_visit_from_rdv"("p_rdv_id" "uuid", "p_doctor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_visit_from_rdv"("p_rdv_id" "uuid", "p_doctor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_walk_in_visit"("p_patient_id" "uuid", "p_doctor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_walk_in_visit"("p_patient_id" "uuid", "p_doctor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_walk_in_visit"("p_patient_id" "uuid", "p_doctor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_clinic_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_clinic_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_clinic_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_payment_guarded"("p_payment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_payment_guarded"("p_payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_payment_guarded"("p_payment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."emit_facture"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."emit_facture"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."emit_facture"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_clinic_secretary_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_clinic_secretary_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_clinic_secretary_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_founding_doctor_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_founding_doctor_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_founding_doctor_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_single_consultation"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_consultation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_consultation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_profile_clinic_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_profile_clinic_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_profile_clinic_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."exam_orders_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."exam_orders_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."exam_orders_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."facturation_tva"() TO "anon";
GRANT ALL ON FUNCTION "public"."facturation_tva"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."facturation_tva"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_debiteurs"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_debiteurs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_debiteurs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_facturation_stats"("p_periode" integer, "p_praticien" "uuid", "p_assureur" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_facturation_stats"("p_periode" integer, "p_praticien" "uuid", "p_assureur" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_facturation_stats"("p_periode" integer, "p_praticien" "uuid", "p_assureur" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_facture_net"("p_consultation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_facture_net"("p_consultation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_facture_net"("p_consultation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_cabinet_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_cabinet_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_cabinet_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_any_role"("required_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_any_role"("required_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_any_role"("required_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm__clinical_text_listed"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm__clinical_text_listed"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm__clinical_text_listed"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm__parse_num"("p" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm__parse_num"("p" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_accept_invitation"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_accept_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_accept_invitation"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_accept_invitation_by_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."mm_accept_invitation_by_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_accept_invitation_by_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_assert_permission"("p_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_assert_permission"("p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_assert_permission"("p_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_assert_role"("required_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."mm_assert_role"("required_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_assert_role"("required_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_assert_same_clinic"("p_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_assert_same_clinic"("p_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_assert_same_clinic"("p_clinic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_cabinet_creates_clinic"() TO "anon";
GRANT ALL ON FUNCTION "public"."mm_cabinet_creates_clinic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_cabinet_creates_clinic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_cancel_ordonnance"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_cancel_ordonnance"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_cancel_ordonnance"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_complete_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer, "p_billing_amount" numeric, "p_billing_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_complete_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer, "p_billing_amount" numeric, "p_billing_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_complete_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer, "p_billing_amount" numeric, "p_billing_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_create_invitation"("p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_create_invitation"("p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_create_invitation"("p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_create_ordonnance"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_create_ordonnance"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_create_ordonnance"("p_patient_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_duplicate_ordonnance"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_duplicate_ordonnance"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_duplicate_ordonnance"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_emit_ordonnance"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_emit_ordonnance"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_emit_ordonnance"("p_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."exam_orders" TO "service_role";
GRANT SELECT ON TABLE "public"."exam_orders" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mm_exam_attach_result"("p_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_mime" "text", "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_exam_attach_result"("p_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_mime" "text", "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_exam_attach_result"("p_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_file_mime" "text", "p_comment" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_exam_cancel"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_exam_cancel"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_exam_cancel"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_exam_category"("p_label" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_exam_category"("p_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_exam_category"("p_label" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_exam_create"("p_patient_id" "uuid", "p_labels" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_exam_create"("p_patient_id" "uuid", "p_labels" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_exam_create"("p_patient_id" "uuid", "p_labels" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_exam_lock"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_exam_lock"("p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_exam_review"("p_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_exam_review"("p_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_exam_review"("p_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_exams_from_encounter"("p_encounter_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_exams_from_encounter"("p_encounter_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_execute_task_action"("p_task_id" "uuid", "p_action_key" "text", "p_action_role" "text", "p_note" "text", "p_assign_to" "text", "p_priority" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_execute_task_action"("p_task_id" "uuid", "p_action_key" "text", "p_action_role" "text", "p_note" "text", "p_assign_to" "text", "p_priority" "text", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_execute_task_action"("p_task_id" "uuid", "p_action_key" "text", "p_action_role" "text", "p_note" "text", "p_assign_to" "text", "p_priority" "text", "p_status" "text") TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_finalize_invitation_acceptance"("v_row" "public"."invitations") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_finalize_invitation_acceptance"("v_row" "public"."invitations") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_finalize_invitation_acceptance"("v_row" "public"."invitations") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_format_doctor_label"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_format_doctor_label"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_format_doctor_label"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_get_my_pending_invitation"() TO "anon";
GRANT ALL ON FUNCTION "public"."mm_get_my_pending_invitation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_get_my_pending_invitation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_get_my_permissions"() TO "anon";
GRANT ALL ON FUNCTION "public"."mm_get_my_permissions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_get_my_permissions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_get_patient_clinical"("p_patient_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_get_patient_clinical"("p_patient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_get_patient_clinical"("p_patient_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_get_user_permissions"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_get_user_permissions"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_get_user_permissions"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_has_permission"("p_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_has_permission"("p_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_has_permission"("p_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_hash_invitation_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_hash_invitation_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_hash_invitation_token"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_is_ordonnance_storage_path"("p_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_is_ordonnance_storage_path"("p_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_is_ordonnance_storage_path"("p_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_mark_appointment_arrived"("p_rdv_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_mark_appointment_arrived"("p_rdv_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_mark_appointment_arrived"("p_rdv_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_next_facture_numero"("p_clinic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_next_facture_numero"("p_clinic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_next_facture_numero"("p_clinic_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_next_queue_number"("p_clinic_id" "uuid", "p_doctor_id" "uuid", "p_queue_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_next_queue_number"("p_clinic_id" "uuid", "p_doctor_id" "uuid", "p_queue_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_next_queue_number"("p_clinic_id" "uuid", "p_doctor_id" "uuid", "p_queue_date" "date") TO "service_role";



GRANT ALL ON TABLE "public"."clinical_encounters" TO "service_role";
GRANT SELECT ON TABLE "public"."clinical_encounters" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mm_open_encounter"("p_patient_id" "uuid", "p_visit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_open_encounter"("p_patient_id" "uuid", "p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_open_encounter"("p_patient_id" "uuid", "p_visit_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_ordonnance_from_encounter"("p_encounter_id" "uuid", "p_audit" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_ordonnance_from_encounter"("p_encounter_id" "uuid", "p_audit" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_payments_sync_amount_paid"() TO "anon";
GRANT ALL ON FUNCTION "public"."mm_payments_sync_amount_paid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_payments_sync_amount_paid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_resend_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_resend_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_resend_invitation"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_resolve_owner_id"("p_candidate" "uuid", "p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_resolve_owner_id"("p_candidate" "uuid", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_resolve_owner_id"("p_candidate" "uuid", "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_revoke_invitation"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_revoke_invitation"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_revoke_invitation"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_role_key"("raw_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_role_key"("raw_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_role_key"("raw_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_save_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_save_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_save_encounter"("p_id" "uuid", "p_note" "jsonb", "p_expected_version" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_seed_cabinet_agenda_defaults"("p_cabinet_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_seed_cabinet_agenda_defaults"("p_cabinet_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_set_patient_clinical"("p_patient_id" "uuid", "p_allergies_status" "text", "p_allergies" "text", "p_antecedents_status" "text", "p_antecedents" "text", "p_medications_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_set_patient_clinical"("p_patient_id" "uuid", "p_allergies_status" "text", "p_allergies" "text", "p_antecedents_status" "text", "p_antecedents" "text", "p_medications_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_set_patient_clinical"("p_patient_id" "uuid", "p_allergies_status" "text", "p_allergies" "text", "p_antecedents_status" "text", "p_antecedents" "text", "p_medications_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_set_user_permission"("p_user_id" "uuid", "p_permission_key" "text", "p_granted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."mm_set_user_permission"("p_user_id" "uuid", "p_permission_key" "text", "p_granted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_set_user_permission"("p_user_id" "uuid", "p_permission_key" "text", "p_granted" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_sync_cabinets_clinics"() TO "anon";
GRANT ALL ON FUNCTION "public"."mm_sync_cabinets_clinics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_sync_cabinets_clinics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."mm_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_update_ordonnance"("p_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_update_ordonnance"("p_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_update_ordonnance"("p_id" "uuid", "p_doctor_id" "uuid", "p_encounter_id" "uuid", "p_date_prescription" "date", "p_entete" "jsonb", "p_instructions" "text", "p_lignes" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mm_validate_invitation_token"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mm_validate_invitation_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_validate_invitation_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mm_void_encounter"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mm_void_encounter"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mm_void_encounter"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."open_consultation"("p_visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."open_consultation"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_consultation"("p_visit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ordonnances_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."ordonnances_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ordonnances_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_visit_payment"("p_visit_id" "uuid", "p_method" "text", "p_amount" numeric, "p_partial" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_visit_payment"("p_visit_id" "uuid", "p_method" "text", "p_amount" numeric, "p_partial" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_visit_payment"("p_visit_id" "uuid", "p_method" "text", "p_amount" numeric, "p_partial" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_onboarding_completed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_onboarding_completed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_onboarding_completed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_patient_clinical_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_patient_clinical_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_patient_clinical_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_profile_role_and_clinic"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_role_and_clinic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_role_and_clinic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rdv_set_appointment_day"() TO "anon";
GRANT ALL ON FUNCTION "public"."rdv_set_appointment_day"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rdv_set_appointment_day"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rdv_sync_time_range"() TO "anon";
GRANT ALL ON FUNCTION "public"."rdv_sync_time_range"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rdv_sync_time_range"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reassign_visit_doctor"("p_visit_id" "uuid", "p_doctor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reassign_visit_doctor"("p_visit_id" "uuid", "p_doctor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reassign_visit_doctor"("p_visit_id" "uuid", "p_doctor_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_claim_reimbursement"("p_claim_id" "uuid", "p_amount" numeric, "p_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_claim_reimbursement"("p_claim_id" "uuid", "p_amount" numeric, "p_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_claim_reimbursement"("p_claim_id" "uuid", "p_amount" numeric, "p_reference" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_payment"("p_rdv_id" "uuid", "p_amount" numeric, "p_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_payment"("p_rdv_id" "uuid", "p_amount" numeric, "p_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment"("p_rdv_id" "uuid", "p_amount" numeric, "p_method" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_payment_guarded"("p_consultation_id" "uuid", "p_amount" numeric, "p_method" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_payment_guarded"("p_consultation_id" "uuid", "p_amount" numeric, "p_method" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_payment_guarded"("p_consultation_id" "uuid", "p_amount" numeric, "p_method" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_consultation_lock"("p_consultation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_consultation_lock"("p_consultation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_consultation_lock"("p_consultation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_consultation_lock"("p_consultation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_consultation_lock"("p_consultation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_consultation_lock"("p_consultation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reschedule_appointment"("p_rdv_id" "uuid", "p_scheduled_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."reschedule_appointment"("p_rdv_id" "uuid", "p_scheduled_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reschedule_appointment"("p_rdv_id" "uuid", "p_scheduled_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_jsonb"("p_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_jsonb"("p_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_jsonb"("p_text" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."actes_catalogue" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."actes_catalogue" TO "authenticated";
GRANT ALL ON TABLE "public"."actes_catalogue" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_acte_active"("p_id" "uuid", "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_acte_active"("p_id" "uuid", "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_acte_active"("p_id" "uuid", "p_active" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."patients" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."patients" TO "authenticated";
GRANT ALL ON TABLE "public"."patients" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("cabinet_id") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("nom") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("prenom") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("telephone") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("date_naissance") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("cin") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("adresse") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("mutuelle") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("numero_cnss") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("email") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("ville") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("sexe") ON TABLE "public"."patients" TO "authenticated";



GRANT SELECT("date_naissance_approx") ON TABLE "public"."patients" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_patient_coverage"("p_patient_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_patient_coverage"("p_patient_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_patient_coverage"("p_patient_id" "uuid", "p_insurer_id" "uuid", "p_rate" numeric) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."types_consultation" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."types_consultation" TO "authenticated";
GRANT ALL ON TABLE "public"."types_consultation" TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_type_consultation_active"("p_id" "uuid", "p_actif" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_type_consultation_active"("p_id" "uuid", "p_actif" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_type_consultation_active"("p_id" "uuid", "p_actif" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_consultation"("p_rdv_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_consultation"("p_rdv_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."start_consultation_safe"("p_rdv_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_consultation_safe"("p_rdv_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_cabinet_seed_agenda_defaults"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_cabinet_seed_agenda_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_cabinet_seed_agenda_defaults"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_encounter_completed_creates_exams"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_encounter_completed_creates_exams"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_encounter_completed_creates_exams"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_encounter_completed_creates_ordonnance"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_encounter_completed_creates_ordonnance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_encounter_completed_creates_ordonnance"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."undo_add_to_waiting_room"("p_visit_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_add_to_waiting_room"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."undo_add_to_waiting_room"("p_visit_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_claim_status"("p_claim_id" "uuid", "p_status" "text", "p_reference" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_claim_status"("p_claim_id" "uuid", "p_status" "text", "p_reference" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_claim_status"("p_claim_id" "uuid", "p_status" "text", "p_reference" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_patient_statut"("p_id" "uuid", "p_statut" "text", "p_position" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_patient_statut"("p_id" "uuid", "p_statut" "text", "p_position" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tasks_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tasks_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tasks_updated_at_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_acte"("p_id" "uuid", "p_libelle" "text", "p_prix" numeric, "p_categorie" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_acte"("p_id" "uuid", "p_libelle" "text", "p_prix" numeric, "p_categorie" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_acte"("p_id" "uuid", "p_libelle" "text", "p_prix" numeric, "p_categorie" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cabinet_agenda_settings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cabinet_agenda_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."cabinet_agenda_settings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_cabinet_agenda_settings"("p_heure_debut" time without time zone, "p_heure_fin" time without time zone, "p_pas_minutes" integer, "p_duree_defaut_minutes" integer, "p_pause_debut" time without time zone, "p_pause_fin" time without time zone, "p_jours_ouvres" smallint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_cabinet_agenda_settings"("p_heure_debut" time without time zone, "p_heure_fin" time without time zone, "p_pas_minutes" integer, "p_duree_defaut_minutes" integer, "p_pause_debut" time without time zone, "p_pause_fin" time without time zone, "p_jours_ouvres" smallint[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_cabinet_agenda_settings"("p_heure_debut" time without time zone, "p_heure_fin" time without time zone, "p_pas_minutes" integer, "p_duree_defaut_minutes" integer, "p_pause_debut" time without time zone, "p_pause_fin" time without time zone, "p_jours_ouvres" smallint[]) TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."insurers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."insurers" TO "authenticated";
GRANT ALL ON TABLE "public"."insurers" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_insurer"("p_id" "uuid", "p_name" "text", "p_kind" "text", "p_default_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_insurer"("p_id" "uuid", "p_name" "text", "p_kind" "text", "p_default_rate" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_insurer"("p_id" "uuid", "p_name" "text", "p_kind" "text", "p_default_rate" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_type_consultation"("p_id" "uuid", "p_libelle" "text", "p_duree_minutes" integer, "p_couleur" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_type_consultation"("p_id" "uuid", "p_libelle" "text", "p_duree_minutes" integer, "p_couleur" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_type_consultation"("p_id" "uuid", "p_libelle" "text", "p_duree_minutes" integer, "p_couleur" "text", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."write_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."write_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."write_audit_log"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "anon";
GRANT ALL ON TABLE "public"."appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."appointments" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."cabinets" TO "anon";
GRANT ALL ON TABLE "public"."cabinets" TO "authenticated";
GRANT ALL ON TABLE "public"."cabinets" TO "service_role";



GRANT ALL ON TABLE "public"."clinic_sequences" TO "anon";
GRANT ALL ON TABLE "public"."clinic_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."clinic_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."clinical_notes" TO "anon";
GRANT ALL ON TABLE "public"."clinical_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."clinical_notes" TO "service_role";



GRANT ALL ON TABLE "public"."clinics" TO "anon";
GRANT ALL ON TABLE "public"."clinics" TO "authenticated";
GRANT ALL ON TABLE "public"."clinics" TO "service_role";



GRANT ALL ON TABLE "public"."consultation_preparations" TO "anon";
GRANT ALL ON TABLE "public"."consultation_preparations" TO "authenticated";
GRANT ALL ON TABLE "public"."consultation_preparations" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."drugs" TO "anon";
GRANT ALL ON TABLE "public"."drugs" TO "authenticated";
GRANT ALL ON TABLE "public"."drugs" TO "service_role";



GRANT ALL ON TABLE "public"."facture_lignes" TO "anon";
GRANT ALL ON TABLE "public"."facture_lignes" TO "authenticated";
GRANT ALL ON TABLE "public"."facture_lignes" TO "service_role";



GRANT ALL ON TABLE "public"."messages_whatsapp" TO "anon";
GRANT ALL ON TABLE "public"."messages_whatsapp" TO "authenticated";
GRANT ALL ON TABLE "public"."messages_whatsapp" TO "service_role";



GRANT ALL ON TABLE "public"."ordonnance_lignes" TO "anon";
GRANT ALL ON TABLE "public"."ordonnance_lignes" TO "authenticated";
GRANT ALL ON TABLE "public"."ordonnance_lignes" TO "service_role";



GRANT ALL ON TABLE "public"."ordonnances" TO "anon";
GRANT ALL ON TABLE "public"."ordonnances" TO "authenticated";
GRANT ALL ON TABLE "public"."ordonnances" TO "service_role";



GRANT ALL ON TABLE "public"."patient_lab_results" TO "anon";
GRANT ALL ON TABLE "public"."patient_lab_results" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_lab_results" TO "service_role";



GRANT ALL ON TABLE "public"."patient_dossier_events" TO "anon";
GRANT ALL ON TABLE "public"."patient_dossier_events" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_dossier_events" TO "service_role";



GRANT ALL ON TABLE "public"."patient_medications" TO "anon";
GRANT ALL ON TABLE "public"."patient_medications" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_medications" TO "service_role";



GRANT ALL ON TABLE "public"."patient_problems" TO "anon";
GRANT ALL ON TABLE "public"."patient_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_problems" TO "service_role";



GRANT ALL ON TABLE "public"."patient_vitals" TO "anon";
GRANT ALL ON TABLE "public"."patient_vitals" TO "authenticated";
GRANT ALL ON TABLE "public"."patient_vitals" TO "service_role";



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."payments_legacy" TO "anon";
GRANT ALL ON TABLE "public"."payments_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."payments_legacy" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."prescription_items" TO "anon";
GRANT ALL ON TABLE "public"."prescription_items" TO "authenticated";
GRANT ALL ON TABLE "public"."prescription_items" TO "service_role";



GRANT ALL ON TABLE "public"."prescriptions" TO "anon";
GRANT ALL ON TABLE "public"."prescriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."prescriptions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."receipts" TO "anon";
GRANT ALL ON TABLE "public"."receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."receipts" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."salle_attente" TO "anon";
GRANT ALL ON TABLE "public"."salle_attente" TO "authenticated";
GRANT ALL ON TABLE "public"."salle_attente" TO "service_role";



GRANT ALL ON TABLE "public"."secretary_visit_status_view" TO "anon";
GRANT ALL ON TABLE "public"."secretary_visit_status_view" TO "authenticated";
GRANT ALL ON TABLE "public"."secretary_visit_status_view" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."vue_ca_mensuel" TO "anon";
GRANT ALL ON TABLE "public"."vue_ca_mensuel" TO "authenticated";
GRANT ALL ON TABLE "public"."vue_ca_mensuel" TO "service_role";



GRANT ALL ON TABLE "public"."vue_metriques_jour" TO "anon";
GRANT ALL ON TABLE "public"."vue_metriques_jour" TO "authenticated";
GRANT ALL ON TABLE "public"."vue_metriques_jour" TO "service_role";



GRANT ALL ON TABLE "public"."vue_salle_attente" TO "anon";
GRANT ALL ON TABLE "public"."vue_salle_attente" TO "authenticated";
GRANT ALL ON TABLE "public"."vue_salle_attente" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_inbox" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_inbox" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_inbox" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







