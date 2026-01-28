# Garmin Workout Sharing - Technical Research

## Executive Summary

**Feasibility: HIGH** - Multiple proven paths exist for extracting/sharing Garmin workouts.

### Key Findings
1. No official public API for individual devs - requires business approval
2. Unofficial APIs well-documented via reverse engineering
3. Workouts exportable as JSON or FIT files
4. Existing Chrome extensions already solve this problem (can study/extend)
5. Python libraries provide full workout CRUD operations

---

## Official Garmin APIs

### Training API
- **Purpose**: Publish workouts/training plans to Garmin Connect calendar
- **Access**: Free but requires business developer approval
- **Limitation**: WRITE-ONLY - cannot read existing workouts
- **URL**: https://developer.garmin.com/gc-developer-program/training-api/

### Activity API
- **Purpose**: Access to FIT files after user consent
- **Access**: Requires approval, push-based delivery
- **Note**: Activities ≠ Workouts (activities = completed, workouts = planned)
- **URL**: https://developer.garmin.com/gc-developer-program/activity-api/

### Verdict
Official APIs not suitable for our use case - approval barrier + no workout read access.

---

## Unofficial/Reverse-Engineered APIs

### Key Endpoints (from python-garminconnect)
```
Base: connect.garmin.com
Workout Service: /workout-service
Workout Schedule: /workout-service/schedule
```

### Authentication
- OAuth via Garth library (same as official app)
- Tokens persist ~1 year in `~/.garminconnect`
- Session-based auth also possible

---

## Existing Tools & Libraries

### Python: python-garminconnect
- **Repo**: https://github.com/cyberjunky/python-garminconnect
- **Install**: `pip install garminconnect`
- **Features**: 105+ API methods including workout CRUD
- **Auth**: OAuth via Garth library
- **Best for**: Backend/CLI applications

### Python: garmin-workouts
- **Repo**: https://github.com/mkuthan/garmin-workouts
- **Features**:
  - Export ALL workouts as FIT files
  - Import workouts from YAML/Excel
  - CLI-based workflow
- **Command**: `python -m garminworkouts export /path/to/dir`
- **Best for**: Bulk export/sync to devices

### Chrome Extension: share-your-garmin-workout
- **Repo**: https://github.com/fulippo/share-your-garmin-workout
- **Chrome Store**: https://chromewebstore.google.com/detail/share-your-garmin-connect/kdpolhnlnkengkmfncjdbfdehglepmff
- **How it works**:
  - Injects buttons into Garmin Connect UI
  - Downloads workout as JSON from workout page
  - Import button uploads JSON to account
- **Limitation**: Both parties need extension installed

### JavaScript: garmin-connect
- **Repo**: https://github.com/Pythe1337N/garmin-connect
- **Status**: Workout methods marked as TODO
- **Has**: Custom request support (GET/POST/PUT)
- **Best for**: Node.js/browser hybrid apps

---

## File Formats

### JSON (Garmin Connect native)
- Used internally by Garmin Connect web
- Can be exported via Chrome DevTools or extensions
- Structure: Contains workout steps, targets, sport type
- **Reverse engineer**: Create workout in Connect, export JSON, inspect structure

### FIT (Flexible and Interoperable Data Transfer)
- Garmin's standard binary format
- Official SDK: https://developer.garmin.com/fit/protocol/
- Contains: location, time, performance metrics, workout steps
- Device path: `//GARMIN/Workouts/`
- **Libraries**: Python fitdecode, Go muktihari/fit

### YAML/Excel
- Used by garmin-workouts tool
- Human-readable workout definitions
- Converted to FIT for device sync

---

## Architecture Options

### Option A: Chrome Extension (Browser-Only)
```
[User Browser] -> [Extension] -> [Garmin Connect Web]
                      |
                      v
              [JSON Export/Import]
```
**Pros**: No backend, direct integration
**Cons**: Requires extension install, both parties need it

### Option B: Web App + Python Backend
```
[Web UI] -> [Python API] -> [garminconnect lib] -> [Garmin]
                |
                v
        [Workout JSON Store]
```
**Pros**: Shareable links, no extension needed
**Cons**: User must provide credentials, auth complexity

### Option C: Hybrid (Extension + Share Service)
```
[Extension] -> [Export JSON] -> [Share Service] -> [Shareable Link]
                                       |
                                       v
                              [Anyone can download]
```
**Pros**: Easy export, public sharing without recipient extension
**Cons**: Privacy concerns if workouts contain personal data

---

## Recommended Approach

### Phase 1: Chrome Extension MVP
1. Fork/study share-your-garmin-workout extension
2. Add shareable link generation (upload JSON to simple backend)
3. Landing page to view/download shared workout
4. Optional: One-click import if recipient has extension

### Phase 2: Enhanced Features
1. Web app with garminconnect Python backend
2. User accounts + saved workouts
3. Workout discovery/templates
4. Social features (coaches sharing with athletes)

---

## Technical Risks

| Risk | Mitigation |
|------|------------|
| Garmin changes API | Monitor garminconnect lib updates |
| OAuth token expiry | Implement refresh flow |
| Rate limiting | Cache, batch operations |
| Workout JSON schema changes | Version detection, migration |

---

## References

- [python-garminconnect](https://github.com/cyberjunky/python-garminconnect)
- [garmin-workouts CLI](https://github.com/mkuthan/garmin-workouts)
- [share-your-garmin-workout extension](https://github.com/fulippo/share-your-garmin-workout)
- [Garmin FIT SDK](https://developer.garmin.com/fit/protocol/)
- [garth OAuth library](https://github.com/matin/garth)
- [awesome-garmin curated list](https://github.com/bombsimon/awesome-garmin)
