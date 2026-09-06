import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FSE_CONFIG = {
  // --- TOP SECTION (L'assuré) ---
  nomAssure: { x: 515, y: 495 },
  immatriculation: { x: 605, y: 482, step: 13.5 },
  cinAssure: { x: 745, y: 468, step: 13.5 },
  adresse: { x: 560, y: 410 },
  montantTotal: { x: 710, y: 365 },
  piecesJointes: { x: 730, y: 342 },
  
  // --- MIDDLE SECTION (Patient) ---
  nomPatient: { x: 515, y: 298 },
  dateNaissance: { x: 735, y: 283, step: 13.5 },
  cinPatient: { x: 610, y: 268, step: 13.5 },
  checkSexeM: { x: 672, y: 248 },
  checkSexeF: { x: 772, y: 248 },
  
  // --- BOTTOM SECTION (Medical & Signatures) ---
  inpeMedecin: { x: 595, y: 205, step: 13.5 },
  checkMaladie: { x: 618, y: 155 },
  datePatient: { x: 555, y: 92, step: 13.5 },
  dateMedecin: { x: 785, y: 92, step: 13.5 }
};

export const generateFSE = async (dbPatient, dbDoctor, dbConsultation) => {
  try {
    // 1. Load the Landscape JPG
    const imageUrl = `/assets/FSE_CNSS_page1.jpg?t=${new Date().getTime()}`;
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Image introuvable.");
    const imageBytes = await response.arrayBuffer();

    // 2. Lock to Landscape A4 limits (Width is now the larger number)
    const A4_WIDTH = 841.89;
    const A4_HEIGHT = 595.28;

    const finalDoc = await PDFDocument.create();
    const font = await finalDoc.embedFont(StandardFonts.HelveticaBold);
    const color = rgb(0.1, 0.1, 0.2);

    // 3. Draw the JPG perfectly flat onto the Landscape canvas
    const page1 = finalDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const templateImage = await finalDoc.embedJpg(imageBytes);
    
    page1.drawImage(templateImage, {
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
    });

    // 4. Drawing Helpers
    const writeText = (text, key, size = 10) => {
      if (!text || !FSE_CONFIG[key]) return;
      page1.drawText(String(text), {
        x: FSE_CONFIG[key].x,
        y: FSE_CONFIG[key].y,
        size,
        font,
        color,
      });
    };

    const writeComb = (text, key, size = 10) => {
      if (!text || !FSE_CONFIG[key]) return;
      const cleanText = String(text).replace(/[^a-zA-Z0-9]/g, '');
      const { x, y, step } = FSE_CONFIG[key];
      for (let i = 0; i < cleanText.length; i++) {
        page1.drawText(cleanText[i], {
          x: x + (i * step),
          y,
          size,
          font,
          color,
        });
      }
    };

    // 5. Inject Dynamic Data
    const fullName = `${dbPatient?.first_name || ''} ${dbPatient?.last_name || ''}`.toUpperCase();
    const rawDate = new Date().toLocaleDateString('fr-FR');

    writeText(fullName, 'nomAssure');
    writeComb(dbPatient?.cnss_number, 'immatriculation');
    writeComb(dbPatient?.cin, 'cinAssure');
    writeText(dbPatient?.address, 'adresse');
    writeText(dbConsultation?.price ? String(dbConsultation.price) : '150.00', 'montantTotal');
    writeText('1', 'piecesJointes');
    
    writeText(fullName, 'nomPatient');
    writeComb(dbPatient?.date_of_birth, 'dateNaissance');
    writeComb(dbPatient?.cin, 'cinPatient');
    
    if (dbPatient?.gender === 'Male' || dbPatient?.gender === 'M') {
      writeText('X', 'checkSexeM', 11);
    } else if (dbPatient?.gender) {
      writeText('X', 'checkSexeF', 11);
    }

    writeComb(dbDoctor?.inpe_code, 'inpeMedecin');
    writeText('X', 'checkMaladie', 11);
    writeComb(rawDate, 'datePatient');
    writeComb(rawDate, 'dateMedecin');

    // 6. Download
    const pdfBytes = await finalDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FSE_${dbPatient?.last_name || 'Patient'}.pdf`;
    link.click();
    return link.href;
  } catch (error) {
    console.error("Erreur FSE :", error);
  }
};
