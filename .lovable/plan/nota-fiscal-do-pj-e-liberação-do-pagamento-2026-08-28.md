# Nota fiscal do PJ e liberação do pagamento

Fluxo novo: **Mês fechado → PJ envia a nota fiscal → Admin confere → marca como Pago**.
Nada é apagado; tudo é adicional ao que já existe.

## 1. Dados de cobrança no perfil do PJ

Novos campos no perfil (visíveis/editáveis pelo próprio PJ e por Admin):

- CNPJ
- Razão social
- Tipo de chave PIX (CPF/CNPJ, e-mail, telefone, aleatória) e a chave
- Banco (opcional, texto livre)

Aviso no perfil quando o PJ ainda não preencheu a chave PIX.

## 2. Upload da nota fiscal (por mês)

No **Relatório PJ** (visão do PJ), quando o mês está *Fechado*:

- Bloco "Nota fiscal do mês" com botão de envio (PDF, XML ou imagem)
- Arquivo guardado em pasta privada por usuário; só o próprio PJ e Admin/Gestor conseguem abrir
- Mostra nome do arquivo, data do envio e botão para baixar/substituir enquanto não estiver pago
- Depois de pago, a nota fica travada (só leitura)

O fechamento passa a ter status de nota: *pendente → enviada*.

## 3. Liberação do pagamento pelo Admin

Na visão de gestão do Relatório PJ, cada PJ do mês mostra:

- Selo "NF pendente" ou "NF enviada" com link para abrir o arquivo
- Botão **Marcar como pago** só habilita quando a nota do mês foi enviada
  (com aviso explicando o motivo quando estiver bloqueado)
- A regra também é garantida no banco, não só na tela

## 4. Pagamento via PIX (sem integração bancária)

Conforme escolhido: o sistema **gera valor + chave PIX**, o pagamento é feito no banco/app do Admin.

Para cada PJ fechado no mês:

- Cartão de pagamento com: nome, CNPJ, valor total do mês, chave PIX e botão "Copiar chave"
- QR Code / código "copia e cola" PIX gerado no próprio sistema com valor e chave já preenchidos
- Botão "Exportar lote do mês" (CSV com PJ, CNPJ, chave PIX, valor, mês) para conferência ou importação no banco

Sem API bancária: nenhuma credencial de banco é necessária e o dinheiro sai sempre pelo app do banco do Admin. Se no futuro quiser pagamento automático, dá para plugar um PSP (Asaas, Cora, Inter) sobre essa mesma estrutura.

## Detalhes técnicos

- Migração aditiva: colunas `cnpj`, `legal_name`, `pix_key_type`, `pix_key`, `bank_name` em `profiles`;
  colunas `invoice_path`, `invoice_uploaded_at`, `invoice_name` em `monthly_closures`.
- Bucket privado `invoices` com policies por `auth.uid()` na primeira pasta do caminho; leitura extra para Admin/Gestor.
- Trigger em `monthly_closures` impedindo `status = 'paid'` sem `invoice_path`.
- Geração do payload PIX (BR Code EMV) no front, sem dependência externa de pagamento.
- Telas alteradas: `src/routes/_app.profile.tsx`, `src/routes/_app.reports.tsx` (PJView e visão gestão).
