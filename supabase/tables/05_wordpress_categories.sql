-- Tabela para armazenar categorias do WordPress por estado
CREATE TABLE IF NOT EXISTS public.wordpress_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code VARCHAR(2) NOT NULL UNIQUE, -- Código do estado (DF, ES, MA, etc)
  state_name VARCHAR(100) NOT NULL, -- Nome do estado (Distrito Federal, Espírito Santo, etc)
  category_name VARCHAR(200) NOT NULL, -- Nome da categoria no WordPress (ex: "Notícias DF")
  category_slug VARCHAR(200) NOT NULL, -- Slug da categoria
  wp_category_id INTEGER NOT NULL UNIQUE, -- ID da categoria no WordPress
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_wordpress_categories_state_code ON public.wordpress_categories(state_code);
CREATE INDEX IF NOT EXISTS idx_wordpress_categories_wp_id ON public.wordpress_categories(wp_category_id);

-- Comentários
COMMENT ON TABLE public.wordpress_categories IS 'Mapeamento de estados brasileiros para categorias do WordPress';
COMMENT ON COLUMN public.wordpress_categories.state_code IS 'Código UF do estado (2 letras)';
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
