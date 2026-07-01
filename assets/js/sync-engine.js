/* global window */
(function () {
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function zeroBalance() {
    return { debit: 0, credit: 0 };
  }

  function makeLedgerFile(ledger, group, setup, companyId, now, userEmail) {
    return {
      schemaVersion: 1,
      ledgerCode: ledger.code,
      codeLocked: true,
      ledgerName: ledger.name,
      groupCode: ledger.groupCode,
      groupName: group ? group.name : ledger.groupCode,
      nature: group ? group.nature : "debit",
      financialYear: setup.financialYear.code,
      companyId,
      opening: zeroBalance(),
      closing: zeroBalance(),
      transactions: [],
      summary: { daily: {}, monthly: {}, yearly: {} },
      systemLedger: true,
      createdFromTemplate: setup.chartTemplateId,
      createdAt: now,
      createdBy: userEmail,
      updatedAt: now,
      updatedBy: userEmail,
      revision: 1,
      isDeleted: false
    };
  }

  function makeGroupFile(group, ledgers, setup, companyId, now, userEmail) {
    return {
      schemaVersion: 1,
      groupCode: group.code,
      groupName: group.name,
      parentCode: group.parentCode || null,
      nature: group.nature,
      financialYear: setup.financialYear.code,
      companyId,
      ledgers: ledgers.map(l => ({
        ledgerCode: l.code,
        ledgerName: l.name,
        openingDebit: 0,
        openingCredit: 0,
        closingDebit: 0,
        closingCredit: 0
      })),
      totals: {
        openingDebit: 0,
        openingCredit: 0,
        closingDebit: 0,
        closingCredit: 0
      },
      systemGroup: true,
      createdFromTemplate: setup.chartTemplateId,
      createdAt: now,
      createdBy: userEmail,
      updatedAt: now,
      updatedBy: userEmail,
      revision: 1,
      isDeleted: false
    };
  }

  async function createDefaultChartOfAccounts(setup, folderIds, companyId, now, userEmail) {
    const template = setup.chartTemplate || (window.ChartTemplates ? window.ChartTemplates.getTemplate(setup.chartTemplateId) : null);
    if (!template) return { template: null, groupFiles: {}, ledgerFiles: {}, ledgerSummary: [] };

    const groupsByCode = new Map(template.groups.map(g => [g.code, g]));
    const groupFiles = {};
    const ledgerFiles = {};

    for (const group of template.groups) {
      const ledgers = template.ledgers.filter(l => l.groupCode === group.code);
      const groupDoc = makeGroupFile(group, ledgers, setup, companyId, now, userEmail);
      const file = await window.GoogleDrive.createJsonFile(group.code + ".json", folderIds.fy.ledgerGroups, groupDoc, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "ledger-group",
        companyId,
        financialYear: setup.financialYear.code,
        groupCode: group.code
      });
      groupFiles[group.code] = file.id;
    }

    for (const ledger of template.ledgers) {
      const group = groupsByCode.get(ledger.groupCode);
      const ledgerDoc = makeLedgerFile(ledger, group, setup, companyId, now, userEmail);
      const file = await window.GoogleDrive.createJsonFile(ledger.code + ".json", folderIds.fy.ledgerFiles, ledgerDoc, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "ledger",
        companyId,
        financialYear: setup.financialYear.code,
        ledgerCode: ledger.code,
        groupCode: ledger.groupCode
      });
      ledgerFiles[ledger.code] = file.id;
    }

    const ledgerSummary = template.groups.map(group => ({
      groupCode: group.code,
      groupName: group.name,
      parentCode: group.parentCode || null,
      nature: group.nature,
      openingDebit: 0,
      openingCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
      ledgerCount: template.ledgers.filter(l => l.groupCode === group.code).length
    }));

    return { template, groupFiles, ledgerFiles, ledgerSummary };
  }

  async function createInitialDriveStructure(setup) {
    const user = window.GoogleAuth.getCurrentUser();
    const now = new Date().toISOString();
    const companyId = "cmp_" + uuid();

    const root = await window.GoogleDrive.createFolder(window.ERP_CONFIG.APP_FOLDER_NAME, null, {
      appId: window.ERP_CONFIG.APP_ID,
      type: "root",
      companyId
    });

    const folderIds = { root: root.id };
    for (const name of window.ERP_CONFIG.DEFAULT_FOLDERS) {
      const f = await window.GoogleDrive.createFolder(name, root.id, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "system-folder",
        companyId
      });
      folderIds[name] = f.id;
    }

    const fyFolder = await window.GoogleDrive.createFolder(setup.financialYear.code, root.id, {
      appId: window.ERP_CONFIG.APP_ID,
      type: "financial-year",
      companyId,
      financialYear: setup.financialYear.code
    });
    folderIds.currentFinancialYear = fyFolder.id;

    const fySubfolders = ["ledgers", "inventory", "transactions", "events", "activity-log", "snapshots", "locks"];
    folderIds.fy = {};
    for (const name of fySubfolders) {
      const f = await window.GoogleDrive.createFolder(name, fyFolder.id, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "fy-folder",
        companyId,
        financialYear: setup.financialYear.code
      });
      folderIds.fy[name] = f.id;
    }

    // Ledger substructure
    const ledgerGroups = await window.GoogleDrive.createFolder("groups", folderIds.fy.ledgers, { appId: window.ERP_CONFIG.APP_ID, type: "ledger-groups", companyId });
    const ledgerFiles = await window.GoogleDrive.createFolder("ledger-files", folderIds.fy.ledgers, { appId: window.ERP_CONFIG.APP_ID, type: "ledger-files", companyId });
    folderIds.fy.ledgerGroups = ledgerGroups.id;
    folderIds.fy.ledgerFiles = ledgerFiles.id;

    // Inventory substructure
    const invGroups = await window.GoogleDrive.createFolder("groups", folderIds.fy.inventory, { appId: window.ERP_CONFIG.APP_ID, type: "inventory-groups", companyId });
    const itemFiles = await window.GoogleDrive.createFolder("item-files", folderIds.fy.inventory, { appId: window.ERP_CONFIG.APP_ID, type: "inventory-items", companyId });
    folderIds.fy.inventoryGroups = invGroups.id;
    folderIds.fy.itemFiles = itemFiles.id;

    const chartResult = await createDefaultChartOfAccounts(setup, folderIds, companyId, now, user.email);

    let logoFileInfo = null;
    if (setup.logoFile) {
      logoFileInfo = await window.GoogleDrive.uploadFile(
        "company-logo-" + setup.logoFile.name,
        folderIds.attachments,
        setup.logoFile,
        setup.logoFile.type,
        { appId: window.ERP_CONFIG.APP_ID, type: "company-logo", companyId }
      );
    }

    const company = {
      schemaVersion: 1,
      companyId,
      companyName: setup.companyName,
      address: setup.address || "",
      country: setup.country || null,
      currency: setup.currency,
      email: setup.email || "",
      contactNumber: setup.contactNumber || "",
      contactPerson: setup.contactPerson || "",
      logo: logoFileInfo ? {
        fileId: logoFileInfo.id,
        name: logoFileInfo.name,
        mimeType: logoFileInfo.mimeType,
        webViewLink: logoFileInfo.webViewLink || null,
        webContentLink: logoFileInfo.webContentLink || null
      } : null,
      taxName: setup.taxName,
      taxRate: setup.taxRate,
      chartOfAccounts: chartResult.template ? {
        templateId: chartResult.template.id,
        templateName: chartResult.template.name,
        templateDescription: chartResult.template.description,
        groupCount: chartResult.template.groups.length,
        ledgerCount: chartResult.template.ledgers.length
      } : null,
      createdAt: now,
      createdBy: user.email,
      revision: 1
    };

    const financialYear = {
      schemaVersion: 1,
      companyId,
      code: setup.financialYear.code,
      startDate: setup.financialYear.startDate,
      endDate: setup.financialYear.endDate,
      chartTemplateId: setup.chartTemplateId,
      chartTemplateName: chartResult.template ? chartResult.template.name : null,
      createdAt: now,
      revision: 1
    };

    const manifest = {
      schemaVersion: 1,
      companyId,
      appId: window.ERP_CONFIG.APP_ID,
      rootFolderId: root.id,
      currentFinancialYear: setup.financialYear.code,
      folderIds,
      fileIds: {},
      eventCount: 0,
      latestEventTime: null,
      needsRebuild: false,
      revision: 1,
      updatedAt: now
    };

    const companyFile = await window.GoogleDrive.createJsonFile("company.json", root.id, company, { appId: window.ERP_CONFIG.APP_ID, type: "company", companyId });
    const manifestFile = await window.GoogleDrive.createJsonFile("app-manifest.json", root.id, manifest, { appId: window.ERP_CONFIG.APP_ID, type: "manifest", companyId });
    const fyFile = await window.GoogleDrive.createJsonFile("financial-year.json", fyFolder.id, financialYear, { appId: window.ERP_CONFIG.APP_ID, type: "financial-year-file", companyId });

    manifest.fileIds.company = companyFile.id;
    manifest.fileIds.manifest = manifestFile.id;
    manifest.fileIds.financialYear = fyFile.id;
    manifest.fileIds.ledgerGroups = chartResult.groupFiles;
    manifest.fileIds.ledgers = chartResult.ledgerFiles;

    // Initial derived files
    manifest.fileIds.ledgerSummary = (await window.GoogleDrive.createJsonFile("ledger-summary.json", folderIds.fy.ledgers, {
      schemaVersion: 1,
      companyId,
      financialYear: setup.financialYear.code,
      chartTemplateId: setup.chartTemplateId,
      chartTemplateName: chartResult.template ? chartResult.template.name : null,
      revision: 1,
      groups: chartResult.ledgerSummary,
      totals: {
        openingDebit: 0,
        openingCredit: 0,
        closingDebit: 0,
        closingCredit: 0
      },
      updatedAt: now,
      updatedBy: user.email
    }, { appId: window.ERP_CONFIG.APP_ID, type: "ledger-summary", companyId })).id;

    manifest.fileIds.inventorySummary = (await window.GoogleDrive.createJsonFile("inventory-summary.json", folderIds.fy.inventory, {
      financialYear: setup.financialYear.code,
      revision: 1,
      groups: [],
      updatedAt: now
    }, { appId: window.ERP_CONFIG.APP_ID, type: "inventory-summary", companyId })).id;

    const setupEvent = makeEvent("setup_completed", "company", companyId, null, company, "Initial ERP Drive setup completed");
    await window.GoogleDrive.createEventFile(folderIds.fy.events, setupEvent);
    await window.LocalDB.putEvent(setupEvent);

    manifest.eventCount = 1;
    manifest.latestEventTime = setupEvent.createdAt;
    manifest.revision += 1;
    manifest.updatedAt = new Date().toISOString();
    await window.GoogleDrive.updateJsonFile(manifestFile.id, manifest);

    await window.LocalDB.setKV("driveState", { root, company, manifest, financialYear });
    return { root, company, manifest, financialYear };
  }

  async function loadExistingDriveStructure(rootFolder) {
    const companyFile = await window.GoogleDrive.findChildByName(rootFolder.id, "company.json");
    const manifestFile = await window.GoogleDrive.findChildByName(rootFolder.id, "app-manifest.json");
    if (!companyFile || !manifestFile) throw new Error("ERP folder exists but company.json/app-manifest.json is missing.");
    const company = await window.GoogleDrive.readJsonFile(companyFile.id);
    const manifest = await window.GoogleDrive.readJsonFile(manifestFile.id);
    await window.LocalDB.setKV("driveState", { root: rootFolder, company, manifest });
    return { root: rootFolder, company, manifest };
  }

  function makeEvent(action, entityType, entityId, before, after, description) {
    const user = window.GoogleAuth.getCurrentUser() || {};
    return {
      eventId: uuid(),
      schemaVersion: 1,
      action,
      entityType,
      entityId,
      createdAt: new Date().toISOString(),
      user: { email: user.email, name: user.name, sub: user.sub },
      before,
      after,
      description,
      reversible: true
    };
  }

  async function openOrSetup() {
    const root = await window.GoogleDrive.searchAppFolder();
    if (!root) return null;
    return await loadExistingDriveStructure(root);
  }

  async function syncNow() {
    const state = await window.LocalDB.getKV("driveState");
    if (!state || !state.root) throw new Error("No Drive state loaded.");
    return await loadExistingDriveStructure(state.root);
  }

  window.SyncEngine = {
    openOrSetup,
    createInitialDriveStructure,
    loadExistingDriveStructure,
    makeEvent,
    syncNow
  };
})();
