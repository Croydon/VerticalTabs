"use strict";

/* global utils log FastAverageColor */

let options = utils.options; // FIXME: Why can't this be for private windows within namespace-sidebar.js?

/* Entry point for every VTR sidebar for every window */
let VerticalTabsReloaded = class VerticalTabsReloaded
{
    constructor()
    {
        options.get_all_settings().then((value) =>
        {
            this.webExtPreferences = value;
            this.selectedTabID = undefined;
            this.initialized = false;

            this.documentY = 0;

            this.tabbrowser = document.getElementById("tabbrowser-tabs");

            browser.windows.getCurrent().then((windowObj) =>
            {
                this.windowID = windowObj.id;
                this.init();
            });
        });
    }

    init()
    {
        this.build_ui();
        this.initEventListeners();
        this.toolbar_activate();

        let connectName = "sidebarAction-" + this.windowID;
        let sidebarPort = browser.runtime.connect({"name": connectName});
        sidebarPort.postMessage({"message": {type: "sidebarAction", windowID: this.windowID}});
        sidebarPort.onMessage.addListener((message) =>
        {
            if(message["message"]["type"] == "temporaryOptionChange")
            {
                this.onPreferenceChange(message["message"]["optionName"], message["message"]["optionNewValue"], message["message"]["optionOldValue"]);
            }
        });
        this.initialized = true;
    }

    preferences(settingName)
    {
        return this.webExtPreferences[settingName];
    }

    installStylesheet(uri, type)
    {
        log.debug("VTR install sheet: " + uri + " of type: " + type);
        let existingStylesheet = document.getElementById(`vtr-${type}`);
        if(existingStylesheet)
        {
            existingStylesheet.setAttribute("href", uri);
        }
        else
        {
            document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${uri}" id="vtr-${type}">`);
        }
    }

    removeStylesheet(type)
    {
        log.debug("VTR remove sheet of type: " + type);
        let existingStylesheet = document.getElementById(`vtr-${type}`);
        if(existingStylesheet) { document.getElementById(`vtr-${type}`).remove(); }
    }

    toggleStylesheet(uri, type, activate)
    {
        if(activate)
        {
            this.installStylesheet(uri, type);
        }
        else
        {
            this.removeStylesheet(type);
        }
    }

    applyThemeStylesheet()
    {
        if(this.preferences("theme") != "none")
        {
            this.installStylesheet(this.getThemeStylesheet(this.preferences("theme")), "theme");
        }
    }

    getThemeStylesheet(theme)
    {
        /* KEEP ME, placeholder for now, logic will grow in the future */
        let stylesheet;
        switch (theme)
        {
            default:
                stylesheet = "data/theme/" + theme + "/index.css";
                break;
        }

        return browser.runtime.getURL(stylesheet);
    }

    scroll_to_tab(tabID)
    {
        if(typeof tabID != "number")
        {
            return;
        }

        let tabElement = document.getElementById("tab-" + tabID);

        if(tabElement == null)
        {
            setTimeout(() =>
            {
                tabElement = document.getElementById("tab-" + tabID);
                if(tabElement == null)
                {
                    return;
                }
            }, 20);
        }

        setTimeout(() =>
        {
            if(utils.dom.isElementInVisibleArea(tabElement) == false)
            {
                tabElement.scrollIntoView({block: "end", behavior: "smooth"});
            }
        }, 400);
        // FIREFIX: FIXME: time could be reduced till ~200 when https://bugzilla.mozilla.org/show_bug.cgi?id=1387372 is fixed
    }

    build_ui()
    {
        // FIREFIX: Placeholder. Firefox doesn't support hiding the default tabbrowser currently.

        // Injecting CSS
        this.onPreferenceChange("theme", this.preferences("theme"), "dark");
        this.onPreferenceChange("style.tab.status", this.preferences("style.tab.status"), false);
        this.onPreferenceChange("style.tab.pinned.minified", this.preferences("style.tab.pinned.minified"), false);
        this.onPreferenceChange("style.tab.button.close.displayalways", this.preferences("style.tab.button.close.displayalways"), false);
        this.onPreferenceChange("style.tab.buttons.position", this.preferences("style.tab.buttons.position"), "right");

        // Creating tabs
        this.finish_create_tab_event();

        browser.tabs.query({windowId: this.windowID}).then((tabs) =>
        {
            for(let tab of tabs)
            {
                this.create_tab(tab);
            }
        });
    }

    /* FIREFIX: Firefox's security policy prevents us from loading some default icons,
    replace with local, exact-same icon versions
    - yes. that's kinda stupid  */
    normalize_tab_icon(iconURL)
    {
        if(typeof iconURL == "undefined" || iconURL == null || iconURL == "")
        {
            return "data/chrome/icon/default-favicon.svg";
        }

        switch (iconURL)
        {
            case "chrome://mozapps/skin/extensions/extensionGeneric-16.svg":
            case "chrome://mozapps/skin/extensions/extension.svg":
                return "data/chrome/icon/extension-generic.svg";

            case "chrome://mozapps/skin/places/defaultFavicon.svg":
                return "data/chrome/icon/default-favicon.svg";

            default:
                return iconURL;
        }
    }

    get_tab_tooltip_value(title, url)
    {
        if(this.preferences("style.tab.showUrlInTooltip") == "url")
        {
            return url;
        }
        else if (this.preferences("style.tab.showUrlInTooltip") == "url-title")
        {
            return url + " - " + title;
        }
        else if (this.preferences("style.tab.showUrlInTooltip") == "title-url")
        {
            return title + " - " + url;
        }
        else
        {
            return title;
        }
    }

    create_tab(tab)
    {
        let id = tab.id;
        log.debug("start tab creation of tab id: " + id);
        // console.time("start-tab-" + id);

        let title = "Connecting...";
        let pinned = tab.pinned;
        let status = tab.status;
        let iconURL = this.normalize_tab_icon(tab.favIconUrl);

        let pinnedAttribute = "", statusAttribute = `status="${status}"`, tabIndex = 0;

        if(status == "loading")
        {
            iconURL = "data/chrome/icon/connecting.png";
        }

        if(pinned == true)
        {
            pinnedAttribute = 'pinned="true"';
        }

        if(this.initialized == false)
        {
            tabIndex = tab.index;
        }
        else
        {
            // Temporary index, we are updating it directly after creating the tab
            // This improves performance at startup and reduces complexity at runtime
            tabIndex = this.get_last_tab_index() + 1;
        }

        let tabHTML = `<div id="tab-${id}" class="tabbrowser-tab" title="${title}" ${pinnedAttribute} ${statusAttribute} data-index="${tabIndex}" align="stretch" draggable="true" data-discarded="true" data-href="${tab.url}">
        <span class="tab-icon"> <img id="tab-icon-${id}" class="tab-icon-image" src="${iconURL}" data-src-after-loaded="${iconURL}"> </span>
        <span id="tab-title-${id}" class="tab-label tab-text"> ${title} </span>
        <span class="tab-buttons">
            <span id="tab-sound-button-${id}" class="tab-sound-button tab-icon-sound" title="Mute/Unmute tab"></span>
            <span id="tab-close-button-${id}" class="tab-close-button close-icon" title="Close tab"> </span>
        </span>
        </div>`;

        // Check: fadein="true" linkedpanel="panel-3-77" pending="true" align="stretch"
        if(pinned == true)
        {
            document.getElementById("tabbrowser-tabs-pinned").insertAdjacentHTML("beforeend", tabHTML);
        }
        else
        {
            this.tabbrowser.insertAdjacentHTML("beforeend", tabHTML);
        }

        // console.timeEnd("start-tab-" + id);
    }

    finish_create_tab_event()
    {
        document.arrive(".tabbrowser-tab", (tabElement) =>
        {
            let id = utils.tabs.getIDFromHTMLID(tabElement.id);

            log.debug("finish tab creation of tab id: " + id);
            // console.time("finish-tab-" + id);

            let tabIndex = utils.tabs.getIndexFrom(id);

            browser.tabs.get(id).then((tab) =>
            {
                tabElement.addEventListener("click", (event) =>
                {
                    browser.tabs.update(id, {active: true});
                    event.preventDefault();
                });

                addDragndropHandlers(tabElement);

                if(tab.active == true)
                {
                    this.update_tab(id, "selected", "true");
                    this.selectedTabID = id;
                    log.debug("select tab: " + this.selectedTabID);
                }

                this.update_tab(id, "title", tab.title);
                this.update_tab(id, "favIconUrl", tab.favIconUrl);
                this.update_tab(id, "mutedInfo", tab.mutedInfo);
                this.update_tab(id, "audible", tab.audible);
                this.update_tab(id, "status", tab.status);
                this.update_tab(id, "hidden", tab.hidden);
                this.update_tab(id, "discarded", tab.discarded);

                document.getElementById(`tab-close-button-${id}`).addEventListener("click", (e) => { utils.tabs.close(id); e.stopPropagation(); });
                document.getElementById(`tab-sound-button-${id}`).addEventListener("click", (e) => { utils.tabs.mute(id); e.stopPropagation(); });

                if(this.initialized == true)
                {
                    this.move_tab(id, tabIndex, tab.index);
                }

                // console.timeEnd("finish-tab-" + id);
            });
        });
    }

    update_tab(tabID, attribute, value)
    {
        if(attribute != "title" && attribute != "audible" && attribute != "mutedInfo" && attribute != "discarded" && attribute != "url") { log.debug("update tab: " + tabID + " " + attribute + " " + value); }

        // console.time("update-tab-" + tabID);

        let tabElement = document.getElementById("tab-" + tabID);
        let tryrun = 1;

        // We wait for max. 2250 ms for the tab element to exists in the current DOM, before we forget about the tab update
        while(tabElement == null && tryrun < 9)
        {
            setTimeout(() =>
            {
                tabElement = document.getElementById("tab-" + tabID);
            }, 50 * tryrun);

            tryrun++;
        }

        if(tabElement == null)
        {
            return;
        }

        switch(attribute)
        {
            case "title":
                document.getElementById("tab-title-" + tabID).innerText = value;
                browser.tabs.get(tabID).then((tab) =>
                {
                    tabElement.setAttribute("title", this.get_tab_tooltip_value(tab.title, tab.url));
                });
                break;

            case "pinned":
                if(value == true)
                {
                    tabElement.setAttribute("pinned", "true");
                    document.getElementById("tabbrowser-tabs-pinned").appendChild(tabElement);
                }
                else
                {
                    tabElement.removeAttribute("pinned");
                    document.getElementById("tabbrowser-tabs").insertBefore(tabElement, document.getElementById("tabbrowser-tabs").firstChild); // tabs unpinned are getting moved at the beginning of all regular tabs
                    // OLD: tabElement.getElementById("tabbrowser-tabs").appendChild(tabElement.getElementById("tab-"+tabID)); // unpinning triggers index update as well
                }
                break;

            case "favIconUrl":
                value = this.normalize_tab_icon(value);

                document.getElementById("tab-icon-" + tabID).setAttribute("data-src-after-loaded", value);

                if(tabElement.getAttribute("status") != "loading")
                {
                    const imgEl = document.getElementById("tab-icon-" + tabID);
                    imgEl.setAttribute("src", value);

                    const fac = new FastAverageColor();
                    fac.getColorAsync(imgEl, (color) =>
                    {
                        if(color.isDark)
                        {
                            imgEl.classList.remove("tab-icon-image-light");
                            imgEl.classList.add("tab-icon-image-dark");
                        }
                        else
                        {
                            imgEl.classList.remove("tab-icon-image-dark");
                            imgEl.classList.add("tab-icon-image-light");
                        }
                        log.debug(color);
                        fac.destroy();
                    });
                }

                log.debug("status: " + tabElement.getAttribute("status"));
                log.debug("favIconUrl loaded: " + value);

                break;

            case "selected":
                if(value == false) { return; }

                if(this.selectedTabID != undefined)
                {
                    document.getElementById("tab-" + this.selectedTabID).removeAttribute("selected");
                }

                let selectedTab = document.getElementById("tab-" + tabID);
                if(selectedTab != null)
                {
                    document.getElementById("tab-" + tabID).setAttribute("selected", "true");
                    document.getElementById("tab-" + tabID).setAttribute("unread", "false");
                    this.selectedTabID = tabID;

                    this.scroll_to_tab(tabID);
                }

                break;

            case "status":
                tabElement.setAttribute("status", value);

                if(value == "complete")
                {
                    tabElement.setAttribute("status", "");

                    let newFavicon = document.getElementById("tab-icon-" + tabID).getAttribute("data-src-after-loaded");
                    if(newFavicon != "")
                    {
                        log.debug("new favicon: " + newFavicon);
                        this.update_tab(tabID, "favIconUrl", newFavicon);
                    }

                    if(tabElement.getAttribute("selected") != "true")
                    {
                        tabElement.setAttribute("unread", "true");
                    }
                }

                if(value == "loading")
                {
                    // FIXME: Which icon is getting set should be really up to the theme
                    document.getElementById("tab-icon-" + tabID).setAttribute("src", "data/chrome/icon/connecting.png");
                }
                break;

            case "mutedInfo":
                if(value.muted == true)
                {
                    document.getElementById("tab-sound-button-" + tabID).classList.add("tab-sound-button-muted");
                }
                else
                {
                    document.getElementById("tab-sound-button-" + tabID).classList.remove("tab-sound-button-muted");
                }
                break;

            case "audible":
                if(document.getElementById("tab-sound-button-" + tabID).classList.contains("tab-sound-button-muted"))
                {
                    // If a tab is muted we want to show that at all times, no matter if a sound would be audible or not
                    return;
                }

                if(value == true)
                {
                    document.getElementById("tab-sound-button-" + tabID).classList.add("tab-sound-button-playing");
                }
                else
                {
                    document.getElementById("tab-sound-button-" + tabID).classList.remove("tab-sound-button-playing");
                }
                break;

            case "discarded":
                if(value == true)
                {
                    tabElement.setAttribute("data-discarded", "true");
                }
                else
                {
                    tabElement.setAttribute("data-discarded", "false");
                }
                break;

            case "hidden":
                if(value == true)
                {
                    tabElement.style.display = "none";
                }
                else
                {
                    tabElement.style.display = "grid";
                }
                break;

            case "url":
                tabElement.setAttribute("data-href", value);

            // case "index":
                // tabElement.setAttribute("data-index", value);
                // break;
        }

        // console.timeEnd("update-tab-" + tabID);
    }

    async move_tab(tabID, fromIndex, toIndex)
    {
        if(fromIndex == toIndex) { return; }

        log.debug("move tab " + tabID + " from " + fromIndex + " to " + toIndex);

        let pinnedTab = await utils.tabs.isPinned(tabID);

        log.debug(this.get_last_tab_index());
        if(toIndex == this.get_last_tab_index())
        {
            // Move at the end
            if(pinnedTab)
            {
                document.getElementById("tabbrowser-tabs-pinned").append(document.getElementById("tab-" + tabID));
            }
            else
            {
                this.tabbrowser.append(document.getElementById("tab-" + tabID));
            }
        }
        else
        {
            let insertBeforeIndex;
            if(fromIndex < toIndex)
            {
                // Move down
                insertBeforeIndex = toIndex + 1;
            }
            else
            {
                // Move up
                insertBeforeIndex = toIndex;
            }

            let insertBeforeTab = document.querySelector(`div[data-index="${insertBeforeIndex}"]`);

            // We want to move a pinned tab down to the last position of pinned tabs
            // We need to prevent, that the pinned tab is placing in the regular tab section
            // And we need to make sure that it is actually in the pinned tab section
            // when the tab is newly pinned
            if(pinnedTab && insertBeforeTab.getAttribute("pinned") === null)
            {
                document.getElementById("tabbrowser-tabs-pinned").append(document.getElementById("tab-" + tabID));
                return;
            }

            insertBeforeTab.parentNode.insertBefore(document.getElementById("tab-" + tabID), insertBeforeTab);
        }

        utils.tabs.updateTabIndexes();

        // When the current active tab is getting moved we are scrolling the tab browser, to keep the active tab in sight
        // The main purpose of this should be the interference of third-party add-ons
        if(await utils.tabs.isActive(tabID))
        {
            log.debug("tab is active. scroll to it");
            this.scroll_to_tab(tabID);
        }
    }

    get_last_tab_index()
    {
        /* if(this.tabbrowser.lastElementChild === null && document.getElementById("tabbrowser-tabs-pinned") === null)
        {
            return -1;
        } */

        let result;

        if(this.tabbrowser.lastElementChild === null)
        {
            if(document.getElementById("tabbrowser-tabs-pinned").lastElementChild === null)
            {
                return -1;
            }
            else
            {
                result = document.getElementById("tabbrowser-tabs-pinned").lastElementChild.getAttribute("data-index");
            }
        }
        else
        {
            result = this.tabbrowser.lastElementChild.getAttribute("data-index");
        }

        return parseInt(result, 10);
    }

    remove_tab(tabID)
    {
        if(document.getElementById("tab-" + tabID) !== null)
        {
            log.debug("remove tab: " + tabID);

            if(tabID == this.selectedTabID)
            {
                this.selectedTabID = undefined;
            }

            document.getElementById("tab-" + tabID).remove();
        }
    }

    onPreferenceChange(prefName, newValue, oldValue)
    {
        switch (prefName)
        {
            // Former options which have no effect anymore: "right" (sidebar position), "hideInFullscreen", "compact" (favicon only tab sidebar)

            case "tabtoolbarPosition":
                this.webExtPreferences[prefName] = newValue;
                let TabsToolbar = document.getElementById("TabsToolbar");

                switch(newValue)
                {
                    case "hide":
                        TabsToolbar.style.display = "none";
                        break;

                    case "top":
                        TabsToolbar.style.display = "";
                        document.body.insertBefore(TabsToolbar, document.getElementById("tabbrowser-tabs-pinned"));
                        break;

                    case "bottom":
                        TabsToolbar.style.display = "";
                        document.body.appendChild(TabsToolbar);
                        break;
                }

                TabsToolbar.setAttribute("data-position", newValue);
                break;

            case "style.tab.buttons.position":
                this.webExtPreferences[prefName] = newValue;
                document.getElementsByTagName("body")[0].setAttribute("data-tab-buttons-position", newValue);
                break;

            case "theme":
                this.webExtPreferences[prefName] = newValue;
                this.applyThemeStylesheet();
                break;

            case "style.tab.status":
                this.webExtPreferences[prefName] = newValue;
                document.getElementsByTagName("body")[0].setAttribute("data-style-tab-status", newValue);
                break;

            case "style.tab.pinned.minified":
                this.webExtPreferences[prefName] = newValue;
                this.toggleStylesheet(browser.runtime.getURL("data/minifiedpinnedtabs.css"), "minifiedpinnedtabs", newValue);
                break;

            case "style.tab.button.close.displayalways":
                this.webExtPreferences[prefName] = newValue;
                this.toggleStylesheet(browser.runtime.getURL("data/alwaysdisplayclose.css"), "alwaysdisplayclose", newValue);
                break;

            case "style.tab.showUrlInTooltip":
                this.webExtPreferences[prefName] = newValue;
                browser.tabs.query({windowId: this.windowID}).then((tabs) =>
                {
                    for(let tab of tabs)
                    {
                        this.update_tab(tab.id, "title", tab.title);
                    }
                });
                break;

            case "events.tab.change.on":
                this.webExtPreferences[prefName] = newValue;

                switch (oldValue)
                {
                    case "hover":
                        document.getElementById("tabbrowser-tabs-pinned").removeEventListener("mouseover", this.on_hover_tabbrowser);
                        document.getElementById("tabbrowser-tabs").removeEventListener("mouseover", this.on_hover_tabbrowser);
                        break;

                    case "click-scroll":
                        // FIXME
                        // log.debug("remove scroll event!");
                        // document.removeEventListener("wheel", this.on_scroll_tabbrowser.call(this, event));
                        break;
                }

                switch(newValue)
                {
                    case "hover":
                        document.getElementById("tabbrowser-tabs-pinned").addEventListener("mouseover", this.on_hover_tabbrowser);
                        document.getElementById("tabbrowser-tabs").addEventListener("mouseover", this.on_hover_tabbrowser);
                        break;

                    case "click-scroll":
                        document.addEventListener("wheel", (e) => { this.on_scroll_tabbrowser(e); });
                        break;

                    default:
                        log.debug("new value:" + newValue);
                        break;
                }
                break;

            default:
                this.webExtPreferences[prefName] = newValue;
                break;
        }
    }

    on_storage_change_iterator(changes, area)
    {
        /* (potential todo:) "managed" area isn't supported right now */
        if(area != "local") { return; }

        Object.keys(changes).forEach(item =>
        {
            log.debug("on_storage: " + item + " " + changes[item].newValue);
            this.onPreferenceChange(item, changes[item].newValue, changes[item].oldValue);
        });
    }

    initEventListeners()
    {
        // Note: Not all eventsListener are set up here

        browser.storage.onChanged.addListener((changes, area) =>
        {
            this.on_storage_change_iterator(changes, area);
        });

        browser.tabs.onCreated.addListener((tab) =>
        {
            if(tab.windowId == this.windowID)
            {
                this.create_tab(tab);
                utils.tabs.updateTabIndexes();
            }
        });

        browser.tabs.onAttached.addListener((tabID, attachInfo) =>
        {
            if(attachInfo.newWindowId == this.windowID)
            {
                browser.tabs.get(tabID).then((tab) =>
                {
                    this.create_tab(tab);
                    utils.tabs.updateTabIndexes();
                });
            }
        });

        browser.tabs.onActivated.addListener((details) =>
        {
            if(details.windowId == this.windowID)
            {
                this.update_tab(details.tabId, "selected", "true");
            }
        });

        browser.tabs.onUpdated.addListener((tabID, changeInfo, tab) =>
        {
            if(tab.windowId != this.windowID)
            {
                return;
            }

            if (changeInfo.hasOwnProperty("pinned"))
            {
                if (changeInfo.pinned === true || changeInfo.pinned === false)
                {
                    this.update_tab(tabID, "pinned", changeInfo.pinned);
                }
            }

            if (changeInfo.hasOwnProperty("title")) { this.update_tab(tabID, "title", changeInfo["title"]); }
            if (changeInfo.hasOwnProperty("favIconUrl")) { this.update_tab(tabID, "favIconUrl", changeInfo["favIconUrl"]); }
            if (changeInfo.hasOwnProperty("status")) { this.update_tab(tabID, "status", changeInfo["status"]); }
            if (changeInfo.hasOwnProperty("mutedInfo")) { this.update_tab(tabID, "mutedInfo", changeInfo["mutedInfo"]); }
            if (changeInfo.hasOwnProperty("audible")) { this.update_tab(tabID, "audible", changeInfo["audible"]); }
            if (changeInfo.hasOwnProperty("discarded")) { this.update_tab(tabID, "discarded", changeInfo["discarded"]); }
            if (changeInfo.hasOwnProperty("hidden")) { this.update_tab(tabID, "hidden", changeInfo["hidden"]); }
            if (changeInfo.hasOwnProperty("url")) { this.update_tab(tabID, "url", changeInfo["url"]); }
        });

        browser.tabs.onMoved.addListener((tabID, moveInfo) =>
        {
            if(moveInfo.windowId != this.windowID)
            {
                return;
            }

            this.move_tab(tabID, moveInfo["fromIndex"], moveInfo["toIndex"]);
            // this.update_tab(tabID, "index", moveInfo["toIndex"]);
            // utils.tabs.updateTabIndexes(); // moved to move_tab, because of async madness
        });

        browser.tabs.onDetached.addListener((tabID, details) =>
        {
            if(details.oldWindowId != this.windowID)
            {
                return;
            }

            this.remove_tab(tabID);
            utils.tabs.updateTabIndexes();
        });

        browser.tabs.onRemoved.addListener((tabID, removeInfo) =>
        {
            if(removeInfo.windowId != this.windowID)
            {
                return;
            }

            this.remove_tab(tabID);
            utils.tabs.updateTabIndexes();
        });

        // Prevent auto-scrolling with middle click if closing tabs with middle click is enabled
        document.getElementById("tabbrowser-tabs").addEventListener("mousedown", (e) =>
        {
            if (this.preferences("events.tab.close.mouse.middleclick") && e.button == "1")
            {
                e.preventDefault();
            }
        });

        // Doubleclick on free space within the tabbrowser opens a new tab
        document.getElementById("tabbrowser-tabs").addEventListener("dblclick", (e) =>
        {
            if(e.target == document.getElementById("tabbrowser-tabs"))
            {
                browser.tabs.create({
                    active: true,
                });
            }
        });

        // Middle click on free space within the tabbrowser opens a new tab
        document.getElementById("tabbrowser-tabs").addEventListener("mouseup", (e) =>
        {
            if(e.button != "1")
            {
                return;
            }

            if(e.target == document.getElementById("tabbrowser-tabs"))
            {
                browser.tabs.create({
                    active: true,
                });
            }
            else
            {
                if(this.preferences("events.tab.close.mouse.middleclick") == true)
                {
                    let tryrun = 1;
                    let tabElement = e.target;
                    let isTabElement = utils.tabs.isTabElement(tabElement);
                    while(isTabElement == false && tryrun < 5)
                    {
                        tabElement = tabElement.parentNode;
                        isTabElement = utils.tabs.isTabElement(tabElement);
                        tryrun++;
                    }

                    if(isTabElement == true)
                    {
                        utils.tabs.close(utils.tabs.getIDFromHTMLID(tabElement.id));
                    }
                }
                else
                {
                    log.debug("Tab closing with mouse middle click is disabled");
                }
            }
        });

        /* window.setInterval(() =>
        {
            utils.self.documentY = this.tabbrowser.scrollTopscrollTop;
        }, 800); */

        if(this.preferences("events.tab.change.on") == "hover")
        {
            this.onPreferenceChange("events.tab.change.on", "hover", "NOVALUE");
        }
        else if(this.preferences("events.tab.change.on") == "click-scroll")
        {
            this.onPreferenceChange("events.tab.change.on", "click-scroll", "NOVALUE");
        }

        // Old event handler: case "popupshowing":
        // return;
    }

    on_scroll_tabbrowser(e)
    {
        if(this.preferences("events.tab.change.on") != "click-scroll") { return; }

        let direction;
        if(e.deltaY > 0)
        {
            direction = "down";
        }
        else if(e.deltaY < 0)
        {
            direction = "up";
        }
        else
        {
            return;
        }
        utils.tabs.selectNextToActiveTab(utils.self.windowID, direction);
    }

    on_hover_tabbrowser(e)
    {
        let tryrun = 1;
        let tabElement = e.target;
        let isTabElement = utils.tabs.isTabElement(tabElement);
        while(isTabElement == false && tryrun < 5)
        {
            tabElement = tabElement.parentNode;
            isTabElement = utils.tabs.isTabElement(tabElement);
            tryrun++;
        }

        if(isTabElement == true)
        {
            browser.tabs.update(utils.tabs.getIDFromHTMLID(tabElement.id), {active: true});
        }
    }

    toolbar_activate()
    {
        this.onPreferenceChange("tabtoolbarPosition", this.preferences("tabtoolbarPosition"), "top");

        document.getElementById("toolbar-action-tab-new").addEventListener("click", () =>
        {
            browser.tabs.create({
                active: true,
            });
        });

        document.getElementById("toolbar-action-options").addEventListener("click", () =>
        {
            browser.runtime.openOptionsPage();
        });
    }
};

let contextmenuTarget = "NOTARGET";

function contextmenuMouseoutHelper(e)
{
    if(e.relatedTarget == null) { contextmenuHide(e); }
}

function contextmenuScrollHelper(e)
{
    contextmenuHide(e);
}

function contextmenuHide(e)
{
    e.stopPropagation();
    e.preventDefault();

    if(contextmenuTarget != "NOTARGET")
    {
        document.getElementById("contextmenu").style.display = "";
        document.getElementById("contextmenu").removeEventListener("click", contextmenuClickHelper);
        document.removeEventListener("scroll", contextmenuScrollHelper, true);
        document.removeEventListener("mouseout", contextmenuMouseoutHelper, true);
    }
}

async function contextmenuShow(e)
{
    e.preventDefault();
    e.stopPropagation();

    let tryrun = 1;
    let tabElement = e.target;
    let isTabElement = utils.tabs.isTabElement(tabElement);
    while(isTabElement == false && tryrun < 10)
    {
        tabElement = tabElement.parentNode;
        isTabElement = utils.tabs.isTabElement(tabElement);
        tryrun++;
    }

    if(isTabElement != true) { return; }

    contextmenuTarget = utils.tabs.getIDFromHTMLID(tabElement.id);

    log.debug("context menu target tabID: " + contextmenuTarget);
    log.debug("context menu target position: " + e.pageX + " y " + e.pageY);

    // -- Context aware context menu...
    // Should the discard option be available?
    if(await utils.tabs.isActive(contextmenuTarget) || await utils.tabs.isDiscarded(contextmenuTarget))
    {
        document.getElementById("contextmenu-action-tab-discard").style.display = "none";
    }
    else
    {
        document.getElementById("contextmenu-action-tab-discard").style.display = "block";
    }

    // Pin or unpin?
    if(await utils.tabs.isPinned(contextmenuTarget))
    {
        document.getElementById("contextmenu-action-tab-pin").innerText = "Unpin Tab";
    }
    else
    {
        document.getElementById("contextmenu-action-tab-pin").innerText = "Pin Tab";
    }

    // Mute or unmute?
    if(await utils.tabs.isMuted(contextmenuTarget))
    {
        document.getElementById("contextmenu-action-tab-mute").innerText = "Unmute Tab";
    }
    else
    {
        document.getElementById("contextmenu-action-tab-mute").innerText = "Mute Tab";
    }

    let contextmenuDomElement = document.getElementById("contextmenu");
    contextmenuDomElement.style.setProperty("left", e.pageX + "px");
    contextmenuDomElement.style.setProperty("top", e.pageY + "px");
    contextmenuDomElement.style.display = "block";

    if(utils.dom.isElementInVisibleArea(contextmenuDomElement) == false)
    {
        contextmenuDomElement.style.visibility = "hidden";
        let rect = contextmenuDomElement.getBoundingClientRect();

        if(document.documentElement.clientHeight - rect.bottom < 0)
        {
            // Context menu is hidden in height, adjust
            contextmenuDomElement.style.setProperty("top", e.pageY + (document.documentElement.clientHeight - rect.bottom) + "px");
        }

        if(document.documentElement.clientWidth - rect.right < 0)
        {
            // Context menu is hidden in width, adjust
            contextmenuDomElement.style.setProperty("left", e.pageX + (document.documentElement.clientWidth - rect.right) + "px");
        }

        contextmenuDomElement.style.visibility = "";
    }

    // Close context menu on scrolling as well on leaving the sidebar with the mouse
    document.addEventListener("scroll", contextmenuScrollHelper, true);
    document.addEventListener("mouseout", contextmenuMouseoutHelper, true);

    document.addEventListener("click", contextmenuClickHelper);
}

function contextmenuClickHelper(e)
{
    // Catch the right click so we do not directly close the context menu again in some environments (FreeBSD, some Linux setups, ..?)
    if(e.button == "2") { return; }

    contextmenuHide(e);
}

document.addEventListener("DOMContentLoaded", () =>
{
    options.get_options_file().then(() =>
    {
        utils["self"] = new VerticalTabsReloaded();
    });

    document.getElementById("tabbrowser-tabs-pinned").addEventListener("contextmenu", (e) => contextmenuShow(e));
    document.getElementById("tabbrowser-tabs").addEventListener("contextmenu", (e) => contextmenuShow(e));

    document.getElementById("contextmenu-action-tab-close").addEventListener("click", (e) => { utils.tabs.close(contextmenuTarget); });
    document.getElementById("contextmenu-action-tab-reload").addEventListener("click", (e) => { utils.tabs.reload(contextmenuTarget); });
    document.getElementById("contextmenu-action-tab-pin").addEventListener("click", (e) => { utils.tabs.pin(contextmenuTarget); });
    document.getElementById("contextmenu-action-tab-duplicate").addEventListener("click", (e) => { utils.tabs.duplicate(contextmenuTarget); });
    document.getElementById("contextmenu-action-tab-mute").addEventListener("click", (e) => { utils.tabs.mute(contextmenuTarget); });
    document.getElementById("contextmenu-action-tab-discard").addEventListener("click", (e) => { utils.tabs.discard(contextmenuTarget); });
    document.getElementById("contextmenu-action-tab-move-new-window").addEventListener("click", (e) => { utils.tabs.moveToNewWindow(contextmenuTarget); });
    document.getElementById("contextmenu-action-tab-restore-closed").addEventListener("click", (e) => { utils.tabs.restoreLastClosedTab(); });
    document.getElementById("contextmenu-action-tab-bookmark-all").addEventListener("click", (e) => { let bookmarkFolderName = window.prompt("Name of bookmark directory:", "tabs"); utils.tabs.bookmarkAllVisibleTabs(contextmenuTarget, bookmarkFolderName); });
    document.getElementById("contextmenu-action-tab-reload-all").addEventListener("click", (e) => { utils.tabs.reloadAllVisibleTabs(); });
    document.getElementById("contextmenu-action-tab-shuffle-all").addEventListener("click", (e) => { utils.tabs.shuffleAllVisibleTabs(); });
    document.getElementById("contextmenu-action-tab-close-below").addEventListener("click", (e) => { utils.tabs.closeTabsRelativeTo(contextmenuTarget, "below"); });
    document.getElementById("contextmenu-action-tab-close-above").addEventListener("click", (e) => { utils.tabs.closeTabsRelativeTo(contextmenuTarget, "above"); });
    document.getElementById("contextmenu-action-tab-close-others").addEventListener("click", (e) => { utils.tabs.closeTabsRelativeTo(contextmenuTarget, "others"); });
});


let dragndropElement = undefined;

function handleDragStart(e)
{
    dragndropElement = e.target;
    let isTabElement = utils.tabs.isTabElement(dragndropElement);
    let i = 0;
    while(isTabElement == false && i < 50)
    {
        dragndropElement = dragndropElement.parentNode;
        isTabElement = utils.tabs.isTabElement(dragndropElement);
        i++;
    }

    e.dataTransfer.effectAllowed = "move";
    let tabUrl = dragndropElement.getAttribute("data-href");

    log.debug("this: " + dragndropElement);
    log.debug(tabUrl + "\n" + dragndropElement.getElementsByClassName("tab-label")[0].innerText);

    e.dataTransfer.setData("text/x-moz-url", tabUrl + "\n" + dragndropElement.getElementsByClassName("tab-label")[0].innerText);
    e.dataTransfer.setData("text/html", dragndropElement.outerHTML);
}

function handleDragOver(e)
{
    e.preventDefault(); // Necessary. Allows us to drop
    // this.dragndropElement.classList.add("over");

    e.dataTransfer.dropEffect = "move"; // See the section on the DataTransfer object

    return false;
}

function handleDragEnter(e)
{
    // e.target is the current hover target.

    const target = e.target;

    if(utils.tabs.isTabElement(target))
    {
        utils.tabs.removeClassAll("hover-before");
        utils.tabs.removeClassAll("hover-after");

        const targetIndex = parseInt(target.getAttribute("data-index"), 10);
        const dragndropElementIndex = parseInt(dragndropElement.getAttribute("data-index"), 10);
        if(targetIndex < dragndropElementIndex)
        {
            const prevTarget = target.previousSibling;
            if (utils.tabs.isTabElement(prevTarget))
            {
                prevTarget.classList.add("hover-after");
            }
            else
            {
                target.classList.add("hover-before");
            }
        }
        else
        {
            target.classList.add("hover-after");
        }
    }
}

function handleDragLeave(e)
{
    log.debug("drag leave: " + dragndropElement);
    log.debug("drag leave id: " + dragndropElement.id);
    // this.dragndropElement.classList.remove("over");
}

function handleDrop(e)
{
    e.stopPropagation(); // Stops from redirecting

    let dropTarget = e.target;
    let isTabElement = utils.tabs.isTabElement(dropTarget);
    while(isTabElement == false)
    {
        dropTarget = dropTarget.parentNode;
        isTabElement = utils.tabs.isTabElement(dropTarget);
    }

    log.debug("drag and drop, new tab index: " + dropTarget.getAttribute("data-index"));
    // We are not doing anything if we drop the tab on itself
    if (dragndropElement.id != dropTarget.id)
    {
        log.debug("dragndrop targetID: " + utils.tabs.getTargetID(e));
        log.debug(dropTarget);
        utils.tabs.setIndex(utils.tabs.getIDFromHTMLID(dragndropElement.id), dropTarget.getAttribute("data-index"));
    }

    // this.dragndropElement.classList.remove("over");
    return false;
}

function handleDragEnd(e)
{
    // remove over for all elements

    utils.tabs.removeClassAll("hover-before");
    utils.tabs.removeClassAll("hover-after");
}

function addDragndropHandlers(tabElement)
{
    tabElement.addEventListener("dragstart", handleDragStart, false);
    tabElement.addEventListener("dragenter", handleDragEnter, false);
    tabElement.addEventListener("dragover", handleDragOver, false);
    tabElement.addEventListener("dragleave", handleDragLeave, false);
    tabElement.addEventListener("drop", handleDrop, false);
    tabElement.addEventListener("dragend", handleDragEnd, false);
}

// exports.VerticalTabsReloaded = VerticalTabsReloaded;
