/* global window, fetch */
(function () {
  const DRIVE_API = "https://www.googleapis.com/drive/v3";
  const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

  function token() {
    const accessToken = window.GoogleAuth.getAccessToken();
    if (!accessToken) throw new Error("Not signed in.");
    return accessToken;
  }

  async function driveFetch(url, options) {
    const res = await fetch(url, {
      ...(options || {}),
      headers: {
        Authorization: "Bearer " + token(),
        ...((options && options.headers) || {})
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error("Google Drive API error: " + res.status + " " + text);
    }
    return res;
  }

  function escapeQueryValue(value) {
    return String(value).replace(/'/g, "\\'");
  }

  async function searchAppFolder() {
    const appId = escapeQueryValue(window.ERP_CONFIG.APP_ID);
    const name = escapeQueryValue(window.ERP_CONFIG.APP_FOLDER_NAME);
    const q = [
      "mimeType='application/vnd.google-apps.folder'",
      "trashed=false",
      `name='${name}'`,
      `appProperties has { key='appId' and value='${appId}' }`
    ].join(" and ");
    const url = DRIVE_API + "/files?" + new URLSearchParams({ q, fields: "files(id,name,modifiedTime,appProperties)" });
    const data = await (await driveFetch(url)).json();
    return data.files && data.files.length ? data.files[0] : null;
  }

  async function createFolder(name, parentId, appProperties) {
    const metadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      appProperties: appProperties || {}
    };
    if (parentId) metadata.parents = [parentId];
    return await (await driveFetch(DRIVE_API + "/files?fields=id,name,modifiedTime,appProperties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata)
    })).json();
  }

  async function createJsonFile(name, parentId, data, appProperties) {
    const metadata = { name, mimeType: "application/json", parents: [parentId], appProperties: appProperties || {} };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    return await (await driveFetch(DRIVE_UPLOAD_API + "/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink,webContentLink,appProperties", {
      method: "POST",
      body: form
    })).json();
  }

  async function uploadFile(name, parentId, fileOrBlob, mimeType, appProperties) {
    const metadata = { name, mimeType: mimeType || fileOrBlob.type || "application/octet-stream", parents: [parentId], appProperties: appProperties || {} };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", fileOrBlob);
    return await (await driveFetch(DRIVE_UPLOAD_API + "/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink,webContentLink,appProperties", {
      method: "POST",
      body: form
    })).json();
  }

  async function updateJsonFile(fileId, data) {
    const res = await driveFetch(DRIVE_UPLOAD_API + "/files/" + fileId + "?uploadType=media&fields=id,name,modifiedTime,version", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data, null, 2)
    });
    return await res.json();
  }

  async function updateBinaryFile(fileId, blobOrBytes, mimeType) {
    const res = await driveFetch(DRIVE_UPLOAD_API + "/files/" + fileId + "?uploadType=media&fields=id,name,mimeType,modifiedTime,version,headRevisionId", {
      method: "PATCH",
      headers: { "Content-Type": mimeType || "application/octet-stream" },
      body: blobOrBytes
    });
    return await res.json();
  }

  async function getFileMetadata(fileId) {
    const res = await driveFetch(DRIVE_API + "/files/" + fileId + "?fields=id,name,mimeType,modifiedTime,version,headRevisionId,appProperties,permissions(id,emailAddress,role,type)");
    return await res.json();
  }

  async function createPermission(fileId, emailAddress, role) {
    const body = {
      type: "user",
      role: role || "reader",
      emailAddress: emailAddress
    };
    const res = await driveFetch(DRIVE_API + "/files/" + fileId + "/permissions?sendNotificationEmail=true&fields=id,type,role,emailAddress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  }

  async function readJsonFile(fileId) {
    const res = await driveFetch(DRIVE_API + "/files/" + fileId + "?alt=media");
    return await res.json();
  }

  async function readBinaryFile(fileId) {
    const res = await driveFetch(DRIVE_API + "/files/" + fileId + "?alt=media");
    return new Uint8Array(await res.arrayBuffer());
  }

  async function findChildByName(parentId, name) {
    const q = [
      `'${parentId}' in parents`,
      "trashed=false",
      `name='${escapeQueryValue(name)}'`
    ].join(" and ");
    const url = DRIVE_API + "/files?" + new URLSearchParams({ q, fields: "files(id,name,mimeType,modifiedTime,version,appProperties)" });
    const data = await (await driveFetch(url)).json();
    return data.files && data.files.length ? data.files[0] : null;
  }

  async function listChildren(parentId) {
    const q = [`'${parentId}' in parents`, "trashed=false"].join(" and ");
    const url = DRIVE_API + "/files?" + new URLSearchParams({ q, fields: "files(id,name,mimeType,modifiedTime,version,appProperties)" });
    return (await (await driveFetch(url)).json()).files || [];
  }

  async function createEventFile(eventsFolderId, event) {
    const dt = new Date(event.createdAt || Date.now());
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const fileName = `event-${yyyy}${mm}${String(dt.getUTCDate()).padStart(2, "0")}-${event.eventId}.json`;
    return await createJsonFile(fileName, eventsFolderId, event, {
      appId: window.ERP_CONFIG.APP_ID,
      type: "event",
      eventId: event.eventId,
      action: event.action || "unknown"
    });
  }

  window.GoogleDrive = {
    searchAppFolder,
    createFolder,
    createJsonFile,
    uploadFile,
    updateJsonFile,
    updateBinaryFile,
    getFileMetadata,
    createPermission,
    readJsonFile,
    readBinaryFile,
    findChildByName,
    listChildren,
    createEventFile
  };
})();
