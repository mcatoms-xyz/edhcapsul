var MTG_ACHIEVEMENTS = {
  "definitions": [
    {
      "id": "first-blood",
      "name": "First Blood",
      "description": "Win your first game",
      "icon": "\ud83d\udde1\ufe0f",
      "condition": "player.stats.totalWins >= 1"
    },
    {
      "id": "diversified",
      "name": "Diversified Portfolio",
      "description": "Win with 5 different decks",
      "icon": "\ud83d\udcca",
      "condition": "player.stats.uniqueDeckWins >= 5"
    },
    {
      "id": "kingslayer",
      "name": "Kingslayer",
      "description": "Beat the #1 ranked player",
      "icon": "\ud83d\udc51",
      "condition": "special"
    },
    {
      "id": "salt-mine",
      "name": "Salt Mine",
      "description": "Play 3 games rated 5 salt",
      "icon": "\ud83e\uddc2",
      "condition": "special"
    },
    {
      "id": "iron-throne",
      "name": "Iron Throne",
      "description": "Win 3 games in a row",
      "icon": "\ud83e\ude91",
      "condition": "player.stats.currentStreak >= 3"
    },
    {
      "id": "jank-tank",
      "name": "Jank Tank",
      "description": "Win with a deck valued under $50",
      "icon": "\ud83d\uddd1\ufe0f",
      "condition": "special"
    },
    {
      "id": "one-more-game",
      "name": "One More Game",
      "description": "Win the last game of the night 3 times",
      "icon": "\ud83c\udf19",
      "condition": "special"
    },
    {
      "id": "nemesis",
      "name": "Nemesis",
      "description": "Beat the same player 5 times in a row",
      "icon": "\ud83d\udc80",
      "condition": "special"
    }
  ],
  "unlocked": {
    "bryan": [
      {
        "achievementId": "first-blood",
        "date": "2026-03-28",
        "gameId": "g1774661381776",
        "note": "Won Game 1 with Szarel, Genesis Shepherd"
      },
      {
        "achievementId": "iron-throne",
        "date": "2026-04-11",
        "gameId": "g1775890997405",
        "note": "Three consecutive wins: Szarel (G7), Kardur/Chucky (G8), Betor (G9)"
      }
    ],
    "adam": [
      {
        "achievementId": "first-blood",
        "date": "2026-03-28",
        "gameId": "g1774680161108",
        "note": "Won Game 5 with Gilanra, Caller of Wirewood"
      }
    ],
    "rich": [
      {
        "achievementId": "first-blood",
        "date": "2026-03-28",
        "gameId": "g1774667570489",
        "note": "Won Game 2 with Kiki-Jiki (infinite combo, but he asked permission!)"
      }
    ]
  }
};
