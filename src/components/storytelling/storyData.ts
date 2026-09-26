export type MacroMedicaState =
  | 'SCHEDULED'
  | 'ARRIVED'
  | 'WAITING'
  | 'IN_CONSULTATION'
  | 'TO_BE_PAID'
  | 'DONE'

export interface StateDefinition {
  state: MacroMedicaState
  label: string
  color: string
  description: string
}

export const STATE_DEFINITIONS: Record<MacroMedicaState, StateDefinition> = {
  SCHEDULED: {
    state: 'SCHEDULED',
    label: 'Planifié',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'Le rendez-vous est positionné dans l’agenda.',
  },
  ARRIVED: {
    state: 'ARRIVED',
    label: 'Arrivé',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Le patient s’est présenté au secrétariat.',
  },
  WAITING: {
    state: 'WAITING',
    label: 'En attente',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Le patient patiente en salle d’attente.',
  },
  IN_CONSULTATION: {
    state: 'IN_CONSULTATION',
    label: 'En consultation',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-300',
    description: 'Le médecin a appelé le patient en examen.',
  },
  TO_BE_PAID: {
    state: 'TO_BE_PAID',
    label: 'À encaisser',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    description: 'La consultation est terminée, le règlement attend à l’accueil.',
  },
  DONE: {
    state: 'DONE',
    label: 'Terminé',
    color: 'bg-slate-100 text-slate-500 border-slate-200',
    description: 'La quittance est remise, le dossier est clos.',
  },
}

export interface HeroUIData {
  moduleName: string
  statusBadge: string
  contextTag: string
  primaryMetric: { value: string; label: string }
  secondaryMetric: { value: string; label: string }
  rows: Array<{
    col1: string
    col2: string
    col3: string
    col4: string
    state: MacroMedicaState
  }>
}

export interface StoryStage {
  step: string
  state: MacroMedicaState
  title: string
  description: string
  uiStateNote: string
  actor: string
}

export interface ShowcasePoint {
  id: string
  stepNumber: string
  label: string
  title: string
  description: string
  state: MacroMedicaState
  targetArea: string
  roleBadge: string
}

export interface ScenarioTimestamp {
  time: string
  title: string
  description: string
  actionActor: string
  stateChange: string
  macroState: MacroMedicaState
}

export interface BeforeAfterPoint {
  beforeTitle: string
  beforeText: string
  afterTitle: string
  afterText: string
}

export interface OneScreenAnnotation {
  id: string
  question: string
  answer: string
  targetArea: 'waiting' | 'consulting' | 'payment' | 'action'
  actionHint: string
}

export interface FeatureStoryData {
  slug: string
  canonicalSlug: string
  categoryBadge: string
  title: string
  subtitle: string
  explanation: string
  narrativeLead: string
  nextSlug: string
  nextLabel: string
  heroUI: HeroUIData
  storyStages: StoryStage[]
  showcasePoints: ShowcasePoint[]
  scenario: ScenarioTimestamp[]
  beforeAfter: BeforeAfterPoint[]
  oneScreenAnnotations: OneScreenAnnotation[]
  oneScreenTitle: string
  oneScreenSubtitle: string
}

export const FEATURE_STORIES: Record<string, FeatureStoryData> = {
  // ── 1. SALLE D'ATTENTE ──────────────────────────────────────────────────────
  'salle-attente': {
    slug: 'salle-attente',
    canonicalSlug: 'salle-attente',
    categoryBadge: "FLUX CABINET • SALLE D'ATTENTE",
    title: "De l'arrivée à l'encaissement.",
    subtitle: "Chaque patient avance dans un flux clair, du secrétariat jusqu'à la fin de la consultation.",
    explanation:
      "Une file active partagée entre l'accueil et le bureau médical. Le médecin visualise qui attend sans ouvrir sa porte, et la secrétaire suit l'avancement exact de la consultation en cours.",
    narrativeLead: 'Arrivée → Attente → Consultation → Encaissement',
    nextSlug: 'gestion-rdv',
    nextLabel: 'Agenda & Rendez-vous',
    heroUI: {
      moduleName: "Salle d'Attente Opérationnelle",
      statusBadge: 'File Active Partagée',
      contextTag: 'Poste Praticien & Accueil',
      primaryMetric: { value: '4 patients', label: 'Dans le circuit actuel' },
      secondaryMetric: { value: '1 actif', label: 'En bureau de consultation' },
      rows: [
        { col1: '09:03', col2: 'Patient Démo 01 (Mme Amina B.)', col3: 'Suivi HTA • En cours', col4: 'Bureau 1 (Dr. Alami)', state: 'IN_CONSULTATION' },
        { col1: '09:12', col2: 'M. Karim T. (#0249)', col3: 'Contrôle traitement', col4: 'Attente 12 min (Pos. 1)', state: 'WAITING' },
        { col1: '09:20', col2: 'Mme Sofia M. (#0250)', col3: 'Bilan biologique à revoir', col4: 'Attente 4 min (Pos. 2)', state: 'WAITING' },
        { col1: '09:25', col2: 'M. Omar B. (#0251)', col3: 'Première consultation', col4: 'Accueil secrétariat', state: 'ARRIVED' },
      ],
    },
    storyStages: [
      {
        step: '01',
        state: 'ARRIVED',
        title: 'Pointage à l’accueil',
        description: 'La secrétaire Nadia enregistre l’arrivée de Patient Démo 01 en un clic dès sa présentation au comptoir.',
        uiStateNote: 'Le patient passe à l’état ARRIVED et l’horodatage de 08:42 est consigné.',
        actor: 'Secrétariat (Nadia)',
      },
      {
        step: '02',
        state: 'WAITING',
        title: 'Entrée en salle d’attente',
        description: 'Le patient s’installe au salon. Sa position (1er dans la file) est visible en temps réel sur le poste du Dr. Alami.',
        uiStateNote: 'Statut WAITING. Le praticien voit qui attend sans avoir à ouvrir sa porte.',
        actor: 'Secrétariat & Patient',
      },
      {
        step: '03',
        state: 'IN_CONSULTATION',
        title: 'Appel en consultation',
        description: 'Le Dr. Alami clique sur « Faire Entrer ». Patient Démo 01 passe en examen actif et le chrono démarre.',
        uiStateNote: 'Statut IN_CONSULTATION. Le poste secrétariat voit la consultation démarrer à 09:03.',
        actor: 'Médecin Praticien (Dr. Alami)',
      },
      {
        step: '04',
        state: 'TO_BE_PAID',
        title: 'Transmission pour encaissement',
        description: 'L’examen s’achève. Les actes saisis (CS 300 MAD + ECG 150 MAD = 450 MAD) sont transmis à l’accueil instantanément.',
        uiStateNote: 'Statut TO_BE_PAID. La secrétaire Nadia voit le montant exact sans coup d’interphone.',
        actor: 'Accueil & Caisse (Nadia)',
      },
    ],
    showcasePoints: [
      {
        id: 'pt-1',
        stepNumber: '01',
        label: 'ARRIVED',
        title: 'Pointage de l’arrivée (08:42)',
        description: 'L’accueil signale la présence physique du patient dès qu’il franchit la porte.',
        state: 'ARRIVED',
        targetArea: 'arrival-zone',
        roleBadge: 'Secrétariat',
      },
      {
        id: 'pt-2',
        stepNumber: '02',
        label: 'WAITING',
        title: 'File d’attente ordonnée (08:44)',
        description: 'Visualisation de l’ordre d’arrivée et du temps d’attente objectif de chaque patient.',
        state: 'WAITING',
        targetArea: 'waiting-zone',
        roleBadge: 'Praticien & Accueil',
      },
      {
        id: 'pt-3',
        stepNumber: '03',
        label: 'IN_CONSULTATION',
        title: 'Consultation active (09:03)',
        description: 'Le praticien examine le patient sélectionné sans être interrompu par des allées et venues.',
        state: 'IN_CONSULTATION',
        targetArea: 'consultation-zone',
        roleBadge: 'Médecin',
      },
      {
        id: 'pt-4',
        stepNumber: '04',
        label: 'TO_BE_PAID',
        title: 'Transmission pour règlement (09:18)',
        description: 'Dès la fin de consultation, le dossier passe à l’accueil avec les actes à percevoir (450 MAD).',
        state: 'TO_BE_PAID',
        targetArea: 'checkout-zone',
        roleBadge: 'Caisse',
      },
    ],
    scenario: [
      {
        time: '08:42',
        title: 'Arrivée de Patient Démo 01 (Mme Amina B. #0248)',
        description: 'La patiente se présente au secrétariat. Nadia valide sa présence d’un simple clic au comptoir.',
        actionActor: 'Secrétariat (Nadia)',
        stateChange: 'Passage immédiat à l’état ARRIVED',
        macroState: 'ARRIVED',
      },
      {
        time: '08:44',
        title: 'Installation en salle d’attente (Position #1)',
        description: 'La patiente patiente en salle. Le Dr. Alami voit sur son cockpit son identité et son temps d’attente.',
        actionActor: 'Système & Patiente',
        stateChange: 'Passage en WAITING (File active)',
        macroState: 'WAITING',
      },
      {
        time: '09:03',
        title: 'Appel en consultation par le Dr. Alami',
        description: 'Le médecin clique sur « Faire Entrer ». La patiente entre en salle d’examen et le chrono démarre.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Passage en IN_CONSULTATION',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '09:18',
        title: 'Fin d’examen et cotation des actes (450 MAD)',
        description: 'Le médecin valide la consultation (CS 300 MAD + ECG 150 MAD = 450 MAD). L’accueil reçoit le dossier.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Transmission instantanée en TO_BE_PAID',
        macroState: 'TO_BE_PAID',
      },
      {
        time: '09:21',
        title: 'Règlement en espèces et quittance',
        description: 'Nadia perçoit 450 MAD, imprime la quittance #MM-2026-0842 et clôture la visite avec reçu officiel.',
        actionActor: 'Secrétariat (Nadia)',
        stateChange: 'Visite soldée et archivée en DONE',
        macroState: 'DONE',
      },
    ],
    beforeAfter: [
      {
        beforeTitle: 'Le médecin ouvre sa porte pour vérifier la salle',
        beforeText: 'Obligé d’interrompre son travail pour jeter un coup d’œil dans le couloir ou téléphoner à l’accueil.',
        afterTitle: 'File active visible en direct',
        afterText: 'Une fenêtre discrète sur le poste médical montre les patients en attente et leur motif.',
      },
      {
        beforeTitle: 'Doutes sur l’ordre de passage',
        beforeText: 'Incertitude sur qui est arrivé en premier, créant des frictions évitables à l’accueil.',
        afterTitle: 'Ordre d’arrivée consigné',
        afterText: 'L’heure d’arrivée enregistrée établit un ordre objectif et partagé entre tous.',
      },
      {
        beforeTitle: 'Incertitude sur la fin de consultation',
        beforeText: 'La secrétaire ne sait pas si le médecin a terminé ou si le patient est prêt à régler.',
        afterTitle: 'Passage automatique en caisse',
        afterText: 'La clôture par le médecin positionne immédiatement le patient dans la file de règlement.',
      },
    ],
    oneScreenTitle: 'Un Seul Écran pour Décider Sans Hésiter',
    oneScreenSubtitle: 'Les 4 questions fondamentales résolues au même endroit, pour le médecin comme pour le secrétariat.',
    oneScreenAnnotations: [
      {
        id: 'q-waiting',
        question: 'Qui attend en ce moment ?',
        answer: 'La liste ordonnée des patients en salle d’attente avec leur heure de présence.',
        targetArea: 'waiting',
        actionHint: 'Surveiller la file active',
      },
      {
        id: 'q-consulting',
        question: 'Qui est en consultation ?',
        answer: 'Le patient actuellement reçu dans le bureau médical avec le praticien.',
        targetArea: 'consulting',
        actionHint: 'Consulter l’examen en cours',
      },
      {
        id: 'q-payment',
        question: 'Qui doit être encaissé ?',
        answer: 'Les patients sortis de consultation dont les actes attendent d’être réglés.',
        targetArea: 'payment',
        actionHint: 'Vérifier les dossiers à solder',
      },
      {
        id: 'q-action',
        question: 'Quelle est la prochaine action ?',
        answer: 'Appeler le patient suivant, valider un acte ou imprimer la quittance.',
        targetArea: 'action',
        actionHint: 'Déclencher l’action en 1 clic',
      },
    ],
  },

  // ── 2. AGENDA ───────────────────────────────────────────────────────────────
  'gestion-rdv': {
    slug: 'gestion-rdv',
    canonicalSlug: 'gestion-rdv',
    categoryBadge: 'PLANIFICATION • AGENDA MÉDICAL',
    title: 'Visibilité et tenue du planning.',
    subtitle: 'Planifier les créneaux, anticiper les disponibilités et accueillir les patients à l’heure.',
    explanation:
      'Un agenda clair et réactif qui relie la prise de rendez-vous téléphonique à l’arrivée physique au cabinet. Les créneaux sont dimensionnés selon le motif, et chaque étape de la journée reste lisible.',
    narrativeLead: 'Planifier → Anticiper → Accueillir → Suivre',
    nextSlug: 'ordonnances',
    nextLabel: 'Cockpit Clinique & Ordonnances',
    heroUI: {
      moduleName: 'Agenda Médical du Jour',
      statusBadge: 'Planning Synchronisé',
      contextTag: 'Cabinet Dr. Alami',
      primaryMetric: { value: '14 créneaux', label: 'Prévus aujourd’hui' },
      secondaryMetric: { value: '2 disponibles', label: 'En fin de matinée' },
      rows: [
        { col1: '08:30', col2: 'M. Karim T. (#0247)', col3: 'Bilan biologique annuel', col4: 'Terminé (Archivé)', state: 'DONE' },
        { col1: '09:00', col2: 'Patient Démo 01 (Mme Amina B.)', col3: 'Suivi HTA • Créneau 30 min', col4: 'En consultation (Dr. Alami)', state: 'IN_CONSULTATION' },
        { col1: '09:30', col2: 'Mme Sofia M. (#0250)', col3: 'Renouvellement ordonnance', col4: 'Au salon d’attente', state: 'WAITING' },
        { col1: '10:00', col2: 'Créneau Disponible', col3: 'Plage libre consultation', col4: 'Réservable en 1 clic', state: 'SCHEDULED' },
      ],
    },
    storyStages: [
      {
        step: '01',
        state: 'SCHEDULED',
        title: 'Planification du créneau',
        description: 'Nadia réserve le créneau de 09:00 pour Patient Démo 01 avec une durée dimensionnée pour un suivi HTA (30 min).',
        uiStateNote: 'Le créneau est verrouillé dans l’agenda à l’état SCHEDULED sans risque de doublon.',
        actor: 'Secrétariat (Nadia)',
      },
      {
        step: '02',
        state: 'ARRIVED',
        title: 'Pointage le jour J (08:42)',
        description: 'La patiente se présente au comptoir. Le créneau de l’agenda bascule au vert pour signaler sa présence réelle.',
        uiStateNote: 'L’agenda marque Patient Démo 01 en ARRIVED et prévient le cockpit du Dr. Alami.',
        actor: 'Accueil & Patiente',
      },
      {
        step: '03',
        state: 'IN_CONSULTATION',
        title: 'Démarrage de l’examen (09:03)',
        description: 'Le Dr. Alami appelle la patiente d’un clic. Le créneau indique que la consultation est en cours avec chrono.',
        uiStateNote: 'Passage synchronisé à l’état IN_CONSULTATION sans aucune double saisie.',
        actor: 'Médecin Praticien (Dr. Alami)',
      },
      {
        step: '04',
        state: 'DONE',
        title: 'Libération du créneau (09:18)',
        description: 'La consultation s’achève. Le créneau est archivé et le dossier bascule vers l’encaissement à l’accueil.',
        uiStateNote: 'État DONE. L’agenda reflète la réalité chronologique de la journée médicale.',
        actor: 'Cabinet Médical',
      },
    ],
    showcasePoints: [
      {
        id: 'pt-1',
        stepNumber: '01',
        label: 'SCHEDULED',
        title: 'Réservation dimensionnée (09:00)',
        description: 'Durée ajustée automatiquement (15 min pour un contrôle rapide, 30 min pour un suivi HTA complet).',
        state: 'SCHEDULED',
        targetArea: 'slot-timeline',
        roleBadge: 'Planification',
      },
      {
        id: 'pt-2',
        stepNumber: '02',
        label: 'ARRIVED',
        title: 'Signalement d’arrivée (08:42)',
        description: 'Le créneau change de couleur dès que le patient se présente au comptoir d’accueil.',
        state: 'ARRIVED',
        targetArea: 'arrival-marker',
        roleBadge: 'Accueil',
      },
      {
        id: 'pt-3',
        stepNumber: '03',
        label: 'WAITING',
        title: 'Liaison file d’attente (08:44)',
        description: 'Liaison directe entre le planning prévisionnel et la position réelle en salle d’attente.',
        state: 'WAITING',
        targetArea: 'waiting-link',
        roleBadge: 'Coordination',
      },
      {
        id: 'pt-4',
        stepNumber: '04',
        label: 'DONE',
        title: 'Historique des visites (09:18)',
        description: 'Chaque consultation reste consignée avec son heure réelle de début et de fin.',
        state: 'DONE',
        targetArea: 'history-block',
        roleBadge: 'Traçabilité',
      },
    ],
    scenario: [
      {
        time: '08:30',
        title: 'Revue du planning du matin',
        description: 'Nadia et le Dr. Alami consultent l’agenda du jour : 14 créneaux ordonnés avec durées adaptées.',
        actionActor: 'Secrétariat & Médecin',
        stateChange: 'Planning de la matinée validé et synchronisé',
        macroState: 'SCHEDULED',
      },
      {
        time: '08:42',
        title: 'Pointage de Patient Démo 01 (#0248)',
        description: 'Mme Amina B. arrive pour son rendez-vous de 09:00. Son créneau s’illumine en ARRIVED sur tous les postes.',
        actionActor: 'Secrétariat (Nadia)',
        stateChange: 'Créneau 09:00 pointé en ARRIVED',
        macroState: 'ARRIVED',
      },
      {
        time: '09:03',
        title: 'Appel en consultation',
        description: 'Le Dr. Alami active le créneau depuis son cockpit. La consultation débute à l’heure prévue.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Créneau en IN_CONSULTATION',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '09:18',
        title: 'Clôture du créneau & transmission caisse',
        description: 'La consultation se termine. Le créneau est archivé en DONE et le montant des actes passe à l’accueil.',
        actionActor: 'Cabinet Médical',
        stateChange: 'Créneau archivé en DONE (Durée réelle 15 min)',
        macroState: 'DONE',
      },
    ],
    beforeAfter: [
      {
        beforeTitle: 'Cahier papier raturé',
        beforeText: 'Rendez-vous déplacés au blanco, créneaux en double et manque de lisibilité en fin de journée.',
        afterTitle: 'Planning numérique partagé',
        afterText: 'Créneaux clairs, déplaçables en un geste et consultables en temps réel par toute l’équipe.',
      },
      {
        beforeTitle: 'Décalage entre l’agenda et la réalité',
        beforeText: 'L’agenda indique un RDV à 10h mais personne ne sait si le patient est réellement présent.',
        afterTitle: 'Liaison directe avec l’accueil',
        afterText: 'Le pointage à l’arrivée met immédiatement à jour l’état du créneau dans l’agenda.',
      },
      {
        beforeTitle: 'Gestion confuse des annulations',
        beforeText: 'Un créneau annulé reste vide faute de savoir rapidement qui relancer.',
        afterTitle: 'Visibilité immédiate des créneaux libres',
        afterText: 'Les plages libérées apparaissent distinctement pour réaffectation rapide.',
      },
    ],
    oneScreenTitle: 'La Journée Sous Contrôle en Un Seul Coup d’Œil',
    oneScreenSubtitle: 'Identifier instantanément les créneaux honorés, en cours et à venir.',
    oneScreenAnnotations: [
      {
        id: 'q-waiting',
        question: 'Qui est attendu sur le prochain créneau ?',
        answer: 'Identité du patient, heure programmée et motif de consultation.',
        targetArea: 'waiting',
        actionHint: 'Vérifier la prochaine arrivée',
      },
      {
        id: 'q-consulting',
        question: 'Quel rendez-vous est en cours ?',
        answer: 'Le créneau actif en consultation avec le temps écoulé.',
        targetArea: 'consulting',
        actionHint: 'Suivre le rythme horaire',
      },
      {
        id: 'q-payment',
        question: 'Quels patients ont terminé ?',
        answer: 'Les créneaux passés à l’état terminé avec leur bilan.',
        targetArea: 'payment',
        actionHint: 'Consulter les consultations passées',
      },
      {
        id: 'q-action',
        question: 'Où sont les créneaux disponibles ?',
        answer: 'Plages horaires libres clairement identifiées pour positionner un patient.',
        targetArea: 'action',
        actionHint: 'Attribuer un créneau libre',
      },
    ],
  },

  // ── 3. COCKPIT CLINIQUE & ORDONNANCES ───────────────────────────────────────
  'ordonnances': {
    slug: 'ordonnances',
    canonicalSlug: 'ordonnances',
    categoryBadge: 'POSTE MÉDICAL • COCKPIT CLINIQUE',
    title: 'De l’observation à la prescription.',
    subtitle: 'Rassembler les antécédents, noter les constantes et préparer l’ordonnance en consultation.',
    explanation:
      'Un espace de travail clinique épuré pour le médecin : rappel des antécédents et allergies, saisie des constantes vitales et rédaction d’ordonnances claires conformes aux usages médicaux marocains.',
    narrativeLead: 'Contexte → Consultation → Décision → Suivi',
    nextSlug: 'facturation',
    nextLabel: 'Facturation & Caisse',
    heroUI: {
      moduleName: 'Cockpit Médical de Consultation',
      statusBadge: 'Poste Praticien Actif',
      contextTag: 'Patient Démo 01 (Mme Amina B. #0248) • 52 ans',
      primaryMetric: { value: 'TA 13.2 / 8.0', label: 'Tension artérielle mesurée' },
      secondaryMetric: { value: '450 MAD', label: 'Cotation CS (300) + ECG (150)' },
      rows: [
        { col1: 'Antécédents', col2: 'Hypertension artérielle modérée (depuis 2022)', col3: 'Suivi régulier Dr. Alami', col4: 'Dossier vérifié', state: 'IN_CONSULTATION' },
        { col1: 'Vigilance', col2: 'Contre-indication : Pénicilline', col3: 'Alerte rouge permanente', col4: 'Contre-indication active', state: 'WAITING' },
        { col1: 'Traitement 1', col2: 'AMLODIPINE 5 mg comprimé', col3: '1 comprimé le matin • 3 mois', col4: 'Prescription validée', state: 'DONE' },
        { col1: 'Traitement 2', col2: 'KARDEGIC 75 mg sachet', col3: '1 sachet le midi • 3 mois', col4: 'Prescription validée', state: 'DONE' },
      ],
    },
    storyStages: [
      {
        step: '01',
        state: 'WAITING',
        title: 'Ouverture du contexte médical',
        description: 'Le Dr. Alami ouvre le dossier de Patient Démo 01 : antécédents HTA et alerte allergie pénicilline apparaissent immédiatement.',
        uiStateNote: 'Synthèse des antécédents affichée d’emblée sans manipulation complexe.',
        actor: 'Médecin Praticien (Dr. Alami)',
      },
      {
        step: '02',
        state: 'IN_CONSULTATION',
        title: 'Saisie des constantes cliniques',
        description: 'Enregistrement de la tension (13.2 / 8.0 mmHg), du pouls (72 bpm) et de l’observation clinique dans le dossier.',
        uiStateNote: 'Les constantes sont consignées et comparées aux visites antérieures.',
        actor: 'Examen Clinique',
      },
      {
        step: '03',
        state: 'DONE',
        title: 'Rédaction de l’ordonnance',
        description: 'Sélection des spécialités en DCI avec posologies nettes (matin, midi). Impression immédiate avec signature et cachet.',
        uiStateNote: 'Ordonnance formulée avec posologies précises et mentions légales préremplies.',
        actor: 'Prescription Médicale',
      },
      {
        step: '04',
        state: 'TO_BE_PAID',
        title: 'Cotation des actes & clôture (09:18)',
        description: 'Le praticien coche la consultation spécialisée (300 MAD) et l’ECG de contrôle (150 MAD). Le total de 450 MAD est transmis à la caisse.',
        uiStateNote: 'Transfert instantané du montant vers le secrétariat pour émission de la quittance.',
        actor: 'Clôture de Visite',
      },
    ],
    showcasePoints: [
      {
        id: 'pt-1',
        stepNumber: '01',
        label: 'CONTEXTE',
        title: 'Synthèse du patient',
        description: 'Rappel des antécédents d’hypertension et de l’intolérance signalée à la pénicilline.',
        state: 'WAITING',
        targetArea: 'summary-panel',
        roleBadge: 'Sécurité',
      },
      {
        id: 'pt-2',
        stepNumber: '02',
        label: 'CONSTANTES',
        title: 'Mesures du jour (09:07)',
        description: 'Relevé de la tension (13.2 / 8.0 mmHg) et fréquence cardiaque (72 bpm).',
        state: 'IN_CONSULTATION',
        targetArea: 'vitals-panel',
        roleBadge: 'Examen',
      },
      {
        id: 'pt-3',
        stepNumber: '03',
        label: 'ORDONNANCE',
        title: 'Prescription claire (09:12)',
        description: 'Rédaction lisible : Amlodipine 5mg + Kardegic 75mg pour 3 mois de traitement.',
        state: 'DONE',
        targetArea: 'rx-panel',
        roleBadge: 'Traitement',
      },
      {
        id: 'pt-4',
        stepNumber: '04',
        label: 'COTATION',
        title: 'Actes & transmission (09:18)',
        description: 'Cotation des actes réalisés : CS 300 MAD + ECG 150 MAD = Total 450 MAD.',
        state: 'TO_BE_PAID',
        targetArea: 'acts-panel',
        roleBadge: 'Clôture',
      },
    ],
    scenario: [
      {
        time: '09:03',
        title: 'Accueil de Patient Démo 01 au bureau',
        description: 'Le Dr. Alami ouvre son dossier : le suivi d’hypertension de la visite précédente de mars 2026 est rappelé.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Dossier ouvert en consultation active',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '09:07',
        title: 'Prise de tension & observation',
        description: 'Mesure : 13.2 / 8.0 mmHg, Pouls 72 bpm. Le médecin constate la bonne stabilité sous traitement.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Constantes enregistrées au dossier',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '09:12',
        title: 'Renouvellement de l’ordonnance',
        description: 'Le praticien valide le renouvellement pour 3 mois (Amlodipine + Kardegic). L’ordonnance est éditée.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Ordonnance imprimée et archivée',
        macroState: 'DONE',
      },
      {
        time: '09:18',
        title: 'Cotation des actes (450 MAD) & clôture',
        description: 'La consultation se termine. CS (300 MAD) + ECG (150 MAD) apparaissent sur le poste de Nadia à l’accueil.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Dossier transmis à la caisse en TO_BE_PAID',
        macroState: 'TO_BE_PAID',
      },
    ],
    beforeAfter: [
      {
        beforeTitle: 'Ordonnance manuscrite difficile à déchiffrer',
        beforeText: 'Posologies parfois ambiguës pour le pharmacien ou le patient, nécessitant des vérifications.',
        afterTitle: 'Document dactylographié clair',
        afterText: 'Posologies détaillées, durées lisibles et mentions légales du praticien préremplies.',
      },
      {
        beforeTitle: 'Oubli d’un antécédent noté ailleurs',
        beforeText: 'Une intolérance signalée lors d’une visite antérieure et non retrouvée sur le moment.',
        afterTitle: 'Signalement visible en permanence',
        afterText: 'Les points de vigilance restent affichés en tête de dossier pendant toute la consultation.',
      },
      {
        beforeTitle: 'Saisie redondante pour chaque document',
        beforeText: 'Réécrire l’identité du patient et la date sur l’ordonnance puis sur la feuille de soins.',
        afterTitle: 'Informations préremplies',
        afterText: 'Tous les documents reprennent automatiquement les coordonnées du patient et du cabinet.',
      },
    ],
    oneScreenTitle: 'L’Examen Médical Réuni en Une Vue Pratique',
    oneScreenSubtitle: 'Consulter l’historique, observer, prescrire et coter sans changer d’écran.',
    oneScreenAnnotations: [
      {
        id: 'q-waiting',
        question: 'Quels antécédents retenir ?',
        answer: 'Les pathologies chroniques et contre-indications connues du patient.',
        targetArea: 'waiting',
        actionHint: 'Consulter les antécédents',
      },
      {
        id: 'q-consulting',
        question: 'Quelles sont les constantes du jour ?',
        answer: 'Tension artérielle, pouls et observations cliniques de la visite.',
        targetArea: 'consulting',
        actionHint: 'Vérifier les mesures',
      },
      {
        id: 'q-payment',
        question: 'Quel traitement est prescrit ?',
        answer: 'La liste ordonnée des médicaments avec leur posologie et leur durée.',
        targetArea: 'payment',
        actionHint: 'Éditer l’ordonnance',
      },
      {
        id: 'q-action',
        question: 'Quel acte transmettre à la caisse ?',
        answer: 'Consultation ou acte technique à reporter pour la facturation.',
        targetArea: 'action',
        actionHint: 'Valider et transmettre',
      },
    ],
  },

  // ── 4. FACTURATION & CAISSE ─────────────────────────────────────────────────
  'facturation': {
    slug: 'facturation',
    canonicalSlug: 'facturation',
    categoryBadge: 'FINANCES • ENCAISSEMENT EN MAD',
    title: 'De l’acte à la quittance.',
    subtitle: 'Saisir les actes réalisés, enregistrer le règlement en Dirhams et imprimer le reçu.',
    explanation:
      'Un suivi opérationnel des encaissements du cabinet : transmission directe depuis le bureau médical, enregistrement du mode de règlement (espèces, chèque, carte) et délivrance de quittances claires avec récapitulatif de fin de journée.',
    narrativeLead: 'Actes → Montant → Encaissement → Trace',
    nextSlug: 'dossiers-patients',
    nextLabel: 'Dossiers Patients',
    heroUI: {
      moduleName: 'Caisse & Règlements du Cabinet',
      statusBadge: 'Comptabilité Quotidienne',
      contextTag: 'Patient Démo 01 (Mme Amina B. #0248) • 450 MAD',
      primaryMetric: { value: '450 MAD', label: 'Consultation + Acte médical' },
      secondaryMetric: { value: 'Reçu édité', label: 'Quittance remise au patient' },
      rows: [
        { col1: 'Acte 1', col2: 'Consultation Spécialisée (CS)', col3: '300 MAD', col4: 'Acté par Dr. Alami', state: 'DONE' },
        { col1: 'Acte 2', col2: 'Électrocardiogramme (ECG)', col3: '150 MAD', col4: 'Acté par Dr. Alami', state: 'DONE' },
        { col1: 'Total', col2: 'Total des actes de la visite', col3: '450 MAD', col4: 'Règlement en espèces', state: 'TO_BE_PAID' },
        { col1: 'Quittance', col2: 'Reçu #MM-2026-0842 délivré', col3: '450 MAD', col4: 'Archivé en caisse', state: 'DONE' },
      ],
    },
    storyStages: [
      {
        step: '01',
        state: 'TO_BE_PAID',
        title: 'Réception des actes cotés (09:18)',
        description: 'Les actes validés par le Dr. Alami (CS 300 MAD + ECG 150 MAD) s’affichent instantanément à l’accueil.',
        uiStateNote: 'Le total de 450 MAD est calculé sans ressaisie manuelle ni coup d’interphone.',
        actor: 'Transmission Médecin ↔ Accueil',
      },
      {
        step: '02',
        state: 'TO_BE_PAID',
        title: 'Sélection du mode de règlement',
        description: 'Nadia encaisse le paiement : choix immédiat entre espèces (calcul rendu monnaie), chèque ou TPE.',
        uiStateNote: 'Prise en compte instantanée du mode de règlement dans le journal de caisse.',
        actor: 'Secrétariat (Nadia)',
      },
      {
        step: '03',
        state: 'DONE',
        title: 'Émission de la quittance officielle (09:21)',
        description: 'Délivrance d’une quittance claire (#MM-2026-0842) avec entête du cabinet, date et détail des actes.',
        uiStateNote: 'La patiente repart avec sa quittance officielle pour son dossier de mutuelle.',
        actor: 'Accueil & Caisse (Nadia)',
      },
      {
        step: '04',
        state: 'DONE',
        title: 'Récapitulatif de fin de journée',
        description: 'En fin de journée, le point de caisse ventile le total perçu par mode de paiement.',
        uiStateNote: 'Comparaison directe entre le montant calculé et le tiroir-caisse sans écart.',
        actor: 'Gestion du Cabinet',
      },
    ],
    showcasePoints: [
      {
        id: 'pt-1',
        stepNumber: '01',
        label: 'ACTES',
        title: 'Détail des prestations',
        description: 'Consultation Spécialisée (300 MAD) et ECG (150 MAD) télétransmis.',
        state: 'TO_BE_PAID',
        targetArea: 'acts-detail',
        roleBadge: 'Cotation',
      },
      {
        id: 'pt-2',
        stepNumber: '02',
        label: 'MONTANT',
        title: 'Total calculé',
        description: 'Addition automatique sans calcul mental : 300 MAD + 150 MAD = 450 MAD.',
        state: 'TO_BE_PAID',
        targetArea: 'total-panel',
        roleBadge: 'Clarté',
      },
      {
        id: 'pt-3',
        stepNumber: '03',
        label: 'ENCAISSEMENT',
        title: 'Mode de règlement (09:19)',
        description: 'Ventilation nette : espèces perçues avec calcul automatique du rendu monnaie.',
        state: 'DONE',
        targetArea: 'pay-method',
        roleBadge: 'Règlement',
      },
      {
        id: 'pt-4',
        stepNumber: '04',
        label: 'QUITTANCE',
        title: 'Reçu officiel #MM-2026-0842',
        description: 'Document officiel remis au patient avec date, cachet et montant réglé.',
        state: 'DONE',
        targetArea: 'receipt-view',
        roleBadge: 'Traçabilité',
      },
    ],
    scenario: [
      {
        time: '09:18',
        title: 'Présentation de Patient Démo 01 à l’accueil',
        description: 'La patiente sort du bureau. L’écran de Nadia affiche les actes validés : CS 300 MAD + ECG 150 MAD.',
        actionActor: 'Secrétariat (Nadia)',
        stateChange: 'Dossier reçu pour règlement (450 MAD)',
        macroState: 'TO_BE_PAID',
      },
      {
        time: '09:19',
        title: 'Règlement en espèces',
        description: 'La patiente remet 500 MAD en espèces. Nadia valide l’encaissement et remet 50 MAD de monnaie.',
        actionActor: 'Secrétariat & Patiente',
        stateChange: 'Paiement espèces validé (450 MAD)',
        macroState: 'DONE',
      },
      {
        time: '09:21',
        title: 'Délivrance de la quittance #MM-2026-0842',
        description: 'Impression du reçu avec mention des prestations réglées pour son dossier de mutuelle.',
        actionActor: 'Secrétariat (Nadia)',
        stateChange: 'Quittance remise en mains propres',
        macroState: 'DONE',
      },
      {
        time: '18:45',
        title: 'Pointage de caisse du soir',
        description: 'Vérification du journal : le total en espèces correspond au tiroir-caisse sans divergence.',
        actionActor: 'Cabinet Médical',
        stateChange: 'Caisse journalière équilibrée',
        macroState: 'DONE',
      },
    ],
    beforeAfter: [
      {
        beforeTitle: 'Carnet de reçus manuscrit et ratures',
        beforeText: 'Écriture manuelle de chaque reçu, souches perdues ou montants mal reportés.',
        afterTitle: 'Quittance imprimée nette',
        afterText: 'Détail des actes en Dirhams (MAD) avec date et identité du praticien imprimés proprement.',
      },
      {
        beforeTitle: 'Oubli d’un acte complémentaire',
        beforeText: 'L’ECG ou l’acte technique réalisé en consultation n’est pas signalé à l’accueil et reste impayé.',
        afterTitle: 'Transmission directe du bureau',
        afterText: 'Les actes cochés par le praticien apparaissent automatiquement sur le poste d’encaissement.',
      },
      {
        beforeTitle: 'Comptes de fin de journée fastidieux',
        beforeText: 'Additionner manuellement les souches papier avec le risque d’un écart inexpliqué.',
        afterTitle: 'Récapitulatif immédiat',
        afterText: 'Ventilation automatique des espèces, chèques et cartes bancaires perçus dans la journée.',
      },
    ],
    oneScreenTitle: 'L’Encaissement Médical Sans Ambiguïté',
    oneScreenSubtitle: 'Une visibilité transparente sur le montant dû, le mode de paiement et le reçu délivré.',
    oneScreenAnnotations: [
      {
        id: 'q-waiting',
        question: 'Quels actes ont été réalisés ?',
        answer: 'Consultation et actes techniques saisis par le praticien.',
        targetArea: 'waiting',
        actionHint: 'Vérifier les prestations',
      },
      {
        id: 'q-consulting',
        question: 'Quel est le montant total en MAD ?',
        answer: 'Total calculé automatiquement selon les tarifs du cabinet.',
        targetArea: 'consulting',
        actionHint: 'Contrôler le total',
      },
      {
        id: 'q-payment',
        question: 'Comment le patient règle-t-il ?',
        answer: 'Choix du mode de paiement : espèces, chèque ou carte bancaire.',
        targetArea: 'payment',
        actionHint: 'Enregistrer le mode',
      },
      {
        id: 'q-action',
        question: 'Le reçu est-il imprimé ?',
        answer: 'Quittance de consultation prête à remettre au patient.',
        targetArea: 'action',
        actionHint: 'Imprimer la quittance',
      },
    ],
  },

  // ── 5. DOSSIERS PATIENTS ────────────────────────────────────────────────────
  'dossiers-patients': {
    slug: 'dossiers-patients',
    canonicalSlug: 'dossiers-patients',
    categoryBadge: 'MÉDICAL • DOSSIER PATIENT',
    title: 'Continuité du suivi médical.',
    subtitle: 'Consulter l’historique des consultations, les bilans et les documents du patient.',
    explanation:
      'Un dossier médical centralisé et structuré : retrouver les visites antérieures, consulter les bilans biologiques ou radiologiques et assurer le suivi des pathologies chroniques sans chercher dans des chemises cartonnées.',
    narrativeLead: 'Identité → Historique → Documents → Suivi',
    nextSlug: 'taches',
    nextLabel: 'Tâches & Coordination',
    heroUI: {
      moduleName: 'Dossier Médical Patient',
      statusBadge: 'Dossier Unique Partagé',
      contextTag: 'Patient Démo 01 (Mme Amina B. #0248) • Suivi depuis 2022',
      primaryMetric: { value: '4 visites', label: 'Consignées dans l’historique' },
      secondaryMetric: { value: '2 bilans', label: 'Analyses labo rattachées' },
      rows: [
        { col1: 'Ce jour', col2: 'Consultation cardiologie (Dr. Alami)', col3: 'TA 13.2/8.0 • Ordonnance renouvelée', col4: 'Dossier enrichi', state: 'DONE' },
        { col1: '02 Mar 2026', col2: 'Bilan biologique (Laboratoire Rabat)', col3: 'Créatinine, Glycémie, Bilan lipidique', col4: 'Rattaché au dossier', state: 'DONE' },
        { col1: '18 Nov 2025', col2: 'Consultation de suivi HTA', col3: 'Ajustement posologique Amlodipine 5mg', col4: 'Dr. Yassine Alami', state: 'DONE' },
        { col1: '11 Oct 2022', col2: 'Première consultation au cabinet', col3: 'Diagnostic initial HTA modérée', col4: 'Dossier initialisé', state: 'DONE' },
      ],
    },
    storyStages: [
      {
        step: '01',
        state: 'SCHEDULED',
        title: 'Recherche rapide du patient',
        description: 'Recherche par nom (« Benali ») ou numéro #0248 : la fiche s’ouvre sans délai avec les coordonnées et antécédents.',
        uiStateNote: 'Fiche d’identité complète disponible instantanément dès l’accueil.',
        actor: 'Secrétariat & Médecin',
      },
      {
        step: '02',
        state: 'WAITING',
        title: 'Lecture de la chronologie continue',
        description: 'Le Dr. Alami parcourt les 4 années de visites passées, les dates d’examen et les diagnostics posés.',
        uiStateNote: 'Historique continu sans risque de chemise égarée ni intercalaire manquant.',
        actor: 'Médecin Praticien (Dr. Alami)',
      },
      {
        step: '03',
        state: 'IN_CONSULTATION',
        title: 'Consultation des documents joints',
        description: 'Accès immédiat aux comptes-rendus de bilans sanguins et ECG antérieurs rattachés au dossier.',
        uiStateNote: 'Visualisation des résultats de laboratoire sans ouvrir d’autre logiciel.',
        actor: 'Poste Médical',
      },
      {
        step: '04',
        state: 'DONE',
        title: 'Enrichissement et archivage continu',
        description: 'La consultation du jour et l’ordonnance de 3 mois s’ajoutent à la chronologie de Patient Démo 01.',
        uiStateNote: 'Continuité totale assurée pour les prochains contrôles au cabinet.',
        actor: 'Archivage Continu',
      },
    ],
    showcasePoints: [
      {
        id: 'pt-1',
        stepNumber: '01',
        label: 'IDENTITÉ',
        title: 'Fiche patient (#0248)',
        description: 'Coordonnées complètes, personne à prévenir et historique initialisé.',
        state: 'SCHEDULED',
        targetArea: 'identity-card',
        roleBadge: 'Accueil',
      },
      {
        id: 'pt-2',
        stepNumber: '02',
        label: 'HISTORIQUE',
        title: 'Chronologie des visites (2022-2026)',
        description: 'Ligne du temps continue des consultations réalisées au cabinet.',
        state: 'WAITING',
        targetArea: 'timeline-card',
        roleBadge: 'Médical',
      },
      {
        id: 'pt-3',
        stepNumber: '03',
        label: 'DOCUMENTS',
        title: 'Analyses & bilans labo',
        description: 'Comptes-rendus de laboratoire et ECG numérisés et rattachés.',
        state: 'IN_CONSULTATION',
        targetArea: 'documents-card',
        roleBadge: 'Clinique',
      },
      {
        id: 'pt-4',
        stepNumber: '04',
        label: 'CONTINUITÉ',
        title: 'Notes de suivi archivées',
        description: 'Chaque nouvelle visite enrichit le dossier pour les prochaines étapes.',
        state: 'DONE',
        targetArea: 'notes-card',
        roleBadge: 'Suivi',
      },
    ],
    scenario: [
      {
        time: '09:03',
        title: 'Ouverture du dossier de Patient Démo 01',
        description: 'Le Dr. Alami ouvre la fiche #0248 en un clic. L’ensemble du suivi depuis octobre 2022 s’affiche.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Dossier complet actif à l’écran',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '09:05',
        title: 'Évolution de la courbe de tension',
        description: 'Comparaison directe : 14.5/9.0 en 2022 vs 13.2/8.0 ce jour. L’efficacité du traitement est démontrée.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Historique des constantes visualisé',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '09:14',
        title: 'Consultation du bilan biologique rattaché',
        description: 'Le praticien vérifie le compte-rendu du laboratoire de Rabat reçu en mars 2026 sans chercher d’intercalaire.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Document d’analyse consulté en direct',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '09:18',
        title: 'Enregistrement de la nouvelle consultation',
        description: 'L’observation du jour et la prescription s’ajoutent automatiquement à la ligne du temps du patient.',
        actionActor: 'Système',
        stateChange: 'Visite archivée dans l’historique continu',
        macroState: 'DONE',
      },
    ],
    beforeAfter: [
      {
        beforeTitle: 'Dossiers papier volumineux en armoire',
        beforeText: 'Rechercher une chemise cartonnée parmi des centaines de dossiers rangés par ordre alphabétique.',
        afterTitle: 'Recherche numérique immédiate',
        afterText: 'Accès au dossier complet en tapant les premières lettres du nom.',
      },
      {
        beforeTitle: 'Feuillets volants égarés',
        beforeText: 'Résultats d’analyses ou courriers de confrères classés dans le mauvais intercalaire.',
        afterTitle: 'Documents rattachés au patient',
        afterText: 'Chaque pièce reste liée de façon permanente à la fiche du patient concerné.',
      },
      {
        beforeTitle: 'Historique tronqué lors d’une absence',
        beforeText: 'Difficulté à savoir ce qui a été prescrit il y a deux ans sans retrouver le duplicata.',
        afterTitle: 'Chronologie complète préservée',
        afterText: 'Toutes les consultations passées restent consultables avec leurs observations.',
      },
    ],
    oneScreenTitle: 'L’Historique du Patient Sans Feuillet Manquant',
    oneScreenSubtitle: 'Retrouver les consultations antérieures, les bilans et les observations au même endroit.',
    oneScreenAnnotations: [
      {
        id: 'q-waiting',
        question: 'Qui est le patient suivi ?',
        answer: 'Identité, âge, coordonnées et numéro de dossier.',
        targetArea: 'waiting',
        actionHint: 'Vérifier l’identité',
      },
      {
        id: 'q-consulting',
        question: 'Quand a eu lieu la dernière visite ?',
        answer: 'Date et motif de la consultation la plus récente avec le praticien.',
        targetArea: 'consulting',
        actionHint: 'Consulter la dernière note',
      },
      {
        id: 'q-payment',
        question: 'Quels documents sont rattachés ?',
        answer: 'Comptes-rendus d’analyses, imagerie ou courriers de confrères.',
        targetArea: 'payment',
        actionHint: 'Ouvrir les documents joints',
      },
      {
        id: 'q-action',
        question: 'Quelle suite donner au suivi ?',
        answer: 'Créer une nouvelle observation ou programmer le prochain contrôle.',
        targetArea: 'action',
        actionHint: 'Ajouter une note de suivi',
      },
    ],
  },

  // ── 6. TÂCHES & COORDINATION ────────────────────────────────────────────────
  'taches': {
    slug: 'taches',
    canonicalSlug: 'taches',
    categoryBadge: 'COORDINATION • TÂCHES DU CABINET',
    title: 'Coordination des actions du cabinet.',
    subtitle: 'Attribuer les demandes, suivre les priorités et clôturer chaque démarche sans oubli.',
    explanation:
      'Un tableau partagé des actions à mener entre le secrétariat et les médecins : bilans de laboratoire à vérifier, certificats en attente de signature ou relances de patients, avec un responsable identifié et un statut clair.',
    narrativeLead: 'Détecter → Prioriser → Exécuter → Archiver',
    nextSlug: 'salle-attente',
    nextLabel: "Salle d'Attente",
    heroUI: {
      moduleName: 'Tableau de Coordination du Cabinet',
      statusBadge: 'Tâches Actives',
      contextTag: 'Actions Dr. Alami & Nadia (Secrétariat)',
      primaryMetric: { value: '3 en cours', label: 'Tâches à traiter ce jour' },
      secondaryMetric: { value: '1 prioritaire', label: 'Bilan INR Patient Démo 01' },
      rows: [
        { col1: 'Priorité 1', col2: 'Vérifier bilan INR (Patient Démo 01 #0248)', col3: 'Reçu du laboratoire Rabat', col4: 'Attribué Dr. Alami', state: 'IN_CONSULTATION' },
        { col1: 'Priorité 2', col2: 'Faire signer certificat d’aptitude', col3: 'Préparé à l’accueil (Nadia)', col4: 'Attribué Dr. Alami', state: 'WAITING' },
        { col1: 'Priorité 3', col2: 'Rappeler M. Karim T. pour confirmation créneau', col3: 'Secrétariat médical', col4: 'Attribué Nadia', state: 'SCHEDULED' },
        { col1: 'Terminé', col2: 'Transmission duplicata ordonnance pour patient', col3: 'Remis au comptoir', col4: 'Clôturé ce matin', state: 'DONE' },
      ],
    },
    storyStages: [
      {
        step: '01',
        state: 'SCHEDULED',
        title: 'Création de la tâche',
        description: 'Une demande ou un bilan labo arrive : la tâche est créée en 5 secondes avec son niveau de priorité (P1/P2/P3).',
        uiStateNote: 'Tâche créée et liée automatiquement au dossier #0248.',
        actor: 'Secrétariat (Nadia)',
      },
      {
        step: '02',
        state: 'WAITING',
        title: 'Attribution nominative',
        description: 'La tâche est assignée nominativement au Dr. Alami pour savoir exactement qui doit agir sans ambiguïté.',
        uiStateNote: 'Responsable désigné : Dr. Alami. Zéro post-it égaré.',
        actor: 'Coordination Cabinet',
      },
      {
        step: '03',
        state: 'IN_CONSULTATION',
        title: 'Traitement au moment propice',
        description: 'Le praticien vérifie le bilan INR entre deux consultations sans être interrompu par l’interphone.',
        uiStateNote: 'Validation silencieuse sans perturber le colloque singulier.',
        actor: 'Médecin Praticien (Dr. Alami)',
      },
      {
        step: '04',
        state: 'DONE',
        title: 'Clôture et transmission',
        description: 'La tâche est cochée comme terminée. Nadia reçoit la consigne et prévient la patiente par téléphone.',
        uiStateNote: 'Statut DONE : trace horodatée conservée dans le journal d’activité.',
        actor: 'Secrétariat & Médecin',
      },
    ],
    showcasePoints: [
      {
        id: 'pt-1',
        stepNumber: '01',
        label: 'CRÉATION',
        title: 'Signalement d’une action (10:15)',
        description: 'Consignation d’une demande ou analyse reçue avec rattachement au dossier.',
        state: 'SCHEDULED',
        targetArea: 'create-panel',
        roleBadge: 'Signalement',
      },
      {
        id: 'pt-2',
        stepNumber: '02',
        label: 'ATTRIBUTION',
        title: 'Responsable désigné',
        description: 'Chaque tâche a un destinataire clair (Dr. Alami ou Nadia) évitant les démarches en suspens.',
        state: 'WAITING',
        targetArea: 'assignee-panel',
        roleBadge: 'Organisation',
      },
      {
        id: 'pt-3',
        stepNumber: '03',
        label: 'EXÉCUTION',
        title: 'Validation silencieuse (10:30)',
        description: 'Le praticien traite la consigne entre deux patients sans coup de sonnette.',
        state: 'IN_CONSULTATION',
        targetArea: 'action-panel',
        roleBadge: 'Praticien',
      },
      {
        id: 'pt-4',
        stepNumber: '04',
        label: 'CLÔTURE',
        title: 'Archivage horodaté (10:38)',
        description: 'Confirmation de l’exécution et archivage propre dans l’historique du cabinet.',
        state: 'DONE',
        targetArea: 'done-panel',
        roleBadge: 'Clôture',
      },
    ],
    scenario: [
      {
        time: '10:15',
        title: 'Réception du bilan de Patient Démo 01',
        description: 'Le coursier du laboratoire dépose le résultat d’INR de Mme Amina B. Nadia crée une tâche P1 pour le Dr. Alami.',
        actionActor: 'Secrétariat (Nadia)',
        stateChange: 'Tâche P1 créée et assignée au Dr. Alami',
        macroState: 'WAITING',
      },
      {
        time: '10:30',
        title: 'Vérification du bilan par le Dr. Alami',
        description: 'Entre deux consultations, le médecin ouvre le bilan rattaché et valide la consigne posologique.',
        actionActor: 'Médecin (Dr. Alami)',
        stateChange: 'Consigne rédigée : posologie maintenue',
        macroState: 'IN_CONSULTATION',
      },
      {
        time: '10:35',
        title: 'Appel téléphonique à la patiente',
        description: 'Nadia contacte Mme Amina B. pour lui confirmer que son bilan est bon et que le traitement se poursuit.',
        actionActor: 'Secrétariat (Nadia)',
        stateChange: 'Patiente jointe et rassurée par téléphone',
        macroState: 'DONE',
      },
      {
        time: '10:38',
        title: 'Clôture définitive de la tâche',
        description: 'La tâche est marquée terminée d’un clic. L’événement reste consigné dans l’activité du cabinet.',
        actionActor: 'Système',
        stateChange: 'Tâche archivée en DONE',
        macroState: 'DONE',
      },
    ],
    beforeAfter: [
      {
        beforeTitle: 'Post-its collés sur les écrans',
        beforeText: 'Mémos manuscrits qui se décollent, s’égarent ou restent sans suivi clair.',
        afterTitle: 'Tableau de bord partagé',
        afterText: 'Tâches enregistrées dans le logiciel, visibles par le secrétariat et le praticien.',
      },
      {
        beforeTitle: 'Interphone pendant une consultation',
        beforeText: 'La secrétaire appelle pour faire signer un document, perturbant le colloque singulier.',
        afterTitle: 'File de validation silencieuse',
        afterText: 'Le médecin signe ou valide les demandes au moment où il est disponible.',
      },
      {
        beforeTitle: 'Incertitude sur qui devait agir',
        beforeText: '« Je pensais que tu l’avais rappelé » : des démarches oubliées par manque d’attribution.',
        afterTitle: 'Responsable clairement nommé',
        afterText: 'Chaque tâche indique nominativement qui doit s’en charger.',
      },
    ],
    oneScreenTitle: 'Les Tâches du Cabinet Visibles au Bon Moment',
    oneScreenSubtitle: 'Savoir exactement ce qui doit être traité, par qui et avec quelle urgence.',
    oneScreenAnnotations: [
      {
        id: 'q-waiting',
        question: 'Quelles actions sont en attente ?',
        answer: 'La liste ordonnée des tâches du cabinet par degré d’urgence.',
        targetArea: 'waiting',
        actionHint: 'Consulter la liste active',
      },
      {
        id: 'q-consulting',
        question: 'Qui doit s’en charger ?',
        answer: 'Attribution claire : secrétariat ou médecin.',
        targetArea: 'consulting',
        actionHint: 'Vérifier le responsable',
      },
      {
        id: 'q-payment',
        question: 'Quel patient est concerné ?',
        answer: 'Lien direct avec le dossier médical pour agir en connaissance de cause.',
        targetArea: 'payment',
        actionHint: 'Ouvrir le dossier associé',
      },
      {
        id: 'q-action',
        question: 'L’action est-elle terminée ?',
        answer: 'Case à cocher pour clôturer et archiver la démarche.',
        targetArea: 'action',
        actionHint: 'Marquer comme fait',
      },
    ],
  },
}

export const ORDERED_FEATURE_SLUGS = [
  'salle-attente',
  'gestion-rdv',
  'ordonnances',
  'facturation',
  'dossiers-patients',
  'taches',
]

export const SLUG_RESOLVER: Record<string, string> = {
  'salle-attente': 'salle-attente',
  'gestion-rdv': 'gestion-rdv',
  agenda: 'gestion-rdv',
  ordonnances: 'ordonnances',
  consultation: 'ordonnances',
  'espace-clinique': 'ordonnances',
  facturation: 'facturation',
  caisse: 'facturation',
  'dossiers-patients': 'dossiers-patients',
  dossiers: 'dossiers-patients',
  patients: 'dossiers-patients',
  taches: 'taches',
  urgences: 'taches',
}
