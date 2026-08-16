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

// Atributos explícitos que el usuario puede pedir. El catálogo actual no tiene
// columnas de color/material/capacidad: estos tokens aparecen embebidos en el
// campo `name` (texto libre). Se usan SOLO para sumar/penalizar puntaje, nunca
// para afirmar datos comerciales (precio/stock siguen viniendo de las tools).
const COLOR_TOKENS = new Set([
  "negro",
  "blanco",
  "rojo",
  "azul",
  "verde",
  "amarillo",
  "naranja",
  "violeta",
  "rosa",
  "gris",
  "celeste",
  "marron",
  "bordo",
  "plateado",
  "dorado",
  "transparente",
  "beige",
  "fucsia",
  "lila",
  "turquesa",
]);

const MATERIAL_TOKENS = new Set([
  "pla",
  "abs",
  "petg",
  "tpu",
  "resina",
  "filamento",
  "nylon",
  "silicona",
  "madera",
  "acrilico",
]);

// Pesos del scoring ponderado (identidad > atributo).
// Identidad: coincidencias en name/brand/category/parcial (4/3/2/1).
// Atributos: un color/material PEDIDO que está presente en el producto suma;
// un atributo PEDIDO para el que el producto declara OTRO valor penaliza
// (conflicto explícito relega, no excluye). Un atributo pedido sin ninguna
// evidencia en el producto no matchea (no se inventa).
const COLOR_MATCH_BONUS = 2;
const MATERIAL_MATCH_BONUS = 3;
const COLOR_CONFLICT_PENALTY = 1;
const MATERIAL_CONFLICT_PENALTY = 5;

export class ProductService {
  #repository;
  #knowledgeGraph;

  constructor(options = {}) {
    this.#repository = options.repository || options.productRepository;
    if (!this.#repository || typeof this.#repository.findAll !== "function") {
      throw new Error(
        "ProductService: a repository with findAll() is required",
      );
    }
    this.#knowledgeGraph = options.knowledgeGraph || null;
  }

  async search(rawQuery) {
    if (!rawQuery || typeof rawQuery !== "string") return { results: [] };

    const explicitTokens = new Set(this.#tokenize(rawQuery));
    if (explicitTokens.size === 0) return { results: [] };

    const queryTokens = this.#expandTokens(explicitTokens);
    if (queryTokens.size === 0) return { results: [] };

    const rows = await this.#repository.findAll();
    const products = (Array.isArray(rows) ? rows : [])
      .map((row) => this.#mapProduct(row))
      .filter((p) => p !== null);

    const scored = products
      .map((product) => ({
        product,
        score: this.#score(product, queryTokens, explicitTokens),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return { results: scored.map((r) => r.product) };
  }

  #mapProduct(row) {
    if (!row || row.is_active === false) return null;
    return {
      id: row.id,
      name: row.name || "",
      brand: row.brand || "",
      category: row.category || "",
      price: Number(row.price) || 0,
      currency: row.currency || "ARS",
      stock: Number(row.stock) || 0,
      available: Number(row.stock) > 0,
    };
  }

  #score(product, queryTokens, explicitTokens) {
    const nameRawTokens = new Set(this.#tokenize(product.name));
    const brandRawTokens = new Set(this.#tokenize(product.brand));
    const categoryRawTokens = new Set(this.#tokenize(product.category));
    const allRawTokens = new Set([
      ...nameRawTokens,
      ...brandRawTokens,
      ...categoryRawTokens,
    ]);

    const nameTokens = this.#expandTokens(nameRawTokens);
    const brandTokens = this.#expandTokens(brandRawTokens);
    const categoryTokens = this.#expandTokens(categoryRawTokens);
    const allTokens = new Set([
      ...nameTokens,
      ...brandTokens,
      ...categoryTokens,
    ]);

    const productColorsRaw = new Set(
      [...allRawTokens].filter((t) => COLOR_TOKENS.has(t)),
    );
    const productMaterialsRaw = new Set(
      [...allRawTokens].filter((t) => MATERIAL_TOKENS.has(t)),
    );
    const specificMaterials = new Set(
      [...productMaterialsRaw].filter((t) => t !== "filamento"),
    );

    let matched = 0;
    let score = 0;
    for (const et of explicitTokens) {
      const isColor = COLOR_TOKENS.has(et);
      const isMaterial = MATERIAL_TOKENS.has(et);

      if (isColor || isMaterial) {
        const attrScore = this.#scoreAttribute(
          et,
          isColor,
          isMaterial,
          nameRawTokens,
          nameTokens,
          brandTokens,
          categoryTokens,
          productColorsRaw,
          productMaterialsRaw,
          specificMaterials,
        );
        if (attrScore === null) return 0;
        score += attrScore;
        matched += 1;
        continue;
      }

      if (nameTokens.has(et)) {
        score += 4;
        matched += 1;
        continue;
      }
      if (brandTokens.has(et)) {
        score += 3;
        matched += 1;
        continue;
      }
      if (categoryTokens.has(et)) {
        score += 2;
        matched += 1;
        continue;
      }
      let partial = false;
      for (const t of allTokens) {
        if (t.startsWith(et) || et.startsWith(t)) {
          score += 1;
          matched += 1;
          partial = true;
          break;
        }
      }
      if (!partial) return 0;
    }

    for (const qt of queryTokens) {
      if (explicitTokens.has(qt)) continue;
      if (allTokens.has(qt)) score += 2;
    }

    if (matched < explicitTokens.size) return 0;
    return score;
  }

  #scoreAttribute(
    token,
    isColor,
    isMaterial,
    nameRawTokens,
    nameTokens,
    brandTokens,
    categoryTokens,
    productColorsRaw,
    productMaterialsRaw,
    specificMaterials,
  ) {
    if (nameRawTokens.has(token)) {
      return 4 + (isColor ? COLOR_MATCH_BONUS : MATERIAL_MATCH_BONUS);
    }
    if (categoryTokens.has(token) || brandTokens.has(token)) {
      return 2 + (isColor ? COLOR_MATCH_BONUS : MATERIAL_MATCH_BONUS);
    }
    if (isMaterial && specificMaterials.size === 0 && nameTokens.has(token)) {
      return 4 + MATERIAL_MATCH_BONUS;
    }
    if (isMaterial && specificMaterials.size > 0) {
      return -MATERIAL_CONFLICT_PENALTY;
    }
    if (isColor && productColorsRaw.size > 0) {
      return -COLOR_CONFLICT_PENALTY;
    }
    return null;
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
      .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
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
