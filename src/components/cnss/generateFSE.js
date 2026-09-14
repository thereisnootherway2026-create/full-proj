import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const scaleX = 841.89 / 1024;
const scaleY = 595.28 / 724;

/**
 * Convert pixel coordinates from the 1024x724 JPEG template to standard A4 Landscape PDF points (841.89 x 595.28).
 * Note: JPEG origin is top-left, PDF origin is bottom-left.
 */
function b(px, py, pw, ph) {
  return {
    x: +(px * scaleX).toFixed(2),
    y: +((724 - (py + ph)) * scaleY).toFixed(2),
    width: +(pw * scaleX).toFixed(2),
    height: +(ph * scaleY).toFixed(2),
  };
}

/**
 * Helper to build a boxed field structure that supports both:
 * 1. { label, boxes: [{x, y, width, height}, ...] }
 * 2. Array indexation: field[0], field.length (backward compatibility)
 */
function createBoxedField(label, boxList) {
  const arr = [...boxList];
  arr.label = label;
  arr.boxes = boxList;
  arr.x = boxList[0]?.x || 0;
  arr.y = boxList[0]?.y || 0;
  arr.width = +(boxList.reduce((acc, cur) => acc + cur.width, 0)).toFixed(2);
  arr.height = boxList[0]?.height || 0;
  return arr;
}

// Micro-calibrated bar coordinates from high-resolution template pixel analysis
const immatBars = [630, 643, 656, 669, 682, 695, 708, 721, 734, 748];
const cinAssureBars = [784, 797, 810, 823, 836, 849, 863, 876, 890];
const dnBars = [
  [755, 769], [769, 783],
  [796, 809], [809, 823],
  [835, 848], [848, 861], [861, 875], [875, 889],
];
const cinBenefBars = [627, 640, 654, 667, 680, 693, 706, 719, 733];
const inpeMedBars = [612, 626, 639, 652, 665, 678, 691, 704, 717, 730];
const inpeEtabBars = [871, 884, 898, 910, 923, 937, 950, 963, 976, 989];
const dbgBars = [
  [576, 588], [588, 600],
  [612, 623], [623, 636],
  [647, 659], [659, 671], [671, 683], [683, 695],
];
const dbdBars = [
  [828, 840], [840, 852],
  [864, 876], [876, 888],
  [900, 912], [912, 924], [924, 935], [935, 947],
];

/**
 * MASTER EXACT COORDINATE CONFIGURATION FOR CNSS FEUILLE DE SOINS (A4 LANDSCAPE)
 * Template: FSE_CNSS_page1.jpg (1024 x 724 px scaled to 841.89 x 595.28 pt)
 * Individual bounding boxes calibrated per character and per field.
 */
export const CNSS_EXACT_MAP = {
  // --- Section 1: En-tête ---
  num_dossier: { ...b(585, 114, 115, 10), label: 'N° Dossier' },
  check_entente_prealable: { ...b(695, 77, 16, 14), label: 'Entente préalable' },
  check_execution: { ...b(825, 77, 16, 13), label: 'Exécution' },

  // --- Section 2: Partie réservée à l'assuré(e) ---
  assure_nom: { ...b(615, 144, 295, 8), label: 'Nom et prénom (Assuré)' },
  immatriculation: createBoxedField(
    'N° Immatriculation',
    immatBars.slice(0, 9).map((x, i) => b(x, 152.5, immatBars[i + 1] - x, 9.5))
  ),
  cin_assure: createBoxedField(
    'N° CIN Assuré',
    cinAssureBars.slice(0, 8).map((x, i) => b(x, 164, cinAssureBars[i + 1] - x, 9.5))
  ),
  check_conjoint: { ...b(687, 196, 15, 13), label: 'Conjoint' },
  check_enfant: { ...b(895, 196, 15, 13), label: 'Enfant' },
  adresse: { ...b(570, 214, 394, 25), label: 'Adresse' },
  montant_frais: { ...b(691, 245, 154, 22), label: 'Montant' },
  nombre_pieces: { ...b(739, 270, 56, 20), label: 'Pièces' },

  // --- Section 3: Bénéficiaire de soins ---
  beneficiaire_nom: { ...b(610, 344, 295, 8), label: 'Nom (Bénéficiaire)' },
  date_naissance: createBoxedField(
    'Date de Naissance',
    dnBars.map((pair) => b(pair[0], 354, pair[1] - pair[0], 9.5))
  ),
  cin_beneficiaire: createBoxedField(
    'N° CIN Bénéficiaire',
    cinBenefBars.slice(0, 8).map((x, i) => b(x, 364, cinBenefBars[i + 1] - x, 9.5))
  ),
  check_sexe_m: { ...b(685, 386, 15, 13), label: 'Sexe M' },
  check_sexe_f: { ...b(789, 386, 15, 13), label: 'Sexe F' },

  // --- Section 4: INPE & Professionnels / Établissements ---
  inpe: createBoxedField(
    'INPE Médecin Traitant',
    inpeMedBars.slice(0, 9).map((x, i) => b(x, 424, inpeMedBars[i + 1] - x, 9.5))
  ),
  inpe_etablissement: createBoxedField(
    'INPE Établissement',
    inpeEtabBars.slice(0, 9).map((x, i) => b(x, 424, inpeEtabBars[i + 1] - x, 9.5))
  ),
  medecin_traitant_nom: { ...b(528, 462, 235, 22), label: 'Médecin Traitant' },
  etablissement_soins_nom: { ...b(778, 462, 228, 22), label: 'Établissement de soins' },

  // --- Section 5: Type de soins ---
  check_maladie: { ...b(625, 501, 15, 15), label: 'Maladie' },
  check_maternite: { ...b(926, 495, 15, 15), label: 'Maternité' },
  check_hospitalisation: { ...b(626, 525, 15, 15), label: 'Hospitalisation' },
  check_accident: { ...b(926, 529, 15, 15), label: 'Accident' },

  // --- Section 6: Signatures, Villes & Dates ---
  fait_a_assure: { ...b(552, 589, 128, 7.5), label: 'Fait à (Assuré)' },
  date_bas_gauche: createBoxedField(
    'Date (Assuré)',
    dbgBars.map((pair) => b(pair[0], 604, pair[1] - pair[0], 9.5))
  ),
  fait_a_medecin: { ...b(792, 589, 128, 7.5), label: 'Fait à (Médecin)' },
  date_bas_droite: createBoxedField(
    'Date (Médecin)',
    dbdBars.map((pair) => b(pair[0], 604, pair[1] - pair[0], 9.5))
  ),
};

/**
 * Normalise any date representation (DD/MM/YYYY, YYYY-MM-DD, ISO, etc.) into DDMMYYYY string
 */
export function cleanDateTo8Digits(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.split('T')[0].split('-');
    return `${d}${m}${y}`;
  }
  const clean = str.replace(/[^0-9]/g, '');
  if (clean.length >= 8) {
    return clean.substring(0, 8);
  }
  return '';
}

/**
 * Validation function for CNSS Form Data
 */
export function validateFseData(patient = {}, doctor = {}, consultation = {}) {
  const warnings = [];
  if (!patient.first_name && !patient.last_name && !patient.nomPrenom && !patient.name) {
    warnings.push('Nom du patient manquant');
  }
  if (!patient.cnss_number && !patient.immatriculation) {
    warnings.push('N° Immatriculation CNSS manquant');
  }
  if (!patient.cin) {
    warnings.push('N° CIN manquant');
  }
  if (!patient.date_of_birth && !patient.dateNaissance) {
    warnings.push('Date de naissance manquante');
  }
  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

/**
 * Core PDF Generation Function with precision centering and optional DEBUG mode
 */
export const generateFSE = async (dbPatient = {}, dbDoctor = {}, dbConsultation = {}, options = {}) => {
  try {
    const debug = !!options.debug;

    // 1. Load the official background template
    let imageBytes = options.templateBytes;
    if (!imageBytes) {
      if (typeof window !== 'undefined') {
        const imageUrl = `/assets/FSE_CNSS_page1.jpg?t=${new Date().getTime()}`;
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Image template CNSS introuvable.');
        imageBytes = await response.arrayBuffer();
      } else {
        throw new Error('templateBytes must be provided in options in Node.js environment.');
      }
    }

    // 2. Lock to standard A4 Landscape canvas (841.89 x 595.28 pt)
    const A4_WIDTH = 841.89;
    const A4_HEIGHT = 595.28;

    const finalDoc = await PDFDocument.create();
    const fontBold = await finalDoc.embedFont(StandardFonts.HelveticaBold);
    const fontCourier = await finalDoc.embedFont(StandardFonts.CourierBold);
    const fontSmall = await finalDoc.embedFont(StandardFonts.Helvetica);

    // Official medical ink and debug colors
    const INK_COLOR = rgb(0.08, 0.15, 0.35);
    const DEBUG_RED = rgb(0.9, 0.1, 0.1);
    const DEBUG_BLUE = rgb(0.1, 0.35, 0.8);

    const page1 = finalDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    const templateImage = await finalDoc.embedJpg(imageBytes);

    page1.drawImage(templateImage, {
      x: 0,
      y: 0,
      width: A4_WIDTH,
      height: A4_HEIGHT,
    });

    // 3. Precision Box Centering Helper
    const drawCharInBox = (char, box, defaultSize = 8.5, boxIndex = 0) => {
      let size = defaultSize;
      let charWidth = fontCourier.widthOfTextAtSize(char, size);
      let capHeight = fontCourier.heightAtSize(size, { descender: false }) || size * 0.7;

      // Ensure the character does not overflow the individual box
      while ((charWidth > box.width - 0.6 || capHeight > box.height - 0.6) && size > 4.5) {
        size -= 0.5;
        charWidth = fontCourier.widthOfTextAtSize(char, size);
        capHeight = fontCourier.heightAtSize(size, { descender: false }) || size * 0.7;
      }

      // Mathematical center of individual box
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const x = centerX - charWidth / 2;
      const y = centerY - capHeight / 2;

      page1.drawText(char, { x, y, size, font: fontCourier, color: INK_COLOR });

      if (debug) {
        page1.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          borderColor: DEBUG_RED,
          borderWidth: 0.5,
        });
        const numStr = String(boxIndex + 1).padStart(2, '0');
        const numW = fontSmall.widthOfTextAtSize(numStr, 3.8);
        page1.drawText(numStr, {
          x: centerX - numW / 2,
          y: box.y + box.height + 0.8,
          size: 3.8,
          font: fontSmall,
          color: DEBUG_RED,
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
        page1.drawText(info, {
          x: first.x,
          y: first.y + first.height + 5.0,
          size: 4.0,
          font: fontBold,
          color: DEBUG_BLUE,
        });
      }

      for (let i = 0; i < count; i++) {
        drawCharInBox(clean[i], boxes[i], defaultSize, i);
      }

      if (debug) {
        for (let i = count; i < boxes.length; i++) {
          const b = boxes[i];
          page1.drawRectangle({
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            borderColor: DEBUG_RED,
            borderWidth: 0.4,
          });
          const numStr = String(i + 1).padStart(2, '0');
          const numW = fontSmall.widthOfTextAtSize(numStr, 3.8);
          page1.drawText(numStr, {
            x: b.x + b.width / 2 - numW / 2,
            y: b.y + b.height + 0.8,
            size: 3.8,
            font: fontSmall,
            color: DEBUG_RED,
          });
        }
      }
    };

    const drawTextInZone = (text, zone, defaultSize = 8.5, align = 'left') => {
      if (!zone) return;
      const str = String(text || '').trim();

      if (debug && zone.label) {
        const info = `${zone.label} [${zone.x.toFixed(1)}, ${zone.y.toFixed(1)}]`;
        page1.drawText(info, {
          x: zone.x,
          y: zone.y + zone.height + 1.5,
          size: 4.2,
          font: fontBold,
          color: DEBUG_BLUE,
        });
        page1.drawRectangle({
          x: zone.x,
          y: zone.y,
          width: zone.width,
          height: zone.height,
          borderColor: DEBUG_RED,
          borderWidth: 0.5,
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
      const capHeight = fontBold.heightAtSize(s, { descender: false }) || s * 0.7;
      const y = centerY - capHeight / 2;
      const x = align === 'center' ? zone.x + (zone.width - textWidth) / 2 : zone.x + 3.0;

      page1.drawText(str, { x, y, size: s, font: fontBold, color: INK_COLOR });
    };

    const drawCheck = (box, defaultSize = 10.0) => {
      if (!box) return;
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      let markSize = defaultSize;
      let w = fontBold.widthOfTextAtSize('X', markSize);
      let capHeight = fontBold.heightAtSize(markSize, { descender: false }) || markSize * 0.7;

      while ((w > box.width - 2.0 || capHeight > box.height - 2.0) && markSize > 6.0) {
        markSize -= 0.5;
        w = fontBold.widthOfTextAtSize('X', markSize);
        capHeight = fontBold.heightAtSize(markSize, { descender: false }) || markSize * 0.7;
      }

      const x = centerX - w / 2;
      const y = centerY - capHeight / 2;

      page1.drawText('X', { x, y, size: markSize, font: fontBold, color: INK_COLOR });

      if (debug) {
        page1.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          borderColor: DEBUG_RED,
          borderWidth: 0.5,
        });
        if (box.label) {
          page1.drawText(box.label, {
            x: box.x,
            y: box.y + box.height + 1.5,
            size: 4.2,
            font: fontBold,
            color: DEBUG_BLUE,
          });
        }
      }
    };

    // 4. Extract data cleanly
    const fullName = (
      dbPatient?.nomComplet ||
      dbPatient?.nomPrenom ||
      dbPatient?.name ||
      `${dbPatient?.first_name || ''} ${dbPatient?.last_name || ''}`.trim()
    ).toUpperCase();

    const immat = dbPatient?.immatriculation || dbPatient?.cnss_number || '';
    const cin = (dbPatient?.cin || '').toUpperCase();
    const address = dbPatient?.adresse || dbPatient?.address || '';
    const totalAmount =
      dbPatient?.montant != null
        ? String(dbPatient.montant)
        : dbConsultation?.price != null
        ? String(dbConsultation.price)
        : dbConsultation?.montantTotal || '150.00';
    const piecesCount = String(
      dbConsultation?.pieces_jointes ||
        dbConsultation?.piecesJointes ||
        dbPatient?.pieces_jointes ||
        '1'
    );
    const birthDate8 = cleanDateTo8Digits(dbPatient?.dateNaissance || dbPatient?.date_of_birth);
    const gender = (dbPatient?.sexe || dbPatient?.gender || '').toUpperCase();

    // Doctor & Establishment Data
    const inpe = dbDoctor?.inpe_code || dbDoctor?.inpe || '';
    const doctorName =
      dbDoctor?.name ||
      dbDoctor?.doctor_name ||
      dbDoctor?.nom ||
      (dbDoctor?.first_name ? `Dr. ${dbDoctor.first_name} ${dbDoctor.last_name || ''}` : '') ||
      '';
    const doctorSpecialty = dbDoctor?.specialty || dbDoctor?.specialite || '';
    const etablissementName =
      dbDoctor?.etablissement ||
      dbDoctor?.clinic_name ||
      dbDoctor?.nom_etablissement ||
      dbDoctor?.establishment ||
      '';
    const etablissementInpe = dbDoctor?.etablissement_inpe || dbDoctor?.inpe_etablissement || '';

    const city = dbDoctor?.city || dbDoctor?.ville || 'Casablanca';
    const rawConsultDate = dbConsultation?.date || new Date().toLocaleDateString('fr-FR');
    const consultDate8 = cleanDateTo8Digits(rawConsultDate);
    const dossierNum = dbConsultation?.dossier_numero || dbPatient?.dossier_numero || '';

    // 5. Fill fields with exact coordinate placements
    if (dossierNum) drawTextInZone(dossierNum, CNSS_EXACT_MAP.num_dossier, 8.5);

    // Section 1: Assuré
    if (fullName) drawTextInZone(fullName, CNSS_EXACT_MAP.assure_nom, 8.5);
    if (immat) drawArrayOfBoxes(immat, CNSS_EXACT_MAP.immatriculation, 8.5);
    if (cin) drawArrayOfBoxes(cin, CNSS_EXACT_MAP.cin_assure, 8.5);

    if (dbPatient?.relation === 'conjoint' || dbPatient?.isConjoint) {
      drawCheck(CNSS_EXACT_MAP.check_conjoint);
    } else if (dbPatient?.relation === 'enfant' || dbPatient?.isEnfant) {
      drawCheck(CNSS_EXACT_MAP.check_enfant);
    }

    if (address) drawTextInZone(address, CNSS_EXACT_MAP.adresse, 9.0);
    if (totalAmount) drawTextInZone(totalAmount, CNSS_EXACT_MAP.montant_frais, 9.5, 'center');
    if (piecesCount) drawTextInZone(piecesCount, CNSS_EXACT_MAP.nombre_pieces, 9.0, 'center');

    // Section 2: Bénéficiaire
    if (fullName) drawTextInZone(fullName, CNSS_EXACT_MAP.beneficiaire_nom, 8.5);
    if (birthDate8) drawArrayOfBoxes(birthDate8, CNSS_EXACT_MAP.date_naissance, 8.5);
    if (cin) drawArrayOfBoxes(cin, CNSS_EXACT_MAP.cin_beneficiaire, 8.5);

    if (gender === 'M' || gender === 'MALE' || gender === 'HOMME') {
      drawCheck(CNSS_EXACT_MAP.check_sexe_m, 9.5);
    } else if (gender === 'F' || gender === 'FEMALE' || gender === 'FEMME') {
      drawCheck(CNSS_EXACT_MAP.check_sexe_f, 9.5);
    }

    // Section 3: INPE & Médecin / Établissement
    if (inpe) drawArrayOfBoxes(inpe, CNSS_EXACT_MAP.inpe, 8.5);
    if (etablissementInpe) drawArrayOfBoxes(etablissementInpe, CNSS_EXACT_MAP.inpe_etablissement, 8.5);

    if (doctorName) {
      const docLabel = doctorSpecialty ? `${doctorName} - ${doctorSpecialty}` : doctorName;
      drawTextInZone(docLabel, CNSS_EXACT_MAP.medecin_traitant_nom, 8.0);
    }
    if (etablissementName) {
      drawTextInZone(etablissementName, CNSS_EXACT_MAP.etablissement_soins_nom, 8.0);
    }

    // Section 4: Type de soins
    const typeSoins = (dbConsultation?.type_soins || 'Maladie').toLowerCase();
    if (typeSoins.includes('matern')) {
      drawCheck(CNSS_EXACT_MAP.check_maternite, 10.0);
    } else if (typeSoins.includes('hospit')) {
      drawCheck(CNSS_EXACT_MAP.check_hospitalisation, 10.0);
    } else if (typeSoins.includes('accid')) {
      drawCheck(CNSS_EXACT_MAP.check_accident, 10.0);
    } else {
      drawCheck(CNSS_EXACT_MAP.check_maladie, 10.0);
    }

    // Section 5: Signatures, Villes & Dates
    if (city) {
      drawTextInZone(city, CNSS_EXACT_MAP.fait_a_assure, 8.0);
      drawTextInZone(city, CNSS_EXACT_MAP.fait_a_medecin, 8.0);
    }
    if (consultDate8) {
      drawArrayOfBoxes(consultDate8, CNSS_EXACT_MAP.date_bas_gauche, 8.0);
      drawArrayOfBoxes(consultDate8, CNSS_EXACT_MAP.date_bas_droite, 8.0);
    }

    // 6. Output PDF
    const pdfBytes = await finalDoc.save();

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `FSE_${dbPatient?.last_name || 'Patient'}_CNSS.pdf`;
      link.click();
      return link.href;
    }

    return pdfBytes;
  } catch (error) {
    console.error('Erreur génération FSE :', error);
    throw error;
  }
};

export const mockPatients = [
  { id: 1, nomComplet: "Youssef Alaoui", sexe: "M", cin: "AB123456", immatriculation: "112233445", dateNaissance: "15051990", adresse: "Casablanca, Maroc", montant: 500 },
  { id: 2, nomComplet: "Fatima Zahra Bennani", sexe: "F", cin: "CD987654", immatriculation: "998877665", dateNaissance: "22111985", adresse: "Rabat, Maroc", montant: 300 },
  { id: 3, nomComplet: "Karim Tazi", sexe: "M", cin: "EE556677", immatriculation: "102938475", dateNaissance: "08022000", adresse: "Temara, Maroc", montant: 150 },
  { id: 4, nomComplet: "Meryem Chraibi", sexe: "F", cin: "BH112233", immatriculation: "564738291", dateNaissance: "30071992", adresse: "Salé, Maroc", montant: 250 },
  { id: 5, nomComplet: "Omar Idrissi", sexe: "M", cin: "ZG889900", immatriculation: "192837465", dateNaissance: "12121978", adresse: "Kenitra, Maroc", montant: 400 },
  { id: 6, nomComplet: "Sara Bennis", sexe: "F", cin: "AE445566", immatriculation: "918273645", dateNaissance: "05041995", adresse: "Mohammedia, Maroc", montant: 200 },
  { id: 7, nomComplet: "Mehdi El Fassi", sexe: "M", cin: "BK334455", immatriculation: "112211223", dateNaissance: "19091988", adresse: "Rabat, Maroc", montant: 600 },
  { id: 8, nomComplet: "Najat Lahlou", sexe: "F", cin: "CB223344", immatriculation: "445566778", dateNaissance: "25011965", adresse: "Casablanca, Maroc", montant: 150 },
  { id: 9, nomComplet: "Amine Kettani", sexe: "M", cin: "WA778899", immatriculation: "334455667", dateNaissance: "14062002", adresse: "Tanger, Maroc", montant: 350 },
  { id: 10, nomComplet: "Houda Berrada", sexe: "F", cin: "PA112211", immatriculation: "990011223", dateNaissance: "03111999", adresse: "Fès, Maroc", montant: 200 },
  { id: 11, nomComplet: "Tariq Mansouri", sexe: "M", cin: "AB998877", immatriculation: "556677889", dateNaissance: "27081983", adresse: "Meknès, Maroc", montant: 450 },
  { id: 12, nomComplet: "Leila Guessous", sexe: "F", cin: "CD665544", immatriculation: "223344556", dateNaissance: "11031991", adresse: "Agadir, Maroc", montant: 300 },
  { id: 13, nomComplet: "Yassine Filali", sexe: "M", cin: "EE332211", immatriculation: "778899001", dateNaissance: "09101975", adresse: "Rabat, Maroc", montant: 500 },
  { id: 14, nomComplet: "Khadija Benjelloun", sexe: "F", cin: "BH990088", immatriculation: "112233445", dateNaissance: "16021960", adresse: "Casablanca, Maroc", montant: 150 },
  { id: 15, nomComplet: "Ilyas Naciri", sexe: "M", cin: "ZG443322", immatriculation: "667788990", dateNaissance: "21071996", adresse: "Marrakech, Maroc", montant: 250 },
  { id: 16, nomComplet: "Asma Amrani", sexe: "F", cin: "AE119922", immatriculation: "334455667", dateNaissance: "04121989", adresse: "Rabat, Maroc", montant: 400 },
  { id: 17, nomComplet: "Reda Sefrioui", sexe: "M", cin: "BK887766", immatriculation: "998877665", dateNaissance: "29051981", adresse: "Oujda, Maroc", montant: 350 },
  { id: 18, nomComplet: "Salma Hachimi", sexe: "F", cin: "CB554433", immatriculation: "102938475", dateNaissance: "18081994", adresse: "Tétouan, Maroc", montant: 200 },
  { id: 19, nomComplet: "Hamza El Ouardi", sexe: "M", cin: "WA221100", immatriculation: "564738291", dateNaissance: "07062001", adresse: "Kénitra, Maroc", montant: 150 },
  { id: 20, nomComplet: "Zineb Benali", sexe: "F", cin: "PA334455", immatriculation: "192837465", dateNaissance: "13011987", adresse: "Casablanca, Maroc", montant: 500 }
];
