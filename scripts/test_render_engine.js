import fs from 'fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const scaleX = 841.89 / 1024;
const scaleY = 595.28 / 724;

function b(px, py, pw, ph) {
  return {
    x: +(px * scaleX).toFixed(2),
    y: +((724 - (py + ph)) * scaleY).toFixed(2),
    width: +(pw * scaleX).toFixed(2),
    height: +(ph * scaleY).toFixed(2)
  };
}

// Micro-calibrated bar positions
const immatBars = [630, 643, 656, 669, 682, 695, 708, 721, 734, 748];
const cinAssureBars = [784, 797, 810, 823, 836, 849, 863, 876, 890];
const dnBars = [
  [755, 769], [769, 783],
  [796, 809], [809, 823],
  [835, 848], [848, 861], [861, 875], [875, 889]
];
const cinBenefBars = [627, 640, 654, 667, 680, 693, 706, 719, 733];
const inpeMedBars = [612, 626, 639, 652, 665, 678, 691, 704, 717, 730];
const inpeEtabBars = [871, 884, 898, 910, 923, 937, 950, 963, 976, 989];
const dbgBars = [
  [576, 588], [588, 600],
  [612, 623], [623, 636],
  [647, 659], [659, 671], [671, 683], [683, 695]
];
const dbdBars = [
  [828, 840], [840, 852],
  [864, 876], [876, 888],
  [900, 912], [912, 924], [924, 935], [935, 947]
];

export const CNSS_EXACT_MAP = {
  // En-tête
  num_dossier: { ...b(585, 114, 115, 10), label: 'N° Dossier' },
  check_entente_prealable: { ...b(695, 77, 16, 14), label: 'Entente préalable' },
  check_execution: { ...b(825, 77, 16, 13), label: 'Exécution' },

  // Partie réservée à l'assuré(e)
  assure_nom: { ...b(615, 144, 295, 8), label: 'Nom et prénom (Assuré)' },
  immatriculation: {
    label: 'N° Immatriculation',
    boxes: immatBars.slice(0, 9).map((x, i) => b(x, 152.5, immatBars[i+1] - x, 9.5))
  },
  cin_assure: {
    label: 'N° CIN Assuré',
    boxes: cinAssureBars.slice(0, 8).map((x, i) => b(x, 164, cinAssureBars[i+1] - x, 9.5))
  },
  check_conjoint: { ...b(687, 196, 15, 13), label: 'Conjoint' },
  check_enfant: { ...b(895, 196, 15, 13), label: 'Enfant' },
  adresse: { ...b(570, 214, 394, 25), label: 'Adresse' },
  montant_frais: { ...b(691, 245, 154, 22), label: 'Montant' },
  nombre_pieces: { ...b(739, 270, 56, 20), label: 'Pièces' },

  // Bénéficiaire de soins
  beneficiaire_nom: { ...b(610, 344, 295, 8), label: 'Nom (Bénéficiaire)' },
  date_naissance: {
    label: 'Date de Naissance',
    boxes: dnBars.map(pair => b(pair[0], 354, pair[1] - pair[0], 9.5))
  },
  cin_beneficiaire: {
    label: 'N° CIN Bénéficiaire',
    boxes: cinBenefBars.slice(0, 8).map((x, i) => b(x, 364, cinBenefBars[i+1] - x, 9.5))
  },
  check_sexe_m: { ...b(685, 386, 15, 13), label: 'Sexe M' },
  check_sexe_f: { ...b(789, 386, 15, 13), label: 'Sexe F' },

  // INPE & Professionnels
  inpe: {
    label: 'INPE Médecin Traitant',
    boxes: inpeMedBars.slice(0, 9).map((x, i) => b(x, 424, inpeMedBars[i+1] - x, 9.5))
  },
  inpe_etablissement: {
    label: 'INPE Établissement',
    boxes: inpeEtabBars.slice(0, 9).map((x, i) => b(x, 424, inpeEtabBars[i+1] - x, 9.5))
  },
  medecin_traitant_nom: { ...b(525, 462, 235, 22), label: 'Médecin Traitant' },
  etablissement_soins_nom: { ...b(775, 462, 230, 22), label: 'Établissement de soins' },

  // Type de soins
  check_maladie: { ...b(625, 501, 15, 15), label: 'Maladie' },
  check_maternite: { ...b(926, 495, 15, 15), label: 'Maternité' },
  check_hospitalisation: { ...b(626, 525, 15, 15), label: 'Hospitalisation' },
  check_accident: { ...b(926, 529, 15, 15), label: 'Accident' },

  // Signatures & Dates
  fait_a_assure: { ...b(545, 589, 135, 7.5), label: 'Fait à (Assuré)' },
  date_bas_gauche: {
    label: 'Date (Assuré)',
    boxes: dbgBars.map(pair => b(pair[0], 604, pair[1] - pair[0], 9.5))
  },
  fait_a_medecin: { ...b(785, 589, 135, 7.5), label: 'Fait à (Médecin)' },
  date_bas_droite: {
    label: 'Date (Médecin)',
    boxes: dbdBars.map(pair => b(pair[0], 604, pair[1] - pair[0], 9.5))
  }
};

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
  etablissement: 'Cabinet Médical Touggani'
};

const mockConsultation = {
  price: '150.00',
  date: '14/09/2026',
  type_soins: 'Maladie',
  dossier_numero: 'DOS-2026-9812'
};

async function renderDoc(debug) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([841.89, 595.28]);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontCourier = await doc.embedFont(StandardFonts.CourierBold);
  const fontSmall = await doc.embedFont(StandardFonts.Helvetica);

  const imgBytes = fs.readFileSync('public/assets/FSE_CNSS_page1.jpg');
  const img = await doc.embedJpg(imgBytes);
  page.drawImage(img, { x: 0, y: 0, width: 841.89, height: 595.28 });

  const INK = rgb(0.08, 0.15, 0.35);
  const RED = rgb(0.9, 0.1, 0.1);
  const BLUE_LBL = rgb(0.1, 0.35, 0.8);

  const drawCharInBox = (char, box, defaultSize = 8.5, boxIndex = 0) => {
    let size = defaultSize;
    let charWidth = fontCourier.widthOfTextAtSize(char, size);
    let capHeight = fontCourier.heightAtSize(size, { descender: false }) || (size * 0.7);

    while ((charWidth > box.width - 0.6 || capHeight > box.height - 0.6) && size > 4.5) {
      size -= 0.5;
      charWidth = fontCourier.widthOfTextAtSize(char, size);
      capHeight = fontCourier.heightAtSize(size, { descender: false }) || (size * 0.7);
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const x = centerX - charWidth / 2;
    const y = centerY - capHeight / 2;

    page.drawText(char, { x, y, size, font: fontCourier, color: INK });

    if (debug) {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        borderColor: RED,
        borderWidth: 0.5
      });
      const numStr = String(boxIndex + 1).padStart(2, '0');
      const numW = fontSmall.widthOfTextAtSize(numStr, 3.8);
      page.drawText(numStr, {
        x: centerX - numW / 2,
        y: box.y + box.height + 0.8,
        size: 3.8,
        font: fontSmall,
        color: RED
      });
    }
  };

  const drawArrayOfBoxes = (val, field, defaultSize = 8.5) => {
    const boxes = field.boxes || (Array.isArray(field) ? field : [field]);
    const clean = String(val || '').replace(/[^a-zA-Z0-9]/g, '');
    const count = Math.min(clean.length, boxes.length);

    if (debug && field.label) {
      const first = boxes[0];
      const info = `${field.label} (${first.x.toFixed(1)}, ${first.y.toFixed(1)})`;
      page.drawText(info, {
        x: first.x,
        y: first.y + first.height + 5.0,
        size: 4.0,
        font: fontBold,
        color: BLUE_LBL
      });
    }

    for (let i = 0; i < count; i++) {
      drawCharInBox(clean[i], boxes[i], defaultSize, i);
    }

    if (debug) {
      for (let i = count; i < boxes.length; i++) {
        const b = boxes[i];
        page.drawRectangle({
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          borderColor: RED,
          borderWidth: 0.4
        });
        const numStr = String(i + 1).padStart(2, '0');
        const numW = fontSmall.widthOfTextAtSize(numStr, 3.8);
        page.drawText(numStr, {
          x: b.x + b.width / 2 - numW / 2,
          y: b.y + b.height + 0.8,
          size: 3.8,
          font: fontSmall,
          color: RED
        });
      }
    }
  };

  const drawTextInZone = (text, zone, defaultSize = 8.5, align = 'left') => {
    if (!zone) return;
    const str = String(text || '').trim();

    if (debug && zone.label) {
      const info = `${zone.label} [${zone.x.toFixed(1)}, ${zone.y.toFixed(1)}]`;
      page.drawText(info, {
        x: zone.x,
        y: zone.y + zone.height + 1.5,
        size: 4.2,
        font: fontBold,
        color: BLUE_LBL
      });
      page.drawRectangle({
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        borderColor: RED,
        borderWidth: 0.5
      });
    }

    if (!str) return;

    let s = defaultSize;
    let textWidth = fontBold.widthOfTextAtSize(str, s);
    while (textWidth > zone.width - 4 && s > 5.0) {
      s -= 0.5;
      textWidth = fontBold.widthOfTextAtSize(str, s);
    }

    const centerY = zone.y + zone.height / 2;
    const capHeight = fontBold.heightAtSize(s, { descender: false }) || (s * 0.7);
    const y = centerY - capHeight / 2;
    const x = align === 'center' ? zone.x + (zone.width - textWidth) / 2 : zone.x + 3.0;

    page.drawText(str, { x, y, size: s, font: fontBold, color: INK });
  };

  const drawCheck = (box, defaultSize = 10.0) => {
    if (!box) return;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    let markSize = defaultSize;
    let w = fontBold.widthOfTextAtSize('X', markSize);
    let capHeight = fontBold.heightAtSize(markSize, { descender: false }) || (markSize * 0.7);

    while ((w > box.width - 2.0 || capHeight > box.height - 2.0) && markSize > 6.0) {
      markSize -= 0.5;
      w = fontBold.widthOfTextAtSize('X', markSize);
      capHeight = fontBold.heightAtSize(markSize, { descender: false }) || (markSize * 0.7);
    }

    const x = centerX - w / 2;
    const y = centerY - capHeight / 2;

    page.drawText('X', { x, y, size: markSize, font: fontBold, color: INK });

    if (debug) {
      page.drawRectangle({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        borderColor: RED,
        borderWidth: 0.5
      });
      if (box.label) {
        page.drawText(box.label, {
          x: box.x,
          y: box.y + box.height + 1.5,
          size: 4.2,
          font: fontBold,
          color: BLUE_LBL
        });
      }
    }
  };

  // 1. Dossier
  if (mockConsultation.dossier_numero) {
    drawTextInZone(mockConsultation.dossier_numero, CNSS_EXACT_MAP.num_dossier, 8.5);
  }

  // 2. Assuré
  const patientFullName = (mockPatient.first_name + ' ' + mockPatient.last_name).toUpperCase();
  drawTextInZone(patientFullName, CNSS_EXACT_MAP.assure_nom, 8.5);
  drawArrayOfBoxes(mockPatient.cnss_number, CNSS_EXACT_MAP.immatriculation, 8.5);
  drawArrayOfBoxes(mockPatient.cin, CNSS_EXACT_MAP.cin_assure, 8.5);
  drawTextInZone(mockPatient.address, CNSS_EXACT_MAP.adresse, 9.0);
  drawTextInZone(mockConsultation.price, CNSS_EXACT_MAP.montant_frais, 9.5, 'center');
  drawTextInZone('1', CNSS_EXACT_MAP.nombre_pieces, 9.0, 'center');

  // 3. Bénéficiaire
  drawTextInZone(patientFullName, CNSS_EXACT_MAP.beneficiaire_nom, 8.5);
  drawArrayOfBoxes('14051998', CNSS_EXACT_MAP.date_naissance, 8.5);
  drawArrayOfBoxes(mockPatient.cin, CNSS_EXACT_MAP.cin_beneficiaire, 8.5);
  drawCheck(CNSS_EXACT_MAP.check_sexe_f, 9.5);

  // 4. INPE & Doctor / Clinic
  drawArrayOfBoxes(mockDoctor.inpe_code, CNSS_EXACT_MAP.inpe, 8.5);
  if (mockDoctor.name) {
    const docDesc = `${mockDoctor.name} - ${mockDoctor.specialty || ''}`.trim();
    drawTextInZone(docDesc, CNSS_EXACT_MAP.medecin_traitant_nom, 8.0);
  }
  if (mockDoctor.etablissement) {
    drawTextInZone(mockDoctor.etablissement, CNSS_EXACT_MAP.etablissement_soins_nom, 8.0);
  }

  // 5. Type de soins
  drawCheck(CNSS_EXACT_MAP.check_maladie, 10.0);

  // 6. Bas de page
  drawTextInZone(mockDoctor.city, CNSS_EXACT_MAP.fait_a_assure, 8.0);
  drawArrayOfBoxes('14092026', CNSS_EXACT_MAP.date_bas_gauche, 8.0);

  drawTextInZone(mockDoctor.city, CNSS_EXACT_MAP.fait_a_medecin, 8.0);
  drawArrayOfBoxes('14092026', CNSS_EXACT_MAP.date_bas_droite, 8.0);

  return await doc.save();
}

async function run() {
  fs.writeFileSync('scratch/calibrated_propre.pdf', await renderDoc(false));
  fs.writeFileSync('scratch/calibrated_debug.pdf', await renderDoc(true));
  console.log('Saved calibrated test PDFs successfully.');
}
run();
