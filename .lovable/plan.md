# Por que aparece R$ 380,99 — e correção do relatório

## O que eu conferi no banco (dados reais de agosto/2026, PJ Erik)

**Soma das tarefas externas = R$ 770,99** — 15 tarefas concluídas. Esse número está certo.

**Todas as 15 tarefas TÊM pagamento gerado.** A soma real dos pagamentos vinculados é **R$ 560,99**, não R$ 380,99. Existem dois problemas somando R$ 390 de diferença:

### Problema 1 — Pagamento cai no mês seguinte (R$ 180)

O relatório escolhe os pagamentos do mês pelo **vencimento** (`due_date`), e o vencimento é sempre "criação + 7 dias". Os dois pagamentos gerados em 26/08 ficaram com vencimento **02/09**:

| Tarefa | Pagamento | Criado | Vencimento |
|---|---|---|---|
| KIT 5 un e 10 un | R$ 120,00 | 26/08 | 02/09 |
| AMBAS Tiktok + Shopee + ML 3 placas | R$ 60,00 | 26/08 | 02/09 |

Como o vencimento é setembro, o relatório de agosto não os enxerga — por isso as duas tarefas aparecem com o alerta "sem pagamento registrado" e por isso a soma cai de 560,99 para **380,99**. O pagamento existe; só está sendo contado no mês errado.

### Problema 2 — Pagamento gerado com valor menor que a tarefa (R$ 210)

Dois pagamentos foram criados com valor abaixo do valor da tarefa:

| Tarefa | Valor da tarefa | Valor do pagamento | Falta |
|---|---|---|---|
| AMBAS Tiktok + ML (com subtarefas) | R$ 135,00 | R$ 45,00 | R$ 90,00 |
| AMBAS Tiktok + Shopee + ML 3 placas | R$ 180,00 | R$ 60,00 | R$ 120,00 |

Provavelmente o pagamento foi gerado quando a tarefa ainda valia menos (antes de somar as subtarefas/placas), e o valor da tarefa foi atualizado depois. Hoje o relatório não avisa nada nesse caso — só some da conta.

---

## O que vou mudar (só leitura e apresentação, nada é apagado)

### 1. Contar o pagamento no mesmo mês da tarefa

Quando o pagamento está **vinculado a uma tarefa**, ele passa a pertencer ao mês da tarefa (a mesma "base do mês" já usada hoje: conclusão → aprovação → cancelamento → criação), e não ao vencimento. Pagamentos avulsos (sem tarefa) continuam pelo vencimento como hoje.

Efeito imediato: as duas tarefas de 26/08 deixam de mostrar "sem pagamento" e a soma dos vinculados vira R$ 560,99.

### 2. Mostrar pagamento parcial em vez de escondê-lo

Na conferência do mês e no card da tarefa, quando o pagamento vinculado for menor (ou maior) que o valor da tarefa:

```text
⚠ Pagamento gerado de R$ 45,00 para tarefa de R$ 135,00 — faltam R$ 90,00
```

E a conferência ganha uma linha nova separando os dois tipos de problema:

```text
Soma das tarefas externas .............. R$ 770,99
Soma dos pagamentos vinculados ......... R$ 560,99
Pagamentos avulsos ..................... R$   0,00
Diferença por pagamento parcial ........ R$ 210,00   ← lista as tarefas
Diferença por tarefa sem pagamento ..... R$   0,00   ← lista as tarefas
```

Assim a diferença sempre aponta a causa, em vez de só mostrar um número.

### 3. Ação de correção (sem apagar nada)

No card da tarefa com pagamento parcial, um botão **"Ajustar valor do pagamento para R$ 135,00"** que só atualiza o `amount` do pagamento pendente existente. Nenhum registro é criado em duplicidade nem excluído. Fica disponível apenas para Admin/Gestor e só enquanto o pagamento estiver pendente.

### 4. Prevenir daqui pra frente

O vencimento do pagamento gerado automaticamente passa a ser **o último dia do mês da tarefa** (ou criação + 7 dias, o que for maior), para nunca mais escapar do mês em que o serviço foi feito.

---

## Detalhes técnicos

**Arquivo alterado:** `src/routes/_app.reports.tsx`
- O filtro `pjPayments`/`monthPayments` passa a usar o mês da tarefa vinculada quando `task_id` existe.
- Novos campos na conferência: `diffPartial`, `partialTasks`, além dos já existentes `diff`/`unmatchedTasks`.
- Aviso de pagamento parcial no card da tarefa (visão gestor e visão PJ) e no PDF.
- Botão de ajuste de valor (UPDATE em `payments.amount`, apenas status `pending`).

**Migration (aditiva):** ajuste do `due_date` dentro de `auto_create_payment_on_done()` para o fim do mês de referência. Só afeta pagamentos futuros; nenhum registro existente é alterado pela migration.

**Preservação:** nenhum `DELETE`, nenhum `DROP`, nenhum `UPDATE` automático em tarefas, pagamentos ou fechamentos — o único UPDATE é o botão manual de ajuste de valor.
