import axios from 'axios';

// Verified Sandbox Test Recipient Phone Number (Dev Fallback)
const VERIFIED_SANDBOX_RECIPIENT = '212643326044';

/**
 * Clean and format Moroccan phone number into strict E.164 without '+'
 * e.g., "0643326044" -> "212643326044"
 * 
 * Includes dev fallback if a dummy/invalid number (e.g. 01510951) is detected
 */
export function formatMoroccanNumber(inputNumber) {
  if (!inputNumber) {
    console.warn(`[Phone Sanitizer] No phone number provided. Using verified sandbox recipient ${VERIFIED_SANDBOX_RECIPIENT}`);
    return VERIFIED_SANDBOX_RECIPIENT;
  }

  let cleaned = String(inputNumber).replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '212' + cleaned.substring(1);
  } else if (!cleaned.startsWith('212')) {
    cleaned = '212' + cleaned;
  }

  // Check if number is an invalid dummy placeholder (like 01510951 or too short)
  if (cleaned.length < 11 || cleaned.length > 13) {
    console.warn(`[Phone Sanitizer Warning] Input "${inputNumber}" (cleaned: "${cleaned}") is an invalid/dummy number. Auto-redirecting to verified sandbox test number: ${VERIFIED_SANDBOX_RECIPIENT}`);
    return VERIFIED_SANDBOX_RECIPIENT;
  }

  return cleaned;
}

/**
 * Sends a WhatsApp appointment confirmation using Meta Cloud API
 * 
 * @param {string} phoneTo - The patient's phone number (or fallback)
 * @param {string} patientName - Replaces {{1}} in the template
 * @param {string} dateString - Replaces {{2}} in the template
 * @param {string} languageCode - Language code ('en')
 */
export const sendRdvWhatsApp = async (phoneTo, patientName = 'Patient', dateString = '10:30 AM', languageCode = 'en') => {
  const safePhone = formatMoroccanNumber(phoneTo);

  // 1. First, attempt to send via Local CNDP WhatsApp Bot (http://localhost:3001)
  try {
    const localResponse = await axios.post('http://localhost:3001/api/whatsapp/send-confirmation', {
      patientName,
      phoneNumber: safePhone,
      appointmentDate: dateString,
      time: ''
    }, { timeout: 10000 });

    if (localResponse.data?.success) {
      console.log('✅ [Local WhatsApp Bot] Message sent successfully to', safePhone);
      return localResponse.data;
    }
  } catch (localErr) {
    console.log('ℹ️ [Local WhatsApp Bot] Local service not reachable or not ready, trying fallback:', localErr?.message);
  }

  // 2. Fallback to Meta Cloud API if local bot is offline
  const ACCESS_TOKEN =
    (typeof process !== 'undefined' && (process.env?.META_ACCESS_TOKEN || process.env?.WHATSAPP_ACCESS_TOKEN || process.env?.WHATSAPP_TOKEN)) ||
    (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_WHATSAPP_ACCESS_TOKEN || import.meta.env?.VITE_WHATSAPP_TOKEN)) ||
    'EAAQCeKPx73oBShRF5547IGMuBW3rauaATHZA3QT0B1fqXhVMKyqR3ZCni0VH43X16JuhZB4YLiMFUe4DqHunhBSVDnVTCdmlNNUGLequZBqJ6ca8nj7RZCd58M3VIUJ8r5KjSFYuZAEu9A6xpl83cTnlu5mSZBP1iv4liFISaPQqFaCMLg9YSQI8PwqZC7ZBhGUWchiqYTZBifsdqOgZAazuZAO6e2YHsyHZCWvcPdaJ6Y2ZBFkM8trtmqc5InMweWQ7yDjOwWuw1KPNzSD5jQZBM9RTvGaZCDHq';

  const PHONE_NUMBER_ID =
    (typeof process !== 'undefined' && (process.env?.WHATSAPP_PHONE_ID || process.env?.WHATSAPP_PHONE_NUMBER_ID)) ||
    (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_WHATSAPP_PHONE_ID || import.meta.env?.VITE_WHATSAPP_PHONE_NUMBER_ID)) ||
    '1299172296618239';

  const TEMPLATE_NAME = "hello_world";
  const langCode = "en_US";

  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;


  // Payload structure for pre-approved hello_world template
  const payload = {
    messaging_product: "whatsapp",
    to: safePhone,
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: {
        code: langCode
      }
    }
  };

  // Verbose Meta Payload Logging
  console.log("Outgoing Meta Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // Verbose Meta Response Logging
    console.log("Meta Response Data:", response.data);
    return response.data;
  } catch (error) {
    const metaError = error.response ? error.response.data : null;
    const errorCode = metaError?.error?.code;
    console.error("❌ Meta API Request Error:", metaError || error.message);

    if (errorCode === 131030) {
      throw new Error(`(Erreur 131030) Le numéro ${safePhone} n'est pas dans la liste des destinataires de test autorisés sur votre Dashboard Meta.`);
    } else if (errorCode === 132001) {
      throw new Error(`(Erreur 132001) Le modèle "${TEMPLATE_NAME}" n'existe pas ou la langue "${languageCode}" ne correspond pas dans votre Meta Dashboard.`);
    } else if (errorCode === 131021) {
      throw new Error(`(Erreur 131021) Le numéro de téléphone ${safePhone} est invalide.`);
    }

    throw new Error(metaError?.error?.message || error.message || 'Échec de l\'envoi du message WhatsApp');
  }
};

export default {
  sendRdvWhatsApp,
  formatMoroccanNumber
};
