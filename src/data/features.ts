export interface FeatureStep {
  title: string;
  text: string;
}

export interface FeatureOutcome {
  value: number;
  suffix: string;
  label: string;
}

export interface Feature {
  slug: string;
  icon: string;
  title: string;
  description: string;
  tagline: string;
  before: {
    story: string;
    pains: string[];
  };
  steps: FeatureStep[];
  outcomes: FeatureOutcome[];
  quote: { text: string; author: string };
}

export const features: Feature[] = [
  {
    slug: 'dossiers-patients',
    icon: 'folder_shared',
    title: 'Dossiers Patients',
    description: 'Historique complet, imagerie médicale et antécédents accessibles en un clic. Sécurisé et centralisé.',
    tagline: "Toute l'histoire de votre patient, sur une seule page.",
    before: {
      story: "8h45. Un patient s'assoit. Vous cherchez son dernier bilan dans un classeur, sa radio dans un tiroir, ses allergies dans votre mémoire.",
      pains: ['Dossiers papier dispersés', 'Antécédents oubliés', 'Temps perdu à chercher'],
    },
    steps: [
      { title: 'Ouvrez le dossier', text: "Un nom, un clic. L'historique complet apparaît instantanément." },
      { title: 'Voyez l’essentiel', text: 'Allergies, traitements en cours et dernières consultations sont mis en avant.' },
      { title: 'Consultez sereinement', text: 'Vos notes, analyses et imageries restent liées au bon patient, pour toujours.' },
    ],
    outcomes: [
      { value: 3, suffix: 's', label: 'pour retrouver un dossier' },
      { value: 100, suffix: '%', label: 'des antécédents centralisés' },
      { value: 0, suffix: '', label: 'feuille perdue' },
    ],
    quote: { text: "Je regarde enfin mon patient, et plus mes papiers.", author: 'Médecin généraliste, Casablanca' },
  },
  {
    slug: 'gestion-des-rdv',
    icon: 'calendar_month',
    title: 'Gestion des RDV',
    description: 'Agenda intelligent avec rappels SMS automatiques pour réduire les rendez-vous non honorés de 40%.',
    tagline: 'Un agenda qui se remplit bien, et se vide moins.',
    before: {
      story: "Le téléphone sonne sans arrêt. Deux patients pour le même créneau, un autre qui ne vient pas. La journée déraille avant 10h.",
      pains: ['Doubles réservations', 'Rendez-vous non honorés', 'Secrétariat débordé'],
    },
    steps: [
      { title: 'Planifiez en un geste', text: 'Les créneaux libres sont visibles immédiatement, par jour, semaine ou mois.' },
      { title: 'Laissez les rappels travailler', text: 'Un SMS automatique confirme chaque rendez-vous la veille.' },
      { title: 'Suivez la salle d’attente', text: 'Arrivé, en consultation, terminé : chacun sait où en est la journée.' },
    ],
    outcomes: [
      { value: 40, suffix: '%', label: "d'absences en moins" },
      { value: 2, suffix: 'h', label: 'gagnées par jour au secrétariat' },
      { value: 0, suffix: '', label: 'double réservation' },
    ],
    quote: { text: 'Nos journées commencent et finissent à l’heure.', author: 'Secrétaire médicale, Rabat' },
  },
  {
    slug: 'ordonnances',
    icon: 'prescriptions',
    title: 'Ordonnances',
    description: "Générateur intelligent d'ordonnances avec base de données médicamenteuse marocaine mise à jour.",
    tagline: 'Des ordonnances claires, justes, en quelques secondes.',
    before: {
      story: "Une écriture pressée, un dosage à vérifier, un pharmacien qui rappelle pour confirmer. Chaque ordonnance coûte du temps et de l'attention.",
      pains: ['Écriture difficile à lire', 'Posologies à ressaisir', 'Risque d’interaction'],
    },
    steps: [
      { title: 'Tapez trois lettres', text: 'Le médicament est trouvé dans la base marocaine à jour.' },
      { title: 'Validez la posologie', text: 'Les dosages usuels sont proposés, vous ajustez si besoin.' },
      { title: 'Imprimez ou partagez', text: 'Une ordonnance nette, à votre en-tête, prête pour la pharmacie.' },
    ],
    outcomes: [
      { value: 30, suffix: 's', label: 'par ordonnance' },
      { value: 100, suffix: '%', label: 'lisible par le pharmacien' },
      { value: 1, suffix: ' clic', label: 'pour renouveler' },
    ],
    quote: { text: 'Plus aucun appel de la pharmacie pour me relire.', author: 'Pédiatre, Marrakech' },
  },
  {
    slug: 'facturation',
    icon: 'account_balance_wallet',
    title: 'Facturation',
    description: 'Télétransmission facilitée et facturation conforme aux normes fiscales marocaines en vigueur.',
    tagline: 'Chaque consultation encaissée, chaque feuille de soins prête.',
    before: {
      story: "Fin de journée. Il faut recompter la caisse, remplir les feuilles CNSS à la main et retrouver qui n'a pas encore payé.",
      pains: ['Feuilles CNSS manuelles', 'Caisse difficile à suivre', 'Oublis de paiement'],
    },
    steps: [
      { title: 'Consultation terminée', text: 'Le dossier passe automatiquement en attente de paiement.' },
      { title: 'Encaissez', text: 'Espèces, carte ou chèque : le reçu est généré immédiatement.' },
      { title: 'Générez la FSE', text: 'La feuille de soins CNSS est pré-remplie avec les bonnes informations.' },
    ],
    outcomes: [
      { value: 1, suffix: ' clic', label: 'pour une feuille CNSS' },
      { value: 100, suffix: '%', label: 'des actes tracés' },
      { value: 15, suffix: 'min', label: 'pour clôturer la journée' },
    ],
    quote: { text: 'La caisse tombe juste, tous les soirs.', author: 'Cabinet dentaire, Tanger' },
  },
  {
    slug: 'statistiques',
    icon: 'query_stats',
    title: 'Statistiques',
    description: 'Analysez la performance de votre cabinet en temps réel : revenus, fréquentation et analyses prédictives.',
    tagline: 'Comprenez votre cabinet d’un seul regard.',
    before: {
      story: "Combien de patients ce mois-ci ? Quels jours sont saturés ? Sans chiffres, chaque décision se prend à l'instinct.",
      pains: ['Aucune vision d’ensemble', 'Revenus estimés à la main', 'Décisions à l’aveugle'],
    },
    steps: [
      { title: 'Ouvrez le tableau de bord', text: 'Revenus, consultations et fréquentation, mis à jour en temps réel.' },
      { title: 'Repérez les tendances', text: 'Jours chargés, motifs fréquents, évolution mois après mois.' },
      { title: 'Décidez avec clarté', text: 'Ajustez vos horaires et votre équipe à partir de faits.' },
    ],
    outcomes: [
      { value: 24, suffix: '/7', label: 'données en temps réel' },
      { value: 12, suffix: ' mois', label: 'd’historique comparé' },
      { value: 0, suffix: '', label: 'tableur à remplir' },
    ],
    quote: { text: 'J’ai adapté mes horaires grâce aux chiffres, pas au hasard.', author: 'Cardiologue, Fès' },
  },
  {
    slug: 'securite',
    icon: 'verified_user',
    title: 'Sécurité Totale',
    description: 'Chiffrement de bout en bout et hébergement conforme à la protection des données de santé au Maroc.',
    tagline: 'Les données de vos patients, protégées comme il se doit.',
    before: {
      story: "Un ordinateur partagé, un fichier Excel sur une clé USB, un mot de passe collé sous l'écran. Le secret médical mérite mieux.",
      pains: ['Accès non contrôlés', 'Données sur supports amovibles', 'Aucune traçabilité'],
    },
    steps: [
      { title: 'Chacun son rôle', text: 'Médecin et secrétaire voient uniquement ce qui les concerne.' },
      { title: 'Verrouillage par code PIN', text: 'Une absence ? La session se verrouille, les données restent privées.' },
      { title: 'Chiffré et sauvegardé', text: 'Données chiffrées, hébergement conforme, sauvegardes automatiques.' },
    ],
    outcomes: [
      { value: 256, suffix: '-bit', label: 'chiffrement' },
      { value: 100, suffix: '%', label: 'des accès tracés' },
      { value: 0, suffix: '', label: 'clé USB nécessaire' },
    ],
    quote: { text: 'Je dors tranquille : le secret médical est respecté.', author: 'Gynécologue, Agadir' },
  },
];

export const getFeature = (slug?: string) => features.find((f) => f.slug === slug);
