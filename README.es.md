<div align="center">

# 🏛️ ResolveJuizado Pipeline

**Sistema automatizado de agregación y publicación de noticias de los Procons brasileños**

[![Daily Pipeline](https://github.com/TechBeme/resolvejuizado/actions/workflows/daily-pipeline.yml/badge.svg)](https://github.com/TechBeme/resolvejuizado/actions/workflows/daily-pipeline.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24.11.1-green?logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)

[Características](#-características) • [Arquitectura](#-arquitectura) • [Instalación](#-instalación) • [Configuración](#-configuración) • [Uso](#-uso) • [CI/CD](#-cicd-github-actions)

**Idiomas:** [🇧🇷 Português](README.md) • [🇺🇸 English](README.en.md)

</div>

---

## 📋 Tabla de Contenidos

- [Visión General](#-visión-general)
- [Características](#-características)
- [Stack Tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [CI/CD](#-cicd-github-actions)
- [Base de Datos](#-base-de-datos)
- [Desarrollo](#-desarrollo)
- [Licencia](#-licencia)

---

## 🎯 Visión General

**ResolveJuizado Pipeline** es un sistema de nivel empresarial que automatiza la recopilación, procesamiento con IA y publicación de noticias de los **24 principales sitios Procon de Brasil**. El pipeline opera en dos fases distintas, garantizando escalabilidad y confiabilidad a través de procesamiento paralelo y recuperación automática de fallos.

### Pipeline de Dos Fases

**Fase 1 - Descubrimiento (Paralelo):**
- Rastreo simultáneo de 24 sitios Procon
- Detección de duplicados mediante URLs únicas
- Parada automática al encontrar URL existente
- Reintento automático con fallback

**Fase 2 - Procesamiento (Paralelo):**
- Extracción de contenido con Firecrawl
- Reescritura editorial con Google Gemini 3 Pro
- Optimización SEO automática (RankMath)
- Generación de 3 imágenes vía IA
- Publicación en WordPress con categorización por estado

---

## ✨ Características

### 🚀 Rendimiento y Escalabilidad
- **Procesamiento 100% paralelo** con `Promise.allSettled()`
- **Reintento automático** alternando entre claves de Firecrawl
- **Recuperación automática** de artículos huérfanos (timeout 10min)
- **Detección de duplicados** vía URL única en la base de datos

### 🤖 Inteligencia Artificial
- **Google Gemini 3 Pro** para reescritura editorial
- **Validación Zod** de schemas con reintento automático
- **SEO en 3 capas**: instrucción (175 chars) → truncamiento (195) → validación (200)
- **Generación de imágenes** contextualizadas vía IA
- **Optimización automática de imágenes** con Sharp (reduce 60-80% del tamaño)

### 📊 Observabilidad
- **Logs dual-mode**: JSON estructurado localmente y texto resumido en GitHub Actions
- **Emojis y lenguaje natural** en los logs del CI/CD
- **Resumen detallado** con estadísticas, URLs y tasa de éxito
- **Rastreo de etapas** vía `article_events`

### 🔒 Confiabilidad
- **State machine** con 4 etapas (extraction → refine → media → publish)
- **Reintento automático** con fallback entre claves Firecrawl
- **Idempotencia** garantizada por UNIQUE constraints
- **Migrations versionadas** en Supabase

---

## 🛠️ Stack Tecnológico

### Core
| Tecnología | Versión | Uso |
|------------|---------|-----|
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white) | 5.7.2 | Lenguaje principal |
| ![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white) | 24.11.1 LTS | Runtime |
| ![tsx](https://img.shields.io/badge/-tsx-gray) | 4.19.2 | Ejecución TypeScript |

### APIs & Integraciones
| Servicio | SDK/Cliente | Uso |
|---------|-------------|-----|
| ![WordPress](https://img.shields.io/badge/-WordPress-21759B?logo=wordpress&logoColor=white) | REST API | Publicación de contenido |
| ![Supabase](https://img.shields.io/badge/-Supabase-3ECF8E?logo=supabase&logoColor=white) | @supabase/supabase-js | Base de datos PostgreSQL |
| ![Firecrawl](https://img.shields.io/badge/-Firecrawl-orange) | @mendable/firecrawl-js | Web scraping |
| ![Google AI](https://img.shields.io/badge/-Gemini-4285F4?logo=google&logoColor=white) | Vercel AI SDK | Generación de contenido |

### Validación & Calidad
| Herramienta | Uso |
|------------|-----|
| Zod 3.23.8 | Validación de schemas |
| Vercel AI SDK | Salidas estructuradas |
| Pino (logger) | Logging estructurado |

---

## 🏗️ Arquitectura

### Estructura de Directorios

```
resolvejuizado/
├── src/
│   ├── index.ts           # Orquestador principal
│   ├── clients/           # Firecrawl, Supabase, WordPress
│   ├── pipeline/          # ingest.ts (discovery) + publish.ts (processing)
│   ├── ai/                # Reescritura con IA y SEO
│   ├── prompts/           # Prompts estructurados
│   └── config/            # Configuraciones y variables de entorno
├── supabase/              # Schema, migrations, functions
├── tests/                 # Tests unitarios y E2E
├── config/sites.json      # 24 sitios Procon
└── .github/workflows/     # CI/CD automatizado
```

### Flujo de Datos

```
┌───────────────────────────────────────────────────────────────────┐
│                     FASE 1: DESCUBRIMIENTO                        │
│                                                                   │
│  ┌────────────┐      ┌────────────┐      ┌──────────────────┐     │
│  │ 24 Sitios  │─────▶│ Firecrawl  │────▶│ Supabase         │     │
│  │ Procon     │      │ Pool       │      │ (pending)        │     │
│  └────────────┘      └────────────┘      │ UNIQUE(URL)      │     │
│                                          └──────────────────┘     │
└───────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                    FASE 2: PROCESAMIENTO                          │
│                                                                   │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │
│  │ Extraer  │───▶│ Refinar  │──▶│  Medios  │───▶│ Publicar │    │
│  │Firecrawl │    │ (IA+SEO) │    │(3 imgs)  │    │(WordPress│     │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘     │
│       │               │                │               │          │
│       ▼               ▼                ▼               ▼          │
│  [processing]    [processing]     [processing]    [processing]    │
│       │               │                │               │          │
│       ▼               ▼                ▼               ▼          │
│  [succeeded]     [succeeded]      [succeeded]     [published]     │
│      o               o                o               o           │
│  [failed]        [failed]         [failed]        [failed]        │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 📦 Instalación

### Requisitos Previos

- **Node.js** 24.11.1 LTS ([nvm](https://github.com/nvm-sh/nvm) recomendado)
- **npm** 10+ (incluido en Node.js)
- Cuenta **Supabase** (free tier)
- Cuenta **WordPress** con acceso REST API
- API key **Google AI Studio** (Gemini)
- API key **Firecrawl**

### Instalación Rápida

```bash
# 1. Clonar el repositorio
git clone https://github.com/TechBeme/resolvejuizado.git
cd resolvejuizado

# 2. Instalar dependencias
npm install

# 3. Configurar entorno
cp .env.example .env
# Edite .env con sus credenciales (vea sección Configuración)

# 4. Agregue sus claves Firecrawl en Supabase
# Ejecute: INSERT INTO firecrawl_accounts (api_key, status) VALUES ('fc-xxx', 'active');

# 5. Validar configuración
npm run check-env

# 6. Setup WordPress (solo 1 vez)
npm run setup-categories

# 7. Ejecutar pipeline
npm run dev -- --skip-crawl --limit 5
```

---

## ⚙️ Configuración

### 1. Variables de Entorno (.env)

Copie `.env.example` a `.env` y complete:

#### WordPress
```env
WORDPRESS_BASE_URL=https://your-blog.com
WORDPRESS_APP_USER=your-username
WORDPRESS_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
```

> 💡 **Cómo generar App Password:** WordPress Admin → Users → Profile → Application Passwords

#### Supabase
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

> 💡 **Dónde encontrar:** Supabase Dashboard → Settings → API / Database

#### Google AI (Gemini)
```env
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXX
AI_TEXT_MODEL=google/gemini-3-pro-preview
AI_IMAGE_MODEL=google/gemini-2.5-flash-image-preview
```

> 💡 **Obtener clave:** [Google AI Studio](https://aistudio.google.com/apikey)

#### Otros
```env
LOG_LEVEL=info  # debug | info | warn | error

# Opcional: Proxy HTTP (para sortear bloqueo geográfico)
HTTP_PROXY=http://proxy-brasileno.com:8080
HTTPS_PROXY=http://proxy-brasileno.com:8080
```

### 2. Firecrawl API Key

Configure su clave de API Firecrawl en `.env`:

```env
FIRECRAWL_API_KEY=fc-your-api-key-here
```

El sistema almacena respuestas en caché y reintenta automáticamente las solicitudes fallidas.

### 3. Base de Datos Supabase

Aplique el schema con Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref su-proyecto-ref
supabase db push
```

O ejecute manualmente vía Dashboard → SQL Editor: archivos en `supabase/tables/`, `supabase/function/`, `supabase/migrations/`

### 4. WordPress Setup

```bash
# Crear categorías automáticamente (1 vez solamente)
npm run setup-categories
```

Crea 25 categorías en WordPress, una para cada estado con Procon configurado.

---

## 🚀 Uso

### Comandos Principales

```bash
# Ejecutar discovery y processing
npm run dev

# Solo procesar artículos pending (salta discovery)
npm run dev -- --skip-crawl --limit 10

# Procesar sitios específicos
npm run dev -- --sites procon-df-gov-br-category-noticias,procon-es-gov-br --limit 5

# Publicar directo en producción (no como borrador)
npm run dev -- --skip-crawl --limit 20 --publish

# Ver opciones de la CLI
npm run dev -- --help
```

### Flags Disponibles

| Flag | Descripción | Por Defecto |
|------|-------------|-------------|
| `--skip-crawl` | Salta Fase 1 (discovery), procesa solo pending | `false` |
| `--limit N` | Limita procesamiento a N artículos | `50` |
| `--sites site1,site2` | Filtra por IDs de sitios específicos | `all` |
| `--publish` | Publica directo (no como draft) | `false` (draft) |
| `--draft` | Publica como borrador | `true` |
| `--throttle-ms N` | Delay entre requests Firecrawl (ms) | `5000` |
| `--max-pages N` | Máximo de páginas por sitio en el crawl | `200` |

### Ejemplos de Uso

**Test rápido (5 artículos, borrador):**
```bash
npm run dev -- --skip-crawl --limit 5
```

**Procesar solo Procon DF y ES:**
```bash
npm run dev -- --skip-crawl --sites procon-df-gov-br-category-noticias,procon-es-gov-br --limit 10 --publish
```

**Ejecutar crawl en los 24 sitios y procesar 50 artículos:**
```bash
npm run dev -- --limit 50 --publish
```

**Crawl solo (sin procesar):**
```bash
# Ejecute la fase discovery, luego cancele antes de la Fase 2
npm run dev -- --limit 0
```

### Scripts Auxiliares

```bash
# Validar entorno y credenciales
npm run check-env

# Probar detección de IP y proxy
npm run test-ip

# Build para producción
npm run build

# Ejecutar tests
npm test
```

---

## 🤖 CI/CD (GitHub Actions)

### Workflow: Daily Pipeline

**Archivo:** `.github/workflows/daily-pipeline.yml`

**Frecuencia:** Diariamente a las 6h UTC (3h Brasília)

**Trigger Manual:** Actions → Daily Pipeline → Run workflow

### Configuración de Secrets

Agregue en GitHub: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Valor | Dónde Obtener |
|-------------|-------|---------------|
| `WORDPRESS_BASE_URL` | URL de su blog | WordPress |
| `WORDPRESS_APP_USER` | Username WordPress | WordPress → Users |
| `WORDPRESS_APP_PASSWORD` | App Password | WordPress → Application Passwords |
| `SUPABASE_URL` | URL del proyecto | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Supabase → Settings → API |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API Key | [Google AI Studio](https://aistudio.google.com/apikey) |
| `AI_TEXT_MODEL` | `google/gemini-3-pro-preview` | (Opcional) |
| `AI_IMAGE_MODEL` | `google/gemini-2.5-flash-image-preview` | (Opcional) |
| `HTTP_PROXY` | `http://proxy.com:8080` | (Opcional) Proxy brasileño |
| `HTTPS_PROXY` | `http://proxy.com:8080` | (Opcional) Proxy brasileño |



### Logs de GitHub Actions

El sistema detecta automáticamente cuando está ejecutándose en GitHub Actions (`GITHUB_ACTIONS=true`) y cambia a logs formateados:

- ✅ Emojis visuales
- 📊 Progreso [1/25]
- 🌐 Lenguaje natural
- 📰 Resumen final con URLs
- ⚠️ Detalles de errores

**Ejemplo de log:**
```
════════════════════════════════════════════════════════════════
  🏛️  RESOLVEJUIZADO - PIPELINE DE NOTICIAS
════════════════════════════════════════════════════════════════

🌐 Ejecutando desde: 123.45.6.789 • São Paulo, SP • Brazil
🔒 Usando proxy configurado: http://proxy-brasileno.com:8080

━━━ FASE 1: DESCUBRIENDO NUEVAS NOTICIAS ━━━

🔍 [1/25] Buscando noticias en: https://procon.df.gov.br
✅ Encontradas 3 noticias nuevas

📊 RESUMEN DE LA EJECUCIÓN
⏱️  Tiempo total: 5min 32s
✅ Publicadas con éxito: 11
📰 Noticias publicadas:
   1. Procon DF fiscaliza material escolar 2025
      🔗 WordPress: https://blog.resolvejuizado.com.br/?p=3824
```

### 🌍 Bloqueo Geográfico & Proxy

El sistema **detecta automáticamente su IP y ubicación** al inicio de cada ejecución y muestra en los logs:

```
🌐 Ejecutando desde: 123.45.6.789 • São Paulo, SP • Brazil (Example ISP)
```

Algunos sitios Procon bloquean IPs de datacenters extranjeros (GitHub Actions se ejecuta en EE.UU./Europa). El sistema posee **fallback automático a Firecrawl** que usa proxies propios, sin necesidad de configuración adicional.

Opcionalmente, configure un proxy brasileño en `.env`:
```env
HTTP_PROXY=http://proxy-brasileno.com:8080
HTTPS_PROXY=http://proxy-brasileno.com:8080
```

En GitHub Actions, agregue `HTTP_PROXY` y `HTTPS_PROXY` como Secrets.

---

## 🗄️ Base de Datos

### Estructura de la Base de Datos

Los archivos del schema están en `supabase/tables/`. Principales tablas:

- **ingestion_runs** - Historial de ejecuciones del pipeline
- **articles** - Artículos con state machine (extraction → refine → media → publish)
- **article_media** - Imágenes generadas por la IA
- **article_events** - Log de eventos para auditoría
- **wordpress_categories** - Mapa estado → categoría WordPress

Aplique migrations vía Supabase CLI (`supabase db push`) o Dashboard SQL Editor.

---

## 💻 Desarrollo

### Estructura de Branch

```
main              # Producción (protegida)
└── feature/*     # Nuevas features
```

### Workflow de Desarrollo

```bash
# 1. Crear branch
git checkout -b feature/nombre-feature

# 2. Desarrollar con hot reload
npm run dev -- --skip-crawl --limit 3

# 3. Probar
npm test

# 4. Build
npm run build

# 5. Commit
git add .
git commit -m "feat: descripción de la feature"

# 6. Push y PR
git push origin feature/nombre-feature
```

### Convenciones de Código

- **TypeScript estricto** (strict mode)
- **Indentación:** 2 espacios
- **Imports:** Rutas relativas con `.js` (ESM)
- **Naming:**
  - `camelCase`: variables, funciones
  - `PascalCase`: clases, tipos
  - `SCREAMING_SNAKE_CASE`: constantes

---

## 📝 Licencia

**Licencia Propietaria - Todos los Derechos Reservados**

Copyright © 2026 Rafael Vieira (TechBeme)

### ❌ Restricciones

- Prohibido uso comercial
- Prohibidas modificaciones o trabajos derivados
- Prohibida distribución o sublicenciamiento
- Prohibida ingeniería inversa

### ✅ Uso Permitido

- Ver código fuente con fines educativos
- Ejecutar para uso personal y no comercial
- Fork para estudio personal solamente

### 📧 Licenciamiento Comercial

Para uso comercial, contactar: [contact@techbe.me](mailto:contact@techbe.me)

---

<div align="center">

**Desarrollado por [Rafael Vieira](https://github.com/TechBeme)**

[![GitHub](https://img.shields.io/badge/GitHub-TechBeme-181717?logo=github)](https://github.com/TechBeme)
[![Fiverr](https://img.shields.io/badge/Fiverr-Tech__Be-1DBF73?logo=fiverr)](https://www.fiverr.com/tech_be)
[![Upwork](https://img.shields.io/badge/Upwork-Profile-14a800?logo=upwork)](https://www.upwork.com/freelancers/~01f0abcf70bbd95376)
[![Email](https://img.shields.io/badge/Email-contact@techbe.me-EA4335?logo=gmail)](mailto:contact@techbe.me)

</div>
