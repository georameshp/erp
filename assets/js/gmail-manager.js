
/* global window, fetch */
(function () {
  function base64UrlEncodeUnicode(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function token() {
    const accessToken = window.GoogleAuth.getAccessToken();
    if (!accessToken) throw new Error("Google session is not active.");
    return accessToken;
  }

  async function sendEmail(to, subject, htmlBody, textBody) {
    const user = window.GoogleAuth.getCurrentUser() || {};
    const from = user.email || "me";
    const boundary = "geoerp_" + Date.now();
    const message = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      textBody || htmlBody.replace(/<[^>]+>/g, " "),
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      htmlBody,
      "",
      `--${boundary}--`
    ].join("\r\n");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ raw: base64UrlEncodeUnicode(message) })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error("Gmail send failed: " + res.status + " " + text);
    }
    return await res.json();
  }

  function approvalLink(request) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("action", "approveUserRequest");
    url.searchParams.set("requestName", request.name || "");
    url.searchParams.set("requestUsername", request.username || "");
    url.searchParams.set("requestGmail", request.gmail || "");
    url.searchParams.set("requestContact", request.contact || "");
    url.searchParams.set("requestMessage", request.message || "");
    return url.toString();
  }

  async function sendUserRegistrationRequest(request) {
    const link = approvalLink(request);
    const subject = "Geo ERP user access request from " + (request.name || request.gmail);
    const html = `
      <p>Dear Company Administrator,</p>
      <p>A user has requested access to your Geo ERP company.</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <tr><td><b>Name</b></td><td>${escapeHtml(request.name || "")}</td></tr>
        <tr><td><b>Requested Username</b></td><td>${escapeHtml(request.username || "")}</td></tr>
        <tr><td><b>Google Gmail</b></td><td>${escapeHtml(request.gmail || "")}</td></tr>
        <tr><td><b>Contact</b></td><td>${escapeHtml(request.contact || "")}</td></tr>
        <tr><td><b>Message</b></td><td>${escapeHtml(request.message || "")}</td></tr>
      </table>
      <p>Click the link below to open Geo ERP and add this user:</p>
      <p><a href="${link}">Approve / Add User in Geo ERP</a></p>
      <p>After approval, Geo ERP will create the ERP user and share the company Drive folder to the user's Google Drive as read-only.</p>
    `;
    const text = `Geo ERP user access request\n\nName: ${request.name}\nUsername: ${request.username}\nGoogle Gmail: ${request.gmail}\nContact: ${request.contact}\nMessage: ${request.message}\n\nApprove/Add user: ${link}`;
    return await sendEmail(request.adminEmail, subject, html, text);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
  }

  window.GmailManager = {
    sendEmail,
    sendUserRegistrationRequest,
    approvalLink
  };
})();
