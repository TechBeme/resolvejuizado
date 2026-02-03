<div align="center">

# 🏛️ ResolveJuizado Pipeline

**Automated news aggregation and publication system for Brazilian Procon websites**

[![Daily Pipeline](https://github.com/TechBeme/resolvejuizado/actions/workflows/daily-pipeline.yml/badge.svg)](https://github.com/TechBeme/resolvejuizado/actions/workflows/daily-pipeline.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.11.1-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)

[Features](#-features) • [Architecture](#-architecture) • [Installation](#-installation) • [Configuration](#-configuration) • [Usage](#-usage) • [CI/CD](#-cicd-github-actions)

**Languages:** [🇧🇷 Português](README.pt-BR.md) • [🇪🇸 Español](README.es.md)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [About the Developer](#-about-the-developer)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [CI/CD](#-cicd-github-actions)
- [Database](#-database)
- [Development](#-development)
- [License](#-license)

---

## 🎯 Overview

**ResolveJuizado Pipeline** is an enterprise-level system that automates the collection, AI-powered processing, and publication of news from **24 major Procon websites in Brazil**. The pipeline operates in two distinct phases, ensuring scalability and reliability through parallel processing and automatic failure recovery.

### Two-Phase Pipeline

**Phase 1 - Discovery (Parallel):**
- Simultaneous crawling of 24 Procon websites
- Intelligent duplicate detection
- Automatic stop when existing URL is found
- Automatic retry with fallback

**Phase 2 - Processing (Parallel):**
- Content extraction with Firecrawl
- Editorial rewriting with Google Gemini 3 Pro
- Automatic SEO optimization (RankMath)
- Generation of 3 AI images
- WordPress publication with state-based categorization

---

## 👨‍💻 About the Developer

<div align="center">

**Developed by Rafael Vieira (TechBeme)**

[![GitHub](https://img.shields.io/badge/GitHub-TechBeme-181717?logo=github)](https://github.com/TechBeme)
[![Fiverr](https://img.shields.io/badge/Fiverr-Tech__Be-1DBF73?logo=fiverr)](https://www.fiverr.com/tech_be)
[![Upwork](https://img.shields.io/badge/Upwork-Profile-14a800?logo=upwork)](https://www.upwork.com/freelancers/~01f0abcf70bbd95376)
[![Email](https://img.shields.io/badge/Email-contact@techbe.me-EA4335?logo=gmail)](mailto:contact@techbe.me)

**Full-Stack Developer & AI Automation Specialist**

Specialized in **web scraping**, **automation systems**, **modern web applications**, and **AI integrations**.

### 💼 Core Expertise

- 🔍 Web Scraping & Data Extraction
- ⚡ Process Automation & Workflows
- 💻 Full-Stack Development (Next.js, React, Python, TypeScript)
- 🤖 AI Integrations (OpenAI, Anthropic, RAG systems)
- 📊 Database Design & Optimization
- 🎨 Modern UI/UX Development

### 🌍 Languages

🇺🇸 **English** • 🇧🇷 **Português** • 🇪🇸 **Español**

### 📬 Contact

**Email**: [contact@techbe.me](mailto:contact@techbe.me)

</div>

---

## ✨ Features

### 🚀 Performance and Scalability
- **100% parallel processing** with `Promise.allSettled()`
- **Automatic retry** with intelligent fallback
- **Automatic recovery** of orphaned articles (10min timeout)
- **Duplicate detection** via unique URL in database

### 🤖 Artificial Intelligence
- **Google Gemini 3 Pro** for editorial rewriting
- **Zod validation** of schemas with automatic retry
- **3-layer SEO**: instruction (175 chars) → truncation (195) → validation (200)
- **AI image generation** with contextual relevance
- **Automatic image optimization** with Sharp (reduces 60-80% of size)

### 📊 Observability
- **Dual-mode logs**: structured JSON (local) + user-friendly (GitHub Actions)
- **Emojis and natural language** in CI/CD logs
- **Detailed summary** with statistics, URLs, and success rate
- **Complete tracking** via `article_events`

### 🔒 Reliability
- **State machine** with 4 stages (extraction → refine → media → publish)
- **Automatic retry** with fallback between Firecrawl keys
- **Idempotency** guaranteed by UNIQUE constraints
- **Versioned migrations** in Supabase

---

## 🛠️ Tech Stack

### Core
| Technology | Version | Usage |
|------------|---------|-------|
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white) | 5.7.2 | Primary language |
| ![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white) | 24.11.1 LTS | Runtime |
| ![tsx](https://img.shields.io/badge/-tsx-gray) | 4.19.2 | TypeScript execution |

### APIs & Integrations
| Service | SDK/Client | Usage |
|---------|-----------|-------|
| ![WordPress](https://img.shields.io/badge/-WordPress-21759B?logo=wordpress&logoColor=white) | REST API | Content publication |
| ![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?logo=supabase&logoColor=white) | @supabase/supabase-js | PostgreSQL database |
| ![Firecrawl](https://img.shields.io/badge/-Firecrawl-orange) | @mendable/firecrawl-js | Web scraping |
| ![Google AI](https://img.shields.io/badge/-Gemini-4285F4?logo=google&logoColor=white) | Vercel AI SDK | Content generation |

### Validation & Quality
| Tool | Usage |
|------|-------|
| Zod 3.23.8 | Schema validation |
| Vercel AI SDK | Structured outputs |
| Pino (logger) | Structured logging |

---

## 🏗️ Architecture

### Directory Structure

```
resolvejuizado/
├── src/
│   ├── index.ts           # Main orchestrator
│   ├── clients/           # Firecrawl, Supabase, WordPress
│   ├── pipeline/          # ingest.ts (discovery) + publish.ts (processing)
│   ├── ai/                # AI rewriting and SEO
│   ├── prompts/           # Structured prompts
│   └── config/            # Configurations and environment variables
├── supabase/              # Schema, migrations, functions
├── tests/                 # Unit and E2E tests
├── config/sites.json      # 24 Procon sites
└── .github/workflows/     # Automated CI/CD
```

### Data Flow

```
┌───────────────────────────────────────────────────────────────────┐
│                     PHASE 1: DISCOVERY                            │
│                                                                   │
│  ┌────────────┐      ┌────────────┐      ┌──────────────────┐     │
│  │ 24 Procon  │─────▶│ Firecrawl  │────▶│ Supabase         │     │
│  │ Sites      │      │ Pool       │      │ (pending)        │     │
│  └────────────┘      └────────────┘      │ UNIQUE(URL)      │     │
│                                          └──────────────────┘     │
└───────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                    PHASE 2: PROCESSING                            │
│                                                                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ Extract  │───▶│ Refine   │──▶│  Media   │───▶│ Publish  │    │
│  │Firecrawl │    │ (AI+SEO) │    │(3 imgs)  │    │(WordPress│     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│       │               │                │               │          │
│       ▼               ▼                ▼               ▼          │
│  [processing]    [processing]     [processing]    [processing]    │
│       │               │                │               │          │
│       ▼               ▼                ▼               ▼          │
│  [succeeded]     [succeeded]      [succeeded]     [published]     │
│     or              or               or              or           │
│  [failed]        [failed]         [failed]        [failed]        │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 📦 Installation

### Prerequisites

- **Node.js** 24.11.1 LTS ([nvm](https://github.com/nvm-sh/nvm) recommended)
- **npm** 10+ (included with Node.js)
- **Supabase** account (free tier)
- **WordPress** account with REST API access
- **Google AI Studio** API key (Gemini)
- **Firecrawl** API key

### Quick Installation

```bash
# 1. Clone the repository
git clone https://github.com/TechBeme/resolvejuizado.git
cd resolvejuizado

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your credentials (see Configuration section)

# 4. Add your Firecrawl keys to Supabase
# Run: INSERT INTO firecrawl_accounts (api_key, status) VALUES ('fc-xxx', 'active');

# 5. Validate configuration
npm run check-env

# 6. WordPress setup (one-time only)
npm run setup-categories

# 7. Run pipeline
npm run dev -- --skip-crawl --limit 5
```

---

## ⚙️ Configuration

### 1. Environment Variables (.env)

Copy `.env.example` to `.env` and fill in:

#### WordPress
```env
WORDPRESS_BASE_URL=https://your-blog.com
WORDPRESS_APP_USER=your-username
WORDPRESS_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

> 💡 **How to generate App Password:** WordPress Admin → Users → Profile → Application Passwords

#### Supabase
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

> 💡 **Where to find:** Supabase Dashboard → Settings → API / Database

#### Google AI (Gemini)
```env
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
AI_TEXT_MODEL=google/gemini-3-pro-preview
AI_IMAGE_MODEL=google/gemini-2.5-flash-image-preview
```

> 💡 **Get key:** [Google AI Studio](https://aistudio.google.com/apikey)

#### Others
```env
LOG_LEVEL=info  # debug | info | warn | error

# Optional: HTTP Proxy (to bypass geographic blocking)
HTTP_PROXY=http://brazilian-proxy.com:8080
HTTPS_PROXY=http://brazilian-proxy.com:8080
```

### 2. Firecrawl API Key

Configure your Firecrawl API key in `.env`:

```env
FIRECRAWL_API_KEY=fc-your-api-key-here
```

The system uses intelligent caching and automatic retry to optimize requests.

### 3. Supabase Database

Apply schema with Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

Or execute manually via Dashboard → SQL Editor: files in `supabase/tables/`, `supabase/function/`, `supabase/migrations/`

### 4. WordPress Setup

```bash
# Create categories automatically (one-time only)
npm run setup-categories
```

Creates 25 categories in WordPress, one for each state with configured Procon.

---

## 🚀 Usage

### Main Commands

```bash
# Complete pipeline (discovery + processing)
npm run dev

# Process pending articles only (skip discovery)
npm run dev -- --skip-crawl --limit 10

# Process specific sites
npm run dev -- --sites procon-df-gov-br-category-noticias,procon-es-gov-br --limit 5

# Publish directly to production (not as draft)
npm run dev -- --skip-crawl --limit 20 --publish

# View complete help
npm run dev -- --help
```

### Available Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--skip-crawl` | Skip Phase 1 (discovery), process only pending | `false` |
| `--limit N` | Limit processing to N articles | `50` |
| `--sites site1,site2` | Filter by specific site IDs | `all` |
| `--publish` | Publish directly (not as draft) | `false` (draft) |
| `--draft` | Publish as draft | `true` |
| `--throttle-ms N` | Delay between Firecrawl requests (ms) | `5000` |
| `--max-pages N` | Maximum pages per site in crawl | `200` |

### Usage Examples

**Quick test (5 articles, draft):**
```bash
npm run dev -- --skip-crawl --limit 5
```

**Process only Procon DF and ES:**
```bash
npm run dev -- --skip-crawl --sites procon-df-gov-br-category-noticias,procon-es-gov-br --limit 10 --publish
```

**Complete crawl of all sites + process 50 articles:**
```bash
npm run dev -- --limit 50 --publish
```

**Crawl only (without processing):**
```bash
# Run discovery phase, then cancel before Phase 2
npm run dev -- --limit 0
```

### Auxiliary Scripts

```bash
# Validate environment and credentials
npm run check-env

# Test IP detection and proxy
npm run test-ip

# Build for production
npm run build

# Run tests
npm test
```

---

## 🤖 CI/CD (GitHub Actions)

### Workflow: Daily Pipeline

**File:** `.github/workflows/daily-pipeline.yml`

**Frequency:** Daily at 6am UTC (3am Brasília)

**Manual Trigger:** Actions → Daily Pipeline → Run workflow

### Secrets Configuration

Add in GitHub: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Value | Where to Get |
|-------------|-------|--------------|
| `WORDPRESS_BASE_URL` | Your blog URL | WordPress |
| `WORDPRESS_APP_USER` | WordPress username | WordPress → Users |
| `WORDPRESS_APP_PASSWORD` | App Password | WordPress → Application Passwords |
| `SUPABASE_URL` | Project URL | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Supabase → Settings → API |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API Key | [Google AI Studio](https://aistudio.google.com/apikey) |
| `AI_TEXT_MODEL` | `google/gemini-3-pro-preview` | (Optional) |
| `AI_IMAGE_MODEL` | `google/gemini-2.5-flash-image-preview` | (Optional) |
| `HTTP_PROXY` | `http://proxy.com:8080` | (Optional) Brazilian proxy |
| `HTTPS_PROXY` | `http://proxy.com:8080` | (Optional) Brazilian proxy |



### User-Friendly Logs

The system automatically detects when running on GitHub Actions (`GITHUB_ACTIONS=true`) and switches to formatted logs:

- ✅ Visual emojis
- 📊 Progress [1/25]
- 🌐 Natural language
- 📰 Final summary with URLs
- ⚠️ Error details

**Log example:**
```
════════════════════════════════════════════════════════════════
  🏛️  RESOLVEJUIZADO - NEWS PIPELINE
════════════════════════════════════════════════════════════════

🌐 Running from: 123.45.6.789 • São Paulo, SP • Brazil
🔒 Using configured proxy: http://brazilian-proxy.com:8080

━━━ PHASE 1: DISCOVERING NEW NEWS ━━━

🔍 [1/25] Searching for news at: https://procon.df.gov.br
✅ Found 3 new articles

📊 EXECUTION SUMMARY
⏱️  Total time: 5min 32s
✅ Successfully published: 11
📰 Published articles:
   1. Procon DF inspects school supplies 2025
      🔗 WordPress: https://blog.resolvejuizado.com.br/?p=3824
```

### 🌍 Geographic Blocking & Proxy

The system **automatically detects your IP and location** at the beginning of each execution and displays in logs:

```
🌐 Running from: 123.45.6.789 • São Paulo, SP • Brazil (Example ISP)
```

Some Procon sites block foreign datacenter IPs (GitHub Actions runs in the US/Europe). The system has **automatic fallback to Firecrawl** which uses its own proxies, without needing additional configuration.

Optionally, configure a Brazilian proxy in `.env`:
```env
HTTP_PROXY=http://brazilian-proxy.com:8080
HTTPS_PROXY=http://brazilian-proxy.com:8080
```

In GitHub Actions, add `HTTP_PROXY` and `HTTPS_PROXY` as Secrets.

---

## 🗄️ Database

### Database Structure

The complete schema is in `supabase/tables/`. Main tables:

- **ingestion_runs** - Pipeline execution history
- **articles** - Articles with state machine (extraction → refine → media → publish)
- **article_media** - AI-generated images
- **article_events** - Event log for audit
- **wordpress_categories** - State → WordPress category mapping

Apply migrations via Supabase CLI (`supabase db push`) or Dashboard SQL Editor.

---

## 💻 Development

### Branch Structure

```
main              # Production (protected)
└── feature/*     # New features
```

### Development Workflow

```bash
# 1. Create branch
git checkout -b feature/feature-name

# 2. Develop with hot reload
npm run dev -- --skip-crawl --limit 3

# 3. Test
npm test

# 4. Build
npm run build

# 5. Commit
git add .
git commit -m "feat: feature description"

# 6. Push and PR
git push origin feature/feature-name
```

### Code Conventions

- **Strict TypeScript** (strict mode)
- **Indentation:** 2 spaces
- **Imports:** Relative paths with `.js` (ESM)
- **Naming:**
  - `camelCase`: variables, functions
  - `PascalCase`: classes, types
  - `SCREAMING_SNAKE_CASE`: constants

---

## 📝 License

**Proprietary License - All Rights Reserved**

Copyright © 2026 Rafael Vieira (TechBeme)

### ❌ Restrictions

- No commercial use
- No modifications or derivative works
- No distribution or sublicensing
- No reverse engineering

### ✅ Permitted Use

- View source code for educational purposes
- Run for personal, non-commercial use
- Fork for personal study only

### 📧 Commercial Licensing

For commercial use, contact: [contact@techbe.me](mailto:contact@techbe.me)

---

<div align="center">

**Developed by [Rafael Vieira](https://github.com/TechBeme)**

[![GitHub](https://img.shields.io/badge/GitHub-TechBeme-181717?logo=github)](https://github.com/TechBeme)
[![Fiverr](https://img.shields.io/badge/Fiverr-Tech__Be-1DBF73?logo=fiverr)](https://www.fiverr.com/tech_be)
[![Upwork](https://img.shields.io/badge/Upwork-Profile-14a800?logo=upwork)](https://www.upwork.com/freelancers/~01f0abcf70bbd95376)
[![Email](https://img.shields.io/badge/Email-contact@techbe.me-EA4335?logo=gmail)](mailto:contact@techbe.me)

</div>
