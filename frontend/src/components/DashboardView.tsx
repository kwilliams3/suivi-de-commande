import React, { useEffect, useState } from "react";
import { api } from "../services/api";
import { DashboardStats, Order } from "../types";
import { uniqueOrders, getRecentOrders } from "../utils/dashboard";
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Archive, 
  AlertTriangle, 
  Bell, 
  Building2, 
  UserSquare, 
  Calendar,
  Layers,
  ArrowRight,
  Package,
  Truck,
  BarChart3,
  Zap,
  Activity,
  Target
} from "lucide-react";

interface DashboardViewProps {
  onNavigate: (tab: string) => void;
  currentUser: any;
}

export default function DashboardView({ onNavigate, currentUser }: DashboardViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [delayedOrders, setDelayedOrders] = useState<Order[]>([]);
  const [upcomingOrders, setUpcomingOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Couleurs entreprise (vert)
  const greenColors = {
    primary: "green-600",
    primaryDark: "green-700",
    primaryLight: "green-500",
    secondary: "emerald-500",
    secondaryLight: "emerald-400",
    gradient: "from-green-700 via-green-600 to-emerald-500",
    gradientLight: "from-green-50 to-emerald-50",
    gradientBg: "from-green-900 via-green-800 to-green-700",
    text: "text-green-600",
    textDark: "text-green-700",
    bg: "bg-green-600",
    bgLight: "bg-green-50",
    border: "border-green-200",
    hover: "hover:bg-green-50",
  };

  useEffect(() => {
    async function loadData() {
      try {
        setError(null);
        setIsLoading(true);
        const [statsData, ordersData, archivedOrdersData] = await Promise.all([
          api.stats.get(),
          api.orders.getAll(false),
          api.orders.getAll(true)
        ]);
        setStats(statsData);
        const combinedOrders = [...ordersData, ...archivedOrdersData];
        setAllOrders(combinedOrders);
        setRecentOrders(getRecentOrders(combinedOrders));

        // Filter delayed orders
        const today = new Date();
        today.setHours(0,0,0,0);
        const delayed = ordersData.filter(cmd => {
          if (cmd.Statut === "Livré" || cmd.Statut === "Terminé" || cmd.EstArchive || !cmd.DateLivraison) return false;
          const delDate = new Date(cmd.DateLivraison);
          delDate.setHours(0,0,0,0);
          return delDate < today;
        });
        setDelayedOrders(uniqueOrders(delayed));

        // Filter upcoming (0 to 3 days from now)
        const upcoming = ordersData.filter(cmd => {
          if (cmd.Statut === "Livré" || cmd.Statut === "Terminé" || cmd.EstArchive || !cmd.DateLivraison) return false;
          const delDate = new Date(cmd.DateLivraison);
          delDate.setHours(0,0,0,0);
          const diffMs = delDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          return diffDays >= 0 && diffDays <= 3;
        });
        setUpcomingOrders(uniqueOrders(upcoming));
      } catch (err: any) {
        setError(err.message || "Statistiques indisponibles");
        console.error("Erreur de chargement des statistiques", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
    const refresh = () => setReload(value => value + 1);
    window.addEventListener('orders-changed', refresh);
    const interval = setInterval(refresh, 60000);
    return () => { clearInterval(interval); window.removeEventListener('orders-changed', refresh); };
  }, [reload]);

  if (error) return <div role="alert" className="p-6 text-red-600">{error}<button onClick={() => setReload(value => value + 1)} className="ml-4 underline">Réessayer</button></div>;

  if (isLoading || !stats) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-green-600 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 font-medium">Chargement des données...</p>
        </div>
      </div>
    );
  }

  // Find most active agency and supplier
  const topAgency = (Object.entries(stats.byAgency) as [string, number][]).sort((a,b) => b[1] - a[1])[0] || ["Aucune", 0];
  const topSupplier = (Object.entries(stats.bySupplier) as [string, number][]).sort((a,b) => b[1] - a[1])[0] || ["Aucun", 0];

  const statsCards = [
    { id: "total", label: "Commandes Actives", value: stats.totalActives, icon: Package, color: "green", bg: "from-green-600 to-emerald-500", description: "Bons avec des articles non archivés" },
    { id: "encours", label: "En Cours", value: stats.enCours, icon: Clock, color: "amber", bg: "from-amber-500 to-amber-600", description: "En traitement" },
    { id: "livre", label: "Livrées", value: stats.livres, icon: CheckCircle2, color: "emerald", bg: "from-emerald-500 to-emerald-600", description: "Livrées et vérifiées" },
    { id: "nonlivre", label: "Non Livrées", value: stats.nonLivres, icon: XCircle, color: "red", bg: "from-red-500 to-red-600", description: "Problèmes d'approvisionnement" },
    { id: "archive", label: "Archivées", value: stats.archives, icon: Archive, color: "purple", bg: "from-purple-500 to-purple-600", description: "Commandes terminées" }
  ];

  const monthStatusCounts = stats.monthActivity.byStatus;
  const monthUserCounts = stats.monthActivity.byUser;

  return (
    <div className="space-y-8">
      {/* Welcome Header avec Glassmorphism - Version Verte */}
      <div className="relative overflow-hidden bg-gradient-to-r from-green-700 via-green-600 to-emerald-600 rounded-2xl shadow-xl">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative p-6 text-white">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Activity className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Tableau de bord analytique
                </span>
              </div>
              <h1 className="text-2xl font-bold mb-1">
                Bonjour, {currentUser?.prenom} {currentUser?.nom}
              </h1>
              <p className="text-sm text-white/80">
                {currentUser?.role === "Administrateur" 
                  ? "Supervision globale de tous les services et commandes" 
                  : `Gestion du service : ${currentUser?.service || "Non rattaché"}`}
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium">Rôle : {currentUser?.role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alertes Dynamiques */}
      {(delayedOrders.length > 0 || upcomingOrders.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {delayedOrders.length > 0 && (
            <div className="group relative overflow-hidden bg-gradient-to-r from-red-50 to-red-100/50 dark:from-red-950/40 dark:to-red-900/20 rounded-xl border border-red-200 dark:border-red-800/50 p-5 hover:shadow-lg transition-all duration-300">
              <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative flex items-start gap-4">
                <div className="p-2 bg-red-500 rounded-lg shadow-lg">
                  <AlertTriangle className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-800 dark:text-red-400">Commandes en Retard ({delayedOrders.length})</h4>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                    {delayedOrders.length} commande{delayedOrders.length > 1 ? 's' : ''} dont la date de livraison est dépassée.
                  </p>
                  <button
                    onClick={() => onNavigate("Commandes")}
                    className="mt-3 text-xs font-semibold text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 flex items-center gap-1 group/btn"
                  >
                    Voir les détails 
                    <ArrowRight className="h-3 w-3 transition-transform group-hover/btn:translate-x-1" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {upcomingOrders.length > 0 && (
            <div className="group relative overflow-hidden bg-gradient-to-r from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50 p-5 hover:shadow-lg transition-all duration-300">
              <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
              <div className="relative flex items-start gap-4">
                <div className="p-2 bg-amber-500 rounded-lg shadow-lg">
                  <Bell className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400">Échéances Imminentes ({upcomingOrders.length})</h4>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {upcomingOrders.length} commande{upcomingOrders.length > 1 ? 's' : ''} à livrer dans les 72 heures.
                  </p>
                  <button
                    onClick={() => onNavigate("Commandes")}
                    className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 flex items-center gap-1 group/btn"
                  >
                    Consulter 
                    <ArrowRight className="h-3 w-3 transition-transform group-hover/btn:translate-x-1" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cartes KPI Modernes - Version Verte */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statsCards.map((card) => {
          // Déterminer la couleur du dégradé en fonction du type
          let gradientClass = "from-green-600 to-emerald-500";
          if (card.id === "encours") gradientClass = "from-amber-500 to-amber-600";
          else if (card.id === "livre") gradientClass = "from-emerald-500 to-emerald-600";
          else if (card.id === "nonlivre") gradientClass = "from-red-500 to-red-600";
          else if (card.id === "archive") gradientClass = "from-purple-500 to-purple-600";
          
          return (
            <div
              key={card.id}
              className="group relative overflow-hidden bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${gradientClass} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-xl bg-gradient-to-br ${gradientClass} shadow-lg`}>
                    <card.icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {card.label}
                  </span>
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{card.value}</h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{card.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Les statistiques comptent les bons de commande. Un bon contenant des articles de statuts différents peut apparaître dans plusieurs catégories, ou dans les commandes actives et archivées.
      </p>

      {/* Analyses et Rapports */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Distribution par Service - Version Verte */}
        <div className="hidden bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-lg transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Building2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Services</h3>
            </div>
            <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
              Distribution
            </span>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(stats.byAgency).length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">Aucune donnée disponible</p>
              </div>
            ) : (
              (Object.entries(stats.byAgency) as [string, number][])
                .sort((a,b) => b[1] - a[1])
                .slice(0, 7)
                .map(([agency, count]) => {
                  const percentage = stats.totalGlobal > 0 ? (count / stats.totalGlobal) * 100 : 0;
                  return (
                    <div key={agency} className="group">
                      <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <span className="truncate max-w-[150px]" title={agency}>{agency}</span>
                        <span className="text-gray-500 dark:text-gray-400">{count} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-600 to-emerald-500 rounded-full transition-all duration-500 group-hover:opacity-80" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-lg transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Activity className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">État des commandes</h3>
            </div>
            <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">
              Mois en cours
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="rounded-xl bg-green-50 dark:bg-green-900/30 p-3">
              <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase">Traitées</p>
              <p className="text-2xl font-bold text-green-800 dark:text-green-300">{stats.monthActivity.total}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-3">
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Utilisateurs</p>
              <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{Object.keys(monthUserCounts).length}</p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Par statut</p>
            {Object.entries(monthStatusCounts).length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">Aucune commande traitée ce mois-ci.</p>
            ) : (
              (Object.entries(monthStatusCounts) as [string, number][]).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{status}</span>
                  <span className="font-bold text-green-700 dark:text-green-400">{count}</span>
                </div>
              ))
            )}
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Par utilisateur</p>
            {Object.entries(monthUserCounts).length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">Aucune activité ce mois-ci.</p>
            ) : (
              (Object.entries(monthUserCounts) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([user, count]) => (
                <div key={user} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[180px]">
                    <UserSquare className="h-3.5 w-3.5 text-green-500 shrink-0" /> {user}
                  </span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Distribution par Fournisseur - Version Verte */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-lg transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Truck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Fournisseurs</h3>
            </div>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
              Toutes périodes, archives incluses
            </span>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(stats.bySupplier).length === 0 ? (
              <div className="text-center py-8">
                <Truck className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">Aucun fournisseur</p>
              </div>
            ) : (
              (Object.entries(stats.bySupplier) as [string, number][])
                .sort((a,b) => b[1] - a[1])
                .slice(0, 7)
                .map(([supplier, count]) => {
                  const percentage = stats.totalGlobal > 0 ? (count / stats.totalGlobal) * 100 : 0;
                  return (
                    <div key={supplier} className="group">
                      <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        <span className="truncate max-w-[150px]" title={supplier}>{supplier}</span>
                        <span className="text-gray-500 dark:text-gray-400">{count} ({percentage.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-500 group-hover:opacity-80" 
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Tendances Mensuelles et Profil - Version Verte */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-shadow duration-300 overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Créations mensuelles (archives incluses)</h3>
            </div>
            <div className="space-y-2">
              {Object.entries(stats.byMonth).length === 0 ? (
                <div className="text-center py-6">
                  <BarChart3 className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs text-gray-400 dark:text-gray-500">Aucune donnée mensuelle</p>
                </div>
              ) : (
                (Object.entries(stats.byMonth) as [string, number][])
                  .sort((a,b) => b[0].localeCompare(a[0]))
                  .slice(0, 4)
                  .map(([month, count]) => {
                    const parts = month.split("-");
                    const dateFormatted = parts.length === 2 ? `${parts[1]}/${parts[0]}` : month;
                    return (
                      <div key={month} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{dateFormatted}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{count} commandes</span>
                          <TrendingUp className="h-3 w-3 text-green-500" />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Profil Utilisateur - Version Verte */}
          <div className="bg-gradient-to-br from-green-900 via-green-800 to-emerald-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-white/20 rounded-lg">
                <Target className="h-4 w-4 text-white" />
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-green-300">Profil Actuel</h4>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-green-300">Rôle</span>
                <span className="font-bold text-white">{currentUser?.role || "Utilisateur"}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-green-300">Service majeur</span>
                <span className="font-bold text-white truncate max-w-[140px]">{topAgency[0]}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-green-300">Fournisseur majeur</span>
                <span className="font-bold text-white truncate max-w-[140px]">{topSupplier[0]}</span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-green-300">Total commandes</span>
                <span className="font-bold text-white">{stats.totalGlobal}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dernières Commandes - Version Verte */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Zap className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Dernières commandes</h3>
            </div>
            <button 
              onClick={() => onNavigate("Commandes")}
              className="text-xs font-semibold text-green-600 hover:text-green-700 flex items-center gap-1"
            >
              Voir tout <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
        
        {recentOrders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Aucune commande récente</p>
          </div>
        ) : (
          <div className="overflow-x-hidden">
            <table className="w-full table-fixed">
              <caption className="text-left text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Dernières commandes</caption>
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-32">N° Commande</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Date</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-48">Désignation</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Service</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-28">Fournisseur</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((cmd, idx) => (
                  <tr key={cmd.Id} className={`border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/30 dark:bg-gray-800/30'}`}>
                    <td className="py-2 px-3">
                      <span className="text-xs font-bold text-green-600 truncate block" title={cmd.NoBonCommande}>{cmd.NoBonCommande}</span>
                      {cmd.EstArchive && <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-purple-600 dark:text-purple-400"><Archive className="h-3 w-3" />Archivée</span>}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(cmd.DateEmission).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-xs text-gray-700 dark:text-gray-300 line-clamp-1 max-w-full block" title={cmd.Designation}>{cmd.Designation}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-lg truncate block" title={cmd.Agence}>{cmd.Agence}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-md truncate block" title={cmd.Fournisseur || "Local"}>{cmd.Fournisseur || "Local"}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex px-2 py-1 rounded-md text-[10px] font-bold ${
                        cmd.Statut === "Livré" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        cmd.Statut === "Terminé" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        cmd.Statut === "En cours" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {cmd.Statut}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
