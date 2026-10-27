import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { User } from "../types";
import { 
  UserPlus, 
  Users, 
  Key, 
  Shield, 
  Ban, 
  Check, 
  X, 
  Edit3, 
  Mail, 
  UserCheck2,
  Lock,
  Trash2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Activity,
  ShieldAlert,
  Hash,
  Building,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface UsersViewProps {
  currentUser: {
    id: string;
    username: string;
    role: "Administrateur" | "Utilisateur";
    nom: string;
    prenom: string;
  };
}

export default function UsersView({ currentUser }: UsersViewProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
 
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
 
  // Form states
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
 
  // Form Fields
  const [fieldNom, setFieldNom] = useState("");
  const [fieldPrenom, setFieldPrenom] = useState("");
  const [fieldEmail, setFieldEmail] = useState("");
  const [fieldUsername, setFieldUsername] = useState("");
  const [fieldPassword, setFieldPassword] = useState("");
  const [fieldRole, setFieldRole] = useState<"Administrateur" | "Utilisateur">("Utilisateur");
  const [fieldService, setFieldService] = useState("");
 
  // Reset password states
  const [showResetModal, setShowResetModal] = useState(false);
  const [userForReset, setUserForReset] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
 
  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const [usersData, servicesData] = await Promise.all([
        api.users.getAll(),
        api.services.getAll()
      ]);
      setUsers(usersData);
      setServices(servicesData);
    } catch (err: any) {
      setError(err.message || "Accès interdit ou indisponibilité du serveur");
    } finally {
      setIsLoading(false);
    }
  };
 
  useEffect(() => {
    if (currentUser.role !== "Administrateur") {
      setError("Accès refusé. Vous devez être administrateur pour consulter cette section.");
      setIsLoading(false);
      return;
    }
    loadUsers();
  }, [currentUser]);
 
  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };
 
  // Pagination
  const totalPages = Math.max(1, Math.ceil(users.length / itemsPerPage));
  useEffect(() => setCurrentPage(page => Math.min(page, totalPages)), [totalPages]);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentUsers = users.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFieldNom("");
    setFieldPrenom("");
    setFieldEmail("");
    setFieldUsername("");
    setFieldPassword("");
    setFieldRole("Utilisateur");
    setFieldService("");
    setFormError(null);
    setShowModal(true);
  };
 
  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFieldNom(user.Nom);
    setFieldPrenom(user.Prenom);
    setFieldEmail(user.Email || "");
    setFieldUsername(user.NomUtilisateur);
    setFieldPassword("");
    setFieldRole(user.Role);
    setFieldService(user.Service || "");
    setFormError(null);
    setShowModal(true);
  };
 
  const handleOpenResetPassword = (user: User) => {
    setUserForReset(user);
    setNewPassword("");
    setResetError(null);
    setShowResetModal(true);
  };
 
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
 
    if (!fieldNom.trim()) return setFormError("Le nom est requis.");
    if (!fieldPrenom.trim()) return setFormError("Le prénom est requis.");
    if (!fieldUsername.trim()) return setFormError("Le nom d'utilisateur est requis.");
    if (!editingUser && fieldPassword.length < 1) return setFormError("Veuillez saisir un mot de passe.");
    if (!editingUser && !fieldPassword) return setFormError("Mot de passe obligatoire à la création.");
 
    const finalService = fieldRole === "Administrateur" ? "" : fieldService;
    if (fieldRole === "Utilisateur" && !finalService) {
      return setFormError("Le service est obligatoire pour un utilisateur standard.");
    }

    try {
      if (editingUser) {
        await api.users.update(editingUser.Id, {
          Nom: fieldNom,
          Prenom: fieldPrenom,
          Email: fieldEmail,
          Role: fieldRole,
          Service: finalService
        });
        flashSuccess(`Compte de ${fieldPrenom} ${fieldNom} mis à jour.`);
      } else {
        await api.users.create({
          Nom: fieldNom,
          Prenom: fieldPrenom,
          Email: fieldEmail,
          NomUtilisateur: fieldUsername.trim().toLowerCase(),
          MotDePasse: fieldPassword,
          Role: fieldRole,
          Service: finalService
        });
        flashSuccess(`Compte '${fieldUsername}' créé avec succès.`);
      }
 
      setShowModal(false);
      loadUsers();
    } catch (err: any) {
      setFormError(err.message || "L'enregistrement a échoué");
    }
  };

  const handleSubmitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForReset) return;
    if (!newPassword || newPassword.length < 1) {
      setResetError("Veuillez saisir un mot de passe.");
      return;
    }

    try {
      await api.users.resetPassword(userForReset.Id, newPassword);
      flashSuccess(`Mot de passe de ${userForReset.NomUtilisateur} réinitialisé.`);
      setShowResetModal(false);
    } catch (err: any) {
      setResetError(err.message || "Erreur de réinitialisation");
    }
  };

  const handleToggleState = async (user: User) => {
    if (user.Id === currentUser.id) {
      alert("Vous ne pouvez pas désactiver votre propre compte.");
      return;
    }

    const nextStatut = user.Statut === "Actif" ? "Desactive" : "Actif";
    try {
      await api.users.update(user.Id, { Statut: nextStatut });
      flashSuccess(`Compte de ${user.NomUtilisateur} est maintenant ${nextStatut === "Actif" ? "Actif" : "Désactivé"}.`);
      loadUsers();
    } catch (err: any) {
      alert(err.message || "Action refusée");
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.Id === currentUser.id) {
      alert("Vous ne pouvez pas supprimer votre propre compte.");
      return;
    }

    if (user.Id === "u-admin") {
      alert("Le compte administrateur racine ne peut pas être supprimé.");
      return;
    }

    if (window.confirm(`Supprimer définitivement le compte de ${user.Prenom} ${user.Nom} ?`)) {
      try {
        await api.users.delete(user.Id);
        flashSuccess(`Compte de ${user.Prenom} ${user.Nom} supprimé.`);
        loadUsers();
      } catch (err: any) {
        alert(err.message || "La suppression a échoué.");
      }
    }
  };

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border-2 border-red-200 dark:border-red-800 rounded-2xl p-6 max-w-2xl mx-auto mt-12">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
            <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h4 className="font-bold text-red-800 dark:text-red-400 text-lg mb-1">Accès refusé</h4>
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const activeUsers = users.filter(u => u.Statut === "Actif").length;
  const inactiveUsers = users.filter(u => u.Statut === "Desactive").length;

  return (
    <div className="space-y-6">
      {/* En-tête avec gradient vert */}
      <div className="relative overflow-hidden bg-gradient-to-r from-green-700 via-green-600 to-emerald-600 rounded-2xl shadow-xl">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative p-6 text-white">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Users className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Gestion des comptes
                </span>
              </div>
              <h1 className="text-2xl font-bold mb-1">Administration utilisateurs</h1>
              <p className="text-sm text-white/80">
                Gérez les comptes, les rôles et les permissions
              </p>
            </div>
            <button
              onClick={handleOpenCreate}
              className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-semibold text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all transform hover:scale-105"
            >
              <UserPlus className="h-4 w-4" />
              Nouvel utilisateur
            </button>
          </div>
        </div>
      </div>

      {/* Cartes statistiques - Version verte */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total utilisateurs</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{users.length}</p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Comptes actifs</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{activeUsers}</p>
            </div>
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Comptes désactivés</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">{inactiveUsers}</p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <Ban className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Alertes */}
      {success && (
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-400 text-sm">Succès !</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">{success}</p>
          </div>
        </div>
      )}

      {/* Tableau des utilisateurs - Version verte */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tableau des utilisateurs</h2>
              <p className="text-xs text-white/80">Gestion des comptes, rôles et accès</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
              {users.length} compte{users.length > 1 ? "s" : ""}
            </span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
              {activeUsers} actif{activeUsers > 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent mx-auto"></div>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Chargement des utilisateurs...</p>
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex p-4 bg-gray-100 dark:bg-gray-700 rounded-2xl mb-4">
              <Users className="h-12 w-12 text-gray-400 dark:text-gray-500" />
            </div>
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Aucun utilisateur</h4>
            <p className="text-xs text-gray-400 dark:text-gray-500">Créez votre premier compte utilisateur</p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 text-green-600 hover:text-green-700 text-sm font-semibold flex items-center gap-1 mx-auto"
            >
              <UserPlus className="h-4 w-4" />
              Créer un utilisateur
            </button>
          </div>
        ) : (
          <>
              <div className="overflow-x-hidden">
                <table className="w-full table-fixed">
                <thead className="[&_th]:!text-center [&_th]:!py-3 [&_th]:!text-green-800 dark:[&_th]:!text-green-400">
                  <tr className="bg-gradient-to-r from-green-50 to-emerald-50 border-b-2 border-green-200 dark:from-gray-800 dark:to-gray-800 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-40">Utilisateur</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-24">Identifiant</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-24">Service</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-36">Email</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-24">Rôle</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-24">Création</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-24">Statut</th>
                    <th className="text-center py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentUsers.map((item, idx) => (
                    <tr key={item.Id} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/30 dark:bg-gray-800/30'}`}>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`h-7 w-7 rounded-xl flex items-center justify-center ${
                          item.Role === "Administrateur" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                        }`}>
                          {item.Prenom[0]}{item.Nom[0]}
                        </div>
                        <div>
                          <p className="font-bold text-gray-800 dark:text-gray-200 text-xs truncate" title={item.Prenom + " " + item.Nom}>{item.Prenom} {item.Nom}</p>
                          <p className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">ID: {item.Id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="font-mono text-xs font-medium text-green-700 dark:text-green-400 truncate block" title={item.NomUtilisateur}>@{item.NomUtilisateur}</span>
                    </td>
                    <td className="py-2 px-3">
                      {item.Service ? (
                        <span className="inline-flex text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-lg truncate block" title={item.Service}>{item.Service}</span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {item.Email ? (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                          <span className="text-xs text-gray-600 dark:text-gray-400 truncate" title={item.Email}>{item.Email}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">Non spécifié</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        item.Role === "Administrateur" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      }`}>
                        <Shield className="h-3 w-3" />
                        {item.Role}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{new Date(item.DateCreation).toLocaleDateString("fr-FR")}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleToggleState(item)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                          item.Statut === "Actif"
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${item.Statut === "Actif" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>
                        {item.Statut === "Actif" ? "Actif" : "Désactivé"}
                      </button>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          title="Modifier"
                          className="p-1 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 text-gray-500 dark:text-gray-400 hover:text-amber-600 transition"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenResetPassword(item)}
                          title="Réinitialiser mot de passe"
                          className="p-1 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-gray-500 dark:text-gray-400 hover:text-green-600 transition"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>
                        {item.Id !== currentUser.id && item.Id !== "u-admin" && (
                          <button
                            onClick={() => handleDeleteUser(item)}
                            title="Supprimer"
                            className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination - Version verte */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <div className="text-xs text-gray-500 dark:text-gray-400 order-2 sm:order-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Total: {users.length}</span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                  <span>Page {currentPage}/{totalPages}</span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                  <span>{currentUsers.length} utilisateur(s) affiché(s)</span>
                </div>

                <div className="flex items-center gap-2 order-1 sm:order-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-2 rounded-lg transition ${
                      currentPage === 1
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        Math.abs(page - currentPage) <= 1
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => goToPage(page)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                              currentPage === page
                                ? 'bg-green-600 text-white'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        (page === 2 && currentPage > 3) ||
                        (page === totalPages - 1 && currentPage < totalPages - 2)
                      ) {
                        return <span key={page} className="text-gray-400 dark:text-gray-500">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`p-2 rounded-lg transition ${
                      currentPage === totalPages
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL CRÉATION / MODIFICATION - Version verte */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 z-10 px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl">
                    {editingUser ? <Edit3 className="h-5 w-5 text-white" /> : <UserPlus className="h-5 w-5 text-white" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                      {editingUser ? `Modifier: ${editingUser.NomUtilisateur}` : "Nouvel utilisateur"}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {editingUser ? "Modifiez les informations du compte" : "Créez un nouveau compte utilisateur"}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {formError && (
                <div className="mb-5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSubmitForm} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm">Prénom *</label>
                    <input
                      type="text"
                      required
                      placeholder="Jean"
                      value={fieldPrenom}
                      onChange={(e) => setFieldPrenom(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm">Nom *</label>
                    <input
                      type="text"
                      required
                      placeholder="Dupont"
                      value={fieldNom}
                      onChange={(e) => setFieldNom(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm flex items-center gap-2">
                    <Mail className="h-4 w-4 text-green-600" />
                    Email (optionnel)
                  </label>
                  <input
                    type="email"
                    placeholder="exemple@entreprise.com"
                    value={fieldEmail}
                    onChange={(e) => setFieldEmail(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm flex items-center gap-2">
                      <Hash className="h-4 w-4 text-green-600" />
                      Identifiant *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={!!editingUser}
                      placeholder="jdupont"
                      value={fieldUsername}
                      onChange={(e) => setFieldUsername(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-700"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-600" />
                      Rôle *
                    </label>
                    <select
                      value={fieldRole}
                      onChange={(e) => {
                        const newRole = e.target.value as any;
                        setFieldRole(newRole);
                        if (newRole === "Administrateur") setFieldService("");
                      }}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition"
                    >
                      <option value="Utilisateur">Utilisateur standard</option>
                      <option value="Administrateur">Administrateur</option>
                    </select>
                  </div>
                </div>

                {fieldRole === "Utilisateur" && (
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm flex items-center gap-2">
                      <Building className="h-4 w-4 text-green-600" />
                      Service *
                    </label>
                    <select
                      required
                      value={fieldService}
                      onChange={(e) => setFieldService(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition"
                    >
                      <option value="">Sélectionner un service</option>
                      {services.map(ser => <option key={ser} value={ser}>{ser}</option>)}
                    </select>
                  </div>
                )}

                {fieldRole === "Administrateur" && (
                  <div className="bg-gradient-to-r from-purple-50 to-green-50 dark:from-purple-900/30 dark:to-green-900/30 rounded-xl p-3 border border-purple-100 dark:border-purple-800">
                    <p className="text-xs text-purple-800 dark:text-purple-400 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      <span className="font-semibold">Accès administrateur :</span>
                      Ce compte aura un accès global à toutes les fonctionnalités.
                    </p>
                  </div>
                )}

                {!editingUser && (
                  <div>
                    <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm flex items-center gap-2">
                      <Lock className="h-4 w-4 text-green-600" />
                      Mot de passe initial *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={fieldPassword}
                      onChange={(e) => setFieldPassword(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-md transition-all transform hover:scale-105 flex items-center gap-2"
                  >
                    {editingUser ? "Mettre à jour" : "Créer le compte"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RÉINITIALISATION MOT DE PASSE - Version verte */}
      {showResetModal && userForReset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                    <Key className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Réinitialisation</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mot de passe oublié</p>
                  </div>
                </div>
                <button onClick={() => setShowResetModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                  <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Utilisateur : <strong className="text-green-700 dark:text-green-400">{userForReset.Prenom} {userForReset.Nom}</strong> (@{userForReset.NomUtilisateur})
              </p>

              {resetError && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400">{resetError}</p>
                </div>
              )}

              <form onSubmit={handleSubmitReset}>
                <div className="mb-5">
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1.5 text-sm">Nouveau mot de passe *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-semibold rounded-xl shadow-md transition-all transform hover:scale-105"
                  >
                    Réinitialiser
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
