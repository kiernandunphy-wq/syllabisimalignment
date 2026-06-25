# Deployment Notes

## Local Development

Run the backend and frontend separately.

```powershell
$env:GEMINI_API_KEY="your_key_here"
npm run api
```

```powershell
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8787`.

## Production Build

```powershell
npm run build
npm run start
```

The backend serves the built `dist` assets and the `/api/parse-syllabus` endpoint.

## Required Environment Variables

- `GEMINI_API_KEY`: server-side Gemini key. Required.
- `GEMINI_MODEL`: defaults to `gemini-2.5-flash`.
- `PORT`: defaults to `8787`.
- `MAX_PASTED_TEXT_CHARS`: defaults to `200000`.
- `MAX_SYLLABUS_FILE_BYTES`: defaults to `8388608`.
- `RATE_LIMIT_WINDOW_MS`: defaults to `60000`.
- `RATE_LIMIT_MAX_REQUESTS`: defaults to `20`.
- `REQUEST_LOGGING_ENABLED`: defaults to `true`; set to `false` to disable metadata logs.

## Google AI Studio / Cloud Deployment Guidance

- Store `GEMINI_API_KEY` as a server-side secret, not in client code.
- Restrict the Gemini API key to Gemini API only.
- Use separate dev and production keys.
- Deploy as a full-stack app so `/api/parse-syllabus` runs server-side.
- Confirm built frontend assets do not contain `GEMINI_API_KEY` or `VITE_GEMINI_API_KEY`.
- Keep rate limits enabled.
- Review logs to confirm they contain metadata only, not syllabus contents.

## Product Boundary

Gemini parses syllabi into structured JSON. The deterministic TypeScript rule engine assigns simulation recommendations. Do not replace the rule engine with model-generated recommendations without a separate review.

Visible product disclaimer: faculty decision-support, not automatic curriculum approval.
