# 📂 Snippets PHP para WordPress

Esta pasta contém snippets PHP que devem ser instalados no WordPress via plugin **Code Snippets**.

## 📋 Arquivos Disponíveis

### `snippet-painel-configuracoes.php`
**Painel de Configurações - Notícias Automáticas**

Cria uma interface completa no WordPress Admin para configurar:
- 🤖 Modelos de IA (texto e imagem)
- 📝 Comandos personalizados para a IA (reescrita e revisão)
- ❓ Documentação e ajuda

**Como instalar:**
1. Vá em WordPress → **Snippets** → **Add New**
2. Cole o conteúdo do arquivo
3. Título: **"Painel - Notícias Automáticas"**
4. Ative o snippet
5. Acesse WordPress → **Notícias Automáticas**

**API REST exposta:**
- Endpoint: `/wp-json/resolvejuizado/v1/config`
- Retorna: modelos de IA e prompts configurados

---

### `snippet-rankmath-rest-api.php`
**Expõe metas do Rank Math na REST API**

Permite que o código TypeScript envie dados de SEO (title, description, focus keyword) diretamente via API do WordPress.

**Como instalar:**
1. Vá em WordPress → **Snippets** → **Add New**
2. Cole o conteúdo do arquivo
3. Título: **"Rank Math - REST API Meta Fields"**
4. Ative o snippet

**Metas expostas:**
- `rank_math_title`
- `rank_math_description`
- `rank_math_focus_keyword`

---

## 🔐 Segurança

⚠️ **Importante:** Estes snippets **NÃO** expõem dados sensíveis (API keys, credenciais).

Configurações sensíveis permanecem no arquivo `.env` do servidor:
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WORDPRESS_APP_PASSWORD`

---

## 🛠️ Desenvolvimento

Para modificar os snippets:
1. Edite os arquivos nesta pasta
2. Commit no Git
3. Atualize manualmente no WordPress Admin

Não há deploy automático destes snippets.
