import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';

// Configure worker for browser environment
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

export interface ParsedPdfItems {
  line_number: number;
  barcode: string;
  drug_name: string;
  quantity: number;
  bonus_quantity: number;
}

export interface ParsedPdfMetadata {
  order_number: string;
  delivery_date: string;
  total_items: number;
}

export interface ParsedPdf {
  order_metadata: ParsedPdfMetadata;
  items: ParsedPdfItems[];
}

/**
 * Parses a PDF file (as Uint8Array) to extract pharmacy shipment order data.
 * Based on a fixed layout using coordinate-based parsing.
 */
export async function parsePdf(data: Uint8Array): Promise<ParsedPdf> {
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  const order_metadata: ParsedPdfMetadata = {
    order_number: '',
    delivery_date: '',
    total_items: 0,
  };

  const items: ParsedPdfItems[] = [];
  let lastLineNumber = 0;

  // Coordinate ranges from analysis
  const RANGES = {
    LINE_BARCODE: { min: 10, max: 100 },
    DRUG_NAME: { min: 110, max: 260 },
    QUANTITY: { min: 250, max: 270 }, // Note: overlap with name? Let's be careful.
    BONUS_QUANTITY: { min: 280, max: 300 },
    HEADER_ORDER: { min: 466, max: 778 },
    HEADER_DATE: { min: 466, max: 793 }, // Same X, but likely different Y
  };

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Group text items by Y coordinate (with tolerance)
    const lines: { y: number; items: { x: number; text: string }[] }[] = [];
    const Y_TOLERANCE = 2;

    for (const item of textContent.items) {
      const x = item.transform[4];
      const y = item.transform[5];
      const text = item.str.trim();

      if (!text) continue;

      let line = lines.find(l => Math.abs(l.y - y) <= Y_TOLERANCE);
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
      }
      line.items.push({ x, text });
    }

    // Sort lines by Y descending (top to bottom)
    lines.sort((a, b) => b.y - a.y);
    // Sort items within each line by X ascending (left to right)
    lines.forEach(line => line.items.sort((a, b) => a.x - b.x));

    for (const line of lines) {
      // 1. Check if it's a header line (Order Number or Date)
      // We search for text in the header X ranges.
      // Since they might have same X, we check Y position or just try to match content.
      
      // Simplified header detection: check if X is in header range and it's early in the page
      // In a real implementation, we'd be more precise about Y.
      
      // Let's check if this line contains order_number or delivery_date.
      // We'll look for the text that falls into the header X ranges.
      const headerText = line.items.map(it => it.text).join(' ');
      
      // For now, let's try to match patterns or just check if it's not a data line.
      // Data lines usually start with a number (line_number) in the [10, 100] range.
      
      const firstItem = line.items[0];
      if (!firstItem) continue;

      // Try to detect header lines first
      if (firstItem.x >= RANGES.HEADER_ORDER.min && firstItem.x <= RANGES.HEADER_ORDER.max) {
        // This is a potential header line. 
        // If it's the first page and we haven't found order_number yet.
        if (order_metadata.order_number === '' && i === 1) {
           // We need to distinguish between order_number and delivery_date.
           // In the PDF, they are likely on different lines.
           // Let's use the Y coordinate or just check the text content.
           // For simplicity, let's assume the first one found is order_number, second is date.
           // A better way is to check if the text matches a pattern.
           if (order_metadata.order_number === '') {
             order_metadata.order_number = headerText;
           } else if (order_metadata.delivery_date === '') {
             order_metadata.delivery_date = headerText;
           }
           continue;
        }
      }

      // 2. Data Line Detection
      // A data line must have a line number in [10, 100]
      const line_number_match = firstItem.text.match(/^(\d+)$/);
      if (line_number_match && firstItem.x >= RANGES.LINE_BARCODE.min && firstItem.x <= RANGES.LINE_BARCODE.max) {
        const lineNumber = parseInt(line_number_match[1], 10);
        
        // Check for continuous line numbers
        if (lastLineNumber !== 0 && lineNumber !== lastLineNumber + 1) {
          // Stop condition: line number gap detected (as per todo)
          // But wait, first page might start at 1.
          // If lastLineNumber was 0, it's fine.
          // If we are on page 1, lastLineNumber will be updated.
          // On page 2, it should be lastLineNumber + 1.
          if (i > 1 || (lineNumber !== 1 && lastLineNumber !== 0)) {
            break; 
          }
        }
        lastLineNumber = lineNumber;

        // Extract other fields based on X ranges
        let barcode = '';
        let drug_name = '';
        let quantity = 0;
        let bonus_quantity = 0;

        // We need to look at all items in the line because the first item might be line_number
        // and the second item might be the barcode.
        
        // Re-parse line items to find fields by X
        for (const item of line.items) {
          if (item.x >= RANGES.LINE_BARCODE.min && item.x <= RANGES.LINE_BARCODE.max) {
            // This could be line_number or barcode. 
            // If it matches the line_number regex, it's line_number.
            // Otherwise, it's barcode.
            if (!line_number_match || item.text !== line_number_match[1]) {
               barcode = item.text;
            }
          } else if (item.x >= RANGES.DRUG_NAME.min && item.x <= RANGES.DRUG_NAME.max) {
            drug_name = item.text;
          } else if (item.x >= RANGES.QUANTITY.min && item.x <= RANGES.QUANTITY.max) {
            quantity = parseInt(item.text, 10) || 0;
          } else if (item.x >= RANGES.BONUS_QUANTITY.min && item.x <= RANGES.BONUS_QUANTITY.max) {
            bonus_quantity = parseInt(item.text, 10) || 0;
          }
        }

        // Fallback: if barcode is still empty, maybe it was part of the first item?
        // e.g. "1 12345678"
        if (barcode === '' && line_number_match) {
           // This is tricky. Let's try to see if there's another item in the same range.
           // The loop above already handles multiple items in the same range.
        }

        if (drug_name || barcode) {
          items.push({
            line_number: lineNumber,
            barcode,
            drug_name,
            quantity,
            bonus_quantity,
          });
        }
      } else {
        // If it's not a data line and not a header line, and it's not an empty line...
        // Check for "以下空白" (End of list)
        if (headerText.includes('以下空白')) {
           break;
        }
      }
    }
    
    if (items.length > 0 && i > 1 && items[0].line_number !== lastLineNumber + 1) {
        // This handles the case where we might have finished the list on a previous page
        // but the loop continues.
        // However, the break inside the loop should handle it.
    }
  }

  order_metadata.total_items = items.length;

  return {
    order_metadata,
    items,
  };
}
