// ==UserScript==
// @name         RK Enhanced Inventory Tools
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds search filters and bulk transfer functionality for RK inventory
// @author       You
// @match        https://www.renaissancekingdoms.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // Add custom CSS for all features
    GM_addStyle(`
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
    `);

    // ============ UTILITY ============

    function waitForElement(selector, callback) {
        const element = document.querySelector(selector);
        if (element) {
            callback(element);
        } else {
            setTimeout(() => waitForElement(selector, callback), 100);
        }
    }

    // ============ MARKET SEARCH ============

    function addSearchBoxToDocument(doc = document) {
        const targetElement = doc.querySelector('div.illustrationImage.legendeEvenement.legendeMarche');
        if (!targetElement || targetElement.parentNode.querySelector('.rk-search-container')) return;

        const searchContainer = doc.createElement('div');
        searchContainer.className = 'rk-search-container';
        searchContainer.style.cssText = `
            margin-top: 10px;
            padding: 5px;
        `;

        const searchInput = doc.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search...';
        searchInput.style.cssText = `
            width: 100%;
            padding: 5px;
            border: 1px solid #999;
            border-radius: 3px;
            font-size: 12px;
        `;

        const clearButton = doc.createElement('button');
        clearButton.textContent = 'Clear';
        clearButton.style.cssText = `
            margin-left: 0px;
            padding: 0px 5px;
            background-color: #e0e0e0;
            border: 1px solid #999;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;

        searchContainer.appendChild(doc.createTextNode('Filter: '));
        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(clearButton);

        targetElement.parentNode.insertBefore(searchContainer, targetElement.nextSibling);

        function filterTable() {
            const searchTerm = searchInput.value.toLowerCase().trim();
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
                    row.style.display = (searchTerm === '' || itemName.includes(searchTerm)) ? '' : 'none';
                } else {
                    row.style.display = searchTerm === '' ? '' : 'none';
                }
            });
        }

        searchInput.addEventListener('input', filterTable);
        searchInput.addEventListener('keyup', filterTable);
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            filterTable();
            searchInput.focus();
        });
    }

    waitForElement('div.illustrationImage.legendeEvenement.legendeMarche', () => {
        addSearchBoxToDocument(document);
    });

    function checkIframes() {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                iframe.addEventListener('load', () => {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        if (iframeDoc.querySelector('div.illustrationImage.legendeEvenement.legendeMarche')) {
                            addSearchBoxToDocument(iframeDoc);
                        }
                    } catch (e) {
                        console.log('Cannot access iframe content (cross-origin)');
                    }
                });

                if (iframe.contentDocument) {
                    const iframeDoc = iframe.contentDocument;
                    if (iframeDoc.querySelector('div.illustrationImage.legendeEvenement.legendeMarche')) {
                        addSearchBoxToDocument(iframeDoc);
                    }
                }
            } catch (e) {
                console.log('Cannot access iframe content (cross-origin)');
            }
        });
    }

    setTimeout(checkIframes, 1000);

    const iframeObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1 && node.tagName === 'IFRAME') {
                    setTimeout(() => {
                        try {
                            const iframeDoc = node.contentDocument || node.contentWindow.document;
                            if (iframeDoc.querySelector('div.illustrationImage.legendeEvenement.legendeMarche')) {
                                addSearchBoxToDocument(iframeDoc);
                            }
                        } catch (e) {
                            console.log('Cannot access iframe content (cross-origin)');
                        }
                    }, 500);
                }
            });
        });
    });

    iframeObserver.observe(document.body, { childList: true, subtree: true });

    // ============ INVENTORY FILTER ============

    function addInventoryFilter() {
        const racinePopup = document.getElementById('racinePopup');
        const inventoryPanel = racinePopup?.querySelector('.popupEcranRR_ecranInventaire');
        if (!inventoryPanel) return;

        const header = inventoryPanel.querySelector('.encart_entete');
        if (!header || header.querySelector('.rk-inventory-search-container')) return;

        const searchContainer = document.createElement('div');
        searchContainer.className = 'rk-inventory-search-container';
        searchContainer.style.cssText = `
            position: absolute;
            right: 10px;
            top: 0px;
            margin: 0px 0;
            padding: 5px;
        `;

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Filter...';
        searchInput.style.cssText = `
            height: 24px;
            width: 30%;
            padding: 4px;
            font-size: 12px;
        `;

        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear';
        clearButton.style.cssText = `
            margin-left: 6px;
            padding: 2px 8px;
            background: #e0e0e0;
            border: 1px solid #999;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;

        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(clearButton);
        header.appendChild(searchContainer);

        function filterInventory() {
            const term = searchInput.value.toLowerCase().trim();
            const items = inventoryPanel.querySelectorAll('.ConteneurItem');
            items.forEach(item => {
                const nameDiv = item.querySelector('.inventaire_contenu_01_descriptif');
                const name = nameDiv?.textContent.toLowerCase().trim() || '';
                item.style.display = (term === '' || name.includes(term)) ? '' : 'none';
            });
        }

        searchInput.addEventListener('input', filterInventory);
        searchInput.addEventListener('keyup', filterInventory);
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            filterInventory();
            searchInput.focus();
        });
    }

    waitForElement('#racinePopup', (racinePopup) => {
        const inventoryObserver = new MutationObserver(() => {
            const inventoryPanel = racinePopup.querySelector('.popupEcranRR_ecranInventaire');
            if (inventoryPanel && !inventoryPanel.querySelector('.rk-inventory-search-container')) {
                setTimeout(addInventoryFilter, 50);
            }
        });

        inventoryObserver.observe(racinePopup, { childList: true, subtree: true });
    });

    // ============ CURRENTLY HELD ITEMS FILTER ============

    function addCurrentItemsFilter() {
        const legendTable = document.querySelector('div.illustrationImage.legendeEvenement:not(.legendeMarche)');
        if (!legendTable || legendTable.querySelector('.rk-current-search-container')) return;

        const filterRow = document.createElement('tr');
        const filterCell = document.createElement('td');
        filterCell.colSpan = 2;
        filterCell.className = 'td_sans';

        const container = document.createElement('div');
        container.className = 'rk-current-search-container';
        container.style.cssText = `
            margin-top: 5px;
            display: flex;
            gap: 5px;
        `;

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Search ...';
        input.style.cssText = `
            flex-grow: 1;
            width: 50%;
            padding: 3px;
            font-size: 12px;
            border: 1px solid #999;
            border-radius: 3px;
        `;

        const clear = document.createElement('button');
        clear.textContent = 'Clear';
        clear.style.cssText = `
            padding: 2px 6px;
            background-color: #e0e0e0;
            border: 1px solid #999;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        `;

        container.appendChild(input);
        container.appendChild(clear);
        filterCell.appendChild(container);
        filterRow.appendChild(filterCell);
        legendTable.querySelector('tbody')?.appendChild(filterRow);

        function filterHeldItems() {
            const searchTerm = input.value.toLowerCase().trim();
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
                item.style.display = (searchTerm === '' || itemName.includes(searchTerm)) ? '' : 'none';
            });
        }

        input.addEventListener('input', filterHeldItems);
        input.addEventListener('keyup', filterHeldItems);
        clear.addEventListener('click', () => {
            input.value = '';
            filterHeldItems();
            input.focus();
        });
    }

    waitForElement('table.table_legende', () => {
        addCurrentItemsFilter();
    });

    // ============ BULK INVENTORY TRANSFER ============

    // Function to add checkboxes to items
    function addCheckboxes() {
        const targetDiv = document.querySelector('div.texte.texteInventaire');
        if (!targetDiv) return;

        const items = targetDiv.querySelectorAll('.ConteneurItem.bas');

        items.forEach(item => {
            if (item.querySelector('.bulk-transfer-checkbox')) return;

            const throwLink = item.querySelector('a[id^="jeter"]');
            if (!throwLink) return;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'bulk-transfer-checkbox';
            checkbox.dataset.itemId = item.id.replace('Item', '');

            const itemNameEl = item.querySelector('.inventaire_contenu_01_descriptif');
            if (itemNameEl) {
                checkbox.dataset.itemName = itemNameEl.textContent.trim();
            }

            throwLink.parentNode.insertBefore(checkbox, throwLink.nextSibling);
        });
    }

    // Function to create the transfer button in legend table
    function createTransferUI() {
        const legendTable = document.querySelector('table.table_legende');
    
        if (!legendTable || document.getElementById('bulk-transfer-row')) return;
    
        const parentDiv = legendTable.closest('div.illustrationImage');
    
        if (!parentDiv) return; // no matching parent div found
    
        // Ensure it has 'legendeEvenement' and does NOT have 'legendeMarche'
        if (!parentDiv.classList.contains('legendeEvenement') || parentDiv.classList.contains('legendeMarche')) {
            return;
        }

        // Create new row for bulk transfer
        const row = document.createElement('tr');
        row.id = 'bulk-transfer-row';

        const td1 = document.createElement('td');
        td1.className = 'td_sans';

        const btn = document.createElement('button');
        btn.className = 'bulk-transfer-btn';
        btn.textContent = 'Bulk Transfer';
        btn.addEventListener('click', transferSelectedItems);
        td1.appendChild(btn);

        const td2 = document.createElement('td');
        td2.className = 'td_sans';

        const progress = document.createElement('div');
        progress.className = 'bulk-transfer-progress';
        progress.textContent = '0 selected';
        td2.appendChild(progress);

        row.appendChild(td1);
        row.appendChild(td2);

        // Insert after the last transfert row
        const lastTransferRow = legendTable.querySelector('tr[id^="transfert"]:last-of-type');
        if (lastTransferRow) {
            lastTransferRow.parentNode.insertBefore(row, lastTransferRow.nextSibling);
        } else {
            legendTable.querySelector('tbody').appendChild(row);
        }

        // Update selection count when checkboxes change
        document.addEventListener('change', function(e) {
            if (e.target.classList.contains('bulk-transfer-checkbox')) {
                updateSelectionCount();
            }
        });
    }

    function updateSelectionCount() {
        const checkboxes = document.querySelectorAll('.bulk-transfer-checkbox:checked');
        const progress = document.querySelector('.bulk-transfer-progress');
        if (progress) {
            progress.textContent = `${checkboxes.length} selected`;
        }
    }

    async function transferSelectedItems() {
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
                progress.textContent = `Transferring ${i+1}/${checkboxes.length}`;
            }

            try {
                await transferItem(itemId);
                successCount++;
                checkbox.checked = false;
            } catch (error) {
                console.error(`Failed to transfer ${itemName}:`, error);
                failCount++;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        btn.disabled = false;
        btn.textContent = 'Bulk Transfer';

        if (progress) {
            progress.textContent = `${successCount} transferred`;
        }

        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }

    function transferItem(itemId) {
        return new Promise((resolve, reject) => {
            const transferBtn = document.getElementById(`transferer${itemId}`);
            if (!transferBtn) {
                reject(new Error(`Transfer button not found for item ${itemId}`));
                return;
            }

            const onclick = transferBtn.getAttribute('onclick');
            const paramsMatch = onclick.match(/ouvreOptionsItem\(([^)]+)\)/);
            if (!paramsMatch) {
                reject(new Error(`Could not extract parameters for item ${itemId}`));
                return;
            }

            const params = paramsMatch[1].split(',').map(p => p.trim().replace(/'/g, ''));
            const url = `https://www.renaissancekingdoms.com/Action.php?action=69&type=${params[2]}&IDParametre=${params[3]}`;
            const body = `quantite=${params[4] || '1'}&destination=transfererPropriete&submit=OK`;

            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                },
                data: body,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    // Initialize bulk transfer functionality
    function initBulkTransfer() {
        const targetDiv = document.querySelector('div.texte.texteInventaire');
        if (!targetDiv) return;

        addCheckboxes();
        createTransferUI();

        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length) {
                    addCheckboxes();
                    createTransferUI();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Start all functionality
    setTimeout(initBulkTransfer, 1000);
})();
