# CRM — Customer Relationship Management

Nexus includes a lightweight CRM for managing clients, conversations, budgets, and service orders.

## Components

### Client Service (`services/business/client-service.js`)

CRUD operations for client records:

```js
// Create
await clientService.create({ name, phone, email, address });

// Read
await clientService.getById(id);
await clientService.getByPhone(phone);
await clientService.search(query);

// Update
await clientService.update(id, data);

// Delete
await clientService.delete(id);
```

**Client fields:** `id`, `name`, `phone`, `email`, `address`, `notes`, `createdAt`, `updatedAt`

### Conversation Manager (`services/nexus/conversation-manager.js`)

Manages active conversations across channels:

```js
// Create/get
const conv = manager.createConversation({ clientId, clientName, phone, channel });
const existing = manager.getConversation(convId);

// List with filters
manager.listConversations({ status: 'active', assignedAdmin: 'admin-id' });
manager.listConversations({ search: 'Juan' });
manager.listConversations({ unread: true });

// Inactive detection
manager.getInactiveClients(30); // days threshold

// Search messages
manager.searchMessages('keyword');
```

**Conversation states:** `active`, `waiting`, `resolved`, `archived`

### Conversation Session (`services/nexus/conversation-session.js`)

Data model for individual conversations:

```js
const session = new ConversationSession({
  clientId: 'c1',
  clientName: 'Juan',
  phone: '+5491111111111',
  channel: 'whatsapp',
});

session.addMessage({ role: 'user', content: 'Hola' });
session.addMessage({ role: 'assistant', content: '¿En qué puedo ayudarte?' });
console.log(session.history);       // Message array
console.log(session.status);        // Current status
console.log(session.unreadCount);   // Unread messages
```

### Conversation Memory (`services/nexus/conversation-memory.js`)

TTL-based key-value storage per conversation:

```js
memory.remember(convId, 'lastTopic', '3d_printing', 3600000);  // 1h TTL
memory.remember(convId, 'userName', 'Juan');                    // No TTL

const topic = memory.recall(convId, 'lastTopic');  // Returns or undefined
const name = memory.recall(convId, 'userName');

memory.setSummary(convId, 'Cliente quiere presupuesto de impresión 3D');
const summary = memory.getSummary(convId);
```

### Conversation Search (`services/nexus/conversation-search.js`)

Full-text search across conversations:

```js
const results = await search.find('presupuesto PLA');
// Returns conversations matching the query
```

### Profile Manager (`services/nexus/profile-manager.js`)

User profiles and permissions:

```js
const profile = profileManager.getProfile('customer');
// { allowedTools: [...], instructions: '...', settings: {...} }

const isAllowed = profileManager.validateToolAccess('customer', 'interview:start');
```

**Profiles:**

| Profile | Access |
|---------|--------|
| `customer` | Own conversations, basic tools |
| `admin` | All conversations, admin tools |
| `superadmin` | Full access |

## Budgets

The `BudgetService` handles quote/budget generation:

```js
const budget = await budgetService.create({
  clientId: 'c1',
  items: [{ description: 'PLA 1kg', quantity: 2, unitPrice: 15 }],
  notes: 'Entrega en 5 días hábiles',
});
```

## Service Orders

| Service | Module | Description |
|---------|--------|-------------|
| 3D Printing | `print-service.js` | Print job management |
| Repairs | `repair-service.js` | Repair order tracking |
| LED Signage | (via Interview) | Custom quoting through interviews |

## Data Persistence

- **Conversations**: In-memory (ephemeral) + Supabase for persistence
- **Clients**: Supabase database
- **Budgets**: Supabase database
- **Events**: Supabase + Event Queue for async processing
- **Interview Sessions**: Supabase (via session-store)
