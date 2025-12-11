<?php
/**
 * Painel de Configurações - Extração Automática de Notícias
 * 
 * INSTALAÇÃO:
 * 1. Instale o plugin "Code Snippets" (recomendado) OU adicione no functions.php do tema
 * 2. Cole este código completo
 * 3. Ative o snippet (se usar Code Snippets)
 * 4. Acesse WordPress Admin → "Notícias Automáticas" para configurar
 * 
 * COMO FUNCIONA:
 * - Cria interface completa para configurar a extração e publicação automática de notícias
 * - Permite escolher modelos de IA para geração de textos e imagens
 * - Permite customizar o comportamento da IA editando os prompts
 * - Expõe configurações via REST API em /wp-json/resolvejuizado/v1/config
 * - O sistema busca automaticamente as configurações do WordPress
 * - Se não configurado, usa valores padrão do servidor
 * - NÃO REQUER plugins adicionais (WordPress nativo)
 */

// Criar página de configurações do Pipeline de Notícias
add_action('admin_menu', function() {
    add_menu_page(
        'Notícias Automáticas - Configurações',
        'Notícias Automáticas',
        'manage_options',
        'noticias-automaticas-settings',
        'render_pipeline_settings_page',
        'dashicons-rss',
        30
    );
});

function render_pipeline_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    
    // Salvar dados se o formulário foi submetido
    if (isset($_POST['save_pipeline_config']) && check_admin_referer('save_pipeline_config')) {
        update_option('rj_ai_text_model', sanitize_text_field($_POST['ai_text_model']));
        update_option('rj_ai_image_model', sanitize_text_field($_POST['ai_image_model']));
        update_option('rj_news_rewrite_prompt', wp_unslash($_POST['news_rewrite_prompt']));
        update_option('rj_news_reviewer_prompt', wp_unslash($_POST['news_reviewer_prompt']));
        echo '<div class="notice notice-success is-dismissible"><p><strong>✅ Configurações salvas com sucesso!</strong></p></div>';
    }
    
    // Valores padrão (conforme .env do servidor)
    $defaults = [
        'ai_text_model' => 'google/gemini-3-pro-preview',
        'ai_image_model' => 'google/gemini-2.5-flash-image-preview',
    ];
    
    $ai_text_model = get_option('rj_ai_text_model', $defaults['ai_text_model']);
    $ai_image_model = get_option('rj_ai_image_model', $defaults['ai_image_model']);
    $news_rewrite = get_option('rj_news_rewrite_prompt', '');
    $news_reviewer = get_option('rj_news_reviewer_prompt', '');
    ?>
    <div class="wrap">
        <h1>⚙️ Configurações - Extração Automática de Notícias</h1>
        <p class="description" style="font-size:14px;margin-bottom:30px;">
            Configure os modelos de Inteligência Artificial e os comandos (prompts) que controlam como as notícias são reescritas e publicadas automaticamente.
        </p>
        
        <form method="post">
            <?php wp_nonce_field('save_pipeline_config'); ?>
            
            <!-- Tabs -->
            <h2 class="nav-tab-wrapper">
                <a href="#tab-models" class="nav-tab nav-tab-active" onclick="switchTab(event, 'tab-models')">🤖 Modelos de IA</a>
                <a href="#tab-prompts" class="nav-tab" onclick="switchTab(event, 'tab-prompts')">📝 Prompts</a>
                <a href="#tab-help" class="nav-tab" onclick="switchTab(event, 'tab-help')">❓ Ajuda</a>
            </h2>
            
            <!-- Tab: Modelos de IA -->
            <div id="tab-models" class="tab-content" style="display:block;">
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <label for="ai_text_model">Modelo de Texto (IA)</label>
                            </th>
                            <td>
                                <input type="text" 
                                       name="ai_text_model" 
                                       id="ai_text_model" 
                                       value="<?php echo esc_attr($ai_text_model); ?>" 
                                       class="regular-text"
                                       placeholder="<?php echo esc_attr($defaults['ai_text_model']); ?>">
                                <p class="description">
                                    Modelo usado para gerar e revisar artigos. Exemplos:<br>
                                    • <code>google/gemini-3-pro-preview</code> (padrão - mais caro e mais robusto)<br>
                                    • <code>google/gemini-2.5-flash</code> (mais rápido e econômico)<br>
                                    • <code>openai/gpt-5.1</code> (OpenAI - mais recente)
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="ai_image_model">Modelo de Imagem (IA)</label>
                            </th>
                            <td>
                                <input type="text" 
                                       name="ai_image_model" 
                                       id="ai_image_model" 
                                       value="<?php echo esc_attr($ai_image_model); ?>" 
                                       class="regular-text"
                                       placeholder="<?php echo esc_attr($defaults['ai_image_model']); ?>">
                                <p class="description">
                                    Modelo usado para gerar as imagens dos artigos. Exemplos:<br>
                                    • <code>google/gemini-2.5-flash-image</code> (padrão - Gemini)<br>
                                </p>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Tab: Prompts -->
            <div id="tab-prompts" class="tab-content" style="display:none;">
                <h2>📝 Comando para Reescrita de Notícias</h2>
                <p class="description">
                    Instruções que a IA segue para transformar notícias originais em artigos otimizados para seu blog.<br>
                    <strong>Variáveis disponíveis:</strong> <code>{{sourceUrl}}</code>, <code>{{content}}</code>, <code>{{today}}</code>, <code>{{currentYear}}</code>
                </p>
                <textarea name="news_rewrite_prompt" 
                          rows="20" 
                          style="width:100%;font-family:Consolas,Monaco,monospace;font-size:12px;border:1px solid #ccc;padding:10px;"
                          placeholder="Deixe em branco para usar o prompt padrão..."><?php echo esc_textarea($news_rewrite); ?></textarea>
                
                <h2 style="margin-top:40px;">🔍 Comando para Revisão de Artigos</h2>
                <p class="description">
                    Instruções que a IA segue para revisar e corrigir os artigos automaticamente (SEO, gramática, etc).<br>
                    <strong>Variáveis disponíveis:</strong> <code>{{sourceUrl}}</code>, <code>{{today}}</code>, <code>{{currentYear}}</code>, 
                    <code>{{title}}</code>, <code>{{bodyMarkdown}}</code>, <code>{{focusKeyword}}</code>, <code>{{seoTitle}}</code>, 
                    <code>{{seoDescription}}</code>, <code>{{slug}}</code>, <code>{{faqs}}</code>, <code>{{imagePrompts}}</code>, <code>{{validationReport}}</code>
                </p>
                <textarea name="news_reviewer_prompt" 
                          rows="20" 
                          style="width:100%;font-family:Consolas,Monaco,monospace;font-size:12px;border:1px solid #ccc;padding:10px;"
                          placeholder="Deixe em branco para usar o prompt padrão..."><?php echo esc_textarea($news_reviewer); ?></textarea>
            </div>
            
            <!-- Tab: Ajuda -->
            <div id="tab-help" class="tab-content" style="display:none;">
                <h2>❓ Como Usar</h2>
                <div style="background:#f9f9f9;border-left:4px solid #0073aa;padding:20px;margin:20px 0;">
                    <h3>🤖 Modelos de IA</h3>
                    <p>Configure qual modelo de IA usar para gerar textos e imagens. O sistema suporta:</p>
                    <ul style="list-style:disc;margin-left:20px;">
                        <li><strong>Google Gemini</strong> - Prefixo: <code>google/</code></li>
                        <li><strong>OpenAI GPT</strong> - Prefixo: <code>openai/</code></li>
                    </ul>
                    <p>
                        📋 <strong>Lista completa de modelos disponíveis:</strong> 
                        <a href="https://vercel.com/ai-gateway/models" target="_blank" style="color:#0073aa;text-decoration:none;">
                            vercel.com/ai-gateway/models ↗
                        </a>
                    </p>
                    <p><strong>⚠️ Importante:</strong> As API keys dos modelos devem estar configuradas no servidor (.env).</p>
                </div>
                
                <div style="background:#fff9e6;border-left:4px solid #f0b429;padding:20px;margin:20px 0;">
                    <h3>📝 Prompts Customizados</h3>
                    <p>Você pode editar os prompts para mudar o comportamento da IA:</p>
                    <ul style="list-style:disc;margin-left:20px;">
                        <li><strong>Prompt de Reescrita:</strong> Define como a IA transforma notícias brutas em artigos</li>
                        <li><strong>Prompt de Revisão:</strong> Define como a IA valida e corrige os artigos gerados</li>
                    </ul>
                    <p><strong>💡 Dica:</strong> Use as variáveis <code>{{variavel}}</code> para inserir dados dinâmicos nos prompts.</p>
                </div>
                
                <div style="background:#f0f0f0;border-left:4px solid #666;padding:20px;margin:20px 0;">
                    <h3>🔗 API REST</h3>
                    <p>As configurações ficam disponíveis via REST API para o pipeline TypeScript:</p>
                    <p><code>GET <?php echo home_url('/wp-json/resolvejuizado/v1/config'); ?></code></p>
                </div>
            </div>
            
            <?php submit_button('💾 Salvar Configurações', 'primary large', 'save_pipeline_config'); ?>
        </form>
    </div>
    
    <style>
        .tab-content { margin-top: 20px; }
        .nav-tab-wrapper { margin-bottom: 0; }
    </style>
    
    <script>
        function switchTab(event, tabId) {
            event.preventDefault();
            
            // Esconder todas as tabs
            document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
            document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('nav-tab-active'));
            
            // Mostrar tab selecionada
            document.getElementById(tabId).style.display = 'block';
            event.target.classList.add('nav-tab-active');
        }
    </script>
    <?php
}

// Expor configurações via REST API para o código TypeScript consumir
add_action('rest_api_init', function() {
    register_rest_route('resolvejuizado/v1', '/config', [
        'methods' => 'GET',
        'callback' => function() {
            return [
                'ai_text_model' => get_option('rj_ai_text_model', ''),
                'ai_image_model' => get_option('rj_ai_image_model', ''),
                'news_rewrite_prompt' => get_option('rj_news_rewrite_prompt', ''),
                'news_reviewer_prompt' => get_option('rj_news_reviewer_prompt', ''),
            ];
        },
        'permission_callback' => '__return_true',
    ]);
});
