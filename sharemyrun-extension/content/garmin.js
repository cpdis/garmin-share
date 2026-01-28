// ShareMyRun - Garmin Connect content script
// Injects share button on workout pages

(function () {
  "use strict";

  // Avoid re-injection
  if (window.__sharemyrun_injected) return;
  window.__sharemyrun_injected = true;

  const BUTTON_ID = "smr-share-btn";

  // Extract workout ID from URL
  function getWorkoutId() {
    const match = window.location.pathname.match(/\/workout\/(\d+)/);
    return match ? match[1] : null;
  }

  // Fetch workout data from Garmin's internal API
  async function extractWorkout(workoutId) {
    const response = await fetch(
      `https://connect.garmin.com/gc-api/workout-service/workout/${workoutId}?includeAudioNotes=true`,
      { credentials: "include" }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch workout: ${response.status}`);
    }

    return response.json();
  }

  // Handle share button click
  async function handleShare() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;

    const workoutId = getWorkoutId();
    if (!workoutId) {
      btn.textContent = "Error: No workout ID";
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="smr-spinner"></span> Sharing...';

    try {
      const workout = await extractWorkout(workoutId);

      // Send to background script for upload
      const response = await chrome.runtime.sendMessage({
        action: "uploadWorkout",
        workout,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(response.url);

      btn.innerHTML = "&#10003; Link Copied!";
      btn.classList.add("smr-btn-success");

      setTimeout(() => {
        btn.innerHTML = "&#128279; Share";
        btn.classList.remove("smr-btn-success");
      }, 3000);
    } catch (err) {
      console.error("ShareMyRun:", err);
      btn.innerHTML = "&#10007; Error";
      btn.classList.add("smr-btn-error");

      setTimeout(() => {
        btn.innerHTML = "&#128279; Share";
        btn.classList.remove("smr-btn-error");
      }, 3000);
    } finally {
      btn.disabled = false;
    }
  }

  // Inject share button into Garmin's action bar
  function injectShareButton() {
    // Don't inject if already present
    if (document.getElementById(BUTTON_ID)) return;

    // Try multiple selectors for Garmin's UI (they change occasionally)
    const selectors = [
      ".page-header-actions",
      ".action-bar",
      '[class*="ActionBar"]',
      '[class*="page-actions"]',
      ".workout-detail-header .btn-group",
    ];

    let actionBar = null;
    for (const selector of selectors) {
      actionBar = document.querySelector(selector);
      if (actionBar) break;
    }

    if (!actionBar) {
      // Retry with MutationObserver if not found
      return false;
    }

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.className = "smr-btn";
    btn.type = "button";
    btn.innerHTML = "&#128279; Share";
    btn.addEventListener("click", handleShare);

    actionBar.appendChild(btn);
    return true;
  }

  // Watch for SPA navigation and dynamic content
  function setupObserver() {
    let lastUrl = location.href;

    const observer = new MutationObserver(() => {
      // Check for URL changes (SPA navigation)
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Remove old button on navigation
        const oldBtn = document.getElementById(BUTTON_ID);
        if (oldBtn) oldBtn.remove();
      }

      // Try to inject if on workout page
      if (location.pathname.includes("/workout/")) {
        injectShareButton();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Initialize
  function init() {
    if (location.pathname.includes("/workout/")) {
      // Try immediate injection
      if (!injectShareButton()) {
        // If failed, wait for DOM to be ready
        setTimeout(injectShareButton, 500);
        setTimeout(injectShareButton, 1500);
      }
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
