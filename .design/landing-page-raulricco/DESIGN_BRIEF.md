# Design Brief: Landing Page — Raul Ricco

## Problem

O empresário brasileiro que precisa de tráfego pago entra em sites de "gestores de tráfego" e encontra a mesma coisa em todo lugar: fundo preto, gradiente roxo/verde neon, emojis de foguete, cards genéricos. Não dá para distinguir um profissional do outro. O visitante não consegue responder "por que esse cara especificamente?"

## Solution

Um site que comunica autoridade pela disciplina visual — não pelo grito. Swiss/International Typographic aplicado a marketing digital: grid rígido, tipografia dominante, acento elétrico único. O visitante percebe competência antes de ler uma palavra.

## Experience Principles

1. **Autoridade pela contenção** — Menos elementos, cada um com peso máximo. Se não ganha autoridade, sai.
2. **Estrutura como mensagem** — O grid, as réguas, a hierarquia tipográfica comunicam precisão antes do copy.
3. **Sem enrolação** — CTA direto, sem jornadas de persuasão desnecessárias. Quem vai contratar, vai.

## Aesthetic Direction

- **Philosophy**: Swiss / International Typographic
- **Tone**: Autoridade fria, competência implícita, direto ao ponto
- **Reference points**: Consultorias premium (Linear, Stripe docs, McKinsey.com), editorial europeu
- **Anti-references**: Gradiente roxo + Inter + card grid genérico. Emojis de foguete. TUDO EM MAIÚSCULO NOS CTAs com pontos de exclamação.

## Existing Patterns

- **Typography**: Inter — substituído por Space Grotesk (display) + DM Sans (body)
- **Colors**: Dark (#0A0A0A) com acento sage/olive `#b0bc90` — substituído por elétrico `#0057FF`
- **Spacing**: scale existente reutilizado com 4px base
- **Components**: header fixo, hero 2-colunas, cards-grid, metrics, checklist, FAQ accordion, process steps, footer

## Component Inventory

| Component | Status | Notes |
|---|---|---|
| Header | Modify | Remove pill do CTA, retângulo. Logo em Space Grotesk |
| Hero | Modify | Foto editorial full-height, heading scale maior, eyebrow label |
| Client logos strip | Modify | Adicionar label "CLIENTES", estilo tag retangular |
| Metrics | Modify | Grid horizontal com números enormes, sem card bg |
| Cards | Modify | Sem borda glowing, régua no topo, número prefixo 01/02 |
| Checklist | Modify | Grid com células, seta → no lugar de ✓ |
| Process steps | Modify | Layout lista horizontal numerada, não cards flutuantes |
| FAQ | Modify | Sem card bg, bordas como estrutura |
| Footer | Modify | Grid 2fr 1fr 1fr, label UPPERCASE para colunas |

## Key Interactions

- Hover em cards: régua azul anima da esquerda para a direita (width 0 → 100%)
- Hover em nav links: color → text-hi
- FAQ accordion: smooth max-height transition
- CTA buttons: background color shift (sem translateY, sem glow)

## Responsive Behavior

- Mobile (375px): stack de coluna única, foto hero 60vw height, cards single column
- Tablet (768px): stack mantido, nav hamburger
- Desktop (1024px+): grid 2 colunas hero, grid 4 cards, métricas horizontais

## Accessibility Requirements

- Contraste mínimo WCAG AA em todos os textos
- Focus ring visível em todos os interativos
- `prefers-reduced-motion` aplicado — todas as transições desativadas
- Touch targets ≥ 44px no mobile
- Texto body ≥ 16px no mobile

## Out of Scope

- Dark/light mode toggle (site é apenas dark)
- Animações de scroll (sem Intersection Observer nesta versão)
- Redesign de sobre.html e contato.html (estrutura herdada via CSS)
