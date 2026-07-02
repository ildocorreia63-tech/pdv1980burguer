## Banner do Cardápio Digital

Adicionar uma imagem de banner (única, editável) no topo da página `/cardapio`, gerenciada pelo Admin.

### 1. Backend
- Migration: adicionar colunas em `store_settings`:
  - `banner_url text`
  - `banner_enabled boolean default true`
- Reaproveitar bucket público existente `product-images` para hospedar a imagem (evita nova bucket/políticas).

### 2. Admin (`src/pages/Admin.tsx` → seção Configurações)
- Nova seção "Banner do Cardápio" com:
  - Preview da imagem atual.
  - Botão de upload (envia para `product-images/banners/{timestamp}.jpg` e salva `banner_url`).
  - Botão "Remover banner".
  - Switch "Exibir banner no cardápio" (`banner_enabled`).
- Botão "Salvar" reaproveitando padrão já existente.

### 3. Cardápio (`src/pages/Cardapio.tsx`)
- Carregar `banner_url` e `banner_enabled` do `store_settings`.
- Renderizar `<img>` responsivo no topo (largura total, altura ~160–220px mobile / ~280px desktop, `object-cover`, cantos arredondados) apenas quando habilitado e URL existir.
- Alt text com nome da loja para SEO.

### Detalhes técnicos
- Validação do arquivo no upload: tipo `image/*`, tamanho ≤ 3 MB, com toast de erro claro.
- Loading skeleton enquanto a imagem carrega.
- Nenhuma alteração em fluxo de pedidos, carrinho ou pagamento.
