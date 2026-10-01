// Curated clinical examination suggestions (Biology & Imaging / Radiology, FR)
// Used for intelligent search-as-you-type in the consultation workspace.

export const CLINICAL_EXAMS = [
  // --- Biologie ---
  {
    label: 'NFS / Hémogramme complet',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['nfs', 'hemogramme', 'globules', 'plaquettes', 'anemie', 'leucocytes', 'hemoglobine'],
  },
  {
    label: 'CRP (Protéine C-Réactive)',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['crp', 'inflammation', 'syndrome inflammatoire', 'infection', 'fievre'],
  },
  {
    label: 'Bilan biologique : NFS, CRP',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['nfs', 'crp', 'bilan infectieux', 'inflammation'],
  },
  {
    label: 'Glycémie à jeun & HbA1c',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['glycemie', 'sucre', 'diabete', 'hba1c', 'hemoglobine glyquee'],
  },
  {
    label: 'Bilan lipidique (Cholestérol total, HDL, LDL, Triglycérides)',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['bilan lipidique', 'cholesterol', 'triglycerides', 'ldl', 'hdl', 'lipides'],
  },
  {
    label: 'Bilan rénal : Créatinine, DFG, Urée',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['creatinine', 'rein', 'clairance', 'dfg', 'uree', 'insuffisance renale'],
  },
  {
    label: 'Bilan hépatique (ASAT, ALAT, GGT, PAL, Bilirubine)',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['foie', 'transaminases', 'asat', 'alat', 'ggt', 'bilirubine', 'hepatite'],
  },
  {
    label: 'Bilan thyroïdien : TSH',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['tsh', 'thyroide', 'hypothyroidie', 'hyperthyroidie', 't3', 't4'],
  },
  {
    label: 'Ionogramme sanguin (Na, K, Cl)',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['ionogramme', 'potassium', 'sodium', 'chlore', 'deshydratation', 'electrolytes'],
  },
  {
    label: 'Bilan martial : Ferritine & Fer sérique',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['fer', 'ferritine', 'martial', 'anemie', 'carence martiale'],
  },
  {
    label: 'ECBU (Examen cytobactériologique des urines)',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['ecbu', 'urine', 'infection urinaire', 'cystite', 'bacterie', 'leucocyturie'],
  },
  {
    label: 'Bilan de coagulation : TP, TCA, INR',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['coagulation', 'inr', 'tp', 'tca', 'anticoagulant', 'thrombose', 'saignement'],
  },
  {
    label: 'Troponine & D-Dimères',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['troponine', 'dimeres', 'd-dimeres', 'infarctus', 'embolie', 'phlebite'],
  },
  {
    label: 'Sérologies : VIH, Hépatites B/C, Syphilis',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['serologie', 'vih', 'hepatite', 'syphilis', 'mst', 'ist'],
  },
  {
    label: 'Vitamine D (25-OH-vitamine D)',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['vitamine d', 'carence', 'fatigue', 'os'],
  },
  {
    label: 'Prélèvement de gorge (TDR angine)',
    category: 'Biologie',
    categoryKey: 'biologie',
    tone: 'blue',
    keywords: ['tdr', 'angine', 'streptocoque', 'gorge', 'prelevement'],
  },

  // --- Imagerie / Radiologie ---
  {
    label: 'Radiographie thoracique (face)',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['radio', 'thorax', 'radiographie thoracique', 'poumons', 'toux', 'pneumonie'],
  },
  {
    label: 'Radiographie du rachis lombaire',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['radio', 'dos', 'rachis', 'lombaire', 'lombalgie', 'sciatique'],
  },
  {
    label: 'Radiographie du genou / cheville',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['radio', 'genou', 'cheville', 'entorse', 'traumatisme', 'fracture'],
  },
  {
    label: 'Échographie abdominale & pelvienne',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['echo', 'echographie', 'abdominale', 'pelvienne', 'foie', 'reins', 'vesicule'],
  },
  {
    label: 'Échographie des parties molles / musculaire',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['echo', 'parties molles', 'muscle', 'tendon', 'kyste'],
  },
  {
    label: 'Mammographie bilatérale & échographie mammaire',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['mammographie', 'sein', 'depistage', 'mammaire', 'echographie'],
  },
  {
    label: 'Écho-Doppler veineux des membres inférieurs',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['doppler', 'phlebite', 'thrombose', 'veines', 'jambes lourdes', 'varices'],
  },
  {
    label: 'Scanner thoraco-abdo-pelvien (TDM)',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['scanner', 'tdm', 'ct', 'tomodensitometrie', 'thoraco', 'abdominal'],
  },
  {
    label: 'IRM cérébrale / médullaire',
    category: 'Radiologie',
    categoryKey: 'radiologie',
    tone: 'purple',
    keywords: ['irm', 'cerebrale', 'cerveau', 'rachis', 'medullaire', 'neurologie'],
  },

  // --- Cardiologie & Explorations fonctionnelles ---
  {
    label: 'ECG de repos 12 dérivations',
    category: 'Cardiologie',
    categoryKey: 'cardiologie',
    tone: 'emerald',
    keywords: ['ecg', 'electrocardiogramme', 'coeur', 'rythme', 'palpitations'],
  },
  {
    label: 'Échocardiographie doppler (ETT)',
    category: 'Cardiologie',
    categoryKey: 'cardiologie',
    tone: 'emerald',
    keywords: ['echocardiographie', 'ett', 'coeur', 'valves', 'insuffisance cardiaque'],
  },
  {
    label: 'Holter tensionnel (MAPA 24h)',
    category: 'Cardiologie',
    categoryKey: 'cardiologie',
    tone: 'emerald',
    keywords: ['holter', 'mapa', 'tension', 'hta', 'pression arterielle'],
  },
  {
    label: 'Holter ECG 24h',
    category: 'Cardiologie',
    categoryKey: 'cardiologie',
    tone: 'emerald',
    keywords: ['holter ecg', 'rythme', 'troubles du rythme', 'arythmie', 'palpitations'],
  },
]

const normalize = (str) =>
  String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

/**
 * Searches clinical exams by query string with intelligent scoring.
 * Returns empty array if query is empty (keeps UI pristine and clean).
 */
export function searchExams(query, limit = 8) {
  const q = normalize(query)
  if (!q) return []

  const scored = []

  for (const item of CLINICAL_EXAMS) {
    const labelNorm = normalize(item.label)
    let score = -1
    let matchedReason = null

    // Exact label prefix match
    if (labelNorm.startsWith(q)) {
      score = 100 - labelNorm.length
    }
    // Substring match in label
    else if (labelNorm.includes(q)) {
      score = 70 - labelNorm.indexOf(q)
    }
    // Keywords / synonyms match
    else if (item.keywords) {
      for (const kw of item.keywords) {
        const kwNorm = normalize(kw)
        if (kwNorm.startsWith(q)) {
          score = Math.max(score, 60)
          matchedReason = kw
          break
        } else if (kwNorm.includes(q)) {
          score = Math.max(score, 40)
          matchedReason = kw
          break
        }
      }
    }

    if (score > 0) {
      scored.push({
        ...item,
        score,
        matchedReason: matchedReason && !labelNorm.includes(q) ? `Associé à « ${matchedReason} »` : null,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'fr'))
  return scored.slice(0, limit)
}
