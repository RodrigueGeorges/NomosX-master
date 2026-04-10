/**
 * 📄 PDF Text Extractor pour theses.fr
 * 
 * Stratégie :
 * 1. Télécharger le PDF depuis l'URL publique
 * 2. Extraire le texte complet
 * 3. Nettoyer et structurer le contenu
 * 
 * Note : Ce module nécessite pdf-parse v2+
 * Installation : npm install pdf-parse
 */

import { fetchFromProvider } from '../http-client';

// Charger PDFParse via un import dynamique asynchrone
let PDFParseClass: any = null;

async function getPDFParseClass() {
  if (!PDFParseClass) {
    try {
      const module = await import('pdf-parse');
      PDFParseClass = module.PDFParse;
    } catch (err: any) {
      console.warn('[PDF Extractor] Failed to load pdf-parse:', err.message);
      PDFParseClass = null;
    }
  }
  return PDFParseClass;
}

interface PDFExtractionResult {
  success: boolean;
  text?: string;
  textLength?: number;
  pages?: number;
  preview?: string; // Premiers 2000 caractères
  error?: string;
}

interface PDFExtractionOptions {
  maxPages?: number; // Limiter le nombre de pages (performance)
  timeout?: number; // Timeout en ms
  maxSize?: number; // Taille max du PDF en bytes (défaut: 50MB)
}

/**
 * Extrait le texte d'un PDF depuis une URL
 * @param pdfUrl - URL du PDF à télécharger
 * @param options - Options d'extraction
 */
export async function extractPDFText(
  pdfUrl: string,
  options: PDFExtractionOptions = {}
): Promise<PDFExtractionResult> {
  const {
    maxPages = 100, // Limiter à 100 pages par défaut
    timeout = 60000, // 60 secondes
    maxSize = 50 * 1024 * 1024 // 50MB
  } = options;

  try {
    console.log(`[PDF Extractor] Downloading PDF from: ${pdfUrl.substring(0, 80)}...`);
    
    // Vérifier que l'URL est valide
    if (!pdfUrl || !pdfUrl.startsWith("http")) {
      return {
        success: false,
        error: "Invalid PDF URL"
      };
    }

    // Télécharger le PDF
    const startTime = Date.now();
    const response = await fetch(pdfUrl, {
      headers: {
        "User-Agent": "NomosX Research Agent (research@nomosx.fr)",
        "Accept": "application/pdf"
      },
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      console.warn(`[PDF Extractor] HTTP ${response.status}: ${response.statusText}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    // Vérifier le Content-Type
    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("pdf")) {
      console.warn(`[PDF Extractor] Not a PDF: ${contentType}`);
      return {
        success: false,
        error: `Not a PDF document (Content-Type: ${contentType})`
      };
    }

    // Vérifier la taille
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > maxSize) {
      console.warn(`[PDF Extractor] PDF too large: ${contentLength} bytes`);
      return {
        success: false,
        error: `PDF too large (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB > ${Math.round(maxSize / 1024 / 1024)}MB)`
      };
    }

    // Récupérer le buffer
    const buffer = await response.arrayBuffer();
    const downloadTime = Date.now() - startTime;
    console.log(`[PDF Extractor] Downloaded ${buffer.byteLength} bytes in ${downloadTime}ms`);

    // Extraire le texte avec pdf-parse v2
    console.log(`[PDF Extractor] Extracting text from PDF...`);
    
    // Charger PDFParse dynamiquement
    const PDFParse = await getPDFParseClass();
    
    // Vérifier que PDFParse est disponible
    if (!PDFParse) {
      console.error(`[PDF Extractor] pdf-parse module not available`);
      return {
        success: false,
        error: "pdf-parse module not installed. Run: npm install pdf-parse"
      };
    }
    
    try {
      const extractStart = Date.now();
      
      // Créer un parser avec le buffer
      const parser = new PDFParse({ data: Buffer.from(buffer) });
      
      // Extraire le texte (avec limitation des pages si spécifié)
      const textResult = await parser.getText({
        maxPages: maxPages > 0 ? maxPages : undefined
      });
      
      // Récupérer les informations du document
      const info = await parser.getInfo();
      
      // Nettoyer le parser
      await parser.destroy();
      
      const extractTime = Date.now() - extractStart;
      console.log(`[PDF Extractor] Extracted ${info.total} pages in ${extractTime}ms`);
      
      const fullText = textResult.text || "";
      const cleanedText = cleanPDFText(fullText);
      
      return {
        success: true,
        text: cleanedText,
        textLength: cleanedText.length,
        pages: info.total,
        preview: cleanedText.substring(0, 2000)
      };
      
    } catch (parseError: any) {
      console.error(`[PDF Extractor] Failed to parse PDF: ${parseError.message}`);
      return {
        success: false,
        error: `PDF parsing failed: ${parseError.message}`
      };
    }

  } catch (error: any) {
    console.error(`[PDF Extractor] Failed: ${error.message}`);
    
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return {
        success: false,
        error: "Download timeout"
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Nettoie le texte extrait d'un PDF
 * - Supprime les caractères de contrôle
 * - Normalise les espaces
 * - Supprime les headers/footers répétitifs
 */
function cleanPDFText(text: string): string {
  return text
    // Supprimer les caractères de contrôle
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")
    // Normaliser les sauts de ligne multiples
    .replace(/\n{3,}/g, "\n\n")
    // Normaliser les espaces
    .replace(/[ \t]+/g, " ")
    // Supprimer les espaces en début/fin de lignes
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

/**
 * Enrichit une thèse avec le texte extrait de son PDF
 * @param these - Thèse avec pdfUrl
 * @param options - Options d'extraction
 */
export async function enrichTheseWithPDFText(
  these: any,
  options: PDFExtractionOptions = {}
): Promise<any> {
  if (!these.pdfUrl) {
    console.warn(`[PDF Extractor] No PDF URL for ${these.id}`);
    return these;
  }

  console.log(`[PDF Extractor] Extracting text for: ${these.title.substring(0, 50)}...`);
  
  const extraction = await extractPDFText(these.pdfUrl, options);

  if (!extraction.success) {
    console.warn(`[PDF Extractor] Failed for ${these.id}: ${extraction.error}`);
    return {
      ...these,
      pdfExtraction: {
        attempted: true,
        success: false,
        error: extraction.error
      }
    };
  }

  // Enrichir l'abstract avec le preview si pas d'abstract existant
  const enrichedAbstract = these.abstract || extraction.preview || "";

  return {
    ...these,
    abstract: enrichedAbstract,
    fullText: extraction.text,
    hasFullText: extraction.text && extraction.text.length > 1000,
    pdfExtraction: {
      attempted: true,
      success: true,
      textLength: extraction.textLength,
      pages: extraction.pages,
      preview: extraction.preview
    }
  };
}

/**
 * Traite plusieurs thèses en parallèle avec limite de concurrence
 * @param theses - Liste de thèses avec pdfUrl
 * @param options - Options d'extraction
 * @param concurrency - Nombre de PDFs à traiter en parallèle (défaut: 3)
 */
export async function extractManyPDFs(
  theses: any[],
  options: PDFExtractionOptions = {},
  concurrency: number = 3
): Promise<any[]> {
  console.log(`[PDF Extractor] Processing ${theses.length} PDFs with concurrency ${concurrency}`);
  
  const results: any[] = [];
  
  // Traiter par batches pour limiter la concurrence
  for (let i = 0; i < theses.length; i += concurrency) {
    const batch = theses.slice(i, i + concurrency);
    console.log(`[PDF Extractor] Batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(theses.length / concurrency)}`);
    
    const batchResults = await Promise.all(
      batch.map(these => enrichTheseWithPDFText(these, options))
    );
    
    results.push(...batchResults);
  }
  
  const successCount = results.filter(r => r.pdfExtraction?.success).length;
  console.log(`[PDF Extractor] ✅ ${successCount}/${theses.length} PDFs extracted successfully`);
  
  return results;
}

/**
 * Statistiques d'extraction pour monitoring
 */
export function getPDFExtractionStats(enrichedTheses: any[]): {
  total: number;
  attempted: number;
  successful: number;
  failed: number;
  successRate: number;
  totalPages: number;
  totalTextLength: number;
  avgTextLength: number;
} {
  const attempted = enrichedTheses.filter(t => t.pdfExtraction?.attempted).length;
  const successful = enrichedTheses.filter(t => t.pdfExtraction?.success).length;
  const failed = attempted - successful;
  
  const totalPages = enrichedTheses
    .filter(t => t.pdfExtraction?.pages)
    .reduce((sum, t) => sum + (t.pdfExtraction.pages || 0), 0);
  
  const totalTextLength = enrichedTheses
    .filter(t => t.pdfExtraction?.textLength)
    .reduce((sum, t) => sum + (t.pdfExtraction.textLength || 0), 0);
  
  return {
    total: enrichedTheses.length,
    attempted,
    successful,
    failed,
    successRate: attempted > 0 ? successful / attempted : 0,
    totalPages,
    totalTextLength,
    avgTextLength: successful > 0 ? totalTextLength / successful : 0
  };
}
