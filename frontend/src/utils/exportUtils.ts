import { csvCell } from "./orderCalculations.ts";
import { jsPDF } from "jspdf";

// Extension du type jsPDF pour inclure autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

// Importer autoTable après la déclaration de module
import autoTable from 'jspdf-autotable';

/**
 * Interface pour les commandes groupées par Bon Commande
 */
export interface GroupedOrder {
  bonCommande: string;
  items: any[];
  firstItem: any;
  statusSummary: Record<string, number>;
  totalQuantite: number;
  totalPrix: number;
}

/**
 * Formate une date en français
 */
const formatDate = (dateStr: string): string => {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return "-";
  }
};

/**
 * Formate un prix en FCFA
 */
const formatPrice = (price: number): string => {
  if (!price || price === 0) return "-";
  return `${price.toLocaleString("fr-FR")} FCFA`;
};

const isGroupedExportDataset = (orders: any[], explicitGrouped: boolean = false): boolean => {
  if (explicitGrouped) return true;
  return !!(orders && orders.length > 0 && orders[0] && Object.prototype.hasOwnProperty.call(orders[0], 'bonCommande'));
};

/**
 * Obtient la couleur d'un statut
 */
const getStatusColor = (status: string): [number, number, number] => {
  const cleanStatus = status.split('(')[0].trim();
  switch (cleanStatus) {
    case "Livré": return [16, 185, 129];
    case "En cours": return [245, 158, 11];
    case "Terminé": return [99, 102, 241];
    case "Non livré": return [239, 68, 68];
    default: return [107, 114, 128];
  }
};

/**
 * Exports orders array to a beautiful PDF report
 * Support pour les commandes groupées
 */
export function exportToPDF(orders: any[], title: string, isGrouped: boolean = false) {
  try {
    const groupedExport = isGroupedExportDataset(orders, isGrouped);
    const doc = new jsPDF("landscape", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;

    // ==================== EN-TETE ====================
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(79, 70, 229);
    doc.text("RAPPORT DE COMMANDES", pageWidth / 2, 15, { align: "center" });

    // Separateur
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(0.5);
    doc.line(margin, 19, pageWidth - margin, 19);

    // ==================== INFORMATIONS GENERALES ====================
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(75, 85, 99);

    const generationDate = new Date();
    const dateStr = generationDate.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    let yPos = 23;
    
    // Informations sur 4 colonnes
    const infoItems = [
      { label: "Rapport", value: title },
      { label: "Date", value: dateStr },
      { label: "Total", value: `${orders.length} commande${orders.length > 1 ? 's' : ''}` },
      { label: "Format", value: isGrouped ? "Groupe par Bon" : "Detaille" }
    ];

    const infoWidth = (pageWidth - 2 * margin) / infoItems.length;
    
    infoItems.forEach((info, index) => {
      const xPos = margin + (index * infoWidth);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(31, 41, 55);
      doc.text(`${info.label}:`, xPos, yPos);
      const labelWidth = doc.getStringUnitWidth(`${info.label}:`) * 7 / doc.internal.scaleFactor;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(75, 85, 99);
      doc.text(info.value, xPos + labelWidth + 2, yPos);
    });

    yPos += 5;

    // ==================== TABLEAU PRINCIPAL ====================
    let headers: string[][];
    let data: any[][];
    let columnStyles: any;
    let tableStartY = yPos;

    if (groupedExport && orders.length > 0 && 'bonCommande' in orders[0]) {
      // Format groupe
      headers = [[
        "N Bon",
        "Designation",
        "Qte",
        "Prix",
        "Fournisseur",
        "Ref.Sage",
        "Livraison",
        "Service",
        "Cree par",
        "Statuts"
      ]];

      data = orders.map((group) => {
        const itemsStr = group.items 
          ? group.items.map((item: any) => `${item.Designation} (${item.Quantite})`).join("\n")
          : "-";
        
        const fournisseur = group.items && group.items.length > 0 
          ? [...new Set(group.items.map((item: any) => item.Fournisseur || item.FournisseurType || "-"))].join(" / ")
          : "-";
        
        const refSage = group.items && group.items.length > 0 
          ? [...new Set(group.items.map((item: any) => item.ReferenceSage || "-"))].join(" / ")
          : "-";
        
        const dateLivraison = group.items && group.items.length > 0 
          ? [...new Set(group.items.map((item: any) => item.DateLivraison ? formatDate(item.DateLivraison) : "-"))].join(" / ") 
          : null;
        
        const creePar = group.firstItem?.CreePar || group.firstItem?.DemandePar || "-";
        const service = [...new Set((group.items || []).map((item: any) => item.Agence || "-"))].join(" / ");
        
        const statusLines = Object.entries(group.statusSummary || {})
          .map(([status, count]) => `${status}(${count})`)
          .join("\n");
        
        return [
          group.bonCommande || "",
          itemsStr,
          group.totalQuantite || 0,
          group.totalPrix > 0 ? group.totalPrix.toLocaleString("fr-FR") : "-",
          fournisseur,
          refSage,
          dateLivraison ? dateLivraison : "-",
          service,
          creePar,
          statusLines || "-"
        ];
      });

      const totalWidth = pageWidth - 2 * margin;
      columnStyles = {
        0: { cellWidth: totalWidth * 0.06, fontSize: 7, halign: 'center' },
        1: { cellWidth: totalWidth * 0.15, fontSize: 6.5, lineColor: [200, 200, 200] },
        2: { cellWidth: totalWidth * 0.05, fontSize: 7, halign: 'center' },
        3: { cellWidth: totalWidth * 0.09, fontSize: 7, halign: 'right' },
        4: { cellWidth: totalWidth * 0.10, fontSize: 6.5 },
        5: { cellWidth: totalWidth * 0.07, fontSize: 6.5 },
        6: { cellWidth: totalWidth * 0.09, fontSize: 6.5, halign: 'center' },
        7: { cellWidth: totalWidth * 0.08, fontSize: 6.5 },
        8: { cellWidth: totalWidth * 0.09, fontSize: 6.5 },
        9: { cellWidth: totalWidth * 0.22, fontSize: 6.5 }
      };
    } else {
      // Format standard - Colonnes ajustées : Statut réduit, Désignation agrandie
      headers = [[
        "N Bon",
        "N DS",
        "Designation",
        "Qte",
        "Prix",
        "Fournisseur",
        "Ref.Sage",
        "Livraison",
        "Service",
        "Cree par",
        "Statut"
      ]];

      data = orders.map((o) => [
        o.NoBonCommande || "",
        o.NoDS || "",
        o.Designation || "",
        o.Quantite || 0,
        o.Prix !== undefined && o.Prix !== null ? o.Prix.toLocaleString("fr-FR") : "-",
        o.Fournisseur || "Achat Local",
        o.ReferenceSage || "-",
        o.DateLivraison ? formatDate(o.DateLivraison) : "-",
        o.Agence || "-",
        o.CreePar || o.DemandePar || "-",
        o.Statut || ""
      ]);

      const totalWidth = pageWidth - 2 * margin;
      columnStyles = {
        0: { cellWidth: totalWidth * 0.055, fontSize: 7, halign: 'center' },
        1: { cellWidth: totalWidth * 0.05, fontSize: 7 },
        2: { cellWidth: totalWidth * 0.19, fontSize: 7 }, // Agrandi (0.15 -> 0.19)
        3: { cellWidth: totalWidth * 0.04, fontSize: 7, halign: 'center' },
        4: { cellWidth: totalWidth * 0.07, fontSize: 7, halign: 'right' },
        5: { cellWidth: totalWidth * 0.10, fontSize: 6.5 },
        6: { cellWidth: totalWidth * 0.065, fontSize: 6.5 },
        7: { cellWidth: totalWidth * 0.07, fontSize: 6.5, halign: 'center' },
        8: { cellWidth: totalWidth * 0.07, fontSize: 6.5 },
        9: { cellWidth: totalWidth * 0.08, fontSize: 6.5 },
        10: { cellWidth: totalWidth * 0.17, fontSize: 7 } // Réduit (0.29 -> 0.17)
      };
    }

    // Calculer les totaux
    let totalPriceSum = 0;
    let totalQuantitySum = 0;
    let totalArticles = 0;
    const statusCounts: Record<string, number> = {};

    if (isGrouped) {
      orders.forEach((group) => {
        totalArticles += group.items ? group.items.length : 0;
        totalQuantitySum += group.totalQuantite || 0;
        totalPriceSum += group.totalPrix || 0;
        
        if (group.statusSummary) {
          Object.entries(group.statusSummary).forEach(([status, count]) => {
            statusCounts[status] = (statusCounts[status] || 0) + (count as number);
          });
        }
      });
    }

    // Creer le tableau
    autoTable(doc, {
      head: headers,
      body: data,
      startY: tableStartY,
      styles: {
        fontSize: 6.5,
        cellPadding: 1,
        overflow: "linebreak",
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
      },
      columnStyles: columnStyles,
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 6.5,
        halign: 'center',
        valign: 'middle',
        cellPadding: 1.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: margin, right: margin },
      tableWidth: 'auto',
      didDrawCell: (data: any) => {
        const statusColIndex = groupedExport ? 9 : 10;
        if (data.column.index === statusColIndex && data.cell.section === 'body') {
          const status = data.cell.raw;
          if (status && typeof status === 'string') {
            const lines = status.split('\n');
            if (lines.length > 0) {
              const firstStatus = lines[0].split('(')[0].trim();
              const color = getStatusColor(firstStatus);
              data.cell.styles.textColor = color;
            }
          }
        }
      },
      foot: groupedExport ? [[
        { content: "TOTAUX", colSpan: 2, styles: { fontStyle: "bold", fontSize: 7 } },
        { content: totalQuantitySum.toString(), styles: { fontStyle: "bold", fontSize: 7, halign: 'center' } },
        { content: formatPrice(totalPriceSum), styles: { fontStyle: "bold", fontSize: 7, halign: 'right' } },
        { content: "", colSpan: 6 }
      ]] : undefined,
      footStyles: {
        fillColor: [240, 240, 255],
        textColor: [31, 41, 55],
        fontStyle: "bold",
        fontSize: 7,
      },
    });

    // ==================== RESUME STATISTIQUE EN BAS DE PAGE ====================
    if (groupedExport && orders.length > 0) {
      const finalY = (doc as any).lastAutoTable.finalY || 180;
      const remainingSpace = pageHeight - finalY - 15;
      
      if (remainingSpace > 15) {
        const summaryY = finalY + 4;
        
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(margin, summaryY, pageWidth - margin, summaryY);
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);
        doc.text("RESUME STATISTIQUE", margin, summaryY + 4);
        
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.2);
        doc.line(margin, summaryY + 6, pageWidth - margin, summaryY + 6);
        
        const stats = [
          { label: "Bons", value: orders.length },
          { label: "Articles", value: totalArticles },
          { label: "Quantite", value: totalQuantitySum },
          { label: "Prix total", value: formatPrice(totalPriceSum) }
        ];

        const statWidth = (pageWidth - 2 * margin) / stats.length;
        let statY = summaryY + 9;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        
        stats.forEach((stat, index) => {
          const xPos = margin + (index * statWidth);
          doc.setTextColor(107, 114, 128);
          doc.text(stat.label, xPos, statY);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(31, 41, 55);
          doc.text(stat.value.toString(), xPos, statY + 4);
          doc.setFont("helvetica", "normal");
        });

        if (Object.keys(statusCounts).length > 0) {
          const statusY = statY + 8;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(31, 41, 55);
          doc.text("Statuts:", margin, statusY);
          
          doc.setFont("helvetica", "normal");
          let statusX = margin + 18;
          Object.entries(statusCounts).forEach(([status, count]) => {
            const color = getStatusColor(status);
            doc.setTextColor(color[0], color[1], color[2]);
            const text = `${status}: ${count}`;
            doc.text(text, statusX, statusY);
            statusX += doc.getStringUnitWidth(text) * 7 / doc.internal.scaleFactor + 5;
          });
        }
      }
    }

    // ==================== PIED DE PAGE ====================
    const totalPages = doc.internal.pages.length - 1;
    
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);
      
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.setTextColor(150, 150, 150);
      
      const footerText = `Genere le ${new Date().toLocaleString("fr-FR")}`;
      doc.text(footerText, margin, pageHeight - 4);
      
      const pageText = `Page ${i}/${totalPages}`;
      doc.text(pageText, pageWidth - margin - doc.getStringUnitWidth(pageText) * 6 / doc.internal.scaleFactor, pageHeight - 4);
      
      const centerText = "Document confidentiel";
      doc.text(centerText, pageWidth / 2, pageHeight - 4, { align: "center" });
    }

    const formattedTitle = title.toLowerCase().replace(/[\s']+/g, "_");
    doc.save(`${formattedTitle}_${Date.now()}.pdf`);
    return true;
    
  } catch (error) {
    console.error("Erreur lors de l'exportation PDF:", error);
    throw new Error("Erreur lors de la generation du PDF: " + (error as Error).message);
  }
}

/**
 * Exports orders array to a standard CSV file
 */
export function exportToCSV(orders: any[], filename: string, isGrouped: boolean = false) {
  try {
    const groupedExport = isGroupedExportDataset(orders, isGrouped);
    let headers: string[];
    let rows: string[][];

    if (groupedExport && orders.length > 0 && 'bonCommande' in orders[0]) {
      headers = [
        "N Bon Commande",
        "Designation",
        "Quantite Totale",
        "Prix Total (FCFA)",
        "Fournisseur",
        "Ref. Sage",
        "Livraison prevue",
        "Service",
        "Cree par",
        "Statuts"
      ];

      rows = orders.map((group) => {
        const statusStr = Object.entries(group.statusSummary || {})
          .map(([status, count]) => `${status}(${count})`)
          .join("; ");
        
        const itemsStr = group.items
          ? group.items.map((item: any) => `${item.Designation} (${item.Quantite})`).join("; ")
          : "";
        
        const fournisseur = group.items && group.items.length > 0 
          ? [...new Set(group.items.map((item: any) => item.Fournisseur || item.FournisseurType || "-"))].join(" / ")
          : "-";
        
        const refSage = group.items && group.items.length > 0 
          ? [...new Set(group.items.map((item: any) => item.ReferenceSage || "-"))].join(" / ")
          : "-";
        
        const dateLivraison = group.items && group.items.length > 0 
          ? [...new Set(group.items.map((item: any) => item.DateLivraison ? formatDate(item.DateLivraison) : "-"))].join(" / ") 
          : null;
        
        const creePar = group.firstItem?.CreePar || group.firstItem?.DemandePar || "-";
        const service = [...new Set((group.items || []).map((item: any) => item.Agence || "-"))].join(" / ");
        
        return [
          group.bonCommande || "",
          `"${itemsStr.replace(/"/g, '""')}"`,
          group.totalQuantite ? group.totalQuantite.toString() : "0",
          group.totalPrix > 0 ? group.totalPrix.toString() : "",
          `"${fournisseur.replace(/"/g, '""')}"`,
          refSage,
          dateLivraison ? dateLivraison : "",
          `"${service.replace(/"/g, '""')}"`,
          `"${creePar.replace(/"/g, '""')}"`,
          `"${statusStr.replace(/"/g, '""')}"`
        ];
      });
    } else {
      headers = [
        "N Bon Commande",
        "N DS",
        "Designation",
        "Quantite",
        "Prix (F CFA)",
        "Fournisseur",
        "Ref. Sage",
        "Livraison prevue",
        "Service demandeur",
        "Cree par",
        "Statut"
      ];

      rows = orders.map((o) => {
        const prix = o.Prix !== undefined && o.Prix !== null ? o.Prix : "";
        const creePar = o.CreePar || o.DemandePar || "-";
        
        return [
          o.NoBonCommande || "",
          o.NoDS || "",
          o.Designation ? `"${o.Designation.replace(/"/g, '""')}"` : "",
          o.Quantite || 0,
          prix,
          o.Fournisseur ? `"${o.Fournisseur.replace(/"/g, '""')}"` : "",
          o.ReferenceSage || "",
          o.DateLivraison ? formatDate(o.DateLivraison) : "",
          o.Agence ? `"${o.Agence.replace(/"/g, '""')}"` : "",
          `"${creePar.replace(/"/g, '""')}"`,
          o.Statut || ""
        ];
      });
    }

    const csvString = [headers.map(csvCell).join(";"), ...rows.map(r => r.map(csvCell).join(";"))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
    
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    
    const formattedFilename = filename.toLowerCase().replace(/[\s']+/g, "_");
    link.setAttribute("download", `${formattedFilename}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error("Erreur lors de l'exportation CSV:", error);
    throw new Error("Erreur lors de la generation du CSV: " + (error as Error).message);
  }
}
