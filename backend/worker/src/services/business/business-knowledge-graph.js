const BRAND_ALIASES = {
  moto: "motorola",
  iphone: "apple",
  redmi: "xiaomi",
};

const BRANDS = new Set([
  "motorola",
  "samsung",
  "apple",
  "xiaomi",
  "huawei",
  "honor",
  "nokia",
  "lg",
  "sony",
  "oppo",
  "vivo",
  "realme",
  "oneplus",
  "google",
  "asus",
  "lenovo",
  "hp",
  "dell",
]);

const TOKEN_ALIASES = {};
for (const [token, alias] of Object.entries({
  ...BRAND_ALIASES,
  pla: ["filamento"],
  filamento: ["pla"],
  ssd: ["disco", "solido"],
  disco: ["ssd"],
  solido: ["ssd"],
  ram: ["memoria"],
  memoria: ["ram"],
})) {
  TOKEN_ALIASES[token] = Array.isArray(alias) ? alias : [alias];
}

const STOPWORDS = new Set([
  "cuanto",
  "cuesta",
  "cuestan",
  "vale",
  "valen",
  "cobran",
  "cobra",
  "cobrar",
  "sale",
  "salen",
  "precio",
  "precios",
  "costo",
  "costos",
  "producto",
  "productos",
  "articulo",
  "articulos",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "para",
  "por",
  "y",
  "o",
  "a",
  "al",
  "e",
  "u",
  "mi",
  "me",
  "te",
  "le",
  "nos",
  "se",
  "su",
  "en",
  "con",
  "que",
  "cual",
  "cuales",
  "es",
  "son",
  "esta",
  "estas",
  "quiero",
  "saber",
  "queria",
  "necesito",
  "hace",
  "hacen",
  "hago",
  "tienen",
  "tiene",
  "hay",
  "cambiar",
  "cambio",
  "cambie",
  "cambian",
  "arreglar",
  "arreglo",
  "reparar",
  "reparacion",
  "buscar",
  "dame",
  "pasame",
  "informacion",
  "tipos",
  "tipo",
  "opciones",
  "opcion",
]);

const SOURCE_PRODUCTS_SELECT = "id,name,brand,category,compatible_with";

export class BusinessKnowledgeGraph {
  #queryFn;
  #sources;
  #entities;
  #relations;
  #built;
  #loadPromise;

  constructor(options = {}) {
    this.#queryFn = options.queryFn || null;
    this.#sources = options.sources || null;
    this.#entities = new Map();
    this.#relations = [];
    this.#built = false;
    this.#loadPromise = null;
    if (this.#sources) this.#build(this.#sources);
  }

  async resolve(query) {
    await this.#ensureLoaded();
    if (!query || typeof query !== "string") {
      return { entities: [], relations: [] };
    }

    const tokens = this.#expandTokens(this.#tokenize(query));
    if (tokens.size === 0) return { entities: [], relations: [] };

    const matched = this.#matchEntities(tokens);

    const expandedNames = new Set(matched.map((m) => m.entity.name));
    for (const rel of this.#relations) {
      if (expandedNames.has(rel.from)) expandedNames.add(rel.to);
      if (expandedNames.has(rel.to)) expandedNames.add(rel.from);
    }

    const entities = this.#entitiesByValue(expandedNames);
    const relations = this.#relations.filter(
      (r) => expandedNames.has(r.from) && expandedNames.has(r.to),
    );

    return { entities, relations };
  }

  async resolveEntities(query) {
    await this.#ensureLoaded();
    if (!query || typeof query !== "string") return [];

    const tokens = this.#expandTokens(this.#tokenize(query));
    if (tokens.size === 0) return [];

    return this.#matchEntities(tokens).map((m) => ({
      type: m.entity.type,
      name: m.entity.name,
    }));
  }

  async expand(entity) {
    await this.#ensureLoaded();
    const name =
      typeof entity === "string" ? entity : entity?.name ? entity.name : "";
    if (!name) return { entities: [], relations: [] };

    const byName = new Map();
    for (const e of this.#entities.values()) {
      if (!byName.has(e.name)) byName.set(e.name, e);
    }
    if (!byName.has(name)) return { entities: [], relations: [] };

    const expandedNames = new Set([name]);
    for (const rel of this.#relations) {
      if (rel.from === name) expandedNames.add(rel.to);
      if (rel.to === name) expandedNames.add(rel.from);
    }

    return {
      entities: this.#entitiesByValue(expandedNames),
      relations: this.#relations.filter(
        (r) => expandedNames.has(r.from) && expandedNames.has(r.to),
      ),
    };
  }

  expandTokens(tokens) {
    return this.#expandTokens(tokens);
  }

  async load() {
    if (!this.#built) {
      if (this.#sources) {
        this.#build(this.#sources);
      } else if (this.#queryFn) {
        this.#build(await this.#loadFromQueryFn());
      } else {
        throw new Error(
          "BusinessKnowledgeGraph: queryFn or sources is required",
        );
      }
    }
    return this.stats();
  }

  getEntities() {
    return Array.from(this.#entities.values());
  }

  getRelations() {
    return this.#relations.slice();
  }

  stats() {
    const byType = {};
    for (const entity of this.#entities.values()) {
      byType[entity.type] = (byType[entity.type] || 0) + 1;
    }
    return {
      entities: this.#entities.size,
      relations: this.#relations.length,
      byType,
    };
  }

  async #ensureLoaded() {
    if (this.#built) return;
    if (!this.#loadPromise) this.#loadPromise = this.load();
    await this.#loadPromise;
  }

  async #loadFromQueryFn() {
    const fetch = async (table, opts) => {
      try {
        const rows = await this.#queryFn(table, opts);
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    };
    const [services, prices, products] = await Promise.all([
      fetch("services", { select: "id,name" }),
      fetch("prices", { select: "id,service_id,label" }),
      fetch("products", { select: SOURCE_PRODUCTS_SELECT }),
    ]);
    return { services, prices, products };
  }

  #build(sources) {
    this.#entities = new Map();
    this.#relations = [];

    const serviceNames = new Map();
    for (const service of Array.isArray(sources.services)
      ? sources.services
      : []) {
      const name = service?.name;
      if (!name) continue;
      serviceNames.set(String(service.id), name);
      this.#addEntity("service", name);
    }

    for (const price of Array.isArray(sources.prices) ? sources.prices : []) {
      const label = price?.label;
      if (!label) continue;
      this.#addEntity("device", label);

      const serviceName = serviceNames.get(String(price.service_id));
      if (serviceName) {
        this.#addRelation(label, serviceName, "supports");
      }

      const brand = this.#deriveBrand(label);
      if (brand) {
        this.#addEntity("brand", brand);
        this.#addRelation(label, brand, "has_brand");
      }
    }

    for (const row of Array.isArray(sources.products) ? sources.products : []) {
      const name = row?.name;
      if (!name) continue;
      this.#addEntity("product", name);
      if (row.brand) {
        this.#addEntity("brand", row.brand);
        this.#addRelation(name, row.brand, "has_brand");
      }
      if (row.category) {
        this.#addEntity("category", row.category);
        this.#addRelation(name, row.category, "belongs_to");
      }
      if (row.compatible_with) {
        this.#addEntity("product", row.compatible_with);
        this.#addRelation(name, row.compatible_with, "compatible_with");
      }
    }

    this.#built = true;
  }

  #addEntity(type, name) {
    const key = `${type}:${this.#normalize(name)}`;
    if (!this.#entities.has(key)) {
      this.#entities.set(key, { type, name });
    }
    return this.#entities.get(key);
  }

  #addRelation(from, to, relation) {
    if (!from || !to) return;
    this.#relations.push({ from, to, relation });
  }

  #entitiesByValue(names) {
    const byName = new Map();
    for (const entity of this.#entities.values()) {
      if (!byName.has(entity.name)) byName.set(entity.name, entity);
    }
    return Array.from(names)
      .map((name) => byName.get(name))
      .filter(Boolean);
  }

  #deriveBrand(label) {
    const firstToken = this.#normalize(label).split(/[^a-z0-9]+/)[0];
    if (!firstToken) return null;
    const canonical = BRAND_ALIASES[firstToken] || firstToken;
    if (!BRANDS.has(canonical)) return null;
    return this.#capitalize(canonical);
  }

  #matchEntities(tokens) {
    const matched = [];
    for (const entity of this.#entities.values()) {
      const entityTokens = this.#expandTokens(this.#tokenize(entity.name));
      const score = this.#entityScore(entityTokens, tokens);
      if (score > 0) matched.push({ entity, score });
    }
    matched.sort(
      (a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name),
    );
    return matched;
  }

  #entityScore(entityTokens, queryTokens) {
    let score = 0;
    for (const et of entityTokens) {
      if (queryTokens.has(et)) {
        score += 2;
        continue;
      }
      for (const qt of queryTokens) {
        if (qt.length >= 3 && (et.startsWith(qt) || qt.startsWith(et))) {
          score += 1;
          break;
        }
      }
    }
    return score;
  }

  #expandTokens(tokens) {
    const expanded = new Set();
    for (const token of tokens) {
      expanded.add(token);
      for (const alias of TOKEN_ALIASES[token] || []) {
        expanded.add(alias);
      }
    }
    return expanded;
  }

  #tokenize(text) {
    return this.#normalize(text)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((t) => (t.length > 3 ? this.#singularize(t) : t))
      .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  }

  #normalize(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  #singularize(token) {
    if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
    if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
    return token;
  }

  #capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
}
