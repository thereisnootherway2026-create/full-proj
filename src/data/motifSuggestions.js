// Comprehensive, intelligent clinical motif suggestions for General Practice (Médecine Générale)
// Each item includes synonyms, common terms, and keywords so doctors can type freely.

export const CLINICAL_MOTIFS = [
  // ── Suivi & Prévention (Fréquents) ──
  {
    label: "Renouvellement d'ordonnance",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 10,
    keywords: ["ordonnance", "traitement", "medicament", "renouveler", "reconduire", "medoc", "reprise de traitement", "renouvellement"],
  },
  {
    label: "Suivi de maladie chronique",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 9,
    keywords: ["diabete", "diabétique", "hta", "hypertension", "tension", "cholesterol", "dyslipidemie", "asthme", "bpco", "insuffisance cardiaque", "thyroide", "hypothyroidie"],
  },
  {
    label: "Résultats d'examens",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 8,
    keywords: ["bilan", "prise de sang", "analyse", "labo", "biologie", "scanner", "radio", "irm", "echographie", "echo", "frottis", "biopsie"],
  },
  {
    label: "Certificat médical / Sport",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 8,
    keywords: ["sport", "certificat", "aptitude", "club", "licence", "marathon", "école", "ecole", "salle de sport", "non contre indication"],
  },
  {
    label: "Bilan de santé",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 7,
    keywords: ["checkup", "check up", "check-up", "depistage", "annuel", "examen systematique", "visite medicale"],
  },
  {
    label: "Arrêt de travail",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 7,
    keywords: ["arret", "arrêt", "travail", "maladie", "prolongation", "reprise", "convalescence", "certificat d'arret"],
  },
  {
    label: "Vaccination",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 7,
    keywords: ["vaccin", "rappel", "grippe", "tetanos", "hepatite", "pneumocoque", "bebe", "enfant", "voyage", "fievre jaune"],
  },
  {
    label: "Contrôle après traitement",
    category: "Suivi & Prévention",
    tone: "blue",
    priority: 6,
    keywords: ["controle", "post traitement", "guerison", "revoir", "amelioration", "suivi de consultation"],
  },

  // ── Aigu & Urgences / ORL & Respiratoire ──
  {
    label: "Syndrome grippal / Fièvre",
    category: "Aigu & Urgences",
    tone: "amber",
    priority: 10,
    keywords: ["fievre", "fièvre", "grippe", "frissons", "courbatures", "chaud", "froid", "etat grippal", "febrile", "syndrome grippal", "covid"],
  },
  {
    label: "Infection respiratoire / Toux",
    category: "Aigu & Urgences",
    tone: "amber",
    priority: 10,
    keywords: ["toux", "toux seche", "toux grasse", "bronchite", "rhume", "nez qui coule", "nez bouche", "rhinopharyngite", "encombrement", "crachats", "expectorations"],
  },
  {
    label: "Mal de gorge / Pharyngite / Angine",
    category: "Aigu & Urgences",
    tone: "amber",
    priority: 9,
    keywords: ["gorge", "angine", "pharyngite", "amygdale", "deglutition", "mal a avaler", "laryngite", "voix cassee", "enrouement"],
  },
  {
    label: "Douleur d'oreille / Otite",
    category: "Aigu & Urgences",
    tone: "amber",
    priority: 8,
    keywords: ["oreille", "otite", "tympan", "audition", "bouchon", "cerumen", "ecoulement oreille", "bourdonnements", "acouphenes"],
  },
  {
    label: "Sinusite / Douleur faciale",
    category: "Aigu & Urgences",
    tone: "amber",
    priority: 7,
    keywords: ["sinus", "sinusite", "front", "nez", "pommettes", "pression visage", "mouchage purulent"],
  },
  {
    label: "Essoufflement / Dyspnée",
    category: "Aigu & Urgences",
    tone: "rose",
    priority: 8,
    keywords: ["essoufflement", "dyspnee", "dyspnée", "respiration", "etouffement", "sifflement", "crise d'asthme", "mal a respirer"],
  },

  // ── Digestif ──
  {
    label: "Douleur abdominale / Gastro",
    category: "Digestif",
    tone: "amber",
    priority: 9,
    keywords: ["ventre", "mal de ventre", "gastro", "gastro-enterite", "estomac", "douleur estomac", "crampes", "ballonnements", "spasmes"],
  },
  {
    label: "Nausées & Vomissements",
    category: "Digestif",
    tone: "amber",
    priority: 8,
    keywords: ["nausees", "vomissements", "vomir", "haut le coeur", "ecoeurement", "intoxication alimentaire"],
  },
  {
    label: "Diarrhée aiguë",
    category: "Digestif",
    tone: "amber",
    priority: 8,
    keywords: ["diarrhee", "selles liquides", "tourista", "gastro", "transit"],
  },
  {
    label: "Constipation",
    category: "Digestif",
    tone: "slate",
    priority: 6,
    keywords: ["constipation", "transit ralenti", "occlusion", "selles dures"],
  },
  {
    label: "Reflux gastro-œsophagien (RGO)",
    category: "Digestif",
    tone: "slate",
    priority: 7,
    keywords: ["reflux", "brulure estomac", "pyrosis", "acidite", "regurgitation", "rgo"],
  },

  // ── Ostéo-articulaire & Rachis ──
  {
    label: "Lombalgie / Sciatique",
    category: "Ostéo-articulaire",
    tone: "purple",
    priority: 10,
    keywords: ["dos", "mal de dos", "lombaire", "lumbago", "sciatique", "cruralgie", "tour de rein", "bloque", "rachis", "hernie"],
  },
  {
    label: "Cervicalgie / Torticolis",
    category: "Ostéo-articulaire",
    tone: "purple",
    priority: 8,
    keywords: ["cou", "cervicale", "torticolis", "nuque", "raideur nuque", "mal au cou"],
  },
  {
    label: "Traumatisme / Entorse",
    category: "Ostéo-articulaire",
    tone: "purple",
    priority: 9,
    keywords: ["chute", "entorse", "cheville", "poignet", "genou", "foulure", "trauma", "coup", "gonflement", "fracture"],
  },
  {
    label: "Douleur articulaire (Genou, Épaule, Hanche)",
    category: "Ostéo-articulaire",
    tone: "purple",
    priority: 8,
    keywords: ["articulation", "arthrose", "arthrite", "genou", "epaule", "hanche", "tendinite", "tendon", "coiffe"],
  },

  // ── Neurologique & Tête ──
  {
    label: "Céphalées / Migraine",
    category: "Neurologique",
    tone: "indigo",
    priority: 9,
    keywords: ["maux de tete", "mal de tete", "tete", "migraine", "cephalee", "crane", "tempes", "pulsation"],
  },
  {
    label: "Vertiges / Malaise",
    category: "Neurologique",
    tone: "indigo",
    priority: 8,
    keywords: ["vertige", "tournis", "malaise", "syncope", "lipothymie", "perte de connaissance", "etourdissement", "instabilite"],
  },
  {
    label: "Fourmillements / Engourdissements",
    category: "Neurologique",
    tone: "indigo",
    priority: 6,
    keywords: ["fourmillements", "paresthesies", "engourdissement", "canal carpien", "sensibilite"],
  },

  // ── Urinaire & Gynécologique ──
  {
    label: "Brûlures urinaires / Cystite",
    category: "Uro-génital",
    tone: "rose",
    priority: 9,
    keywords: ["urine", "cystite", "infection urinaire", "brulure pipi", "miction", "envie constante", "sang urine", "pollakiurie"],
  },
  {
    label: "Lithiase / Colique néphrétique",
    category: "Uro-génital",
    tone: "rose",
    priority: 7,
    keywords: ["calcul", "colique nephretique", "rein", "douleur rein", "lithiase"],
  },
  {
    label: "Gynécologie / Contraception / Retard de règles",
    category: "Uro-génital",
    tone: "rose",
    priority: 7,
    keywords: ["regles", "grossesse", "contraception", "pilule", "douleurs pelviennes", "retard", "pertes"],
  },

  // ── Peau / Dermatologie ──
  {
    label: "Éruption cutanée / Prurit",
    category: "Dermatologie",
    tone: "emerald",
    priority: 9,
    keywords: ["peau", "boutons", "demangeaisons", "prurit", "rougeurs", "urticaire", "allergie", "eczema", "plaques"],
  },
  {
    label: "Plaie / Brûlure / Coupure",
    category: "Dermatologie",
    tone: "emerald",
    priority: 7,
    keywords: ["plaie", "coupure", "brulure", "suture", "points", "pansement", "saignement"],
  },
  {
    label: "Infection cutanée (Abcès, Mycose, Zona)",
    category: "Dermatologie",
    tone: "emerald",
    priority: 7,
    keywords: ["abces", "furoncle", "mycose", "champignon", "zona", "herpes", "verrue", "ongle incarne", "panaris"],
  },

  // ── Cardio-vasculaire ──
  {
    label: "Contrôle tension artérielle",
    category: "Cardio-vasculaire",
    tone: "rose",
    priority: 9,
    keywords: ["tension", "hta", "hypertension", "pression", "bras", "chiffres tensionnels"],
  },
  {
    label: "Douleur thoracique à préciser",
    category: "Cardio-vasculaire",
    tone: "rose",
    priority: 8,
    keywords: ["poitrine", "thorax", "coeur", "douleur thorax", "oppression", "point de cote", "infarctus"],
  },
  {
    label: "Palpitations / Tachycardie",
    category: "Cardio-vasculaire",
    tone: "rose",
    priority: 7,
    keywords: ["palpitations", "coeur qui bat vite", "tachycardie", "rate", "arythmie"],
  },
  {
    label: "Jambes lourdes / Œdèmes des membres",
    category: "Cardio-vasculaire",
    tone: "rose",
    priority: 6,
    keywords: ["jambes", "jambes lourdes", "oedeme", "gonflement jambes", "varices", "insuffisance veineuse"],
  },

  // ── Général & Psy ──
  {
    label: "Fatigue / Asthénie persistante",
    category: "Général",
    tone: "slate",
    priority: 8,
    keywords: ["fatigue", "epuisement", "asthenie", "manque d'energie", "burnout", "burn out", "faiblesse"],
  },
  {
    label: "Troubles du sommeil / Insomnie",
    category: "Général",
    tone: "slate",
    priority: 7,
    keywords: ["sommeil", "insomnie", "dort mal", "reveils nocturnes", "somnifere"],
  },
  {
    label: "Anxiété / Stress / Syndrome dépressif",
    category: "Général",
    tone: "slate",
    priority: 8,
    keywords: ["stress", "anxiete", "angoisse", "panique", "depression", "moral", "tristesse", "pleurs"],
  },
  {
    label: "Perte de poids inexpliquée",
    category: "Général",
    tone: "slate",
    priority: 6,
    keywords: ["amaigrissement", "poids", "perte appetit", "maigreur"],
  },
]

const normalizeText = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Searches the clinical motifs with intelligent fuzzy and synonym scoring.
 * Returns empty array if query is empty (keeps UI completely clean).
 */
export function searchMotifs(query, limit = 8) {
  const normQuery = normalizeText(query)
  if (!normQuery) return []

  const queryWords = normQuery.split(' ').filter(Boolean)

  const scored = []

  for (const item of CLINICAL_MOTIFS) {
    const normLabel = normalizeText(item.label)
    const normKeywords = (item.keywords || []).map(normalizeText)

    let score = 0
    let matchedReason = null

    // 1. Exact match on full label
    if (normLabel === normQuery) {
      score = 1000
    }
    // 2. Label starts with full query
    else if (normLabel.startsWith(normQuery)) {
      score = 500 + (item.priority || 0) * 10
    }
    // 3. Word in label starts with query
    else if (normLabel.split(' ').some((w) => w.startsWith(normQuery))) {
      score = 400 + (item.priority || 0) * 10
    }
    // 4. Label contains query
    else if (normLabel.includes(normQuery)) {
      score = 300 + (item.priority || 0) * 10
    }
    // 5. Query words all present in label
    else if (queryWords.length > 1 && queryWords.every((qw) => normLabel.includes(qw))) {
      score = 350 + (item.priority || 0) * 10
    }
    // 6. Keywords match
    else {
      // Direct keyword match
      for (const kw of normKeywords) {
        if (kw === normQuery) {
          score = 250 + (item.priority || 0) * 5
          matchedReason = `Synonyme exact: "${kw}"`
          break
        } else if (kw.startsWith(normQuery)) {
          score = 200 + (item.priority || 0) * 5
          matchedReason = `Correspondance: "${kw}"`
          break
        } else if (kw.includes(normQuery)) {
          score = 150 + (item.priority || 0) * 5
          matchedReason = `Correspondance: "${kw}"`
          break
        }
      }

      // If still not matched, check if all query words match across label + keywords
      if (score === 0 && queryWords.length > 1) {
        const fullCorpus = `${normLabel} ${normKeywords.join(' ')}`
        if (queryWords.every((qw) => fullCorpus.includes(qw))) {
          score = 180
          matchedReason = "Correspondance clinique"
        }
      }
    }

    if (score > 0) {
      scored.push({
        ...item,
        score,
        matchedReason,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}
