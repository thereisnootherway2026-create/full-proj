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
  story: string;
  steps: string[];
  outcomes: FeatureOutcome[];
}

export const features: Feature[] = [
  {
    slug: 'dossiers-patients',
    icon: 'folder_shared',
    title: 'Dossiers Patients',
    description: 'Historique complet, imagerie médicale et antécédents accessibles en un clic. Sécurisé et centralisé.',
    tagline: "Toute l'histoire du patient, sur une page.",
    story: 'Fini les classeurs. Le dossier est là, avant même que le patient s’assoie.',
    steps: ['Cherchez un nom', 'Voyez l’essentiel', 'Consultez'],
    outcomes: [
      { value: 3, suffix: 's', label: 'pour ouvrir un dossier' },
      { value: 100, suffix: '%', label: 'centralisé' },
    ],
  },
  {
    slug: 'gestion-des-rdv',
    icon: 'calendar_month',
    title: 'Gestion des RDV',
    description: 'Agenda intelligent avec rappels SMS automatiques pour réduire les rendez-vous non honorés de 40%.',
    tagline: 'Un agenda plein, des absences en moins.',
    story: 'Le téléphone se calme. Les rappels partent seuls. La journée reste à l’heure.',
    steps: ['Choisissez un créneau', 'Le SMS part seul', 'Le patient arrive'],
    outcomes: [
      { value: 40, suffix: '%', label: "d'absences en moins" },
      { value: 2, suffix: 'h', label: 'gagnées par jour' },
    ],
  },
  {
    slug: 'ordonnances',
    icon: 'prescriptions',
    title: 'Ordonnances',
    description: "Générateur intelligent d'ordonnances avec base de données médicamenteuse marocaine mise à jour.",
    tagline: 'Claires, justes, en quelques secondes.',
    story: 'Trois lettres tapées, le bon médicament trouvé. Le pharmacien n’appelle plus.',
    steps: ['Tapez le médicament', 'Validez la posologie', 'Imprimez'],
    outcomes: [
      { value: 30, suffix: 's', label: 'par ordonnance' },
      { value: 1, suffix: ' clic', label: 'pour renouveler' },
    ],
  },
  {
    slug: 'facturation',
    icon: 'account_balance_wallet',
    title: 'Facturation',
    description: 'Télétransmission facilitée et facturation conforme aux normes fiscales marocaines en vigueur.',
    tagline: 'Chaque consultation encaissée.',
    story: 'La consultation se termine, la facture est prête. La caisse tombe juste le soir.',
    steps: ['Fin de consultation', 'Encaissement', 'Feuille CNSS prête'],
    outcomes: [
      { value: 1, suffix: ' clic', label: 'pour une feuille CNSS' },
      { value: 15, suffix: 'min', label: 'pour clôturer la journée' },
    ],
  },
  {
    slug: 'statistiques',
    icon: 'query_stats',
    title: 'Statistiques',
    description: 'Analysez la performance de votre cabinet en temps réel : revenus, fréquentation et analyses prédictives.',
    tagline: 'Votre cabinet, d’un seul regard.',
    story: 'Les chiffres remplacent l’intuition. Vous décidez sur des faits.',
    steps: ['Ouvrez le tableau de bord', 'Repérez les tendances', 'Décidez'],
    outcomes: [
      { value: 12, suffix: ' mois', label: 'comparés' },
      { value: 0, suffix: '', label: 'tableur à remplir' },
    ],
  },
  {
    slug: 'securite',
    icon: 'verified_user',
    title: 'Sécurité Totale',
    description: 'Chiffrement de bout en bout et hébergement conforme à la protection des données de santé au Maroc.',
    tagline: 'Le secret médical, protégé.',
    story: 'Chacun voit ce qui le concerne. Le reste reste verrouillé.',
    steps: ['Un rôle par personne', 'Verrouillage par PIN', 'Données chiffrées'],
    outcomes: [
      { value: 256, suffix: '-bit', label: 'chiffrement' },
      { value: 100, suffix: '%', label: 'des accès tracés' },
    ],
  },
];

export const getFeature = (slug?: string) => features.find((f) => f.slug === slug);
