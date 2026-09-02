# Bilhete Plus v5.6 — carrossel estável + agressivos sempre visíveis

Esta versão corrige dois pontos da v5.5 sem mexer nas demais abas:

- **Tremida no carrossel no iPhone:** o elemento de scroll/snap agora mantém geometria fixa; apenas o cartão visual interno aumenta/diminui durante o gesto. Isso evita o jitter causado por transformar o próprio item que participa do `scroll-snap`.
- **Agressivo / Super Agressivo / Jackpot:** o carrossel passa a aparecer sempre. Quando houver base, mostra o bilhete real. Quando não houver base suficiente, mostra o nível como indisponível e sugere ampliar o filtro de ligas — sem inventar seleção.
- Os níveis agressivos continuam fundamentados; repetir seleção de outro perfil recebe penalização forte, mas não bloqueia toda a busca em ligas com poucos jogos.
- Cache do PWA atualizado para **v5.6**.

---

# Bilhete Plus v5.5 — agressivos em 3 níveis fundamentados

Esta versão corrige uma ausência da v5.4. O carrossel agressivo agora tem começo e fim e usa os três níveis decididos:

- **Agressivo:** odd alvo 3.00–5.00.
- **Super Agressivo:** odd alvo 5.00–10.00.
- **Jackpot:** odd alvo 10.00–20.00 (representa a faixa 10+ sem perseguir odds absurdas).

Os três continuam exigindo base estatística: probabilidade de segurança mínima por perna, confiabilidade alta, regras mais rígidas para mercados de jogador e rejeição de preço real muito ruim. A odd maior vem da combinação de seleções fundamentadas, não de entradas aleatórias. Se um nível não puder ser montado com base suficiente, ele não é inventado; a interface sugere ampliar o grupo de ligas.

Nos demais perfis, permanece o layout v5.4: Conservador, Moderado e Valor têm seus próprios carrosséis com até 3 bilhetes distintos.

---

# Bilhete Plus v5.4 — carrosséis na aba Bilhetes

Esta versão mantém a lógica de análise da v5.3 e altera a apresentação da aba **Bilhetes > Automáticos** para o layout aprovado: cada perfil possui seu próprio carrossel horizontal, com cartões arredondados, cartão central em destaque e cartões laterais menores durante o gesto de arrastar. Quando existem alternativas suficientes, o servidor retorna até 3 bilhetes distintos por perfil usando os mesmos filtros e critérios do perfil.

- Conservador: Bilhete 1, 2 e 3 no próprio carrossel.
- Moderado: carrossel separado.
- Valor: carrossel separado.
- Agressivo: carrossel separado.
- A rolagem vertical continua permitindo ver os demais perfis.
- As abas Jogos, Mercados, Ao vivo e Comparar odds não tiveram o layout alterado.

---

# Bilhete Plus v5.3 — perfis calibrados para taxa de acerto

Esta versão muda o gerador automático para priorizar **taxa de acerto dentro do objetivo de cada perfil**, sem transformar o Agressivo em uma cópia do Conservador.

## Principais mudanças

- **Probabilidade de segurança:** o gerador reduz levemente a probabilidade usada no bilhete quando o mercado tem menor confiabilidade. A chance de GREEN exibida nos automáticos passa a ser essa estimativa mais conservadora.
- **Conservador:** 2 pernas, odd alvo **1.40–2.00**, priorizando somente mercados de alta probabilidade de segurança.
- **Moderado:** 2–3 pernas, odd alvo **2.00–3.00**, buscando a melhor taxa de acerto possível dentro dessa faixa.
- **Valor:** 3–4 pernas, prioriza EV/preço quando há odd real, mas com filtros de probabilidade mais fortes que antes.
- **Agressivo:** 3–4 pernas, odd alvo **3.00–5.00** e linhas individualmente mais arriscadas. Evita seleções já usadas pelos perfis anteriores quando existem alternativas.
- **Diversidade inteligente:** repetir uma família de mercado recebe penalização, mas o Conservador não é obrigado a trocar uma entrada muito forte por outra claramente pior apenas para variar.
- A proteção de **pré-jogo**, filtros por liga e fallback público da v5.1 continuam ativos.

## Simulação de estresse

Foi executado um benchmark sintético de 3.000 dias, com erro proposital nas probabilidades para simular um modelo imperfeito. Não é um backtest histórico e não garante desempenho real.

| Perfil | v5.1 | v5.3 | Odd média v5.3 | Pernas médias |
|---|---:|---:|---:|---:|
| Conservador | 58.8% | **69.0%** | 1.46 | 2.00 |
| Moderado | 37.5% | **45.9%** | 2.18 | 3.00 |
| Valor | 24.1% | **43.2%** | 2.24 | 3.35 |
| Agressivo | 6.3% | **23.6%** | 3.88 | 3.44 |

No mesmo teste, o overlap exato de seleções entre os perfis da v5.3 ficou em **0%**. Isso garante que o ganho do Agressivo no teste não veio de simplesmente copiar as pernas do Conservador.

> Esses números medem uma simulação controlada. A validação importante continua sendo registrar as sugestões antes dos jogos e comparar com resultados reais ao longo de uma amostra grande.

---

# Bilhete Plus v5.1 — Championship/fallback corrigido

- A falta de créditos da The Odds API não aparece mais como erro fatal quando o fallback público conseguiu carregar a liga.
- O cliente repete automaticamente a consulta em modo `forcePublic=1` se receber erro de cota.
- Championship e demais ligas usam ESPN/TheSportsDB sem chamar a API de odds no segundo intento.
- Se restar só 1 partida pré-jogo, o app explica que não há partidas suficientes para um bilhete automático de jogos diferentes.
- Se todas as partidas já começaram/terminaram, mostra 0 pré-jogos em vez de sugerir partidas encerradas.
- Cache do PWA atualizado para v5.1 para evitar mistura de JavaScript antigo com servidor novo.


## v4.7 — proteção pré-jogo

- Bilhetes automáticos usam **somente partidas que ainda não começaram**.
- Partidas com status ao vivo, intervalo, encerrado, adiado/suspenso etc. não entram nos automáticos.
- Mesmo sem API-Football ativa, o horário de início funciona como segunda proteção.
- Por padrão, uma partida deixa de ser elegível **5 minutos antes do kickoff** (`PREMATCH_CUTOFF_MINUTES=5`).
- `buildTickets()` faz a checagem novamente, então uma partida iniciada não entra mesmo que uma fonte retorne odds atrasadas.

# Bilhete Plus v4.5

## Correção do Ao Vivo

Esta versão corrige o fluxo quando a API-Football estiver suspensa ou indisponível.

- **Buscar partidas** tenta primeiro a API-Football.
- Se ela falhar, o app usa automaticamente a **The Odds API** como fallback para listar partidas e acompanhar **placar / resultado / gols / ambas marcam**.
- **Chutes, chutes no gol, defesas, cartões, faltas, escanteios e props de jogadores** continuam exigindo uma API-Football ativa, porque a The Odds API não fornece essas estatísticas detalhadas no endpoint de placares.
- Bilhetes salvos sem `fixtureId` agora tentam resolver a partida automaticamente pela data e pelos nomes dos times ao clicar em **Acompanhar ao vivo**.
- O app aceita ids tanto da API-Football quanto do fallback da The Odds API.

> Observação de cota: o endpoint de placares da The Odds API consome créditos. O fallback consulta apenas as ligas presentes no bilhete em acompanhamento e usa cache no servidor.

---

# Bilhete Plus v4.4

Novidades desta versão:

- A antiga aba **Betano** virou **Comparar Odds**.
- Permite informar **duas casas diferentes** para o mesmo mercado.
- Compara odd justa, probabilidade implícita, EV e aponta a melhor cotação.
- As últimas comparações ficam salvas localmente no aparelho.
- O Ao Vivo agora trata conta da API-Football suspensa de forma amigável e não derruba as outras funções do app.
- Para placar, chutes, defesas, cartões e faltas ao vivo, a conta/chave da API-Football precisa estar ativa.

# Bilhete Plus v4.3

## Ajustes v4.3 — Valor 2.00–3.00 + jogadores automáticos

- **Valor:** agora é o perfil com odd combinada **entre 2.00 e 3.00**.
- Para não ficar devolvendo sempre uma odd colada em 2.00, o gerador prefere combinações no miolo da faixa (**aprox. 2.18–2.88**, alvo perto de **2.52**) quando existem opções boas. A faixa válida continua sendo 2.00–3.00.
- **Moderado:** volta a ser mais flexível e não fica preso à faixa 2.00–3.00.
- **Mercados de jogadores nos automáticos:** seguem ativados por padrão quando a `API_FOOTBALL_KEY` está configurada. O app pode usar chutes, chutes no gol, defesas do goleiro, faltas cometidas/sofridas, cartão e gol de jogador.
- O perfil **Valor tenta incluir ao menos um mercado de jogador** quando existir cobertura e uma opção compatível. Se não houver dados suficientes, o sistema não inventa a seleção.
- Para preservar o plano gratuito da API-Football, o carregamento automático continua limitado a **até 4 partidas por análise** e usa cache.
- Cache do PWA atualizado para a v4.3.

## Ajuste v4.1 — diversidade dos bilhetes

O gerador automático agora evita repetir a mesma família/linha de mercado em todas as pernas quando existem alternativas razoáveis. Exemplo: o Conservador não deve mais montar 3 jogos usando somente `Mais de 0.5 gol`/`1+ gol` se houver opções como resultado, gols totais, chutes, escanteios ou defesas com probabilidade compatível.

- Conservador: prioriza famílias diferentes no mesmo bilhete.
- Moderado e Valor: permitem alguma repetição, mas evitam a mesma linha repetida.
- Agressivo: é mais flexível, sem ignorar diversidade.
- Se realmente não existir alternativa aceitável, o sistema pode repetir para não inventar uma seleção pior.


Versão mobile/PWA do Bilhete Plus com navegação por abas, mercados avançados, montagem e avaliação de bilhetes, seleção de bilhete ativo e acompanhamento ao vivo.

## O que mudou na v4

- Abas separadas: **Jogos, Mercados, Bilhetes, Ao vivo e Betano**.
- Bilhetes automáticos realmente diferentes: **Conservador, Moderado, Valor e Agressivo**.
- O nível de **risco é calculado separadamente do perfil**.
- Botão **Selecionar bilhete**: o escolhido fica salvo em **Meus bilhetes** e pode ser definido como principal.
- **Montar meu bilhete**: escolha mercados e o app calcula chance estimada de green, risco, odd justa combinada, correlação, confiança dos dados, ponto mais frágil e EV quando uma odd total da casa é informada.
- **Acompanhar ao vivo** um bilhete salvo quando as seleções têm vínculo disponível com a API-Football.
- Mercados: 1X2, gols, ambas marcam, escanteios, cartões, chutes, chutes no gol, faltas, defesas e mercados de jogadores.
- Opção **Incluir jogadores nos automáticos**. Por padrão usa no máximo 4 partidas por análise para preservar a cota da API-Football; as consultas ficam em cache.
- Correção dos nomes das linhas de jogadores (2+, 3+, 4+ agora aparecem corretamente).

## Ligas

### Primeiras divisões
- Premier League
- La Liga
- Serie A
- Bundesliga
- Ligue 1
- Brasileirão Série A
- Saudi Pro League

### Segundas divisões principais
- Brasileirão Série B
- Championship
- La Liga 2
- Serie B Italiana
- 2. Bundesliga
- Ligue 2

Existe também o filtro **Séries B principais** para consultar o grupo todo. Como cada liga consultada consome cota da The Odds API, prefira uma competição individual quando estiver apenas testando.

## Variáveis do Render

Obrigatórias para odds:

- `ODDS_API_KEY`

Para jogadores e acompanhamento ao vivo:

- `API_FOOTBALL_KEY`

Opcional para o modo Poisson específico do Brasileirão Série A:

- `FOOTBALL_DATA_TOKEN`

Ajustes já definidos no `render.yaml`:

- `CACHE_TTL_SECONDS=300`
- `FIXTURES_CACHE_SECONDS=300`
- `LIVE_REFRESH_SECONDS=90`
- `LIVE_PLAYER_REFRESH_SECONDS=180`
- `PLAYER_STATS_CACHE_SECONDS=21600`
- `AUTO_PLAYER_MATCH_LIMIT=4`

## Atualizar o app que já está no GitHub/Render

1. Extraia o ZIP.
2. Abra a pasta `bilhete-plus`.
3. Substitua no repositório GitHub os arquivos antigos pelos arquivos desta pasta.
4. **Não envie `.env` nem `node_modules`.**
5. Faça o commit no branch `main`.
6. O Render conectado ao repositório deve iniciar um novo deploy automaticamente.
7. Espere o status ficar `Deployed` e atualize o app no celular.

O `render.yaml` preserva o nome do serviço atual (`bilhetes-futebol-mobile-live`) para não criar outro serviço/endereço no Render.

## Testar localmente

```bash
npm test
npm start
```

Depois abra `http://localhost:3000`.

> Probabilidades e odds justas são estimativas. O aplicativo não executa apostas e não garante retorno.


## v4.6 — perfis de bilhete
- Conservador: odd combinada alvo 1.40–2.00.
- Moderado: 2.00–3.00.
- Valor: sem faixa rígida; prioriza EV/preço e tende a 3–4 seleções, incluindo jogadores quando houver dados.
- Agressivo: 3.00+.
- A interface separa a odd do bilhete da odd justa. A odd justa é calculada como 1 / chance estimada de GREEN, evitando números incoerentes.

## v4.8 — filtro de liga nos bilhetes automáticos

A aba **Bilhetes > Automáticos** agora possui filtros próprios de data e competição, independentes da aba Jogos. Você pode gerar sugestões somente para:

- 5 grandes ligas (Premier League, La Liga, Serie A, Bundesliga e Ligue 1)
- uma liga individual, como Premier League
- Séries B principais
- Brasileirão Série A/B, Championship, La Liga 2, Serie B Italiana, 2. Bundesliga, Ligue 2 e Saudi Pro League

Ao trocar a competição, toque em **Gerar sugestões**. O gerador usa exclusivamente as partidas da seleção escolhida e continua bloqueando jogos já iniciados, encerrados ou a menos de 5 minutos do início.


## v4.9 — tratamento de cota/API
- Remove dados antigos da tela quando uma nova consulta falha.
- The Odds API sem créditos agora exibe aviso curto em vez de JSON bruto.
- O contador volta para 0 e não reaproveita os 5 jogos da consulta anterior ao trocar de liga.
- Ajuste de safe-area no topo para iPhone/PWA.

## v5.0 — fallback sem cota de odds
Se a The Odds API estiver sem créditos, o app não zera mais automaticamente as ligas. Ele tenta carregar o calendário por uma fonte pública (ESPN público; TheSportsDB como segunda tentativa) e usa somente **odds justas estimadas**, com confiança reduzida. Odds reais continuam identificadas separadamente e nunca são inventadas.


## v5.3 — Agressivo fundamentado

O perfil Agressivo deixou de perseguir odds altas por si só. Agora cada perna precisa ter probabilidade de segurança >= 50%, confiabilidade >= 78% (>= 82% para mercados de jogador), e odds reais muito abaixo do modelo (EV < -5%) são rejeitadas. Não existe fallback relaxado: se não houver combinação com base suficiente na faixa 3.00–5.00, o Bilhete Plus não gera o Agressivo. A interface mostra também o nível de **Fundamentação** do bilhete.
