import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { exportToPDF } from '../src/utils/exportUtils.ts';

test('updated PDF dependencies export multi-article groups with all Sage references', () => {
  let document: ArrayBuffer | undefined;
  const api = jsPDF.API as unknown as { save?: (this: jsPDF) => jsPDF };
  const original = api.save;
  api.save = function () { document = this.output('arraybuffer'); return this; };
  const items = [
    { Designation: 'Clavier', Quantite: 5, Prix: 1000, Fournisseur: 'Local', ReferenceSage: 'SAGE-one', DateLivraison: '2026-10-08', Agence: 'IT', CreePar: 'alice', Statut: 'Livré' },
    { Designation: 'Papier', Quantite: 2, Prix: 500, Fournisseur: 'Import', ReferenceSage: 'SAGE-two', DateLivraison: '2026-10-09', Agence: 'RH', CreePar: 'alice', Statut: 'Livré' },
  ];
  try {
    assert.equal(exportToPDF([{ bonCommande: 'BC-1', items, firstItem: items[0], statusSummary: { 'Livré': 2 }, totalQuantite: 7, totalPrix: 6000 }], 'Rapport', true), true);
    assert.ok(document);
    const content = Buffer.from(document!).toString('latin1');
    assert.ok(content.startsWith('%PDF'));
    assert.ok(content.includes('SAGE-one') && content.includes('SAGE-two'));
  } finally { if (original) api.save = original; else delete api.save; }
});
