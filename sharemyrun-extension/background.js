// ShareMyRun - Background Service Worker
// Handles workout upload and import operations

const API_BASE = "https://garmin-import.vercel.app";
const GARMIN_BASE = "https://connect.garmin.com";

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "uploadWorkout") {
    uploadWorkout(message.workout)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // Async response
  }

  if (message.action === "importWorkout") {
    importWorkout(message.workoutUrl)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

// Upload workout to our backend
async function uploadWorkout(workout) {
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workout),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    url: `${API_BASE}/w/${data.id}`,
  };
}

// Import workout from our backend to Garmin Connect
async function importWorkout(workoutUrl) {
  // Fetch workout JSON from our blob storage
  const workoutRes = await fetch(workoutUrl);
  if (!workoutRes.ok) {
    throw new Error(`Failed to fetch workout: ${workoutRes.status}`);
  }

  const workout = await workoutRes.json();

  // Clean workout for import
  const cleanWorkout = prepareForImport(workout);

  // Get CSRF token from Garmin
  const csrfToken = await getGarminCsrfToken();

  // POST to Garmin's workout API
  const response = await fetch(
    `${GARMIN_BASE}/gc-api/workout-service/workout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "connect-csrf-token": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "include",
      body: JSON.stringify(cleanWorkout),
    }
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Not logged in to Garmin Connect");
    }
    const text = await response.text();
    throw new Error(`Import failed: ${response.status} - ${text}`);
  }

  const newWorkout = await response.json();
  return {
    success: true,
    workoutId: newWorkout.workoutId,
    workoutUrl: `${GARMIN_BASE}/modern/workout/${newWorkout.workoutId}`,
  };
}

// Prepare workout JSON for import (remove IDs, add suffix)
function prepareForImport(workout) {
  const clean = JSON.parse(JSON.stringify(workout)); // Deep clone

  // Remove fields that would cause conflicts
  delete clean.workoutId;
  delete clean.ownerId;
  delete clean.createdDate;
  delete clean.updatedDate;
  delete clean.author;
  delete clean.consumer;

  // Add suffix to name to indicate it's shared
  if (clean.workoutName) {
    clean.workoutName = `${clean.workoutName} - shared`;
  }

  // Clear step IDs recursively
  function clearStepIds(obj) {
    if (Array.isArray(obj)) {
      obj.forEach(clearStepIds);
    } else if (obj && typeof obj === "object") {
      delete obj.stepId;
      delete obj.workoutStepId;
      Object.values(obj).forEach(clearStepIds);
    }
  }

  if (clean.workoutSegments) {
    clearStepIds(clean.workoutSegments);
  }

  return clean;
}

// Get CSRF token from Garmin Connect
async function getGarminCsrfToken() {
  // Fetch Garmin Connect page to get CSRF token
  const response = await fetch(`${GARMIN_BASE}/modern/workouts`, {
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Not logged in to Garmin Connect");
    }
    throw new Error(`Failed to get CSRF token: ${response.status}`);
  }

  const html = await response.text();

  // Try multiple patterns for CSRF token
  const patterns = [
    /name="csrf-token"\s+content="([^"]+)"/,
    /content="([^"]+)"\s+name="csrf-token"/,
    /"csrfToken":"([^"]+)"/,
    /data-csrf-token="([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1];
    }
  }

  throw new Error("CSRF token not found - please refresh Garmin Connect");
}
