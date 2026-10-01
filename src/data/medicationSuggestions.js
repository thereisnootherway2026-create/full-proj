// Common medications for the "Traitement" quick-pick and prescription lines editor.
// Includes brand names and molecules (DCI), standard dosage, posologie, and durée.
// Typeahead searches across both brand name and molecule.
export const MEDICATIONS = [
  { nom: 'Doliprane', molecule: 'Paracétamol', dosage: '1000 mg', categorie: 'Antalgique', posologie: '1 cp x3/j si douleur', duree: '5 jours' },
  { nom: 'Paracétamol', molecule: 'Paracétamol', dosage: '1000 mg', categorie: 'Antalgique', posologie: '1 cp x3/j', duree: '5 jours' },
  { nom: 'Efferalgan', molecule: 'Paracétamol', dosage: '1000 mg', categorie: 'Antalgique', posologie: '1 cp effervescent x3/j', duree: '5 jours' },
  { nom: 'Dafalgan', molecule: 'Paracétamol', dosage: '1000 mg', categorie: 'Antalgique', posologie: '1 cp x3/j', duree: '5 jours' },
  { nom: 'Advil', molecule: 'Ibuprofène', dosage: '400 mg', categorie: 'AINS', posologie: '1 cp x3/j au milieu des repas', duree: '5 jours' },
  { nom: 'Ibuprofène', molecule: 'Ibuprofène', dosage: '400 mg', categorie: 'AINS', posologie: '1 cp x3/j au repas', duree: '5 jours' },
  { nom: 'Augmentin', molecule: 'Amoxicilline + Acide clavulanique', dosage: '1 g / 125 mg', categorie: 'Antibiotique', posologie: '1 sachet x2/j', duree: '7 jours' },
  { nom: 'Amoxicilline', molecule: 'Amoxicilline', dosage: '1000 mg', categorie: 'Antibiotique', posologie: '1 cp x2/j', duree: '7 jours' },
  { nom: 'Clamoxyl', molecule: 'Amoxicilline', dosage: '1000 mg', categorie: 'Antibiotique', posologie: '1 gél x2/j', duree: '7 jours' },
  { nom: 'Zithromax', molecule: 'Azithromycine', dosage: '250 mg', categorie: 'Antibiotique', posologie: '2 cp J1 puis 1 cp/j', duree: '3 jours' },
  { nom: 'Azithromycine', molecule: 'Azithromycine', dosage: '250 mg', categorie: 'Antibiotique', posologie: '2 cp J1 puis 1 cp/j', duree: '3 jours' },
  { nom: 'Ciflox', molecule: 'Ciprofloxacine', dosage: '500 mg', categorie: 'Antibiotique', posologie: '1 cp x2/j', duree: '7 jours' },
  { nom: 'Ciprofloxacine', molecule: 'Ciprofloxacine', dosage: '500 mg', categorie: 'Antibiotique', posologie: '1 cp x2/j', duree: '7 jours' },
  { nom: 'Mopral', molecule: 'Oméprazole', dosage: '20 mg', categorie: 'IPP', posologie: '1 gél/j le matin à jeun', duree: '14 jours' },
  { nom: 'Oméprazole', molecule: 'Oméprazole', dosage: '20 mg', categorie: 'IPP', posologie: '1 gél/j le matin à jeun', duree: '14 jours' },
  { nom: 'Inexium', molecule: 'Ésoméprazole', dosage: '40 mg', categorie: 'IPP', posologie: '1 cp/j le matin', duree: '14 jours' },
  { nom: 'Motilium', molecule: 'Dompéridone', dosage: '10 mg', categorie: 'Antiémétique', posologie: '1 cp x3/j avant repas', duree: '5 jours' },
  { nom: 'Vogalène', molecule: 'Métopimazine', dosage: '15 mg', categorie: 'Antiémétique', posologie: '1 gél x3/j', duree: '5 jours' },
  { nom: 'Clarityne', molecule: 'Loratadine', dosage: '10 mg', categorie: 'Antihistaminique', posologie: '1 cp/j', duree: '10 jours' },
  { nom: 'Zyrtec', molecule: 'Cétirizine', dosage: '10 mg', categorie: 'Antihistaminique', posologie: '1 cp/j le soir', duree: '10 jours' },
  { nom: 'Solupred', molecule: 'Prednisolone', dosage: '20 mg', categorie: 'Corticoïde', posologie: '1 cp/j le matin', duree: '5 jours' },
  { nom: 'Prednisone', molecule: 'Prednisone', dosage: '20 mg', categorie: 'Corticoïde', posologie: '1 cp/j le matin', duree: '5 jours' },
  { nom: 'Ventoline spray', molecule: 'Salbutamol', dosage: '100 µg/dose', categorie: 'Bronchodilatateur', posologie: '2 bouffées x3/j si besoin', duree: 'Selon besoin' },
  { nom: 'Voltarène', molecule: 'Diclofénac', dosage: '50 mg', categorie: 'AINS', posologie: '1 cp x2/j au repas', duree: '5 jours' },
  { nom: 'Topalgic', molecule: 'Tramadol', dosage: '50 mg', categorie: 'Antalgique', posologie: '1 gél x3/j si douleur', duree: '5 jours' },
  { nom: 'Ixprim', molecule: 'Tramadol + Paracétamol', dosage: '37.5 mg / 325 mg', categorie: 'Antalgique', posologie: '1-2 cp x3/j si douleur', duree: '5 jours' },
  { nom: 'Spasfon', molecule: 'Phloroglucinol', dosage: '80 mg', categorie: 'Antispasmodique', posologie: '2 cp x3/j', duree: '5 jours' },
  { nom: 'Smecta', molecule: 'Diosmectite', dosage: '3 g', categorie: 'Antidiarrhéique', posologie: '1 sachet x3/j', duree: '3 jours' },
  { nom: 'Imodium', molecule: 'Lopéramide', dosage: '2 mg', categorie: 'Antidiarrhéique', posologie: '2 gél puis 1 après selle liquide', duree: '2 jours' },
  { nom: 'Amoxicilline pédiatrique', molecule: 'Amoxicilline', dosage: '250 mg / 5 mL', categorie: 'Antibiotique', posologie: 'Selon poids, 3 prises/j', duree: '7 jours' },
  { nom: 'Doliprane sirop pédiatrique', molecule: 'Paracétamol', dosage: '2.4% (pipette)', categorie: 'Antalgique', posologie: 'Selon poids, x4/j max', duree: '5 jours' },
  { nom: 'Glucophage', molecule: 'Metformine', dosage: '1000 mg', categorie: 'Antidiabétique', posologie: '1 cp x2/j aux repas', duree: 'Traitement continu' },
  { nom: 'Amlor', molecule: 'Amlodipine', dosage: '5 mg', categorie: 'Antihypertenseur', posologie: '1 cp/j', duree: 'Traitement continu' },
  { nom: 'Cozaar', molecule: 'Losartan', dosage: '50 mg', categorie: 'Antihypertenseur', posologie: '1 cp/j', duree: 'Traitement continu' },
  { nom: 'Tahor', molecule: 'Atorvastatine', dosage: '20 mg', categorie: 'Hypolipémiant', posologie: '1 cp/j le soir', duree: 'Traitement continu' },
  { nom: 'Kardegic', molecule: 'Acétylsalicylate de lysine', dosage: '75 mg', categorie: 'Antiagrégant', posologie: '1 sachet/j au repas', duree: 'Traitement continu' },
  { nom: 'Uvedose', molecule: 'Cholécalciférol (Vitamine D3)', dosage: '100 000 UI', categorie: 'Vitamine', posologie: '1 ampoule buvable', duree: 'Dose unique' },
  { nom: 'Tardyferon B9', molecule: 'Fer + Acide folique', dosage: '50 mg', categorie: 'Supplément', posologie: '1 cp/j', duree: '1 mois' },
  { nom: 'Physiomer', molecule: 'Sérum physiologique', dosage: 'Spray', categorie: 'Soin local', posologie: 'Lavage nasal x2-3/j', duree: '7 jours' },
  { nom: 'Bétadine dermique', molecule: 'Povidone iodée', dosage: '10%', categorie: 'Antiseptique', posologie: 'Application locale x2/j', duree: '5 jours' },
  { nom: 'Biafine', molecule: 'Trolamine', dosage: 'Émulsion', categorie: 'Dermatologie', posologie: 'Application x2/j', duree: '10 jours' },
]

// Fallback quick-picks when the medication is free-typed (not in the list above), so the doctor
// can still pick instead of typing the posologie/durée by hand.
export const POSOLOGIE_PRESETS = [
  '1 cp x1/j', '1 cp x2/j', '1 cp x3/j', '1 cp matin et soir', '1 sachet x2/j', '2 bouffées x3/j si besoin', '1 application x2/j',
]
export const DUREE_PRESETS = [
  '3 jours', '5 jours', '7 jours', '10 jours', '14 jours', '1 mois', 'Traitement continu', 'Selon besoin',
]
