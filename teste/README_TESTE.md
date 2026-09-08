# Pasta `teste` — experimento atual do Bilhete Plus

Base: versão funcional principal v5.7.3.

## Regra de segurança
- O projeto principal permanece congelado como backup funcional.
- Toda alteração nova é feita somente dentro de `teste/`.
- Só depois de aprovação explícita as mudanças são promovidas para a principal.
- Após a promoção, `teste/` volta a espelhar a nova base funcional.

## Experimento atual
Filtro de competições para os bilhetes automáticos do Mercado dos Favoritos:
- mantém futebol profissional de clubes;
- exclui NCAA/futebol universitário;
- exclui competições explicitamente amadoras;
- exclui base, academias e equipes/ligas de reservas (U17/U18/U19/U20/U21/U23 etc.);
- preserva as exclusões já existentes de Champions League, Libertadores e Sul-Americana no Mercado dos Favoritos.

Enquanto `teste/server.js` existir, `npm start` abre a versão de teste.

## Teste v5.8.0 — Jogadores + bilhete flutuante
- Somente a pasta `teste` foi alterada; a raiz permanece como backup funcional aprovado.
- Jogadores agora usa prévia de escalação em campo e cards individuais com foto/posição, probabilidades, odd justa e linhas principais.
- Selecionar um mercado não troca mais a aba automaticamente.
- Meu bilhete virou botão flutuante persistente entre as abas; ao tocar, abre uma gaveta com seleções, avaliação, odd da casa, limpar e salvar.
- Saldo/depósito não foram adicionados.


## v5.8.2 — Faixa de horário nos Automáticos
- Novo filtro: Dia todo / Manhã / Tarde / Noite.
- Manhã: 06:00–11:59; Tarde: 12:00–17:59; Noite: 18:00–05:59 (horário de São Paulo).
- O servidor filtra antes de montar os cinco perfis.
- Alteração restrita à pasta `teste`; principal permanece como backup.


## v5.8.4 — 5 grandes ligas restauradas
- O grupo `5 grandes ligas` voltou aos seletores de Jogos, Automáticos e Apenas um jogo.
- O grupo usa Premier League, La Liga, Serie A, Bundesliga e Ligue 1.
- O backend já suportava `all-major`; a atualização restaura o acesso pela interface sem alterar a raiz principal.


## Teste v5.8.5 — filtro masculino nas 5 Grandes Ligas
- Corrige o fallback diário do TheSportsDB que podia aceitar competições femininas por correspondência parcial de nome.
- Eventos marcados como Female/Women e nomes como Liga F, WSL, Frauen, Femminile e Division 1 Féminine são descartados das ligas masculinas.
- Exemplo protegido por teste: Valencia x Madrid CFF não pode entrar como La Liga masculina.
- Madrid CFF não é renomeado para Real Madrid; a partida incorreta é removida.


## Teste v5.8.6 — Futebol feminino
- Adiciona a opção **Futebol feminino** aos seletores de liga do ambiente de teste.
- Ao selecionar essa opção, a descoberta usa o calendário público do dia e mantém somente partidas identificadas como futebol feminino.
- Os bilhetes automáticos são montados apenas com essas partidas.
- Nenhuma alteração foi feita no projeto principal.


## Teste v5.8.8 — Incluir feminino + MLS
- Mantém a opção exclusiva **Futebol feminino**.
- Adiciona o checkbox **Incluir futebol feminino** nos Automáticos, desmarcado por padrão.
- Desmarcado: filtros normais removem partidas femininas.
- Marcado: filtros normais podem acrescentar partidas femininas compatíveis com a liga/grupo escolhido.
- Restaura **MLS** como liga individual no seletor, com ESPN pública (`usa.1`) e The Odds API (`soccer_usa_mls`) quando disponível.
- Tudo permanece somente dentro de `teste/`.

## Teste v5.8.8 — Favoritismo realista
- Mercado dos Favoritos não trata mais mando como sinônimo de favoritismo.
- Força estrutural do clube, forma/PPG, saldo por jogo e mando pequeno compõem o favorito.
- Confronto direto só entra quando a fonte realmente fornecer H2H; sem dado, fica neutro.
- O lado favorito fica registrado em `favoriteSide`/`favoriteTeam`.
- Nos automáticos do Mercado dos Favoritos, mercados específicos de time respeitam o lado definido como favorito; mercados globais continuam disponíveis.

## Teste v5.8.9 — Diversificação dos bilhetes automáticos
- Mantém os mesmos perfis, faixas de odd, filtros e layout aprovados.
- Bilhete 1 prioriza composição equilibrada (resultado/gols/ambas/equipe).
- Bilhete 2 prioriza combinações coerentes de mesmo jogo e mercados de jogadores quando houver base.
- Bilhete 3 prioriza famílias diferentes (escanteios/cartões/faltas/defesas/chutes) para evitar três cartões quase iguais.
- Nenhum mercado é forçado: as regras de probabilidade, confiabilidade, correlação e faixa de odd continuam valendo.


## Teste v5.8.10 — Grandes copas
- Adiciona o grupo **Grandes copas** com as 6 competições pedidas: Champions League, Europa League, Conference League, Libertadores, Sul-Americana e Copa do Brasil.
- As seis também aparecem isoladamente nos seletores de Jogos, Automáticos e Apenas um jogo.
- Champions, Europa, Conference, Libertadores e Sul-Americana usam The Odds API quando disponível e calendário público como fallback.
- Copa do Brasil usa calendário público no fluxo atual e continua com odds justas/estimadas quando não houver fonte real compatível.
- Alteração restrita à pasta `teste`.
