const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

const config = require("./config.json");

// ==================================================
// KONFIGURACJA
// ==================================================

const TOKEN = process.env.DISCORD_TOKEN || 'WKLEJ_TUTAJ_NOWY_TOKEN';
const CLIENT_ID = '1555903826714824795';
const GUILD_ID = '1548363689319735417';
const PORT = 30000;

const DATA_FILE = path.join(__dirname, "data.json");
const QUEUES_FILE = path.join(__dirname, "queues.json");
const QUEUE_CHANNELS_FILE = path.join(
    __dirname,
    "queue_channels.json"
);

const TESTER_ROLE_NAME = "TESTER";

const app = express();

// ==================================================
// CORS
// ==================================================

app.use((req, res, next) => {
    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET"
    );

    next();
});

// ==================================================
// PLIKI JSON
// ==================================================

function loadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 4)
            );

            return fallback;
        }

        const content = fs.readFileSync(
            file,
            "utf8"
        );

        if (!content.trim()) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 4)
            );

            return fallback;
        }

        return JSON.parse(content);

    } catch (error) {
        console.error(
            `Błąd odczytu ${file}:`,
            error
        );

        try {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 4)
            );
        } catch {}

        return fallback;
    }
}

function saveJson(file, data) {
    try {
        fs.writeFileSync(
            file,
            JSON.stringify(data, null, 4)
        );
    } catch (error) {
        console.error(
            `Błąd zapisu ${file}:`,
            error
        );
    }
}

// ==================================================
// DANE
// ==================================================

let data = loadJson(
    DATA_FILE,
    {}
);

let queues = loadJson(
    QUEUES_FILE,
    {}
);

let queueChannels = loadJson(
    QUEUE_CHANNELS_FILE,
    {}
);

// ==================================================
// MINECRAFT
// ==================================================

function getMinecraftUrls(uuid) {
    if (!uuid) {
        return null;
    }

    const cleanUuid =
        String(uuid).replace(
            /-/g,
            ""
        );

    return {
        avatarUrl:
            `https://crafatar.com/avatars/${cleanUuid}?overlay`,

        headUrl:
            `https://crafatar.com/renders/head/${cleanUuid}?overlay`,

        bodyUrl:
            `https://crafatar.com/renders/body/${cleanUuid}?overlay`,

        skinUrl:
            `https://crafatar.com/skins/${cleanUuid}`
    };
}

async function getMinecraftProfile(username) {
    if (!username) {
        throw new Error(
            "Nie podano nicku Minecraft."
        );
    }

    const cleanUsername =
        String(username).trim();

    if (
        !/^[A-Za-z0-9_]{3,16}$/.test(
            cleanUsername
        )
    ) {
        throw new Error(
            "Nick Minecraft musi mieć od 3 do 16 znaków i może zawierać tylko litery, cyfry oraz _."
        );
    }

    const url =
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanUsername)}`;

    const response =
        await fetch(url);

    if (response.status === 404) {
        throw new Error(
            `Nie znaleziono gracza Minecraft ${cleanUsername}.`
        );
    }

    if (!response.ok) {
        throw new Error(
            `API Minecraft zwróciło błąd HTTP ${response.status}.`
        );
    }

    const profile =
        await response.json();

    if (
        !profile ||
        !profile.id ||
        !profile.name
    ) {
        throw new Error(
            "API Minecraft nie zwróciło poprawnego profilu."
        );
    }

    const urls =
        getMinecraftUrls(
            profile.id
        );

    return {
        username: profile.name,
        uuid: profile.id,
        ...urls,
        updatedAt: Date.now()
    };
}

function getMinecraftData(player) {
    if (
        !player ||
        !player.minecraft ||
        !player.minecraft.username ||
        !player.minecraft.uuid
    ) {
        return null;
    }

    const minecraft =
        player.minecraft;

    const urls =
        getMinecraftUrls(
            minecraft.uuid
        );

    return {
        ...minecraft,
        ...urls
    };
}

// ==================================================
// POMOCNICZE
// ==================================================

function getMode(modeId) {
    if (!config.modes) {
        return null;
    }

    return config.modes.find(
        mode =>
            String(mode.id).toLowerCase() ===
                String(modeId).toLowerCase() ||
            String(mode.name).toLowerCase() ===
                String(modeId).toLowerCase()
    );
}

function getTier(tierId) {
    if (!config.tiers) {
        return null;
    }

    return config.tiers.find(
        tier =>
            String(tier.id).toLowerCase() ===
                String(tierId).toLowerCase() ||
            String(tier.name).toLowerCase() ===
                String(tierId).toLowerCase()
    );
}

// ==================================================
// KANAŁ WYNIKÓW + ROLE TIERÓW
// ==================================================

// Opcjonalnie wklej tu ID kanału #👑・wyniki (najpewniejsze).
// Jeśli zostawisz puste, bot szuka kanału tekstowego z "wyniki" w nazwie.
const RESULTS_CHANNEL_ID = "";
const RESULTS_CHANNEL_KEYWORD = "wyniki";

async function findResultsChannel(guild) {
    try {
        if (RESULTS_CHANNEL_ID) {
            return await guild.channels.fetch(RESULTS_CHANNEL_ID);
        }

        const channels = await guild.channels.fetch();

        return channels.find(
            channel =>
                channel &&
                channel.type === ChannelType.GuildText &&
                channel.name
                    .toLowerCase()
                    .includes(RESULTS_CHANNEL_KEYWORD)
        ) || null;

    } catch (error) {
        console.error("Błąd szukania kanału wyników:", error);
        return null;
    }
}

// Rola ma nazwę: "<TIER> <TRYB>", np. "LT3 Gildie"
function getTierRoleName(tier, mode) {
    return `${tier.name} ${mode.name}`;
}

// Nadaje rolę nowego tieru i zdejmuje stare role tego samego trybu
async function syncTierRole(guild, userId, mode, tier) {
    try {
        const member = await guild.members.fetch(userId);

        await guild.roles.fetch();

        const modeRoleNames = config.tiers.map(
            t => getTierRoleName(t, mode).toLowerCase()
        );

        const newName = getTierRoleName(tier, mode);

        let newRole = guild.roles.cache.find(
            role => role.name.toLowerCase() === newName.toLowerCase()
        );

        if (!newRole) {
            newRole = await guild.roles.create({
                name: newName,
                reason: "GGtiers - nowy tier"
            });
        }

        const toRemove = member.roles.cache.filter(
            role =>
                modeRoleNames.includes(role.name.toLowerCase()) &&
                role.id !== newRole.id
        );

        if (toRemove.size > 0) {
            await member.roles.remove(toRemove);
        }

        if (!member.roles.cache.has(newRole.id)) {
            await member.roles.add(newRole);
        }

        return { ok: true };

    } catch (error) {
        console.error("Błąd nadawania roli:", error);
        return { ok: false, message: error.message };
    }
}

// Zdejmuje wszystkie role tieru z danego trybu
async function removeTierRoles(guild, userId, mode) {
    try {
        const member = await guild.members.fetch(userId);

        const modeRoleNames = config.tiers.map(
            t => getTierRoleName(t, mode).toLowerCase()
        );

        const toRemove = member.roles.cache.filter(
            role => modeRoleNames.includes(role.name.toLowerCase())
        );

        if (toRemove.size > 0) {
            await member.roles.remove(toRemove);
        }

        return { ok: true };

    } catch (error) {
        console.error("Błąd zdejmowania roli:", error);
        return { ok: false, message: error.message };
    }
}

// Czy gracz ma przynajmniej jeden tier (w którymkolwiek trybie)?
function hasAnyTier(player) {
    if (!player) {
        return false;
    }

    return config.modes.some(mode => {
        const key = mode.key || mode.id.toLowerCase();

        const value =
            player[key] ??
            player[key.toLowerCase()] ??
            null;

        return value !== null && value !== undefined && value !== "";
    });
}

function isTester(interaction) {
    return interaction.member.roles.cache.some(
        role =>
            role.name.toLowerCase() ===
            TESTER_ROLE_NAME.toLowerCase()
    );
}

function getQueueKey(modeId) {
    return String(modeId).toLowerCase();
}

function sanitizeChannelName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
}

function getModeChoices() {
    return config.modes.map(
        mode => ({
            name: mode.name,
            value: mode.id
        })
    );
}

function getTierChoices() {
    return config.tiers.map(
        tier => ({
            name: tier.name,
            value: tier.id
        })
    );
}

// ==================================================
// EMBED KOLEJKI
// ==================================================

function createQueueEmbed(
    queue,
    mode
) {
    if (queue.closed) {
        return new EmbedBuilder()
            .setTitle(
                `🔒 Kolejka ${mode.name.toUpperCase()}`
            )
            .setDescription(
                "🔴 **KOLEJKA ZAMKNIĘTA**"
            )
            .addFields(
                {
                    name:
                        "🟢 Otwarcie kolejki",

                    value:
                        queue.openedAt
                            ? `<t:${Math.floor(queue.openedAt / 1000)}:F>`
                            : "Nieznane",

                    inline: true
                },
                {
                    name:
                        "🔴 Zamknięcie kolejki",

                    value:
                        queue.closedAt
                            ? `<t:${Math.floor(queue.closedAt / 1000)}:F>`
                            : "Nieznane",

                    inline: true
                }
            )
            .setFooter({
                text:
                    "Kolejka jest obecnie zamknięta."
            });
    }

    const playersText =
        queue.players.length > 0
            ? queue.players
                  .map(
                      (id, index) =>
                          `${index + 1}. <@${id}>`
                  )
                  .join("\n")
            : "Brak oczekujących.";

    const testersText =
        queue.testers.length > 0
            ? queue.testers
                  .map(
                      (id, index) =>
                          `${index + 1}. <@${id}>`
                  )
                  .join("\n")
            : "Brak testerów.";

    return new EmbedBuilder()
        .setTitle(
            `🧪 Kolejka ${mode.name.toUpperCase()}`
        )
        .setDescription(
            "🟢 **KOLEJKA OTWARTA**"
        )
        .addFields(
            {
                name:
                    "👤 Oczekujący",
                value:
                    playersText,
                inline: false
            },
            {
                name:
                    "🧪 Testerzy",
                value:
                    testersText,
                inline: false
            }
        )
        .setFooter({
            text:
                "Kliknij przycisk, aby dołączyć lub wyjść z kolejki."
        });
}

// ==================================================
// PRZYCISKI
// ==================================================

function createQueueButtons(
    queue,
    mode
) {
    if (queue.closed) {
        return createClosedQueueButtons();
    }

    const joinButton =
        new ButtonBuilder()
            .setCustomId(
                `queue_join_${mode.id}`
            )
            .setLabel(
                "Dołącz do kolejki"
            )
            .setEmoji("➕")
            .setStyle(
                ButtonStyle.Success
            );

    const leaveButton =
        new ButtonBuilder()
            .setCustomId(
                `queue_leave_${mode.id}`
            )
            .setLabel(
                "Wyjdź z kolejki"
            )
            .setEmoji("➖")
            .setStyle(
                ButtonStyle.Danger
            );

    return new ActionRowBuilder()
        .addComponents(
            joinButton,
            leaveButton
        );
}

function createClosedQueueButtons() {
    const button =
        new ButtonBuilder()
            .setCustomId(
                "queue_closed"
            )
            .setLabel(
                "Kolejka zamknięta"
            )
            .setEmoji("🔒")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(true);

    return new ActionRowBuilder()
        .addComponents(button);
}

// ==================================================
// AKTUALIZACJA KOLEJKI
// ==================================================

async function updateQueueMessage(
    queue
) {
    if (
        !queue.channelId ||
        !queue.messageId
    ) {
        return null;
    }

    try {
        const channel =
            await client.channels.fetch(
                queue.channelId
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return null;
        }

        const message =
            await channel.messages.fetch(
                queue.messageId
            );

        const mode =
            getMode(queue.mode);

        if (!mode) {
            return null;
        }

        await message.edit({
            embeds: [
                createQueueEmbed(
                    queue,
                    mode
                )
            ],
            components: [
                createQueueButtons(
                    queue,
                    mode
                )
            ]
        });

        return message;

    } catch (error) {
        console.error(
            "Nie udało się zaktualizować wiadomości kolejki:",
            error
        );

        return null;
    }
}

// ==================================================
// KOLEJKA TESTERA
// ==================================================

function findTesterQueue(
    testerId
) {
    for (
        const key of Object.keys(queues)
    ) {
        const queue =
            queues[key];

        if (
            queue &&
            !queue.closed &&
            Array.isArray(
                queue.testers
            ) &&
            queue.testers.includes(
                testerId
            )
        ) {
            return queue;
        }
    }

    return null;
}

// ==================================================
// TICKET GRACZA
// ==================================================

function findPlayerTicket(
    guild,
    playerId
) {
    return guild.channels.cache.find(
        channel =>
            channel.type ===
                ChannelType.GuildText &&
            channel.topic &&
            channel.topic.includes(
                `player:${playerId}`
            )
    );
}

// ==================================================
// TWORZENIE TICKETU
// ==================================================

async function createTestTicket(
    queue,
    testerId,
    playerId
) {
    const guild =
        await client.guilds.fetch(
            GUILD_ID
        );

    const mode =
        getMode(queue.mode);

    if (!mode) {
        throw new Error(
            "Nie znaleziono trybu."
        );
    }

    const queueChannel =
        await guild.channels.fetch(
            queue.channelId
        );

    if (!queueChannel) {
        throw new Error(
            "Nie znaleziono kanału kolejki."
        );
    }

    const playerData =
        data[playerId];

    const minecraft =
        getMinecraftData(
            playerData
        );

    const playerName =
        minecraft?.username ||
        playerId;

    const safePlayerName =
        sanitizeChannelName(
            playerName
        );

    const modeName =
        sanitizeChannelName(
            mode.name
        );

    const channelName =
        `test-${modeName}-${safePlayerName}`
            .slice(0, 100);

    const permissionOverwrites = [
        {
            id:
                guild.roles.everyone.id,

            deny: [
                PermissionFlagsBits.ViewChannel
            ]
        },

        {
            id: testerId,

            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        },

        {
            id: playerId,

            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        }
    ];

    const ticket =
        await guild.channels.create({
            name: channelName,

            type:
                ChannelType.GuildText,

            parent:
                queueChannel.parentId ||
                null,

            topic:
                `GGtiers test | mode:${mode.id} | tester:${testerId} | player:${playerId}`,

            permissionOverwrites
        });

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🧪 TEST ${mode.name.toUpperCase()}`
            )
            .setDescription(
                "Powodzenia podczas testu!"
            )
            .addFields(
                {
                    name:
                        "Tester",

                    value:
                        `<@${testerId}>`,

                    inline: true
                },
                {
                    name:
                        "Testowany",

                    value:
                        minecraft?.username
                            ? `**${minecraft.username}**`
                            : `<@${playerId}>`,

                    inline: true
                }
            );

    if (minecraft?.headUrl) {
        embed.setThumbnail(
            minecraft.headUrl
        );
    }

    await ticket.send({
        content:
            `<@${testerId}> <@${playerId}>`,

        embeds: [
            embed
        ]
    });

    return ticket;
}

// ==================================================
// KOMENDY
// ==================================================

const commands = [

    new SlashCommandBuilder()
        .setName("ogloszenie")
        .setDescription(
            "Wyślij ogłoszenie"
        )
        .addStringOption(
            option =>
                option
                    .setName("tekst")
                    .setDescription(
                        "Treść ogłoszenia"
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("profil")
        .setDescription(
            "Pokaż profil gracza"
        )
        .addUserOption(
            option =>
                option
                    .setName("gracz")
                    .setDescription(
                        "Gracz"
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("wystaw")
        .setDescription(
            "Wystaw gracza na tier"
        )
        .addUserOption(
            option =>
                option
                    .setName("gracz")
                    .setDescription(
                        "Testowany gracz"
                    )
                    .setRequired(true)
        )
        .addStringOption(
            option =>
                option
                    .setName("tryb")
                    .setDescription(
                        "Tryb"
                    )
                    .setRequired(true)
                    .addChoices(
                        ...getModeChoices()
                    )
        )
        .addStringOption(
            option =>
                option
                    .setName("tier")
                    .setDescription(
                        "Tier"
                    )
                    .setRequired(true)
                    .addChoices(
                        ...getTierChoices()
                    )
        ),

    new SlashCommandBuilder()
        .setName("kolejka")
        .setDescription(
            "Otwórz kolejkę testową"
        )
        .addStringOption(
            option =>
                option
                    .setName("tryb")
                    .setDescription(
                        "Tryb"
                    )
                    .setRequired(true)
                    .addChoices(
                        ...getModeChoices()
                    )
        ),

    new SlashCommandBuilder()
        .setName("next")
        .setDescription(
            "Weź następną osobę z kolejki"
        ),

    new SlashCommandBuilder()
        .setName("zamknijk")
        .setDescription(
            "Zamknij kolejkę"
        )
        .addStringOption(
            option =>
                option
                    .setName("tryb")
                    .setDescription(
                        "Tryb"
                    )
                    .setRequired(true)
                    .addChoices(
                        ...getModeChoices()
                    )
        ),

    new SlashCommandBuilder()
        .setName("ustawkanal")
        .setDescription(
            "Ustaw kanał kolejki"
        )
        .addStringOption(
            option =>
                option
                    .setName("tryb")
                    .setDescription(
                        "Tryb"
                    )
                    .setRequired(true)
                    .addChoices(
                        ...getModeChoices()
                    )
        )
        .addChannelOption(
            option =>
                option
                    .setName("kanal")
                    .setDescription(
                        "Kanał kolejki"
                    )
                    .addChannelTypes(
                        ChannelType.GuildText
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("ping")
        .setDescription(
            "Sprawdź ping bota"
        ),

    new SlashCommandBuilder()
        .setName("minecraft")
        .setDescription(
            "Ustaw nick Minecraft gracza"
        )
        .addUserOption(
            option =>
                option
                    .setName("gracz")
                    .setDescription(
                        "Gracz Discord"
                    )
                    .setRequired(true)
        )
        .addStringOption(
            option =>
                option
                    .setName("nick")
                    .setDescription(
                        "Nick Minecraft"
                    )
                    .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("usun")
        .setDescription(
            "Usuń tier gracza w danym trybie"
        )
        .addUserOption(
            option =>
                option
                    .setName("gracz")
                    .setDescription(
                        "Gracz"
                    )
                    .setRequired(true)
        )
        .addStringOption(
            option =>
                option
                    .setName("tryb")
                    .setDescription(
                        "Tryb"
                    )
                    .setRequired(true)
                    .addChoices(
                        ...getModeChoices()
                    )
        )
];

// ==================================================
// CLIENT
// ==================================================

const client =
    new Client({
        intents: [
            GatewayIntentBits.Guilds
        ]
    });

// ==================================================
// API
// ==================================================

app.get(
    "/api/status",
    (req, res) => {
        res.json({
            online:
                client.isReady(),

            bot:
                client.user
                    ? client.user.tag
                    : null
        });
    }
);

app.get(
    "/api/config",
    (req, res) => {
        res.json(config);
    }
);

app.get(
    "/api/players",
    (req, res) => {

        const players =
            Object.entries(data)
                .filter(
                    ([discordId, player]) =>
                        hasAnyTier(player)
                )
                .map(
                    ([discordId, player]) => {

                        const minecraft =
                            getMinecraftData(
                                player
                            );

                        return {
                            discordId,

                            name:
                                minecraft?.username ||
                                player.name ||
                                discordId,

                            discordName:
                                player.name ||
                                discordId,

                            minecraft,

                            sword:
                                player.sword ??
                                null,

                            crystal:
                                player.crystal ??
                                null,

                            npot:
                                player.npot ??
                                null,

                            axe:
                                player.axe ??
                                null,

                            mace:
                                player.mace ??
                                null,

                            uhc:
                                player.uhc ??
                                null,

                            gildie:
                                player.gildie ??
                                null,

                            dpot:

                                player.dpot ??

                                player.Dpot ??

                                null,

                            podziemia:
                                player.podziemia ??
                                null,

                            smp:
                                player.smp ??
                                null
                        };
                    }
                );

        res.json(players);
    }
);

app.get(
    "/api/profile/:id",
    (req, res) => {

        const id =
            req.params.id;

        const player =
            data[id];

        if (!player) {
            return res
                .status(404)
                .json({
                    error:
                        "Nie znaleziono gracza."
                });
        }

        const minecraft =
            getMinecraftData(
                player
            );

        res.json({
            discordId: id,

            name:
                minecraft?.username ||
                player.name ||
                id,

            discordName:
                player.name ||
                id,

            minecraft,

            sword:
                player.sword ??
                null,

            crystal:
                player.crystal ??
                null,

            npot:
                player.npot ??
                null,

            axe:
                player.axe ??
                null,

            mace:
                player.mace ??
                null,

            uhc:
                player.uhc ??
                null,

            gildie:
                player.gildie ??
                null,

            dpot:

                player.dpot ??

                player.Dpot ??

                null,

            podziemia:
                player.podziemia ??
                null,

            smp:
                player.smp ??
                null
        });
    }
);

app.listen(
    PORT,
    () => {
        console.log(
            `API działa na porcie ${PORT}`
        );
    }
);

// ==================================================
// READY
// ==================================================

client.once(
    "ready",
    async () => {

        console.log(
            `Zalogowano jako ${client.user.tag}`
        );

        try {

            const rest =
                new REST({
                    version: "10"
                }).setToken(
                    TOKEN
                );

            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    GUILD_ID
                ),
                {
                    body:
                        commands.map(
                            command =>
                                command.toJSON()
                        )
                }
            );

            console.log(
                "Komendy zostały zarejestrowane."
            );

            console.log(
                "Kanały kolejek:",
                queueChannels
            );

        } catch (error) {

            console.error(
                "Błąd rejestracji komend:",
                error
            );
        }
    }
);

// ==================================================
// INTERAKCJE
// ==================================================

client.on(
    "interactionCreate",
    async interaction => {

        try {

            // ==========================================
            // BUTTONY
            // ==========================================

            if (interaction.isButton()) {

                const customId =
                    interaction.customId;

                // ------------------------------------------
                // JOIN
                // ------------------------------------------

                if (
                    customId.startsWith(
                        "queue_join_"
                    )
                ) {

                    const modeId =
                        customId.replace(
                            "queue_join_",
                            ""
                        );

                    const mode =
                        getMode(modeId);

                    if (!mode) {
                        return interaction.reply({
                            content:
                                "❌ Nie znaleziono trybu.",
                            ephemeral: true
                        });
                    }

                    const key =
                        getQueueKey(
                            mode.id
                        );

                    const queue =
                        queues[key];

                    if (
                        !queue ||
                        queue.closed
                    ) {
                        return interaction.reply({
                            content:
                                "🔒 Ta kolejka jest zamknięta.",
                            ephemeral: true
                        });
                    }

                    const userId =
                        interaction.user.id;

                    if (
                        queue.testers.includes(
                            userId
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Jesteś testerem tej kolejki.",
                            ephemeral: true
                        });
                    }

                    if (
                        queue.players.includes(
                            userId
                        )
                    ) {
                        return interaction.reply({
                            content:
                                "❌ Już jesteś w tej kolejce.",
                            ephemeral: true
                        });
                    }

                    queue.players.push(
                        userId
                    );

                    saveJson(
                        QUEUES_FILE,
                        queues
                    );

                    await updateQueueMessage(
                        queue
                    );

                    return interaction.reply({
                        content:
                            `✅ Dołączono do kolejki ${mode.name}.`,
                        ephemeral: true
                    });
                }

                // ------------------------------------------
                // LEAVE
                // ------------------------------------------

                if (
                    customId.startsWith(
                        "queue_leave_"
                    )
                ) {

                    const modeId =
                        customId.replace(
                            "queue_leave_",
                            ""
                        );

                    const mode =
                        getMode(modeId);

                    if (!mode) {
                        return interaction.reply({
                            content:
                                "❌ Nie znaleziono trybu.",
                            ephemeral: true
                        });
                    }

                    const key =
                        getQueueKey(
                            mode.id
                        );

                    const queue =
                        queues[key];

                    if (
                        !queue ||
                        queue.closed
                    ) {
                        return interaction.reply({
                            content:
                                "🔒 Ta kolejka jest zamknięta.",
                            ephemeral: true
                        });
                    }

                    const userId =
                        interaction.user.id;

                    const index =
                        queue.players.indexOf(
                            userId
                        );

                    if (index === -1) {
                        return interaction.reply({
                            content:
                                "❌ Nie ma Cię w tej kolejce.",
                            ephemeral: true
                        });
                    }

                    queue.players.splice(
                        index,
                        1
                    );

                    saveJson(
                        QUEUES_FILE,
                        queues
                    );

                    await updateQueueMessage(
                        queue
                    );

                    return interaction.reply({
                        content:
                            `✅ Opuszczono kolejkę ${mode.name}.`,
                        ephemeral: true
                    });
                }

                return;
            }

            // ==========================================
            // SLASH COMMANDY
            // ==========================================

            if (
                !interaction.isChatInputCommand()
            ) {
                return;
            }

            // ==========================================
            // PING
            // ==========================================

            if (
                interaction.commandName ===
                "ping"
            ) {

                return interaction.reply({
                    content:
                        `🏓 Pong! ${client.ws.ping} ms`,
                    ephemeral: true
                });
            }

            // ==========================================
            // OGLOSZENIE
            // ==========================================

            if (
                interaction.commandName ===
                "ogloszenie"
            ) {

                const tekst =
                    interaction.options.getString(
                        "tekst"
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "📢 OGŁOSZENIE"
                        )
                        .setDescription(
                            tekst
                        )
                        .setFooter({
                            text:
                                `Ogłoszenie od ${interaction.user.username}`
                        })
                        .setTimestamp();

                await interaction.channel.send({
                    embeds: [
                        embed
                    ]
                });

                return interaction.reply({
                    content:
                        "✅ Ogłoszenie wysłane.",
                    ephemeral: true
                });
            }

            // ==========================================
            // USTAWKANAL
            // ==========================================

            if (
                interaction.commandName ===
                "ustawkanal"
            ) {

                const modeId =
                    interaction.options.getString(
                        "tryb"
                    );

                const channel =
                    interaction.options.getChannel(
                        "kanal"
                    );

                const mode =
                    getMode(modeId);

                if (!mode) {
                    return interaction.reply({
                        content:
                            "❌ Nie znaleziono trybu.",
                        ephemeral: true
                    });
                }

                if (
                    !channel ||
                    channel.type !==
                        ChannelType.GuildText
                ) {
                    return interaction.reply({
                        content:
                            "❌ Wybierz kanał tekstowy.",
                        ephemeral: true
                    });
                }

                const key =
                    getQueueKey(
                        mode.id
                    );

                queueChannels[key] =
                    channel.id;

                saveJson(
                    QUEUE_CHANNELS_FILE,
                    queueChannels
                );

                return interaction.reply({
                    content:
                        `✅ Kanał kolejki ${mode.name} ustawiony na ${channel}.`,
                    ephemeral: true
                });
            }

            // ==========================================
            // MINECRAFT
            // ==========================================

            if (
                interaction.commandName ===
                "minecraft"
            ) {

                if (
                    !isTester(
                        interaction
                    ) &&
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Tylko tester lub administrator może ustawić nick Minecraft.",
                        ephemeral: true
                    });
                }

                const target =
                    interaction.options.getUser(
                        "gracz"
                    );

                const username =
                    interaction.options.getString(
                        "nick"
                    );

                await interaction.deferReply({
                    ephemeral: true
                });

                try {

                    const minecraft =
                        await getMinecraftProfile(
                            username
                        );

                    if (!data[target.id]) {
                        data[target.id] = {};
                    }

                    data[target.id].name =
                        target.username;

                    data[target.id].minecraft =
                        minecraft;

                    saveJson(
                        DATA_FILE,
                        data
                    );

                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                "⛏️ Minecraft"
                            )
                            .setDescription(
                                `Powiązano konto Discord <@${target.id}> z kontem Minecraft **${minecraft.username}**.`
                            )
                            .addFields(
                                {
                                    name:
                                        "Nick",
                                    value:
                                        minecraft.username,
                                    inline: true
                                },
                                {
                                    name:
                                        "UUID",
                                    value:
                                        minecraft.uuid,
                                    inline: true
                                }
                            );

                    if (
                        minecraft.headUrl
                    ) {
                        embed.setThumbnail(
                            minecraft.headUrl
                        );
                    }

                    return interaction.editReply({
                        content: "",
                        embeds: [
                            embed
                        ]
                    });

                } catch (error) {

                    return interaction.editReply({
                        content:
                            `❌ ${error.message}`
                    });
                }
            }

            // ==========================================
            // PROFIL
            // ==========================================

            if (
                interaction.commandName ===
                "profil"
            ) {

                const target =
                    interaction.options.getUser(
                        "gracz"
                    );

                const player =
                    data[target.id];

                if (!player) {
                    return interaction.reply({
                        content:
                            "❌ Ten gracz nie ma jeszcze profilu.",
                        ephemeral: true
                    });
                }

                const minecraft =
                    getMinecraftData(
                        player
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            minecraft?.username ||
                            target.username
                        )
                        .setDescription(
                            `<@${target.id}>`
                        );

                if (
                    minecraft?.headUrl
                ) {
                    embed.setThumbnail(
                        minecraft.headUrl
                    );
                }

                if (
                    minecraft?.username
                ) {
                    embed.addFields({
                        name:
                            "⛏️ Minecraft",
                        value:
                            minecraft.username,
                        inline: true
                    });
                }

                const tierFields =
                    config.modes.map(
                        mode => {

                            const key =
                                mode.key ||
                                mode.id.toLowerCase();

                            return {
                                name:
                                    mode.name,

                                value:
                                    player[key] ||
                                    "Brak",

                                inline: true
                            };
                        }
                    );

                embed.addFields(
                    tierFields
                );

                return interaction.reply({
                    embeds: [
                        embed
                    ]
                });
            }

            // ==========================================
            // KOLEJKA
            // ==========================================

            if (
                interaction.commandName ===
                "kolejka"
            ) {

                if (
                    !isTester(
                        interaction
                    ) &&
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Tylko tester może otworzyć kolejkę.",
                        ephemeral: true
                    });
                }

                const modeId =
                    interaction.options.getString(
                        "tryb"
                    );

                const mode =
                    getMode(modeId);

                if (!mode) {
                    return interaction.reply({
                        content:
                            "❌ Nie znaleziono trybu.",
                        ephemeral: true
                    });
                }

                const key =
                    getQueueKey(
                        mode.id
                    );

                const channelId =
                    queueChannels[key];

                if (!channelId) {
                    return interaction.reply({
                        content:
                            `❌ Nie ustawiono kanału kolejki dla trybu ${mode.name}. Użyj /ustawkanal.`,
                        ephemeral: true
                    });
                }

                const channel =
                    await interaction.guild.channels.fetch(
                        channelId
                    );

                if (!channel) {
                    return interaction.reply({
                        content:
                            "❌ Nie znaleziono ustawionego kanału.",
                        ephemeral: true
                    });
                }

                let queue =
                    queues[key];

                if (
                    queue &&
                    !queue.closed
                ) {
                    return interaction.reply({
                        content:
                            "❌ Ta kolejka jest już otwarta.",
                        ephemeral: true
                    });
                }

                queue = {
                    mode:
                        mode.id,

                    channelId:
                        channel.id,

                    messageId:
                        queue?.messageId ||
                        null,

                    players: [],

                    testers: [],

                    closed:
                        false,

                    openedAt:
                        Date.now(),

                    closedAt:
                        null
                };

                queues[key] =
                    queue;

                saveJson(
                    QUEUES_FILE,
                    queues
                );

                let message = null;

                if (
                    queue.messageId
                ) {
                    try {

                        message =
                            await channel.messages.fetch(
                                queue.messageId
                            );

                        await message.edit({
                            embeds: [
                                createQueueEmbed(
                                    queue,
                                    mode
                                )
                            ],

                            components: [
                                createQueueButtons(
                                    queue,
                                    mode
                                )
                            ]
                        });

                    } catch {
                        message =
                            null;
                    }
                }

                if (!message) {

                    message =
                        await channel.send({
                            embeds: [
                                createQueueEmbed(
                                    queue,
                                    mode
                                )
                            ],

                            components: [
                                createQueueButtons(
                                    queue,
                                    mode
                                )
                            ]
                        });

                    queue.messageId =
                        message.id;

                    saveJson(
                        QUEUES_FILE,
                        queues
                    );
                }

                // ---- OSOBNY @here + USUNIĘCIE WIADOMOŚCI ----
                try {
                    const pingMessage =
                        await channel.send({
                            content: "@here",
                            allowedMentions: {
                                parse: ["everyone"]
                            }
                        });

                    await pingMessage.delete();

                } catch (error) {
                    console.error(
                        "Błąd wysyłania @here:",
                        error
                    );
                }

                const userId =
                    interaction.user.id;

                if (
                    isTester(
                        interaction
                    ) &&
                    !queue.testers.includes(
                        userId
                    )
                ) {
                    queue.testers.push(
                        userId
                    );

                    saveJson(
                        QUEUES_FILE,
                        queues
                    );

                    await updateQueueMessage(
                        queue
                    );
                }

                return interaction.reply({
                    content:
                        `🟢 Kolejka ${mode.name} została otwarta.`,
                    ephemeral: true
                });
            }

            // ==========================================
            // ZAMKNIJK
            // ==========================================

            if (
                interaction.commandName ===
                "zamknijk"
            ) {

                if (
                    !isTester(
                        interaction
                    ) &&
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Tylko tester może zamknąć kolejkę.",
                        ephemeral: true
                    });
                }

                const modeId =
                    interaction.options.getString(
                        "tryb"
                    );

                const mode =
                    getMode(modeId);

                if (!mode) {
                    return interaction.reply({
                        content:
                            "❌ Nie znaleziono trybu.",
                        ephemeral: true
                    });
                }

                const key =
                    getQueueKey(
                        mode.id
                    );

                const queue =
                    queues[key];

                if (
                    !queue ||
                    queue.closed
                ) {
                    return interaction.reply({
                        content:
                            "❌ Ta kolejka nie jest otwarta.",
                        ephemeral: true
                    });
                }

                queue.closed =
                    true;

                queue.closedAt =
                    Date.now();

                queue.players = [];
                queue.testers = [];

                saveJson(
                    QUEUES_FILE,
                    queues
                );

                await updateQueueMessage(
                    queue
                );

                return interaction.reply({
                    content:
                        `🔒 Kolejka ${mode.name} została zamknięta.`,
                    ephemeral: true
                });
            }

            // ==========================================
            // NEXT
            // ==========================================

            if (
                interaction.commandName ===
                "next"
            ) {

                if (
                    !isTester(
                        interaction
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Tylko tester może użyć /next.",
                        ephemeral: true
                    });
                }

                const testerId =
                    interaction.user.id;

                const queue =
                    findTesterQueue(
                        testerId
                    );

                if (!queue) {
                    return interaction.reply({
                        content:
                            "❌ Nie jesteś zapisany jako tester w żadnej otwartej kolejce.",
                        ephemeral: true
                    });
                }

                if (
                    queue.players.length === 0
                ) {
                    return interaction.reply({
                        content:
                            "❌ Kolejka jest pusta.",
                        ephemeral: true
                    });
                }

                const playerId =
                    queue.players.shift();

                saveJson(
                    QUEUES_FILE,
                    queues
                );

                try {

                    const existingTicket =
                        findPlayerTicket(
                            interaction.guild,
                            playerId
                        );

                    if (
                        existingTicket
                    ) {

                        queue.players.unshift(
                            playerId
                        );

                        saveJson(
                            QUEUES_FILE,
                            queues
                        );

                        await updateQueueMessage(
                            queue
                        );

                        return interaction.reply({
                            content:
                                `❌ Ten gracz ma już otwarty ticket: ${existingTicket}`,
                            ephemeral: true
                        });
                    }

                    const ticket =
                        await createTestTicket(
                            queue,
                            testerId,
                            playerId
                        );

                    await updateQueueMessage(
                        queue
                    );

                    return interaction.reply({
                        content:
                            `🎫 Ticket utworzony: ${ticket}`,
                        ephemeral: true
                    });

                } catch (error) {

                    queue.players.unshift(
                        playerId
                    );

                    saveJson(
                        QUEUES_FILE,
                        queues
                    );

                    await updateQueueMessage(
                        queue
                    );

                    console.error(
                        "Błąd tworzenia ticketu:",
                        error
                    );

                    return interaction.reply({
                        content:
                            `❌ Nie udało się utworzyć ticketu: ${error.message}`,
                        ephemeral: true
                    });
                }
            }

            // ==========================================
            // USUN (usuwanie tieru)
            // ==========================================

            if (
                interaction.commandName ===
                "usun"
            ) {

                if (
                    !isTester(
                        interaction
                    ) &&
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Tylko tester może usuwać tiery.",
                        ephemeral: true
                    });
                }

                const target =
                    interaction.options.getUser(
                        "gracz"
                    );

                const mode =
                    getMode(
                        interaction.options.getString(
                            "tryb"
                        )
                    );

                if (!mode) {
                    return interaction.reply({
                        content:
                            "❌ Nie znaleziono trybu.",
                        ephemeral: true
                    });
                }

                const key =
                    mode.key ||
                    mode.id.toLowerCase();

                if (
                    !data[target.id] ||
                    data[target.id][key] === undefined
                ) {
                    return interaction.reply({
                        content:
                            `❌ Ten gracz nie ma tieru w trybie ${mode.name}.`,
                        ephemeral: true
                    });
                }

                const oldTier =
                    data[target.id][key];

                delete data[target.id][key];

                saveJson(
                    DATA_FILE,
                    data
                );

                const minecraft =
                    getMinecraftData(
                        data[target.id]
                    );

                const displayName =
                    minecraft?.username ||
                    target.username;

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🗑️ USUNIĘTY TIER"
                            )
                            .setDescription(
                                `**${displayName}** traci tier **${oldTier}** w trybie **${mode.name}**.`
                            )
                            .addFields({
                                name: "Tester",
                                value: `<@${interaction.user.id}>`,
                                inline: true
                            })
                            .setTimestamp()
                    ]
                });

                const roleResult =
                    await removeTierRoles(
                        interaction.guild,
                        target.id,
                        mode
                    );

                if (!roleResult.ok) {
                    await interaction.followUp({
                        content:
                            `⚠️ Tier usunięty, ale nie udało się zdjąć roli: ${roleResult.message}`,
                        ephemeral: true
                    }).catch(() => {});
                }

                return;
            }

            // ==========================================
            // WYSTAW
            // ==========================================

            if (
                interaction.commandName ===
                "wystaw"
            ) {

                if (
                    !isTester(
                        interaction
                    ) &&
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {
                    return interaction.reply({
                        content:
                            "❌ Tylko tester może wystawiać tiery.",
                        ephemeral: true
                    });
                }

                const target =
                    interaction.options.getUser(
                        "gracz"
                    );

                const modeId =
                    interaction.options.getString(
                        "tryb"
                    );

                const tierId =
                    interaction.options.getString(
                        "tier"
                    );

                const mode =
                    getMode(modeId);

                const tier =
                    getTier(tierId);

                if (
                    !mode ||
                    !tier
                ) {
                    return interaction.reply({
                        content:
                            "❌ Nieprawidłowy tryb lub tier.",
                        ephemeral: true
                    });
                }

                if (!data[target.id]) {
                    data[target.id] = {};
                }

                data[target.id].name =
                    target.username;

                const key =
                    mode.key ||
                    mode.id.toLowerCase();

                data[target.id][key] =
                    tier.id;

                saveJson(
                    DATA_FILE,
                    data
                );

                const minecraft =
                    getMinecraftData(
                        data[target.id]
                    );

                const displayName =
                    minecraft?.username ||
                    target.username;

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            "🏆 WYSTAWIONY TIER"
                        )
                        .setDescription(
                            `**${displayName}** otrzymuje tier **${tier.name}** w trybie **${mode.name}**.`
                        )
                        .addFields(
                            {
                                name:
                                    "Tryb",

                                value:
                                    mode.name,

                                inline: true
                            },
                            {
                                name:
                                    "Tier",

                                value:
                                    tier.name,

                                inline: true
                            },
                            {
                                name:
                                    "Tester",

                                value:
                                    `<@${interaction.user.id}>`,

                                inline: true
                            }
                        )
                        .setTimestamp();

                if (
                    minecraft?.headUrl
                ) {
                    embed.setThumbnail(
                        minecraft.headUrl
                    );
                }

                await interaction.reply({
                    embeds: [
                        embed
                    ]
                });

                // ---- ROLA NA DISCORDZIE (np. "LT3 Gildie") ----
                const roleResult =
                    await syncTierRole(
                        interaction.guild,
                        target.id,
                        mode,
                        tier
                    );

                if (!roleResult.ok) {
                    await interaction.followUp({
                        content:
                            `⚠️ Tier zapisany, ale nie udało się nadać roli: ${roleResult.message}`,
                        ephemeral: true
                    }).catch(() => {});
                }

                // ---- WYNIK NA KANALE #wyniki + PING GRACZA ----
                const resultsChannel =
                    await findResultsChannel(
                        interaction.guild
                    );

                if (resultsChannel) {
                    try {
                        if (
                            resultsChannel.id !==
                            interaction.channelId
                        ) {
                            await resultsChannel.send({
                                content: `<@${target.id}>`,
                                embeds: [embed],
                                allowedMentions: {
                                    users: [target.id]
                                }
                            });
                        } else {
                            // komenda wpisana już na kanale wyników
                            await interaction.followUp({
                                content: `<@${target.id}>`,
                                allowedMentions: {
                                    users: [target.id]
                                }
                            });
                        }
                    } catch (error) {
                        console.error(
                            "Błąd wysyłania na kanał wyników:",
                            error
                        );
                    }
                } else {
                    await interaction.followUp({
                        content:
                            "⚠️ Nie znaleziono kanału wyników.",
                        ephemeral: true
                    }).catch(() => {});
                }

                const ticket =
                    findPlayerTicket(
                        interaction.guild,
                        target.id
                    );

                if (ticket) {

                    await ticket.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "🔒 TEST ZAKOŃCZONY"
                                )
                                .setDescription(
                                    `**${displayName}** został wystawiony na **${tier.name} ${mode.name}**.`
                                )
                                .setTimestamp()
                        ]
                    });

                    await ticket.send({
                        content:
                            "🔒 **Ticket zostanie zamknięty za 5 sekund.**"
                    });

                    setTimeout(
                        async () => {
                            try {
                                await ticket.delete();
                            } catch {}
                        },
                        5000
                    );
                }

                return;
            }
        } catch (error) {

            console.error(
                "Błąd interactionCreate:",
                error
            );

            try {

                if (
                    interaction.replied ||
                    interaction.deferred
                ) {
                    await interaction.followUp({
                        content:
                            "❌ Wystąpił błąd podczas wykonywania operacji.",
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content:
                            "❌ Wystąpił błąd podczas wykonywania operacji.",
                        ephemeral: true
                    });
                }

            } catch {}
        }
    }
);

// ==================================================
// LOGOWANIE
// ==================================================

if (!TOKEN) {

    console.error(
        "❌ Brak DISCORD_TOKEN. Ustaw token bota jako zmienną środowiskową."
    );

} else {

    client.login(TOKEN);
}