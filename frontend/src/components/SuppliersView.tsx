import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { 
  Building2, 
  Layers,
  MapPin,
  Plus, 
  Trash2, 
  X, 
  Search,
  FilterX,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Hash,
  TrendingUp,
  Database,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface SuppliersViewProps {
  currentUser: any;
}

type ManagementTab = "Services" | "Agences";

export default function SuppliersView({ currentUser }: SuppliersViewProps) {
  // Tabs State
  const [activeSubTab, setActiveSubTab] = useState<ManagementTab>("Services");

  // Data lists state
  const [services, setServices] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search filters
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<ManagementTab>("Services");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState("");

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [servicesData, agenciesData] = await Promise.all([
        api.services.getAll(),
        api.agencies.getAll()
      ]);
      setServices(servicesData);
      setAgencies(agenciesData);
    } catch (err: any) {
      setError(err.message || "Erreur de chargement des données.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  const handleOpenCreateInput = (type: ManagementTab) => {
    setModalType(type);
    setFieldName("");
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fieldName.trim();
    if (!trimmed) {
      setFormError(`Le nom du ${modalType === "Services" ? "service" : "de l'agence"} est obligatoire.`);
      return;
    }

    try {
      if (modalType === "Services") {
        const updated = await api.services.create(trimmed);
        setServices(updated);
        flashSuccess(`Service "${trimmed}" créé avec succès.`);
      } else {
        const updated = await api.agencies.create(trimmed);
        setAgencies(updated);
        flashSuccess(`Agence "${trimmed}" créée avec succès.`);
      }
      setShowModal(false);
      setCurrentPage(1);
    } catch (err: any) {
      setFormError(err.message || "Impossible d'ajouter cet élément.");
    }
  };

  const handleDeleteItem = async (name: string, type: ManagementTab) => {
    if (currentUser.role !== "Administrateur") {
      alert("Droits administrateur requis.");
      return;
    }

    const typeLabel = type === "Services" ? "le service" : "l'agence";
    if (window.confirm(`Supprimer définitivement ${typeLabel} "${name}" ?`)) {
      try {
        if (type === "Services") {
          const updated = await api.services.delete(name);
          setServices(updated);
          flashSuccess(`Service "${name}" supprimé.`);
        } else {
          const updated = await api.agencies.delete(name);
          setAgencies(updated);
          flashSuccess(`Agence "${name}" supprimée.`);
        }
        setCurrentPage(1);
      } catch (err: any) {
        alert(err.message || "Erreur lors de la suppression.");
      }
    }
  };

  const currentItems = activeSubTab === "Services" ? services : agencies;
  const filteredItems = currentItems.filter((item) => {
    if (searchQuery && !item.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItemsPaginated = filteredItems.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Reset à la page 1 quand les filtres changent
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeSubTab]);

  const totalItems = currentItems.length;
  const filteredCount = filteredItems.length;

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
                  <Building2 className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Configuration organisationnelle
                </span>
              </div>
              <h1 className="text-2xl font-bold mb-1">Services & Agences</h1>
              <p className="text-sm text-white/80">
                Gérez les services émetteurs et les agences fournisseurs
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Database className="h-3 w-3" />
              <span className="text-xs font-medium">{currentUser.role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Onglets et actions - Version verte */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-2 bg-white dark:bg-gray-800 rounded-2xl p-1 border border-gray-100 dark:border-gray-800 shadow-sm">
          <button
            onClick={() => {
              setActiveSubTab("Services");
              setSearchQuery("");
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
              activeSubTab === "Services"
                ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <Layers className="h-4 w-4" />
            Services
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
              activeSubTab === "Services" ? "bg-white/20 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
            }`}>
              {services.length}
            </span>
          </button>
          <button
            onClick={() => {
              setActiveSubTab("Agences");
              setSearchQuery("");
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
              activeSubTab === "Agences"
                ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-md"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <MapPin className="h-4 w-4" />
            Agences
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${
              activeSubTab === "Agences" ? "bg-white/20 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
            }`}>
              {agencies.length}
            </span>
          </button>
        </div>

        <button
          onClick={() => handleOpenCreateInput(activeSubTab)}
          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition-all transform hover:scale-105"
        >
          <Plus className="h-4 w-4" /> 
          {activeSubTab === "Services" ? "Nouveau service" : "Nouvelle agence"}
        </button>
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

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-400 text-sm">Erreur</p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Barre de recherche - Version verte */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={activeSubTab === "Services" ? "Rechercher un service..." : "Rechercher une agence..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition-all"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all text-sm font-medium"
            >
              <FilterX className="h-4 w-4" />
              Effacer
            </button>
          )}
        </div>

        {/* Statistiques de recherche */}
        {searchQuery && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {filteredCount} résultat{filteredCount > 1 ? 's' : ''} sur {totalItems}
            </p>
          </div>
        )}
      </div>

      {/* Liste principale avec pagination - Version verte */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent mx-auto"></div>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Chargement...</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex p-4 bg-gray-100 dark:bg-gray-700 rounded-2xl mb-4">
              {activeSubTab === "Services" ? (
                <Layers className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              ) : (
                <MapPin className="h-12 w-12 text-gray-400 dark:text-gray-500" />
              )}
            </div>
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Aucun élément trouvé</h4>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {searchQuery
                ? "Aucun résultat ne correspond à votre recherche"
                : `Aucun ${activeSubTab === "Services" ? "service" : "agence"} n'est encore enregistré`}
            </p>
            {!searchQuery && (
              <button
                onClick={() => handleOpenCreateInput(activeSubTab)}
                className="mt-4 text-green-600 hover:text-green-700 text-sm font-semibold flex items-center gap-1 mx-auto"
              >
                <Plus className="h-4 w-4" />
                Ajouter un {activeSubTab === "Services" ? "service" : "agence"}
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 dark:bg-gray-800 dark:border-gray-700">
                  <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-1/2">Nom</th>
                  <th className="text-left py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-1/3">ID</th>
                  <th className="text-center py-2 px-3 text-xs font-bold text-gray-600 dark:text-gray-400 uppercase w-1/6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentItemsPaginated.map((item, index) => (
                  <tr key={item} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/30 dark:bg-gray-800/30'}`}>
                    <td className="py-2 px-3 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          activeSubTab === "Services"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                            : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {activeSubTab === "Services" ? (
                            <Layers className="h-3.5 w-3.5" />
                          ) : (
                            <MapPin className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm truncate" title={item}>{item}</p>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate" title={item.toLowerCase().replace(/\s+/g, '_')}>ID: {item.toLowerCase().replace(/\s+/g, '_')}</p>
                    </td>

                    <td className="py-2 px-3">
                      <div className="flex items-center justify-center gap-1">
                        {currentUser.role === "Administrateur" ? (
                          <button
                            onClick={() => handleDeleteItem(item, activeSubTab)}
                            className="p-1 rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all duration-200"
                            title={`Supprimer ${activeSubTab === "Services" ? "ce service" : "cette agence"}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
                            <ShieldAlert className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                            <span className="text-[9px] text-gray-400 dark:text-gray-500">Admin</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination - Version verte */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                <div className="text-xs text-gray-500 dark:text-gray-400 order-2 sm:order-1">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Total: {filteredItems.length}</span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                  <span>Page {currentPage}/{totalPages}</span>
                  <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                  <span>{currentItemsPaginated.length} élément(s) affiché(s)</span>
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

      {/* Carte récapitulative - Version verte */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded-2xl p-4 border border-green-100 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Total des éléments</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{filteredItems.length}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {activeSubTab === "Services" ? "Services actifs" : "Agences enregistrées"}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Dernière mise à jour: {new Date().toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CRÉATION - Version verte */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className={`p-6 ${
              modalType === "Services" 
                ? "bg-gradient-to-r from-green-600 to-green-700" 
                : "bg-gradient-to-r from-emerald-600 to-emerald-700"
            } text-white`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-white/20 rounded-lg">
                    {modalType === "Services" ? (
                      <Layers className="h-5 w-5" />
                    ) : (
                      <MapPin className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">
                      {modalType === "Services" ? "Nouveau service" : "Nouvelle agence"}
                    </h3>
                    <p className="text-xs text-white/80 mt-0.5">
                      {modalType === "Services" 
                        ? "Ajoutez un service émetteur de commandes" 
                        : "Ajoutez une agence fournisseur"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {formError && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400">{formError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-2 text-sm flex items-center gap-2">
                    <Hash className="h-4 w-4 text-green-600" />
                    {modalType === "Services" ? "Nom du service" : "Nom de l'agence"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={modalType === "Services"
                      ? "Ex: Ressources Humaines, Logistique..."
                      : "Ex: Agence de Douala, Agence de Yaoundé..."}
                    value={fieldName}
                    onChange={(e) => setFieldName(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition-all duration-200"
                    autoFocus
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                    Ce nom sera utilisable dans les formulaires de commande
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 px-4 py-2.5 text-white font-semibold rounded-xl shadow-md transition-all transform hover:scale-105 flex items-center justify-center gap-2 ${
                      modalType === "Services"
                        ? "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                        : "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800"
                    }`}
                  >
                    Créer
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