# feat: ShareMyRun Chrome Extension

## Overview

Chrome extension that adds seamless workout sharing to Garmin Connect. One-click share button on workout pages uploads to our backend and copies a short link. Recipients can one-click import directly into their Garmin Connect account.

## Problem Statement

Current workflow is clunky:
1. Install separate export extension
2. Download JSON file
3. Upload to our site
4. Copy link, share via messaging
5. Recipient downloads file
6. Recipient installs import extension
7. Recipient uploads file

**Target workflow:**
1. Click "Share" on workout page → link copied
2. Share link
3. Recipient clicks "Import to Garmin" → workout appears in their account

## Architecture

```
sharemyrun-extension/
├── manifest.json           # MV3, permissions for connect.garmin.com + our domain
├── content/
│   ├── garmin.js          # Injected into connect.garmin.com
│   │   ├── injectShareButton()
│   │   └── extractWorkout()
│   └── sharemyrun.js      # Injected into garmin-import.vercel.app
│       └── injectImportButton()
├── background.js           # Service worker
│   ├── uploadWorkout()     # POST to our API
│   └── importWorkout()     # POST to Garmin API
├── lib/
│   └── garmin-api.js      # CSRF extraction, API helpers
├── styles.css              # Button styling
└── icons/                  # Extension icons
```

## Technical Approach

### Phase 1: Share Button (Garmin → Our Backend)

**Detection:** Match URL pattern `connect.garmin.com/modern/workout/*`

**Workout Extraction:**
```javascript
// content/garmin.js
async function extractWorkout() {
  // Get workout ID from URL
  const workoutId = window.location.pathname.split('/').pop();

  // Fetch workout data using Garmin's internal API
  const response = await fetch(
    `/gc-api/workout-service/workout/${workoutId}?includeAudioNotes=true`,
    { credentials: 'include' }
  );
  return response.json();
}
```

**Button Injection:**
```javascript
function injectShareButton() {
  // Find Garmin's action bar
  const actionBar = document.querySelector('.action-bar, .page-header-actions');
  if (!actionBar || document.getElementById('smr-share-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'smr-share-btn';
  btn.className = 'smr-btn';
  btn.innerHTML = '🔗 Share';
  btn.onclick = handleShare;
  actionBar.appendChild(btn);
}
```

**Share Flow:**
```javascript
async function handleShare() {
  const btn = document.getElementById('smr-share-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Sharing...';

  try {
    const workout = await extractWorkout();

    // Send to background script for upload
    const { url } = await chrome.runtime.sendMessage({
      action: 'uploadWorkout',
      workout
    });

    await navigator.clipboard.writeText(url);
    btn.innerHTML = '✓ Link Copied!';
    setTimeout(() => btn.innerHTML = '🔗 Share', 2000);
  } catch (err) {
    btn.innerHTML = '✗ Error';
    console.error('ShareMyRun:', err);
  } finally {
    btn.disabled = false;
  }
}
```

### Phase 2: Import Button (Our Site → Garmin)

**Detection:** Match URL pattern `garmin-import.vercel.app/w/*`

**Button Injection:**
```javascript
// content/sharemyrun.js
function injectImportButton() {
  // Find our download button, add import button next to it
  const downloadBtn = document.querySelector('a[download]');
  if (!downloadBtn || document.getElementById('smr-import-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'smr-import-btn';
  btn.className = 'smr-btn smr-btn-primary';
  btn.innerHTML = '⬆️ Import to Garmin';
  btn.onclick = handleImport;
  downloadBtn.parentNode.insertBefore(btn, downloadBtn);
}
```

**Import Flow:**
```javascript
async function handleImport() {
  const btn = document.getElementById('smr-import-btn');
  btn.disabled = true;
  btn.innerHTML = '⏳ Importing...';

  try {
    // Get workout data from page (embedded in data attribute or fetched)
    const workoutUrl = document.querySelector('a[download]').href;

    const { success, workoutUrl: newUrl } = await chrome.runtime.sendMessage({
      action: 'importWorkout',
      workoutUrl
    });

    if (success) {
      btn.innerHTML = '✓ Imported!';
      // Redirect to new workout in Garmin Connect
      window.open(newUrl, '_blank');
    }
  } catch (err) {
    btn.innerHTML = '✗ Error - Are you logged into Garmin?';
    console.error('ShareMyRun:', err);
  }
}
```

### Phase 3: Background Service Worker

```javascript
// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'uploadWorkout') {
    uploadWorkout(message.workout).then(sendResponse);
    return true; // async response
  }

  if (message.action === 'importWorkout') {
    importWorkout(message.workoutUrl).then(sendResponse);
    return true;
  }
});

async function uploadWorkout(workout) {
  const response = await fetch('https://garmin-import.vercel.app/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workout)
  });
  return response.json(); // { id, url }
}

async function importWorkout(workoutUrl) {
  // Fetch workout JSON from our blob storage
  const workoutRes = await fetch(workoutUrl);
  const workout = await workoutRes.json();

  // Clean workout for import (remove IDs, add " - shared" suffix)
  const cleanWorkout = prepareForImport(workout);

  // Get CSRF token from Garmin (requires user to be logged in)
  const csrfToken = await getGarminCsrfToken();

  // POST to Garmin's workout API
  const response = await fetch('https://connect.garmin.com/gc-api/workout-service/workout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'connect-csrf-token': csrfToken,
      'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'include',
    body: JSON.stringify(cleanWorkout)
  });

  const newWorkout = await response.json();
  return {
    success: true,
    workoutUrl: `https://connect.garmin.com/modern/workout/${newWorkout.workoutId}`
  };
}

function prepareForImport(workout) {
  const clean = { ...workout };

  // Remove fields that would cause conflicts
  delete clean.workoutId;
  delete clean.ownerId;
  delete clean.createdDate;
  delete clean.updatedDate;

  // Add suffix to name
  clean.workoutName = `${clean.workoutName} - shared`;

  // Clear step IDs
  if (clean.workoutSegments) {
    for (const segment of clean.workoutSegments) {
      if (segment.workoutSteps) {
        for (const step of segment.workoutSteps) {
          delete step.stepId;
        }
      }
    }
  }

  return clean;
}

async function getGarminCsrfToken() {
  // Fetch Garmin Connect page to get CSRF token from meta tag
  const response = await fetch('https://connect.garmin.com/modern/workouts', {
    credentials: 'include'
  });
  const html = await response.text();
  const match = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (!match) throw new Error('Not logged in to Garmin Connect');
  return match[1];
}
```

### Backend API Endpoint

Add to our Next.js app:

```typescript
// app/api/upload/route.ts
import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  try {
    const workout = await request.json();

    // Validate it looks like a Garmin workout
    if (!workout.workoutName && !workout.workoutSegments) {
      return NextResponse.json(
        { error: "Invalid workout data" },
        { status: 400 }
      );
    }

    const id = randomUUID().slice(0, 8);

    await put(`workouts/${id}.json`, JSON.stringify(workout), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });

    return NextResponse.json({
      id,
      url: `https://garmin-import.vercel.app/w/${id}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
```

## Manifest

```json
{
  "manifest_version": 3,
  "name": "ShareMyRun",
  "version": "1.0.0",
  "description": "Share Garmin workouts with a single click",
  "permissions": [],
  "host_permissions": [
    "https://connect.garmin.com/*",
    "https://garmin-import.vercel.app/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://connect.garmin.com/modern/workout/*"],
      "js": ["content/garmin.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://garmin-import.vercel.app/w/*"],
      "js": ["content/sharemyrun.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

## Styles

```css
/* styles.css */
.smr-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #f0f0f0;
  color: #333;
}

.smr-btn:hover {
  background: #e0e0e0;
}

.smr-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.smr-btn-primary {
  background: #2563eb;
  color: white;
}

.smr-btn-primary:hover {
  background: #1d4ed8;
}

/* Garmin-specific positioning */
.action-bar .smr-btn,
.page-header-actions .smr-btn {
  margin-left: 8px;
}
```

## File Structure

```
sharemyrun-extension/
├── manifest.json
├── background.js
├── content/
│   ├── garmin.js
│   └── sharemyrun.js
├── lib/
│   └── garmin-api.js
├── styles.css
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Acceptance Criteria

### Functional
- [ ] Share button appears on Garmin Connect workout pages
- [ ] Clicking Share extracts workout, uploads, copies link to clipboard
- [ ] Share link page shows workout details
- [ ] Import button appears on share pages (when extension installed)
- [ ] Clicking Import adds workout to user's Garmin Connect (if logged in)
- [ ] Error states handled gracefully (not logged in, network errors)

### Non-Functional
- [ ] Extension loads without errors
- [ ] Buttons don't break Garmin's existing UI
- [ ] Works on Chrome (primary), Edge (secondary)
- [ ] No polling - uses MutationObserver for SPA navigation

## Installation (Local)

1. Clone repo / download extension folder
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select extension folder

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Garmin changes their UI/API | Monitor for breakage, version pin selectors |
| CSRF token extraction fails | Clear error message, link to manual import |
| User not logged into Garmin | Detect and prompt to log in |
| Rate limiting by Garmin | Add delays between operations if needed |

## Future Enhancements

- [ ] Browser action popup showing recent shares
- [ ] Firefox support
- [ ] Bulk workout sharing
- [ ] Share workout schedules/plans (not just individual workouts)

---

*Plan created 2025-01-28*
