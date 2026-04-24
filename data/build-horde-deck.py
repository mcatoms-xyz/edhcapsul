#!/usr/bin/env python3
"""
Horde Deck Builder — Fetches tribal creature/token data from Scryfall
and generates horde.js data files for MTGCapsul Game Night.

Usage:
  python3 build-horde-deck.py                     # Rebuild all configured tribes
  python3 build-horde-deck.py zombie              # Build just zombie
  python3 build-horde-deck.py minotaur cat zombie # Build specific tribes

Output: data/horde.js (multi-deck format with HORDE_DECKS object)
"""

import json
import sys
import time
import urllib.request
import urllib.parse

SCRYFALL_API = "https://api.scryfall.com"

# Tribal configurations: tribe_key → { name, icon, type_line_query, token_query }
TRIBES = {
    "zombie": {
        "name": "Zombie Horde",
        "icon": "🧟",
        "creature_query": "type:creature type:zombie -is:token",
        "token_query": "is:token type:creature type:zombie",
        "description": "A relentless army of the undead. Survive the zombie onslaught.",
    },
    "minotaur": {
        "name": "Minotaur Stampede",
        "icon": "🐂",
        "creature_query": "type:creature type:minotaur -is:token",
        "token_query": "is:token type:creature type:minotaur",
        "description": "The labyrinth unleashes its fury. Horns, hooves, and bloodlust.",
    },
    "cat": {
        "name": "Cat Swarm",
        "icon": "🐱",
        "creature_query": "type:creature type:cat -is:token",
        "token_query": "is:token type:creature type:cat",
        "description": "Cute but deadly. The clowder descends with claws out.",
    },
    "phyrexian": {
        "name": "Phyrexian Invasion",
        "icon": "⚙️",
        "creature_query": "type:creature type:phyrexian -is:token",
        "token_query": "is:token type:creature type:phyrexian",
        "description": "All will be one. The machine orthodoxy marches to complete the grand work.",
    },
    "sliver": {
        "name": "Sliver Hive",
        "icon": "🦠",
        "creature_query": "type:creature type:sliver -is:token",
        "token_query": "is:token type:creature type:sliver",
        "description": "They share everything — strength, speed, and the hunger to consume.",
    },
    "eldrazi": {
        "name": "Eldrazi Incursion",
        "icon": "👁",
        "creature_query": "type:creature type:eldrazi -is:token",
        "token_query": "is:token type:creature type:eldrazi",
        "description": "Reality buckles as the blind eternities spill through. Nothing is sacred.",
    },
    "fungus": {
        "name": "Fungus Colony",
        "icon": "🍄",
        "creature_query": "type:creature (type:fungus or type:saproling) -is:token",
        "token_query": "is:token type:creature (type:fungus or type:saproling)",
        "tribe_types": ["fungus", "saproling"],
        "description": "The spore cloud spreads. The forest floor crawls with life that shouldn't be.",
    },
    "scarecrow": {
        "name": "Scarecrow Field",
        "icon": "🌾",
        "creature_query": "type:creature type:scarecrow -is:token",
        "token_query": "is:token type:creature type:scarecrow",
        "description": "They were supposed to guard the fields. Now the fields guard nothing.",
    },
    "dragon": {
        "name": "Dragon Assault",
        "icon": "🐉",
        "creature_query": "type:creature type:dragon -is:token",
        "token_query": "is:token type:creature type:dragon",
        "description": "Fire rains from the sky. The dragon flights descend.",
    },
}

# Tribal sorcery queries — thematic spells for each tribe
TRIBAL_SORCERIES = {
    "zombie": 'type:sorcery oracle:"zombie" -type:creature',
    "minotaur": 'type:sorcery (oracle:"minotaur" or oracle:"charge" or oracle:"trample")',
    "cat": 'type:sorcery (oracle:"cat" or oracle:"token" oracle:"creature")',
    "phyrexian": 'type:sorcery (oracle:"phyrexian" or oracle:"proliferate" or oracle:"infect")',
    "sliver": 'type:sorcery (oracle:"sliver" or oracle:"all creatures")',
    "eldrazi": 'type:sorcery (oracle:"eldrazi" or oracle:"annihilator" or oracle:"exile")',
    "fungus": 'type:sorcery (oracle:"saproling" or oracle:"fungus" or oracle:"spore" or oracle:"token" oracle:"creature")',
    "scarecrow": 'type:sorcery (oracle:"scarecrow" or oracle:"artifact creature" or oracle:"-1/-1" or oracle:"wither")',
    "dragon": 'type:sorcery (oracle:"dragon" or oracle:"fire" or oracle:"damage each")',
}


def scryfall_search(query, max_results=100):
    """Search Scryfall and return up to max_results cards."""
    cards = []
    url = f"{SCRYFALL_API}/cards/search?q={urllib.parse.quote(query)}&unique=cards&order=edhrec&dir=desc"

    while url and len(cards) < max_results:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MTGCapsul-HordeDeckBuilder/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
                for card in data.get("data", []):
                    if len(cards) >= max_results:
                        break
                    cards.append(card)
                url = data.get("next_page") if data.get("has_more") else None
        except Exception as e:
            print(f"  ⚠ Scryfall error: {e}")
            break
        time.sleep(0.1)  # Scryfall rate limit: 10 req/sec

    return cards


def card_to_entry(card):
    """Convert a Scryfall card to our horde data format."""
    image_url = ""
    if "image_uris" in card:
        image_url = card["image_uris"].get("normal", "")
    elif "card_faces" in card and len(card["card_faces"]) > 0:
        face = card["card_faces"][0]
        image_url = face.get("image_uris", {}).get("normal", "")

    return {
        "name": card.get("name", "Unknown"),
        "typeLine": card.get("type_line", ""),
        "oracleText": card.get("oracle_text", ""),
        "scryfallId": card.get("id", ""),
        "imageUrl": image_url,
        "power": card.get("power", ""),
        "toughness": card.get("toughness", ""),
        "cmc": card.get("cmc", 0),
        "isToken": "token" in card.get("type_line", "").lower(),
    }


def build_tribe(tribe_key):
    """Build a horde deck for a given tribe."""
    config = TRIBES[tribe_key]
    print(f"\n{'='*50}")
    print(f"  Building: {config['icon']}  {config['name']}")
    print(f"{'='*50}")

    # Fetch tokens
    print(f"  Fetching tokens: {config['token_query']}")
    raw_tokens = scryfall_search(config["token_query"], max_results=30)
    tokens = [card_to_entry(c) for c in raw_tokens if card_to_entry(c)["imageUrl"]]

    # Filter out double-faced tokens where the primary face isn't on-tribe
    # e.g. "Wurm // Saproling" has a wurm front face — not a saproling token
    tribe_types = [t.strip() for t in config.get("tribe_types", [tribe_key])]
    def is_on_tribe(entry):
        type_line = entry["typeLine"].lower()
        if "//" not in type_line:
            return True  # single-faced, Scryfall already filtered by type
        front_face = type_line.split("//")[0].strip()
        return any(t in front_face for t in tribe_types)

    before = len(tokens)
    tokens = [t for t in tokens if is_on_tribe(t)]
    if len(tokens) < before:
        print(f"  → {before} tokens found, {before - len(tokens)} off-tribe double-faced filtered out")
    print(f"  → {len(tokens)} tokens with images")

    if len(tokens) == 0:
        print(f"  ⚠ No tokens found! Trying broader search...")
        raw_tokens = scryfall_search(f"is:token type:creature oracle:\"{tribe_key}\"", max_results=20)
        tokens = [card_to_entry(c) for c in raw_tokens if card_to_entry(c)["imageUrl"]]
        print(f"  → {len(tokens)} tokens with broader search")

    # Fetch creatures (non-token)
    print(f"  Fetching creatures: {config['creature_query']}")
    raw_creatures = scryfall_search(config["creature_query"], max_results=60)
    creatures = [card_to_entry(c) for c in raw_creatures if card_to_entry(c)["imageUrl"]]
    # Keep top 25-35 by EDHREC rank (already sorted)
    target_creatures = min(35, max(20, len(creatures)))
    creatures = creatures[:target_creatures]
    print(f"  → {len(creatures)} creatures (singleton)")

    # Fetch thematic sorceries
    sorc_query = TRIBAL_SORCERIES.get(tribe_key, f'type:sorcery oracle:"{tribe_key}"')
    print(f"  Fetching sorceries: {sorc_query}")
    raw_sorceries = scryfall_search(sorc_query, max_results=20)
    sorceries = [card_to_entry(c) for c in raw_sorceries if card_to_entry(c)["imageUrl"]]
    target_sorceries = min(15, len(sorceries))
    sorceries = sorceries[:target_sorceries]
    print(f"  → {len(sorceries)} sorceries")

    non_tokens = creatures + sorceries
    print(f"\n  TOTAL: {len(tokens)} token types + {len(non_tokens)} non-tokens")
    print(f"  Deck at 4 players: ~60 tokens + {len(non_tokens)} singletons = ~{60 + len(non_tokens)} cards")

    return {
        "name": config["name"],
        "icon": config["icon"],
        "description": config["description"],
        "rules": [
            "The Horde has no life total — damage mills cards from its deck",
            "At the start of the Horde's turn, flip cards until a non-token is revealed",
            "All tokens enter with haste and attack immediately",
            "Non-token creatures enter with haste and attack",
            "Sorceries resolve automatically when flipped",
            f"Players share a life total of 20 × number of players",
            "Players win when the Horde deck is empty and all Horde creatures are dead",
        ],
        "tokens": tokens,
        "nonTokens": non_tokens,
    }


def main():
    tribes_to_build = sys.argv[1:] if len(sys.argv) > 1 else list(TRIBES.keys())

    # Validate tribe names
    for t in tribes_to_build:
        if t not in TRIBES:
            print(f"Unknown tribe: {t}")
            print(f"Available: {', '.join(TRIBES.keys())}")
            sys.exit(1)

    decks = {}
    for tribe in tribes_to_build:
        decks[tribe] = build_tribe(tribe)
        time.sleep(0.2)

    # Write output
    output_path = "horde.js"
    print(f"\n\nWriting {len(decks)} horde decks to {output_path}...")

    js_lines = []
    js_lines.append("// MTG Horde Mode — Multi-Tribal Decks")
    js_lines.append(f"// Generated by build-horde-deck.py on {time.strftime('%Y-%m-%d')}")
    js_lines.append(f"// Tribes: {', '.join(decks.keys())}")
    js_lines.append("")

    # Write legacy MTG_HORDE (zombie or first deck) for backward compat
    first_key = "zombie" if "zombie" in decks else list(decks.keys())[0]
    js_lines.append(f"var MTG_HORDE = {json.dumps(decks[first_key], indent=2)};")
    js_lines.append("")

    # Write multi-deck object
    js_lines.append(f"var HORDE_DECKS = {json.dumps(decks, indent=2)};")

    with open(output_path, "w") as f:
        f.write("\n".join(js_lines))

    total_cards = sum(len(d["tokens"]) + len(d["nonTokens"]) for d in decks.values())
    print(f"\n✅ Done! {len(decks)} decks, {total_cards} total unique cards")
    for key, deck in decks.items():
        print(f"   {deck['icon']}  {deck['name']}: {len(deck['tokens'])} tokens + {len(deck['nonTokens'])} non-tokens")


if __name__ == "__main__":
    main()
