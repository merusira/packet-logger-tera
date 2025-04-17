# Packet Logger Mod for TeraAtlas

This mod intercepts and logs all network packets between the TERA client and server.
Uses info from current toolbox / patch version to parse data from packets into the log file.

## Features

*   **In-Game Logging:** Prints basic packet information (Direction, Name, Opcode) to the private Toolbox chat channel (`/8`).
*   **File Logging:** Creates a detailed, timestamped log file for each session in the `mods/packet-logger/logs/` directory. Logs include timestamp, direction, opcode, name, and either parsed packet data (if known) or raw hexadecimal data.
*   **Filtering:** Allows filtering logged packets based on their name, with support for multiple filters simultaneously.
*   **Configurable Output:** Ability to toggle logging to in-game text and/or log file independently.

## Commands

Commands are entered in the Toolbox private chat channel (usually accessed with `/8` in game).

*   **`pktlog <filter_text>`**: Toggles a packet filter. If the filter doesn't exist, it adds it. If it already exists, it removes it.
    *   Example: `/8 pktlog SKILL` - Adds a filter for packets with "SKILL" in their name.
    *   Example: `/8 pktlog ABNORMALITY` - Adds another filter for abnormality-related packets.
    *   Running the same command again removes that specific filter.
*   **`pktlog`**: Removes all packet filters. All packets will be logged.
*   **`pktlogfake`**: Toggles the logging of "fake" packets (packets sent by mods themselves). By default, fake packets are *not* logged. When enabled, fake packets will have a `[FAKE]` prefix in the logs.
*   **`pktloggame`**: Toggles logging to in-game text. By default, this is enabled.
*   **`pktlogfile`**: Toggles logging to the log file. By default, this is enabled.

## Log File Location

Log files are saved in: `[TeraAtlas Directory]/mods/packet-logger/logs/`

Each file is named with a timestamp corresponding to when the session started, e.g., `packets_1744764281000.log`.

## Credits

Written by merusira.

## FIN