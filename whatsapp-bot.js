/**
 * MacroMedica - Local WhatsApp CNDP-Compliant Bot
 * 
 * Stack: Node.js, PostgreSQL (pg.Pool), whatsapp-web.js (LocalAuth), node-cron, Express
 * 
 * Features:
 *  1. Global Clinic Branding via .env (CLINIC_NAME, DOCTOR_NAME)
 *  2. 24-Hour Reminder Cron Job running daily at 18:00
 *  3. 'Far Planned' Condition (Time Buffer): Skips walk-in / same-day appointments booked <= 24h in advance
 *  4. Generic Auto-Reply for patient messages: Polite fallback for non-1/2 replies
 *  5. Instant Testing Mechanism: GET /api/whatsapp/test-reminder/:phone
 *  6. Bulletproof error handling, strict sanitization, and if(client.info) guards
 */

import fs from 'fs';
import path from 'path';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import cron from 'node-cron';
import pg from 'pg';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();
dotenv.config({ path: '.env.local' });

// ============================================================================
// 1. Global Clinic Branding & Configuration
// ============================================================================
export const CLINIC_NAME = process.env.CLINIC_NAME || 'Cabinet MacroMedica';
export const DOCTOR_NAME = process.env.DOCTOR_NAME || 'Dr. El Mansouri';
export const CLINIC_ADDRESS = process.env.CLINIC_ADDRESS || 'Boulevard Abdelmoumen, Résidence Les Jardins Médicaux, 3ème étage, Casablanca (Parking disponible en face)';
export const CLINIC_HOURS = process.env.CLINIC_HOURS || 'Lundi au Vendredi: 09h00 - 18h00, Samedi: 09h00 - 13h00, Dimanche: Fermé';
export const CLINIC_MUTUALITE = process.env.CLINIC_MUTUALITE || 'Conventionné AMO / CNSS / CNOPS et assurances privées (délivrance de feuille de soins et factures)';
export const CLINIC_EMERGENCY = process.env.CLINIC_EMERGENCY || 'En cas d\'urgence vitale, appelez le 141 (SAMU) ou le 150 (Protection Civile) ou rendez-vous directement aux urgences hospitalières.';

export const REMINDER_CRON = process.env.REMINDER_CRON || '0 18 * * *';
export const REMINDER_48H_CRON = process.env.REMINDER_48H_CRON || '0 10 * * *';
const API_PORT = process.env.BOT_PORT || process.env.PORT || 3001;

// Gemini AI Client Initialization
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
let aiClient = null;
if (geminiApiKey) {
  aiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  console.log('[Gemini AI] Initialisé avec succès (Assistant Virtuel Administratif CNDP-conforme).');
} else {
  console.warn('[Gemini AI] Avertissement: Aucune clé GEMINI_API_KEY trouvée dans l\'environnement.');
}

console.log(`[Config] Clinic: "${CLINIC_NAME}", Doctor: "${DOCTOR_NAME}", Cron 24h: "${REMINDER_CRON}", Cron 48h: "${REMINDER_48H_CRON}"`);

// ============================================================================
// 2. Database Connection (PostgreSQL Pool with Supabase fallback)
// ============================================================================
let pool = null;
let supabaseFallback = null;

const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PG_CONNECTION_STRING;

if (dbUrl) {
  pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
  });
}

// Always initialize Supabase Client for Realtime and specialized table inserts
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (supabaseUrl && supabaseKey) {
  supabaseFallback = createClient(supabaseUrl, supabaseKey);
  console.log('[Supabase Client] Initialisé avec succès pour Supabase DB & Realtime.');
}

// ============================================================================
// 2B. Persistent Backend Inbox Storage (Linked to UI)
// ============================================================================
const INBOX_FILE = path.resolve('./whatsapp-inbox-data.json');

function loadLocalInbox() {
  try {
    if (fs.existsSync(INBOX_FILE)) {
      const raw = fs.readFileSync(INBOX_FILE, 'utf-8');
      return JSON.parse(raw) || [];
    }
  } catch (e) {
    console.warn('[Inbox Store] Erreur lecture fichier:', e.message);
  }
  return [];
}

function saveLocalInbox(items) {
  try {
    fs.writeFileSync(INBOX_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[Inbox Store] Erreur écriture fichier:', e.message);
  }
}

let localInbox = loadLocalInbox();

// Helper: Insert pending item into public.whatsapp_inbox AND local persistent backend store
async function insertIntoWhatsappInbox({ patientPhone, patientName, patientMotif = null, requestType, rawMessage, extractedDetails = {} }) {
  // Always create and store locally in backend first so NO message is EVER lost
  const localId = `wb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const localItem = {
    id: localId,
    patient_phone: patientPhone,
    patient_name: patientName || null,
    patient_motif: patientMotif || null,
    request_type: requestType,
    raw_message: rawMessage,
    status: 'pending',
    extracted_details: {
      ...extractedDetails,
      patientMotif: patientMotif || null
    },
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null
  };

  // Add to local backend store and persist to disk
  localInbox.unshift(localItem);
  saveLocalInbox(localInbox);
  console.log(`📥 [WhatsApp Inbox] ✅ Demande enregistrée dans le backend local (ID: ${localId}, Patient: ${patientName || patientPhone}, Motif: ${patientMotif || 'Non précisé'})`);

  // Try PostgreSQL Pool if available
  if (pool) {
    try {
      const q = `
        INSERT INTO public.whatsapp_inbox (patient_phone, patient_name, patient_motif, request_type, raw_message, status, extracted_details)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        RETURNING *;
      `;
      const res = await pool.query(q, [
        patientPhone,
        patientName || null,
        patientMotif || null,
        requestType,
        rawMessage,
        JSON.stringify(localItem.extracted_details)
      ]);
      if (res.rows[0]) {
        localItem.id = res.rows[0].id;
        saveLocalInbox(localInbox);
        console.log(`📥 [WhatsApp Inbox] Synchronisé dans PostgreSQL (ID: ${res.rows[0].id})`);
      }
      return localItem;
    } catch (err) {
      console.warn('⚠️ [PostgreSQL Pool] Erreur insertion:', err.message);
    }
  }

  // Try Supabase API
  if (supabaseFallback) {
    try {
      const payload = {
        patient_phone: patientPhone,
        patient_name: patientName || null,
        patient_motif: patientMotif || null,
        request_type: requestType,
        raw_message: rawMessage,
        status: 'pending',
        extracted_details: localItem.extracted_details
      };

      let { data, error } = await supabaseFallback
        .from('whatsapp_inbox')
        .insert([payload])
        .select()
        .single();

      // If patient_motif column is missing in Supabase, retry without that column
      if (error && error.message?.includes('patient_motif')) {
        delete payload.patient_motif;
        const retry = await supabaseFallback
          .from('whatsapp_inbox')
          .insert([payload])
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        if (error.code === '42501' || error.message?.includes('row-level security')) {
          console.warn('⚠️ [Supabase RLS] Supabase bloque l\'insert anon (42501). La demande est heureusement sécurisée dans le backend.');
        } else {
          console.warn('⚠️ [Supabase] Erreur insertion:', error.message);
        }
      } else if (data) {
        localItem.id = data.id;
        saveLocalInbox(localInbox);
        console.log(`📥 [WhatsApp Inbox] Synchronisé dans Supabase (ID: ${data.id})`);
      }
    } catch (err) {
      console.warn('⚠️ [Supabase Exception]:', err.message);
    }
  }

  return localItem;
}

// ============================================================================
// 2C. Database RDV Availability Engine (Calcul des créneaux libres en temps réel)
// ============================================================================
let cachedAppointments = [];

export function getAvailableSlotsForDate(dateStr) {
  const targetDate = new Date(dateStr);
  if (isNaN(targetDate.getTime())) return [];

  const dayOfWeek = targetDate.getDay(); // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
  if (dayOfWeek === 0) {
    return []; // Dimanche fermé
  }

  const possibleSlots = [];
  const addSlots = (startH, endH) => {
    for (let h = startH; h < endH; h++) {
      const hh = String(h).padStart(2, '0');
      possibleSlots.push(`${hh}:00`);
      possibleSlots.push(`${hh}:30`);
    }
  };

  addSlots(9, 13); // Matin: 09h00 - 13h00 (tous les jours ouvrables)
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    addSlots(14, 18); // Après-midi: 14h00 - 18h00 (Lundi au Vendredi)
  }

  // Find booked slots on this date from cached appointments
  const bookedSlots = new Set();
  const datePrefix = dateStr.slice(0, 10);

  for (const rdv of cachedAppointments) {
    if (!rdv.date_rdv) continue;
    if (rdv.status === 'cancelled' || rdv.status === 'annule') continue;

    const rdvIso = new Date(rdv.date_rdv).toISOString();
    if (rdvIso.startsWith(datePrefix)) {
      const rdvDate = new Date(rdv.date_rdv);
      const hh = String(rdvDate.getHours()).padStart(2, '0');
      const mm = String(rdvDate.getMinutes()).padStart(2, '0');
      bookedSlots.add(`${hh}:${mm}`);
    }
  }

  return possibleSlots.filter(s => !bookedSlots.has(s));
}

export function getUpcomingAvailabilitySummary() {
  const dayNamesFR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const dayNamesAR = ['Lhed', 'Tnin', 'Tlat', 'Larba3', 'Khmiss', 'Jmo3a', 'Sebt'];

  const now = new Date();
  const lines = [];

  for (let i = 0; i < 6; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0) continue; // Skip Dimanche

    const dateStr = d.toISOString().split('T')[0];
    const slots = getAvailableSlotsForDate(dateStr);
    const dayFR = dayNamesFR[dayOfWeek];
    const dayAR = dayNamesAR[dayOfWeek];

    const morning = slots.filter(s => parseInt(s.split(':')[0], 10) < 13);
    const afternoon = slots.filter(s => parseInt(s.split(':')[0], 10) >= 14);

    const morningStr = morning.length > 0 ? morning.slice(0, 6).join(', ') : 'Complet';
    const afternoonStr = afternoon.length > 0 ? afternoon.slice(0, 6).join(', ') : 'Complet';

    lines.push(`- ${dayFR} (${dayAR}, ${dateStr}) : Matin [${morningStr}] | Après-midi [${afternoonStr}]`);
  }

  return lines.join('\n');
}

async function verifyDatabase() {
  if (pool) {
    try {
      const client = await pool.connect();
      console.log('[PostgreSQL] Connected successfully to PostgreSQL database.');
      client.release();
      return true;
    } catch (err) {
      console.warn('[PostgreSQL] Direct connection error:', err.message);
    }
  }
  if (supabaseFallback) {
    console.log('[Database] Ready with Supabase API client.');
    return true;
  }
  console.warn('[Database] Warning: No active database credentials found in .env (DATABASE_URL or VITE_SUPABASE_URL).');
  return false;
}

// ============================================================================
// 3. Phone Sanitization & Helper Functions
// ============================================================================
/**
 * Formats Moroccan numbers into WhatsApp JID (e.g. 212612345678@c.us)
 * Strips all spaces, dashes, +, leading 0, and validates length.
 */
export function toWhatsAppJid(rawPhone) {
  if (!rawPhone) return null;
  let digits = String(rawPhone).replace(/\D/g, '');

  if (digits.startsWith('0')) {
    digits = '212' + digits.substring(1);
  } else if (!digits.startsWith('212')) {
    digits = '212' + digits;
  }

  if (digits.length < 11 || digits.length > 13) {
    return null;
  }

  return `${digits}@c.us`;
}

function normalizeMoroccanPhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (/^212[567]\d{8}$/.test(digits)) return digits;
  if (/^0[567]\d{8}$/.test(digits)) return `212${digits.slice(1)}`;
  if (/^[567]\d{8}$/.test(digits)) return `212${digits}`;
  return null;
}

export function extractPhoneDigits(fromJid) {
  const pureJid = fromJid.split('@')[0];
  return pureJid.replace(/\D/g, '');
}

export function formatTimeFR(dateInput) {
  if (!dateInput) return '10h00';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '10h00';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}h${minutes}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// 4. WhatsApp Client Initialization (LocalAuth with Session Persistence)
// ============================================================================
console.log('[WhatsApp] Initializing local client with LocalAuth...');

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './.wwebjs_auth',
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
  },
  puppeteer: {
    headless: true,
    protocolTimeout: 120000, // 2 minutes to prevent ProtocolError: Runtime.callFunctionOn timed out
    timeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  },
});

client.on('qr', (qr) => {
  console.log('\n===============================================================');
  console.log(' [WhatsApp] Scannez ce code QR avec le téléphone du cabinet :');
  console.log('===============================================================\n');
  qrcode.generate(qr, { small: true });
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ [WhatsApp] Chargement session: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
  console.log('✅ [WhatsApp] Session authentifiée avec succès.');
});

client.on('auth_failure', (msg) => {
  console.error('❌ [WhatsApp] Échec d\'authentification:', msg);
});

client.on('ready', () => {
  console.log(`✅ [WhatsApp] Client prêt et à l'écoute des messages! Connecté en tant que: ${client.info?.wid?.user || 'Bot'}`);
  initCronJob();
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ [WhatsApp] Client déconnecté:', reason);
});

// ============================================================================
// 5. Reminder Cron Jobs (24-Hour and 48-Hour Advanced)
// ============================================================================
function initCronJob() {
  // --------------------------------------------------------------------------
  // 5A. 24-Hour Reminder Cron Job with 'Far Planned' Buffer Check (Tomorrow)
  // --------------------------------------------------------------------------
  cron.schedule(REMINDER_CRON, async () => {
    console.log(`[Cron 24h] [${new Date().toISOString()}] Exécution du rappel des RDV de demain...`);

    if (!client.info) {
      console.warn('[Cron 24h] WhatsApp client not connected (client.info is null). Cron skipped.');
      return;
    }

    let appointments = [];

    // Query tomorrow's appointments via PostgreSQL Pool
    if (pool) {
      let clientDb;
      try {
        clientDb = await pool.connect();
        const query = `
          SELECT 
            r.id AS rdv_id,
            r.date_rdv,
            r.created_at,
            r.status,
            p.id AS patient_id,
            p.nom AS patient_nom,
            p.prenom AS patient_prenom,
            p.telephone AS patient_telephone,
            COALESCE(prof.nom_complet, cab.nom, $1) AS doctor_name
          FROM public.rdv r
          JOIN public.patients p ON r.patient_id = p.id
          LEFT JOIN public.cabinets cab ON r.cabinet_id = cab.id
          LEFT JOIN public.profiles prof ON cab.owner_id = prof.id
          WHERE 
            r.date_rdv >= CURRENT_DATE + INTERVAL '1 day'
            AND r.date_rdv < CURRENT_DATE + INTERVAL '2 day'
            AND r.status IN ('scheduled', 'confirme')
            AND p.telephone IS NOT NULL
          ORDER BY r.date_rdv ASC;
        `;
        const res = await clientDb.query(query, [DOCTOR_NAME]);
        appointments = res.rows;
      } catch (err) {
        console.error('[Cron 24h] Erreur SQL appointments:', err.message);
      } finally {
        if (clientDb) clientDb.release();
      }
    } else if (supabaseFallback) {
      // Fallback via Supabase API
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStart = new Date(tomorrow.setHours(0, 0, 0, 0)).toISOString();
        const tomorrowEnd = new Date(tomorrow.setHours(23, 59, 59, 999)).toISOString();

        const { data, error } = await supabaseFallback
          .from('rdv')
          .select(`
            id,
            date_rdv,
            created_at,
            status,
            patients ( id, nom, prenom, telephone )
          `)
          .gte('date_rdv', tomorrowStart)
          .lte('date_rdv', tomorrowEnd)
          .in('status', ['scheduled', 'confirme']);

        if (!error && data) {
          appointments = data.map((r) => ({
            rdv_id: r.id,
            date_rdv: r.date_rdv,
            created_at: r.created_at,
            patient_nom: r.patients?.nom,
            patient_prenom: r.patients?.prenom,
            patient_telephone: r.patients?.telephone,
            doctor_name: DOCTOR_NAME,
          }));
        }
      } catch (err) {
        console.error('[Cron 24h] Erreur Supabase fallback:', err.message);
      }
    }

    console.log(`[Cron 24h] ${appointments.length} rendez-vous bruts trouvés pour demain.`);

    let sentCount = 0;
    let skippedCount = 0;

    for (const [index, rdv] of appointments.entries()) {
      const jid = toWhatsAppJid(rdv.patient_telephone);
      if (!jid) {
        console.warn(`[Cron 24h] Téléphone invalide pour ${rdv.patient_prenom} ${rdv.patient_nom}: "${rdv.patient_telephone}"`);
        continue;
      }

      const patientName = `${rdv.patient_prenom || ''} ${rdv.patient_nom || ''}`.trim() || 'Patient';
      const appointmentTime = formatTimeFR(rdv.date_rdv);

      const rdvTime = new Date(rdv.date_rdv).getTime();
      const createdTime = rdv.created_at ? new Date(rdv.created_at).getTime() : 0;
      const leadHours = createdTime > 0 ? (rdvTime - createdTime) / (1000 * 3600) : 999;

      if (createdTime > 0 && leadHours <= 24) {
        console.log(`[Cron Buffer] ⏭️ Rappel 24h ignoré pour ${patientName}: créé ${leadHours.toFixed(1)}h avant le RDV (<= 24h, buffer walk-in/same-day).`);
        skippedCount++;
        continue;
      }

      const message = `Rappel : Vous avez un rendez-vous demain au ${CLINIC_NAME} à ${appointmentTime}. Répondez 1 pour confirmer, 2 pour annuler.`;

      try {
        if (client.info) {
          await client.sendMessage(jid, message);
          console.log(`[Cron 24h] [${index + 1}/${appointments.length}] Rappel envoyé à ${patientName} (${jid})`);
          sentCount++;
        }
      } catch (sendErr) {
        console.error(`[Cron 24h] Échec d'envoi à ${jid}:`, sendErr.message);
      }

      if (index < appointments.length - 1) {
        const randomDelay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
        console.log(`[Anti-Spam] Pause de ${(randomDelay / 1000).toFixed(1)}s...`);
        await sleep(randomDelay);
      }
    }

    console.log(`[Cron 24h] Rappels terminés: ${sentCount} envoyés, ${skippedCount} ignorés par le buffer.`);
  });

  // --------------------------------------------------------------------------
  // 5B. 48-Hour Advanced Reminder Cron Job (Appointments in 2 days, created > 7 days ago)
  // --------------------------------------------------------------------------
  cron.schedule(REMINDER_48H_CRON, async () => {
    console.log(`[Cron 48h] [${new Date().toISOString()}] Exécution du rappel avancé des RDV dans 48h (J+2)...`);

    if (!client.info) {
      console.warn('[Cron 48h] WhatsApp client not connected (client.info is null). Cron skipped.');
      return;
    }

    let appointments48h = [];

    // Query appointments 2 days away created > 7 days ago via PostgreSQL Pool
    if (pool) {
      let clientDb;
      try {
        clientDb = await pool.connect();
        const query = `
          SELECT 
            r.id AS rdv_id,
            r.date_rdv,
            r.created_at,
            r.status,
            p.id AS patient_id,
            p.nom AS patient_nom,
            p.prenom AS patient_prenom,
            p.telephone AS patient_telephone,
            COALESCE(prof.nom_complet, cab.nom, $1) AS doctor_name
          FROM public.rdv r
          JOIN public.patients p ON r.patient_id = p.id
          LEFT JOIN public.cabinets cab ON r.cabinet_id = cab.id
          LEFT JOIN public.profiles prof ON cab.owner_id = prof.id
          WHERE 
            r.date_rdv >= CURRENT_DATE + INTERVAL '2 day'
            AND r.date_rdv < CURRENT_DATE + INTERVAL '3 day'
            AND r.status IN ('scheduled', 'confirme')
            AND r.created_at < NOW() - INTERVAL '7 day'
            AND p.telephone IS NOT NULL
          ORDER BY r.date_rdv ASC;
        `;
        const res = await clientDb.query(query, [DOCTOR_NAME]);
        appointments48h = res.rows;
      } catch (err) {
        console.error('[Cron 48h] Erreur SQL appointments:', err.message);
      } finally {
        if (clientDb) clientDb.release();
      }
    } else if (supabaseFallback) {
      // Fallback via Supabase API
      try {
        const inTwoDays = new Date();
        inTwoDays.setDate(inTwoDays.getDate() + 2);
        const dayStart = new Date(inTwoDays.setHours(0, 0, 0, 0)).toISOString();
        const dayEnd = new Date(inTwoDays.setHours(23, 59, 59, 999)).toISOString();

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoIso = sevenDaysAgo.toISOString();

        const { data, error } = await supabaseFallback
          .from('rdv')
          .select(`
            id,
            date_rdv,
            created_at,
            status,
            patients ( id, nom, prenom, telephone )
          `)
          .gte('date_rdv', dayStart)
          .lte('date_rdv', dayEnd)
          .lt('created_at', sevenDaysAgoIso)
          .in('status', ['scheduled', 'confirme']);

        if (!error && data) {
          appointments48h = data.map((r) => ({
            rdv_id: r.id,
            date_rdv: r.date_rdv,
            created_at: r.created_at,
            patient_nom: r.patients?.nom,
            patient_prenom: r.patients?.prenom,
            patient_telephone: r.patients?.telephone,
            doctor_name: DOCTOR_NAME,
          }));
        }
      } catch (err) {
        console.error('[Cron 48h] Erreur Supabase fallback:', err.message);
      }
    }

    console.log(`[Cron 48h] ${appointments48h.length} rendez-vous trouvés dans 48h (créés il y a > 7 jours).`);

    let sentCount = 0;
    for (const [index, rdv] of appointments48h.entries()) {
      const jid = toWhatsAppJid(rdv.patient_telephone);
      if (!jid) {
        console.warn(`[Cron 48h] Téléphone invalide pour ${rdv.patient_prenom} ${rdv.patient_nom}: "${rdv.patient_telephone}"`);
        continue;
      }

      const patientName = `${rdv.patient_prenom || ''} ${rdv.patient_nom || ''}`.trim() || 'Patient';
      const appointmentTime = formatTimeFR(rdv.date_rdv);

      // Feature 1: Advanced 48-Hour Message
      const message = `Rappel : Vous avez un rendez-vous dans 2 jours au ${CLINIC_NAME} à ${appointmentTime}. Répondez OUI pour confirmer, NON pour annuler. (Cette confirmation est optionnelle).`;

      try {
        if (client.info) {
          await client.sendMessage(jid, message);
          console.log(`[Cron 48h] [${index + 1}/${appointments48h.length}] Rappel 48h envoyé à ${patientName} (${jid})`);
          sentCount++;
        }
      } catch (sendErr) {
        console.error(`[Cron 48h] Échec d'envoi 48h à ${jid}:`, sendErr.message);
      }

      // Anti-spam jitter delay: 5 to 10 seconds random pause
      if (index < appointments48h.length - 1) {
        const randomDelay = Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000;
        console.log(`[Anti-Spam] Pause de ${(randomDelay / 1000).toFixed(1)}s...`);
        await sleep(randomDelay);
      }
    }

    console.log(`[Cron 48h] Rappels terminés: ${sentCount} envoyés.`);
  });

  console.log(`[Cron] Tâches planifiées activées (24h: "${REMINDER_CRON}", 48h: "${REMINDER_48H_CRON}").`);
}

// ============================================================================
// 6. Message Listener (1 = Confirm, 2 = Cancel, Fallback = Generic Auto-Reply)
// ============================================================================
const processedMessageIds = new Set();

// ============================================================================
// 6A. Motif Normalizer (Local fuzzy match - 0 Gemini tokens)
// Maps common Darija/French typos/abbreviations to clean medical motifs.
// ============================================================================
const KNOWN_MOTIFS = [
  { canonical: 'Consultation', patterns: ['consult', 'consultat', 'konsult', 'consulation', 'cosultation', 'consultaion', 'consul', 'visite', 'vizit', 'checkup', 'check-up', 'check up', 'bilan', 'examen', 'ziyara'] },
  { canonical: 'Suivi', patterns: ['suivi', 'suive', 'suivie', 'follow', 'contrôle', 'controle', 'control', 'kontrol', 'متابعة', 'mutaba3a'] },
  { canonical: 'Urgence', patterns: ['urgence', 'urgent', 'urgen', 'urjence', 'istinja', 'daruri', 'ضروري', 'طوارئ'] },
  { canonical: 'Douleur', patterns: ['douleur', 'doulour', 'dolor', 'mal', 'douleurs', 'wja3', 'wej3a'] },
  { canonical: 'Renouvellement ordonnance', patterns: ['ordonnance', 'ordonance', 'renouvellement', 'renouvel', 'prescription', 'wasfa'] },
  { canonical: 'Certificat médical', patterns: ['certificat', 'certifica', 'chahada', 'شهادة'] },
  { canonical: 'Résultats', patterns: ['résultat', 'resultat', 'result', 'natija', 'نتيجة', 'analyses', 'analyse', 'tahlil'] },
  { canonical: 'Vaccination', patterns: ['vaccin', 'vaccination', 'tal9ih', 'تلقيح'] },
];

function normalizeMotif(rawMotif) {
  if (!rawMotif || typeof rawMotif !== 'string') return 'Consultation';
  const cleaned = rawMotif.trim();
  if (cleaned.length === 0) return 'Consultation';

  const lower = cleaned.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Compare words independently so a typo doesn't prevent a canonical match.
  const editDistance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
      }
    }
    return row[b.length];
  };
  const words = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

  // Exact/partial matches plus close spelling matches for common French/Darija terms.
  for (const entry of KNOWN_MOTIFS) {
    for (const pattern of entry.patterns) {
      const normalizedPattern = pattern.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(normalizedPattern) || normalizedPattern.includes(lower)) {
        return entry.canonical;
      }
      const patternWords = normalizedPattern.split(/\s+/);
      if (words.some((word) => patternWords.some((candidate) => {
        const maxTypo = candidate.length >= 7 ? 2 : candidate.length >= 4 ? 1 : 0;
        return maxTypo > 0 && editDistance(word, candidate) <= maxTypo;
      }))) return entry.canonical;
    }
  }

  // If the raw input is too short (< 3 chars) or looks like gibberish (no vowels), default
  const hasVowel = /[aeiouyàâéèêëïîôùûüæœ]/i.test(cleaned);
  const hasArabic = /[\u0600-\u06FF]/.test(cleaned);
  if (cleaned.length < 3 && !hasArabic) return 'Consultation';
  if (!hasVowel && !hasArabic && cleaned.length < 5) return 'Consultation';

  // Keep the original but capitalize first letter (it looked intentional enough)
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Session Manager for Token-Optimized Conversation Flow (State Machine)
// State 0: New User -> Node.js directly replies (0 tokens)
// State 1: Awaiting Motif -> Node.js saves motif and asks Name (0 tokens)
// State 2: Awaiting Name -> Node.js saves name and asks Date/Slot (0 tokens)
// State 3: Awaiting Date -> Single AI Parse call strictly to extract { parsedDate, parsedTime, extractedSlot }
const userSessions = new Map();
const userPhoneNumbers = new Map();

async function handleIncomingMessage(msg) {
  // REQUIREMENT 1: Put console.log at the very top of the listener before ANY database queries or formatting checks
  console.log(`[WhatsApp] Message reçu de ${msg.from}: ${msg.body}`);

  // Guard against duplicate delivery of the same incoming message event.
  const msgId = msg.id?._serialized || msg.id?.id;
  if (msgId) {
    if (processedMessageIds.has(msgId)) return;
    processedMessageIds.add(msgId);
    if (processedMessageIds.size > 1000) {
      const first = processedMessageIds.values().next().value;
      processedMessageIds.delete(first);
    }
  }

  // Never process messages sent by the bot itself to prevent infinite bounce
  if (msg.fromMe) return;

  // Ignore group chats and status broadcasts
  if (msg.from.endsWith('@g.us') || msg.from.includes('broadcast') || msg.isStatus) {
    return;
  }

  if (msg.hasMedia || ['ptt', 'audio', 'image', 'video'].includes(msg.type)) {
    try {
      await msg.reply('Désolé, je suis un assistant automatique et je ne peux traiter que les messages texte. Veuillez écrire votre réponse.');
    } catch (err) {
      console.error('[Bot] Erreur réponse média:', err.message);
    }
    return;
  }

  const rawText = (msg.body || '').trim();
  // whatsapp-web.js may emit message_create for synced/non-text activity with an empty body.
  // Never start a conversation or send an error reply for an event with no user text.
  if (!rawText) {
    console.log(`[WhatsApp] Événement sans texte ignoré (${msg.from}).`);
    return;
  }

  const senderKey = String(msg.from || '').split('@')[0];
  let session = userSessions.get(senderKey);
  if (session && Date.now() - (session.timestamp || 0) > 30 * 60 * 1000) {
    userSessions.delete(senderKey);
    session = null;
    console.log(`[Bot StateMachine] Session expirée (TTL 30 min) pour ${senderKey}; nouveau parcours.`);
  }
  const normalizedText = rawText.toLowerCase();
  if (/^(annuler|retour|recommencer|0|stop)$/.test(normalizedText)) {
    userSessions.delete(senderKey);
    try { await msg.reply('Votre demande a été annulée. Que puis-je faire pour vous ?'); } catch (_) {}
    return;
  }
  if (session) {
    session.timestamp = Date.now();
    userSessions.set(senderKey, session);
  }

  // REQUIREMENT 3: Extract clean Moroccan digits and normalize formatting
  let cleanSender = String(msg.from || '').split('@')[0].split(':')[0].replace(/\D/g, '');

  // LID identifiers are not phone numbers. Always resolve them through the WhatsApp contact.
  if (msg.from.includes('@lid') || !normalizeMoroccanPhone(cleanSender)) {
    try {
      const contact = await msg.getContact();
      if (contact && contact.number) {
        cleanSender = String(contact.number).replace(/\D/g, '');
      }
    } catch (cErr) {
      console.warn(`[WhatsApp] Impossible de résoudre le numéro du contact: ${cErr.message}`);
    }
  }

  cleanSender = normalizeMoroccanPhone(cleanSender) || userPhoneNumbers.get(senderKey) || null;
  if (cleanSender) userPhoneNumbers.set(senderKey, cleanSender);
  const last9Digits = cleanSender ? cleanSender.slice(-9) : null;
  console.log(`[WhatsApp] Expéditeur analysé: ${cleanSender || `numéro à confirmer (chat ${senderKey})`}`);

  const genericFallback = `Bonjour, vous avez joint l'assistant virtuel du ${CLINIC_NAME}. Pour toute question ou urgence, veuillez appeler directement le secrétariat. Ce numéro ne reçoit pas d'appels ni de messages vocaux.`;

  // Normalize incoming text for booking and appointment commands.
  const commandText = normalizedText.toUpperCase();

  if (session?.state === 'AWAITING_NAME_CONFIRM') {
    if (commandText === 'OUI') {
      session.state = 'AWAITING_DATE';
      session.timestamp = Date.now();
      userSessions.set(senderKey, session);
      try { await msg.reply('Quand souhaitez-vous votre rendez-vous (indiquez un jour et une heure, ex: le 15 octobre à 14h) ?'); } catch (_) {}
    } else if (commandText === 'NON') {
      session.name = '';
      session.state = 'AWAITING_NAME';
      session.timestamp = Date.now();
      userSessions.set(senderKey, session);
      try { await msg.reply('D’accord. Quel est votre nom et prénom ?'); } catch (_) {}
    } else {
      try { await msg.reply('Répondez OUI si le nom est correct, ou NON pour le saisir à nouveau.'); } catch (_) {}
    }
    return;
  }

  if (!cleanSender && ['1', 'OUI', '2', 'NON'].includes(commandText)) {
    try { await msg.reply('Pour retrouver votre rendez-vous, envoyez d’abord votre numéro au format 06XXXXXXXX ou +2126XXXXXXXX.'); } catch (_) {}
    return;
  }

  // ==========================================================================
  // Interactive Confirmation: '1' or 'OUI' (case-insensitive)
  // ==========================================================================
  if (commandText === '1' || commandText === 'OUI') {
    console.log(`[Bot] Réponse "${commandText}" (Confirmer) reçue depuis ${cleanSender}`);
    const appointment = await findActiveAppointment(cleanSender, last9Digits);

    if (appointment) {
      await updateAppointmentStatus(appointment.rdv_id, 'confirme');
      const patientName = `${appointment.prenom || ''} ${appointment.nom || ''}`.trim() || 'Patient';
      console.log(`[Bot] ✅ RDV confirmé pour ${patientName} (ID: ${appointment.rdv_id})`);

      try {
        await msg.reply(`Merci ${patientName} ! Votre rendez-vous est bien confirmé au ${CLINIC_NAME}.`);
      } catch (e) {
        console.error('❌ [Bot] Erreur reply confirmation:', e.message);
      }
    } else {
      // REQUIREMENT 2: Must NOT silently return if no appointment found. Send generic fallback.
      console.log(`[Bot] ⚠️ Aucun RDV actif trouvé pour ${cleanSender} suite au '${commandText}'. Envoi de l'auto-réponse standard.`);
      try {
        await msg.reply(genericFallback);
      } catch (e) {
        console.error('❌ [Bot] Erreur reply fallback:', e.message);
      }
    }
    return;
  }

  // ==========================================================================
  // Interactive Cancellation: '2' or 'NON' (case-insensitive)
  // ==========================================================================
  if (commandText === '2' || commandText === 'NON') {
    console.log(`[Bot] Réponse "${commandText}" (Annuler) reçue depuis ${cleanSender}`);
    const appointment = await findActiveAppointment(cleanSender, last9Digits);

    if (appointment) {
      await updateAppointmentStatus(appointment.rdv_id, 'cancelled');
      const patientName = `${appointment.prenom || ''} ${appointment.nom || ''}`.trim() || 'Patient';
      console.log(`[Bot] ❌ RDV annulé pour ${patientName} (ID: ${appointment.rdv_id})`);

      try {
        await msg.reply(`Votre rendez-vous au ${CLINIC_NAME} a bien été annulé. Merci de nous avoir prévenus. Pour reprogrammer, veuillez contacter directement le secrétariat.`);
      } catch (e) {
        console.error('❌ [Bot] Erreur reply annulation:', e.message);
      }
    } else {
      // REQUIREMENT 2: Must NOT silently return if no appointment found. Send generic fallback.
      console.log(`[Bot] ⚠️ Aucun RDV actif trouvé pour ${cleanSender} suite au '${commandText}'. Envoi de l'auto-réponse standard.`);
      try {
        await msg.reply(genericFallback);
      } catch (e) {
        console.error('❌ [Bot] Erreur reply fallback:', e.message);
      }
    }
    return;
  }

  // ==========================================================================
  // REQUIREMENT 1: Token-Optimized Backend State Machine (0 Gemini Tokens for States 0, 1, 2!)
  // ==========================================================================
  // Allow patient to reset session at any point
  if (commandText === 'RESET' || commandText === 'RECOMMENCER') {
    userSessions.delete(senderKey);
    console.log(`[Bot StateMachine] 🔄 Session réinitialisée pour ${senderKey}`);
    try {
      await msg.reply(`Votre conversation a été réinitialisée. Envoyez un message quand vous le souhaitez pour commencer une nouvelle demande.`);
    } catch (_) {}
    return;
  }

  if (session?.state === 'AWAITING_PHONE') {
    const suppliedPhone = normalizeMoroccanPhone(rawText);
    if (!suppliedPhone) {
      try { await msg.reply('Le format ne semble pas correct. Envoyez un numéro marocain, par exemple 0612345678 ou +212612345678.'); } catch (_) {}
      session.timestamp = Date.now();
      userSessions.set(senderKey, session);
      return;
    }
    session.phoneNumber = suppliedPhone;
    userPhoneNumbers.set(senderKey, suppliedPhone);
    session.state = 'AWAITING_MOTIF';
    session.timestamp = Date.now();
    userSessions.set(senderKey, session);
    try { await msg.reply('Merci. Quel est le motif de votre visite (ex: consultation, suivi, douleur) ?'); } catch (_) {}
    return;
  }

  // STATE 0: New User (no active session) -> Direct reply, NO Gemini call (0 tokens)
  if (!session) {
    console.log(`[Bot StateMachine] 🆕 Nouveau contact ${cleanSender || senderKey}`);
    const suppliedPhone = normalizeMoroccanPhone(rawText);
    const needsPhone = !cleanSender && !suppliedPhone;
    userSessions.set(senderKey, {
      state: needsPhone ? 'AWAITING_PHONE' : 'AWAITING_MOTIF',
      phoneNumber: suppliedPhone || cleanSender,
      timestamp: Date.now()
    });
    if (suppliedPhone || cleanSender) userPhoneNumbers.set(senderKey, suppliedPhone || cleanSender);

    const welcomeMsg = needsPhone
      ? `Bienvenue au ${CLINIC_NAME}. Pour traiter votre demande de rendez-vous, merci d’envoyer votre numéro marocain au format 06XXXXXXXX ou +2126XXXXXXXX.`
      : `Bienvenue au ${CLINIC_NAME}. Pourriez-vous préciser le motif de votre visite (ex: Consultation, Suivi, Urgence) ? (En répondant, vous acceptez notre politique de confidentialité).`;
    try {
      await msg.reply(welcomeMsg);
    } catch (err) {
      console.error(`❌ [Bot] Erreur envoi bienvenue:`, err.message);
    }
    return;
  }

  // STATE 1: Awaiting Motif -> Save motif, ask for Name, NO Gemini call (0 tokens)
  if (session.state === 'AWAITING_MOTIF') {
    const rawMotif = rawText;
    const motif = normalizeMotif(rawMotif);
    console.log(`[Bot StateMachine] 📝 Motif reçu de ${cleanSender}: "${rawMotif}" → Normalisé: "${motif}" -> Passage en ÉTAT AWAITING_NAME (0 tokens)`);
    session.motif = motif;
    session.rawMotif = rawMotif;
    session.state = 'AWAITING_NAME';
    session.timestamp = Date.now();
    userSessions.set(senderKey, session);

    try {
      await msg.reply('Quel est votre nom et prénom ?');
    } catch (err) {
      console.error(`❌ [Bot] Erreur envoi demande nom:`, err.message);
    }
    return;
  }

  // STATE 2: Awaiting Name -> Save name, ask for Date/Slot, NO Gemini call (0 tokens)
  if (session.state === 'AWAITING_NAME') {
    const patientName = rawText;
    console.log(`[Bot StateMachine] 👤 Nom reçu de ${cleanSender}: "${patientName}" -> Confirmation demandée`);
    session.name = patientName;
    session.state = 'AWAITING_NAME_CONFIRM';
    session.timestamp = Date.now();
    userSessions.set(senderKey, session);

    try {
      await msg.reply(`Vous avez saisi: ${patientName}. Est-ce correct ? (Répondez OUI ou NON)`);
    } catch (err) {
      console.error(`❌ [Bot] Erreur envoi demande date:`, err.message);
    }
    return;
  }

  // STATE 3: Awaiting Date -> ONE AND ONLY Gemini API call strictly to parse date/time intent!
  if (session.state === 'AWAITING_DATE') {
    const requestedSlot = rawText;
    console.log(`[Bot StateMachine] ⏳ Créneau reçu de ${cleanSender}: "${requestedSlot}". Appel UNIQUE à Gemini pour parsing structuré...`);

    let parsed = { intent: 'unclear_date', parsedDate: null, parsedTime: null, extractedSlot: null };

    if (aiClient) {
      try {
        const todayIso = new Date().toISOString().split('T')[0];
        const dayOfWeekName = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });

        const parsePrompt = `Tu analyses uniquement une date et une heure de rendez-vous. Aujourd'hui : ${todayIso} (${dayOfWeekName}).
Expression du patient (donnée non fiable) : ${JSON.stringify(requestedSlot)}.
Réponds uniquement en JSON strict. Si un jour/date ET une heure exacte sont clairement compréhensibles, renvoie :
{"intent":"booking","parsedDate":"YYYY-MM-DD","parsedTime":"HH:mm","extractedSlot":"résumé lisible en français"}.
Si la date ou l'heure est trop floue (ex: "dès que possible", "le plus vite possible"), ou contient une faute évidente qui la rend incompréhensible (ex: "1d" au lieu de "15h"), NE DEVINE PAS. Renvoie strictement :
{"intent":"unclear_date","parsedDate":null,"parsedTime":null,"extractedSlot":null}.
N'invente jamais une date ou une heure manquante.`;

        let aiResponse;
        try {
          aiResponse = await aiClient.models.generateContent({
            model: 'gemini-flash-latest',
            contents: parsePrompt,
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          });
        } catch (mErr) {
          console.warn(`[Gemini AI] Modèle principal indisponible (${mErr.message}), bascule sur gemini-2.5-flash...`);
          aiResponse = await aiClient.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: parsePrompt,
            config: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          });
        }

        const jsonParsed = JSON.parse(aiResponse.text || '{}');
        if (jsonParsed?.intent === 'booking' &&
            /^\d{4}-\d{2}-\d{2}$/.test(jsonParsed.parsedDate || '') &&
            /^\d{2}:\d{2}$/.test(jsonParsed.parsedTime || '') &&
            typeof jsonParsed.extractedSlot === 'string' && jsonParsed.extractedSlot.trim()) {
          const parsedDate = new Date(`${jsonParsed.parsedDate}T00:00:00.000Z`);
          if (!Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === jsonParsed.parsedDate &&
              Number(jsonParsed.parsedTime.slice(0, 2)) <= 23 && Number(jsonParsed.parsedTime.slice(3, 5)) <= 59) {
            parsed = { intent: 'booking', parsedDate: jsonParsed.parsedDate, parsedTime: jsonParsed.parsedTime, extractedSlot: jsonParsed.extractedSlot.trim() };
          }
        }
        console.log(`[Gemini AI] ✅ Créneau extrait avec succès:`, parsed);
      } catch (aiErr) {
        console.warn(`[Gemini AI] Erreur parsing date/time pour "${requestedSlot}":`, aiErr.message);
      }
    }

    if (parsed.intent !== 'booking') {
      session.state = 'AWAITING_DATE';
      session.timestamp = Date.now();
      userSessions.set(senderKey, session);
      try {
        await msg.reply('Je n\'ai pas bien compris la date ou l\'heure souhaitée (ex: si vous avez tapé "1d" au lieu de "15h"). Pourriez-vous préciser un jour et une heure exacts ?');
      } catch (sendErr) {
        console.error('❌ [Bot] Erreur demande de précision date:', sendErr.message);
      }
      return;
    }

    // Insert assembled data (Name, Phone, Motif, Requested Slot) into whatsapp_inbox
    await insertIntoWhatsappInbox({
      patientPhone: session.phoneNumber || cleanSender,
      patientName: session.name,
      patientMotif: session.motif,
      requestType: 'booking',
      rawMessage: `[Motif: ${session.motif}] - [Créneau: ${requestedSlot}]`,
      extractedDetails: {
        extractedSlot: parsed.extractedSlot || requestedSlot,
        parsedDate: parsed.parsedDate || null,
        parsedTime: parsed.parsedTime || null,
        rawSlotInput: requestedSlot,
        patientMotif: session.motif,
        receivedAt: new Date().toISOString()
      }
    });

    const confirmedSlot = parsed.extractedSlot || requestedSlot;
    const finalReply = `Merci ${session.name} ! Votre demande pour ${confirmedSlot} (Motif : ${session.motif}) a bien été transmise au secrétariat du ${CLINIC_NAME}. Vous recevrez une confirmation sous peu.`;

    // Clear local session
    userSessions.delete(senderKey);
    console.log(`[Bot StateMachine] 🏁 Session terminée et vidée pour ${cleanSender}`);

    try {
      await msg.reply(finalReply);
      console.log(`[Bot StateMachine] ✅ Réponse finale envoyée à ${cleanSender}`);
    } catch (sendErr) {
      console.error(`❌ [Bot] Erreur envoi réponse finale:`, sendErr.message);
    }
    return;
  }
}

// Process only incoming messages. message_create also fires for synced activity and can
// duplicate message events, so it must not drive conversational replies.
client.on('message', handleIncomingMessage);

// Helper: Query active upcoming appointment with resilient Moroccan phone matching
async function findActiveAppointment(cleanSender, last9Digits) {
  const local10 = '0' + last9Digits;
  const intl12 = '212' + last9Digits;
  const plusIntl = '+' + intl12;

  console.log(`[DB Lookup] Recherche RDV pour formats: ["${last9Digits}", "${local10}", "${intl12}", "${plusIntl}"]`);

  if (pool) {
    let clientDb;
    try {
      clientDb = await pool.connect();
      const q = `
        SELECT 
          r.id AS rdv_id,
          r.status,
          r.date_rdv,
          r.created_at,
          p.id AS patient_id,
          p.telephone AS patient_telephone,
          p.prenom,
          p.nom
        FROM public.rdv r
        JOIN public.patients p ON r.patient_id = p.id
        WHERE 
          (
            REGEXP_REPLACE(COALESCE(p.telephone, ''), '\\D', '', 'g') LIKE '%' || $1
            OR REGEXP_REPLACE(COALESCE(p.telephone, ''), '\\D', '', 'g') = $2
            OR REGEXP_REPLACE(COALESCE(p.telephone, ''), '\\D', '', 'g') = $3
          )
          AND r.status IN ('scheduled', 'confirme')
        ORDER BY r.date_rdv ASC
        LIMIT 1;
      `;
      const res = await clientDb.query(q, [last9Digits, cleanSender, local10]);
      if (res.rows.length > 0) {
        console.log(`[DB Lookup] RDV trouvé via PostgreSQL pour patient ${res.rows[0].prenom} ${res.rows[0].nom}`);
        return res.rows[0];
      }
    } catch (err) {
      console.error('[DB] findActiveAppointment SQL error:', err.message);
    } finally {
      if (clientDb) clientDb.release();
    }
  } else if (supabaseFallback) {
    try {
      // 1. Query Supabase patients table with OR filter covering all variations
      const { data: patients, error: patErr } = await supabaseFallback
        .from('patients')
        .select('id, nom, prenom, telephone')
        .or(`telephone.ilike.%${last9Digits}%,telephone.eq.${local10},telephone.eq.${intl12},telephone.eq.${plusIntl},telephone.eq.${cleanSender}`);

      let matchedPatients = patients || [];

      // 2. If ILIKE didn't match due to internal spacing (e.g. "+212 6 12 34 56 78"), fetch candidates and filter in JS
      if (matchedPatients.length === 0) {
        const { data: allPatients } = await supabaseFallback
          .from('patients')
          .select('id, nom, prenom, telephone')
          .order('created_at', { ascending: false })
          .limit(200);

        matchedPatients = (allPatients || []).filter((p) => {
          if (!p.telephone) return false;
          const cleanDb = String(p.telephone).replace(/\D/g, '');
          return cleanDb.endsWith(last9Digits) || cleanDb === cleanSender || cleanDb === local10;
        });
      }

      console.log(`[DB Lookup] Patients correspondants trouvés: ${matchedPatients.length}`);

      if (matchedPatients.length > 0) {
        const patientIds = matchedPatients.map((p) => p.id);
        const { data: rdvs, error: rdvErr } = await supabaseFallback
          .from('rdv')
          .select('id, date_rdv, created_at, status, patient_id')
          .in('patient_id', patientIds)
          .in('status', ['scheduled', 'confirme'])
          .order('date_rdv', { ascending: true })
          .limit(1);

        if (rdvs && rdvs.length > 0) {
          const pat = matchedPatients.find((p) => p.id === rdvs[0].patient_id);
          console.log(`[DB Lookup] RDV trouvé via Supabase pour ${pat?.prenom} ${pat?.nom}`);
          return {
            rdv_id: rdvs[0].id,
            date_rdv: rdvs[0].date_rdv,
            created_at: rdvs[0].created_at,
            prenom: pat?.prenom,
            nom: pat?.nom,
            telephone: pat?.telephone,
          };
        }
      }
    } catch (err) {
      console.error('[DB] findActiveAppointment Supabase error:', err.message);
    }
  }

  console.log(`[DB Lookup] Aucun RDV actif trouvé pour ce numéro.`);
  return null;
}


// Helper: Update appointment status
async function updateAppointmentStatus(rdvId, newStatus) {
  if (pool) {
    let clientDb;
    try {
      clientDb = await pool.connect();
      await clientDb.query(`UPDATE public.rdv SET status = $1 WHERE id = $2`, [newStatus, rdvId]);
    } catch (err) {
      console.error('[DB] updateAppointmentStatus SQL error:', err.message);
    } finally {
      if (clientDb) clientDb.release();
    }
  } else if (supabaseFallback) {
    try {
      await supabaseFallback.from('rdv').update({ status: newStatus }).eq('id', rdvId);
    } catch (err) {
      console.error('[DB] updateAppointmentStatus Supabase error:', err.message);
    }
  }
}

// ============================================================================
// 7. Express API Routes & Instant Testing Mechanism
// ============================================================================
const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    clinicName: CLINIC_NAME,
    doctorName: DOCTOR_NAME,
    whatsappReady: !!client.info,
    user: client.info?.wid?.user || null
  });
});

// WhatsApp Inbox: GET all pending messages
app.get('/api/whatsapp/inbox', (req, res) => {
  const pending = localInbox.filter((item) => item.status === 'pending');
  res.json({
    success: true,
    count: pending.length,
    items: pending,
  });
});

// WhatsApp Inbox: PATCH update status (resolve, confirm, reject) with CNDP Auto-Purge
app.patch('/api/whatsapp/inbox/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const item = localInbox.find((i) => i.id === id);

  const shouldPurge = status === 'confirmed' || status === 'rejected';
  const purgeNotice = '[Message purgé pour confidentialité CNDP]';

  if (item) {
    item.status = status || 'resolved';
    item.resolved_at = new Date().toISOString();
    if (shouldPurge) {
      item.raw_message = purgeNotice;
    }
    saveLocalInbox(localInbox);
    console.log(`[Backend API] Statut inbox mis à jour pour ${id}: ${item.status}${shouldPurge ? ' (Message purgé CNDP)' : ''}`);
  }

  // Also update Supabase if configured with CNDP Auto-Purge
  if (supabaseFallback) {
    try {
      const updatePayload = {
        status: status || 'resolved',
        resolved_at: new Date().toISOString(),
      };
      if (shouldPurge) {
        updatePayload.raw_message = purgeNotice;
      }
      await supabaseFallback
        .from('whatsapp_inbox')
        .update(updatePayload)
        .eq('id', id);
    } catch (err) {
      console.warn('[Backend API] Supabase update warning:', err.message);
    }
  }

  // Also update PostgreSQL pool if direct connection exists
  if (pool) {
    try {
      const updateSql = shouldPurge
        ? `UPDATE public.whatsapp_inbox SET status = $1, resolved_at = NOW(), raw_message = $2 WHERE id = $3`
        : `UPDATE public.whatsapp_inbox SET status = $1, resolved_at = NOW() WHERE id = $2`;
      const params = shouldPurge ? [status || 'resolved', purgeNotice, id] : [status || 'resolved', id];
      await pool.query(updateSql, params);
    } catch (err) {
      console.warn('[Backend API] Pool update warning:', err.message);
    }
  }

  res.json({ success: true, item: item || null });
});

// Appointments Sync from Frontend to Backend (keeps bot synced with live database RDVs)
app.post('/api/appointments/sync', (req, res) => {
  const { appointments } = req.body;
  if (Array.isArray(appointments)) {
    cachedAppointments = appointments;
    console.log(`🔄 [Backend API] ${appointments.length} rendez-vous synchronisés depuis le cabinet.`);
  }
  res.json({ success: true, count: cachedAppointments.length });
});

// Available Slots endpoint (computes open slots for date)
app.get('/api/whatsapp/available-slots', (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().split('T')[0];
  const slots = getAvailableSlotsForDate(dateStr);
  res.json({
    success: true,
    date: dateStr,
    slots,
  });
});

// Immediate confirmation upon appointment creation
app.post('/api/appointments', async (req, res) => {
  const { patientName, phoneNumber, appointmentDate, time } = req.body;

  if (!patientName || !phoneNumber || !appointmentDate) {
    return res.status(400).json({ error: 'Champs requis: patientName, phoneNumber, appointmentDate' });
  }

  try {
    const chatId = toWhatsAppJid(phoneNumber);
    if (!chatId) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }

    let messageSent = false;
    if (client.info) {
      const timeStr = time ? ` à ${time}` : '';
      const message = `Bonjour ${patientName}, ici le ${CLINIC_NAME}. Votre consultation est confirmée pour le ${appointmentDate}${timeStr}.`;
      await client.sendMessage(chatId, message);
      console.log(`✅ [API] Confirmation sent to ${patientName} (${chatId})`);
      messageSent = true;
    } else {
      console.warn('⚠️ [API] WhatsApp client is not ready. Message skipped.');
    }

    res.status(200).json({
      success: true,
      messageSent,
      message: messageSent
        ? 'Rendez-vous créé et message envoyé.'
        : 'Rendez-vous créé (WhatsApp non connecté).'
    });
  } catch (error) {
    console.error('❌ [API] Erreur:', error.message);
    res.status(500).json({ error: 'Erreur lors de la création.', details: error.message });
  }
});

// Direct confirmation webhook
app.post('/api/whatsapp/send-confirmation', async (req, res) => {
  const { patientName, phoneNumber, appointmentDate, time } = req.body;
  console.log(`[API Webhook] 📩 Requête de confirmation reçue:`);
  console.log(`  → Patient: ${patientName}`);
  console.log(`  → Téléphone brut: "${phoneNumber}"`);
  console.log(`  → Date: ${appointmentDate}, Heure: ${time}`);

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Numéro de téléphone manquant.' });
  }

  // Try multiple phone number formats for resilience
  let chatId = toWhatsAppJid(phoneNumber);
  
  // If toWhatsAppJid returns null, try raw digits + @c.us
  if (!chatId) {
    const rawDigits = String(phoneNumber).replace(/\D/g, '');
    if (rawDigits.length >= 9) {
      // Try with 212 prefix
      const withPrefix = rawDigits.startsWith('212') ? rawDigits : '212' + rawDigits.slice(-9);
      chatId = `${withPrefix}@c.us`;
      console.log(`[API Webhook] ⚠️ JID standard échoué, tentative avec format brut: ${chatId}`);
    }
  }

  if (!chatId) {
    console.warn(`[API Webhook] ❌ Numéro de téléphone invalide après tous les formats: "${phoneNumber}"`);
    return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
  }

  console.log(`[API Webhook] 📱 JID résolu: ${chatId}`);

  if (!client.info) {
    console.warn(`[API Webhook] ❌ Client WhatsApp non prêt (client.info est null).`);
    return res.status(503).json({ error: 'Le client WhatsApp n\'est pas encore connecté.' });
  }

  try {
    const timeStr = time ? ` à ${time}` : '';
    const dateFormatted = new Date(`${appointmentDate}T12:00:00`).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const message = `Bonjour ${patientName || 'Patient'}, le secrétariat de ${CLINIC_NAME} a confirmé votre rendez-vous du ${dateFormatted}${timeStr}. À bientôt !`;
    await client.sendMessage(chatId, message);
    console.log(`[API Webhook] ✅ Confirmation WhatsApp transmise avec succès à ${chatId}`);
    return res.json({ success: true, message: 'Message envoyé avec succès.', chatId });
  } catch (err) {
    console.error(`[API Webhook] ❌ Erreur envoi confirmation:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Requirement 5: Instant Testing Mechanism (GET /api/whatsapp/test-reminder/:phone)
// Mimics the 24-hour cron reminder instantly for a specific phone number.
// Supports ?bypassBuffer=true to force sending even if booked < 24h ago.
// ============================================================================
app.get('/api/whatsapp/test-reminder/:phone', async (req, res) => {
  const rawPhone = req.params.phone;
  const bypassBuffer = req.query.bypassBuffer === 'true' || req.query.force === 'true';

  try {
    const chatId = toWhatsAppJid(rawPhone);
    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: `Numéro de téléphone marocain invalide: "${rawPhone}". Format attendu: 06XXXXXXXX ou 2126XXXXXXXX.`
      });
    }

    if (!client.info) {
      return res.status(503).json({
        success: false,
        error: 'Le client WhatsApp n\'est pas encore connecté (client.info est nul). Veuillez vous assurer que le QR code a été scanné.'
      });
    }

    const phoneDigits = extractPhoneDigits(chatId);
    const last9Digits = phoneDigits.slice(-9);

    // Look for any existing active/upcoming appointment for this phone
    const appointment = await findActiveAppointment(last9Digits);

    let appointmentTime = '10h30';
    let patientName = 'Patient Test';
    const is48h = req.query.type === '48h';
    let bufferInfo = { checked: false, leadHours: null, passed: true };

    if (appointment) {
      patientName = `${appointment.prenom || ''} ${appointment.nom || ''}`.trim() || 'Patient';
      appointmentTime = formatTimeFR(appointment.date_rdv);

      const rdvTime = new Date(appointment.date_rdv).getTime();
      const createdTime = appointment.created_at ? new Date(appointment.created_at).getTime() : 0;
      const leadHours = createdTime > 0 ? (rdvTime - createdTime) / (1000 * 3600) : 999;
      const createdDaysAgo = createdTime > 0 ? (Date.now() - createdTime) / (1000 * 3600 * 24) : 999;

      if (is48h) {
        bufferInfo = {
          checked: true,
          createdDaysAgo: parseFloat(createdDaysAgo.toFixed(1)),
          passed: createdDaysAgo > 7
        };

        if (!bufferInfo.passed && !bypassBuffer) {
          return res.status(200).json({
            success: false,
            skipped: true,
            reason: `Règle 48h active : ce RDV a été créé il y a seulement ${bufferInfo.createdDaysAgo} jours (<= 7 jours). Le rappel 48h avancé est réservé aux RDV planifiés plus de 7 jours à l'avance.`,
            solution: `Pour forcer l'envoi lors de votre test, ajoutez ?bypassBuffer=true : /api/whatsapp/test-reminder/${rawPhone}?type=48h&bypassBuffer=true`,
            bufferInfo,
            appointment
          });
        }
      } else {
        bufferInfo = {
          checked: true,
          leadHours: parseFloat(leadHours.toFixed(1)),
          passed: leadHours > 24
        };

        // Test 24h time-buffer logic
        if (!bufferInfo.passed && !bypassBuffer) {
          return res.status(200).json({
            success: false,
            skipped: true,
            reason: `Buffer Far Planned activé : ce RDV a été créé seulement ${bufferInfo.leadHours}h avant le créneau (<= 24h). Il a donc été ignoré conformément à la règle anti-spam.`,
            solution: `Pour forcer l'envoi lors de votre test, ajoutez ?bypassBuffer=true à l'URL : /api/whatsapp/test-reminder/${rawPhone}?bypassBuffer=true`,
            bufferInfo,
            appointment
          });
        }
      }
    }

    // Prepare message (48-hour or 24-hour)
    const reminderMessage = is48h
      ? `Rappel : Vous avez un rendez-vous dans 2 jours au ${CLINIC_NAME} à ${appointmentTime}. Répondez OUI pour confirmer, NON pour annuler. (Cette confirmation est optionnelle).`
      : `Rappel : Vous avez un rendez-vous demain au ${CLINIC_NAME} à ${appointmentTime}. Répondez 1 pour confirmer, 2 pour annuler.`;

    await client.sendMessage(chatId, reminderMessage);
    console.log(`🧪 [Instant Test] Rappel ${is48h ? '48h' : '24h'} envoyé à ${chatId} (${appointment ? 'RDV trouvé en base' : 'Simulation directe'})`);

    return res.status(200).json({
      success: true,
      messageSent: true,
      reminderType: is48h ? '48h' : '24h',
      recipient: chatId,
      clinicName: CLINIC_NAME,
      doctorName: DOCTOR_NAME,
      message: reminderMessage,
      mode: appointment ? 'database_appointment' : 'simulation_directe',
      appointmentTime,
      patientName,
      bufferInfo,
      bypassBufferUsed: bypassBuffer
    });

  } catch (err) {
    console.error('❌ [Instant Test] Erreur:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'exécution du test instantané',
      details: err.message
    });
  }
});

// ============================================================================
// 8. Graceful Shutdown
// ============================================================================
async function shutdown(signal) {
  console.log(`\n[System] Reçu ${signal}. Fermeture propre des connexions...`);
  try {
    await client.destroy();
    console.log('[WhatsApp] Client fermé.');
    if (pool) {
      await pool.end();
      console.log('[PostgreSQL] Pool déconnecté.');
    }
  } catch (err) {
    console.error('[System] Erreur lors de l\'arrêt:', err);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ============================================================================
// Lancement
// ============================================================================
verifyDatabase().then(() => {
  client.initialize();
  app.listen(API_PORT, () => {
    console.log(`🚀 [API] Endpoints disponibles sur http://localhost:${API_PORT}`);
    console.log(`🧪 [Test Endpoint] http://localhost:${API_PORT}/api/whatsapp/test-reminder/:phone`);
  });
});

export default client;
export { client };
