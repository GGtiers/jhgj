// ========================================
// GGtiers - GŁÓWNY SKRYPT
// ========================================


// ========================================
// RENDEROWANIE IKON
// ========================================

function renderModeIcon(icon) {

    if (
        typeof icon === "string" &&
        (
            icon.endsWith(".png") ||
            icon.endsWith(".jpg") ||
            icon.endsWith(".jpeg") ||
            icon.endsWith(".webp") ||
            icon.endsWith(".svg")
        )
    ) {

        return `
            <img
                src="${icon}"
                class="mode-icon-image"
                alt=""
            >
        `;

    }

    return icon || "";

}


// ========================================
// POBIERANIE GRACZY Z API
// ========================================

let players = [];

const API_URL = (GGtiersConfig.apiUrl || "").replace(/\/$/, "");


async function loadPlayers() {

    try {

        const response = await fetch(
            `${API_URL}/api/players`
        );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        players = data.map(player => {

            const minecraft =
                player.minecraft || null;


            /*
             * Minecraft:
             *
             * minecraft.username
             * minecraft.uuid
             *
             * Skin jest pobierany bezpośrednio
             * przez MC-Heads na podstawie UUID.
             */


            const minecraftUsername =
    minecraft?.username ||
    null;

let skinHead = null;

if (minecraftUsername) {

    skinHead =
        `https://mc-heads.net/head/${encodeURIComponent(minecraftUsername)}/32`;
} 


            /*
             * Fallback:
             * jeżeli UUID nie istnieje,
             * używamy starego headUrl z API.
             */


            if (
                !skinHead &&
                minecraft?.headUrl
            ) {

                skinHead =
                    minecraft.headUrl;

            }


            return {

                id:
                    player.discordId ||
                    player.id ||
                    null,


                name:
                    minecraft?.username ||
                    player.name ||
                    player.discordName ||
                    "Unknown",


                discordName:
                    player.discordName ||
                    player.name ||
                    "Unknown",


                minecraft:
                    minecraft,


minecraftUsername:
    minecraftUsername,


                skin:
                    minecraft?.skinUrl ||
                    null,


                head:
                    skinHead,


                avatar:
                    minecraft?.avatarUrl ||
                    null,


                body:
                    minecraft?.bodyUrl ||
                    null,


                subhuman:
                    player.subhuman ??
                    false,


                tiers: {

                    Sword:
                        player.sword ??
                        null,

                    Crystal:
                        player.crystal ??
                        null,

                    NPot:
                        player.npot ??
                        null,

                    Axe:
                        player.axe ??
                        null,

                    Mace:
                        player.mace ??
                        null,

                    UHC:
                        player.uhc ??
                        null,

                    Gildie:
                        player.gildie ??
                        null,

                    Dpot:
                        player.dpot ??
                        player.Dpot ??
                        null,


                    Podziemia:
                        player.podziemia ??
                        null,

                    SMP:
                        player.smp ??
                        null

                }

            };

        });


        normalizePlayers();

        showAllPlayers();

        showPlayerProfile();


    } catch (error) {

        console.error(
            "Nie udało się pobrać graczy:",
            error
        );


        const tierlist =
            document.getElementById(
                "tierlist"
            );


        if (tierlist) {

            tierlist.innerHTML = `

                <div style="
                    padding: 30px;
                    text-align: center;
                    color: #ff7777;
                ">

                    Nie udało się pobrać danych GGtiers.

                </div>

            `;

        }

    }

}


// ========================================
// UZUPEŁNIANIE DANYCH
// ========================================

function normalizePlayers() {

    players.forEach(player => {

        if (!player.tiers) {

            player.tiers = {};

        }


        GGtiersConfig.modes.forEach(mode => {

            if (
                player.tiers[mode.id] ===
                undefined
            ) {

                player.tiers[mode.id] = null;

            }

        });


        if (
            typeof player.subhuman !==
            "boolean"
        ) {

            player.subhuman = false;

        }

    });

}


// ========================================
// WARTOŚĆ TIERU
// ========================================

function getTierPoints(tierId) {

    const tier =
        GGtiersConfig.tiers.find(
            tier =>
                tier.id === tierId
        );


    return tier
        ? tier.points * 3
        : 0;

}


// ========================================
// OVERALL
// ========================================

function getOverall(player) {

    if (
        !player ||
        player.subhuman
    ) {

        return 0;

    }


    let overall = 0;


    GGtiersConfig.modes.forEach(mode => {

        overall += getTierPoints(
            player.tiers[mode.id]
        );

    });


    return overall;

}


// ========================================
// SORTOWANIE
// ========================================

function getSortedPlayers() {

    return [...players].sort(
        (a, b) => {

            if (
                a.subhuman &&
                !b.subhuman
            ) {

                return 1;

            }


            if (
                !a.subhuman &&
                b.subhuman
            ) {

                return -1;

            }


            return (
                getOverall(b) -
                getOverall(a)
            );

        }
    );

}


// ========================================
// KLASA TIERU
// ========================================

function getTierClass(tier) {

    return tier
        ? "tier-" +
          tier.toLowerCase()
        : "";

}


// ========================================
// AVATAR / SKIN GRACZA
// ========================================

function renderPlayerSkin(
    player,
    className = "player-skin"
) {

    if (
        !player ||
        !player.head
    ) {

        return "";

    }


    return `

        <img
            src="${player.head}"
            class="${className}"
            alt="${player.name}"
            loading="lazy"
        >

    `;

}


// ========================================
// KOLORY KOLUMN (Tier 1, 2, 3, 4, 5)
// ========================================

const COLUMN_COLORS = [
    { hi: "#ffe27a", lo: "#d99a00", rgb: "255,200,40"  }, // Tier 1 - złoty
    { hi: "#e6eef5", lo: "#8fa3b5", rgb: "190,208,224" }, // Tier 2 - srebrny
    { hi: "#e9a07e", lo: "#a8502f", rgb: "214,120,80"  }, // Tier 3 - miedziany
    { hi: "#ff6b78", lo: "#b01226", rgb: "235,60,75"   }, // Tier 4 - czerwony
    { hi: "#b78cff", lo: "#5a34c4", rgb: "150,110,240" }  // Tier 5 - fioletowy
];


function columnStyle(index) {

    const color =
        COLUMN_COLORS[
            Math.min(index, COLUMN_COLORS.length - 1)
        ];

    return (
        `--tc:${color.hi};` +
        `--tc-lo:${color.lo};` +
        `--tc-rgb:${color.rgb}`
    );

}


// pastylka z tierem: HT1 złota, reszta biała, brak = przygaszona
function tierPillClass(tier) {

    if (!tier) {
        return "empty";
    }

    return tier === "HT1"
        ? "gold"
        : "";

}


function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// ========================================
// IKONA W OKTAGONIE + TIER POD SPODEM
// ========================================

function renderBigIcon(icon, className) {

    if (
        typeof icon === "string" &&
        /\.(png|jpg|jpeg|webp|svg)$/i.test(icon)
    ) {

        return `
            <img
                src="${icon}"
                class="${className}"
                alt=""
            >
        `;

    }

    return `<span class="${className}-emoji">${icon || ""}</span>`;

}


function renderTierBadge(mode, tier) {

    const icon = tier
        ? renderBigIcon(mode.icon, "badge-icon")
        : `<span class="badge-icon-emoji">?</span>`;

    return `

        <div
            class="tier-badge ${tier ? "" : "is-empty"}"
            title="${escapeHTML(mode.name)}"
        >

            <span class="badge-circle">
                ${icon}
            </span>

            <span class="tier-pill ${tierPillClass(tier)}">
                ${tier || "-"}
            </span>

        </div>

    `;

}


// ========================================
// PRZYCISKI TRYBÓW (ZAKŁADKI)
// ========================================

let currentView = "overall";


function renderModeTabs() {

    const tabs =
        document.getElementById("modeTabs");

    if (!tabs) {
        return;
    }

    const items = [
        {
            id: "overall",
            name: "Overall",
            icon: "🏆"
        },
        ...GGtiersConfig.modes
    ];

    tabs.innerHTML = items
        .map(item => `

            <button
                type="button"
                class="mode-tab ${item.id === currentView ? "active" : ""}"
                data-view="${escapeHTML(item.id)}"
            >

                ${renderBigIcon(item.icon, "tab-icon")}

                <span>${escapeHTML(item.name)}</span>

            </button>

        `)
        .join("");

}


const modeTabsElement =
    document.getElementById("modeTabs");

if (modeTabsElement) {

    modeTabsElement.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(".mode-tab");

            if (!button) {
                return;
            }

            currentView = button.dataset.view;

            showAllPlayers();

        }
    );

}


// ========================================
// KOLUMNY TIERÓW DLA WYBRANEGO TRYBU
// ========================================

function getTierGroups() {

    const groups = [];

    GGtiersConfig.tiers.forEach(tier => {

        const number =
            (String(tier.id).match(/\d+/) || [tier.id])[0];

        let group =
            groups.find(item => item.number === number);

        if (!group) {
            group = { number, ids: [] };
            groups.push(group);
        }

        group.ids.push(tier.id);

    });

    return groups;

}


function renderModeColumns(tierlist, mode) {

    const sortedPlayers = getSortedPlayers();

    const tierOrder = id =>
        GGtiersConfig.tiers.findIndex(tier => tier.id === id);

    let html = `<div class="tier-columns">`;

    getTierGroups().forEach((group, groupIndex) => {

        // w jednej kolumnie: najpierw HT, potem LT
        const list = sortedPlayers
            .filter(player =>
                group.ids.includes(player.tiers[mode.id])
            )
            .sort((a, b) =>
                tierOrder(a.tiers[mode.id]) -
                tierOrder(b.tiers[mode.id])
            );

        html += `

            <section
                class="tier-column"
                style="${columnStyle(groupIndex)}"
            >

                <div class="tier-column-head">
                    <span>Tier ${escapeHTML(group.number)}</span>
                    <small>${list.length}</small>
                </div>

                <div class="tier-column-body">

        `;

        if (list.length === 0) {

            html += `
                <div class="tier-column-empty">
                    Brak graczy
                </div>
            `;

        }

        list.forEach(player => {

            const index = players.indexOf(player);

            html += `

                <button
                    type="button"
                    class="tier-player"
                    data-index="${index}"
                >

                    ${
                        player.head
                            ? `<img
                                    src="${player.head}"
                                    class="tier-player-skin"
                                    alt=""
                                    loading="lazy"
                               >`
                            : `<span class="tier-player-skin"></span>`
                    }

                    <span class="tier-player-name">
                        ${escapeHTML(player.name)}
                    </span>

                    ${
                        player.subhuman
                            ? `<span class="subhuman-badge">SUBHUMAN</span>`
                            : ""
                    }

                    <span class="tier-tag">
                        ${escapeHTML(player.tiers[mode.id])}
                    </span>

                </button>

            `;

        });

        html += `
                </div>
            </section>
        `;

    });

    html += `</div>`;

    tierlist.innerHTML = html;

}


const tierlistElement =
    document.getElementById("tierlist");

if (tierlistElement) {

    tierlistElement.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".tier-player, .player-name[data-index]"
                );

            if (!button) {
                return;
            }

            // nick w tabeli to link - blokujemy przejście na inną stronę
            event.preventDefault();

            const player =
                players[Number(button.dataset.index)];

            if (player) {
                openPlayerModal(player);
            }

        }
    );

}


// ========================================
// GŁÓWNA TIERLISTA
// ========================================

function renderOverallTable() {

    const tierlist =
        document.getElementById(
            "tierlist"
        );


    if (!tierlist) {

        return;

    }


    tierlist.style.setProperty(
        "--mode-count",
        GGtiersConfig.modes.length
    );


    tierlist.innerHTML = "";


    const sortedPlayers =
        getSortedPlayers();


    // ====================================
    // NAGŁÓWEK
    // ====================================

    let headerHTML = `

        <div class="all-players-header">

            <strong>#</strong>

            <strong>Gracz</strong>

            <strong>Overall</strong>

    `;


    GGtiersConfig.modes.forEach(mode => {

        headerHTML += `

            <strong class="mode-column-heading" title="${escapeHTML(mode.name)}">
                ${renderBigIcon(mode.icon, "mode-column-icon")}
            </strong>

        `;

    });


    headerHTML += `</div>`;


    tierlist.innerHTML +=
        headerHTML;


    // ====================================
    // GRACZE
    // ====================================

    sortedPlayers.forEach(
        (player, index) => {

            const place =
                index + 1;


            const skinHTML =
                renderPlayerSkin(
                    player
                );


            let rowHTML = `

                <div class="all-players-row">

                    <span class="player-place">
                        ${place}
                    </span>


                    <a href="#" class="player-name" data-index="${players.indexOf(player)}">

                        ${skinHTML}

                        <span class="player-name-text">

                            ${player.name}

                            ${
                                player.subhuman

                                    ? `
                                        <span class="subhuman-badge">
                                            SUBHUMAN
                                        </span>
                                      `

                                    : ""
                            }

                        </span>

                    </a>


                    <span class="player-overall">

                        ${
                            player.subhuman

                                ? "-"

                                : getOverall(player)

                        }

                    </span>

            `;


            GGtiersConfig.modes.forEach(mode => {

                const tier =
                    player.tiers[mode.id];


                const displayTier =
                    tier || "-";


                rowHTML += `
                    <div class="player-mode-cell">
                        ${renderTierBadge(mode, tier)}
                    </div>
                `;

            });


            rowHTML += `</div>`;


            tierlist.innerHTML +=
                rowHTML;

        }
    );

}


// ========================================
// WYBÓR WIDOKU (OVERALL / TRYB)
// ========================================

function showAllPlayers() {

    renderModeTabs();

    const tierlist =
        document.getElementById("tierlist");

    if (!tierlist) {
        return;
    }

    const mode = GGtiersConfig.modes.find(
        mode => mode.id === currentView
    );

    tierlist.classList.toggle("columns-view", Boolean(mode));

    if (mode) {
        renderModeColumns(tierlist, mode);
    } else {
        currentView = "overall";
        renderOverallTable();
    }

}


// ========================================
// WYSZUKIWANIE - ENTER
// ========================================

const playerSearch =
    document.getElementById(
        "playerSearch"
    );


if (playerSearch) {

    playerSearch.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key !==
                "Enter"
            ) {

                return;

            }


            const searchText =
                playerSearch.value.trim();


            if (
                searchText === ""
            ) {

                return;

            }


            const player =
                players.find(
                    player =>
                        player.name
                            .toLowerCase() ===
                        searchText
                            .toLowerCase()
                );


            if (!player) {

                alert(
                    "Nie znaleziono gracza: " +
                    searchText
                );

                return;

            }


            openPlayerModal(player);

        }
    );

}


// ========================================
// SKIN CAŁEJ POSTACI W MODALU
// ========================================

function renderModalBody(player) {

    if (!player) {
        return "";
    }

    const username = player.minecraftUsername;

    // Zapasowy obrazek, gdyby MC-Heads nie odpowiedział
    const fallback = player.body || "";

    let src = "";

    if (username) {
        src = `https://mc-heads.net/body/${encodeURIComponent(username)}/200`;
    } else if (fallback) {
        src = fallback;
    }

    if (!src) {
        return "";
    }

    const onError = (fallback && src !== fallback)
        ? `onerror="this.onerror=null;this.src='${fallback}'"`
        : "";

    return `
        <img
            src="${src}"
            class="modal-skin-body"
            alt="${player.name}"
            ${onError}
        >
    `;
}


// ========================================
// MODAL GRACZA
// ========================================

function openPlayerModal(player) {

    const modal =
        document.getElementById(
            "playerModal"
        );


    const playerName =
        document.getElementById(
            "modalPlayerName"
        );


    const playerInfo =
        document.getElementById(
            "modalPlayerInfo"
        );


    if (
        !modal ||
        !playerName ||
        !playerInfo
    ) {

        return;

    }


    const sortedPlayers =
        getSortedPlayers();


    const place =
        sortedPlayers.indexOf(player) +
        1;


    const overall =
        getOverall(player);


    playerName.innerHTML = `

        ${renderModalBody(player)}

        <span>

            ${player.name}

            <span class="modal-place">
                #${place}
            </span>

            ${
                player.subhuman

                    ? `
                        <span class="subhuman-badge">
                            SUBHUMAN
                        </span>
                      `

                    : ""
            }

        </span>

    `;


    playerInfo.innerHTML = `

        <div class="modal-tier">

            <strong>
                Overall
            </strong>

            <span>

                ${
                    player.subhuman
                        ? "-"
                        : overall + " pkt"
                }

            </span>

        </div>

    `;


    playerInfo.innerHTML += `

        <div class="modal-badges">

            ${
                GGtiersConfig.modes
                    .map(mode =>
                        renderTierBadge(
                            mode,
                            player.tiers[mode.id]
                        )
                    )
                    .join("")
            }

        </div>

    `;


    modal.classList.add("show");

}


// ========================================
// ZAMYKANIE MODALA
// ========================================

const closePlayerModal =
    document.getElementById(
        "closePlayerModal"
    );


if (closePlayerModal) {

    closePlayerModal.addEventListener(
        "click",
        function () {

            const modal =
                document.getElementById(
                    "playerModal"
                );


            if (modal) {

                modal.classList.remove(
                    "show"
                );

            }

        }
    );

}


// ========================================
// PROFIL GRACZA
// ========================================

function showPlayerProfile() {

    const params =
        new URLSearchParams(
            window.location.search
        );


    const playerName =
        params.get("name");


    if (!playerName) {

        return;

    }


    const player =
        players.find(
            player =>
                player.name
                    .toLowerCase() ===
                playerName
                    .toLowerCase()
        );


    if (!player) {

        const nameElement =
            document.getElementById(
                "playerName"
            );


        if (nameElement) {

            nameElement.textContent =
                "Nie znaleziono gracza.";

        }


        return;

    }


    const sortedPlayers =
        getSortedPlayers();


    const place =
        sortedPlayers.indexOf(player) +
        1;


    const nameElement =
        document.getElementById(
            "playerName"
        );


    const placeElement =
        document.getElementById(
            "playerPlace"
        );


    const overallElement =
        document.getElementById(
            "playerOverall"
        );


    if (nameElement) {

        nameElement.textContent =
            player.name;

    }


    if (placeElement) {

        placeElement.textContent =
            "#" + place;

    }


    if (overallElement) {

        overallElement.textContent =
            player.subhuman
                ? "-"
                : getOverall(player);

    }


    // ====================================
    // SKIN NA STRONIE PROFILU
    // ====================================

    const profileSkin =
        document.getElementById(
            "playerSkin"
        );


    if (
        profileSkin &&
        player.head
    ) {

        profileSkin.src =
            player.head;

        profileSkin.alt =
            player.name;

        profileSkin.style.display =
            "block";

    }


    GGtiersConfig.modes.forEach(mode => {

        const element =
            document.getElementById(
                "player" + mode.id
            );


        if (!element) {

            return;

        }


        const tier =
            player.tiers[mode.id];


        element.textContent =
            tier || "-";


        element.classList.add(
            getTierClass(tier)
        );

    });

}


// ========================================
// START
// ========================================

loadPlayers();