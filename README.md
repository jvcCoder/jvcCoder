# Finanças da Família

Web app (PWA) para o casal controlar as finanças juntos pelo iPhone: o que entra, o que sai, quando, quanto e em qual categoria — com painel interativo, projeção dos próximos meses e metas de poupança.

**No ar:** https://financas-familia-delta-five.vercel.app (Vercel, projeto `financas-familia`) · banco Supabase `financas-familia` (São Paulo).

## O que o app faz

| Área | O que entrega |
|---|---|
| **Início (painel)** | Saldo do mês, previsão de fechamento, entradas/saídas vs mês anterior, taxa de poupança, alertas em linguagem simples, para onde foi o dinheiro por categoria, orçamentos com ritmo do mês, histórico de 6 meses, ritmo de gastos vs mês anterior, quem lançou o quê, progresso das metas |
| **Lançamentos** | Lista por dia, busca, filtros por tipo, categoria e pessoa. Toque para editar ou excluir |
| **+ (novo lançamento)** | Entrada ou saída, categoria, data, forma de pagamento, **parcelado em até 24x** (gera uma parcela por mês) e **"repete todo mês"** (vira conta fixa) |
| **Projeção** | 6, 12 ou 24 meses à frente: salários e contas fixas + parcelas já assumidas + média do gasto do dia a dia. Simulador "E se…?" (gastar X% menos, renda extra, saldo atual, separar dinheiro das metas) |
| **Metas** | Valor, prazo, quanto já tem e rendimento anual. Mostra quanto guardar por mês, se está no ritmo e **se todas as metas cabem na sobra mensal**. Simulador "tenho um prazo" / "tenho um valor por mês" |
| **Ajustes** | Código de convite da casa, contas fixas e salários, categorias com limite mensal, exportação CSV para Excel |

Os dois membros da casa veem e alimentam os mesmos dados; quando um lança, o app do outro atualiza sozinho (tempo real).

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes dos cálculos financeiros
npm run build      # gera a versão de produção em dist/
```

Sem configuração de nuvem, o app abre em **modo demonstração**: os dados ficam só no aparelho e dá para explorar com dados de exemplo.

## Colocar no ar para o casal (≈15 min)

1. **Banco de dados (Supabase, plano gratuito)**
   - Crie um projeto em [supabase.com](https://supabase.com) só para este app.
   - Em *SQL Editor*, rode o arquivo `supabase/migrations/20261025000000_financas_familia.sql`.
   - Em *Project Settings → API*, copie a **URL** e a **chave pública (anon/publishable)**.
   - Em *Authentication → URL Configuration*, coloque o endereço do app publicado como *Site URL*.
2. **Hospedagem (Vercel, plano gratuito)**
   - Importe este repositório na Vercel (framework: Vite).
   - Em *Environment Variables*, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores do passo 1.
3. **No iPhone de cada um**
   - Abra o endereço no **Safari** → Compartilhar → **Adicionar à Tela de Início**.
   - Um cria a conta e a casa; em *Ajustes* aparece o **código de convite**.
   - O outro cria a própria conta e escolhe **"Tenho um código"**.

Para desenvolver local apontando para a nuvem, copie `.env.example` para `.env.local` e preencha.

## Segurança

- Cada tabela tem *Row Level Security*: só membros da casa leem ou alteram os dados dela.
- Criar casa e entrar por código são funções no banco (`create_household`, `join_household`); ninguém consegue se inserir numa casa sem o código.
- A chave usada no app é a pública do Supabase — é feita para ficar no navegador. Nunca coloque a `service_role` no app.

## Como os cálculos funcionam

- **Gasto do dia a dia** = saídas sem conta fixa e sem parcela. A projeção usa a média dos últimos 3 meses completos (ou o ritmo do mês atual, enquanto não houver histórico).
- **Previsão do mês atual** = o que já aconteceu + contas fixas ainda não lançadas + gasto médio dos dias que faltam.
- **Rendas avulsas** (freelas, reembolsos) não entram na projeção dos meses futuros — de propósito, para não contar com dinheiro incerto. Use "Renda extra por mês" no simulador se quiser incluir.
- **Metas** usam juros compostos mensais a partir do rendimento anual informado.

Os cálculos ficam em `src/lib/finance.ts` e têm testes em `src/lib/finance.test.ts`.

## Estrutura

```
src/
  lib/finance.ts      cálculos: totais, pendências, projeção, metas, alertas
  lib/backend.ts      acesso aos dados: Supabase (nuvem) ou localStorage (demo)
  lib/seed.ts         categorias padrão e dados de exemplo
  pages/              Início, Lançamentos, Projeção, Metas, Ajustes
  components/         formulários, gráficos e componentes de interface
supabase/migrations/  esquema do banco, segurança e tempo real
```
