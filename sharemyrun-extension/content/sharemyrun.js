// ShareMyRun - Share page content script
// Injects import button on garmin-import.vercel.app/w/* pages

(function () {
  "use strict";

  // Avoid re-injection
  if (window.__sharemyrun_import_injected) return;
  window.__sharemyrun_import_injected = true;

  const BUTTON_ID = "smr-import-btn";

  // Get workout URL from the download link
  function getWorkoutUrl() {
    const downloadLink = document.querySelector('a[download]');
    return downloadLink ? downloadLink.href : null;
  }

  // Handle import button click
  async function handleImport() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;

    const workoutUrl = getWorkoutUrl();
    if (!workoutUrl) {
      btn.textContent = "Error: No workout found";
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="smr-spinner"></span> Importing...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: "importWorkout",
        workoutUrl,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      btn.innerHTML = "&#10003; Imported!";
      btn.classList.add("smr-btn-success");

      // Open the new workout in Garmin Connect
      if (response.workoutUrl) {
        window.open(response.workoutUrl, "_blank");
      }
    } catch (err) {
      console.error("ShareMyRun:", err);

      // Show helpful error message
      let errorMsg = "Error";
      if (err.message.includes("Not logged in") || err.message.includes("401")) {
        errorMsg = "Login to Garmin first";
      } else if (err.message.includes("CSRF")) {
        errorMsg = "Auth error - refresh Garmin";
      }

      btn.innerHTML = `&#10007; ${errorMsg}`;
      btn.classList.add("smr-btn-error");

      setTimeout(() => {
        btn.innerHTML = "&#11014;&#65039; Import to Garmin";
        btn.classList.remove("smr-btn-error");
        btn.disabled = false;
      }, 4000);
      return;
    }

    // Keep success state
    setTimeout(() => {
      btn.innerHTML = "&#11014;&#65039; Import Again";
      btn.classList.remove("smr-btn-success");
      btn.disabled = false;
    }, 3000);
  }

  // Inject import button next to download button
  function injectImportButton() {
    // Don't inject if already present
    if (document.getElementById(BUTTON_ID)) return;

    const downloadLink = document.querySelector('a[download]');
    if (!downloadLink) return false;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.className = "smr-btn smr-btn-primary";
    btn.type = "button";
    btn.innerHTML = "&#11014;&#65039; Import to Garmin";
    btn.addEventListener("click", handleImport);

    // Insert before download link
    downloadLink.parentNode.insertBefore(btn, downloadLink);

    // Add some spacing
    const spacer = document.createElement("span");
    spacer.style.display = "inline-block";
    spacer.style.width = "8px";
    downloadLink.parentNode.insertBefore(spacer, downloadLink);

    return true;
  }

  // Watch for dynamic content
  function setupObserver() {
    const observer = new MutationObserver(() => {
      injectImportButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Initialize
  function init() {
    // Try immediate injection
    if (!injectImportButton()) {
      // If failed, wait for DOM to be ready
      setTimeout(injectImportButton, 500);
      setTimeout(injectImportButton, 1500);
    }

    setupObserver();
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
