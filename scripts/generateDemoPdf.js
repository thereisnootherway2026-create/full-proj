import fs from 'fs';
import { generateFSE } from '../src/components/cnss/generateFSE.js';

const mockPatient = {
  first_name: 'Meryem',
  last_name: 'TAZI',
  cnss_number: '123456789',
  cin: 'AB88419',
  address: 'Casablanca, Maroc',
  date_of_birth: '14/05/1998',
  gender: 'F',
};

const mockDoctor = {
  name: 'Dr. Othmane Touggani',
  specialty: 'Médecine Générale',
  inpe_code: '191023456',
  city: 'Casablanca',
  etablissement: 'Cabinet Médical Touggani',
};

const mockConsultation = {
  price: '150.00',
  date: '14/09/2026',
  type_soins: 'Maladie',
  pieces_jointes: '1',
  dossier_numero: 'DOS-2026-9812',
};

async function run() {
  console.log('Generating calibrated CNSS PDFs...');

  const templateBytes = fs.readFileSync('public/assets/FSE_CNSS_page1.jpg');

  // 1. Generate clean production PDF
  const propreBytes = await generateFSE(mockPatient, mockDoctor, mockConsultation, { debug: false, templateBytes });
  fs.writeFileSync('public/fse_cnss_remplie_propre.pdf', Buffer.from(propreBytes));
  console.log('Successfully saved public/fse_cnss_remplie_propre.pdf');

  // 2. Generate debug inspection PDF
  const debugBytes = await generateFSE(mockPatient, mockDoctor, mockConsultation, { debug: true, templateBytes });
  fs.writeFileSync('public/fse_cnss_remplie_debug.pdf', Buffer.from(debugBytes));
  console.log('Successfully saved public/fse_cnss_remplie_debug.pdf');

  // If dist directory exists, copy to dist as well for preview
  if (fs.existsSync('dist')) {
    fs.writeFileSync('dist/fse_cnss_remplie_propre.pdf', Buffer.from(propreBytes));
    fs.writeFileSync('dist/fse_cnss_remplie_debug.pdf', Buffer.from(debugBytes));
    console.log('Copied PDFs to dist directory.');
  }
}

run().catch((err) => {
  console.error('Error generating demo PDFs:', err);
  process.exit(1);
});
