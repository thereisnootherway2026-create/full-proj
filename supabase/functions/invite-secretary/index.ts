import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import {
  isDoctorRole,
  ensureTenantForProfile,
  setTenantSecretary,
  userManagesTenant,
} from "../_shared/tenant.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// Errors raised by the mm_* Postgres RPCs are safe, already-translated-intent
// messages (see the migration) — never raw Postgres/service-role internals.
const RPC_ERROR_MESSAGES: Record<string, string> = {
  'no clinic associated with this account': "Votre compte n'est pas lié à un cabinet. Déconnectez-vous et reconnectez-vous.",
  'invalid email': 'Veuillez saisir une adresse e-mail valide.',
  'role not allowed for invitation': "Ce rôle ne peut pas être invité par cette fonctionnalité.",
  'email already belongs to a member of this clinic': 'Cette personne fait déjà partie de votre équipe.',
  'email already belongs to another clinic': 'Cette adresse est déjà associée à un autre cabinet.',
  'duplicate pending invitation': 'Une invitation est déjà en attente pour cette adresse.',
  'invitation not found': 'Invitation introuvable.',
  'only a pending invitation can be resent': 'Seule une invitation en attente peut être renvoyée.',
  'only a pending invitation can be revoked': 'Seule une invitation en attente peut être révoquée.',
  'please wait before resending this invitation': 'Veuillez patienter avant de renvoyer cette invitation.',
  'not authorized': "Vous n'avez pas l'autorisation d'effectuer cette action.",
  // Not reached through this Edge Function today (acceptance RPCs are called
  // directly from the client — see SecretaryWelcomePage.tsx, which maps these
  // same messages), but kept here too in case anything ever routes acceptance
  // through invite-secretary in the future.
  'clinic already has an active secretary': 'Ce cabinet possède déjà un secrétaire.',
  'account already belongs to another clinic': 'Cette adresse est déjà associée à un autre cabinet.',
}

function safeMessage(err: unknown, fallback: string) {
  const raw = err instanceof Error ? err.message : String(err)
  for (const key of Object.keys(RPC_ERROR_MESSAGES)) {
    if (raw.includes(key)) return RPC_ERROR_MESSAGES[key]
  }
  console.error('invite-secretary error (raw, server-side only):', raw)
  return fallback
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Non autorisé' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ error: 'Non autorisé' }, 401)
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, cabinet_id, clinic_id, nom_complet')
      .eq('id', user.id)
      .single()

    if (!profile || !isDoctorRole(profile.role)) {
      return jsonResponse({ error: 'Seul le docteur peut gérer les secrétaires' }, 403)
    }

    // Self-heals a missing/orphaned cabinets/clinics row for this doctor so
    // current_clinic_id() (used by every mm_* RPC below) resolves correctly.
    let tenant
    try {
      tenant = await ensureTenantForProfile(supabaseAdmin, profile)
    } catch (ensureError) {
      console.error('ensureTenantForProfile failed', ensureError)
      return jsonResponse({ error: 'Impossible de préparer votre cabinet. Réessayez ou contactez le support.' }, 500)
    }

    if (!tenant) {
      return jsonResponse({ error: "Votre compte n'est pas lié à un cabinet. Déconnectez-vous et reconnectez-vous." }, 400)
    }

    const canManage = await userManagesTenant(supabaseAdmin, user.id, tenant.id)
    if (!canManage) {
      console.error('invite-secretary denied', { userId: user.id, tenantId: tenant.id })
      return jsonResponse({ error: "Vous n'êtes pas propriétaire de cette clinique" }, 403)
    }

    // RPC calls run as the calling doctor (their own JWT), not the service
    // role, so mm_assert_role/current_clinic_id() inside the RPCs resolve
    // against the real authenticated user and can't be bypassed.
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Click-to-activate flow: the email's CTA is Supabase's own
    // {{ .ConfirmationURL }} (configured in the Dashboard template), which
    // authenticates the invited user via GoTrue's own verify endpoint
    // *before* redirecting here — so this redirect no longer needs to carry
    // our custom invitation token or email; SecretaryWelcomePage looks up
    // the invitation by the now-authenticated session instead (see
    // mm_get_my_pending_invitation). mm_create_invitation/mm_resend_invitation
    // still generate a raw_token for the invitations.token_hash column
    // (unchanged, pre-existing schema) — it's just no longer threaded
    // through the redirect URL.
    const baseUrl = (Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'http://localhost:5173').replace(/\/$/, '')
    const redirectTo = `${baseUrl}/bienvenue-secretaire`

    // Detects "this email already has a confirmed Supabase Auth account" —
    // distinct from a genuine send failure (invalid domain, rate limit,
    // etc.), which must still surface as an error. error.code is the
    // documented, version-stable field for this (see @supabase/auth-js's
    // ErrorCode union: 'email_exists' | 'user_already_exists'); the message
    // substring check is defense in depth only.
    const isAlreadyRegisteredError = (err: unknown): boolean => {
      const anyErr = err as { code?: string; message?: string } | null | undefined
      const code = anyErr?.code
      if (code === 'email_exists' || code === 'user_already_exists') return true
      return /already.*(regist|exist)/i.test(String(anyErr?.message || ''))
    }

    // For a brand-new email, inviteUserByEmail both creates the Auth user
    // and sends the "Invite user" email — unchanged. But GoTrue refuses to
    // (re-)invite an email that already has a CONFIRMED Auth account, which
    // now happens routinely under the click-to-activate flow: merely
    // clicking the ConfirmationURL confirms the account server-side (auth.
    // users.confirmed_at gets set at that moment — confirmed live) even if
    // the secretary never finishes onboarding. Re-inviting that same email
    // later (after the doctor revokes/lets the stale invitation expire)
    // must still work without deleting or recreating the Auth user.
    //
    // resetPasswordForEmail() was tried first and rejected: it works
    // mechanically (delivers, redirects correctly) but always sends via
    // Supabase's "Recovery" template, which is unavoidably password-reset
    // wording — misleading UX for what is actually an invitation.
    //
    // signInWithOtp() is the right primitive instead. Per the installed SDK's
    // own documented behavior: "If the {{ .ConfirmationURL }} variable is
    // specified in the email template, a magiclink will be sent" — the
    // "Magic Link" template is a THIRD template, fully separate from both
    // "Invite user" and "Recovery", and fully rewritable in the Dashboard
    // (see the migration note / final report for the exact copy). Unlike
    // inviteUserByEmail, signInWithOtp carries no "already registered"
    // restriction — it's designed to sign in an existing user without a
    // password, which is exactly this case. shouldCreateUser:false is a
    // deliberate safety rail: it refuses to silently create a new Auth user
    // if this email somehow doesn't already have one (it always will here,
    // since this branch only runs after inviteUserByEmail's rejection
    // already proved the account exists). Called server-side like this (no
    // real browser-side PKCE context initiated it), it's expected to
    // deliver via the same implicit-flow URL fragment
    // (#access_token=...&refresh_token=...) already confirmed live for
    // admin-generated invite links, which SecretaryWelcomePage already
    // consumes unchanged — not yet empirically re-confirmed for this
    // specific method (no real email sent this pass), flagged in the report.
    const sendActivationEmail = async (email: string) => {
      const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { role: 'secretaire', clinic_id: tenant!.id, cabinet_id: tenant!.id },
      })
      if (!inviteErr) return

      if (!isAlreadyRegisteredError(inviteErr)) throw inviteErr

      const { error: otpErr } = await supabaseAdmin.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
          data: { role: 'secretaire', clinic_id: tenant!.id, cabinet_id: tenant!.id },
        },
      })
      if (otpErr) throw otpErr
    }

    if (req.method === 'POST') {
      const body = await req.json()
      const email = String(body?.email || '').trim().toLowerCase()
      if (!email) return jsonResponse({ error: "L'email est requis" }, 400)

      if (tenant.secretaryId) {
        return jsonResponse({ error: "Une secrétaire est déjà associée. Révoquez-la d'abord." }, 409)
      }

      const { data: created, error: createErr } = await supabaseUser
        .rpc('mm_create_invitation', { p_email: email, p_role: 'secretaire' })
        .single()

      if (createErr) {
        return jsonResponse({ error: safeMessage(createErr, "L'invitation n'a pas pu être créée.") }, 400)
      }

      try {
        await sendActivationEmail(email)
      } catch (mailErr) {
        // Roll back: an invitation record with no way to ever act on it (no
        // one received a token) is worse than no record at all.
        await supabaseUser.rpc('mm_revoke_invitation', { p_invitation_id: created.id })
        console.error('invite email send failed', mailErr)
        // Root cause of the original "always 502" investigation: Supabase
        // Auth rejects reserved/non-deliverable domains (e.g. example.com)
        // with an "email address is invalid" error — confirmed live. The
        // "already registered" case is now handled above via signInWithOtp
        // and doesn't reach here. Any other failure (genuine rate limit,
        // delivery failure, etc.) lands here; the safe generic message
        // below is what the client sees either way.
        return jsonResponse({ error: "L'invitation n'a pas pu être envoyée. Aucun membre n'a été créé." }, 502)
      }

      return jsonResponse({ message: 'Invitation envoyée avec succès', invitation_id: created.id, expires_at: created.expires_at })
    }

    if (req.method === 'PATCH') {
      const body = await req.json()
      const invitationId = body?.invitation_id
      if (!invitationId) return jsonResponse({ error: 'invitation_id est requis' }, 400)

      const { data: resent, error: resendErr } = await supabaseUser
        .rpc('mm_resend_invitation', { p_invitation_id: invitationId })
        .single()

      if (resendErr) {
        return jsonResponse({ error: safeMessage(resendErr, "L'invitation n'a pas pu être renvoyée.") }, 400)
      }

      // Need the email to re-send — the RPC intentionally doesn't return it.
      const { data: invRow } = await supabaseAdmin.from('invitations').select('email').eq('id', invitationId).single()
      if (!invRow?.email) return jsonResponse({ error: 'Invitation introuvable.' }, 404)

      try {
        await sendActivationEmail(invRow.email)
      } catch (mailErr) {
        console.error('resend email send failed', mailErr)
        return jsonResponse({ error: "L'invitation n'a pas pu être renvoyée." }, 502)
      }

      return jsonResponse({ message: 'Invitation renvoyée avec succès', expires_at: resent.expires_at })
    }

    if (req.method === 'DELETE') {
      const body = await req.json()

      if (body?.invitation_id) {
        const { error: revokeErr } = await supabaseUser.rpc('mm_revoke_invitation', { p_invitation_id: body.invitation_id })
        if (revokeErr) {
          return jsonResponse({ error: safeMessage(revokeErr, "L'invitation n'a pas pu être révoquée.") }, 400)
        }
        return jsonResponse({ message: 'Invitation révoquée' })
      }

      if (body?.secretary_id) {
        await setTenantSecretary(supabaseAdmin, tenant, null)
        const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(body.secretary_id)
        if (deleteErr) console.error('Delete user error:', deleteErr)
        return jsonResponse({ message: 'Accès secrétaire révoqué' })
      }

      return jsonResponse({ error: 'invitation_id ou secretary_id est requis' }, 400)
    }

    return jsonResponse({ error: 'Méthode non supportée' }, 405)

  } catch (error) {
    console.error('invite-secretary unhandled error:', error)
    return jsonResponse({ error: 'Une erreur est survenue. Réessayez.' }, 400)
  }
})
