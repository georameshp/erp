/* global window, $, confirm, alert */
(function () {
  let cache = { state: null, groups: [], ledgers: [], groupFiles: {}, ledgerFiles: {} };
  let initialized = false;

  function nowIso() { return new Date().toISOString(); }
  function userEmail() { return (window.GoogleAuth.getCurrentUser() || {}).email || "unknown"; }
  function safeCode(value, prefix) {
    const code = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "_").replace(/^_+|_+$/g, "");
    return prefix && !code.startsWith(prefix) ? prefix + code : code;
  }
  function amount(v) { return Number(v || 0); }
  function balanceText(bal) {
    bal = bal || { debit: 0, credit: 0 };
    const d = amount(bal.debit);
    const c = amount(bal.credit);
    if (d) return d.toFixed(3) + " Dr";
    if (c) return c.toFixed(3) + " Cr";
    return "0.000";
  }
  function hasMoney(bal) { return !!(bal && (amount(bal.debit) || amount(bal.credit))); }
  function canManageLedgers() {
    return !window.UserManager || window.UserManager.can("ledgers.manage");
  }

  function hasLedgerEntries(ledger) {
    if (!ledger) return false;
    if (hasMoney(ledger.opening)) return true;
    if (Array.isArray(ledger.transactions) && ledger.transactions.length > 0) return true;
    const summary = ledger.summary || {};
    return [summary.daily, summary.monthly, summary.yearly].some(obj => obj && Object.keys(obj).length > 0);
  }

  async function getState() {
    const state = await window.LocalDB.getKV("driveState");
    if (!state || !state.manifest) throw new Error("Drive ERP state is not loaded. Please sync or login again.");
    cache.state = state;
    return state;
  }

  async function saveState(state) {
    await window.LocalDB.setKV("driveState", state);
    cache.state = state;
  }

  async function readJsonSafe(fileId) {
    try { return await window.GoogleDrive.readJsonFile(fileId); } catch (e) { console.warn("Unable to read file", fileId, e); return null; }
  }

  async function discoverLedgerFileIds(manifest) {
    const groupFileIds = { ...(((manifest.fileIds || {}).ledgerGroups) || {}) };
    const ledgerFileIds = { ...(((manifest.fileIds || {}).ledgers) || {}) };

    // Backward compatibility / repair: if manifest does not contain file IDs,
    // discover JSON files from the Drive folders.
    if (!Object.keys(groupFileIds).length && manifest.folderIds && manifest.folderIds.fy && manifest.folderIds.fy.ledgerGroups) {
      const files = await window.GoogleDrive.listChildren(manifest.folderIds.fy.ledgerGroups);
      files.filter(f => f.mimeType === "application/json" || String(f.name).endsWith(".json")).forEach(f => {
        const code = (f.appProperties && f.appProperties.groupCode) || String(f.name).replace(/\.json$/i, "");
        groupFileIds[code] = f.id;
      });
    }

    if (!Object.keys(ledgerFileIds).length && manifest.folderIds && manifest.folderIds.fy && manifest.folderIds.fy.ledgerFiles) {
      const files = await window.GoogleDrive.listChildren(manifest.folderIds.fy.ledgerFiles);
      files.filter(f => f.mimeType === "application/json" || String(f.name).endsWith(".json")).forEach(f => {
        const code = (f.appProperties && f.appProperties.ledgerCode) || String(f.name).replace(/\.json$/i, "");
        ledgerFileIds[code] = f.id;
      });
    }

    return { groupFileIds, ledgerFileIds };
  }

  async function loadJsonDataFromDrive(manifest) {
    const discovered = await discoverLedgerFileIds(manifest);
    const groupFileIds = discovered.groupFileIds;
    const ledgerFileIds = discovered.ledgerFileIds;

    const groupPairs = await Promise.all(Object.entries(groupFileIds).map(async ([code, fileId]) => {
      const doc = await readJsonSafe(fileId);
      return doc && !doc.isDeleted ? { ...doc, _fileId: fileId } : null;
    }));

    const ledgerPairs = await Promise.all(Object.entries(ledgerFileIds).map(async ([code, fileId]) => {
      const doc = await readJsonSafe(fileId);
      return doc && !doc.isDeleted ? { ...doc, _fileId: fileId } : null;
    }));

    return {
      groupFileIds,
      ledgerFileIds,
      groups: groupPairs.filter(Boolean).sort((a, b) => String(a.groupName).localeCompare(String(b.groupName))),
      ledgers: ledgerPairs.filter(Boolean).sort((a, b) => String(a.ledgerName).localeCompare(String(b.ledgerName)))
    };
  }

  function applyLedgerCache(data, groupFileIds, ledgerFileIds) {
    cache.groups = (data.groups || []).map(g => ({ ...g, _fileId: g._fileId || groupFileIds[g.groupCode] }));
    cache.ledgers = (data.ledgers || []).map(l => ({ ...l, _fileId: l._fileId || ledgerFileIds[l.ledgerCode] }));
    cache.groupFiles = groupFileIds;
    cache.ledgerFiles = ledgerFileIds;
    renderTables();
    fillGroupSelects();
    $("#statLedgers").text(cache.ledgers.length);
  }

  async function reconcileJsonToSqliteInBackground(manifest) {
    try {
      const jsonData = await loadJsonDataFromDrive(manifest);
      await window.SQLiteManager.syncLedgersFromJson(jsonData.groups, jsonData.ledgers, true);
    } catch (e) {
      console.warn("Background JSON→SQLite reconciliation failed. SQLite/JSON fallback still available.", e.message || e);
    }
  }

  async function loadData() {
    const gBody = $("#ledgerGroupTable");
    const lBody = $("#ledgerTable");
    gBody.html('<tr><td colspan="4" class="text-muted p-3"><i class="fas fa-spinner fa-spin mr-1"></i>Loading ledger groups...</td></tr>');
    lBody.html('<tr><td colspan="6" class="text-muted p-3"><i class="fas fa-spinner fa-spin mr-1"></i>Loading ledgers...</td></tr>');

    try {
      const state = await getState();
      const manifest = state.manifest || {};
      const discovered = await discoverLedgerFileIds(manifest);
      const groupFileIds = discovered.groupFileIds;
      const ledgerFileIds = discovered.ledgerFileIds;

      // Primary path: SQLite. It is much faster after the first sync.
      if (window.SQLiteManager && window.SQLiteManager.isAvailable()) {
        try {
          await window.SQLiteManager.open();
          const sqliteData = await window.SQLiteManager.getLedgerData();
          if ((sqliteData.groups && sqliteData.groups.length) || (sqliteData.ledgers && sqliteData.ledgers.length)) {
            applyLedgerCache(sqliteData, groupFileIds, ledgerFileIds);
            // JSON is still the source/audit fallback. Reconcile in background for concurrent-user changes.
            setTimeout(() => reconcileJsonToSqliteInBackground(manifest), 50);
            return cache;
          }
        } catch (sqliteErr) {
          console.warn("SQLite primary load failed. Falling back to JSON.", sqliteErr.message || sqliteErr);
        }
      }

      // Fallback and first-run path: JSON files from Google Drive.
      const jsonData = await loadJsonDataFromDrive(manifest);
      applyLedgerCache(jsonData, jsonData.groupFileIds, jsonData.ledgerFileIds);

      // Repair local manifest cache.
      manifest.fileIds = manifest.fileIds || {};
      manifest.fileIds.ledgerGroups = { ...jsonData.groupFileIds };
      manifest.fileIds.ledgers = { ...jsonData.ledgerFileIds };
      state.manifest = manifest;
      await saveState(state);

      // Build/refresh SQLite from JSON for next fast load.
      if (window.SQLiteManager && window.SQLiteManager.isAvailable()) {
        await window.SQLiteManager.syncLedgersFromJson(jsonData.groups, jsonData.ledgers, true);
      }
      return cache;
    } catch (err) {
      console.error("Ledger load failed", err);
      gBody.html('<tr><td colspan="4" class="text-danger p-3">Unable to load ledger groups: ' + escapeHtml(err.message || err) + '</td></tr>');
      lBody.html('<tr><td colspan="6" class="text-danger p-3">Unable to load ledgers: ' + escapeHtml(err.message || err) + '</td></tr>');
      throw err;
    }
  }

  function groupName(code) {
    const g = cache.groups.find(x => x.groupCode === code);
    return g ? g.groupName : code;
  }

  function renderTables() {
    const canEdit = canManageLedgers();
    const actionDisabled = canEdit ? "" : "disabled title='Read only'";
    $("#btnAddLedgerGroup,#btnAddLedger").prop("disabled", !canEdit);
    const gBody = $("#ledgerGroupTable");
    const lBody = $("#ledgerTable");
    if (!cache.groups.length) {
      gBody.html('<tr><td colspan="4" class="text-muted p-3">No ledger groups found.</td></tr>');
    } else {
      gBody.html(cache.groups.map(g => `
        <tr>
          <td><code>${escapeHtml(g.groupCode)}</code></td>
          <td>${escapeHtml(g.groupName)}</td>
          <td><span class="badge badge-${g.nature === "credit" ? "warning" : "info"}">${escapeHtml(g.nature || "debit")}</span></td>
          <td>
            <button class="btn btn-xs btn-outline-primary btn-edit-group" data-code="${escapeAttr(g.groupCode)}" ${actionDisabled}><i class="fas fa-edit"></i></button>
            <button class="btn btn-xs btn-outline-danger btn-delete-group" data-code="${escapeAttr(g.groupCode)}" ${actionDisabled}><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join(""));
    }

    if (!cache.ledgers.length) {
      lBody.html('<tr><td colspan="6" class="text-muted p-3">No ledgers found.</td></tr>');
    } else {
      lBody.html(cache.ledgers.map(l => `
        <tr>
          <td><code>${escapeHtml(l.ledgerCode)}</code></td>
          <td>${escapeHtml(l.ledgerName)} ${l.systemLedger ? '<span class="badge badge-light ml-1">system</span>' : ''}</td>
          <td>${escapeHtml(groupName(l.groupCode))}</td>
          <td>${escapeHtml(balanceText(l.opening))}</td>
          <td>${escapeHtml(balanceText(l.closing))}</td>
          <td>
            <button class="btn btn-xs btn-outline-primary btn-edit-ledger" data-code="${escapeAttr(l.ledgerCode)}" ${actionDisabled}><i class="fas fa-edit"></i></button>
            <button class="btn btn-xs btn-outline-danger btn-delete-ledger" data-code="${escapeAttr(l.ledgerCode)}" ${actionDisabled}><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join(""));
    }
  }

  function fillGroupSelects(selectedGroup, selectedParent) {
    const activeGroups = cache.groups.slice().sort((a, b) => a.groupName.localeCompare(b.groupName));
    const ledgerGroup = $("#ledgerGroupCode");
    const parentGroup = $("#ledgerGroupParent");
    ledgerGroup.empty();
    parentGroup.empty().append('<option value="">None</option>');
    activeGroups.forEach(g => {
      ledgerGroup.append(`<option value="${escapeAttr(g.groupCode)}">${escapeHtml(g.groupName)} (${escapeHtml(g.groupCode)})</option>`);
      parentGroup.append(`<option value="${escapeAttr(g.groupCode)}">${escapeHtml(g.groupName)} (${escapeHtml(g.groupCode)})</option>`);
    });
    if (selectedGroup) ledgerGroup.val(selectedGroup);
    if (selectedParent) parentGroup.val(selectedParent);
  }

  function openGroupModal(mode, groupCode) {
    const group = cache.groups.find(g => g.groupCode === groupCode) || null;
    $("#ledgerGroupMode").val(mode);
    $("#ledgerGroupModalTitle").text(mode === "edit" ? "Edit Ledger Group" : "Create Ledger Group");
    $("#ledgerGroupCode").prop("disabled", mode === "edit").val(group ? group.groupCode : "");
    $("#ledgerGroupName").val(group ? group.groupName : "");
    $("#ledgerGroupNature").val(group ? group.nature || "debit" : "debit");
    fillGroupSelects(null, group ? group.parentCode || "" : "");
    if (group) $("#ledgerGroupParent option[value='" + cssEscape(group.groupCode) + "']").prop("disabled", true);
    $("#ledgerGroupModal").modal("show");
  }

  function openLedgerModal(mode, ledgerCode) {
    const ledger = cache.ledgers.find(l => l.ledgerCode === ledgerCode) || null;
    $("#ledgerMode").val(mode);
    $("#ledgerModalTitle").text(mode === "edit" ? "Edit Ledger" : "Create Ledger");
    $("#ledgerCode").prop("disabled", mode === "edit").val(ledger ? ledger.ledgerCode : "LED-");
    $("#ledgerName").val(ledger ? ledger.ledgerName : "");
    fillGroupSelects(ledger ? ledger.groupCode : (cache.groups[0] ? cache.groups[0].groupCode : ""));
    $("#ledgerOpeningDebit").val(ledger && ledger.opening ? amount(ledger.opening.debit) : 0);
    $("#ledgerOpeningCredit").val(ledger && ledger.opening ? amount(ledger.opening.credit) : 0);
    $("#ledgerModal").modal("show");
  }

  async function updateManifest(state, manifest) {
    manifest.revision = amount(manifest.revision) + 1;
    manifest.updatedAt = nowIso();
    if (manifest.fileIds && manifest.fileIds.manifest) await window.GoogleDrive.updateJsonFile(manifest.fileIds.manifest, manifest);
    state.manifest = manifest;
    await saveState(state);
  }

  async function addEvent(action, entityType, entityId, before, after, description) {
    const state = await getState();
    const manifest = state.manifest;
    const event = window.SyncEngine.makeEvent(action, entityType, entityId, before, after, description);
    if (manifest.folderIds && manifest.folderIds.fy && manifest.folderIds.fy.events) {
      await window.GoogleDrive.createEventFile(manifest.folderIds.fy.events, event);
    }
    await window.LocalDB.putEvent(event);
    manifest.eventCount = amount(manifest.eventCount) + 1;
    manifest.latestEventTime = event.createdAt;
    await updateManifest(state, manifest);
  }

  async function syncSqliteAfterJson(type, doc, deleted) {
    if (!window.SQLiteManager || !window.SQLiteManager.isAvailable()) return;
    try {
      if (type === "group") {
        if (deleted) await window.SQLiteManager.markGroupDeleted(doc.groupCode);
        else await window.SQLiteManager.upsertLedgerGroup(doc);
      }
      if (type === "ledger") {
        if (deleted) await window.SQLiteManager.markLedgerDeleted(doc.ledgerCode);
        else await window.SQLiteManager.upsertLedger(doc);
      }
    } catch (e) {
      // JSON has already been saved. SQLite is primary for speed, but JSON remains fallback/source.
      console.warn("SQLite update failed after JSON save. JSON fallback remains valid:", e.message || e);
    }
  }

  async function updateLedgerSummary(mutator) {
    const state = await getState();
    const manifest = state.manifest;
    const fileId = manifest.fileIds && manifest.fileIds.ledgerSummary;
    if (!fileId) return;
    const summary = await window.GoogleDrive.readJsonFile(fileId);
    summary.groups = summary.groups || [];
    mutator(summary);
    summary.revision = amount(summary.revision) + 1;
    summary.updatedAt = nowIso();
    summary.updatedBy = userEmail();
    await window.GoogleDrive.updateJsonFile(fileId, summary);
  }

  async function saveGroupFromForm() {
    if (!canManageLedgers()) throw new Error("You are not allowed to manage ledger groups.");
    const state = await getState();
    const manifest = state.manifest;
    manifest.fileIds = manifest.fileIds || {};
    manifest.fileIds.ledgerGroups = manifest.fileIds.ledgerGroups || {};
    const mode = $("#ledgerGroupMode").val();
    const code = safeCode($("#ledgerGroupCode").val());
    const name = $("#ledgerGroupName").val().trim();
    const nature = $("#ledgerGroupNature").val();
    const parentCode = $("#ledgerGroupParent").val() || null;
    if (!code || !name) throw new Error("Group code and name are required.");
    if (parentCode === code) throw new Error("Parent group cannot be the same group.");

    if (mode === "create") {
      if (manifest.fileIds.ledgerGroups[code]) throw new Error("Ledger group code already exists.");
      const doc = {
        schemaVersion: 1,
        groupCode: code,
        groupName: name,
        parentCode,
        nature,
        financialYear: manifest.currentFinancialYear,
        companyId: manifest.companyId,
        ledgers: [],
        totals: { openingDebit: 0, openingCredit: 0, closingDebit: 0, closingCredit: 0 },
        systemGroup: false,
        createdAt: nowIso(),
        createdBy: userEmail(),
        updatedAt: nowIso(),
        updatedBy: userEmail(),
        revision: 1,
        isDeleted: false
      };
      const file = await window.GoogleDrive.createJsonFile(code + ".json", manifest.folderIds.fy.ledgerGroups, doc, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "ledger-group",
        companyId: manifest.companyId,
        financialYear: manifest.currentFinancialYear,
        groupCode: code
      });
      manifest.fileIds.ledgerGroups[code] = file.id;
      await updateManifest(state, manifest);
      await updateLedgerSummary(summary => summary.groups.push({ groupCode: code, groupName: name, parentCode, nature, openingDebit: 0, openingCredit: 0, closingDebit: 0, closingCredit: 0, ledgerCount: 0 }));
      await addEvent("ledger_group_created", "ledger_group", code, null, doc, "Created ledger group " + name);
      await syncSqliteAfterJson("group", doc, false);
    } else {
      const fileId = manifest.fileIds.ledgerGroups[code];
      if (!fileId) throw new Error("Ledger group file not found.");
      const before = await window.GoogleDrive.readJsonFile(fileId);
      const after = { ...before, groupName: name, parentCode, nature, updatedAt: nowIso(), updatedBy: userEmail(), revision: amount(before.revision) + 1 };
      await window.GoogleDrive.updateJsonFile(fileId, after);
      await updateLedgerSummary(summary => {
        const row = summary.groups.find(g => g.groupCode === code);
        if (row) { row.groupName = name; row.parentCode = parentCode; row.nature = nature; }
      });
      await addEvent("ledger_group_updated", "ledger_group", code, before, after, "Updated ledger group " + name);
      await syncSqliteAfterJson("group", after, false);
    }
    $("#ledgerGroupModal").modal("hide");
    await loadData();
  }

  async function saveLedgerFromForm() {
    if (!canManageLedgers()) throw new Error("You are not allowed to manage ledgers.");
    const state = await getState();
    const manifest = state.manifest;
    manifest.fileIds = manifest.fileIds || {};
    manifest.fileIds.ledgers = manifest.fileIds.ledgers || {};
    const mode = $("#ledgerMode").val();
    const code = safeCode($("#ledgerCode").val(), "LED-");
    const name = $("#ledgerName").val().trim();
    const groupCode = $("#ledgerGroupCode").val();
    const opening = { debit: amount($("#ledgerOpeningDebit").val()), credit: amount($("#ledgerOpeningCredit").val()) };
    if (!code || !name || !groupCode) throw new Error("Ledger code, name and group are required.");
    if (opening.debit && opening.credit) throw new Error("Opening debit and opening credit cannot both be non-zero.");

    if (mode === "create") {
      if (manifest.fileIds.ledgers[code]) throw new Error("Ledger code already exists.");
      const group = cache.groups.find(g => g.groupCode === groupCode);
      const doc = {
        schemaVersion: 1,
        ledgerCode: code,
        codeLocked: true,
        ledgerName: name,
        groupCode,
        groupName: group ? group.groupName : groupCode,
        nature: group ? group.nature : "debit",
        financialYear: manifest.currentFinancialYear,
        companyId: manifest.companyId,
        opening,
        closing: { ...opening },
        transactions: [],
        summary: { daily: {}, monthly: {}, yearly: {} },
        systemLedger: false,
        createdAt: nowIso(),
        createdBy: userEmail(),
        updatedAt: nowIso(),
        updatedBy: userEmail(),
        revision: 1,
        isDeleted: false
      };
      const file = await window.GoogleDrive.createJsonFile(code + ".json", manifest.folderIds.fy.ledgerFiles, doc, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "ledger",
        companyId: manifest.companyId,
        financialYear: manifest.currentFinancialYear,
        ledgerCode: code,
        groupCode
      });
      manifest.fileIds.ledgers[code] = file.id;
      await updateManifest(state, manifest);
      await addLedgerToGroup(groupCode, { ledgerCode: code, ledgerName: name, openingDebit: opening.debit, openingCredit: opening.credit, closingDebit: opening.debit, closingCredit: opening.credit });
      await updateLedgerSummary(summary => adjustSummaryForLedger(summary, groupCode, +1, opening, opening));
      await addEvent("ledger_created", "ledger", code, null, doc, "Created ledger " + name);
      await syncSqliteAfterJson("ledger", doc, false);
    } else {
      const fileId = manifest.fileIds.ledgers[code];
      if (!fileId) throw new Error("Ledger file not found.");
      const before = await window.GoogleDrive.readJsonFile(fileId);
      if (hasLedgerEntries(before) && before.groupCode !== groupCode) throw new Error("Cannot change group because this ledger already has entries/opening balance.");
      const after = { ...before, ledgerName: name, groupCode, groupName: groupName(groupCode), opening, closing: { ...opening }, updatedAt: nowIso(), updatedBy: userEmail(), revision: amount(before.revision) + 1 };
      await window.GoogleDrive.updateJsonFile(fileId, after);
      if (before.groupCode !== groupCode) {
        await removeLedgerFromGroup(before.groupCode, code);
        await addLedgerToGroup(groupCode, { ledgerCode: code, ledgerName: name, openingDebit: opening.debit, openingCredit: opening.credit, closingDebit: opening.debit, closingCredit: opening.credit });
        await updateLedgerSummary(summary => { adjustSummaryForLedger(summary, before.groupCode, -1, before.opening, before.closing); adjustSummaryForLedger(summary, groupCode, +1, opening, opening); });
      } else {
        await updateLedgerInGroup(groupCode, code, name, opening, opening);
        await updateLedgerSummary(summary => adjustSummaryBalanceChange(summary, groupCode, before.opening, before.closing, opening, opening));
      }
      await addEvent("ledger_updated", "ledger", code, before, after, "Updated ledger " + name);
      await syncSqliteAfterJson("ledger", after, false);
    }
    $("#ledgerModal").modal("hide");
    await loadData();
  }

  function recalcGroupTotals(group) {
    const ledgers = group.ledgers || [];
    group.totals = ledgers.reduce((tot, row) => {
      tot.openingDebit += amount(row.openingDebit);
      tot.openingCredit += amount(row.openingCredit);
      tot.closingDebit += amount(row.closingDebit);
      tot.closingCredit += amount(row.closingCredit);
      return tot;
    }, { openingDebit: 0, openingCredit: 0, closingDebit: 0, closingCredit: 0 });
  }

  async function addLedgerToGroup(groupCode, ledgerRow) {
    const state = await getState();
    const fileId = state.manifest.fileIds.ledgerGroups[groupCode];
    if (!fileId) return;
    const group = await window.GoogleDrive.readJsonFile(fileId);
    group.ledgers = (group.ledgers || []).filter(l => l.ledgerCode !== ledgerRow.ledgerCode);
    group.ledgers.push(ledgerRow);
    recalcGroupTotals(group);
    group.revision = amount(group.revision) + 1;
    group.updatedAt = nowIso();
    group.updatedBy = userEmail();
    await window.GoogleDrive.updateJsonFile(fileId, group);
  }

  async function updateLedgerInGroup(groupCode, ledgerCode, ledgerName, opening, closing) {
    const state = await getState();
    const fileId = state.manifest.fileIds.ledgerGroups[groupCode];
    if (!fileId) return;
    const group = await window.GoogleDrive.readJsonFile(fileId);
    group.ledgers = group.ledgers || [];
    const row = group.ledgers.find(l => l.ledgerCode === ledgerCode);
    if (row) {
      row.ledgerName = ledgerName;
      row.openingDebit = amount(opening.debit); row.openingCredit = amount(opening.credit);
      row.closingDebit = amount(closing.debit); row.closingCredit = amount(closing.credit);
    }
    recalcGroupTotals(group);
    group.revision = amount(group.revision) + 1;
    group.updatedAt = nowIso();
    group.updatedBy = userEmail();
    await window.GoogleDrive.updateJsonFile(fileId, group);
  }

  async function removeLedgerFromGroup(groupCode, ledgerCode) {
    const state = await getState();
    const fileId = state.manifest.fileIds.ledgerGroups[groupCode];
    if (!fileId) return;
    const group = await window.GoogleDrive.readJsonFile(fileId);
    group.ledgers = (group.ledgers || []).filter(l => l.ledgerCode !== ledgerCode);
    recalcGroupTotals(group);
    group.revision = amount(group.revision) + 1;
    group.updatedAt = nowIso();
    group.updatedBy = userEmail();
    await window.GoogleDrive.updateJsonFile(fileId, group);
  }

  function adjustSummaryForLedger(summary, groupCode, countDelta, opening, closing) {
    const row = summary.groups.find(g => g.groupCode === groupCode);
    if (!row) return;
    row.ledgerCount = amount(row.ledgerCount) + countDelta;
    row.openingDebit = amount(row.openingDebit) + amount(opening && opening.debit) * countDelta;
    row.openingCredit = amount(row.openingCredit) + amount(opening && opening.credit) * countDelta;
    row.closingDebit = amount(row.closingDebit) + amount(closing && closing.debit) * countDelta;
    row.closingCredit = amount(row.closingCredit) + amount(closing && closing.credit) * countDelta;
  }

  function adjustSummaryBalanceChange(summary, groupCode, oldOpening, oldClosing, newOpening, newClosing) {
    const row = summary.groups.find(g => g.groupCode === groupCode);
    if (!row) return;
    row.openingDebit = amount(row.openingDebit) - amount(oldOpening && oldOpening.debit) + amount(newOpening && newOpening.debit);
    row.openingCredit = amount(row.openingCredit) - amount(oldOpening && oldOpening.credit) + amount(newOpening && newOpening.credit);
    row.closingDebit = amount(row.closingDebit) - amount(oldClosing && oldClosing.debit) + amount(newClosing && newClosing.debit);
    row.closingCredit = amount(row.closingCredit) - amount(oldClosing && oldClosing.credit) + amount(newClosing && newClosing.credit);
  }

  async function deleteLedger(ledgerCode) {
    if (!canManageLedgers()) throw new Error("You are not allowed to delete ledgers.");
    const ledger = cache.ledgers.find(l => l.ledgerCode === ledgerCode);
    if (!ledger) return;
    const latest = await window.GoogleDrive.readJsonFile(ledger._fileId);
    if (hasLedgerEntries(latest)) {
      alert("Delete not allowed. This ledger already has transactions, summaries, or opening balance.");
      return;
    }
    if (!confirm("Delete ledger " + latest.ledgerName + "?")) return;
    const after = { ...latest, isDeleted: true, deletedAt: nowIso(), deletedBy: userEmail(), updatedAt: nowIso(), updatedBy: userEmail(), revision: amount(latest.revision) + 1 };
    await window.GoogleDrive.updateJsonFile(ledger._fileId, after);
    await removeLedgerFromGroup(latest.groupCode, latest.ledgerCode);
    await updateLedgerSummary(summary => adjustSummaryForLedger(summary, latest.groupCode, -1, latest.opening, latest.closing));
    await addEvent("ledger_deleted", "ledger", latest.ledgerCode, latest, after, "Deleted ledger " + latest.ledgerName);
    await syncSqliteAfterJson("ledger", after, true);
    await loadData();
  }

  async function deleteGroup(groupCode) {
    if (!canManageLedgers()) throw new Error("You are not allowed to delete ledger groups.");
    const group = cache.groups.find(g => g.groupCode === groupCode);
    if (!group) return;
    const childGroups = cache.groups.filter(g => g.parentCode === groupCode);
    const groupLedgers = cache.ledgers.filter(l => l.groupCode === groupCode);
    if (childGroups.length || groupLedgers.length) {
      alert("Delete not allowed. This group has child groups or ledgers. Move/delete them first.");
      return;
    }
    if (!confirm("Delete ledger group " + group.groupName + "?")) return;
    const latest = await window.GoogleDrive.readJsonFile(group._fileId);
    const after = { ...latest, isDeleted: true, deletedAt: nowIso(), deletedBy: userEmail(), updatedAt: nowIso(), updatedBy: userEmail(), revision: amount(latest.revision) + 1 };
    await window.GoogleDrive.updateJsonFile(group._fileId, after);
    await updateLedgerSummary(summary => { summary.groups = (summary.groups || []).filter(g => g.groupCode !== groupCode); });
    await addEvent("ledger_group_deleted", "ledger_group", groupCode, latest, after, "Deleted ledger group " + latest.groupName);
    await syncSqliteAfterJson("group", after, true);
    await loadData();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
  }
  function escapeAttr(value) { return escapeHtml(value); }
  function cssEscape(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return String(value).replace(/'/g, "\\'");
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    $(document).on("click", "#btnAddLedgerGroup", () => openGroupModal("create"));
    $(document).on("click", ".btn-edit-group", function () { openGroupModal("edit", $(this).data("code")); });
    $(document).on("click", ".btn-delete-group", function () { deleteGroup($(this).data("code")).catch(showError); });
    $(document).on("click", "#btnAddLedger", () => openLedgerModal("create"));
    $(document).on("click", ".btn-edit-ledger", function () { openLedgerModal("edit", $(this).data("code")); });
    $(document).on("click", ".btn-delete-ledger", function () { deleteLedger($(this).data("code")).catch(showError); });
    $(document).on("click", "#btnRefreshLedgers", function () { loadData().catch(showError); });
    $(document).on("submit", "#ledgerGroupForm", function (e) { e.preventDefault(); saveGroupFromForm().catch(showError); });
    $(document).on("submit", "#ledgerForm", function (e) { e.preventDefault(); saveLedgerFromForm().catch(showError); });
  }

  function showError(err) {
    console.error(err);
    alert(err.message || "Ledger operation failed.");
  }

  window.LedgerManager = {
    init: bindEvents,
    load: loadData
  };

  bindEvents();
})();
