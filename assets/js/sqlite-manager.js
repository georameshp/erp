
/* global window, initSqlJs, Blob */
(function () {
  let SQL = null;
  let db = null;
  let openPromise = null;
  let sqliteMeta = null;
  const MIME = "application/x-sqlite3";

  function nowIso() { return new Date().toISOString(); }
  function amount(v) { return Number(v || 0); }

  function isAvailable() {
    return typeof window.initSqlJs === "function";
  }

  async function loadSqlJs() {
    if (SQL) return SQL;
    if (!isAvailable()) throw new Error("sql.js is not loaded. SQLite will use JSON fallback.");
    SQL = await initSqlJs({ locateFile: () => window.ERP_CONFIG.SQLJS_WASM_URL });
    return SQL;
  }

  function exec(sql, params) {
    const stmt = db.prepare(sql);
    try {
      stmt.run(params || []);
    } finally {
      stmt.free();
    }
  }

  function query(sql, params) {
    const stmt = db.prepare(sql);
    const rows = [];
    try {
      stmt.bind(params || []);
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  }

  function createSchema() {
    db.run(`
      pragma user_version = 1;
      create table if not exists ledger_groups (
        group_code text primary key,
        group_name text not null,
        parent_code text,
        nature text not null default 'debit',
        financial_year text,
        data_json text not null,
        revision integer default 1,
        is_deleted integer default 0,
        updated_at text
      );
      create table if not exists ledgers (
        ledger_code text primary key,
        ledger_name text not null,
        group_code text not null,
        group_name text,
        nature text default 'debit',
        opening_debit real default 0,
        opening_credit real default 0,
        closing_debit real default 0,
        closing_credit real default 0,
        transaction_count integer default 0,
        has_entries integer default 0,
        financial_year text,
        data_json text not null,
        revision integer default 1,
        is_deleted integer default 0,
        updated_at text
      );
      create index if not exists idx_ledgers_group on ledgers(group_code);
      create table if not exists activity_events (
        event_id text primary key,
        action text,
        entity_type text,
        entity_id text,
        created_at text,
        data_json text not null
      );
      create table if not exists sync_meta (
        key text primary key,
        value text
      );
    `);
  }

  function sqliteFileName(state) {
    const fy = (state.manifest && state.manifest.currentFinancialYear) || "current";
    return "geoerp-" + fy + ".sqlite";
  }

  async function findOrCreateSqliteFile(state) {
    const manifest = state.manifest;
    manifest.fileIds = manifest.fileIds || {};
    if (manifest.fileIds.sqliteDb) {
      sqliteMeta = await window.GoogleDrive.getFileMetadata(manifest.fileIds.sqliteDb);
      return manifest.fileIds.sqliteDb;
    }

    const fyFolder = manifest.folderIds && manifest.folderIds.currentFinancialYear;
    const existing = fyFolder ? await window.GoogleDrive.findChildByName(fyFolder, sqliteFileName(state)) : null;
    if (existing) {
      manifest.fileIds.sqliteDb = existing.id;
      sqliteMeta = existing;
      await window.LocalDB.setKV("driveState", state);
      return existing.id;
    }
    return null;
  }

  async function open() {
    if (openPromise) return openPromise;
    openPromise = (async function () {
      await loadSqlJs();
      const state = await window.LocalDB.getKV("driveState");
      if (!state || !state.manifest) throw new Error("Drive state missing. Cannot open SQLite database.");
      const fileId = await findOrCreateSqliteFile(state);
      if (fileId) {
        try {
          const bytes = await window.GoogleDrive.readBinaryFile(fileId);
          db = new SQL.Database(bytes);
        } catch (e) {
          console.warn("Unable to load SQLite from Drive. Creating a new local SQLite database.", e);
          db = new SQL.Database();
        }
      } else {
        db = new SQL.Database();
      }
      createSchema();
      return db;
    })();
    return openPromise;
  }

  async function saveToDrive(options) {
    options = options || {};
    await open();
    const state = await window.LocalDB.getKV("driveState");
    const manifest = state.manifest;
    manifest.fileIds = manifest.fileIds || {};

    // Lightweight concurrency check: if the remote SQLite file changed since loaded,
    // do not overwrite it blindly. JSON remains the source/fallback; caller may rebuild SQLite.
    if (manifest.fileIds.sqliteDb && sqliteMeta && !options.force) {
      const latest = await window.GoogleDrive.getFileMetadata(manifest.fileIds.sqliteDb);
      if (latest.modifiedTime && sqliteMeta.modifiedTime && latest.modifiedTime !== sqliteMeta.modifiedTime) {
        throw new Error("SQLite database was changed by another user. Please Sync/Rebuild from JSON before saving SQLite.");
      }
    }

    const bytes = db.export();
    const blob = new Blob([bytes], { type: MIME });
    let file;
    if (manifest.fileIds.sqliteDb) {
      file = await window.GoogleDrive.updateBinaryFile(manifest.fileIds.sqliteDb, blob, MIME);
    } else {
      const parentId = (manifest.folderIds && manifest.folderIds.currentFinancialYear) || manifest.rootFolderId;
      file = await window.GoogleDrive.uploadFile(sqliteFileName(state), parentId, blob, MIME, {
        appId: window.ERP_CONFIG.APP_ID,
        type: "sqlite-db",
        companyId: manifest.companyId,
        financialYear: manifest.currentFinancialYear
      });
      manifest.fileIds.sqliteDb = file.id;
      await window.LocalDB.setKV("driveState", state);
      if (manifest.fileIds.manifest) {
        manifest.updatedAt = nowIso();
        manifest.revision = amount(manifest.revision) + 1;
        await window.GoogleDrive.updateJsonFile(manifest.fileIds.manifest, manifest);
      }
    }
    sqliteMeta = file;
    return file;
  }

  function upsertLedgerGroup(group) {
    exec(`insert into ledger_groups
      (group_code, group_name, parent_code, nature, financial_year, data_json, revision, is_deleted, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(group_code) do update set
        group_name=excluded.group_name,
        parent_code=excluded.parent_code,
        nature=excluded.nature,
        financial_year=excluded.financial_year,
        data_json=excluded.data_json,
        revision=excluded.revision,
        is_deleted=excluded.is_deleted,
        updated_at=excluded.updated_at`, [
      group.groupCode,
      group.groupName,
      group.parentCode || null,
      group.nature || "debit",
      group.financialYear || null,
      JSON.stringify(group),
      amount(group.revision) || 1,
      group.isDeleted ? 1 : 0,
      group.updatedAt || nowIso()
    ]);
  }

  function upsertLedger(ledger) {
    const txCount = Array.isArray(ledger.transactions) ? ledger.transactions.length : 0;
    const hasEntries = txCount > 0 || amount(ledger.opening && ledger.opening.debit) || amount(ledger.opening && ledger.opening.credit);
    exec(`insert into ledgers
      (ledger_code, ledger_name, group_code, group_name, nature, opening_debit, opening_credit, closing_debit, closing_credit,
       transaction_count, has_entries, financial_year, data_json, revision, is_deleted, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(ledger_code) do update set
        ledger_name=excluded.ledger_name,
        group_code=excluded.group_code,
        group_name=excluded.group_name,
        nature=excluded.nature,
        opening_debit=excluded.opening_debit,
        opening_credit=excluded.opening_credit,
        closing_debit=excluded.closing_debit,
        closing_credit=excluded.closing_credit,
        transaction_count=excluded.transaction_count,
        has_entries=excluded.has_entries,
        financial_year=excluded.financial_year,
        data_json=excluded.data_json,
        revision=excluded.revision,
        is_deleted=excluded.is_deleted,
        updated_at=excluded.updated_at`, [
      ledger.ledgerCode,
      ledger.ledgerName,
      ledger.groupCode,
      ledger.groupName || ledger.groupCode,
      ledger.nature || "debit",
      amount(ledger.opening && ledger.opening.debit),
      amount(ledger.opening && ledger.opening.credit),
      amount(ledger.closing && ledger.closing.debit),
      amount(ledger.closing && ledger.closing.credit),
      txCount,
      hasEntries ? 1 : 0,
      ledger.financialYear || null,
      JSON.stringify(ledger),
      amount(ledger.revision) || 1,
      ledger.isDeleted ? 1 : 0,
      ledger.updatedAt || nowIso()
    ]);
  }

  async function syncLedgersFromJson(groups, ledgers, save) {
    await open();
    db.run("begin transaction");
    try {
      (groups || []).forEach(upsertLedgerGroup);
      (ledgers || []).forEach(upsertLedger);
      exec("insert or replace into sync_meta(key,value) values('last_json_to_sqlite_sync', ?)", [nowIso()]);
      db.run("commit");
    } catch (e) {
      db.run("rollback");
      throw e;
    }
    if (save !== false) await saveToDrive().catch(function (e) {
      console.warn("SQLite save skipped/failed. JSON fallback remains valid:", e.message || e);
    });
  }

  async function getLedgerData() {
    await open();
    const groups = query("select data_json from ledger_groups where is_deleted=0 order by group_name")
      .map(r => JSON.parse(r.data_json));
    const ledgers = query("select data_json from ledgers where is_deleted=0 order by ledger_name")
      .map(r => JSON.parse(r.data_json));
    return { groups, ledgers };
  }

  async function markGroupDeleted(groupCode) {
    await open();
    exec("update ledger_groups set is_deleted=1, updated_at=? where group_code=?", [nowIso(), groupCode]);
    await saveToDrive().catch(e => console.warn("SQLite delete group save failed", e));
  }

  async function markLedgerDeleted(ledgerCode) {
    await open();
    exec("update ledgers set is_deleted=1, updated_at=? where ledger_code=?", [nowIso(), ledgerCode]);
    await saveToDrive().catch(e => console.warn("SQLite delete ledger save failed", e));
  }

  async function rebuildFromJsonLoader(jsonLoaderFn) {
    await open();
    const data = await jsonLoaderFn();
    db.run("delete from ledger_groups; delete from ledgers;");
    await syncLedgersFromJson(data.groups, data.ledgers, true);
    return data;
  }

  window.SQLiteManager = {
    isAvailable,
    open,
    saveToDrive,
    getLedgerData,
    syncLedgersFromJson,
    upsertLedgerGroup: async function (group) { await open(); upsertLedgerGroup(group); await saveToDrive().catch(e => console.warn(e)); },
    upsertLedger: async function (ledger) { await open(); upsertLedger(ledger); await saveToDrive().catch(e => console.warn(e)); },
    markGroupDeleted,
    markLedgerDeleted,
    rebuildFromJsonLoader
  };
})();
