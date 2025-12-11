-- Migration: Add WordPress Categories Support
-- Criada em: 2024-12-06
-- Descrição: Adiciona tabela para mapear estados para categorias WordPress

-- Criar tabela wordpress_categories
CREATE TABLE IF NOT EXISTS public.wordpress_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code VARCHAR(2) NOT NULL UNIQUE,
  state_name VARCHAR(100) NOT NULL,
  category_name VARCHAR(200) NOT NULL,
  category_slug VARCHAR(200) NOT NULL,
  wp_category_id INTEGER NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wordpress_categories_state_code ON public.wordpress_categories(state_code);
CREATE INDEX IF NOT EXISTS idx_wordpress_categories_wp_id ON public.wordpress_categories(wp_category_id);

-- Comentários
COMMENT ON TABLE public.wordpress_categories IS 'Mapeamento de estados brasileiros para categorias do WordPress';
COMMENT ON COLUMN public.wordpress_categories.state_code IS 'Código UF do estado (2 letras)';
COMMENT ON COLUMN public.wordpress_categories.state_name IS 'Nome completo do estado';
COMMENT ON COLUMN public.wordpress_categories.category_name IS 'Nome da categoria no WordPress';
COMMENT ON COLUMN public.wordpress_categories.category_slug IS 'Slug da categoria no WordPress';
COMMENT ON COLUMN public.wordpress_categories.wp_category_id IS 'ID da categoria no WordPress (retornado pela API)';

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_wordpress_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_wordpress_categories_updated_at
  BEFORE UPDATE ON public.wordpress_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_wordpress_categories_updated_at();
