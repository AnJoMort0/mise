/* Mise UI. Loaded as a classic script so file:// works without a web server. */
function Modal({ title, onClose, children, wide = false }) {
    useEffect(() => { const close = (event) => event.key === "Escape" && onClose(); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
    return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: event => event.target === event.currentTarget && onClose() },
        h("section", { className: `modal ${wide ? "modal-wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title },
            h("header", null,
                h("h2", null, title),
                h("button", { className: "icon-button", onClick: onClose, "aria-label": "Close" },
                    h(X, null))),
            children));
}
/* Category icons stay semantic rather than using coloured circles alone. */
const categoryIconChoices = [
    { id: "", label: "Auto", Icon: Tags },
    { id: "apple", label: "Produce", Icon: Apple },
    { id: "carrot", label: "Veg", Icon: Carrot },
    { id: "beef", label: "Protein", Icon: Beef },
    { id: "milk", label: "Dairy", Icon: Milk },
    { id: "package", label: "Pantry", Icon: Package },
    { id: "sprout", label: "Herbs", Icon: Sprout },
    { id: "cup-soda", label: "Drinks", Icon: CupSoda },
    { id: "candy", label: "Sweets", Icon: Candy },
    { id: "cookie", label: "Baking", Icon: Cookie },
    { id: "cake-slice", label: "Dessert", Icon: CakeSlice },
    { id: "coffee", label: "Hot drinks", Icon: Coffee },
    { id: "sandwich", label: "Meals", Icon: Sandwich },
    { id: "wheat", label: "Grains", Icon: Wheat }
];
const categoryIconMap = Object.fromEntries(categoryIconChoices.filter(choice => choice.id).map(choice => [choice.id, choice.Icon]));
function categoryIconFor(category) {
    if (category?.icon && categoryIconMap[category.icon]) return categoryIconMap[category.icon];
    const key = normalise(`${category?.id || ""} ${category?.name || ""}`);
    if (/sweet|chocolate|dessert|candy|confection/.test(key)) return Candy;
    if (/bake|biscuit|cookie|pastry|cake/.test(key)) return Cookie;
    if (/produce|fruit|vegetable|veg|fresh/.test(key)) return Apple;
    if (/protein|meat|fish|seafood/.test(key)) return Beef;
    if (/dairy|milk|cheese/.test(key)) return Milk;
    if (/pantry|cupboard|dry|staple/.test(key)) return Package;
    if (/sauce|condiment|dip/.test(key)) return Soup;
    if (/spice|herb|season/.test(key)) return Sprout;
    if (/drink|beverage/.test(key)) return CupSoda;
    return Tags;
}
function CategoryGlyph({ category, size = 16 }) {
    const Icon = categoryIconFor(category);
    return h("span", { className: "category-glyph", style: { "--category": category?.color || "#92958d" } }, h(Icon, { size }));
}

/* Shopping follows a broad discount-supermarket aisle flow. Real store layouts
   vary, so custom categories are matched semantically and unknown ones simply
   stay together at the end instead of being forced into the wrong aisle. */
const shoppingAisleRules = [
    { rank: 10, test: /produce|fruit|vegetable|\bveg\b|fresh/ },
    { rank: 20, test: /bakery|bread|grain|cereal/ },
    { rank: 30, test: /protein|meat|fish|seafood|deli/ },
    { rank: 40, test: /dairy|chilled|fridge|cheese|milk/ },
    { rank: 50, test: /frozen|freezer/ },
    { rank: 60, test: /pantry|cupboard|dry|tinned|canned|pasta|rice|noodle/ },
    { rank: 70, test: /sauce|condiment|oil|vinegar|spread/ },
    { rank: 80, test: /spice|herb|season|baking|flour/ },
    { rank: 90, test: /sweet|snack|dessert|candy|chocolate|biscuit|cookie|cake/ },
    { rank: 100, test: /drink|beverage|water|juice|beer|wine|coffee|tea/ },
    { rank: 110, test: /house|clean|laundry|toilet|paper|pet|misc/ }
];
function shoppingCategoryFor(item, state) {
    const stockItem = findShoppingStock(item, state.stock);
    const categoryId = stockItem?.categoryId || inferCategory(item.name, state.categories, state.stock);
    return state.categories.find(category => category.id === categoryId) || null;
}
function shoppingAisleRank(category, categories) {
    if (!category) return 1000;
    const key = normalise(`${category.id || ""} ${category.name || ""}`);
    const matched = shoppingAisleRules.find(rule => rule.test.test(key));
    if (matched) return matched.rank;
    const customIndex = Math.max(0, categories.findIndex(entry => entry.id === category.id));
    return 500 + customIndex;
}

function Stepper({ value, onMinus, onPlus, label }) { return h("div", { className: "stepper", "aria-label": label },
    h("button", { onClick: onMinus, "aria-label": `Decrease ${label}` },
        h(Minus, null)),
    h("strong", null, formatQuantity(value)),
    h("button", { onClick: onPlus, "aria-label": `Increase ${label}` },
        h(Plus, null))); }
function App() {
    const [state, setState] = useState(() => loadState());
    const [tab, setTab] = useState("stock");
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const [showAdd, setShowAdd] = useState(false);
    const [shoppingToAddId, setShoppingToAddId] = useState(null);
    const [editingItem, setEditingItem] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showInstallHelp, setShowInstallHelp] = useState(false);
    const [installPrompt, setInstallPrompt] = useState(null);
    const [installedPwa, setInstalledPwa] = useState(() => window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
    const [showPromptDefaults, setShowPromptDefaults] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [incomingTransfer, setIncomingTransfer] = useState(null);
    const [showImport, setShowImport] = useState(false);
    const [showShoppingSearch, setShowShoppingSearch] = useState(false);
    const [shoppingQuery, setShoppingQuery] = useState("");
    const [shoppingText, setShoppingText] = useState("");
    const [shoppingImport, setShoppingImport] = useState("");
    const [recipeDraft, setRecipeDraft] = useState("");
    const [showRecipeImport, setShowRecipeImport] = useState(false);
    const [recipeEditorRecipe, setRecipeEditorRecipe] = useState(null);
    const [selectedRecipeId, setSelectedRecipeId] = useState(null);
    const [recipeQuery, setRecipeQuery] = useState("");
    const [recipeIngredientFilter, setRecipeIngredientFilter] = useState("");
    const [recipeTitleTopicFilter, setRecipeTitleTopicFilter] = useState("");
    const [recipeAvailabilityFilter, setRecipeAvailabilityFilter] = useState("all");
    const [recipeTagFilter, setRecipeTagFilter] = useState("all");
    const [recipeSort, setRecipeSort] = useState("newest");
    const [tone, setTone] = useState("balanced");
    const [toast, setToast] = useState("");
    const [online, setOnline] = useState(navigator.onLine);
    const [newItem, setNewItem] = useState({ name: "", quantity: 1, unit: "", increment: 1, categoryId: state.categories[0]?.id || "", statuses: [] });
    const importRef = useRef(null);
    useEffect(() => saveState(state), [state]);
    useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);
    useEffect(() => {
        const beforeInstall = event => { event.preventDefault(); setInstallPrompt(event); };
        const installed = () => { setInstalledPwa(true); setInstallPrompt(null); };
        const media = window.matchMedia?.("(display-mode: standalone)");
        const mediaChanged = event => setInstalledPwa(Boolean(event.matches) || window.navigator.standalone === true);
        window.addEventListener("beforeinstallprompt", beforeInstall);
        window.addEventListener("appinstalled", installed);
        media?.addEventListener?.("change", mediaChanged);
        return () => {
            window.removeEventListener("beforeinstallprompt", beforeInstall);
            window.removeEventListener("appinstalled", installed);
            media?.removeEventListener?.("change", mediaChanged);
        };
    }, []);
    const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 1800); };
    useEffect(() => {
        const token = transferTokenFromLocation();
        if (!token) return;
        let cancelled = false;
        decodeTransferLinkToken(token).then(payload => { if (!cancelled) setIncomingTransfer(payload); }).catch(() => { if (!cancelled) { clearTransferHash(); notify("That Mise transfer link is not valid"); } });
        return () => { cancelled = true; };
    }, []);
    const activity = (type, label) => ({ id: uuid(), type, label, at: Date.now() });
    const addToShopping = (name, source = "manual", quantity = 1, unit = "") => setState(current => {
        const stockItem = findShoppingStock({ name }, current.stock);
        const targetUnit = String(unit || stockItem?.unit || "");
        const incomingQuantity = Math.max(1, Number(quantity || 1));
        const existing = current.shopping.find(item => matchesName(item.name, name));
        let shopping;
        if (existing) {
            shopping = current.shopping.map(item => {
                if (item.id !== existing.id) return item;
                const linked = stockItem || findShoppingStock(item, current.stock);
                const preferredUnit = String(item.unit || targetUnit || linked?.unit || "");
                let addition = incomingQuantity;
                if (targetUnit && preferredUnit && normaliseUnit(targetUnit) !== normaliseUnit(preferredUnit)) {
                    const converted = convertQuantity(incomingQuantity, targetUnit, preferredUnit);
                    if (converted != null) addition = converted;
                }
                return { ...item, name: linked?.name || item.name, stockId: linked?.id || item.stockId || null, unit: preferredUnit, quantity: roundQuantity(Number(item.quantity || 0) + addition), addedAt: Date.now(), checked: false, source };
            });
        } else {
            shopping = [newShoppingItem(stockItem?.name || name, source, stockItem, incomingQuantity, targetUnit), ...current.shopping];
        }
        return { ...current, shopping, analytics: bumpAnalytics(current, stockItem?.name || name, "shop"), activity: [activity("shop", `${stockItem?.name || name} added to shopping`), ...current.activity].slice(0, 100) };
    });
    const adjustStock = (id, direction) => setState(current => ({ ...current, stock: current.stock.map(item => { if (item.id !== id)
            return item; const quantity = roundQuantity(Math.max(0, Number(item.quantity) + itemIncrement(item) * direction)); return { ...item, quantity, statuses: quantity === 0 ? [] : itemStatuses(item), updatedAt: Date.now() }; }) }));
    const toggleStatus = (id, status) => setState(current => {
        const target = current.stock.find(item => item.id === id);
        const wasActive = target ? hasStatus(target, status) : false;
        const label = STOCK_STATUS_LABELS[status] || status;
        return {
            ...current,
            stock: current.stock.map(item => item.id === id ? { ...item, quantity: item.quantity || 1, statuses: toggleItemStatus(item, status), updatedAt: Date.now() } : item),
            activity: [activity("status", `${target?.name || "Item"} ${wasActive ? "unmarked" : "marked"} ${label}`), ...current.activity].slice(0, 100)
        };
    });
    const adjustShopping = (id, direction) => setState(current => ({ ...current, shopping: current.shopping.map(item => {
        if (item.id !== id) return item;
        const step = shoppingStep(item, current.stock);
        return { ...item, quantity: roundQuantity(Math.max(step, Number(item.quantity || step) + step * direction)) };
    }) }));
    const resetNewItem = () => setNewItem({ name: "", quantity: 1, unit: "", increment: 1, categoryId: state.categories[0]?.id || "", statuses: [] });
    const openBlankAdd = () => { setShoppingToAddId(null); resetNewItem(); setShowAdd(true); };
    const openAddFromShopping = (shoppingItem) => {
        const unit = shoppingUnit(shoppingItem, state.stock);
        setShoppingToAddId(shoppingItem.id);
        setNewItem({
            name: shoppingItem.name,
            quantity: Math.max(0, Number(shoppingItem.quantity || 1)),
            unit,
            increment: defaultIncrementForUnit(unit),
            categoryId: inferCategory(shoppingItem.name, state.categories, state.stock) || "",
            statuses: []
        });
        setShowAdd(true);
    };
    const stockShoppingItem = (shoppingItem) => {
        const existing = findShoppingStock(shoppingItem, state.stock);
        if (!existing) { openAddFromShopping(shoppingItem); return; }
        const amount = shoppingQuantityForStock(shoppingItem, existing);
        if (amount == null) { notify(`Can't convert ${shoppingItem.unit || "that unit"} to ${existing.unit || "the stock unit"}. Edit the item first.`); return; }
        setState(current => {
            const target = findShoppingStock(shoppingItem, current.stock);
            if (!target) return current;
            const converted = shoppingQuantityForStock(shoppingItem, target);
            if (converted == null) return current;
            return {
                ...current,
                stock: current.stock.map(item => item.id === target.id ? { ...item, quantity: roundQuantity(Number(item.quantity) + converted), statuses: itemStatuses(item), updatedAt: Date.now() } : item),
                shopping: current.shopping.filter(item => item.id !== shoppingItem.id),
                analytics: bumpAnalytics(current, target.name, "stock"),
                activity: [activity("stock", `${formatQuantity(shoppingItem.quantity)}${shoppingItem.unit ? ` ${shoppingItem.unit}` : ""} ${target.name} restocked`), ...current.activity].slice(0, 100)
            };
        });
        notify(`${existing.name} restocked`);
    };
    const stockChecked = () => {
        const checked = state.shopping.filter(item => item.checked);
        if (!checked.length) return;
        let stocked = 0, needsSetup = 0, incompatible = 0;
        setState(current => {
            let next = current;
            for (const original of checked) {
                const shoppingItem = next.shopping.find(item => item.id === original.id);
                if (!shoppingItem) continue;
                const target = findShoppingStock(shoppingItem, next.stock);
                if (!target) { needsSetup += 1; continue; }
                const amount = shoppingQuantityForStock(shoppingItem, target);
                if (amount == null) { incompatible += 1; continue; }
                next = {
                    ...next,
                    stock: next.stock.map(item => item.id === target.id ? { ...item, quantity: roundQuantity(Number(item.quantity) + amount), statuses: itemStatuses(item), updatedAt: Date.now() } : item),
                    shopping: next.shopping.filter(item => item.id !== shoppingItem.id),
                    analytics: bumpAnalytics(next, target.name, "stock"),
                    activity: [activity("stock", `${formatQuantity(shoppingItem.quantity)}${shoppingItem.unit ? ` ${shoppingItem.unit}` : ""} ${target.name} restocked`), ...next.activity].slice(0, 100)
                };
                stocked += 1;
            }
            return next;
        });
        const notes = [`${stocked} restocked`];
        if (needsSetup) notes.push(`${needsSetup} need Add`);
        if (incompatible) notes.push(`${incompatible} need unit check`);
        notify(notes.join(" · "));
    };
    const saveRecipe = () => {
        if (!recipeDraft.trim()) return;
        const parsed = parseRecipeBlocks(recipeDraft);
        if (!parsed.length) { notify("No recipe found in that reply"); return; }
        const recipes = parsed.filter(recipe => recipe.ingredients?.length && recipe.steps?.length);
        const incomplete = parsed.filter(recipe => !recipe.ingredients?.length || !recipe.steps?.length);
        if (!recipes.length) {
            const names = incomplete.slice(0, 2).map(recipe => recipe.title).filter(Boolean).join(", ");
            notify(`Could not parse ingredients + steps${names ? ` for ${names}` : ""}`);
            return;
        }
        setState(current => ({
            ...current,
            recipes: [...recipes, ...current.recipes],
            activity: [...recipes.map(recipe => activity("recipe", `${recipe.title} saved`)), ...current.activity].slice(0, 100)
        }));
        setRecipeDraft("");
        setShowRecipeImport(false);
        setSelectedRecipeId(recipes[0].id);
        notify(incomplete.length ? `${recipes.length} imported · ${incomplete.length} skipped` : `${recipes.length} recipe${recipes.length === 1 ? "" : "s"} imported`);
    };
    const saveManualRecipe = (draft) => {
        const editing = Boolean(draft?.id);
        const id = draft?.id || uuid();
        setState(current => {
            const previous = editing ? current.recipes.find(recipe => recipe.id === id) : null;
            const ingredients = linkRecipeIngredientsToStock({ ingredients: draft.ingredients || [] }, current.stock);
            const recipe = {
                ...previous,
                ...draft,
                id,
                title: String(draft.title || "Untitled recipe").trim().slice(0, 90),
                mode: String(draft.mode || "").trim(),
                cuisine: String(draft.cuisine || "").trim(),
                tags: Array.isArray(draft.tags) ? draft.tags.map(String).map(tag => tag.trim()).filter(Boolean).slice(0, 8) : [],
                servings: Number(draft.servings) || null,
                activeMinutes: Number(draft.activeMinutes) || null,
                totalMinutes: Number(draft.totalMinutes) || null,
                leadTime: String(draft.leadTime || "none").trim() || "none",
                ingredients,
                steps: Array.isArray(draft.steps) ? draft.steps.map(String).map(step => step.trim()).filter(Boolean) : [],
                createdAt: previous?.createdAt || draft.createdAt || Date.now(),
                timesCooked: Number(previous?.timesCooked ?? draft.timesCooked ?? 0),
                lastCookedAt: previous?.lastCookedAt ?? draft.lastCookedAt ?? null,
                text: JSON.stringify({
                    title: String(draft.title || "Untitled recipe").trim(),
                    mode: String(draft.mode || "").trim(),
                    cuisine: String(draft.cuisine || "").trim(),
                    tags: Array.isArray(draft.tags) ? draft.tags : [],
                    servings: Number(draft.servings) || null,
                    activeMinutes: Number(draft.activeMinutes) || null,
                    totalMinutes: Number(draft.totalMinutes) || null,
                    leadTime: String(draft.leadTime || "none"),
                    ingredients,
                    steps: Array.isArray(draft.steps) ? draft.steps : []
                }, null, 2)
            };
            return {
                ...current,
                recipes: previous ? current.recipes.map(item => item.id === id ? recipe : item) : [recipe, ...current.recipes],
                activity: [activity("recipe", `${recipe.title} ${previous ? "updated" : "created manually"}`), ...current.activity].slice(0, 100)
            };
        });
        setRecipeEditorRecipe(null);
        setSelectedRecipeId(id);
        notify(editing ? "Recipe updated" : "Recipe saved");
    };
    const importShopping = () => {
        const items = parseShoppingItems(shoppingImport);
        if (!items.length) { notify("No shopping items found in that reply"); return; }
        setState(current => {
            let shopping = [...current.shopping];
            let analytics = current.analytics;
            const activities = [];
            const now = Date.now();
            for (const incoming of items) {
                const stockItem = findShoppingStock(incoming, current.stock);
                const linkedName = stockItem?.name || incoming.name.trim();
                const incomingUnitText = String(incoming.unit || stockItem?.unit || "");
                const existing = shopping.find(item => matchesName(item.name, linkedName));
                if (existing) {
                    shopping = shopping.map(item => {
                        if (item.id !== existing.id) return item;
                        const preferredUnit = String(item.unit || incomingUnitText || stockItem?.unit || "");
                        let addition = Number(incoming.quantity || 1);
                        if (incomingUnitText && preferredUnit && normaliseUnit(incomingUnitText) !== normaliseUnit(preferredUnit)) {
                            const converted = convertQuantity(addition, incomingUnitText, preferredUnit);
                            if (converted != null) addition = converted;
                        }
                        return { ...item, name: linkedName, stockId: stockItem?.id || item.stockId || null, quantity: Math.max(1, roundQuantity(Number(item.quantity || 0) + addition)), unit: preferredUnit, checked: false, addedAt: now, source: "AI import" };
                    });
                } else {
                    shopping.unshift(newShoppingItem(linkedName, "AI import", stockItem, Number(incoming.quantity || 1), incomingUnitText));
                }
                analytics = bumpAnalytics({ ...current, analytics }, linkedName, "shop", now);
                activities.push(activity("shop", `${linkedName} imported to shopping`));
            }
            return { ...current, shopping, analytics, activity: [...activities, ...current.activity].slice(0, 100) };
        });
        setShoppingImport("");
        setShowImport(false);
        notify(`${items.length} item${items.length === 1 ? "" : "s"} imported`);
    };
    const smart = useMemo(() => smartRecommendations(state), [state]);
    const recent = useMemo(() => recentShopping(state), [state]);
    const visibleShopping = useMemo(() => {
        const queryText = normalise(shoppingQuery);
        const filtered = queryText ? state.shopping.filter(item => {
            const stockItem = findShoppingStock(item, state.stock);
            const category = shoppingCategoryFor(item, state);
            return normalise(`${item.name} ${item.unit || ""} ${item.source || ""} ${stockItem?.name || ""} ${category?.name || ""}`).includes(queryText);
        }) : [...state.shopping];
        return filtered.sort((a, b) => {
            const categoryA = shoppingCategoryFor(a, state);
            const categoryB = shoppingCategoryFor(b, state);
            const rank = shoppingAisleRank(categoryA, state.categories) - shoppingAisleRank(categoryB, state.categories);
            if (rank) return rank;
            const categoryName = String(categoryA?.name || "Other").localeCompare(String(categoryB?.name || "Other"));
            if (categoryName) return categoryName;
            const checked = Number(Boolean(a.checked)) - Number(Boolean(b.checked));
            if (checked) return checked;
            return String(a.name || "").localeCompare(String(b.name || ""));
        });
    }, [state.shopping, state.stock, state.categories, shoppingQuery]);
    const shoppingGroups = useMemo(() => {
        const groups = [];
        for (const item of visibleShopping) {
            const category = shoppingCategoryFor(item, state);
            const key = category?.id || "other";
            let group = groups.find(entry => entry.key === key);
            if (!group) {
                group = { key, category, label: category?.name || "Other", items: [] };
                groups.push(group);
            }
            group.items.push(item);
        }
        return groups;
    }, [visibleShopping, state.stock, state.categories]);
    const recipeStars = useMemo(() => topRecipeItems(state), [state]);
    const frequent = useMemo(() => frequentBuys(state), [state]);
    const useFirst = useMemo(() => state.stock.filter(item => item.quantity > 0 && (hasStatus(item, "expiring") || hasStatus(item, "open") || hasStatus(item, "leftover"))).sort((a, b) => {
        const rank = item => hasStatus(item, "expiring") ? 0 : hasStatus(item, "leftover") && !hasStatus(item, "frozen") ? 1 : hasStatus(item, "open") ? 2 : 3;
        return rank(a) - rank(b) || a.updatedAt - b.updatedAt;
    }), [state.stock]);
    const highlightedIngredient = useFirst[0] || null;
    const highlightedRecipeCount = highlightedIngredient ? usageCount(highlightedIngredient.name, state.recipes) : 0;
    const showHighlightedRecipes = () => {
        if (!highlightedIngredient) return;
        setRecipeQuery("");
        setRecipeIngredientFilter(highlightedIngredient.name);
        setRecipeTitleTopicFilter("");
        setRecipeAvailabilityFilter("all");
        setRecipeTagFilter("all");
        setTab("recipes");
    };
    const visibleStock = useMemo(() => state.stock.filter(item => (categoryFilter === "all" || categoryFilter === "unsorted" ? categoryFilter !== "unsorted" || !item.categoryId : item.categoryId === categoryFilter) && (statusFilter === "all" || (statusFilter === "out" ? item.quantity === 0 : hasStatus(item, statusFilter))) && normalise(item.name).includes(normalise(query))).sort((a, b) => (a.quantity === 0 ? 1 : 0) - (b.quantity === 0 ? 1 : 0) || a.name.localeCompare(b.name)), [state.stock, categoryFilter, statusFilter, query]);
    const recipeTags = useMemo(() => Array.from(new Set(state.recipes.flatMap(recipe => recipe.tags || []).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [state.recipes]);
    const recipeTitleTopicOptions = useMemo(() => recipeTitleTopics(state.recipes), [state.recipes]);
    useEffect(() => {
        if (recipeTitleTopicFilter && !recipeTitleTopicOptions.some(topic => topic.key === normalise(recipeTitleTopicFilter))) setRecipeTitleTopicFilter("");
    }, [recipeTitleTopicFilter, recipeTitleTopicOptions]);
    const visibleRecipes = useMemo(() => state.recipes.filter(recipe => {
        const availability = recipeAvailability(recipe, state.stock);
        const ingredientText = recipeIngredientObjects(recipe).map(ingredient => ingredient.name).join(" ");
        if (recipeQuery && !normalise(`${recipe.title} ${recipe.cuisine || ""} ${(recipe.tags || []).join(" ")} ${ingredientText}`).includes(normalise(recipeQuery))) return false;
        if (recipeIngredientFilter && !recipeIngredientObjects(recipe).some(ingredient => matchesName(ingredient.name, recipeIngredientFilter))) return false;
        if (recipeTitleTopicFilter && !recipeTitleHasTopic(recipe.title, recipeTitleTopicFilter)) return false;
        if (recipeAvailabilityFilter === "ready" && !availability.ready) return false;
        if (recipeAvailabilityFilter === "missing" && availability.ready) return false;
        if (recipeAvailabilityFilter === "prep" && normalise(recipe.mode) !== "prep ahead") return false;
        if (recipeTagFilter !== "all" && !(recipe.tags || []).some(tag => normalise(tag) === normalise(recipeTagFilter))) return false;
        return true;
    }).sort((a, b) => {
        if (recipeSort === "quickest") return recipeTotalMinutes(a) - recipeTotalMinutes(b) || a.title.localeCompare(b.title);
        if (recipeSort === "match") return recipeAvailability(b, state.stock).pct - recipeAvailability(a, state.stock).pct || recipeTotalMinutes(a) - recipeTotalMinutes(b);
        if (recipeSort === "cooked") return Number(b.timesCooked || 0) - Number(a.timesCooked || 0) || Number(b.createdAt) - Number(a.createdAt);
        if (recipeSort === "az") return a.title.localeCompare(b.title);
        return Number(b.createdAt) - Number(a.createdAt);
    }), [state.recipes, state.stock, recipeQuery, recipeIngredientFilter, recipeTitleTopicFilter, recipeAvailabilityFilter, recipeTagFilter, recipeSort]);
    const selectedRecipe = state.recipes.find(recipe => recipe.id === selectedRecipeId) || null;
    const prompt = useMemo(() => makePrompt(state, tone), [state, tone]);
    const addStock = (event) => {
        event.preventDefault();
        if (!newItem.name.trim()) return;
        const name = newItem.name.trim();
        const quantity = Math.max(0, Number(newItem.quantity) || 0);
        const unit = newItem.unit.trim();
        setState(current => {
            const created = { id: uuid(), name, quantity, unit, increment: Number(newItem.increment) > 0 ? Number(newItem.increment) : defaultIncrementForUnit(unit), categoryId: newItem.categoryId || null, statuses: quantity === 0 ? [] : itemStatuses(newItem), createdAt: Date.now(), updatedAt: Date.now() };
            return {
                ...current,
                stock: [created, ...current.stock],
                shopping: shoppingToAddId ? current.shopping.filter(item => item.id !== shoppingToAddId) : current.shopping,
                activity: [activity("stock", `${name} added to stock`), ...current.activity].slice(0, 100)
            };
        });
        setNewItem({ name: "", quantity: 1, unit: "", increment: 1, categoryId: state.categories[0]?.id || "", statuses: [] });
        setShoppingToAddId(null);
        setShowAdd(false);
        notify(shoppingToAddId ? "Added to stock and cleared from shopping" : "Added to stock");
    };
    const editStock = (item) => setEditingItem({ ...item, increment: itemIncrement(item), categoryId: item.categoryId || "", statuses: itemStatuses(item) });
    const deleteStockItem = () => {
        if (!editingItem || !window.confirm(`Delete ${editingItem.name} from stock? This cannot be undone.`)) return;
        const name = editingItem.name;
        setState(current => ({ ...current, stock: current.stock.filter(item => item.id !== editingItem.id), activity: [activity("stock", `${name} deleted`), ...current.activity].slice(0, 100) }));
        setEditingItem(null);
        notify("Ingredient deleted");
    };
    const saveStockEdit = (event) => {
        event.preventDefault();
        if (!editingItem?.name.trim()) return;
        const nextName = editingItem.name.trim();
        const nextQuantity = Math.max(0, Number(editingItem.quantity) || 0);
        const nextStatuses = nextQuantity === 0 ? [] : itemStatuses(editingItem);
        setState(current => {
            const previous = current.stock.find(item => item.id === editingItem.id);
            let analytics = current.analytics;
            if (previous && normalise(previous.name) !== normalise(nextName)) {
                const oldKey = normalise(previous.name);
                const newKey = normalise(nextName);
                const oldSignals = current.analytics[oldKey];
                if (oldSignals && newKey) {
                    const existing = current.analytics[newKey] || { shoppingAdds: 0, stockAdds: 0, stockedAt: [] };
                    const { [oldKey]: _removed, ...rest } = current.analytics;
                    analytics = { ...rest, [newKey]: {
                        ...existing,
                        shoppingAdds: (existing.shoppingAdds || 0) + (oldSignals.shoppingAdds || 0),
                        stockAdds: (existing.stockAdds || 0) + (oldSignals.stockAdds || 0),
                        lastShoppingAt: Math.max(existing.lastShoppingAt || 0, oldSignals.lastShoppingAt || 0) || undefined,
                        lastStockedAt: Math.max(existing.lastStockedAt || 0, oldSignals.lastStockedAt || 0) || undefined,
                        stockedAt: [...(existing.stockedAt || []), ...(oldSignals.stockedAt || [])].sort((a, b) => a - b).slice(-10)
                    } };
                }
            }
            return {
                ...current,
                analytics,
                stock: current.stock.map(item => item.id === editingItem.id ? {
                    ...item,
                    name: nextName,
                    quantity: nextQuantity,
                    unit: editingItem.unit.trim(),
                    increment: Number(editingItem.increment) > 0 ? Number(editingItem.increment) : defaultIncrementForUnit(editingItem.unit),
                    categoryId: editingItem.categoryId || null,
                    statuses: nextStatuses,
                    updatedAt: Date.now()
                } : item),
                shopping: current.shopping.map(item => previous && (item.stockId === editingItem.id || normalise(item.name) === normalise(previous.name)) ? { ...item, name: nextName, stockId: editingItem.id, unit: item.unit || editingItem.unit.trim() } : item),
                recipes: current.recipes.map(recipe => ({
                    ...recipe,
                    ingredients: recipeIngredientObjects(recipe).map(ingredient => previous && ingredient.source === "stock" && (ingredient.stockId === editingItem.id || normalise(ingredient.name) === normalise(previous.name)) ? { ...ingredient, name: nextName, stockId: editingItem.id } : ingredient)
                })),
                activity: [activity("stock", `${nextName} updated`), ...current.activity].slice(0, 100)
            };
        });
        setEditingItem(null);
        notify("Ingredient updated");
    };
    const cookRecipe = (recipe) => {
        if (!recipe || !window.confirm(`Mark “${recipe.title}” as cooked and subtract its measurable ingredients from stock?`)) return;
        let result = null;
        setState(current => {
            result = consumeRecipeStock(recipe, current.stock);
            return {
                ...current,
                stock: result.stock,
                recipes: current.recipes.map(item => item.id === recipe.id ? { ...item, timesCooked: Number(item.timesCooked || 0) + 1, lastCookedAt: Date.now() } : item),
                activity: [activity("cook", `${recipe.title} cooked`), ...current.activity].slice(0, 100)
            };
        });
        window.setTimeout(() => notify(result?.skipped ? `Stock updated · ${result.consumed} measured · ${result.skipped} not measurable` : `Stock updated from ${result?.consumed || 0} ingredient${result?.consumed === 1 ? "" : "s"}`), 0);
    };
    const deleteRecipe = (recipe) => {
        if (!recipe || !window.confirm(`Delete “${recipe.title}” from your recipe library?`)) return;
        setState(current => ({ ...current, recipes: current.recipes.filter(item => item.id !== recipe.id) }));
        setSelectedRecipeId(null);
        notify("Recipe deleted");
    };
    const copyPrompt = async () => { try {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(prompt);
        }
        else {
            const area = document.createElement("textarea");
            area.value = prompt;
            area.setAttribute("readonly", "");
            area.style.position = "fixed";
            area.style.opacity = "0";
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand("copy");
            area.remove();
            if (!ok)
                throw new Error("copy unavailable");
        }
        notify("Prompt copied");
    }
    catch {
        window.prompt("Copy this cooking prompt:", prompt);
    } };
    const exportData = () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `mise-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); notify("Backup downloaded"); };
    const restoreData = async (file) => { try {
        const parsed = JSON.parse(await file.text());
        if (parsed.version !== 1 || !Array.isArray(parsed.stock) || !Array.isArray(parsed.categories))
            throw new Error();
        setState(migrateLegacyStatuses(parsed));
        setShowSettings(false);
        notify("Backup restored");
    }
    catch {
        notify("That backup is not valid");
    } };
    const applyIncomingTransfer = (payload, options) => {
        try {
            const result = applyTransferredState(state, payload, options);
            setState(result.state);
            setIncomingTransfer(null);
            clearTransferHash();
            if (result.summary.mode === "replace") notify(`Replaced ${result.summary.replaced.length} selected section${result.summary.replaced.length === 1 ? "" : "s"}`);
            else notify(`Data merged · ${result.summary.added} new · ${result.summary.updated} updated`);
        }
        catch { notify("Could not apply that transfer selection"); }
    };
    const dismissIncomingTransfer = () => { setIncomingTransfer(null); clearTransferHash(); };
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const canOfferInstall = !installedPwa && (Boolean(installPrompt) || isiOS);
    const installApp = async () => {
        if (!installPrompt) { setShowInstallHelp(true); return; }
        try {
            await installPrompt.prompt();
            const choice = await installPrompt.userChoice;
            if (choice?.outcome === "accepted") notify("Mise is being installed");
            setInstallPrompt(null);
        }
        catch { setShowInstallHelp(true); }
    };
    return h("main", null,
        h("div", { className: "app-shell" },
            h("header", { className: "topbar" },
                h("button", { className: "brand", onClick: () => setTab("stock"), "aria-label": "Mise home" },
                    h("span", null,
                        h(CookingPot, null)),
                    h("strong", null, "MISE")),
                h("div", { className: "top-actions" },
                    h("span", { className: `privacy-pill ${online ? "" : "offline"}` },
                        online ? h(Wifi, null) : h(WifiOff, null),
                        online ? "Online" : "Offline cache"),
                    h("button", { className: "soft-button help-button", onClick: () => setShowHelp(true), title: "How to use Mise", "aria-label": "How to use Mise" },
                        h(BookOpen, null),
                        h("span", null, "How to use")),
                    h("button", { className: "icon-button", onClick: () => setShowSettings(true), "aria-label": "Settings" },
                        h(Settings, null)),
                    h("button", { className: "primary-button", onClick: openBlankAdd, "aria-label": "Add stock" },
                        h(Plus, null),
                        "Add stock"))),
            canOfferInstall && h("button", { className: "install-banner", onClick: installApp, "aria-label": "Install Mise app" },
                h("span", { className: "install-banner-icon" }, h(Download, null)),
                h("span", { className: "install-banner-copy" }, h("b", null, "Install Mise"), h("small", null, isiOS && !installPrompt ? "Add it to your Home Screen" : "Open it like a normal app")),
                h(ChevronRight, null)),
            h("nav", { className: "desktop-nav", "aria-label": "Main navigation" },
                h(NavButton, { active: tab === "stock", onClick: () => setTab("stock"), icon: h(Box, null), label: "Stock" }),
                h(NavButton, { active: tab === "shopping", onClick: () => setTab("shopping"), icon: h(ShoppingBasket, null), label: "Shopping", count: state.shopping.length }),
                h(NavButton, { active: tab === "recipes", onClick: () => setTab("recipes"), icon: h(BookOpen, null), label: "Recipes", count: state.recipes.length }),
                h(NavButton, { active: tab === "cook", onClick: () => setTab("cook"), icon: h(Sparkles, null), label: "Cook" })),
            tab === "stock" && h("section", { className: "page stock-page" },
                h("div", { className: "signal-card" },
                    h("div", { className: "signal-copy" },
                        h("span", { className: "eyebrow" },
                            h(Sparkles, null),
                            " TONIGHT'S SIGNAL"),
                        h("h1", null, useFirst[0] ? h(Fragment, null,
                            "Use ",
                            h("em", null, useFirst[0].name),
                            " first.") : h(Fragment, null,
                            "Your kitchen is",
                            h("br", null),
                            h("em", null, "ready."))),
                        h("p", null, highlightedIngredient ? `${hasStatus(highlightedIngredient, "expiring") ? "Near expiry" : hasStatus(highlightedIngredient, "leftover") ? "Leftover" : "Already open"} · ${highlightedRecipeCount} saved recipe match${highlightedRecipeCount === 1 ? "" : "es"}` : "Nothing urgent. Explore your stock or build a cooking brief.")),
                    h("div", { className: "signal-actions" },
                        h("button", { className: "signal-recipe-button", onClick: showHighlightedRecipes, disabled: !highlightedRecipeCount, title: highlightedRecipeCount ? `See recipes using ${highlightedIngredient?.name || "this ingredient"}` : "No saved recipes use this ingredient yet" },
                            h("span", null, h(BookOpen, null)),
                            h("b", null, highlightedRecipeCount ? "See recipes" : "No saved recipes")),
                        h("button", { className: "cook-now", onClick: () => setTab("cook") },
                            h("span", null,
                                h(Sparkles, null)),
                            h("b", null, "Let him cook"),
                            h(ChevronRight, null))),
                    h("div", { className: "signal-orbit" })),
                h("div", { className: "insight-grid" },
                    h(Insight, { icon: h(PackageOpen, null), label: "Use first", value: useFirst[0]?.name || "All clear", meta: useFirst.length ? `${useFirst.length} use-soon or leftover` : "No urgent items" }),
                    h(Insight, { icon: h(BookOpen, null), label: "Recipe magnet", value: recipeStars[0]?.item.name || "Learning…", meta: recipeStars[0] ? `${recipeStars[0].count} saved recipes` : "Save recipes to train this" }),
                    h(Insight, { icon: h(History, null), label: "Restock rhythm", value: frequent[0]?.item.name || "Learning…", meta: frequent[0] ? `Added ${frequent[0].count}× to shopping` : "Shopping history stays here" })),
                h("div", { className: "section-head" },
                    h("div", null,
                        h("span", { className: "eyebrow" },
                            h(Box, null),
                            " PANTRY"),
                        h("h2", null,
                            "Your stock ",
                            h("small", null,
                                state.stock.filter(i => i.quantity > 0).length,
                                " in"))),
                    h("div", { className: "toolbar" },
                        h("div", { className: "search", role: "search" },
                            h(Search, null),
                            h("input", { value: query, onChange: e => setQuery(e.target.value), placeholder: "Find ingredient", "aria-label": "Find ingredient" }),
                            query && h("button", { type: "button", className: "search-clear", onClick: () => setQuery(""), "aria-label": "Clear search", title: "Clear search" }, h(X, null))),
                        ["open", "frozen", "expiring", "leftover", "out"].map(status => h("button", { className: `filter-button ${statusFilter === status ? "active" : ""}`, key: status, onClick: () => setStatusFilter(statusFilter === status ? "all" : status), title: status === "expiring" ? "Near expiry" : status, "aria-label": status === "expiring" ? "Near expiry" : status },
                            status === "open" ? h(PackageOpen, null) : status === "frozen" ? h(Snowflake, null) : status === "expiring" ? h(CalendarClock, null) : status === "leftover" ? h(Utensils, null) : h(X, null),
                            h("span", null, status === "expiring" ? "Near expiry" : status))))),
                h("div", { className: "category-row" },
                    h("button", { className: `category-filter ${categoryFilter === "all" ? "active" : ""}`, onClick: () => setCategoryFilter("all") },
                        h("span", { className: "category-glyph all-glyph" }, h(Boxes, { size: 16 })),
                        h("span", null, "All")),
                    state.categories.map(category => h("button", { key: category.id, className: `category-filter ${categoryFilter === category.id ? "active" : ""}`, style: { "--category": category.color }, onClick: () => setCategoryFilter(category.id) },
                        h(CategoryGlyph, { category }),
                        h("span", null, category.name))),
                    h("button", { className: `category-filter ${categoryFilter === "unsorted" ? "active" : ""}`, onClick: () => setCategoryFilter("unsorted") },
                        h("span", { className: "category-glyph neutral-glyph" }, h(ArchiveRestore, { size: 16 })),
                        h("span", null, "Unsorted")),
                    h("button", { className: "manage-categories", onClick: () => setShowSettings(true) },
                        h(FolderCog, { size: 16 }),
                        h("span", null, "Manage"))),
                visibleStock.length ? h("div", { className: "stock-grid" }, visibleStock.map(item => h(StockCard, { key: item.id, item: item, state: state, onAdjust: adjustStock, onStatus: toggleStatus, onShop: () => { addToShopping(item.name, "restock", 1, item.unit); notify("Added to shopping"); }, onEdit: () => editStock(item) }))) : h(Empty, { icon: h(Search, null), title: "Nothing here", text: "Try another filter or add an ingredient." })),
            tab === "shopping" && h("section", { className: "page panel-page" },
                h("div", { className: "page-title" },
                    h("div", null,
                        h("span", { className: "eyebrow" },
                            h(ShoppingBasket, null),
                            " RESTOCK"),
                        h("h1", null, "Shopping"),
                        h("p", null, state.shopping.length ? `${state.shopping.length} things waiting · ${state.shopping.filter(i => i.checked).length} checked off` : "A list that learns from your local habits.")),
                    h("div", { className: "title-actions shopping-title-actions" },
                        h("button", { className: `icon-button shopping-search-toggle ${showShoppingSearch || shoppingQuery ? "active" : ""}`, onClick: () => { setShowShoppingSearch(current => !current); if (showShoppingSearch) setShoppingQuery(""); }, title: "Search shopping list", "aria-label": "Search shopping list", "aria-expanded": showShoppingSearch },
                            h(Search, null)),
                        h("button", { className: "soft-button", onClick: () => setShowImport(!showImport) },
                            h(ClipboardPaste, null),
                            "Paste AI list"),
                        state.shopping.some(i => i.checked) && h("button", { className: "primary-button", onClick: stockChecked },
                            h(PackageCheck, null),
                            "Restock bought"))),
                showShoppingSearch && h("label", { className: "shopping-search", "aria-label": "Search shopping list" },
                    h(Search, null),
                    h("input", { autoFocus: true, value: shoppingQuery, onChange: e => setShoppingQuery(e.target.value), placeholder: "Search what is already on the list" }),
                    shoppingQuery && h("button", { type: "button", onClick: () => setShoppingQuery(""), "aria-label": "Clear shopping search" }, h(X, null))),
                showImport && h("div", { className: "import-panel" },
                    h("div", null,
                        h("b", null, "Paste the AI reply or shopping block"),
                        h("p", null, "Mise reads the current JSON format and the older [SHOPPING] format. Quantities and units are kept when present.")),
                    h("textarea", { value: shoppingImport, onChange: e => setShoppingImport(e.target.value), placeholder: '{\n  "format": "mise-ai-v1",\n  "shopping": [\n    {"name":"Fresh coriander","quantity":1,"unit":"bunch","reason":"unlocks curries, rice and salads"}\n  ]\n}' }),
                    h("button", { className: "primary-button", disabled: !shoppingImport.trim(), onClick: importShopping },
                        h(ListPlus, null),
                        "Add all")),
                h("form", { className: "quick-add", "aria-label": "Quick add to shopping", onSubmit: event => { event.preventDefault(); if (shoppingText.trim()) {
                        addToShopping(shoppingText);
                        setShoppingText("");
                        notify("Added to shopping");
                    } } },
                    h("input", { value: shoppingText, onChange: e => setShoppingText(e.target.value), placeholder: "Add something to buy" }),
                    h("button", { "aria-label": "Add to shopping" },
                        h(Plus, null))),
                recent.length > 0 && h("div", { className: "recent-strip" },
                    h("span", null,
                        h(History, null),
                        "Recent"),
                    recent.map(item => h("button", { key: item.id, onClick: () => addToShopping(item.name, item.source) },
                        h(RotateCcw, null),
                        item.name,
                        h("small", null, timeLabel(item.addedAt))))),
                h("div", { className: "shopping-layout" },
                    h("div", { className: "shopping-list" }, state.shopping.length ? (visibleShopping.length ? shoppingGroups.map(group => h("section", { className: "shopping-group", key: group.key },
                        h("div", { className: "shopping-group-heading" },
                            h(CategoryGlyph, { category: group.category, size: 15 }),
                            h("b", null, group.label),
                            h("small", null, group.items.length, group.items.length === 1 ? " item" : " items")),
                        group.items.map(item => h(ShoppingRow, { key: item.id, item: item, stockItem: findShoppingStock(item, state.stock), onCheck: () => setState(current => ({ ...current, shopping: current.shopping.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i) })), onAdjust: direction => adjustShopping(item.id, direction), onUnitChange: unit => setState(current => ({ ...current, shopping: current.shopping.map(entry => entry.id === item.id ? { ...entry, unit } : entry) })), onStock: () => stockShoppingItem(item), onAdd: () => openAddFromShopping(item), onDelete: () => setState(current => ({ ...current, shopping: current.shopping.filter(i => i.id !== item.id) })) })))) : h(Empty, { icon: h(Search, null), title: "Not on the list", text: `No shopping item matches “${shoppingQuery}”.` })) : h(Empty, { icon: h(ShoppingBasket, null), title: "Basket's empty", text: "Your smart picks will get better as you use the app." })),
                    h("aside", { className: "smart-panel" },
                        h("span", { className: "eyebrow" },
                            h(Lightbulb, null),
                            " LOCAL SIGNALS"),
                        h("h2", null, "Smart picks"),
                        h("p", null, "Ranked from stock, recipe use, shopping frequency and timing. Nothing leaves this device."),
                        h("div", null, smart.map((item, index) => h("button", { key: item.name, onClick: () => { addToShopping(item.name, item.source); notify("Smart pick added"); } },
                            h("span", { className: "rank" }, String(index + 1).padStart(2, "0")),
                            h("span", null,
                                h("b", null, item.name),
                                h("small", null, item.reasons.join(" · "))),
                            h(Plus, null))))))),
            tab === "recipes" && h("section", { className: "page recipe-library-page" },
                h("div", { className: "recipe-library-head" },
                    h("div", null,
                        h("span", { className: "eyebrow" }, h(BookOpen, null), " YOUR KEEPERS"),
                        h("h1", null, "Recipe library"),
                        h("p", null, state.recipes.length ? `${state.recipes.length} saved recipe${state.recipes.length === 1 ? "" : "s"} · availability updates with your stock` : "Save recipes as structured cards you can actually cook from.")),
                    h("div", { className: "title-actions recipe-head-actions" },
                        h("button", { className: "soft-button", onClick: () => setRecipeEditorRecipe({ id: null }) }, h(Plus, null), "New recipe"),
                        h("button", { className: "primary-button", onClick: () => setShowRecipeImport(true) }, h(ClipboardPaste, null), "Import recipe"))),
                recipeTitleTopicOptions.length > 0 && h("div", { className: "recipe-topic-strip", "aria-label": "Automatic recipe categories" },
                    h("span", { className: "recipe-topic-label" }, "Auto categories"),
                    recipeTitleTopicOptions.map(topic => h("button", {
                        key: topic.key,
                        className: recipeTitleTopicFilter === topic.key ? "active" : "",
                        onClick: () => setRecipeTitleTopicFilter(current => current === topic.key ? "" : topic.key),
                        "aria-pressed": recipeTitleTopicFilter === topic.key
                    }, h("span", null, topic.label), h("small", null, topic.count)))),
                h("div", { className: "recipe-toolbar" },
                    h("label", { className: "recipe-search" }, h(Search, null), h("input", { value: recipeQuery, onChange: e => setRecipeQuery(e.target.value), placeholder: "Find recipe, ingredient or tag", "aria-label": "Find recipe" }), recipeQuery && h("button", { type: "button", onClick: () => setRecipeQuery(""), "aria-label": "Clear recipe search" }, h(X, null))),
                    h("select", { value: recipeAvailabilityFilter, onChange: e => setRecipeAvailabilityFilter(e.target.value), "aria-label": "Filter recipes by availability" },
                        h("option", { value: "all" }, "All availability"),
                        h("option", { value: "ready" }, "Ready now"),
                        h("option", { value: "missing" }, "Needs shopping"),
                        h("option", { value: "prep" }, "Prep ahead")),
                    h("select", { value: recipeTagFilter, onChange: e => setRecipeTagFilter(e.target.value), "aria-label": "Filter recipes by tag" },
                        h("option", { value: "all" }, "All tags"),
                        recipeTags.map(tag => h("option", { key: tag, value: tag }, tag))),
                    h("select", { value: recipeSort, onChange: e => setRecipeSort(e.target.value), "aria-label": "Sort recipes" },
                        h("option", { value: "newest" }, "Newest first"),
                        h("option", { value: "quickest" }, "Quickest first"),
                        h("option", { value: "match" }, "Best stock match"),
                        h("option", { value: "cooked" }, "Most cooked"),
                        h("option", { value: "az" }, "A–Z"))),
                recipeTitleTopicFilter && h("div", { className: "recipe-active-filter recipe-topic-active" },
                    h(BookOpen, null),
                    h("span", null, "Title category ", h("b", null, recipeTitleTopicOptions.find(topic => topic.key === recipeTitleTopicFilter)?.label || recipeTitleTopicFilter)),
                    h("button", { onClick: () => setRecipeTitleTopicFilter(""), "aria-label": "Clear automatic recipe category", title: "Clear automatic category" }, h(X, null))),
                recipeIngredientFilter && h("div", { className: "recipe-active-filter" },
                    h(BookOpen, null),
                    h("span", null, "Using ", h("b", null, recipeIngredientFilter)),
                    h("button", { onClick: () => setRecipeIngredientFilter(""), "aria-label": `Clear ${recipeIngredientFilter} recipe filter`, title: "Clear ingredient filter" }, h(X, null))),
                h("div", { className: "recipe-list recipe-grid" }, visibleRecipes.length ? visibleRecipes.map(recipe => h(RecipeCard, { key: recipe.id, recipe, state, onOpen: () => setSelectedRecipeId(recipe.id) })) : h(Empty, { icon: h(BookOpen, null), title: state.recipes.length ? "No recipes match" : "No saved recipes", text: state.recipes.length ? "Try another filter." : "Create a recipe manually or import an AI reply and Mise will turn it into a useful recipe card." }))),
            tab === "cook" && h("section", { className: "page cook-page" },
                h("div", { className: "cook-intro" },
                    h("span", { className: "eyebrow" },
                        h(ChefHat, null),
                        " COOK WITH WHAT YOU HAVE"),
                    h("h1", null,
                        "Your dinner",
                        h("br", null),
                        "brief."),
                    h("p", null, "The prompt blends live stock with your local recipe habits, including a prep-ahead idea for tomorrow or later when your stock suits one."),
                    h("div", { className: "tone-switch" }, ["healthy", "balanced", "comfort"].map(choice => h("button", { className: tone === choice ? "active" : "", key: choice, onClick: () => setTone(choice) },
                        choice === "healthy" ? h(Leaf, null) : choice === "comfort" ? h(Flame, null) : h(CircleGauge, null),
                        h("span", null, choice)))),
                    h("div", { className: "prompt-signals" },
                        h("span", null,
                            h(Box, null),
                            state.stock.filter(i => i.quantity > 0).length,
                            " stocked"),
                        h("span", null,
                            h(BookOpen, null),
                            state.recipes.length,
                            " recipes learned"),
                        h("span", null,
                            h(BarChart3, null),
                            Object.values(state.analytics).reduce((sum, a) => sum + a.shoppingAdds, 0),
                            " shopping signals"),
                        h("span", null,
                            h(CalendarClock, null),
                            "prep-ahead enabled")),
                    h("button", { className: "primary-button copy-prompt", onClick: copyPrompt },
                        h(Clipboard, null),
                        "Copy prompt")),
                h("div", { className: "prompt-paper" },
                    h("header", null,
                        h("span", null,
                            h(Bot, null),
                            "Cooking prompt"),
                        h("div", { className: "prompt-paper-actions" },
                            h("small", null, "Generated locally"),
                            h("button", { className: "prompt-copy-top", onClick: () => setShowPromptDefaults(true), title: "Edit default prompt" }, h(Pencil, null), "Edit default"),
                            h("button", { className: "prompt-copy-top", onClick: copyPrompt, title: "Copy cooking prompt" }, h(Clipboard, null), "Copy"))),
                    h("pre", null, prompt))),
            tab === "cook" && h("button", { className: "copy-prompt-floating", onClick: copyPrompt, title: "Copy cooking prompt", "aria-label": "Copy cooking prompt" }, h(Clipboard, null), h("span", null, "Copy prompt"))),
        h("nav", { className: "mobile-nav", "aria-label": "Main navigation" },
            h(NavButton, { active: tab === "stock", onClick: () => setTab("stock"), icon: h(Box, null), label: "Stock" }),
            h(NavButton, { active: tab === "shopping", onClick: () => setTab("shopping"), icon: h(ShoppingBasket, null), label: "Shop", count: state.shopping.length }),
            h(NavButton, { active: tab === "recipes", onClick: () => setTab("recipes"), icon: h(BookOpen, null), label: "Recipes" }),
            h(NavButton, { active: tab === "cook", onClick: () => setTab("cook"), icon: h(Sparkles, null), label: "Cook" })),
        showHelp && h(HelpModal, { onClose: () => setShowHelp(false), onEditPrompt: () => { setShowHelp(false); setShowPromptDefaults(true); } }),
        showInstallHelp && h(InstallHelpModal, { onClose: () => setShowInstallHelp(false), isiOS }),
        showPromptDefaults && h(PromptDefaultsModal, { value: state.promptTemplate || defaultPromptTemplate(), onClose: () => setShowPromptDefaults(false), onSave: template => { setState(current => ({ ...current, promptTemplate: normalisePromptTemplate(template), activity: [activity("prompt", "Default cooking prompt updated"), ...current.activity].slice(0, 100) })); setShowPromptDefaults(false); notify("Default prompt saved"); } }),
        showAdd && h(Modal, { title: shoppingToAddId ? "Add shopping item to stock" : "Add to stock", onClose: () => { setShowAdd(false); setShoppingToAddId(null); } },
            h("form", { className: "form-grid", onSubmit: addStock },
                h("label", { className: "full" },
                    "Ingredient",
                    h("input", { autoFocus: true, value: newItem.name, onChange: e => setNewItem({ ...newItem, name: e.target.value }), placeholder: "e.g. Chickpeas" })),
                h("label", null,
                    "Quantity",
                    h("input", { type: "number", min: "0", step: "0.5", value: newItem.quantity, onChange: e => setNewItem({ ...newItem, quantity: Number(e.target.value) }) })),
                h("label", null,
                    "Unit",
                    h("input", { value: newItem.unit, onChange: e => { const unit = e.target.value; setNewItem({ ...newItem, unit, increment: defaultIncrementForUnit(unit) }); }, placeholder: "pack, L, can…" })),
                h("label", null,
                    "+/− amount",
                    h("input", { type: "number", min: "0.001", step: "any", value: newItem.increment, onChange: e => setNewItem({ ...newItem, increment: Number(e.target.value) }), placeholder: "1" })),
                h("p", { className: "form-hint quantity-hint" }, "How much the card +/− buttons change each tap."),
                h("label", { className: "full" },
                    "Category",
                    h("select", { value: newItem.categoryId, onChange: e => setNewItem({ ...newItem, categoryId: e.target.value }) },
                        h("option", { value: "" }, "Unsorted"),
                        state.categories.map(c => h("option", { value: c.id, key: c.id }, c.name)))),
                h("div", { className: "status-picker full" }, statusButtons.map(({ status, label, icon: Icon }) => h("button", { type: "button", key: status, className: hasStatus(newItem, status) ? `active ${status}` : "", onClick: () => setNewItem({ ...newItem, statuses: toggleItemStatus(newItem, status) }), "aria-pressed": hasStatus(newItem, status) },
                    h(Icon, null),
                    label))),
                h("p", { className: "form-hint full" }, "Choose any that apply. No selection means ready/unopened."),
                h("button", { className: "primary-button full", type: "submit" },
                    h(PackagePlus, null),
                    "Add ingredient"))),
        editingItem && h(Modal, { title: "Edit ingredient", onClose: () => setEditingItem(null) },
            h("form", { className: "form-grid", onSubmit: saveStockEdit },
                h("label", { className: "full" },
                    "Ingredient",
                    h("input", { autoFocus: true, value: editingItem.name, onChange: e => setEditingItem({ ...editingItem, name: e.target.value }), placeholder: "e.g. Chickpeas" })),
                h("label", null,
                    "Quantity",
                    h("input", { type: "number", min: "0", step: "0.5", value: editingItem.quantity, onChange: e => setEditingItem({ ...editingItem, quantity: Number(e.target.value) }) })),
                h("label", null,
                    "Unit",
                    h("input", { value: editingItem.unit, onChange: e => setEditingItem({ ...editingItem, unit: e.target.value }), placeholder: "pack, L, can…" })),
                h("label", null,
                    "+/− amount",
                    h("input", { type: "number", min: "0.001", step: "any", value: editingItem.increment, onChange: e => setEditingItem({ ...editingItem, increment: Number(e.target.value) }) })),
                h("p", { className: "form-hint quantity-hint" }, "Used by the stock card +/− buttons. Metric units are converted automatically when a recipe uses g/kg or ml/L."),
                h("label", { className: "full" },
                    "Category",
                    h("select", { value: editingItem.categoryId || "", onChange: e => setEditingItem({ ...editingItem, categoryId: e.target.value }) },
                        h("option", { value: "" }, "Unsorted"),
                        state.categories.map(c => h("option", { value: c.id, key: c.id }, c.name)))),
                h("div", { className: "status-picker full" }, statusButtons.map(({ status, label, icon: Icon }) => h("button", { type: "button", key: status, className: hasStatus(editingItem, status) ? `active ${status}` : "", onClick: () => setEditingItem({ ...editingItem, quantity: editingItem.quantity || 1, statuses: toggleItemStatus(editingItem, status) }), "aria-pressed": hasStatus(editingItem, status) },
                    h(Icon, null),
                    label))),
                h("p", { className: "form-hint full" }, "Choose any that apply; statuses can stack. Set quantity to 0 to mark this ingredient out of stock."),
                h("button", { className: "primary-button full", type: "submit" },
                    h(Pencil, null),
                    "Save changes"),
                h("div", { className: "edit-danger full" },
                    h("button", { type: "button", className: "danger-link", onClick: deleteStockItem }, h(Trash2, null), "Delete ingredient"),
                    h("small", null, "Deletion is kept here to avoid accidental taps on stock cards.")))),
        showRecipeImport && h(Modal, { title: "Import recipe", onClose: () => setShowRecipeImport(false), wide: true },
            h("div", { className: "recipe-import-modal" },
                h("p", null, "Paste the full Mise AI reply. The current JSON format is preferred, and older === RECIPE === replies are still supported."),
                h("textarea", { autoFocus: true, value: recipeDraft, onChange: e => setRecipeDraft(e.target.value), placeholder: '{\n  "format": "mise-ai-v1",\n  "recipes": [\n    {\n      "title": "Tomato pesto pasta",\n      "mode": "Fast",\n      "ingredients": [{"source":"stock","name":"Pasta","quantity":100,"unit":"g"}],\n      "steps": ["Cook the pasta until al dente."]\n    }\n  ]\n}' }),
                h("div", { className: "modal-actions" },
                    h("button", { className: "soft-button", onClick: () => setShowRecipeImport(false) }, "Cancel"),
                    h("button", { className: "primary-button", onClick: saveRecipe, disabled: !recipeDraft.trim() }, h(BookOpen, null), "Import")))),
        recipeEditorRecipe !== null && h(RecipeEditorModal, { recipe: recipeEditorRecipe?.id ? recipeEditorRecipe : null, stock: state.stock, categories: state.categories, onClose: () => setRecipeEditorRecipe(null), onSave: saveManualRecipe }),
        selectedRecipe && h(RecipeDetail, { recipe: selectedRecipe, state, onClose: () => setSelectedRecipeId(null), onShop: name => addToShopping(name, "recipe"), onCook: () => cookRecipe(selectedRecipe), onEdit: () => { setSelectedRecipeId(null); setRecipeEditorRecipe(selectedRecipe); }, onDelete: () => deleteRecipe(selectedRecipe) }),
        showSettings && h(SettingsModal, { state: state, setState: setState, onClose: () => setShowSettings(false), exportData: exportData, importRef: importRef, restoreData: restoreData, notify: notify, onTransfer: () => { setShowSettings(false); setShowTransfer(true); }, onHelp: () => { setShowSettings(false); setShowHelp(true); }, onEditPromptDefaults: () => { setShowSettings(false); setShowPromptDefaults(true); } }),
        showTransfer && h(TransferModal, { state, onClose: () => setShowTransfer(false), notify, onReceive: payload => { setShowTransfer(false); setIncomingTransfer(payload); } }),
        incomingTransfer && h(TransferImportModal, { payload: incomingTransfer, onApply: options => applyIncomingTransfer(incomingTransfer, options), onClose: dismissIncomingTransfer }),
        toast && h("div", { className: "toast", role: "status", "aria-live": "polite" },
            h(Check, null),
            toast));
}
function NavButton({ active, onClick, icon, label, count }) { return h("button", { className: active ? "active" : "", onClick: onClick, "aria-current": active ? "page" : undefined },
    icon,
    h("span", null, label),
    count ? h("b", null, count) : null); }
function Insight({ icon, label, value, meta }) { return h("article", { className: "insight-card" },
    h("span", null, icon),
    h("div", null,
        h("small", null, label),
        h("b", null, value),
        h("p", null, meta))); }
function Empty({ icon, title, text }) { return h("div", { className: "empty" },
    icon,
    h("h3", null, title),
    h("p", null, text)); }
function StockCard({ item, state, onAdjust, onStatus, onShop, onEdit }) {
    const category = state.categories.find(c => c.id === item.categoryId);
    const recipes = usageCount(item.name, state.recipes);
    const shoppingAdds = analyticsFor(state, item.name).shoppingAdds;
    const inShopping = state.shopping.some(shoppingItem => shoppingItem.stockId === item.id || matchesName(shoppingItem.name, item.name));
    return h("article", { className: `stock-card ${item.quantity === 0 ? "out" : ""}`, style: { "--category": category?.color || "#92958d" } },
        h("div", { className: "stock-card-top" },
            h("span", { className: "category-mark", style: { "--category": category?.color || "#92958d" } },
                category ? h(CategoryGlyph, { category, size: 18 }) : h(ArchiveRestore, { size: 18 })),
            h("div", { className: "status-actions" }, statusButtons.map(({ status, label, icon: Icon }) => h("button", { key: status, className: hasStatus(item, status) ? `active ${status}` : "", onClick: () => onStatus(item.id, status), "aria-pressed": hasStatus(item, status), "aria-label": `${label} ${item.name}`, title: label },
                h(Icon, null))))),
        h("div", { className: "stock-name" },
            h("h3", null, item.name),
            h("p", null,
                category?.name || "Unsorted",
                item.quantity === 0 ? " · Out of stock" : statusText(item).length ? ` · ${statusText(item).map(label => label.replace(/^./, char => char.toUpperCase())).join(" · ")}` : "")),
        (recipes > 0 || shoppingAdds > 0) && h("div", { className: "micro-signals" },
            recipes > 0 && h("span", null, h(BookOpen, null), recipes, " recipe", recipes === 1 ? "" : "s"),
            shoppingAdds > 0 && h("span", null, h(History, null), "bought ", shoppingAdds, "×")),
        h("div", { className: "stock-card-bottom" },
            h(Stepper, { value: item.quantity, label: `${item.name}; changes by ${formatQuantity(itemIncrement(item))} ${item.unit || "units"}`, onMinus: () => onAdjust(item.id, -1), onPlus: () => onAdjust(item.id, 1) }),
            h("small", null, item.unit),
            h("div", { className: "card-actions" },
                h("button", { className: `shopping-card-button ${inShopping ? "active" : ""}`, onClick: onShop, title: inShopping ? "Already on shopping list — add another" : "Add to shopping", "aria-label": inShopping ? `${item.name} is on the shopping list; add another` : `Add ${item.name} to shopping`, "aria-pressed": inShopping }, h(ShoppingBasket, null)),
                h("button", { className: "edit-stock-button", onClick: onEdit, title: "Edit ingredient", "aria-label": `Edit ${item.name}` }, h(Pencil, null)))));
}
function ShoppingRow({ item, stockItem, onCheck, onAdjust, onUnitChange, onStock, onAdd, onDelete }) {
    const unit = String(item.unit || stockItem?.unit || "");
    return h("article", { className: `shopping-row ${item.checked ? "checked" : ""} ${stockItem ? "linked-stock" : "new-product"}` },
        h("button", { className: "check-button", onClick: onCheck, "aria-label": item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`, "aria-pressed": item.checked }, item.checked && h(Check, null)),
        h("div", { className: "shopping-name" },
            h("b", null, item.name),
            h("small", null,
                h("span", { className: `stock-link-badge ${stockItem ? "linked" : "unlinked"}` }, stockItem ? "In stock" : "Not in stock"),
                " · ", item.source, " · ", timeLabel(item.addedAt))),
        h("div", { className: "shopping-quantity" },
            h(Stepper, { value: item.quantity, label: `${item.name}${unit ? ` in ${unit}` : ""}`, onMinus: () => onAdjust(-1), onPlus: () => onAdjust(1) }),
            h("input", { className: "shopping-unit-input", value: item.unit || "", onChange: event => onUnitChange(event.target.value), placeholder: stockItem?.unit || "unit", "aria-label": `${item.name} shopping unit` })),
        h("button", { className: `stock-button ${stockItem ? "restock" : "add-product"}`, onClick: stockItem ? onStock : onAdd, title: stockItem ? `Add purchased ${item.name} to existing stock` : `Create ${item.name} in stock` },
            stockItem ? h(PackageCheck, null) : h(PackagePlus, null),
            stockItem ? "Restock" : "Add"),
        h("button", { className: "icon-button delete", onClick: onDelete, "aria-label": `Delete ${item.name}` },
            h(Trash2, null)));
}
function RecipeEditorModal({ recipe, stock, categories, onClose, onSave }) {
    const [draft, setDraft] = useState(() => ({
        id: recipe?.id || null,
        title: recipe?.title || "",
        mode: recipe?.mode || "",
        cuisine: recipe?.cuisine || "",
        tagsText: (recipe?.tags || []).join(", "),
        servings: recipe?.servings ?? 1,
        activeMinutes: recipe?.activeMinutes ?? "",
        totalMinutes: recipe?.totalMinutes ?? "",
        leadTime: recipe?.leadTime || "none",
        ingredients: linkRecipeIngredientsToStock(recipe || { ingredients: [] }, stock),
        steps: Array.isArray(recipe?.steps) ? recipe.steps.map(String) : [""] ,
        createdAt: recipe?.createdAt || null,
        timesCooked: recipe?.timesCooked || 0,
        lastCookedAt: recipe?.lastCookedAt || null
    }));
    const [stockQuery, setStockQuery] = useState("");
    const [error, setError] = useState("");
    const categoryById = Object.fromEntries((categories || []).map(category => [category.id, category]));
    const chosenStockIds = new Set((draft.ingredients || []).map(item => item.stockId).filter(Boolean));
    const visibleStock = [...(stock || [])]
        .filter(item => !stockQuery.trim() || normalise(`${item.name} ${categoryById[item.categoryId]?.name || ""}`).includes(normalise(stockQuery)))
        .sort((a, b) => (Number(b.quantity > 0) - Number(a.quantity > 0)) || a.name.localeCompare(b.name));
    const patchIngredient = (index, patch) => setDraft(current => ({ ...current, ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
    const removeIngredient = index => setDraft(current => ({ ...current, ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index) }));
    const addStockIngredient = item => {
        if (chosenStockIds.has(item.id)) return;
        setDraft(current => ({
            ...current,
            ingredients: [...current.ingredients, { source: "stock", stockId: item.id, name: item.name, quantity: null, unit: item.unit || "", amountText: "" }]
        }));
        setError("");
    };
    const addOtherIngredient = () => {
        setDraft(current => ({ ...current, ingredients: [...current.ingredients, { source: "buy", stockId: null, name: "", quantity: null, unit: "", amountText: "" }] }));
        setError("");
    };
    const patchStep = (index, value) => setDraft(current => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? value : step) }));
    const removeStep = index => setDraft(current => ({ ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) }));
    const addStep = () => setDraft(current => ({ ...current, steps: [...current.steps, ""] }));
    const save = event => {
        event?.preventDefault?.();
        const ingredients = (draft.ingredients || []).map(item => ({
            ...item,
            name: String(item.name || "").trim(),
            quantity: item.quantity === "" || item.quantity == null ? null : Math.max(0, Number(item.quantity) || 0),
            unit: String(item.unit || "").trim(),
            amountText: ""
        })).filter(item => item.name);
        const steps = (draft.steps || []).map(step => String(step || "").trim()).filter(Boolean);
        if (!draft.title.trim()) { setError("Give the recipe a name."); return; }
        if (!ingredients.length) { setError("Add at least one ingredient."); return; }
        if (!steps.length) { setError("Add at least one method step."); return; }
        onSave({
            id: draft.id,
            title: draft.title.trim(),
            mode: draft.mode,
            cuisine: draft.cuisine,
            tags: draft.tagsText.split(/[,;]+/).map(tag => tag.trim()).filter(Boolean),
            servings: draft.servings,
            activeMinutes: draft.activeMinutes,
            totalMinutes: draft.totalMinutes,
            leadTime: draft.leadTime,
            ingredients,
            steps,
            createdAt: draft.createdAt,
            timesCooked: draft.timesCooked,
            lastCookedAt: draft.lastCookedAt
        });
    };
    return h(Modal, { title: recipe?.id ? "Edit recipe" : "New recipe", onClose, wide: true },
        h("form", { className: "recipe-editor", onSubmit: save },
            h("div", { className: "recipe-editor-basics" },
                h("label", { className: "recipe-editor-title" }, h("span", null, "Recipe name"), h("input", { autoFocus: true, value: draft.title, onChange: event => setDraft({ ...draft, title: event.target.value }), placeholder: "e.g. Crispy mushroom rice" })),
                h("label", null, h("span", null, "Style / mode"), h("input", { value: draft.mode, onChange: event => setDraft({ ...draft, mode: event.target.value }), placeholder: "Fast, Medium, Prep ahead…" })),
                h("label", null, h("span", null, "Cuisine"), h("input", { value: draft.cuisine, onChange: event => setDraft({ ...draft, cuisine: event.target.value }), placeholder: "Italian, Japanese, mixed…" })),
                h("label", null, h("span", null, "Servings"), h("input", { type: "number", min: "1", step: "1", value: draft.servings, onChange: event => setDraft({ ...draft, servings: event.target.value }) })),
                h("label", null, h("span", null, "Active minutes"), h("input", { type: "number", min: "0", step: "1", value: draft.activeMinutes, onChange: event => setDraft({ ...draft, activeMinutes: event.target.value }) })),
                h("label", null, h("span", null, "Total minutes"), h("input", { type: "number", min: "0", step: "1", value: draft.totalMinutes, onChange: event => setDraft({ ...draft, totalMinutes: event.target.value }) })),
                h("label", null, h("span", null, "Lead time"), h("input", { value: draft.leadTime, onChange: event => setDraft({ ...draft, leadTime: event.target.value }), placeholder: "none, overnight, 24 hours…" })),
                h("label", { className: "recipe-editor-tags" }, h("span", null, "Tags"), h("input", { value: draft.tagsText, onChange: event => setDraft({ ...draft, tagsText: event.target.value }), placeholder: "quick, freezer, spicy" }))),
            h("div", { className: "recipe-editor-grid" },
                h("section", { className: "recipe-editor-section ingredient-editor" },
                    h("div", { className: "recipe-editor-section-head" },
                        h("div", null, h("span", { className: "eyebrow" }, h(ListChecks, null), " INGREDIENTS"), h("h3", null, "What goes in it")),
                        h("button", { type: "button", className: "soft-button compact-button", onClick: addOtherIngredient }, h(Plus, null), "Other ingredient")),
                    h("p", { className: "recipe-editor-help" }, "Ingredients selected from Stock stay linked to that exact product, even if you rename it later."),
                    h("div", { className: "ingredient-editor-list" }, draft.ingredients.length ? draft.ingredients.map((ingredient, index) => {
                        const linked = ingredient.stockId ? stock.find(item => item.id === ingredient.stockId) : null;
                        return h("div", { className: `ingredient-editor-row ${linked ? "linked" : "external"}`, key: `${ingredient.stockId || "other"}-${index}` },
                            h("div", { className: "ingredient-editor-name" },
                                h("span", { className: `ingredient-source-badge ${linked ? "stock" : "buy"}` }, linked ? "Stock" : "Other"),
                                linked ? h("div", null, h("b", null, linked.name), h("small", null, `${formatQuantity(linked.quantity)}${linked.unit ? ` ${linked.unit}` : ""} currently in stock`)) : h("input", { value: ingredient.name, onChange: event => patchIngredient(index, { name: event.target.value }), placeholder: "Ingredient name", "aria-label": `Ingredient ${index + 1} name` })),
                            h("label", null, h("span", null, "Amount"), h("input", { type: "number", min: "0", step: "any", value: ingredient.quantity ?? "", onChange: event => patchIngredient(index, { quantity: event.target.value === "" ? null : Number(event.target.value) }), placeholder: "—", "aria-label": `${ingredient.name || `Ingredient ${index + 1}`} amount` })),
                            h("label", null, h("span", null, "Unit"), h("input", { value: ingredient.unit || "", onChange: event => patchIngredient(index, { unit: event.target.value }), placeholder: linked?.unit || "unit", "aria-label": `${ingredient.name || `Ingredient ${index + 1}`} unit` })),
                            h("button", { type: "button", className: "icon-button ingredient-remove", onClick: () => removeIngredient(index), title: "Remove ingredient", "aria-label": `Remove ${ingredient.name || "ingredient"}` }, h(X, null)));
                    }) : h("div", { className: "recipe-editor-empty" }, "Choose ingredients from your stock list, or add an ingredient you need to buy."))),
                h("aside", { className: "recipe-stock-picker" },
                    h("div", { className: "recipe-editor-section-head" }, h("div", null, h("span", { className: "eyebrow" }, h(Box, null), " YOUR STOCK"), h("h3", null, "Pick an ingredient"))),
                    h("label", { className: "recipe-stock-search" }, h(Search, null), h("input", { value: stockQuery, onChange: event => setStockQuery(event.target.value), placeholder: "Search stock…", "aria-label": "Search stock ingredients" }), stockQuery ? h("button", { type: "button", onClick: () => setStockQuery(""), "aria-label": "Clear stock search" }, h(X, null)) : null),
                    h("div", { className: "recipe-stock-scroll" }, visibleStock.length ? visibleStock.map(item => {
                        const category = categoryById[item.categoryId];
                        const selected = chosenStockIds.has(item.id);
                        return h("button", { type: "button", className: `recipe-stock-option ${selected ? "selected" : ""}`, key: item.id, onClick: () => addStockIngredient(item), disabled: selected },
                            h(CategoryGlyph, { category, size: 15 }),
                            h("span", null, h("b", null, item.name), h("small", null, category?.name || "Unsorted")),
                            h("strong", null, selected ? "Added" : `${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`),
                            selected ? h(Check, null) : h(Plus, null));
                    }) : h("div", { className: "recipe-editor-empty" }, "No stock items match that search.")))),
            h("section", { className: "recipe-editor-section method-editor" },
                h("div", { className: "recipe-editor-section-head" },
                    h("div", null, h("span", { className: "eyebrow" }, h(ListOrdered, null), " METHOD"), h("h3", null, "Steps")),
                    h("button", { type: "button", className: "soft-button compact-button", onClick: addStep }, h(Plus, null), "Add step")),
                h("div", { className: "method-editor-list" }, draft.steps.map((step, index) => h("div", { className: "method-editor-row", key: index },
                    h("span", null, index + 1),
                    h("textarea", { value: step, rows: 2, onChange: event => patchStep(index, event.target.value), placeholder: `Step ${index + 1}` }),
                    h("button", { type: "button", className: "icon-button", onClick: () => removeStep(index), disabled: draft.steps.length === 1, "aria-label": `Remove step ${index + 1}` }, h(X, null)))))),
            error ? h("p", { className: "form-error recipe-editor-error" }, error) : null,
            h("div", { className: "modal-actions recipe-editor-actions" },
                h("button", { type: "button", className: "soft-button", onClick: onClose }, "Cancel"),
                h("button", { type: "submit", className: "primary-button" }, h(Check, null), recipe?.id ? "Save changes" : "Save recipe"))));
}

function RecipeCard({ recipe, state, onOpen }) {
    const availability = recipeAvailability(recipe, state.stock);
    const tags = (recipe.tags || []).slice(0, 4);
    const time = Number(recipe.totalMinutes) || Number(recipe.activeMinutes) || null;
    const availabilityText = availability.ready ? "Ready now" : availability.missing.length ? `${availability.missing.length} missing` : availability.short.length ? `${availability.short.length} short` : "Check stock";
    return h("button", { className: "recipe-card recipe-card-button", onClick: onOpen, "aria-label": `Open ${recipe.title}` },
        h("div", { className: "recipe-card-top" },
            h("span", { className: `availability ${availability.ready ? "ready" : "missing"}` }, availability.ready ? h(Check, null) : h(ShoppingBasket, null), availabilityText),
            recipe.timesCooked ? h("span", { className: "cooked-count" }, h(Utensils, null), recipe.timesCooked, "×") : null),
        h("h2", null, recipe.title),
        h("div", { className: "recipe-meta" },
            time ? h("span", null, h(Clock3, null), time, " min") : null,
            recipe.servings ? h("span", null, h(Users, null), recipe.servings, recipe.servings === 1 ? " serving" : " servings") : null,
            recipe.cuisine ? h("span", null, h(Globe2, null), recipe.cuisine) : null),
        tags.length ? h("div", { className: "recipe-tags" }, tags.map(tag => h("span", { key: tag }, tag))) : null,
        h("div", { className: "coverage", "aria-label": `${availability.pct}% of ingredients available` }, h("span", { style: { width: `${availability.pct}%` } })),
        h("div", { className: "recipe-card-foot" },
            h("small", null, availability.ready ? "Everything is in stock" : `${availability.matched.length}/${availability.total} ingredients ready`),
            h(ChevronRight, null)));
}

function RecipeDetail({ recipe, state, onClose, onShop, onCook, onEdit, onDelete }) {
    const availability = recipeAvailability(recipe, state.stock);
    const tags = recipe.tags || [];
    const missingNames = [...availability.missing, ...availability.short];
    return h(Modal, { title: recipe.title, onClose, wide: true },
        h("article", { className: "recipe-detail" },
            h("div", { className: "recipe-detail-summary" },
                h("div", { className: "recipe-detail-meta" },
                    h("span", { className: `availability ${availability.ready ? "ready" : "missing"}` }, availability.ready ? h(Check, null) : h(ShoppingBasket, null), availability.ready ? "Ready now" : `${missingNames.length} ingredient${missingNames.length === 1 ? "" : "s"} need attention`),
                    recipe.totalMinutes || recipe.activeMinutes ? h("span", null, h(Clock3, null), recipe.activeMinutes ? `${recipe.activeMinutes} active` : null, recipe.activeMinutes && recipe.totalMinutes ? " · " : null, recipe.totalMinutes ? `${recipe.totalMinutes} min total` : null) : null,
                    recipe.servings ? h("span", null, h(Users, null), recipe.servings, recipe.servings === 1 ? " serving" : " servings") : null,
                    recipe.leadTime && normalise(recipe.leadTime) !== "none" ? h("span", null, h(CalendarClock, null), recipe.leadTime, " lead time") : null,
                    recipe.cuisine ? h("span", null, h(Globe2, null), recipe.cuisine) : null),
                tags.length ? h("div", { className: "recipe-tags" }, tags.map(tag => h("span", { key: tag }, tag))) : null),
            h("div", { className: "recipe-detail-grid" },
                h("section", { className: "recipe-ingredients" },
                    h("div", { className: "recipe-section-title" }, h(ListChecks, null), h("h3", null, "Ingredients")),
                    h("div", { className: "ingredient-list" }, availability.entries.map((entry, index) => {
                        const ingredient = entry.ingredient;
                        const stateIcon = entry.state === "available" ? h(Check, null) : entry.state === "short" ? h(TriangleAlert, null) : h(ShoppingBasket, null);
                        const stockNote = entry.item ? `${formatQuantity(entry.item.quantity)}${entry.item.unit ? ` ${entry.item.unit}` : ""} in stock` : "Not in stock";
                        return h("div", { className: `ingredient-row ${entry.state}`, key: `${ingredient.name}-${index}` },
                            h("span", { className: "ingredient-state" }, stateIcon),
                            h("div", null, h("b", null, ingredient.name), h("small", null, stockNote)),
                            h("strong", null, amountLabel(ingredient) || "as needed"),
                            entry.state !== "available" ? h("button", { className: "ingredient-shop", onClick: () => onShop(ingredient.name), title: "Add to shopping", "aria-label": `Add ${ingredient.name} to shopping` }, h(Plus, null)) : null);
                    }))),
                h("section", { className: "recipe-method" },
                    h("div", { className: "recipe-section-title" }, h(ListOrdered, null), h("h3", null, "Method")),
                    recipe.steps?.length ? h("div", { className: "recipe-steps" }, recipe.steps.map((step, index) => h("div", { className: "recipe-step", key: index }, h("span", null, index + 1), h("p", null, step)))) : h("div", { className: "recipe-legacy-text" }, h("p", null, "This older recipe did not include structured steps."), recipe.text ? h("pre", null, recipe.text) : null))),
            h("div", { className: "recipe-detail-actions" },
                h("button", { className: "soft-button", onClick: onEdit }, h(Pencil, null), "Edit recipe"),
                missingNames.length ? h("button", { className: "soft-button", onClick: () => missingNames.forEach(onShop) }, h(ShoppingBasket, null), "Add missing to shopping") : null,
                h("button", { className: "primary-button cooked-button", onClick: onCook }, h(Check, null), "I did this")),
            h("div", { className: "recipe-history" }, recipe.lastCookedAt ? `Cooked ${recipe.timesCooked || 1}× · last ${timeLabel(recipe.lastCookedAt)}` : "Not cooked yet in Mise"),
            h("div", { className: "recipe-danger" }, h("button", { className: "danger-link", onClick: onDelete }, h(Trash2, null), "Delete recipe"))));
}
const transferSectionOptions = [
    { id: "stock", label: "Stock", description: "Ingredients, quantities, units and statuses", Icon: Box },
    { id: "categories", label: "Categories", description: "Names, colours and category icons", Icon: Tags },
    { id: "recipes", label: "Recipes", description: "Saved recipes and their cook counts", Icon: BookOpen },
    { id: "shopping", label: "Shopping", description: "Current shopping list and quantities", Icon: ShoppingBasket },
    { id: "prompt", label: "Cooking prompt", description: "Your customised default AI prompt", Icon: Bot },
    { id: "history", label: "History & insights", description: "Restock analytics and activity history", Icon: History }
];
function TransferSectionPicker({ selected, available = TRANSFER_SECTION_KEYS, onChange }) {
    const allowed = new Set(available);
    const toggle = id => {
        if (!allowed.has(id)) return;
        onChange(selected.includes(id) ? selected.filter(key => key !== id) : [...selected, id]);
    };
    return h("div", { className: "transfer-section-picker" }, transferSectionOptions.filter(option => allowed.has(option.id)).map(({ id, label, description, Icon }) => h("button", {
        type: "button", key: id, className: selected.includes(id) ? "active" : "", onClick: () => toggle(id), "aria-pressed": selected.includes(id)
    }, h("span", { className: "transfer-section-icon" }, h(Icon, null)), h("span", null, h("b", null, label), h("small", null, description)), h("span", { className: "transfer-section-check" }, selected.includes(id) ? h(Check, null) : null))));
}
function TransferModePicker({ value, onChange, compact = false }) {
    return h("div", { className: `transfer-mode-picker ${compact ? "compact" : ""}`, role: "group", "aria-label": "Transfer import mode" },
        h("button", { type: "button", className: value === "merge" ? "active" : "", onClick: () => onChange("merge") }, h(GitMerge, null), h("span", null, h("b", null, "Merge"), h("small", null, "Update matches, add new, keep receiver-only data"))),
        h("button", { type: "button", className: value === "replace" ? "active replace" : "", onClick: () => onChange("replace") }, h(ArchiveRestore, null), h("span", null, h("b", null, "Replace selected"), h("small", null, "Make checked sections match the sender"))));
}
function TransferModal({ state, onClose, notify, onReceive }) {
    const [sections, setSections] = useState([...TRANSFER_SECTION_KEYS]);
    const [preferredMode, setPreferredMode] = useState("merge");
    const [bundle, setBundle] = useState(null);
    const [error, setError] = useState("");
    const [qrError, setQrError] = useState("");
    const qrRef = useRef(null);
    const fileRef = useRef(null);
    const sectionKey = sections.join("|");
    useEffect(() => {
        let cancelled = false;
        setBundle(null);
        setError("");
        if (!sections.length) { setError("Choose at least one type of data to send."); return () => { cancelled = true; }; }
        makeTransferBundle(state, sections, preferredMode).then(value => { if (!cancelled) setBundle(value); }).catch(() => { if (!cancelled) setError("Could not prepare this transfer on this browser."); });
        return () => { cancelled = true; };
    }, [state, sectionKey, preferredMode]);
    useEffect(() => {
        if (!bundle?.linkSafe || !bundle.link || !qrRef.current) return;
        qrRef.current.replaceChildren();
        setQrError("");
        try {
            if (typeof QRCode !== "function") throw new Error("QR library unavailable");
            new QRCode(qrRef.current, { text: bundle.link, width: 232, height: 232, colorDark: "#1d211c", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
        }
        catch { setQrError("QR creation failed on this browser. Use the transfer file instead."); }
    }, [bundle?.link, bundle?.linkSafe]);
    const copyLink = async () => {
        if (!bundle?.linkSafe) return;
        try { await navigator.clipboard.writeText(bundle.link); notify("Transfer link copied"); }
        catch { window.prompt("Copy this transfer link:", bundle.link); }
    };
    const shareLink = async () => {
        if (!bundle?.linkSafe) return;
        if (navigator.share) {
            try { await navigator.share({ title: "Mise data transfer", text: "Open this in Mise to import the selected data.", url: bundle.link }); return; }
            catch (err) { if (err?.name === "AbortError") return; }
        }
        copyLink();
    };
    const downloadFile = () => {
        if (!bundle?.fileText) return;
        const blob = new Blob([bundle.fileText], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = transferFileName();
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 500);
        notify("Transfer file downloaded");
    };
    const shareFile = async () => {
        if (!bundle?.fileText) return;
        try {
            const file = new File([bundle.fileText], transferFileName(), { type: "application/json" });
            if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
                try { await navigator.share({ title: "Mise data transfer", text: "Import this selected Mise data on the other device.", files: [file] }); return; }
                catch (err) { if (err?.name === "AbortError") return; }
            }
        }
        catch { }
        downloadFile();
    };
    const receiveFile = async event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try { onReceive(await decodeTransferFile(file)); }
        catch { notify("That Mise transfer file is not valid"); }
    };
    const fileSize = bundle?.fileBytes ? `${Math.max(1, Math.round(bundle.fileBytes / 1024))} KB` : "";
    return h(Modal, { title: "Transfer data", onClose, wide: true },
        h("div", { className: "transfer-layout" },
            h("section", { className: "transfer-explainer" },
                h("span", { className: "eyebrow" }, h(Smartphone, null), " CHOOSE WHAT TRAVELS"),
                h("h3", null, "Send only what you want"),
                h("p", null, "Choose the parts of Mise to include. The receiving device can narrow this selection again before importing."),
                h("div", { className: "transfer-select-actions" },
                    h("button", { type: "button", onClick: () => setSections([...TRANSFER_SECTION_KEYS]) }, "Select all"),
                    h("button", { type: "button", onClick: () => setSections([]) }, "Clear")),
                h(TransferSectionPicker, { selected: sections, onChange: setSections }),
                h("div", { className: "transfer-mode-heading" }, h("b", null, "Suggested import behaviour"), h("small", null, "The receiver can still change this.")),
                h(TransferModePicker, { value: preferredMode, onChange: setPreferredMode, compact: true }),
                preferredMode === "replace" ? h("div", { className: "transfer-replace-warning" }, h(TriangleAlert, null), h("p", null, "Replace selected can remove receiver-only records inside the selected sections. Unselected sections are never touched.")) : null,
                h("div", { className: "transfer-privacy" }, h(ShieldCheck, null), h("p", null, "Small snapshots can use QR/link. Larger ones automatically use a .mise file. Transfer data stays local until you share it."))),
            h("section", { className: "transfer-code-panel" },
                !bundle && !error ? h("div", { className: "transfer-loading" }, h(QrCode, null), "Preparing transfer…") : null,
                error ? h("div", { className: "transfer-error" }, h(TriangleAlert, null), error) : null,
                bundle ? h(Fragment, null,
                    h("div", { className: "transfer-export-summary" }, h("b", null, `${sections.length} section${sections.length === 1 ? "" : "s"} selected`), h("small", null, preferredMode === "merge" ? "Suggested: merge" : "Suggested: replace selected")),
                    bundle.linkSafe ? h(Fragment, null,
                        h("div", { className: `qr-shell ${qrError ? "qr-unavailable" : ""}` }, h("div", { ref: qrRef, className: "qr-code", "aria-label": "Mise transfer QR code" }), qrError ? h("p", null, qrError) : null),
                        h("label", { className: "transfer-link-field" }, h("span", null, "Transfer link"), h("textarea", { value: bundle.link, readOnly: true, rows: 3, onFocus: event => event.target.select() })),
                        h("div", { className: "transfer-actions" },
                            h("button", { className: "primary-button", onClick: copyLink }, h(Copy, null), "Copy link"),
                            h("button", { className: "soft-button", onClick: shareLink }, h(Share2, null), "Share link"))) :
                        h("div", { className: "transfer-too-large" }, h(TriangleAlert, null), h("div", null, h("b", null, "Too much data for a reliable QR/link"), h("p", null, `This selected snapshot is ${fileSize}. Use the transfer file instead.`))),
                    h("div", { className: "transfer-file-actions" },
                        h("button", { className: bundle.linkSafe ? "soft-button" : "primary-button", onClick: shareFile }, h(Share2, null), "Share transfer file"),
                        h("button", { className: "soft-button", onClick: downloadFile }, h(HardDriveDownload, null), "Download transfer file"))) : null,
                h("div", { className: "transfer-receive" },
                    h("div", null, h("b", null, "Importing on this device?"), h("p", null, "Choose a .mise file. You will pick Merge/Replace and the exact sections before anything changes.")),
                    h("button", { className: "soft-button", onClick: () => fileRef.current?.click() }, h(Upload, null), "Import transfer file"),
                    h("input", { ref: fileRef, hidden: true, type: "file", accept: ".mise,application/json,.json", onChange: receiveFile })))));
}

function TransferImportModal({ payload, onApply, onClose }) {
    const available = normaliseTransferSections(payload.sections, []);
    const [selected, setSelected] = useState([...available]);
    const [mode, setMode] = useState(payload.preferredMode === "replace" ? "replace" : "merge");
    const incoming = payload.state;
    const created = payload.createdAt ? new Date(payload.createdAt).toLocaleString() : "another device";
    const countFor = id => id === "stock" ? incoming.stock?.length || 0 : id === "categories" ? incoming.categories?.length || 0 : id === "recipes" ? incoming.recipes?.length || 0 : id === "shopping" ? incoming.shopping?.length || 0 : id === "prompt" ? (incoming.promptTemplate ? 1 : 0) : id === "history" ? ((incoming.activity?.length || 0) + Object.keys(incoming.analytics || {}).length) : 0;
    return h(Modal, { title: "Import Mise data", onClose, wide: true },
        h("div", { className: "transfer-import fine-tune" },
            h("div", { className: "transfer-import-icon" }, mode === "merge" ? h(GitMerge, null) : h(ArchiveRestore, null)),
            h("div", null,
                h("span", { className: "eyebrow" }, "INCOMING SNAPSHOT"),
                h("h3", null, mode === "merge" ? "Merge selected data" : "Replace selected data"),
                h("p", null, `Created ${created}. Choose exactly what this device should accept.`)),
            h("div", { className: "transfer-import-controls" },
                h("div", { className: "transfer-mode-heading" }, h("b", null, "How should it import?")),
                h(TransferModePicker, { value: mode, onChange: setMode }),
                mode === "replace" ? h("div", { className: "transfer-replace-warning" }, h(TriangleAlert, null), h("p", null, "Replace selected deletes receiver-only records inside the checked sections so those sections match the sender. Everything unchecked stays untouched.")) : h("div", { className: "transfer-merge-note" }, h(ShieldCheck, null), h("p", null, "Merge updates matching names, adds new records, and keeps receiver-only records.")),
                h("div", { className: "transfer-mode-heading" }, h("b", null, "What should be imported?"), h("small", null, `${selected.length} of ${available.length} selected`)),
                h(TransferSectionPicker, { selected, available, onChange: setSelected }),
                h("div", { className: "transfer-import-counts" }, transferSectionOptions.filter(option => available.includes(option.id)).map(({ id, label, Icon }) => h("span", { key: id, className: selected.includes(id) ? "active" : "" }, h(Icon, null), h("b", null, countFor(id)), h("small", null, label))))),
            h("div", { className: "modal-actions" },
                h("button", { className: "soft-button", onClick: onClose }, "Cancel"),
                h("button", { className: "primary-button", disabled: !selected.length, onClick: () => onApply({ mode, sections: selected }) }, mode === "merge" ? h(GitMerge, null) : h(ArchiveRestore, null), mode === "merge" ? "Merge selected" : "Replace selected"))));
}

function InstallHelpModal({ onClose, isiOS }) {
    return h(Modal, { title: "Install Mise", onClose },
        h("div", { className: "install-help" },
            h("div", { className: "install-help-icon" }, h(Smartphone, null)),
            isiOS ? h(Fragment, null,
                h("p", null, "On iPhone or iPad, Mise is installed from the browser's Share menu."),
                h("ol", null,
                    h("li", null, "Open Mise in Safari."),
                    h("li", null, "Tap the Share button."),
                    h("li", null, "Choose Add to Home Screen."),
                    h("li", null, "Tap Add."))) : h(Fragment, null,
                h("p", null, "Your browser is not offering the automatic install prompt right now."),
                h("p", null, "Look in the browser menu for Install app, Add to Home screen, or a similar option. If you just opened Mise for the first time, refresh once after the page finishes loading.")),
            h("p", { className: "install-help-note" }, "Your kitchen data stays in this browser profile. Installing the PWA does not upload your stock or recipes."),
            h("div", { className: "modal-actions" }, h("button", { className: "primary-button", onClick: onClose }, "Got it"))));
}

function HelpModal({ onClose, onEditPrompt }) {
    return h(Modal, { title: "How to use Mise", onClose, wide: true },
        h("div", { className: "help-guide" },
            h("p", { className: "help-lead" }, "Mise keeps track of what is in your kitchen, then builds a prompt you can send to the AI assistant you already like using. The AI does the recipe brainstorming; Mise keeps your stock, recipes and shopping organised locally."),
            h("div", { className: "help-steps" },
                h("section", null,
                    h("h3", null, "1. Add what you have"),
                    h("p", null, "Tap the + button and add the food in your kitchen. Quantity and unit help Mise understand how much is available. Statuses such as Open, Frozen, Near expiry and Leftover can be combined.")),
                h("section", null,
                    h("h3", null, "2. Keep stock up to date"),
                    h("p", null, "Use the + and − buttons for quick quantity changes. Tap the pencil to change an ingredient's name, category, unit, step size or statuses.")),
                h("section", null,
                    h("h3", null, "3. Go to Cook and copy the prompt"),
                    h("p", null, "Open Cook, choose Healthy, Balanced or Comfort, then tap Copy prompt. The prompt automatically includes your current stock, what should be used soon, leftovers and saved-recipe habits.")),
                h("section", null,
                    h("h3", null, "4. Paste it into an AI"),
                    h("p", null, "Open ChatGPT, Claude, Gemini or another AI assistant and paste the prompt. Send it normally. Mise asks the AI to reply in a structured format so the result can be brought back into the app.")),
                h("section", null,
                    h("h3", null, "5. Bring the reply back to Mise"),
                    h("p", null, "Copy the AI's whole reply. For recipes, open Recipes → Import recipe and paste it there. For the strategic shopping suggestions, open Shop → Paste AI list. You can paste the same complete AI reply; Mise extracts the part it needs.")),
                h("section", null,
                    h("h3", null, "6. Read, edit or add recipes"),
                    h("p", null, "Recipe cards show time, tags and how much of the recipe your current stock can cover. Tap a card for the full method, or use Edit recipe to change it. You can also tap New recipe to enter one yourself and pick ingredients directly from your Stock list.")),
                h("section", null,
                    h("h3", null, "7. After cooking, tap ‘I did this’"),
                    h("p", null, "On a recipe page, I did this subtracts measurable ingredients from stock automatically. Mise understands compatible units such as ml/L and g/kg. If a quantity cannot be converted safely, it leaves that item alone instead of guessing.")),
                h("section", null,
                    h("h3", null, "8. Make Mise yours"),
                    h("p", null, "Edit the default cooking prompt if you want different cuisines, equipment, serving sizes or preferences. Settings also lets you create categories, back up data and transfer your kitchen to another device without deleting receiver-only data."))),
            h("div", { className: "modal-actions" },
                h("button", { className: "soft-button", onClick: onEditPrompt }, h(Pencil, null), "Edit default prompt"),
                h("button", { className: "primary-button", onClick: onClose }, "Got it"))));
}

function PromptDefaultsModal({ value, onClose, onSave }) {
    const [draft, setDraft] = useState(normalisePromptTemplate(value));
    const [error, setError] = useState("");
    const save = () => {
        const next = normalisePromptTemplate(draft);
        if (!promptTemplateHasRequiredTokens(next)) {
            setError(`Keep these placeholders in the template: ${REQUIRED_PROMPT_TOKENS.join(", ")}`);
            return;
        }
        onSave(next);
    };
    return h(Modal, { title: "Default cooking prompt", onClose, wide: true },
        h("div", { className: "template-editor" },
            h("p", null, "This is the reusable default behind the Cook page. Edit it once and Mise will use it for future prompt copies. You can rewrite the cuisine guidance, tone or output instructions, but keep the placeholders below so live data can still be inserted. Mise automatically appends your saved recipe library and the last three meals you marked ‘I did this’, so the AI can avoid repetitive meals even if you customise this template."),
            h("div", { className: "template-token-list" }, REQUIRED_PROMPT_TOKENS.map(token => h("code", { key: token }, token))),
            h("textarea", { value: draft, rows: 22, onChange: event => { setDraft(event.target.value); if (error) setError(""); } }),
            error && h("p", { className: "form-error" }, error),
            h("div", { className: "modal-actions" },
                h("button", { className: "soft-button", onClick: () => { setDraft(defaultPromptTemplate()); setError(""); } }, h(ArchiveRestore, null), "Reset to app default"),
                h("button", { className: "primary-button", onClick: save }, h(Pencil, null), "Save default"))));
}

function SettingsModal({ state, setState, onClose, exportData, importRef, restoreData, notify, onTransfer, onHelp, onEditPromptDefaults }) {
    const [name, setName] = useState("");
    const [color, setColor] = useState(palette[0]);
    const [icon, setIcon] = useState("");
    const addCategory = (event) => { event.preventDefault(); if (!name.trim())
        return; const category = { id: uuid(), name: name.trim(), color, icon: icon || null, createdAt: Date.now() }; setState(current => ({ ...current, categories: [...current.categories, category], activity: [{ id: uuid(), type: "category", label: `${category.name} category added`, at: Date.now() }, ...current.activity].slice(0, 100) })); setName(""); setIcon(""); notify("Category added"); };
    const removeCategory = (id) => setState(current => ({ ...current, categories: current.categories.filter(c => c.id !== id), stock: current.stock.map(item => item.categoryId === id ? { ...item, categoryId: null, updatedAt: Date.now() } : item), activity: [{ id: uuid(), type: "category", label: "Category removed; its items are now unsorted", at: Date.now() }, ...current.activity].slice(0, 100) }));
    return h(Modal, { title: "Local settings", onClose: onClose, wide: true },
        h("div", { className: "settings-grid" },
            h("section", null,
                h("span", { className: "eyebrow" },
                    h(Tags, null),
                    " CATEGORIES"),
                h("h3", null, "Organise your stock"),
                h("p", null, "Removing a category keeps every ingredient and moves it to Unsorted."),
                h("div", { className: "category-manager" }, state.categories.map(category => h("div", { key: category.id, style: { "--category": category.color } },
                    h(CategoryGlyph, { category, size: 16 }),
                    h("b", null, category.name),
                    h("small", null,
                        state.stock.filter(i => i.categoryId === category.id).length,
                        " items"),
                    h("button", { onClick: () => removeCategory(category.id), "aria-label": `Delete ${category.name} category`, title: "Delete category" },
                        h(Trash2, null))))),
                h("form", { className: "category-form", onSubmit: addCategory },
                    h("input", { value: name, onChange: e => setName(e.target.value), placeholder: "New category" }),
                    h("div", { className: "category-option-label" }, "Icon"),
                    h("div", { className: "category-icon-picker", role: "group", "aria-label": "Category icon" }, categoryIconChoices.map(choice => h("button", { type: "button", key: choice.id || "auto", onClick: () => setIcon(choice.id), className: icon === choice.id ? "active" : "", title: choice.label, "aria-label": `${choice.label} icon`, "aria-pressed": icon === choice.id },
                        h(choice.Icon, null),
                        h("span", null, choice.label)))),
                    h("div", { className: "category-option-label" }, "Colour"),
                    h("div", { className: "color-picker" }, palette.map(choice => h("button", { type: "button", key: choice, onClick: () => setColor(choice), className: color === choice ? "active" : "", style: { background: choice }, "aria-label": `Use ${choice}` }))),
                    h("button", { className: "primary-button", type: "submit" },
                        h(Plus, null),
                        "Add category"))),
            h("section", null,
                h("span", { className: "eyebrow" },
                    h(ShieldCheck, null),
                    " YOUR DATA"),
                h("h3", null, "Private by design"),
                h("p", null, "Everything lives in this browser. Transfer all or selected data by QR/link when small, or by a .mise file when larger. The receiver can merge or replace only the sections it chooses."),
                h("div", { className: "data-actions" },
                    h("button", { className: "soft-button transfer-button", onClick: onTransfer },
                        h(QrCode, null),
                        "Transfer between devices"),
                    h("button", { className: "soft-button", onClick: onHelp },
                        h(BookOpen, null),
                        "How to use Mise"),
                    h("button", { className: "soft-button", onClick: onEditPromptDefaults },
                        h(Pencil, null),
                        "Edit cooking prompt default"),
                    h("button", { className: "soft-button", onClick: exportData },
                        h(HardDriveDownload, null),
                        "Download backup"),
                    h("button", { className: "soft-button", onClick: () => importRef.current?.click() },
                        h(Upload, null),
                        "Restore backup"),
                    h("input", { ref: importRef, hidden: true, type: "file", accept: "application/json", onChange: e => e.target.files?.[0] && restoreData(e.target.files[0]) }),
                    h("button", { className: "danger-button", onClick: () => { if (window.confirm("Reset all Mise data on this device?")) {
                            setState(freshState());
                            onClose();
                            notify("Mise reset");
                        } } },
                        h(Trash2, null),
                        "Reset local data")),
                h("div", { className: "privacy-note" },
                    h(CloudOff, null),
                    h("div", null,
                        h("b", null, "Your kitchen data stays local."),
                        h("p", null, "Mise does not send stock, recipes or shopping history to an application backend. Hosted/PWA mode can fetch static app assets such as Lucide icons, while your kitchen data remains in browser storage."))))));
}

createRoot(document.getElementById("root")).render(h(App,null));
