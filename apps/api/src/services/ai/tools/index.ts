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

/**
 * Phase 1 tool registry — the complete, approved READ-only catalog
 * (CLEOPATRA_AI_TOOLS.md, Phase 1 table). Exactly 16 tools, zero WRITE
 * tools. Adding a Phase 2+ tool means adding it to a *separate* registry
 * gated behind its own approval, never appending here.
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
] as unknown as AnyAiToolDefinition[];
