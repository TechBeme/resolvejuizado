<div align="center">

# 🏛️ ResolveJuizado Pipeline

**Sistema automatizado de agregação e publicação de notícias dos Procons brasileiros**

[![Daily Pipeline](https://github.com/TechBeme/resolvejuizado/actions/workflows/daily-pipeline.yml/badge.svg)](https://github.com/TechBeme/resolvejuizado/actions/workflows/daily-pipeline.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.11.1-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)

[Características](#-características) • [Arquitetura](#-arquitetura) • [Instalação](#-instalação) • [Configuração](#-configuração) • [Uso](#-uso) • [CI/CD](#-cicd-github-actions)

**Idiomas:** [🇺🇸 English](README.en.md) • [🇪🇸 Español](README.es.md)

</div>

---

## 📋 Sumário

- [Visão Geral](#-visão-geral)
- [Sobre o Desenvolvedor](#-sobre-o-desenvolvedor)
- [Características](#-características)
- [Stack Tecnológica](#-stack-tecnológica)
- [Arquitetura](#-arquitetura)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [CI/CD](#-cicd-github-actions)
- [Banco de Dados](#-banco-de-dados)
- [Desenvolvimento](#-desenvolvimento)
- [Licença](#-licença)

---

## 🎯 Visão Geral

O **ResolveJuizado Pipeline** é um sistema de nível empresarial que automatiza a coleta, processamento com IA e publicação de notícias dos **24 principais sites Procon do Brasil**. O pipeline opera em duas fases distintas, garantindo escalabilidade e confiabilidade através de processamento paralelo e recuperação automática de falhas.

### Pipeline de Duas Fases

**Fase 1 - Descoberta (Paralelo):**
- Crawl simultâneo de 24 sites Procon
- Detecção inteligente de duplicatas
- Parada automática ao encontrar URL existente
- Retry automático com fallback

**Fase 2 - Processamento (Paralelo):**
- Extração de conteúdo com Firecrawl
- Reescrita editorial com Google Gemini 3 Pro
- Otimização SEO automática (RankMath)
- Geração de 3 imagens via IA
- Publicação WordPress com categorização por estado

---

## 👨‍💻 Sobre o Desenvolvedor

<div align="center">

**Desenvolvido por Rafael Vieira (TechBeme)**

[![GitHub](https://img.shields.io/badge/GitHub-TechBeme-181717?logo=github)](https://github.com/TechBeme)
[![Fiverr](https://img.shields.io/badge/Fiverr-Tech__Be-1DBF73?logo=fiverr)](https://www.fiverr.com/tech_be)
[![Upwork](https://img.shields.io/badge/Upwork-Profile-14a800?logo=upwork)](https://www.upwork.com/freelancers/~01f0abcf70bbd95376)
[![Email](https://img.shields.io/badge/Email-contact@techbe.me-EA4335?logo=gmail)](mailto:contact@techbe.me)

**Desenvolvedor Full-Stack & Especialista em Automação com IA**

Especializado em **web scraping**, **sistemas de automação**, **aplicações web modernas** e **integrações com IA**.

### 💼 Expertise Principal

- 🔍 Web Scraping & Extração de Dados
- ⚡ Automação de Processos & Workflows
- 💻 Desenvolvimento Full-Stack (Next.js, React, Python, TypeScript)
- 🤖 Integrações com IA (OpenAI, Anthropic, sistemas RAG)
- 📊 Design & Otimização de Bancos de Dados
- 🎨 Desenvolvimento de UI/UX Modernas

### 🌍 Idiomas

🇺🇸 **English** • 🇧🇷 **Português** • 🇪🇸 **Español**

### 📬 Contato

**Email**: [contact@techbe.me](mailto:contact@techbe.me)

</div>

---

## ✨ Características

### 🚀 Performance e Escalabilidade
- **Processamento 100% paralelo** com `Promise.allSettled()`
- **Retry automático** com fallback inteligente
- **Recuperação automática** de artigos órfãos (timeout 10min)
- **Detecção de duplicatas** via URL única no banco

### 🤖 Inteligência Artificial
- **Google Gemini 3 Pro** para reescrita editorial
- **Validação Zod** de schemas com retry automático
- **SEO em 3 camadas**: instrução (175 chars) → truncamento (195) → validação (200)
- **Geração de imagens** contextualizadas via IA
- **Otimização automática de imagens** com Sharp (reduz 60-80% do tamanho)

### 📊 Observabilidade
- **Logs dual-mode**: JSON estruturado (local) + user-friendly (GitHub Actions)
- **Emojis e linguagem natural** nos logs do CI/CD
- **Resumo detalhado** com estatísticas, URLs e taxa de sucesso
- **Rastreamento completo** via `article_events`

### 🔒 Confiabilidade
- **State machine** com 4 estágios (extraction → refine → media → publish)
- **Retry automático** com fallback entre chaves Firecrawl
- **Idempotência** garantida por UNIQUE constraints
- **Migrations versionadas** no Supabase

---

## 🛠️ Stack Tecnológica

### Core
| Tecnologia | Versão | Uso |
|------------|--------|-----|
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white) | 5.7.2 | Linguagem principal |
| ![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white) | 24.11.1 LTS | Runtime |
| ![tsx](https://img.shields.io/badge/-tsx-gray) | 4.19.2 | Execução TypeScript |

### APIs & Integrações
| Serviço | SDK/Cliente | Uso |
|---------|-------------|-----|
| ![WordPress](https://img.shields.io/badge/-WordPress-21759B?logo=wordpress&logoColor=white) | REST API | Publicação de conteúdo |
| ![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?logo=supabase&logoColor=white) | @supabase/supabase-js | Banco de dados PostgreSQL |
| ![Firecrawl](https://img.shields.io/badge/-Firecrawl-orange) | @mendable/firecrawl-js | Web scraping |
| ![Google AI](https://img.shields.io/badge/-Gemini-4285F4?logo=google&logoColor=white) | Vercel AI SDK | Geração de conteúdo |

### Validação & Qualidade
| Ferramenta | Uso |
|------------|-----|
| Zod 3.23.8 | Validação de schemas |
| Vercel AI SDK | Saídas estruturadas |
| Pino (logger) | Logging estruturado |

---

## 🏗️ Arquitetura

### Estrutura de Diretórios

```
resolvejuizado/
├── src/
│   ├── index.ts           # Orchestrator principal
│   ├── clients/           # Firecrawl, Supabase, WordPress
│   ├── pipeline/          # ingest.ts (discovery) + publish.ts (processing)
│   ├── ai/                # Reescrita com IA e SEO
│   ├── prompts/           # Prompts estruturados
│   └── config/            # Configurações e variáveis de ambiente
├── supabase/              # Schema, migrations, functions
├── tests/                 # Testes unitários e E2E
├── config/sites.json      # 24 sites Procon
└── .github/workflows/     # CI/CD automatizado
```

### Fluxo de Dados

```
┌───────────────────────────────────────────────────────────────────┐
│                     FASE 1: DESCOBERTA                            │
│                                                                   │
│  ┌────────────┐      ┌────────────┐      ┌──────────────────┐     │
│  │ 24 Sites   │─────▶│ Firecrawl  │────▶│ Supabase         │     │
│  │ Procon     │      │ Pool       │      │ (pending)        │     │
│  └────────────┘      └────────────┘      │ UNIQUE(URL)      │     │
│                                          └──────────────────┘     │
└───────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                    FASE 2: PROCESSAMENTO                          │
│                                                                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ Extrair  │───▶│ Refinar  │──▶│  Mídia   │───▶│ Publicar │    │
│  │Firecrawl │    │ (IA+SEO) │    │(3 imgs)  │    │(WordPress│     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│       │               │                │               │          │
│       ▼               ▼                ▼               ▼          │
│  [processing]    [processing]     [processing]    [processing]    │
│       │               │                │               │          │
│       ▼               ▼                ▼               ▼          │
│  [succeeded]     [succeeded]      [succeeded]     [published]     │
│     ou              ou               ou              ou           │
│  [failed]        [failed]         [failed]        [failed]        │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 📦 Instalação

### Pré-requisitos

- **Node.js** 24.11.1 LTS ([nvm](https://github.com/nvm-sh/nvm) recomendado)
- **npm** 10+ (incluso no Node.js)
- Conta **Supabase** (free tier)
- Conta **WordPress** com acesso REST API
- API key **Google AI Studio** (Gemini)
- API key **Firecrawl**

### Instalação Rápida

```bash
# 1. Clone o repositório
git clone https://github.com/TechBeme/resolvejuizado.git
cd resolvejuizado

# 2. Instale dependências
npm install

# 3. Configure ambiente
cp .env.example .env
# Edite .env com suas credenciais (veja seção Configuração)

# 4. Adicione suas chaves Firecrawl no Supabase
# Execute: INSERT INTO firecrawl_accounts (api_key, status) VALUES ('fc-xxx', 'active');

# 5. Valide configuração
npm run check-env

# 6. Setup WordPress (apenas 1x)
npm run setup-categories

# 7. Execute pipeline
npm run dev -- --skip-crawl --limit 5
```

---

## ⚙️ Configuração

### 1. Variáveis de Ambiente (.env)

Copie `.env.example` para `.env` e preencha:

#### WordPress
```env
WORDPRESS_BASE_URL=https://your-blog.com
WORDPRESS_APP_USER=your-username
WORDPRESS_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

> 💡 **Como gerar App Password:** WordPress Admin → Users → Profile → Application Passwords

#### Supabase
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

> 💡 **Onde encontrar:** Supabase Dashboard → Settings → API / Database

#### Google AI (Gemini)
```env
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
AI_TEXT_MODEL=google/gemini-3-pro-preview
AI_IMAGE_MODEL=google/gemini-2.5-flash-image-preview
```

> 💡 **Obter chave:** [Google AI Studio](https://aistudio.google.com/apikey)

#### Outros
```env
LOG_LEVEL=info  # debug | info | warn | error

# Opcional: Proxy HTTP (para contornar bloqueio geográfico)
HTTP_PROXY=http://proxy-brasileiro.com:8080
HTTPS_PROXY=http://proxy-brasileiro.com:8080
```

### 2. Firecrawl API Key

Configure sua chave da API Firecrawl no `.env`:

```env
FIRECRAWL_API_KEY=fc-your-api-key-here
```

O sistema usa cache inteligente e retry automático para otimizar as requisições.

### 3. Banco de Dados Supabase

Aplique o schema com Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref seu-projeto-ref
supabase db push
```

Ou execute manualmente via Dashboard → SQL Editor: arquivos em `supabase/tables/`, `supabase/function/`, `supabase/migrations/`

### 4. WordPress Setup

```bash
# Criar categorias automaticamente (1x apenas)
npm run setup-categories
```

Cria 25 categorias no WordPress, uma para cada estado com Procon configurado.

---

## 🚀 Uso

### Comandos Principais

```bash
# Pipeline completo (discovery + processing)
npm run dev

# Apenas processar artigos pending (pula discovery)
npm run dev -- --skip-crawl --limit 10

# Processar sites específicos
npm run dev -- --sites procon-df-gov-br-category-noticias,procon-es-gov-br --limit 5

# Publicar direto em produção (não como rascunho)
npm run dev -- --skip-crawl --limit 20 --publish

# Ver ajuda completa
npm run dev -- --help
```

### Flags Disponíveis

| Flag | Descrição | Padrão |
|------|-----------|--------|
| `--skip-crawl` | Pula Fase 1 (discovery), processa apenas pending | `false` |
| `--limit N` | Limita processamento a N artigos | `50` |
| `--sites site1,site2` | Filtra por IDs de sites específicos | `all` |
| `--publish` | Publica direto (não como draft) | `false` (draft) |
| `--draft` | Publica como rascunho | `true` |
| `--throttle-ms N` | Delay entre requests Firecrawl (ms) | `5000` |
| `--max-pages N` | Máximo de páginas por site no crawl | `200` |

### Exemplos de Uso

**Teste rápido (5 artigos, rascunho):**
```bash
npm run dev -- --skip-crawl --limit 5
```

**Processar apenas Procon DF e ES:**
```bash
npm run dev -- --skip-crawl --sites procon-df-gov-br-category-noticias,procon-es-gov-br --limit 10 --publish
```

**Crawl completo de todos os sites + processar 50 artigos:**
```bash
npm run dev -- --limit 50 --publish
```

**Crawl apenas (sem processar):**
```bash
# Execute discovery phase, depois cancele antes da Phase 2
npm run dev -- --limit 0
```

### Scripts Auxiliares

```bash
# Validar ambiente e credenciais
npm run check-env

# Testar detecção de IP e proxy
npm run test-ip

# Build para produção
npm run build

# Executar testes
npm test
```

---

## 🤖 CI/CD (GitHub Actions)

### Workflow: Daily Pipeline

**Arquivo:** `.github/workflows/daily-pipeline.yml`

**Frequência:** Diariamente às 6h UTC (3h Brasília)

**Trigger Manual:** Actions → Daily Pipeline → Run workflow

### Configuração de Secrets

Adicione no GitHub: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Valor | Onde Obter |
|-------------|-------|------------|
| `WORDPRESS_BASE_URL` | URL do seu blog | WordPress |
| `WORDPRESS_APP_USER` | Username WordPress | WordPress → Users |
| `WORDPRESS_APP_PASSWORD` | App Password | WordPress → Application Passwords |
| `SUPABASE_URL` | URL do projeto | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Supabase → Settings → API |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API Key | [Google AI Studio](https://aistudio.google.com/apikey) |
| `AI_TEXT_MODEL` | `google/gemini-3-pro-preview` | (Opcional) |
| `AI_IMAGE_MODEL` | `google/gemini-2.5-flash-image-preview` | (Opcional) |
| `HTTP_PROXY` | `http://proxy.com:8080` | (Opcional) Proxy brasileiro |
| `HTTPS_PROXY` | `http://proxy.com:8080` | (Opcional) Proxy brasileiro |



### Logs User-Friendly

O sistema detecta automaticamente quando está rodando no GitHub Actions (`GITHUB_ACTIONS=true`) e muda para logs formatados:

- ✅ Emojis visuais
- 📊 Progresso [1/25]
- 🌐 Linguagem natural
- 📰 Resumo final com URLs
- ⚠️ Detalhes de erros

**Exemplo de log:**
```
════════════════════════════════════════════════════════════════
  🏛️  RESOLVEJUIZADO - PIPELINE DE NOTÍCIAS
════════════════════════════════════════════════════════════════

🌐 Executando a partir de: 123.45.6.789 • São Paulo, SP • Brazil
🔒 Usando proxy configurado: http://proxy-brasileiro.com:8080

━━━ FASE 1: DESCOBRINDO NOVAS NOTÍCIAS ━━━

🔍 [1/25] Buscando notícias em: https://procon.df.gov.br
✅ Encontradas 3 notícias novas

📊 RESUMO DA EXECUÇÃO
⏱️  Tempo total: 5min 32s
✅ Publicadas com sucesso: 11
📰 Notícias publicadas:
   1. Procon DF fiscaliza material escolar 2025
      🔗 WordPress: https://blog.resolvejuizado.com.br/?p=3824
```

### 🌍 Bloqueio Geográfico & Proxy

O sistema **detecta automaticamente seu IP e localização** no início de cada execução e mostra nos logs:

```
🌐 Executando a partir de: 123.45.6.789 • São Paulo, SP • Brazil (Example ISP)
```

Alguns sites Procon bloqueiam IPs de datacenters estrangeiros (GitHub Actions roda nos EUA/Europa). O sistema possui **fallback automático para Firecrawl** que usa proxies próprios, sem necessidade de configuração adicional.

Opcionalmente, configure um proxy brasileiro no `.env`:
```env
HTTP_PROXY=http://proxy-brasileiro.com:8080
HTTPS_PROXY=http://proxy-brasileiro.com:8080
```

No GitHub Actions, adicione `HTTP_PROXY` e `HTTPS_PROXY` como Secrets.

---

## 🗄️ Banco de Dados

### Estrutura do Banco

O schema completo está em `supabase/tables/`. Principais tabelas:

- **ingestion_runs** - Histórico de execuções do pipeline
- **articles** - Artigos com state machine (extraction → refine → media → publish)
- **article_media** - Imagens geradas pela IA
- **article_events** - Log de eventos para auditoria
- **wordpress_categories** - Mapa estado → categoria WordPress

Aplique migrations via Supabase CLI (`supabase db push`) ou Dashboard SQL Editor.

---

## 💻 Desenvolvimento

### Estrutura de Branch

```
main              # Produção (protegida)
└── feature/*     # Features novas
```

### Workflow de Desenvolvimento

```bash
# 1. Criar branch
git checkout -b feature/nome-feature

# 2. Desenvolver com hot reload
npm run dev -- --skip-crawl --limit 3

# 3. Testar
npm test

# 4. Build
npm run build

# 5. Commit
git add .
git commit -m "feat: descrição da feature"

# 6. Push e PR
git push origin feature/nome-feature
```

### Convenções de Código

- **TypeScript estrito** (strict mode)
- **Indentação:** 2 espaços
- **Imports:** Caminhos relativos com `.js` (ESM)
- **Naming:**
  - `camelCase`: variáveis, funções
  - `PascalCase`: classes, tipos
  - `SCREAMING_SNAKE_CASE`: constantes

---

## 📝 Licença

**Licença Proprietária - Todos os Direitos Reservados**

Copyright © 2026 Rafael Vieira (TechBeme)

### ❌ Restrições

- Proibido uso comercial
- Proibido modificações ou trabalhos derivados
- Proibido distribuição ou sublicenciamento
- Proibida engenharia reversa

### ✅ Uso Permitido

- Visualizar código-fonte para fins educacionais
- Executar para uso pessoal e não comercial
- Fork para estudo pessoal apenas

### 📧 Licenciamento Comercial

Para uso comercial, entre em contato: [contact@techbe.me](mailto:contact@techbe.me)

---

<div align="center">

**Desenvolvido por [Rafael Vieira](https://github.com/TechBeme)**

[![GitHub](https://img.shields.io/badge/GitHub-TechBeme-181717?logo=github)](https://github.com/TechBeme)
[![Fiverr](https://img.shields.io/badge/Fiverr-Tech__Be-1DBF73?logo=fiverr)](https://www.fiverr.com/tech_be)
[![Upwork](https://img.shields.io/badge/Upwork-Profile-14a800?logo=upwork)](https://www.upwork.com/freelancers/~01f0abcf70bbd95376)
[![Email](https://img.shields.io/badge/Email-contact@techbe.me-EA4335?logo=gmail)](mailto:contact@techbe.me)

</div>
