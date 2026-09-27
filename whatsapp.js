import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

export const formatWhatsAppJid = (phoneNumber) => {
  if (!phoneNumber) return null;
  let cleaned = String(phoneNumber).replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '212' + cleaned.slice(1);
  } else if (!cleaned.startsWith('212')) {
    cleaned = '212' + cleaned;
  }

  return `${cleaned}@c.us`;
};

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './.wwebjs_auth'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ]
  }
});

client.on('qr', (qr) => {
  console.log('\n===============================================================');
  console.log(' [WhatsApp] Scannez ce code QR avec le téléphone du cabinet :');
  console.log('===============================================================\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ WhatsApp Client is ready!');
});

client.on('authenticated', () => {
  console.log('✅ Session WhatsApp authentifiée avec succès.');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Échec d\'authentification WhatsApp:', msg);
});

client.initialize();

// Export the client and helper so Express routes and services can use it
export default client;
export { client };
