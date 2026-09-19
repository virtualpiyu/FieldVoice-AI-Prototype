# FieldVoice AI — Investor Prototype V1

This is a zero-cost prototype focused on the core investor demo:

Salesperson voice note
→ processing state
→ AI-generated report draft
→ human review/edit state
→ report submission
→ management/executive intelligence
→ original voice trace
→ territory coverage.

## Included

- `apps/web`: React + Vite + TypeScript investor dashboard prototype
- `apps/mobile`: Expo + React Native mobile salesperson prototype
- Wine-red neon visual system
- Salesperson, Manager and Executive demo-role switching
- Working browser/mobile voice-recording interaction in the UI
- Mock AI processing state
- Structured field report UI
- Email draft UI
- Executive AI insights
- Manager command center
- Territory map using OpenStreetMap + Leaflet
- Role-based navigation demo

## Web

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:5173`.

## Mobile

```bash
cd apps/mobile
npm install
npx expo start
```

Open the project with Expo Go.

## Important prototype note

AI output is intentionally mocked in the frontend for the investor prototype. The UI is designed so the mock layer can later be replaced with:

Audio
→ Whisper / faster-whisper
→ structured LLM analysis
→ FastAPI
→ Supabase/PostgreSQL

Likewise, the territory map currently demonstrates the experience with OpenStreetMap. A production Google Maps integration can be added later.

## Suggested next integration step

Create a FastAPI endpoint such as:

POST /api/v1/visits/process

Input:
- visit metadata
- audio file

Output:
- transcript
- sentiment
- interest score
- concerns
- competitor mentions
- action items
- priority
- summary
- key insight

Then connect the existing frontend states to the real API.
