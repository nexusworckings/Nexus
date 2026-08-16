import { describe, it, expect, vi } from "vitest";
import { BusinessInfoService } from "./business-info-service.js";
import { BusinessKnowledgeGraph } from "./business-knowledge-graph.js";

const HOURS = [
  {
    day_of_week: 0,
    day_name: "Domingo",
    open_time: null,
    close_time: null,
    is_closed: true,
  },
  {
    day_of_week: 1,
    day_name: "Lunes",
    open_time: "09:00",
    close_time: "19:00",
    is_closed: false,
  },
  {
    day_of_week: 6,
    day_name: "Sábado",
    open_time: "10:00",
    close_time: "14:00",
    is_closed: false,
  },
];

const ADDRESS = [
  {
    id: 1,
    street: "Av. General Acha",
    number: "123",
    city: "San Juan",
    province: "San Juan",
    postal_code: "J5400",
    country: "Argentina",
    maps_url: "https://goo.gl/maps/ejemplo",
    additional_info: "Local 4",
    notes: "ok",
  },
];

const PHONES = [
  {
    label: "WhatsApp",
    number: "264 123-4567",
    is_whatsapp: true,
    country_code: "+54",
    sort_order: 1,
  },
  {
    label: "Teléfono fijo",
    number: "0264 422-1234",
    is_whatsapp: false,
    country_code: "+54",
    sort_order: 2,
  },
];

const EMAILS = [
  { label: "Consultas", email: "info@tecnosanjuan.com", sort_order: 1 },
];

const SOCIAL_MEDIA = [
  {
    platform: "Instagram",
    url: "https://instagram.com/tecnosanjuan",
    sort_order: 1,
  },
  {
    platform: "Facebook",
    url: "https://facebook.com/tecnosanjuan",
    sort_order: 2,
  },
];

const WARRANTIES = [
  {
    title: "Garantía en reparaciones",
    description: "Cubre repuestos instalados",
    duration: "6 meses",
    duration_days: 180,
    terms: "No cubre mal uso",
    is_active: true,
  },
];

const FAQS = [
  {
    question: "¿Cuánto tiempo tarda una reparación?",
    answer:
      "Depende del tipo de reparación. Las simples se realizan en el día, las complejas entre 24 y 48 horas.",
    category: "Reparaciones",
    sort_order: 1,
    is_active: true,
  },
  {
    question: "¿Hacen envíos?",
    answer: "Sí, realizamos envíos dentro de la provincia de San Juan.",
    category: "General",
    sort_order: 2,
    is_active: true,
  },
  {
    question: "¿Aceptan tarjetas de crédito?",
    answer:
      "Sí, aceptamos todas las tarjetas de crédito y débito. También transferencias bancarias, Mercado Pago y efectivo.",
    category: "Medios de pago",
    sort_order: 3,
    is_active: true,
  },
];

function makeService({
  hours,
  address,
  phones,
  emails,
  socialMedia,
  warranties,
  faqs,
} = {}) {
  const queryFn = vi.fn(async (table, opts) => {
    if (table === "hours") return hours || [];
    if (table === "address") return address || [];
    if (table === "phones") return phones || [];
    if (table === "emails") return emails || [];
    if (table === "social_media") return socialMedia || [];
    if (table === "warranties") return warranties || [];
    if (table === "faqs") return faqs || [];
    return [];
  });
  return { service: new BusinessInfoService({ queryFn }), queryFn };
}

describe("BusinessInfoService", () => {
  describe("constructor", () => {
    it("rejects missing queryFn", () => {
      expect(() => new BusinessInfoService()).toThrow("queryFn is required");
    });

    it("accepts valid options", () => {
      expect(
        new BusinessInfoService({ queryFn: async () => [] }),
      ).toBeInstanceOf(BusinessInfoService);
    });
  });

  describe("search", () => {
    it("classifies horarios and returns structured hours array", async () => {
      const { service } = makeService({ hours: HOURS });
      const result = await service.search("¿Cuáles son sus horarios?");
      expect(result.topic).toBe("business_hours");
      expect(result.value).toEqual([
        { day: "Domingo", open: null, close: null, closed: true },
        { day: "Lunes", open: "09:00", close: "19:00", closed: false },
        { day: "Sábado", open: "10:00", close: "14:00", closed: false },
      ]);
    });

    it("classifies dirección and returns single address object", async () => {
      const { service } = makeService({ address: ADDRESS });
      const result = await service.search("¿Dónde están ubicados?");
      expect(result.topic).toBe("address");
      expect(result.value).toEqual({
        street: "Av. General Acha",
        number: "123",
        city: "San Juan",
        province: "San Juan",
        postalCode: "J5400",
        country: "Argentina",
        mapsUrl: "https://goo.gl/maps/ejemplo",
      });
    });

    it("classifies teléfono and returns phones array", async () => {
      const { service } = makeService({ phones: PHONES });
      const result = await service.search("¿Cuál es el teléfono de contacto?");
      expect(result.topic).toBe("phone");
      expect(result.value).toEqual([
        {
          label: "WhatsApp",
          number: "264 123-4567",
          whatsapp: true,
          countryCode: "+54",
        },
        {
          label: "Teléfono fijo",
          number: "0264 422-1234",
          whatsapp: false,
          countryCode: "+54",
        },
      ]);
    });

    it("classifies redes sociales and returns social media array", async () => {
      const { service } = makeService({ socialMedia: SOCIAL_MEDIA });
      const result = await service.search("¿Qué redes sociales tienen?");
      expect(result.topic).toBe("social_media");
      expect(result.value).toEqual([
        { platform: "Instagram", url: "https://instagram.com/tecnosanjuan" },
        { platform: "Facebook", url: "https://facebook.com/tecnosanjuan" },
      ]);
    });

    it("classifies garantía and returns warranties array", async () => {
      const { service } = makeService({ warranties: WARRANTIES });
      const result = await service.search("¿Tienen garantía?");
      expect(result.topic).toBe("warranty");
      expect(result.value).toEqual([
        {
          title: "Garantía en reparaciones",
          description: "Cubre repuestos instalados",
          duration: "6 meses",
          terms: "No cubre mal uso",
        },
      ]);
    });

    it("classifies medios de pago and returns matching faqs", async () => {
      const { service } = makeService({ faqs: FAQS });
      const result = await service.search("¿Qué medios de pago aceptan?");
      expect(result.topic).toBe("payment_methods");
      expect(result.value).toHaveLength(1);
      expect(result.value[0].question).toContain("tarjetas");
      expect(result.value[0].answer).toContain("Mercado Pago");
    });

    it("classifies marcas and returns empty when no faq about brands", async () => {
      const { service } = makeService({ faqs: FAQS });
      const result = await service.search("¿Qué marcas trabajan?");
      expect(result.topic).toBe("brands");
      expect(result.value).toEqual([]);
    });

    it("resolves a specific brand through the knowledge graph when present", async () => {
      const knowledgeGraph = new BusinessKnowledgeGraph({
        sources: {
          services: [{ id: 1, name: "Cambio de pantalla" }],
          prices: [{ id: 1, service_id: 1, label: "Motorola G32" }],
          products: [],
        },
      });
      const queryFn = vi.fn(async (table) => {
        if (table === "faqs") return FAQS;
        return [];
      });
      const service = new BusinessInfoService({ queryFn, knowledgeGraph });

      const result = await service.search("¿Trabajan con motorola?");

      expect(result.topic).toBe("brands");
      expect(result.value).toEqual([{ name: "Motorola" }]);
      expect(queryFn).not.toHaveBeenCalled();
    });

    it("falls back to faqs when the graph resolves no brands", async () => {
      const knowledgeGraph = new BusinessKnowledgeGraph({
        sources: { services: [], prices: [], products: [] },
      });
      const queryFn = vi.fn(async (table) => {
        if (table === "faqs") return FAQS;
        return [];
      });
      const service = new BusinessInfoService({ queryFn, knowledgeGraph });

      const result = await service.search("¿Qué marcas trabajan?");

      expect(result.topic).toBe("brands");
      expect(result.value).toEqual([]);
      expect(queryFn).toHaveBeenCalledWith("faqs", {
        select: "question,answer,category,sort_order",
        eq: { is_active: "true" },
        order: "sort_order.asc",
      });
    });

    it("falls back to faqs when the graph resolve throws", async () => {
      const knowledgeGraph = {
        resolve: vi.fn().mockRejectedValue(new Error("boom")),
      };
      const queryFn = vi.fn(async (table) => {
        if (table === "faqs") return FAQS;
        return [];
      });
      const service = new BusinessInfoService({ queryFn, knowledgeGraph });

      const result = await service.search("¿Qué marcas trabajan?");

      expect(result.topic).toBe("brands");
      expect(result.value).toEqual([]);
    });

    it("classifies tiempos de reparación and returns matching faq", async () => {
      const { service } = makeService({ faqs: FAQS });
      const result = await service.search(
        "¿Cuánto tiempo tarda una reparación?",
      );
      expect(result.topic).toBe("repair_time");
      expect(result.value).toHaveLength(1);
      expect(result.value[0].question).toContain("tiempo");
      expect(result.value[0].answer).toContain("Depende");
    });

    it("classifies envíos and returns matching faq", async () => {
      const { service } = makeService({ faqs: FAQS });
      const result = await service.search("¿Hacen envíos?");
      expect(result.topic).toBe("shipping");
      expect(result.value).toHaveLength(1);
      expect(result.value[0].question).toContain("envíos");
    });

    it("returns topic null for unrecognized queries (consulta inexistente)", async () => {
      const { service } = makeService();
      const result = await service.search("Hola");
      expect(result.topic).toBeNull();
      expect(result.value).toEqual([]);
    });

    it("classifies email and returns emails array", async () => {
      const { service } = makeService({ emails: EMAILS });
      const result = await service.search("¿Cuál es el correo de contacto?");
      expect(result.topic).toBe("email");
      expect(result.value).toEqual([
        { label: "Consultas", email: "info@tecnosanjuan.com" },
      ]);
    });

    it("queries hours with is_active filter and correct options", async () => {
      const { service, queryFn } = makeService({ hours: HOURS });
      await service.search("horarios");
      expect(queryFn).toHaveBeenCalledWith("hours", {
        select: "day_of_week,day_name,open_time,close_time,is_closed",
        order: "day_of_week.asc",
        eq: { is_active: "true" },
      });
    });

    it("never exposes internal fields", async () => {
      const { service } = makeService({ hours: HOURS });
      const result = await service.search("horarios");
      for (const day of result.value) {
        expect(day.day_of_week).toBeUndefined();
        expect(day.is_active).toBeUndefined();
      }
    });

    it("returns empty for empty or invalid input", async () => {
      const { service } = makeService();
      await expect(service.search("")).resolves.toEqual({
        topic: null,
        value: [],
      });
      await expect(service.search(null)).resolves.toEqual({
        topic: null,
        value: [],
      });
      await expect(service.search(undefined)).resolves.toEqual({
        topic: null,
        value: [],
      });
      await expect(service.search(42)).resolves.toEqual({
        topic: null,
        value: [],
      });
    });

    it("queries faqs with is_active filter", async () => {
      const { service, queryFn } = makeService({ faqs: FAQS });
      await service.search("envíos");
      expect(queryFn).toHaveBeenCalledWith("faqs", {
        select: "question,answer,category,sort_order",
        eq: { is_active: "true" },
        order: "sort_order.asc",
      });
    });
  });
});
