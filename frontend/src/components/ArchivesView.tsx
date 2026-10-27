import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useOrdersRefresh } from "../hooks/useOrdersRefresh";
import { filterOrders, totalPrice, sortOrdersNewestFirst } from "../utils/orderCalculations";
import { api } from "../services/api";
import { Order, Supplier } from "../types";
import { 
  Archive, 
  RotateCcw, 
  Trash2, 
  Search, 
  Calendar, 
  SlidersHorizontal, 
  X, 
  Info, 
  Sparkles, 
  Activity, 
  ToggleLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  User as UserIcon,
  ShoppingBag,
  FileText,
  FileSpreadsheet,
  Clock,
  ShieldCheck,
  Building,
  Package,
  Truck,
  AlertCircle,
  CheckCircle2,
  Database,
  Hash,
  Users,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { exportToCSV, exportToPDF } from "../utils/exportUtils";

interface ArchivesViewProps {
  currentUser: any;
}

// Interface pour les commandes groupées
interface GroupedArchiveOrder {
  bonCommande: string;
  items: Order[];
  firstItem: Order;
  statusSummary: Record<string, number>;
  totalQuantite: number;
  totalPrix: number;
}

export default function ArchivesView({ currentUser }: ArchivesViewProps) {
  const [restoreGroup, setRestoreGroup] = useState<GroupedArchiveOrder | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Archive config states
  const [autoDays, setAutoDays] = useState(30);
  const [isAutoEnabled, setIsAutoEnabled] = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterDateStart, setFilterDateStart] = useState<string>("");
  const [filterDateEnd, setFilterDateEnd] = useState<string>("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Detail Modal States
  const [selectedDetailedOrder, setSelectedDetailedOrder] = useState<Order | null>(null);
  const [detailedOrderHistory, setDetailedOrderHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // State pour les détails groupés
  const [selectedGroupForDetail, setSelectedGroupForDetail] = useState<GroupedArchiveOrder | null>(null);

  // State pour le chargement des restaurations individuelles
  const [restoringItems, setRestoringItems] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [archivesData, suppliersData, servicesData, agenciesData, configData] = await Promise.all([
        api.orders.getAll(true),
        api.suppliers.getAll(),
        api.services.getAll(),
        api.agencies.getAll(),
        api.archiveConfig.get()
      ]);
      setArchivedOrders(archivesData);
      setSuppliers(suppliersData);
      setServices(servicesData);
      setAgencies(agenciesData);
      setAutoDays(configData.autoArchiveDays);
      setIsAutoEnabled(configData.enableAutoArchive);
    } catch (err: any) {
      setError(err.message || "Erreur de chargement des archives");
      console.error("Erreur de chargement des archives", err);
    } finally {
      setIsLoading(false);
    }
  };

  useOrdersRefresh(loadData);
  useEffect(() => {
    loadData();
  }, []);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  // Fonction pour grouper les commandes archivées par NoBonCommande
  const groupArchivedOrders = (orders: Order[]): GroupedArchiveOrder[] => {
    const grouped = sortOrdersNewestFirst(orders).reduce((acc, order) => {
      const key = order.NoBonCommande;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(order);
      return acc;
    }, {} as Record<string, Order[]>);
    
    return Object.entries(grouped).map(([bonCommande, items]) => ({
      bonCommande,
      items,
      firstItem: items[0],
      statusSummary: items.reduce((stats, item) => {
        stats[item.Statut] = (stats[item.Statut] || 0) + 1;
        return stats;
      }, {} as Record<string, number>),
      totalQuantite: items.reduce((sum, item) => sum + item.Quantite, 0),
      totalPrix: totalPrice(items)
    }));
  };

  // Génère un identifiant stable et quasi unique par groupe d'archives
  const filteredArchives = filterOrders(archivedOrders, searchTerm, filterUser, filterDateStart, filterDateEnd);
  const groupedArchives = groupArchivedOrders(filteredArchives);
  const paginatedData = groupedArchives.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.max(1, Math.ceil(groupedArchives.length / itemsPerPage));
  const uniqueUsers = [...new Set(archivedOrders.map(order => order.CreePar || order.DemandePar).filter(Boolean))] as string[];
  useEffect(() => setCurrentPage(1), [searchTerm, filterUser, filterDateStart, filterDateEnd]);
  useEffect(() => setCurrentPage(page => Math.min(page, totalPages)), [totalPages]);
  const goToPage = (page: number) => setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  const handleClearFilters = () => { setSearchTerm(String()); setFilterUser(String()); setFilterDateStart(String()); setFilterDateEnd(String()); setCurrentPage(1); };
  const getStatusColor = (status: string): string => {
    const cleanStatus = status.split('(')[0].trim();
    switch (cleanStatus) {
      case "Livré": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "En cours": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "Terminé": return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
      case "Non livré": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.archiveConfig.update({ autoArchiveDays: autoDays, enableAutoArchive: isAutoEnabled });
      flashSuccess("Configuration d'archivage enregistrée.");
      setShowConfig(false);
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement de la configuration");
    }
  };

  const handleViewGroupDetail = (group: GroupedArchiveOrder) => {
    setSelectedGroupForDetail(group);
  };

  const handleOpenDetailModal = async (order: Order) => {
    try {
      const res = await api.orders.getHistory(order.Id);
      setDetailedOrderHistory(res.history);
      setSelectedDetailedOrder(order);
    } catch (err: any) {
      setError(err.message || "Erreur lors du chargement de l'historique");
    }
  };

  const handleRestoreAll = (group: GroupedArchiveOrder) => {
    setRestoreError("");
    setRestoreGroup(group);
  };

  const confirmRestoreAll = async () => {
    if (!restoreGroup || restoreBusy) return;
    setRestoreBusy(true); setRestoreError("");
    try {
      await api.orders.batch(restoreGroup.items.map(item => ({ action: "restore", id: item.Id })));
      flashSuccess("Tous les articles du bon ont \u00e9t\u00e9 restaur\u00e9s.");
      if (selectedGroupForDetail?.bonCommande === restoreGroup.bonCommande) setSelectedGroupForDetail(null);
      setRestoreGroup(null);
      await loadData();
    } catch (err: any) { setRestoreError(err.message || "Erreur lors de la restauration"); }
    finally { setRestoreBusy(false); }
  };

  const handlePermanentDeleteAll = async (group: GroupedArchiveOrder) => {
    if (!window.confirm(`Supprimer définitivement tous les articles du bon ${group.bonCommande} ?`)) return;
    try {
      await api.orders.batch(group.items.map(item => ({ action: "delete", id: item.Id })));
      flashSuccess(`Tous les articles du bon ${group.bonCommande} ont été supprimés.`);
      if (selectedGroupForDetail?.bonCommande === group.bonCommande) {
        setSelectedGroupForDetail(null);
      }
      loadData();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la suppression");
    }
  };

  const handleRestoreSingle = async (item: Order) => {
    setRestoringItems(prev => new Set(prev).add(item.Id));
    try {
      await api.orders.restore(item.Id);
      flashSuccess(`Article "${item.Designation}" restauré.`);
      if (selectedGroupForDetail) {
        const updatedGroup = {
          ...selectedGroupForDetail,
          items: selectedGroupForDetail.items.filter(i => i.Id !== item.Id)
        };
        if (updatedGroup.items.length === 0) {
          setSelectedGroupForDetail(null);
        } else {
          setSelectedGroupForDetail(updatedGroup);
        }
      }
      loadData();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la restauration");
    } finally {
      setRestoringItems(prev => {
        const next = new Set(prev);
        next.delete(item.Id);
        return next;
      });
    }
  };

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
                  <Archive className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Module d'archivage
                </span>
              </div>
              <h1 className="text-2xl font-bold mb-1">Archives des Commandes</h1>
              <p className="text-sm text-white/80">
                Consultez l'historique complet des commandes clôturées
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <ShieldCheck className="h-3 w-3" />
              <span className="text-xs font-medium">{currentUser.role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-1 bg-green-600 rounded-full"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {groupedArchives.length} bon{groupedArchives.length > 1 ? 's' : ''} de commande archivé{groupedArchives.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV(groupedArchives, "Archives_Commandes", true)}
            className="bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs px-4 py-2 rounded-xl border border-gray-200 shadow-sm dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-700 flex items-center gap-2 transition-all hover:shadow-md"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> CSV
          </button>
          <button
            onClick={() => exportToPDF(groupedArchives, "Archives des Commandes", true)}
            className="bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs px-4 py-2 rounded-xl border border-gray-200 shadow-sm dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-700 flex items-center gap-2 transition-all hover:shadow-md"
          >
            <FileText className="h-4 w-4 text-red-500" /> PDF
          </button>
          {currentUser.role === "Administrateur" && (
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="bg-green-50 hover:bg-green-100 text-green-700 font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-all dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-400"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Configuration
              {showConfig ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Alertes */}
      {success && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-xl p-4 flex items-start gap-3 animate-fade-in dark:bg-emerald-900/30">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5 dark:text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-800 text-sm dark:text-emerald-300">Succès !</p>
            <p className="text-xs text-emerald-700 mt-0.5 dark:text-emerald-400">{success}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 flex items-start gap-3 animate-fade-in dark:bg-red-900/30">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5 dark:text-red-400" />
          <div>
            <p className="font-semibold text-red-800 text-sm dark:text-red-300">Erreur</p>
            <p className="text-xs text-red-700 mt-0.5 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Configuration Panel */}
      <AnimatePresence>
        {showConfig && currentUser.role === "Administrateur" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSaveConfig} className="bg-gradient-to-br from-green-50/80 to-emerald-50/80 border border-green-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="font-bold text-gray-800 dark:text-gray-200">Politique d'archivage automatique</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Configurez les règles d'archivage automatique des commandes</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAutoEnabled}
                      onChange={(e) => setIsAutoEnabled(e.target.checked)}
                      className="rounded-lg text-green-600 h-4 w-4"
                    />
                    <span className="font-medium text-gray-700 dark:text-gray-300">Activer l'archivage automatique</span>
                  </label>
                  <p className="text-xs text-gray-500 ml-7 dark:text-gray-400">
                    Les commandes livrées seront automatiquement déplacées vers les archives après le délai configuré.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="font-bold text-gray-700 block dark:text-gray-300">Délai d'archivage (jours)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      required
                      value={autoDays}
                      onChange={(e) => setAutoDays(Number(e.target.value))}
                      disabled={!isAutoEnabled}
                      className="w-28 bg-white border-2 border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 text-center focus:border-green-500 disabled:opacity-50 disabled:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:disabled:bg-gray-700"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">jours après la livraison</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-green-200 dark:border-green-800">
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  className="px-5 py-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl border border-gray-200 transition dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 dark:border-gray-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-md transition-all transform hover:scale-105"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info panel */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-4 flex items-start gap-3 border border-green-100 dark:border-green-800">
        <div className="p-2 bg-green-100 rounded-xl dark:bg-green-900/30">
          <Info className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h4 className="font-bold text-gray-800 text-sm mb-1 dark:text-gray-200">À propos des archives</h4>
          <p className="text-xs text-gray-600 leading-relaxed dark:text-gray-400">
            Les commandes archivées sont retirées du registre principal pour optimiser les performances tout en préservant 
            l'intégralité des données. Les articles d'un même bon de commande restent groupés pour faciliter la consultation.
            Vous pouvez restaurer les articles individuellement ou en groupe.
          </p>
        </div>
      </div>

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 dark:bg-gray-800 dark:border-gray-800">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher par N° bon, N° DS, désignation ou fournisseur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-green-500 focus:bg-white transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>

          <div className="relative min-w-[200px]">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-green-500 focus:bg-white transition-all appearance-none cursor-pointer dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:bg-gray-800"
            >
              <option value="">Tous les utilisateurs</option>
              {uniqueUsers.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>

          <div className="relative min-w-[160px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              type="date"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
              max={filterDateEnd || undefined}
              title="Date de début"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-green-500 focus:bg-white transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>

          <div className="relative min-w-[160px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              type="date"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
              min={filterDateStart || undefined}
              title="Date de fin"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-green-500 focus:bg-white transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:focus:bg-gray-800"
            />
          </div>

          <button
            onClick={handleClearFilters}
            className="text-xs text-gray-500 hover:text-green-600 font-medium px-4 py-2.5 hover:bg-gray-50 rounded-xl transition-all flex items-center gap-1 border border-gray-200 hover:border-green-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:border-gray-700"
          >
            <RotateCcw className="h-4 w-4" /> Réinitialiser
          </button>
        </div>
      </div>

      {/* Tableau des archives groupées - Sans icônes ni lignes de séparation */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-800">
        {/* En-tête du tableau avec titre */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Archive className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tableau des Archives</h2>
              <p className="text-xs text-white/80">Liste des commandes archivées regroupées par bon de commande</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
              {groupedArchives.length} bon(s)
            </span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
              {archivedOrders.length} article(s)
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent mx-auto"></div>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Chargement des archives...</p>
            </div>
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="text-center py-16">
            <Archive className="h-12 w-12 text-gray-300 mx-auto mb-3 dark:text-gray-600" />
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">Aucune archive trouvée</h4>
            <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">Ajustez vos filtres ou archivez des commandes depuis le registre principal</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-hidden">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="bg-gradient-to-r from-green-50 to-emerald-50 border-b-2 border-green-200 dark:from-gray-800 dark:to-gray-800 dark:border-gray-700">
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[13%]">
                      N° Bon
                    </th>
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[9%]">
                      Date Émission
                    </th>
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[18%]">
                      Désignation
                    </th>
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[6%]">
                      Qté
                    </th>
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[14%]">
                      Motif
                    </th>
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[10%]">
                      Service
                    </th>
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[13%]">
                      Statut
                    </th>
                    <th className="text-center py-3 px-2 text-xs font-bold text-green-800 dark:text-green-400 uppercase w-[17%]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((group, groupIndex) => {
                    const cmd = group.firstItem;
                    const uniqueId = cmd.NumeroSysteme || '-----';
                    
                    return (
                      <tr key={group.bonCommande} className="border-b border-gray-100 hover:bg-green-50/30 transition-colors dark:border-gray-800 dark:hover:bg-gray-700/50">
                        <td className="py-2 px-2 align-top">
                          <div className="font-bold text-gray-900 text-sm dark:text-gray-100 truncate text-center" title={group.bonCommande}>
                            {group.bonCommande}
                          </div>
                          <div className="text-xs text-gray-500 font-mono mt-0.5 text-center dark:text-gray-400">
                            {group.items.length} article{group.items.length > 1 ? 's' : ''}
                          </div>
                          <div className="flex items-center justify-center gap-1.5 mt-1.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded text-sm font-mono font-bold text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                              <Hash className="h-3.5 w-3.5" />
                              {uniqueId}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-gray-700 mt-0.5 bg-gray-50 px-2 py-0.5 rounded inline-block text-center dark:text-gray-300 dark:bg-gray-700">
                            {cmd.CreePar || cmd.DemandePar || "Non spécifié"}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top text-center">
                          <div className="text-sm text-gray-700 dark:text-gray-300" title={new Date(cmd.DateEmission).toLocaleDateString("fr-FR")}>
                            {new Date(cmd.DateEmission).toLocaleDateString("fr-FR")}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">
                            {new Date(cmd.DateEmission).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5 dark:text-gray-500">
                            Archivé: {cmd.DateArchivage ? new Date(cmd.DateArchivage).toLocaleDateString("fr-FR") : "--"}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <div className="text-sm text-gray-700 space-y-0.5 max-h-16 overflow-y-auto dark:text-gray-300">
                            {group.items.map((item, idx) => (
                              <div key={idx} className="truncate text-xs text-center" title={item.Designation}>
                                • {item.Designation}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top text-center">
                          <div className="space-y-0.5">
                            {group.items.map((item, idx) => (
                              <div key={idx} className="text-xs text-gray-700 dark:text-gray-300">
                                {item.Quantite}
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] font-bold text-gray-500 mt-1 border-t border-gray-100 pt-1 dark:text-gray-400 dark:border-gray-800">
                            Total: {group.totalQuantite}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <div className="space-y-0.5 text-xs text-gray-700 dark:text-gray-300">
                            {group.items.some(item => item.Observation || item.Motif) ? (
                              group.items.map((item, idx) => (item.Observation || item.Motif) ? (
                                <div key={idx} className="text-center whitespace-pre-wrap break-words">
                                  • {(item.Observation || item.Motif)!}
                                </div>
                              ) : null)
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 text-center">-</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top text-center">
                          <span className="inline-flex text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-lg dark:text-green-400 dark:bg-green-900/30">
                            {cmd.Agence}
                          </span>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <div className="flex flex-col gap-0.5 items-center">
                            {group.items.map((item, idx) => (
                              <span key={idx} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusColor(item.Statut)}`}>
                                {item.Statut}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            <button 
                              onClick={() => handleViewGroupDetail(group)} 
                              title="Voir détails" 
                              className="p-1.5 rounded-lg hover:bg-green-50 text-gray-500 hover:text-green-600 transition transform hover:scale-110 dark:hover:bg-green-900/30 dark:text-gray-400"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button 
                              onClick={() => handleOpenDetailModal(cmd)} 
                              title="Historique" 
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-green-600 transition transform hover:scale-110 dark:hover:bg-gray-700 dark:text-gray-400"
                            >
                              <Clock className="h-4 w-4" />
                            </button>
                            {currentUser.role === "Administrateur" && (
                              <>
                                <button
                                  onClick={() => handleRestoreAll(group)}
                                  title="Restaurer tous les articles"
                                  className="p-1.5 rounded-lg hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 transition transform hover:scale-110 dark:hover:bg-emerald-900/30 dark:text-gray-400"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handlePermanentDeleteAll(group)}
                                  title="Supprimer définitivement tous les articles"
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition transform hover:scale-110 dark:hover:bg-red-900/30 dark:text-gray-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/50">
              <div className="text-xs text-gray-500 order-2 sm:order-1 dark:text-gray-400">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Total: {groupedArchives.length}</span>
                <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                <span>Page {currentPage}/{totalPages || 1}</span>
                <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                <span>{paginatedData.length} bon(s) affiché(s)</span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1 order-1 sm:order-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-1.5 rounded-lg transition ${
                      currentPage === 1
                        ? 'text-gray-300 cursor-not-allowed dark:text-gray-600'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-0.5">
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
                            className={`px-3 py-0.5 rounded-lg text-xs font-medium transition ${
                              currentPage === page
                                ? 'bg-green-600 text-white'
                                : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
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
                    className={`p-1.5 rounded-lg transition ${
                      currentPage === totalPages
                        ? 'text-gray-300 cursor-not-allowed dark:text-gray-600'
                        : 'text-gray-600 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Carte récapitulative */}
      {!isLoading && groupedArchives.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-4 border border-green-100 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-xl dark:bg-green-900/30">
                <Database className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Total des bons archivés</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{groupedArchives.length}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {groupedArchives.reduce((acc, g) => acc + g.items.length, 0)} articles au total
              </p>
              <p className="text-xs text-green-600 mt-1 dark:text-green-400">
                Dernière mise à jour: {new Date().toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DÉTAILS GROUPÉS AVEC RESTAURATION INDIVIDUELLE */}
      <AnimatePresence>
        {selectedGroupForDetail && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col dark:bg-gray-800"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-green-700 to-emerald-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Archive className="h-4 w-4 text-green-200" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-green-200">Détails de l'archive groupée</span>
                  </div>
                  <h3 className="text-xl font-bold">{selectedGroupForDetail.bonCommande}</h3>
                  <p className="text-sm text-green-200 mt-0.5">
                    {selectedGroupForDetail.items.length} article{selectedGroupForDetail.items.length > 1 ? 's' : ''} • 
                    Archivé le {selectedGroupForDetail.firstItem.DateArchivage ? new Date(selectedGroupForDetail.firstItem.DateArchivage).toLocaleDateString("fr-FR") : "--"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedGroupForDetail(null)}
                  className="p-2 rounded-xl hover:bg-white/10 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Informations générales du bon */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">N° DS</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedGroupForDetail.firstItem.NoDS || "Non renseigné"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">N° système</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedGroupForDetail.firstItem.NumeroSysteme || "Non renseigné"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Date d'émission</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{new Date(selectedGroupForDetail.firstItem.DateEmission).toLocaleString("fr-FR")}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Créée par</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedGroupForDetail.firstItem.CreePar || "Non renseigné"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Demandée par</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedGroupForDetail.firstItem.DemandePar || "Non renseigné"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Service demandeur</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedGroupForDetail.firstItem.ServiceDemande || selectedGroupForDetail.firstItem.Agence || "Non renseigné"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Date de modification</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedGroupForDetail.firstItem.DateModification ? new Date(selectedGroupForDetail.firstItem.DateModification).toLocaleString("fr-FR") : "Non renseignée"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Date d'archivage</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedGroupForDetail.firstItem.DateArchivage ? new Date(selectedGroupForDetail.firstItem.DateArchivage).toLocaleString("fr-FR") : "Non renseignée"}</p>
                  </div>
                </div>

                {/* Résumé */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/30 dark:border-green-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total articles</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">{selectedGroupForDetail.items.length}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/30 dark:border-green-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Quantité totale</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">{selectedGroupForDetail.totalQuantite}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/30 dark:border-green-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Prix total</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">
                      {selectedGroupForDetail.totalPrix > 0 ? `${selectedGroupForDetail.totalPrix.toLocaleString()} FCFA` : '-'}
                    </p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/30 dark:border-green-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Service</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400">{selectedGroupForDetail.firstItem.Agence}</p>
                  </div>
                </div>

                {/* Liste des articles avec boutons de restauration individuels */}
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-800 dark:text-gray-200">Articles détaillés</h4>
                  {currentUser.role === "Administrateur" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          handleRestoreAll(selectedGroupForDetail);
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-xs font-semibold rounded-lg shadow-md transition-all flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Restaurer tout
                      </button>
                      <button
                        onClick={() => {
                          handlePermanentDeleteAll(selectedGroupForDetail);
                        }}
                        className="px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-semibold rounded-lg shadow-md transition-all flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Supprimer tout
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {selectedGroupForDetail.items.map((item, idx) => {
                    const isRestoring = restoringItems.has(item.Id);
                    return (
                      <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/30 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                          <div>
                            <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">Article {idx + 1}</p>
                            <p className="text-base font-semibold text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{item.Designation || "Non renseignée"}</p>
                          </div>
                          <div className="flex items-center gap-2 self-start">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(item.Statut)}`}>
                              {item.Statut}
                            </span>
                            {currentUser.role === "Administrateur" && (
                              <button
                                onClick={() => handleRestoreSingle(item)}
                                disabled={isRestoring}
                                className={`p-1.5 rounded-lg transition-all ${isRestoring ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500' : 'hover:bg-emerald-50 text-gray-500 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:text-gray-400 dark:hover:text-emerald-400'}`}
                                title="Restaurer cet article"
                              >
                                {isRestoring ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent"></div> : <RotateCcw className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                          <div><p className="text-xs text-gray-500 dark:text-gray-400">Identifiant</p><p className="font-medium text-gray-800 dark:text-gray-200 break-all">{item.Id}</p></div>
                          <div><p className="text-xs text-gray-500 dark:text-gray-400">Quantité</p><p className="font-medium text-gray-800 dark:text-gray-200">{item.Quantite}</p></div>
                          <div><p className="text-xs text-gray-500 dark:text-gray-400">Prix unitaire</p><p className="font-medium text-gray-800 dark:text-gray-200">{item.Prix !== undefined && item.Prix !== null ? `${item.Prix.toLocaleString()} FCFA` : "Non renseigné"}</p></div>
                          <div><p className="text-xs text-gray-500 dark:text-gray-400">N° Réception Sage X3</p><p className="font-medium text-gray-800 dark:text-gray-200 break-words">{item.ReferenceSage || "Non renseigné"}</p></div>
                          <div><p className="text-xs text-gray-500 dark:text-gray-400">Livraison prévue</p><p className="font-medium text-gray-800 dark:text-gray-200">{item.DateLivraison ? new Date(item.DateLivraison).toLocaleDateString("fr-FR") : "Non renseignée"}</p></div>
                          <div><p className="text-xs text-gray-500 dark:text-gray-400">Service / agence</p><p className="font-medium text-gray-800 dark:text-gray-200 break-words">{item.Agence || "Non renseigné"}</p></div>
                          <div><p className="text-xs text-gray-500 dark:text-gray-400">Fournisseur</p><p className="font-medium text-gray-800 dark:text-gray-200 break-words">{item.Fournisseur || "Non renseigné"}</p></div>
                          <div className="sm:col-span-2"><p className="text-xs text-gray-500 dark:text-gray-400">Observation / motif</p><p className="font-medium text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{item.Observation || item.Motif || "Non renseigné"}</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0 dark:bg-gray-800 dark:border-gray-800">
                <button
                  onClick={() => setSelectedGroupForDetail(null)}
                  className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL HISTORIQUE */}
      {selectedDetailedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col dark:bg-gray-800">
            <div className="bg-gradient-to-r from-green-700 to-emerald-600 px-6 py-4 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg">Historique des statuts</h3>
                <p className="text-sm text-green-200">Commande: {selectedDetailedOrder.NoBonCommande}</p>
              </div>
              <button onClick={() => setSelectedDetailedOrder(null)} className="p-2 rounded-xl hover:bg-white/10 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isHistoryLoading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-green-600 border-t-transparent"></div>
                </div>
              ) : detailedOrderHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-300 mx-auto mb-2 dark:text-gray-600" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">Aucun historique</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-green-200 ml-4 space-y-4 dark:border-green-800">
                  {detailedOrderHistory.map((hist) => (
                    <div key={hist.Id} className="relative pl-6">
                      <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-green-600 ring-4 ring-green-100 dark:ring-green-900/30"></div>
                      <div className="bg-gray-50 rounded-xl p-4 dark:bg-gray-700">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(hist.DateModification).toLocaleDateString("fr-FR")}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{new Date(hist.DateModification).toLocaleTimeString("fr-FR")}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-lg text-xs line-through dark:bg-gray-600 dark:text-gray-300">{hist.AncienStatut}</span>
                          <span className="text-gray-400 dark:text-gray-500">→</span>
                          <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                            hist.NouveauStatut === "Livré" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                            hist.NouveauStatut === "Terminé" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          }`}>{hist.NouveauStatut}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Par: <span className="font-semibold text-gray-700 dark:text-gray-300">{hist.ModifiePar}</span></p>
                        {hist.Commentaire && (
                          <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200 italic dark:text-gray-400 dark:border-gray-600">"{hist.Commentaire}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end shrink-0 dark:bg-gray-800 dark:border-gray-800">
              <button onClick={() => setSelectedDetailedOrder(null)} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreGroup && <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="restore-title">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl animate-fade-in">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 flex items-start gap-4 text-white">
            <div className="rounded-2xl bg-white/20 p-3"><RotateCcw className="h-6 w-6" /></div>
            <div className="flex-1"><h2 id="restore-title" className="text-lg font-bold">Restaurer le bon de commande</h2><p className="text-sm text-white/80 mt-1">{restoreGroup.bonCommande}</p></div>
            <button type="button" disabled={restoreBusy} onClick={() => setRestoreGroup(null)} aria-label="Fermer" className="p-1 rounded-lg hover:bg-white/20 disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">Souhaitez-vous restaurer tous les articles de ce bon de commande ?</p>
            <div className="flex items-center gap-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 p-4"><Package className="h-5 w-5 text-green-600 dark:text-green-400" /><div><p className="text-sm font-semibold text-green-800 dark:text-green-300">{restoreGroup.items.length} article(s) &agrave; restaurer</p><p className="text-xs text-green-700 dark:text-green-400 mt-1">Ils seront de nouveau disponibles dans Gestion des commandes.</p></div></div>
            {restoreError && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 text-sm">{restoreError}</p>}
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
            <button type="button" disabled={restoreBusy} onClick={() => setRestoreGroup(null)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">Annuler</button>
            <button type="button" autoFocus disabled={restoreBusy} onClick={confirmRestoreAll} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-semibold shadow-md disabled:opacity-50"><RotateCcw className={restoreBusy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />{restoreBusy ? 'Restauration...' : 'Restaurer les articles'}</button>
          </div>
        </div>
      </div>}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
