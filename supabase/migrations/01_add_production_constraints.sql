-- Migração: Adicionar constraints e índices para produção
-- Data: 2025-12-06

-- 1. Garantir que source_url é único (já existe, mas garantindo)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'articles_source_url_key'
  ) THEN
    ALTER TABLE articles ADD CONSTRAINT articles_source_url_key UNIQUE (source_url);
  END IF;
END $$;

-- 2. Adicionar constraint composto site_id + source_url para segurança extra
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'articles_site_url_key'
  ) THEN
    ALTER TABLE articles ADD CONSTRAINT articles_site_url_key UNIQUE (site_id, source_url);
  END IF;
END $$;

-- 3. Adicionar índice para wordpress_post_id (evitar duplicatas de publicação)
CREATE UNIQUE INDEX IF NOT EXISTS articles_wordpress_post_id_idx 
  ON articles (wordpress_post_id) 
  WHERE wordpress_post_id IS NOT NULL;

-- 4. Adicionar índice para buscas por status
CREATE INDEX IF NOT EXISTS articles_extraction_status_idx ON articles (extraction_status) WHERE extraction_status != 'succeeded';
CREATE INDEX IF NOT EXISTS articles_refine_status_idx ON articles (refine_status) WHERE refine_status != 'succeeded';
CREATE INDEX IF NOT EXISTS articles_media_status_idx ON articles (media_status) WHERE media_status != 'succeeded';
CREATE INDEX IF NOT EXISTS articles_published_status_idx ON articles (published_status) WHERE published_status != 'published';

-- 5. Adicionar índice para ordenação por data
CREATE INDEX IF NOT EXISTS articles_discovered_at_idx ON articles (discovered_at DESC);
CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at DESC) WHERE published_at IS NOT NULL;

-- 6. Adicionar índice para busca por content_hash (detectar duplicatas de conteúdo)
CREATE INDEX IF NOT EXISTS articles_content_hash_idx ON articles (content_hash) WHERE content_hash IS NOT NULL;

-- 7. Garantir que site_id sempre tenha valor
ALTER TABLE articles ALTER COLUMN site_id SET NOT NULL;

-- 8. Adicionar check constraint para URLs válidas
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'articles_source_url_valid'
  ) THEN
    ALTER TABLE articles ADD CONSTRAINT articles_source_url_valid 
      CHECK (source_url ~* '^https?://');
  END IF;
END $$;

-- 9. Adicionar trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_articles_updated_at ON articles;
CREATE TRIGGER update_articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 10. Adicionar índice composto para pipeline status
CREATE INDEX IF NOT EXISTS articles_pipeline_progress_idx 
  ON articles (site_id, extraction_status, refine_status, media_status, published_status);

-- 11. Tabela de ingestion_runs: garantir unicidade
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ingestion_runs_run_id_site_id_key'
  ) THEN
    ALTER TABLE ingestion_runs ADD CONSTRAINT ingestion_runs_run_id_site_id_key UNIQUE (run_id, site_id);
  END IF;
END $$;

-- 12. Adicionar política de RLS (Row Level Security) - desabilitado por padrão, mas preparado
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_media ENABLE ROW LEVEL SECURITY;

-- Política permissiva para service_role (permite tudo)
DROP POLICY IF EXISTS "Enable all for service role" ON articles;
CREATE POLICY "Enable all for service role" ON articles
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for service role" ON ingestion_runs;
CREATE POLICY "Enable all for service role" ON ingestion_runs
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for service role" ON article_events;
CREATE POLICY "Enable all for service role" ON article_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for service role" ON article_media;
CREATE POLICY "Enable all for service role" ON article_media
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 13. Vacuum e Analyze para otimizar
VACUUM ANALYZE articles;
VACUUM ANALYZE ingestion_runs;
VACUUM ANALYZE article_events;
VACUUM ANALYZE article_media;

-- Exibir estatísticas finais
SELECT 
  'articles' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT site_id) AS unique_sites,
  COUNT(DISTINCT source_url) AS unique_urls,
  COUNT(*) FILTER (WHERE extraction_status = 'succeeded') AS extracted,
  COUNT(*) FILTER (WHERE refine_status = 'succeeded') AS refined,
  COUNT(*) FILTER (WHERE published_status = 'published') AS published
FROM articles;
