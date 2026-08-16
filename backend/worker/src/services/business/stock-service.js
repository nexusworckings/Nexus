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
  "salir",
  "saldria",
  "precio",
  "precios",
  "costo",
  "costos",
  "tarifa",
  "tarifas",
  "coste",
  "producto",
  "productos",
  "articulo",
  "articulos",
  "venden",
  "vende",
  "vendo",
  "vendes",
  "tienen",
  "tiene",
  "hay",
  "quedan",
  "queda",
  "queda",
  "stock",
  "disponible",
  "disponibles",
  "disponibilidad",
  "unidades",
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
  "buscar",
  "dame",
  "pasame",
  "informacion",
  "tipos",
  "tipo",
  "opciones",
  "opcion",
]);

export class StockService {
  #repository;
  #knowledgeGraph;

  constructor(options = {}) {
    this.#repository = options.repository || options.stockRepository;
    if (!this.#repository || typeof this.#repository.findAll !== "function") {
      throw new Error("StockService: a repository with findAll() is required");
    }
    this.#knowledgeGraph = options.knowledgeGraph || null;
  }

  async search(rawQuery) {
    if (!rawQuery || typeof rawQuery !== "string") return { results: [] };

    const queryTokens = this.#expandTokens(this.#tokenize(rawQuery));
    if (queryTokens.size === 0) return { results: [] };

    const rows = await this.#repository.findAll();
    const items = (Array.isArray(rows) ? rows : [])
      .map((row) => this.#mapStock(row))
      .filter((item) => item !== null);

    const scored = items
      .map((item) => ({
        item,
        score: this.#score(item, queryTokens),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return { results: scored.map((r) => r.item) };
  }

  #mapStock(row) {
    if (!row || row.is_active === false) return null;
    const stock = Number(row.stock) || 0;
    return {
      id: row.id,
      product: row.name || "",
      stock,
      available: stock > 0,
    };
  }

  #score(item, queryTokens) {
    const nameTokens = this.#expandTokens(this.#tokenize(item.product));

    let matched = 0;
    let score = 0;
    for (const qt of queryTokens) {
      if (nameTokens.has(qt)) {
        score += 4;
        matched += 1;
        continue;
      }
      for (const t of nameTokens) {
        if (t.startsWith(qt) || qt.startsWith(t)) {
          score += 1;
          matched += 1;
          break;
        }
      }
    }

    if (matched < queryTokens.size) return 0;
    return score;
  }

  #expandTokens(tokens) {
    if (this.#knowledgeGraph) {
      return this.#knowledgeGraph.expandTokens(tokens);
    }
    return new Set(tokens);
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
}
