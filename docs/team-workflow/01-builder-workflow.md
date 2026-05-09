# Builder Workflow — V1

> Workflow fixo de delegação **in-chat** pra construir/codar.
> Decisão arquitetural fechada em 2026-05-08.
> Não é auto-loop autônomo — é interação no chat que demora 5-15 min e
> entrega algo absurdamente bem feito.

## Filosofia (V1 vs V2)

| Aspecto | V1 — Team Delegation (este doc) | V2 — Auto-loop Task Mode (futuro) |
|---------|-------------------------------|----------------------------------|
| Trigger | User no chat | Linear ticket / GitHub issue / CLI |
| Onde aparece | Resposta volta no chat | PR criado, comentário no ticket |
| Duração | ~5-15min (depende da task) | 30min - 8h |
| User observa? | Sim, ao vivo | Não, async |
| Workflow | **Fixo** (Builder workflow, etc.) | Configurável, decomposição grande |
| Reject loop | Curto, max 2 rejeitos | Pode ter loops elaborados |

**V1 NÃO permite user montar workflow custom. Workflows são FIXOS, providos pela
gente.** Um pra cada caso de uso. Este doc descreve o **Builder Workflow** —
primeiro a ser construído.

---

## Princípio central: Dinâmico vs Fixo

A arquitetura V1 é construída em torno de uma divisão clara:

```
DINÂMICO (1 ponto só):
  └── Planner — decide quantos blocks + escreve objective rico de cada

FIXO (todo o resto):
  ├── Skills universais (4 prompts: planner.md, architect.md, builder.md, reviewer.md)
  ├── Sequência por block (Architect → Builder → Reviewer)
  ├── Tools por role (só Builder edita)
  ├── Reject loop (max 2 rejects → forced approval na 3ª)
  ├── Artifact structure (.team-handoff/...)
  └── Formatos de output (XML estruturado pra parsing)
```

### Onde mora a inteligência

A robustez do produto não vem de delegação dinâmica per-block. Vem de:

1. **Decomposição do Planner** — boa fronteira de blocks + objective rico de cada
2. **Skills universais bem-craftadas** — cada role sabe seu trabalho 100% sem precisar ser instruído por block

**Implicação prática:** investimento de tempo no produto se distribui assim:

```
70% — craftar os 4 prompts (skills universais excelentes)
25% — craftar o prompt do Planner (decomposição certa)
 5% — engenharia de orquestração (state machine simples)
```

A "alma" do produto vive nos 5 prompts. Engenharia é trivial em comparação.

---

## Skills do Builder Workflow

Cada workflow tem suas próprias skills. As 4 do Builder Workflow:

```
workflows/builder/skills/
  ├── planner.md       Entendedor + decompositor pro Builder workflow
  ├── architect.md     Desenhista de plano de implementação
  ├── builder.md       Executor — escreve código
  └── reviewer.md      Auditor — verifica builder + impacto ao redor
```

**Universais — nunca mudam por block.** São o IP do produto.

### O que cada skill carrega

#### `planner.md`
- Identidade: você é o Planner
- Função: receber task + chat context + repo, decompor em blocks
- Self-critique simplificado: "block count proporcional? objectives concretos?"
- Output format: JSON estruturado (schema fixo)

#### `architect.md`
- Identidade: você é o Architect
- Função: receber objective do block, investigar código, desenhar plano de implementação
- Dimensões que SEMPRE considera: padrões existentes, compat de API, edge cases,
  error handling, segurança, testabilidade, cross-block continuity
- Lê summaries de blocks anteriores (única role com cross-block awareness)
- Output: markdown estruturado (template fixo) — capturado pelo orquestrador

#### `builder.md`
- Identidade: você é o Builder
- Função: receber plan do Architect, executar exato (sem redesign)
- Comportamento: lê estado do código antes de Edit, segue padrões existentes,
  roda tests se setup existe
- Output: report markdown estruturado — capturado pelo orquestrador

#### `reviewer.md`
- Identidade: você é o Reviewer
- Função: auditar plan + report + estado do código, decidir
- Dimensões que SEMPRE audita: fidelidade ao plan, regressão, segurança, padrões,
  edge cases, tests
- Output: XML estruturado com decision (APPROVED|REJECT) + payload (summary ou rejection-list)

---

## Fluxo geral

```
PHASE 0 — PLANNER
  Único agent com acesso a CHAT CONTEXT COMPLETO + repo snapshot + task
  Quebra em N work chunks (blocks), proporcional ao tamanho da task
  Cada block: { name, objective (rico), estimatedFiles? }
  NÃO produz agentPlan per agent. Skills universais cuidam do resto.
  Self-critique simplificado: "block count proporcional?"

PER BLOCK — sequência FIXA:
  ┌─────────────────────────────────────────────────────────────┐
  │  Architect → Builder → Reviewer                              │
  │     ↑                            │                            │
  │     └─── REJECT (max 2) ─────────┘                            │
  │                                                                │
  │  Approved → próximo block                                      │
  │  Reject 3ª vez → APROVAÇÃO FORÇADA → próximo block             │
  └─────────────────────────────────────────────────────────────┘

Quando todos os blocks completam → workflow termina.
```

---

## Block = work chunk (não phase)

Blocks NÃO são fases SDLC (analisar → implementar → testar). Blocks são
**partições do trabalho**, cada uma um deliverable atômico que passa pelo ciclo
Architect → Builder → Reviewer.

### Errado (phase-based)
```
Block 1: analisar abordagem
Block 2: implementar
Block 3: testar
```

### Certo (work-chunk based)
```
Block 1: implementar token generation (Architect → Builder → Reviewer)
Block 2: implementar refresh endpoint   (Architect → Builder → Reviewer)
Block 3: implementar middleware         (Architect → Builder → Reviewer)
```

Cada block é UMA peça funcional do todo, completa em si mesma após Reviewer
aprovar.

---

## Output do Planner — schema

```typescript
interface PlannerOutput {
  rationale?: string  // explicação humana opcional pra debug
  blocks: Array<{
    name: string                  // título curto
    objective: string             // RICO — descrição detalhada do que fazer no block
    estimatedFiles?: string[]     // arquivos prováveis (heurística)
  }>
}
```

**Não há `agentPlan`.** O `objective` é a fonte única de "o que fazer neste
block" — cada agent aplica sua skill universal sobre esse objective.

### Exemplo de objective rico

```
"Adicionar função refreshToken() em lib/auth.ts implementando sliding window.
Aceita token atual, retorna { newAccessToken, newRefreshToken }.
Manter API existente compatível (login/verify não devem quebrar).
Considerar: expiry configurável (default 1h access, 7d refresh),
lock atomic pra prevenir race no refresh simultâneo."
```

Cada agent lê esse objective pela lente da própria skill:
- Architect → "como desenhar isso"
- Builder → vai ler o plano do Architect (que já contextualizou)
- Reviewer → "o que auditar contra esse objective"

### Caso especial: aviso pra um agent específico

Raro mas possível. Vai como prosa dentro do `objective`:

```
"...lock atomic. ATENÇÃO: este é caminho crítico de auth, review com extra
atenção a race conditions e replay attacks."
```

Reviewer lê, vê o aviso, age conforme. Sem campo separado por agent.

---

## Comunicação entre agents — Artifact-based

**Agents não conversam diretamente.** Cada agent produz texto via `claude -p`,
o **orquestrador** captura esse output, formata, escreve em arquivo no
`.team-handoff/`, e injeta no prompt do próximo agent.

### Estrutura de pastas no worktree

```
<worktree>/.team-handoff/
  ├── plan.md                       Plano do Planner (markdown legível pra debug)
  ├── block-01/
  │   ├── architect-plan.md         Plano do Architect pro Builder
  │   ├── builder-report.md         Report do Builder pro Reviewer
  │   ├── rejection-list-1.md       Lista do Reviewer (1ª rejeição) — opcional
  │   ├── rejection-list-2.md       Lista do Reviewer (2ª rejeição) — opcional
  │   └── summary.md                Summary do Reviewer (ponte cross-block)
  ├── block-02/
  │   └── ...
  └── ...
```

**`.team-handoff/` é gitignored.** Cleanup automático no fim do workflow (ou
opcional pra debug).

### Importante: Artifacts existem pra audit, comunicação real é via prompt

A comunicação efetiva entre agents acontece pelo **orquestrador injetando
conteúdo nos prompts**. Os arquivos `.md` existem como:
- Audit trail tangível (user pode abrir e ver)
- Debug
- Histórico de iteration em caso de reject

Mas o agent NÃO usa `Read` tool pra ler artifact do agent anterior — o conteúdo
chega INJETADO no system prompt dele.

---

## Como artifacts são gerados

Agents NÃO têm `Write` tool (exceto Builder, mas Builder usa Write pra código,
não pra artifacts). Como os artifacts ficam então?

**Orquestrador captura o output do `claude -p` e materializa o arquivo.**

Fluxo:
1. Agent roda `claude -p`, produz texto markdown estruturado (template no prompt)
2. Orquestrador captura stdout (output do assistant)
3. Orquestrador faz `fs.writeFile(<worktree>/.team-handoff/block-N/<artifact>.md, output)`
4. Próximo agent recebe esse output INJETADO no prompt dele

Vantagens:
- Agents sem Write tool não podem corromper código acidentalmente
- Orquestrador controla 100% o formato e localização
- Templates ficam consistentes

---

## Cross-block — Architect é o único bridge

Pra evitar inflação cumulativa de contexto nos blocks finais, **APENAS o
Architect** dos próximos blocks lê os summaries dos blocks anteriores.

| Agent (block N+1) | Lê summaries de blocks 1..N? | Por quê |
|-------------------|------------------------------|---------|
| **Planner** | N/A (roda 1x antes de tudo) | — |
| **Architect** | ✅ Sim, todos | Cérebro cross-block. Sintetiza contexto histórico no plano. |
| **Builder** | ❌ Não | Foca no plano do Architect (que já incorporou contexto). Lê código atual via Read. |
| **Reviewer** | ❌ Não | Audita "fez o que tava no plano?". Estado do código + plan + builder report bastam. |

### Por que Builder não vê summaries

O architect-plan já contém toda a contextualização. Se Block 1 setou padrão X,
o architect-plan do Block 2 explicita: "use o padrão X (já estabelecido em
lib/auth/tokens.ts)". Builder lê plano + código (Read tool) → executa.

### Por que Reviewer não vê summaries

Reviewer audita: "Builder fez o que o architect-plan pediu?" Esse é o contrato
do block. Se Architect esqueceu de mencionar continuidade com block anterior, é
falha do Architect — não do Reviewer (que tem escopo definido pelo plan).

Reviewer ainda pode usar Read/Grep pra verificar pattern continuity SE quiser,
mas o prompt foca no escopo do block atual.

### Trade-off honesto

**Risco:** se Architect erra a destilação no plan, ninguém downstream pega.

**Mitigação:**
- Architect tem skill robusta (dimensões universais sempre consideradas)
- Architect lê summaries verbatim (não destilados)
- Architect tem tempo (60-120s) pra processar
- Summary template estruturado pra Architect não perder pontos

Aceito o trade-off em V1. Alternativa (todos lerem tudo) inflaria prompts e
duplicaria responsabilidade.

---

## Artifacts — formato

### `plan.md` (Planner → debug + injetado)

```markdown
# Plan — Workflow run <runId>

## Task
{user task original}

## Rationale
{breve explicação do Planner sobre a decomposição}

## Blocks

### Block 1: {name}
**Objective:** {objective rico}
**Estimated files:** {lista}

### Block 2: {name}
**Objective:** ...

...
```

Architect de cada block recebe via prompt o `objective` + `name` + lista de
summaries dos blocks anteriores (se houver). Não precisa ler `plan.md`.

### `architect-plan.md` (Architect → Builder)

Rich, contextualizado. Template fornecido na skill `architect.md`.

```markdown
# Block N: {name}

## Contexto consolidado dos blocks anteriores
- Block 1: {síntese vinda do summary.md}
(omitido se for block 1)

## O que fazer agora
1. {step concreto}
2. {step concreto}
...

## Patterns a seguir
- {pattern 1}

## Warnings
- NÃO {coisa a evitar}

## Output esperado
{deliverable concreto}
```

### `builder-report.md` (Builder → Reviewer)

Curto, factual. Template em `builder.md`.

```markdown
# Block N — Builder Report

## What I did
- {ação concreta}

## Files modified/created
- path/file.ts (modified) — {descrição}
- path/test.ts (created)

## Test output (se rodou)
{output do test runner}

## Decisions made
- {decisão de implementação não-óbvia}
```

### Output do Reviewer — XML estruturado

Reviewer não escreve em markdown puro. Output começa com tag XML pra orquestrador
parsear:

```xml
<review_decision>APPROVED</review_decision>
<review_payload>
{conteúdo do summary.md em markdown}
</review_payload>
```

OU em caso de reject:

```xml
<review_decision>REJECT</review_decision>
<review_payload>
{conteúdo do rejection-list-N.md em markdown}
</review_payload>
```

Orquestrador parseia, decide próximo passo, escreve o arquivo apropriado.

### `rejection-list-N.md` (Reviewer → Architect on reject)

```markdown
# Block N — Rejection #X (de 2 max)

## Issues encontradas
1. {problema 1, com ref a arquivo/linha}
2. {problema 2}

## Severidade
- Crítico: {itens}
- Médio: {itens}

## Sugestões (opcional, Architect decide)
- {direção sugerida}
```

### `summary.md` (Reviewer → cross-block, ao aprovar)

```markdown
# Block N — {name} — APPROVED | FORCED_APPROVAL_AFTER_2_REJECTS

## Goal
{o que esse block tinha que entregar}

## Outcome
{o que foi entregue}

## Files modified
- path/file.ts (criou função X)

## Decisions made
- {decisão arquitetural relevante pra próximos blocks}

## Limitations / open questions
- {coisa não coberta}

## Status: APPROVED
```

---

## Reject loop — detalhado

```
1ª passagem:
  Architect → produz texto → orquestrador escreve architect-plan.md
  Builder   → produz texto + edita código → orquestrador escreve builder-report.md
  Reviewer revisa.
    APPROVED → orquestrador escreve summary.md → próximo block
    REJECT   → orquestrador escreve rejection-list-1.md → volta pro Architect

2ª passagem (rejection 1):
  Architect roda DE NOVO com contexto adicional no prompt:
    <retry_context attempt="2">
      <previous_plan>{architect-plan.md original verbatim}</previous_plan>
      <rejection_reasons>{rejection-list-1.md verbatim}</rejection_reasons>
      <instruction>
        Reviewer rejeitou. Estado do código já reflete o que Builder
        tentou (use Read pra ver). Gere AJUSTE — não recomeça do zero,
        foca no que falhou. O Builder vai ler seu novo plano e iterar.
      </instruction>
    </retry_context>
  Architect produz novo plano (orquestrador SOBRESCREVE architect-plan.md)
  Builder roda com novo plano. Estado do código tem o que ele fez antes
    (Architect mencionou no novo plano o que foi feito + o que ajustar).
  Reviewer revisa.
    APPROVED → summary.md → próximo block
    REJECT (2ª) → rejection-list-2.md → volta pro Architect

3ª passagem (rejection 2):
  Architect refaz como na 2ª.
  Builder executa.
  Reviewer roda com contexto adicional no prompt:
    <review_context attempt="3" forced="true">
      <reject_history>
        <reject n="1">{rejection-list-1.md}</reject>
        <reject n="2">{rejection-list-2.md}</reject>
      </reject_history>
      <instruction>
        Esta é a 3ª revisão. Architect e Builder já tentaram duas vezes.
        APROVE este block. Use status FORCED_APPROVAL_AFTER_2_REJECTS no
        summary, lista as issues remanescentes pro user decidir
        manualmente. Não rejeite mais.
      </instruction>
    </review_context>
  Reviewer aprova com status FORCED_APPROVAL_AFTER_2_REJECTS → summary.md
  → próximo block
```

**Rationale do forced approval:** após 2 rejeitos, sistema percebe que tá em
loop. Aceitar e seguir é melhor UX que falhar todo o workflow. User vê issues
outstanding na summary e decide se aceita o trabalho ou não.

---

## Tools por agent

| Agent | Read | Grep | Glob | Edit/Write | Bash |
|-------|------|------|------|------------|------|
| Planner | ✅ | ✅ | ✅ | ❌ | ❌ |
| Architect | ✅ | ✅ | ✅ | ❌ | ❌ |
| Builder | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reviewer | ✅ | ✅ | ✅ | ❌ | ❌ |

**Apenas Builder edita/executa código.** Outros podem investigar mas não
modificar.

---

## Worktree compartilhada

Workflow roda na **mesma worktree** que o user pode estar editando em outros
chats simultaneamente. Aceito o risco de colisão — user é human-in-the-loop, sabe
o que tá rolando.

**Implicação:** estado do código durante o workflow pode ter mudanças do user
em paralelo. Agents trabalham com o que tá ali. Não bloqueamos worktree.

---

## Tempo

Não há hard timeout pro workflow inteiro. Depende do tamanho da task:

| Tamanho | Estimativa |
|---------|------------|
| Trivial (1 block) | 3-5min |
| Pequena (2 blocks) | 6-10min |
| Média (3-4 blocks) | 10-15min |
| Grande (5+ blocks) | 15-25min |

Hard timeouts existem POR STEP (`claude -p` timeout) pra evitar travar
indefinidamente, mas o workflow inteiro pode ir além quando necessário.

---

## Self-critique do Planner

Mantém self-critique simplificado, único objetivo: **block count proporcional à
task**. Pré-requisito anterior ("agents adequados") morreu — workflow é fixo.
Pré-requisito anterior ("agentPlan per agent adequado") morreu — não há
agentPlan.

```
PASSO 1 — Draft: quebra em N blocks com objective rico
PASSO 2 — Crítica:
  - N é proporcional à task? Não invente complexidade.
  - Cada block tem objective concreto e finito?
  - Cada objective tem informação suficiente pro Architect agir sem clarificar?
PASSO 3 — Output JSON final
```

Custo: +5-10s. Ganho: Planner não inventa 6 blocks pra task de 1.

---

## Bridge IN — contexto do chat → Planner

Quando o user invoca `/build` num chat com histórico, o Planner precisa do
**conteúdo completo da conversa anterior** pra entender o que se quer construir.
Sem isso, ele decompõe sem contexto.

**Princípio: cache pass-through, ZERO LLM, multi-tier fallback.** Não
chamamos modelo pra resumir o chat — passamos o conteúdo bruto pro Planner
ler ele mesmo.

### Algoritmo

```
buildBridgeInContext(sessionId) → string:

  1. events = ringBuffer.get(sessionId)        // RAM, ~0ms
     se events.length > 0:
       canonical = events.map(fromRingEvent)
       return formatXml(canonical)

  2. dbRows = await db.chatMessage.findMany({   // ~5ms
       where: { sessionId, deletedAt: null },
       orderBy: { createdAt: 'desc' },
       take: 30,
     })
     se dbRows.length > 0:
       dbRows.reverse()                         // restaura cronologia
       canonical = dbRows.map(fromDbRow)
       return formatXml(canonical)

  3. return ""                                  // sem chat context
```

**Nunca duplica.** Uma fonte só por chamada — a primeira que tiver.

### Política de caps

| Origem | Cap | Por quê |
|--------|-----|---------|
| **Ring buffer** | NENHUM | Cache já é tunada (200 events × 24h TTL). Se está lá, é porque o user tá ativo. Cortar é desconfiar de uma camada que a gente desenhou. |
| **DB** | `LIMIT 30` SQL-side | DB pode ter 5000 msgs persistidas. Necessário pra latência (<5ms) e pra prompt não inflar. |

Sem byte cap, sem per-element trim. Confiar nas pontas.

### As pontas de cache (server-side)

| Ponta | Tipo | Latência | Capacidade | Quem alimenta |
|-------|------|----------|------------|---------------|
| **Server ring buffer** (`sessionBuffers` em `lib/companion-relay.ts`) | RAM no server | ~0ms | 200 events/sessão × 24h TTL | Daemon → SSE → `pushEvent` |
| **DB Postgres** (`chat_messages`) | Disco local | ~5ms | Sem limite (chat inteiro) | Daemon write-through |

Ambas carregam logs completos: `role: 'user' | 'assistant' | 'tool' | 'thinking' | 'system'`
+ `toolName`, `toolInput`, `toolResult`, `toolError`, `costUsd`, `durationMs`.

**Garantia importante:** workflow_step_results NÃO poluem ring buffer. Quando
o response route detecta esse tipo, pula `pushEvent` (vai pra correlation
registry, não pro buffer). Workflow de 10min não esgota os 200 events da chat.

### Code architecture — single formatter, multi adapter

Ring buffer entrega `ClaudeStreamEvent` raw (formato Anthropic), DB entrega
rows estruturadas Prisma. Pra evitar drift entre formatters:

```
ringEvent → fromRingEvent() ─┐
                             ├─→ CanonicalRow ─→ formatLine() ─→ string XML
dbRow     → fromDbRow()    ──┘
```

`CanonicalRow` espelha o shape do DB row (DB já é estruturado, é a fonte
de verdade). `fromDbRow` é praticamente identidade. `fromRingEvent` faz o
parsing real do stream Anthropic. **Um único formatter** = impossível
divergir.

```typescript
type CanonicalRow = {
  role: 'user' | 'assistant' | 'tool' | 'thinking' | 'system'
  text: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: string
  toolError?: boolean
}
```

### Formato de output: XML

[Anthropic recomenda XML](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags)
nos prompts — modelo treinado pra entender XML como estrutura. Boundaries
ficam unambíguos (um tool_result com a string `[user]` em alguma linha não
confunde o parser).

```xml
<chat_context>
  <user>como tá o auth?</user>
  <assistant>vou ler lib/auth.ts</assistant>
  <tool name="Read">
    <label>Reading lib/auth.ts</label>
    <result>export function login(email...) { ... }</result>
  </tool>
  <assistant>vi que sessao eh JWT custom, sem refresh</assistant>
  <user>adiciona refresh</user>
  <thinking>o user quer sliding-window padrao</thinking>
  <assistant>vou implementar</assistant>
</chat_context>
```

Wrapper `<chat_context>` deixa explícito pro Planner: "dentro da tag é
histórico, fora é minha vez de agir."

### XML é OUTPUT-ONLY do Bridge IN

**Ring buffer e DB NÃO são afetados.** Continuam armazenando nos shapes
nativos (raw stream Anthropic e Prisma rows respectivamente). A conversão
XML acontece SOMENTE no `formatLine()` quando Bridge IN está construindo o
contexto pro Planner. É uma string nova sendo gerada — zero efeito colateral
em outros pipelines (hydrate browser, persistence, SSE).

### Quando NÃO há contexto

3 cenários onde Bridge IN retorna `""`:
1. **Chat com histórico mas trigger ainda não persistido** (race com writeback) — chat context não inclui o trigger duplicado, fica MAIS limpo
2. **Primeira msg do chat = `/build`** — só tem o trigger no DB, retorna vazio
3. **Chat completamente vazio** — retorna vazio

Em todos os 3, o Planner recebe SEM o bloco `<chat_context>` no prompt.
Apenas a `userMessage` (a parte depois do `/build`). Sem regra especial
de detecção, sem timing tracking — empty é empty.

**Tempo de espera = ZERO.** Não esperamos writeback do trigger msg. Trigger
já tá em `userMessage` da Layer 2 mesmo (foi enviado no body do POST
`/api/workflow/start`). Nada se perde.

### Quem usa Bridge IN — APENAS o Planner

```
PHASE 0 — Planner
  recebe via prompt:
    - userMessage (a parte depois do /build)
    - <chat_context>...</chat_context>     ← Bridge IN aqui (se houver)
    - Repo snapshot

PER BLOCK
  Architect / Builder / Reviewer NÃO recebem <chat_context>
  Recebem só o que precisam (skill universal + objective + artifacts)
```

Os agents do block operam em cima do que o Planner já destilou no `objective`.
Não precisam ver o chat raw.

**Exceção:** o Reviewer do último block recebe os summaries cross-block (não
o chat raw — os summaries são derivados do trabalho dos blocks anteriores)
pra gerar a resposta final. Detalhado em "Resposta final no chat".

### Performance budget

| Path | Tempo total | Breakdown |
|------|-------------|-----------|
| Cache hot (ring) | ~0.5-1ms | RAM read + adapter + format XML + join |
| Cache cold + DB hit | ~5ms | DB query (LIMIT 30, indexed) + adapter + format XML + join |
| Empty | ~0.5-5ms | só a tentativa em cada tier |

Bridge IN nunca é o gargalo do workflow.

---

## Bridge OUT — workflow → chat

**Em V1, Bridge OUT NÃO existe como mecanismo separado.**

A resposta final do último Reviewer já vira uma mensagem normal do chat
(`role: 'assistant'`). Naturalmente:

- Próxima interação do user com Claude solo: o chat tem a final response como
  contexto via o pipeline normal
- Próximo `/build` no mesmo chat: o NOVO Bridge IN puxa a final response do
  ring buffer (ela tá lá, foi via `pushEvent` quando entrou no chat)

```
Workflow termina
  └── Reviewer último block produz texto
       └── Orquestrador:
            1. Salva .team-handoff/block-N/final-response.md (audit)
            2. Insere ChatMessage row no DB (role='assistant', sessionId={chat})
            3. pushEvent → SSE pro browser (mensagem aparece ao vivo)
            4. Cleanup .team-handoff/

Próximo /build no mesmo chat:
  └── Bridge IN do novo workflow lê ring buffer (final response tá lá)
       └── Planner do novo workflow vê o que foi feito
```

**Sem `pendingEcho`. Sem prepend mágico. Sem race-com-claim.** A final
response virou chat message — qualquer próxima operação vê via o caminho
normal de chat history. Bridge IN do próximo é o "Bridge OUT" do anterior.

---

## Trigger no chat

User invoca via slash command. Lista de workflows é **FIXA, providos por nós**
(não user-customizable).

```
User digita "/" no chat input → menu aparece com workflows fixos:
  /build {task}        — Builder Workflow
  /review {target}     — (futuro)
  /test {scope}        — (futuro)
  ...

User seleciona /build, completa com a task. Send route detecta o slash
command, roteia pro Builder Workflow ao invés do Claude solo do chat.
```

---

## Identidade do workflow na UI (card vivo no chat)

Quando o workflow tá rodando, aparece um **card vivo abaixo da mensagem do user**
mostrando progresso em tempo real:

```
🧑 user: /build adicionar refresh token JWT
─────────────────────────────────────────────
🛠️ Builder Team — running
  ✓ Planner — 3 blocks decomposed (15s)
  ▶ Block 1/3: Token refresh logic
      ✓ Architect — plan ready (45s)
      ▶ Builder — implementing... (1m23s)
      ◌ Reviewer
  ◌ Block 2/3: Refresh endpoint
  ◌ Block 3/3: Validation middleware
─────────────────────────────────────────────
```

**Não exibe valores de gasto/tokens.** User paga via OAuth do CLI dele,
custo não é nossa preocupação de UI.

Card termina e some quando workflow termina — substituído pela resposta final
(ver seção abaixo).

---

## Sequenciamento — sempre sequencial

Block N+1 só começa quando Block N termina e foi aprovado (ou forced-approved).

**Sem paralelo em V1.** Razões:
- Worktree única — paralelo geraria conflitos de Edit
- Cross-block via summary só funciona sequencial (Architect do Block N+1 precisa do summary do Block N)
- Complexidade de paralelismo = alto custo, baixo retorno em V1

V2 pode revisitar se telemetria mostrar que sequencial vira gargalo.

---

## Resposta final no chat — gerada pelo ÚLTIMO Reviewer

Quando o workflow termina, precisa aparecer uma mensagem polida no chat
contando o que foi feito. **Quem gera essa mensagem é o Reviewer do último
block.**

### Comportamento por block (revisitado)

```
Blocks 1..N-1 (intermediários):
  Reviewer aprova → escreve summary.md (ponte cross-block pro próximo Architect)

Último block (N):
  Reviewer aprova → escreve FINAL RESPONSE (mensagem pro user no chat)
                    ↑ não há "próximo Architect" pra ler summary
                    ↑ ao invés de summary técnico, escreve resposta polida pro user
```

### Como Reviewer do último block sabe que é o último

Orquestrador injeta flag no prompt:

```xml
<final_block>true</final_block>
<all_previous_summaries>
  {summary.md de block-1 verbatim}
  {summary.md de block-2 verbatim}
  ...
</all_previous_summaries>
<instruction>
Este é o ÚLTIMO block do workflow. Não há próximo block que vá ler um
summary.md. Em vez de escrever summary técnico, você vai gerar a
RESPOSTA FINAL pro user no chat.

Você tem acesso (excepcional pra esse caso) aos summaries de TODOS os
blocks anteriores acima — use pra contar a história completa do que foi
feito.

Estrutura: visão geral consolidada, lista de arquivos tocados, status
final, e proxima ação sugerida pro user. Tom amigável, conciso, claro.

Veja template abaixo.
</instruction>
```

### Exceção pro último Reviewer

**Esta é a ÚNICA exceção à regra "Reviewer não vê cross-block summaries".**
Justificativa: no último block, Reviewer precisa contar a história inteira.
Sem os summaries, não consegue. É uma exceção bem-delimitada (só último
block, único propósito: redigir resposta final).

### Formato da resposta final

Reviewer redige, não é template mecânico. Exemplo:

```
Pronto — refresh token JWT implementado.

Fiz isso em 3 etapas:

1. **Token refresh logic** (`lib/auth.ts`)
   Adicionei `refreshToken()` com sliding window — 1h access, 7d refresh.
   Lock atomic via lua impede race no refresh simultâneo.

2. **Endpoint POST /api/auth/refresh** (`app/api/auth/refresh/route.ts`)
   Consome `refreshToken()` do passo 1. Retorna 401 em token inválido,
   429 em refresh-too-soon (rate limit).

3. **Middleware de validação** (`lib/middleware/auth.ts`)
   Atualizado pra reconhecer access tokens do novo formato. Backward
   compatible com tokens existentes.

Tudo passou nos tests existentes + 12 novos casos cobrindo race,
expired, replay, clock skew.

Quer ajustar algo, ou seguimos pra próximo passo?
```

### Caso forced approval na 3ª (do último block)

Reviewer ainda redige a resposta final mas com tom honesto sobre o que ficou
pendente:

```
Implementei o refresh token JWT mas com algumas limitações que precisam
da tua revisão.

[descrição do que ficou ok + o que ficou pendente]

3 issues levantadas pelo review não foram resolvidas após 2 iterações:
- {issue 1}
- {issue 2}
- {issue 3}

Recomendo dar uma olhada nesses pontos antes de mergear.
```

Transparência total. User decide.

### Onde a resposta vai

```
Reviewer último block produz texto
  ↓ orquestrador captura
  ├── Salva como .team-handoff/block-N/final-response.md  (audit trail)
  └── Posta no chat como mensagem role: 'assistant'         (mensagem visível pro user)
```

### Continuidade do chat depois do workflow

```
- Mensagem final fica no chat como assistant message normal
- User responde normalmente — chat continua com Claude solo
- Claude solo tem visibilidade do que aconteceu (final response tá na conversa)
- User pode invocar /build de novo se quiser nova rodada de team
```

### Atualização da estrutura de artifacts

```
<worktree>/.team-handoff/
  ├── plan.md                       Plano do Planner
  ├── block-01/                     intermediário
  │   ├── architect-plan.md
  │   ├── builder-report.md
  │   └── summary.md                ponte pro próximo Architect
  ├── block-02/                     intermediário
  │   └── ...
  └── block-03/                     ÚLTIMO block
      ├── architect-plan.md
      ├── builder-report.md
      └── final-response.md         resposta pro user (não summary.md)
```

---

## Status

- [x] Filosofia V1 vs V2 fechada
- [x] Workflow fixo, primeira instância: Builder Workflow
- [x] Skills por workflow (4 prompts universais — IP do produto)
- [x] Block = work chunk (não phase)
- [x] Comunicação por artifacts (orquestrador escreve, agents leem via prompt)
- [x] Cross-block: apenas Architect lê summaries
- [x] Reject loop com forced approval na 3ª
- [x] Tools por role (só Builder edita)
- [x] Self-critique simplificado
- [x] Planner output sem agentPlan (só objective rico)
- [x] Reviewer output XML estruturado
- [x] Architect on retry com `<retry_context>` block
- [x] Reviewer on 3rd review com `<review_context attempt="3">` block
- [x] Trigger no chat — slash command `/build` (lista fixa)
- [x] Card vivo no chat (sem cost values)
- [x] Sequenciamento — sempre sequencial
- [x] Resposta final = Reviewer do último block (com `<final_block>true</final_block>`)
- [x] Exceção: último Reviewer lê todos summaries pra consolidar resposta
- [x] Bridge IN — cache pass-through (ring → DB → empty), XML, ZERO LLM
- [x] Bridge OUT — não existe como mecanismo separado (final response = chat message)
- [ ] Implementação V1
