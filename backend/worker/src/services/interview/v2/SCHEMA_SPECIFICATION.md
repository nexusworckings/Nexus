# Schema Specification — Interview V2

**Version:** 2.0
**Status:** FINAL
**Language:** RFC 2119 (MUST, MUST NOT, SHOULD, MAY)

---

## 1. Objective

This document defines the schema language for Interview V2. Every service
(Impresión 3D, Cartelería LED, and any future service) is described entirely
by a JSON document that conforms to this specification.

**First principle:** Adding a new service MUST require only creating a new JSON
file. No code modification is ever required to add, remove, or change a service.

---

## 2. Document Conventions

### 2.1 Terminology

| Term | Definition |
|---|---|---|
| **Schema** | A JSON document describing a single service |
| **Field** | A single piece of information collected during the interview |
| **Condition** | A structured JSON expression that evaluates to true or false |
| **PENDING** | A field that the system still needs to ask about |
| **BLOCKED** | A field whose dependencies are not yet satisfied |
| **SKIPPED** | A field permanently removed from the interview |
| **COMPLETED** | A field whose value has been collected or inferred |

### 2.2 Normative Keywords

| Keyword | Meaning |
|---|---|
| **MUST** | Absolute requirement. Violation invalidates the schema |
| **MUST NOT** | Absolute prohibition. Violation invalidates the schema |
| **SHOULD** | Strong recommendation. Deviation requires documented justification |
| **SHOULD NOT** | Strong discouragement. Deviation requires documented justification |
| **MAY** | Optional. Implementation choice |

### 2.3 Field ID Convention

A field ID is a string that MUST match the regular expression
`^[a-z][a-zA-Z0-9_]*$`. It MUST be unique within the schema.

---

## 3. Schema Structure

A service schema is a single JSON object with the following top-level sections:

```json
{
  "$schema": "https://nexus.tecno-sanjuan.com/interview/v2/service-schema.json",
  "serviceId": "impresion_3d",
  "serviceVersion": "1.0.0",
  "serviceName": "Impresión 3D",
  "description": "Cotización de piezas impresas en 3D",
  "updatedAt": "2026-07-26T00:00:00Z",
  "tags": ["3d", "impresion", "figura"],
  "fieldOrder": ["nombre", "telefono", "material", "color", "cantidad"],
  "minimumRequired": 3,
  "allowConcurrent": false,
  "fields": [],
  "inferences": [],
  "summaryTemplate": "",
  "whatsappTemplate": ""
}
```

### 3.1 Top-Level Properties

| Property | Required | Type | Description |
|---|---|---|---|
| `$schema` | REQUIRED | string (URI) | MUST be `"https://nexus.tecno-sanjuan.com/interview/v2/service-schema.json"` |
| `serviceId` | REQUIRED | string | Machine-readable identifier. MUST match `^[a-z][a-zA-Z0-9_]*$`. MUST be unique across all service schemas |
| `serviceVersion` | REQUIRED | string | Semver string (`MAJOR.MINOR.PATCH`). Incremented when the schema changes |
| `serviceName` | REQUIRED | string | Human-readable name. Displayed in summaries and WhatsApp messages |
| `description` | OPTIONAL | string | Short explanation of the service and when to offer it |
| `updatedAt` | REQUIRED | string (date-time) | ISO 8601 timestamp of last modification |
| `tags` | OPTIONAL | array<string> | Keywords for intent detection. Each tag MUST be non-empty |
| `fieldOrder` | OPTIONAL | array<string> | Explicit ordering of field IDs. If absent, the order in `fields` is used. If present, MUST contain exactly the same IDs as `fields` |
| `minimumRequired` | OPTIONAL | integer | Minimum number of fields that MUST be completed to finish. MUST be at least 1. If absent, all required fields MUST be completed |
| `allowConcurrent` | OPTIONAL | boolean | Whether a user MAY have multiple active interviews for this service simultaneously. Default: false |
| `fields` | REQUIRED | array<Field> | MUST contain at least one field. MUST NOT contain duplicate IDs |
| `inferences` | OPTIONAL | array<Inference> | Inference rules. MAY be empty |
| `summaryTemplate` | REQUIRED | string | Template rendered for the user when the interview completes |
| `whatsappTemplate` | REQUIRED | string | Template rendered for the WhatsApp message sent to the business |

---

## 4. Field Definition

A field is a JSON object that defines a single piece of information to collect.

### 4.1 Field Properties

```json
{
  "id": "material",
  "type": "select",
  "label": "Material",
  "question": "¿Qué material querés usar para tu pieza?",
  "required": true,
  "placeholder": "Seleccioná un material",
  "help": "PLA es el más común. ABS resiste más calor. PETG es para exteriores.",
  "examples": ["PLA", "ABS"],
  "errorMessage": "Por favor seleccioná un material válido.",
  "options": [
    { "value": "PLA", "label": "PLA (económico)" },
    { "value": "ABS", "label": "ABS (resistente al calor)" }
  ],
  "unit": "gramos",
  "validation": {
    "required": true,
    "min": 1,
    "max": 1000
  },
  "dependsOn": ["nombre"],
  "skipIf": { "eq": { "field": "tipo", "value": "consulta" } },
  "default": "PLA"
}
```

| Property | Required | Type | Description |
|---|---|---|---|---|
| `id` | REQUIRED | string | Unique identifier. MUST match `^[a-z][a-zA-Z0-9_]*$` |
| `type` | REQUIRED | string | MUST be one of: `text`, `number`, `boolean`, `select`, `multiselect`, `phone`, `email`, `image` |
| `label` | REQUIRED | string | Short human-readable name used in summaries and templates |
| `question` | REQUIRED | string | Default question to ask the user |
| `required` | OPTIONAL | boolean | Whether the field MUST have a value for the interview to complete. This value propagates as the default for `validation.required`. If `validation.required` is explicitly set, it takes precedence over field-level `required`. Default: true |
| `placeholder` | OPTIONAL | string | Example or hint text shown when asking the field |
| `help` | OPTIONAL | string | Extended explanation shown when the user needs assistance |
| `examples` | OPTIONAL | array<string> | Example values to guide the user |
| `errorMessage` | OPTIONAL | string | Custom message shown when validation fails. If absent, a default message is generated from the failing validation rule |
| `options` | CONDITIONAL | array<Option> | REQUIRED when type is `select` or `multiselect`. NOT allowed for other types |
| `unit` | OPTIONAL | string | Unit of measurement for display (e.g. "gramos", "mm", "unidades") |
| `validation` | OPTIONAL | object | Validation rules. See Section 6 |
| `dependsOn` | OPTIONAL | array<string> or Condition | Fields or condition that MUST be satisfied before this field can be asked. See Section 5 |
| `skipIf` | OPTIONAL | Condition | Condition that, when true, permanently removes this field. See Section 5 |
| `default` | OPTIONAL | any | Default value applied when the user provides no answer. The type MUST match the field type |

### 4.2 Field Types

#### `text`

Free-form text input. The stored value is a trimmed string.

```json
{ "id": "nombre", "type": "text", "label": "Nombre", "question": "¿Cuál es tu nombre?" }
```

#### `number`

Numeric input. The stored value is a number.

```json
{
  "id": "cantidad",
  "type": "number",
  "label": "Cantidad",
  "question": "¿Cuántas unidades necesitás?",
  "validation": { "min": 1, "max": 1000 }
}
```

#### `boolean`

Yes/no input. The stored value is `true` or `false`.

```json
{
  "id": "urgente",
  "type": "boolean",
  "label": "¿Es urgente?",
  "question": "¿Necesitás el trabajo para esta semana?",
  "required": false
}
```

#### `select`

Single selection from a list of options. The stored value is the selected option's `value`.

```json
{
  "id": "material",
  "type": "select",
  "label": "Material",
  "question": "¿Qué material querés?",
  "options": [
    { "value": "PLA", "label": "PLA (económico)" },
    { "value": "ABS", "label": "ABS (resistente al calor)" }
  ]
}
```

#### `multiselect`

Multiple selections from a list of options. The stored value is an array of selected option `value` strings.

```json
{
  "id": "colores",
  "type": "multiselect",
  "label": "Colores",
  "question": "¿Qué colores querés?",
  "options": [
    { "value": "rojo", "label": "Rojo" },
    { "value": "azul", "label": "Azul" },
    { "value": "verde", "label": "Verde" }
  ]
}
```

#### `phone`

Phone number input. The stored value is a string containing only digits.

```json
{
  "id": "telefono",
  "type": "phone",
  "label": "Teléfono",
  "question": "¿Cuál es tu número de teléfono?",
  "validation": { "regex": "^\\d{10,13}$" }
}
```

#### `email`

Email address input. The stored value is a trimmed lowercase string.

```json
{
  "id": "email",
  "type": "email",
  "label": "Correo electrónico",
  "question": "¿Cuál es tu correo electrónico?",
  "required": false
}
```

#### `image`

Image reference input. The stored value is a URL string.

```json
{
  "id": "imagen_referencia",
  "type": "image",
  "label": "Imagen de referencia",
  "question": "¿Tenés una imagen de referencia?",
  "required": false
}
```

### 4.3 Option Object

Used inside `options` array for `select` and `multiselect` types.

```json
{
  "value": "PLA",
  "label": "PLA (económico)"
}
```

| Property | Required | Type | Description |
|---|---|---|---|
| `value` | REQUIRED | string | The stored value. MUST be non-empty. MUST be unique within the options array |
| `label` | OPTIONAL | string | Human-readable description. If absent, the `value` is used as label |

---

## 5. Condition Grammar

Conditions are structured JSON expressions evaluated against the current
set of completed field values. They are used in `dependsOn`, `skipIf`,
and inference `when` rules.

**String expressions are NOT allowed.** Conditions MUST always be expressed
as JSON objects using the operators defined below.

### 5.1 Evaluation Context

All conditions are evaluated against a context consisting of the current
completed field values:

```
context = { fieldId: resolvedValue }
```

If a referenced field ID does not exist in the context, the field is considered
to have no value. For atomic comparison operators (`eq`, `neq`, `gt`, `gte`,
`lt`, `lte`, `in`, `contains`, `matches`), a missing field causes the condition
to evaluate to `false`.

### 5.2 Atomic Operators

#### `exists`

Returns `true` if the field has a value.

```json
{ "exists": { "field": "material" } }
```

A field exists if its resolved value is not null, not undefined, and:
- For strings: after trimming, the length is greater than zero
- For numbers: the value is not null (zero IS a valid value and exists)
- For booleans: the value is not null (false IS a valid value and exists)
- For arrays: the array has at least one element
- For the `image` type: the URL string is non-empty after trimming

#### `eq`

Returns `true` if the field value equals the given value.

```json
{ "eq": { "field": "material", "value": "PLA" } }
```

Comparison is strict (`===`). For arrays, order-sensitive deep equality is used.

#### `neq`

Returns `true` if the field value does NOT equal the given value.

```json
{ "neq": { "field": "material", "value": "ABS" } }
```

If the referenced field has no value, this operator returns `false`.

#### `gt`

Returns `true` if the field value is strictly greater than the given value.

```json
{ "gt": { "field": "cantidad", "value": 10 } }
```

Both values MUST be numbers. If the field value is not a number, returns `false`.

#### `gte`

Returns `true` if the field value is greater than or equal to the given value.

```json
{ "gte": { "field": "cantidad", "value": 5 } }
```

#### `lt`

Returns `true` if the field value is strictly less than the given value.

```json
{ "lt": { "field": "cantidad", "value": 100 } }
```

#### `lte`

Returns `true` if the field value is less than or equal to the given value.

```json
{ "lte": { "field": "cantidad", "value": 50 } }
```

#### `in`

Returns `true` if the field value is in the given array.

```json
{ "in": { "field": "material", "values": ["PLA", "ABS", "PETG"] } }
```

The `values` array MUST contain at least one element.

#### `contains`

Returns `true` if the field value (a string) contains the given substring.

```json
{ "contains": { "field": "descripcion", "value": "urgente" } }
```

Case-sensitive. If the field value is not a string, returns `false`.

#### `matches`

Returns `true` if the field value matches the given regular expression.

```json
{ "matches": { "field": "telefono", "pattern": "^\\d{10}$" } }
```

The pattern is a valid regular expression. Must use JSON escaping (double backslashes).

### 5.3 Compound Operators

#### `not`

Negates a condition.

```json
{ "not": { "exists": { "field": "email" } } }
```

Returns `true` if the inner condition returns `false`.

#### `and`

Returns `true` if ALL conditions in the array return `true`. Short-circuits on the first `false`.

```json
{
  "and": [
    { "eq": { "field": "material", "value": "ABS" } },
    { "gte": { "field": "cantidad", "value": 5 } }
  ]
}
```

The array MUST contain at least one condition.

#### `or`

Returns `true` if AT LEAST ONE condition in the array returns `true`. Short-circuits on the first `true`.

```json
{
  "or": [
    { "eq": { "field": "material", "value": "ABS" } },
    { "eq": { "field": "material", "value": "PETG" } }
  ]
}
```

The array MUST contain at least one condition.

### 5.4 Operator Summary

| Operator | Type | Parameters | Returns |
|---|---|---|---|
| `exists` | Atomic | `{ field }` | `true` if field has a value |
| `eq` | Atomic | `{ field, value }` | `true` if field === value |
| `neq` | Atomic | `{ field, value }` | `true` if field !== value |
| `gt` | Atomic | `{ field, value }` | `true` if field > value |
| `gte` | Atomic | `{ field, value }` | `true` if field >= value |
| `lt` | Atomic | `{ field, value }` | `true` if field < value |
| `lte` | Atomic | `{ field, value }` | `true` if field <= value |
| `in` | Atomic | `{ field, values }` | `true` if field in values |
| `contains` | Atomic | `{ field, value }` | `true` if string contains substring |
| `matches` | Atomic | `{ field, pattern }` | `true` if string matches regex |
| `not` | Compound | `{ condition }` | Negation of inner condition |
| `and` | Compound | `{ conditions[] }` | `true` if all conditions true |
| `or` | Compound | `{ conditions[] }` | `true` if any condition true |

### 5.5 DependsOn

Specified as either an array of field IDs or a condition object.

**As array (shorthand):** Each field ID MUST have a value before this field
can be asked. Equivalent to wrapping all IDs in an `and` of `exists` conditions.

```json
{ "dependsOn": ["nombre", "telefono"] }
```

This is equivalent to:

```json
{
  "dependsOn": {
    "and": [
      { "exists": { "field": "nombre" } },
      { "exists": { "field": "telefono" } }
    ]
  }
}
```

**As condition object:** The condition MUST evaluate to `true` for the field
to be askable.

```json
{
  "dependsOn": {
    "eq": { "field": "entrega", "value": "envio" }
  }
}
```

If `dependsOn` evaluates to `false`, the field is BLOCKED. A blocked field is
not asked but remains available to become askable when the condition becomes
true due to new field values.

### 5.6 SkipIf

A condition that, when evaluated to `true`, permanently removes the field
from the interview.

```json
{
  "skipIf": { "eq": { "field": "tipo", "value": "consulta" } }
}
```

A skipped field:
- MUST NOT appear in pending fields
- MUST NOT be asked to the user
- Cannot become un-skipped. Once skipped, always skipped

### 5.7 Evaluation Order

When a field has both `skipIf` and `dependsOn`, `skipIf` MUST be evaluated first.
If `skipIf` evaluates to `true`, the field is SKIPPED and `dependsOn` is NOT
evaluated.

| skipIf | dependsOn | Result |
|---|---|---|
| `true` | any | SKIPPED (hard filter) |
| `false` | `true` | PENDING (askable) |
| `false` | `false` | BLOCKED |
| `false` | absent | PENDING |
| absent | `true` | PENDING |
| absent | `false` | BLOCKED |

---

## 6. Validation Rules

Validation rules are defined in a field's `validation` object. All rules are
OPTIONAL unless stated otherwise.

### 6.1 Validation Object

```json
{
  "validation": {
    "required": true,
    "enum": ["PLA", "ABS", "PETG"],
    "min": 1,
    "max": 1000,
    "minLength": 3,
    "maxLength": 50,
    "pattern": "^\\d{10,13}$"
  }
}
```

### 6.2 Supported Rules

| Rule | Applies To | Type | Description |
|---|---|---|---|
| `required` | All | boolean | If `true`, the field MUST have a value before the interview can complete. Default: same as the field-level `required` property |
| `enum` | select, multiselect, text | array | The value MUST be one of the listed values. For `select` fields with `options`, this is auto-populated from `options[].value` if not explicitly provided. For `multiselect`, every element of the value array MUST be in the enum |
| `min` | number | number | The value MUST be greater than or equal to this number |
| `max` | number | number | The value MUST be less than or equal to this number |
| `minLength` | text, phone, email, image | integer | The string length MUST be greater than or equal to this value |
| `maxLength` | text, phone, email, image | integer | The string length MUST be less than or equal to this value |
| `pattern` | text, phone, email | string | The value MUST match this regular expression |

### 6.3 Validation Behavior

- Rules are evaluated in the order listed above
- If `enum` is present and the field has `options`, the `enum` is auto-populated
  from `options[].value` only when `enum` is not explicitly set
- When any validation rule fails, the value is rejected and the user MUST be
  asked again for the same field
- Multiple validation errors MAY be returned. The first failing rule determines
  the error message

### 6.4 Error Messages

If the field has an `errorMessage` property, that message is used when ANY
validation rule fails for that field. If `errorMessage` is absent, a default
message is generated based on the first failing rule.

---

## 7. Inferences

Inference rules automatically fill field values based on other fields' values.
They allow the system to deduce information without asking the user.

### 7.1 Inference Structure

```json
{
  "inferences": [
    {
      "when": { "eq": { "field": "material", "value": "PLA" } },
      "then": {
        "color": { "value": "blanco" },
        "temperatura": { "value": 210 }
      },
      "priority": 10,
      "reason": "Por defecto, PLA se imprime en blanco a 210°C",
      "overridable": true
    }
  ]
}
```

| Property | Required | Type | Description |
|---|---|---|---|
| `when` | REQUIRED | Condition | Condition that triggers this inference |
| `then` | REQUIRED | object | Map of `fieldId` to `{ "value": T }`. Each field ID MUST exist in `fields` |
| `priority` | OPTIONAL | integer | Higher priority wins when multiple inferences target the same field. Default: 0. MAY be negative |
| `reason` | OPTIONAL | string | Human-readable explanation logged for debugging |
| `overridable` | OPTIONAL | boolean | Whether the user MAY change an inferred value. Default: `true` |

### 7.2 Conflict Resolution

When two inference rules target the same field:

1. The rule with the higher `priority` value wins
2. If priorities are equal, the rule appearing LAST in the `inferences` array wins
3. The losing rule's value is discarded. The system MUST log the conflict

### 7.3 Overridable Behavior

| overridable | User provided value? | Behavior |
|---|---|---|
| `true` | No | Inference value is applied as default. The field MAY remain pending to ask the user for confirmation |
| `true` | Yes | User's explicit value wins. Inference is NOT applied |
| `false` | No | Inference value is applied and locked. The field is removed from pending |
| `false` | Yes | Inference wins. User value is discarded. The user MUST be notified of the constraint |

### 7.4 Inference Evaluation Cycle

Inferences are re-evaluated each time a new value is added to completed fields.
The evaluation follows a breadth-first strategy:

1. All inference rules whose `when` condition is true are identified
2. All identified rules are applied simultaneously (same iteration)
3. If applying rules created new completed values, return to step 1
4. If no new rules apply or the maximum iteration count (20) is reached, stop

This ensures that a chain of inferences (A infers B, B infers C) is resolved
within the same evaluation cycle without requiring multiple user interactions.

### 7.5 Inferred Value Marking

When an inference rule produces a value:
- The field value is added to completed fields
- The history records the value as `inferred`
- If `overridable` is `true`, the field MAY still appear as pending (for user confirmation)
- If `overridable` is `false`, the field is removed from pending entirely

---

## 8. Templates

Templates are strings that produce text output by substituting placeholders
with collected field values. They are used in `summaryTemplate` (shown to
the user) and `whatsappTemplate` (sent to the business).

### 8.1 Placeholder Syntax

#### Simple placeholder

```
{{fieldId}}
```

Replaced with the resolved value of the field.

For `select` types, inserts the option's `value`.
For `multiselect` types, inserts values separated by ", ".
For all other types, inserts the raw value.

#### Label placeholder

```
{{fieldId:label}}
```

For `select` and `multiselect` types, replaces with the option's `label`
instead of its `value`. For other types, this is equivalent to `{{fieldId}}`.

#### Unit placeholder

```
{{fieldId:unit}}
```

Replaced with the field's `unit` property. If the field has no `unit`, replaced
with an empty string.

### 8.2 Special Placeholders

| Placeholder | Description |
|---|---|
| `{{serviceName}}` | The schema's `serviceName` |
| `{{interviewId}}` | Auto-generated unique identifier for this interview |
| `{{timestamp}}` | ISO 8601 timestamp rendered at summary generation time |
| `{{now}}` | Current date/time formatted for the locale |

### 8.3 Each Block

Iterates over all completed fields:

```
{{#each fields}}
- {{label}}: {{value}}
{{/each}}
```

Inside the block, `{{label}}` and `{{value}}` refer to the current field's
label and resolved value. `{{label}}` uses the option label for select types;
`{{value}}` uses the resolved value.

Nested `#each` blocks are NOT allowed.

### 8.4 Conditional Block

Shows content only when a condition is true:

```
{{#if fieldId == "value"}}
Content shown only when condition is met
{{/if}}
```

The condition supports only `==` (equality) comparison between a field ID and
a string literal. `{{#if}}` blocks MUST NOT be nested.

### 8.5 Missing Placeholder Behavior

| Scenario | Replacement |
|---|---|
| Field has a value | The resolved value |
| Field was skipped | `"(no aplica)"` |
| Field is required but not yet completed | `"(pendiente)"` |
| Field ID does not exist in the schema | `""` (empty string) |
| Placeholder references a non-existent suffix (`:nonexistent`) | `""` (empty string) |

### 8.6 Example Template

```
Resumen para {{nombre}}:
- Material: {{material:label}}
- Color: {{color:label}}
- Cantidad: {{cantidad}} unidades
- Teléfono: {{telefono}}

{{#each fields}}
  {{label}}: {{value}}
{{/each}}
```

---

## 9. Flow Semantics

### 9.1 Field States

Every field is in exactly one of these states at any point during the interview:

| State | Definition |
|---|---|
| **UNASKED** | The field has not yet been asked. It is available for asking |
| **ASKED** | The question has been sent to the user. Awaiting response |
| **COMPLETED** | A value has been provided by the user or inferred |
| **BLOCKED** | The field's `dependsOn` condition is not yet satisfied |
| **SKIPPED** | The field's `skipIf` condition is true. Permanently removed |
| **INVALID** | The user provided a value that failed validation. Awaiting retry |

### 9.2 Pending Fields

The pending set is the list of fields that are candidates for the next question.
It is derived from the field states:

1. Start with all field IDs from `fields`
2. Remove fields whose state is COMPLETED
3. Remove fields whose state is SKIPPED
4. Remove fields whose state is BLOCKED
5. The remaining fields are PENDING

A field becomes BLOCKED when its `dependsOn` condition evaluates to `false`.
A field that has no `dependsOn` and no value is unblocked and pending.

### 9.3 Next Question Determination

The next question is determined by:

1. Compute the pending set
2. Check interview completion (Section 9.5). If a completion condition is met,
   the interview ends and no question is returned
3. Apply `fieldOrder` if present, otherwise use the order in `fields`
4. Select the first field from the ordered list that is in the pending set

### 9.4 Blocked Fields Recovery

A BLOCKED field becomes unblocked when:

- A new value is added to completed fields
- The new value causes the field's `dependsOn` condition to evaluate to `true`

Blocked fields are re-evaluated every time any new value is added.

### 9.5 Interview Completion

The interview is complete when one of the following conditions is met:

**Condition A — All required fields completed:** Every field where `required`
is `true` has a value (either provided by the user or inferred with
`overridable: false`). Fields where `required` is `false` MAY remain
unanswered.

**Condition B — Minimum required reached:** If `minimumRequired` is defined,
at least that many fields have values. The user MUST confirm early termination
before the interview closes (e.g., by saying "finalizar" or "terminar").

**Condition C — No progress possible (BLOCKED):** The pending set is empty
but not all required fields are complete. This is a deadlock state where
blocked fields cannot be unblocked with the current values. The interview
does NOT complete. The system MUST inform the user which dependencies are
missing and ask the user to provide information that could unblock the
blocked fields. The interview remains active until progress is made or the
user explicitly abandons it.

### 9.6 Early Termination

A user may request to finish before all fields are completed. When this happens:

1. If `minimumRequired` is met, the interview completes immediately
2. If `minimumRequired` is NOT met, the system MUST inform the user how many
   more fields are needed and continue the interview

### 9.7 Response Changes

When a user provides a new value for a field that already has a value:

1. The field's value is updated in completed fields
2. The previous value is preserved in the history
3. All fields whose `dependsOn` referenced the changed field MUST be re-evaluated
4. All inference rules whose `when` referenced the changed field MUST be
   re-evaluated
5. Inferred values derived from the old value SHOULD be removed and the field
   SHOULD be returned to pending, unless the inference has `overridable: false`

---

## 10. Schema Constraints

Every service schema MUST satisfy ALL of the following constraints.

### 10.1 Structural Constraints

| # | Constraint | Description |
|---|---|---|
| C1 | Unique field IDs | Every `id` in `fields` MUST be unique |
| C2 | Unique option values | Every `value` in an option array MUST be unique within that array |
| C3 | FieldOrder completeness | If `fieldOrder` is present, it MUST contain exactly the same IDs as `fields`. The order of fields in `fieldOrder` MAY differ from the array order |
| C4 | Minimum field count | The `fields` array MUST contain at least one field |
| C5 | Minimum required feasibility | If `minimumRequired` is set, it MUST be less than or equal to the total number of fields minus the number of fields with a permanently true `skipIf` condition |
| C6 | DependsOn reference validity | Every field ID referenced in a `dependsOn` array or condition MUST exist in `fields` |
| C7 | SkipIf reference validity | Every field ID referenced in a `skipIf` condition MUST exist in `fields` |
| C8 | Inference target validity | Every field ID in `inference.then` MUST exist in `fields` |
| C9 | No circular dependsOn | The dependency graph formed by `dependsOn` MUST be a directed acyclic graph (DAG) |
| C10 | No circular inferences | Inference rules MUST NOT form a cycle where A infers B and B infers A |

### 10.2 Value Constraints

| # | Constraint | Description |
|---|---|---|
| V1 | Valid field type | `type` MUST be one of: `text`, `number`, `boolean`, `select`, `multiselect`, `phone`, `email`, `image` |
| V2 | Options required for select | If `type` is `select` or `multiselect`, the field MUST have an `options` array with at least one option |
| V3 | Options forbidden for non-select | If `type` is NOT `select` or `multiselect`, the field MUST NOT have `options` |
| V4 | DependsOn array not empty | If `dependsOn` is an array, it MUST contain at least one field ID |
| V5 | non-empty strings | All string properties (`id`, `label`, `question`, `serviceId`, `serviceName`) MUST be non-empty after trimming |
| V6 | Service ID pattern | `serviceId` MUST match `^[a-z][a-zA-Z0-9_]*$` |
| V7 | Field ID pattern | `id` MUST match `^[a-z][a-zA-Z0-9_]*$` |

### 10.3 Reserved Field IDs

The following field IDs are RESERVED and MUST NOT be used in any service schema:

```
action, message, type, timestamp, sessionId, interviewId,
serviceId, serviceVersion, completedFields, history, pendingFields
```

---

## 11. Versioning

### 11.1 Schema Specification Version

The specification version is `2.0`. A MAJOR version increment indicates breaking
changes to the schema language (field types, condition operators, template syntax).
A MINOR version increment indicates backward-compatible additions.

### 11.2 Service Version

Each service schema has a `serviceVersion` using semver (`MAJOR.MINOR.PATCH`):

| Component | Change requires increment when |
|---|---|
| MAJOR | Field IDs change. In-progress interviews are invalidated |
| MAJOR | Field types change |
| MAJOR | Required fields are added or removed |
| MINOR | Optional fields are added |
| MINOR | Options change (additions or renames) |
| MINOR | Questions, labels, or help text change |
| PATCH | Typos fixed. No semantic changes |

---

## 12. Example: Valid Schema

```json
{
  "$schema": "https://nexus.tecno-sanjuan.com/interview/v2/service-schema.json",
  "serviceId": "impresion_3d",
  "serviceVersion": "1.0.0",
  "serviceName": "Impresión 3D",
  "description": "Cotización de piezas impresas en 3D",
  "updatedAt": "2026-07-26T00:00:00Z",
  "tags": ["3d", "impresion", "figura", "pieza"],
  "fieldOrder": ["nombre", "telefono", "material", "color", "cantidad"],
  "minimumRequired": 3,
  "allowConcurrent": false,
  "fields": [
    {
      "id": "nombre",
      "type": "text",
      "label": "Nombre",
      "question": "¿Cuál es tu nombre?",
      "required": true,
      "placeholder": "Ej: Juan Pérez"
    },
    {
      "id": "telefono",
      "type": "phone",
      "label": "Teléfono",
      "question": "¿Cuál es tu número de teléfono?",
      "required": true,
      "help": "Te contactaremos por WhatsApp para confirmar el presupuesto.",
      "validation": {
        "required": true,
        "pattern": "^\\d{10,13}$"
      },
      "errorMessage": "Ingresá un número de teléfono válido con al menos 10 dígitos."
    },
    {
      "id": "material",
      "type": "select",
      "label": "Material",
      "question": "¿Qué material querés usar para tu pieza?",
      "required": true,
      "help": "PLA: económico y fácil. ABS: resistente al calor. PETG: para exteriores.",
      "options": [
        { "value": "PLA", "label": "PLA (económico)" },
        { "value": "ABS", "label": "ABS (resistente al calor)" },
        { "value": "PETG", "label": "PETG (resistente a la intemperie)" }
      ]
    },
    {
      "id": "color",
      "type": "select",
      "label": "Color",
      "question": "¿Qué color preferís para tu pieza?",
      "required": false,
      "options": [
        { "value": "blanco", "label": "Blanco" },
        { "value": "negro", "label": "Negro" },
        { "value": "rojo", "label": "Rojo" },
        { "value": "azul", "label": "Azul" },
        { "value": "verde", "label": "Verde" }
      ],
      "dependsOn": ["material"]
    },
    {
      "id": "cantidad",
      "type": "number",
      "label": "Cantidad",
      "question": "¿Cuántas unidades necesitás?",
      "required": true,
      "placeholder": "Ej: 1",
      "unit": "unidades",
      "validation": {
        "min": 1,
        "max": 100
      },
      "errorMessage": "La cantidad debe ser entre 1 y 100."
    }
  ],
  "inferences": [
    {
      "when": { "eq": { "field": "material", "value": "PLA" } },
      "then": {
        "color": { "value": "blanco" }
      },
      "priority": 10,
      "reason": "Por defecto PLA se imprime en blanco",
      "overridable": true
    },
    {
      "when": { "eq": { "field": "material", "value": "PETG" } },
      "then": {
        "color": { "value": "transparente" }
      },
      "priority": 10,
      "reason": "Por defecto PETG es transparente",
      "overridable": true
    }
  ],
  "summaryTemplate": "¡Gracias {{nombre}}! Resumen de tu presupuesto:\n\nMaterial: {{material:label}}\nColor: {{color:label}}\nCantidad: {{cantidad}} {{cantidad:unit}}\n\nTe contactaremos al {{telefono}} para confirmar.",
  "whatsappTemplate": "📋 *NUEVO PRESUPUESTO - {{serviceName}}*\n\n*Cliente:* {{nombre}}\n*Teléfono:* {{telefono}}\n\n*Detalle:*\n{{#each fields}}\n- {{label}}: {{value}}\n{{/each}}\n\nID: {{interviewId}}\n_{{timestamp}}_"
}
```

---

## 13. Example: Invalid Schema

```json
{
  "$schema": "https://nexus.tecno-sanjuan.com/interview/v2/service-schema.json",
  "serviceId": "servicio_invalido",
  "serviceVersion": "1.0.0",
  "updatedAt": "2026-07-26T00:00:00Z",
  "fields": [
    {
      "id": "",
      "type": "invalid_type",
      "label": "",
      "question": true,
      "options": [{ "value": "" }],
      "dependsOn": ["inexistente"]
    },
    {
      "id": "_duplicado",
      "type": "text",
      "label": "Duplicado",
      "question": "Texto"
    },
    {
      "id": "_duplicado",
      "type": "text",
      "label": "Duplicado",
      "question": "Texto"
    }
  ],
  "summaryTemplate": "Hola {{inexistente}}"
}
```

**Violations:**

| # | Field | Violation |
|---|---|---|
| 1 | Top-level | Missing `serviceName` (REQUIRED) |
| 2 | Top-level | Missing `whatsappTemplate` (REQUIRED) |
| 3 | Field 1 | `id` is empty — violates pattern `^[a-z][a-zA-Z0-9_]*$` |
| 4 | Field 1 | `type` is `"invalid_type"` — not a valid type |
| 5 | Field 1 | `label` is empty — MUST be non-empty |
| 6 | Field 1 | `question` is boolean — MUST be string |
| 7 | Field 1 | `options` present but `type` is not `select` or `multiselect` — violates V3 |
| 8 | Field 1 | `options[0].value` is empty — MUST be non-empty |
| 9 | Field 1 | `dependsOn` references `"inexistente"` — not a field in this schema |
| 10 | Field 2, 3 | Duplicate field IDs (`_duplicado`) — violates C1 |
| 11 | Template | `{{inexistente}}` references a field ID that does not exist |

---

## 14. Example: Condition Usage

```json
{
  "field": "direccion_envio",
  "type": "text",
  "label": "Dirección de envío",
  "question": "¿Cuál es tu dirección?",
  "dependsOn": { "eq": { "field": "entrega", "value": "envio" } },
  "skipIf": { "not": { "exists": { "field": "entrega" } } }
}
```

| Scenario | `entrega` value | `dependsOn` | `skipIf` | Result |
|---|---|---|---|---|
| User said "retiro" | `"retiro"` | `false` | `false` | BLOCKED |
| User said "envio" | `"envio"` | `true` | `false` | PENDING |
| User didn't answer | no value | `false` | `true` | SKIPPED |

The `skipIf` ensures that if `entrega` is unknown, the field doesn't stay
blocked forever. It becomes skipped instead.

---

## 15. Example: Inference with Conflict Resolution

```json
{
  "inferences": [
    {
      "when": { "eq": { "field": "material", "value": "PLA" } },
      "then": { "color": { "value": "blanco" } },
      "priority": 5
    },
    {
      "when": { "eq": { "field": "material", "value": "PLA" } },
      "then": { "color": { "value": "natural" } },
      "priority": 10
    }
  ]
}
```

Both rules match when `material` is `"PLA"`. The second rule has higher priority
(10 > 5), so `color` is inferred as `"natural"`. The first rule's value is
discarded and logged.
