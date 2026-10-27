export interface AuthUser {
  mustChangePassword?: boolean;
  id: string;
  username: string;
  role: "Administrateur" | "Utilisateur";
  nom: string;
  prenom: string;
  email: string;
  service?: string;
}

export interface AppNotification {
  Id: string;
  Lue: boolean;
  NoBonCommande: string;
  Designation: string;
  NouveauStatut: string;
  ModifiePar: string;
  Date: string;
}

export interface Prestation {
  Id: string;
  NoBonCommande: string;
  NoDS: string;
  Designation: string;
  Agence: string;
  Statut: 'Effectué' | 'Non effectué' | 'Terminé';
  Motif: string;
  FournisseurType: 'Achat Local' | 'Achat Import' | 'Agence' | 'Secretariat DG';
  FournisseurAgence: string;
  Fournisseur: string;
  CreeParId: string;
  CreePar: string;
  ServiceDemande: string;
  DateEmission: string;
  DateModification: string;
  EstArchive: boolean;
}

export interface PrestationHistory {
  Id: string;
  PrestationId: string;
  AncienStatut: string;
  NouveauStatut: string;
  Motif: string;
  DateModification: string;
  ModifiePar: string;
}

export interface User {
  Id: string;
  Nom: string;
  Prenom: string;
  Email?: string;
  NomUtilisateur: string;
  Role: "Administrateur" | "Utilisateur";
  Statut: "Actif" | "Desactive";
  DateCreation: string;
  DateModification?: string;
  Service?: string;
}

export interface Supplier {
  Id: string;
  NomFournisseur: string;
  TypeFournisseur: "Achat Local" | "Achat Import" | "Secretariat DG";
}

export interface Order {
  Id: string;
  NumeroSysteme?: string;
  NoBonCommande: string;
  NoDS: string;
  DateEmission: string;
  Designation: string;
  Quantite: number;
  Prix?: number;
  ReferenceSage?: string;
  DateLivraison: string;
  Statut: "En cours" | "Livré" | "Non livré" | "Terminé";
  CreePar: string;
  CreeParId?: string;
  DemandePar?: string;
  ServiceDemande?: string;
  Agence: string;
  EstArchive: boolean;
  DateArchivage?: string;
  DateModification?: string;
  Fournisseurs: Supplier[]; // Hydrated in response
  Fournisseur?: string;
  Observation?: string;
  Motif?: string;
}

export interface StatusHistory {
  Id: string;
  CommandeId: string;
  AncienStatut: string;
  NouveauStatut: string;
  DateModification: string;
  ModifiePar: string;
}

export interface ActivityLog {
  Id: string;
  Action: string;
  Utilisateur: string;
  DateAction: string;
  Details: string;
}

export interface DashboardStats {
  monthActivity: { total: number; byStatus: Record<string, number>; byUser: Record<string, number> };
  totalGlobal: number;
  totalActives: number;
  enCours: number;
  livres: number;
  nonLivres: number;
  archives: number;
  enRetard: number;
  procheLivraison: number;
  byAgency: Record<string, number>;
  bySupplier: Record<string, number>;
  byMonth: Record<string, number>;
}
