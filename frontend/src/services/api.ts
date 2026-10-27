import { User, AuthUser, AppNotification, Prestation, PrestationHistory, Supplier, Order, StatusHistory, ActivityLog, DashboardStats } from "../types";

const API_BASE = "/api/appro";

let currentToken: string | null = localStorage.getItem("suivi_appro_token");

export const api = {
  setToken(token: string | null) {
    currentToken = token;
    if (token) {
      localStorage.setItem("suivi_appro_token", token);
    } else {
      localStorage.removeItem("suivi_appro_token");
    }
  },

  getToken(): string | null {
    return currentToken;
  },

  isAuthenticated(): boolean {
    return !!currentToken;
  },

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (currentToken) {
      headers.set("Authorization", `Bearer ${currentToken}`);
    }
    if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    const response = await fetch(endpoint, config);

    if (!response.ok) {
      if (response.status === 401 && !endpoint.endsWith('/auth/login')) {
        api.auth.logout();
        window.dispatchEvent(new Event('session-expired'));
      }
      let errorMessage = "Une erreur est survenue lors de l'appel système";

      try {
        const rawText = await response.text();
        if (rawText) {
          try {
            const errorData = JSON.parse(rawText);
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            errorMessage = rawText;
          }
        }
      } catch (e) {}

      if (response.status >= 500) {
        errorMessage = `${errorMessage} (Serveur backend indisponible ou erreur interne).`;
      }

      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  },

  // Auth Operations
  auth: {
    async login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
      const res = await api.request<{ token: string; user: AuthUser }>(`${API_BASE}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      api.setToken(res.token);
      return res;
    },
    async me(): Promise<AuthUser> {
      return api.request<AuthUser>(`${API_BASE}/auth/me`);
    },
    logout() {
      api.setToken(null);
    }
  },

  // Users CRUD
  users: {
    async getAll(): Promise<User[]> {
      return api.request<User[]>(`${API_BASE}/users`);
    },
    async create(data: Partial<User> & { MotDePasse: string }): Promise<User> {
      return api.request<User>(`${API_BASE}/users`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async update(id: string, data: Partial<User>): Promise<User> {
      return api.request<User>(`${API_BASE}/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    async resetPassword(id: string, password: string): Promise<{ success: boolean; message: string }> {
      return api.request<{ success: boolean; message: string }>(`${API_BASE}/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ NouveauMotDePasse: password }),
      });
    },
    async changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
      return api.request<{ success: boolean; message: string }>(`${API_BASE}/users/change-password`, {
        method: "POST",
        body: JSON.stringify({ oldPassword, newPassword }),
      });
    },
    async delete(id: string): Promise<{ success: boolean; message: string }> {
      return api.request<{ success: boolean; message: string }>(`${API_BASE}/users/${id}`, {
        method: "DELETE",
      });
    }
  },

  // Suppliers CRUD
  suppliers: {
    async getAll(): Promise<Supplier[]> {
      return api.request<Supplier[]>(`${API_BASE}/suppliers`);
    },
    async create(data: Partial<Supplier>): Promise<Supplier> {
      return api.request<Supplier>(`${API_BASE}/suppliers`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async update(id: string, data: Partial<Supplier>): Promise<Supplier> {
      return api.request<Supplier>(`${API_BASE}/suppliers/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    async delete(id: string): Promise<{ success: boolean; message: string }> {
      return api.request<{ success: boolean; message: string }>(`${API_BASE}/suppliers/${id}`, {
        method: "DELETE",
      });
    }
  },

  // Agencies
  agencies: {
    async getAll(): Promise<string[]> {
      return api.request<string[]>(`${API_BASE}/agencies`);
    },
    async create(name: string): Promise<string[]> {
      return api.request<string[]>(`${API_BASE}/agencies`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    async delete(name: string): Promise<string[]> {
      return api.request<string[]>(`${API_BASE}/agencies/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
    }
  },

  // Services
  services: {
    async getAll(): Promise<string[]> {
      return api.request<string[]>(`${API_BASE}/services`);
    },
    async create(name: string): Promise<string[]> {
      return api.request<string[]>(`${API_BASE}/services`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    async delete(name: string): Promise<string[]> {
      return api.request<string[]>(`${API_BASE}/services/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
    }
  },

  // Orders CRUD
  prestations: {
    getAll(archived = false) { return api.request<Prestation[]>(`${API_BASE}/prestations?archived=${archived}`); },
    save(items: Partial<Prestation>[], removedIds: string[] = []) {
      return api.request<Prestation[]>(`${API_BASE}/prestations/save`, { method: 'POST', body: JSON.stringify({ items, removedIds }) });
    },
    action(ids: string[], action: 'archive' | 'restore' | 'delete') {
      return api.request<{ success: boolean }>(`${API_BASE}/prestations/action`, { method: 'POST', body: JSON.stringify({ ids, action }) });
    },
    history(id: string) { return api.request<{ order: Prestation; history: PrestationHistory[] }>(`${API_BASE}/prestations/${encodeURIComponent(id)}/history`); },
  },
  orders: {
    async batch(operations: Array<{ action: 'create' | 'update' | 'status' | 'delete' | 'archive' | 'restore'; id: string; data?: Partial<Order> }>): Promise<Order[]> {
      return api.request<Order[]>(API_BASE + '/orders/batch', { method: 'POST', body: JSON.stringify({ operations }) });
    },
    async getAll(archived = false): Promise<Order[]> {
      return api.request<Order[]>(`${API_BASE}/orders?archived=${archived}`);
    },
    async getHistory(id: string): Promise<{ order: Order; history: StatusHistory[] }> {
      return api.request<{ order: Order; history: StatusHistory[] }>(`${API_BASE}/orders/${id}/history`);
    },
    async create(data: {
      NoBonCommande: string;
      NoDS: string;
      Designation: string;
      Quantite: number;
      Prix?: number;
      ReferenceSage?: string;
      DateLivraison: string;
      Statut: string;
      Agence: string;
      SupplierIds?: string[];
      Fournisseur?: string;
    }): Promise<Order> {
      return api.request<Order>(`${API_BASE}/orders`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async createBulk(data: {
      items: Array<{
        NoBonCommande: string;
        NoDS: string;
        Designation: string;
        Quantite: number;
        Prix?: number;
        ReferenceSage?: string;
        DateLivraison: string;
        Statut: string;
        Agence: string;
        Fournisseur: string;
      }>;
    }): Promise<Order> {
      return api.request<Order>(`${API_BASE}/orders`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    async update(id: string, data: Partial<Order> & { SupplierIds?: string[]; Fournisseur?: string }): Promise<Order> {
      return api.request<Order>(`${API_BASE}/orders/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    async updateStatus(id: string, status: "En cours" | "Livré" | "Non livré" | "Terminé", observation?: string, referenceSage?: string): Promise<Order> {
      return api.request<Order>(`${API_BASE}/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ Statut: status, Observation: observation, ReferenceSage: referenceSage }),
      });
    },
    async delete(id: string): Promise<{ success: boolean; message: string }> {
      return api.request<{ success: boolean; message: string }>(`${API_BASE}/orders/${id}`, {
        method: "DELETE",
      });
    },
    async archive(id: string): Promise<{ success: boolean; message: string }> {
      return api.request<{ success: boolean; message: string }>(`${API_BASE}/orders/${id}/archive`, {
        method: "POST",
      });
    },
    async restore(id: string): Promise<{ success: boolean; message: string }> {
      return api.request<{ success: boolean; message: string }>(`${API_BASE}/orders/${id}/restore`, {
        method: "POST",
      });
    }
  },

  // Archive Config
  archiveConfig: {
    async get(): Promise<{ autoArchiveDays: number; enableAutoArchive: boolean }> {
      return api.request<{ autoArchiveDays: number; enableAutoArchive: boolean }>(`${API_BASE}/archive/config`);
    },
    async update(data: { autoArchiveDays: number; enableAutoArchive: boolean }): Promise<{ success: boolean }> {
      return api.request<{ success: boolean }>(`${API_BASE}/archive/config`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
  },

  // Stats / Dashboard
  stats: {
    async get(): Promise<DashboardStats> {
      return api.request<DashboardStats>(`${API_BASE}/stats`);
    }
  },

  // System Logs
  logs: {
    async getAll(): Promise<ActivityLog[]> {
      return api.request<ActivityLog[]>(`${API_BASE}/logs`);
    }
  },

  // Notifications
  notifications: {
    async getAll(): Promise<any[]> {
      return api.request<any[]>(`${API_BASE}/notifications`);
    },
    async clear(): Promise<{ success: boolean; notifications: any[] }> {
      return api.request<{ success: boolean; notifications: any[] }>(`${API_BASE}/notifications/clear`, {
        method: "POST",
      });
    },
    async markRead(id: string): Promise<{ success: boolean; notifications: any[] }> {
      return api.request<{ success: boolean; notifications: any[] }>(`${API_BASE}/notifications/${id}/read`, {
        method: "PATCH",
      });
    },
    async markAllRead(): Promise<{ success: boolean; notifications: any[] }> {
      return api.request<{ success: boolean; notifications: any[] }>(`${API_BASE}/notifications/read-all`, {
        method: "POST",
      });
    }
  }
};
