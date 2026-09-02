services:
  - type: web
    name: bilhetes-futebol-mobile-live
    runtime: node
    plan: free
    buildCommand: ""
    startCommand: npm start
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: ODDS_API_KEY
        sync: false
      - key: API_FOOTBALL_KEY
        sync: false
      - key: FOOTBALL_DATA_TOKEN
        sync: false
      - key: CACHE_TTL_SECONDS
        value: 300
      - key: FIXTURES_CACHE_SECONDS
        value: 300
      - key: LIVE_REFRESH_SECONDS
        value: 90
      - key: LIVE_PLAYER_REFRESH_SECONDS
        value: 180
      - key: PLAYER_STATS_CACHE_SECONDS
        value: 21600
      - key: AUTO_PLAYER_MATCH_LIMIT
        value: 4
      - key: ODDS_REGIONS
        value: eu,uk
      - key: ODDS_MARKETS
        value: h2h,totals
