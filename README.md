# CloudCost IQ

CloudCost IQ lets you estimate and compare cloud costs before building anything. Create a workload, compare AWS, Google Cloud, and Azure, review savings suggestions, and preview Terraform configuration.

The app simulates costs only. It does not create cloud resources or need cloud credentials.

## Run with Docker

You need Docker and Docker Compose v2.

```bash
./run.sh
```

Open [http://localhost:3000](http://localhost:3000). The first run creates `backend/.env` from the example settings and starts the app with MongoDB.

Useful commands:

```bash
./run.sh status
./run.sh logs
./run.sh restart
./run.sh stop
```

## Run for development

You need Python 3.12+, Node.js 20+, and MongoDB.

1. Start MongoDB on `localhost:27017`.
2. In `backend/`, create the environment file and start the API:

   ```bash
   cp .env.example .env
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn server:app --reload --port 8001
   ```

3. In another terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000). The API docs are at [http://localhost:8001/docs](http://localhost:8001/docs).

## What you can do

- Build and simulate workloads across AWS, Google Cloud, and Azure.
- Compare estimated costs by provider, region, and pricing model.
- Save and reload workspaces.
- Get cost optimization recommendations.
- Generate and validate Terraform previews for review or download.

## Settings

Backend settings live in `backend/.env`. Set `GEMINI_API_KEY` for AI-generated recommendations and `GROQ_API_KEY` for a separate conversational chatbot. Both have free usage tiers; create keys through [Google AI Studio](https://aistudio.google.com/app/apikey) and [Groq Console](https://console.groq.com/keys). Gemini/Groq quotas can vary by account and change over time. Without a configured provider, recommendations use the local rules engine and the chat clearly reports that its live model is unavailable.

For local development, keep `COOKIE_SECURE=false`. Set a strong `JWT_SECRET` and enable secure cookies when deploying over HTTPS. Never commit secrets from `.env`.
