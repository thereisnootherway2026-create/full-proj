import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { client, formatWhatsAppJid } from './whatsapp.js';

dotenv.config();
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// Global Clinic Branding
const CLINIC_NAME = process.env.CLINIC_NAME || 'Cabinet MacroMedica';
const DOCTOR_NAME = process.env.DOCTOR_NAME || 'Dr. El Mansouri';

app.use(cors());
app.use(express.json());

// Database Connection
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let pool = null;

if (dbUrl) {
  pool = new pg.Pool({
    connectionString: dbUrl,
    ssl: !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')
      ? { rejectUnauthorized: false }
      : false,
  });
}

// Health / Status Endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    clinicName: CLINIC_NAME,
    doctorName: DOCTOR_NAME,
    whatsappReady: !!client.info,
    user: client.info?.wid?.user || null
  });
});

// Appointment Creation & Confirmation Route
app.post('/api/appointments', async (req, res) => {
  const { patientName, phoneNumber, appointmentDate, time } = req.body;

  if (!patientName || !phoneNumber || !appointmentDate) {
    return res.status(400).json({
      error: 'Champs requis manquants: patientName, phoneNumber, appointmentDate'
    });
  }

  try {
    const chatId = formatWhatsAppJid(phoneNumber);
    if (!chatId) {
      return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
    }

    let messageSent = false;
    if (client.info) {
      const timeStr = time ? ` à ${time}` : '';
      const message = `Bonjour ${patientName}, ici le ${CLINIC_NAME}. Votre consultation est confirmée pour le ${appointmentDate}${timeStr}.`;
      
      await client.sendMessage(chatId, message);
      console.log(`✅ [WhatsApp] Confirmation sent to ${patientName} (${chatId})`);
      messageSent = true;
    } else {
      console.warn('⚠️ [WhatsApp] Client is not ready. Message skipped.');
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

// Instant Testing Mechanism: GET /api/whatsapp/test-reminder/:phone
app.get('/api/whatsapp/test-reminder/:phone', async (req, res) => {
  const rawPhone = req.params.phone;
  const bypassBuffer = req.query.bypassBuffer === 'true' || req.query.force === 'true';

  try {
    const chatId = formatWhatsAppJid(rawPhone);
    if (!chatId) {
      return res.status(400).json({ error: `Numéro de téléphone invalide: "${rawPhone}"` });
    }

    if (!client.info) {
      return res.status(503).json({
        error: 'Le client WhatsApp n\'est pas encore connecté. Veuillez scanner le QR code d\'abord.'
      });
    }

    const digits = chatId.split('@')[0].replace(/\D/g, '');
    const last9 = digits.slice(-9);

    let appointmentTime = '10h30';
    let bufferInfo = { checked: false, passed: true, leadHours: null };

    if (pool) {
      try {
        const q = `
          SELECT r.id, r.date_rdv, r.created_at, p.prenom, p.nom 
          FROM public.rdv r 
          JOIN public.patients p ON r.patient_id = p.id
          WHERE REGEXP_REPLACE(p.telephone, '\\D', '', 'g') LIKE '%' || $1
          ORDER BY r.date_rdv DESC LIMIT 1;
        `;
        const result = await pool.query(q, [last9]);
        if (result.rows.length > 0) {
          const rdv = result.rows[0];
          const d = new Date(rdv.date_rdv);
          appointmentTime = `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
          
          const leadHours = (new Date(rdv.date_rdv).getTime() - new Date(rdv.created_at).getTime()) / (3600 * 1000);
          bufferInfo = { checked: true, leadHours: parseFloat(leadHours.toFixed(1)), passed: leadHours > 24 };

          if (!bufferInfo.passed && !bypassBuffer) {
            return res.json({
              success: false,
              skipped: true,
              reason: `Buffer 'Far Planned' activé : créé ${bufferInfo.leadHours}h avant le RDV (<= 24h). Ajoutez ?bypassBuffer=true pour forcer l'envoi de test.`,
              bufferInfo
            });
          }
        }
      } catch (dbErr) {
        console.warn('[DB Error]', dbErr.message);
      }
    }

    const message = `Rappel : Vous avez un rendez-vous demain au ${CLINIC_NAME} à ${appointmentTime}. Répondez 1 pour confirmer, 2 pour annuler.`;
    await client.sendMessage(chatId, message);

    res.json({
      success: true,
      messageSent: true,
      recipient: chatId,
      clinicName: CLINIC_NAME,
      message,
      bufferInfo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 [API] Server running on http://localhost:${PORT}`);
  console.log(`🧪 [Instant Test] http://localhost:${PORT}/api/whatsapp/test-reminder/:phone`);
});
