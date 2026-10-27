import React, { useEffect, useState } from 'react';
import { Plus, X, ClipboardList, Archive, History, Trash2, Search, Shield, FileSpreadsheet, FileText, FilterX, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../services/api';
import type { AuthUser, Prestation, PrestationHistory } from '../types';
import { csvCell, sortOrdersNewestFirst } from '../utils/orderCalculations';

type FormItem = Pick<Prestation, 'Designation' | 'Agence' | 'Statut' | 'Motif' | 'FournisseurType' | 'FournisseurAgence'> & { Id?: string; key: string };
const input = 'w-full bg-gray-50 border-2 border-gray-200 rounded-xl p-3 text-sm text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:border-green-500 focus:bg-white dark:focus:bg-gray-800 transition-all';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2 text-xs font-semibold shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed';
const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 px-5 py-2 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-50';
const actionButton = 'p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-all disabled:opacity-50';
const statusColor = (value: Prestation['Statut']) => value === 'Non effectué' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : value === 'Effectué' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';

export default function PrestationsView({ currentUser }: { currentUser: AuthUser }) {
  const [orders, setOrders] = useState<Prestation[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FormItem[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [number, setNumber] = useState('');
  const [originalNumber, setOriginalNumber] = useState('');
  const [ds, setDs] = useState('');
  const [editing, setEditing] = useState(false);
  const [statusOnly, setStatusOnly] = useState(false);
  const [history, setHistory] = useState<PrestationHistory[] | null>(null);
  const itemKeyCounter = React.useRef(0);
  const admin = currentUser.role === 'Administrateur';

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [rows, serviceRows, agencyRows] = await Promise.all([api.prestations.getAll(archived), api.services.getAll(), api.agencies.getAll()]);
      setOrders(rows); setServices(serviceRows); setAgencies(agencyRows);
    } catch (error: any) { setError(error.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [archived]);
  useEffect(() => { const timer = setInterval(load, 60000); return () => clearInterval(timer); }, [archived]);
  useEffect(() => setPage(1), [search, status, archived]);

  const groups = new Map<string, Prestation[]>();
  for (const order of sortOrdersNewestFirst(orders)) {
    const term = search.trim().toLowerCase();
    if (term && ![order.NoBonCommande, order.NoDS, order.Designation, order.Agence, order.Fournisseur, order.Motif].some(value => (value || '').toLowerCase().includes(term))) continue;
    if (status && order.Statut !== status) continue;
    if (!groups.has(order.NoBonCommande)) groups.set(order.NoBonCommande, []);
    groups.get(order.NoBonCommande)!.push(order);
  }

  const grouped = [...groups];
  const pages = Math.max(1, Math.ceil(grouped.length / 10));
  useEffect(() => setPage(value => Math.min(value, pages)), [pages]);

  const blank = (): FormItem => ({
    key: `new-${++itemKeyCounter.current}`,
    Designation: '',
    Agence: currentUser.service || services[0] || '',
    Statut: 'Non effectué',
    Motif: '',
    FournisseurType: 'Achat Local',
    FournisseurAgence: ''
  });

  const open = (group?: Prestation[], changeStatus = false) => {
    setStatusOnly(changeStatus);
    setFormError(''); setRemovedIds([]); setEditing(!!group);
    setOriginalNumber(group?.[0].NoBonCommande || '');
    setNumber(group?.[0].NoBonCommande.replace(/^BC N°\s*/, '') || ''); setDs(group?.[0].NoDS || '');
    setItems(group ? group.map(order => ({ ...order, key: order.Id })) : [blank()]);
  };

  const update = (key: string, changes: Partial<FormItem>) => setItems(previous => previous.map(item => item.key === key ? { ...item, ...changes } : item));

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    const rawNumber = number.trim().replace(/^(?:BC N°\s*)+/i, '').trim();
    if (!rawNumber) { setFormError('Veuillez saisir le numéro du bon de commande.'); return; }
    const finalNumber = editing ? originalNumber : `BC N°${rawNumber}`;
    if (finalNumber.length > 100) { setFormError('Le numéro du bon de commande ne doit pas dépasser 100 caractères, préfixe compris.'); return; }
    setBusy(true); setFormError('');
    try {
      await api.prestations.save(items.map(({ key, ...item }) => ({ ...item, NoBonCommande: finalNumber, NoDS: ds.trim() })), removedIds);
      setItems([]); await load();
    } catch (error: any) { setFormError(error.message); }
    finally { setBusy(false); }
  };

  const act = async (group: Prestation[], action: 'archive' | 'restore' | 'delete') => {
    if (!window.confirm(action === 'delete' ? 'Supprimer définitivement ce bon et son historique ?' : action === 'restore' ? 'Restaurer ce bon ?' : 'Archiver ce bon ?')) return;
    setBusy(true);
    try { await api.prestations.action(group.map(order => order.Id), action); await load(); }
    catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  };

  const exportCSV = () => {
    const rows = grouped.flatMap(([, rows]) => rows);
    const content = [['N° Bon commande', 'N° DS', 'Désignation', 'Service', 'Statut', 'Motif', 'Fournisseur'].map(csvCell).join(';'), ...rows.map(order => [order.NoBonCommande, order.NoDS, order.Designation, order.Agence, order.Statut, order.Motif, order.Fournisseur].map(csvCell).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'commandes_prestations.csv'; link.click(); URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const document = new jsPDF('landscape');
      document.text('Commandes Prestations', 14, 15);
      autoTable(document, { startY: 22, head: [['Bon commande', 'DS', 'Désignation', 'Service', 'Statut', 'Motif', 'Fournisseur']], body: grouped.flatMap(([, rows]) => rows).map(order => [order.NoBonCommande, order.NoDS, order.Designation, order.Agence, order.Statut, order.Motif, order.Fournisseur]), styles: { fontSize: 8 }, headStyles: { fillColor: [22, 101, 52] } });
      document.save('commandes_prestations.pdf');
    } catch (error: any) { setError(error.message || 'Export PDF impossible'); }
  };

  return <div className="space-y-6 text-gray-900 dark:text-gray-100">
    <div className="relative overflow-hidden bg-gradient-to-r from-green-700 via-green-600 to-emerald-600 rounded-2xl shadow-xl">
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative p-6 text-white flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div><div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-white/20 rounded-lg"><ClipboardList className="h-4 w-4" /></div><span className="text-xs font-semibold uppercase tracking-wider text-white/80">Gestion des prestations</span></div><h1 className="text-2xl font-bold mb-1">Registre des Prestations de service</h1><p className="text-sm text-white/80">Gérez vos bons de commande et suivez les prestations par service.</p></div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white/10 rounded-xl backdrop-blur-sm"><Shield className="h-3 w-3" /><span className="text-xs font-medium">{currentUser.role}</span></div>
      </div>
    </div>

    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="flex items-center gap-2"><div className="h-8 w-1 bg-green-600 rounded-full" /><span className="text-sm text-gray-600 dark:text-gray-400">{grouped.length} bon(s) {archived ? 'archivé(s)' : 'actif(s)'}</span></div>
      <div className="flex flex-wrap gap-2 items-center">
        <button className={button} onClick={() => setArchived(value => !value)}><Archive className="inline h-4 w-4 mr-2" />{archived ? 'Voir les prestations actives' : 'Archives des prestations'}</button>
        <button className={button} onClick={exportCSV}><FileSpreadsheet className="h-4 w-4 text-emerald-600" />CSV</button>
        <button className={button} onClick={exportPDF}><FileText className="h-4 w-4 text-red-500" />PDF</button>
        {!archived && <button className={primaryButton} onClick={() => open()}><Plus className="h-4 w-4" />Nouvelle prestation</button>}
      </div>
    </div>

    <div className="bg-white rounded-2xl border border-gray-100 dark:bg-gray-800 dark:border-gray-800 shadow-sm p-5">
      <div className="flex flex-col md:flex-row gap-4 md:items-center">
        <div className="flex-1 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><input aria-label="Rechercher une prestation" className={`${input} pl-10`} placeholder="Rechercher un bon, DS, service, fournisseur ou motif…" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <select aria-label="Filtrer par statut" className={`${input} md:w-48`} value={status} onChange={event => setStatus(event.target.value)}><option value="">Tous les statuts</option>{['Effectué', 'Non effectué', 'Terminé'].map(value => <option key={value}>{value}</option>)}</select>
        <button className={button} onClick={() => { setSearch(''); setStatus(''); }}><FilterX className="h-4 w-4" />Réinitialiser</button>
      </div>
    </div>

    {error && <p role="alert" className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-400 shadow-sm">{error} <button className="underline" onClick={load}>Réessayer</button></p>}

    <div className="bg-white rounded-2xl border border-gray-100 dark:bg-gray-800 dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3"><div className="p-2 bg-white/20 rounded-lg"><ClipboardList className="h-5 w-5 text-white" /></div><div><h2 className="text-lg font-bold text-white">{archived ? 'Archives des Prestations' : 'Tableau des Bons de Prestation'}</h2><p className="text-xs text-white/80">Liste regroupée par numéro de bon de commande</p></div></div>
        <div className="flex gap-2 text-xs font-medium text-white"><span className="px-3 py-1 bg-white/20 rounded-full">{grouped.length} bon(s)</span><span className="px-3 py-1 bg-white/20 rounded-full">{grouped.reduce((total, [, rows]) => total + rows.length, 0)} prestation(s)</span></div>
      </div>

      {loading ? <div className="flex flex-col justify-center items-center h-64"><div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" /><p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Chargement des prestations…</p></div> : <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-green-50 to-emerald-50 border-b-2 border-green-200 dark:from-gray-800 dark:to-gray-800 dark:border-gray-700">
            <tr>{['N° Bon commande', 'N° DS', 'Désignation', 'Service', 'Statut', 'Motif', 'Fournisseur', 'Actions'].map(label => <th key={label} className="py-3 px-2 text-center text-xs font-bold text-green-800 dark:text-green-400 uppercase whitespace-nowrap">{label}</th>)}</tr>
          </thead>
          <tbody>
            {grouped.slice((page - 1) * 10, page * 10).map(([number, visibleRows]) => {
              const fullGroup = orders.filter(order => order.NoBonCommande === number);
              const editable = !archived && (admin || fullGroup.every(order => order.CreeParId === currentUser.id && order.Statut !== 'Terminé'));
              return <tr key={number} className="border-b border-gray-100 dark:border-gray-800 hover:bg-green-50/30 dark:hover:bg-gray-700/50 transition-colors align-top">
                <td className="py-2 px-2 text-center font-bold text-gray-900 dark:text-gray-100">{number}<p className="text-xs font-normal text-gray-500">{fullGroup.length} article(s)</p></td>
                <td className="py-2 px-2 text-center">{[...new Set(visibleRows.map(order => order.NoDS))].join(' / ') || '—'}</td>
                {(['Designation', 'Agence', 'Statut', 'Motif', 'Fournisseur'] as const).map(field => <td key={field} className="py-2 px-2 text-center text-xs text-gray-700 dark:text-gray-300">{visibleRows.map(order => <div key={order.Id} className="mb-1 whitespace-pre-wrap break-words">{field === 'Statut' ? <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(order.Statut)}`}>{order.Statut}</span> : field === 'Agence' ? <span className="inline-flex rounded-lg bg-green-50 dark:bg-green-900/30 px-2 py-1 font-medium text-green-700 dark:text-green-400">{order.Agence}</span> : order[field] || '—'}</div>)}</td>)}
                <td className="py-2 px-2 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {editable && <button className={actionButton} title="Modifier" aria-label="Modifier" disabled={busy} onClick={() => open(fullGroup)}><Pencil className="h-4 w-4" /></button>}
                    {editable && <button className={button} disabled={busy} onClick={() => open(fullGroup, true)}>Changer de statut</button>}
                    <button className={actionButton} title="Historique" onClick={async () => { try { const results = await Promise.all(fullGroup.map(order => api.prestations.history(order.Id))); setHistory(results.flatMap(result => result.history).sort((a, b) => b.DateModification.localeCompare(a.DateModification))); } catch (error: any) { setError(error.message); } }}><History className="h-4 w-4" /><span className="sr-only">Historique</span></button>
                    {admin && <>
                      <button className={button} disabled={busy} onClick={() => act(fullGroup, archived ? 'restore' : 'archive')}>{archived ? 'Restaurer' : 'Archiver'}</button>
                      <button className={`${actionButton} hover:text-red-600 hover:bg-red-50`} title="Supprimer" disabled={busy} onClick={() => act(fullGroup, 'delete')}><Trash2 className="h-4 w-4 text-red-600" /><span className="sr-only">Supprimer</span></button>
                    </>}
                  </div>
                </td>
              </tr>;
            })}
            {!grouped.length && <tr><td colSpan={8} className="p-8 text-center text-gray-500">Aucune prestation trouvée.</td></tr>}
          </tbody>
        </table>
      </div>}

      <div className="flex flex-wrap justify-between items-center gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
        <span className="text-xs text-gray-500 dark:text-gray-400">Total : {grouped.length} bon(s) · Page {page}/{pages}</span>
        <div className="flex items-center gap-2">
          <button aria-label="Page précédente" className={actionButton} disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <span className="bg-green-600 text-white rounded-lg px-3 py-1 text-xs font-medium">{page}</span>
          <button aria-label="Page suivante" className={actionButton} disabled={page === pages} onClick={() => setPage(value => value + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>

    {!!items.length && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={statusOnly ? 'Changer de statut' : 'Commande Prestation'}>
      <form onSubmit={save} className="max-h-[90vh] overflow-auto w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-6">
        <div className="flex justify-between items-center gap-3 border-b border-gray-100 dark:border-gray-700 -mx-6 -mt-6 p-6">
          <div><h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{statusOnly ? `Changer de statut : ${number}` : editing ? `Modifier : ${number}` : 'Nouvelle commande prestation'}</h2><p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{editing ? `${items.length} prestation(s) à modifier` : 'Remplissez tous les champs obligatoires (*)'}</p>{currentUser.service && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Service : <span className="font-semibold">{currentUser.service}</span></p>}</div>
          <button type="button" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition" disabled={busy} onClick={() => setItems([])} aria-label="Fermer"><X className="h-5 w-5" /></button>
        </div>

        {formError && <p role="alert" className="text-red-600">{formError}</p>}

        {!statusOnly && <div className="grid sm:grid-cols-2 gap-4">
          <label className="font-bold text-gray-700 dark:text-gray-300 text-sm">N° Bon commande *<div className="relative mt-1"><span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500 font-normal">BC N°</span><input required maxLength={editing ? 100 : 95} readOnly={editing} placeholder="Ex: 287639" className={`${input} pl-16 font-normal`} value={number} onChange={event => setNumber(event.target.value.replace(/^(?:BC N°\s*)+/i, ''))} /></div></label>
          <label className="font-bold text-gray-700 dark:text-gray-300 text-sm">N° DS<input maxLength={100} placeholder="Ex: DS-2026-001" className={`${input} mt-1 font-normal`} value={ds} onChange={event => setDs(event.target.value)} /></label>
        </div>}

        {items.map((item, index) => <fieldset key={item.key} className="border-2 border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/30 rounded-2xl p-5 space-y-4">
          <legend className="px-2 font-bold text-sm text-green-600 dark:text-green-400">Prestation {index + 1}</legend>
          {statusOnly && <p className="text-sm font-semibold">{item.Designation}</p>}
          {!statusOnly && <label className="block font-bold text-gray-700 dark:text-gray-300 text-sm">Désignation *<textarea required className={input} value={item.Designation} onChange={event => update(item.key, { Designation: event.target.value })} /></label>}

          <div className="grid sm:grid-cols-2 gap-4">
            {!statusOnly && <label className="font-bold text-gray-700 dark:text-gray-300 text-sm">Service *<select required className={input} value={item.Agence} onChange={event => update(item.key, { Agence: event.target.value })}>
              <option value="">Choisir un service</option>
              {services.filter(service => admin || service === currentUser.service).map(service => <option key={service}>{service}</option>)}
            </select></label>}
            {(!editing || statusOnly) && <label className="font-bold text-gray-700 dark:text-gray-300 text-sm">Statut *<select className={input} value={item.Statut} onChange={event => update(item.key, { Statut: event.target.value as Prestation['Statut'] })}>
              <option>Effectué</option><option>Non effectué</option>{admin && <option>Terminé</option>}
            </select></label>}
          </div>

          <label className="block font-bold text-gray-700 dark:text-gray-300 text-sm">Motif{item.Statut === 'Terminé' ? ' *' : ''}<textarea required={item.Statut === 'Terminé'} className={input} value={item.Motif} onChange={event => update(item.key, { Motif: event.target.value })} /></label>

          {!statusOnly && <div className="grid sm:grid-cols-2 gap-4">
            <label className="font-bold text-gray-700 dark:text-gray-300 text-sm">Fournisseur<select className={input} value={item.FournisseurType} onChange={event => update(item.key, { FournisseurType: event.target.value as Prestation['FournisseurType'] })}>
              {['Achat Local', 'Achat Import', 'Agence', 'Secretariat DG'].map(value => <option key={value}>{value}</option>)}
            </select></label>
            {item.FournisseurType === 'Agence' && <label className="font-bold text-gray-700 dark:text-gray-300 text-sm">Agence fournisseur *<select required className={input} value={item.FournisseurAgence} onChange={event => update(item.key, { FournisseurAgence: event.target.value })}>
              <option value="">Choisir une agence</option>{agencies.map(agency => <option key={agency}>{agency}</option>)}
            </select></label>}
          </div>}

          {!statusOnly && items.length > 1 && (!item.Id || admin) && <button type="button" className="text-sm text-red-600" onClick={() => {
            if (item.Id && !window.confirm('Supprimer cette prestation à la sauvegarde ?')) return;
            if (item.Id) setRemovedIds(previous => [...previous, item.Id!]);
            setItems(previous => previous.filter(row => row.key !== item.key));
          }}>Retirer cette prestation</button>}
        </fieldset>)}

        {!statusOnly && <button type="button" disabled={busy} className="w-full border-2 border-dashed border-green-300 dark:border-green-800 hover:border-green-500 py-3 text-green-600 dark:text-green-400 rounded-xl bg-green-50/30 hover:bg-green-50 dark:bg-green-900/20 dark:hover:bg-green-900/30 transition-all flex items-center justify-center gap-2 text-sm font-semibold" onClick={() => setItems(previous => [...previous, blank()])}><Plus className="h-4 w-4" />Ajouter une prestation</button>}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button type="button" disabled={busy} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition" onClick={() => setItems([])}>Annuler</button>
          <button disabled={busy} className={primaryButton}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </div>}

    {history && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Historique des prestations">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
        <div className="flex justify-between items-center mb-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white -mx-6 -mt-6 px-6 py-4">
          <h2 className="text-xl font-bold">Historique du bon</h2>
          <button onClick={() => setHistory(null)} aria-label="Fermer"><X /></button>
        </div>
        {history.length ? history.map(event => <div key={event.Id} className="border-b border-gray-100 dark:border-gray-700 py-3">
          <p>{event.AncienStatut} → <strong>{event.NouveauStatut}</strong></p>
          <p className="text-xs text-gray-500">{new Date(event.DateModification).toLocaleString('fr-FR')} — {event.ModifiePar}</p>
          {event.Motif && <p className="mt-1 whitespace-pre-wrap">{event.Motif}</p>}
        </div>) : <p>Aucun historique.</p>}
      </div>
    </div>}
  </div>;
}
