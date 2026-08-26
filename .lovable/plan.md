# Alinhar "Pagamentos pendentes" do Dashboard com o Relatório PJ

## O que está acontecendo (verificado no banco)

O card do Dashboard mostra **176 pendentes / R$ 1.737,00**. Esse número não fecha com o relatório porque ele conta coisas que o relatório não considera:

- **123 dos 176 pagamentos pendentes têm valor R$ 0,00** (tarefas sem valor de serviço). Eles inflam a contagem, mas não somam nada — por isso "176" parece enorme perto de R$ 1.737.
- **O card não filtra mês nenhum.** Ele soma tudo: junho (R$ 0), julho (R$ 236), agosto (R$ 1.321) e setembro (R$ 180). O relatório é sempre mês a mês.
- **Meses já fechados/pagos ainda têm 5 pagamentos com status "pendente".** Abril a julho estão com fechamento `paid`, mas alguns pagamentos individuais nunca mudaram de status — o relatório já os trata como pagos pelo fechamento, o Dashboard não.
- **Critério de mês diferente.** O Dashboard agrupa por `due_date` do pagamento; o relatório agrupa pela data de referência da tarefa (conclusão/aprovação). Um pagamento de tarefa de agosto com vencimento em setembro cai em meses diferentes nas duas telas.
- **O card mostra o total de todos os PJs**, mesmo para quem só deveria ver o próprio (o PJ vê o total geral da empresa hoje).

Resumo: agosto no relatório soma R$ 1.083,00 (tarefas externas do mês) enquanto o card soma R$ 1.321,00 de pagamentos com vencimento em agosto. São bases diferentes, não um erro de conta.

## O que fazer

1. **Usar a mesma base do relatório no card.** O Dashboard passa a considerar o mês corrente e a mesma data de referência da tarefa usada no relatório PJ, em vez de `due_date` solto.
2. **Ignorar pagamentos de valor zero na contagem.** A contagem passa a refletir pagamentos que realmente têm valor; os de R$ 0,00 deixam de poluir o número.
3. **Excluir meses já fechados/pagos.** Pagamentos pertencentes a um fechamento com status `closed` ou `paid` não entram mais como pendentes.
4. **Respeitar o papel do usuário.** Admin/Gestor veem o total da empresa; PJ/membro vê apenas os próprios pagamentos.
5. **Deixar o card explícito.** Rótulo passa a "Pagamentos pendentes (mês atual)" com subtítulo do valor e link direto para o relatório do mês, para que os dois números sejam comparáveis à vista.

Nada é apagado nem alterado no banco: apenas a leitura/exibição do Dashboard muda.

## Detalhes técnicos

- Arquivo: `src/routes/_app.dashboard.tsx` (somente frontend).
- Consulta atual `payments.select(count).eq("status","pending")` é substituída por uma consulta que traz `amount, due_date, beneficiary_user_id, task_id` do mês corrente, filtra `amount > 0`, remove beneficiários com `monthly_closures` do mês em `closed`/`paid`, e aplica `beneficiary_user_id = user.id` quando não for admin/gestor (`isManagerOrAdmin` do `auth-context`).
- Para casar com o relatório, o mês do pagamento é resolvido pela tarefa vinculada (mesma ordem `completed_at → approved_at → canceled_at → created_at`) quando `task_id` existir; caso contrário cai no `due_date`.
- Nenhuma migração de banco, nenhum `UPDATE`/`DELETE`.

## Opcional (não incluído, confirmar se quer)

Uma rotina para marcar como `paid` os 5 pagamentos ainda pendentes em meses já fechados — isso *altera* dados, então fica fora até você aprovar explicitamente.
