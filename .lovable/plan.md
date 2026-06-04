## Controle de Insumos e Ficha Técnica

Vou criar um módulo completo de gestão de insumos (ingredientes) com ficha técnica por produto, baixa automática no estoque a cada venda e cálculo de lucro.

### Banco de dados (novas tabelas)

**`ingredients`** — cadastro de insumos
- `name`, `unit` (un, kg, g, L, ml), `cost_per_unit` (R$), `stock_quantity`, `min_stock` (alerta), `active`

**`product_recipes`** — ficha técnica (liga produto → insumos)
- `product_id`, `ingredient_id`, `quantity` (quanto consome por 1 unidade do produto)

**`ingredient_movements`** — histórico de movimentações
- `ingredient_id`, `type` (`purchase` | `sale` | `adjustment` | `waste`), `quantity` (negativa = saída), `unit_cost`, `sale_id` (opcional), `notes`, `created_by`

**Trigger automático**: ao inserir em `sale_items`, debita os insumos da ficha técnica e registra em `ingredient_movements`.

**RLS**: leitura para staff (admin + operator), escrita só admin (insumos/ficha), movimentações criadas pelo sistema/admin.

### Tela nova: `/insumos` (Admin)

Três abas:

1. **Insumos** — lista com busca, custo unitário, estoque atual (com alerta visual quando ≤ mínimo), botões: novo, editar, ajuste de estoque (entrada/saída manual).

2. **Ficha Técnica** — escolhe um produto, mostra ingredientes com quantidades; soma o **custo total** do produto, exibe lado a lado: preço de venda, lucro em R$ e **margem %**. Permite adicionar/remover/editar ingredientes da ficha.

3. **Movimentações** — extrato de entradas/saídas com filtro por data e insumo.

### PDV / Cardápio (presentação)

- Card do produto continua igual; opcionalmente mostra badge "sem estoque" se algum insumo da ficha estiver zerado (sem bloquear venda — só aviso).

### Relatórios

- Nova seção: **Lucro real** — para o período, soma `(preço_venda − custo_ficha) × qtd_vendida` por produto, mostra lucro total R$ e margem %.

### Detalhes técnicos

- Função SQL `consume_ingredients_for_sale_item()` chamada por trigger AFTER INSERT em `sale_items`: percorre `product_recipes` e cria movimentações negativas + decrementa `stock_quantity`.
- Custo do produto = `SUM(ingredient.cost_per_unit × recipe.quantity)`.
- Lucro R$ = `price − cost`; margem % = `(lucro / price) × 100`.
- Tudo em `numeric(12,4)` para insumos (granularidade de gramas/ml).
- Nova rota protegida `adminOnly` no `App.tsx`, link no menu admin.

### Fora de escopo (posso adicionar depois se quiser)

- Bloquear venda quando estoque insuficiente (hoje só alerta).
- Compras com fornecedor e nota fiscal.
- Variação de custo médio ponderado (usaremos `cost_per_unit` direto do cadastro).
