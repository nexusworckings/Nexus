const TOPIC_KEYWORDS = {
  business_hours: [
    "horario",
    "horarios",
    "atienden",
    "abren",
    "cierran",
    "abierto",
    "abrimos",
    "a que hora",
    "horas",
  ],
  address: [
    "direccion",
    "ubicacion",
    "donde estan",
    "donde queda",
    "quedan",
    "local",
    "calle",
    "como llegar",
  ],
  email: ["correo", "email", "mail", "escribirles"],
  phone: [
    "telefono",
    "numero de telefono",
    "numero",
    "whatsapp",
    "contacto",
    "llamar",
    "comunicarme",
  ],
  social_media: [
    "redes",
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "redes sociales",
  ],
  warranty: ["garantia", "garantias", "cobertura"],
  payment_methods: [
    "pago",
    "pagos",
    "tarjeta",
    "tarjetas",
    "efectivo",
    "transferencia",
    "abonar",
    "debito",
    "credito",
    "mercado pago",
    "medios de pago",
    "medio de pago",
  ],
  shipping: [
    "envio",
    "envios",
    "envian",
    "reparto",
    "delivery",
    "entrega",
    "reparten",
  ],
  repair_time: [
    "tarda",
    "tardan",
    "demora",
    "demoran",
    "cuanto tiempo",
    "tiempo de reparacion",
    "plazo",
    "tiempo estimado",
  ],
  brands: ["marca", "marcas", "fabricante", "trabajan con"],
};

const TABLE_SOURCES = {
  business_hours: {
    table: "hours",
    select: "day_of_week,day_name,open_time,close_time,is_closed",
    order: "day_of_week.asc",
    project: (r) => ({
      day: r.day_name,
      open: r.open_time || null,
      close: r.close_time || null,
      closed: !!r.is_closed,
    }),
  },
  address: {
    table: "address",
    select:
      "street,number,city,province,postal_code,country,maps_url,additional_info",
    single: true,
    project: (r) => ({
      street: r.street,
      number: r.number || "",
      city: r.city,
      province: r.province,
      postalCode: r.postal_code || "",
      country: r.country,
      mapsUrl: r.maps_url || "",
    }),
  },
  phone: {
    table: "phones",
    select: "label,number,is_whatsapp,country_code,sort_order",
    order: "sort_order.asc",
    project: (r) => ({
      label: r.label || "",
      number: r.number,
      whatsapp: !!r.is_whatsapp,
      countryCode: r.country_code || "+54",
    }),
  },
  email: {
    table: "emails",
    select: "label,email,sort_order",
    order: "sort_order.asc",
    project: (r) => ({ label: r.label || "", email: r.email }),
  },
  social_media: {
    table: "social_media",
    select: "platform,url,sort_order",
    order: "sort_order.asc",
    project: (r) => ({ platform: r.platform, url: r.url }),
  },
  warranty: {
    table: "warranties",
    select: "title,description,duration,terms",
    project: (r) => ({
      title: r.title,
      description: r.description || "",
      duration: r.duration || "",
      terms: r.terms || "",
    }),
  },
};

const FAQ_KEYWORDS = {
  payment_methods: [
    "pago",
    "pagos",
    "tarjeta",
    "tarjetas",
    "efectivo",
    "transferencia",
    "abonar",
    "debito",
    "credito",
    "mercado pago",
    "medios de pago",
  ],
  shipping: [
    "envio",
    "envios",
    "envian",
    "reparto",
    "delivery",
    "entrega",
    "reparten",
  ],
  repair_time: [
    "tarda",
    "tardan",
    "demora",
    "demoran",
    "cuanto tiempo",
    "tiempo de reparacion",
    "plazo",
    "tiempo estimado",
  ],
  brands: ["marca", "marcas", "fabricante", "fabricantes"],
};

export class BusinessInfoService {
  #queryFn;
  #knowledgeGraph;

  constructor(options = {}) {
    this.#queryFn = options.queryFn;
    if (!this.#queryFn)
      throw new Error("BusinessInfoService: queryFn is required");
    this.#knowledgeGraph = options.knowledgeGraph || null;
  }

  async search(rawQuery) {
    if (!rawQuery || typeof rawQuery !== "string")
      return { topic: null, value: [] };
    const topic = this.#classify(rawQuery);
    if (!topic) return { topic: null, value: [] };

    if (topic === "brands" && this.#knowledgeGraph) {
      const brands = await this.#resolveBrands(rawQuery);
      if (brands !== null) return { topic, value: brands };
    }

    const value = await this.#load(topic);
    return { topic, value };
  }

  async #resolveBrands(rawQuery) {
    try {
      const resolved = await this.#knowledgeGraph.resolve(rawQuery);
      const brands = resolved.entities.filter((e) => e.type === "brand");
      if (brands.length === 0) return null;
      return brands.map((b) => ({ name: b.name }));
    } catch {
      return null;
    }
  }

  #classify(query) {
    const n = this.#normalize(query);
    if (!n) return null;
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some((k) => n.includes(k))) return topic;
    }
    return null;
  }

  async #load(topic) {
    if (FAQ_KEYWORDS[topic]) return this.#loadFaqs(FAQ_KEYWORDS[topic]);
    const source = TABLE_SOURCES[topic];
    if (!source) return [];
    const opts = { select: source.select };
    if (source.order) opts.order = source.order;
    if (!source.single) opts.eq = { is_active: "true" };
    const rows = await this.#queryFn(source.table, opts);
    const list = Array.isArray(rows) ? rows : [];
    if (source.single) {
      if (list.length === 0) return null;
      if (list.length > 0) return source.project(list[0]);
      return null;
    }
    return list.map(source.project);
  }

  async #loadFaqs(keywords) {
    const rows = await this.#queryFn("faqs", {
      select: "question,answer,category,sort_order",
      eq: { is_active: "true" },
      order: "sort_order.asc",
    });
    const list = Array.isArray(rows) ? rows : [];
    return list
      .filter((faq) => {
        const q = this.#normalize(faq.question);
        return keywords.some((k) => q.includes(k));
      })
      .map((faq) => ({
        question: faq.question,
        answer: faq.answer,
        category: faq.category || "",
      }));
  }

  #normalize(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}
