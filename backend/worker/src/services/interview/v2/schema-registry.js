import Ajv from 'ajv/dist/ajv.js';
import addFormats from 'ajv-formats';
import draft2020Schema from 'ajv/dist/refs/json-schema-2020-12/index.js';

import {
  ATOMIC_OPERATORS,
  SPECIAL_PLACEHOLDERS,
  VALID_TEMPLATE_SUFFIXES,
  PLACEHOLDER_RE,
} from './constants.js';
import { deepFreeze } from './utils.js';
import { SchemaError } from './errors.js';
import { BUILT_IN_SCHEMAS, META_SCHEMA } from './schema-index.js';

export class SchemaRegistry {
  #cache;
  #ajv;
  #metaSchemaId;
  #skipValidation;

  constructor(options = {}) {
    this.#cache = new Map();
    // schemasDir option is kept for API compatibility but ignored;
    // schemas are now bundled as static ES module imports.
    void options.schemasDir;
    this.#skipValidation = options.skipValidation || false;
    this.#ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.#ajv);
    this.#metaSchemaId = null;
  }

  async load(serviceId) {
    if (this.#cache.has(serviceId)) {
      return this.#cache.get(serviceId);
    }

    const schema = await this.#loadBuiltIn(serviceId);

    if (!this.#skipValidation) {
      await this.#ensureMetaSchema();
      this.#validateMeta(schema, serviceId);
      this.#validateRelational(schema, serviceId);
    }

    const frozen = deepFreeze(schema);
    this.#cache.set(serviceId, frozen);

    return frozen;
  }

  async list() {
    return Object.keys(BUILT_IN_SCHEMAS);
  }

  register(schema) {
    const serviceId = schema.serviceId;
    if (!serviceId) {
      throw new SchemaError('SCHEMA_INVALID_SERVICE_ID', 'Schema must have a serviceId', null);
    }

    this.#validateMeta(schema, serviceId);
    this.#validateRelational(schema, serviceId);

    const frozen = deepFreeze(schema);
    this.#cache.set(serviceId, frozen);
    return frozen;
  }

  clear() {
    this.#cache.clear();
  }

  async #ensureMetaSchema() {
    if (this.#metaSchemaId) return;

    this.#ajv.addSchema(draft2020Schema, 'https://json-schema.org/draft/2020-12/schema');

    this.#metaSchemaId = META_SCHEMA.$id;
    this.#ajv.addSchema(META_SCHEMA, this.#metaSchemaId);
  }

  async #loadBuiltIn(serviceId) {
    if (typeof serviceId !== 'string' || !/^[a-z][a-zA-Z0-9_-]*$/.test(serviceId)) {
      throw new SchemaError(
        'SCHEMA_INVALID_SERVICE_ID',
        `Invalid serviceId format: '${serviceId}'`,
        serviceId
      );
    }

    const schema = BUILT_IN_SCHEMAS[serviceId];
    if (!schema) {
      throw new SchemaError(
        'SCHEMA_NOT_FOUND',
        `Schema not found for service: '${serviceId}'`,
        serviceId
      );
    }

    return schema;
  }

  #validateMeta(schema, serviceId) {
    const validate = this.#ajv.getSchema(this.#metaSchemaId);
    if (!validate) {
      throw new SchemaError(
        'SCHEMA_META_NOT_READY',
        'Meta-schema not compiled',
        serviceId
      );
    }

    if (!validate(schema)) {
      const errors = validate.errors.map(e =>
        `${e.instancePath || '/'}: ${e.message}`
      ).join('; ');
      throw new SchemaError(
        'SCHEMA_META_VALIDATION_FAILED',
        `Schema '${serviceId}' failed meta-schema validation: ${errors}`,
        serviceId
      );
    }
  }

  #validateRelational(schema, serviceId) {
    const fields = schema.fields;
    const fieldIds = new Set();

    // --- C1: Unique field IDs ---
    for (const field of fields) {
      if (fieldIds.has(field.id)) {
        throw new SchemaError(
          'SCHEMA_DUPLICATE_FIELD_ID',
          `Duplicate field ID: '${field.id}'`,
          serviceId,
          `fields[].id = "${field.id}"`
        );
      }
      fieldIds.add(field.id);
    }

    // --- C2: Unique option values per field ---
    for (const field of fields) {
      if (!field.options) continue;
      const seen = new Set();
      for (const opt of field.options) {
        if (seen.has(opt.value)) {
          throw new SchemaError(
            'SCHEMA_DUPLICATE_OPTION_VALUE',
            `Duplicate option value '${opt.value}' in field '${field.id}'`,
            serviceId,
            `fields[${field.id}].options[].value`
          );
        }
        seen.add(opt.value);
      }
    }

    // --- C3: fieldOrder completeness and no duplicates ---
    if (schema.fieldOrder) {
      const orderSeen = new Set();
      for (const id of schema.fieldOrder) {
        if (!fieldIds.has(id)) {
          throw new SchemaError(
            'SCHEMA_FIELDORDER_UNKNOWN_ID',
            `fieldOrder references '${id}' which is not a defined field`,
            serviceId,
            'fieldOrder'
          );
        }
        if (orderSeen.has(id)) {
          throw new SchemaError(
            'SCHEMA_FIELDORDER_DUPLICATE',
            `fieldOrder contains duplicate ID '${id}'`,
            serviceId,
            'fieldOrder'
          );
        }
        orderSeen.add(id);
      }

      if (schema.fieldOrder.length !== fieldIds.size) {
        throw new SchemaError(
          'SCHEMA_FIELDORDER_MISMATCH',
          `fieldOrder has ${schema.fieldOrder.length} entries but ${fieldIds.size} fields defined`,
          serviceId,
          'fieldOrder'
        );
      }
    }

    // --- Helper: collect field references from a condition ---
    const collectRefs = (cond) => {
      const refs = new Set();
      if (!cond || typeof cond !== 'object' || Array.isArray(cond)) return refs;

      for (const [operator, params] of Object.entries(cond)) {
        if (ATOMIC_OPERATORS.includes(operator)) {
          if (params && typeof params === 'object' && typeof params.field === 'string') {
            refs.add(params.field);
          }
        } else if (operator === 'not') {
          collectRefs(params).forEach(r => refs.add(r));
        } else if (['and', 'or'].includes(operator) && Array.isArray(params)) {
          params.forEach(c => collectRefs(c).forEach(r => refs.add(r)));
        }
      }

      return refs;
    };

    // --- Helper: get dependency field IDs for a field ---
    const getDeps = (field) => {
      const deps = new Set();
      if (!field.dependsOn) return deps;

      if (Array.isArray(field.dependsOn)) {
        field.dependsOn.forEach(id => deps.add(id));
      } else {
        collectRefs(field.dependsOn).forEach(r => deps.add(r));
      }

      return deps;
    };

    // --- C6/C7: dependsOn and skipIf reference validity ---
    for (const field of fields) {
      if (field.dependsOn) {
        const deps = getDeps(field);
        for (const ref of deps) {
          if (!fieldIds.has(ref)) {
            throw new SchemaError(
              'SCHEMA_UNKNOWN_REFERENCE',
              `dependsOn in field '${field.id}' references unknown field '${ref}'`,
              serviceId,
              `fields[${field.id}].dependsOn`
            );
          }
        }
      }

      if (field.skipIf) {
        const refs = collectRefs(field.skipIf);
        for (const ref of refs) {
          if (!fieldIds.has(ref)) {
            throw new SchemaError(
              'SCHEMA_UNKNOWN_REFERENCE',
              `skipIf in field '${field.id}' references unknown field '${ref}'`,
              serviceId,
              `fields[${field.id}].skipIf`
            );
          }
        }
      }
    }

    // --- C8: Inference target and condition reference validity ---
    if (schema.inferences) {
      for (let i = 0; i < schema.inferences.length; i++) {
        const inf = schema.inferences[i];

        const whenRefs = collectRefs(inf.when);
        for (const ref of whenRefs) {
          if (!fieldIds.has(ref)) {
            throw new SchemaError(
              'SCHEMA_UNKNOWN_REFERENCE',
              `inferences[${i}].when references unknown field '${ref}'`,
              serviceId,
              `inferences[${i}].when`
            );
          }
        }

        for (const targetId of Object.keys(inf.then)) {
          if (!fieldIds.has(targetId)) {
            throw new SchemaError(
              'SCHEMA_UNKNOWN_REFERENCE',
              `inferences[${i}].then references unknown field '${targetId}'`,
              serviceId,
              `inferences[${i}].then["${targetId}"]`
            );
          }
        }
      }
    }

    // --- C9: No circular dependsOn ---
    const depGraph = {};
    for (const field of fields) {
      depGraph[field.id] = getDeps(field);
    }

    const detectCycle = (graph, nodes, errorCode, cycleLabel) => {
      const visited = new Set();
      const inStack = new Set();

      const dfs = (node, path) => {
        visited.add(node);
        inStack.add(node);

        for (const neighbor of graph[node] || []) {
          if (!visited.has(neighbor)) {
            dfs(neighbor, [...path, neighbor]);
          } else if (inStack.has(neighbor)) {
            const cycle = [...path, neighbor].join(' → ');
            throw new SchemaError(
              errorCode,
              `${cycleLabel} cycle detected: ${cycle}`,
              serviceId
            );
          }
        }

        inStack.delete(node);
      };

      for (const node of nodes) {
        if (!visited.has(node)) {
          dfs(node, [node]);
        }
      }
    };

    detectCycle(depGraph, [...fieldIds], 'SCHEMA_DEPENDENCY_CYCLE', 'Dependency');

    // --- C10: No circular inferences ---
    if (schema.inferences) {
      const infGraph = {};
      for (const f of fields) {
        infGraph[f.id] = new Set();
      }

      for (const inf of schema.inferences) {
        const whenRefs = collectRefs(inf.when);
        const thenTargets = Object.keys(inf.then);
        for (const ref of whenRefs) {
          for (const target of thenTargets) {
            infGraph[ref].add(target);
          }
        }
      }

      detectCycle(infGraph, [...fieldIds], 'SCHEMA_INFERENCE_CYCLE', 'Inference');
    }

    // --- C5: minimumRequired feasibility ---
    if (schema.minimumRequired !== undefined) {
      if (schema.minimumRequired > fields.length) {
        throw new SchemaError(
          'SCHEMA_MINIMUM_REQUIRED_UNREACHABLE',
          `minimumRequired (${schema.minimumRequired}) exceeds total fields (${fields.length})`,
          serviceId,
          'minimumRequired'
        );
      }

      if (schema.minimumRequired < 1) {
        throw new SchemaError(
          'SCHEMA_MINIMUM_REQUIRED_UNREACHABLE',
          `minimumRequired must be at least 1, got ${schema.minimumRequired}`,
          serviceId,
          'minimumRequired'
        );
      }
    }

    // --- Valid regex in validation.pattern ---
    for (const field of fields) {
      if (field.validation && typeof field.validation.pattern === 'string') {
        try {
          new RegExp(field.validation.pattern);
        } catch (err) {
          throw new SchemaError(
            'SCHEMA_INVALID_REGEX',
            `Field '${field.id}' has invalid regex pattern: ${err.message}`,
            serviceId,
            `fields[${field.id}].validation.pattern`
          );
        }
      }
    }

    // --- Template placeholders reference existing fields ---
    const templates = [];
    if (typeof schema.summaryTemplate === 'string') {
      templates.push({ name: 'summaryTemplate', text: schema.summaryTemplate });
    }
    if (typeof schema.whatsappTemplate === 'string') {
      templates.push({ name: 'whatsappTemplate', text: schema.whatsappTemplate });
    }

    for (const tpl of templates) {
      PLACEHOLDER_RE.lastIndex = 0;
      let match;
      while ((match = PLACEHOLDER_RE.exec(tpl.text)) !== null) {
        const name = match[1];
        const suffix = match[2];

        if (SPECIAL_PLACEHOLDERS.includes(name)) continue;

        if (!fieldIds.has(name)) {
          throw new SchemaError(
            'SCHEMA_TEMPLATE_UNKNOWN_FIELD',
            `Template '${tpl.name}' references unknown field '${name}'`,
            serviceId,
            tpl.name
          );
        }

        if (suffix && !VALID_TEMPLATE_SUFFIXES.includes(suffix)) {
          throw new SchemaError(
            'SCHEMA_TEMPLATE_INVALID_SUFFIX',
            `Template '${tpl.name}' uses invalid suffix ':${suffix}' for field '${name}'`,
            serviceId,
            tpl.name
          );
        }
      }
    }
  }
}
