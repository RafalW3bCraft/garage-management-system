import { insertInvoiceSchema, type InsertInvoice } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

interface GSTCalculation {
  cgst: number;
  sgst: number;
  igst: number;
}

export class InvoiceService {
  calculateGST(
    subtotal: number,
    taxRate: number,
    customerState: string,
    businessState: string
  ): GSTCalculation {
    const taxAmount = (subtotal * taxRate) / 100;
    const isIntraState = customerState === businessState;

    if (isIntraState) {
      return {
        cgst: taxAmount / 2,
        sgst: taxAmount / 2,
        igst: 0
      };
    } else {
      return {
        cgst: 0,
        sgst: 0,
        igst: taxAmount
      };
    }
  }

  generateInvoiceNumber(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const sequence = `${timestamp.toString().slice(-4)}${random}`.slice(-4);
    
    return `INV-${year}${month}${day}-${sequence}`;
  }

  validateInvoice(data: unknown): { success: true; data: InsertInvoice } | { success: false; error: string } {
    try {
      const validatedData = insertInvoiceSchema.parse(data);
      return { success: true, data: validatedData };
    } catch (error) {
      const errorMessage = fromZodError(error as any).toString();
      return { success: false, error: errorMessage };
    }
  }
}

export const invoiceService = new InvoiceService();
