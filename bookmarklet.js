/**
 * Slate Bookmarklet
  * Version: 4.0.0
 * Purpose: refreshes fields, prompts, STL, and CJ library
 * Usage: This clean version explains what the bookmarklet does. Use minified version in the actual bookmark.
 * Last updated: 2026-03-27
 */
javascript:(function () {
  // =========================================================
  // 1) BASIC SAFETY CHECKS
  // ---------------------------------------------------------
  // Make sure this is a Slate page and that jQuery is available.
  // The bookmarklet depends on Slate's FW object and $.get().
  // =========================================================
  if (!window.FW) {
    alert("Not a Slate page");
    return;
  }

  if (typeof window.$ === "undefined" || typeof $.get !== "function") {
    alert("jQuery not available on this page");
    return;
  }

  // =========================================================
  // 2) LOCAL STORAGE KEYS + LIMITS
  // ---------------------------------------------------------
  // These keys are used to persist data in the browser:
  // - Run history
  // - Run counter
  // - User preferences
  //
  // HISTORY_LIMIT keeps only the most recent 10 runs.
  // =========================================================
  const STORAGE_KEY = "slateRefreshBookmarklet.history.v1";
  const COUNTER_KEY = "slateRefreshBookmarklet.runCounter.v1";
  const PREF_KEY = "slateRefreshBookmarklet.preferences.v1";
  const HISTORY_LIMIT = 10;

  // =========================================================
  // 3) STORAGE HELPERS
  // ---------------------------------------------------------
  // These functions load/save history and preferences from
  // localStorage so they persist across sessions.
  // =========================================================

  // Load run history from localStorage.
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Save run history to localStorage, capped at HISTORY_LIMIT.
  function saveHistory(history) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(history.slice(0, HISTORY_LIMIT))
      );
    } catch (e) {
      console.warn("Could not save history:", e);
    }
  }

  // Increment and return the next run number.
  function nextRunNumber() {
    const current = parseInt(localStorage.getItem(COUNTER_KEY) || "0", 10) || 0;
    const next = current + 1;

    try {
      localStorage.setItem(COUNTER_KEY, String(next));
    } catch {}

    return next;
  }

  // Load saved UI preferences from localStorage.
  function loadPreferences() {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  // Save current UI preferences to localStorage.
  function savePreferences(prefs) {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {}
  }

  // =========================================================
  // 4) REFRESH ACTION DEFINITIONS
  // ---------------------------------------------------------
  // This is the core configuration for each refresh option.
  // Each object controls:
  // - checkbox ID
  // - display label
  // - default checked state
  // - - not everyone likes the STL refreshed, so unchecked
  // - backend refresh path
  // - short log label
  // =========================================================
  const actions = [
    {
      id: "refreshFields",
      label: "Refresh Fields",
      defaultChecked: true,
      path: "admin?cmd=destinationRefresh",
      log: "fields",
    },
    {
      id: "refreshPrompts",
      label: "Refresh Prompts",
      defaultChecked: true,
      path: "admin?cmd=promptRefresh",
      log: "prompts",
    },
    {
      id: "refreshSTL",
      label: "Refresh STL",
      defaultChecked: false,
      path: "library?cmd=refresh",
      log: "STL",
    },
    {
      id: "refreshCJLibrary",
      label: "Refresh CJ Library",
      defaultChecked: true,
      path: "library?cmd=refresh_query",
      log: "CJ library",
    },
  ];

  // =========================================================
  // 5) SMALL UTILITY HELPERS
  // ---------------------------------------------------------
  // These functions support the UI and logging behavior.
  // =========================================================

  // Generate a human-readable timestamp.
  const stamp = () => new Date().toLocaleString();

  // Update the status text beside one refresh option.
  function setStatus(actionId, text) {
    const el = document.getElementById(`status-${actionId}`);
    if (el) el.textContent = text;
  }

  // Append a line to the log textarea and auto-scroll to bottom.
  function appendLog(line) {
    const box = document.getElementById("logBox");
    if (!box) return;

    box.value += (box.value ? "\n" : "") + line;
    box.scrollTop = box.scrollHeight;
  }

  // Enable or disable most controls while a run is in progress.
  // Close remains enabled so the user can still dismiss the popup.
  function setControlsEnabled(enabled) {
    dialog.querySelectorAll('input[type="checkbox"], button, select').forEach((el) => {
      if (el.id === "closePopup") return;
      el.disabled = !enabled;
    });
  }

  // Try to copy text to clipboard.
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // Return the IDs of all currently selected refresh actions.
  function getSelectedActionIds() {
    return actions
      .map((a) => a.id)
      .filter((id) => {
        const cb = document.getElementById(id);
        return cb && cb.checked;
      });
  }

  // Populate the history dropdown with the last saved runs.
  function populateHistoryDropdown(history) {
    historySelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Run History (last 10)…";
    historySelect.appendChild(placeholder);

    history.forEach((run) => {
      const opt = document.createElement("option");
      opt.value = run.runId;
      opt.textContent = `RUN #${run.runNumber} — ${run.startedAt}`;
      historySelect.appendChild(opt);
    });
  }

  // Load a saved run into the UI so the user can review it.
  function renderRun(run) {
    logBox.value = run.log || "";
    overallStatus.textContent = run.failed
      ? "❌ Loaded run (failed)"
      : "✅ Loaded run (success)";

    actions.forEach((a) => {
      const status = (run.results && run.results[a.id]) || "pending";
      const map = {
        done: "✅ Done",
        skipped: "⏭ Skipped",
        failed: "❌ Failed",
        running: "⏳ Running...",
        pending: "• Pending",
      };
      setStatus(a.id, map[status] || "• Pending");
    });

    appendLog(`[${stamp()}] VIEWED RUN #${run.runNumber} (${run.runId})`);
  }

  // Update the Select All / Select None button label depending
  // on whether any checkboxes are currently unchecked.
  function updateToggleLabel() {
    const checkboxes = actions.map((a) => document.getElementById(a.id)).filter(Boolean);
    const anyUnchecked = checkboxes.some((cb) => !cb.checked);
    toggleBtn.textContent = anyUnchecked ? "Select All" : "Select None";
  }

  // =========================================================
  // 6) RUN A SINGLE REFRESH REQUEST
  // ---------------------------------------------------------
  // This function performs one backend refresh call and updates:
  // - status text
  // - run record
  // - log output
  //
  // If it fails, it logs the failure and throws an error so the
  // overall run stops.
  // =========================================================
  async function runRefreshRequest(relativePath, label, actionId, record) {
    const url = "/manage/database/" + relativePath;

    setStatus(actionId, "⏳ Running...");
    record.results[actionId] = "running";
    appendLog(`[${stamp()}] START  ${label}  (${url})`);

    try {
      await $.get(url);
      console.log(`Refreshed ${label}`);
      setStatus(actionId, "✅ Done");
      record.results[actionId] = "done";
      appendLog(`[${stamp()}] DONE   ${label}`);
    } catch (err) {
      console.error("Refresh failed:", { url, err });
      setStatus(actionId, "❌ Failed");
      record.results[actionId] = "failed";
      appendLog(`[${stamp()}] FAIL   ${label}  (see console)`);
      alert("Refresh failed. Check the console for details.");
      FW.Progress.Unload();
      throw new Error(`Failed to refresh ${label}`);
    }
  }

  // =========================================================
  // 7) PREFERENCES
  // ---------------------------------------------------------
  // Load saved preferences now, and define a helper to persist
  // the current UI state whenever something changes.
  // =========================================================
  const prefs = loadPreferences();

  function storeCurrentPreferences() {
    const next = {
      closeOnSuccess: closeOnSuccess.checked,
    };

    actions.forEach((a) => {
      const cb = document.getElementById(a.id);
      if (cb) next[a.id] = cb.checked;
    });

    savePreferences(next);
  }

  // =========================================================
  // 8) BUILD THE POPUP UI
  // ---------------------------------------------------------
  // This section creates the popup, builds the checkbox list,
  // status list, log area, buttons, and history dropdown.
  // =========================================================
  const dialog = document.createElement("div");
  dialog.role = "dialog";

  Object.assign(dialog.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: "white",
    border: "2px solid black",
    padding: "12px",
    zIndex: "10000",
    fontFamily: "Arial, sans-serif",
    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
    borderRadius: "8px",
    width: "360px",
  });

  // Build the checkbox HTML, using saved prefs if present.
  const checkboxHtml = actions
    .map((a) => {
      const remembered = prefs[a.id];
      const checked = remembered !== undefined ? remembered : a.defaultChecked;

      return `<label style="display:block;margin:4px 0;">
        <input type="checkbox" id="${a.id}" ${checked ? "checked" : ""}>
        ${a.label}
      </label>`;
    })
    .join("");

  // Build the status display for each action.
  const statusHtml = actions
    .map(
      (a) => `<div style="display:flex;justify-content:space-between;gap:10px;margin:2px 0;">
        <span style="font-size:12px;">${a.label}</span>
        <span id="status-${a.id}" style="font-size:12px;white-space:nowrap;">• Pending</span>
      </div>`
    )
    .join("");

  // Insert the popup HTML.
  dialog.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
      <strong>Select refreshes:</strong>
      <button id="toggleAll" style="font-size:12px;white-space:nowrap;">Select All</button>
    </div>

    <div style="margin-top:6px;">${checkboxHtml}</div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;gap:10px;">
      <label style="font-size:12px;white-space:nowrap;">
        <input type="checkbox" id="closeOnSuccess">
        Close on success
      </label>
      <button id="copyLog" style="font-size:12px;white-space:nowrap;">Copy Log</button>
    </div>

    <div style="margin-top:10px;border-top:1px solid #ccc;padding-top:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <select id="historySelect" style="flex:1;font-size:12px;"></select>
        <button id="viewRun" style="font-size:12px;white-space:nowrap;">View</button>
        <button id="clearHistory" style="font-size:12px;white-space:nowrap;">Clear</button>
      </div>

      <div style="margin-top:8px;">
        <strong>Status:</strong>
        <div style="margin-top:6px;">${statusHtml}</div>
        <div id="overallStatus" style="margin-top:8px;font-size:12px;">• Ready</div>
      </div>
    </div>

    <div style="margin-top:10px;">
      <strong style="font-size:12px;">Log:</strong>
      <textarea id="logBox" readonly
        style="width:100%;height:120px;margin-top:6px;font-size:12px;resize:vertical;"></textarea>
    </div>

    <div style="margin-top:10px;display:flex;gap:8px;">
      <button id="runRefresh" style="flex:1;">Run</button>
      <button id="closePopup" style="flex:1;">Close</button>
    </div>
  `;

  document.body.appendChild(dialog);

  // =========================================================
  // 9) FOCUS TRAP FOR KEYBOARD ACCESS
  // ---------------------------------------------------------
  // Keeps Tab navigation inside the popup so keyboard users
  // don't tab away into the underlying page controls.
  // =========================================================
  (function trapFocus(container) {
    const focusables = container.querySelectorAll(
      'button, input[type="checkbox"], textarea, select'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    container.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  })(dialog);

  // =========================================================
  // 10) CACHE UI ELEMENT REFERENCES
  // ---------------------------------------------------------
  // Grab references to the buttons/fields after the popup has
  // been inserted into the page.
  // =========================================================
  const runBtn = document.getElementById("runRefresh");
  const closeBtn = document.getElementById("closePopup");
  const toggleBtn = document.getElementById("toggleAll");
  const overallStatus = document.getElementById("overallStatus");
  const closeOnSuccess = document.getElementById("closeOnSuccess");
  const copyBtn = document.getElementById("copyLog");
  const logBox = document.getElementById("logBox");
  const historySelect = document.getElementById("historySelect");
  const viewBtn = document.getElementById("viewRun");
  const clearBtn = document.getElementById("clearHistory");

  // =========================================================
  // 11) INITIAL UI STATE
  // ---------------------------------------------------------
  // Apply the remembered "close on success" preference.
  // Default is OFF if no saved preference exists.
  // Also load run history into the dropdown.
  // =========================================================
  closeOnSuccess.checked =
    prefs.closeOnSuccess !== undefined ? prefs.closeOnSuccess : false;

  let history = loadHistory();
  populateHistoryDropdown(history);

  // =========================================================
  // 12) EVENT: SELECT ALL / NONE
  // ---------------------------------------------------------
  // If anything is unchecked, clicking this checks everything.
  // Otherwise it clears everything.
  // =========================================================
  toggleBtn.onclick = function () {
    const checkboxes = actions.map((a) => document.getElementById(a.id)).filter(Boolean);
    const anyUnchecked = checkboxes.some((cb) => !cb.checked);

    checkboxes.forEach((cb) => {
      cb.checked = anyUnchecked;
    });

    updateToggleLabel();
    storeCurrentPreferences();
  };

  // =========================================================
  // 13) EVENT: INDIVIDUAL CHECKBOX CHANGES
  // ---------------------------------------------------------
  // Update the Select All/None label and save preferences any
  // time an individual refresh checkbox changes.
  // =========================================================
  actions.forEach((a) => {
    const cb = document.getElementById(a.id);
    if (cb) {
      cb.addEventListener("change", function () {
        updateToggleLabel();
        storeCurrentPreferences();
      });
    }
  });

  // Save "close on success" preference whenever it changes.
  closeOnSuccess.addEventListener("change", storeCurrentPreferences);

  // Set the correct initial label for the toggle button.
  updateToggleLabel();

  // =========================================================
  // 14) EVENT: COPY LOG
  // ---------------------------------------------------------
  // Copy the current log text to the clipboard. If clipboard
  // access fails, select the log text manually for copying.
  // =========================================================
  copyBtn.onclick = async function () {
    const ok = await copyToClipboard(logBox.value || "");

    if (ok) {
      appendLog(`[${stamp()}] COPIED log to clipboard`);
      alert("Log copied to clipboard.");
    } else {
      alert("Could not copy automatically. Select the log text and copy manually.");
      logBox.focus();
      logBox.select();
    }
  };

  // =========================================================
  // 15) EVENT: VIEW A SAVED RUN
  // ---------------------------------------------------------
  // Load a previously saved run from the history dropdown.
  // =========================================================
  viewBtn.onclick = function () {
    const runId = historySelect.value;
    if (!runId) return;

    const run = history.find((h) => h.runId === runId);
    if (run) renderRun(run);
  };

  // =========================================================
  // 16) EVENT: CLEAR HISTORY
  // ---------------------------------------------------------
  // Delete all saved run history for this Slate site.
  // =========================================================
  clearBtn.onclick = function () {
    if (!confirm("Clear all stored run history for this Slate site?")) return;

    history = [];
    saveHistory(history);

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    populateHistoryDropdown(history);
    overallStatus.textContent = "• History cleared";
    logBox.value = "";
    actions.forEach((a) => setStatus(a.id, "• Pending"));
  };

  // =========================================================
  // 17) EVENT: RUN REFRESHES
  // ---------------------------------------------------------
  // This is the main execution flow:
  // - Create a run record
  // - Reset the UI
  // - Sequentially run checked refreshes
  // - Save results/history/preferences
  // - Optionally close on success
  // =========================================================
  let isRunning = false;

  runBtn.onclick = async function () {
    if (isRunning) return;
    isRunning = true;

    const runNumber = nextRunNumber();
    const runId = String(Date.now());
    const startedAt = stamp();
    const selectedIds = getSelectedActionIds();

    const record = {
      runId,
      runNumber,
      startedAt,
      selectedActionIds: selectedIds,
      results: {},
      failed: false,
      log: "",
    };

    // Reset the log + per-action status display for this run.
    logBox.value = "";
    actions.forEach((a) => setStatus(a.id, "• Pending"));
    overallStatus.textContent = `⏳ Running selected refreshes (RUN #${runNumber})...`;
    appendLog(`[${startedAt}] RUN #${runNumber} START (${runId})`);

    FW.Progress.Load();
    setControlsEnabled(false);

    try {
      // Run each selected action sequentially.
      for (const action of actions) {
        const cb = document.getElementById(action.id);

        if (cb && cb.checked) {
          await runRefreshRequest(action.path, action.log, action.id, record);
        } else {
          setStatus(action.id, "⏭ Skipped");
          record.results[action.id] = "skipped";
          appendLog(`[${stamp()}] SKIP   ${action.log}`);
        }
      }

      overallStatus.textContent = `✅ All selected refreshes completed (RUN #${runNumber}).`;
      appendLog(`[${stamp()}] RUN #${runNumber} SUCCESS`);
    } catch {
      record.failed = true;
      overallStatus.textContent = `❌ Stopped due to an error (RUN #${runNumber}).`;
      appendLog(`[${stamp()}] RUN #${runNumber} STOPPED (error)`);
    } finally {
      FW.Progress.Unload();
      setControlsEnabled(true);
      updateToggleLabel();
      isRunning = false;

      // Save the final log into the run record.
      record.log = logBox.value;

      // Save this run into history.
      history = [record, ...loadHistory()].slice(0, HISTORY_LIMIT);
      saveHistory(history);
      populateHistoryDropdown(history);
      historySelect.value = record.runId;

      // Save UI preferences too.
      storeCurrentPreferences();

      // Auto-close only if successful AND the user opted into it.
      if (!record.failed && closeOnSuccess.checked) {
        if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      }
    }
  };

  // =========================================================
  // 18) EVENT: CLOSE POPUP
  // ---------------------------------------------------------
  // Manual close button for dismissing the popup.
  // =========================================================
  closeBtn.onclick = function () {
    if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
  };

  // =========================================================
  // 19) INITIAL FOCUS
  // ---------------------------------------------------------
  // Put keyboard focus on the Run button when the popup opens.
  // =========================================================
  runBtn.focus();
})();