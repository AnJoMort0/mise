/* Local-only state persistence, matching, recipe, shopping and analytics logic. */
const STORAGE_KEY = "mise-static-state-v1";
const irregular = { tomatoes: "tomato", potatoes: "potato", leaves: "leaf", loaves: "loaf", knives: "knife", berries: "berry" };
const units = new Set(["mg", "g", "kg", "ml", "cl", "dl", "l", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "cup", "cups", "can", "cans", "pack", "packs", "slice", "slices", "clove", "cloves", "pinch", "handful", "bunch", "piece", "pieces", "item", "items"]);
const STOCK_STATUS_KEYS = ["open", "frozen", "expiring", "leftover"];
const STOCK_STATUS_LABELS = { open: "open", frozen: "frozen", expiring: "near expiry", leftover: "leftover" };

function itemStatuses(item) {
    if (!item) return [];
    if (Array.isArray(item.statuses)) return Array.from(new Set(item.statuses.filter(status => STOCK_STATUS_KEYS.includes(status))));
    return STOCK_STATUS_KEYS.includes(item.status) ? [item.status] : [];
}
function hasStatus(item, status) { return itemStatuses(item).includes(status); }
function statusText(item) { return itemStatuses(item).map(status => STOCK_STATUS_LABELS[status] || status); }
function toggleItemStatus(item, status) {
    const current = itemStatuses(item);
    return current.includes(status) ? current.filter(value => value !== status) : [...current, status];
}

function singular(word) {
    if (irregular[word]) return irregular[word];
    if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
    if (word.endsWith("ses")) return word.slice(0, -1);
    if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
    return word;
}
function normalise(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/pre[ -]?made/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).map(singular).join(" ").trim();
}
/* Product identity must never be based on substring containment: "peas" are
   not "chickpeas", and "pepper" is not automatically "black pepper". Keep
   only harmless preparation words out of identity, then compare the complete
   token set. This still handles punctuation, accents, pluralisation and word
   order without inventing relationships between different ingredients. */
const NAME_IDENTITY_NOISE = new Set(["fresh", "ground", "dried", "dry", "whole", "plain", "raw"]);
function identityTokens(value) {
    return normalise(value).split(" ").filter(token => token && !NAME_IDENTITY_NOISE.has(token)).sort();
}
function canonicalName(value) { return identityTokens(value).join(" "); }
function matchesName(a, b) {
    const one = canonicalName(a), two = canonicalName(b);
    return Boolean(one && two && one === two);
}
function findEquivalentStockByName(name, stock) {
    const key = canonicalName(name);
    if (!key) return null;
    const matches = (stock || []).filter(item => canonicalName(item.name) === key);
    return matches.length === 1 ? matches[0] : null;
}

/* Shopping items can point at an existing stock record. A saved stockId is
   only trusted while the names still identify the same product; otherwise we
   relink by strict product identity. */
function findShoppingStock(item, stock) {
    if (!item) return null;
    if (item.stockId) {
        const byId = (stock || []).find(product => product.id === item.stockId);
        if (byId && matchesName(byId.name, item.name)) return byId;
    }
    return findEquivalentStockByName(item.name, stock);
}
function linkShoppingItem(item, stock) {
    const product = findShoppingStock(item, stock);
    return {
        ...item,
        stockId: product?.id || null,
        unit: String(item?.unit || product?.unit || "")
    };
}
function shoppingUnit(item, stock) {
    return String(item?.unit || findShoppingStock(item, stock)?.unit || "");
}
function shoppingStep(item, stock) {
    return defaultIncrementForUnit(shoppingUnit(item, stock));
}
function shoppingQuantityForStock(item, stockItem) {
    if (!item || !stockItem) return null;
    const fromUnit = String(item.unit || stockItem.unit || "");
    const toUnit = String(stockItem.unit || fromUnit || "");
    return convertQuantity(Number(item.quantity || 0), fromUnit, toUnit);
}

/* Quantity + unit intelligence. Base units are grams and millilitres. */
const unitAliases = {
    milligram: "mg", milligrams: "mg", mg: "mg",
    gram: "g", grams: "g", g: "g",
    kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg", kg: "kg",
    millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml", ml: "ml",
    centilitre: "cl", centilitres: "cl", centiliter: "cl", centiliters: "cl", cl: "cl",
    decilitre: "dl", decilitres: "dl", deciliter: "dl", deciliters: "dl", dl: "dl",
    litre: "l", litres: "l", liter: "l", liters: "l", l: "l",
    teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp",
    tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp",
    cup: "cup", cups: "cup",
    piece: "piece", pieces: "piece", item: "piece", items: "piece", pc: "piece", pcs: "piece",
    can: "can", cans: "can", pack: "pack", packs: "pack", packet: "pack", packets: "pack",
    slice: "slice", slices: "slice", clove: "clove", cloves: "clove", bunch: "bunch", bunches: "bunch",
    portion: "portion", portions: "portion", serving: "portion", servings: "portion",
    jar: "jar", jars: "jar", bottle: "bottle", bottles: "bottle", loaf: "loaf", loaves: "loaf", box: "box", boxes: "box", block: "block", blocks: "block"
};
const unitMeasures = {
    mg: { family: "mass", factor: 0.001 }, g: { family: "mass", factor: 1 }, kg: { family: "mass", factor: 1000 },
    ml: { family: "volume", factor: 1 }, cl: { family: "volume", factor: 10 }, dl: { family: "volume", factor: 100 }, l: { family: "volume", factor: 1000 },
    tsp: { family: "volume", factor: 5 }, tbsp: { family: "volume", factor: 15 }, cup: { family: "volume", factor: 240 }
};
function normaliseUnit(unit) {
    const raw = String(unit || "").trim().toLowerCase().replace(/\.$/, "");
    return unitAliases[raw] || raw;
}
function convertQuantity(quantity, fromUnit, toUnit) {
    const amount = Number(quantity);
    if (!Number.isFinite(amount)) return null;
    const from = normaliseUnit(fromUnit), to = normaliseUnit(toUnit);
    if (from === to) return amount;
    if (!from && !to) return amount;
    const a = unitMeasures[from], b = unitMeasures[to];
    if (a && b && a.family === b.family) return amount * a.factor / b.factor;
    return null;
}
function defaultIncrementForUnit(unit) {
    const value = normaliseUnit(unit);
    if (value === "kg" || value === "l") return 0.1;
    if (value === "g" || value === "ml") return 50;
    if (value === "cl") return 5;
    if (value === "dl") return 0.5;
    return 1;
}
function itemIncrement(item) {
    const value = Number(item?.increment);
    return Number.isFinite(value) && value > 0 ? value : defaultIncrementForUnit(item?.unit);
}
function roundQuantity(value) { return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000; }
function formatQuantity(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value || "");
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 1000) / 1000);
}
function parseNumberish(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const fraction = raw.match(/^(\d+)\/(\d+)$/);
    if (fraction) return Number(fraction[1]) / Number(fraction[2]);
    const num = Number(raw.replace(",", "."));
    return Number.isFinite(num) ? num : null;
}
function parseAmountText(value) {
    const text = String(value || "").trim();
    if (!text) return { quantity: null, unit: "", text: "" };
    const match = text.match(/^((?:\d+\s+)?\d+(?:[.,]\d+)?(?:\/\d+)?)\s*([^\s].*)?$/);
    if (!match) return { quantity: null, unit: "", text };
    return { quantity: parseNumberish(match[1]), unit: String(match[2] || "").trim(), text };
}
function amountLabel(ingredient) {
    if (!ingredient) return "";
    if (ingredient.amountText && ingredient.quantity == null) return ingredient.amountText;
    if (ingredient.quantity == null) return ingredient.unit || "";
    return `${formatQuantity(ingredient.quantity)}${ingredient.unit ? ` ${ingredient.unit}` : ""}`;
}

function cleanIngredient(line) {
    const before = String(line || "").replace(/^\s*[-*•]\s*/, "").replace(/^\[(stock|buy)\]\s*/i, "").split("|")[0].trim();
    const words = before.replace(/^\d+[\d\s/.,-]*\s*/, "").split(/\s+/).filter(word => !units.has(normalise(word)));
    return words.join(" ").replace(/[,:;]+$/, "").trim();
}
function normaliseRecipeImportText(text) {
    let raw = String(text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        .replace(/[｜￨]/g, "|");

    /* Chat/copy surfaces can escape structural characters even when the
       rendered answer looks normal. Remove those escapes only around Mise's
       machine-readable syntax, leaving recipe prose alone. */
    raw = raw
        .replace(/\\(?====\s*(?:RECIPE|END RECIPE)\s*===)/gi, "")
        .replace(/\\(?=\[(?:STOCK|BUY|SHOPPING|END SHOPPING)\])/gi, "")
        .replace(/^\s*```(?:json|text|plaintext|markdown)?\s*$/gmi, "")
        .replace(/^\s*```\s*$/gmi, "");

    /* Restore structural boundaries that rich-text clipboard paths sometimes
       glue onto the preceding line. */
    raw = raw.replace(/([^\n])\s+(?=(?:\*\*|__)?(?:TITLE|MODE|CUISINE|TAGS|SERVINGS|ACTIVE MINUTES|TOTAL MINUTES|LEAD TIME|INGREDIENTS|STEPS|METHOD|INSTRUCTIONS)(?:\*\*|__)?\s*:)/gi, "$1\n");
    raw = raw.replace(/([^\n])\s+(?=(?:\\)?===\s*(?:RECIPE|END RECIPE)\s*===)/gi, "$1\n");

    const fieldLine = /^[ \t]*(?:>[ \t]*)?(?:[-*•][ \t]*)?(?:\*\*|__)?(TITLE|MODE|CUISINE|TAGS|SERVINGS|ACTIVE MINUTES|TOTAL MINUTES|LEAD TIME|INGREDIENTS|STEPS|METHOD|INSTRUCTIONS)(?:\*\*|__)?[ \t]*:[ \t]*(?:\*\*|__)?(.*)$/i;
    raw = raw.split("\n").map(line => {
        const match = line.match(fieldLine);
        if (!match) return line;
        return `${match[1].toUpperCase()}: ${match[2].replace(/(?:\*\*|__)\s*$/, "").trim()}`;
    }).join("\n");
    return raw.trim();
}

function recipeTitle(text) {
    const raw = normaliseRecipeImportText(text);
    const explicit = raw.match(/^\s*TITLE\s*:\s*(.+)$/im)?.[1];
    return (explicit || raw.split(/\r?\n/).find(line => line.trim()) || "Untitled recipe").replace(/^#+\s*/, "").trim().slice(0, 90);
}
function recipeIngredientObjects(recipe) {
    return (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).map(value => {
        if (value && typeof value === "object") return {
            name: String(value.name || "Ingredient"),
            source: String(value.source || "stock").toLowerCase() === "buy" ? "buy" : "stock",
            stockId: value.stockId ? String(value.stockId) : null,
            quantity: value.quantity == null || value.quantity === "" ? null : Number(value.quantity),
            unit: String(value.unit || ""),
            amountText: String(value.amountText || "")
        };
        return { name: String(value || "Ingredient"), source: "stock", stockId: null, quantity: null, unit: "", amountText: "" };
    }).filter(item => item.name.trim());
}
function ingredientNames(recipe) { return recipeIngredientObjects(recipe).map(item => item.name); }
function findRecipeStockItem(ingredient, stock) {
    const list = Array.isArray(stock) ? stock : [];
    if (ingredient?.stockId) {
        const byId = list.find(item => String(item.id) === String(ingredient.stockId));
        /* Old versions could store a false link after a substring match. Only
           trust the saved ID when the human-facing names still describe the
           same product. */
        if (byId && matchesName(byId.name, ingredient?.name || "")) return byId;
    }
    return findEquivalentStockByName(ingredient?.name || "", list);
}
function linkRecipeIngredientsToStock(recipe, stock) {
    return recipeIngredientObjects(recipe).map(ingredient => {
        if (ingredient.source === "buy") return { ...ingredient, stockId: null };
        const item = findRecipeStockItem(ingredient, stock);
        return item ? { ...ingredient, source: "stock", stockId: item.id, name: item.name } : { ...ingredient, stockId: null };
    });
}
function storedRecipeIngredientSnapshot(recipe) {
    const text = String(recipe?.text || "").trim();
    if (!text) return [];
    if (text.startsWith("{") && text.endsWith("}")) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed?.ingredients)) return structuredRecipe(parsed)?.ingredients || [];
        }
        catch { }
    }
    return parseSingleRecipe(text).ingredients || [];
}
function repairLegacyRecipeIngredientLinks(recipe, ingredients, stock) {
    const originals = storedRecipeIngredientSnapshot(recipe);
    if (!originals.length) return ingredients;
    return ingredients.map((ingredient, index) => {
        const original = originals[index];
        if (!original?.name || original.source === "buy") return ingredient;
        const originalStock = findEquivalentStockByName(original.name, stock);
        if (!originalStock) return ingredient;
        const linked = ingredient?.stockId ? (stock || []).find(item => String(item.id) === String(ingredient.stockId)) : null;
        /* Only rewrite when the stored original gives us a clear exact
           identity and the existing saved link points somewhere else. */
        if (linked && linked.id === originalStock.id) return ingredient;
        if (!linked && matchesName(ingredient?.name || "", originalStock.name)) return ingredient;
        return { ...ingredient, name: originalStock.name, source: "stock", stockId: originalStock.id };
    });
}
function parseRecipeIngredients(text) { return parseSingleRecipe(text).ingredients; }

function parseDuration(value) {
    const text = String(value || "").toLowerCase();
    const hours = Number(text.match(/([\d.]+)\s*(?:h|hr|hour)/)?.[1] || 0);
    const mins = Number(text.match(/([\d.]+)\s*(?:m|min|minute)/)?.[1] || 0);
    if (hours || mins) return Math.round(hours * 60 + mins);
    const number = Number(text.match(/[\d.]+/)?.[0]);
    return Number.isFinite(number) ? Math.round(number) : null;
}
function lineField(text, name) {
    const raw = normaliseRecipeImportText(text);
    return raw.match(new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*:\\s*(.+)$`, "im"))?.[1]?.replace(/(?:\*\*|__)\s*$/, "").trim() || "";
}
function parseIngredientLine(line) {
    const stripped = String(line || "")
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        .replace(/^\s*(?:>\s*)?(?:\\?[-*•]\s*)?/, "")
        .replace(/\\(?=\[(?:stock|buy)\])/gi, "")
        .trim();
    const source = stripped.match(/^\[(stock|buy)\]\s*/i)?.[1]?.toLowerCase() || "stock";
    const body = stripped.replace(/^\[(stock|buy)\]\s*/i, "").trim();
    const parts = body.split("|").map(part => part.trim());
    if (parts.length >= 3) {
        const quantity = parseNumberish(parts[1]);
        return { name: parts[0], source, quantity, unit: parts[2], amountText: `${parts[1]}${parts[2] ? ` ${parts[2]}` : ""}`.trim() };
    }
    if (parts.length === 2) {
        const amount = parseAmountText(parts[1]);
        return { name: parts[0], source, quantity: amount.quantity, unit: amount.unit, amountText: parts[1] };
    }
    const leading = body.match(/^((?:\d+\s+)?\d+(?:[.,]\d+)?(?:\/\d+)?)\s+([a-zA-Z]+)?\s*(.+)$/);
    if (leading) {
        const maybeUnit = normaliseUnit(leading[2] || "");
        const knownUnit = maybeUnit && (unitMeasures[maybeUnit] || units.has(maybeUnit) || unitAliases[maybeUnit]);
        if (knownUnit) return { name: leading[3].trim(), source, quantity: parseNumberish(leading[1]), unit: leading[2] || "", amountText: `${leading[1]} ${leading[2] || ""}`.trim() };
    }
    return { name: cleanIngredient(body) || body, source, quantity: null, unit: "", amountText: "" };
}
function parseSteps(text) {
    const raw = normaliseRecipeImportText(text);
    const lines = raw.split(/\r?\n/);
    let start = lines.findIndex(line => /^\s*(?:>\s*)?(?:[-*•]\s*)?(?:steps|method|instructions)\s*:?\s*$/i.test(line));
    if (start < 0) {
        const ingredientStart = lines.findIndex(line => /^\s*(?:ingredients|ingredients used)\s*:?\s*$/i.test(line));
        start = lines.findIndex((line, index) => index > ingredientStart && /^\s*(?:>\s*)?(?:\*\*)?1[.)](?:\*\*)?\s+/.test(line));
        if (start >= 0) start -= 1;
    }
    if (start < 0) return [];
    const result = [];
    for (const line of lines.slice(start + 1)) {
        if (/^\s*(?:\\)?===\s*END RECIPE\s*===/i.test(line)) break;
        if (/^\s*\\?\[?SHOPPING\]?\s*:?\s*$/i.test(line)) break;
        const numbered = line.match(/^\s*(?:>\s*)?(?:\*\*)?(?:\d+)[.)](?:\*\*)?\s*(.+)$/) || line.match(/^\s*(?:>\s*)?[-*•]\s*(.+)$/);
        if (numbered) result.push(numbered[1].trim());
        else if (line.trim() && result.length) result[result.length - 1] += ` ${line.trim()}`;
    }
    return result.filter(Boolean);
}
function parseSingleRecipe(text) {
    const raw = normaliseRecipeImportText(text);
    const lines = raw.split(/\r?\n/);
    const ingredientStart = lines.findIndex(line => /^\s*(?:>\s*)?(?:ingredients|ingredients used)\s*:?\s*$/i.test(line));
    const stepStart = lines.findIndex((line, index) => index > ingredientStart && /^\s*(?:>\s*)?(?:steps|method|instructions)\s*:?\s*$/i.test(line));
    const sectionLines = ingredientStart >= 0 ? lines.slice(ingredientStart + 1, stepStart > ingredientStart ? stepStart : undefined) : lines;
    const ingredientLines = sectionLines.filter(line => /^\s*(?:>\s*)?(?:\\?[-*•]\s*)?\\?\[(?:stock|buy)\]\s*/i.test(line));
    const ingredients = ingredientLines.map(parseIngredientLine).filter(item => item.name && normalise(item.name) !== "water");
    const timeLine = lineField(raw, "TIME");
    const activeField = lineField(raw, "ACTIVE MINUTES");
    const totalField = lineField(raw, "TOTAL MINUTES");
    const timeParts = timeLine.split("|");
    const activeMinutes = parseDuration(activeField || timeParts[0]);
    const totalMinutes = parseDuration(totalField || timeParts[1] || timeLine);
    const tags = lineField(raw, "TAGS").split(/[,;|]/).map(tag => tag.trim()).filter(Boolean).slice(0, 8);
    const mode = lineField(raw, "MODE") || "";
    if (mode && !tags.some(tag => normalise(tag) === normalise(mode))) tags.unshift(mode);
    return {
        id: uuid(),
        title: recipeTitle(raw),
        mode,
        cuisine: lineField(raw, "CUISINE"),
        tags,
        servings: Number(lineField(raw, "SERVINGS")) || null,
        activeMinutes,
        totalMinutes,
        leadTime: lineField(raw, "LEAD TIME") || "none",
        ingredients,
        steps: parseSteps(raw),
        text: raw,
        createdAt: Date.now(),
        timesCooked: 0,
        lastCookedAt: null
    };
}

function structuredRecipe(value) {
    if (!value || typeof value !== "object") return null;
    const rawTags = Array.isArray(value.tags) ? value.tags : String(value.tags || "").split(/[,;|]/);
    const ingredients = (Array.isArray(value.ingredients) ? value.ingredients : []).map(item => {
        if (typeof item === "string") return parseIngredientLine(item);
        const quantity = item?.quantity == null || item.quantity === "" ? null : parseNumberish(item.quantity);
        return {
            name: String(item?.name || "").trim(),
            source: String(item?.source || "stock").toLowerCase() === "buy" ? "buy" : "stock",
            stockId: item?.stockId ? String(item.stockId) : null,
            quantity,
            unit: String(item?.unit || "").trim(),
            amountText: quantity == null ? String(item?.amountText || "") : `${item.quantity}${item?.unit ? ` ${item.unit}` : ""}`.trim()
        };
    }).filter(item => item.name && normalise(item.name) !== "water");
    const steps = (Array.isArray(value.steps) ? value.steps : String(value.steps || "").split(/\n+/)).map(step => String(step || "").replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
    const mode = String(value.mode || "").trim();
    const tags = rawTags.map(tag => String(tag || "").trim()).filter(Boolean).slice(0, 8);
    if (mode && !tags.some(tag => normalise(tag) === normalise(mode))) tags.unshift(mode);
    return {
        id: uuid(),
        title: String(value.title || "Untitled recipe").trim().slice(0, 90),
        mode,
        cuisine: String(value.cuisine || "").trim(),
        tags,
        servings: Number(value.servings) || null,
        activeMinutes: parseDuration(value.activeMinutes ?? value.active_minutes),
        totalMinutes: parseDuration(value.totalMinutes ?? value.total_minutes),
        leadTime: String(value.leadTime ?? value.lead_time ?? "none").trim() || "none",
        ingredients,
        steps,
        text: JSON.stringify(value, null, 2),
        createdAt: Date.now(),
        timesCooked: 0,
        lastCookedAt: null
    };
}
function structuredShoppingItem(value) {
    if (typeof value === "string") return parseShoppingLine(value);
    if (!value || typeof value !== "object") return null;
    const quantity = value.quantity == null || value.quantity === "" ? 1 : parseNumberish(value.quantity);
    return {
        name: String(value.name || "").trim(),
        quantity: quantity == null ? 1 : quantity,
        unit: String(value.unit || "").trim(),
        reason: String(value.reason || "").trim()
    };
}
function parseMiseAiPayload(text) {
    const source = String(text || "").replace(/\r\n?/g, "\n").replace(/[\u200b-\u200d\ufeff]/g, "").trim();
    if (!source) return null;
    const candidates = [];
    const fenced = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
    candidates.push(...fenced);
    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(source.slice(firstBrace, lastBrace + 1));
    if (source.startsWith("{") && source.endsWith("}")) candidates.push(source);
    for (const candidate of candidates) {
        for (const attempt of [candidate, candidate.replace(/,\s*([}\]])/g, "$1")]) {
            try {
                const parsed = JSON.parse(attempt);
                if (!parsed || typeof parsed !== "object" || (!Array.isArray(parsed.recipes) && !Array.isArray(parsed.shopping))) continue;
                return {
                    format: String(parsed.format || ""),
                    recipes: (parsed.recipes || []).map(structuredRecipe).filter(Boolean),
                    shopping: (parsed.shopping || []).map(structuredShoppingItem).filter(item => item?.name)
                };
            }
            catch { }
        }
    }
    return null;
}
function legacyRecipeBlocks(text) {
    const raw = normaliseRecipeImportText(text);
    if (!raw) return [];
    const recipeArea = raw.split(/^\s*\\?\[?SHOPPING\]?\s*:?\s*$/im)[0];
    const matches = [...recipeArea.matchAll(/(?:\\)?===\s*RECIPE\s*===([\s\S]*?)(?:(?:\\)?===\s*END RECIPE\s*===|(?=(?:\\)?===\s*RECIPE\s*===)|$)/gi)];
    if (matches.length) return matches.map(match => match[1].trim()).filter(Boolean);

    /* Marker-less fallback: some clipboard paths strip the === lines but
       preserve TITLE:. Split on top-level TITLE fields instead. */
    const starts = [...recipeArea.matchAll(/^\s*(?:>\s*)?(?:[-*•]\s*)?(?:\*\*|__)?TITLE(?:\*\*|__)?\s*:/gmi)].map(match => match.index);
    if (starts.length) return starts.map((start, index) => recipeArea.slice(start, starts[index + 1] ?? recipeArea.length).trim()).filter(Boolean);
    return [recipeArea.trim()].filter(Boolean);
}
function parseRecipeBlocks(text) {
    const payload = parseMiseAiPayload(text);
    if (payload?.recipes?.length) return payload.recipes.filter(recipe => recipe.title && !/^skip$/i.test(recipe.title));
    return legacyRecipeBlocks(text).map(parseSingleRecipe).filter(recipe => recipe.title && !/^skip$/i.test(recipe.title));
}

function parseShoppingLine(line) {
    const stripped = String(line || "")
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        .replace(/^\s*(?:>\s*)?(?:\\?[-*•]\s*)?/, "")
        .replace(/\\(?=\[(?:buy|stock)\])/gi, "")
        .replace(/^\[(?:buy|stock)\]\s*/i, "")
        .trim();
    if (!stripped || /^\[?end shopping\]?$/i.test(stripped)) return null;
    const parts = stripped.split("|").map(part => part.trim());
    const name = String(parts[0] || "").trim();
    if (!name) return null;
    if (parts.length === 1) return { name, quantity: 1, unit: "", reason: "" };
    const amount = parseAmountText(parts[1]);
    return {
        name,
        quantity: amount.quantity == null ? 1 : amount.quantity,
        unit: amount.unit || "",
        reason: parts.slice(2).join(" | ").trim()
    };
}
function parseShoppingItems(text) {
    const payload = parseMiseAiPayload(text);
    if (payload?.shopping) return dedupeShoppingItems(payload.shopping);
    const raw = normaliseRecipeImportText(text);
    const lines = raw.split(/\r?\n/);
    const start = lines.findIndex(line => /^\s*\\?\[?shopping\]?\s*:?\s*$/i.test(line));
    const end = start >= 0 ? lines.findIndex((line, index) => index > start && /^\s*\\?\[?end shopping\]?\s*$/i.test(line)) : -1;
    if (start < 0 && /(?:===\s*RECIPE|^\s*TITLE\s*:|^\s*INGREDIENTS\s*:|^\s*STEPS\s*:)/im.test(raw)) return [];
    const chosen = start >= 0 ? lines.slice(start + 1, end > start ? end : undefined) : lines;
    return dedupeShoppingItems(chosen.map(parseShoppingLine).filter(Boolean));
}
function dedupeShoppingItems(items) {
    const result = [];
    for (const item of items || []) {
        const key = normalise(item?.name);
        if (!key) continue;
        const existing = result.find(entry => normalise(entry.name) === key);
        if (existing) {
            const sameUnit = normaliseUnit(existing.unit) === normaliseUnit(item.unit);
            if (sameUnit) existing.quantity = roundQuantity(Number(existing.quantity || 0) + Number(item.quantity || 0));
            if (!existing.unit && item.unit) existing.unit = item.unit;
            if (!existing.reason && item.reason) existing.reason = item.reason;
        } else result.push({ name: String(item.name).trim(), quantity: Number(item.quantity || 1), unit: String(item.unit || ""), reason: String(item.reason || "") });
    }
    return result;
}
function parseShoppingText(text) { return parseShoppingItems(text).map(item => item.name); }
function usageCount(name, recipes) { return recipes.reduce((sum, recipe) => sum + (ingredientNames(recipe).some(ingredient => matchesName(ingredient, name)) ? 1 : 0), 0); }

function analyticsFor(state, name) { return state.analytics[normalise(name)] || { shoppingAdds: 0, stockAdds: 0, stockedAt: [] }; }
function bumpAnalytics(state, name, kind, at = Date.now()) {
    const key = normalise(name), current = analyticsFor(state, name);
    return { ...state.analytics, [key]: kind === "shop" ? { ...current, shoppingAdds: current.shoppingAdds + 1, lastShoppingAt: at } : { ...current, stockAdds: current.stockAdds + 1, lastStockedAt: at, stockedAt: [...current.stockedAt.slice(-9), at] } };
}
function humanAge(timestamp) {
    if (!timestamp) return "";
    const days = Math.floor((Date.now() - timestamp) / 86400000);
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
}
function smartRecommendations(state) {
    const inList = new Set(state.shopping.map(i => normalise(i.name)));
    const names = new Map();
    state.stock.forEach(i => names.set(normalise(i.name), i.name));
    state.recipes.flatMap(recipeIngredientObjects).forEach(ingredient => names.set(normalise(ingredient.name), ingredient.name));
    stapleIdeas.forEach(name => names.set(normalise(name), name));
    Object.keys(state.analytics).forEach(key => { if (!names.has(key)) names.set(key, key.replace(/\b\w/g, c => c.toUpperCase())); });
    return [...names.values()].filter(name => !inList.has(normalise(name))).map(name => {
        const item = state.stock.find(i => matchesName(i.name, name)), analytics = analyticsFor(state, name), recipes = usageCount(name, state.recipes);
        let score = stapleIdeas.some(s => matchesName(s, name)) ? 8 : 0;
        const reasons = [];
        if (item?.quantity === 0) { score += 100; reasons.push("Out of stock"); }
        else if (hasStatus(item, "expiring") || hasStatus(item, "leftover")) { score = -1000; reasons.push(hasStatus(item, "expiring") ? "Use before expiry" : "Use leftover first"); }
        if (recipes) { score += Math.min(48, recipes * 14); reasons.push(`Used in ${recipes} recipe${recipes === 1 ? "" : "s"}`); }
        if (analytics.shoppingAdds) { score += Math.min(40, analytics.shoppingAdds * 8); reasons.push(`Added ${analytics.shoppingAdds}× before`); }
        if (analytics.stockAdds > 1) { score += Math.min(24, analytics.stockAdds * 5); reasons.push(`Restocked ${analytics.stockAdds}×`); }
        if (analytics.lastShoppingAt && Date.now() - analytics.lastShoppingAt < 2 * 86400000) score -= 18;
        if (item && item.quantity > 2 && itemStatuses(item).length === 0) score -= 35;
        if (!reasons.length) reasons.push("Useful pantry unlock");
        return { name, score, reasons: reasons.slice(0, 2), source: item?.quantity === 0 ? "restock" : "smart" };
    }).filter(r => r.score > 5).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 8);
}
function recentShopping(state) { return [...state.shopping].sort((a, b) => b.addedAt - a.addedAt).slice(0, 5); }
function topRecipeItems(state) { return state.stock.map(item => ({ item, count: usageCount(item.name, state.recipes) })).filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 4); }
function frequentBuys(state) { return state.stock.map(item => ({ item, count: analyticsFor(state, item.name).shoppingAdds })).filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 4); }

function recipeAvailability(recipe, stock) {
    const ingredients = recipeIngredientObjects(recipe);
    const entries = ingredients.map(ingredient => {
        const item = findRecipeStockItem(ingredient, stock);
        if (!item || Number(item.quantity) <= 0) return { ingredient, item: item || null, state: "missing", requiredInStockUnit: null };
        if (ingredient.quantity == null) return { ingredient, item, state: "available", requiredInStockUnit: null };
        const converted = convertQuantity(ingredient.quantity, ingredient.unit, item.unit);
        if (converted == null) return { ingredient, item, state: "available", requiredInStockUnit: null };
        const enough = Number(item.quantity) + 1e-9 >= converted;
        return { ingredient, item, state: enough ? "available" : "short", requiredInStockUnit: converted, shortage: enough ? 0 : roundQuantity(converted - Number(item.quantity)) };
    });
    const matched = entries.filter(entry => entry.state === "available").map(entry => entry.ingredient.name);
    const short = entries.filter(entry => entry.state === "short").map(entry => entry.ingredient.name);
    const missing = entries.filter(entry => entry.state === "missing").map(entry => entry.ingredient.name);
    const ready = ingredients.length > 0 && !missing.length && !short.length;
    const availableCount = matched.length;
    return { entries, matched, short, missing, ready, total: ingredients.length, pct: ingredients.length ? Math.round(availableCount / ingredients.length * 100) : 0 };
}
function consumeRecipeStock(recipe, stock) {
    const ingredients = recipeIngredientObjects(recipe);
    let consumed = 0, skipped = 0, depleted = 0;
    const next = stock.map(item => ({ ...item, statuses: itemStatuses(item) }));
    ingredients.forEach(ingredient => {
        const linked = findRecipeStockItem(ingredient, next);
        const index = linked ? next.findIndex(item => item.id === linked.id && Number(item.quantity) > 0) : -1;
        if (index < 0 || ingredient.quantity == null) { skipped += 1; return; }
        const item = next[index];
        const required = convertQuantity(ingredient.quantity, ingredient.unit, item.unit);
        if (required == null) { skipped += 1; return; }
        const quantity = roundQuantity(Math.max(0, Number(item.quantity) - required));
        if (quantity === 0 && Number(item.quantity) > 0) depleted += 1;
        next[index] = { ...item, quantity, statuses: quantity === 0 ? [] : itemStatuses(item), updatedAt: Date.now() };
        consumed += 1;
    });
    return { stock: next, consumed, skipped, depleted };
}

function recipeTitleTokens(title) {
    const text = String(title || "");
    const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || [];
    return matches.map((label, index) => ({
        label,
        key: normalise(label),
        index,
        capitalised: /^\p{Lu}/u.test(label)
    })).filter(token => token.key && token.key.length >= 3 && !/^\d+$/.test(token.key));
}
function recipeTitleTopics(recipes, minimumCount = 2) {
    const stats = new Map();
    for (const recipe of recipes || []) {
        const seen = new Set();
        for (const token of recipeTitleTokens(recipe?.title)) {
            if (seen.has(token.key)) continue;
            seen.add(token.key);
            const current = stats.get(token.key) || { key: token.key, count: 0, labels: new Map(), capitalised: 0, first: 0 };
            current.count += 1;
            current.capitalised += token.capitalised ? 1 : 0;
            current.first += token.index === 0 ? 1 : 0;
            current.labels.set(token.label, (current.labels.get(token.label) || 0) + 1);
            stats.set(token.key, current);
        }
    }
    return Array.from(stats.values())
        .filter(topic => topic.count >= minimumCount && (topic.capitalised > 0 || topic.first >= minimumCount))
        .map(topic => ({
            key: topic.key,
            count: topic.count,
            label: Array.from(topic.labels.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || topic.key
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
function recipeTitleHasTopic(title, topicKey) {
    const key = normalise(topicKey);
    return recipeTitleTokens(title).some(token => token.key === key);
}

function recipeTotalMinutes(recipe) { return Number(recipe?.totalMinutes) || Number(recipe?.activeMinutes) || Infinity; }

function inferCategory(name, categories, stock) {
    const previous = stock.find(item => matchesName(item.name, name) && item.categoryId && categories.some(c => c.id === item.categoryId));
    if (previous) return previous.categoryId;
    const key = normalise(name);
    const groups = { Produce: ["tomato", "pepper", "carrot", "lettuce", "mushroom", "onion", "garlic", "potato", "lemon", "coriander", "fruit", "apple", "banana", "spinach"], Protein: ["pork", "beef", "chicken", "bacon", "tuna", "egg", "chorizo", "fish", "tofu"], Dairy: ["milk", "cream", "butter", "cheese", "mozzarella", "parmigiano", "yoghurt"], Pantry: ["pasta", "rice", "bread", "noodle", "oil", "vinegar", "flour", "chickpea"], Sauces: ["sauce", "pesto", "soy", "juice"], Spices: ["salt", "pepper", "paprika", "basil", "parsley", "rosemary", "seasoning", "bay"], Drinks: ["beer", "wine", "water", "juice"] };
    for (const [category, words] of Object.entries(groups)) {
        if (words.some(word => key.includes(word))) {
            const found = categories.find(c => normalise(c.name) === normalise(category));
            if (found) return found.id;
        }
    }
    return null;
}

const REQUIRED_PROMPT_TOKENS = ["{{CURRENT_STOCK}}", "{{LOCAL_HABITS}}", "{{TONE_PREFERENCE}}"];
function promptTonePreference(tone) {
    return tone === "healthy" ? "health-forward and deeply flavourful" : tone === "comfort" ? "bold comfort food without being careless" : "mostly healthy, always flavour-first, occasional cheaty option";
}
function defaultPromptTemplate() {
    return `Act as my practical, inventive home cook. Use my real stock and return exactly three clearly different recipes: one QUICK, one MEDIUM/LONG, and one PREP AHEAD.

KITCHEN
- Hob
- Conventional oven (no fan)
- Very small air fryer
- Portion size is recipe-dependent: use 1 portion by default; use 2 portions when the dish is especially good refrigerated for the next day; use up to 4 portions when it is genuinely freezer-friendly.
- Do not bulk-cook just to hit a number. Choose 1-4 portions only when the recipe benefits from it.
- Cuisine preferences: keep this broad and adaptable to the user rather than locked to one country. You can still lean into any cuisines the user mentions.
- Preference: {{TONE_PREFERENCE}}

CURRENT STOCK
{{CURRENT_STOCK}}

LOCAL HABITS
Frequently represented in saved recipes: {{LOCAL_HABITS}}

STOCK TAGS
- Tags are independent and can stack. An item can be open + near expiry, frozen + leftover, or any other sensible combination.
- open = the package/container has been opened.
- near expiry = use-soon urgency.
- frozen = currently frozen and may need thawing or direct-from-frozen handling.
- leftover = already cooked/prepared food, not a raw ingredient. A leftover can be reheated and plated as a side/base, or safely repurposed inside another dish. Do not tell me to cook a leftover from raw again. If a leftover is also frozen, account for safe thawing/reheating.

THREE OPTIONS
1. QUICK — genuinely quick, minimal washing up. It may be 1-4 portions when batch cooking genuinely suits the dish.
2. MEDIUM/LONG — more involved or slower, with enough payoff to justify the extra time. It may be 1-4 portions when batch cooking genuinely suits the dish.
3. PREP AHEAD — something worth starting now for later. This can be a marinade, brine, soak, proof, ferment, pickle, cure, assembled make-ahead dish, or another preparation that benefits from resting or being finished later. Clearly separate WHAT TO DO NOW from HOW TO FINISH LATER and give safe refrigeration/storage instructions.

PORTION RULES
- 1 portion is the normal choice for a one-off meal.
- Use 2 portions when the second portion is specifically good refrigerated and eaten the next day.
- Use 3-4 portions only when the recipe freezes well or there is another clear batch-cooking advantage.
- These portion rules apply to QUICK, MEDIUM/LONG and PREP AHEAD alike.

For every proposed recipe include cuisine, tags, active/total time, exact measurable amounts, substitutions, heat levels and visual doneness cues. Prioritise near-expiry items and refrigerated leftovers first, then opened ingredients and genuinely fresh produce. Treat vegetables, leafy greens, mushrooms, fresh fruit, fresh herbs and similar short-lived ingredients as use-soon by default even when they have no urgency tag. Leftovers are already cooked/prepared: use them as a ready-made component, side, base, filling or repurposed ingredient, and only describe reheating/crisping/seasoning/combining steps that are still needed. Frozen leftovers are available but are not automatically urgent; flag appropriate thawing/reheating. Never assume an unlisted ingredient is available.

IMPORTANT FOR STOCK TRACKING: for every ingredient whose source is "stock", copy its CURRENT STOCK name exactly. Whenever practical, express the recipe amount in the same unit shown in CURRENT STOCK, or a directly convertible metric unit (g↔kg, ml↔cl↔dl↔L). Avoid vague amounts such as "some" when a realistic quantity can be stated.

IMPORTANT OUTPUT FORMAT: return exactly one valid JSON object and nothing else. Do not wrap it in a Markdown code fence. Do not add commentary before or after it. Use ordinary JSON double quotes and no trailing commas.

Use this exact top-level shape:
{
  "format": "mise-ai-v1",
  "recipes": [
    {
      "title": "Recipe name",
      "mode": "Quick | Medium/Long | Prep ahead",
      "cuisine": "cuisine or style",
      "tags": ["2-5", "short", "tags"],
      "servings": 1,
      "activeMinutes": 10,
      "totalMinutes": 25,
      "leadTime": "none | X hours | X days",
      "ingredients": [
        {"source": "stock", "name": "Exact stock item name", "quantity": 100, "unit": "g"},
        {"source": "buy", "name": "Missing ingredient name", "quantity": 1, "unit": ""}
      ],
      "steps": [
        "One complete actionable step with heat/time/doneness cues where relevant.",
        "Next complete step."
      ]
    }
  ],
  "shopping": [
    {"name": "Ingredient", "quantity": 1, "unit": "bunch", "reason": "Concise explanation of the extra recipe families it unlocks"}
  ]
}

JSON RULES:
- Return exactly three recipes: one Quick, one Medium/Long and one Prep ahead.
- servings must follow the portion rules above rather than always defaulting to 1.
- For every stock ingredient, source must be "stock" and name must copy the CURRENT STOCK name exactly.
- Missing ingredients use source "buy".
- quantity must be a JSON number, never words. unit is a short string and can be empty for countable items.
- Whenever practical, use the stock item's own unit or a directly convertible metric unit (g↔kg, ml↔cl↔dl↔L).
- steps must be a JSON array with one complete instruction per entry. For PREP AHEAD, explicitly include what to do now, how to refrigerate/store/rest it, and how to finish later.
- Put substitutions in the relevant step when useful.

STRATEGIC SHOPPING UNLOCK:
The shopping array is NOT every missing ingredient from the recipes. It is a separate strategic list of only 0-3 additional ingredients total, chosen together to unlock the maximum number and variety of realistic extra recipes when combined with CURRENT STOCK. Think of it as a small set-cover problem: prefer ingredients that complete many near-miss meals, avoid redundant picks that unlock mostly the same dishes, and favour ingredients that connect strongly to several things already in stock. Do not recommend something merely because it is a generally useful staple. If buying nothing meaningfully improves recipe coverage, return an empty shopping array.`;
}
function upgradeLegacyPromptTemplate(template) {
    let text = String(template || "").replace(/\r\n/g, "\n").trim();
    if (!text) return defaultPromptTemplate();
    text = text.replace(
        "Act as my practical, inventive home cook. Use my real stock and return four clearly different recipes I could cook now, plus one PREP AHEAD recipe when the stock genuinely supports it. The prep-ahead recipe is intentionally allowed to be for tomorrow or later rather than tonight.",
        "Act as my practical, inventive home cook. Use my real stock and return exactly three clearly different recipes: one QUICK, one MEDIUM/LONG, and one PREP AHEAD."
    );
    text = text.replace(
        "- Default: 1 portion\n- Longer freezer-friendly meals: 4 portions, eat 1 and freeze 3",
        "- Portion size is recipe-dependent: use 1 portion by default; use 2 portions when the dish is especially good refrigerated for the next day; use up to 4 portions when it is genuinely freezer-friendly.\n- Do not bulk-cook just to hit a number. Choose 1-4 portions only when the recipe benefits from it."
    );
    const optionStart = text.indexOf("OPTIONS FOR NOW");
    const detailStart = text.indexOf("\n\nFor every proposed recipe include", optionStart);
    if (optionStart >= 0 && detailStart > optionStart && /4\. WILD CARD/.test(text.slice(optionStart, detailStart))) {
        const replacement = `THREE OPTIONS\n1. QUICK — genuinely quick, minimal washing up. It may be 1-4 portions when batch cooking genuinely suits the dish.\n2. MEDIUM/LONG — more involved or slower, with enough payoff to justify the extra time. It may be 1-4 portions when batch cooking genuinely suits the dish.\n3. PREP AHEAD — something worth starting now for later. This can be a marinade, brine, soak, proof, ferment, pickle, cure, assembled make-ahead dish, or another preparation that benefits from resting or being finished later. Clearly separate WHAT TO DO NOW from HOW TO FINISH LATER and give safe refrigeration/storage instructions.\n\nPORTION RULES\n- 1 portion is the normal choice for a one-off meal.\n- Use 2 portions when the second portion is specifically good refrigerated and eaten the next day.\n- Use 3-4 portions only when the recipe freezes well or there is another clear batch-cooking advantage.\n- These portion rules apply to QUICK, MEDIUM/LONG and PREP AHEAD alike.`;
        text = `${text.slice(0, optionStart)}${replacement}${text.slice(detailStart)}`;
    }
    text = text.replace('"mode": "Fast | Medium | Cook once | Wild card | Prep ahead"', '"mode": "Quick | Medium/Long | Prep ahead"');
    text = text.replace(
        "- Return four recipes for now, plus the prep-ahead recipe only when it is genuinely worthwhile. If prep-ahead should be skipped, simply omit it from recipes; do not add a fake recipe named SKIP.",
        "- Return exactly three recipes: one Quick, one Medium/Long and one Prep ahead.\n- servings must follow the portion rules above rather than always defaulting to 1."
    );
    return text;
}
function normalisePromptTemplate(template) {
    return upgradeLegacyPromptTemplate(typeof template === "string" && template.trim() ? template : defaultPromptTemplate());
}
function promptTemplateHasRequiredTokens(template) {
    return REQUIRED_PROMPT_TOKENS.every(token => template.includes(token));
}
function applyPromptTemplate(template, values) {
    const safe = promptTemplateHasRequiredTokens(template) ? template : defaultPromptTemplate();
    return safe
        .replaceAll("{{CURRENT_STOCK}}", values.currentStock)
        .replaceAll("{{LOCAL_HABITS}}", values.localHabits)
        .replaceAll("{{TONE_PREFERENCE}}", values.tonePreference);
}
function normaliseAvoidList(values) {
    const source = Array.isArray(values) ? values : [];
    const result = [], seen = new Set();
    for (const raw of source) {
        const value = String(raw || "").trim();
        const key = normalise(value);
        if (!key || seen.has(key)) continue;
        seen.add(key); result.push(value);
    }
    return result.slice(0, 100);
}
function dislikePromptMemory(state) {
    const meals = normaliseAvoidList(state?.avoidMeals);
    const ingredients = normaliseAvoidList(state?.avoidIngredients);
    if (!meals.length && !ingredients.length) return "";
    return `\n\nPERSONAL EXCLUSIONS — HARD RULES\nMEALS / DISHES I DO NOT LIKE\n${meals.length ? meals.join(" | ") : "None listed."}\n\nINGREDIENTS / PRODUCTS I DO NOT LIKE\n${ingredients.length ? ingredients.join(" | ") : "None listed."}\n\n- Do not propose any listed meal, or a close variation that is substantially the same dish.\n- Do not intentionally use a listed ingredient/product in a recipe, even if it appears in CURRENT STOCK.\n- Never put a listed ingredient/product, or an obvious near-equivalent of it, in the shopping array.\n- Do not suggest a disliked product as a substitution. Choose a genuinely different route instead.`;
}

function uniqueRecipeIngredientNames(recipe) {
    const seen = new Set();
    return recipeIngredientObjects(recipe).map(ingredient => String(ingredient?.name || "").trim()).filter(name => {
        const key = normalise(name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
function savedRecipeMemory(state) {
    const titles = (Array.isArray(state?.recipes) ? state.recipes : []).map(recipe => String(recipe?.title || "").trim()).filter(Boolean);
    return titles.length ? titles.join(" | ") : "No saved recipes yet.";
}
function recentCookedMeals(state, limit = 3) {
    const recipes = Array.isArray(state?.recipes) ? state.recipes : [];
    const activities = (Array.isArray(state?.activity) ? state.activity : [])
        .filter(entry => entry?.type === "cook" && Number(entry?.at || 0) > 0)
        .sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
    const meals = [];
    for (const entry of activities) {
        if (meals.length >= limit) break;
        const title = String(entry.label || "").replace(/\s+cooked\s*$/i, "").trim() || "Cooked meal";
        const recipe = recipes.find(candidate => normalise(candidate.title) === normalise(title));
        meals.push({ title, at: Number(entry.at || 0), recipe });
    }
    if (meals.length < limit) {
        const usedEvents = new Set(meals.map(meal => `${normalise(meal.title)}|${meal.at}`));
        const fallback = recipes.filter(recipe => Number(recipe.lastCookedAt || 0) > 0).sort((a, b) => Number(b.lastCookedAt || 0) - Number(a.lastCookedAt || 0));
        for (const recipe of fallback) {
            if (meals.length >= limit) break;
            const key = `${normalise(recipe.title)}|${Number(recipe.lastCookedAt || 0)}`;
            if (usedEvents.has(key)) continue;
            meals.push({ title: recipe.title, at: Number(recipe.lastCookedAt || 0), recipe });
            usedEvents.add(key);
        }
    }
    return meals;
}
function recipeVarietyMemory(state) {
    const recent = recentCookedMeals(state, 3);
    const recentText = recent.length ? recent.map((meal, index) => `${index + 1}. ${meal.title}`).join("\n") : "No meals have been marked as cooked yet.";
    return `\n\nRECIPE MEMORY & MEAL ROTATION\nSAVED RECIPE TITLES ONLY\n${savedRecipeMemory(state)}\n\nLAST 3 COOKED MEALS — newest first, titles only\n${recentText}\n\nVARIETY RULES\n- Do not reproduce a saved recipe, rename it, or offer a trivial variation of it. Use the saved titles as a compact exclusion memory rather than repeating their full recipe data.\n- Treat the last three cooked meal titles as a stronger short-term exclusion zone. Avoid the same dish or an obviously close remix of what was just eaten.\n- Where a recent title clearly reveals the core protein, starch/base or flavour direction, avoid repeating essentially the same combination on the next meal/day.\n- Ingredient overlap is fine for pantry staples and urgent use-soon stock, but the resulting meal should still feel meaningfully different.\n- If near-expiry stock makes some repetition sensible, change the dish structure, cooking method or flavour direction rather than wasting the ingredient.\n- Use this memory for exclusion and variety only; do not output or quote this memory back to me.`;
}

function makePrompt(state, tone) {
    const categoryById = Object.fromEntries(state.categories.map(category => [category.id, category.name]));
    const available = state.stock.filter(i => i.quantity > 0).map(i => {
        const category = i.categoryId ? categoryById[i.categoryId] : "";
        const statuses = statusText(i);
        return `${i.name} (${formatQuantity(i.quantity)}${i.unit ? ` ${i.unit}` : ""}${category ? `, ${category}` : ""}${statuses.length ? `, ${statuses.join(", ")}` : ""})`;
    }).join(", ");
    const favourites = topRecipeItems(state).map(x => `${x.item.name} (${x.count} saved recipes)`).join(", ") || "No history yet";
    const basePrompt = applyPromptTemplate(normalisePromptTemplate(state.promptTemplate), {
        currentStock: available,
        localHabits: favourites,
        tonePreference: promptTonePreference(tone)
    });
    return `${basePrompt}${recipeVarietyMemory(state)}${dislikePromptMemory(state)}`;
}

function migrateLegacyStatuses(state) {
    if (!state || !Array.isArray(state.stock)) return state;
    const stock = state.stock.map(item => {
        const legacy = item.status === "low" || item.status === "fresh" || item.status === "ready" || item.status === "out" ? [] : itemStatuses(item);
        const statuses = Array.isArray(item.statuses) ? itemStatuses(item) : legacy;
        const { status: _legacyStatus, ...rest } = item;
        return { ...rest, statuses, increment: itemIncrement(item) };
    });
    return {
        ...state,
        promptTemplate: normalisePromptTemplate(state.promptTemplate),
        avoidMeals: normaliseAvoidList(state.avoidMeals),
        avoidIngredients: normaliseAvoidList(state.avoidIngredients),
        stock,
        shopping: (Array.isArray(state.shopping) ? state.shopping : []).map(item => linkShoppingItem({
            ...item,
            quantity: Math.max(1, Number(item?.quantity || 1)),
            unit: String(item?.unit || ""),
            checked: Boolean(item?.checked)
        }, stock)),
        recipes: (Array.isArray(state.recipes) ? state.recipes : []).map((recipe, index) => {
            const fallbackText = recipe?.text || `TITLE: ${recipe?.title || "Recipe"}
INGREDIENTS:
${(recipe?.ingredients || []).map(name => `- ${name}`).join("\n")}
STEPS:`;
            const reparsed = parseSingleRecipe(fallbackText);
            const existingIngredients = recipeIngredientObjects(recipe);
            const existingSteps = Array.isArray(recipe?.steps) ? recipe.steps.map(String).filter(Boolean) : [];
            const existingTags = Array.isArray(recipe?.tags) ? recipe.tags.map(String).filter(Boolean) : [];
            return {
                ...reparsed, ...recipe,
                id: String(recipe?.id || `recipe-${index}`),
                title: String(recipe?.title || reparsed.title),
                mode: String(recipe?.mode || reparsed.mode || ""),
                cuisine: String(recipe?.cuisine || reparsed.cuisine || ""),
                tags: existingTags.length ? existingTags : reparsed.tags,
                servings: Number(recipe?.servings || reparsed.servings) || null,
                activeMinutes: Number(recipe?.activeMinutes || reparsed.activeMinutes) || null,
                totalMinutes: Number(recipe?.totalMinutes || reparsed.totalMinutes) || null,
                leadTime: String(recipe?.leadTime || reparsed.leadTime || "none"),
                ingredients: linkRecipeIngredientsToStock({ ingredients: repairLegacyRecipeIngredientLinks(recipe, existingIngredients.length ? existingIngredients : reparsed.ingredients, stock) }, stock),
                steps: existingSteps.length ? existingSteps : reparsed.steps,
                text: String(recipe?.text || reparsed.text || ""),
                createdAt: Number(recipe?.createdAt || Date.now()),
                timesCooked: Number(recipe?.timesCooked || 0),
                lastCookedAt: recipe?.lastCookedAt || null
            };
        })
    };
}

/* Device-to-device transfer. The payload is kept in the URL fragment, so it is
   never sent to GitHub Pages. Incoming data is merged by human-facing names:
   matching records update, new records are added, and receiver-only records stay. */
const TRANSFER_PARAM = "mise-transfer";
const TRANSFER_FALLBACK_URL = "https://anjomort0.github.io/mise/";
/* Keep QR/link transfers deliberately conservative. QR capacity and link handling
   vary a lot between camera apps, messengers and browsers; a transfer file is
   the reliable path once a snapshot grows beyond this. */
const TRANSFER_LINK_MAX_CHARS = 1800;

function bytesToBase64Url(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value) {
    let base64 = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
async function compressTransferText(text) {
    const source = new TextEncoder().encode(text);
    if (typeof CompressionStream !== "function") return `r.${bytesToBase64Url(source)}`;
    try {
        const stream = new Blob([source]).stream().pipeThrough(new CompressionStream("gzip"));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        return `g.${bytesToBase64Url(compressed)}`;
    }
    catch { return `r.${bytesToBase64Url(source)}`; }
}
async function decompressTransferText(token) {
    const [mode, encoded] = String(token || "").split(".", 2);
    if (!encoded || !["g", "r"].includes(mode)) throw new Error("Invalid Mise transfer link");
    const bytes = base64UrlToBytes(encoded);
    if (mode === "r") return new TextDecoder().decode(bytes);
    if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack the transfer link");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
function transferBaseUrl() {
    try {
        const current = new URL(location.href);
        if (current.protocol === "http:" || current.protocol === "https:") {
            if (!["localhost", "127.0.0.1"].includes(current.hostname)) { current.hash = ""; current.search = ""; return current.href; }
        }
    }
    catch { }
    return TRANSFER_FALLBACK_URL;
}
const TRANSFER_SECTION_KEYS = ["stock", "categories", "recipes", "shopping", "prompt", "history"];
function normaliseTransferSections(sections, fallback = TRANSFER_SECTION_KEYS) {
    const source = Array.isArray(sections) ? sections : fallback;
    return TRANSFER_SECTION_KEYS.filter(key => source.includes(key));
}
function makeTransferPayload(state, sections = TRANSFER_SECTION_KEYS, preferredMode = "merge") {
    const source = migrateLegacyStatuses(state);
    const selected = normaliseTransferSections(sections);
    const transferState = { version: 1 };
    if (selected.includes("stock")) transferState.stock = source.stock || [];
    if (selected.includes("categories")) transferState.categories = source.categories || [];
    if (selected.includes("recipes")) transferState.recipes = source.recipes || [];
    if (selected.includes("shopping")) transferState.shopping = source.shopping || [];
    if (selected.includes("prompt")) {
        transferState.promptTemplate = normalisePromptTemplate(source.promptTemplate);
        transferState.avoidMeals = normaliseAvoidList(source.avoidMeals);
        transferState.avoidIngredients = normaliseAvoidList(source.avoidIngredients);
    }
    if (selected.includes("history")) {
        transferState.analytics = source.analytics || {};
        transferState.activity = source.activity || [];
    }
    /* Category references are tiny support metadata. They let a stock-only
       transfer map category IDs by name without actually importing categories. */
    const support = selected.includes("stock") ? {
        categories: (source.categories || []).map(category => ({ id: category.id, name: category.name }))
    } : undefined;
    return {
        kind: "mise-transfer",
        version: 2,
        createdAt: Date.now(),
        sections: selected,
        preferredMode: preferredMode === "replace" ? "replace" : "merge",
        state: transferState,
        ...(support ? { support } : {})
    };
}
function normalisePartialTransferState(raw = {}) {
    const shell = {
        version: 1,
        categories: Array.isArray(raw.categories) ? raw.categories : [],
        stock: Array.isArray(raw.stock) ? raw.stock : [],
        shopping: Array.isArray(raw.shopping) ? raw.shopping : [],
        recipes: Array.isArray(raw.recipes) ? raw.recipes : [],
        analytics: raw.analytics && typeof raw.analytics === "object" ? raw.analytics : {},
        activity: Array.isArray(raw.activity) ? raw.activity : [],
        promptTemplate: typeof raw.promptTemplate === "string" ? raw.promptTemplate : defaultPromptTemplate(),
        avoidMeals: normaliseAvoidList(raw.avoidMeals),
        avoidIngredients: normaliseAvoidList(raw.avoidIngredients)
    };
    return migrateLegacyStatuses(shell);
}
function validateTransferPayload(payload) {
    if (payload?.kind !== "mise-transfer" || !payload.state) throw new Error("Invalid Mise transfer data");
    if (payload.version === 1) {
        if (!Array.isArray(payload.state.stock) || !Array.isArray(payload.state.categories)) throw new Error("Invalid Mise transfer data");
        return {
            ...payload,
            version: 2,
            sections: [...TRANSFER_SECTION_KEYS],
            preferredMode: "merge",
            state: migrateLegacyStatuses(payload.state),
            support: { categories: payload.state.categories || [] }
        };
    }
    if (payload.version !== 2) throw new Error("Unsupported Mise transfer version");
    const sections = normaliseTransferSections(payload.sections, []);
    if (!sections.length) throw new Error("Mise transfer has no data sections");
    const state = normalisePartialTransferState(payload.state);
    const supportCategories = Array.isArray(payload.support?.categories) ? payload.support.categories.map(category => ({ id: category.id, name: String(category.name || "") })).filter(category => category.name) : [];
    return { ...payload, sections, preferredMode: payload.preferredMode === "replace" ? "replace" : "merge", state, support: { ...(payload.support || {}), categories: supportCategories } };
}
async function makeTransferBundle(state, sections = TRANSFER_SECTION_KEYS, preferredMode = "merge") {
    const payload = makeTransferPayload(state, sections, preferredMode);
    const fileText = JSON.stringify(payload);
    const encoded = await compressTransferText(fileText);
    const link = `${transferBaseUrl()}#${TRANSFER_PARAM}=${encoded}`;
    return {
        payload,
        fileText,
        link,
        linkSafe: link.length <= TRANSFER_LINK_MAX_CHARS,
        linkLength: link.length,
        fileBytes: new TextEncoder().encode(fileText).length
    };
}
async function makeTransferLink(state, sections, preferredMode) { return (await makeTransferBundle(state, sections, preferredMode)).link; }
function transferFileName(date = new Date()) { return `mise-transfer-${date.toISOString().slice(0, 10)}.mise`; }
async function decodeTransferFile(file) {
    if (!file || typeof file.text !== "function") throw new Error("Invalid Mise transfer file");
    return validateTransferPayload(JSON.parse(await file.text()));
}
function transferTokenFromLocation() {
    try { return new URLSearchParams(String(location.hash || "").replace(/^#/, "")).get(TRANSFER_PARAM) || ""; }
    catch { return ""; }
}
function clearTransferHash() {
    try { const url = new URL(location.href); url.hash = ""; history.replaceState(null, "", url.href); } catch { }
}
async function decodeTransferLinkToken(token) {
    return validateTransferPayload(JSON.parse(await decompressTransferText(token)));
}
function mergeAnalytics(current = {}, incoming = {}) {
    const result = { ...current };
    for (const [key, value] of Object.entries(incoming || {})) {
        const existing = result[key] || {};
        const times = Array.from(new Set([...(existing.stockedAt || []), ...(value?.stockedAt || [])].map(Number).filter(Number.isFinite))).sort((a, b) => a - b).slice(-20);
        result[key] = {
            ...existing, ...value,
            shoppingAdds: Math.max(Number(existing.shoppingAdds || 0), Number(value?.shoppingAdds || 0)),
            stockAdds: Math.max(Number(existing.stockAdds || 0), Number(value?.stockAdds || 0)),
            lastShoppingAt: Math.max(Number(existing.lastShoppingAt || 0), Number(value?.lastShoppingAt || 0)) || undefined,
            lastStockedAt: Math.max(Number(existing.lastStockedAt || 0), Number(value?.lastStockedAt || 0)) || undefined,
            stockedAt: times
        };
    }
    return result;
}
function mergeActivity(current = [], incoming = []) {
    const activityKey = entry => `${entry?.type || ""}|${entry?.label || ""}|${Number(entry?.at || 0)}`;
    const seen = new Set();
    return [...(incoming || []), ...(current || [])].filter(entry => { const key = activityKey(entry); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => Number(b.at || 0) - Number(a.at || 0)).slice(0, 100);
}
function mergeNamedRecords(current, incoming, nameOf, prepareIncoming = value => value) {
    const records = [...(current || [])];
    let added = 0, updated = 0;
    for (const raw of incoming || []) {
        const value = prepareIncoming(raw);
        const key = normalise(nameOf(value));
        if (!key) continue;
        const index = records.findIndex(existing => normalise(nameOf(existing)) === key);
        if (index >= 0) { records[index] = { ...records[index], ...value, id: records[index].id || value.id || uuid() }; updated++; }
        else { records.push({ ...value, id: value.id || uuid() }); added++; }
    }
    return { records, added, updated };
}
function categoryNameMap(categories = []) {
    return new Map((categories || []).map(category => [category.id, String(category.name || "")]));
}
function categoryIdByName(categories = []) {
    return new Map((categories || []).map(category => [normalise(category.name), category.id]));
}
function mapStockCategory(item, sourceCategoryNames, targetCategories, fallbackCategoryId = null) {
    if (!item?.categoryId) return { ...item, categoryId: fallbackCategoryId || null };
    const sourceName = sourceCategoryNames.get(item.categoryId);
    const targetId = sourceName ? categoryIdByName(targetCategories).get(normalise(sourceName)) : null;
    return { ...item, categoryId: targetId || fallbackCategoryId || null };
}
function replaceCategoriesAndRemapStock(currentCategories, nextCategories, stock) {
    const oldNames = categoryNameMap(currentCategories);
    const newIds = categoryIdByName(nextCategories);
    return (stock || []).map(item => {
        const oldName = item.categoryId ? oldNames.get(item.categoryId) : "";
        return { ...item, categoryId: oldName ? (newIds.get(normalise(oldName)) || null) : null };
    });
}
function applyTransferredState(currentState, rawPayload, options = {}) {
    const payload = validateTransferPayload(rawPayload);
    const current = migrateLegacyStatuses(currentState);
    const available = normaliseTransferSections(payload.sections, []);
    const requested = normaliseTransferSections(options.sections, available).filter(key => available.includes(key));
    if (!requested.length) throw new Error("Choose at least one transfer section");
    const selected = new Set(requested);
    const mode = options.mode === "replace" ? "replace" : "merge";
    const incoming = payload.state;
    let next = { ...current };
    const summary = { mode, sections: requested, added: 0, updated: 0, replaced: [] };

    const sourceCategoryRecords = (incoming.categories?.length ? incoming.categories : payload.support?.categories) || [];
    const sourceCategoryNames = categoryNameMap(sourceCategoryRecords);

    if (selected.has("categories")) {
        if (mode === "replace") {
            const categories = (incoming.categories || []).map(category => ({ ...category }));
            next.stock = replaceCategoriesAndRemapStock(current.categories, categories, next.stock);
            next.categories = categories;
            summary.replaced.push("categories");
        } else {
            const merged = mergeNamedRecords(next.categories, incoming.categories, category => category.name);
            next.categories = merged.records;
            summary.added += merged.added; summary.updated += merged.updated;
        }
    }

    if (selected.has("stock")) {
        const prepareStock = raw => {
            const existing = next.stock.find(item => normalise(item.name) === normalise(raw.name));
            const mapped = mapStockCategory(raw, sourceCategoryNames, next.categories, existing?.categoryId || null);
            return { ...mapped, statuses: itemStatuses(raw), increment: itemIncrement(raw) };
        };
        if (mode === "replace") {
            next.stock = (incoming.stock || []).map(prepareStock);
            summary.replaced.push("stock");
        } else {
            const merged = mergeNamedRecords(next.stock, incoming.stock, item => item.name, prepareStock);
            next.stock = merged.records;
            summary.added += merged.added; summary.updated += merged.updated;
        }
    }

    if (selected.has("recipes")) {
        const prepRecipe = recipe => {
            /* Stock IDs are device-local. Re-link transferred recipe ingredients
               by their human-facing names on the receiving device. */
            const portable = { ...recipe, ingredients: recipeIngredientObjects(recipe).map(ingredient => ({ ...ingredient, stockId: null })) };
            return { ...recipe, ingredients: linkRecipeIngredientsToStock(portable, next.stock), steps: Array.isArray(recipe.steps) ? recipe.steps.map(String) : [], tags: Array.isArray(recipe.tags) ? recipe.tags.map(String) : [] };
        };
        if (mode === "replace") {
            next.recipes = (incoming.recipes || []).map(recipe => ({ ...prepRecipe(recipe), id: recipe.id || uuid() }));
            summary.replaced.push("recipes");
        } else {
            const merged = mergeNamedRecords(next.recipes, incoming.recipes, recipe => recipe.title, prepRecipe);
            next.recipes = merged.records;
            summary.added += merged.added; summary.updated += merged.updated;
        }
    }

    if (selected.has("shopping")) {
        const prepShopping = item => linkShoppingItem({ ...item, quantity: Number(item.quantity || 1), checked: Boolean(item.checked) }, next.stock);
        if (mode === "replace") {
            next.shopping = (incoming.shopping || []).map(item => ({ ...prepShopping(item), id: item.id || uuid() }));
            summary.replaced.push("shopping");
        } else {
            const merged = mergeNamedRecords(next.shopping, incoming.shopping, item => item.name, prepShopping);
            next.shopping = merged.records;
            summary.added += merged.added; summary.updated += merged.updated;
        }
    } else if (selected.has("stock")) {
        /* Keep receiver links valid after stock IDs change/relink. */
        next.shopping = (next.shopping || []).map(item => linkShoppingItem(item, next.stock));
    }
    if (selected.has("stock") && !selected.has("recipes")) {
        next.recipes = (next.recipes || []).map(recipe => ({ ...recipe, ingredients: linkRecipeIngredientsToStock(recipe, next.stock) }));
    }

    if (selected.has("prompt")) {
        next.promptTemplate = normalisePromptTemplate(incoming.promptTemplate);
        if (mode === "replace") {
            next.avoidMeals = normaliseAvoidList(incoming.avoidMeals);
            next.avoidIngredients = normaliseAvoidList(incoming.avoidIngredients);
            summary.replaced.push("prompt");
        } else {
            next.avoidMeals = normaliseAvoidList([...(next.avoidMeals || []), ...(incoming.avoidMeals || [])]);
            next.avoidIngredients = normaliseAvoidList([...(next.avoidIngredients || []), ...(incoming.avoidIngredients || [])]);
            summary.updated += 1;
        }
    }

    if (selected.has("history")) {
        if (mode === "replace") {
            next.analytics = incoming.analytics || {};
            next.activity = incoming.activity || [];
            summary.replaced.push("history");
        } else {
            next.analytics = mergeAnalytics(next.analytics, incoming.analytics);
            next.activity = mergeActivity(next.activity, incoming.activity);
            summary.updated += Object.keys(incoming.analytics || {}).length;
        }
    }

    next.version = 1;
    return { state: migrateLegacyStatuses(next), summary };
}
/* Backwards-compatible helper for older call sites: full merge. */
function mergeTransferredState(currentState, incomingState) {
    const payload = { kind: "mise-transfer", version: 2, sections: [...TRANSFER_SECTION_KEYS], preferredMode: "merge", state: incomingState, support: { categories: incomingState?.categories || [] } };
    return applyTransferredState(currentState, payload, { mode: "merge", sections: TRANSFER_SECTION_KEYS });
}


function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.version === 1) return migrateLegacyStatuses(parsed);
        }
    }
    catch { }
    const state = freshState();
    try {
        const oldItems = JSON.parse(localStorage.getItem("mise-items") || "null");
        const oldShopping = JSON.parse(localStorage.getItem("mise-shopping") || "null");
        const oldRecipes = JSON.parse(localStorage.getItem("mise-recipes") || "null");
        if (oldItems) {
            state.stock = oldItems.map((item, index) => {
                const category = defaultCategories.find(c => normalise(c.name) === normalise(String(item.category || "")));
                const legacyStatus = String(item.status || "");
                const statuses = STOCK_STATUS_KEYS.includes(legacyStatus) ? [legacyStatus] : [];
                const unit = String(item.unit || "");
                return { id: String(item.id || `migrated-${index}`), name: String(item.name || "Ingredient"), quantity: Number(item.quantity || 0), unit, increment: defaultIncrementForUnit(unit), categoryId: category?.id || null, statuses, createdAt: Date.now(), updatedAt: Date.now() };
            });
        }
        if (oldShopping) state.shopping = oldShopping.map((item, index) => ({ id: String(item.id || `shop-${index}`), name: String(item.name || "Item"), quantity: 1, unit: "", checked: Boolean(item.done), addedAt: Date.now() - index, source: "manual" }));
        if (oldRecipes) state.recipes = oldRecipes.map((recipe, index) => ({ ...parseSingleRecipe(recipe.text || `TITLE: ${recipe.title || "Recipe"}`), id: String(recipe.id || `recipe-${index}`), title: String(recipe.title || "Recipe"), createdAt: Number(recipe.createdAt || Date.now()) }));
    }
    catch { }
    return migrateLegacyStatuses(state);
}
function saveState(state) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { } }
function timeLabel(timestamp) { return humanAge(timestamp); }
function newShoppingItem(name, source, stockItem = null, quantity = 1, unit = "") { return { id: uuid(), name: name.trim(), quantity: Math.max(1, Number(quantity || 1)), unit: String(unit || stockItem?.unit || ""), stockId: stockItem?.id || null, checked: false, addedAt: Date.now(), source }; }

const palette = ["#67a64a", "#d15336", "#5f91c9", "#c3903f", "#a45f91", "#e17833", "#3b9a9a", "#7b6bd1", "#db4f83"];
const statusButtons = [
    { status: "frozen", label: "Frozen", icon: Snowflake },
    { status: "open", label: "Open", icon: PackageOpen },
    { status: "expiring", label: "Near expiry", icon: CalendarClock },
    { status: "leftover", label: "Leftover", icon: Utensils }
];
