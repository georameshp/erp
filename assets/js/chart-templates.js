
/* global window */
(function () {
  const templates = [
    {
      id: "ifrs-basic-service",
      name: "IFRS Basic - Service Company",
      description: "Standard IFRS-style chart for service companies with assets, liabilities, equity, income, expenses, tax, receivables and payables.",
      groups: [
        { code: "ASSETS", name: "Assets", nature: "debit", parentCode: null },
        { code: "CURRENT_ASSETS", name: "Current Assets", nature: "debit", parentCode: "ASSETS" },
        { code: "BANK_CASH", name: "Bank and Cash", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "TRADE_RECEIVABLES", name: "Trade Receivables", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "NON_CURRENT_ASSETS", name: "Non-current Assets", nature: "debit", parentCode: "ASSETS" },
        { code: "LIABILITIES", name: "Liabilities", nature: "credit", parentCode: null },
        { code: "CURRENT_LIABILITIES", name: "Current Liabilities", nature: "credit", parentCode: "LIABILITIES" },
        { code: "TRADE_PAYABLES", name: "Trade Payables", nature: "credit", parentCode: "CURRENT_LIABILITIES" },
        { code: "TAX_PAYABLES", name: "Tax Payables", nature: "credit", parentCode: "CURRENT_LIABILITIES" },
        { code: "EQUITY", name: "Equity", nature: "credit", parentCode: null },
        { code: "INCOME", name: "Income", nature: "credit", parentCode: null },
        { code: "SERVICE_REVENUE", name: "Service Revenue", nature: "credit", parentCode: "INCOME" },
        { code: "EXPENSES", name: "Expenses", nature: "debit", parentCode: null },
        { code: "ADMIN_EXPENSES", name: "Administrative Expenses", nature: "debit", parentCode: "EXPENSES" },
        { code: "FINANCE_COSTS", name: "Finance Costs", nature: "debit", parentCode: "EXPENSES" }
      ],
      ledgers: [
        { code: "LED-CASH", name: "Cash in Hand", groupCode: "BANK_CASH" },
        { code: "LED-BANK", name: "Bank Account", groupCode: "BANK_CASH" },
        { code: "LED-TRADE-RECEIVABLES", name: "Trade Receivables Control", groupCode: "TRADE_RECEIVABLES" },
        { code: "LED-TRADE-PAYABLES", name: "Trade Payables Control", groupCode: "TRADE_PAYABLES" },
        { code: "LED-VAT-INPUT", name: "VAT Input", groupCode: "CURRENT_ASSETS" },
        { code: "LED-VAT-OUTPUT", name: "VAT Output", groupCode: "TAX_PAYABLES" },
        { code: "LED-CAPITAL", name: "Owner Capital / Share Capital", groupCode: "EQUITY" },
        { code: "LED-RETAINED-EARNINGS", name: "Retained Earnings", groupCode: "EQUITY" },
        { code: "LED-SERVICE-INCOME", name: "Service Income", groupCode: "SERVICE_REVENUE" },
        { code: "LED-DISCOUNT-ALLOWED", name: "Discount Allowed", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-DISCOUNT-RECEIVED", name: "Discount Received", groupCode: "INCOME" },
        { code: "LED-RENT", name: "Rent Expense", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-SALARIES", name: "Salaries and Wages", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-UTILITIES", name: "Utilities Expense", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-BANK-CHARGES", name: "Bank Charges", groupCode: "FINANCE_COSTS" },
        { code: "LED-ROUND-OFF", name: "Round Off", groupCode: "ADMIN_EXPENSES" }
      ]
    },
    {
      id: "ifrs-trading-retail",
      name: "IFRS Trading / Retail with Inventory",
      description: "Standard IFRS-style chart for trading/retail companies with inventory, sales, COGS, VAT, debtors and creditors.",
      groups: [
        { code: "ASSETS", name: "Assets", nature: "debit", parentCode: null },
        { code: "CURRENT_ASSETS", name: "Current Assets", nature: "debit", parentCode: "ASSETS" },
        { code: "BANK_CASH", name: "Bank and Cash", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "TRADE_RECEIVABLES", name: "Trade Receivables", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "INVENTORY_ASSET", name: "Inventories", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "NON_CURRENT_ASSETS", name: "Non-current Assets", nature: "debit", parentCode: "ASSETS" },
        { code: "LIABILITIES", name: "Liabilities", nature: "credit", parentCode: null },
        { code: "CURRENT_LIABILITIES", name: "Current Liabilities", nature: "credit", parentCode: "LIABILITIES" },
        { code: "TRADE_PAYABLES", name: "Trade Payables", nature: "credit", parentCode: "CURRENT_LIABILITIES" },
        { code: "TAX_PAYABLES", name: "Tax Payables", nature: "credit", parentCode: "CURRENT_LIABILITIES" },
        { code: "EQUITY", name: "Equity", nature: "credit", parentCode: null },
        { code: "INCOME", name: "Income", nature: "credit", parentCode: null },
        { code: "SALES_REVENUE", name: "Sales Revenue", nature: "credit", parentCode: "INCOME" },
        { code: "OTHER_INCOME", name: "Other Income", nature: "credit", parentCode: "INCOME" },
        { code: "EXPENSES", name: "Expenses", nature: "debit", parentCode: null },
        { code: "COGS", name: "Cost of Goods Sold", nature: "debit", parentCode: "EXPENSES" },
        { code: "ADMIN_EXPENSES", name: "Administrative Expenses", nature: "debit", parentCode: "EXPENSES" },
        { code: "SELLING_EXPENSES", name: "Selling and Distribution Expenses", nature: "debit", parentCode: "EXPENSES" },
        { code: "FINANCE_COSTS", name: "Finance Costs", nature: "debit", parentCode: "EXPENSES" }
      ],
      ledgers: [
        { code: "LED-CASH", name: "Cash in Hand", groupCode: "BANK_CASH" },
        { code: "LED-BANK", name: "Bank Account", groupCode: "BANK_CASH" },
        { code: "LED-TRADE-RECEIVABLES", name: "Trade Receivables Control", groupCode: "TRADE_RECEIVABLES" },
        { code: "LED-TRADE-PAYABLES", name: "Trade Payables Control", groupCode: "TRADE_PAYABLES" },
        { code: "LED-INVENTORY", name: "Inventory Control", groupCode: "INVENTORY_ASSET" },
        { code: "LED-VAT-INPUT", name: "VAT Input", groupCode: "CURRENT_ASSETS" },
        { code: "LED-VAT-OUTPUT", name: "VAT Output", groupCode: "TAX_PAYABLES" },
        { code: "LED-CAPITAL", name: "Owner Capital / Share Capital", groupCode: "EQUITY" },
        { code: "LED-RETAINED-EARNINGS", name: "Retained Earnings", groupCode: "EQUITY" },
        { code: "LED-SALES", name: "Sales", groupCode: "SALES_REVENUE" },
        { code: "LED-SALES-RETURN", name: "Sales Returns", groupCode: "SALES_REVENUE" },
        { code: "LED-PURCHASE", name: "Purchases", groupCode: "COGS" },
        { code: "LED-PURCHASE-RETURN", name: "Purchase Returns", groupCode: "COGS" },
        { code: "LED-COGS", name: "Cost of Goods Sold", groupCode: "COGS" },
        { code: "LED-DISCOUNT-ALLOWED", name: "Discount Allowed", groupCode: "SELLING_EXPENSES" },
        { code: "LED-DISCOUNT-RECEIVED", name: "Discount Received", groupCode: "OTHER_INCOME" },
        { code: "LED-FREIGHT-IN", name: "Freight Inward", groupCode: "COGS" },
        { code: "LED-FREIGHT-OUT", name: "Freight Outward", groupCode: "SELLING_EXPENSES" },
        { code: "LED-RENT", name: "Rent Expense", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-SALARIES", name: "Salaries and Wages", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-UTILITIES", name: "Utilities Expense", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-BANK-CHARGES", name: "Bank Charges", groupCode: "FINANCE_COSTS" },
        { code: "LED-ROUND-OFF", name: "Round Off", groupCode: "ADMIN_EXPENSES" }
      ]
    },
    {
      id: "ifrs-construction-projects",
      name: "IFRS Construction / Projects",
      description: "Chart for project-based companies, including contract revenue, work in progress, project costs, retentions and advances.",
      groups: [
        { code: "ASSETS", name: "Assets", nature: "debit", parentCode: null },
        { code: "CURRENT_ASSETS", name: "Current Assets", nature: "debit", parentCode: "ASSETS" },
        { code: "BANK_CASH", name: "Bank and Cash", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "TRADE_RECEIVABLES", name: "Trade Receivables", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "CONTRACT_ASSETS", name: "Contract Assets / WIP", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "RETENTION_RECEIVABLES", name: "Retention Receivables", nature: "debit", parentCode: "CURRENT_ASSETS" },
        { code: "LIABILITIES", name: "Liabilities", nature: "credit", parentCode: null },
        { code: "CURRENT_LIABILITIES", name: "Current Liabilities", nature: "credit", parentCode: "LIABILITIES" },
        { code: "TRADE_PAYABLES", name: "Trade Payables", nature: "credit", parentCode: "CURRENT_LIABILITIES" },
        { code: "CONTRACT_LIABILITIES", name: "Contract Liabilities / Customer Advances", nature: "credit", parentCode: "CURRENT_LIABILITIES" },
        { code: "TAX_PAYABLES", name: "Tax Payables", nature: "credit", parentCode: "CURRENT_LIABILITIES" },
        { code: "EQUITY", name: "Equity", nature: "credit", parentCode: null },
        { code: "INCOME", name: "Income", nature: "credit", parentCode: null },
        { code: "CONTRACT_REVENUE", name: "Contract Revenue", nature: "credit", parentCode: "INCOME" },
        { code: "EXPENSES", name: "Expenses", nature: "debit", parentCode: null },
        { code: "PROJECT_COSTS", name: "Project Costs", nature: "debit", parentCode: "EXPENSES" },
        { code: "ADMIN_EXPENSES", name: "Administrative Expenses", nature: "debit", parentCode: "EXPENSES" },
        { code: "FINANCE_COSTS", name: "Finance Costs", nature: "debit", parentCode: "EXPENSES" }
      ],
      ledgers: [
        { code: "LED-CASH", name: "Cash in Hand", groupCode: "BANK_CASH" },
        { code: "LED-BANK", name: "Bank Account", groupCode: "BANK_CASH" },
        { code: "LED-TRADE-RECEIVABLES", name: "Trade Receivables Control", groupCode: "TRADE_RECEIVABLES" },
        { code: "LED-RETENTION-RECEIVABLE", name: "Retention Receivable", groupCode: "RETENTION_RECEIVABLES" },
        { code: "LED-WIP", name: "Work in Progress", groupCode: "CONTRACT_ASSETS" },
        { code: "LED-TRADE-PAYABLES", name: "Trade Payables Control", groupCode: "TRADE_PAYABLES" },
        { code: "LED-CUSTOMER-ADVANCES", name: "Customer Advances", groupCode: "CONTRACT_LIABILITIES" },
        { code: "LED-VAT-INPUT", name: "VAT Input", groupCode: "CURRENT_ASSETS" },
        { code: "LED-VAT-OUTPUT", name: "VAT Output", groupCode: "TAX_PAYABLES" },
        { code: "LED-CAPITAL", name: "Owner Capital / Share Capital", groupCode: "EQUITY" },
        { code: "LED-CONTRACT-REVENUE", name: "Contract Revenue", groupCode: "CONTRACT_REVENUE" },
        { code: "LED-MATERIAL-COST", name: "Project Material Cost", groupCode: "PROJECT_COSTS" },
        { code: "LED-LABOUR-COST", name: "Project Labour Cost", groupCode: "PROJECT_COSTS" },
        { code: "LED-SUBCONTRACT-COST", name: "Subcontract Cost", groupCode: "PROJECT_COSTS" },
        { code: "LED-EQUIPMENT-HIRE", name: "Equipment Hire", groupCode: "PROJECT_COSTS" },
        { code: "LED-RENT", name: "Rent Expense", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-SALARIES", name: "Salaries and Wages", groupCode: "ADMIN_EXPENSES" },
        { code: "LED-BANK-CHARGES", name: "Bank Charges", groupCode: "FINANCE_COSTS" }
      ]
    }
  ];

  function getTemplate(id) {
    return templates.find(t => t.id === id) || templates[0];
  }

  window.ChartTemplates = {
    list: templates,
    getTemplate
  };
})();
