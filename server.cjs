const express = require('express');
const cors = require('cors');
const client = require('./whatsapp.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/appointments', async (req, res) => {
  const { patientName, phoneNumber, appointmentDate, time } = req.body;

  try {
    // 1. Format the phone number for WhatsApp
    // Strip non-digits, remove leading 0, prepend 212
    let cleaned = String(phoneNumber || '').replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '212' + cleaned.slice(1);
    } else if (!cleaned.startsWith('212')) {
      cleaned = '212' + cleaned;
    }

    const chatId = `${cleaned}@c.us`;

    // 2. Send the immediate confirmation message
    // Check if client is fully connected (client.info) before sending
    let messageSent = false;
    if (client.info) {
      const timeStr = time ? ` à ${time}` : '';
      const message = `Bonjour ${patientName}, votre consultation est confirmée pour le ${appointmentDate}${timeStr}.`;
      await client.sendMessage(chatId, message);
      console.log(`✅ [WhatsApp] Confirmation sent to ${patientName} (${chatId})`);
      messageSent = true;
    } else {
      console.log('⚠️ [WhatsApp] Client is not ready (client.info is null). Message skipped.');
    }

    res.status(200).json({
      success: true,
      messageSent,
      message: messageSent
        ? 'Rendez-vous créé et message envoyé.'
        : 'Rendez-vous créé (WhatsApp non connecté).'
    });
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    res.status(500).json({ error: 'Erreur lors de la création.', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
