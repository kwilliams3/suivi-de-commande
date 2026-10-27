/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useState, useRef, lazy, Suspense } from "react";
import { api } from "./services/api";
import type { AuthUser, AppNotification } from './types';
import { 
  Building2, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Archive, 
  LayoutDashboard,
  ClipboardList,
  Store,
  Users2,
  Settings,
  LogOut,
  User,
  Shield,
  Eye,
  EyeOff,
  BellRing,
  Globe2,
  Lock,
  Menu,
  X,
  Sparkles,
  Sun,
  Moon,
  TrendingUp,
  Package,
  Truck,
  ChevronRight,
  CircleDot,
  Home,
  Monitor,
  Server,
  Database,
  Cpu,
  ShieldCheck,
  Trash2
} from "lucide-react";

// Views imports
const DashboardView = lazy(() => import("./components/DashboardView"));
const OrdersView = lazy(() => import("./components/OrdersView"));
const PrestationsView = lazy(() => import('./components/PrestationsView'));
const SuppliersView = lazy(() => import("./components/SuppliersView"));
const ArchivesView = lazy(() => import("./components/ArchivesView"));
const UsersView = lazy(() => import("./components/UsersView"));
const SettingsView = lazy(() => import("./components/SettingsView"));

import logo from "./assets/logo_sorepco.jpg";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(api.isAuthenticated());
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState("Tableau de bord");
  const [isLoadingUser, setIsLoadingUser] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Form Fields for Login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Mobile sidebar trigger
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Theme (clair / sombre)
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "dark" || stored === "light") return stored;
    } catch { /* Le thème reste utilisable lorsque le stockage est indisponible. */ }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useLayoutEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    try { localStorage.setItem("theme", theme); } catch { /* Stockage facultatif. */ }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Real-time notifications state
  const [showClearNotifications, setShowClearNotifications] = useState(false);
  const [clearingNotifications, setClearingNotifications] = useState(false);
  const [clearNotificationsError, setClearNotificationsError] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: string; data: AppNotification }>>([]);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const notifCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelNotifClose = () => {
    if (notifCloseTimer.current) {
      clearTimeout(notifCloseTimer.current);
      notifCloseTimer.current = null;
    }
  };

  const scheduleNotifClose = () => {
    cancelNotifClose();
    notifCloseTimer.current = setTimeout(() => setShowNotificationDropdown(false), 250);
  };
  
  // Current year for copyright
  const currentYear = new Date().getFullYear();

  // Couleur entreprise (vert)
  const companyColor = "#2E7D32";
  const companyColorLight = "#4CAF50";
  const companyColorDark = "#1B5E20";
  const companyGradient = "from-green-700 via-green-600 to-green-500";

  // Check login and fetch details on load
  useEffect(() => {
    async function loadMe() {
      if (api.isAuthenticated()) {
        try {
          setIsLoadingUser(true);
          const user = await api.auth.me();
          setCurrentUser(user);
          if (user.mustChangePassword) setActiveTab('Paramètres');
          setIsAuthenticated(true);
        } catch (err) {
          console.error("Session expirée", err);
          api.auth.logout();
          setIsAuthenticated(false);
          setCurrentUser(null);
        } finally {
          setIsLoadingUser(false);
        }
      }
    }
    loadMe();
  }, [isAuthenticated]);

  // SSE Listener for real-time notifications
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setToasts([]);
      return;
    }

    let eventSource: AbortController | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    function setupSSE() {
      eventSource = new AbortController();
      const controller = eventSource;
      const receive = (event: { data: string }) => {


        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "notification" && payload.data) {
            const newNotif = payload.data;
            window.dispatchEvent(new Event('orders-changed'));
            
            setNotifications((prev) => {
              if (prev.some((n) => n.Id === newNotif.Id)) return prev;
              return [newNotif, ...prev];
            });

            const toastId = Math.random().toString();
            setToasts((prev) => [...prev, { id: toastId, data: newNotif }]);

            setTimeout(() => {
              setToasts((prev) => prev.filter((t) => t.id !== toastId));
            }, 8000);
          }
        } catch (e) {
          // Skipping keep-alive lines
        }
      };

      (async () => {
        const response = await fetch('/api/appro/notifications/stream', { headers: { Authorization: 'Bearer ' + api.getToken() }, signal: controller.signal });
        if (response.status === 401) { window.dispatchEvent(new Event('session-expired')); return; }
        if (!response.ok || !response.body) throw new Error('Notifications indisponibles');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let separator;
          while ((separator = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.slice(0, separator); buffer = buffer.slice(separator + 2);
            if (message.startsWith('data: ')) receive({ data: message.slice(6) });
          }
        }
        if (!controller.signal.aborted) timerId = setTimeout(setupSSE, 5000);
      })().catch(() => { if (!controller.signal.aborted) timerId = setTimeout(setupSSE, 5000); });
    }

    async function fetchPastNotifications() {
      try {
        const past = await api.notifications.getAll();
        setNotifications(past);
      } catch (err) {
        console.error("Could not fetch past notifications", err);
      }
    }

    fetchPastNotifications();
    setupSSE();

    return () => {
      if (eventSource) {
        eventSource.abort();
      }
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const expired = () => { api.auth.logout(); setIsAuthenticated(false); setCurrentUser(null); };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!username.trim() || !password.trim()) {
      setLoginError("Veuillez saisir des identifiants valides.");
      return;
    }

    try {
      const res = await api.auth.login(username, password);
      setCurrentUser(res.user);
      setIsAuthenticated(true);
      setActiveTab(res.user.mustChangePassword ? "Paramètres" : "Tableau de bord");
    } catch (err: any) {
      setLoginError(err.message || "Impossible de se connecter.");
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    api.auth.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setShowLogoutModal(false);
  };

  const renderTabContent = () => {
    if (!currentUser) return null;

    switch (activeTab) {
      case "Tableau de bord":
        return <DashboardView onNavigate={(tab) => setActiveTab(tab)} currentUser={currentUser} />;
      case "Commandes":
        return <OrdersView currentUser={currentUser} />;
      case 'Commande Prestation':
        return <PrestationsView currentUser={currentUser} />;
      case "Services & Agences":
        return currentUser.role === "Administrateur" ? (
          <SuppliersView currentUser={currentUser} />
        ) : (
          <DashboardView onNavigate={(tab) => setActiveTab(tab)} currentUser={currentUser} />
        );
      case "Archives":
        return <ArchivesView currentUser={currentUser} />;
      case "Utilisateurs":
        return <UsersView currentUser={currentUser} />;
      case "Paramètres":
        return <SettingsView currentUser={currentUser} />;
      default:
        return <DashboardView onNavigate={(tab) => setActiveTab(tab)} currentUser={currentUser} />;
    }
  };

  // Composant Logo avec fallback
  const LogoComponent = ({ className = "h-full w-full" }) => {
    const [error, setError] = useState(false);

    if (error || !logo) {
      return (
        <div className={`${className} bg-gradient-to-br from-green-600 to-emerald-500 rounded-xl flex items-center justify-center`}>
          <span className="text-white font-bold text-2xl">S</span>
        </div>
      );
    }

    return (
      <img 
        src={logo} 
        alt="SOREPCO Logo" 
        className={className}
        onError={() => setError(true)}
        style={{ objectFit: 'contain' }}
      />
    );
  };

  // Login View layout
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-700 flex flex-col justify-center items-center p-4 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          <div className="absolute top-40 left-40 w-80 h-80 bg-teal-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
          
          {/* Éléments décoratifs d'infrastructure IT */}
          <div className="absolute top-10 right-10 opacity-10 animate-pulse">
            <Server className="h-32 w-32 text-white" />
          </div>
          <div className="absolute bottom-10 left-10 opacity-10 animate-pulse animation-delay-2000">
            <Database className="h-24 w-24 text-white" />
          </div>
          <div className="absolute top-1/2 left-1/4 opacity-5 animate-spin-slow">
            <Cpu className="h-16 w-16 text-white" />
          </div>
        </div>
        
        <div className="max-w-5xl w-full flex flex-col lg:flex-row items-center gap-8 relative z-10">
          {/* Colonne gauche - Illustration et message */}
          <div className="flex-1 text-white hidden lg:block">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm">
                  <Monitor className="h-8 w-8 text-emerald-300" />
                </div>
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm">
                  <Server className="h-8 w-8 text-emerald-300" />
                </div>
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm">
                  <ShieldCheck className="h-8 w-8 text-emerald-300" />
                </div>
              </div>
              
              <h2 className="text-3xl font-bold leading-tight">
                Service <span className="text-emerald-300">Informatique</span>
              </h2>
              
              <p className="text-emerald-100/80 text-sm leading-relaxed max-w-sm">
                Plateforme sécurisée de gestion des approvisionnements dédiée au 
                <span className="font-semibold text-white"> Service Informatique</span> de SOREPCO.
              </p>
              
              <div className="flex items-center gap-4 pt-4">
                <div className="flex items-center gap-2 text-xs text-emerald-200/70">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Accès sécurisé</span>
                </div>
                <div className="w-px h-4 bg-emerald-400/30"></div>
                <div className="flex items-center gap-2 text-xs text-emerald-200/70">
                  <Database className="h-4 w-4" />
                  <span>Données centralisées</span>
                </div>
              </div>

              {/* Illustration d'infrastructure IT */}
              <div className="mt-6 p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="flex items-center justify-around">
                  <div className="text-center">
                    <div className="h-12 w-12 mx-auto bg-gradient-to-br from-emerald-400/20 to-green-500/20 rounded-xl flex items-center justify-center border border-emerald-400/30">
                      <Monitor className="h-6 w-6 text-emerald-300" />
                    </div>
                    <p className="text-[10px] text-emerald-300/60 mt-1">Postes</p>
                  </div>
                  <div className="text-center">
                    <div className="h-12 w-12 mx-auto bg-gradient-to-br from-emerald-400/20 to-green-500/20 rounded-xl flex items-center justify-center border border-emerald-400/30">
                      <Server className="h-6 w-6 text-emerald-300" />
                    </div>
                    <p className="text-[10px] text-emerald-300/60 mt-1">Serveurs</p>
                  </div>
                  <div className="text-center">
                    <div className="h-12 w-12 mx-auto bg-gradient-to-br from-emerald-400/20 to-green-500/20 rounded-xl flex items-center justify-center border border-emerald-400/30">
                      <Database className="h-6 w-6 text-emerald-300" />
                    </div>
                    <p className="text-[10px] text-emerald-300/60 mt-1">Base de données</p>
                  </div>
                  <div className="text-center">
                    <div className="h-12 w-12 mx-auto bg-gradient-to-br from-emerald-400/20 to-green-500/20 rounded-xl flex items-center justify-center border border-emerald-400/30">
                      <ShieldCheck className="h-6 w-6 text-emerald-300" />
                    </div>
                    <p className="text-[10px] text-emerald-300/60 mt-1">Sécurité</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite - Formulaire de login */}
          <div className="w-full lg:w-[420px] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-2xl border border-white/20 dark:border-gray-700/50 shadow-2xl overflow-hidden p-8 space-y-6 animate-fade-in-up relative z-10">
            
            {/* Logo Title section with animation */}
            <div className="text-center space-y-3">
              <div className="relative inline-block mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl blur-lg opacity-60 animate-pulse"></div>
                <div className="relative h-20 w-20 bg-white rounded-xl flex items-center justify-center shadow-lg transform transition-transform hover:scale-110 duration-300 p-2">
                  <LogoComponent />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent">
                  Suivi des Approvisionnements
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium">
                  Plateforme centralisée de gestion des commandes
                </p>
              </div>
            </div>

            {loginError && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-3 text-xs font-semibold text-red-800 animate-shake">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {loginError}
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-green-600 dark:text-emerald-400" />
                  Nom d'utilisateur
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: admin ou utilisateur"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-gray-800 transition-all duration-200 focus:shadow-lg"
                />
              </div>

              <div className="space-y-2 relative">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-green-600 dark:text-emerald-400" />
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm font-medium text-gray-800 dark:text-gray-100 focus:outline-none focus:border-green-500 dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-gray-800 transition-all duration-200 pr-10 focus:shadow-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-emerald-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="relative w-full bg-gradient-to-r from-green-700 via-green-600 to-emerald-600 hover:from-green-800 hover:via-green-700 hover:to-emerald-700 text-white font-bold text-sm py-3.5 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] group overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Se connecter
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </button>
            </form>

            {/* Footer info */}
            <div className="text-center pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Système sécurisé - Tous les accès sont journalisés
              </p>
              <div className="flex items-center justify-center gap-4 text-[9px] text-gray-400 dark:text-gray-500">
                <span className="w-px h-3 bg-gray-200 dark:bg-gray-700"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active Main dashboard View Page layout
  return (
    <div className="h-screen flex flex-col overflow-hidden text-gray-900 dark:text-gray-100 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 h-16 shrink-0 z-30 px-6 flex items-center justify-between shadow-lg sticky top-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 dark:hover:bg-gray-800 dark:hover:from-gray-800 dark:hover:to-gray-800 hover:text-green-600 dark:hover:text-emerald-400 lg:hidden transition-all duration-200"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-3 group cursor-pointer">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-opacity duration-300"></div>
              <div className="relative h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-md transform group-hover:scale-110 transition-transform duration-300 p-1">
                <LogoComponent className="h-full w-full object-contain" />
              </div>
            </div>
            <div>
              <h1 className="text-base font-bold bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent">
                SOREPCO
              </h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:block">Suivi des Approvisionnements</p>
            </div>
          </div>
        </div>

        {/* User section */}
        {currentUser && (
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
              aria-pressed={theme === "dark"}
              className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-emerald-400 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 dark:hover:bg-gray-800 dark:hover:from-gray-800 dark:hover:to-gray-800 rounded-full transition-all duration-200"
              title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Notification Bell */}
            <div
              className="relative"
              onMouseEnter={cancelNotifClose}
              onMouseLeave={scheduleNotifClose}
            >
              <button
                onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                className="relative p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-emerald-400 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 dark:hover:bg-gray-800 dark:hover:from-gray-800 dark:hover:to-gray-800 rounded-full transition-all duration-200"
                title="Notifications en temps réel"
              >
                <BellRing className="h-5 w-5" />
                {notifications.filter(n => !n.Lue).length > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-lg animate-bounce">
                    {notifications.filter(n => !n.Lue).length > 9 ? '9+' : notifications.filter(n => !n.Lue).length}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotificationDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40 lg:hidden"
                    onClick={() => setShowNotificationDropdown(false)}
                  ></div>
                  <div className="absolute right-0 mt-3 w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden transform transition-all duration-200 animate-fade-in-down">
                    <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-gradient-to-r from-green-600 to-emerald-500 rounded-lg">
                          <BellRing className="h-3 w-3 text-white" />
                        </div>
                        <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100">Notifications</h3>
                      </div>
                      <div className="flex gap-2">
                        {notifications.some(n => !n.Lue) && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await api.notifications.markAllRead();
                                setNotifications(res.notifications);
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="text-xs text-green-600 dark:text-emerald-400 hover:text-green-800 dark:hover:text-emerald-300 font-semibold transition px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-gray-700"
                          >
                            Tout lire
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={() => { setClearNotificationsError(""); setShowClearNotifications(true); setShowNotificationDropdown(false); }}
                            className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-semibold transition px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-gray-700"
                          >
                            Vider
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
                      {notifications.length === 0 ? (
                        <div className="p-12 text-center">
                          <BellRing className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                          <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Aucune notification</p>
                          <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Les mises à jour apparaîtront ici</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.Id}
                            className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-150 cursor-pointer group ${!notif.Lue ? "bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-emerald-900/20 dark:to-green-900/20 border-l-4 border-green-500" : ""}`}
                            onClick={async () => {
                              if (!notif.Lue) {
                                try {
                                  const res = await api.notifications.markRead(notif.Id);
                                  setNotifications(res.notifications);
                                } catch (err) {
                                  console.error(err);
                                }
                              }
                            }}
                          >
                            <div className="flex gap-3">
                              <div className={`h-10 w-10 rounded-xl shrink-0 flex items-center justify-center text-sm font-bold transition-all ${
                                notif.NouveauStatut.includes("Livré") ? "bg-gradient-to-br from-emerald-500 to-green-600 text-white group-hover:scale-110" :
                                notif.NouveauStatut.includes("Non livré") ? "bg-gradient-to-br from-red-500 to-pink-600 text-white group-hover:scale-110" :
                                notif.NouveauStatut.includes("Archivée") ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white group-hover:scale-110" :
                                "bg-gradient-to-br from-green-600 to-emerald-500 text-white group-hover:scale-110"
                              } transition-transform duration-200`}>
                                {notif.NouveauStatut.includes("Livré") ? <Truck className="h-5 w-5" /> : 
                                 notif.NouveauStatut.includes("Non livré") ? <XCircle className="h-5 w-5" /> : 
                                 <Clock className="h-5 w-5" />}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                                  Commande <span className="text-green-600 dark:text-emerald-400">#{notif.NoBonCommande}</span>
                                </p>
                                <p className="text-gray-600 dark:text-gray-400 text-xs mt-1 line-clamp-2">
                                  {notif.Designation}
                                </p>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    notif.NouveauStatut.includes("Livré") ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400" :
                                    notif.NouveauStatut.includes("Non livré") ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400" :
                                    "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                                  }`}>
                                    {notif.NouveauStatut}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
                                  <span>Par {notif.ModifiePar}</span>
                                  <span>{new Date(notif.Date).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User info */}
            <div className="hidden md:flex flex-col text-right">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{currentUser.prenom} {currentUser.nom}</span>
              <div className="flex items-center justify-end gap-1 mt-0.5">
                <Shield className="h-3 w-3 text-green-600" />
                <span className="text-[10px] font-bold bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent uppercase">
                  {currentUser.role}
                </span>
              </div>
            </div>
            
            <div className="h-10 w-10 bg-gradient-to-br from-green-600 to-emerald-500 text-white font-bold rounded-xl flex items-center justify-center text-sm shadow-lg transform transition-transform hover:scale-110 duration-300">
              {currentUser.prenom?.[0]}{currentUser.nom?.[0]}
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="grid grid-cols-[auto_1fr] w-full min-h-[calc(100vh-64px)]">
        
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-16 left-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 w-64 z-20 transition-all duration-300 transform shadow-2xl lg:shadow-none lg:translate-x-0 lg:static lg:inset-auto
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
        `}>
          <div className="h-full flex flex-col">
            <div className="flex-1 py-6 px-4 overflow-y-auto">
              <nav className="space-y-1.5">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 pb-2">
                  Menu principal
                </p>
                
                <NavItem 
                  icon={LayoutDashboard}
                  label="Tableau de bord"
                  isActive={activeTab === "Tableau de bord"}
                  onClick={() => { setActiveTab("Tableau de bord"); setMobileMenuOpen(false); }}
                  color="green"
                />
                
                <NavItem 
                  icon={ClipboardList}
                  label="Commandes"
                  isActive={activeTab === "Commandes"}
                  onClick={() => { setActiveTab("Commandes"); setMobileMenuOpen(false); }}
                  color="green"
                />
                <NavItem icon={ClipboardList} label="Commande Prestation" isActive={activeTab === 'Commande Prestation'} onClick={() => { setActiveTab('Commande Prestation'); setMobileMenuOpen(false); }} color="green" />
                
                {currentUser?.role === "Administrateur" && (
                  <NavItem 
                    icon={Store}
                    label="Services & Agences"
                    isActive={activeTab === "Services & Agences"}
                    onClick={() => { setActiveTab("Services & Agences"); setMobileMenuOpen(false); }}
                    color="green"
                  />
                )}
                
                <NavItem 
                  icon={Archive}
                  label="Archives"
                  isActive={activeTab === "Archives"}
                  onClick={() => { setActiveTab("Archives"); setMobileMenuOpen(false); }}
                  color="green"
                />
                
                {currentUser?.role === "Administrateur" && (
                  <NavItem 
                    icon={Users2}
                    label="Utilisateurs"
                    isActive={activeTab === "Utilisateurs"}
                    onClick={() => { setActiveTab("Utilisateurs"); setMobileMenuOpen(false); }}
                    color="green"
                  />
                )}
                
                <div className="my-4 border-t border-gray-100 dark:border-gray-800"></div>
                
                <NavItem 
                  icon={Settings}
                  label="Paramètres"
                  isActive={activeTab === "Paramètres"}
                  onClick={() => { setActiveTab("Paramètres"); setMobileMenuOpen(false); }}
                  color="green"
                />
              </nav>
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-semibold text-sm transition-all duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span>Déconnexion</span>
                </div>
                <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <div className="p-6 lg:p-8">
            <div className="w-full mx-auto px-4 sm:px-6 lg:px-10 xl:px-12">
              <Suspense fallback={<p className="p-6">Chargement…</p>}>{renderTabContent()}</Suspense>
            </div>
          </div>
        </main>
      </div>

      {/* Toast Messages */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 flex gap-3 text-sm overflow-hidden animate-slide-in-right transform transition-all duration-300 hover:scale-105 cursor-pointer"
            style={{ animationDelay: `${index * 100}ms` }}
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
          >
            <div className="bg-gradient-to-br from-emerald-500 to-green-600 text-white h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-md">
              <Truck className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs uppercase tracking-wide">Mise à jour statut</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">À l'instant</span>
              </div>
              <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Commande #{toast.data.NoBonCommande}</p>
              <p className="text-gray-600 dark:text-gray-400 text-xs mt-1 line-clamp-2">{toast.data.Designation}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp className="h-3 w-3" />
                  {toast.data.NouveauStatut}
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 font-medium">Par {toast.data.ModifiePar}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
              }}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition h-5 w-5 shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex justify-center items-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-md w-full p-6 transform animate-scale-in">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-gradient-to-br from-red-500 to-pink-600 text-white rounded-xl shadow-lg transform animate-pulse">
                <LogOut className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                  Confirmer la déconnexion
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Êtes-vous sûr de vouloir quitter ?
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Vous devrez vous reconnecter pour accéder à nouveau à votre tableau de bord.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-all duration-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="px-4 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-md transition-all duration-200 transform hover:scale-105"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      {showClearNotifications && <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="clear-notifications-title">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl">
          <div className="bg-gradient-to-r from-red-600 to-rose-500 p-6 flex items-start gap-4 text-white">
            <div className="rounded-2xl bg-white/20 p-3"><Trash2 className="h-6 w-6" /></div>
            <div className="flex-1"><h2 id="clear-notifications-title" className="text-lg font-bold">Vider l'historique</h2><p className="text-sm text-white/80 mt-1">Notifications</p></div>
            <button type="button" disabled={clearingNotifications} onClick={() => setShowClearNotifications(false)} aria-label="Fermer" className="p-1 rounded-lg hover:bg-white/20 disabled:opacity-50"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">Souhaitez-vous vider l'historique des notifications ?</p>
            <div className="flex gap-3 items-center rounded-xl border border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4"><BellRing className="h-5 w-5 shrink-0 text-red-500" /><p className="text-sm text-red-800 dark:text-red-300">{notifications.length} notification(s) seront supprim&eacute;es de votre historique.</p></div>
            {clearNotificationsError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{clearNotificationsError}</p>}
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
            <button type="button" autoFocus disabled={clearingNotifications} onClick={() => setShowClearNotifications(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">Annuler</button>
            <button type="button" disabled={clearingNotifications} onClick={async () => {
              if (clearingNotifications) return;
              setClearingNotifications(true); setClearNotificationsError("");
              try { const res = await api.notifications.clear(); setNotifications(res.notifications || []); setShowClearNotifications(false); }
              catch (error: any) { setClearNotificationsError(error.message || "Impossible de vider l'historique."); }
              finally { setClearingNotifications(false); }
            }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 text-white text-sm font-semibold shadow-md disabled:opacity-50"><Trash2 className="h-4 w-4" />{clearingNotifications ? 'Suppression...' : "Vider l'historique"}</button>
          </div>
        </div>
      </div>}

      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fade-in-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slide-in-right {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 0.5s ease-out;
        }
        
        .animate-fade-in-down {
          animation: fade-in-down 0.3s ease-out;
        }
        
        .animate-slide-in-right {
          animation: slide-in-right 0.4s ease-out;
        }
        
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
        
        .animate-shake {
          animation: shake 0.3s ease-in-out;
        }
        
        .animate-blob {
          animation: blob 7s infinite;
        }
        
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}

// Navigation Item Component
const NavItem = ({ icon: Icon, label, isActive, onClick, color }: { icon: React.ComponentType<{ className?: string }>; label: string; isActive: boolean; onClick: () => void; color: 'green' | 'indigo' | 'blue' | 'purple' | 'amber' | 'emerald' | 'gray' }) => {
  const colorGradients = {
    green: "from-green-700 via-green-600 to-green-500",
    indigo: "from-indigo-600 to-indigo-700",
    blue: "from-blue-600 to-blue-700",
    purple: "from-purple-600 to-purple-700",
    amber: "from-amber-600 to-amber-700",
    emerald: "from-emerald-600 to-emerald-700",
    gray: "from-gray-600 to-gray-700"
  };
  
  const activeBg = colorGradients[color] || colorGradients.green;
  
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 group ${
        isActive
          ? `bg-gradient-to-r ${activeBg} text-white shadow-md transform scale-[1.02]`
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 dark:hover:from-gray-800 dark:hover:to-gray-800 hover:text-gray-900 dark:hover:text-gray-100 hover:translate-x-1"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 transition-all ${isActive ? "text-white" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"} ${!isActive && "group-hover:scale-110"}`} />
        <span>{label}</span>
      </div>
      {isActive && <ChevronRight className="h-4 w-4 text-white/70" />}
    </button>
  );
};
