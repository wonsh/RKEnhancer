// ==UserScript==
// @name         RK Enhanced Inventory Tools
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Adds search filters and bulk transfer functionality for RK inventory
// @author       You
// @match        https://www.renaissancekingdoms.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    // ============ CONFIGURATION ============
    const CONFIG = {
        DELAYS: {
            ELEMENT_WAIT: 100,
            TRANSFER_DELAY: 100,
            IFRAME_CHECK: 500,
            INIT_DELAY: 1000
        },
        SELECTORS: {
            MARKET_LEGEND: 'div.illustrationImage.legendeEvenement.legendeMarche',
            INVENTORY_PANEL: '.popupEcranRR_ecranInventaire',
            CURRENT_ITEMS_LEGEND: 'div.illustrationImage.legendeEvenement:not(.legendeMarche)',
            RACINE_POPUP: '#racinePopup',
            INVENTORY_ITEMS: '.ConteneurItem.bas',
            MARKET_TABLE: '#zoneTexte0 table',
            LEGEND_TABLE: 'table.table_legende'
        }
    };

    // ============ UTILITY FUNCTIONS ============
    const Utils = {
        waitForElement(selector, callback, timeout = 5000) {
            const startTime = Date.now();
            const checkElement = () => {
                const element = document.querySelector(selector);
                if (element) {
                    callback(element);
                } else if (Date.now() - startTime < timeout) {
                    setTimeout(checkElement, CONFIG.DELAYS.ELEMENT_WAIT);
                }
            };
            checkElement();
        },

        createElement(tag, options = {}) {
            const element = document.createElement(tag);
            if (options.className) element.className = options.className;
            if (options.textContent) element.textContent = options.textContent;
            if (options.style) element.style.cssText = options.style;
            if (options.attributes) {
                Object.entries(options.attributes).forEach(([key, value]) => {
                    element.setAttribute(key, value);
                });
            }
            return element;
        },

        addStyles(styles) {
            // Fallback for Safari if GM_addStyle doesn't work
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(styles);
            } else {
                const styleElement = document.createElement('style');
                styleElement.textContent = styles;
                document.head.appendChild(styleElement);
            }
        },

        makeHttpRequest(options) {
            // Fallback for Safari if GM_xmlhttpRequest doesn't work
            if (typeof GM_xmlhttpRequest === 'function') {
                return new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        ...options,
                        onload: resolve,
                        onerror: reject
                    });
                });
            } else {
                // Fallback to fetch for Safari
                return fetch(options.url, {
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.data
                });
            }
        },

        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
    };

    // ============ STYLES ============
    const STYLES = `
        /* Search filter styles */
        .rk-search-container, .rk-inventory-search-container, .rk-current-search-container {
            margin: 5px 0;
        }
        .rk-search-container input,
        .rk-inventory-search-container input,
        .rk-current-search-container input {
            padding: 5px;
            border: 1px solid #999;
            border-radius: 3px;
            font-size: 12px;
        }
        .rk-search-container button,
        .rk-inventory-search-container button,
        .rk-current-search-container button {
            padding: 2px 8px;
            background-color: #e0e0e0;
            border: 1px solid #999;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .rk-search-container button:hover,
        .rk-inventory-search-container button:hover,
        .rk-current-search-container button:hover {
            background-color: #d0d0d0;
        }

        /* Bulk transfer styles */
        .bulk-transfer-checkbox {
            margin-left: 5px;
            margin-right: 5px;
            vertical-align: middle;
            cursor: pointer;
        }
        .bulk-transfer-btn {
            padding: 2px 5px;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 12px;
        }
        .bulk-transfer-btn:disabled {
            background: #cccccc;
            cursor: not-allowed;
        }
        .bulk-transfer-progress {
            font-size: 11px;
            color: #666;
            margin-top: 3px;
        }

        /* Sortable headers */
        .sortable-header {
            cursor: pointer !important;
            user-select: none;
        }
        .sortable-header:hover {
            text-decoration: underline;
        }
        .sortable-header::after {
            content: " ↕";
            font-size: 0.8em;
            opacity: 0.5;
        }
    `;

    // ============ SEARCH FUNCTIONALITY ============
    const SearchManager = {
        createSearchContainer() {
            const container = Utils.createElement('div', {
                className: 'rk-search-container',
                style: 'margin-top: 10px; padding: 5px;'
            });

            const input = Utils.createElement('input', {
                attributes: {
                    type: 'text',
                    placeholder: 'Search...'
                },
                style: 'width: 100%; padding: 5px; border: 1px solid #999; border-radius: 3px; font-size: 12px;'
            });

            const clearButton = Utils.createElement('button', {
                textContent: 'Clear',
                style: 'margin-left: 0px; padding: 0px 5px; background-color: #e0e0e0; border: 1px solid #999; border-radius: 3px; cursor: pointer; font-size: 12px;'
            });

            container.appendChild(document.createTextNode('Filter: '));
            container.appendChild(input);
            container.appendChild(clearButton);

            return { container, input, clearButton };
        },

        addMarketSearch(doc = document) {
            const targetElement = doc.querySelector(CONFIG.SELECTORS.MARKET_LEGEND);
            if (!targetElement || targetElement.parentNode.querySelector('.rk-search-container')) return;

            const { container, input, clearButton } = this.createSearchContainer();
            targetElement.parentNode.insertBefore(container, targetElement.nextSibling);

            const debouncedFilter = Utils.debounce(() => this.filterMarketTable(doc, input.value), 150);

            input.addEventListener('input', debouncedFilter);
            input.addEventListener('keyup', debouncedFilter);
            clearButton.addEventListener('click', () => {
                input.value = '';
                this.filterMarketTable(doc, '');
                input.focus();
            });
        },

        filterMarketTable(doc, searchTerm) {
            const term = searchTerm.toLowerCase().trim();
            const textZone = doc.getElementById('zoneTexte0');
            if (!textZone) return;

            const rows = textZone.querySelectorAll('tr');
            rows.forEach((row, idx) => {
                if (idx === 0) {
                    row.style.display = '';
                    return;
                }
                const nameCell = row.querySelector('td:nth-child(2)');
                if (nameCell) {
                    const itemName = nameCell.textContent.toLowerCase().trim();
                    row.style.display = (term === '' || itemName.includes(term)) ? '' : 'none';
                } else {
                    row.style.display = term === '' ? '' : 'none';
                }
            });
        },

        addInventorySearch() {
            const racinePopup = document.getElementById('racinePopup');
            const inventoryPanel = racinePopup?.querySelector(CONFIG.SELECTORS.INVENTORY_PANEL);
            if (!inventoryPanel) return;

            const header = inventoryPanel.querySelector('.encart_entete');
            if (!header || header.querySelector('.rk-inventory-search-container')) return;

            const searchContainer = Utils.createElement('div', {
                className: 'rk-inventory-search-container',
                style: 'position: absolute; right: 10px; top: 0px; margin: 0px 0; padding: 5px;'
            });

            const searchInput = Utils.createElement('input', {
                attributes: {
                    type: 'text',
                    placeholder: 'Filter...'
                },
                style: 'height: 24px; width: 30%; padding: 4px; font-size: 12px;'
            });

            const clearButton = Utils.createElement('button', {
                textContent: 'Clear',
                style: 'margin-left: 6px; padding: 2px 8px; background: #e0e0e0; border: 1px solid #999; border-radius: 3px; cursor: pointer; font-size: 12px;'
            });

            searchContainer.appendChild(searchInput);
            searchContainer.appendChild(clearButton);
            header.appendChild(searchContainer);

            const debouncedFilter = Utils.debounce(() => this.filterInventory(inventoryPanel, searchInput.value), 150);

            searchInput.addEventListener('input', debouncedFilter);
            searchInput.addEventListener('keyup', debouncedFilter);
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                this.filterInventory(inventoryPanel, '');
                searchInput.focus();
            });
        },

        filterInventory(inventoryPanel, searchTerm) {
            const term = searchTerm.toLowerCase().trim();
            const items = inventoryPanel.querySelectorAll('.ConteneurItem');
            items.forEach(item => {
                const nameDiv = item.querySelector('.inventaire_contenu_01_descriptif');
                const name = nameDiv?.textContent.toLowerCase().trim() || '';
                item.style.display = (term === '' || name.includes(term)) ? '' : 'none';
            });
        },

        addCurrentItemsSearch() {
            const legendTable = document.querySelector(CONFIG.SELECTORS.CURRENT_ITEMS_LEGEND);
            if (!legendTable || legendTable.querySelector('.rk-current-search-container')) return;

            const filterRow = document.createElement('tr');
            const filterCell = document.createElement('td');
            filterCell.colSpan = 2;
            filterCell.className = 'td_sans';

            const container = Utils.createElement('div', {
                className: 'rk-current-search-container',
                style: 'margin-top: 5px; display: flex; gap: 5px;'
            });

            const input = Utils.createElement('input', {
                attributes: {
                    type: 'text',
                    placeholder: 'Search ...'
                },
                style: 'flex-grow: 1; width: 50%; padding: 3px; font-size: 12px; border: 1px solid #999; border-radius: 3px;'
            });

            const clear = Utils.createElement('button', {
                textContent: 'Clear',
                style: 'padding: 2px 6px; background-color: #e0e0e0; border: 1px solid #999; border-radius: 3px; cursor: pointer; font-size: 12px;'
            });

            container.appendChild(input);
            container.appendChild(clear);
            filterCell.appendChild(container);
            filterRow.appendChild(filterCell);
            legendTable.querySelector('tbody')?.appendChild(filterRow);

            const debouncedFilter = Utils.debounce(() => this.filterHeldItems(input.value), 150);

            input.addEventListener('input', debouncedFilter);
            input.addEventListener('keyup', debouncedFilter);
            clear.addEventListener('click', () => {
                input.value = '';
                this.filterHeldItems('');
                input.focus();
            });
        },

        filterHeldItems(searchTerm) {
            const term = searchTerm.toLowerCase().trim();
            const items = document.querySelectorAll('.ConteneurItem');

            items.forEach(item => {
                if (item.classList.contains('item_inventaire_ecu')) {
                    item.style.display = '';
                    return;
                }

                const nameDiv = item.querySelector('.inventaire_contenu_01_descriptif');
                if (nameDiv?.textContent.trim() === 'Nazwa') {
                    item.style.display = '';
                    return;
                }

                const itemName = nameDiv?.textContent.toLowerCase().trim() || '';
                item.style.display = (term === '' || itemName.includes(term)) ? '' : 'none';
            });
        },

        initIframeSupport() {
            const checkIframes = () => {
                const iframes = document.querySelectorAll('iframe');
                iframes.forEach(iframe => {
                    try {
                        iframe.addEventListener('load', () => {
                            try {
                                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                                if (iframeDoc.querySelector(CONFIG.SELECTORS.MARKET_LEGEND)) {
                                    this.addMarketSearch(iframeDoc);
                                }
                            } catch (e) {
                                console.log('Cannot access iframe content (cross-origin)');
                            }
                        });

                        if (iframe.contentDocument) {
                            const iframeDoc = iframe.contentDocument;
                            if (iframeDoc.querySelector(CONFIG.SELECTORS.MARKET_LEGEND)) {
                                this.addMarketSearch(iframeDoc);
                            }
                        }
                    } catch (e) {
                        console.log('Cannot access iframe content (cross-origin)');
                    }
                });
            };

            setTimeout(checkIframes, CONFIG.DELAYS.INIT_DELAY);

            const iframeObserver = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.tagName === 'IFRAME') {
                            setTimeout(() => {
                                try {
                                    const iframeDoc = node.contentDocument || node.contentWindow.document;
                                    if (iframeDoc.querySelector(CONFIG.SELECTORS.MARKET_LEGEND)) {
                                        this.addMarketSearch(iframeDoc);
                                    }
                                } catch (e) {
                                    console.log('Cannot access iframe content (cross-origin)');
                                }
                            }, CONFIG.DELAYS.IFRAME_CHECK);
                        }
                    });
                });
            });

            iframeObserver.observe(document.body, { childList: true, subtree: true });
        }
    };

    // ============ BULK TRANSFER FUNCTIONALITY ============
    const BulkTransfer = {
        selectedItems: new Set(),

        addCheckboxes() {
            const targetDiv = document.querySelector('div.texte.texteInventaire');
            if (!targetDiv) return;

            const items = targetDiv.querySelectorAll(CONFIG.SELECTORS.INVENTORY_ITEMS);

            items.forEach(item => {
                if (item.querySelector('.bulk-transfer-checkbox')) return;

                const throwLink = item.querySelector('a[id^="jeter"]');
                if (!throwLink) return;

                const checkbox = Utils.createElement('input', {
                    className: 'bulk-transfer-checkbox',
                    attributes: {
                        type: 'checkbox'
                    }
                });

                checkbox.dataset.itemId = item.id.replace('Item', '');

                const itemNameEl = item.querySelector('.inventaire_contenu_01_descriptif');
                if (itemNameEl) {
                    checkbox.dataset.itemName = itemNameEl.textContent.trim();
                }

                throwLink.parentNode.insertBefore(checkbox, throwLink.nextSibling);
            });
        },

        createTransferUI() {
            const legendTable = document.querySelector(CONFIG.SELECTORS.LEGEND_TABLE);

            if (!legendTable || document.getElementById('bulk-transfer-row')) return;

            const parentDiv = legendTable.closest('div.illustrationImage');

            if (!parentDiv || !parentDiv.classList.contains('legendeEvenement') || 
                parentDiv.classList.contains('legendeMarche')) {
                return;
            }

            const row = document.createElement('tr');
            row.id = 'bulk-transfer-row';

            const td1 = Utils.createElement('td', { className: 'td_sans' });
            const btn = Utils.createElement('button', {
                className: 'bulk-transfer-btn',
                textContent: 'Bulk Transfer'
            });
            btn.addEventListener('click', () => this.transferSelectedItems());
            td1.appendChild(btn);

            const td2 = Utils.createElement('td', { className: 'td_sans' });
            const progress = Utils.createElement('div', {
                className: 'bulk-transfer-progress',
                textContent: '0 selected'
            });
            td2.appendChild(progress);

            row.appendChild(td1);
            row.appendChild(td2);

            const lastTransferRow = legendTable.querySelector('tr[id^="transfert"]:last-of-type');
            if (lastTransferRow) {
                lastTransferRow.parentNode.insertBefore(row, lastTransferRow.nextSibling);
            } else {
                legendTable.querySelector('tbody').appendChild(row);
            }

            document.addEventListener('change', (e) => {
                if (e.target.classList.contains('bulk-transfer-checkbox')) {
                    this.updateSelectionCount();
                }
            });
        },

        updateSelectionCount() {
            const checkboxes = document.querySelectorAll('.bulk-transfer-checkbox:checked');
            const progress = document.querySelector('.bulk-transfer-progress');
            if (progress) {
                progress.textContent = `${checkboxes.length} selected`;
            }
        },

        async transferSelectedItems() {
            const checkboxes = document.querySelectorAll('.bulk-transfer-checkbox:checked');
            const btn = document.querySelector('.bulk-transfer-btn');
            const progress = document.querySelector('.bulk-transfer-progress');

            if (checkboxes.length === 0) return;

            btn.disabled = true;
            btn.textContent = 'Transferring...';

            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < checkboxes.length; i++) {
                const checkbox = checkboxes[i];
                const itemId = checkbox.dataset.itemId;
                const itemName = checkbox.dataset.itemName || `Item ${itemId}`;

                if (progress) {
                    progress.textContent = `Transferring ${i + 1}/${checkboxes.length}`;
                }

                try {
                    await this.transferItem(itemId);
                    successCount++;
                    checkbox.checked = false;
                } catch (error) {
                    console.error(`Failed to transfer ${itemName}:`, error);
                    failCount++;
                }

                await new Promise(resolve => setTimeout(resolve, CONFIG.DELAYS.TRANSFER_DELAY));
            }

            btn.disabled = false;
            btn.textContent = 'Bulk Transfer';

            if (progress) {
                progress.textContent = `${successCount} transferred`;
            }

            setTimeout(() => {
                window.location.reload();
            }, CONFIG.DELAYS.INIT_DELAY);
        },

        async transferItem(itemId) {
            const transferBtn = document.getElementById(`transferer${itemId}`);
            if (!transferBtn) {
                throw new Error(`Transfer button not found for item ${itemId}`);
            }

            const onclick = transferBtn.getAttribute('onclick');
            const paramsMatch = onclick.match(/ouvreOptionsItem\(([^)]+)\)/);
            if (!paramsMatch) {
                throw new Error(`Could not extract parameters for item ${itemId}`);
            }

            const params = paramsMatch[1].split(',').map(p => p.trim().replace(/'/g, ''));
            const url = `https://www.renaissancekingdoms.com/Action.php?action=69&type=${params[2]}&IDParametre=${params[3]}`;
            const body = `quantite=${params[4] || '1'}&destination=transfererPropriete&submit=OK`;

            const response = await Utils.makeHttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                },
                data: body
            });

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}`);
            }

            return response;
        },

        init() {
            const targetDiv = document.querySelector('div.texte.texteInventaire');
            if (!targetDiv) return;

            this.addCheckboxes();
            this.createTransferUI();

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.addedNodes.length) {
                        this.addCheckboxes();
                        this.createTransferUI();
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    // ============ SORTING FUNCTIONALITY ============
    const SortManager = {
        sortDirection: {
            qty: 1,
            name: 1,
            weight: 1,
            marketName: 1,
            marketPrice: 1,
            marketQty: 1
        },

        makeHeaderSortable(element, key, sortFunction) {
            if (!element || element.dataset.sortBound) return;

            element.classList.add('sortable-header');
            element.title = "Click to sort";
            element.dataset.sortBound = "1";
            element.addEventListener("click", () => sortFunction(key));
        },

        sortInventory(key) {
            let allItems = Array.from(document.querySelectorAll(".ConteneurItem"));
            if (!allItems.length) return;

            let items = allItems.filter(el => {
                let nbreText = el.querySelector(".inventaire_contenu_01_nbre")?.textContent.trim() || "";
                let isHeader = nbreText === "#" || nbreText === "";
                let isMoney = el.classList.contains("item_inventaire_ecu");
                return !isHeader && !isMoney;
            });

            let parent = allItems[0].parentNode;

            const sortConfig = {
                qty: { selector: ".inventaire_contenu_01_nbre", numeric: true },
                name: { selector: ".inventaire_contenu_01_descriptif", numeric: false },
                weight: { selector: ".inventaire_contenu_01_poids", numeric: true }
            };

            const config = sortConfig[key];
            if (!config) return;

            items.sort((a, b) => {
                let aVal = a.querySelector(config.selector)?.textContent.trim() || "";
                let bVal = b.querySelector(config.selector)?.textContent.trim() || "";

                if (config.numeric) {
                    aVal = parseFloat(aVal.replace(",", ".")) || 0;
                    bVal = parseFloat(bVal.replace(",", ".")) || 0;
                } else {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }

                if (aVal < bVal) return -1 * this.sortDirection[key];
                if (aVal > bVal) return 1 * this.sortDirection[key];
                return 0;
            });

            this.sortDirection[key] *= -1;

            allItems.forEach(el => {
                if (!items.includes(el)) parent.appendChild(el);
            });
            items.forEach(item => parent.appendChild(item));
        },

        sortMarket(key, colIndex, isNumeric) {
            let table = document.querySelector(CONFIG.SELECTORS.MARKET_TABLE);
            if (!table) return;

            let rows = Array.from(table.querySelectorAll("tr")).slice(1);
            let parent = rows[0]?.parentNode;
            if (!rows.length) return;

            rows.sort((a, b) => {
                let aVal = a.querySelector(`td:nth-child(${colIndex})`)?.textContent.trim() || "";
                let bVal = b.querySelector(`td:nth-child(${colIndex})`)?.textContent.trim() || "";

                if (isNumeric) {
                    aVal = parseFloat(aVal.replace(",", ".")) || 0;
                    bVal = parseFloat(bVal.replace(",", ".")) || 0;
                } else {
                    aVal = aVal.toLowerCase();
                    bVal = bVal.toLowerCase();
                }

                if (aVal < bVal) return -1 * this.sortDirection[key];
                if (aVal > bVal) return 1 * this.sortDirection[key];
                return 0;
            });

            this.sortDirection[key] *= -1;
            rows.forEach(r => parent.appendChild(r));
        },

        applySortingHeaders() {
            // Inventory headers
            const qtyHeader = Array.from(document.querySelectorAll(".inventaire_contenu_01 b"))
                .find(el => el.textContent.trim() === "#");
            this.makeHeaderSortable(qtyHeader, "qty", () => this.sortInventory("qty"));

            const nameHeader = Array.from(document.querySelectorAll(".inventaire_contenu_01 b"))
                .find(el => el.textContent.trim() === "Nazwa");
            this.makeHeaderSortable(nameHeader, "name", () => this.sortInventory("name"));

            const weightHeader = Array.from(document.querySelectorAll(".inventaire_contenu_01 b"))
                .find(el => el.textContent.trim() === "Masa");
            this.makeHeaderSortable(weightHeader, "weight", () => this.sortInventory("weight"));

            // Market headers
            const marketNameHeader = document.querySelector(`${CONFIG.SELECTORS.MARKET_TABLE} tr:first-child td:nth-child(2) strong`);
            if (marketNameHeader?.textContent.trim() === "Nazwa") {
                this.makeHeaderSortable(marketNameHeader, "marketName", () => this.sortMarket("marketName", 2, false));
            }

            const marketPriceHeader = document.querySelector(`${CONFIG.SELECTORS.MARKET_TABLE} tr:first-child td:nth-child(3) strong`);
            if (marketPriceHeader?.textContent.trim() === "Cena") {
                this.makeHeaderSortable(marketPriceHeader, "marketPrice", () => this.sortMarket("marketPrice", 3, true));
            }

            const marketQtyHeader = document.querySelector(`${CONFIG.SELECTORS.MARKET_TABLE} tr:first-child td:nth-child(4) strong`);
            if (marketQtyHeader?.textContent.trim() === "Ilość") {
                this.makeHeaderSortable(marketQtyHeader, "marketQty", () => this.sortMarket("marketQty", 4, true));
            }
        },

        init() {
            this.applySortingHeaders();

            const observer = new MutationObserver(() => {
                this.applySortingHeaders();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    // ============ MAIN INITIALIZATION ============
    const App = {
        init() {
            // Add styles
            Utils.addStyles(STYLES);

            // Initialize components
            this.initSearchFunctionality();
            this.initBulkTransfer();
            this.initSorting();
        },

        initSearchFunctionality() {
            // Market search
            Utils.waitForElement(CONFIG.SELECTORS.MARKET_LEGEND, () => {
                SearchManager.addMarketSearch();
            });

            // Inventory search
            Utils.waitForElement(CONFIG.SELECTORS.RACINE_POPUP, (racinePopup) => {
                const inventoryObserver = new MutationObserver(() => {
                    const inventoryPanel = racinePopup.querySelector(CONFIG.SELECTORS.INVENTORY_PANEL);
                    if (inventoryPanel && !inventoryPanel.querySelector('.rk-inventory-search-container')) {
                        setTimeout(() => SearchManager.addInventorySearch(), 50);
                    }
                });
                inventoryObserver.observe(racinePopup, { childList: true, subtree: true });
            });

            // Current items search
            Utils.waitForElement(CONFIG.SELECTORS.LEGEND_TABLE, () => {
                SearchManager.addCurrentItemsSearch();
            });

            // Initialize iframe support
            SearchManager.initIframeSupport();
        },

        initBulkTransfer() {
            setTimeout(() => BulkTransfer.init(), CONFIG.DELAYS.INIT_DELAY);
        },

        initSorting() {
            SortManager.init();
        }
    };

    // Start the application
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }

// ============ ADD MAX AP OPTION TO DURATION SELECT (dynamic, base 5AP or 10AP) ============

(function maxApOptionEnhancer() {
    const MAX_AP = 115;

    function formatMinutes(mins) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h > 0 && m > 0) return `${h}H ${m}min`;
        if (h > 0) return `${h}H`;
        return `${m}min`;
    }

    function detectBaseAP() {
        // if details_gains contains item353.webp => herb gathering = 10AP
        const dg = document.querySelector('.details_gains');
        if (dg && dg.querySelector('.bloc_gain_lot img[src*="item353.webp"]')) {
            return 10;
        }
        return 5;
    }

function ensureMaxAP(select) {
    if (!select) return;
    const firstOption = select.options[0];
    if (!firstOption) return;

    // Detect base AP from DOM

    const baseMinutes = parseInt(firstOption.value, 10);
    const baseAP = detectBaseAP(select); // 5 or 10 depending on .details_gains
    const minutesPerAP = baseMinutes / baseAP;
    const totalMinutes = Math.round(minutesPerAP * MAX_AP);
    const label = `${formatMinutes(totalMinutes)} (115 AP)`;

    // Add or update our 115 AP option
    let opt = select.querySelector('option[data-ap115="1"]');
    if (!opt) {
        opt = document.createElement('option');
        opt.setAttribute('data-ap115', '1');
        select.appendChild(opt);
    }
    opt.value = String(totalMinutes);
    opt.textContent = label;

    // Observe future changes in this select
    if (!select._ap115Observed) {
        const selObs = new MutationObserver(() => ensureMaxAP(select));
        selObs.observe(select, { childList: true });
        select._ap115Observed = true;
    }
}

    // Watch for new #select_duree
    const mo = new MutationObserver(muts => {
        muts.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.id === 'select_duree') {
                    ensureMaxAP(node);
                } else {
                    const found = node.querySelector && node.querySelector('#select_duree');
                    if (found) ensureMaxAP(found);
                }
            });
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Initial check
    const existing = document.querySelector('#select_duree');
    if (existing) ensureMaxAP(existing);
})();


})();
