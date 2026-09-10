import type { AnyAiToolDefinition } from '../toolTypes.js';
import { searchCustomersTool } from './searchCustomers.js';
import { getCustomerTool } from './getCustomer.js';
import { getCustomerBalanceTool } from './getCustomerBalance.js';
import { searchLeadsTool } from './searchLeads.js';
import { searchOrdersTool } from './searchOrders.js';
import { getOrderTool } from './getOrder.js';
import { getWorkOrderTool } from './getWorkOrder.js';
import { getProductionStatusTool } from './getProductionStatus.js';
import { getTreasurySummaryTool } from './getTreasurySummary.js';
import { searchInventoryTool } from './searchInventory.js';
import { getInventoryItemTool } from './getInventoryItem.js';
import { calculatePriceTool } from './calculatePrice.js';
import { searchCallLogsTool } from './searchCallLogs.js';
import { getReorderDueTool } from './getReorderDue.js';
import { getDashboardSummaryTool } from './getDashboardSummary.js';
import { getEmployeePayrollTool } from './getEmployeePayroll.js';
import { searchQuotationsTool } from './searchQuotations.js';
import { getQuotationTool } from './getQuotation.js';
import { searchProductionByCustomerTool } from './searchProductionByCustomer.js';
import { searchSuppliersTool } from './searchSuppliers.js';
import { getSupplierStatementTool } from './getSupplierStatement.js';

/**
 * READ-only tool registry — the Phase 1 catalog (CLEOPATRA_AI_TOOLS.md,
 * 16 tools) plus each Phase 2 read-tool task the owner has explicitly
 * approved one at a time (Task 1, 2026-09-10: `search_quotations`/
 * `get_quotation`; Task 3, 2026-09-10: `search_production_by_customer`;
 * Task 4, 2026-09-10: `search_suppliers`/`get_supplier_statement`).
 * Zero WRITE tools. A tool is only ever appended here after its own
 * specific approval — never speculatively.
 */
export const AI_TOOLS: AnyAiToolDefinition[] = [
  searchCustomersTool,
  getCustomerTool,
  getCustomerBalanceTool,
  searchLeadsTool,
  searchOrdersTool,
  getOrderTool,
  getWorkOrderTool,
  getProductionStatusTool,
  getTreasurySummaryTool,
  searchInventoryTool,
  getInventoryItemTool,
  calculatePriceTool,
  searchCallLogsTool,
  getReorderDueTool,
  getDashboardSummaryTool,
  getEmployeePayrollTool,
  searchQuotationsTool,
  getQuotationTool,
  searchProductionByCustomerTool,
  searchSuppliersTool,
  getSupplierStatementTool,
] as unknown as AnyAiToolDefinition[];
