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
  "tenes",
  "tenemos",
  "cambiar",
  "cambio",
  "cambie",
  "cambian",
  "arreglar",
  "arreglo",
  "reparar",
  "reparacion",
  "repuesto",
  "repuestos",
  "hay",
  "hacer",
  "puedo",
  "podes",
  "podemos",
  "pueden",
  "cuando",
  "donde",
  "como",
  "cualquier",
  "ver",
  "buscar",
  "dame",
  "pasame",
  "informacion",
  "tipos",
  "tipo",
  "opciones",
  "opcion",
]);

export class PriceService {
  #queryFn;
  #knowledgeGraph;

  constructor(options = {}) {
    this.#queryFn = options.queryFn;
    if (!this.#queryFn) {
      throw new Error("PriceService: queryFn is required");
    }
    this.#knowledgeGraph = options.knowledgeGraph || null;
  }

  async search(rawQuery) {
    if (!rawQuery || typeof rawQuery !== "string") return [];

    const queryTokens = this.#tokenize(rawQuery);
    if (queryTokens.length === 0) return [];

    const [prices, services] = await Promise.all([
      this.#queryFn("prices", {
        select: "id,service_id,label,amount,currency",
        eq: { is_active: "true" },
      }),
      this.#queryFn("services", { select: "id,name" }),
    ]);

    const serviceNames = new Map(
      (Array.isArray(services) ? services : []).map((s) => [
        String(s.id),
        s.name,
      ]),
    );

    const entries = (Array.isArray(prices) ? prices : []).map((p) => ({
      service: serviceNames.get(String(p.service_id)) || "",
      label: p.label || "",
      amount: Number(p.amount),
      currency: p.currency || "ARS",
    }));

    let resolved = null;
    if (this.#knowledgeGraph) {
      try {
        resolved = await this.#knowledgeGraph.resolve(rawQuery);
      } catch {
        resolved = null;
      }
    }

    const scored = entries
      .map((entry) => ({
        entry,
        score: this.#score(entry, queryTokens, resolved),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return [];

    const best = scored[0].score;
    return scored.filter((r) => r.score === best).map((r) => r.entry);
  }

  #score(entry, queryTokens, resolved) {
    const serviceTokens = new Set(this.#tokenize(entry.service));
    const labelTokens = new Set(this.#tokenize(entry.label));
    const baseTokens = new Set([...serviceTokens, ...labelTokens]);

    let covered = baseTokens;
    if (resolved && this.#knowledgeGraph) {
      const labelN = this.#normalize(entry.label);
      const serviceN = this.#normalize(entry.service);
      const myEntities = resolved.entities.filter(
        (e) =>
          this.#normalize(e.name) === labelN ||
          this.#normalize(e.name) === serviceN,
      );
      if (myEntities.length === 0) return 0;

      covered = new Set(baseTokens);
      for (const entity of myEntities) {
        for (const t of this.#tokenize(entity.name)) covered.add(t);
      }
      covered = this.#knowledgeGraph.expandTokens(covered);
    }

    for (const qt of queryTokens) {
      if (!this.#isCovered(qt, covered)) return 0;
    }

    let score = 0;
    for (const qt of queryTokens) {
      if (serviceTokens.has(qt)) {
        score += 3;
        continue;
      }
      if (labelTokens.has(qt)) {
        score += 2;
        continue;
      }
      if (this.#isCovered(qt, covered)) score += 1;
    }
    return score;
  }

  #isCovered(token, covered) {
    if (covered.has(token)) return true;
    for (const t of covered) {
      if (t.startsWith(token) || token.startsWith(t)) return true;
    }
    return false;
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
