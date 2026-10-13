// ========================================
// GGtiers - ADMIN PANEL
// ========================================

const newPlayerName = document.getElementById("newPlayerName");
const newPlayerModes = document.getElementById("newPlayerModes");
const newPlayerSubhuman = document.getElementById("newPlayerSubhuman");
const addPlayerButton = document.getElementById("addPlayerButton");
const adminStatus = document.getElementById("adminStatus");

const playersList = document.getElementById("playersList");

const editPlayerModal = document.getElementById("editPlayerModal");
const editPlayerName = document.getElementById("editPlayerName");
const editPlayerModes = document.getElementById("editPlayerModes");
const editPlayerSubhuman = document.getElementById("editPlayerSubhuman");

const closeEditModal = document.getElementById("closeEditModal");
const saveEditButton = document.getElementById("saveEditButton");
const deleteEditButton = document.getElementById("deleteEditButton");

let players = [];
let editingPlayerIndex = null;


// ========================================
// LOCAL STORAGE
// ========================================

function loadPlayers() {
    const savedPlayers = localStorage.getItem("myTierListPlayers");

    if (!savedPlayers) {
        players = [];
        return;
    }

    try {
        players = JSON.parse(savedPlayers);
    } catch (error) {
        console.error("Nie udało się wczytać graczy:", error);
        players = [];
    }
}


// ========================================
// NORMALIZACJA GRACZY
// ========================================

function normalizePlayers() {
    if (!Array.isArray(players)) {
        players = [];
    }

    const defaultTier =
        GGtiersConfig.tiers[
            GGtiersConfig.tiers.length - 1
        ]?.id || "HT5";

    players = players
        .map(player => {
            if (!player || typeof player !== "object") {
                return null;
            }

            if (!player.name) {
                player.name = "Unknown";
            }

            if (!player.tiers || typeof player.tiers !== "object") {
                player.tiers = {};
            }

            GGtiersConfig.modes.forEach(mode => {
                if (!player.tiers[mode.id]) {
                    player.tiers[mode.id] = defaultTier;
                }
            });

            if (typeof player.subhuman !== "boolean") {
                player.subhuman = false;
            }

            return player;
        })
        .filter(Boolean);
}


// ========================================
// SAVE
// ========================================

function savePlayers() {
    localStorage.setItem(
        "myTierListPlayers",
        JSON.stringify(players)
    );
}


// ========================================
// IKONY TRYBÓW
// ========================================

function renderModeIcon(icon) {
    if (
        typeof icon === "string" &&
        /\.(png|jpg|jpeg|webp|svg)$/i.test(icon)
    ) {
        return `
            <img
                src="${icon}"
                class="mode-icon-image"
                alt=""
            >
        `;
    }

    return `
        <span class="mode-icon-emoji">
            ${icon}
        </span>
    `;
}


// ========================================
// STATUS
// ========================================

function showStatus(message, type = "success") {
    if (!adminStatus) {
        return;
    }

    adminStatus.textContent = message;
    adminStatus.className = "admin-status " + type;

    setTimeout(() => {
        adminStatus.textContent = "";
        adminStatus.className = "admin-status";
    }, 3000);
}


// ========================================
// ESCAPE HTML
// ========================================

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ========================================
// TIER OPTIONS
// ========================================

function createTierOptions(selectedTier) {
    return GGtiersConfig.tiers
        .map(tier => {
            return `
                <option
                    value="${tier.id}"
                    ${tier.id === selectedTier ? "selected" : ""}
                >
                    ${tier.name}
                </option>
            `;
        })
        .join("");
}


// ========================================
// KLASA TIERU
// ========================================

function getTierClass(tier) {
    if (!tier) {
        return "";
    }

    return (
        "tier-" +
        String(tier)
            .toLowerCase()
            .replace(/\s+/g, "-")
    );
}


// ========================================
// DODAWANIE - TRYBY
// ========================================

function renderAddModes() {
    if (!newPlayerModes) {
        return;
    }

    newPlayerModes.innerHTML = "";

    const defaultTier =
        GGtiersConfig.tiers[
            GGtiersConfig.tiers.length - 1
        ].id;

    GGtiersConfig.modes.forEach(mode => {
        const group = document.createElement("div");

        group.className =
            "admin-form-group admin-mode-group";

        group.innerHTML = `
            <label class="admin-mode-label">
                ${renderModeIcon(mode.icon)}
                <span>${escapeHTML(mode.name)}</span>
            </label>

            <select
                class="admin-tier-select"
                data-mode="${escapeHTML(mode.id)}"
            >
                ${createTierOptions(defaultTier)}
            </select>
        `;

        newPlayerModes.appendChild(group);
    });
}


// ========================================
// LISTA GRACZY
// ========================================

function renderPlayers() {
    if (!playersList) {
        return;
    }

    playersList.style.setProperty(
        "--mode-count",
        GGtiersConfig.modes.length
    );

    playersList.innerHTML = "";

    if (players.length === 0) {
        playersList.innerHTML = `
            <div class="admin-empty">
                Brak graczy.
            </div>
        `;

        return;
    }

    // NAGŁÓWEK

    const header = document.createElement("div");

    header.className =
        "admin-player admin-player-header";

    header.innerHTML = `
        <strong>GRACZ</strong>

        ${GGtiersConfig.modes
            .map(mode => {
                return `
                    <span>
                        ${renderModeIcon(mode.icon)}
                        <span>
                            ${escapeHTML(
                                mode.name.toUpperCase()
                            )}
                        </span>
                    </span>
                `;
            })
            .join("")}
    `;

    playersList.appendChild(header);

    // GRACZE

    players.forEach((player, index) => {
        const row = document.createElement("button");

        row.type = "button";
        row.className =
            "admin-player admin-player-button";

        row.innerHTML = `
            <strong>
                ${escapeHTML(player.name)}
            </strong>

            ${GGtiersConfig.modes
                .map(mode => {
                    const tier =
                        player.tiers?.[mode.id] ||
                        GGtiersConfig.tiers[
                            GGtiersConfig.tiers.length - 1
                        ].id;

                    return `
                        <span class="${getTierClass(tier)}">
                            ${escapeHTML(tier)}
                        </span>
                    `;
                })
                .join("")}
        `;

        row.addEventListener("click", () => {
            openEditPlayer(index);
        });

        playersList.appendChild(row);
    });
}


// ========================================
// DODAWANIE GRACZA
// ========================================

if (addPlayerButton) {
    addPlayerButton.addEventListener("click", () => {
        const name = newPlayerName
            ? newPlayerName.value.trim()
            : "";

        if (!name) {
            showStatus(
                "Wpisz nick gracza.",
                "error"
            );

            return;
        }

        const alreadyExists = players.some(player => {
            return (
                player.name.toLowerCase() ===
                name.toLowerCase()
            );
        });

        if (alreadyExists) {
            showStatus(
                "Gracz o takim nicku już istnieje.",
                "error"
            );

            return;
        }

        const tiers = {};

        document
            .querySelectorAll(
                "#newPlayerModes .admin-tier-select"
            )
            .forEach(select => {
                const modeId = select.dataset.mode;

                tiers[modeId] = select.value;
            });

        const newPlayer = {
            name: name,
            tiers: tiers,
            subhuman: newPlayerSubhuman
                ? newPlayerSubhuman.checked
                : false
        };

        players.push(newPlayer);

        savePlayers();
        renderPlayers();

        if (newPlayerName) {
            newPlayerName.value = "";
        }

        if (newPlayerSubhuman) {
            newPlayerSubhuman.checked = false;
        }

        renderAddModes();

        showStatus(
            "Gracz został dodany.",
            "success"
        );
    });
}


// ========================================
// OTWIERANIE EDYCJI
// ========================================

function openEditPlayer(index) {
    const player = players[index];

    if (!player) {
        return;
    }

    editingPlayerIndex = index;

    // POKAŻ MODAL

    if (editPlayerModal) {
        editPlayerModal.classList.add("show");
    }

    if (editPlayerName) {
        editPlayerName.textContent = player.name;
    }

    if (editPlayerSubhuman) {
        editPlayerSubhuman.checked =
            player.subhuman === true;
    }

    if (!editPlayerModes) {
        return;
    }

    editPlayerModes.innerHTML = "";

    GGtiersConfig.modes.forEach(mode => {
        const currentTier =
            player.tiers?.[mode.id] ||
            GGtiersConfig.tiers[
                GGtiersConfig.tiers.length - 1
            ].id;

        const group = document.createElement("div");

        group.className = "edit-mode-row";

        group.innerHTML = `
            <strong class="edit-mode-title">
                ${renderModeIcon(mode.icon)}
                <span>${escapeHTML(mode.name)}</span>
            </strong>

            <select
                class="admin-tier-select edit-tier-select"
                data-mode="${escapeHTML(mode.id)}"
            >
                ${createTierOptions(currentTier)}
            </select>
        `;

        editPlayerModes.appendChild(group);
    });
}


// ========================================
// ZAMYKANIE EDYCJI
// ========================================

function closeEditPlayer() {
    editingPlayerIndex = null;

    if (editPlayerModal) {
        editPlayerModal.classList.remove("show");
    }
}

if (closeEditModal) {
    closeEditModal.addEventListener(
        "click",
        closeEditPlayer
    );
}


// ========================================
// KLIKNIĘCIE POZA MODALEM
// ========================================

if (editPlayerModal) {
    editPlayerModal.addEventListener(
        "click",
        event => {
            if (event.target === editPlayerModal) {
                closeEditPlayer();
            }
        }
    );
}


// ========================================
// ZAPIS EDYCJI
// ========================================

if (saveEditButton) {
    saveEditButton.addEventListener(
        "click",
        () => {
            if (editingPlayerIndex === null) {
                return;
            }

            const player =
                players[editingPlayerIndex];

            if (!player) {
                return;
            }

            if (!player.tiers) {
                player.tiers = {};
            }

            document
                .querySelectorAll(
                    "#editPlayerModes .edit-tier-select"
                )
                .forEach(select => {
                    const modeId =
                        select.dataset.mode;

                    player.tiers[modeId] =
                        select.value;
                });

            player.subhuman =
                editPlayerSubhuman
                    ? editPlayerSubhuman.checked
                    : false;

            savePlayers();
            renderPlayers();

            closeEditPlayer();

            showStatus(
                "Zmiany zostały zapisane.",
                "success"
            );
        }
    );
}


// ========================================
// USUWANIE GRACZA
// ========================================

if (deleteEditButton) {
    deleteEditButton.addEventListener(
        "click",
        () => {
            if (editingPlayerIndex === null) {
                return;
            }

            const player =
                players[editingPlayerIndex];

            if (!player) {
                return;
            }

            const confirmed = confirm(
                `Czy na pewno chcesz usunąć gracza "${player.name}"?`
            );

            if (!confirmed) {
                return;
            }

            players.splice(
                editingPlayerIndex,
                1
            );

            savePlayers();
            renderPlayers();

            closeEditPlayer();

            showStatus(
                "Gracz został usunięty.",
                "success"
            );
        }
    );
}


// ========================================
// START
// ========================================

loadPlayers();

normalizePlayers();

renderAddModes();

renderPlayers();