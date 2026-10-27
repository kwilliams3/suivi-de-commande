import React, { useEffect, useState } from "react";
import { useOrdersRefresh } from "../hooks/useOrdersRefresh";
import { totalPrice, sortOrdersNewestFirst } from "../utils/orderCalculations";
import { api } from "../services/api";
import { Order, Supplier } from "../types";
import { 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Archive, 
  X, 
  AlertCircle, 
  Calendar, 
  FilterX, 
  FileSpreadsheet, 
  FileText,
  Store,
  ChevronDown,
  Package,
  Truck,
  Shield,
  Zap,
  TrendingUp,
  BarChart3,
  Sparkles,
  UserCheck,
  Save,
  ChevronLeft,
  ChevronRight,
  Users,
  ChevronDown as ChevronDownIcon,
  Hash,
  ClipboardList,
  RefreshCw
} from "lucide-react";
import { exportToCSV, exportToPDF, GroupedOrder } from "../utils/exportUtils";

// Robust ownership check for orders
const checkOrderOwnership = (order: Order, user: any): boolean => {
  if (user?.role === 'Administrateur') return true;
  if (order.CreeParId) return order.CreeParId === user?.id;
  const creator = (order.CreePar || order.DemandePar || '').trim().toLowerCase();
  return !!creator && [user?.username, user?.id, user ? user.prenom + ' ' + user.nom : ''].some(value => (value || '').trim().toLowerCase() === creator);
};

interface OrdersViewProps {
  currentUser: {
    id: string;
    username: string;
    role: "Administrateur" | "Utilisateur";
    nom: string;
    prenom: string;
    service?: string;
  };
}

export interface FormItem {
  id: string;
  orderId?: string;
  Designation: string;
  Quantite: number;
  Prix: string;
  ReferenceSage: string;
  DateLivraison: string;
  Statut: "En cours" | "Livré" | "Non livré" | "Terminé";
  Agence: string;
  FournisseurType: "Achat Local" | "Achat Import" | "Agence";
  FournisseurAgence: string;
  Motif?: string;
  Observation?: string;
  Fournisseur?: string;
}

export default function OrdersView({ currentUser }: OrdersViewProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUser, setFilterUser] = useState<string>("");
  const [filterDateStart, setFilterDateStart] = useState<string>("");
  const [filterDateEnd, setFilterDateEnd] = useState<string>("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Modals & Form State
  const [showFormModal, setShowFormModal] = useState(false);
  const [statusGroup, setStatusGroup] = useState<GroupedOrder | null>(null);
  const [editingGroup, setEditingGroup] = useState<GroupedOrder | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields pour le bon de commande
  const [fieldBCRaw, setFieldBCRaw] = useState("");
  const [fieldDS, setFieldDS] = useState("");

  // Detail view state
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<GroupedOrder | null>(null);

  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryBusy, setDeliveryBusy] = useState(false);


  // Fetch initial data
  const loadData = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [ordersData, suppliersData, servicesData, agenciesData] = await Promise.all([
        api.orders.getAll(false),
        api.suppliers.getAll(),
        api.services.getAll(),
        api.agencies.getAll()
      ]);
      setOrders(ordersData);
      setSuppliers(suppliersData);
      setServices(servicesData);
      setAgencies(agenciesData);
    } catch (err: any) {
      setError(err.message || "Impossible d'accéder au serveur");
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
    setTimeout(() => setSuccess(null), 4000);
  };

  const resolveDeliveryStatus = (status: Order["Statut"], referenceSage?: string) => {
    return status;
  };

  // Group orders by Bon Commande
  const groupOrdersByBonCommande = (orders: Order[]) => {
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
      totalPrix: totalPrice(items),
      quantiteDetails: items.map(item => ({
        designation: item.Designation,
        quantite: item.Quantite,
        statut: item.Statut,
        id: item.Id
      }))
    }));
  };

  // Extraire la liste des utilisateurs uniques des commandes
  const getUniqueUsers = (orders: Order[]) => {
    const usersSet = new Set<string>();
    orders.forEach(order => {
      if (order.CreePar) usersSet.add(order.CreePar);
      if (order.DemandePar) usersSet.add(order.DemandePar);
    });
    return Array.from(usersSet).sort();
  };

  const handleOpenCreate = () => {
    setEditingGroup(null);
    setRemovedIds([]);
    setFieldBCRaw("");
    setFieldDS("");
    
    const userService = currentUser.service || services[0] || "";
    
    setFormItems([
      {
        id: Math.random().toString(),
        Designation: "",
        Quantite: 1,
        Prix: "",
        ReferenceSage: "",
        DateLivraison: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        Statut: "En cours",
        Agence: userService,
        FournisseurType: "Achat Local",
        FournisseurAgence: agencies[0] || "",
        Motif: ""
      }
    ]);
    setFormError(null);
    setShowFormModal(true);
  };

  const handleOpenEditGroup = (group: GroupedOrder) => {
    try {
      const firstItem = group.firstItem;
      const isOwner = checkOrderOwnership(firstItem, currentUser);
      
      if (currentUser.role !== "Administrateur" && !isOwner) {
        alert("Vous n'êtes pas autorisé à modifier cette commande.");
        return;
      }

      setEditingGroup(group);
      setFieldBCRaw(group.bonCommande.startsWith("BC N°") ? group.bonCommande.slice(5) : group.bonCommande);
      setFieldDS(firstItem.NoDS || "");

      const items = group.items.map(item => {
        const fStr = item.Fournisseur || "";
        let fType: "Achat Local" | "Achat Import" | "Agence" = "Achat Local";
        let fAg = "";
        if (fStr.startsWith("Agence - ")) {
          fType = "Agence";
          fAg = fStr.replace("Agence - ", "");
        } else if (fStr === "Achat Import") {
          fType = "Achat Import";
        }

        return {
          id: Math.random().toString(),
          orderId: item.Id,
          Designation: item.Designation || "",
          Quantite: item.Quantite || 1,
          Prix: item.Prix !== undefined && item.Prix !== null ? item.Prix.toString() : "",
          ReferenceSage: item.ReferenceSage || "",
          DateLivraison: item.DateLivraison || new Date().toISOString().split("T")[0],
          Statut: item.Statut || "En cours",
          Agence: item.Agence || services[0] || "",
          FournisseurType: fType,
          FournisseurAgence: fAg || agencies[0] || "",
          Motif: item.Observation || "",
          Observation: item.Observation || "",
          Fournisseur: fStr
        };
      });

      setRemovedIds([]);
      setFormItems(items);
      setFormError(null);
      setShowFormModal(true);
    } catch (error) {
      console.error("Erreur lors de l'ouverture de l'édition:", error);
      alert("Erreur lors de l'ouverture du formulaire de modification");
    }
  };

  const handleAddFormItem = () => {
    const userService = currentUser.service || services[0] || "";
    
    setFormItems([
      ...formItems,
      {
        id: Math.random().toString(),
        Designation: "",
        Quantite: 1,
        Prix: "",
        ReferenceSage: "",
        DateLivraison: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        Statut: "En cours",
        Agence: userService,
        FournisseurType: "Achat Local",
        FournisseurAgence: agencies[0] || "",
        Motif: ""
      }
    ]);
  };

  const handleRemoveFormItem = (id: string) => {
    if (formItems.length > 1) {
      const item = formItems.find(item => item.id === id);
      if (item?.orderId) {
        if (currentUser.role !== 'Administrateur') { setFormError('Seul un administrateur peut supprimer un article enregistré.'); return; }
        if (!window.confirm('Supprimer définitivement cet article à la sauvegarde ?')) return;
        setRemovedIds(previous => [...previous, item.orderId!]);
      }
      setFormItems(formItems.filter(item => item.id !== id));
    }
  };

  const handleUpdateFormItem = (id: string, updates: Partial<FormItem>) => {
    setFormItems(formItems.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const handleViewDetail = (groupedOrder: GroupedOrder) => {
    setSelectedOrderForDetail(groupedOrder);
    setShowDetailModal(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!fieldBCRaw.trim()) {
      setFormError("N° Bon de commande obligatoire");
      return;
    }

    for (const [idx, item] of formItems.entries()) {
      const itemNum = formItems.length > 1 ? ` (Article ${idx + 1})` : "";
      if (!item.Designation.trim()) {
        setFormError(`Désignation obligatoire${itemNum}`);
        return;
      }
      if (item.Quantite <= 0) {
        setFormError(`La quantité doit être supérieure à 0${itemNum}`);
        return;
      }
      if (!item.DateLivraison) {
        setFormError(`La date de livraison prévue est requise${itemNum}`);
        return;
      }
      if (!item.Agence) {
        setFormError(`Veuillez sélectionner un service${itemNum}`);
        return;
      }
      if (item.FournisseurType === "Agence" && !item.FournisseurAgence) {
        setFormError(`Veuillez sélectionner l'agence fournisseur${itemNum}`);
        return;
      }
      if (item.Statut === "Livré" && (!item.ReferenceSage || !item.ReferenceSage.trim())) {
        setFormError(`Le N° Réception Sage X3 est obligatoire pour valider la livraison${itemNum}`);
        return;
      }
      const resolvedStatus = resolveDeliveryStatus(item.Statut, item.ReferenceSage);

    }

    try {
      setIsSubmitting(true);
      const finalBC = fieldBCRaw.trim().startsWith("BC N°") ? fieldBCRaw.trim() : `BC N°${fieldBCRaw.trim()}`;

      if (editingGroup) {
        const operations = formItems.map(item => {
          const finalFournisseur = item.FournisseurType === "Agence"
            ? `Agence - ${item.FournisseurAgence}`
            : item.FournisseurType;
          const resolvedStatus = resolveDeliveryStatus(item.Statut, item.ReferenceSage);

          const payload = {
            NoBonCommande: finalBC,
            NoDS: fieldDS.trim(),
            Designation: item.Designation.trim(),
            Quantite: item.Quantite,
            Prix: item.Prix ? Number(item.Prix) : undefined,
            ReferenceSage: item.ReferenceSage || "",
            DateLivraison: item.DateLivraison,
            Statut: resolvedStatus,
            Agence: item.Agence,
            Fournisseur: finalFournisseur,
            Observation: item.Motif ? item.Motif.trim() : ""
          };

          if (item.orderId) {
            return { action: "update" as const, id: item.orderId, data: payload };
          } else {
            return { action: "create" as const, id: "", data: payload };
          }
        });

        await api.orders.batch([...operations, ...removedIds.map(id => ({ action: "delete" as const, id }))]);

        // Update local orders state immediately so the UI reflects the new Observation (motif)
        setOrders(prev => prev.map(o => {
          const updated = formItems.find(fi => fi.orderId === o.Id);
          if (!updated) return o;
          return {
            ...o,
            Observation: updated.Motif && updated.Motif.trim() ? updated.Motif.trim() : o.Observation
          } as any;
        }));

        flashSuccess(`Bon de commande ${finalBC} mis à jour avec succès (${formItems.length} article(s)).`);
      } else {
        const payloadItems = formItems.map(item => {
          const finalFournisseur = item.FournisseurType === "Agence"
            ? `Agence - ${item.FournisseurAgence}`
            : item.FournisseurType;
          const resolvedStatus = resolveDeliveryStatus(item.Statut, item.ReferenceSage);

          return {
            NoBonCommande: finalBC,
            NoDS: fieldDS.trim(),
            Designation: item.Designation.trim(),
            Quantite: item.Quantite,
            Prix: item.Prix ? Number(item.Prix) : undefined,
            ReferenceSage: item.ReferenceSage || "",
            DateLivraison: item.DateLivraison,
            Statut: resolvedStatus,
            Agence: item.Agence,
            Fournisseur: finalFournisseur,
            Observation: item.Motif ? item.Motif.trim() : ""
          };
        });

        await api.orders.createBulk({ items: payloadItems });
        flashSuccess(`Bon de commande ${finalBC} créé avec succès (${formItems.length} article(s)).`);
      }

      setShowFormModal(false);
      loadData();
    } catch (err: any) {
      console.error("Erreur de sauvegarde:", err);
      setFormError(err.message || "Erreur de sauvegarde");
    } finally { setIsSubmitting(false); }
  };

  const handleToggleStatusQuick = async (order: Order, newStatus: "En cours" | "Livré" | "Non livré" | "Terminé") => {
    if (newStatus === "Terminé" && currentUser.role !== "Administrateur") {
      alert("Seul un administrateur peut utiliser le statut 'Terminé'.");
      return;
    }

    const isOwner = checkOrderOwnership(order, currentUser);
    if (currentUser.role !== "Administrateur" && !isOwner) {
      alert("Vous n'êtes pas autorisé à modifier cette commande.");
      return;
    }

    if (order.Statut === "Livré" && currentUser.role !== "Administrateur") {
      alert("Seul l'administrateur peut modifier une commande livrée.");
      return;
    }

    if (newStatus === "Livré") {
      setDeliveryOrders([order]);
      setDeliveryReference(order.ReferenceSage || "");
      setDeliveryError("");
      return;
    }


    try {
      await api.orders.updateStatus(order.Id, newStatus);
      flashSuccess(`Statut modifié : ${order.NoBonCommande} → ${newStatus}`);
      loadData();
    } catch (err: any) {
      alert(err.message || "Erreur de mise à jour");
    }
  };

  const confirmDelivery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (deliveryBusy) return;
    if (!deliveryReference.trim()) { setDeliveryError("Le num\u00e9ro de r\u00e9ception Sage X3 est obligatoire."); return; }
    setDeliveryBusy(true); setDeliveryError("");
    try {
      await api.orders.batch(deliveryOrders.map(order => ({ action: "status", id: order.Id, data: { Statut: "Livr\u00e9", ReferenceSage: deliveryReference.trim() } })));
      setDeliveryOrders([]);
      flashSuccess("Livraison valid\u00e9e avec succ\u00e8s.");
      await loadData();
    } catch (error: any) { setDeliveryError(error.message || "Impossible de valider la livraison."); }
    finally { setDeliveryBusy(false); }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (currentUser.role !== "Administrateur") {
      alert("Droits administrateur requis.");
      return;
    }

    if (window.confirm(`Supprimer définitivement la commande ${order.NoBonCommande} ?`)) {
      try {
        await api.orders.delete(order.Id);
        flashSuccess("Commande supprimée.");
        loadData();
      } catch (err: any) {
        alert(err.message || "Action échouée");
      }
    }
  };

  const handleArchiveManual = async (order: Order) => {
    if (currentUser.role !== "Administrateur") {
      alert("Droits administrateur requis.");
      return;
    }

    try {
      await api.orders.archive(order.Id);
      flashSuccess(`Commande ${order.NoBonCommande} archivée.`);
      loadData();
    } catch (err: any) {
      alert(err.message || "Erreur lors de l'archivage");
    }
  };

  const handleExportGrouped = async (format: 'csv' | 'pdf') => {
    try {
      const exportData = groupedOrders;
      const title = "Commandes_Groupées_par_Bon";
      
      if (format === 'csv') {
        exportToCSV(exportData, title, true);
        flashSuccess("Exportation CSV réussie");
      } else {
        exportToPDF(exportData, "Commandes Groupées par Bon de Commande", true);
        flashSuccess("Exportation PDF réussie");
      }
    } catch (error: any) {
      console.error("Erreur d'exportation:", error);
      setError(error.message || "Erreur lors de l'exportation");
      setTimeout(() => setError(null), 4000);
    }
  };

  const handleUpdateAllStatus = async (group: GroupedOrder, newStatus: "En cours" | "Livré" | "Non livré" | "Terminé") => {
    try {
      if (newStatus === "Terminé" && currentUser.role !== "Administrateur") {
        alert("Seul un administrateur peut utiliser le statut 'Terminé'.");
        return;
      }

      const isOwner = checkOrderOwnership(group.firstItem, currentUser);
      if (currentUser.role !== "Administrateur" && !isOwner) {
        alert("Vous n'êtes pas autorisé à modifier cette commande.");
        return;
      }

      const hasDelivered = group.items.some(item => item.Statut === "Livré");
      if (hasDelivered && currentUser.role !== "Administrateur") {
        alert("Seul l'administrateur peut modifier une commande avec des articles livrés.");
        return;
      }

      if (newStatus === "Livré") {
        setDeliveryOrders(group.items);
        setDeliveryReference("");
        setDeliveryError("");
        return;
      } else if (newStatus === "Terminé") {
        await api.orders.batch(group.items.map(item => ({ action: "status", id: item.Id, data: { Statut: newStatus } })));
        flashSuccess(`Tous les articles du bon ${group.bonCommande} sont maintenant en statut "Terminé".`);
      } else {
        await api.orders.batch(group.items.map(item => ({ action: "status", id: item.Id, data: { Statut: newStatus } })));
        flashSuccess(`Tous les articles du bon ${group.bonCommande} sont maintenant en statut "${newStatus}".`);
      }
      
      loadData();
    } catch (err: any) {
      alert(err.message || "Erreur lors de la mise à jour des statuts");
    }
  };

  // Filtrer les commandes
  const filteredOrders = orders.filter((cmd) => {
    if (searchTerm.trim()) {
      const st = searchTerm.toLowerCase();
      const matchBC = (cmd.NoBonCommande || "").toLowerCase().includes(st);
      const matchDS = (cmd.NoDS || "").toLowerCase().includes(st);
      const matchDes = (cmd.Designation || "").toLowerCase().includes(st);
      const matchFour = (cmd.Fournisseur || "").toLowerCase().includes(st);
      if (!matchBC && !matchDS && !matchDes && !matchFour) return false;
    }

    if (filterUser) {
      const creator = (cmd.CreePar || cmd.DemandePar || "").toLowerCase();
      if (creator !== filterUser.toLowerCase()) return false;
    }

    if (filterDateStart || filterDateEnd) {
      const emissionDate = new Date(cmd.DateEmission);
      emissionDate.setHours(0, 0, 0, 0);

      if (filterDateStart) {
        const start = new Date(filterDateStart);
        start.setHours(0, 0, 0, 0);
        if (emissionDate < start) return false;
      }

      if (filterDateEnd) {
        const end = new Date(filterDateEnd);
        end.setHours(0, 0, 0, 0);
        if (emissionDate > end) return false;
      }
    }

    return true;
  });

  const groupedOrders = groupOrdersByBonCommande(filteredOrders);
  const uniqueUsers = getUniqueUsers(orders);

  const totalPages = Math.max(1, Math.ceil(groupedOrders.length / itemsPerPage));
  useEffect(() => setCurrentPage(page => Math.min(page, totalPages)), [totalPages]);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedData = groupedOrders.slice(indexOfFirstItem, indexOfLastItem);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterUser, filterDateStart, filterDateEnd]);

  const getDeliveryAlertBadge = (cmd: Order) => {
    if (cmd.Statut === "Livré") return null;

    const today = new Date();
    today.setHours(0,0,0,0);
    const delDate = new Date(cmd.DateLivraison);
    delDate.setHours(0,0,0,0);

    const diffMs = delDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (delDate < today) {
      return (
        <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
          <AlertCircle className="h-3 w-3" /> Retard
        </span>
      );
    } else if (diffDays >= 0 && diffDays <= 3) {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
          <Clock className="h-3 w-3" /> J+{diffDays}
        </span>
      );
    }
    return null;
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setFilterUser("");
    setFilterDateStart("");
    setFilterDateEnd("");
    setCurrentPage(1);
  };

  // Fonction pour obtenir les couleurs des statuts
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Livré": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "En cours": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "Terminé": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Non livré": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  // Génère un identifiant stable et quasi unique par groupe de commande
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
                  <Package className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Gestion des commandes
                </span>
              </div>
              <h1 className="text-2xl font-bold mb-1">Registre des Commandes</h1>
              <p className="text-sm text-white/80">
                Gérez vos bons de commande et suivez les livraisons en temps réel
              </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Shield className="h-3 w-3" />
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
            {groupedOrders.length} bon{groupedOrders.length > 1 ? 's' : ''} de commande trouvé{groupedOrders.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExportGrouped('csv')}
            className="bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-2 transition-all hover:shadow-md"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> CSV
          </button>
          <button
            onClick={() => handleExportGrouped('pdf')}
            className="bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-xs px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-2 transition-all hover:shadow-md"
          >
            <FileText className="h-4 w-4 text-red-500" /> PDF
          </button>
          <button
            onClick={handleOpenCreate}
            className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold text-sm px-5 py-2 rounded-xl shadow-md flex items-center gap-2 transition-all transform hover:scale-105"
          >
            <Plus className="h-4 w-4" /> Nouvelle commande
          </button>
        </div>
      </div>

      {/* Alertes */}
      {success && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-xl p-4 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 shadow-sm animate-fade-in">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-400 shadow-sm">
          {error}
        </div>
      )}

      {/* Barre de recherche et filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 dark:bg-gray-800 dark:border-gray-800 shadow-sm p-5">
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher par N° bon, N° DS, désignation ou fournisseur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition-all"
            />
          </div>

          <div className="relative min-w-[200px]">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition-all appearance-none cursor-pointer"
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
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition-all"
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
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition-all"
            />
          </div>

          <button
            onClick={handleClearFilters}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-green-600 font-medium px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-all flex items-center gap-1 border border-gray-200 dark:border-gray-700 hover:border-green-200"
          >
            <FilterX className="h-4 w-4" /> Réinitialiser
          </button>
        </div>
      </div>

      {/* Tableau des commandes groupées - Sans icônes ni lignes de séparation */}
      <div className="bg-white rounded-2xl border border-gray-100 dark:bg-gray-800 dark:border-gray-800 shadow-sm overflow-hidden">
        {/* En-tête du tableau avec titre */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tableau des Bons de Commande</h2>
              <p className="text-xs text-white/80">Liste regroupée par numéro de bon de commande</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
              {groupedOrders.length} bon(s)
            </span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium text-white">
              {orders.length} article(s)
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent mx-auto"></div>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Chargement des commandes...</p>
            </div>
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="text-center py-16">
            <Package className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">Aucune commande trouvée</h4>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ajustez vos filtres ou créez une nouvelle commande</p>
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
                  {paginatedData.map((group) => {
                    const cmd = group.firstItem;
                    const isOwner = checkOrderOwnership(cmd, currentUser);
                    const uniqueId = cmd.NumeroSysteme || '-----';
                    
                    return (
                      <tr key={group.bonCommande} className="border-b border-gray-100 dark:border-gray-800 hover:bg-green-50/30 dark:hover:bg-gray-700/50 transition-colors group">
                        <td className="py-2 px-2 align-top">
                          <div className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate text-center" title={group.bonCommande}>
                            {group.bonCommande}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono text-center">
                            {group.items.length} article{group.items.length > 1 ? 's' : ''}
                          </div>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded text-sm font-mono font-bold text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                              <Hash className="h-3.5 w-3.5" />
                              {uniqueId}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded inline-block mt-1 truncate max-w-full text-center" title={cmd.CreePar || cmd.DemandePar || "Non spécifié"}>
                            {cmd.CreePar || cmd.DemandePar || "N/S"}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top text-center">
                          <div className="text-sm text-gray-700 dark:text-gray-300 font-medium" title={new Date(cmd.DateEmission).toLocaleDateString("fr-FR")}>
                            {new Date(cmd.DateEmission).toLocaleDateString("fr-FR")}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500">
                            {new Date(cmd.DateEmission).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-0.5 max-h-16 overflow-y-auto">
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
                              <div key={idx} className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                {item.Quantite}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top">
                          <div className="space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                            {group.items.some(item => item.Observation || item.Motif) ? (
                              group.items.map((item, idx) => (item.Observation || item.Motif) ? (
                                <div key={idx} className="text-xs text-center whitespace-pre-wrap break-words">
                                  • {(item.Observation || item.Motif)!}
                                </div>
                              ) : null)
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 text-xs text-center">-</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2 align-top text-center">
                          <span className="inline-flex text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-lg dark:bg-green-900/30 dark:text-green-400 truncate max-w-full">
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
                              onClick={() => handleViewDetail(group)}
                              title="Voir les détails"
                              className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-gray-500 dark:text-gray-400 hover:text-green-600 transition transform hover:scale-110"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            
                            {isOwner && <button type="button" onClick={() => setStatusGroup(group)} title="Changer de statut" aria-label="Changer de statut" className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-gray-500 dark:text-gray-400 hover:text-green-600 transition transform hover:scale-110"><RefreshCw className="h-4 w-4" /></button>}
                            {isOwner && (
                              <button 
                                onClick={() => handleOpenEditGroup(group)} 
                                title="Modifier" 
                                className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 text-gray-500 dark:text-gray-400 hover:text-amber-600 transition transform hover:scale-110"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                            )}
                            {currentUser.role === "Administrateur" && (
                              <>
                                <button 
                                  onClick={() => handleArchiveManual(cmd)} 
                                  title="Archiver" 
                                  className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 text-gray-500 dark:text-gray-400 hover:text-green-600 transition transform hover:scale-110"
                                >
                                  <Archive className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteOrder(cmd)} 
                                  title="Supprimer" 
                                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 transition transform hover:scale-110"
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
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="text-xs text-gray-500 dark:text-gray-400 order-2 sm:order-1">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Total: {groupedOrders.length}</span>
                <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                <span>Page {currentPage}/{totalPages || 1}</span>
                <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
                <span>{paginatedData.length} bon(s)</span>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1 order-1 sm:order-2">
                  <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-1.5 rounded-lg transition ${
                      currentPage === 1
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
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
                        return <span key={page} className="text-gray-400 dark:text-gray-500 text-xs">…</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`p-1.5 rounded-lg transition ${
                      currentPage === totalPages
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
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

      {/* MODAL FORMULAIRE */}


      {!!deliveryOrders.length && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delivery-title">
        <form onSubmit={confirmDelivery} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-100 dark:border-gray-700">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 flex items-start gap-4 text-white">
            <div className="p-3 rounded-2xl bg-white/20"><Truck className="h-6 w-6" /></div>
            <div className="flex-1"><h2 id="delivery-title" className="text-lg font-bold">Valider la livraison</h2><p className="text-sm text-white/80 mt-1">{deliveryOrders[0].NoBonCommande}</p></div>
            <button type="button" disabled={deliveryBusy} onClick={() => setDeliveryOrders([])} aria-label="Fermer" className="p-1 rounded-lg hover:bg-white/20 disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-6 space-y-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">Renseignez la r&eacute;f&eacute;rence Sage X3 pour confirmer la r&eacute;ception {deliveryOrders.length > 1 ? 'des articles' : "de cet article"}.</p>
            <label htmlFor="sage-reference" className="block text-sm font-semibold text-gray-700 dark:text-gray-200">N&deg; R&eacute;ception Sage X3 <span className="text-red-500">*</span></label>
            <div className="relative"><Hash className="absolute left-3 top-3.5 h-5 w-5 text-green-600" /><input id="sage-reference" autoFocus required maxLength={100} disabled={deliveryBusy} value={deliveryReference} onChange={event => { setDeliveryReference(event.target.value); setDeliveryError(""); }} placeholder="Ex : REC-2026-001" aria-invalid={!!deliveryError} aria-describedby={deliveryError ? 'delivery-error' : undefined} className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-green-500 transition disabled:opacity-50" /></div>
            {deliveryError && <p id="delivery-error" role="alert" className="rounded-xl p-3 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">{deliveryError}</p>}
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700">
            <button type="button" disabled={deliveryBusy} onClick={() => setDeliveryOrders([])} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">Annuler</button>
            <button type="submit" disabled={deliveryBusy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-semibold shadow-md disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{deliveryBusy ? 'Validation...' : 'Valider la livraison'}</button>
          </div>
        </form>
      </div>}
      {statusGroup && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Changer de statut">
        <div className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-white dark:bg-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Changer de statut : {statusGroup.bonCommande}</h2>
            <button type="button" onClick={() => setStatusGroup(null)} aria-label="Fermer"><X className="h-5 w-5" /></button>
          </div>
          {statusGroup.items.map(item => {
            const allowed = currentUser.role === "Administrateur" || (checkOrderOwnership(item, currentUser) && item.Statut !== "Livré" && item.Statut !== "Terminé");
            return <label key={item.Id} className="block border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-sm text-gray-900 dark:text-gray-100">
              <span className="block font-semibold mb-2">{item.Designation}</span>
              <select aria-label={`Statut de ${item.Designation}`} value={item.Statut} disabled={!allowed} className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 disabled:opacity-50" onChange={event => { setStatusGroup(null); void handleToggleStatusQuick(item, event.target.value as Order["Statut"]); }}>
                <option value="En cours">En cours</option>
                <option value="Livré">Livré</option>
                <option value="Non livré">Non livré</option>
                {currentUser.role === "Administrateur" && <option value="Terminé">Terminé</option>}
              </select>
            </label>;
          })}
          <div className="flex justify-end"><button type="button" className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200" onClick={() => setStatusGroup(null)}>Fermer</button></div>
        </div>
      </div>}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 dark:bg-gray-800 dark:border-gray-700 max-w-4xl w-full my-8 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                  {editingGroup ? `Modifier: ${editingGroup.bonCommande}` : "Nouvelle commande"}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {editingGroup ? `${formItems.length} article(s) à modifier` : "Remplissez tous les champs obligatoires (*)"}
                </p>
                {currentUser.service && (
                  <p className="text-xs text-green-600 mt-1">
                    Service: <span className="font-semibold">{currentUser.service}</span>
                  </p>
                )}
              </div>
              <button onClick={() => setShowFormModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-4 bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg text-xs font-bold text-red-800 dark:bg-red-900/30 dark:text-red-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">N° Bon commande *</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500 text-sm">BC N°</span>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 287639"
                      value={fieldBCRaw}
                      onChange={(e) => setFieldBCRaw(e.target.value)}
                      className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl p-3 pl-16 text-sm text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:border-green-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">N° DS</label>
                  <input type="text" placeholder="Ex: DS-2026-001" value={fieldDS} onChange={(e) => setFieldDS(e.target.value)} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl p-3 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:border-green-500" />
                </div>
              </div>

              {formItems.map((item, index) => {
                const isDelivered = item.Statut === "Livré";
                const isAdmin = currentUser.role === "Administrateur";
                
                return (
                  <div key={item.id} className={`border-2 rounded-2xl p-5 space-y-4 relative ${
                    isDelivered && !isAdmin
                      ? 'border-gray-300 bg-gray-100/50 dark:border-gray-600 dark:bg-gray-700/50'
                      : 'border-gray-100 bg-gray-50/30 dark:border-gray-700 dark:bg-gray-800/30'
                  }`}>
                    {!editingGroup && formItems.length > 1 && (
                      <button type="button" onClick={() => handleRemoveFormItem(item.id)} className="absolute top-4 right-4 text-red-500 hover:text-red-700 bg-white dark:bg-gray-800 p-1.5 rounded-lg shadow-sm">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-bold">#{index + 1}</div>
                      <h4 className="font-bold text-gray-800 dark:text-gray-200">Article {formItems.length > 1 ? index + 1 : ""}</h4>
                      {item.orderId && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-2">ID: {item.orderId.substring(0, 8)}...</span>
                      )}
                      {isDelivered && !isAdmin && (
                        <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">✓ Livré (lecture seule)</span>
                      )}
                    </div>

                    <div>
                      <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Désignation *</label>
                      <textarea
                        rows={2}
                        placeholder="Description du matériel..."
                        value={item.Designation}
                        onChange={(e) => handleUpdateFormItem(item.id, { Designation: e.target.value })}
                        className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                          isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                        }`}
                        disabled={isDelivered && !isAdmin}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Quantité *</label>
                        <input
                          type="number"
                          min={1}
                          value={item.Quantite}
                          onChange={(e) => handleUpdateFormItem(item.id, { Quantite: Number(e.target.value) })}
                          className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                            isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                          }`}
                          disabled={isDelivered && !isAdmin}
                        />
                      </div>
                      <div>
                        <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Prix (FCFA)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={item.Prix}
                          onChange={(e) => handleUpdateFormItem(item.id, { Prix: e.target.value })}
                          className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                            isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                          }`}
                          disabled={isDelivered && !isAdmin}
                        />
                      </div>
                    </div>

                    {item.Statut === "Livré" && (
                      <div className="mt-4">
                        <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">N° Réception Sage X3 *</label>
                        <input
                          type="text"
                          placeholder="Obligatoire pour confirmer la livraison"
                          value={item.ReferenceSage}
                          onChange={(e) => handleUpdateFormItem(item.id, { ReferenceSage: e.target.value })}
                          className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                            isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                          }`}
                          disabled={isDelivered && !isAdmin}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Livraison prévue *</label>
                        <input
                          type="date"
                          value={item.DateLivraison}
                          onChange={(e) => handleUpdateFormItem(item.id, { DateLivraison: e.target.value })}
                          className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                            isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                          }`}
                          disabled={isDelivered && !isAdmin}
                        />
                      </div>
                      <div>
                        <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Service *</label>
                        <input
                          type="text"
                          value={item.Agence}
                          disabled
                          className="w-full bg-gray-100 border border-gray-200 rounded-xl p-3 text-sm text-gray-600 cursor-not-allowed dark:bg-gray-700 dark:border-gray-700 dark:text-gray-400"
                        />
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Service automatique</p>
                      </div>

                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 dark:bg-gray-800 dark:border-gray-700">
                      <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Motif</label>
                      <textarea
                        rows={2}
                        placeholder="Motif de l'article..."
                        value={item.Motif}
                        onChange={(e) => handleUpdateFormItem(item.id, { Motif: e.target.value })}
                        className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                          isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                        }`}
                        disabled={isDelivered && !isAdmin}
                      />
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-3 text-sm">Fournisseur</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Type *</label>
                          <select
                            value={item.FournisseurType}
                            onChange={(e) => handleUpdateFormItem(item.id, { FournisseurType: e.target.value as any })}
                            className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                              isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                            }`}
                            disabled={isDelivered && !isAdmin}
                          >
                            <option value="Achat Local">Achat Local</option>
                            <option value="Achat Import">Achat Import</option>
                            <option value="Agence">Agence</option>
                          </select>
                        </div>
                        {item.FournisseurType === "Agence" && (
                          <div>
                            <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1 text-sm">Agence *</label>
                            <select
                              value={item.FournisseurAgence}
                              onChange={(e) => handleUpdateFormItem(item.id, { FournisseurAgence: e.target.value })}
                              className={`w-full border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm focus:outline-none focus:border-green-500 ${
                                isDelivered && !isAdmin ? 'bg-gray-100 cursor-not-allowed dark:bg-gray-700' : 'bg-white dark:bg-gray-800'
                              }`}
                              disabled={isDelivered && !isAdmin}
                            >
                              <option value="">Sélectionner</option>
                              {agencies.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {!editingGroup && (
                <button type="button" onClick={handleAddFormItem} className="w-full border-2 border-dashed border-green-300 hover:border-green-500 py-3 text-green-600 hover:text-green-700 rounded-xl bg-green-50/30 hover:bg-green-50 dark:bg-green-900/20 dark:hover:bg-green-900/30 transition-all flex items-center justify-center gap-2 text-sm font-semibold">
                  <Plus className="h-4 w-4" /> Ajouter un article
                </button>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                <button type="button" onClick={() => setShowFormModal(false)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition">Annuler</button>
                <button disabled={isSubmitting} type="submit" className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-md transition-all transform hover:scale-105 flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  {editingGroup ? `Mettre à jour (${formItems.length})` : `Créer (${formItems.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DÉTAIL */}
      {showDetailModal && selectedOrderForDetail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 dark:bg-gray-800 dark:border-gray-700 max-w-4xl w-full my-8 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                  Détails de la commande
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                  N° Bon: <span className="font-semibold text-green-600">{selectedOrderForDetail.bonCommande}</span>
                </p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Informations générales du bon de commande */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">N° Bon de commande</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 break-words">{selectedOrderForDetail.bonCommande}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">N° DS</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedOrderForDetail.firstItem.NoDS || "Non renseigné"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">N° système</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedOrderForDetail.firstItem.NumeroSysteme || "Non renseigné"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Date d'émission</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{new Date(selectedOrderForDetail.firstItem.DateEmission).toLocaleString("fr-FR")}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:bg-gray-900/40 dark:border-gray-700">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Créée par</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedOrderForDetail.firstItem.CreePar || "Non renseigné"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-900/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Demandée par</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedOrderForDetail.firstItem.DemandePar || "Non renseigné"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-900/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Service demandeur</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">{selectedOrderForDetail.firstItem.ServiceDemande || selectedOrderForDetail.firstItem.Agence || "Non renseigné"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-900/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Date de modification</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedOrderForDetail.firstItem.DateModification ? new Date(selectedOrderForDetail.firstItem.DateModification).toLocaleString("fr-FR") : "Non renseignée"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-900/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">État d'archivage</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedOrderForDetail.firstItem.EstArchive ? "Archivée" : "Active"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 dark:border-gray-700 dark:bg-gray-900/40">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Date d'archivage</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedOrderForDetail.firstItem.DateArchivage ? new Date(selectedOrderForDetail.firstItem.DateArchivage).toLocaleString("fr-FR") : "Non archivée"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/20 dark:border-green-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total articles</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">{selectedOrderForDetail.items.length}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/20 dark:border-green-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Quantité totale</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">{selectedOrderForDetail.totalQuantite}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/20 dark:border-green-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Prix total</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">
                    {selectedOrderForDetail.totalPrix > 0 ? `${selectedOrderForDetail.totalPrix.toLocaleString()} FCFA` : '-'}
                  </p>
                </div>
                <div className="bg-green-50 rounded-xl p-4 border border-green-100 dark:bg-green-900/20 dark:border-green-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Service</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">{selectedOrderForDetail.firstItem.Agence}</p>
                </div>
              </div>

              {/* Détails complets de chaque article */}
              <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Détails complets des articles</h4>
              <div className="space-y-4">
                {selectedOrderForDetail.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/30 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                      <div>
                        <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">Article {idx + 1}</p>
                        <p className="text-base font-semibold text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{item.Designation || "Non renseignée"}</p>
                      </div>
                      <span className={`self-start inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(item.Statut)}`}>
                        {item.Statut}
                      </span>
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
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-700 p-6 shrink-0 flex justify-end">
              <button onClick={() => setShowDetailModal(false)} className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
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
