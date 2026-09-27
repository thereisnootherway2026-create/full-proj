-- LOCAL DEV ONLY (supabase start). Loaded after local/schema.sql.
-- What the public-schema dump cannot carry, because it lives in the auth / storage schemas.

-- 1. Signup trigger on auth.users (same definition as 1_setup_roles_pin.sql). The function
--    public.handle_new_user() itself comes from the dump: doctor signup -> cabinet + clinic + profile.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Buckets used by the app (rows are data, so not in any schema dump).
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-results', 'exam-results', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- 3. storage.objects policies, extracted verbatim from production
--    (`supabase db dump --linked --schema storage`, CREATE POLICY statements only).
CREATE POLICY "cabinet_storage_isolation" ON "storage"."objects" USING ((("bucket_id" = 'documents'::"text") AND (("storage"."foldername"("name"))[1] = ( SELECT ("profiles"."cabinet_id")::"text" AS "cabinet_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));

CREATE POLICY "exam_results_delete_own" ON "storage"."objects" FOR DELETE TO "authenticated" USING ((("bucket_id" = 'exam-results'::"text") AND ("owner" = "auth"."uid"())));

CREATE POLICY "exam_results_read" ON "storage"."objects" FOR SELECT TO "authenticated" USING ((("bucket_id" = 'exam-results'::"text") AND (("storage"."foldername"("name"))[1] = ("public"."get_user_cabinet_id"())::"text")));

CREATE POLICY "exam_results_upload" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'exam-results'::"text") AND (("storage"."foldername"("name"))[1] = ("public"."get_user_cabinet_id"())::"text") AND (EXISTS ( SELECT 1
   FROM "public"."exam_orders" "e"
  WHERE ((("e"."id")::"text" = ("storage"."foldername"("objects"."name"))[3]) AND (("e"."patient_id")::"text" = ("storage"."foldername"("objects"."name"))[2]) AND ("e"."cabinet_id" = "public"."get_user_cabinet_id"()))))));

CREATE POLICY "storage_ordonnance_boundary" ON "storage"."objects" AS RESTRICTIVE TO "authenticated" USING ((("bucket_id" IS DISTINCT FROM 'documents'::"text") OR "public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR (NOT "public"."mm_is_ordonnance_storage_path"("name")))) WITH CHECK ((("bucket_id" IS DISTINCT FROM 'documents'::"text") OR "public"."is_admin"() OR ("public"."current_role"() = 'doctor'::"text") OR (NOT "public"."mm_is_ordonnance_storage_path"("name"))));
