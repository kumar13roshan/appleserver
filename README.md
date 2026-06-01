# 🍎 AppleServer

> **Scaffolding beautiful codebases globally, instantly.**

AppleServer is an intelligent AI-powered code scaffolding ecosystem. It allows developers to generate complete, beautifully-formatted, and production-ready project structures from a single text prompt.

The repository is structured into two main components:
1. **[`appleserver/`](./appleserver)**: A lightweight, developer-friendly Command Line Interface (CLI) scaffolding tool built with Node.js.
2. **[`appleserver-backend/`](./appleserver-backend)**: A high-performance Express.js backend that interfaces with the Google Gemini API, featuring robust, automatic API key load balancing and rotation.

---

## 🚀 Features

- 🍎 **Instant Scaffolding**: Generate full project directory structures with code content instantly.
- ⚡ **Local & Cloud Routing**: The CLI automatically detects if a local backend is running and routes requests locally for unlimited generation without Vercel timeout constraints.
- 🔑 **Smart Key Rotation**: The backend balances generative AI requests across multiple Gemini API keys automatically, bypassing rate limits.
- 📦 **Vercel Ready**: The backend is configured to deploy instantly to Vercel Serverless Functions.

---

## 📂 Project Structure

```
appleserver/
├── appleserver/          # Command Line Interface (CLI) Tool
│   ├── index.js          # CLI entry point
│   ├── package.json      # CLI dependencies (commander, picocolors)
│   └── .gitignore
│
└── appleserver-backend/  # Express.js Server
    ├── server.js         # API Key rotating Express application
    ├── vercel.json       # Vercel deployment configuration
    ├── package.json      # Server dependencies (@google/generative-ai, cors, express)
    ├── .env.example      # Example environment configuration
    └── .gitignore
```

---

## 🛠️ Getting Started

### 1. Backend Setup (`appleserver-backend/`)

Navigate to the backend directory and install dependencies:
```bash
cd appleserver-backend
npm install
```

Configure your environment variables:
Create a `.env` file (copied from `.env.example`) and add your Gemini API Key(s):
```env
GEMINI_API_KEY=your_first_gemini_api_key
GEMINI_API_KEY_2=your_second_gemini_api_key
PORT=3000
```

Start the local server:
```bash
npm start
```

### 2. CLI Setup (`appleserver/`)

Navigate to the CLI directory:
```bash
cd appleserver
npm install
```

Link the CLI globally to run it from anywhere in your terminal:
```bash
npm link
```

Now you can generate codebases from anywhere:
```bash
appleserver "Create a beautiful responsive landing page for a coffee shop using HTML and CSS" --dir ./my-coffee-shop
```

---

## 🌐 Production Deployment

The backend is fully optimized for Vercel. Deploy with a single command:
```bash
cd appleserver-backend
vercel
```
Make sure to configure your environment variables (like `GEMINI_API_KEY`) in your Vercel Dashboard under Project Settings.

---

## 📄 License

This project is licensed under the ISC License.
