// Common medications for the "Traitement" quick-pick, with a typical posologie/durée so picking
// one can fill the whole row in one tap. This is a starting list for everyday general-practice
// consultations, not a drug database — the doctor can always type anything else freely.
// `categorie` only drives the small tag shown next to a match; it carries no clinical meaning.
export const MEDICATIONS = [
  { nom: 'Paracétamol 1g', categorie: 'Antalgique', posologie: '1 cp x3/j', duree: '5 jours' },
  { nom: 'Ibuprofène 400mg', categorie: 'AINS', posologie: '1 cp x3/j', duree: '5 jours' },
  { nom: 'Amoxicilline 1g', categorie: 'Antibiotique', posologie: '1 cp x2/j', duree: '7 jours' },
  { nom: 'Amoxicilline/Ac. clavulanique 1g', categorie: 'Antibiotique', posologie: '1 cp x2/j', duree: '7 jours' },
  { nom: 'Azithromycine 250mg', categorie: 'Antibiotique', posologie: '2 cp J1 puis 1 cp/j', duree: '3 jours' },
  { nom: 'Ciprofloxacine 500mg', categorie: 'Antibiotique', posologie: '1 cp x2/j', duree: '7 jours' },
  { nom: 'Oméprazole 20mg', categorie: 'IPP', posologie: '1 gél/j le matin à jeun', duree: '14 jours' },
  { nom: 'Dompéridone 10mg', categorie: 'Antiémétique', posologie: '1 cp x3/j avant les repas', duree: '5 jours' },
  { nom: 'Métopimazine', categorie: 'Antiémétique', posologie: '1 cp x3/j', duree: '5 jours' },
  { nom: 'Loratadine 10mg', categorie: 'Antihistaminique', posologie: '1 cp/j', duree: '10 jours' },
  { nom: 'Cétirizine 10mg', categorie: 'Antihistaminique', posologie: '1 cp/j le soir', duree: '10 jours' },
  { nom: 'Prednisone 20mg', categorie: 'Corticoïde', posologie: '1 cp/j le matin', duree: '5 jours' },
  { nom: 'Salbutamol spray', categorie: 'Bronchodilatateur', posologie: '2 bouffées x3/j si besoin', duree: 'Selon besoin' },
  { nom: 'Diclofénac 50mg', categorie: 'AINS', posologie: '1 cp x2/j au repas', duree: '5 jours' },
  { nom: 'Tramadol 50mg', categorie: 'Antalgique', posologie: '1 gél x3/j si douleur', duree: '5 jours' },
  { nom: 'Paracétamol/Codéine', categorie: 'Antalgique', posologie: '1-2 cp x3/j si douleur', duree: '5 jours' },
  { nom: 'Spasfon', categorie: 'Antispasmodique', posologie: '2 cp x3/j', duree: '5 jours' },
  { nom: 'Smecta', categorie: 'Antidiarrhéique', posologie: '1 sachet x3/j', duree: '3 jours' },
  { nom: 'Lopéramide 2mg', categorie: 'Antidiarrhéique', posologie: '2 gél puis 1 après chaque selle', duree: '2 jours' },
  { nom: 'Amoxicilline (suspension pédiatrique)', categorie: 'Antibiotique', posologie: 'Selon poids, 3 prises/j', duree: '7 jours' },
  { nom: 'Doliprane sirop (enfant)', categorie: 'Antalgique', posologie: 'Selon poids, x4/j max', duree: '5 jours' },
  { nom: 'Metformine 1000mg', categorie: 'Antidiabétique', posologie: '1 cp x2/j aux repas', duree: 'Traitement continu' },
  { nom: 'Amlodipine 5mg', categorie: 'Antihypertenseur', posologie: '1 cp/j', duree: 'Traitement continu' },
  { nom: 'Losartan 50mg', categorie: 'Antihypertenseur', posologie: '1 cp/j', duree: 'Traitement continu' },
  { nom: 'Atorvastatine 20mg', categorie: 'Hypolipémiant', posologie: '1 cp/j le soir', duree: 'Traitement continu' },
  { nom: 'Vitamine D3 (ampoule)', categorie: 'Vitamine', posologie: '1 ampoule', duree: 'Dose unique' },
  { nom: 'Fer + acide folique', categorie: 'Supplément', posologie: '1 cp/j', duree: '1 mois' },
  { nom: 'Sérum physiologique', categorie: 'Soin local', posologie: 'Lavage nasal x2-3/j', duree: '7 jours' },
  { nom: 'Bétadine solution', categorie: 'Antiseptique', posologie: 'Application locale x2/j', duree: '5 jours' },
  { nom: 'Crème hydratante', categorie: 'Dermatologie', posologie: 'Application x2/j', duree: '10 jours' },
]

// Fallback quick-picks when the medication is free-typed (not in the list above), so the doctor
// can still pick instead of typing the posologie/durée by hand.
export const POSOLOGIE_PRESETS = [
  '1 cp x1/j', '1 cp x2/j', '1 cp x3/j', '1 cp matin et soir', '1 sachet x2/j', '2 bouffées x3/j si besoin', '1 application x2/j',
]
export const DUREE_PRESETS = [
  '3 jours', '5 jours', '7 jours', '10 jours', '14 jours', '1 mois', 'Traitement continu', 'Selon besoin',
]
