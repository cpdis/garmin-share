# Garmin Connect Workout Export Research

> Research completed: 2025-01-28

## The Problem

Garmin Connect has **NO export button** for **workouts** (planned training sessions with intervals, targets, etc.). Activities (completed sessions) can easily be exported as FIT/TCX/GPX. Workouts cannot.

**Key Distinction:**
- **Activities**: Historical data from completed sessions. Export supported.
- **Workouts**: Future training plans you create. NO export in UI.

---

## Practical Extraction Methods (Available Today)

### Method 1: Chrome Extension - "Share Your Garmin Connect Workout"

**Best for:** Quick JSON export/import, sharing between Garmin accounts

**How it works:**
1. Install from [Chrome Web Store](https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff)
2. Navigate to a workout page in Garmin Connect
3. Extension adds a "Download" button
4. Exports workout as JSON file

**Technical Details:**
- Source: [GitHub - fulippo/share-your-garmin-workout](https://github.com/fulippo/share-your-garmin-workout)
- API endpoint: `GET /gc-api/workout-service/workout/{workoutId}?includeAudioNotes=true`
- Export format: JSON (Garmin's internal format)
- Import: Extension can also import JSON back to a different account

**Limitations:**
- Download button sometimes disappears (refresh/resize to fix)
- JSON only (not FIT)
- No batch export

**JSON Structure (simplified):**
```json
{
  "workoutId": 123456789,
  "workoutName": "Tempo Run 5x1K",
  "workoutSegments": [
    {
      "workoutSteps": [
        {
          "stepId": 1,
          "stepType": "warmup",
          "targetType": "pace",
          "targetValueLow": 300,
          "targetValueHigh": 360
        }
      ]
    }
  ]
}
```

---

### Method 2: Browser DevTools (Manual)

**Best for:** One-off extraction, understanding API structure

**Steps:**
1. Open Garmin Connect, navigate to workout
2. Open DevTools (F12) > Network tab
3. Check "Preserve log"
4. Refresh the page
5. Filter by "workout" in search
6. Find request to `/gc-api/workout-service/workout/{id}`
7. Copy Response JSON

**Endpoint discovered:**
```
GET https://connect.garmin.com/gc-api/workout-service/workout/{WORKOUT_ID}?includeAudioNotes=true

Headers required:
- Cookie (session)
- X-CSRF-Token (from page)
```

---

### Method 3: Python CLI - garmin-workouts

**Best for:** Bulk export, automation, FIT file generation

**Tool:** [github.com/mkuthan/garmin-workouts](https://github.com/mkuthan/garmin-workouts)

**Installation:**
```bash
git clone https://github.com/mkuthan/garmin-workouts.git
cd garmin-workouts
python3 -m venv venv
source venv/bin/activate
pip3 install -r requirements.txt

# Set credentials
export GARMIN_USERNAME="your@email.com"
export GARMIN_PASSWORD="your_password"
```

**Usage:**
```bash
# Export ALL workouts as FIT files to Garmin device
python -m garminworkouts export /Volumes/GARMIN/NewFiles

# Get single workout as JSON
python -m garminworkouts get --id 188952654

# List all workouts
python -m garminworkouts list
```

**Key Features:**
- Exports directly to FIT format
- Batch export all workouts
- Can also import YAML-defined workouts
- Maintains session cookies to avoid rate limits

---

### Method 4: Python Library - python-garminconnect

**Best for:** Custom scripts, integration with other tools

**Library:** [github.com/cyberjunky/python-garminconnect](https://github.com/cyberjunky/python-garminconnect)

**Key Endpoints (from source):**
```python
garmin_workouts = "/workout-service"
garmin_workouts_schedule_url = "/workout-service/schedule"
garmin_connect_training_plan_url = "/trainingplan-service/trainingplan"
```

**Example:**
```python
from garminconnect import Garmin

client = Garmin("email", "password")
client.login()

# Get workouts (check library docs for exact method)
workouts = client.get_workouts()  # Returns JSON list
```

---

### Method 5: Direct from Watch (FIT files)

**Best for:** Already-synced workouts on device

**Path on Garmin device:**
```
/GARMIN/Workouts/
```

**Workflow:**
1. Connect watch via USB
2. Navigate to `/GARMIN/Workouts/`
3. Copy `.FIT` files
4. Share with others who copy to same folder

**Note:** Only works for workouts already synced to device.

---

## API Reference (Unofficial)

Base URL: `https://connect.garmin.com`

### Workout Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/gc-api/workout-service/workout/{id}` | GET | Single workout JSON |
| `/gc-api/workout-service/workout` | POST | Create workout |
| `/workout-service/schedule` | GET/POST | Scheduled workouts |
| `/trainingplan-service/trainingplan` | GET | Training plans |

### Authentication

Garmin uses OAuth + session cookies. Best approach:
1. Use `garth` library for OAuth token management
2. Store tokens in session directory
3. Avoid hitting SSO service repeatedly (rate limits)

---

## Format Comparison

| Format | Source | Use Case |
|--------|--------|----------|
| **JSON** | Chrome extension, DevTools | Sharing between Garmin accounts |
| **FIT** | garmin-workouts CLI, device | Import to any Garmin device |
| **YAML** | garmin-workouts definitions | Human-readable, version control |

---

## What Doesn't Work

1. **Official Garmin Export** - Does not exist for workouts
2. **Garmin API** - Only for approved business developers
3. **TrainingPeaks/Intervals.icu** - Export their own formats, not Garmin's
4. **TCX/GPX** - These are activity formats, not workout formats

---

## Recommended Workflow

### For Sharing with Friends
1. Use Chrome extension to export JSON
2. Send JSON file
3. Friend imports via same extension

### For Backup / Bulk Export
1. Use `garmin-workouts` CLI
2. Export to FIT files
3. Store in Git repo (YAML definitions are version-controllable)

### For Custom Integration
1. Use DevTools to understand API
2. Build with `python-garminconnect` library
3. Handle OAuth properly with `garth`

---

## Sources

- [Chrome Extension - Share Your Garmin Connect Workout](https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff)
- [Extension Source - GitHub](https://github.com/fulippo/share-your-garmin-workout)
- [garmin-workouts CLI - GitHub](https://github.com/mkuthan/garmin-workouts)
- [python-garminconnect - GitHub](https://github.com/cyberjunky/python-garminconnect)
- [Garmin FIT SDK](https://developer.garmin.com/fit/)
- [Garmin Training API (official, requires approval)](https://developer.garmin.com/gc-developer-program/training-api/)
