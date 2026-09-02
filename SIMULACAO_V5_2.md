# Simulação dos perfis — Bilhete Plus v5.2

Benchmark sintético com 3.000 dias e 12 jogos por dia. As probabilidades verdadeiras do teste foram perturbadas para baixo conforme a confiabilidade de cada mercado, simulando erro de calibração.

| Perfil | Taxa esperada v5.1 | Taxa esperada v5.2 | Chance mostrada v5.2 | Odd média v5.2 | Pernas médias |
|---|---:|---:|---:|---:|---:|
| Conservador | 58.8% | 69.0% | 68.0% | 1.46 | 2.00 |
| Moderado | 37.5% | 45.9% | 44.0% | 2.18 | 3.00 |
| Valor | 24.1% | 43.2% | 41.4% | 2.24 | 3.35 |
| Agressivo | 6.3% | 23.6% | 21.5% | 3.88 | 3.44 |

Overlap exato entre qualquer par de perfis na v5.2: 0% no benchmark.

**Importante:** simulação sintética não substitui backtest histórico. O objetivo deste teste é comparar a lógica antiga e a nova sob o mesmo cenário controlado.
